/**
 * Test WebSocket — admin session hợp lệ nhận snapshot, session sai bị đóng.
 * EN: WebSocket tests — valid admin session receives snapshots, invalid session is closed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { WebUiServer } from '../src/server.js';
import { findProjectRoot } from '../../../shared/config/index.js';
import { cleanupTempRoot, makeAppConfig, makeDiscordMock, makeLogger, makeManagerMock, makeRegistry, makeTempRoot, seedTempRoot } from './helpers.js';
import type { ResolvedWebUiSettings } from '../src/config.js';

const REAL_PUBLIC = join(findProjectRoot(process.cwd()), 'modules', 'webui', 'public');
const REAL_FETCH = globalThis.fetch;

function connect(port: number, token: string): Promise<{ ws: WebSocket; first?: unknown; closeCode?: number }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`);
    let first: unknown;
    let closeCode: number | undefined;
    const done = (): void => resolve({ ws, first, closeCode });
    ws.on('message', (data) => {
      if (first === undefined) {
        first = JSON.parse(data.toString());
        done();
      }
    });
    ws.on('close', (code) => {
      closeCode = code;
      done();
    });
    ws.on('error', () => done());
  });
}

describe('WebUiServer WebSocket', () => {
  let root = '';
  let server: WebUiServer | undefined;
  let port = 0;

  async function startServer(): Promise<void> {
    root = makeTempRoot();
    seedTempRoot(root);
    const publicDir = join(root, 'modules', 'webui', 'public');
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(join(REAL_PUBLIC, 'index.html'), join(publicDir, 'index.html'));

    const discord = makeDiscordMock();
    const registry = makeRegistry({
      config: makeAppConfig(),
      discord: { getClient: () => discord.client },
      manager: makeManagerMock(),
      usage: { activeCount: () => 0 },
      registry: { getAllModules: () => [] },
      root,
    });
    const settings: ResolvedWebUiSettings = {
      host: '127.0.0.1', port: 0, staticDir: 'public', publicHome: true,
      adminUserIds: ['111-admin'], oauth2: { clientId: 'cid', redirectUri: 'http://localhost:3000/cb', clientSecret: 'sec' },
    };
    server = new WebUiServer({ registry, settings, logger: makeLogger() });
    port = await server.start();
  }

  /** Đăng nhập OAuth2 (fetch Discord mock) → trả admin session id. */
  async function adminSession(): Promise<string> {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://discord.com/api/oauth2/token') {
        return new Response(JSON.stringify({ access_token: 'mock-access' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === 'https://discord.com/api/users/@me') {
        return new Response(JSON.stringify({ id: '111-admin', username: 'tuan', avatar: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return REAL_FETCH(input, init);
    };
    try {
      const login = await fetch(`http://127.0.0.1:${port}/oauth2/login`, { redirect: 'manual' });
      const state = new URL(login.headers.get('location') ?? '').searchParams.get('state') ?? '';
      const cb = await fetch(`http://127.0.0.1:${port}/oauth2/callback?code=mock&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
      return cb.headers.get('location')?.match(/session=([0-9a-f]+)/)?.[1] ?? '';
    } finally {
      globalThis.fetch = REAL_FETCH;
    }
  }

  afterEach(async () => {
    await server?.stop();
    server = undefined;
    if (root) {
      cleanupTempRoot(root);
      root = '';
    }
  });

  it('admin session hợp lệ → nhận snapshot status+modules', async () => {
    await startServer();
    const sid = await adminSession();
    expect(sid).toBeTruthy();
    const { ws, first } = await connect(port, sid);
    expect(first).toBeTruthy();
    const msg = first as { type?: string; status?: { online?: boolean }; modules?: unknown[] };
    expect(msg.type).toBe('snapshot');
    expect(msg.status?.online).toBe(true);
    expect(Array.isArray(msg.modules)).toBe(true);
    ws.close();
    // Chờ close handshake hoàn tất để server.stop() không treo (server.close chờ hết connection).
    await new Promise((r) => setTimeout(r, 150));
  });

  it('session sai → bị đóng (close code 4001)', async () => {
    await startServer();
    const { closeCode } = await connect(port, 'wrong-token');
    expect(closeCode).toBe(4001);
  });

  it('không session → bị đóng', async () => {
    await startServer();
    const { closeCode } = await connect(port, '');
    expect(closeCode).toBe(4001);
  });
});