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
import type { CommandContext } from '../registry/types.js';

/** Lệnh cần sync lên Discord — metadata từ module.yml. */
export interface SyncCommand {
  name: string;
  /** Desc theo nhiều ngôn ngữ: `{ vi: '...', en: '...' }` hoặc 1 chuỗi. Map key ngắn → Discord Locale. */
  description?: Record<string, string> | string;
  type?: 'chat_input' | 'user' | 'message';
  scope?: Array<'global' | 'guild' | 'user'>;
}

/** Map key ngắn trong module.yml → Discord Locale code (`en-US`, `vi`, ...). */
const LOCALE_MAP: Record<string, string> = {
  en: 'en-US', vi: 'vi', fr: 'fr', de: 'de', es: 'es-ES', pt: 'pt-BR',
  ja: 'ja', ko: 'ko', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', ru: 'ru', it: 'it',
};

/** Dựng description_localizations từ object desc đa ngôn ngữ. */
function buildLocalizations(description: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(description)) {
    if (typeof text === 'string') out[LOCALE_MAP[key] ?? key] = text;
  }
  return out;
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

  /** Đăng ký command handler (gọi từ loader). Truyền ctx (config module + logger) cho handler. */
  registerCommand(name: string, handler: (interaction: unknown, ctx: CommandContext) => Promise<void> | void, ctx?: CommandContext): void {
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isCommand()) return;
      if (interaction.commandName !== name) return;
      try {
        await handler(interaction, ctx ?? { config: {}, logger: this.logger });
      } catch (err) {
        this.logger.error(`Command '${name}' thất bại`, { error: err });
      }
    });
  }

  /**
   * Sync command lên Discord qua REST — `commands.set()` thay toàn bộ list trong 1 call (§8).
   * EN: Sync commands via REST — `commands.set()` replaces the whole list in one call.
   *
   * `set()` tự xóa command không còn trong list (stale) + tạo mới trong 1 HTTP call —
   * KHÔNG cần fetch + delete từng cái (chậm khi có nhiều command lạ).
   *
   * 2 target (không gọi set() nhiều lần trên cùng app — tránh overwrite):
   * - global (app-wide, không guildId): slash scope [global] + context menu scope [user]
   * - guild (cần discord.guild_id): lệnh scope [guild]
   *
   * ⚠️ `set()` xóa TOÀN BỘ command lạ không trong manifest — đừng chạy sync trên app
   * có command do tool/bot khác quản lý.
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

    // ── Target global: 1 call set() thay toàn bộ (tự xóa stale) ──
    if (this.registerCommands.global || this.registerCommands.user) {
      if (globalBuilders.length) {
        await app.commands.set(globalBuilders as never);
        this.logger.info(`Đã register ${globalBuilders.length} lệnh global lên Discord (set thay toàn bộ list)`);
      }
    } else {
      this.logger.info('Skip register commands (global) — discord.register_commands.global/user=false');
    }

    // ── Target guild: 1 call set() theo guild ──
    if (this.registerCommands.guild) {
      const guildId = this.config.discord.guild_id;
      if (!guildId) {
        this.logger.warn('register_commands.guild=true nhưng thiếu discord.guild_id — bỏ qua guild sync');
      } else if (guildBuilders.length) {
        await app.commands.set(guildBuilders as never, guildId);
        this.logger.info(`Đã register ${guildBuilders.length} lệnh cho guild ${guildId} (set thay toàn bộ list)`);
      }
    } else {
      this.logger.info('Skip register commands (guild) — discord.register_commands.guild=false');
    }
  }

  /** Dựng Discord.js builder từ metadata lệnh (theo type). */
  private toBuilder(cmd: SyncCommand): unknown {
    if (cmd.type === 'user') {
      return new ContextMenuCommandBuilder().setName(cmd.name).setType(ApplicationCommandType.User);
    }
    if (cmd.type === 'message') {
      return new ContextMenuCommandBuilder().setName(cmd.name).setType(ApplicationCommandType.Message);
    }

    // Slash command: desc đa ngôn ngữ → description_localizations (Discord tự chọn theo locale user)
    const builder = new SlashCommandBuilder().setName(cmd.name);
    if (typeof cmd.description === 'string') {
      builder.setDescription(cmd.description);
    } else if (cmd.description) {
      const fallback = cmd.description.en ?? cmd.description.vi ?? `/${cmd.name}`;
      builder.setDescription(fallback);
      const loc = buildLocalizations(cmd.description);
      if (Object.keys(loc).length > 0) builder.setDescriptionLocalizations(loc);
    }
    return builder;
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