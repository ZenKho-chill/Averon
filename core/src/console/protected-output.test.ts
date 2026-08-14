import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { ProtectedOutput } from './protected-output.js';

describe('ProtectedOutput', () => {
  it('không active → writeLog ghi thẳng, không clear dòng / render prompt', () => {
    const stream = new PassThrough();
    const guard = new ProtectedOutput(stream);
    const render = vi.fn();
    guard.setRenderer(render);
    let buf = '';
    stream.on('data', (c) => (buf += c.toString()));
    guard.writeLog('[INFO] hello');
    expect(buf).toBe('[INFO] hello\n');
    expect(render).not.toHaveBeenCalled();
  });

  it('active → xoá dòng hiện tại + ghi log + render lại prompt', () => {
    const stream = new PassThrough();
    const guard = new ProtectedOutput(stream);
    const render = vi.fn();
    guard.setRenderer(render);
    guard.setActive(true);
    let buf = '';
    stream.on('data', (c) => (buf += c.toString()));
    guard.writeLog('[INFO] hello');
    expect(buf).toBe('\r\u001b[2K[INFO] hello\n');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('tắt active → writeLog về ghi thẳng', () => {
    const stream = new PassThrough();
    const guard = new ProtectedOutput(stream);
    guard.setActive(true);
    guard.setActive(false);
    let buf = '';
    stream.on('data', (c) => (buf += c.toString()));
    guard.writeLog('[INFO] hello');
    expect(buf).toBe('[INFO] hello\n');
  });

  it('writeRaw ghi thẳng, không kèm clear (output lệnh / prompt render)', () => {
    const stream = new PassThrough();
    const guard = new ProtectedOutput(stream);
    guard.setActive(true);
    let buf = '';
    stream.on('data', (c) => (buf += c.toString()));
    guard.writeRaw('averon> ');
    expect(buf).toBe('averon> ');
  });

  it('color=true → writeLog tô màu token [LEVEL]', () => {
    const stream = new PassThrough();
    const guard = new ProtectedOutput(stream, true);
    let buf = '';
    stream.on('data', (c) => (buf += c.toString()));
    guard.writeLog('[WARN] careful');
    expect(buf).toContain('\u001b[');
    expect(buf).toContain('careful');
  });
});