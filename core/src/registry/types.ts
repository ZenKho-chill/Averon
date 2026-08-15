/**
 * Types cho core/registry — service registry (DI) + module registry (CLAUDE.md §2.1).
 * EN: Types for core/registry — service registry (DI) + module registry.
 */
import type { Logger } from '../../../shared/logger/index.js';
import type { AppConfig } from '../config/index.js';
import type { ModuleManager } from '../console/manager.js';
import type { DiscordClient } from '../discord/index.js';
import type { UsageTracker } from './usage.js';
import type { Registry } from './index.js';

/**
 * Service registry (DI) core expose cho module (§2.1, §13.3). Module truy cập qua
 * `ctx.registry.getService(key)` (xem RegistryLike) — KHÔNG import core internal.
 * EN: Services core exposes to modules via the DI registry. Modules reach them through
 * `ctx.registry.getService(key)` (see RegistryLike) — never by importing core internals.
 */
export interface CoreServices {
  logger: Logger;
  config: AppConfig;
  /** ModuleManager — load/unload/reload module lúc runtime (console manager). */
  manager: ModuleManager;
  /** DiscordClient — status (ready/ping/guilds), client wrapper. */
  discord: DiscordClient;
  /** UsageTracker — đếm in-flight handler của từng module. */
  usage: UsageTracker;
  /** Registry — danh sách module đang chạy (đọc metadata an toàn). */
  registry: Registry;
  /** Project root (nơi có package.json) — đọc/ghi config paths cross-platform (§6.1). */
  root: string;
}

export type ServiceKey = keyof CoreServices;

/**
 * Mặt public tối thiểu core expose cho module (tra module + lấy service). KHÔNG lộ toàn bộ
 * Registry — module chỉ được gọi các hàm non-destructive này (CLAUDE.md §5.3).
 * EN: Minimal public surface core exposes to modules — module lookup + typed service access.
 */
export interface RegistryLike {
  /** Kiểm tra module có tồn tại không (non-throwing). */
  hasModule(name: string): boolean;
  /** Lấy module theo tên. */
  getModule(name: string): ModuleRegistryEntry;
  /** Lấy service core theo key (type-safe) — vd `getService('manager')` cho load/unload/reload module. */
  getService<K extends ServiceKey>(key: K): CoreServices[K];
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