/**
 * Cấp độ log — tối thiểu 5 level theo CLAUDE.md §7.1.
 * EN: Log levels — at least 5, per CLAUDE.md §7.1.
 */

export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Thứ tự tăng dần — level đứng sau có mức ưu tiên cao hơn. */
export const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

/** Màu ANSI cho từng level (console dev — §7.3). */
export const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: '[90m', // grey
  INFO: '[36m', // cyan
  WARN: '[33m', // yellow
  ERROR: '[31m', // red
  FATAL: '[31m[1m', // red + bold
};

export const COLOR_RESET = '[0m';

/** Parse level từ chuỗi (config); không hợp lệ → dùng fallback (mặc định INFO). */
export function parseLogLevel(value: string | undefined, fallback: LogLevel = 'INFO'): LogLevel {
  if (!value) return fallback;
  const normalized = value.toUpperCase();
  return (LOG_LEVELS as readonly string[]).includes(normalized) ? (normalized as LogLevel) : fallback;
}
