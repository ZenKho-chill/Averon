/**
 * Regression guard cho bug: console `averon` không nhận lệnh khi chạy `npm run dev`.
 * Nguyên nhân: `tsx watch` nuốt stdin cho phím restart "rs" → child không đọc được input.
 * Fix: dev script dùng `node --watch --import tsx` (forward stdin đầy đủ + vẫn hot-reload).
 * EN: Guards against `tsx watch` being reintroduced in the `dev` script — it swallows stdin,
 * breaking the `averon` console. `node --watch --import tsx` forwards stdin and still hot-reloads.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function devScript(): string {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  const dev = pkg.scripts?.['dev'];
  if (!dev) throw new Error('package.json scripts.dev is missing');
  return dev;
}

describe('package.json scripts.dev (console stdin)', () => {
  it('KHÔNG dùng `tsx watch` — nó nuốt stdin, console không nhận lệnh (regression bug 0.8.0)', () => {
    expect(devScript()).not.toMatch(/^tsx\s+watch/);
  });

  it('dùng node --watch (forward stdin) kèm --import tsx (chạy TS + hot-reload)', () => {
    const dev = devScript();
    expect(dev).toMatch(/node\s+--watch/);
    expect(dev).toMatch(/--import\s+tsx/);
  });
});
