import { describe, it, expect } from 'vitest';
import { validateSemantics } from './semantic.js';
import { ConfigError } from './errors.js';
import type { AppConfig } from './types.js';

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    app: { name: 'averon', version: '0.5.0' },
    discord: {
      token: 'real-token',
      intents: ['Guilds'],
      register_commands: { global: true, guild: false, user: false },
    },
    logging: { level: 'INFO', console_color: false },
    crash: { max_failures: 5, fail_window_ms: 300000 },
    dev: { hot_reload: false, show_stacktrace: false },
    ...overrides,
  };
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
});