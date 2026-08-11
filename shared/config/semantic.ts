/**
 * shared/config/semantic — kiểm tra ý nghĩa (semantic) của config sau khi đã qua JSON Schema.
 * EN: semantic config checks, run after JSON Schema validation (CLAUDE.md §6.4).
 *
 * JSON Schema check cấu trúc (required/type/enum); semantic checks quy tắc logic giữa các field
 * mà schema không diễn đạt được — vd: register_commands.guild=true thì phải có guild_id.
 */
import { ConfigError } from './errors.js';
import type { AppConfig } from './types.js';

export interface SemanticOptions {
  /** Tên file config đang kiểm tra (vd config.yml / config.example.yml). */
  file: string;
  /** Cho phép token placeholder trong config thật (dùng khi boot thử). Mặc định false. */
  allowPlaceholderToken?: boolean;
}

const TOKEN_PLACEHOLDER = 'PASTE_DISCORD_TOKEN_HERE';
const WINDOWS_ABS_PATH_RE = /^[A-Za-z]:[\\/]/;

/**
 * Validate ý nghĩa của config. Ném ConfigError cho lỗi nghiêm trọng; in cảnh báo qua console.
 * EN: Validate config semantics. Throws ConfigError for hard errors; prints warnings to console.
 */
export function validateSemantics(config: AppConfig, options: SemanticOptions): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. register_commands.guild=true → bắt buộc discord.guild_id
  if (config.discord.register_commands?.guild && !config.discord.guild_id) {
    errors.push('discord.register_commands.guild=true nhưng thiếu discord.guild_id. EN: guild sync requires discord.guild_id.');
  }

  // 2. Token placeholder trong config thật
  const isRealConfig = options.file === 'config.yml';
  if (isRealConfig && !options.allowPlaceholderToken && config.discord.token === TOKEN_PLACEHOLDER) {
    errors.push(
      'discord.token vẫn là placeholder PASTE_DISCORD_TOKEN_HERE — chưa đặt token thật. ' +
        'EN: discord.token is still the placeholder; set a real token in config/config.yml.',
    );
  }

  // 3. Cảnh báo path Windows hardcode trong config (không cross-platform)
  walkStrings(config, (path, value) => {
    if (typeof value === 'string' && WINDOWS_ABS_PATH_RE.test(value)) {
      warnings.push(`Cảnh báo: ${path} chứa path Windows hardcode '${value}' — dùng path tương đối. EN: Windows hardcoded path.`);
    }
  });

  for (const w of warnings) {
    console.warn(`[validate-semantics] ${w}`);
  }
  if (errors.length > 0) {
    throw new ConfigError(`Config không hợp lệ (${options.file}):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

/** Duyệt mọi giá trị string trong object (đệ quy), trả về đường dẫn key đầy đủ. */
function walkStrings(value: unknown, visit: (path: string, str: string) => void, prefix = ''): void {
  if (typeof value === 'string') {
    visit(prefix, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkStrings(item, visit, `${prefix}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      walkStrings(val, visit, prefix ? `${prefix}.${key}` : key);
    }
  }
}
