import { describe, it, expect, vi } from 'vitest';
import { basename } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModuleManager, type ModuleManagerDeps } from './manager.js';
import { Registry } from '../registry/index.js';
import type { Logger } from '../../../shared/logger/index.js';
import type { ModuleEntryWithHooks } from '../lifecycle/index.js';

function makeLogger(): Logger {
  const logger = { fatal: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() };
  logger.child.mockReturnValue(logger);
  return logger as unknown as Logger;
}

/** Entry giả — loader mock trả về, tên từ basename(dir). */
function makeEntry(name: string, commandNames: string[], eventNames: string[] = [], intents: string[] = []): ModuleEntryWithHooks {
  return {
    name,
    version: '1.0.0',
    state: 'REGISTERED',
    entry: `modules/${name}/src/index.ts`,
    intents,
    commands: commandNames.map((c) => ({ name: c, handler: `commands/${c}.ts`, handlerFn: vi.fn() })),
    events: eventNames.map((e) => ({ name: e, handler: `events/${e}.ts`, handlerFn: vi.fn() })),
    runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
  };
}

/** Cây thư mục tạm với modules/<name>/module.yml cho các module liệt kê. */
function makeRoot(moduleNames: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'averon-manager-'));
  for (const name of moduleNames) {
    const dir = join(root, 'modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'module.yml'), `name: ${name}\nversion: 1.0.0\nentry: src/index.ts\nruntime:\n  language: typescript\n`);
  }
  return root;
}

interface DepsAndMocks {
  deps: ModuleManagerDeps;
  registry: Registry;
  loadModule: ReturnType<typeof vi.fn>;
  unloadModule: ReturnType<typeof vi.fn>;
  waitIdle: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  registerCommand: ReturnType<typeof vi.fn>;
  removeCommand: ReturnType<typeof vi.fn>;
  registerEvent: ReturnType<typeof vi.fn>;
  removeEvent: ReturnType<typeof vi.fn>;
}

function makeDeps(overrides: { root?: string; commandNames?: string[]; eventNames?: string[]; intents?: string[]; waitIdleResult?: 'idle' | 'timeout' } = {}): DepsAndMocks {
  const registry = new Registry();
  const logger = makeLogger();

  // Giả lập loader thật: loadModule đăng ký entry vào registry (flow thật làm trong registry.registerModule).
  const loadModule = vi.fn(async (dir: string) => {
    const entry = makeEntry(basename(dir), overrides.commandNames ?? ['ping'], overrides.eventNames ?? [], overrides.intents ?? []);
    registry.registerModule(entry);
    return entry;
  });
  const unloadModule = vi.fn(async (name: string) => {
    registry.setModuleState(name, 'UNLOADED');
  });
  const waitIdle = vi.fn(async (): Promise<'idle' | 'timeout'> => overrides.waitIdleResult ?? 'idle');
  const reset = vi.fn();
  const registerCommand = vi.fn();
  const removeCommand = vi.fn();
  const registerEvent = vi.fn();
  const removeEvent = vi.fn();
  const handleModuleFailure = vi.fn();

  const deps = {
    registry,
    lifecycle: { loadModule: vi.fn(async (m: { name: string }) => registry.setModuleState(m.name, 'LOADED')), unloadModule, reloadModule: vi.fn() },
    loader: { loadModule },
    discord: { registerCommand, removeCommand, registerEvent, removeEvent, hasIntent: vi.fn(() => true), getClient: vi.fn() },
    usage: { activeCount: vi.fn(() => 0), reset, waitIdle },
    crashReporter: { handleModuleFailure },
    root: overrides.root ?? makeRoot(['ping']),
    logger,
    softStopTimeoutMs: 100,
  } as unknown as ModuleManagerDeps;

  return { deps, registry, loadModule, unloadModule, waitIdle, reset, registerCommand, removeCommand, registerEvent, removeEvent };
}

