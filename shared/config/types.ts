/**
 * Các type dùng chung cho config (CLAUDE.md §6).
 * EN: Shared config types.
 */
import type { LogLevel } from '../logger/levels.js';

/** Cấu hình ứng dụng — khớp config/schemas/core.schema.json (§6.5). */
export interface AppConfig {
  app: {
    name: string;
    version: string;
  };
  discord: {
    token?: string;
    intents: string[];
    /** Guild ID để sync lệnh theo guild — cần khi register_commands.guild=true (§8). */
    guild_id?: string;
    /**
     * Bật/tắt sync command lên Discord qua REST khi boot, theo 3 scope (§8).
     * - global: slash command toàn app (cache ~1h)
     * - guild:  slash command cho guild cụ thể (tức thời — dev)
     * - user:   context menu (chuột phải vào user/message)
     * Module khai báo scope của từng lệnh trong module.yml; cờ này là toggle tổng.
     */
    register_commands: {
      global: boolean;
      guild: boolean;
      user: boolean;
    };
  };
  logging: {
    level: LogLevel;
    console_color: boolean;
    file: {
      enabled: boolean;
      dir: string;
      max_size_mb: number;
      keep_files: number;
    };
  };
  crash: {
    max_failures: number;
    fail_window_ms: number;
    watchdog: {
      enabled: boolean;
      max_restarts: number;
      window_min: number;
    };
  };
  dev: {
    hot_reload: boolean;
    show_stacktrace: boolean;
  };
  /** Operator console (§ console) — optional, mặc định trong code (AJV không materialize schema default). */
  console?: ConsoleConfig;
}

/** Cấu hình operator console — nhập lệnh `averon ...` từ stdin (CLAUDE.md § console). */
export interface ConsoleConfig {
  enabled: boolean;
  prompt: string;
  /** Thời gian chờ soft-stop đợi in-flight handler (ms) trước khi báo timeout. */
  soft_stop_timeout_ms: number;
}

/** Tuỳ chọn khi load config. */
export interface LoadConfigOptions {
  /** Thư mục chứa config.yml (mặc định: config/ của dự án). */
  configDir?: string;
  /** Tên file config (mặc định: config.yml). */
  file?: string;
  /** JSON Schema (object) hoặc đường dẫn tới file schema (JSON/YAML). */
  schema?: object | string;
}
