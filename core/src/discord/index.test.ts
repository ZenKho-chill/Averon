import { describe, it, expect, vi } from 'vitest';
import { DiscordClient } from './index.js';
import type { Logger } from '../../../shared/logger/index.js';
import type { AppConfig } from '../../config/index.js';

function makeLogger(): Logger {
  return {
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

function makeConfig(): AppConfig {
  return {
    app: { name: 'averon', version: '0.3.0' },
    discord: { token: 'test-token', intents: ['Guilds'] },
    logging: { level: 'INFO', console_color: false },
    crash: { max_failures: 5, fail_window_ms: 300000 },
    dev: { hot_reload: false, show_stacktrace: false },
  };
}

describe('DiscordClient', () => {
  it('constructor tạo client với intents từ config', () => {
    const logger = makeLogger();
    const config = makeConfig();
    const discord = new DiscordClient(config, logger);
    // @ts-expect-error — private field
    expect(discord.client).toBeDefined();
  });

  it('login gọi client.login với token từ config', async () => {
    const logger = makeLogger();
    const config = makeConfig();
    const discord = new DiscordClient(config, logger);
    // @ts-expect-error — private field
    discord.client.login = vi.fn().mockResolvedValue(undefined);
    await discord.login();
    // @ts-expect-error — private field
    expect(discord.client.login).toHaveBeenCalledWith('test-token');
    expect(logger.info).toHaveBeenCalledWith('Discord client đã login thành công', expect.anything());
  });

  it('login thiếu token → lỗi', async () => {
    const logger = makeLogger();
    const config = makeConfig();
    config.discord.token = '';
    const discord = new DiscordClient(config, logger);
    await expect(discord.login()).rejects.toThrow(/thiếu token/i);
  });

  it('registerCommand đăng ký interactionCreate handler', () => {
    const logger = makeLogger();
    const config = makeConfig();
    const discord = new DiscordClient(config, logger);
    const handler = vi.fn();
    discord.registerCommand('ping', handler);
    // @ts-expect-error — private field
    expect(discord.client.listeners('interactionCreate').length).toBe(1);
  });

  it('registerEvent đăng ký event handler', () => {
    const logger = makeLogger();
    const config = makeConfig();
    const discord = new DiscordClient(config, logger);
    const handler = vi.fn();
    discord.registerEvent('messageCreate', handler);
    // @ts-expect-error — private field
    expect(discord.client.listeners('messageCreate').length).toBe(1);
  });
});