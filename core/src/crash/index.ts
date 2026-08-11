/**
 * core/crash — global anti-crash handlers + quarantine logic (CLAUDE.md §9.2, §9.4).
 * EN: core/crash — global anti-crash handlers + quarantine logic.
 *
 * Bắt toàn bộ uncaughtException/unhandledRejection để không để sập cả process vì lỗi 1 module.
 * Ghi crash report để debug sau. Cô lập (quarantine) module lỗi liên tục.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isQuarantined, shouldQuarantine } from './quarantine.js';
import type { CrashReport, QuarantineModule } from './types.js';

/** Interface tối thiểu logger mà core/crash cần (tránh phụ thuộc cứng). */
export interface CrashLogger {
  fatal(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface CrashReporterOptions {
  logger: CrashLogger;
  /** Hàm cung cấp trạng thái các module hiện tại. */
  getModuleStates: () => CrashReport['context']['modules'];
  /** Thư mục ghi crash report. */
  crashDir: string;
  env: string;
  appVersion: string;
  /** Quy tắc quarantine (§9.2). */
  maxFailures?: number;
  windowMs?: number;
}

export class CrashReporter {
  private readonly uncaughtHandler: (err: Error) => void;
  private readonly unhandledRejectionHandler: (reason: unknown) => void;
  private readonly maxFailures: number;
  private readonly windowMs: number;

  constructor(private readonly options: CrashReporterOptions) {
    this.maxFailures = options.maxFailures ?? 5;
    this.windowMs = options.windowMs ?? 300_000;

    this.uncaughtHandler = (err: Error) => {
      this.options.logger.fatal('Uncaught exception — sẽ thoát để watchdog restart', {
        error: err.message,
        stack: err.stack,
      });
      this.writeReport('UncaughtException', err);
      process.exit(1); // toàn hệ thống chết → watchdog restart (có retry limit §9.3)
    };

    this.unhandledRejectionHandler = (reason: unknown) => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      this.options.logger.error('Unhandled rejection — giữ bot chạy (isolate)', {
        error: err.message,
        stack: err.stack,
      });
      this.writeReport('UnhandledRejection', err);
      // Không exit: rejection thường đến từ 1 promise lẻ, không phải lỗi toàn hệ thống.
    };
  }

  /** Đăng ký global handlers (gọi 1 lần khi boot — §9.1). */
  install(): void {
    process.on('uncaughtException', this.uncaughtHandler);
    process.on('unhandledRejection', this.unhandledRejectionHandler);
  }

  /** Gỡ handlers (test dùng). */
  uninstall(): void {
    process.off('uncaughtException', this.uncaughtHandler);
    process.off('unhandledRejection', this.unhandledRejectionHandler);
  }

  /** Xử lý lỗi 1 module: quarantine nếu vượt ngưỡng, trả true nếu đã bị cô lập (§9.2). */
  handleModuleFailure(moduleName: string, reason: string): boolean {
    if (isQuarantined(moduleName)) return true;
    const quarantined = shouldQuarantine(moduleName, Date.now(), {
      dir: this.options.crashDir,
      maxFailures: this.maxFailures,
      windowMs: this.windowMs,
    });
    if (quarantined) {
      this.options.logger.warn(
        `Module '${moduleName}' bị cô lập (quarantine) — gỡ khỏi chạy, bot tiếp tục`,
        { module: moduleName, reason },
      );
      this.writeReport('ModuleQuarantined', new Error(reason), {
        name: moduleName,
        reason,
        timestamp: new Date().toISOString(),
        failureCount: this.maxFailures,
      } satisfies QuarantineModule);
    }
    return quarantined;
  }

  private writeReport(type: string, err: Error, quarantine?: QuarantineModule): void {
    mkdirSync(this.options.crashDir, { recursive: true });
    const report: CrashReport = {
      timestamp: new Date().toISOString(),
      error: { name: err.name, message: err.message, stack: err.stack },
      context: {
        env: this.options.env,
        appVersion: this.options.appVersion,
        nodeVersion: process.version,
        modules: this.options.getModuleStates(),
      },
      quarantine,
    };
    const file = join(this.options.crashDir, `crash-${Date.now()}-${type}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
  }
}

export * from './types.js';
export { isQuarantined, shouldQuarantine, writeCrashReport, resetQuarantine } from './quarantine.js';