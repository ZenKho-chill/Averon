import { describe, it, expect } from 'vitest';
import { Registry } from './index.js';
import type { ModuleRegistryEntry, RegistryLike } from './index.js';

function makeLogger() {
  return {
    fatal: () => {},
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    mask: () => '',
    child: () => makeLogger(),
  };
}

describe('Registry', () => {
  it('register + get service (DI)', () => {
    const registry = new Registry();
    const logger = makeLogger();
    const config = { app: { name: 'averon', version: '0.3.0' }, discord: { intents: [] }, logging: { level: 'INFO' } } as never;

    registry.registerService('logger', logger);
    registry.registerService('config', config);

    expect(registry.getService('logger')).toBe(logger);
    expect(registry.getService('config')).toBe(config);
  });

  it('get service chưa đăng ký → lỗi', () => {
    const registry = new Registry();
    expect(() => registry.getService('logger')).toThrow(/not registered/);
  });

  it('hasService → true/false', () => {
    const registry = new Registry();
    const logger = makeLogger();
    registry.registerService('logger', logger);
    expect(registry.hasService('logger')).toBe(true);
    expect(registry.hasService('config')).toBe(false);
  });

  it('register toàn bộ service webui cần (manager/discord/usage/registry/root)', () => {
    const registry = new Registry();
    const logger = makeLogger();
    const config = {} as never;
    const manager = {} as never;
    const discord = {} as never;
    const usage = {} as never;
    const root = '/tmp/averon-test';

    registry.registerService('logger', logger);
    registry.registerService('config', config);
    registry.registerService('manager', manager);
    registry.registerService('discord', discord);
    registry.registerService('usage', usage);
    registry.registerService('registry', registry);
    registry.registerService('root', root);

    expect(registry.getService('manager')).toBe(manager);
    expect(registry.getService('discord')).toBe(discord);
    expect(registry.getService('usage')).toBe(usage);
    expect(registry.getService('registry')).toBe(registry);
    expect(registry.getService('root')).toBe(root);
  });

  it('RegistryLike.getService cho phép module lấy service qua mặt public (§5.3)', () => {
    const registry = new Registry();
    const logger = makeLogger();
    registry.registerService('logger', logger);
    registry.registerService('root', '/tmp/averon-test');

    // Module chỉ thấy RegistryLike (không phải toàn bộ Registry).
    const like: RegistryLike = registry;
    expect(like.hasModule('ping')).toBe(false);
    expect(like.getService('logger')).toBe(logger);
    expect(like.getService('root')).toBe('/tmp/averon-test');
  });

  it('register + get module', () => {
    const registry = new Registry();
    const moduleEntry: ModuleRegistryEntry = {
      name: 'ping',
      version: '1.0.0',
      state: 'REGISTERED',
      entry: 'modules/ping/src/index.ts',
      commands: [{ name: 'ping', handler: 'commands/ping.ts' }],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
    };

    registry.registerModule(moduleEntry);
    const mod = registry.getModule('ping');
    expect(mod.name).toBe('ping');
    expect(mod.state).toBe('REGISTERED');
  });

  it('register module trùng tên → lỗi', () => {
    const registry = new Registry();
    const moduleEntry: ModuleRegistryEntry = {
      name: 'ping',
      version: '1.0.0',
      state: 'REGISTERED',
      entry: 'modules/ping/src/index.ts',
      commands: [],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
    };
    registry.registerModule(moduleEntry);
    expect(() => registry.registerModule(moduleEntry)).toThrow(/already registered/);
  });

  it('setModuleState cập nhật trạng thái', () => {
    const registry = new Registry();
    const moduleEntry: ModuleRegistryEntry = {
      name: 'ping',
      version: '1.0.0',
      state: 'REGISTERED',
      entry: 'modules/ping/src/index.ts',
      commands: [],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
    };
    registry.registerModule(moduleEntry);
    registry.setModuleState('ping', 'LOADED');
    expect(registry.getModule('ping').state).toBe('LOADED');
  });

  it('getAllModules trả về danh sách module (dùng cho crash report)', () => {
    const registry = new Registry();
    const mod1: ModuleRegistryEntry = {
      name: 'ping',
      version: '1.0.0',
      state: 'REGISTERED',
      entry: 'modules/ping/src/index.ts',
      commands: [],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
    };
    const mod2: ModuleRegistryEntry = {
      name: 'fun',
      version: '1.0.0',
      state: 'LOADED',
      entry: 'modules/fun/src/index.ts',
      commands: [],
      events: [],
      runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
    };
    registry.registerModule(mod1);
    registry.registerModule(mod2);
    const all = registry.getAllModules();
    expect(all.length).toBe(2);
    expect(all.map((m) => m.name)).toContain('ping');
    expect(all.map((m) => m.name)).toContain('fun');
  });
});