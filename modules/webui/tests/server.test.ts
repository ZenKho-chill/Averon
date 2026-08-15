/**
 * Test server HTTP — routes công khai, admin auth (401/403/200), module action, static, traversal.
 * EN: HTTP server tests — public routes, admin auth, module action, static files, traversal guard.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WebUiServer } from '../src/server.js';
import { findProjectRoot } from '../../../shared/config/index.js';
import { cleanupTempRoot, makeAppConfig, makeDiscordMock, makeLogger, makeManagerMock, makeRegistry, makeTempRoot, seedTempRoot } from './helpers.js';
import type { RegistryLike } from '../../../core/src/registry/types.js';
import type { ResolvedWebUiSettings } from '../src/config.js';

const REAL_PUBLIC = join(findProjectRoot(process.cwd()), 'modules', 'webui', 'public');

describe('WebUiServer HTTP', () => {
  let root = '';
  let server: WebUiServer | undefined;
  let port = 0;
  let manager = makeManagerMock();

  async function startServer(overrides: Partial<ResolvedWebUiSettings> = {}, moduleConfig: Record<string, unknown> = {}): Promise<WebUiServer> {
    root = makeTempRoot();
    seedTempRoot(root);
    const publicDir = join(root, 'modules', 'webui', 'public');
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(join(REAL_PUBLIC, 'index.html'), join(publicDir, 'index.html'));
    copyFileSync(join(REAL_PUBLIC, 'app.js'), join(publicDir, 'app.js'));
    copyFileSync(join(REAL_PUBLIC, 'styles.css'), join(publicDir, 'styles.css'));

    manager = makeManagerMock();
    const discord = makeDiscordMock();
    const registrySvc = {
      getAllModules: () => [
        { name: 'ping', version: '1.0.0', state: 'RUNNING', commands: [{ name: 'ping', handler: 'x' }], events: [] },
      ],
    };
    const registry: RegistryLike = makeRegistry({
      config: makeAppConfig(),
      discord: { getClient: () => discord.client },
      manager,
      usage: { activeCount: () => 0 },
      registry: registrySvc,
      root,
    }, moduleConfig);

    const settings: ResolvedWebUiSettings = {
      host: '127.0.0.1',
      port: 0,
      staticDir: 'public',
      publicHome: true,
      adminUserIds: [],
      oauth2: { clientId: '', redirectUri: '', clientSecret: '' },
      ...overrides,
    };
    server = new WebUiServer({ registry, settings, logger: makeLogger() });
    port = await server.start();
    return server;
  }

  /** Settings OAuth2 đủ dùng cho login admin/user trong test. */
  const ADMIN_OAUTH = {
    adminUserIds: ['111-admin'],
    oauth2: { clientId: 'cid', redirectUri: 'http://localhost:3000/cb', clientSecret: 'sec' },
  };

  afterEach(async () => {
    await server?.stop();
    server = undefined;
    if (root) {
      cleanupTempRoot(root);
      root = '';
    }
  });

  async function request(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { _raw: text };
    }
    return { status: res.status, body };
  }

  function authed(sessionId: string, init: RequestInit = {}): RequestInit {
    return { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${sessionId}` } };
  }

  /**
   * Đăng nhập qua OAuth2 thật (mock fetch Discord) → trả session id.
   * EN: Real OAuth2 login (Discord fetch mocked) → returns the session id.
   */
  const REAL_FETCH = globalThis.fetch;
  async function oauth2Login(opts: { admin: boolean }): Promise<string> {
    const targetId = opts.admin ? '111-admin' : '222-user';
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://discord.com/api/oauth2/token') {
        return new Response(JSON.stringify({ access_token: 'mock-access' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === 'https://discord.com/api/users/@me') {
        return new Response(JSON.stringify({ id: targetId, username: 'tuan', avatar: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return REAL_FETCH(input, init);
    };
    try {
      const login = await fetch(`http://127.0.0.1:${port}/oauth2/login`, { redirect: 'manual' });
      const state = new URL(login.headers.get('location') ?? '').searchParams.get('state') ?? '';
      const cb = await fetch(`http://127.0.0.1:${port}/oauth2/callback?code=mock&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
      const loc = cb.headers.get('location') ?? '';
      return loc.match(/session=([0-9a-f]+)/)?.[1] ?? '';
    } finally {
      globalThis.fetch = REAL_FETCH;
    }
  }

  it('GET /api/status công khai (không cần auth)', async () => {
    await startServer();
    const { status, body } = await request('/api/status');
    expect(status).toBe(200);
    expect(body.name).toBe('averon');
    expect(body.online).toBe(true);
    expect(body.guilds).toBe(1);
    expect(body.inviteUrl).toBe('');
  });

  it('GET /api/status — inviteUrl lấy từ module config', async () => {
    await startServer({}, { invite_url: 'https://discord.com/oauth2/authorize?client_id=1' });
    const { body } = await request('/api/status');
    expect(body.inviteUrl).toBe('https://discord.com/oauth2/authorize?client_id=1');
  });

  it('GET /api/modules công khai — danh sách module cho homepage', async () => {
    await startServer();
    const { status, body } = await request('/api/modules');
    expect(status).toBe(200);
    expect(Array.isArray(body.modules)).toBe(true);
    expect(body.modules[0]).toMatchObject({ name: 'ping', state: 'RUNNING', commands: 1 });
  });

  it('start với port đã dùng → reject rõ ràng, không uncaughtException', async () => {
    const first = await startServer();
    const usedPort = first.port;
    const discord = makeDiscordMock();
    const registry = makeRegistry({
      config: makeAppConfig(),
      discord: { getClient: () => discord.client },
      manager,
      usage: { activeCount: () => 0 },
      registry: { getAllModules: () => [] },
      root,
    });
    const settings: ResolvedWebUiSettings = {
      host: '127.0.0.1',
      port: usedPort,
      staticDir: 'public',
      publicHome: true,
      adminUserIds: [],
      oauth2: { clientId: '', redirectUri: '', clientSecret: '' },
    };
    const second = new WebUiServer({ registry, settings, logger: makeLogger() });
    await expect(second.start()).rejects.toThrow(/EADDRINUSE|address already in use/);
  });

  it('admin route không có session → 401', async () => {
    await startServer(ADMIN_OAUTH);
    const { status } = await request('/api/admin/status');
    expect(status).toBe(401);
  });

  it('admin route với admin session (OAuth2 + admin_user_ids) → 200 + dữ liệu', async () => {
    await startServer(ADMIN_OAUTH);
    const sid = await oauth2Login({ admin: true });
    expect(sid).toBeTruthy();
    const { status, body } = await request('/api/admin/status', authed(sid));
    expect(status).toBe(200);
    expect(body.discord?.ping).toBe(42);
    expect(body.modules?.registered).toBe(1);
  });

  it('admin route với user session → 403 (cần admin)', async () => {
    await startServer(ADMIN_OAUTH);
    const sid = await oauth2Login({ admin: false });
    const { status } = await request('/api/admin/status', authed(sid));
    expect(status).toBe(403);
  });

  it('admin route với session sai → 401', async () => {
    await startServer(ADMIN_OAUTH);
    const { status } = await request('/api/admin/status', { headers: { Authorization: 'Bearer wrong' } });
    expect(status).toBe(401);
  });

  it('POST /api/login đã bị gỡ (OAuth2-only) → 404', async () => {
    await startServer();
    const { status } = await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'x' }) });
    expect(status).toBe(404);
  });

  it('OAuth2 login: user trong admin_user_ids → session admin', async () => {
    await startServer(ADMIN_OAUTH);
    const sid = await oauth2Login({ admin: true });
    const me = await request('/api/me', authed(sid));
    expect(me.status).toBe(200);
    expect((me.body.session as { kind: string }).kind).toBe('admin');
    expect((me.body.session as { userId: string }).userId).toBe('111-admin');
  });

  it('OAuth2 login: user ngoài admin_user_ids → session user', async () => {
    await startServer(ADMIN_OAUTH);
    const sid = await oauth2Login({ admin: false });
    const me = await request('/api/me', authed(sid));
    expect(me.status).toBe(200);
    expect((me.body.session as { kind: string }).kind).toBe('user');
  });

  it('OAuth2 chưa cấu hình → /oauth2/login trả 400', async () => {
    await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/oauth2/login`, { redirect: 'manual' });
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/modules/:name/reload → gọi manager, trả kết quả', async () => {
    await startServer(ADMIN_OAUTH);
    const sid = await oauth2Login({ admin: true });
    const { status, body } = await request('/api/admin/modules/ping/reload', authed(sid, { method: 'POST' }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.message).toContain('ping');
  });

  it('POST /api/admin/modules/:name/unload với ?force=true → force', async () => {
    await startServer(ADMIN_OAUTH);
    const sid = await oauth2Login({ admin: true });
    const spy = { called: false };
    manager.unload = async (name: string, opts: { force?: boolean }) => {
      spy.called = opts.force === true;
      return { ok: true, outcome: 'unloaded', name };
    };
    const { status } = await request('/api/admin/modules/ping/unload?force=true', authed(sid, { method: 'POST' }));
    expect(status).toBe(200);
    expect(spy.called).toBe(true);
  });

  it('GET /api/admin/config → token bị mask', async () => {
    await startServer(ADMIN_OAUTH);
    const sid = await oauth2Login({ admin: true });
    const { status, body } = await request('/api/admin/config', authed(sid));
    expect(status).toBe(200);
    const core = body.core as { content: string };
    expect(core.content).not.toContain('test-token-123');
  });

  it('GET / → trả index.html (text/html)', async () => {
    await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect((res.headers.get('Content-Type') ?? '').includes('text/html')).toBe(true);
    const html = await res.text();
    expect(html).toContain('Averon');
  });

  it('GET /app.js → 200, SPA fallback cho đường dẫn không tồn tại', async () => {
    await startServer();
    const js = await fetch(`http://127.0.0.1:${port}/app.js`);
    expect(js.status).toBe(200);
    const spa = await fetch(`http://127.0.0.1:${port}/some/unknown/path`);
    expect(spa.status).toBe(200);
    expect((await spa.text()).includes('Averon')).toBe(true);
  });

  it('path traversal không lộ file ngoài public (URL normalize → SPA fallback an toàn)', async () => {
    await startServer();
    // `..` trong URL bị WHATWG normalize → không bao giờ chạm file config.yml.
    const res = await fetch(`http://127.0.0.1:${port}/../config.yml`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('test-token-123'); // không lộ config
    expect(text).toContain('Averon');             // trả SPA homepage thay vì file ngoài
  });

  it('GET /api/user/guilds không có session → 401', async () => {
    await startServer();
    const { status } = await request('/api/user/guilds');
    expect(status).toBe(401);
  });

  it('route không tồn tại → 404', async () => {
    await startServer();
    const { status } = await request('/api/nope');
    expect(status).toBe(404);
  });
});