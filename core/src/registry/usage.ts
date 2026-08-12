/**
 * core/registry/usage — đếm in-flight handler của từng module (CLAUDE.md §2.2, soft-stop).
 * EN: core/registry/usage — per-module in-flight handler counter (soft-stop support).
 *
 * Dùng bởi DiscordClient.registerCommand (begin/end quanh handler) và ModuleManager
 * (waitIdle cho soft-unload: đợi hết handler đang chạy dở rồi mới onUnload).
 */
export type WaitIdleResult = 'idle' | 'timeout';

export class UsageTracker {
  private readonly counts = new Map<string, number>();

  /** Tăng active count khi handler bắt đầu (gọi từ DiscordClient.registerCommand). */
  begin(moduleName: string): void {
    this.counts.set(moduleName, (this.counts.get(moduleName) ?? 0) + 1);
  }

  /** Giảm active count khi handler kết thúc — clamp ≥0 (handler finish sau force-unload/reset không âm). */
  end(moduleName: string): void {
    const next = (this.counts.get(moduleName) ?? 0) - 1;
    if (next <= 0) {
      this.counts.delete(moduleName);
    } else {
      this.counts.set(moduleName, next);
    }
  }

  /** Số handler đang chạy dở của module. */
  activeCount(moduleName: string): number {
    return this.counts.get(moduleName) ?? 0;
  }

  /** Xoá count (khi unload/reload/force) — để bắt đầu lại từ 0. */
  reset(moduleName: string): void {
    this.counts.delete(moduleName);
  }

  /**
   * Đợi đến khi active count về 0 hoặc hết thời hạn.
   * Poll 50ms (bounded) — không chặn event loop bằng timer dài.
   */
  async waitIdle(moduleName: string, timeoutMs: number): Promise<WaitIdleResult> {
    const deadline = Date.now() + timeoutMs;
    while (this.activeCount(moduleName) > 0) {
      if (Date.now() >= deadline) return 'timeout';
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 50);
      });
    }
    return 'idle';
  }
}
