/**
 * core/discord/intents — danh sách intent gateway của bot (CLAUDE.md §4).
 * EN: core/discord/intents — gateway intents for the bot.
 *
 * Core chỉ bật intent tối thiểu; MODULE khai báo intents riêng trong module.yml
 * (`intents: [GuildVoiceStates, ...]`). Bootstrap gộp lại trước khi tạo Discord client —
 * discord.js KHÔNG cho thêm intent sau khi login.
 * EN: Core enables only the minimum intent; MODULES declare their own in module.yml
 * (`intents: [GuildVoiceStates, ...]`). Bootstrap merges them before creating the Discord
 * client — discord.js does NOT allow adding intents after login.
 */
import { GatewayIntentBits } from 'discord.js';

/** Intent tối thiểu core luôn bật (Guilds cần cho mọi tương tác/guild data). */
export const CORE_INTENTS = ['Guilds'] as const;

/** Kiểm tra tên intent có hợp lệ (khớp GatewayIntentBits của discord.js). */
export function isKnownIntent(name: string): boolean {
  return typeof (GatewayIntentBits as unknown as Record<string, unknown>)[name] === 'number';
}
