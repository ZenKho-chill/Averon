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
import { ConfigError, deepMerge } from '../../../shared/config/index.js';
import { loadSchema, validateConfig } from '../../../shared/config/validator.js';
import type { Registry } from '../registry/index.js';
import type { ModuleRegistryEntry } from '../registry/types.js';
import type { ModuleManifest } from './types.js';
import type { ModuleEntryWithHooks } from '../lifecycle/types.js';
import type { CrashReporter } from '../crash/index.js';
import { resolveModuleFile, RUNNING_FROM_DIST } from './resolve.js';

export class ModuleLoader {
  constructor(
    private readonly registry: Registry,
    private readonly crashReporter: CrashReporter,
    /** Override config module từ config tổng: `{ ping: {...} }` (section modules.<name>). */
    private readonly moduleConfigOverrides: Record<string, unknown> = {},
    /** Project root (nơi có modules/ và dist/) — cần khi chạy bản build để map sang dist. */
    private readonly root: string = process.cwd(),
    /** true = chạy bản build (npm start) → import file đã biên dịch trong dist/. */
    private readonly runningFromDist: boolean = RUNNING_FROM_DIST,
  ) {}

  /** Load module từ thư mục module (vd: modules/ping/). */
  async loadModule(moduleDir: string): Promise<ModuleEntryWithHooks> {
    const manifestFile = join(moduleDir, 'module.yml');
    if (!existsSync(manifestFile)) {
      throw new ConfigError(`Không tìm thấy module.yml trong ${moduleDir}. EN: module.yml not found in ${moduleDir}`);
    }

    const manifest = this.parseManifest(manifestFile);
    const entry = this.resolveModuleFile(moduleDir, manifest.entry);
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
        const handlerPath = this.resolveModuleFile(moduleDir, cmd.handler);
        try {
          const h = await import(pathToFileURL(handlerPath).href);
          withHandler.handlerFn = h.handler;
        } catch (err) {
          this.crashReporter.handleModuleFailure(manifest.name, `handler import failed (${cmd.handler}): ${err}`);
        }
      }
      commands.push(withHandler);
    }

    // Nạp config module: defaults.yml (nếu khai báo) merge override từ config tổng
    const moduleConfig = this.loadModuleConfig(manifest, moduleDir);

    const moduleEntry: ModuleEntryWithHooks = {
      name: manifest.name,
      version: manifest.version,
      state: 'REGISTERED',
      entry,
      config: moduleConfig,
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

  /** Nạp config module: defaults.yml (khai báo trong manifest.config.defaults) merge override từ config tổng. */
  private loadModuleConfig(manifest: ModuleManifest, moduleDir: string): Record<string, unknown> | undefined {
    const defaultsFile = manifest.config?.defaults;
    let merged: Record<string, unknown> | undefined;

    if (defaultsFile) {
      const defaultsPath = join(moduleDir, defaultsFile);
      if (!existsSync(defaultsPath)) {
        this.crashReporter.handleModuleFailure(manifest.name, `config defaults not found: ${defaultsFile}`);
        return undefined;
      }
      try {
        merged = (YAML.parse(readFileSync(defaultsPath, 'utf8')) ?? {}) as Record<string, unknown>;
      } catch (err) {
        this.crashReporter.handleModuleFailure(manifest.name, `config defaults parse failed: ${err}`);
        return undefined;
      }
    }

    // Validate theo schema module (nếu khai báo) — fail-fast, lỗi → ConfigError
    const schemaFile = manifest.config?.schema;
    if (schemaFile && merged) {
      try {
        const schemaPath = join(moduleDir, schemaFile);
        if (existsSync(schemaPath)) {
          validateConfig(merged, loadSchema(schemaPath), [schemaFile]);
        }
      } catch (err) {
        throw new ConfigError(`Config module '${manifest.name}' không hợp lệ: ${(err as Error).message}`);
      }
    }

    // Override từ config tổng (config/config.yml → modules.<name>) — admin chỉnh
    const override = this.moduleConfigOverrides[manifest.name];
    if (override && typeof override === 'object') {
      merged = merged ? (deepMerge(merged, override as Record<string, unknown>) as Record<string, unknown>) : (override as Record<string, unknown>);
    }

    return merged;
  }

  /** Map đường dẫn module file → nơi thực sự import được (source .ts hoặc bản built .js trong dist/). */
  private resolveModuleFile(moduleDir: string, relative: string): string {
    return resolveModuleFile({ runningFromDist: this.runningFromDist, root: this.root, moduleDir, relative });
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