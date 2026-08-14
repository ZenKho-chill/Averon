import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadCoreConfig, ConfigError, getDiscordToken, getConsoleConfig } from './index.js';
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

  it('app (name + version) lấy từ package.json — config.yml không khai báo app', async () => {
    const root = mkdtempSync(join(tmpdir(), 'averon-ver-'));
    try {
      const cfgDir = join(root, 'config');
      mkdirSync(join(cfgDir, 'schemas'), { recursive: true });
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'averon', version: '9.9.9' }));
      // Copy schema thật để validate config tối thiểu (app không còn là field bắt buộc — §10).
      const realSchema = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'config', 'schemas', 'core.schema.json'),
        'utf8',
      );
      writeFileSync(join(cfgDir, 'schemas', 'core.schema.json'), realSchema);
      writeFileSync(
        join(cfgDir, 'config.yml'),
        [
          'discord:',
          '  token: test',
          '  intents: [Guilds]',
          '  register_commands:',
          '    global: false',
          'logging:',
          '  level: INFO',
          'crash:',
          '  max_failures: 5',
          '  fail_window_ms: 300000',
          '  watchdog:',
          '    enabled: false',
          'dev:',
          '  hot_reload: false',
          '  show_stacktrace: true',
          '',
        ].join('\n'),
      );
      const cfg = await loadCoreConfig(cfgDir);
      expect(cfg.app.name).toBe('averon'); // từ package.json, KHÔNG phải yaml
      expect(cfg.app.version).toBe('9.9.9'); // từ package.json, KHÔNG phải yaml
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    }
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

describe('getConsoleConfig', () => {
  it('prompt lấy từ config.console (override default) — KHÔNG hardcode', () => {
    const cfg = makeAppConfig({ console: { enabled: true, prompt: 'myaveron>', soft_stop_timeout_ms: 42 } });
    expect(getConsoleConfig(cfg).prompt).toBe('myaveron>');
    expect(getConsoleConfig(cfg).soft_stop_timeout_ms).toBe(42);
  });

  it('không có section console → dùng default', () => {
    const cfg = makeAppConfig();
    const cc = getConsoleConfig(cfg);
    expect(cc.enabled).toBe(true);
    expect(cc.prompt).toBe('averon');
    expect(cc.soft_stop_timeout_ms).toBe(15000);
  });

  it('config.console enabled=false → console tắt', () => {
    const cfg = makeAppConfig({ console: { enabled: false, prompt: 'x', soft_stop_timeout_ms: 1 } });
    expect(getConsoleConfig(cfg).enabled).toBe(false);
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