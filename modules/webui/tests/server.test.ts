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
      apiToken: 'test-admin-token',
      ...overrides,
    };
    server = new WebUiServer({ registry, settings, logger: makeLogger() });
    port = await server.start();
    return server;
  }

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

  function authed(init: RequestInit = {}): RequestInit {
    return { ...init, headers: { ...(init.headers ?? {}), Authorization: 'Bearer test-admin-token' } };
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
      apiToken: 'test-admin-token',
    };
    const second = new WebUiServer({ registry, settings, logger: makeLogger() });
    await expect(second.start()).rejects.toThrow(/EADDRINUSE|address already in use/);
  });

  it('admin route không có token → 401', async () => {
    await startServer();
    const { status } = await request('/api/admin/status');
    expect(status).toBe(401);
  });

  it('admin route với Bearer api_token → 200 + dữ liệu', async () => {
    await startServer();
    const { status, body } = await request('/api/admin/status', authed());
    expect(status).toBe(200);
    expect(body.discord?.ping).toBe(42);
    expect(body.modules?.registered).toBe(1);
  });

  it('admin route với token sai → 401', async () => {
    await startServer();
    const { status } = await request('/api/admin/status', { headers: { Authorization: 'Bearer wrong' } });
    expect(status).toBe(401);
  });

  it('POST /api/login: sai token → 403; đúng → session', async () => {
    await startServer();
    const bad = await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'nope' }) });
    expect(bad.status).toBe(403);

    const ok = await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test-admin-token' }) });
    expect(ok.status).toBe(200);
    const sessionId = (ok.body.session as { id: string })?.id;
    expect(sessionId).toBeTruthy();

    const me = await request('/api/me', { headers: { Authorization: `Bearer ${sessionId}` } });
    expect(me.status).toBe(200);
    expect((me.body.session as { kind: string }).kind).toBe('admin');
  });

  it('api_token chưa cấu hình → login trả hướng dẫn 401', async () => {
    await startServer({ apiToken: '' });
    const { status } = await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'x' }) });
    expect(status).toBe(401);
  });

  it('POST /api/admin/modules/:name/reload → gọi manager, trả kết quả', async () => {
    await startServer();
    const { status, body } = await request('/api/admin/modules/ping/reload', authed({ method: 'POST' }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.message).toContain('ping');
  });

  it('POST /api/admin/modules/:name/unload với ?force=true → force', async () => {
    await startServer();
    const spy = { called: false };
    manager.unload = async (name: string, opts: { force?: boolean }) => {
      spy.called = opts.force === true;
      return { ok: true, outcome: 'unloaded', name };
    };
    const { status } = await request('/api/admin/modules/ping/unload?force=true', authed({ method: 'POST' }));
    expect(status).toBe(200);
    expect(spy.called).toBe(true);
  });

  it('GET /api/admin/config → token bị mask', async () => {
    await startServer();
    const { status, body } = await request('/api/admin/config', authed());
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