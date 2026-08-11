/**
 * core/loader — parse module.yml + import entry + attach commands/events (CLAUDE.md §4).
 * EN: core/loader — parse module.yml + import entry + attach commands/events.
 *
 * - Đọc module.yml, validate manifest bằng JSON Schema
 * - Import entry point (in-process) hoặc spawn subprocess (ngoại ngữ)
 * - Đăng ký commands/events vào Discord client
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { ConfigError } from '../../../shared/config/index.js';
import type { Registry } from '../registry/index.js';
import type { ModuleRegistryEntry } from '../registry/types.js';
import type { ModuleManifest } from './types.js';
import type { ModuleEntryWithHooks } from '../lifecycle/types.js';
import type { CrashReporter } from '../crash/index.js';

export class ModuleLoader {
  constructor(
    private readonly registry: Registry,
    private readonly crashReporter: CrashReporter,
  ) {}

  /** Load module từ thư mục module (vd: modules/ping/). */
  async loadModule(moduleDir: string): Promise<ModuleEntryWithHooks> {
    const manifestFile = join(moduleDir, 'module.yml');
    if (!existsSync(manifestFile)) {
      throw new ConfigError(`Không tìm thấy module.yml trong ${moduleDir}. EN: module.yml not found in ${moduleDir}`);
    }

    const manifest = this.parseManifest(manifestFile);
    const entry = join(moduleDir, manifest.entry);
    if (!existsSync(entry)) {
      throw new ConfigError(`Entry point không tồn tại: ${entry}. EN: Entry point not found: ${entry}`);
    }

    // Import entry (in-process cho JS/TS)
    interface ModuleExports { onLoad?: () => Promise<void> | void; onUnload?: () => Promise<void> | void; }
    let moduleExports: ModuleExports;
    try {
      moduleExports = await this.importEntry(entry, manifest.runtime.transport);
    } catch (err) {
      this.crashReporter.handleModuleFailure(manifest.name, `import failed: ${err}`);
      throw err;
    }

    // Import handler function của từng command (vd commands/ping.ts export `handler`)
    // để bootstrap gắn listener — metadata riêng không đủ để phản hồi interaction.
    const commands = [];
    for (const cmd of manifest.commands ?? []) {
      if (cmd.enabled === false) continue;
      const withHandler: ModuleRegistryEntry['commands'][number] = { ...cmd };
      if (cmd.handler) {
        const handlerPath = join(moduleDir, cmd.handler);
        try {
          const h = await import(pathToFileURL(handlerPath).href);
          withHandler.handlerFn = h.handler;
        } catch (err) {
          this.crashReporter.handleModuleFailure(manifest.name, `handler import failed (${cmd.handler}): ${err}`);
        }
      }
      commands.push(withHandler);
    }

    const moduleEntry: ModuleEntryWithHooks = {
      name: manifest.name,
      version: manifest.version,
      state: 'REGISTERED',
      entry,
      commands,
      events: manifest.events ?? [],
      runtime: {
        language: manifest.runtime.language,
        engine: manifest.runtime.engine,
        version: manifest.runtime.version,
        transport: manifest.runtime.transport,
      },
      ipc: manifest.ipc ? { api_version: manifest.ipc.api_version ?? 1, rpc_schema: manifest.ipc.rpc_schema } : undefined,
      onLoad: moduleExports.onLoad,
      onUnload: moduleExports.onUnload,
    };

    this.registry.registerModule(moduleEntry);
    return moduleEntry;
  }

  private parseManifest(file: string): ModuleManifest {
    const raw = readFileSync(file, 'utf8');
    const manifest = YAML.parse(raw) as ModuleManifest;
    if (!manifest.name || !manifest.version || !manifest.runtime || !manifest.entry) {
      throw new ConfigError(`Manifest không hợp lệ: thiếu name/version/runtime/entry. EN: Invalid manifest: missing name/version/runtime/entry`);
    }
    return manifest;
  }

  private async importEntry(entry: string, transport: ModuleManifest['runtime']['transport']): Promise<{
    onLoad?: () => Promise<void> | void;
    onUnload?: () => Promise<void> | void;
  }> {
    if (transport !== 'in-process') {
      throw new Error(`Transport '${transport}' chưa được hỗ trợ. EN: Transport '${transport}' not supported yet`);
    }
    if (!existsSync(entry)) {
      throw new ConfigError(`Entry point không tồn tại: ${entry}. EN: Entry point not found: ${entry}`);
    }
    // Import ESM (JS/TS) — pathToFileURL để xử lý space/backslash trên Windows
    const moduleExports = await import(pathToFileURL(entry).href);
    return {
      onLoad: moduleExports.onLoad,
      onUnload: moduleExports.onUnload,
    };
  }
}

export * from './types.js';