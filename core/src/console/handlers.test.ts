import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../config/index.js';
import { Registry } from '../registry/index.js';
import type { Logger } from '../../../shared/logger/index.js';
import {
  formatTable,
  formatDuration,
  handleHelp,
  handleModulesList,
  handleModulesStatus,
  handleModulesLoad,
  handleModulesUnload,
  handleModulesReload,
  handleStatus,
  type ConsoleHandlerDeps,
} from './handlers.js';

function makeLogger(): Logger {
  return { fatal: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

function makeConfig(): AppConfig {
  return {
    app: { name: 'averon', version: '0.8.0' },
    discord: { token: 't', intents: ['Guilds'], register_commands: { global: false, guild: false, user: false } },
    logging: { level: 'INFO', console_color: false, file: { enabled: false, dir: 'logs/', max_size_mb: 20, keep_files: 7 } },
    crash: { max_failures: 5, fail_window_ms: 300000, watchdog: { enabled: false, max_restarts: 5, window_min: 5 } },
    dev: { hot_reload: false, show_stacktrace: false },
    console: { enabled: true, prompt: 'averon', soft_stop_timeout_ms: 100 },
  };
}

function makeRoot(moduleNames: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'averon-handlers-'));
  for (const name of moduleNames) {
    const dir = join(root, 'modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'module.yml'), `name: ${name}\nversion: 1.0.0\nentry: src/index.ts\nruntime:\n  language: typescript\n`);
  }
  return root;
}

function registerFake(registry: Registry, name: string, state: 'LOADED' | 'RUNNING' | 'DRAINING' | 'UNLOADED' | 'FAULTED'): void {
  registry.registerModule({
    name,
    version: '1.0.0',
    state,
    entry: `modules/${name}/src/index.ts`,
    commands: [{ name: name === 'ping' ? 'ping' : 'other', handler: 'commands/x.ts' }],
    events: [],
    runtime: { language: 'typescript', engine: 'node', version: '>=18', transport: 'in-process' },
  });
  // registerModule ép state → REGISTERED; set lại state mong muốn.
  registry.setModuleState(name, state);
}

interface DepsAndMocks {
  deps: ConsoleHandlerDeps;
  client: { isReady: ReturnType<typeof vi.fn>; ws: { status: number; ping: number }; guilds: { cache: { size: number } }; uptime: number | null };
  registry: Registry;
  manager: {
    load: ReturnType<typeof vi.fn>;
    unload: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
  };
}

function makeDeps(overrides: { clientIsReady?: boolean; activeCount?: number; root?: string } = {}): DepsAndMocks {
  const registry = new Registry();
  const client = {
    isReady: vi.fn(() => overrides.clientIsReady ?? true),
    ws: { status: 0, ping: 42 },
    guilds: { cache: { size: 3 } },
    uptime: 60_000,
  };
  const discord = { getClient: vi.fn(() => client) };
  const manager = {
    load: vi.fn(async () => ({ ok: true as const, name: 'ping' })),
    unload: vi.fn(async () => ({ ok: true as const, outcome: 'unloaded' as const, name: 'ping' })),
    reload: vi.fn(async () => ({ ok: true as const, name: 'ping' })),
  };
  const deps = {
    config: makeConfig(),
    registry,
    discord,
    usage: { activeCount: vi.fn(() => overrides.activeCount ?? 0), begin: vi.fn(), end: vi.fn(), reset: vi.fn(), waitIdle: vi.fn() },
    manager,
    logger: makeLogger(),
    root: overrides.root ?? makeRoot(['ping']),
    bootTimestamp: Date.now() - 60_000,
  } as unknown as ConsoleHandlerDeps;
  return { deps, client, registry, manager };
}

describe('formatTable / formatDuration', () => {
  it('formatTable căn cột monospace', () => {
    const out = formatTable(['NAME', 'VERSION'], [['ping', '1.0.0'], ['verylongname', '0.1.0']]);
    expect(out).toContain('NAME          VERSION');
    expect(out).toContain('ping          1.0.0');
    expect(out).toContain('verylongname  0.1.0');
  });

  it('formatDuration', () => {
    expect(formatDuration(30_000)).toBe('30s');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(3_660_000)).toBe('1h 1m 0s');
  });
});

