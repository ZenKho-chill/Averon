/**
 * Test helpers — dựng RegistryLike giả + service mocks (KHÔNG đụng core thật).
 * EN: Test helpers — fake RegistryLike + service mocks (no real core).
 */
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../../../shared/logger/index.js';
import type { RegistryLike } from '../../../core/src/registry/types.js';
import type { AppConfig } from '../../../core/src/config/index.js';

export function makeLogger() {
  return createLogger({ level: 'ERROR', write: () => {} });
}

export function makeAppConfig(extra?: Record<string, unknown>): AppConfig {
  return {
    app: { name: 'averon', version: '3.5.0' },
    discord: { token: 'test-token', register_commands: { global: true, guild: false, user: false } },
    logging: { level: 'INFO', console_color: false, file: { enabled: false, dir: 'logs/', max_size_mb: 20, keep_files: 7 } },
    crash: { max_failures: 5, fail_window_ms: 300000, watchdog: { enabled: false, max_restarts: 5, window_min: 5 } },
    dev: { hot_reload: false, show_stacktrace: false },
    ...extra,
  } as AppConfig;
}

/** RegistryLike giả — getService trả service theo key từ map. */
export function makeRegistry(
  services: Record<string, unknown>,
  moduleConfig: Record<string, unknown> = {},
): RegistryLike {
  return {
    hasModule: (name: string) => name === 'webui',
    getModule: () => ({ name: 'webui', getConfig: () => moduleConfig }) as never,
    getService: (key: string) => services[key],
  } as RegistryLike;
}

export function makeDiscordMock() {
  const guild = {
    id: '111',
    name: 'Test Guild',
    icon: null,
    memberCount: 42,
    members: { cache: new Map([['user-1', {}]]) },
    fetch: () => Promise.resolve(),
  };
  const client = {
    isReady: () => true,
    ws: { ping: 42, status: 0 },
    guilds: { cache: new Map([['111', guild]]) },
    uptime: 5000,
  };
  return { client, guild };
}

export function makeManagerMock() {
  return {
    load: async (name: string) => ({ ok: true, name }),
    unload: async (name: string, _opts: { force?: boolean }) => ({ ok: true, outcome: 'unloaded', name }),
    reload: async (name: string, _opts: { force?: boolean }) => ({ ok: true, name }),
  };
}

/** Tạo temp project root có cấu trúc config/modules/logs (path theo os.tmpdir → backup hoạt động). */
export function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'averon-webui-test-'));
  mkdirSync(join(root, 'config', 'schemas'), { recursive: true });
  mkdirSync(join(root, 'config', 'backups'), { recursive: true });
  mkdirSync(join(root, 'logs'), { recursive: true });
  return root;
}

export const VALID_CORE_YAML = [
  'discord:',
  '  token: "test-token-123"',
  '  register_commands:',
  '    global: true',
  '    guild: false',
  '    user: false',
  'logging:',
  '  level: INFO',
  '  console_color: false',
  '  file:',
  '    enabled: false',
  '    dir: "logs/"',
  '    max_size_mb: 20',
  '    keep_files: 7',
  'crash:',
  '  max_failures: 5',
  '  fail_window_ms: 300000',
  '  watchdog:',
  '    enabled: true',
  '    max_restarts: 5',
  '    window_min: 5',
  'dev:',
  '  hot_reload: false',
  '  show_stacktrace: true',
].join('\n');

/** Ghi config.yml + copy core.schema.json thật vào temp root (để validate chạy đúng). */
export function seedTempRoot(root: string, coreYaml: string = VALID_CORE_YAML): void {
  const realSchema = join('config', 'schemas', 'core.schema.json');
  if (existsSync(realSchema)) {
    copyFileSync(realSchema, join(root, 'config', 'schemas', 'core.schema.json'));
  }
  writeFileSync(join(root, 'config', 'config.yml'), coreYaml, 'utf8');
}

export function cleanupTempRoot(root: string): void {
  rmSync(root, { recursive: true, force: true });
}