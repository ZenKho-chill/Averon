import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigError, deepMerge } from './index.js';
import type { AppConfig } from './types.js';

/** Tạo fixture config trong thư mục temp (tự dọn sau test). */
function makeFixture(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'averon-cfg-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('deepMerge', () => {
  it('merge sâu object con, array/giá trị đơn bị thay thế hoàn toàn', () => {
    const base = { a: 1, nested: { x: 1, y: 2 }, arr: [1, 2] };
    const override = { nested: { y: 3 }, arr: [9] };
    expect(deepMerge(base, override)).toEqual({ a: 1, nested: { x: 1, y: 3 }, arr: [9] });
  });
});

describe('loadConfig', () => {
  it('load config từ 1 file config.yml duy nhất', () => {
    const fx = makeFixture({ 'config.yml': 'app:\n  name: averon\n  version: 0.1.0\n' });
    try {
      const cfg = loadConfig({ configDir: fx.dir });
      expect(cfg).toMatchObject({ app: { name: 'averon', version: '0.1.0' } });
    } finally {
      fx.cleanup();
    }
  });

  it('file tùy chọn (options.file) — dùng cho config.example.yml', () => {
    const fx = makeFixture({ 'config.example.yml': 'app:\n  name: averon\n  version: 9.9.9\n' });
    try {
      const cfg = loadConfig({ configDir: fx.dir, file: 'config.example.yml' });
      expect(cfg).toMatchObject({ app: { version: '9.9.9' } });
    } finally {
      fx.cleanup();
    }
  });

  it('giá trị literal trong config được giữ nguyên + validate qua schema (file path)', () => {
    const fx = makeFixture({
      'config.yml': 'app:\n  name: averon\n  version: 0.1.0\n  token: my-token\n',
      'schema.json': JSON.stringify({
        type: 'object',
        required: ['app'],
        properties: {
          app: {
            type: 'object',
            required: ['name', 'version'],
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              token: { type: 'string' },
            },
          },
        },
      }),
    });
    try {
      const cfg = loadConfig<{ app: { token: string } }>({
        configDir: fx.dir,
        schema: join(fx.dir, 'schema.json'),
      });
      expect(cfg.app.token).toBe('my-token');
    } finally {
      fx.cleanup();
    }
  });

  it('config sai (thiếu required / sai enum) → ConfigError liệt kê field', () => {
    const fx = makeFixture({
      'config.yml': 'app:\n  name: 123\n  version: 0.1.0\nlevel: TRACE\n',
      'schema.json': JSON.stringify({
        type: 'object',
        required: ['app'],
        properties: {
          app: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
          level: { type: 'string', enum: ['DEBUG', 'INFO'] },
        },
      }),
    });
    try {
      expect(() =>
        loadConfig({ configDir: fx.dir, schema: join(fx.dir, 'schema.json') }),
      ).toThrow(ConfigError);
      expect(() =>
        loadConfig({ configDir: fx.dir, schema: join(fx.dir, 'schema.json') }),
      ).toThrow(/app\/name|level/);
    } finally {
      fx.cleanup();
    }
  });

  it('thiếu file config.yml → ConfigError rõ ràng kèm gợi ý copy example', () => {
    const fx = makeFixture({ 'other.yml': 'a: 1\n' });
    try {
      expect(() => loadConfig({ configDir: fx.dir })).toThrow(/config\.yml/);
      expect(() => loadConfig({ configDir: fx.dir })).toThrow(/config\.example\.yml/);
    } finally {
      fx.cleanup();
    }
  });
});

describe('loadConfig — integration với config thật của dự án (§6.5)', () => {
  const configDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config');

  it('config.example.yml load + validate qua schema', () => {
    const schemaFile = join(configDir, 'schemas', 'core.schema.json');
    const cfg = loadConfig<AppConfig>({ configDir, file: 'config.example.yml', schema: schemaFile });
    expect(cfg.app.name).toBe('averon');
    expect(cfg.app.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cfg.discord.register_commands.global).toBe(true);
    expect(cfg.discord.register_commands.guild).toBe(false);
    expect(cfg.discord.register_commands.user).toBe(false);
    expect(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).toContain(cfg.logging.level);
  });
});