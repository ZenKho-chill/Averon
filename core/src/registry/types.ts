/**
 * Types cho core/registry — service registry (DI) + module registry (CLAUDE.md §2.1).
 * EN: Types for core/registry — service registry (DI) + module registry.
 */
import type { Logger } from '../../../shared/logger/index.js';
import type { AppConfig } from '../config/index.js';

export interface CoreServices {
  logger: Logger;
  config: AppConfig;
  // db: DatabaseClient; // (sẽ thêm sau)
}

export type ServiceKey = keyof CoreServices;

/** Context truyền cho handler command (module) — config module + logger (§2.1). */
export interface CommandContext {
  config: Record<string, unknown>;
  logger: Logger;
  /** Tên module sở hữu command (dùng để đếm in-flight handler qua UsageTracker — soft-stop). */
  moduleName?: string;
  /** Registry module — handler lấy config MỚI NHẤT qua `registry.getModule(name).getConfig()` sau reload. */
  registry?: CommandContextRegistry;
}

/** Registry interface tối thiểu CommandContext cần (type-only — tránh import vòng core/registry). */
export interface CommandContextRegistry {
  hasModule(name: string): boolean;
  getModule(name: string): ModuleRegistryEntry;
}

/** Handler command: nhận interaction + ctx (config module, logger), trả promise/void. */
export type CommandHandler = (interaction: unknown, ctx: CommandContext) => Promise<void> | void;

export interface ModuleRegistryEntry {
  name: string;
  version: string;
  state: 'REGISTERED' | 'LOADING' | 'LOADED' | 'RUNNING' | 'DRAINING' | 'UNLOADED' | 'FAULTED';
  entry: string; // đường dẫn entry point
  config?: Record<string, unknown>; // module config đã merge (defaults + override)
  /** Trả config merge mới nhất (cache trong entry) — handler đọc qua registry thay vì closure (§ reload-config). */
  getConfig?: () => Record<string, unknown>;
  commands: Array<{
    name: string;
    handler: string;            // path file handler (tương đối module dir)
    handlerFn?: CommandHandler; // function đã import (bootstrap dùng để gắn listener)
    description?: Record<string, string> | string;
    type?: 'chat_input' | 'user' | 'message';
    scope?: Array<'global' | 'guild' | 'user'>;
  }>;
  events: Array<{ name: string; handler: string }>;
  runtime: {
    language: string;
    engine: string;
    version: string;
    transport: 'in-process' | 'subprocess' | 'socket' | 'ffi';
  };
  ipc?: {
    api_version: number;
    rpc_schema?: string;
  };
}

export type ModuleState = ModuleRegistryEntry['state'];