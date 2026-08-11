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
    /** Bật mới sync slash command lên Discord qua REST khi boot. Tắt ở dev để tránh re-register mỗi lần restart. */
    register_commands: boolean;
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
