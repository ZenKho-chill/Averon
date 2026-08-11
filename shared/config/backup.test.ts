import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupConfig, listBackups, restoreConfig } from './backup.js';

/** Fixture: thư mục config tạm có config.yml. */
function makeConfigDir(content = 'app:\n  name: averon\n'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'averon-backup-'));
  writeFileSync(join(dir, 'config.yml'), content);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('backupConfig', () => {
  it('copy config.yml → backups/ và trả path', () => {
    const { dir, cleanup } = makeConfigDir();
    try {
      const path = backupConfig(dir);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(join(dir, 'config.yml'), 'utf8')).toContain('averon');
    } finally {
      cleanup();
    }
  });

  it('giữ N bản mới nhất, xóa bản cũ hơn', () => {
    const { dir, cleanup } = makeConfigDir();
    try {
      // tạo 3 backup giữ 2 → chỉ còn 2 mới nhất
      backupConfig(dir, { keep: 2 });
      backupConfig(dir, { keep: 2 });
      backupConfig(dir, { keep: 2 });
      const backups = listBackups(dir);
      expect(backups.length).toBe(2);
    } finally {
      cleanup();
    }
  });
});

describe('listBackups', () => {
  it('trả danh sách trống khi chưa có backup', () => {
    const { dir, cleanup } = makeConfigDir();
    try {
      expect(listBackups(dir)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('sắp xếp mới nhất trước', () => {
    const { dir, cleanup } = makeConfigDir();
    try {
      backupConfig(dir);
      const first = listBackups(dir)[0].file;
      backupConfig(dir);
      const second = listBackups(dir)[0].file;
      expect(first).not.toBe(second); // mtime khác nhau → thứ tự khác
      expect(listBackups(dir).length).toBe(2);
    } finally {
      cleanup();
    }
  });
});

describe('restoreConfig', () => {
  it('copy ngược backup về config.yml', () => {
    const { dir, cleanup } = makeConfigDir('app:\n  name: ORIGINAL\n');
    try {
      const path = backupConfig(dir);
      writeFileSync(join(dir, 'config.yml'), 'app:\n  name: CHANGED\n'); // sửa config
      const file = path.split(/[\\/]/).pop()!;
      restoreConfig(dir, file);
      expect(readFileSync(join(dir, 'config.yml'), 'utf8')).toContain('ORIGINAL');
    } finally {
      cleanup();
    }
  });

  it('backup không tồn tại → ném lỗi rõ ràng', () => {
    const { dir, cleanup } = makeConfigDir();
    try {
      expect(() => restoreConfig(dir, 'config-none.yml')).toThrow(/không tìm thấy/i);
    } finally {
      cleanup();
    }
  });
});