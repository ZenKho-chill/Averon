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
      if (module.onLoad) await module.onLoad();
      this.registry.setModuleState(name, 'LOADED');
    } catch (err) {
      this.registry.setModuleState(name, 'FAULTED');
      const quarantined = this.crashReporter.handleModuleFailure(name, `onLoad failed: ${err}`);
      throw new Error(`Module '${name}' load thất bại${quarantined ? ' (quarantined)' : ''}: ${err}`, { cause: err });
    }
  }

  /** Unload module: gọi hook onUnload, cập nhật trạng thái. */
  async unloadModule(name: string): Promise<void> {
    const module = this.registry.getModule(name) as ModuleEntryWithHooks;
    this.registry.setModuleState(name, 'UNLOADED');

    try {
      if (module.onUnload) await module.onUnload();
    } catch (err) {
      this.registry.setModuleState(name, 'FAULTED');
      this.crashReporter.handleModuleFailure(name, `onUnload failed: ${err}`);
      throw new Error(`Module '${name}' unload thất bại: ${err}`, { cause: err });
    }
  }

  /** Reload module: unload → load lại. */
  async reloadModule(name: string): Promise<void> {
    await this.unloadModule(name);
    const module = this.registry.getModule(name) as ModuleEntryWithHooks;
    if (module.state !== 'UNLOADED') {
      throw new Error(`Module '${name}' không ở trạng thái UNLOADED sau unload`);
    }
    await this.loadModule(module);
  }
}

export * from './types.js';