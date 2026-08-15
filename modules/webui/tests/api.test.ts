/**
 * Test api — module action, shared guilds.
 * EN: API tests — module actions, shared guilds.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getPublicModules, getSharedGuilds, runModuleAction } from '../src/api.js';
import { cleanupTempRoot, makeDiscordMock, makeManagerMock, makeRegistry, makeTempRoot } from './helpers.js';

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