import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { Registry } from '../registry/index.js';
import { ModuleLoader } from './index.js';
import { resetQuarantine } from '../crash/index.js';

function makeLogger() {
  return {
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

function makeCrashReporter() {
  const logger = makeLogger();
  return {
    handleModuleFailure: vi.fn(() => false),
    logger,
  };
}

function makeFixture(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'averon-loader-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

afterEach(resetQuarantine);

describe('ModuleLoader', () => {
  it('loadModule đọc module.yml + import entry (in-process)', async () => {
    const fx = makeFixture({
      'module.yml': `
name: ping
version: 1.0.0
runtime:
  language: typescript
  engine: node
  version: '>=18'
  transport: in-process
entry: src/index.ts
commands:
  - name: ping
    handler: commands/ping.ts
`,
      'src/index.ts': `export const onLoad = () => console.log('ping loaded');
export const onUnload = () => console.log('ping unloaded');`,
      'commands/ping.ts': `export async function handler(interaction) { await interaction.reply('Pong!'); }`,
    });
    try {
      const registry = new Registry();
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never);
      const moduleEntry = await loader.loadModule(fx.dir);

      expect(moduleEntry.name).toBe('ping');
      expect(moduleEntry.version).toBe('1.0.0');
      // handlerFn được import từ file handler — gọi thử phải reply 'Pong!'
      expect(moduleEntry.commands).toHaveLength(1);
      expect(moduleEntry.commands[0].name).toBe('ping');
      expect(moduleEntry.commands[0].handler).toBe('commands/ping.ts');
      expect(moduleEntry.commands[0].handlerFn).toBeTypeOf('function');
      const reply = vi.fn();
      await moduleEntry.commands[0].handlerFn?.({ reply });
      expect(reply).toHaveBeenCalledWith('Pong!');
      expect(moduleEntry.onLoad).toBeDefined();
      expect(moduleEntry.onUnload).toBeDefined();
      expect(registry.getModule('ping').state).toBe('REGISTERED');
    } finally {
      fx.cleanup();
    }
  });

  it('module.yml thiếu required field → ConfigError', async () => {
    const fx = makeFixture({
      'module.yml': `name: ping
version: 1.0.0
# thiếu runtime + entry`,
    });
    try {
      const registry = new Registry();
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never);
      await expect(loader.loadModule(fx.dir)).rejects.toThrow(/thiếu name\/version\/runtime\/entry/);
    } finally {
      fx.cleanup();
    }
  });

  it('entry point không tồn tại → ConfigError', async () => {
    const fx = makeFixture({
      'module.yml': `
name: ping
version: 1.0.0
runtime:
  language: typescript
  engine: node
  version: '>=18'
  transport: in-process
entry: src/nonexistent.ts
`,
    });
    try {
      const registry = new Registry();
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never);
      await expect(loader.loadModule(fx.dir)).rejects.toThrow(/Entry point không tồn tại/);
    } finally {
      fx.cleanup();
    }
  });

  it('transport != in-process → lỗi (chưa hỗ trợ)', async () => {
    const fx = makeFixture({
      'module.yml': `
name: ping
version: 1.0.0
runtime:
  language: python
  engine: python
  version: '>=3.8'
  transport: subprocess
entry: src/index.py
`,
      'src/index.py': '# python module',
    });
    try {
      const registry = new Registry();
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never);
      await expect(loader.loadModule(fx.dir)).rejects.toThrow(/not supported yet/);
    } finally {
      fx.cleanup();
    }
  });
});