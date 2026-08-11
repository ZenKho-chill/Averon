import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadCoreConfig, ConfigError, getDiscordToken } from './index.js';
import type { AppConfig } from './index.js';
import { tmpdir } from 'node:os';

describe('loadCoreConfig', () => {
  it('load + validate config từ default.yml + dev.yml', async () => {
    const cfg = await loadCoreConfig('dev', join(process.cwd(), 'config'));
    expect(cfg.app.name).toBe('averon');
    expect(cfg.app.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cfg.logging.level).toBe('DEBUG'); // dev.yml override
    expect(cfg.discord.intents).toContain('Guilds');
  });

  it('load + validate config từ default.yml + prod.yml', async () => {
    const cfg = await loadCoreConfig('prod', join(process.cwd(), 'config'));
    expect(cfg.app.name).toBe('averon');
    expect(cfg.logging.level).toBe('INFO'); // prod.yml override
  });

  it('config sai (thiếu required / sai kiểu) → ConfigError', async () => {
    // Fixture theo layout loadCoreConfig kỳ vọng: <root>/config/{default.yml,schemas/core.schema.json}
    const root = mkdtempSync(join(tmpdir(), 'averon-cfgerr-'));
    const cfgDir = join(root, 'config');
    try {
      mkdirSync(join(cfgDir, 'schemas'), { recursive: true });
      writeFileSync(join(cfgDir, 'default.yml'), 'app:\n  version: 0.1.0\n'); // thiếu name → sai schema
      writeFileSync(
        join(cfgDir, 'schemas', 'core.schema.json'),
        JSON.stringify({
          type: 'object',
          required: ['app'],
          properties: { app: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, version: { type: 'string' } } } },
        }),
      );
      await expect(loadCoreConfig('dev', cfgDir)).rejects.toThrow(ConfigError);
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});

describe('getDiscordToken', () => {
  it('lấy token từ config đã validate', () => {
    const cfg: AppConfig = {
      app: { name: 'averon', version: '0.3.0' },
      discord: { token: 'test-token', intents: ['Guilds'] },
      logging: { level: 'INFO', console_color: false },
      crash: { max_failures: 5, fail_window_ms: 300000 },
      dev: { hot_reload: false, show_stacktrace: false },
    };
    expect(getDiscordToken(cfg)).toBe('test-token');
  });

  it('token thiếu / không phải string → ConfigError', () => {
    const cfg: AppConfig = {
      app: { name: 'averon', version: '0.3.0' },
      discord: { intents: ['Guilds'] },
      logging: { level: 'INFO', console_color: false },
      crash: { max_failures: 5, fail_window_ms: 300000 },
      dev: { hot_reload: false, show_stacktrace: false },
    } as never;
    expect(() => getDiscordToken(cfg)).toThrow(/token/);
  });
});
