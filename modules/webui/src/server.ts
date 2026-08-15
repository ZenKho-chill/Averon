/**
 * modules/webui/server — HTTP server (node:http built-in) + WebSocket (ws) + static frontend.
 * EN: HTTP server (node:http built-in) + WebSocket (ws) + static frontend.
 *
 * Routes:
 *   Công khai (public):   GET  /api/status, / , static assets
 *   Auth (admin/user):    POST /api/logout, GET /api/me (login duy nhất = Discord OAuth2)
 *   Admin:                GET /api/admin/* (status, modules, logs, usage),
 *                         POST /api/admin/modules/:name/:action,
 *                         /ws (realtime status+modules+log stream)
 *   User (OAuth2):        GET /api/user/guilds
 *   OAuth2:               GET /oauth2/login, GET /oauth2/callback
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { URL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Logger } from '../../../shared/logger/index.js';
import type { RegistryLike } from '../../../core/src/registry/types.js';
import type { ResolvedWebUiSettings } from './config.js';
import { AuthStore, buildAuthorizeUrl, exchangeCode, fetchDiscordUser, type SessionInfo } from './auth.js';
import { LogTailer, type TailLine } from './logs.js';
import * as api from './api.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

/**
 * Lấy origin loopback từ Referer để popup OAuth2 quay về ĐÚNG cửa sổ chính sau login.
 * Tránh lỗi mismatch host: mở web bằng 127.0.0.1 nhưng redirect_uri là localhost → popup
 * đáp trên origin khác → localStorage/storage event không chạm tới opener.
 * Chỉ chấp nhận loopback (bảo mật: không redirect session ra origin lạ).
 * EN: Extract the loopback origin from Referer so the OAuth2 popup returns to the EXACT
 * opener after login. Fixes host mismatch (web on 127.0.0.1 but redirect_uri on localhost →
 * popup lands on a different origin → the storage event never reaches the opener).
 * Loopback only (never redirect a session to a foreign origin).
 */
