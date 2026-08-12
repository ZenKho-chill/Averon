import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import type { AppConfig } from '../config/index.js';
import { Registry } from '../registry/index.js';
import type { Logger } from '../../../shared/logger/index.js';
import { OperatorConsole } from './index.js';
import type { ConsoleHandlerDeps } from './handlers.js';

function makeLogger(): Logger {
  return { fatal: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

function makeDeps(): ConsoleHandlerDeps {
  const client = {
    isReady: () => true,
    ws: { status: 0, ping: 12 },
    guilds: { cache: { size: 2 } },
    uptime: 5_000,
  };
  return {
    config: {
      app: { name: 'averon', version: '0.8.0' },
      discord: { token: 't', intents: ['Guilds'], register_commands: { global: false, guild: false, user: false } },
      logging: { level: 'INFO', console_color: false, file: { enabled: false, dir: 'logs/', max_size_mb: 20, keep_files: 7 } },
      crash: { max_failures: 5, fail_window_ms: 300000, watchdog: { enabled: false, max_restarts: 5, window_min: 5 } },
      dev: { hot_reload: false, show_stacktrace: false },
    } as AppConfig,
    registry: new Registry(),
    discord: { getClient: () => client },
    usage: { begin: vi.fn(), end: vi.fn(), activeCount: () => 0, reset: vi.fn(), waitIdle: vi.fn() },
    manager: {
      load: vi.fn(async () => ({ ok: true, name: 'ping' })),
      unload: vi.fn(async () => ({ ok: true, outcome: 'unloaded', name: 'ping' })),
      reload: vi.fn(async () => ({ ok: true, name: 'ping' })),
    },
    logger: makeLogger(),
    root: 'N/A',
    bootTimestamp: Date.now(),
  } as unknown as ConsoleHandlerDeps;
}

/** Đọc output tới khi chứa needle (timeout bảo vệ). */
function readUntil(output: PassThrough, needle: string, timeoutMs = 1500): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`timeout waiting for '${needle}' — got: ${buf}`)), timeoutMs);
    output.on('data', (chunk) => {
      buf += chunk.toString();
      if (buf.includes(needle)) {
        clearTimeout(timer);
        resolve(buf);
      }
    });
  });
}

async function waitFor(cond: () => boolean, timeoutMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('OperatorConsole', () => {
  it('start + line "averon status" → output có app version + discord', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const console = new OperatorConsole({ ...makeDeps(), input, output });
    console.start();

    const pending = readUntil(output, 'averon v0.8.0');
    input.write('averon status\n');
    const out = await pending;
    expect(out).toContain('Discord: ready');
  });

  it('lệnh lạ → Error output', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const console = new OperatorConsole({ ...makeDeps(), input, output });
    console.start();

    const pending = readUntil(output, 'Error:');
    input.write('averon nope\n');
    await pending;
  });

  it('averon help liệt kê lệnh', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const console = new OperatorConsole({ ...makeDeps(), input, output });
    console.start();

    const pending = readUntil(output, 'averon modules');
    input.write('averon help\n');
    await pending;
  });

  it('-help (quick command) hiện help giống averon help', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const console = new OperatorConsole({ ...makeDeps(), input, output });
    console.start();

    const pending = readUntil(output, '-help');
    input.write('-help\n');
    const out = await pending;
    expect(out).toContain('averon status');
    expect(out).toContain('-help');
  });

  it('EOF (piped input) → stop() gọi logger, không throw', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const deps = makeDeps();
    const console = new OperatorConsole({ ...deps, input, output });
    console.start();

    input.end();
    await waitFor(() => console.isClosed);
    expect(deps.logger.info).toHaveBeenCalledWith('Operator console closed');
  });
});
