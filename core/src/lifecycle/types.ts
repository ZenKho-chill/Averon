/**
 * Types cho core/lifecycle — pipeline load/unload module (CLAUDE.md §2.2).
 * EN: Types for core/lifecycle — module load/unload pipeline.
 */
import type { ModuleRegistryEntry } from '../registry/types.js';
import type { RegistryLike } from '../registry/types.js';

export interface ModuleLifecycleHooks {
  /**
   * Gọi khi module được load thành công (sau khi attach commands/events).
   * Nhận `registry` (RegistryLike) để module đọc service core qua `getService(key)`
   * — dùng cho module cần service lúc onLoad (vd webui cần manager/discord khi start server).
   * Module không cần thì bỏ qua tham số (backward-compatible: hook cũ `onLoad()` vẫn chạy).
   * EN: Called when the module is loaded (after commands/events are attached). Receives the
   * `registry` (RegistryLike) so modules can reach core services via `getService(key)` at
   * onLoad time (e.g. webui needs manager/discord to start its server). Older hooks that
   * ignore the arg keep working (backward-compatible).
   */
  onLoad?: (registry?: RegistryLike) => Promise<void> | void;
  /** Gọi khi module bị unload (trước khi gỡ commands/events). */
  onUnload?: () => Promise<void> | void;
}

// getConfig nằm trong ModuleRegistryEntry (registry/types.ts) — handler lấy config mới nhất qua registry.
// EN: getConfig lives on ModuleRegistryEntry (registry/types.ts) so handlers can read the latest config via the registry.
export type ModuleEntryWithHooks = ModuleRegistryEntry & ModuleLifecycleHooks;