describe('ModuleManager.load', () => {
  it('load module mới: loader + lifecycle + attach command + RUNNING', async () => {
    const { deps, registry, loadModule, registerCommand } = makeDeps();
    const manager = new ModuleManager(deps);

    const result = await manager.load('ping');
    expect(result).toEqual({ ok: true, name: 'ping' });
    expect(registry.getModule('ping').state).toBe('RUNNING');
    expect(loadModule).toHaveBeenCalled();
    expect(registerCommand).toHaveBeenCalledWith('ping', expect.any(Function), expect.objectContaining({ moduleName: 'ping' }));
  });

  it('load module → log INFO với source core/loader + context modules/<name> (CLAUDE.md §7.2)', async () => {
    const { deps } = makeDeps();
    const manager = new ModuleManager(deps);
    await manager.load('ping');

    expect(deps.logger.child).toHaveBeenCalledWith({ source: 'core/loader', context: 'modules/ping' });
    expect(deps.logger.info).toHaveBeenCalledWith("Loading module 'ping' v1.0.0");
    expect(deps.logger.info).toHaveBeenCalledWith(expect.stringMatching(/Module 'ping' loaded \(1 commands, 0 events\)/));
  });

  it('load module đã đăng ký → lỗi hướng dẫn reload', async () => {
    const { deps } = makeDeps();
    const manager = new ModuleManager(deps);
    await manager.load('ping');
    const result = await manager.load('ping');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already registered');
  });

  it('load lại module đã UNLOADED → gỡ entry cũ, load fresh từ đĩa, RUNNING + attach lại command', async () => {
    const { deps, registry, registerCommand } = makeDeps();
    const manager = new ModuleManager(deps);
    await manager.load('ping');
    await manager.unload('ping', { force: true });
    expect(registry.getModule('ping').state).toBe('UNLOADED');

    const result = await manager.load('ping');
    expect(result).toEqual({ ok: true, name: 'ping' });
    expect(registry.getModule('ping').state).toBe('RUNNING');
    // attach 2 lần: load đầu + load lại sau unload (fix loop load↔reload)
    expect(registerCommand).toHaveBeenCalledTimes(2);
  });

  it('load module không tồn tại trên đĩa → lỗi', async () => {
    const { deps } = makeDeps();
    const manager = new ModuleManager(deps);
    const result = await manager.load('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found on disk');
  });

  it('load 2 module trùng tên command → collision, module thứ 2 bị từ chối', async () => {
    const root = makeRoot(['a', 'b']);
    const { deps, registry } = makeDeps({ root, commandNames: ['ping'] });
    const manager = new ModuleManager(deps);

    await manager.load('a');
    const result = await manager.load('b');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already owned');
    expect(registry.hasModule('b')).toBe(false);
  });

  it('load module có events → attach event handler qua discord.registerEvent với ctx đầy đủ', async () => {
    const { deps, registerEvent } = makeDeps({ eventNames: ['voiceStateUpdate'] });
    const manager = new ModuleManager(deps);
    await manager.load('ping');

    expect(registerEvent).toHaveBeenCalledWith('voiceStateUpdate', expect.any(Function), expect.objectContaining({ moduleName: 'ping' }));
    // ctx truyền cho event handler đối xứng với command: có config + logger + registry.
    // EN: event ctx mirrors command ctx: config + logger + registry.
    const ctx = registerEvent.mock.calls[0][2];
    expect(ctx).toHaveProperty('config');
    expect(ctx).toHaveProperty('logger');
    expect(ctx).toHaveProperty('registry');
    expect(deps.logger.info).toHaveBeenCalledWith(expect.stringMatching(/Module 'ping' loaded \(1 commands, 1 events\)/));
  });

  it('unload module → removeEvent được gọi theo (event, module)', async () => {
    const { deps, removeEvent } = makeDeps({ eventNames: ['voiceStateUpdate'] });
    const manager = new ModuleManager(deps);
    await manager.load('ping');
    await manager.unload('ping', { force: true });

    expect(removeEvent).toHaveBeenCalledWith('voiceStateUpdate', 'ping');
  });

  it('module cần intent client có → không cảnh báo; intent thiếu → warn hướng dẫn restart', async () => {
    const { deps, registry } = makeDeps({ intents: ['GuildVoiceStates'] });
    // client không bật GuildVoiceStates → warn
    (deps.discord as unknown as { hasIntent: ReturnType<typeof vi.fn> }).hasIntent = vi.fn((i: string) => i === 'Guilds');
    const manager = new ModuleManager(deps);
    await manager.load('ping');

    expect(registry.getModule('ping').intents).toEqual(['GuildVoiceStates']);
    expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Module 'ping' cần intent 'GuildVoiceStates'"));
  });
});

