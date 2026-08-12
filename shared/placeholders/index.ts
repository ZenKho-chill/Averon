/**
 * shared/placeholders — thay thế placeholder built-in trong text phản hồi (§7).
 * EN: shared/placeholders — replace built-in placeholders in response text.
 *
 * Cú pháp: `{key}`. Ví dụ: "Pong! ({latency}ms)" → "Pong! (42ms)".
 * Placeholder không biết (thiếu var) → thay bằng '' (giữ text an toàn).
 */
export interface PlaceholderVars {
  /** Giờ địa phương HH:MM:SS. */
  time?: string;
  /** Tag user dạng <@id>. */
  tag_user?: string;
  /** Độ trễ (ms) — vd client.ws.ping. */
  latency?: string;
  username?: string;
  user_id?: string;
  guild?: string;
  guild_id?: string;
  /** Các placeholder mở rộng khác. */
  [key: string]: string | undefined;
}

/** Thay mọi `{key}` trong text bằng vars[key] ?? ''. */
export function renderPlaceholders(text: string, vars: PlaceholderVars): string {
  return text.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? '');
}
