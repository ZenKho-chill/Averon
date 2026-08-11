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

export interface ModuleRegistryEntry {
  name: string;
  version: string;
  state: 'REGISTERED' | 'LOADING' | 'LOADED' | 'RUNNING' | 'UNLOADED' | 'FAULTED';
  entry: string; // đường dẫn entry point
  commands: Array<{
    name: string;
    handler: string;
    description?: { vi?: string; en?: string } | string;
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