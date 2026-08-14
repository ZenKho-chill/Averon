/**
 * core/console/manager — ModuleManager: điều phối load/unload/reload module lúc runtime.
 * EN: core/console/manager — ModuleManager: coordinates runtime module load/unload/reload.
 *
 * Đây là "control plane" của core: phối hợp Loader (đọc module.yml từ đĩa), Lifecycle
 * (state + hooks), DiscordClient (gắn/gỡ command listener), UsageTracker (soft-stop chờ
 * in-flight handler). Bootstrap dùng `loadAll()` thay cho loop hardcode cũ.
 *
 * Soft-stop (`unload`/`reload` không --force): detach listener → DRAINING → đợi
 * UsageTracker.waitIdle → onUnload → UNLOADED. Timeout → giữ DRAINING, hướng dẫn --force.
 */
import { basename } from 'node:path';
import type { Logger } from '../../../shared/logger/index.js';
import type { Registry } from '../registry/index.js';
import type { UsageTracker } from '../registry/usage.js';
import type { Lifecycle } from '../lifecycle/index.js';
import type { ModuleEntryWithHooks } from '../lifecycle/types.js';
import type { ModuleLoader } from '../loader/index.js';
import { discoverModuleDirs, resolveModuleDir, readModuleNameVersion } from '../loader/discover.js';
import type { DiscordClient } from '../discord/index.js';
import type { CrashReporter } from '../crash/index.js';

export interface ModuleManagerDeps {
  registry: Registry;
  lifecycle: Lifecycle;
  loader: ModuleLoader;
  discord: DiscordClient;
  usage: UsageTracker;
  crashReporter: CrashReporter;
  root: string;
  logger: Logger;
  softStopTimeoutMs: number;
}

export type ModuleLoadResult = { ok: true; name: string } | { ok: false; error: string };
export type ModuleUnloadResult =
  | { ok: true; outcome: 'unloaded'; name: string }
  | { ok: true; outcome: 'draining'; name: string; message: string }
  | { ok: false; error: string };
export type ModuleReloadResult = { ok: true; name: string } | { ok: false; error: string };

export class ModuleManager {
  /** commandName → moduleName: guard trùng tên command giữa module (Discord cần tên global duy nhất). */
  private readonly attachedCommands = new Map<string, string>();

  constructor(private readonly deps: ModuleManagerDeps) {}

  /** Load toàn bộ module trên đĩa (bootstrap startup). Lỗi từng module không làm sập tiến trình. */
  async loadAll(): Promise<void> {
    for (const dir of discoverModuleDirs(this.deps.root)) {
      const name = basename(dir);
      try {
        await this.loadDir(dir);
      } catch (err) {
        this.deps.logger.error(`Module '${name}' load thất bại`, { error: err });
        this.deps.crashReporter.handleModuleFailure(name, `load failed: ${err}`);
      }
    }
  }

