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
   * Sync command lên Discord qua REST — fetch hiện tại, xóa stale, rồi đăng ký lại (§8).
   * EN: Sync commands to Discord via REST — fetch existing, delete stale, then re-register.
   *
   * 2 target (không gọi set() nhiều lần trên cùng app — tránh overwrite):
   * - global (app-wide, không guildId): slash scope [global] + context menu scope [user]
   * - guild (cần discord.guild_id): lệnh scope [guild]
   * Lệnh đổi scope (vd global → guild) sẽ còn sót trên global → bị xóa như stale.
   */
  async syncCommands(commands: SyncCommand[]): Promise<void> {
    const app = this.client.application;
    if (!app) return;

    // Phân loại builder theo target — global gộp slash + context menu thành 1 list
    const globalBuilders: unknown[] = [];
    const guildBuilders: unknown[] = [];

    for (const cmd of commands) {
      const builder = this.toBuilder(cmd);
      if (!builder) continue;
      const scopes: RegisterScope[] = cmd.scope?.length ? cmd.scope : ['global'];
      for (const scope of scopes) {
        if (scope === 'guild') {
          if (this.registerCommands.guild) guildBuilders.push(builder);
        } else if (scope === 'user') {
          if (this.registerCommands.user) globalBuilders.push(builder);
        } else {
          if (this.registerCommands.global) globalBuilders.push(builder);
        }
      }
    }

    // ── Target global ──
    if (this.registerCommands.global || this.registerCommands.user) {
      const existing = await app.commands.fetch();
      const desired = new Set(globalBuilders.map((b) => (b as { name: string }).name));
      for (const cmd of existing.values()) {
        if (!desired.has(cmd.name)) {
          await app.commands.delete(cmd.id);
          this.logger.info(`Xóa command stale global: ${cmd.name}`);
        }
      }
      if (globalBuilders.length) {
        await app.commands.set(globalBuilders as never);
        this.logger.info(`Đã register ${globalBuilders.length} lệnh global lên Discord`);
      }
    } else {
      this.logger.info('Skip register commands (global) — discord.register_commands.global/user=false');
    }

    // ── Target guild ──
    if (this.registerCommands.guild) {
      const guildId = this.config.discord.guild_id;
      if (!guildId) {
        this.logger.warn('register_commands.guild=true nhưng thiếu discord.guild_id — bỏ qua guild sync');
      } else {
        const existing = await app.commands.fetch({ guildId });
        const desired = new Set(guildBuilders.map((b) => (b as { name: string }).name));
        for (const cmd of existing.values()) {
          if (!desired.has(cmd.name)) {
            await app.commands.delete(cmd.id, guildId);
            this.logger.info(`Xóa command stale guild: ${cmd.name}`);
          }
        }
        if (guildBuilders.length) {
          await app.commands.set(guildBuilders as never, guildId);
          this.logger.info(`Đã register ${guildBuilders.length} lệnh cho guild ${guildId}`);
        }
      }
    } else {
      this.logger.info('Skip register commands (guild) — discord.register_commands.guild=false');
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