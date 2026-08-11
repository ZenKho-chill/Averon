// Handler cho lệnh /ping — phản hồi config-driven: plain hoặc embed, random, placeholder.
// EN: Handler for /ping — config-driven response: plain or embed, random, placeholders.
import { EmbedBuilder } from 'discord.js';
import { renderPlaceholders, type PlaceholderVars } from '../../../shared/placeholders/index.js';
import type { CommandContext } from '../../../core/src/registry/types.js';

interface InteractionLike {
  reply(message: unknown): Promise<unknown>;
  user?: { id?: string; username?: string };
  guildId?: string | null;
  guild?: { name?: string } | null;
  client?: { ws?: { ping?: number } };
}

interface PingResponse {
  content?: string;
  embed?: Record<string, unknown>;
}

interface PingConfig {
  random?: boolean;
  responses?: PingResponse[];
}

/** Dựng các placeholder built-in từ interaction. */
function buildVars(interaction: InteractionLike): PlaceholderVars {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    tag_user: interaction.user?.id ? `<@${interaction.user.id}>` : '',
    latency: String(interaction.client?.ws?.ping ?? '?'),
    username: interaction.user?.username ?? '',
    user_id: interaction.user?.id ?? '',
    guild: interaction.guild?.name ?? '',
    guild_id: interaction.guildId ?? '',
  };
}

/** Chọn response: random=true (hoặc nhiều câu) → ngẫu nhiên; ngược lại câu đầu. */
function pickResponse(cfg: PingConfig): PingResponse | undefined {
  const responses = cfg.responses ?? [];
  if (responses.length === 0) return undefined;
  if (cfg.random !== false && responses.length > 1) {
    return responses[Math.floor(Math.random() * responses.length)];
  }
  return responses[0];
}

/** Dựng EmbedBuilder từ object embed config, render placeholder trong mọi string. */
function buildEmbed(embed: Record<string, unknown>, vars: PlaceholderVars): EmbedBuilder {
  const b = new EmbedBuilder();
  if (typeof embed.title === 'string') b.setTitle(renderPlaceholders(embed.title, vars));
  if (typeof embed.description === 'string') b.setDescription(renderPlaceholders(embed.description, vars));
  if (embed.color !== undefined) {
    const color = typeof embed.color === 'string' ? parseInt(embed.color.replace('#', ''), 16) : Number(embed.color);
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
  const cfg = (ctx?.config ?? {}) as PingConfig;
  const response = pickResponse(cfg);
  const vars = buildVars(interaction);

  if (!response) {
    await interaction.reply('Pong!');
    return 'Pong!';
  }

  if (response.embed) {
    const embed = buildEmbed(response.embed, vars);
    await interaction.reply({ embeds: [embed] });
    return `embed:${embed.data.title ?? ''}`;
  }

  const content = renderPlaceholders(response.content ?? '', vars);
  await interaction.reply(content);
  return content;
}