function extractLoopbackReturnTo(referer?: string): string {
  if (!referer) return '';
  try {
    const u = new URL(referer);
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1' && u.hostname !== '::1') return '';
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

export interface WebUiServerOptions {
  registry: RegistryLike;
  settings: ResolvedWebUiSettings;
  logger: Logger;
}

export class WebUiServer {
  private readonly server: Server;
  private readonly wss: WebSocketServer;
  private readonly auth = new AuthStore();
  private started = false;
  private readonly publicDir: string;
  private readonly registry: RegistryLike;
  private readonly settings: ResolvedWebUiSettings;
  private readonly logger: Logger;
  /** Tailer log dùng chung — cấp log realtime (WS) + thống kê usage command cho admin. */
  private readonly tailer: LogTailer;
  private readonly adminSockets = new Set<WebSocket>();
  private broadcastTimer: NodeJS.Timeout | null = null;

  constructor(opts: WebUiServerOptions) {
    this.registry = opts.registry;
    this.settings = opts.settings;
    this.logger = opts.logger;
    // Cross-platform path: static dir tính từ folder module (qua registry.getService('root')).
    // EN: Static dir resolved from the module folder via registry.getService('root').
    this.publicDir = join(this.registry.getService('root'), 'modules', 'webui', this.settings.staticDir);
    this.tailer = new LogTailer({
      logsDir: join(this.registry.getService('root'), 'logs'),
      logger: this.logger.child({ source: 'modules/webui/logs', context: 'modules/webui' }),
    });
    this.server = createServer((req, res) => this.handleRequest(req, res).catch((err) => this.handleError(res, err)));
    this.wss = this.setupWebSocket();
  }

  /** Bắt đầu lắng nghe (port 0 → chọn port tự do, test).
   * `on('error')` thay vì `once` — reject sau khi promise đã settle là no-op, nên error phát
   * sau (vd EADDRINUSE) không bao giờ thành uncaughtException làm sập process (§9.1).
   * EN: `on('error')` not `once` — reject on a settled promise is a no-op, so any late
   * 'error' (e.g. EADDRINUSE) can never become an uncaughtException that kills the process. */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.on('error', reject);
      this.server.listen(this.settings.port, this.settings.host, () => {
        this.started = true;
        const addr = this.server.address();
        const port = typeof addr === 'object' && addr ? addr.port : this.settings.port;
        this.startBroadcastTimer();
        this.logger.info(`Web UI listening on http://${this.settings.host}:${port}`, { host: this.settings.host, port });
        resolve(port);
      });
    });
  }

  /** Dừng server + WS + ticker + đóng toàn bộ handle (an toàn hot-reload — không "port đã dùng"). */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.stopBroadcastTimer();
    await new Promise<void>((resolve) => {
      this.wss.close(() => {
        this.server.close(() => resolve());
      });
    });
  }

  get port(): number {
    const addr = this.server.address();
    return typeof addr === 'object' && addr ? addr.port : this.settings.port;
  }

  // ── WebSocket (realtime dashboard: status + modules + log stream) ──
  private setupWebSocket(): WebSocketServer {
    const wss = new WebSocketServer({ server: this.server, path: '/ws' });
    // ws re-emit 'error' của http server lên chính nó (vd EADDRINUSE khi listen lỗi) — nếu
    // không có listener sẽ thành uncaughtException làm sập process (§9.1). Bắt + log, không crash.
    // EN: ws re-emits the http server's 'error' on itself (e.g. EADDRINUSE on listen failure);
    // without a listener this becomes an uncaughtException that kills the process. Catch + log.
    wss.on('error', (err) => {
      this.logger.warn(`Web: WebSocket server error`, { error: err instanceof Error ? err.message : String(err) });
    });
    wss.on('connection', (socket, req) => {
      const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token') ?? '';
      if (!this.authorizeAdminSession(token)) {
        socket.close(4001, 'unauthorized');
        return;
      }
      this.adminSockets.add(socket);
      this.sendSnapshot(socket);
      socket.on('close', () => this.adminSockets.delete(socket));
      socket.on('error', () => this.adminSockets.delete(socket));
    });
    return wss;
  }

  /** Ticker dùng chung: mỗi 3s tail log mới + broadcast snapshot (status+modules+log) tới mọi admin socket. */
  private startBroadcastTimer(): void {
    if (this.broadcastTimer) return;
    // Chạy liên tục kể cả khi hết client — log vẫn được tail để usage stats luôn mới.
    // EN: Keeps running even with no clients — logs keep being tailed so usage stats stay fresh.
    this.broadcastTimer = setInterval(() => {
      const logs = this.tailer.tick();
      if (this.adminSockets.size === 0) return;
      const snapshot = this.buildSnapshot(logs);
      for (const socket of this.adminSockets) {
        if (socket.readyState === socket.OPEN) socket.send(snapshot);
      }
    }, 3000);
  }

  private stopBroadcastTimer(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  private buildSnapshot(logs: TailLine[]): string {
    return JSON.stringify({
      type: 'snapshot',
      now: Date.now(),
      status: api.getAdminStatus(this.registry),
      modules: api.getModules(this.registry),
      logs,
    });
  }

  private sendSnapshot(socket: WebSocket): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(this.buildSnapshot([]));
  }

  // ── Auth helpers ──
  private extractToken(req: IncomingMessage): string {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
    const url = new URL(req.url ?? '/', 'http://localhost');
    return url.searchParams.get('token') ?? '';
  }

  /** Admin hợp lệ: session kind=admin (chỉ tạo qua Discord OAuth2 + admin_user_ids). */
  private authorizeAdminSession(token: string): SessionInfo | null {
    if (!token) return null;
    const session = this.auth.getSession(token);
    return session?.kind === 'admin' ? session : null;
  }

  private requireAuth(req: IncomingMessage, res: ServerResponse, minKind: 'admin' | 'user'): SessionInfo | null {
    const session = this.auth.getSession(this.extractToken(req));
    if (!session) {
      this.json(res, 401, { ok: false, message: 'Unauthorized' });
      return null;
    }
    if (minKind === 'admin' && session.kind !== 'admin') {
      this.json(res, 403, { ok: false, message: 'Forbidden — cần admin' });
      return null;
    }
    return session;
  }

  // ── HTTP routing ──
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;

    if (pathname.startsWith('/api/')) {
      await this.handleApi(req, res, pathname, url);
      return;
    }
    if (pathname === '/oauth2/login' || pathname === '/oauth2/callback') {
      await this.handleOAuth2(req, res, pathname, url);
      return;
    }
    this.serveStatic(res, pathname);
  }

  private async handleApi(req: IncomingMessage, res: ServerResponse, pathname: string, url: URL): Promise<void> {
    const method = req.method ?? 'GET';

    // Công khai
    if (method === 'GET' && pathname === '/api/status') {
      this.json(res, 200, api.getPublicStatus(this.registry));
      return;
    }
    if (method === 'GET' && pathname === '/api/modules') {
      this.json(res, 200, { ok: true, modules: api.getPublicModules(this.registry, this.registry.getService('root')) });
      return;
    }
    if (method === 'GET' && pathname === '/api/me') {
      const session = this.requireAuth(req, res, 'user');
      if (!session) return;
      this.json(res, 200, {
        ok: true,
        session: {
          kind: session.kind,
          userId: session.userId ?? null,
          username: session.username ?? null,
          avatar: session.avatar ?? null,
        },
      });
      return;
    }
    if (method === 'POST' && pathname === '/api/logout') {
      const token = this.extractToken(req);
      this.auth.destroySession(token);
      this.json(res, 200, { ok: true });
      return;
    }

    // Admin
    if (pathname === '/api/admin/status' && method === 'GET') {
      const session = this.requireAuth(req, res, 'admin');
      if (!session) return;
      this.json(res, 200, api.getAdminStatus(this.registry));
      return;
    }
    if (pathname === '/api/admin/modules' && method === 'GET') {
      const session = this.requireAuth(req, res, 'admin');
      if (!session) return;
      this.json(res, 200, { ok: true, modules: api.getModules(this.registry) });
      return;
    }
    const moduleActionMatch = pathname.match(/^\/api\/admin\/modules\/([^/]+)\/(load|unload|reload)$/);
    if (moduleActionMatch && method === 'POST') {
      const session = this.requireAuth(req, res, 'admin');
      if (!session) return;
      const name = moduleActionMatch[1];
      const action = moduleActionMatch[2] as api.ModuleAction;
      const force = url.searchParams.get('force') === 'true';
      this.logger.info(`Web: ${action} module '${name}'${force ? ' (force)' : ''}`, { actor: session.kind });
      this.json(res, 200, await api.runModuleAction(this.registry, name, action, force));
      return;
    }
    if (pathname === '/api/admin/logs' && method === 'GET') {
      const session = this.requireAuth(req, res, 'admin');
      if (!session) return;
      const limit = Number(url.searchParams.get('limit') ?? 200);
      this.json(res, 200, { ok: true, logs: this.tailer.recent(limit) });
      return;
    }
    if (pathname === '/api/admin/usage' && method === 'GET') {
      const session = this.requireAuth(req, res, 'admin');
      if (!session) return;
      this.json(res, 200, { ok: true, ...this.tailer.usageStats() });
      return;
    }

    // User
    if (pathname === '/api/user/guilds' && method === 'GET') {
      const session = this.requireAuth(req, res, 'user');
      if (!session) return;
      if (!session.userId) {
        this.json(res, 400, { ok: false, message: 'User session thiếu userId' });
        return;
      }
      const guilds = await api.getSharedGuilds(this.registry, session.userId);
      this.json(res, 200, { ok: true, guilds });
      return;
    }

    this.json(res, 404, { ok: false, message: `Not found: ${method} ${pathname}` });
  }

  private async handleOAuth2(_req: IncomingMessage, res: ServerResponse, pathname: string, url: URL): Promise<void> {
    const { oauth2 } = this.settings;
    const configured = oauth2.clientId && oauth2.clientSecret && oauth2.redirectUri;
    if (!configured) {
      this.json(res, 400, {
        ok: false,
        message: 'Discord OAuth2 chưa được cấu hình — đặt oauth2.client_id/redirect_uri trong modules/webui/config/defaults.yml và oauth2.client_secret trong config/config.yml.',
      });
      return;
    }
    if (pathname === '/oauth2/login') {
      const state = this.auth.createOAuthState(extractLoopbackReturnTo(_req.headers.referer));
      this.redirect(res, buildAuthorizeUrl(oauth2.clientId, oauth2.redirectUri, state));
      return;
    }
    // /oauth2/callback
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauth = this.auth.consumeOAuthState(state);
    if (!code || !oauth) {
      this.json(res, 400, { ok: false, message: 'OAuth2 callback không hợp lệ (thiếu/mismatch state)' });
      return;
    }
    try {
      const { accessToken } = await exchangeCode(oauth2.clientId, oauth2.clientSecret, oauth2.redirectUri, code);
      const user = await fetchDiscordUser(accessToken);
      const kind = this.settings.adminUserIds.includes(user.id) ? 'admin' : 'user';
      const session = this.auth.createSession({ kind, userId: user.id, username: user.username, avatar: user.avatar });
      this.logger.info(`Web: Discord user '${user.username}' logged in (${kind})`, { userId: user.id });
      this.redirect(res, `${oauth.returnTo}/#session=${session.id}`);
    } catch (err) {
      this.logger.warn(`Web: OAuth2 login thất bại`, { error: err instanceof Error ? err.message : String(err) });
      this.json(res, 502, { ok: false, message: 'Đăng nhập Discord thất bại' });
    }
  }

  /** Phục vụ static (SPA fallback: không tìm thấy file → trả index.html). Chống path traversal. */
  private serveStatic(res: ServerResponse, pathname: string): void {
    const root = normalize(this.publicDir);
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const filePath = normalize(join(root, rel));
    if (!filePath.startsWith(root) || pathname.includes('..')) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let target = filePath;
    if (!existsSync(target)) {
      target = join(root, 'index.html');
    }
    if (!existsSync(target) || statSync(target).isDirectory()) {
      res.writeHead(404).end('Not found');
      return;
    }
    const type = MIME[extname(target)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(readFileSync(target));
  }

  private redirect(res: ServerResponse, location: string): void {
    res.writeHead(302, { Location: location }).end();
  }

  private json(res: ServerResponse, status: number, data: unknown): void {
    const payload = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(payload);
  }

  private handleError(res: ServerResponse, err: unknown): void {
    this.logger.error(`Web: request thất bại`, { error: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) {
      this.json(res, 500, { ok: false, message: 'Internal error' });
    } else {
      res.end();
    }
  }
}