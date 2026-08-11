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

function makeConfig(registerCommands: Partial<Record<'global' | 'guild' | 'user', boolean>> = { global: false, guild: false, user: false }): AppConfig {
  return {
    app: { name: 'averon', version: '0.4.0' },
    discord: {
      token: 'test-token',
      intents: ['Guilds'],
      register_commands: { global: registerCommands.global ?? false, guild: registerCommands.guild ?? false, user: registerCommands.user ?? false },
    },
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

  /** Mock application.commands: chỉ có set() (bulk replace). */
  function mockAppCommands() {
    const set = vi.fn().mockResolvedValue(undefined);
    return { set };
  }

  it('syncCommands mọi scope=false → skip REST hết, không gọi set', async () => {
    const logger = makeLogger();
    const discord = new DiscordClient(makeConfig({ global: false, guild: false, user: false }), logger);
    const cmds = mockAppCommands();
    // @ts-expect-error — private field
    discord.client.application = { commands: cmds };
    await discord.syncCommands([{ name: 'ping', description: { en: 'Ping command' } }]);
    expect(cmds.set).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Skip register commands (global)'));
  });

  it('syncCommands global=true → 1 call set() thay toàn bộ list (không fetch/delete lẻ)', async () => {
    const logger = makeLogger();
    const discord = new DiscordClient(makeConfig({ global: true }), logger);
    const cmds = mockAppCommands();
    // @ts-expect-error — private field
    discord.client.application = { commands: cmds };
    await discord.syncCommands([{ name: 'ping', description: { en: 'Ping command' }, scope: ['global'] }]);
    expect(cmds.set).toHaveBeenCalledTimes(1); // 1 call duy nhất
    expect(cmds.set.mock.calls[0][1]).toBeUndefined(); // không guildId
    // @ts-expect-error — toJSON là method của builder
    expect(cmds.set.mock.calls[0][0].map((b) => ({ name: b.name, description: b.description }))).toEqual([
      { name: 'ping', description: 'Ping command' },
    ]);
  });

  it('syncCommands global=true → gộp slash + context menu vào 1 set duy nhất', async () => {
    const logger = makeLogger();
    const discord = new DiscordClient(makeConfig({ global: true, user: true }), logger);
    const cmds = mockAppCommands();
    // @ts-expect-error — private field
    discord.client.application = { commands: cmds };
    await discord.syncCommands([
      { name: 'ping', description: { en: 'Ping command' }, scope: ['global'] },
      { name: 'Avatar', type: 'user', scope: ['user'] },
    ]);
    expect(cmds.set).toHaveBeenCalledTimes(1); // không overwrite nhau
    // @ts-expect-error — builder có toJSON
    expect(cmds.set.mock.calls[0][0].map((b) => b.name)).toEqual(['ping', 'Avatar']);
  });

  it('syncCommands guild=true + guild_id → 1 call set() với guildId', async () => {
    const logger = makeLogger();
    const config = makeConfig({ guild: true });
    config.discord.guild_id = '123456789';
    const discord = new DiscordClient(config, logger);
    const cmds = mockAppCommands();
    // @ts-expect-error — private field
    discord.client.application = { commands: cmds };
    await discord.syncCommands([{ name: 'ping', description: { en: 'Ping command' }, scope: ['guild'] }]);
    expect(cmds.set).toHaveBeenCalledTimes(1);
    expect(cmds.set.mock.calls[0][1]).toBe('123456789');
  });

  it('syncCommands guild=true nhưng thiếu guild_id → warn, không gọi REST', async () => {
    const logger = makeLogger();
    const discord = new DiscordClient(makeConfig({ guild: true }), logger);
    const cmds = mockAppCommands();
    // @ts-expect-error — private field
    discord.client.application = { commands: cmds };
    await discord.syncCommands([{ name: 'ping', scope: ['guild'] }]);
    expect(cmds.set).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('guild_id'));
  });

  it('syncCommands user=true → context menu (type user/message) qua target global', async () => {
    const logger = makeLogger();
    const discord = new DiscordClient(makeConfig({ user: true }), logger);
    const cmds = mockAppCommands();
    // @ts-expect-error — private field
    discord.client.application = { commands: cmds };
    await discord.syncCommands([
      { name: 'Avatar', type: 'user', scope: ['user'] },
      { name: 'Copy', type: 'message', scope: ['user'] },
    ]);
    expect(cmds.set).toHaveBeenCalledTimes(1);
    // @ts-expect-error — builder có toJSON
    expect(cmds.set.mock.calls[0][0].map((b) => b.type)).toEqual([2, 3]); // User=2, Message=3
  });
});