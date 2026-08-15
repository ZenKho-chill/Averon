/**
 * Test WebSocket — admin token hợp lệ nhận snapshot, token sai bị đóng.
 * EN: WebSocket tests — valid admin token receives snapshots, invalid token is closed.
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
      adminUserIds: [], oauth2: { clientId: '', redirectUri: '', clientSecret: '' },
      apiToken: 'test-admin-token',
    };
    server = new WebUiServer({ registry, settings, logger: makeLogger() });
    port = await server.start();
  }

  afterEach(async () => {
    await server?.stop();
    server = undefined;
    if (root) {
      cleanupTempRoot(root);
      root = '';
    }
  });

  it('token hợp lệ → nhận snapshot status+modules', async () => {
    await startServer();
    const { ws, first } = await connect(port, 'test-admin-token');
    expect(first).toBeTruthy();
    const msg = first as { type?: string; status?: { online?: boolean }; modules?: unknown[] };
    expect(msg.type).toBe('snapshot');
    expect(msg.status?.online).toBe(true);
    expect(Array.isArray(msg.modules)).toBe(true);
    ws.close();
    // Chờ close handshake hoàn tất để server.stop() không treo (server.close chờ hết connection).
    await new Promise((r) => setTimeout(r, 150));
  });

  it('token sai → bị đóng (close code 4001)', async () => {
    await startServer();
    const { closeCode } = await connect(port, 'wrong-token');
    expect(closeCode).toBe(4001);
  });

  it('không token → bị đóng', async () => {
    await startServer();
    const { closeCode } = await connect(port, '');
    expect(closeCode).toBe(4001);
  });
});