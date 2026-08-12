import { describe, it, expect } from 'vitest';
import { UsageTracker } from './usage.js';

describe('UsageTracker', () => {
  it('begin/end tăng/giảm active count', () => {
    const usage = new UsageTracker();
    expect(usage.activeCount('ping')).toBe(0);

    usage.begin('ping');
    usage.begin('ping');
    expect(usage.activeCount('ping')).toBe(2);

    usage.end('ping');
    expect(usage.activeCount('ping')).toBe(1);

    usage.end('ping');
    expect(usage.activeCount('ping')).toBe(0);
  });

  it('end clamp ≥0 — handler finish sau reset/force không làm âm', () => {
    const usage = new UsageTracker();
    usage.begin('ping');
    usage.reset('ping');
    usage.end('ping');
    expect(usage.activeCount('ping')).toBe(0);
  });

  it('reset xoá count', () => {
    const usage = new UsageTracker();
    usage.begin('ping');
    usage.reset('ping');
    expect(usage.activeCount('ping')).toBe(0);
  });

  it('activeCount mặc định 0 cho module chưa từng dùng', () => {
    const usage = new UsageTracker();
    expect(usage.activeCount('never')).toBe(0);
  });

  it('waitIdle trả idle ngay khi không có in-flight', async () => {
    const usage = new UsageTracker();
    await expect(usage.waitIdle('ping', 100)).resolves.toBe('idle');
  });

  it('waitIdle trả idle sau khi handler kết thúc', async () => {
    const usage = new UsageTracker();
    usage.begin('ping');
    setTimeout(() => usage.end('ping'), 20);
    await expect(usage.waitIdle('ping', 2000)).resolves.toBe('idle');
  });

  it('waitIdle trả timeout khi hết hạn vẫn còn in-flight', async () => {
    const usage = new UsageTracker();
    usage.begin('ping');
    await expect(usage.waitIdle('ping', 50)).resolves.toBe('timeout');
    usage.reset('ping');
  });
});
