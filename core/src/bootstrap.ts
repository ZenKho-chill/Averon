/**
 * core/bootstrap — entry point gọi pipeline khởi động (CLAUDE.md §9.1).
 * EN: core/bootstrap — entry point that runs the boot pipeline.
 *
 * Pipeline: config.load → logger.init → anti-crash handlers → module loader → discord.login → watchdog.start
 */
import { loadCoreConfig, getConsoleConfig } from './config/index.js';
import { backupConfig, restoreLatestValidConfig } from '../../shared/config/backup.js';
import { findProjectRoot } from '../../shared/config/index.js';
import { createLogger } from '../../shared/logger/index.js';
import { Registry } from './registry/index.js';
import { UsageTracker } from './registry/usage.js';
import { CrashReporter } from './crash/index.js';
import { ModuleLoader } from './loader/index.js';
import { Lifecycle } from './lifecycle/index.js';
import { DiscordClient } from './discord/index.js';
import { ModuleManager } from './console/manager.js';
import { OperatorConsole } from './console/index.js';
import { ProtectedOutput } from './console/protected-output.js';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function bootstrap() {
  // 1. Khởi tạo logger tạm thời để dùng trong catch
  const tempLogger = createLogger({
    level: 'INFO', // Mặc định INFO cho logger tạm
    color: false,
    file: null,
  });

  // 2. Load config — config hợp lệ (schema + semantic) = bản ổn định
  let config;
  try {
    config = await loadCoreConfig();
  } catch (err) {
    tempLogger.error(`Config tổng không hợp lệ: ${(err as Error).message}`);
    tempLogger.warn('Đang cố gắng khôi phục từ bản backup mới nhất...');
    const restored = restoreLatestValidConfig(join(root, 'config'), { type: 'core', logger: tempLogger });
    if (restored) {
      config = await loadCoreConfig(); // Thử load lại sau khi khôi phục
      tempLogger.info('Config đã được khôi phục thành công, tiếp tục khởi động...');
    } else {
      tempLogger.error('Không thể khôi phục config từ backup. Vui lòng kiểm tra lại config.yml hoặc khôi phục thủ công.');
      process.exit(1);
    }
  }

  // 3. Khởi tạo logger chính thức với config từ file.
  // Log ghi qua ProtectedOutput: khi console TTY hiện prompt, dòng log không còn chèn vào chỗ nhập CLI.
  // EN: Logs route through ProtectedOutput so they never corrupt the REPL input line in TTY mode.
  const protectedOutput = new ProtectedOutput(process.stdout, config.logging.console_color);
  const logger = createLogger({
    level: config.logging.level,
    write: (line) => protectedOutput.writeLog(line),
    file: config.logging.file.enabled ? {
      dir: config.logging.file.dir,
      maxSizeMB: config.logging.file.max_size_mb,
      keepFiles: config.logging.file.keep_files,
    } : null,
  });
  logger.info('Averon booting', { version: config.app.version, register_commands: config.discord.register_commands });

  // 2.1 Backup bản config ổn định cuối cùng — dễ rollback (§6.4)
  const backupPath = backupConfig(join(root, 'config'), { type: 'core' });
  if (backupPath) {
    logger.info(`Backup config tổng → ${backupPath.replaceAll('\\', '/')}`);
  }

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
  const loader = new ModuleLoader(registry, crashReporter, root);
  const lifecycle = new Lifecycle(registry, crashReporter);

  // In-flight handler counter (soft-stop) + Discord client — cần trước khi attach command
  const usage = new UsageTracker();
  const discord = new DiscordClient(config, logger, usage);
  await discord.login(); // Đợi login + ready trước khi load module (fix latency -1ms)

  // ModuleManager: load toàn bộ module trên đĩa (discover modules/*) + gắn command listener
  const manager = new ModuleManager({
    registry,
    lifecycle,
    loader,
    discord,
    usage,
    crashReporter,
    root,
    logger,
    softStopTimeoutMs: getConsoleConfig(config).soft_stop_timeout_ms,
  });
  await manager.loadAll();

  // Backup config cho từng module
  for (const module of registry.getAllModules()) {
    const moduleDir = join(root, 'modules', module.name);
    const backupPath = backupConfig(moduleDir, { type: 'module', name: module.name });
    if (backupPath) {
      logger.info(`Backup config module '${module.name}' → ${backupPath.replaceAll('\\', '/')}`);
    }
  }

  // 6. Sync command lên Discord — metadata từ registry (handler đã được Manager gắn)
  const commands: Array<{ name: string; description?: { vi?: string; en?: string } | string; type?: 'chat_input' | 'user' | 'message'; scope?: Array<'global' | 'guild' | 'user'> }> = [];
  for (const module of registry.getAllModules()) {
    for (const cmd of module.commands) {
      commands.push(cmd); // dùng cho syncCommands (REST register metadata)
    }
    // TODO: module.events — nạp handler từ evt.handler để gắn listener
  }

  // 6.2 Sync command lên Discord qua REST — theo 3 scope (global/guild/user) trong register_commands
  await discord.syncCommands(commands);

  // 7. Khởi động watchdog
  if (config.crash.watchdog.enabled) {
    // TODO: gọi scripts/watchdog.mjs
    logger.info('Watchdog enabled', { maxRestarts: config.crash.watchdog.max_restarts });
  }

  logger.info('Averon đã sẵn sàng');

  // 7. Operator console — stdin REPL (status / modules management)
  const consoleConfig = getConsoleConfig(config);
  const operatorConsole = new OperatorConsole({
    config,
    logger,
    manager,
    discord,
    registry,
    usage,
    root,
    bootTimestamp: Date.now(),
    protectedOutput,
    // Prompt lấy từ config (`console.prompt`) — không hardcode; default `averon` chỉ là fallback.
    // EN: prompt comes from config (`console.prompt`) — not hardcoded; `averon` is only the fallback.
    prompt: consoleConfig.prompt,
  });
  if (consoleConfig.enabled) {
    operatorConsole.start();
    logger.info('Operator console đã sẵn sàng');
  }

  return { config, logger, registry, discord, crashReporter, lifecycle, usage, manager, console: operatorConsole };
}

// Project root — dùng findProjectRoot để chạy đúng cả từ src (tsx/tsx watch) lẫn dist (npm start).
// EN: Project root — resolved via findProjectRoot so it works from both src (tsx) and dist (npm start).
const root = findProjectRoot(dirname(fileURLToPath(import.meta.url)));

// Gọi bootstrap khi chạy trực tiếp
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrap().catch((err) => {
    console.error('Boot thất bại:', err);
    process.exit(1);
  });
}