/**
 * Types cho core/registry — service registry (DI) + module registry (CLAUDE.md §2.1).
 * EN: Types for core/registry — service registry (DI) + module registry.
 */
import type { Logger } from '../../../shared/logger/index.js';
import type { AppConfig } from '../config/index.js';

import type { Registry } from './index.js';
import type { UsageTracker } from './usage.js';
import type { ModuleManager } from '../console/manager.js';
import type { DiscordClient } from '../discord/index.js';

export interface CoreServices {
  logger: Logger;
  config: AppConfig;
  manager: ModuleManager;
  discord: DiscordClient;
  usage: UsageTracker;
  registry: Registry;
  root: string;
  // db: DatabaseClient; // (sẽ thêm sau)
}

export type ServiceKey = keyof CoreServices;

/** Tối thiểu core expose cho module để tra module đang chạy (không phải toàn bộ Registry). */
export interface RegistryLike {
  /** Lấy service (DI). */
  getService<K extends ServiceKey>(key: K): CoreServices[K];
  /** Kiểm tra module có tồn tại không (non-throwing). */
  hasModule(name: string): boolean;
  /** Lấy module theo tên. */
  getModule(name: string): ModuleRegistryEntry;
}

/** Context truyền cho handler command (module) — config module + logger (§2.1). */
export interface CommandContext {
  config: Record<string, unknown>;
  logger: Logger;
  /** Tên module sở hữu command (dùng để đếm in-flight handler qua UsageTracker — soft-stop). */
  moduleName?: string;
  /** Registry core (tra module) — handler đọc config MỚI NHẤT qua registry.getModule(name).getConfig() sau reload. */
  registry?: RegistryLike;
}

/** Handler command: nhận interaction + ctx (config module, logger), trả promise/void. */
export type CommandHandler = (interaction: unknown, ctx: CommandContext) => Promise<void> | void;

/**
 * Handler event Discord (hoặc event nội bộ core): nhận args của event + ctx (config module, logger)
 * được core thêm vào CUỐI danh sách args — đối xứng với CommandContext của command handler.
 * Module khai báo signature cụ thể theo event: `handler(oldState, newState, ctx)`.
 * EN: Discord event (or core-internal event) handler: receives the event args plus a ctx
 * (module config, logger) appended by core as the LAST argument — mirrors CommandContext.
 * Modules declare a concrete signature per event: `handler(oldState, newState, ctx)`.
 */
export type EventHandler = (...args: unknown[]) => Promise<void> | void;

export interface ModuleRegistryEntry {
  name: string;
  version: string;
  state: 'REGISTERED' | 'LOADING' | 'LOADED' | 'RUNNING' | 'DRAINING' | 'UNLOADED' | 'FAULTED';
  entry: string; // đường dẫn entry point
  config?: Record<string, unknown>; // module config đã merge (defaults + override)
  /** Cache config đã merge trong entry — handler lấy config mới nhất qua registry sau reload. */
  getConfig?: () => Record<string, unknown> | undefined;
  /** Gateway intents module cần (khai báo trong module.yml) — gộp vào client khi boot (§4). */
  intents?: string[];
  commands: Array<{
    name: string;
    handler: string;            // path file handler (tương đối module dir)
    handlerFn?: CommandHandler; // function đã import (bootstrap dùng để gắn listener)
    description?: Record<string, string> | string;
    type?: 'chat_input' | 'user' | 'message';
    scope?: Array<'global' | 'guild' | 'user'>;
  }>;
  events: Array<{ name: string; handler: string; handlerFn?: EventHandler }>;
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