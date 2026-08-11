/**
 * Types cho core/loader — parse module.yml + import entry (CLAUDE.md §4).
 * EN: Types for core/loader — parse module.yml + import entry.
 */
import type { ModuleRegistryEntry } from '../registry/types.js';

export interface ModuleManifest {
  name: string;
  version: string;
  description?: {
    vi?: string;
    en?: string;
  };
  author?: string;
  runtime: {
    language: 'typescript' | 'javascript' | 'python' | 'c' | 'cpp' | 'rust';
    engine: 'node' | 'python' | 'native';
    version: string;
    transport: 'in-process' | 'subprocess' | 'socket' | 'ffi';
  };
  entry: string;
  load?: {
    after?: string[];
    requires?: string[];
    optional?: string[];
  };
  commands?: Array<{
    name: string;
    description?: {
      vi?: string;
      en?: string;
    };
    handler: string;
    enabled?: boolean;
    /** Loại lệnh Discord: chat_input (slash) | user | message (context menu). Mặc định chat_input. */
    type?: 'chat_input' | 'user' | 'message';
    /** Scope đăng ký: global | guild | user. Mặc định ['global']. Khớp toggle register_commands ở core (§8). */
    scope?: Array<'global' | 'guild' | 'user'>;
  }>;
  events?: Array<{
    name: string;
    handler: string;
  }>;
  config?: {
    schema?: string;
    defaults?: string;
  };
  ipc?: {
    api_version?: number;
    rpc_schema?: string;
  };
  dependencies?: {
    npm?: string[];
    pip?: string[];
    system?: string[];
  };
  tests?: {
    command?: string;
    dir?: string;
  };
}

export type ModuleEntry = ModuleRegistryEntry;