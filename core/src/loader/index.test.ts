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
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
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

  it('runningFromDist=true (npm start) → import entry + handler từ dist/modules/<name>/*.js', async () => {
    // Bản build (node thuần) không import được .ts — loader phải map sang file đã biên dịch.
    // EN: Built dist (plain node) cannot import .ts — loader must map to compiled .js.
    const fx = makeFixture({
      'modules/ping/module.yml': `
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
      'modules/ping/src/index.ts': `export const onLoad = () => {};`,
      'modules/ping/commands/ping.ts': `export async function handler(interaction) { await interaction.reply('Pong!'); }`,
      'dist/modules/ping/src/index.js': `export const onLoad = () => {};`,
      'dist/modules/ping/commands/ping.js': `export async function handler(interaction) { await interaction.reply('Pong!'); }`,
    });
    try {
      const registry = new Registry();
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir, true);
      const moduleEntry = await loader.loadModule(join(fx.dir, 'modules', 'ping'));

      // entry trỏ sang bản biên dịch, không phải source
      expect(moduleEntry.entry).toContain(join('dist', 'modules', 'ping', 'src', 'index.js'));
      // metadata giữ nguyên đường dẫn source
      expect(moduleEntry.commands[0].handler).toBe('commands/ping.ts');
      // handlerFn phải có — đây chính là bug cũ: undefined → bot không phản hồi
      expect(moduleEntry.commands[0].handlerFn).toBeTypeOf('function');
      const reply = vi.fn();
      await moduleEntry.commands[0].handlerFn?.({ reply });
      expect(reply).toHaveBeenCalledWith('Pong!');
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
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
      await expect(loader.loadModule(fx.dir)).rejects.toThrow(/thiếu name\/version\/runtime\/entry/);
    } finally {
      fx.cleanup();
    }
  });

  it('config module sai (thiếu required theo schema) → ConfigError từ JSON Schema, KHÔNG cần validateConfig hardcode', async () => {
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
config:
  schema: config/schema.yml
  defaults: config/defaults.yml
`,
      'src/index.ts': `export const onLoad = () => {};`,
      'config/schema.yml': `
type: object
additionalProperties: false
properties:
  responses:
    type: array
    items:
      type: object
      required: [type, content]
      properties:
        type: { enum: [plain, embed] }
        content: { type: string }
`,
      // responses[0] thiếu 'content' → schema phải tự bắt, không cần module tự viết lỗi
      'config/defaults.yml': `
responses:
  - type: plain
`,
    });
    try {
      const registry = new Registry();
      registry.registerService('logger', makeLogger() as never);
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
      await expect(loader.loadModule(fx.dir)).rejects.toThrow(/\/responses\/0/);
    } finally {
      fx.cleanup();
    }
  });

  it('config module hợp lệ theo schema → load thành công', async () => {
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
config:
  schema: config/schema.yml
  defaults: config/defaults.yml
`,
      'src/index.ts': `export const onLoad = () => {};`,
      'config/schema.yml': `
type: object
additionalProperties: false
properties:
  responses:
    type: array
    items:
      type: object
      required: [type, content]
      properties:
        type: { enum: [plain, embed] }
        content: { type: string }
`,
      'config/defaults.yml': `
responses:
  - type: plain
    content: "Pong! ({latency}ms)"
`,
    });
    try {
      const registry = new Registry();
      registry.registerService('logger', makeLogger() as never);
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
      const entry = await loader.loadModule(fx.dir);
      expect(entry.name).toBe('ping');
      expect(registry.getModule('ping').state).toBe('REGISTERED');
    } finally {
      fx.cleanup();
    }
  });

  it('loadModule import event handler (handlerFn) + intents từ manifest', async () => {
    const fx = makeFixture({
      'module.yml': `
name: tempvoice
version: 1.0.0
runtime:
  language: typescript
  engine: node
  version: '>=18'
  transport: in-process
entry: src/index.ts
intents: [GuildVoiceStates]
events:
  - name: voiceStateUpdate
    handler: events/voiceStateUpdate.ts
`,
      'src/index.ts': `export const onLoad = () => {};`,
      'events/voiceStateUpdate.ts': `export async function handler() { return 'voice-ok'; }`,
    });
    try {
      const registry = new Registry();
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
      const entry = await loader.loadModule(fx.dir);

      expect(entry.intents).toEqual(['GuildVoiceStates']);
      expect(entry.events).toHaveLength(1);
      expect(entry.events[0].name).toBe('voiceStateUpdate');
      expect(entry.events[0].handler).toBe('events/voiceStateUpdate.ts');
      expect(entry.events[0].handlerFn).toBeTypeOf('function');
      await expect(entry.events[0].handlerFn?.()).resolves.toBe('voice-ok');
    } finally {
      fx.cleanup();
    }
  });

  it('manifest intents không hợp lệ (không phải GatewayIntentBits) → ConfigError', async () => {
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
intents: [NotARealIntent]
`,
      'src/index.ts': `export const onLoad = () => {};`,
    });
    try {
      const registry = new Registry();
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
      await expect(loader.loadModule(fx.dir)).rejects.toThrow(/intents không hợp lệ/);
    } finally {
      fx.cleanup();
    }
  });

  it('manifest intents không phải mảng → ConfigError', async () => {
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
intents: GuildVoiceStates
`,
      'src/index.ts': `export const onLoad = () => {};`,
    });
    try {
      const registry = new Registry();
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
      await expect(loader.loadModule(fx.dir)).rejects.toThrow(/intents không hợp lệ/);
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
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
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
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
      await expect(loader.loadModule(fx.dir)).rejects.toThrow(/not supported yet/);
    } finally {
      fx.cleanup();
    }
  });

  it('entry.config + getConfig trả merged config THẬT, không phải wrapper {content, config} (regression: ping luôn plain)', async () => {
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
config:
  schema: config/schema.yml
  defaults: config/defaults.yml
`,
      'src/index.ts': `export const onLoad = () => {};`,
      'config/schema.yml': `
type: object
additionalProperties: false
required: [responses]
properties:
  random: { type: boolean }
  responses:
    type: array
    items:
      type: object
      required: [type, content]
      properties:
        type: { enum: [plain, embed] }
        content: { type: string }
`,
      'config/defaults.yml': `
random: false
responses:
  - type: plain
    content: "hi {latency}"
`,
    });
    try {
      const registry = new Registry();
      registry.registerService('logger', makeLogger() as never);
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);
      const entry = await loader.loadModule(fx.dir);

      // entry.config phải là chính merged config (có random + responses) — không phải wrapper {content, config}
      expect(entry.config).toEqual({
        random: false,
        responses: [{ type: 'plain', content: 'hi {latency}' }],
      });
      expect((entry.config as Record<string, unknown>).responses).toBeDefined();
      expect((entry.config as Record<string, unknown>)).not.toHaveProperty('content');

      // getConfig() (handler lấy config sau reload) cũng phải là config thật
      const viaGetter = entry.getConfig?.();
      expect(viaGetter).toMatchObject({ random: false });
      expect((viaGetter as Record<string, unknown>).responses).toBeDefined();
      expect((viaGetter as Record<string, unknown>)).not.toHaveProperty('config');
    } finally {
      fx.cleanup();
    }
  });

  it('load lại (reload) sau khi đổi CODE handler → handler mới được nạp (bust import cache — hot-reload code)', async () => {
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
      'src/index.ts': `export const onLoad = () => {};`,
      'commands/ping.ts': `export async function handler(interaction) { await interaction.reply('v1'); }`,
    });
    try {
      const registry = new Registry();
      const crashReporter = makeCrashReporter();
      const loader = new ModuleLoader(registry, crashReporter as never, fx.dir);

      // Load lần đầu — handler bản v1
      const entry1 = await loader.loadModule(fx.dir);
      const reply1 = vi.fn();
      await entry1.commands[0].handlerFn?.({ reply: reply1 });
      expect(reply1).toHaveBeenCalledWith('v1');

      // Đổi CODE handler trên đĩa (mô phỏng admin sửa module) rồi load lại như manager.reload
      writeFileSync(join(fx.dir, 'commands', 'ping.ts'), `export async function handler(interaction) { await interaction.reply('v2'); }`);
      registry.unregisterModule('ping');
      const entry2 = await loader.loadModule(fx.dir);

      // KHÔNG được dùng module cũ trong import cache — phải là handler mới (v2)
      const reply2 = vi.fn();
      await entry2.commands[0].handlerFn?.({ reply: reply2 });
      expect(reply2).toHaveBeenCalledWith('v2');
    } finally {
      fx.cleanup();
    }
  });
});