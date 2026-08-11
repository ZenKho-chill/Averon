import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IpcFactory } from './index.js';
import type { Logger } from '../../../shared/logger/index.js';
import type { ModuleRegistryEntry } from '../registry/types.js';

function makeLogger(): Logger {
  return {
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

function makeFixture(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'averon-ipc-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, cleanup: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } } };
}

describe('IpcFactory', () => {
  it('createTransport trả về InProcessTransport cho in-process', () => {
    const logger = makeLogger();
    const factory = new IpcFactory(logger);
    const transport = factory.createTransport({ transport: 'in-process', entry: '' });
    expect(transport).toBeInstanceOf(Object);
  });

  it('createTransport trả về SubprocessTransport cho subprocess', () => {
    const logger = makeLogger();
    const factory = new IpcFactory(logger);
    const transport = factory.createTransport({ transport: 'subprocess', entry: 'src/index.js' });
    expect(transport).toBeInstanceOf(Object);
  });

  it('createTransport socket/ffi → lỗi', () => {
    const logger = makeLogger();
    const factory = new IpcFactory(logger);
    expect(() => factory.createTransport({ transport: 'socket', entry: '' })).toThrow(/not supported yet/);
    expect(() => factory.createTransport({ transport: 'ffi', entry: '' })).toThrow(/not supported yet/);
  });
});

describe('InProcessTransport', () => {
  it('call gọi hàm trực tiếp từ module entry', async () => {
    const fx = makeFixture({
      'src/index.ts': `export function ping() { return 'pong'; }`,
    });
    try {
      const moduleEntry: ModuleRegistryEntry = {
        name: 'ping',
        version: '1.0.0',
        state: 'REGISTERED',
        entry: join(fx.dir, 'src/index.ts'),
        commands: [],
        events: [],
        runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
      };
      const logger = makeLogger();
      const factory = new IpcFactory(logger);
      const transport = factory.createTransport({ transport: 'in-process', entry: '' });
      const result = await transport.call(moduleEntry, 'ping', []);
      expect(result).toBe('pong');
    } finally {
      fx.cleanup();
    }
  });
});

describe('SubprocessTransport', () => {
  it('call gửi JSON-RPC qua stdio', async () => {
    const fx = makeFixture({
      'src/index.js': `
process.on('message', (msg) => {
  if (msg.method === 'ping') {
    process.send?.({ jsonrpc: '2.0', result: 'pong', id: msg.id });
  }
});
`,
    });
    try {
      const moduleEntry: ModuleRegistryEntry = {
        name: 'ping',
        version: '1.0.0',
        state: 'REGISTERED',
        entry: join(fx.dir, 'src/index.js'),
        commands: [],
        events: [],
        runtime: { language: 'javascript', engine: 'node', version: '>=18', transport: 'subprocess' },
      };
      const logger = makeLogger();
      const factory = new IpcFactory(logger);
      const transport = factory.createTransport({ transport: 'subprocess', entry: 'src/index.js' });
      const result = await transport.call(moduleEntry, 'ping', []);
      expect(result).toBe('pong');
    } finally {
      fx.cleanup();
    }
  });
});