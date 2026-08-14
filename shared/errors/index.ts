/**
 * shared/errors — hệ thống lỗi chuẩn cho core + module (CLAUDE.md §8, §9.1).
 * EN: shared/errors — standard error handling for core + modules.
 *
 * Cách dùng:
 * - Module KHÔNG reply hardcode chuỗi lỗi trong handler — THROW typed error để core
 *   bắt ở boundary và tự map sang response phù hợp cho user (§9.1).
 * - `UserError` (và các subclass): message được thiết kế AN TOÀN để hiển thị trực tiếp.
 * - Lỗi khác (generic Error): core chỉ hiển thị chi tiết ở dev (`dev.show_stacktrace`),
 *   ở prod che giấu internals (§7.4, §8) — dùng `toUserMessage()`.
 */

/** Base class lỗi hiển thị được cho user — message phải user-safe (không lộ cấu trúc nội bộ). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

/** Không tìm thấy tài nguyên (user, guild, file, record...). */
export class NotFoundError extends UserError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** User thiếu quyền thực hiện hành động. */
export class PermissionError extends UserError {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

/** User bị giới hạn tần suất / cooldown / quota. */
export class RateLimitError extends UserError {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/** Đối số / dữ liệu user nhập không hợp lệ. */
export class InvalidArgumentError extends UserError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArgumentError';
  }
}

export interface ErrorResponse {
  /** true = dev: hiện chi tiết lỗi nội bộ; false = prod: che giấu (§8). Mặc định false. */
  showStacktrace?: boolean;
}

/** Message chung an toàn khi lỗi nội bộ (prod) — không lộ cấu trúc internals (§7.4). */
export const GENERIC_ERROR_MESSAGE =
  'Đã có lỗi xảy ra khi thực hiện lệnh, xin thử lại sau. EN: Something went wrong while running the command, please try again later.';

/**
 * Map bất kỳ error → message hiển thị cho user:
 * - `UserError` (kể cả subclass): trả message của chính error (đã user-safe).
 * - Error khác: dev (`showStacktrace: true`) → message chung + chi tiết lỗi (dễ debug);
 *   prod → message chung an toàn, che giấu internals.
 */
export function toUserMessage(err: unknown, options: ErrorResponse = {}): string {
  if (err instanceof UserError) return err.message;
  if (options.showStacktrace) {
    const detail = err instanceof Error ? err.message : String(err);
    return `${GENERIC_ERROR_MESSAGE}\n\`${detail}\``;
  }
  return GENERIC_ERROR_MESSAGE;
}