/**
 * Quarantine logic — cô lập module lỗi liên tục, không kéo sập bot (§9.2).
 * EN: Quarantine logic — isolate repeatedly-failing modules, never crash the bot.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CrashReport } from './types.js';

export interface QuarantineOptions {
  /** Đường dẫn thư mục ghi crash report (mặc định: <root>/crash-reports). */
  dir: string;
  /** Số lần lỗi tối đa trong cửa sổ trước khi quarantine (mặc định: 5). */
  maxFailures: number;
  /** Cửa sổ thời gian (ms) để đếm lỗi (mặc định: 5 phút). */
  windowMs: number;
}

interface ModuleState {
  failures: number[];
  quarantined: boolean;
  reason?: string;
  timestamp?: string;
}

const moduleStates = new Map<string, ModuleState>();

/** Reset toàn bộ trạng thái quarantine (dùng cho test). */
export function resetQuarantine(): void {
  moduleStates.clear();
}

/**
 * Quyết định module có bị cô lập (quarantine) hay không khi xảy ra lỗi.
 * EN: Decide whether a module is quarantined after a failure.
 *
 * @returns true nếu module đã bị cô lập, false nếu còn trong ngưỡng.
 */
export function shouldQuarantine(moduleName: string, now: number, opts: QuarantineOptions): boolean {
  const state = moduleStates.get(moduleName) ?? { failures: [], quarantined: false };
  if (state.quarantined) return true;

  // Chỉ giữ các lần lỗi trong cửa sổ.
  const windowStart = now - opts.windowMs;
  const recent = state.failures.filter((t) => t > windowStart);
  recent.push(now);

  if (recent.length >= opts.maxFailures) {
    state.quarantined = true;
    state.reason = `Đạt ${opts.maxFailures} lần lỗi trong ${opts.windowMs}ms`;
    state.timestamp = new Date(now).toISOString();
    moduleStates.set(moduleName, state);
    return true;
  }

  state.failures = recent;
  moduleStates.set(moduleName, state);
  return false;
}

/** Kiểm tra module có đang bị quarantine không. */
export function isQuarantined(moduleName: string): boolean {
  return moduleStates.get(moduleName)?.quarantined ?? false;
}

/** Ghi crash report ra file JSON vào thư mục crash-reports/. */
export function writeCrashReport(report: CrashReport, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const filename = `crash-${new Date(report.timestamp).toISOString().replace(/[:.]/g, '-')}.json`;
  const filepath = join(dir, filename);
  writeFileSync(filepath, JSON.stringify(report, null, 2));
  return filepath;
}

export function readCrashReport(filepath: string): CrashReport {
  return JSON.parse(readFileSync(filepath, 'utf8')) as CrashReport;
}