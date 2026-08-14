import { describe, it, expect } from 'vitest';
import { parseConsoleCommand } from './parser.js';

describe('parseConsoleCommand', () => {
  it('Bare command — gõ thẳng status / help / modules (không prefix)', () => {
    expect(parseConsoleCommand('status')).toEqual({ ok: true, command: { kind: 'status' } });
    expect(parseConsoleCommand('  status  ')).toEqual({ ok: true, command: { kind: 'status' } });
    expect(parseConsoleCommand('help')).toEqual({ ok: true, command: { kind: 'help' } });
    expect(parseConsoleCommand('modules list')).toEqual({ ok: true, command: { kind: 'modulesList' } });
    expect(parseConsoleCommand('modules status')).toEqual({ ok: true, command: { kind: 'modulesStatus' } });
    expect(parseConsoleCommand('modules load ping')).toEqual({ ok: true, command: { kind: 'modulesLoad', module: 'ping' } });
    expect(parseConsoleCommand('modules unload ping --force')).toEqual({ ok: true, command: { kind: 'modulesUnload', module: 'ping', force: true } });
    expect(parseConsoleCommand('modules reload ping')).toEqual({ ok: true, command: { kind: 'modulesReload', module: 'ping', force: false } });
  });

  it('reject: prefix `averon` ĐÃ BỊ GỠ — báo rõ ràng', () => {
    for (const line of ['averon', 'averon status', 'averon modules list', 'averon help']) {
      const r = parseConsoleCommand(line);
      expect(r.ok, line).toBe(false);
      if (!r.ok) expect(r.error, line).toContain("'averon' prefix removed");
    }
  });

  it('quick command -help / -h = shorthand cho help (có whitespace)', () => {
    expect(parseConsoleCommand('-help')).toEqual({ ok: true, command: { kind: 'help' } });
    expect(parseConsoleCommand('-h')).toEqual({ ok: true, command: { kind: 'help' } });
    expect(parseConsoleCommand('  -help  ')).toEqual({ ok: true, command: { kind: 'help' } });
    expect(parseConsoleCommand('  -h  ')).toEqual({ ok: true, command: { kind: 'help' } });
  });

  it('reject: -help / -h không nhận argument', () => {
    const r = parseConsoleCommand('-help status');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("'-help' takes no arguments");
    const r2 = parseConsoleCommand('-h status');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain("'-h' takes no arguments");
  });

  it('reject: dòng rỗng', () => {
    const r = parseConsoleCommand('   ');
    expect(r.ok).toBe(false);
  });

  it('reject: missing module name', () => {
    const r = parseConsoleCommand('modules unload');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('missing module name');
  });

  it('reject: --force không hợp lệ cho load', () => {
    const r = parseConsoleCommand('modules load ping --force');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('--force');
  });

  it('reject: unknown flag', () => {
    expect(parseConsoleCommand('modules unload ping --bogus').ok).toBe(false);
  });

  it('reject: unknown command / subcommand', () => {
    expect(parseConsoleCommand('nope').ok).toBe(false);
    expect(parseConsoleCommand('modules bogus').ok).toBe(false);
  });

  it('reject: thừa arguments', () => {
    expect(parseConsoleCommand('status extra').ok).toBe(false);
    expect(parseConsoleCommand('modules list extra').ok).toBe(false);
    expect(parseConsoleCommand('modules unload ping --force extra').ok).toBe(false);
  });
});