describe('ModuleManager.unload', () => {
  it('soft unload idle: detach → DRAINING → unload → UNLOADED', async () => {
    const { deps, registry, removeCommand, unloadModule, reset } = makeDeps();
    const manager = new ModuleManager(deps);
    await manager.load('ping');

    const result = await manager.unload('ping', { force: false });
    expect(result).toEqual({ ok: true, outcome: 'unloaded', name: 'ping' });
    expect(removeCommand).toHaveBeenCalledWith('ping');
    expect(registry.getModule('ping').state).toBe('UNLOADED');
    expect(unloadModule).toHaveBeenCalled();
    expect(reset).toHaveBeenCalledWith('ping');
  });

  it('soft unload timeout: giữ DRAINING + outcome draining', async () => {
    const { deps, registry, waitIdle } = makeDeps({ waitIdleResult: 'timeout' });
    const manager = new ModuleManager(deps);
    await manager.load('ping');

    const result = await manager.unload('ping', { force: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.outcome).toBe('draining');
    expect(registry.getModule('ping').state).toBe('DRAINING');
    expect(waitIdle).toHaveBeenCalled();
  });

  it('force unload: không đợi idle, unloadModule nhận {force:true}, UNLOADED', async () => {
    const { deps, registry, waitIdle, unloadModule } = makeDeps();
    const manager = new ModuleManager(deps);
    await manager.load('ping');

    const result = await manager.unload('ping', { force: true });
    expect(result).toEqual({ ok: true, outcome: 'unloaded', name: 'ping' });
    expect(registry.getModule('ping').state).toBe('UNLOADED');
    expect(waitIdle).not.toHaveBeenCalled();
    expect(unloadModule).toHaveBeenCalledWith('ping', { force: true });
  });

  it('unload module không đăng ký → lỗi', async () => {
    const { deps } = makeDeps();
    const manager = new ModuleManager(deps);
    const result = await manager.unload('nope', { force: false });
    expect(result.ok).toBe(false);
  });

  it('unload module đã UNLOADED → lỗi', async () => {
    const { deps } = makeDeps();
    const manager = new ModuleManager(deps);
    await manager.load('ping');
    await manager.unload('ping', { force: true });
    const result = await manager.unload('ping', { force: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already unloaded');
  });

  it('unload DRAINING không force → lỗi; có force → OK', async () => {
    const { deps, registry } = makeDeps();
    const manager = new ModuleManager(deps);
    await manager.load('ping');
    registry.setModuleState('ping', 'DRAINING');

    const soft = await manager.unload('ping', { force: false });
    expect(soft.ok).toBe(false);

    const forced = await manager.unload('ping', { force: true });
    expect(forced.ok).toBe(true);
  });
});

describe('ModuleManager.reload', () => {
  it('reload: soft unload rồi load lại, state RUNNING, attach lại command', async () => {
    const { deps, registry, registerCommand } = makeDeps();
    const manager = new ModuleManager(deps);
    await manager.load('ping');

    const result = await manager.reload('ping', { force: false });
    expect(result).toEqual({ ok: true, name: 'ping' });
    expect(registry.getModule('ping').state).toBe('RUNNING');
    // load + reload → attach 2 lần
    expect(registerCommand).toHaveBeenCalledTimes(2);
  });

  it('reload --force hoạt động', async () => {
    const { deps, registry, unloadModule } = makeDeps();
    const manager = new ModuleManager(deps);
    await manager.load('ping');

    const result = await manager.reload('ping', { force: true });
    expect(result.ok).toBe(true);
    expect(unloadModule).toHaveBeenCalledWith('ping', { force: true });
    expect(registry.getModule('ping').state).toBe('RUNNING');
  });

  it('reload module chưa load → lỗi', async () => {
    const { deps } = makeDeps();
    const manager = new ModuleManager(deps);
    const result = await manager.reload('nope', { force: false });
    expect(result.ok).toBe(false);
  });
});
