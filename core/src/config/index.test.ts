import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadCoreConfig, ConfigError, getDiscordToken } from './index.js';
import type { AppConfig } from './index.js';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

function makeAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    app: { name: 'averon', version: '0.4.0' },
    discord: { token: 'test-token', intents: ['Guilds'], register_commands: { global: true, guild: false, user: false } },
    logging: { level: 'INFO', console_color: false, file: { enabled: false, dir: 'logs/', max_size_mb: 20, keep_files: 7 } },
    crash: { max_failures: 5, fail_window_ms: 300000, watchdog: { enabled: false, max_restarts: 5, window_min: 5 } },
    dev: { hot_reload: false, show_stacktrace: false },
    ...overrides,
  };
}

describe('loadCoreConfig', () => {
  it('load + validate config từ config.example.yml (file mẫu, luôn track)', async () => {
    const configDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'config');
    const cfg = await loadCoreConfig(configDir, 'config.example.yml');
    expect(cfg.app.name).toBe('averon');
    expect(cfg.app.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cfg.discord.intents).toContain('Guilds');
    expect(cfg.discord.register_commands.global).toBe(true);
    expect(cfg.discord.register_commands.guild).toBe(false);
  });

  it('thiếu config.yml → ConfigError kèm gợi ý copy example', async () => {
    const root = mkdtempSync(join(tmpdir(), 'averon-cfgerr-'));
    const cfgDir = join(root, 'config');
    try {
      mkdirSync(cfgDir, { recursive: true });
      await expect(loadCoreConfig(cfgDir)).rejects.toThrow(/config\.example\.yml/);
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('config sai (thiếu required / sai kiểu) → ConfigError', async () => {
    const root = mkdtempSync(join(tmpdir(), 'averon-cfgerr-'));
    const cfgDir = join(root, 'config');
    try {
      mkdirSync(join(cfgDir, 'schemas'), { recursive: true });
      writeFileSync(join(cfgDir, 'config.yml'), 'app:\n  version: 0.1.0\n'); // thiếu name → sai schema
      writeFileSync(
        join(cfgDir, 'schemas', 'core.schema.json'),
        JSON.stringify({
          type: 'object',
          required: ['app'],
          properties: { app: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, version: { type: 'string' } } } },
        }),
      );
      await expect(loadCoreConfig(cfgDir)).rejects.toThrow(ConfigError);
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});

describe('getDiscordToken', () => {
  it('lấy token từ config đã validate', () => {
    const cfg = makeAppConfig();
    expect(getDiscordToken(cfg)).toBe('test-token');
  });

  it('token thiếu / không phải string → ConfigError', () => {
    const cfg = makeAppConfig({ discord: { token: '', intents: ['Guilds'], register_commands: { global: true, guild: false, user: false } } as AppConfig['discord'] });
    expect(() => getDiscordToken(cfg)).toThrow(/token/);
  });
});