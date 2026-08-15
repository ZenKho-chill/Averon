/**
 * modules/webui/api — xử lý dữ liệu cho API routes (status, modules, config, logs).
 * EN: Data handlers for API routes (status, modules, config, logs).
 *
 * Chỉ dùng service qua registry.getService() — KHÔNG import core internal (§5.3).
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Status } from 'discord.js';
import { mask } from '../../../shared/utils/mask.js';
import type { RegistryLike } from '../../../core/src/registry/types.js';
import {
  ConfigError,
  backupConfig,
  listBackups as listSharedBackups,
  loadConfigFromContent,
  restoreConfig as restoreSharedConfig,
  validateSemantics,
} from '../../../shared/config/index.js';
import { loadSchema, validateConfig } from '../../../shared/config/validator.js';
import { validateModuleSemantics } from '../../../shared/config/module-semantic.js';
import { isSecretKey } from './config.js';

export interface ModuleInfo {
  name: string;
  version: string;
  state: string;
  quarantined: boolean;
  activeCount: number;
  commands: number;
  events: number;
}

/** Mask toàn bộ secret trong nội dung YAML (token/secret/password) trước khi trả ra web (§7.4). */
export function maskYamlContent(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(.+?)\s*$/);
      if (m && isSecretKey(m[2])) {
        const raw = m[3].replace(/^["']|["']$/g, '');
        return `${m[1]}${m[2]}: "${mask(raw)}"`;
      }
      return line;
    })
    .join('\n');
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

export interface ConfigFileView {
  path: string;
  content: string;
}

/** Đọc core + module configs (mask secret) cho Config tab. */
export function readConfigs(root: string, registry: RegistryLike): { core: ConfigFileView; modules: ConfigFileView[] } {
  const corePath = join(root, 'config', 'config.yml');
  const core = {
    path: 'config/config.yml',
    content: existsSync(corePath) ? maskYamlContent(readFileSync(corePath, 'utf8')) : '# config/config.yml chưa tồn tại — copy từ config.example.yml',
  };
  const registrySvc = registry.getService('registry');
  const modules = registrySvc.getAllModules()
    .map((m) => {
      const p = join(root, 'modules', m.name, 'config', 'defaults.yml');
      return {
        path: `modules/${m.name}/config/defaults.yml`,
        content: existsSync(p) ? maskYamlContent(readFileSync(p, 'utf8')) : '# không có config module',
      };
    });
  return { core, modules };
}

export interface SaveConfigBody {
  scope: 'core' | 'module';
  name?: string;
  content: string;
}

export interface SaveConfigResult {
  ok: boolean;
  message: string;
  backup?: string;
  reloaded?: boolean;
  errors?: string[];
}

