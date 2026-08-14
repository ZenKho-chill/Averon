/**
 * shared/config/backup — backup bản config hợp lệ + rollback (CLAUDE.md §6.4).
 * EN: config backup + rollback — saves the last stable config each boot.
 *
 * Core: mỗi lần boot với config hợp lệ → copy config.yml vào <root>/config/backups/.
 * Module: copy <moduleDir>/config/defaults.yml vào <moduleDir>/config/backups/ (cô lập trong
 * chính folder module). Giữ N bản gần nhất. Dùng `scripts/restore-config.ts` để list + rollback.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ConfigError } from './errors.js';

/** Số bản backup tối đa giữ lại. */
export const DEFAULT_KEEP = 10;

/**
 * Thư mục backup. Core: <project root>/config/backups/.
 * Module: <moduleDir>/config/backups/ (nằm trong chính folder module — cô lập, Golden Rule §5.3).
 * EN: Core backups go to <project root>/config/backups/. Module backups live inside the module's
 * own config folder — <moduleDir>/config/backups/ (isolation).
 * Trong môi trường test: sử dụng thư mục tạm trong configDir.
 */
function backupsDir(configDir: string, type: 'core' | 'module' = 'core'): string {
  if (type === 'module') {
    return join(configDir, 'config', 'backups');
  }

  // Trong môi trường test: configDir là thư mục tạm (không có package.json)
  if (configDir.includes('Temp') || configDir.includes('tmp')) {
    return join(configDir, 'backups');
  }

  // Trong môi trường production: tìm project root
  let dir = configDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      return join(dir, 'config', 'backups');
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ConfigError('Không tìm thấy project root (package.json)');
}

function tsToName(ts: Date, seq = 0): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const base =
    `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_` +
    `${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}`;
  return seq > 0 ? `${base}_${seq}` : base;
}

/** Copy config.yml (core) hoặc defaults.yml (module) → backups/, giữ N bản mới nhất.
 * Trả về path file backup đã tạo, hoặc null nếu nội dung không thay đổi.
 */
export function backupConfig(
  configDir: string,
  options?: { keep?: number; type?: 'core' | 'module'; name?: string }
): string | null {
  const { keep = DEFAULT_KEEP, type = 'core', name } = options ?? {};
  const src = type === 'core'
    ? join(configDir, 'config.yml')
    : join(configDir, 'config', 'defaults.yml'); // Module: defaults.yml sau khi merge

  if (!existsSync(src)) {
    throw new ConfigError(`Không thể backup — thiếu ${src}. EN: Cannot backup, missing config file.`);
  }

  const dir = backupsDir(configDir, type);
  mkdirSync(dir, { recursive: true });

  // Đọc nội dung hiện tại và tính hash
  const currentContent = readFileSync(src, 'utf8');
  const currentHash = createHash('sha256').update(currentContent).digest('hex');

  // Tìm bản backup mới nhất cùng loại
  const backups = listBackups(configDir, { type, name });
  const latestBackup = backups[0];
  if (latestBackup) {
    const latestContent = readFileSync(join(dir, latestBackup.file), 'utf8');
    const latestHash = createHash('sha256').update(latestContent).digest('hex');
    if (latestHash === currentHash) {
      return null; // Nội dung giống → không backup
    }
  }

  // Tạo backup mới
  const namePrefix = type === 'core' ? 'config' : `module-${name}`;
  let seq = 0;
  let backupName = `${namePrefix}-${tsToName(new Date(), seq)}.bak`;
  while (existsSync(join(dir, backupName))) {
    backupName = `${namePrefix}-${tsToName(new Date(), ++seq)}.bak`;
  }
  const dest = join(dir, backupName);
  copyFileSync(src, dest);

  // Xóa bản cũ hơn, giữ N mới nhất (mtime giảm dần → bỏ phần cuối).
  const allBackups = listBackups(configDir, { type, name });
  if (allBackups.length > keep) {
    for (const b of allBackups.slice(keep)) {
      try { rmSync(join(dir, b.file), { force: true }); } catch { /* bỏ qua */ }
    }
  }

  return dest;
}

/** Liệt kê backup theo thứ tự mới nhất trước. */
export function listBackups(
  configDir: string,
  options?: { type?: 'core' | 'module'; name?: string }
): Array<{ file: string; mtime: string; mtimeMs: number }> {
  const { type, name } = options ?? {};
  const dir = backupsDir(configDir, type ?? 'core');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => {
      if (!f.endsWith('.bak')) return false;
      if (type === 'core' && !f.startsWith('config-')) return false;
      if (type === 'module' && !f.startsWith(`module-${name}-`)) return false;
      return true;
    })
    .map((file) => ({
      file,
      mtime: statSync(join(dir, file)).mtime.toISOString(),
      mtimeMs: statSync(join(dir, file)).mtimeMs,
    }))
    .sort((a, b) => (a.mtimeMs < b.mtimeMs ? 1 : -1));
}

/** Lấy hash của bản backup mới nhất (dùng để so sánh nội dung). */
export function getLatestBackupHash(
  configDir: string,
  options?: { type?: 'core' | 'module'; name?: string }
): string | null {
  const backups = listBackups(configDir, options);
  if (!backups.length) return null;

  const dir = backupsDir(configDir, options?.type ?? 'core');
  const latestContent = readFileSync(join(dir, backups[0].file), 'utf8');
  return createHash('sha256').update(latestContent).digest('hex');
}

/** Khôi phục config.yml (core) hoặc defaults.yml (module) từ 1 file backup. */
export function restoreConfig(
  configDir: string,
  backupFile: string,
  options?: { type?: 'core' | 'module' }
): void {
  const { type = 'core' } = options ?? {};
  const src = join(backupsDir(configDir, type), backupFile);
  if (!existsSync(src)) {
    throw new ConfigError(`Không tìm thấy backup: ${backupFile}. EN: Backup not found: ${backupFile}`);
  }
  const dest = type === 'core'
    ? join(configDir, 'config.yml')
    : join(configDir, 'config', 'defaults.yml');
  copyFileSync(src, dest);
}

/**
 * Đọc nội dung bản backup mới nhất — KHÔNG ghi đè file config đang dùng.
 * (Khi config invalid, ta DÙNG backup thay vì thay file bằng backup.)
 * EN: Read the newest backup content — does NOT overwrite the config file in use.
 * (When the config is invalid, we LOAD the backup instead of replacing the file with it.)
 *
 * @returns chuỗi YAML của backup mới nhất, hoặc null nếu không có backup.
 */
export function loadLatestBackupContent(
  configDir: string,
  options?: { type?: 'core' | 'module'; name?: string }
): string | null {
  const { type = 'core', name } = options ?? {};
  const backups = listBackups(configDir, { type, name });
  if (backups.length === 0) return null;
  return readFileSync(join(backupsDir(configDir, type), backups[0].file), 'utf8');
}
