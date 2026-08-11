/**
 * core/discord — wrapper Discord.js client + login + middleware (CLAUDE.md §2.1).
 * EN: core/discord — Discord.js client wrapper with login and middleware.
 *
 * - Login với token từ config
 * - Middleware cho commands/events
 * - Rate-limit handling
 */
import { Client, GatewayIntentBits, SlashCommandBuilder, type ClientOptions } from 'discord.js';
import type { Logger } from '../../../shared/logger/index.js';
import type { AppConfig } from '../config/index.js';

export class DiscordClient {
  private readonly client: Client;

  private readonly registerCommands: boolean;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    const intents = config.discord.intents.map((intent: string) => GatewayIntentBits[intent as keyof typeof GatewayIntentBits]);
    const options: ClientOptions = { intents };
    this.client = new Client(options);
    this.registerCommands = config.discord.register_commands === true;
  }

  /** Login với token từ config. */
  async login(): Promise<void> {
    const token = this.config.discord.token;
    if (!token) {
      throw new Error('Thiếu token Discord trong config. EN: Missing Discord token in config');
    }
    await this.client.login(token);
    this.logger.info('Discord client đã login thành công', { intents: this.config.discord.intents });
  }

  /** Đăng ký command handler (gọi từ loader). */
  registerCommand(name: string, handler: (interaction: unknown) => Promise<void> | void): void {
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isCommand()) return;
      if (interaction.commandName !== name) return;
      try {
        await handler(interaction);
      } catch (err) {
        this.logger.error(`Command '${name}' thất bại`, { error: err });
      }
    });
  }

  /**
   * Sync slash command lên Discord qua REST — CHỈ khi `discord.register_commands: true`.
   * EN: Sync slash commands to Discord via REST — ONLY when `discord.register_commands: true`.
   * Tắt ở dev để tránh re-register mỗi lần khởi động lại (§8).
   */
  async syncCommands(commands: Array<{ name: string; description?: { vi?: string; en?: string } | string }>): Promise<void> {
    if (!this.registerCommands) {
      this.logger.info('Skip register commands (dev) — discord.register_commands=false');
      return;
    }
    const builders = commands.map((cmd) => {
      const desc = typeof cmd.description === 'string' ? cmd.description : cmd.description?.en ?? cmd.description?.vi ?? `/${cmd.name}`;
      return new SlashCommandBuilder().setName(cmd.name).setDescription(desc);
    });
    await this.client.application?.commands.set(builders);
    this.logger.info(`Đã register ${builders.length} slash command lên Discord`);
  }

  /** Đăng ký event handler (gọi từ loader). */
  registerEvent(name: string, handler: (...args: unknown[]) => Promise<void> | void): void {
    this.client.on(name, async (...args) => {
      try {
        await handler(...args);
      } catch (err) {
        this.logger.error(`Event '${name}' thất bại`, { error: err });
      }
    });
  }

  /** Lấy Discord.js client gốc (dùng cho IPC hoặc module ngoại ngữ). */
  getClient(): Client {
    return this.client;
  }
}