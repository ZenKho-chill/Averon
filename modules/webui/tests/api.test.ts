/**
 * Test api — mask secret, module action, config save (validate+backup+write+reload), crash reports,
 * backups (list/restore), shared guilds.
 * EN: API tests — secret masking, module actions, config save, crash reports, backups, shared guilds.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  getPublicModules,
  getSharedGuilds,
  listBackups,
  maskYamlContent,
  readConfigs,
  readCrashReport,
  readCrashReports,
  restoreBackup,
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

describe('readCrashReports', () => {
  it('liệt kê crash report mới nhất trước; thiếu thư mục → rỗng', () => {
    const root = tempRoot();
    expect(readCrashReports(root)).toEqual([]);

    mkdirSync(join(root, 'crash-reports'));
    writeFileSync(join(root, 'crash-reports', 'crash-1.json'), '{}', 'utf8');
    writeFileSync(join(root, 'crash-reports', 'crash-2.json'), '{}', 'utf8');
    const reports = readCrashReports(root);
    expect(reports).toHaveLength(2);
    expect(reports[0].file).toBe('crash-2.json'); // mới nhất trước
  });

  it('readCrashReport đọc nội dung; chặn path traversal + file không hợp lệ', () => {
    const root = tempRoot();
    mkdirSync(join(root, 'crash-reports'));
    writeFileSync(join(root, 'crash-reports', 'crash-1.json'), '{"error":"boom"}', 'utf8');

    expect(readCrashReport(root, 'crash-1.json')).toContain('boom');
    expect(readCrashReport(root, '..%2F..%2Fconfig.yml')).toBeNull();
    expect(readCrashReport(root, '../config.yml')).toBeNull();
    expect(readCrashReport(root, 'not-a-crash.json')).toBeNull();
    expect(readCrashReport(root, 'crash-1.txt')).toBeNull();
  });
});

describe('listBackups / restoreBackup', () => {
  function seedCoreBackup(root: string, fileName: string, content: string): void {
    mkdirSync(join(root, 'config', 'backups'), { recursive: true });
    writeFileSync(join(root, 'config', 'backups', fileName), content, 'utf8');
  }

  function seedModuleBackup(root: string, mod: string, fileName: string, content: string): void {
    mkdirSync(join(root, 'modules', mod, 'config', 'backups'), { recursive: true });
    writeFileSync(join(root, 'modules', mod, 'config', 'backups', fileName), content, 'utf8');
  }

  it('listBackups trả core + module, chỉ module có backup', () => {
    const root = tempRoot();
    seedCoreBackup(root, 'config-2026-08-15_10-00-00.bak', 'discord:\n  token: "x"');
    seedModuleBackup(root, 'testmod', 'module-testmod-2026-08-15_10-00-00.bak', 'port: 3000');

    const registry = makeRegistry({
      registry: { getAllModules: () => [
        { name: 'testmod', commands: [], events: [] },
        { name: 'nobackup', commands: [], events: [] },
      ] },
    });
    const { core, modules } = listBackups(root, registry);
    expect(core).toHaveLength(1);
    expect(core[0].file).toContain('config-');
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('testmod');
    expect(modules[0].backups[0].file).toContain('module-testmod-');
  });

  it('restoreBackup core: validate → khôi phục file config.yml', async () => {
    const root = tempRoot();
    seedTempRoot(root);
    seedCoreBackup(root, 'config-2026-08-15_10-00-00.bak', VALID_CORE_YAML.replace('test-token-123', 'restored-token-999'));

    const result = await restoreBackup(root, makeRegistry({}), { scope: 'core', file: 'config-2026-08-15_10-00-00.bak' });
    expect(result.ok).toBe(true);
    expect(readFileSync(join(root, 'config', 'config.yml'), 'utf8')).toContain('restored-token-999');
  });

  it('restoreBackup module: validate → khôi phục defaults.yml + reload module', async () => {
    const root = tempRoot();
    const modDir = join(root, 'modules', 'testmod');
    mkdirSync(join(modDir, 'config'), { recursive: true });
    writeFileSync(join(modDir, 'module.yml'), 'name: testmod\nversion: 1.0.0\nconfig:\n  schema: config/schema.yml', 'utf8');
    writeFileSync(join(modDir, 'config', 'schema.yml'), 'type: object\nadditionalProperties: false\nproperties:\n  port:\n    type: integer\n', 'utf8');
    writeFileSync(join(modDir, 'config', 'defaults.yml'), 'port: 3000', 'utf8');
    seedModuleBackup(root, 'testmod', 'module-testmod-2026-08-15_10-00-00.bak', 'port: 8080');

    let reloadCalled = false;
    const manager = {
      ...makeManagerMock(),
      reload: async (name: string) => { reloadCalled = true; return { ok: true, name }; },
    };
    const result = await restoreBackup(root, makeRegistry({ manager }), {
      scope: 'module',
      name: 'testmod',
      file: 'module-testmod-2026-08-15_10-00-00.bak',
    });
    expect(result.ok).toBe(true);
    expect(reloadCalled).toBe(true);
    expect(readFileSync(join(modDir, 'config', 'defaults.yml'), 'utf8')).toBe('port: 8080');
  });

  it('restoreBackup backup không hợp lệ theo schema → không ghi', async () => {
    const root = tempRoot();
    const modDir = join(root, 'modules', 'testmod');
    mkdirSync(join(modDir, 'config'), { recursive: true });
    writeFileSync(join(modDir, 'module.yml'), 'name: testmod\nversion: 1.0.0\nconfig:\n  schema: config/schema.yml', 'utf8');
    writeFileSync(join(modDir, 'config', 'schema.yml'), 'type: object\nadditionalProperties: false\nproperties:\n  port:\n    type: integer\n', 'utf8');
    writeFileSync(join(modDir, 'config', 'defaults.yml'), 'port: 3000', 'utf8');
    seedModuleBackup(root, 'testmod', 'module-testmod-2026-08-15_10-00-00.bak', 'port: "khong-phai-so"');

    const result = await restoreBackup(root, makeRegistry({}), { scope: 'module', name: 'testmod', file: 'module-testmod-2026-08-15_10-00-00.bak' });
    expect(result.ok).toBe(false);
    expect(readFileSync(join(modDir, 'config', 'defaults.yml'), 'utf8')).toBe('port: 3000');
  });

  it('restoreBackup chặn tên file traversal / không tồn tại', async () => {
    const root = tempRoot();
    seedTempRoot(root);
    expect((await restoreBackup(root, makeRegistry({}), { scope: 'core', file: '../config/config.yml' })).ok).toBe(false);
    expect((await restoreBackup(root, makeRegistry({}), { scope: 'core', file: 'config-ghost.bak' })).ok).toBe(false);
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
  it('liệt kê guild user đang là thành viên (kèm iconUrl + userCanManage)', async () => {
    const { client } = makeDiscordMock();
    const registry = makeRegistry({ discord: { getClient: () => client } });
    const guilds = await getSharedGuilds(registry, 'user-1');
    expect(guilds).toHaveLength(1);
    expect(guilds[0]).toMatchObject({
      id: '111',
      name: 'Test Guild',
      memberCount: 42,
      userCanManage: false,
    });
    expect(guilds[0].iconUrl).toBeNull(); // icon null trong mock
  });

  it('userCanManage true khi member có permission ManageGuild', async () => {
    const { client, guild } = makeDiscordMock();
    guild.members.cache.set('admin-1', { permissions: { has: (bit: bigint) => bit === 32n } });
    const registry = makeRegistry({ discord: { getClient: () => client } });
    const guilds = await getSharedGuilds(registry, 'admin-1');
    expect(guilds).toHaveLength(1);
    expect(guilds[0].userCanManage).toBe(true);
  });

  it('iconUrl dựng từ CDN khi guild có icon', async () => {
    const { client, guild } = makeDiscordMock();
    guild.icon = 'abc123';
    const registry = makeRegistry({ discord: { getClient: () => client } });
    const guilds = await getSharedGuilds(registry, 'user-1');
    expect(guilds[0].iconUrl).toBe('https://cdn.discordapp.com/icons/111/abc123.png?size=128');
  });

  it('user không phải thành viên → không trả guild', async () => {
    const { client } = makeDiscordMock();
    const registry = makeRegistry({ discord: { getClient: () => client } });
    const guilds = await getSharedGuilds(registry, 'stranger-999');
    expect(guilds).toHaveLength(0);
  });
});