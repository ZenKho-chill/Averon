/**
 * Test api — mask secret, module action, config save (validate+backup+write+reload), logs, guilds.
 * EN: API tests — secret masking, module actions, config save, logs, shared guilds.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  getPublicModules,
  getSharedGuilds,
  maskYamlContent,
  readConfigs,
  readLogLines,
  runModuleAction,
  saveConfig,
} from '../src/api.js';
import { cleanupTempRoot, makeDiscordMock, makeManagerMock, makeRegistry, makeTempRoot, seedTempRoot, VALID_CORE_YAML } from './helpers.js';

let currentRoot = '';

afterEach(() => {
  if (currentRoot) {
    cleanupTempRoot(currentRoot);
    currentRoot = '';
  }
});

function tempRoot(): string {
  if (!currentRoot) {
    currentRoot = makeTempRoot();
  }
  return currentRoot;
}

describe('maskYamlContent', () => {
  it('mask giá trị của token/secret/password, giữ nguyên phần còn lại', () => {
    const content = 'discord:\n  token: "super-secret-123"\nlogging:\n  level: INFO\nwebui:\n  oauth2:\n    client_secret: "abc123"';
    const masked = maskYamlContent(content);
    expect(masked).not.toContain('super-secret-123');
    expect(masked).not.toContain('abc123');
    expect(masked).toContain('c123'); // giữ 4 ký tự cuối của abc123
    expect(masked).toContain('level: INFO');
  });

  it('không đụng dòng không phải secret', () => {
    const masked = maskYamlContent('port: 3000\nname: ping');
    expect(masked).toBe('port: 3000\nname: ping');
  });
});

describe('readLogLines', () => {
  it('đọc N dòng log mới nhất (giới hạn an toàn)', () => {
    const root = tempRoot();
    writeFileSync(join(root, 'logs', 'averon-2026-01-01.log'), ['a', 'b', 'c', 'd'].join('\n'), 'utf8');
    const lines = readLogLines(root, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0].line).toBe('c');
    expect(lines[0].file).toContain('.log');
  });

  it('không có thư mục logs → rỗng', () => {
    expect(readLogLines('C:/no-such-dir-xyz', 10)).toEqual([]);
  });
});

describe('runModuleAction', () => {
  it('load/unload/reload qua manager', async () => {
    const manager = makeManagerMock();
    const registry = makeRegistry({ manager });
    expect(await runModuleAction(registry, 'ping', 'load', false)).toMatchObject({ ok: true });
    expect(await runModuleAction(registry, 'ping', 'unload', false)).toMatchObject({ ok: true, outcome: 'unloaded' });
    expect(await runModuleAction(registry, 'ping', 'reload', false)).toMatchObject({ ok: true });
  });

  it('manager lỗi → ok:false kèm message', async () => {
    const manager = {
      load: async () => ({ ok: false, error: 'not found' }),
      unload: async () => ({ ok: false, error: 'nope' }),
      reload: async () => ({ ok: false, error: 'nope' }),
    };
    const registry = makeRegistry({ manager });
    expect(await runModuleAction(registry, 'x', 'load', false)).toMatchObject({ ok: false });
    expect((await runModuleAction(registry, 'x', 'load', false)).message).toContain('not found');
  });
});

describe('saveConfig (core)', () => {
  it('validate → backup → ghi file mới, core config yêu cầu restart', async () => {
    const root = tempRoot();
    seedTempRoot(root);
    const registry = makeRegistry({ manager: makeManagerMock() });

    const newContent = VALID_CORE_YAML.replace('test-token-123', 'new-token-456');
    const result = await saveConfig(root, registry, { scope: 'core', content: newContent });

    expect(result.ok).toBe(true);
    const written = readFileSync(join(root, 'config', 'config.yml'), 'utf8');
    expect(written).toContain('new-token-456');
    // Backup được tạo (có file .bak trong config/backups)
    const backupFiles = readdirSync(join(root, 'config', 'backups'));
    expect(backupFiles.some((f) => f.endsWith('.bak'))).toBe(true);
  });

  it('config không hợp lệ → không ghi, trả lỗi', async () => {
    const root = tempRoot();
    seedTempRoot(root);
    const original = readFileSync(join(root, 'config', 'config.yml'), 'utf8');
    const registry = makeRegistry({ manager: makeManagerMock() });

    const result = await saveConfig(root, registry, { scope: 'core', content: 'discord: 123' });
    expect(result.ok).toBe(false);
    // File không bị ghi đè
    expect(readFileSync(join(root, 'config', 'config.yml'), 'utf8')).toBe(original);
  });

  it('placeholder token trong config thật → bị từ chối (semantic)', async () => {
    const root = tempRoot();
    seedTempRoot(root);
    const registry = makeRegistry({ manager: makeManagerMock() });
    const result = await saveConfig(root, registry, {
      scope: 'core',
      content: VALID_CORE_YAML.replace('test-token-123', 'PASTE_DISCORD_TOKEN_HERE'),
    });
    expect(result.ok).toBe(false);
  });
});

describe('saveConfig (module)', () => {
  it('validate module schema → backup → ghi defaults.yml → reload module', async () => {
    const root = tempRoot();
    const modDir = join(root, 'modules', 'testmod');
    mkdirSync(join(modDir, 'config'), { recursive: true });
    writeFileSync(join(modDir, 'module.yml'), 'name: testmod\nversion: 1.0.0\nconfig:\n  schema: config/schema.yml', 'utf8');
    writeFileSync(
      join(modDir, 'config', 'schema.yml'),
      'type: object\nadditionalProperties: false\nproperties:\n  port:\n    type: integer\n',
      'utf8',
    );
    writeFileSync(join(modDir, 'config', 'defaults.yml'), 'port: 3000', 'utf8');

    let reloadCalled = false;
    const manager = {
      ...makeManagerMock(),
      reload: async (name: string) => {
        reloadCalled = true;
        return { ok: true, name };
      },
    };
    const registry = makeRegistry({ manager });

    const result = await saveConfig(root, registry, { scope: 'module', name: 'testmod', content: 'port: 8080' });
    expect(result.ok).toBe(true);
    expect(reloadCalled).toBe(true);
    expect(readFileSync(join(modDir, 'config', 'defaults.yml'), 'utf8')).toBe('port: 8080');
    const backupFiles = readdirSync(join(modDir, 'config', 'backups'));
    expect(backupFiles.some((f) => f.endsWith('.bak'))).toBe(true);
  });

  it('module config không hợp lệ theo schema → không ghi, không reload', async () => {
    const root = tempRoot();
    const modDir = join(root, 'modules', 'testmod');
    mkdirSync(join(modDir, 'config'), { recursive: true });
    writeFileSync(join(modDir, 'module.yml'), 'name: testmod\nversion: 1.0.0\nconfig:\n  schema: config/schema.yml', 'utf8');
    writeFileSync(
      join(modDir, 'config', 'schema.yml'),
      'type: object\nadditionalProperties: false\nproperties:\n  port:\n    type: integer\n',
      'utf8',
    );
    writeFileSync(join(modDir, 'config', 'defaults.yml'), 'port: 3000', 'utf8');

    let reloadCalled = false;
    const manager = {
      ...makeManagerMock(),
      reload: async (name: string) => {
        reloadCalled = true;
        return { ok: true, name };
      },
    };
    const registry = makeRegistry({ manager });

    const result = await saveConfig(root, registry, { scope: 'module', name: 'testmod', content: 'port: "not-a-number"' });
    expect(result.ok).toBe(false);
    expect(reloadCalled).toBe(false);
    expect(readFileSync(join(modDir, 'config', 'defaults.yml'), 'utf8')).toBe('port: 3000');
  });

  it('module không tồn tại trên đĩa → lỗi', async () => {
    const root = tempRoot();
    const registry = makeRegistry({ manager: makeManagerMock() });
    const result = await saveConfig(root, registry, { scope: 'module', name: 'ghost', content: 'port: 1' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ghost');
  });
});

describe('readConfigs', () => {
  it('trả core config + config từng module, token bị mask', () => {
    const root = tempRoot();
    seedTempRoot(root);
    const moduleEntry = { name: 'ping', commands: [], events: [] };
    const registrySvc = { getAllModules: () => [moduleEntry] };
    const registry = makeRegistry({ registry: registrySvc });

    const { core, modules } = readConfigs(root, registry);
    expect(core.path).toBe('config/config.yml');
    expect(core.content).not.toContain('test-token-123');
    expect(modules).toHaveLength(1);
    expect(modules[0].path).toBe('modules/ping/config/defaults.yml');
  });
});

describe('getPublicModules', () => {
  it('trả module công khai + description từ module.yml (vi)', () => {
    const root = tempRoot();
    const modDir = join(root, 'modules', 'ping');
    mkdirSync(modDir, { recursive: true });
    writeFileSync(
      join(modDir, 'module.yml'),
      'name: ping\nversion: 1.2.1\ndescription:\n  vi: "Lệnh kiểm tra"\n  en: "Ping command"\n',
      'utf8',
    );
    const registrySvc = {
      getAllModules: () => [
        { name: 'ping', version: '1.2.1', state: 'RUNNING', commands: [{ name: 'ping', handler: 'x' }], events: [] },
      ],
    };
    const registry = makeRegistry({ registry: registrySvc });

    const modules = getPublicModules(registry, root);
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({
      name: 'ping',
      version: '1.2.1',
      description: 'Lệnh kiểm tra',
      state: 'RUNNING',
      quarantined: false,
      commands: 1,
      events: 0,
    });
  });

  it('module thiếu module.yml → description rỗng, không crash', () => {
    const root = tempRoot();
    const registrySvc = {
      getAllModules: () => [{ name: 'ghost', version: '1.0.0', state: 'FAULTED', commands: [], events: [] }],
    };
    const registry = makeRegistry({ registry: registrySvc });
    const modules = getPublicModules(registry, root);
    expect(modules[0].description).toBe('');
    expect(modules[0].quarantined).toBe(true);
  });
});

describe('getSharedGuilds', () => {
  it('liệt kê guild user đang là thành viên', async () => {
    const { client } = makeDiscordMock();
    const registry = makeRegistry({ discord: { getClient: () => client } });
    const guilds = await getSharedGuilds(registry, 'user-1');
    expect(guilds).toHaveLength(1);
    expect(guilds[0].name).toBe('Test Guild');
  });

  it('user không phải thành viên → không trả guild', async () => {
    const { client } = makeDiscordMock();
    const registry = makeRegistry({ discord: { getClient: () => client } });
    const guilds = await getSharedGuilds(registry, 'stranger-999');
    expect(guilds).toHaveLength(0);
  });
});