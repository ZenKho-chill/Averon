import { describe, it, expect, vi, afterEach } from 'vitest';
import { Registry } from '../registry/index.js';
import { Lifecycle } from './index.js';
import { resetQuarantine } from '../crash/index.js';
import type { ModuleEntryWithHooks } from './index.js';

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

afterEach(resetQuarantine);

describe('Lifecycle', () => {
  it('loadModule gọi hook onLoad + cập nhật trạng thái', async () => {
    const registry = new Registry();
    const crashReporter = makeCrashReporter();
    const lifecycle = new Lifecycle(registry, crashReporter as never);

    const onLoad = vi.fn();
    const moduleEntry: ModuleEntryWithHooks = {
      name: 'ping',
      version: '1.0.0',
      state: 'REGISTERED',
      entry: 'modules/ping/src/index.ts',
      commands: [],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
      onLoad,
    };
    registry.registerModule(moduleEntry);

    await lifecycle.loadModule(moduleEntry);
    expect(onLoad).toHaveBeenCalled();
    expect(registry.getModule('ping').state).toBe('LOADED');
  });

  it('loadModule lỗi → gọi crashReporter + trạng thái FAULTED', async () => {
    const registry = new Registry();
    const crashReporter = makeCrashReporter();
    const lifecycle = new Lifecycle(registry, crashReporter as never);

    const moduleEntry: ModuleEntryWithHooks = {
      name: 'ping',
      version: '1.0.0',
      state: 'REGISTERED',
      entry: 'modules/ping/src/index.ts',
      commands: [],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
      onLoad: () => {
        throw new Error('boom');
      },
    };
    registry.registerModule(moduleEntry);

    await expect(lifecycle.loadModule(moduleEntry)).rejects.toThrow(/load thất bại/);
    expect(crashReporter.handleModuleFailure).toHaveBeenCalledWith('ping', expect.stringContaining('boom'));
    expect(registry.getModule('ping').state).toBe('FAULTED');
  });

  it('unloadModule gọi hook onUnload + cập nhật trạng thái', async () => {
    const registry = new Registry();
    const crashReporter = makeCrashReporter();
    const lifecycle = new Lifecycle(registry, crashReporter as never);

    const onUnload = vi.fn();
    const moduleEntry: ModuleEntryWithHooks = {
      name: 'ping',
      version: '1.0.0',
      state: 'LOADED',
      entry: 'modules/ping/src/index.ts',
      commands: [],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
      onUnload,
    };
    registry.registerModule(moduleEntry);

    await lifecycle.unloadModule('ping');
    expect(onUnload).toHaveBeenCalled();
    expect(registry.getModule('ping').state).toBe('UNLOADED');
  });

  it('unloadModule lỗi → gọi crashReporter + trạng thái FAULTED', async () => {
    const registry = new Registry();
    const crashReporter = makeCrashReporter();
    const lifecycle = new Lifecycle(registry, crashReporter as never);

    const moduleEntry: ModuleEntryWithHooks = {
      name: 'ping',
      version: '1.0.0',
      state: 'LOADED',
      entry: 'modules/ping/src/index.ts',
      commands: [],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
      onUnload: () => {
        throw new Error('boom');
      },
    };
    registry.registerModule(moduleEntry);

    await expect(lifecycle.unloadModule('ping')).rejects.toThrow(/unload thất bại/);
    expect(crashReporter.handleModuleFailure).toHaveBeenCalledWith('ping', expect.stringContaining('boom'));
    expect(registry.getModule('ping').state).toBe('FAULTED');
  });

  it('reloadModule: unload → load lại', async () => {
    const registry = new Registry();
    const crashReporter = makeCrashReporter();
    const lifecycle = new Lifecycle(registry, crashReporter as never);

    const onLoad = vi.fn();
    const onUnload = vi.fn();
    const moduleEntry: ModuleEntryWithHooks = {
      name: 'ping',
      version: '1.0.0',
      state: 'LOADED',
      entry: 'modules/ping/src/index.ts',
      commands: [],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
      onLoad,
      onUnload,
    };
    registry.registerModule(moduleEntry);

    await lifecycle.reloadModule('ping');
    expect(onUnload).toHaveBeenCalled();
    expect(onLoad).toHaveBeenCalled();
    expect(registry.getModule('ping').state).toBe('LOADED');
  });
});