/** Validate → backup → ghi config mới; reload module nếu là config module. */
export async function saveConfig(root: string, registry: RegistryLike, body: SaveConfigBody): Promise<SaveConfigResult> {
  if (typeof body.content !== 'string' || body.content.length === 0) {
    return { ok: false, message: 'Config rỗng' };
  }
  try {
    if (body.scope === 'core') {
      validateCoreConfig(root, body.content);
      const dir = join(root, 'config');
      const backup = backupConfig(dir, { type: 'core' });
      writeFileSync(join(dir, 'config.yml'), body.content, 'utf8');
      return {
        ok: true,
        message: 'Đã lưu config/config.yml — RESTART bot để áp dụng (core config không hot-reload).',
        backup: backup?.replaceAll('\\', '/') ?? undefined,
      };
    }

    // Scope module
    const name = body.name;
    if (!name) return { ok: false, message: 'Thiếu tên module' };
    const moduleDir = join(root, 'modules', name);
    if (!existsSync(join(moduleDir, 'module.yml'))) {
      return { ok: false, message: `Module '${name}' không tồn tại trên đĩa` };
    }
    validateModuleConfig(moduleDir, name, body.content);
    const backup = backupConfig(moduleDir, { type: 'module', name });
    writeFileSync(join(moduleDir, 'config', 'defaults.yml'), body.content, 'utf8');
    const reload = await runModuleAction(registry, name, 'reload', true);
    return {
      ok: reload.ok,
      message: reload.ok ? `Đã lưu + reload module '${name}'` : `Đã lưu config nhưng reload thất bại: ${reload.message}`,
      backup: backup?.replaceAll('\\', '/') ?? undefined,
      reloaded: reload.ok,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errors = err instanceof ConfigError ? message.split('\n').map((s) => s.trim()).filter(Boolean) : undefined;
    return { ok: false, message: `Lưu config thất bại: ${message}`, errors };
  }
}

/** Validate config core bằng core.schema.json + semantic (§6.4). */
export function validateCoreConfig(root: string, content: string): void {
  const config = loadConfigFromContent(content, { schema: join(root, 'config', 'schemas', 'core.schema.json'), file: 'config.yml' });
  validateSemantics(config as never, { file: 'config.yml' });
}

/** Validate config module bằng schema module + semantic. */
export function validateModuleConfig(moduleDir: string, name: string, content: string): void {
  const manifest = loadConfigFromContent<{ config?: { schema?: string } }>(readFileSync(join(moduleDir, 'module.yml'), 'utf8'));
  const config = loadConfigFromContent<Record<string, unknown>>(content, { file: `modules/${name}/config/defaults.yml` });
  if (manifest.config?.schema) {
    const schemaPath = join(moduleDir, manifest.config.schema);
    if (existsSync(schemaPath)) {
      validateConfig(config, loadSchema(schemaPath), [schemaPath]);
    }
  }
  validateModuleSemantics(config, manifest as never, name);
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

export interface CrashReportMeta {
  file: string;
  mtime: string;
  size: number;
}

/** Liệt kê crash report (crash-reports/, mới nhất trước) — §9.4. */
export function readCrashReports(root: string): CrashReportMeta[] {
  const dir = join(root, 'crash-reports');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((file) => {
      const p = join(dir, file);
      const st = statSync(p);
      return { file, mtime: st.mtime.toISOString(), size: st.size };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

/** Đọc nội dung 1 crash report — chống path traversal (chỉ tên file `crash-*.json`). */
export function readCrashReport(root: string, file: string): string | null {
  if (!/^crash-[\w.-]+\.json$/.test(file) || file.includes('..') || file.includes('/') || file.includes('\\')) return null;
  const p = join(root, 'crash-reports', file);
  if (!existsSync(p) || statSync(p).isDirectory()) return null;
  return readFileSync(p, 'utf8');
}

export interface BackupEntry {
  file: string;
  mtime: string;
}

/** Danh sách backup config core + từng module (§6.6). */
export function listBackups(
  root: string,
  registry: RegistryLike,
): { core: BackupEntry[]; modules: Array<{ name: string; backups: BackupEntry[] }> } {
  const core = listSharedBackups(join(root, 'config'), { type: 'core' }).map(({ file, mtime }) => ({ file, mtime }));
  const registrySvc = registry.getService('registry');
  const modules = registrySvc
    .getAllModules()
    .map((m) => ({
      name: m.name,
      backups: listSharedBackups(join(root, 'modules', m.name), { type: 'module', name: m.name }).map(
        ({ file, mtime }) => ({ file, mtime }),
      ),
    }))
    .filter((m) => m.backups.length > 0);
  return { core, modules };
}

export interface RestoreBackupBody {
  scope: 'core' | 'module';
  name?: string;
  file: string;
}

export interface RestoreBackupResult {
  ok: boolean;
  message: string;
  restored?: boolean;
  reloaded?: boolean;
  errors?: string[];
}

/** Validate backup → khôi phục config core/module từ file backup (§6.6); reload module sau khi khôi phục. */
export async function restoreBackup(
  root: string,
  registry: RegistryLike,
  body: RestoreBackupBody,
): Promise<RestoreBackupResult> {
  if (typeof body.file !== 'string' || body.file.length === 0 || body.file.includes('..') || body.file.includes('/') || body.file.includes('\\')) {
    return { ok: false, message: 'Tên file backup không hợp lệ' };
  }
  try {
    if (body.scope === 'core') {
      if (!/^config-.+\.bak$/.test(body.file)) return { ok: false, message: 'File không phải backup config core' };
      const backupsDir = join(root, 'config', 'backups');
      if (!existsSync(join(backupsDir, body.file))) return { ok: false, message: 'Không tìm thấy backup' };
      const content = readFileSync(join(backupsDir, body.file), 'utf8');
      validateCoreConfig(root, content);
      restoreSharedConfig(join(root, 'config'), body.file, { type: 'core' });
      return {
        ok: true,
        message: `Đã khôi phục config/config.yml từ '${body.file}' — RESTART bot để áp dụng (core config không hot-reload).`,
        restored: true,
      };
    }

    // Scope module
    const name = body.name;
    if (!name) return { ok: false, message: 'Thiếu tên module' };
    if (!/^module-.+\.bak$/.test(body.file)) return { ok: false, message: 'File không phải backup config module' };
    const moduleDir = join(root, 'modules', name);
    if (!existsSync(join(moduleDir, 'module.yml'))) {
      return { ok: false, message: `Module '${name}' không tồn tại trên đĩa` };
    }
    const backupsDir = join(moduleDir, 'config', 'backups');
    if (!existsSync(join(backupsDir, body.file))) return { ok: false, message: 'Không tìm thấy backup' };
    const content = readFileSync(join(backupsDir, body.file), 'utf8');
    validateModuleConfig(moduleDir, name, content);
    restoreSharedConfig(moduleDir, body.file, { type: 'module' });
    const reload = await runModuleAction(registry, name, 'reload', true);
    return {
      ok: reload.ok,
      message: reload.ok
        ? `Đã khôi phục config module '${name}' từ '${body.file}' + reload.`
        : `Đã khôi phục config nhưng reload thất bại: ${reload.message}`,
      restored: true,
      reloaded: reload.ok,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errors = err instanceof ConfigError ? message.split('\n').map((s) => s.trim()).filter(Boolean) : undefined;
    return { ok: false, message: `Khôi phục thất bại: ${message}`, errors };
  }
}