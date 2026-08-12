import { describe, it, expect } from 'vitest';
import { parseConsoleCommand } from './parser.js';

describe('parseConsoleCommand', () => {
  it('parse averon status / help', () => {
    expect(parseConsoleCommand('averon status')).toEqual({ ok: true, command: { kind: 'status' } });
    expect(parseConsoleCommand('averon help')).toEqual({ ok: true, command: { kind: 'help' } });
  });

  it('quick command -help / -h = shorthand cho averon help (có whitespace)', () => {
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

  it('parse averon modules list / status', () => {
    expect(parseConsoleCommand('averon modules list')).toEqual({ ok: true, command: { kind: 'modulesList' } });
    expect(parseConsoleCommand('averon modules status')).toEqual({ ok: true, command: { kind: 'modulesStatus' } });
  });

  it('parse averon modules load <name>', () => {
    expect(parseConsoleCommand('averon modules load ping')).toEqual({ ok: true, command: { kind: 'modulesLoad', module: 'ping' } });
  });

  it('parse unload/reload với --force', () => {
    expect(parseConsoleCommand('averon modules unload ping --force')).toEqual({ ok: true, command: { kind: 'modulesUnload', module: 'ping', force: true } });
    expect(parseConsoleCommand('averon modules unload ping')).toEqual({ ok: true, command: { kind: 'modulesUnload', module: 'ping', force: false } });
    expect(parseConsoleCommand('averon modules reload ping --force')).toEqual({ ok: true, command: { kind: 'modulesReload', module: 'ping', force: true } });
    expect(parseConsoleCommand('averon modules reload ping')).toEqual({ ok: true, command: { kind: 'modulesReload', module: 'ping', force: false } });
  });

  it('reject: thiếu prefix averon', () => {
    const r = parseConsoleCommand('status');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('averon');
  });

  it('reject: dòng rỗng', () => {
    const r = parseConsoleCommand('   ');
    expect(r.ok).toBe(false);
  });

  it('reject: missing module name', () => {
    const r = parseConsoleCommand('averon modules unload');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('missing module name');
  });

  it('reject: --force không hợp lệ cho load', () => {
    const r = parseConsoleCommand('averon modules load ping --force');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('--force');
  });

  it('reject: unknown flag', () => {
    expect(parseConsoleCommand('averon modules unload ping --bogus').ok).toBe(false);
  });

  it('reject: unknown command / subcommand', () => {
    expect(parseConsoleCommand('averon nope').ok).toBe(false);
    expect(parseConsoleCommand('averon modules bogus').ok).toBe(false);
  });

  it('reject: thừa arguments', () => {
    expect(parseConsoleCommand('averon status extra').ok).toBe(false);
    expect(parseConsoleCommand('averon modules list extra').ok).toBe(false);
    expect(parseConsoleCommand('averon modules unload ping --force extra').ok).toBe(false);
  });
});
