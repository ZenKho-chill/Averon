/**
 * core/bootstrap — entry point gọi pipeline khởi động (CLAUDE.md §9.1).
 * EN: core/bootstrap — entry point that runs the boot pipeline.
 *
 * Pipeline: config.load → logger.init → anti-crash handlers → module loader → discord.login → watchdog.start
 */
import { loadCoreConfig } from './config/index.js';
import { createLogger } from '../../shared/logger/index.js';
import { Registry } from './registry/index.js';
import { CrashReporter } from './crash/index.js';
import { ModuleLoader } from './loader/index.js';
import { Lifecycle } from './lifecycle/index.js';
import { DiscordClient } from './discord/index.js';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function bootstrap() {
  // 1. Load config
  const config = await loadCoreConfig();

  // 2. Khởi tạo logger
  const logger = createLogger({
    level: config.logging.level,
    color: config.logging.console_color,
    file: config.logging.file.enabled ? {
      dir: config.logging.file.dir,
      maxSizeMB: config.logging.file.max_size_mb,
      keepFiles: config.logging.file.keep_files,
    } : null,
  });
  logger.info('Averon booting', { version: config.app.version, register_commands: config.discord.register_commands });

  // 3. Đăng ký anti-crash handlers
  const registry = new Registry();
  const crashReporter = new CrashReporter({
    logger,
    getModuleStates: () => registry.getAllModules(),
    crashDir: 'crash-reports',
    appVersion: config.app.version,
    maxFailures: config.crash.max_failures,
    windowMs: config.crash.fail_window_ms,
  });
  crashReporter.install();

  // 4. Đăng ký service (DI)
  registry.registerService('logger', logger);
  registry.registerService('config', config);

  // 5. Load modules
  const loader = new ModuleLoader(registry, crashReporter);
  const lifecycle = new Lifecycle(registry, crashReporter);

  // Quét thư mục modules/ và load từng module
  const moduleDirs = [join(root, 'modules', 'ping')]; // TODO: dùng glob('modules/*')
  for (const moduleDir of moduleDirs) {
    try {
      const moduleEntry = await loader.loadModule(moduleDir);
      await lifecycle.loadModule(moduleEntry);
      logger.info(`Module '${moduleEntry.name}' đã load thành công`, { state: moduleEntry.state });
    } catch (err) {
      logger.error(`Load module thất bại tại ${moduleDir}`, { error: err });
      crashReporter.handleModuleFailure(moduleDir.split(/[\\/]/).pop()!, `load failed: ${err}`);
    }
  }

  // 6. Khởi tạo Discord client
  const discord = new DiscordClient(config, logger);

  // 6.1 Attach commands/events từ registry (listener xử lý — luôn gắn)
  const commands: Array<{ name: string; description?: { vi?: string; en?: string } | string }> = [];
  for (const module of registry.getAllModules()) {
    for (const cmd of module.commands) {
      commands.push(cmd);
      // TODO: nạp handler từ cmd.handler để gắn (status hiện tại chỉ giữ metadata)
    }
    // TODO: module.events — nạp handler từ evt.handler để gắn listener
  }

  await discord.login();

  // 6.2 Sync slash command lên Discord qua REST — chỉ khi register_commands=true
  await discord.syncCommands(commands);

  // 7. Khởi động watchdog
  if (config.crash.watchdog.enabled) {
    // TODO: gọi scripts/watchdog.mjs
    logger.info('Watchdog enabled', { maxRestarts: config.crash.watchdog.max_restarts });
  }

  logger.info('Averon đã sẵn sàng');
  return { config, logger, registry, discord, crashReporter };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Gọi bootstrap khi chạy trực tiếp
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrap().catch((err) => {
    console.error('Boot thất bại:', err);
    process.exit(1);
  });
}