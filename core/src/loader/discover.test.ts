import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverModuleDirs, resolveModuleDir, readModuleNameVersion } from './discover.js';

const MODULE_YML = 'name: ping\nversion: 1.0.0\nentry: src/index.ts\nruntime:\n  language: typescript\n';

/** Tạo cây thư mục tạm từ map rel-path → content, trả về root. */
function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'averon-discover-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe('discover', () => {
  it('discoverModuleDirs tìm dir có module.yml, bỏ qua file và dir không có module.yml', () => {
    const root = makeTree({
      'modules/ping/module.yml': MODULE_YML,
      'modules/empty/.keep': '',
      'modules/README.md': 'not a module',
    });
    expect(discoverModuleDirs(root)).toEqual([join(root, 'modules', 'ping')]);
  });

  it('discoverModuleDirs trả [] khi không có modules/', () => {
    const root = makeTree({ 'README.md': 'hi' });
    expect(discoverModuleDirs(root)).toEqual([]);
  });

  it('resolveModuleDir hit khi có module.yml, miss khi không', () => {
    const root = makeTree({ 'modules/ping/module.yml': MODULE_YML });
    expect(resolveModuleDir(root, 'ping')).toBe(join(root, 'modules', 'ping'));
    expect(resolveModuleDir(root, 'missing')).toBeUndefined();
  });

  it('readModuleNameVersion parse name/version', () => {
    const root = makeTree({ 'modules/ping/module.yml': MODULE_YML });
    expect(readModuleNameVersion(join(root, 'modules', 'ping'))).toEqual({ name: 'ping', version: '1.0.0' });
  });

  it('readModuleNameVersion undefined khi YAML lỗi', () => {
    const root = makeTree({ 'modules/bad/module.yml': 'name: [unclosed' });
    expect(readModuleNameVersion(join(root, 'modules', 'bad'))).toBeUndefined();
  });
});
