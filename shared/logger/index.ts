/**
 * shared/logger — logger đa cấp độ, console màu + file rotate, mask secret (CLAUDE.md §7).
 * EN: shared/logger — leveled logger with colored console + rotating file, secret masking.
 */
import { mask as maskSecret } from '../utils/mask.js';
import { LEVEL_ORDER, parseLogLevel, type LogLevel } from './levels.js';
import { ConsoleSink, RotatingFileSink, type LogSink } from './writer.js';

export { LOG_LEVELS, parseLogLevel } from './levels.js';
export type { LogLevel } from './levels.js';
export { colorizeLevel, ConsoleSink, RotatingFileSink } from './writer.js';
export { mask } from '../utils/mask.js';

export interface LogMeta {
  [key: string]: unknown;
}

export interface LoggerOptions {
  /** Cấp độ tối thiểu được ghi (mặc định INFO). */
  level?: LogLevel;
  /** Nguồn log — vd `core/loader`, `modules/example/commands/ping.ts` (§7.2). */
  source?: string;
  /** Context — vd `modules/example`, `service/database`. */
  context?: string;
  /** Tô màu console (dev bật, prod tắt — §8). */
  color?: boolean;
  /** Ghi file + rotate (prod). `null` để tắt. */
  file?: { dir: string; maxSizeMB?: number; keepFiles?: number } | null;
  /** Inject sink tuỳ biến (test dùng). */
  write?: (line: string) => void;
}

/** Giờ địa phương + ms: `2026-08-11 17:35:52.169`. Đọc dễ hơn ISO-UTC, đúng múi giờ local. */
function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
  );
}

/** Format chuẩn §7.2: `[ts] [LEVEL] [source] [context] message {meta}`. */
export function formatLine(
  level: LogLevel,
  source: string,
  context: string,
  message: string,
  meta?: LogMeta,
): string {
  const timestamp = formatTimestamp(new Date());
  const contextPart = context ? ` [${context}]` : '';
  const metaPart = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.padEnd(5)}] [${source}]${contextPart} ${message}${metaPart}`;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly sinks: LogSink[];

  constructor(private readonly options: LoggerOptions = {}) {
    this.level = parseLogLevel(options.level, 'INFO');
    this.sinks = [];
    if (options.write) {
      this.sinks.push({ write: options.write });
    } else {
      this.sinks.push(new ConsoleSink(options.color ?? false));
    }
    if (options.file) {
      this.sinks.push(
        new RotatingFileSink(options.file.dir, options.file.maxSizeMB, options.file.keepFiles),
      );
    }
  }

  debug(message: string, meta?: LogMeta): void {
    this.log('DEBUG', message, meta);
  }
  info(message: string, meta?: LogMeta): void {
    this.log('INFO', message, meta);
  }
  warn(message: string, meta?: LogMeta): void {
    this.log('WARN', message, meta);
  }
  error(message: string, meta?: LogMeta): void {
    this.log('ERROR', message, meta);
  }
  fatal(message: string, meta?: LogMeta): void {
    this.log('FATAL', message, meta);
  }

  /** Tiện ích che bí mật khi log (§7.4): `logger.mask(token)`. */
  mask(value: string | null | undefined, keepLast?: number): string {
    return maskSecret(value, keepLast);
  }

  /** Tạo logger con với source/context khác (giữ nguyên sink + level). */
  child(overrides: Partial<Pick<LoggerOptions, 'source' | 'context'>>): Logger {
    return new Logger({ ...this.options, ...overrides });
  }

  private log(level: LogLevel, message: string, meta?: LogMeta): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const source = this.options.source ?? 'core';
    const context = this.options.context ?? '';
    const line = formatLine(level, source, context, message, meta);
    for (const sink of this.sinks) sink.write(line);
  }
}

/** Tạo logger (khuyến nghị dùng hàm này). */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}
