/**
 * modules/webui/api — xử lý dữ liệu cho API routes (status, modules, logs, usage).
 * EN: Data handlers for API routes (status, modules, logs, usage).
 *
 * Chỉ dùng service qua registry.getService() — KHÔNG import core internal (§5.3).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Status } from 'discord.js';
import type { RegistryLike } from '../../../core/src/registry/types.js';
import { loadConfigFromContent } from '../../../shared/config/index.js';

export interface ModuleInfo {
  name: string;
  version: string;
  state: string;
  quarantined: boolean;
  activeCount: number;
  commands: number;
  events: number;
}

/** Status công khai (homepage) — thông tin tối thiểu, không lộ internals. */
export function getPublicStatus(registry: RegistryLike): Record<string, unknown> {
  const appConfig = registry.getService('config');
  const discord = registry.getService('discord');
  const client = discord.getClient();
  const registrySvc = registry.getService('registry');
  const online = client.isReady();
  const moduleCfg = registry.getModule('webui').getConfig?.() ?? {};
  return {
    name: appConfig.app.name,
    version: appConfig.app.version,
    online,
    uptime: Math.floor(process.uptime()),
    guilds: online ? client.guilds.cache.size : 0,
    modules: registrySvc.getAllModules().length,
    inviteUrl: typeof moduleCfg.invite_url === 'string' ? moduleCfg.invite_url : '',
  };
}

/** Module công khai cho homepage — metadata an toàn (name/version/description/state), không lộ internals. */
export interface PublicModuleInfo {
  name: string;
  version: string;
  description: string;
  state: string;
  quarantined: boolean;
  commands: number;
  events: number;
}

/** Danh sách module (công khai) cho homepage — đọc description từ module.yml trên đĩa (metadata, §5.3). */
export function getPublicModules(registry: RegistryLike, root: string): PublicModuleInfo[] {
  const registrySvc = registry.getService('registry');
  return registrySvc.getAllModules().map((m) => ({
    name: m.name,
    version: m.version,
    description: readModuleDescription(root, m.name),
    state: m.state,
    quarantined: m.state === 'FAULTED',
    commands: m.commands.length,
    events: m.events.length,
  }));
}

/** Đọc `description` (vi/en) từ module.yml — chỉ đọc metadata trên đĩa, không import code module khác. */
function readModuleDescription(root: string, name: string): string {
  try {
    const p = join(root, 'modules', name, 'module.yml');
    if (!existsSync(p)) return '';
    const manifest = loadConfigFromContent<{ description?: Record<string, string> | string }>(readFileSync(p, 'utf8'));
    const desc = manifest.description;
    if (!desc) return '';
    if (typeof desc === 'string') return desc;
    return desc.vi || desc.en || '';
  } catch {
    return '';
  }
}

/** Status đầy đủ (admin) — ping, ws status, guilds, modules... */
export function getAdminStatus(registry: RegistryLike): Record<string, unknown> {
  const appConfig = registry.getService('config');
  const discord = registry.getService('discord');
  const client = discord.getClient();
  const registrySvc = registry.getService('registry');
  const online = client.isReady();
  const modules = registrySvc.getAllModules();
  return {
    name: appConfig.app.name,
    version: appConfig.app.version,
    online,
    uptime: Math.floor(process.uptime()),
    discord: {
      ready: online,
      ws: online ? Status[client.ws.status] : Status[client.ws.status],
      ping: online ? client.ws.ping : null,
      guilds: online ? client.guilds.cache.size : 0,
      uptime: online ? Math.floor(client.uptime ?? 0) : 0,
    },
    modules: {
      registered: modules.length,
      running: modules.filter((m) => m.state === 'RUNNING').length,
      faulted: modules.filter((m) => m.state === 'FAULTED').length,
    },
  };
}

/** Danh sách module với trạng thái chi tiết (admin). */
export function getModules(registry: RegistryLike): ModuleInfo[] {
  const registrySvc = registry.getService('registry');
  const usage = registry.getService('usage');
  return registrySvc.getAllModules().map((m) => ({
    name: m.name,
    version: m.version,
    state: m.state,
    quarantined: m.state === 'FAULTED',
    activeCount: usage.activeCount(m.name),
    commands: m.commands.length,
    events: m.events.length,
  }));
}

export type ModuleAction = 'load' | 'unload' | 'reload';

/** Gọi manager.load/unload/reload (soft mặc định; `force` bỏ qua chờ in-flight). */
export async function runModuleAction(
  registry: RegistryLike,
  name: string,
  action: ModuleAction,
  force: boolean,
): Promise<{ ok: boolean; message: string; outcome?: string }> {
  const manager = registry.getService('manager');
  try {
    if (action === 'load') {
      const r = await manager.load(name);
      return { ok: r.ok, message: r.ok ? `Loaded module '${name}'` : `Error: ${r.error}` };
    }
    if (action === 'unload') {
      const r = await manager.unload(name, { force });
      if (!r.ok) return { ok: false, message: `Error: ${r.error}` };
      return { ok: true, message: r.outcome === 'draining' ? `Module '${name}' draining: ${r.message}` : `Unloaded module '${name}'`, outcome: r.outcome };
    }
    const r = await manager.reload(name, { force });
    return { ok: r.ok, message: r.ok ? `Reloaded module '${name}'` : `Error: ${r.error}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export interface SharedGuild {
  id: string;
  name: string;
  icon: string | null;
  iconUrl: string | null;
  memberCount: number;
  /** User có quyền ManageGuild trong guild này (best-effort). */
  userCanManage: boolean;
}

/** Danh sách guild dùng chung giữa bot và user (dashboard user). */
export async function getSharedGuilds(
  registry: RegistryLike,
  userId: string,
): Promise<SharedGuild[]> {
  const discord = registry.getService('discord');
  const client = discord.getClient();
  if (!client.isReady()) return [];
  const shared: SharedGuild[] = [];
  for (const guild of client.guilds.cache.values()) {
    let member = guild.members?.cache?.get(userId);
    if (!member) {
      // Best-effort: fetch membership (cache-friendly). Lỗi → coi như không phải thành viên.
      // EN: Best-effort membership check; on error treat as not a member.
      try {
        await guild.members.fetch({ user: userId, force: false });
        member = guild.members?.cache?.get(userId);
      } catch {
        member = undefined;
      }
    }
    if (!member) continue;
    shared.push({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ?? null,
      iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null,
      memberCount: guild.memberCount,
      userCanManage: canManageGuild(member),
    });
  }
  return shared;
}

/** ManageGuild bit (PermissionFlagsBits.ManageGuild = 1n << 5n) — best-effort trên mọi hình thái permissions. */
function canManageGuild(member: unknown): boolean {
  const manageGuild = 1n << 5n;
  try {
    const perms = (member as { permissions?: unknown }).permissions;
    if (perms === undefined || perms === null) return false;
    if (typeof perms === 'bigint') return (perms & manageGuild) !== 0n;
    if (typeof perms === 'number') return (perms & Number(manageGuild)) !== 0;
    const has = (perms as { has?: (b: bigint) => boolean }).has;
    if (typeof has === 'function') return has(manageGuild);
    return false;
  } catch {
    return false;
  }
}