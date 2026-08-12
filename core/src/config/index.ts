/**
 * core/config — wrapper shared/config để load config tổng + validate (CLAUDE.md §6).
 * EN: core/config — wraps shared/config to load and validate core config.
 */
import { loadConfig, ConfigError, findProjectRoot, validateSemantics, readPackageVersion } from '../../../shared/config/index.js';
import type { AppConfig, ConsoleConfig } from '../../../shared/config/types.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export { ConfigError };
export type { AppConfig, ConsoleConfig };

/** Giá trị mặc định config console — dùng khi config.yml không có section console (AJV không `useDefaults`). */
export const DEFAULT_CONSOLE_CONFIG: ConsoleConfig = {
  enabled: true,
  prompt: 'averon> ',
  soft_stop_timeout_ms: 15000,
};

/** Lấy config console: merge default trong code + override từ config.yml (`config.console`). */
export function getConsoleConfig(config: AppConfig): ConsoleConfig {
  return { ...DEFAULT_CONSOLE_CONFIG, ...config.console };
}

/**
 * Load config tổng từ config/config.yml, validate bằng core.schema.json + semantic checks.
 * EN: Load core config from config/config.yml, validate with schema + semantics.
 *
 * @param configDir Thư mục chứa config.yml (mặc định: config/ của dự án)
 * @param file Tên file config (mặc định: config.yml)
 * @param allowPlaceholderToken Cho phép token placeholder khi boot thử (mặc định true)
 * @throws ConfigError nếu config không hợp lệ
 */
export async function loadCoreConfig(configDir?: string, file?: string, allowPlaceholderToken = true): Promise<AppConfig> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const root = configDir ? dirname(configDir) : findProjectRoot(moduleDir);
  const finalConfigDir = configDir ?? join(root, 'config');
  const schemaFile = join(root, 'config', 'schemas', 'core.schema.json');
  const finalFile = file ?? 'config.yml';

  const config = loadConfig<AppConfig>({ configDir: finalConfigDir, file: finalFile, schema: schemaFile });
  validateSemantics(config, { file: finalFile, allowPlaceholderToken });
  // app.version lấy từ package.json (nguồn sự thật duy nhất §10) — config.yml không khai báo version nữa.
  // EN: app.version is derived from package.json (single source of truth §10) — config.yml no longer declares it.
  config.app = { ...config.app, version: readPackageVersion(root) };
  return config;
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
        'Sửa discord.token trong config/config.yml.',
    );
  }
  return token;
}
