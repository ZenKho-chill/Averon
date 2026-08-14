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
import { listBackups, restoreConfig } from '../shared/config/backup.js';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configDir = join(root, 'config'); // Core backup: config/backups/

const args = yargs(hideBin(process.argv))
  .option('module', {
    type: 'string',
    description: 'Khôi phục config cho module cụ thể (vd: ping)',
  })
  .option('yes', {
    type: 'boolean',
    description: 'Không hỏi xác nhận',
  })
  .parseSync();

const backupFile = args._[0] as string | undefined;

// Core backup ở config/backups/; module backup nằm trong chính folder module:
// modules/<name>/config/backups/ (isolation). EN: Core backups in config/backups/; module
// backups live inside the module's own folder — modules/<name>/config/backups/.
const targetDir = args.module ? join(root, 'modules', args.module) : configDir;

// Mode 1: list
if (!backupFile) {
  const backups = args.module
    ? listBackups(targetDir, { type: 'module', name: args.module })
    : listBackups(targetDir, { type: 'core' });
  if (backups.length === 0) {
    console.log(args.module
      ? `[restore-config] Module '${args.module}' chưa có bản backup nào — boot bot 1 lần để tạo backup đầu tiên.`
      : '[restore-config] Chưa có bản backup nào — boot bot 1 lần để tạo backup đầu tiên.');
    process.exit(0);
  }
  console.log(args.module
    ? `[restore-config] Các bản backup cho module '${args.module}' (mới nhất trước):`
    : '[restore-config] Các bản backup (mới nhất trước):');
  backups.forEach((b, i) => console.log(`  ${i + 1}. ${b.file}   (${b.mtime})`));
  console.log('\nRestore: npm run restore:config -- <file>   (hoặc dùng số thứ tự)');
  process.exit(0);
}

// Mode 2: restore
let target = backupFile;
if (/^\d+$/.test(backupFile)) {
  const idx = Number(backupFile) - 1;
  const backups = args.module
    ? listBackups(targetDir, { type: 'module', name: args.module })
    : listBackups(targetDir, { type: 'core' });
  const found = backups[idx];
  if (!found) {
    console.error(args.module
      ? `[restore-config] Module '${args.module}' không có bản backup số ${backupFile} (có ${backups.length} bản).`
      : `[restore-config] Không có bản backup số ${backupFile} (có ${backups.length} bản).`);
    process.exit(1);
  }
  target = found.file;
}

if (!args.yes) {
  console.warn(args.module
    ? `⚠️  Sẽ ghi đè modules/${args.module}/config/defaults.yml bằng backup: ${target}`
    : `⚠️  Sẽ ghi đè config/config.yml bằng backup: ${target}`);
  console.warn('Chạy lại với --yes để xác nhận. EN: Re-run with --yes to confirm.');
  process.exit(1);
}

try {
  restoreConfig(targetDir, target, { type: args.module ? 'module' : 'core' });
  console.log(args.module
    ? `[restore-config] OK — đã khôi phục config module '${args.module}' từ ${target}`
    : `[restore-config] OK — đã khôi phục config.yml từ ${target}`);
  process.exit(0);
} catch (err) {
  console.error(`[restore-config] FAIL — ${(err as Error).message}`);
  process.exit(1);
}