/**
 * scripts/restore-config — list backup config + rollback về 1 bản bất kỳ.
 * EN: List config backups and roll back to any one.
 *
 * Cách dùng / Usage:
 *   npm run restore:config              # list các bản backup (mới nhất trước)
 *   npm run restore:config -- config-20260811-090000.yml   # restore bản cụ thể
 *   npm run restore:config -- --yes config-20260811-090000.yml  # không hỏi xác nhận
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBackups, restoreConfig } from '../shared/config/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configDir = join(root, 'config');

const args = process.argv.slice(2);
const force = args.includes('--yes');
const backupFile = args.filter((a) => a !== '--yes')[0];

// Mode 1: list
if (!backupFile) {
  const backups = listBackups(configDir);
  if (backups.length === 0) {
    console.log('[restore-config] Chưa có bản backup nào — boot bot 1 lần để tạo backup đầu tiên.');
    process.exit(0);
  }
  console.log('[restore-config] Các bản backup (mới nhất trước):');
  backups.forEach((b, i) => console.log(`  ${i + 1}. ${b.file}   (${b.mtime})`));
  console.log('\nRestore: npm run restore:config -- <file>   (hoặc dùng số thứ tự)');
  process.exit(0);
}

// Mode 2: restore
let target = backupFile;
if (/^\d+$/.test(backupFile)) {
  const idx = Number(backupFile) - 1;
  const backups = listBackups(configDir);
  const found = backups[idx];
  if (!found) {
    console.error(`[restore-config] Không có bản backup số ${backupFile} (có ${backups.length} bản).`);
    process.exit(1);
  }
  target = found.file;
}

if (!force) {
  console.warn(`⚠️  Sẽ ghi đè config/config.yml bằng backup: ${target}`);
  console.warn('Chạy lại với --yes để xác nhận. EN: Re-run with --yes to confirm.');
  process.exit(1);
}

try {
  restoreConfig(configDir, target);
  console.log(`[restore-config] OK — đã khôi phục config.yml từ ${target}`);
  process.exit(0);
} catch (err) {
  console.error(`[restore-config] FAIL — ${(err as Error).message}`);
  process.exit(1);
}