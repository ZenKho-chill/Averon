// Handler cho lệnh /ping — phản hồi config-driven: plain hoặc embed, random, placeholder.
// EN: Handler for /ping — config-driven response: plain or embed, random, placeholders.
import { EmbedBuilder } from 'discord.js';
import { renderPlaceholders, type PlaceholderVars } from '../../../shared/placeholders/index.js';
import { measureLatency } from '../src/latency.js';
import type { CommandContext } from '../../../core/src/registry/types.js';

interface InteractionLike {
  reply(message: unknown): Promise<unknown>;
  user?: { id?: string; username?: string };
  guildId?: string | null;
  guild?: { name?: string } | null;
  client?: { ws?: { ping?: number } };
}

interface PingResponse {
  /** Kiểu phản hồi: plain text hoặc embed. */
  type: 'plain' | 'embed';
  /** Nội dung text — dùng khi type=plain. */
  content?: string;
  /** Cấu trúc embed — dùng khi type=embed (toàn bộ field EmbedBuilder). */
  embed?: Record<string, unknown>;
}

interface PingConfig {
  random?: boolean;
  /** random=false: chọn response đầu tiên khớp type này thay vì câu đầu tiên. */
  prefer_type?: 'plain' | 'embed';
  responses?: PingResponse[];
}

/** Dựng các placeholder built-in từ interaction. `ping` là latency dùng cho {latency} (-1 → '...'). */
function buildVars(interaction: InteractionLike, ping: number): PlaceholderVars {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    tag_user: interaction.user?.id ? `<@${interaction.user.id}>` : '',
    latency: ping >= 0 ? String(ping) : '...',
    username: interaction.user?.username ?? '',
    user_id: interaction.user?.id ?? '',
    guild: interaction.guild?.name ?? '',
    guild_id: interaction.guildId ?? '',
  };
}

/** Chọn response: random=true (mặc định) + nhiều câu → ngẫu nhiên.
 *  random=false → nếu khai prefer_type thì lấy response ĐẦU TIÊN khớp type đó;
 *  không khai (hoặc không khớp) → câu đầu tiên.
 *  EN: Pick response: random=true (default) with several entries → random; random=false →
 *  first response matching prefer_type if set; else the first response.
 */
function pickResponse(cfg: PingConfig): PingResponse | undefined {
  const responses = cfg.responses ?? [];
  if (responses.length === 0) return undefined;
  if (cfg.random !== false && responses.length > 1) {
    return responses[Math.floor(Math.random() * responses.length)];
  }
  if (cfg.prefer_type) {
    const match = responses.find((r) => r.type === cfg.prefer_type);
    if (match) return match;
  }
  return responses[0];
}

/** Dựng EmbedBuilder từ object embed config, render placeholder trong mọi string. */
function buildEmbed(embed: Record<string, unknown>, vars: PlaceholderVars): EmbedBuilder {
  const b = new EmbedBuilder();
  if (typeof embed.title === 'string') b.setTitle(renderPlaceholders(embed.title, vars));
  if (typeof embed.description === 'string') b.setDescription(renderPlaceholders(embed.description, vars));
  if (embed.color !== undefined) {
    // Chuẩn hex: "#RRGGBB" hoặc "RRGGBB" (cả 6/8 chữ số, hỗ trợ alpha). Số decimal cũng được.
    const hex = String(embed.color).trim().replace(/^#/, '');
    const color = /^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(hex) ? parseInt(hex.slice(0, 6), 16) : Number(embed.color);
    if (!Number.isNaN(color)) b.setColor(color);
  }
  if (typeof embed.url === 'string') b.setURL(renderPlaceholders(embed.url, vars));
  if (typeof embed.image === 'string') b.setImage(renderPlaceholders(embed.image, vars));
  if (typeof embed.thumbnail === 'string') b.setThumbnail(renderPlaceholders(embed.thumbnail, vars));
  if (embed.timestamp === true) b.setTimestamp();
  else if (typeof embed.timestamp === 'string') b.setTimestamp(new Date(embed.timestamp));
  if (embed.author && typeof embed.author === 'object') {
    const a = embed.author as { name?: string; url?: string; icon_url?: string };
    b.setAuthor({ name: renderPlaceholders(a.name ?? '', vars), url: a.url, iconURL: a.icon_url });
  }
  if (embed.footer && typeof embed.footer === 'object') {
    const f = embed.footer as { text?: string; icon_url?: string };
    b.setFooter({ text: renderPlaceholders(f.text ?? '', vars), iconURL: f.icon_url });
  }
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields as Array<{ name?: string; value?: string; inline?: boolean }>) {
      if (field && typeof field.name === 'string' && typeof field.value === 'string') {
        b.addFields({ name: renderPlaceholders(field.name, vars), value: renderPlaceholders(field.value, vars), inline: field.inline ?? false });
      }
    }
  }
  return b;
}

export async function handler(interaction: InteractionLike, ctx?: CommandContext) {
  // Lấy config MỚI NHẤT từ registry thay vì closure (config capture lúc attach) — sau reload
  // entry trong registry đã được thay bằng config mới. hasModule() để tránh throw trong khoảng
  // trống khi force-reload (getModule ném nếu module chưa đăng ký lại).
  // EN: Read the LATEST config from the registry instead of the closure captured at attach time —
  // after reload the registry entry is replaced with the new config. Use hasModule() to avoid a
  // throw during the force-reload gap (getModule throws when the module is not re-registered yet).
  const registry = ctx?.registry;
  const moduleEntry = registry && registry.hasModule('ping') ? registry.getModule('ping') : undefined;
  const cfg = (moduleEntry?.getConfig?.() ?? ctx?.config ?? {}) as PingConfig;
  const response = pickResponse(cfg);

  if (!response) {
    await interaction.reply('Pong!');
    return 'Pong!';
  }

  // ws.ping có thể chưa đo được (mới khởi động, heartbeat chưa ACK — xem src/latency.ts) → đo RTT thay thế.
  // EN: ws.ping may not be measured yet (right after startup, heartbeat not ACKed — see src/latency.ts) → measure RTT instead.
  const ping = await measureLatency(interaction.client?.ws?.ping);
  const vars = buildVars(interaction, ping);

  // Branch theo type: plain → text; embed → { embeds: [...] }
  if (response.type === 'embed') {
    const embed = buildEmbed(response.embed ?? {}, vars);
    await interaction.reply({ embeds: [embed] });
    return `embed:${embed.data.title ?? ''}`;
  }

  const content = renderPlaceholders(response.content ?? '', vars);
  await interaction.reply(content);
  return content;
}
