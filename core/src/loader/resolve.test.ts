import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveModuleFile } from './resolve.js';

function makeFixture(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'averon-resolve-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('resolveModuleFile', () => {
  it('runningFromDist=false → giữ nguyên file source (dev/tsx import .ts)', () => {
    const fx = makeFixture({ 'modules/ping/commands/ping.ts': 'x' });
    try {
      const result = resolveModuleFile({
        runningFromDist: false,
        root: fx.dir,
        moduleDir: join(fx.dir, 'modules', 'ping'),
        relative: 'commands/ping.ts',
      });
      expect(result).toBe(join(fx.dir, 'modules', 'ping', 'commands', 'ping.ts'));
    } finally {
      fx.cleanup();
    }
  });

  it('runningFromDist=true + file built tồn tại → map sang dist/modules/<name>/<file>.js', () => {
    const fx = makeFixture({
      'modules/ping/commands/ping.ts': 'source',
      'dist/modules/ping/commands/ping.js': 'built',
    });
    try {
      const result = resolveModuleFile({
        runningFromDist: true,
        root: fx.dir,
        moduleDir: join(fx.dir, 'modules', 'ping'),
        relative: 'commands/ping.ts',
      });
      expect(result).toBe(join(fx.dir, 'dist', 'modules', 'ping', 'commands', 'ping.js'));
    } finally {
      fx.cleanup();
    }
  });

  it('runningFromDist=true + file built thiếu → fallback về source (import() sẽ báo lỗi rõ)', () => {
    const fx = makeFixture({ 'modules/ping/commands/ping.ts': 'source' });
    try {
      const result = resolveModuleFile({
        runningFromDist: true,
        root: fx.dir,
        moduleDir: join(fx.dir, 'modules', 'ping'),
        relative: 'commands/ping.ts',
      });
      expect(result).toBe(join(fx.dir, 'modules', 'ping', 'commands', 'ping.ts'));
    } finally {
      fx.cleanup();
    }
  });

  it('runningFromDist=true + relative không phải .ts (vd yml) → giữ nguyên, không đổi đuôi', () => {
    const fx = makeFixture({});
    try {
      const result = resolveModuleFile({
        runningFromDist: true,
        root: fx.dir,
        moduleDir: join(fx.dir, 'modules', 'ping'),
        relative: 'config/schema.yml',
      });
      expect(result).toBe(join(fx.dir, 'modules', 'ping', 'config', 'schema.yml'));
    } finally {
      fx.cleanup();
    }
  });
});
