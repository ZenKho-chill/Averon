/**
 * modules/webui/config — resolve settings từ module config (defaults.yml, đã validate bởi loader)
 * + secret từ core config (config/config.yml, gitignored — §6.3).
 * EN: Resolve settings from the module config (defaults.yml, already validated by the loader)
 * + secrets from the core config (config/config.yml, gitignored — §6.3).
 */
import type { RegistryLike } from '../../../core/src/registry/types.js';
import type { AppConfig } from '../../../core/src/config/index.js';

/** Secret webui đọc từ config/config.yml (gitignored) — KHÔNG bao giờ trả ra web (§7.4). */
export interface WebUiSecrets {
  /** Discord OAuth2 client secret / EN: Discord OAuth2 client secret. */
  oauth2ClientSecret: string;
}

/** Settings hợp nhất cho webui module. Auth chỉ qua Discord OAuth2 — không còn API token. */
export interface WebUiSettings {
  host: string;
  port: number;
  staticDir: string;
  publicHome: boolean;
  adminUserIds: string[];
  oauth2: { clientId: string; redirectUri: string; clientSecret: string };
}

/** Settings hợp nhất (auth 100% Discord OAuth2). */
export type ResolvedWebUiSettings = WebUiSettings;

/** Secret key pattern — các field chứa bí mật phải được mask khi hiển thị qua web. */
const SECRET_KEY_RE = /(token|secret|password)/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_RE.test(key);
}

/**
 * Đọc secret từ core config. Module config (defaults.yml) là file TRACKED (repo public) nên
 * KHÔNG đặt secret ở đó — secret nằm trong config/config.yml mục `webui` (gitignored).
 * EN: Read secrets from the core config. The module config (defaults.yml) is a TRACKED file
 * (public repo), so secrets live under `webui` in config/config.yml (gitignored) instead.
 */
export function readSecrets(appConfig: AppConfig): WebUiSecrets {
  const webui = (appConfig as AppConfig & { webui?: { oauth2?: { client_secret?: string } } }).webui;
  return {
    oauth2ClientSecret: webui?.oauth2?.client_secret ?? '',
  };
}

/**
 * Hợp nhất toàn bộ settings. Module config lấy từ registry (đã merge + validate bởi loader),
 * secret lấy từ core config. Khi host không phải localhost mà thiếu auth → báo lỗi rõ (boot fail).
 * EN: Merge all settings. Module config comes from the registry (merged + validated by the loader),
 * secrets from the core config. Non-localhost host without auth → clear boot error.
 */
export function resolveWebSettings(registry: RegistryLike): ResolvedWebUiSettings {
  const cfg = registry.getModule('webui').getConfig?.() ?? {};
  const appConfig = registry.getService('config');
  const secrets = readSecrets(appConfig);

  const oauth2 = (cfg.oauth2 ?? {}) as Record<string, unknown>;
  return {
    host: typeof cfg.host === 'string' && cfg.host ? cfg.host : '127.0.0.1',
    port: typeof cfg.port === 'number' ? cfg.port : 3000,
    staticDir: typeof cfg.static_dir === 'string' && cfg.static_dir ? cfg.static_dir : 'public',
    publicHome: typeof cfg.public_home === 'boolean' ? cfg.public_home : true,
    adminUserIds: Array.isArray(cfg.admin_user_ids) ? cfg.admin_user_ids.filter((v): v is string => typeof v === 'string') : [],
    oauth2: {
      clientId: typeof oauth2.client_id === 'string' ? oauth2.client_id : '',
      redirectUri: typeof oauth2.redirect_uri === 'string' ? oauth2.redirect_uri : '',
      clientSecret: secrets.oauth2ClientSecret,
    },
  };
}

/** Auth đã đủ chưa: local-only → OK (dev-safe). Non-local → bắt buộc Discord OAuth2. */
export function hasEnoughAuth(settings: ResolvedWebUiSettings): boolean {
  const isLocal = settings.host === '127.0.0.1' || settings.host === 'localhost' || settings.host === '::1';
  if (isLocal) return true;
  return settings.oauth2.clientSecret.length > 0;
}