/**
 * core/registry — service registry (DI) + module registry (CLAUDE.md §2.1).
 * EN: core/registry — service registry (DI) + module registry.
 *
 * - Service registry: nơi core expose logger, config, db... cho module
 * - Module registry: nơi loader đăng ký module (module.yml → entry point)
 */
import type { CoreServices, ModuleRegistryEntry, ModuleState, ServiceKey } from './types.js';

export class Registry {
  private readonly services: Partial<CoreServices> = {};
  private readonly modules = new Map<string, ModuleRegistryEntry>();

  /** Đăng ký service (DI). */
  registerService<K extends ServiceKey>(key: K, service: CoreServices[K]): void {
    this.services[key] = service;
  }

  /** Lấy service (DI). */
  getService<K extends ServiceKey>(key: K): CoreServices[K] {
    const service = this.services[key];
    if (!service) {
      throw new Error(`Service '${key}' chưa được đăng ký. EN: Service '${key}' not registered.`);
    }
    return service;
  }

  /** Kiểm tra service có sẵn không. */
  hasService<K extends ServiceKey>(key: K): boolean {
    return this.services[key] !== undefined;
  }

  /** Đăng ký module (gọi từ loader). */
  registerModule(module: ModuleRegistryEntry): void {
    if (this.modules.has(module.name)) {
      throw new Error(`Module '${module.name}' đã được đăng ký. EN: Module '${module.name}' already registered.`);
    }
    this.modules.set(module.name, { ...module, state: 'REGISTERED' });
  }

  /** Cập nhật trạng thái module. */
  setModuleState(name: string, state: ModuleState): void {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`Module '${name}' không tồn tại. EN: Module '${name}' not found.`);
    }
    module.state = state;
  }

  /** Lấy module theo tên. */
  getModule(name: string): ModuleRegistryEntry {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`Module '${name}' không tồn tại. EN: Module '${name}' not found.`);
    }
    return module;
  }

  /** Lấy tất cả module (dùng cho crash report). */
  getAllModules(): ModuleRegistryEntry[] {
    return Array.from(this.modules.values());
  }

  /** Kiểm tra module có tồn tại không. */
  hasModule(name: string): boolean {
    return this.modules.has(name);
  }
}

export * from './types.js';
