/**
 * shared/config — loader config YAML + merge theo env + validate fail-fast (CLAUDE.md §6).
 * EN: shared/config — YAML config loader with env merge and fail-fast validation.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { ConfigError } from './errors.js';
import { deepMerge, interpolateValue } from './merge.js';
import { loadSchema, validateConfig } from './validator.js';
import type { LoadConfigOptions } from './types.js';

export * from './errors.js';
export * from './types.js';
export { deepMerge, interpolateString, interpolateValue } from './merge.js';

/** Tìm project root (nơi có package.json) — hoạt động cả khi chạy từ src lẫn từ dist. */
function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ConfigError('Không tìm thấy project root (package.json). EN: Cannot find project root.');
}

/** Thư mục config mặc định: <project root>/config. */
function defaultConfigDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(findProjectRoot(moduleDir), 'config');
}

/** Xác định env: ưu tiên option.env, rồi AVERON_ENV, rồi NODE_ENV, mặc định 'dev' (§8). */
export function resolveEnv(options: LoadConfigOptions = {}): string {
  const source = options.envSource ?? process.env;
  return options.env ?? source.AVERON_ENV ?? source.NODE_ENV ?? 'dev';
}

/**
 * Load + merge + interpolate + (tuỳ chọn) validate config.
 * EN: Load, merge, interpolate, and optionally validate config.
 */
export function loadConfig<T>(options: LoadConfigOptions = {}): T {
  const configDir = options.configDir ?? defaultConfigDir();
  const env = resolveEnv(options);

  const files = [join(configDir, 'default.yml')];
  const envFile = join(configDir, `${env}.yml`);
  if (existsSync(envFile)) files.push(envFile);

  let merged: unknown = {};
  for (const file of files) {
    if (!existsSync(file)) {
      throw new ConfigError(`Không tìm thấy file config: ${file}. EN: Config file not found: ${file}`);
    }
    const doc = YAML.parse(readFileSync(file, 'utf8')) ?? {};
    merged = deepMerge(merged, doc);
  }

  merged = interpolateValue(merged, options.envSource ?? process.env);

  if (options.schema) {
    const schema = typeof options.schema === 'string' ? loadSchema(options.schema) : options.schema;
    validateConfig(merged, schema, files);
  }

  return merged as T;
}
