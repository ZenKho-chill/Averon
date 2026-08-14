/**
 * Log sinks: console (màu ở dev) + file rotate theo dung lượng (prod) — §7.3.
 * EN: Log sinks: console (colored in dev) + size-based rotating file (prod).
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COLOR_RESET, LEVEL_COLORS, type LogLevel } from './levels.js';

export interface LogSink {
  write(line: string): void;
}

/** Tô màu token [LEVEL] trong dòng log (chỉ console dev). */
export function colorizeLevel(line: string): string {
  return line.replace(/\[(DEBUG|INFO|WARN|ERROR|FATAL)\s*\]/g, (match, level: LogLevel) => {
    return `${LEVEL_COLORS[level]}${match}${COLOR_RESET}`;
  });
}

/** Ghi ra stdout — có màu ở dev, phẳng ở prod. */
export class ConsoleSink implements LogSink {
  constructor(private readonly color: boolean) {}

  write(line: string): void {
    const output = this.color ? colorizeLevel(line) : line;
    process.stdout.write(`${output}\n`);
  }
}

function dateStamp(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Ghi file `averon-YYYY-MM-DD.log` + rotate theo dung lượng.
 * EN: Appends to `averon-YYYY-MM-DD.log`, rotates by size.
 * Lịch sử: base.1.log (mới nhất) → base.N.log (cũ nhất); keepFiles = số file lịch sử giữ lại.
 */
export class RotatingFileSink implements LogSink {
  private readonly base: string;

  constructor(
    private readonly dir: string,
    private readonly maxSizeMB = 20,
    private readonly keepFiles = 7,
    filename?: string,
  ) {
    mkdirSync(dir, { recursive: true });
    this.base = filename ?? `averon-${dateStamp()}.log`;
  }

  private filePath(): string {
    return join(this.dir, this.base);
  }

  write(line: string): void {
    const file = this.filePath();
    const size = existsSync(file) ? statSync(file).size : 0;
    const lineBytes = Buffer.byteLength(line, 'utf8') + 1; // +1 cho newline
    if (size + lineBytes > this.maxSizeMB * 1024 * 1024) {
      this.rotate();
    }
    appendFileSync(file, `${line}\n`);
  }

  private rotate(): void {
    const dir = this.dir;
    // Xóa file cũ nhất trước để dịch chuyển không bị chặn.
    rmSync(join(dir, `${this.base}.${this.keepFiles}.log`), { force: true });
    // Dịch base.i → base.i+1 (i từ cũ đến mới).
    for (let i = this.keepFiles - 1; i >= 1; i--) {
      const from = join(dir, `${this.base}.${i}.log`);
      if (existsSync(from)) renameSync(from, join(dir, `${this.base}.${i + 1}.log`));
    }
    const current = this.filePath();
    if (existsSync(current)) renameSync(current, join(dir, `${this.base}.1.log`));
  }
}
