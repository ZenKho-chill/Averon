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
  type Interaction,
} from 'discord.js';
import type { Logger } from '../../../shared/logger/index.js';
import { toUserMessage } from '../../../shared/errors/index.js';
import type { AppConfig } from '../config/index.js';
import type { CommandContext } from '../registry/types.js';
import type { UsageTracker } from '../registry/usage.js';

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

/** Timeout mặc định chờ login + gateway ready (ms) — boot fail-fast thay vì treo vô hạn (§9.1). */
const DEFAULT_LOGIN_TIMEOUT_MS = 30_000;

/** Race 1 promise với timeout — timeout → gọi cleanup (best-effort) rồi reject để boot fail-fast. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string, onTimeout?: () => void | Promise<void>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      timer = undefined;
      if (onTimeout) void Promise.resolve(onTimeout()).catch(() => undefined);
      reject(new Error(message));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export class DiscordClient {
  private readonly client: Client;

  private readonly registerCommands: Record<RegisterScope, boolean>;

  /** Listener của từng command (lưu ref để removeCommand có thể `client.off` khi unload). */
  private readonly commandListeners = new Map<string, (interaction: Interaction) => Promise<void> | void>();

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly usage?: UsageTracker,
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

  /** Login + đợi gateway ready. Timeout (config `discord.login_timeout_ms`, mặc định 30s) → boot fail-fast. */
  async login(timeoutMs: number = this.config.discord.login_timeout_ms ?? DEFAULT_LOGIN_TIMEOUT_MS): Promise<void> {
    const token = this.config.discord.token;
    if (!token) {
      throw new Error('Thiếu token Discord trong config. EN: Missing Discord token in config');
    }
    await withTimeout(
      this.connectAndWaitReady(token),
      timeoutMs,
      `Discord login không hoàn thành trong ${timeoutMs}ms (gateway chưa ready). EN: Discord login did not complete within ${timeoutMs}ms`,
      () => this.client.destroy(),
    );
    this.logger.info('Discord client đã login thành công', { intents: this.config.discord.intents });
  }

  /** Login + đợi client ready trước khi attach command (fix latency -1ms khi khởi động). */
  private async connectAndWaitReady(token: string): Promise<void> {
    await this.client.login(token);
    if (this.client.isReady()) return;
    // Client.login() thường resolve sau ready (shard race 'ready'/'resumed') — nhưng phòng trường
    // hợp resolve sớm hơn, chờ ready event nốt để chắc chắn trước khi attach command.
    // EN: client.login() usually resolves after ready — but wait for the ready event just in case
    // it resolves earlier, so we never attach commands before the gateway is ready.
    await new Promise<void>((resolve) => {
      this.client.once('ready', () => {
        this.logger.debug('Discord client đã sẵn sàng (ready event)');
        resolve();
      });
    });
  }

  /** Đăng ký command handler (gọi từ loader). Truyền ctx (config module + logger) cho handler. */
  registerCommand(name: string, handler: (interaction: unknown, ctx: CommandContext) => Promise<void> | void, ctx?: CommandContext): void {
    const listener = async (interaction: Interaction): Promise<void> => {
      if (!interaction.isCommand()) return;
      if (interaction.commandName !== name) return;

      const moduleName = ctx?.moduleName;
      if (moduleName && this.usage) this.usage.begin(moduleName);
      try {
        await handler(interaction, ctx ?? { config: {}, logger: this.logger });
      } catch (err) {
        this.logger.error(`Command '${name}' thất bại`, { error: err });
        // Boundary (§9.1): lỗi không làm sập process — map sang response cho user theo loại error (§8).
        await this.respondWithError(interaction, err);
      } finally {
        // Luôn trừ in-flight — kể cả khi handler throw (soft-stop không kẹt).
        if (moduleName && this.usage) this.usage.end(moduleName);
      }
    };

    this.commandListeners.set(name, listener);
    this.client.on('interactionCreate', listener);
  }

  /** Gỡ command handler — bỏ listener (dùng khi soft/force-unload: không nhận command mới). */
  removeCommand(name: string): void {
    const listener = this.commandListeners.get(name);
    if (!listener) return;
    this.client.off('interactionCreate', listener as never);
    this.commandListeners.delete(name);
  }

  /**
   * Phản hồi lỗi cho user theo loại error (§8, §9.1):
   * - `UserError` (và subclass) → message do module thiết kế (user-safe).
   * - Lỗi nội bộ khác → dev hiện chi tiết (`dev.show_stacktrace`), prod che giấu.
   * Cố reply trước; nếu interaction đã ack/replied → fallback followUp. Gửi fail hoàn toàn → chỉ log.
   */
  private async respondWithError(interaction: Interaction, err: unknown): Promise<void> {
    const message = toUserMessage(err, { showStacktrace: this.config.dev?.show_stacktrace ?? false });
    // Cast để hỗ trợ interaction mock (không phải bản đầy đủ của discord.js) trong test.
    // EN: Cast so partial interaction mocks (not full discord.js) work in tests.
    const target = interaction as unknown as {
      reply?: (payload: unknown) => Promise<unknown>;
      followUp?: (payload: unknown) => Promise<unknown>;
    };
    const payload = { content: message, ephemeral: true };
    const replied = target.reply ? await this.trySend(() => target.reply!(payload)) : false;
    if (!replied) {
      const followedUp = target.followUp ? await this.trySend(() => target.followUp!(payload)) : false;
      if (!followedUp) {
        this.logger.warn('Không thể gửi phản hồi lỗi cho user (interaction đã đóng?)', { error: err });
      }
    }
  }

  /** Gọi hàm gửi message; trả false nếu throw (interaction đã ack/đóng) — không crash boundary. */
  private async trySend(fn: () => Promise<unknown>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch {
      return false;
    }
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