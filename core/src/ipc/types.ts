/**
 * Types cho core/ipc — giao tiếp đa ngôn ngữ (CLAUDE.md §2.3).
 * EN: Types for core/ipc — multi-language communication.
 */
import type { ModuleRegistryEntry } from '../registry/types.js';

export interface IpcTransport {
  /** Gọi hàm từ module ngoại ngữ. */
  call(module: ModuleRegistryEntry, method: string, args: unknown[]): Promise<unknown>;
  /** Đóng kết nối (dùng khi unload module). */
  close(): Promise<void>;
}

export type TransportType = 'in-process' | 'subprocess' | 'socket' | 'ffi';

export interface IpcOptions {
  transport: TransportType;
  /** Đường dẫn tới entry point (dùng cho subprocess/socket). */
  entry: string;
  /** Schema RPC (dùng cho subprocess/socket). */
  rpcSchema?: string;
  /** API version (dùng cho tương thích). */
  apiVersion?: number;
}