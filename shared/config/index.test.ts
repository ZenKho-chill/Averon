import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigError, resolveEnv, deepMerge, interpolateString } from './index.js';
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

describe('resolveEnv', () => {
  it('mặc định là "dev" khi không có biến nào', () => {
    expect(resolveEnv({ envSource: {} })).toBe('dev');
  });

  it('ưu tiên AVERON_ENV rồi NODE_ENV', () => {
    expect(resolveEnv({ envSource: { AVERON_ENV: 'prod', NODE_ENV: 'test' } })).toBe('prod');
    expect(resolveEnv({ envSource: { NODE_ENV: 'test' } })).toBe('test');
  });

  it('option.env override toàn bộ', () => {
    expect(resolveEnv({ env: 'staging', envSource: { AVERON_ENV: 'prod' } })).toBe('staging');
  });
});

describe('deepMerge', () => {
  it('merge sâu object con, array/giá trị đơn bị thay thế hoàn toàn', () => {
    const base = { a: 1, nested: { x: 1, y: 2 }, arr: [1, 2] };
    const override = { nested: { y: 3 }, arr: [9] };
    expect(deepMerge(base, override)).toEqual({ a: 1, nested: { x: 1, y: 3 }, arr: [9] });
  });
});

describe('interpolateString', () => {
  const env: Record<string, string | undefined> = { A: 'real', B: '' };

  it('thay ${VAR} bằng giá trị env', () => {
    expect(interpolateString('${A}', env)).toBe('real');
  });

  it('dùng default khi biến trống/thiếu (${VAR:-default})', () => {
    expect(interpolateString('${B:-x}', env)).toBe('x');
    expect(interpolateString('${C:-y}', env)).toBe('y');
  });

  it('${VAR:-} trả chuỗi rỗng cho secret tùy chọn', () => {
    expect(interpolateString('${C:-}', env)).toBe('');
  });

  it('${VAR} thiếu biến → ném lỗi fail-fast', () => {
    expect(() => interpolateString('${C}', env)).toThrow(/C/);
  });
});

describe('loadConfig', () => {
  it('chỉ dùng default.yml khi file env không tồn tại', () => {
    const fx = makeFixture({ 'default.yml': 'app:\n  name: averon\n  version: 0.1.0\n' });
    try {
      const cfg = loadConfig({ configDir: fx.dir, env: 'staging' });
      expect(cfg).toMatchObject({ app: { name: 'averon', version: '0.1.0' } });
    } finally {
      fx.cleanup();
    }
  });

  it('merge default.yml + <env>.yml (env override)', () => {
    const fx = makeFixture({
      'default.yml': 'app:\n  name: averon\n  version: 0.1.0\ndiscord:\n  intents: [Guilds]\n',
      'prod.yml': 'app:\n  version: 9.9.9\ndiscord:\n  intents: [Guilds, MessageContent]\n',
    });
    try {
      const cfg = loadConfig({ configDir: fx.dir, env: 'prod' });
      expect(cfg).toMatchObject({
        app: { name: 'averon', version: '9.9.9' },
        discord: { intents: ['Guilds', 'MessageContent'] },
      });
    } finally {
      fx.cleanup();
    }
  });

  it('interpolate ${VAR} từ envSource + schema (file path)', () => {
    const fx = makeFixture({
      'default.yml': 'app:\n  name: averon\n  version: 0.1.0\n  token: ${TOKEN:-}\n',
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
      expect(cfg.app.token).toBe('');
    } finally {
      fx.cleanup();
    }
  });

  it('config sai (thiếu required / sai enum) → ConfigError liệt kê field', () => {
    const fx = makeFixture({
      'default.yml': 'app:\n  name: 123\n  version: 0.1.0\nlevel: TRACE\n',
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

  it('thiếu file config → ConfigError rõ ràng', () => {
    const fx = makeFixture({ 'other.yml': 'a: 1\n' });
    try {
      expect(() => loadConfig({ configDir: fx.dir })).toThrow(/default\.yml/);
    } finally {
      fx.cleanup();
    }
  });
});

describe('loadConfig — integration với config thật của dự án (§6.5)', () => {
  const configDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config');
  const schemaFile = join(configDir, 'schemas', 'core.schema.json');

  it('default/dev/prod đều load + validate qua schema', () => {
    for (const env of ['dev', 'prod']) {
      const cfg = loadConfig<AppConfig>({ configDir, env, schema: schemaFile });
      expect(cfg.app.name).toBe('averon');
      expect(cfg.app.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).toContain(cfg.logging.level);
    }
  });
});
