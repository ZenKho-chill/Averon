/**
 * core/ipc — lớp giao tiếp đa ngôn ngữ (CLAUDE.md §2.3).
 * EN: core/ipc — multi-language communication layer.
 *
 * Hỗ trợ 4 transport:
 * - in-process: gọi trực tiếp (JS/TS)
 * - subprocess: JSON-RPC qua stdio (Python, Node subprocess)
 * - socket: TCP/Unix socket (module chạy lâu)
 * - ffi: binding trực tiếp (C/C++/Rust)
 */
import { fork } from 'node:child_process';
import { join } from 'node:path';
import type { ModuleRegistryEntry } from '../registry/types.js';
import type { IpcTransport, IpcOptions } from './types.js';
import type { Logger } from '../../../shared/logger/index.js';

export class IpcFactory {
  constructor(private readonly logger: Logger) {}

  /** Tạo transport theo loại. */
  createTransport(options: IpcOptions): IpcTransport {
    switch (options.transport) {
      case 'in-process':
        return new InProcessTransport();
      case 'subprocess':
        return new SubprocessTransport(options, this.logger);
      case 'socket':
        throw new Error('Socket transport chưa được hỗ trợ. EN: Socket transport not supported yet');
      case 'ffi':
        throw new Error('FFI transport chưa được hỗ trợ. EN: FFI transport not supported yet');
      default:
        throw new Error(`Transport không hợp lệ: ${options.transport}. EN: Invalid transport: ${options.transport}`);
    }
  }
}

/** Transport in-process: gọi trực tiếp (JS/TS). */
class InProcessTransport implements IpcTransport {
  async call(module: ModuleRegistryEntry, method: string, args: unknown[]): Promise<unknown> {
    const moduleExports = await import(module.entry);
    const fn = moduleExports[method];
    if (typeof fn !== 'function') {
      throw new Error(`Method '${method}' không tồn tại trong module '${module.name}'. EN: Method '${method}' not found in module '${module.name}'`);
    }
    return fn(...args);
  }

  async close(): Promise<void> {
    // Không cần làm gì — in-process không có kết nối.
  }
}

/** Transport subprocess: JSON-RPC qua stdio. */
class SubprocessTransport implements IpcTransport {
  private child?: ReturnType<typeof fork>;

  constructor(
    private readonly options: IpcOptions,
    private readonly logger: Logger,
  ) {}

  async call(module: ModuleRegistryEntry, method: string, args: unknown[]): Promise<unknown> {
    if (!this.child) {
      this.child = fork(join(module.entry, '..', '..', this.options.entry), [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        cwd: join(module.entry, '..', '..'),
      });
      this.child.on('error', (err) => {
        this.logger.error(`Subprocess cho module '${module.name}' thất bại`, { error: err });
      });
    }

    return new Promise((resolve, reject) => {
      if (!this.child) {
        reject(new Error('Subprocess chưa được khởi tạo. EN: Subprocess not initialized'));
        return;
      }
      this.child.send({ jsonrpc: '2.0', method, params: args, id: Date.now() });
      const handler = (response: unknown) => {
        if (typeof response === 'object' && response && 'result' in response) {
          resolve(response.result);
        } else if (typeof response === 'object' && response && 'error' in response) {
          reject(new Error(response.error as string));
        }
      };
      this.child.once('message', handler);
    });
  }

  async close(): Promise<void> {
    if (this.child) {
      this.child.kill();
      this.child = undefined;
    }
  }
}

export * from './types.js';