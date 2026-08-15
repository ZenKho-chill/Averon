/**
 * Test LogTailer — tail log file mới nhất, buffer recent, gộp usage stats, xử lý rotation/truncate.
 * EN: LogTailer tests — tails the newest log file, recent buffer, usage aggregation, rotation/truncation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LogTailer } from '../src/logs.js';
import { makeLogger } from './helpers.js';

let currentRoot = '';

afterEach(() => {
  if (currentRoot) {
    rmSync(currentRoot, { recursive: true, force: true });
    currentRoot = '';
  }
});

function tempLogsDir(): string {
  if (!currentRoot) {
    currentRoot = mkdtempSync(join(tmpdir(), 'averon-webui-logs-'));
    mkdirSync(join(currentRoot, 'logs'), { recursive: true });
  }
  return join(currentRoot, 'logs');
}

const USAGE_LINE = (cmd: string, userId: string, guild: string, moduleName: string): string =>
  `[2026-08-15 12:00:00.000] [INFO] [core/discord] [core] Command '/${cmd}' used by ${userId} in guild ${guild} {"module":"${moduleName}"}`;

describe('LogTailer', () => {
  it('không có file log → tick/recent rỗng, usage rỗng', () => {
    const tailer = new LogTailer({ logsDir: join(currentRoot, 'nonexistent'), logger: makeLogger() });
    expect(tailer.tick()).toEqual([]);
    expect(tailer.recent(10)).toEqual([]);
    expect(tailer.usageStats().total).toBe(0);
  });

  it('seed đọc lịch sử file log hiện có (buffer + usage stats)', () => {
    const dir = tempLogsDir();
    writeFileSync(
      join(dir, 'averon-2026-08-15.log'),
      ['line-1', USAGE_LINE('ping', 'u1', '111', 'ping'), USAGE_LINE('ping', 'u2', '222', 'ping'), 'line-4'].join('\n'),
      'utf8',
    );
    const tailer = new LogTailer({ logsDir: dir, logger: makeLogger() });
    const recent = tailer.recent(10);
    expect(recent).toHaveLength(4);
    expect(recent[0].line).toBe('line-1');
    expect(recent[1].line).toContain("Command '/ping'");
    expect(recent[3].line).toBe('line-4');
    const stats = tailer.usageStats();
    expect(stats.total).toBe(2);
    expect(stats.perCommand).toEqual([{ name: 'ping', count: 2 }]);
    expect(stats.perModule).toEqual([{ name: 'ping', count: 2 }]);
    expect(stats.perGuild).toHaveLength(2);
  });

  it('tick trả về dòng MỚI được append sau khi khởi tạo', () => {
    const dir = tempLogsDir();
    const file = join(dir, 'averon-2026-08-15.log');
    writeFileSync(file, 'old-line\n', 'utf8');
    const tailer = new LogTailer({ logsDir: dir, logger: makeLogger() });
    expect(tailer.recent(10)).toHaveLength(1);

    appendFileSync(file, 'new-line-1\n', 'utf8');
    const fresh = tailer.tick();
    expect(fresh.map((l) => l.line)).toEqual(['new-line-1']);
  });

  it('dòng chưa kết thúc (không có \\n) được giữ lại cho lần đọc sau', () => {
    const dir = tempLogsDir();
    const file = join(dir, 'averon-2026-08-15.log');
    writeFileSync(file, 'base\n', 'utf8');
    const tailer = new LogTailer({ logsDir: dir, logger: makeLogger() });

    appendFileSync(file, 'partial-line', 'utf8');
    expect(tailer.tick()).toEqual([]);

    appendFileSync(file, '-complete\nnext\n', 'utf8');
    const lines = tailer.tick().map((l) => l.line);
    expect(lines).toEqual(['partial-line-complete', 'next']);
  });

  it('rotation: file mới hơn xuất hiện → marker + tail file mới', () => {
    const dir = tempLogsDir();
    writeFileSync(join(dir, 'old-1.log'), 'old-content\n', 'utf8');
    const tailer = new LogTailer({ logsDir: dir, logger: makeLogger() });
    expect(tailer.recent(10)).toHaveLength(1);

    const newFile = join(dir, 'new-2.log');
    writeFileSync(newFile, 'new-content\n', 'utf8');
    // Đảm bảo file mới có mtime sau file cũ (fs mtime có thể trùng trong cùng ms).
    utimesSync(newFile, new Date(Date.now() + 2000), new Date(Date.now() + 2000));

    const lines = tailer.tick().map((l) => l.line);
    expect(lines[0]).toContain('=== log file: new-2.log ===');
    expect(lines).toContain('new-content');
  });

  it('truncate: file bị cắt ngắn → reset + tail lại từ đầu', () => {
    const dir = tempLogsDir();
    const file = join(dir, 'averon-2026-08-15.log');
    writeFileSync(file, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', 'utf8');
    const tailer = new LogTailer({ logsDir: dir, logger: makeLogger() });
    tailer.tick();

    writeFileSync(file, 'shorter\n', 'utf8'); // giảm kích thước (simulate rotation/truncate)
    const lines = tailer.tick().map((l) => l.line);
    expect(lines[0]).toContain('truncated');
    expect(lines).toContain('shorter');
  });

  it('gộp usage từ log mới qua tick (không chỉ seed)', () => {
    const dir = tempLogsDir();
    const file = join(dir, 'averon-2026-08-15.log');
    writeFileSync(file, 'base\n', 'utf8');
    const tailer = new LogTailer({ logsDir: dir, logger: makeLogger() });

    appendFileSync(file, `${USAGE_LINE('avatar', 'u9', '333', 'fun')}\n`, 'utf8');
    tailer.tick();
    const stats = tailer.usageStats();
    expect(stats.total).toBe(1);
    expect(stats.perCommand).toEqual([{ name: 'avatar', count: 1 }]);
    expect(stats.perModule).toEqual([{ name: 'fun', count: 1 }]);
    expect(stats.perGuild).toEqual([{ name: '333', count: 1 }]);
  });

  it('recent giới hạn theo maxBuffer', () => {
    const dir = tempLogsDir();
    writeFileSync(join(dir, 'averon-2026-08-15.log'), Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n'), 'utf8');
    const tailer = new LogTailer({ logsDir: dir, logger: makeLogger(), maxBuffer: 5 });
    expect(tailer.recent(100)).toHaveLength(5);
    expect(tailer.recent(100).map((l) => l.line)).toEqual(['l15', 'l16', 'l17', 'l18', 'l19']);
  });
});