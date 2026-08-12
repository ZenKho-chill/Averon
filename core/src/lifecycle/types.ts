/**
 * Types cho core/lifecycle — pipeline load/unload module (CLAUDE.md §2.2).
 * EN: Types for core/lifecycle — module load/unload pipeline.
 */
import type { ModuleRegistryEntry } from '../registry/types.js';

export interface ModuleLifecycleHooks {
  /** Gọi khi module được load thành công (sau khi attach commands/events). */
  onLoad?: () => Promise<void> | void;
  /** Gọi khi module bị unload (trước khi gỡ commands/events). */
  onUnload?: () => Promise<void> | void;
}

// getConfig nằm trong ModuleRegistryEntry (registry/types.ts) — handler lấy config mới nhất qua registry.
// EN: getConfig lives on ModuleRegistryEntry (registry/types.ts) so handlers can read the latest config via the registry.
export type ModuleEntryWithHooks = ModuleRegistryEntry & ModuleLifecycleHooks;