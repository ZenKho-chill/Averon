// Logic kênh thoại tạm thời (VoiceMaster-like) cho module tempvoice.
// EN: Temporary voice channel logic (VoiceMaster-like) for the tempvoice module.
//
// Luồng (flow):
// 1. User join kênh "hub" → tạo kênh tạm (tên theo template, category/bitrate/slot theo config)
//    rồi chuyển user vào kênh đó.
// 2. User rời kênh tạm → sau delete_empty_delay_ms nếu kênh rỗng → xóa kênh.
//
// Stateless: toàn bộ quyết định dựa trên (oldState, newState, config) — test dễ, không giữ
// state bên ngoài handler. En: stateless — decisions derive only from (oldState, newState, config).
import { renderPlaceholders } from '../../../shared/placeholders/index.js';

/** Giao diện tối thiểu của VoiceState (discord.js) — đủ cho logic + test. */
export interface VoiceStateLike {
  channelId?: string | null;
  /** User vừa đổi trạng thái voice. */
  member?: { user?: { username?: string } } | null;
  guild?: {
    id?: string;
    channels: {
      create(options: Record<string, unknown>): Promise<{ id: string; name: string }>;
      /** Lấy kênh (để đọc members) — cần khi kiểm tra kênh rỗng. */
      fetch(id: string): Promise<{ id: string; name: string; members: { size: number }; delete(reason?: string): Promise<void> }>;
    };
  } | null;
  /** Chuyển user sang kênh khác (discord.js VoiceState.setChannel). */
  setChannel?(channelId: string | null, reason?: string): Promise<void>;
}

/** Config module tempvoice (config/defaults.yml). */
export interface TempVoiceConfig {
  hub_channel_id?: string;
  channel_name_template?: string;
  category_id?: string;
  max_users?: number;
  bitrate_kbps?: number;
  delete_empty_delay_ms?: number;
}

// ── State theo dõi kênh tạm do module tạo ────────────────────────────────────────
// EN: tracks temp channels created by this module.
// Module-scope (không global): an toàn khi nhiều module instance, reset khi test.
// EN: module-scoped (not global): safe across instances, resettable in tests.

/** Tập kênh tạm đang hoạt động (channelId). Rời khỏi kênh tạm + rỗng → xóa. */
const createdChannels = new Set<string>();

/** Đánh dấu kênh là kênh tạm do module tạo. */
export function markTempChannel(channelId: string): void {
  createdChannels.add(channelId);
}

/** Kênh này có phải kênh tạm do module tạo không? */
export function isTempChannel(channelId: string): boolean {
  return createdChannels.has(channelId);
}

/** Gỡ kênh khỏi theo dõi (khi đã xóa). */
export function untrackTempChannel(channelId: string): void {
  createdChannels.delete(channelId);
}

/** Reset state (test). EN: reset state (tests). */
export function __resetTempChannels(): void {
  createdChannels.clear();
}

/** Tên kênh tạm theo template — {username} → tên user, cắt về 100 ký tự (giới hạn Discord). */
export function buildChannelName(username: string, config: TempVoiceConfig): string {
  const template = config.channel_name_template?.trim();
  const name = template && template.length > 0 ? renderPlaceholders(template, { username }) : `${username}'s Channel`;
  return name.slice(0, 100);
}

/** Kiểm tra user vừa THAM GIA kênh hub (vào hub, không phải di chuyển trong hub). */
export function joinedHub(oldState: VoiceStateLike, newState: VoiceStateLike, hubChannelId: string): boolean {
  return newState.channelId === hubChannelId && oldState.channelId !== hubChannelId;
}

/** Kiểm tra user vừa RỜI khỏi 1 kênh (chuyển kênh hoặc thoát voice). */
export function leftChannel(oldState: VoiceStateLike, newState: VoiceStateLike): string | null {
  const left = oldState.channelId ?? null;
  if (!left) return null;
  if (left === newState.channelId) return null; // không đổi kênh
  return left;
}

/** Tạo kênh tạm + chuyển user vào. Trả kênh đã tạo hoặc null nếu thiếu guild. */
export async function createTempChannel(
  newState: VoiceStateLike,
  config: TempVoiceConfig,
): Promise<{ id: string; name: string } | null> {
  const guild = newState.guild;
  if (!guild) return null;
  const username = newState.member?.user?.username ?? 'User';
  const name = buildChannelName(username, config);

  const options: Record<string, unknown> = {
    name,
    type: 2, // ChannelType.GuildVoice
  };
  if (config.category_id) options.parent = config.category_id;
  if (config.bitrate_kbps && config.bitrate_kbps > 0) options.bitrate = config.bitrate_kbps * 1000;
  if (config.max_users && config.max_users > 0) options.userLimit = config.max_users;

  const channel = await guild.channels.create(options);
  markTempChannel(channel.id);
  await newState.setChannel?.(channel.id, 'tempvoice: join temp channel');
  return channel;
}

/** Xóa kênh tạm sau delay nếu rỗng — trả true nếu đã lên lịch xóa.
 *  CHỈ xóa kênh do module tạo (isTempChannel) — không đụng kênh thường khác. */
export async function scheduleDeleteIfEmpty(
  channelId: string,
  oldState: VoiceStateLike,
  config: TempVoiceConfig,
): Promise<boolean> {
  const guild = oldState.guild;
  if (!guild) return false;
  if (!isTempChannel(channelId)) return false; // không phải kênh tạm → bỏ qua
  const delayMs = config.delete_empty_delay_ms ?? 3000;

  const channel = await guild.channels.fetch(channelId);
  if (channel.members.size > 0) return false; // còn người → không xóa

  setTimeout(() => {
    void channel.delete('tempvoice: empty channel cleanup');
    untrackTempChannel(channelId);
  }, delayMs);
  return true;
}