describe('handleStatus', () => {
  it('discord ready: hiện version, uptime, ping, guilds', () => {
    const { deps } = makeDeps();
    const out = handleStatus(deps);
    expect(out).toContain('averon v0.8.0');
    expect(out).toContain('Discord: ready');
    expect(out).toContain('ping 42ms');
    expect(out).toContain('guilds 3');
    expect(out).toContain('Modules: 0 registered');
  });

  it('discord không ready: báo not ready', () => {
    const { deps } = makeDeps({ clientIsReady: false });
    const out = handleStatus(deps);
    expect(out).toContain('Discord: not ready');
  });
});

describe('handleModulesList', () => {
  it('liệt kê module trên đĩa với cột LOADED', () => {
    const { deps } = makeDeps();
    const out = handleModulesList(deps);
    expect(out).toContain('ping');
    expect(out).toContain('1.0.0');
    expect(out).toContain('no'); // chưa đăng ký → chưa load
  });

  it('module đã đăng ký LOADED → cột loaded yes', () => {
    const { deps, registry } = makeDeps();
    registerFake(registry, 'ping', 'LOADED');
    const out = handleModulesList(deps);
    expect(out).toContain('yes');
  });

  it('module UNLOADED vẫn còn registry → cột loaded no', () => {
    const { deps, registry } = makeDeps();
    registerFake(registry, 'ping', 'UNLOADED');
    const out = handleModulesList(deps);
    expect(out).toContain('no');
  });

  it('không có module trên đĩa → thông báo', () => {
    const { deps } = makeDeps({ root: makeRoot([]) });
    expect(handleModulesList(deps)).toContain('No modules found');
  });
});

describe('handleModulesStatus', () => {
  it('bảng trạng thái registry với state/quarantined/active/commands', () => {
    const { deps, registry } = makeDeps({ activeCount: 2 });
    registerFake(registry, 'ping', 'RUNNING');
    const out = handleModulesStatus(deps);
    expect(out).toContain('NAME');
    expect(out).toContain('ping');
    expect(out).toContain('RUNNING');
    expect(out).toContain('2'); // active
    expect(out).toContain('1'); // commands
  });

  it('registry rỗng → thông báo', () => {
    const { deps } = makeDeps();
    expect(handleModulesStatus(deps)).toContain('No modules registered');
  });
});

describe('load/unload/reload handlers', () => {
  it('handleModulesLoad success', async () => {
    const { deps } = makeDeps();
    await expect(handleModulesLoad(deps, 'ping')).resolves.toContain('Loaded module');
  });

  it('handleModulesUnload soft → unloaded; draining → message', async () => {
    const { deps, manager } = makeDeps();
    await expect(handleModulesUnload(deps, 'ping', false)).resolves.toContain('Unloaded module');

    manager.unload.mockResolvedValueOnce({ ok: true, outcome: 'draining', name: 'ping', message: 'in-flight still busy — retry with --force' });
    await expect(handleModulesUnload(deps, 'ping', false)).resolves.toContain('draining');
  });

  it('handleModulesReload success', async () => {
    const { deps } = makeDeps();
    await expect(handleModulesReload(deps, 'ping', false)).resolves.toContain('Reloaded module');
  });

  it('load error → prefix Error', async () => {
    const { deps, manager } = makeDeps();
    manager.load.mockResolvedValueOnce({ ok: false, error: 'boom' });
    await expect(handleModulesLoad(deps, 'ping')).resolves.toContain('Error: boom');
  });
});

describe('handleHelp', () => {
  it('liệt kê các lệnh averon', () => {
    const out = handleHelp();
    expect(out).toContain('averon status');
    expect(out).toContain('averon modules unload');
    expect(out).toContain('averon modules reload');
  });

  it('có quick command -help / -h', () => {
    const out = handleHelp();
    expect(out).toContain('-help');
    expect(out).toContain('-h');
  });
});
