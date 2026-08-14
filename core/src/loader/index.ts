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
import { loadSchema, validateConfig } from '../../../shared/config/validator.js';
import { loadLatestBackupContent } from '../../../shared/config/backup.js';
import { validateModuleSemantics } from '../../../shared/config/module-semantic.js';
import type { Registry } from '../registry/index.js';
import type { ModuleRegistryEntry } from '../registry/types.js';
import type { ModuleManifest } from './types.js';
import type { ModuleEntryWithHooks } from '../lifecycle/types.js';
import type { CrashReporter } from '../crash/index.js';
import { resolveModuleFile, RUNNING_FROM_DIST } from './resolve.js';

/** Import ESM có cache-buster (`?v=<time>-<seq>`) — Node cache `import()` theo URL, không bust thì
 *  lần load lại (reload module) nạp lại module CŨ đã cache → thay đổi code handler/entry không có hiệu lực.
 *  EN: ESM import with a cache-buster query — Node caches `import()` by URL; without busting, a module
 *  reload re-imports the SAME cached module (old code), so handler/entry code changes never take effect. */
let importBustSeq = 0;
function importModuleFresh(url: string): Promise<unknown> {
  const separator = url.includes('?') ? '&' : '?';
  return import(`${url}${separator}v=${Date.now()}-${importBustSeq++}`) as Promise<unknown>;
}

export class ModuleLoader {
  constructor(
    private readonly registry: Registry,
    private readonly crashReporter: CrashReporter,
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
      this.crashReporter.handleModuleFailure(manifest.name, `import failed: ${err instanceof Error ? err.stack : String(err)}`);
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
          // importModuleFresh: bust cache → reload nạp lại CODE mới nhất của handler (hot-reload code).
          const h = (await importModuleFresh(pathToFileURL(handlerPath).href)) as { handler?: NonNullable<ModuleRegistryEntry['commands'][number]['handlerFn']> };
          withHandler.handlerFn = h.handler;
        } catch (err) {
          this.crashReporter.handleModuleFailure(manifest.name, `handler import failed (${cmd.handler}): ${err instanceof Error ? err.stack : String(err)}`);
        }
      }
      commands.push(withHandler);
    }

    // Nạp config module từ defaults.yml của module (khai báo trong manifest.config.defaults)
    const moduleConfig = this.loadModuleConfig(manifest, moduleDir);

    // Cache config đã merge để tránh merge lại mỗi lần load (fix reload chậm + race condition config cũ/mới)
    const moduleEntry: ModuleEntryWithHooks = {
      name: manifest.name,
      version: manifest.version,
      state: 'REGISTERED',
      entry,
      // CHÚ Ý: dùng moduleConfig.config (merged config THẬT) — KHÔNG được gán cả wrapper
      // { content, config } từ loadModuleConfig, nếu không handler chỉ thấy `{content, config}`
      // → cfg.responses undefined → luôn reply fallback (bug "ping luôn plain").
      // EN: use moduleConfig.config (the REAL merged config) — NOT the { content, config } wrapper,
      // otherwise handlers see `{content, config}`, cfg.responses is undefined, and they always
      // reply the fallback (the "ping always plain" bug).
      config: moduleConfig.config,
      // Cache config đã merge trong entry để handler có thể lấy config mới nhất qua registry
      getConfig: () => moduleConfig.config ?? {},
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

  /** Nạp config module: defaults.yml (khai báo trong manifest.config.defaults) → validate → trả về.
   * Trả về cả nội dung YAML đã merge (dùng cho backup) và config object.
   */
  private loadModuleConfig(manifest: ModuleManifest, moduleDir: string): {
    content: string;
    config: Record<string, unknown>;
  } {
    const defaultsFile = manifest.config?.defaults;
    let merged: Record<string, unknown> = {};

    if (defaultsFile) {
      const defaultsPath = join(moduleDir, defaultsFile);
      if (existsSync(defaultsPath)) {
        try {
          merged = (YAML.parse(readFileSync(defaultsPath, 'utf8')) ?? {}) as Record<string, unknown>;
        } catch (err) {
          this.crashReporter.handleModuleFailure(manifest.name, `config defaults parse failed: ${err}`);
        }
      } else {
        this.crashReporter.handleModuleFailure(manifest.name, `config defaults not found: ${defaultsFile}`);
      }
    }

    // Validate theo schema module (nếu khai báo VÀ có defaults load được) — fail-fast, lỗi → ConfigError
    const schemaFile = manifest.config?.schema;
    if (schemaFile && Object.keys(merged).length > 0) {
      try {
        const schemaPath = join(moduleDir, schemaFile);
        if (existsSync(schemaPath)) {
          validateConfig(merged, loadSchema(schemaPath), [schemaFile]);
          validateModuleSemantics(merged, manifest, manifest.name);
        }
      } catch (err) {
        this.crashReporter.handleModuleFailure(manifest.name, `Config không hợp lệ: ${(err as Error).message}`);
        // KHÔNG ghi đè defaults.yml bằng backup — chỉ DÙNG nội dung backup mới nhất (validate lại trước).
        // EN: don't overwrite defaults.yml with the backup — just LOAD the newest backup (re-validated first).
        const logger = this.registry.getService('logger');
        const backupContent = loadLatestBackupContent(moduleDir, { type: 'module', name: manifest.name });
        if (backupContent === null) {
          throw new ConfigError(`Config module '${manifest.name}' không hợp lệ: ${(err as Error).message}`);
        }
        try {
          const backupParsed = (YAML.parse(backupContent) ?? {}) as Record<string, unknown>;
          if (schemaFile && Object.keys(backupParsed).length > 0) {
            const schemaPath = join(moduleDir, schemaFile);
            if (existsSync(schemaPath)) {
              validateConfig(backupParsed, loadSchema(schemaPath), [schemaFile]);
              validateModuleSemantics(backupParsed, manifest, manifest.name);
            }
          }
          merged = backupParsed;
          logger.warn(`Module '${manifest.name}' đang dùng config từ bản backup gần nhất (defaults.yml vẫn lỗi). Sửa defaults.yml rồi reload.`);
        } catch (backupErr) {
          throw new ConfigError(`Config module '${manifest.name}' không hợp lệ (cả bản backup): ${(backupErr as Error).message}`);
        }
      }
    }

    const content = YAML.stringify(merged);
    return { content, config: merged };
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
    // importModuleFresh: bust cache → reload nạp lại CODE entry mới nhất (hot-reload code).
    const moduleExports = (await importModuleFresh(pathToFileURL(entry).href)) as {
      onLoad?: () => Promise<void> | void;
      onUnload?: () => Promise<void> | void;
    };
    return {
      onLoad: moduleExports.onLoad,
      onUnload: moduleExports.onUnload,
    };
  }
}

export * from './types.js';