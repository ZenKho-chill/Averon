/**
 * shared/config — loader config 1 file YAML + validate fail-fast (CLAUDE.md §6).
 * EN: shared/config — single-file YAML config loader with fail-fast validation.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { ConfigError } from './errors.js';
import { loadSchema, validateConfig } from './validator.js';
import type { LoadConfigOptions } from './types.js';

export * from './errors.js';
export * from './types.js';
export { deepMerge } from './merge.js';
export { validateSemantics } from './semantic.js';
export { backupConfig, listBackups, restoreConfig } from './backup.js';
// findProjectRoot được export trực tiếp từ hàm dưới

/** Tìm project root (nơi có package.json) — hoạt động cả khi chạy từ src lẫn từ dist. */
export function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ConfigError('Không tìm thấy project root (package.json). EN: Cannot find project root.');
}

/** Đọc version từ package.json — nguồn sự thật duy nhất cho app.version (CLAUDE.md §10). */
export function readPackageVersion(root: string): string {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new ConfigError(`Không tìm thấy package.json tại ${pkgPath}. EN: package.json not found.`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new ConfigError('package.json thiếu version hợp lệ (vd 0.8.0). EN: package.json has no valid version.');
  }
  return pkg.version;
}

/** Thư mục config mặc định: <project root>/config (tính từ module location — cross-platform). */
function defaultConfigDir(): string {
  return join(findProjectRoot(dirname(fileURLToPath(import.meta.url))), 'config');
}

/**
 * Load + (tuỳ chọn) validate config từ 1 file duy nhất (config.yml).
 * EN: Load and optionally validate config from a single file (config.yml).
 */
export function loadConfig<T>(options: LoadConfigOptions = {}): T {
  const configDir = options.configDir ?? defaultConfigDir();
  const file = join(configDir, options.file ?? 'config.yml');

  if (!existsSync(file)) {
    throw new ConfigError(
      `Không tìm thấy file config: ${file}. EN: Config file not found: ${file}. ` +
        'Hãy copy config/config.example.yml → config/config.yml rồi chỉnh sửa. EN: Copy config/config.example.yml → config/config.yml and edit.',
    );
  }

  const config = YAML.parse(readFileSync(file, 'utf8')) ?? {};

  if (options.schema) {
    const schema = typeof options.schema === 'string' ? loadSchema(options.schema) : options.schema;
    validateConfig(config, schema, [file]);
  }

  return config as T;
}
