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
  /** Thư mục chứa default.yml + <env>.yml (mặc định: config/ của dự án). */
  configDir?: string;
  /** Env đích (mặc định: AVERON_ENV || NODE_ENV || 'dev'). */
  env?: string;
  /** JSON Schema (object) hoặc đường dẫn tới file schema (JSON/YAML). */
  schema?: object | string;
  /** Nguồn biến môi trường — cho phép test inject (mặc định: process.env). */
  envSource?: Record<string, string | undefined>;
}
