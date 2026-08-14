import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupConfig, listBackups, restoreConfig, restoreLatestValidConfig } from './backup.js';

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
      expect(path).not.toBeNull();
      expect(existsSync(path!)).toBe(true);
      expect(readFileSync(join(dir, 'config.yml'), 'utf8')).toContain('averon');
    } finally {
      cleanup();
    }
  });

  it('giữ N bản mới nhất, xóa bản cũ hơn', () => {
    const { dir, cleanup } = makeConfigDir();
    try {
      // Tạo 3 backup với nội dung khác nhau
      writeFileSync(join(dir, 'config.yml'), 'app:\n  name: averon1\n');
      backupConfig(dir, { keep: 2 });
      writeFileSync(join(dir, 'config.yml'), 'app:\n  name: averon2\n');
      backupConfig(dir, { keep: 2 });
      writeFileSync(join(dir, 'config.yml'), 'app:\n  name: averon3\n');
      backupConfig(dir, { keep: 2 });
      // Gọi listBackups để kích hoạt cleanup
      const backups = listBackups(dir);
      expect(backups.length).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('không backup nếu nội dung giống bản mới nhất', () => {
    const { dir, cleanup } = makeConfigDir('app:\n  name: averon\n');
    try {
      backupConfig(dir); // Lần 1: tạo backup
      const path2 = backupConfig(dir); // Lần 2: nội dung giống → không tạo backup mới
      expect(path2).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('backup module nếu nội dung khác', () => {
    const moduleDir = mkdtempSync(join(tmpdir(), 'averon-module-'));
    const configDir = join(moduleDir, 'config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'defaults.yml'), 'key: value1\n');
    try {
      // Tạo project root giả cho test
      writeFileSync(join(moduleDir, 'package.json'), '{"name": "test", "version": "1.0.0"}');
      backupConfig(moduleDir, { type: 'module', name: 'test' }); // Lần 1
      writeFileSync(join(configDir, 'defaults.yml'), 'key: value2\n'); // Sửa nội dung
      const path2 = backupConfig(moduleDir, { type: 'module', name: 'test' }); // Lần 2: khác → tạo backup mới
      expect(path2).not.toBeNull();
      // Kiểm tra file backup được tạo trong thư mục chung
      const backups = listBackups(moduleDir, { type: 'module', name: 'test' });
      expect(backups.length).toBe(2);
    } finally {
      rmSync(moduleDir, { recursive: true, force: true });
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
      // Sửa nội dung để đảm bảo tạo file mới
      writeFileSync(join(dir, 'config.yml'), 'app:\n  name: averon2\n');
      backupConfig(dir);
      const second = listBackups(dir)[0].file;
      expect(first).not.toBe(second);
      expect(listBackups(dir).length).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('lọc backup theo type và name', () => {
    const { dir, cleanup } = makeConfigDir();
    try {
      backupConfig(dir); // Core backup
      const coreBackups = listBackups(dir, { type: 'core' });
      const moduleBackups = listBackups(dir, { type: 'module', name: 'ping' });
      expect(coreBackups.length).toBe(1);
      expect(coreBackups[0].file).toMatch(/^config-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.bak$/);
      expect(moduleBackups.length).toBe(0); // Không có file module → không có backup
    } finally {
      cleanup();
    }
  });

describe('restoreLatestValidConfig', () => {
  it('khôi phục từ backup mới nhất khi không có backup → trả về false', () => {
    const { dir, cleanup } = makeConfigDir();
    try {
      const logger = { warn: vi.fn() };
      const restored = restoreLatestValidConfig(dir, { type: 'core', logger });
      expect(restored).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Không có bản backup nào'));
    } finally {
      cleanup();
    }
  });

  it('khôi phục thành công từ backup mới nhất → trả về true', () => {
    const { dir, cleanup } = makeConfigDir('app:\n  name: ORIGINAL\n');
    try {
      backupConfig(dir); // Tạo backup
      writeFileSync(join(dir, 'config.yml'), 'app:\n  name: CHANGED\n'); // Sửa config
      const logger = { warn: vi.fn() };
      const restored = restoreLatestValidConfig(dir, { type: 'core', logger });
      expect(restored).toBe(true);
      expect(readFileSync(join(dir, 'config.yml'), 'utf8')).toContain('ORIGINAL');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Đã khôi phục config từ backup'));
    } finally {
      cleanup();
    }
  });
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