/**
 * core/discord — wrapper Discord.js client + login + middleware (CLAUDE.md §2.1).
 * EN: core/discord — Discord.js client wrapper with login and middleware.
 *
 * - Login với token từ config
 * - Middleware cho commands/events
 * - Rate-limit handling
 */
import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  type ClientOptions,
} from 'discord.js';
import type { Logger } from '../../../shared/logger/index.js';
import type { AppConfig } from '../config/index.js';

/** Lệnh cần sync lên Discord — metadata từ module.yml. */
export interface SyncCommand {
  name: string;
  description?: { vi?: string; en?: string } | string;
  type?: 'chat_input' | 'user' | 'message';
  scope?: Array<'global' | 'guild' | 'user'>;
}

type RegisterScope = 'global' | 'guild' | 'user';

export class DiscordClient {
  private readonly client: Client;

  private readonly registerCommands: Record<RegisterScope, boolean>;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    const intents = config.discord.intents.map((intent: string) => GatewayIntentBits[intent as keyof typeof GatewayIntentBits]);
    const options: ClientOptions = { intents };
    this.client = new Client(options);
    this.registerCommands = {
      global: config.discord.register_commands?.global ?? true,
      guild: config.discord.register_commands?.guild ?? false,
      user: config.discord.register_commands?.user ?? false,
    };
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
   * Sync command lên Discord qua REST, phân theo 3 scope (§8).
   * EN: Sync commands to Discord via REST, split by scope (§8).
   *
   * - global: slash toàn app (cache ~1h)
   * - guild:  slash cho guild cụ thể (cần discord.guild_id)
   * - user:   context menu (ApplicationCommandType.User / Message)
   * Chỉ đăng ký scope nào được bật trong `discord.register_commands`.
   */
  async syncCommands(commands: SyncCommand[]): Promise<void> {
    const toRegister = { global: [] as unknown[], guild: [] as unknown[], user: [] as unknown[] };

    for (const cmd of commands) {
      const builder = this.toBuilder(cmd);
      if (!builder) continue;
      const scopes: RegisterScope[] = cmd.scope?.length ? cmd.scope : ['global'];
      for (const scope of scopes) {
        if (this.registerCommands[scope]) toRegister[scope].push(builder);
      }
    }

    // 1. Global
    if (this.registerCommands.global && toRegister.global.length > 0) {
      await this.client.application?.commands.set(toRegister.global as never);
      this.logger.info(`Đã register ${toRegister.global.length} lệnh global lên Discord`);
    } else if (!this.registerCommands.global) {
      this.logger.info('Skip register commands (global) — discord.register_commands.global=false');
    }

    // 2. Guild
    if (this.registerCommands.guild) {
      const guildId = this.config.discord.guild_id;
      if (toRegister.guild.length > 0) {
        if (!guildId) {
          this.logger.warn('register_commands.guild=true nhưng thiếu discord.guild_id — bỏ qua guild sync');
        } else {
          await this.client.application?.commands.set(toRegister.guild as never, guildId);
          this.logger.info(`Đã register ${toRegister.guild.length} lệnh cho guild ${guildId}`);
        }
      }
    }

    // 3. User/message context menu
    if (this.registerCommands.user && toRegister.user.length > 0) {
      await this.client.application?.commands.set(toRegister.user as never);
      this.logger.info(`Đã register ${toRegister.user.length} context menu lệnh`);
    } else if (!this.registerCommands.user) {
      this.logger.info('Skip register commands (user) — discord.register_commands.user=false');
    }
  }

  /** Dựng Discord.js builder từ metadata lệnh (theo type). */
  private toBuilder(cmd: SyncCommand): unknown {
    const desc = typeof cmd.description === 'string' ? cmd.description : cmd.description?.en ?? cmd.description?.vi ?? `/${cmd.name}`;
    if (cmd.type === 'user') {
      return new ContextMenuCommandBuilder().setName(cmd.name).setType(ApplicationCommandType.User);
    }
    if (cmd.type === 'message') {
      return new ContextMenuCommandBuilder().setName(cmd.name).setType(ApplicationCommandType.Message);
    }
    return new SlashCommandBuilder().setName(cmd.name).setDescription(desc);
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