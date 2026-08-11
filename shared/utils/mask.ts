/**
 * Che bí mật trước khi log — bắt buộc theo CLAUDE.md §7.4.
 * EN: Mask a secret value for safe logging (CLAUDE.md §7.4).
 *
 * Giữ lại `keepLast` ký tự cuối cho dễ truy vết, phần còn lại thay bằng '*'.
 * Giá trị quá ngắn (<= keepLast) sẽ bị che toàn bộ để không lộ.
 */
export function mask(value: string | null | undefined, keepLast = 4): string {
  if (!value) return '';
  if (value.length <= keepLast) return '*'.repeat(value.length);
  return '*'.repeat(value.length - keepLast) + value.slice(-keepLast);
}
