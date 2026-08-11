/**
 * core/config — wrapper shared/config để load config tổng + validate (CLAUDE.md §6).
 * EN: core/config — wraps shared/config to load and validate core config.
 */
import { loadConfig, ConfigError, findProjectRoot } from '../../../shared/config/index.js';
import type { AppConfig } from '../../../shared/config/types.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export { ConfigError };
export type { AppConfig };

/**
 * Load config tổng từ config/default.yml + config/<env>.yml, validate bằng core.schema.json.
 * EN: Load core config from config/default.yml + config/<env>.yml, validate with core.schema.json.
 *
 * @param env Môi trường đích (mặc định: AVERON_ENV || NODE_ENV || 'dev')
 * @throws ConfigError nếu config không hợp lệ
 */
export async function loadCoreConfig(env?: string, configDir?: string): Promise<AppConfig> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const root = configDir ? dirname(configDir) : findProjectRoot(moduleDir);
  const finalConfigDir = configDir ?? join(root, 'config');
  const schemaFile = join(root, 'config', 'schemas', 'core.schema.json');

  return loadConfig<AppConfig>({ configDir: finalConfigDir, env, schema: schemaFile });
}

/**
 * Tiện ích: lấy token Discord từ config (đã validate).
 * EN: Utility: get Discord token from config (already validated).
 */
export function getDiscordToken(config: AppConfig): string {
  const token = config.discord.token;
  if (!token || typeof token !== 'string') {
    throw new ConfigError(
      'Thiếu token Discord trong config. ' +
        'EN: Missing Discord token in config. ' +
        'Kiểm tra config/dev.yml hoặc config/prod.yml.',
    );
  }
  return token;
}
