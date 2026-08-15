/**
 * modules/webui/logs — LogTailer: tail file log mới nhất (logs/) + gộp thống kê usage command.
 * EN: modules/webui/logs — LogTailer: tails the newest log file (logs/) and aggregates
 * command-usage stats from the usage log lines core writes (§7.2, core/src/discord).
 *
 * Không đụng core logger — đọc thẳng file log (không phụ thuộc sink, an toàn hot-reload).
 * EN: Does not touch the core logger — reads the log files directly (no sink dependency,
 * safe under hot-reload).
 */
import { existsSync, openSync, fstatSync, readSync, closeSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '../../../shared/logger/index.js';

export interface TailLine {
  file: string;
  line: string;
}

export interface UsageStatEntry {
  name: string;
  count: number;
}

export interface UsageStats {
  total: number;
  perModule: UsageStatEntry[];
  perCommand: UsageStatEntry[];
  perGuild: UsageStatEntry[];
}

/**
 * Regex log usage của core (core/src/discord/index.ts):
 * `Command '/ping' used by 123 in guild 456 {"module":"ping"}`
 * EN: Core usage log line pattern.
 */
const USAGE_RE = /Command '\/?(?<command>[^']+)' used by (?<userId>\S+) in guild (?<guild>[^\s]+)/;
const USAGE_MODULE_RE = /"module":"([^"]+)"/;

export interface LogTailerOptions {
  /** Thư mục log (vd <root>/logs). */
  logsDir: string;
  logger: Logger;
  /** Số dòng tối đa giữ trong buffer. */
  maxBuffer?: number;
  /** Giới hạn byte đọc mỗi file khi seed ban đầu (chống đọc file log 100MB). */
  maxSeedBytes?: number;
}

export class LogTailer {
  private readonly logsDir: string;
  private readonly logger: Logger;
  private readonly maxBuffer: number;
  private readonly maxSeedBytes: number;

  private file: string | null = null;
  private offset = 0;
  private pending = '';
  private buffer: TailLine[] = [];

  private readonly usage = new Map<string, number>();
  private readonly usageCommand = new Map<string, number>();
  private readonly usageGuild = new Map<string, number>();
  private usageTotal = 0;

  constructor(opts: LogTailerOptions) {
    this.logsDir = opts.logsDir;
    this.logger = opts.logger;
    this.maxBuffer = opts.maxBuffer ?? 500;
    this.maxSeedBytes = opts.maxSeedBytes ?? 256 * 1024;
    if (!existsSync(this.logsDir)) {
      this.logger.warn('Web: logs dir không tồn tại — log stream/usage stats sẽ rỗng (bật logging.file.enabled?)', {
        dir: this.logsDir,
      });
    }
    this.seed();
  }

  /** File log mới nhất (theo mtime). */
  private newestFile(): string | null {
    if (!existsSync(this.logsDir)) return null;
    const files = readdirSync(this.logsDir)
      .filter((f) => f.endsWith('.log'))
      .map((f) => ({ f, t: statSync(join(this.logsDir, f)).mtimeMs }))
      .sort((a, b) => a.t - b.t);
    return files.length > 0 ? files[files.length - 1].f : null;
  }

  /** Đọc [start, end) byte của file — clamp theo size thực tế (an toàn khi file rotate giữa chừng). */
  private readRange(filePath: string, start: number, end: number): string {
    const fd = openSync(filePath, 'r');
    try {
      const size = fstatSync(fd).size;
      const from = Math.max(0, start);
      const len = Math.min(end, size) - from;
      if (len <= 0) return '';
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, from);
      return buf.toString('utf8');
    } finally {
      closeSync(fd);
    }
  }

  /** Seed lúc khởi tạo: đọc phần CUỐI file log mới nhất (lịch sử gần) → buffer + usage stats. */
  private seed(): void {
    const file = this.newestFile();
    if (!file) return;
    const path = join(this.logsDir, file);
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      return;
    }
    const start = Math.max(0, size - this.maxSeedBytes);
    let content = this.readRange(path, start, size);
    // Bỏ dòng đầu bị cắt giữa chừng (start > 0).
    if (start > 0) {
      const nl = content.indexOf('\n');
      content = nl >= 0 ? content.slice(nl + 1) : '';
    }
    this.file = file;
    this.offset = size;
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      this.pushLine(file, line);
    }
  }

  /**
   * Đọc dòng log MỚI kể từ lần gọi trước. Xử lý rotation (file đổi) + truncate (file ghi đè).
   * Trả về các dòng mới; dòng đang dở (chưa có '\n') được giữ lại cho lần đọc sau.
   * EN: Read log lines NEW since the last call. Handles rotation + truncation. Incomplete
   * lines (no trailing '\n') are buffered until the next call.
   */
  tick(): TailLine[] {
    const out: TailLine[] = [];
    const file = this.newestFile();
    if (!file) return [];

    if (file !== this.file) {
      this.file = file;
      this.offset = 0;
      this.pending = '';
      out.push(this.pushLine(file, `=== log file: ${file} ===`));
    }

    const path = join(this.logsDir, file);
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      return out;
    }
    if (size < this.offset) {
      this.offset = 0;
      this.pending = '';
      out.push(this.pushLine(file, '=== log file truncated, re-tailing ==='));
    }
    if (size === this.offset) return out;

    let content = this.readRange(path, this.offset, size);
    this.offset = size;
    if (this.pending) {
      content = this.pending + content;
      this.pending = '';
    }

    const lines = content.split('\n');
    if (!content.endsWith('\n')) {
      this.pending = lines.pop() ?? '';
    }
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      this.pushLine(file, line);
      out.push({ file, line });
    }
    return out;
  }

  /** N dòng gần nhất trong buffer (cho GET /api/admin/logs). */
  recent(limit: number): TailLine[] {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), this.maxBuffer) : this.maxBuffer;
    return this.buffer.slice(-n);
  }

  /** Thống kê usage command gộp được từ log (kể từ khi server khởi động). */
  usageStats(): UsageStats {
    return {
      total: this.usageTotal,
      perModule: sortedEntries(this.usage),
      perCommand: sortedEntries(this.usageCommand),
      perGuild: sortedEntries(this.usageGuild),
    };
  }

  private pushLine(file: string, line: string): TailLine {
    const entry: TailLine = { file, line };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.splice(0, this.buffer.length - this.maxBuffer);
    }
    this.parseUsage(line);
    return entry;
  }

  /** Nhận diện dòng usage của core và cộng dồn vào stats. */
  private parseUsage(line: string): void {
    const m = line.match(USAGE_RE);
    if (!m) return;
    const command = m.groups?.command ?? '';
    const guild = m.groups?.guild ?? '';
    const moduleName = line.match(USAGE_MODULE_RE)?.[1] ?? '-';
    this.usageTotal++;
    this.usageCommand.set(command, (this.usageCommand.get(command) ?? 0) + 1);
    this.usageGuild.set(guild, (this.usageGuild.get(guild) ?? 0) + 1);
    this.usage.set(moduleName, (this.usage.get(moduleName) ?? 0) + 1);
  }
}

function sortedEntries(map: Map<string, number>): UsageStatEntry[] {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
}