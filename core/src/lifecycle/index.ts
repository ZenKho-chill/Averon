/**
 * core/lifecycle — pipeline load/unload module (CLAUDE.md §2.2).
 * EN: core/lifecycle — module load/unload pipeline.
 *
 * Quản lý trạng thái module: REGISTERED → LOADING → LOADED → RUNNING → UNLOADED.
 * Gọi hook onLoad/onUnload, cập nhật registry.
 */
import type { Registry } from '../registry/index.js';
import type { ModuleEntryWithHooks } from './types.js';
import type { CrashReporter } from '../crash/index.js';

export class Lifecycle {
  constructor(
    private readonly registry: Registry,
    private readonly crashReporter: CrashReporter,
  ) {}

  /** Load module: gọi hook onLoad, cập nhật trạng thái. */
  async loadModule(module: ModuleEntryWithHooks): Promise<void> {
    const name = module.name;
    this.registry.setModuleState(name, 'LOADING');

    try {
      if (module.onLoad) await module.onLoad(this.registry);
      this.registry.setModuleState(name, 'LOADED');
    } catch (err) {
      this.registry.setModuleState(name, 'FAULTED');
      const quarantined = this.crashReporter.handleModuleFailure(name, `onLoad failed: ${err}`);
      throw new Error(`Module '${name}' load thất bại${quarantined ? ' (quarantined)' : ''}: ${err}`, { cause: err });
    }
  }

  /**
   * Unload module: gọi hook onUnload, cập nhật trạng thái.
   * - soft (mặc định): DRAINING → onUnload → UNLOADED; lỗi onUnload → FAULTED + throw.
   * - force: UNLOADED ngay, onUnload nuốt lỗi (log + crash report), không chờ in-flight.
   */
  async unloadModule(name: string, opts?: { force?: boolean }): Promise<void> {
    const module = this.registry.getModule(name) as ModuleEntryWithHooks;

    if (opts?.force) {
      this.registry.setModuleState(name, 'UNLOADED');
      if (module.onUnload) {
        try {
          await module.onUnload();
        } catch (err) {
          this.crashReporter.handleModuleFailure(name, `onUnload failed: ${err}`);
        }
      }
      return;
    }

    this.registry.setModuleState(name, 'DRAINING');
    try {
      if (module.onUnload) await module.onUnload();
      this.registry.setModuleState(name, 'UNLOADED');
    } catch (err) {
      this.registry.setModuleState(name, 'FAULTED');
      this.crashReporter.handleModuleFailure(name, `onUnload failed: ${err}`);
      throw new Error(`Module '${name}' unload thất bại: ${err}`, { cause: err });
    }
  }

  /** Reload module: unload → load lại (tái dùng entry trong registry, không re-import code). */
  async reloadModule(name: string, opts?: { force?: boolean }): Promise<void> {
    await this.unloadModule(name, opts);
    const module = this.registry.getModule(name) as ModuleEntryWithHooks;
    if (module.state !== 'UNLOADED') {
      throw new Error(`Module '${name}' không ở trạng thái UNLOADED sau unload`);
    }
    await this.loadModule(module);
  }
}

export * from './types.js';