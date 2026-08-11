import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogger, parseLogLevel, colorizeLevel, mask, formatLine } from './index.js';
import type { Logger } from './index.js';

/** Logger test: inject sink gom dòng thay vì ghi stdout. */
function captureLogger(options: { level?: string; source?: string; context?: string } = {}) {
  const lines: string[] = [];
  const logger: Logger = createLogger({
    level: (options.level ?? 'INFO') as never,
    source: options.source ?? 'core/test',
    context: options.context ?? 'ctx',
    write: (line) => lines.push(line),
  });
  return { logger, lines };
}

describe('formatLine', () => {
  it('đúng format §7.2: [ts] [LEVEL ] [source] [context] message', () => {
    const line = formatLine('INFO', 'core/loader', 'modules/example', 'hello');
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[INFO \] \[core\/loader\] \[modules\/example\] hello$/);
  });

  it('thêm meta dạng JSON khi có', () => {
    const line = formatLine('WARN', 'core/ipc', '', 'retry', { attempt: 2 });
    expect(line).toContain('{"attempt":2}');
  });
});

describe('level filtering (§7.1)', () => {
  it('ở INFO: bỏ qua DEBUG, ghi INFO+', () => {
    const { logger, lines } = captureLogger({ level: 'INFO' });
    logger.debug('debug-msg');
    logger.info('info-msg');
    logger.error('error-msg');
    expect(lines.join('\n')).not.toContain('debug-msg');
    expect(lines.join('\n')).toContain('info-msg');
    expect(lines.join('\n')).toContain('error-msg');
  });

  it('thứ tự ưu tiên: FATAL >= ERROR >= WARN >= INFO >= DEBUG', () => {
    const { logger, lines } = captureLogger({ level: 'WARN' });
    logger.info('info-msg');
    logger.warn('warn-msg');
    logger.fatal('fatal-msg');
    expect(lines.join('\n')).not.toContain('info-msg');
    expect(lines.join('\n')).toContain('warn-msg');
    expect(lines.join('\n')).toContain('fatal-msg');
  });
});

describe('child()', () => {
  it('override source/context nhưng giữ level', () => {
    const { logger, lines } = captureLogger({ level: 'ERROR' });
    const sub = logger.child({ source: 'modules/fun', context: 'cmd:/avatar' });
    sub.info('skipped'); // level ERROR → bỏ
    sub.error('boom');
    expect(lines.join('\n')).not.toContain('skipped');
    expect(lines.join('\n')).toContain('[modules/fun] [cmd:/avatar] boom');
  });
});

describe('mask (§7.4)', () => {
  it('che secret trước khi log — không lộ token', () => {
    const { logger, lines } = captureLogger();
    logger.info('connecting', { token: logger.mask('abc1234567890') });
    expect(lines[0]).not.toContain('abc1234567');
    expect(lines[0]).toContain('******7890');
  });

  it('re-export mask từ shared/utils', () => {
    expect(mask('1234567890')).toBe('******7890');
  });
});

describe('parseLogLevel', () => {
  it('parse không phân biệt hoa thường; sai → fallback', () => {
    expect(parseLogLevel('debug')).toBe('DEBUG');
    expect(parseLogLevel('TRACE', 'INFO')).toBe('INFO');
    expect(parseLogLevel(undefined)).toBe('INFO');
  });
});

describe('colorizeLevel', () => {
  it('tô màu token [LEVEL] khi console dev', () => {
    const plain = formatLine('ERROR', 'core/x', '', 'oops');
    const colored = colorizeLevel(plain);
    expect(colored).toContain('\x1b[31m');
    expect(colored).not.toBe(plain);
  });
});

describe('RotatingFileSink (file + rotate theo size — §7.3)', () => {
  it('ghi file theo ngày và rotate khi vượt dung lượng', () => {
    const dir = mkdtempSync(join(tmpdir(), 'averon-log-'));
    try {
      const logger = createLogger({
        level: 'INFO',
        source: 'core/test',
        write: () => {}, // tắt stdout — chỉ test file sink
        file: { dir, maxSizeMB: 0.001, keepFiles: 2 }, // ~1KB/file
      });
      // ~150 dòng * ~90 byte ≈ 13KB → chắc chắn vượt 1KB → rotate nhiều lần
      for (let i = 0; i < 150; i++) logger.info(`line ${i} ${'x'.repeat(50)}`);

      const files = readdirSync(dir).filter((f) => f.startsWith('averon-') && f.endsWith('.log'));
      const current = files.find((f) => !f.includes('.1.log') && !f.includes('.2.log'));
      expect(current).toBeDefined(); // file hiện tại luôn tồn tại
      expect(files).toContain(current!);
      expect(readFileSync(join(dir, current!), 'utf8').length).toBeGreaterThan(0);
      // keepFiles=2 → tối đa base + base.1 + base.2
      const rotated = files.filter((f) => f.includes('.log') && f !== current).length;
      expect(rotated).toBeLessThanOrEqual(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
