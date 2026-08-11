/**
 * core/discord — wrapper Discord.js client + login + middleware (CLAUDE.md §2.1).
 * EN: core/discord — Discord.js client wrapper with login and middleware.
 *
 * - Login với token từ config
 * - Middleware cho commands/events
 * - Rate-limit handling
 */
import { Client, GatewayIntentBits, type ClientOptions } from 'discord.js';
import type { Logger } from '../../../shared/logger/index.js';
import type { AppConfig } from '../config/index.js';

export class DiscordClient {
  private readonly client: Client;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    const intents = config.discord.intents.map((intent: string) => GatewayIntentBits[intent as keyof typeof GatewayIntentBits]);
    const options: ClientOptions = { intents };
    this.client = new Client(options);
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