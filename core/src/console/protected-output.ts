/**
 * core/console/protected-output — chặn log ghi đè lên prompt REPL (CLAUDE.md § console).
 * EN: Guards the REPL prompt from interleaved log output.
 *
 * Logger ghi thẳng ra stdout nên khi console TTY đang hiện prompt `averon`, dòng log bị chèn
 * giữa prompt + input. Guard ghi log bằng cách: xoá dòng hiện tại (`\r\x1b[2K`) → in log → render
 * lại prompt. Non-TTY / chưa kích hoạt → ghi thẳng như bình thường.
 */
import type { Writable } from 'node:stream';
import { colorizeLevel } from '../../../shared/logger/index.js';

export class ProtectedOutput {
  private active = false;
  private renderPrompt: () => void = () => {};

  constructor(
    private readonly stream: Writable,
    private readonly color = false,
  ) {}

  /** Bật/tắt chế độ bảo vệ — console gọi khi TTY bắt đầu/kết thúc hiện prompt. */
  setActive(active: boolean): void {
    this.active = active;
  }

  /** Đăng ký hàm render lại prompt (rl.prompt()) — gọi sau mỗi dòng log khi hệ thống active. */
  setRenderer(render: () => void): void {
    this.renderPrompt = render;
  }

  /** Ghi thẳng, không qua bảo vệ — output lệnh console + render prompt của readline. */
  writeRaw(text: string): void {
    this.stream.write(text);
  }

  /** Ghi dòng log: active → xoá dòng + log + render lại prompt; không active → ghi bình thường. */
  writeLog(line: string): void {
    const output = this.color ? colorizeLevel(line) : line;
    if (this.active) {
      this.stream.write(`\r\u001b[2K${output}\n`);
      this.renderPrompt();
    } else {
      this.stream.write(`${output}\n`);
    }
  }
}