import { describe, it, expect, vi } from 'vitest';
import { validateSemantics } from './semantic.js';
import { ConfigError } from './errors.js';
import type { AppConfig } from './types.js';

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  // Lưu ý: `app` KHÔNG nằm trong config.yml (§10) — name/version lấy từ package.json khi boot.
  // EN: `app` is not part of config.yml (§10) — name/version come from package.json at boot.
  return {
    discord: {
      token: 'real-token',
      intents: ['Guilds'],
      register_commands: { global: true, guild: false, user: false },
    },
    logging: { level: 'INFO', console_color: false },
    crash: { max_failures: 5, fail_window_ms: 300000 },
    dev: { hot_reload: false, show_stacktrace: false },
    ...(overrides as Record<string, unknown>),
  } as AppConfig;
}

describe('validateSemantics', () => {
  it('config hợp lệ (token thật, guild=false) → không throw', () => {
    expect(() => validateSemantics(makeConfig(), { file: 'config.yml' })).not.toThrow();
  });

  it('register_commands.guild=true nhưng thiếu guild_id → ConfigError', () => {
    const cfg = makeConfig({
      discord: { token: 't', intents: ['Guilds'], register_commands: { global: false, guild: true, user: false } },
    });
    expect(() => validateSemantics(cfg, { file: 'config.yml' })).toThrow(ConfigError);
    expect(() => validateSemantics(cfg, { file: 'config.yml' })).toThrow(/guild_id/);
  });

  it('guild=true + đủ guild_id → không throw', () => {
    const cfg = makeConfig({
      discord: { token: 't', intents: ['Guilds'], register_commands: { global: false, guild: true, user: false }, guild_id: '123' },
    });
    expect(() => validateSemantics(cfg, { file: 'config.yml' })).not.toThrow();
  });

  it('config thật (config.yml) + token placeholder → ConfigError', () => {
    const cfg = makeConfig({ discord: { token: 'PASTE_DISCORD_TOKEN_HERE', intents: ['Guilds'], register_commands: { global: true, guild: false, user: false } } });
    expect(() => validateSemantics(cfg, { file: 'config.yml' })).toThrow(/placeholder/);
    // allowPlaceholderToken=true (boot thử) → bỏ qua
    expect(() => validateSemantics(cfg, { file: 'config.yml', allowPlaceholderToken: true })).not.toThrow();
  });

  it('config mẫu (config.example.yml) + placeholder → không throw (file mẫu được phép)', () => {
    const cfg = makeConfig({ discord: { token: 'PASTE_DISCORD_TOKEN_HERE', intents: ['Guilds'], register_commands: { global: true, guild: false, user: false } } });
    expect(() => validateSemantics(cfg, { file: 'config.example.yml' })).not.toThrow();
  });

  it('config vẫn còn section app (config.yml cũ) → cảnh báo, không throw', () => {
    const cfg = makeConfig() as unknown as Record<string, unknown>;
    cfg.app = { name: 'averon', version: '1.0.0' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => validateSemantics(cfg as unknown as AppConfig, { file: 'config.yml' })).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('app.* đã bị gỡ khỏi config.yml'));
    } finally {
      warn.mockRestore();
    }
  });
});