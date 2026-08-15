/**
 * core/bootstrap — entry point gọi pipeline khởi động (CLAUDE.md §9.1).
 * EN: core/bootstrap — entry point that runs the boot pipeline.
 *
 * Pipeline: config.load → logger.init → anti-crash handlers → module loader → discord.login → watchdog.start
 */
import { loadCoreConfig, getConsoleConfig } from './config/index.js';
import { backupConfig, loadLatestBackupContent } from '../../shared/config/backup.js';
import { findProjectRoot } from '../../shared/config/index.js';
import { createLogger } from '../../shared/logger/index.js';
import { Registry } from './registry/index.js';
import { UsageTracker } from './registry/usage.js';
import { CrashReporter } from './crash/index.js';
import { ModuleLoader } from './loader/index.js';
import { collectDeclaredIntents } from './loader/discover.js';
import { CORE_INTENTS } from './discord/intents.js';
import { Lifecycle } from './lifecycle/index.js';
import { DiscordClient } from './discord/index.js';
import { ModuleManager } from './console/manager.js';
import { OperatorConsole } from './console/index.js';
import { ProtectedOutput } from './console/protected-output.js';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';

export async function bootstrap() {
  // 1. Khởi tạo logger tạm thời để dùng trong catch
  const tempLogger = createLogger({
    level: 'INFO', // Mặc định INFO cho logger tạm
    color: false,
    file: null,
  });

  // 2. Load config — config hợp lệ (schema + semantic) = bản ổn định
  let config;
  let configLoadedFromBackup = false; // true = config.yml đang LỖI, đang chạy bằng bản backup
  try {
    config = await loadCoreConfig();
  } catch (err) {
    tempLogger.error(`Config tổng không hợp lệ: ${(err as Error).message}`);
    // KHÔNG ghi đè config.yml bằng backup — chỉ DÙNG nội dung backup mới nhất cho lần boot này,
    // để user thấy config.yml còn lỗi và sửa. EN: don't overwrite config.yml with the backup —
    // just LOAD the newest backup for this boot, so the user still sees the broken file and fixes it.
    tempLogger.warn('Đang dùng config từ bản backup mới nhất (config.yml không bị ghi đè)...');
    const backupContent = loadLatestBackupContent(join(root, 'config'), { type: 'core' });
    if (backupContent !== null) {
      config = await loadCoreConfig(undefined, undefined, true, backupContent);
      configLoadedFromBackup = true;
      tempLogger.error('Config đang chạy từ bản backup (config.yml vẫn lỗi). Sửa config/config.yml rồi restart để dùng config thật.');
    } else {
      tempLogger.error('Không có bản backup nào để dùng. Sửa config/config.yml hoặc chạy `npm run restore:config`.');
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

  // 2.1 Backup bản config ổn định cuối cùng — dễ rollback (§6.4).
  // Chỉ backup khi config.yml THẬT hợp lệ (không phải đang dùng bản backup) — config lỗi KHÔNG được
  // ghi vào backup, tránh "backup lỗi" thành bản mới nhất. EN: back up only when the real config.yml
  // is valid (not when running from a backup) — a broken config must never become the newest backup.
  if (configLoadedFromBackup) {
    logger.warn('Bỏ qua backup config tổng — config.yml đang lỗi (bản backup cũ vẫn giữ, không ghi đè).');
  } else {
    const backupPath = backupConfig(join(root, 'config'), { type: 'core' });
    if (backupPath) {
      logger.info(`Backup config tổng → ${backupPath.replaceAll('\\', '/')}`);
    }
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

  // In-flight handler counter (soft-stop) + Discord client — cần trước khi attach command.
  // Intents gộp từ CORE_INTENTS + toàn bộ intents module khai báo trên đĩa — discord.js không
  // cho thêm intent sau khi login nên phải gom TRƯỚC khi tạo client (§4).
  // EN: Intents = CORE_INTENTS + all intents declared by modules on disk — discord.js cannot
  // add intents after login, so they are collected BEFORE creating the client (§4).
  const usage = new UsageTracker();
  const clientIntents = [...new Set([...CORE_INTENTS, ...collectDeclaredIntents(root)])];
  const discord = new DiscordClient(config, logger, usage, clientIntents);
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

  // Đăng ký toàn bộ service cho module (webui, ...) — TRƯỚC loadAll để module có thể
  // truy cập qua `registry.getService(key)` khi chạy hook onLoad (§13.3).
  // EN: Register the full service set for modules — BEFORE loadAll so modules can reach
  // them via `registry.getService(key)` inside their onLoad hook (§13.3).
  registry.registerService('manager', manager);
  registry.registerService('discord', discord);
  registry.registerService('usage', usage);
  registry.registerService('registry', registry);
  registry.registerService('root', root);
  await manager.loadAll();

  // Backup config cho từng module — chỉ backup config ĐÃ VALIDATE (đang dùng), KHÔNG backup
  // defaults.yml thô khi nó đang lỗi (mô-đun chạy từ bản backup → nội dung trùng backup → tự bỏ qua).
  // EN: back up each module's VALIDATED config (the one in use) — never the raw broken defaults.yml
  // (running from a backup → content matches the existing backup → dedup skips it anyway).
  for (const module of registry.getAllModules()) {
    const moduleDir = join(root, 'modules', module.name);
    if (!module.config || Object.keys(module.config).length === 0) continue;
    const backupPath = backupConfig(moduleDir, {
      type: 'module',
      name: module.name,
      content: YAML.stringify(module.config),
    });
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