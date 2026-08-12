/**
 * core/console — operator console: REPL đọc stdin, chạy lệnh `averon ...` (CLAUDE.md § console).
 * EN: core/console — operator console: stdin REPL for `averon ...` commands.
 *
 * - input/output injectable (mặc định process.stdin/stdout) để test bằng PassThrough.
 * - TTY: hiện prompt `averon> `. Non-TTY (piped/CI/watchdog): đọc dòng tới EOF, không prompt,
 *   không fatal — bot vẫn chạy bình thường.
 */
import { createInterface, type Interface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { parseConsoleCommand } from './parser.js';
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
}

export class OperatorConsole {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly prompt: string;
  private rl?: Interface;
  private closed = false;

  constructor(private readonly opts: OperatorConsoleOptions) {
    this.input = opts.input ?? process.stdin;
    this.output = opts.output ?? process.stdout;
    this.prompt = opts.prompt ?? 'averon> ';
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
      void this.handleLine(line);
    });
    rl.on('close', () => this.stop());

    if (terminal) rl.prompt();
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    this.rl?.close();
    this.opts.logger.info('Operator console closed');
  }

  private async handleLine(line: string): Promise<void> {
    try {
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

    const terminal = Boolean((this.input as { isTTY?: boolean }).isTTY);
    if (terminal && !this.closed) this.rl?.prompt();
  }

  private write(text: string): void {
    if (this.closed) return;
    this.output.write(text);
  }
}
