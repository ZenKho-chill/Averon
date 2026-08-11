/**
 * shared/config/backup — backup bản config hợp lệ + rollback (CLAUDE.md §6.4).
 * EN: config backup + rollback — saves the last stable config each boot.
 *
 * Mỗi lần boot với config hợp lệ → copy config.yml vào <configDir>/backups/config-<ts>.yml,
 * giữ N bản gần nhất. Dùng `scripts/restore-config.ts` để list + rollback.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError } from './errors.js';

/** Số bản backup tối đa giữ lại. */
export const DEFAULT_KEEP = 10;

function backupsDir(configDir: string): string {
  return join(configDir, 'backups');
}

function tsToName(ts: Date, seq = 0): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const base =
    `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
    `-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  return seq > 0 ? `${base}-${seq}` : base;
}

/** Copy config.yml → backups/, giữ N bản mới nhất. Trả về path file backup đã tạo. */
export function backupConfig(configDir: string, options?: { keep?: number }): string {
  const keep = options?.keep ?? DEFAULT_KEEP;
  const src = join(configDir, 'config.yml');
  if (!existsSync(src)) {
    throw new ConfigError(`Không thể backup — thiếu ${src}. EN: Cannot backup, missing config.yml.`);
  }

  const dir = backupsDir(configDir);
  mkdirSync(dir, { recursive: true });

  // Tránh trùng tên khi backup nhiều lần trong cùng 1 giây → thêm hậu tố -1, -2...
  let name = `config-${tsToName(new Date())}.yml`;
  let seq = 1;
  while (existsSync(join(dir, name))) {
    name = `config-${tsToName(new Date(), seq++)}.yml`;
  }
  const dest = join(dir, name);
  copyFileSync(src, dest);

  // Xóa bản cũ hơn, giữ N mới nhất (mtime giảm dần → bỏ phần cuối).
  const all = listBackups(configDir);
  if (all.length > keep) {
    for (const b of all.slice(keep)) {
      try { rmSync(join(dir, b.file), { force: true }); } catch { /* bỏ qua */ }
    }
  }

  return dest;
}

/** Liệt kê backup theo thứ tự mới nhất trước. */
export function listBackups(configDir: string): Array<{ file: string; mtime: string }> {
  const dir = backupsDir(configDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yml'))
    .map((file) => ({ file, mtime: statSync(join(dir, file)).mtime.toISOString(), mtimeMs: statSync(join(dir, file)).mtimeMs }))
    .sort((a, b) => (a.mtimeMs < b.mtimeMs ? 1 : a.mtimeMs > b.mtimeMs ? -1 : 0));
}

/** Khôi phục config.yml từ 1 file backup (tên file trong thư mục backups/). */
export function restoreConfig(configDir: string, backupFile: string): void {
  const src = join(backupsDir(configDir), backupFile);
  if (!existsSync(src)) {
    throw new ConfigError(`Không tìm thấy backup: ${backupFile}. EN: Backup not found: ${backupFile}`);
  }
  const dest = join(configDir, 'config.yml');
  copyFileSync(src, dest);
}