  /** Load module theo tên (từ đĩa). Trả kết quả thay vì throw để console render dễ. */
  async load(name: string): Promise<ModuleLoadResult> {
    const dir = resolveModuleDir(this.deps.root, name);
    if (!dir) return { ok: false, error: `module '${name}' not found on disk (modules/${name}/module.yml missing)` };
    try {
      await this.loadDir(dir);
      return { ok: true, name };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Unload module — soft (chờ in-flight) hoặc force (không đợi). */
  async unload(name: string, opts: { force?: boolean }): Promise<ModuleUnloadResult> {
    if (!this.deps.registry.hasModule(name)) return { ok: false, error: `unknown module '${name}' (not registered)` };

    const state = this.deps.registry.getModule(name).state;
    if (state === 'UNLOADED') return { ok: false, error: `module '${name}' already unloaded` };
    if (state === 'FAULTED') return { ok: false, error: `module '${name}' is FAULTED — try "averon modules reload ${name} --force"` };
    if (state === 'DRAINING' && !opts.force) return { ok: false, error: `module '${name}' is draining — wait or retry with --force` };

    // Dừng nhận command mới trước (soft-stop: không ai vào thêm nữa).
    this.detachModuleCommands(name);

    if (opts.force) {
      await this.deps.lifecycle.unloadModule(name, { force: true });
      this.deps.usage.reset(name);
      return { ok: true, outcome: 'unloaded', name };
    }

    this.deps.registry.setModuleState(name, 'DRAINING');
    const wait = await this.deps.usage.waitIdle(name, this.deps.softStopTimeoutMs);
    if (wait === 'timeout') {
      this.deps.logger.error(`Module '${name}' vẫn còn in-flight handler — giữ DRAINING`, {
        timeoutMs: this.deps.softStopTimeoutMs,
      });
      return { ok: true, outcome: 'draining', name, message: 'in-flight still busy — retry with --force' };
    }

    try {
      await this.deps.lifecycle.unloadModule(name);
    } catch (err) {
      this.deps.usage.reset(name);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    this.deps.usage.reset(name);
    return { ok: true, outcome: 'unloaded', name };
  }

  /** Reload module — soft unload (chờ idle) hoặc force, rồi LOAD LẠI FRESH TỪ ĐĨA (config + handler mới nhất). */
  async reload(name: string, opts: { force?: boolean }): Promise<ModuleReloadResult> {
    if (!this.deps.registry.hasModule(name)) return { ok: false, error: `module '${name}' not loaded — use "averon modules load ${name}"` };

    const state = this.deps.registry.getModule(name).state;
    if (state === 'UNLOADED') return { ok: false, error: `module '${name}' already unloaded — use load` };
    if (state === 'FAULTED' && !opts.force) return { ok: false, error: `module '${name}' is FAULTED — retry with --force` };
    if (state === 'DRAINING' && !opts.force) return { ok: false, error: `module '${name}' is draining — retry with --force` };

    // Dừng nhận command mới trước (soft-stop: không ai vào thêm nữa).
    this.detachModuleCommands(name);

    if (opts.force) {
      await this.deps.lifecycle.unloadModule(name, { force: true });
    } else {
      this.deps.registry.setModuleState(name, 'DRAINING');
      const wait = await this.deps.usage.waitIdle(name, this.deps.softStopTimeoutMs);
      if (wait === 'timeout') {
        this.deps.logger.error(`Module '${name}' vẫn còn in-flight handler — giữ DRAINING`, {
          timeoutMs: this.deps.softStopTimeoutMs,
        });
        return { ok: false, error: 'in-flight still busy — retry with --force' };
      }
      await this.deps.lifecycle.unloadModule(name);
    }

    this.deps.usage.reset(name);

    // Load lại FRESH từ đĩa — đọc lại defaults.yml (config) + handler mới nhất. Trước đây reload
    // tái dùng entry cũ trong registry → config đổi trên đĩa KHÔNG có hiệu lực sau reload.
    // EN: Reload fresh from disk — re-reads defaults.yml (config) + latest handlers. Previously
    // reload reused the stale registry entry, so config changes on disk never took effect.
    try {
      const dir = resolveModuleDir(this.deps.root, name);
      if (!dir) return { ok: false, error: `module '${name}' not found on disk (modules/${name}/module.yml missing)` };

      this.deps.registry.unregisterModule(name);
      const entry = await this.deps.loader.loadModule(dir);

      // Collision check trước khi load — nếu lỗi, gỡ khỏi registry để không để module half-registered.
      for (const cmd of entry.commands) {
        if (!cmd.handlerFn) continue;
        const owner = this.attachedCommands.get(cmd.name);
        if (owner && owner !== name) {
          this.deps.registry.unregisterModule(name);
          return { ok: false, error: `command /${cmd.name} already owned by module '${owner}'` };
        }
      }

      await this.deps.lifecycle.loadModule(entry);
      this.attachModuleCommands(entry);
      this.deps.registry.setModuleState(name, 'RUNNING');
      return { ok: true, name };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Gắn command của entry vào Discord + ghi vào collision map. */
  private attachModuleCommands(entry: ModuleEntryWithHooks): void {
    for (const cmd of entry.commands) {
      if (!cmd.handlerFn) continue;
      const owner = this.attachedCommands.get(cmd.name);
      if (owner && owner !== entry.name) {
        throw new Error(`command /${cmd.name} already owned by module '${owner}'`);
      }
      this.deps.discord.registerCommand(cmd.name, cmd.handlerFn, {
        config: entry.config ?? {},
        logger: this.deps.logger,
        moduleName: entry.name,
        registry: this.deps.registry,
      });
      this.attachedCommands.set(cmd.name, entry.name);
    }
  }

  /** Gỡ command của module khỏi Discord + collision map (chặn command mới khi unload/reload). */
  private detachModuleCommands(name: string): void {
    const entry = this.deps.registry.getModule(name);
    for (const cmd of entry.commands) {
      this.deps.discord.removeCommand(cmd.name);
      this.attachedCommands.delete(cmd.name);
    }
  }

  /** Load 1 dir module: đọc manifest → loader.loadModule → collision check → lifecycle → attach. */
  private async loadDir(dir: string): Promise<void> {
    const info = readModuleNameVersion(dir);
    if (!info) throw new Error(`cannot read module.yml in ${dir}`);
    const { name } = info;

    const existing = this.deps.registry.hasModule(name) ? this.deps.registry.getModule(name) : undefined;
    // Chỉ chặn khi module đang chạy/đang draining — UNLOADED thì được load lại (fix loop load↔reload).
    // EN: Only block when running/draining — UNLOADED modules may be loaded again (fixes the load↔reload loop).
    if (existing && existing.state !== 'UNLOADED') {
      throw new Error(`module '${name}' already registered (state=${existing.state}) — use "averon modules reload ${name}"`);
    }
    // Module từng load (UNLOADED) → gỡ entry cũ khỏi registry, load fresh lại từ đĩa.
    // EN: previously-loaded module (UNLOADED) → drop stale registry entry, re-load fresh from disk.
    if (existing) this.deps.registry.unregisterModule(name);

    const entry = await this.deps.loader.loadModule(dir);

    // Collision check trước khi load — nếu lỗi, gỡ khỏi registry để không để module half-registered.
    for (const cmd of entry.commands) {
      if (!cmd.handlerFn) continue;
      const owner = this.attachedCommands.get(cmd.name);
      if (owner && owner !== name) {
        this.deps.registry.unregisterModule(name);
        throw new Error(`command /${cmd.name} already owned by module '${owner}'`);
      }
    }

    await this.deps.lifecycle.loadModule(entry);
    this.attachModuleCommands(entry);
    this.deps.registry.setModuleState(name, 'RUNNING');
  }
}
