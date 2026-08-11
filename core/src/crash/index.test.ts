import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CrashReporter, isQuarantined, resetQuarantine, shouldQuarantine, writeCrashReport } from './index.js';
import type { CrashReport } from './index.js';

/** Logger giả (capture) cho crash reporter. */
function makeLogger() {
  const logs: string[] = [];
  const logger = {
    fatal: (..._a: unknown[]) => logs.push('fatal'),
    error: (_m: string) => logs.push('error'),
    warn: (_m: string) => logs.push('warn'),
    info: (_m: string) => logs.push('info'),
    debug: (_m: string) => logs.push('debug'),
  };
  return { logger, logs };
}

function makeReporter(opts: {
  maxFailures?: number;
  windowMs?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getModuleStates?: () => any;
}) {
  const dir = mkdtempSync(join(tmpdir(), 'averon-crash-'));
  const { logger, logs } = makeLogger();
  const reporter = new CrashReporter({
    logger,
    getModuleStates: opts.getModuleStates ?? (() => []),
    crashDir: dir,
    env: 'test',
    appVersion: '0.3.0',
    maxFailures: opts.maxFailures,
    windowMs: opts.windowMs,
  });
  return { reporter, logger, logs, dir };
}

afterEach(resetQuarantine);

describe('CrashReporter', () => {
  it('handleModuleFailure → true sau khi vượt ngưỡng maxFailures (quarantine)', () => {
    const { reporter } = makeReporter({ maxFailures: 3, windowMs: 60_000 });
    expect(reporter.handleModuleFailure('modA', 'err1')).toBe(false);
    expect(reporter.handleModuleFailure('modA', 'err2')).toBe(false);
    expect(reporter.handleModuleFailure('modA', 'err3')).toBe(true); // ≥3 → quarantine
    expect(isQuarantined('modA')).toBe(true);
  });

  it('lỗi ngoài cửa sổ time window không tính chồng (reset)', () => {
    // Lỗi rải xa nhau > windowMs → mỗi lần phải < ngưỡng (không bị quarantine)
    expect(shouldQuarantine('modB', 1000, { dir: '', maxFailures: 3, windowMs: 10_000 })).toBe(false);
    expect(shouldQuarantine('modB', 20_000, { dir: '', maxFailures: 3, windowMs: 10_000 })).toBe(false);
    expect(shouldQuarantine('modB', 40_000, { dir: '', maxFailures: 3, windowMs: 10_000 })).toBe(false);
    expect(isQuarantined('modB')).toBe(false);
  });

  it('unhandledRejection handler ghi log error (không exit) — gọi trực tiếp qua emit', async () => {
    const { reporter, logs } = makeReporter({});
    reporter.install();
    try {
      // Mô phỏng rejection bằng cách emit sự kiện trực tiếp (tránh promise chưa xử lý trong test)
      process.emit('unhandledRejection', new Error('rej1'), Promise.resolve());
      expect(logs).toContain('error');
    } finally {
      reporter.uninstall();
    }
  });

  it('writeCrashReport tạo file JSON có nội dung đầy đủ', () => {
    const dir = mkdtempSync(join(tmpdir(), 'averon-crash-write-'));
    const report: CrashReport = {
      timestamp: '2026-08-11T00:00:00.000Z',
      error: { name: 'Test', message: 'boom', stack: 'line' },
      context: {
        env: 'test',
        appVersion: '0.3.0',
        nodeVersion: 'v22',
        modules: [],
      },
    };
    const file = writeCrashReport(report, dir);
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(parsed.error.message).toBe('boom');
    expect(parsed.context.appVersion).toBe('0.3.0');
    rmSync(dir, { recursive: true, force: true });
  });

  it('handleModuleFailure vượt ngưỡng → ghi crash report + log warn', () => {
    const { reporter, logs, dir } = makeReporter({ maxFailures: 2, windowMs: 60_000 });
    reporter.handleModuleFailure('modC', 'x');
    reporter.handleModuleFailure('modC', 'y'); // vượt ngưỡng → quarantine
    expect(logs).toContain('warn');
    const reportFiles = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(reportFiles.length).toBeGreaterThanOrEqual(1);
  });
});