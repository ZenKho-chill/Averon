/**
 * core/console — operator console: REPL đọc stdin, chạy lệnh `averon ...` (CLAUDE.md § console).
 * EN: core/console — operator console: stdin REPL for `averon ...` commands.
 *
 * - input/output injectable (mặc định process.stdin/stdout) để test bằng PassThrough.
 * - TTY: hiện prompt `averon`. Non-TTY (piped/CI/watchdog): đọc dòng tới EOF, không prompt,
 *   không fatal — bot vẫn chạy bình thường.
 */
import { createInterface, type Interface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { parseConsoleCommand } from './parser.js';
import type { ProtectedOutput } from './protected-output.js';
import {
  handleHelp,
  handleModulesList,
  handleModulesLoad,
  handleModulesReload,
  handleModulesStatus,
  handleModulesUnload,
  handleStatus,
  type ConsoleHandlerDeps,
} from './handlers.js';

export interface OperatorConsoleOptions extends ConsoleHandlerDeps {
  input?: Readable;
  output?: Writable;
  prompt?: string;
  /** Bảo vệ prompt khỏi log ghi đè (bootstrap tạo + truyền vào logger). Optional — test không dùng. */
  protectedOutput?: ProtectedOutput;
}

/**
 * Tên prompt từ config + hậu tố `> `. Config (`console.prompt`) chỉ khai báo tên gốc
 * (vd `averon`) — dấu `> ` tự thêm để nhìn rõ đang ở màn nhập lệnh.
 * EN: Prompt base from config plus the `> ` suffix. `console.prompt` holds only the base
 * name (e.g. `averon`) — `> ` is appended so it reads clearly as an input line.
 */
export function renderPrompt(base?: string): string {
  return `${base ?? 'averon'}> `;
}

export class OperatorConsole {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly prompt: string;
  private rl?: Interface;
  private closed = false;
  /** Chuỗi lệnh tuần tự — REPL xử lý 1 lệnh một, lệnh sau đợi lệnh trước xong. */
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly opts: OperatorConsoleOptions) {
    this.input = opts.input ?? process.stdin;
    this.output = opts.output ?? process.stdout;
    // Config `console.prompt` là tên gốc (vd `averon`) — `> ` được tự thêm khi render.
    // EN: config `console.prompt` is the base name (e.g. `averon`) — `> ` is appended automatically.
    this.prompt = renderPrompt(opts.prompt);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  start(): void {
    if (this.closed) return;
    const terminal = Boolean((this.input as { isTTY?: boolean }).isTTY);
    const rl = createInterface({ input: this.input, output: this.output, terminal });
    this.rl = rl;

    if (terminal) rl.setPrompt(this.prompt);
    rl.on('line', (line) => {
      // Tuần tự hoá: lệnh sau đợi lệnh trước hoàn tất — tránh race (vd load chạy khi unload còn DRAINING).
      // EN: serialize commands — each waits for the previous one, avoiding races (e.g. load while unload is still DRAINING).
      this.chain = this.chain
        .then(() => this.handleLine(line))
        .catch((err) => this.opts.logger.error('Operator console command thất bại', { error: err }));
    });
    rl.on('close', () => this.stop());

    if (terminal) {
      // Bật bảo vệ prompt — log của core (qua ProtectedOutput) không còn chèn vào dòng nhập CLI.
      // EN: enable prompt protection — core logs (via ProtectedOutput) no longer corrupt the input line.
      this.opts.protectedOutput?.setActive(true);
      this.opts.protectedOutput?.setRenderer(() => {
        if (!this.closed) this.rl?.prompt();
      });
      rl.prompt();
    }
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    this.rl?.close();
    this.opts.logger.info('Operator console closed');
  }

  private async handleLine(line: string): Promise<void> {
    try {
      // Bỏ qua Enter trống — không in `Error: empty input`, chỉ nhắc lại prompt.
      // EN: ignore empty lines — no `Error: empty input`, just re-prompt.
      if (!line.trim()) {
        this.rearmPrompt();
        return;
      }

      const parsed = parseConsoleCommand(line);
      if (!parsed.ok) {
        this.write(`Error: ${parsed.error}\n`);
      } else {
        const cmd = parsed.command;
        let out: string;
        switch (cmd.kind) {
          case 'status': out = handleStatus(this.opts); break;
          case 'modulesList': out = await handleModulesList(this.opts); break;
          case 'modulesStatus': out = handleModulesStatus(this.opts); break;
          case 'modulesLoad': out = await handleModulesLoad(this.opts, cmd.module); break;
          case 'modulesUnload': out = await handleModulesUnload(this.opts, cmd.module, cmd.force); break;
          case 'modulesReload': out = await handleModulesReload(this.opts, cmd.module, cmd.force); break;
          case 'help': out = handleHelp(); break;
        }
        this.write(out + '\n');
      }
    } catch (err) {
      this.opts.logger.error('Operator console command thất bại', { error: err });
      this.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    }

    this.rearmPrompt();
  }

  private rearmPrompt(): void {
    const terminal = Boolean((this.input as { isTTY?: boolean }).isTTY);
    if (terminal && !this.closed) this.rl?.prompt();
  }

  private write(text: string): void {
    if (this.closed) return;
    this.output.write(text);
  }
}
