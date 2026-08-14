/**
 * core/console/handlers — render output cho từng lệnh console (dùng chung Manager/status).
 * EN: core/console/handlers — render operator-console command output.
 */
import { Status } from 'discord.js';
import type { Logger } from '../../../shared/logger/index.js';
import type { AppConfig } from '../config/index.js';
import type { Registry } from '../registry/index.js';
import type { UsageTracker } from '../registry/usage.js';
import type { DiscordClient } from '../discord/index.js';
import type { ModuleManager } from './manager.js';
import { isQuarantined } from '../crash/index.js';
import { discoverModuleDirs, readModuleNameVersion } from '../loader/discover.js';

export interface ConsoleHandlerDeps {
  config: AppConfig;
  registry: Registry;
  discord: DiscordClient;
  usage: UsageTracker;
  manager: ModuleManager;
  logger: Logger;
  root: string;
  bootTimestamp: number;
}

/** Bảng text đơn giản, cột monospace (padEnd). */
export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  return [line(headers), sep, ...rows.map(line)].join('\n');
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function handleStatus(d: ConsoleHandlerDeps): string {
  const { config } = d;
  const client = d.discord.getClient();
  const lines: string[] = [];

  lines.push(`${config.app.name} v${config.app.version}`);
  lines.push(`Uptime: ${formatDuration(Date.now() - d.bootTimestamp)}`);

  if (client.isReady()) {
    const wsName = Status[client.ws.status];
    lines.push(`Discord: ready (ws=${wsName}) | ping ${client.ws.ping}ms | guilds ${client.guilds.cache.size} | uptime ${formatDuration(client.uptime ?? 0)}`);
  } else {
    const wsName = Status[client.ws.status];
    lines.push(`Discord: not ready (ws=${wsName})`);
  }

  lines.push(`Modules: ${d.registry.getAllModules().length} registered`);
  return lines.join('\n');
}

export function handleModulesList(d: ConsoleHandlerDeps): string {
  const dirs = discoverModuleDirs(d.root);
  if (dirs.length === 0) return 'No modules found on disk.';

  const rows: string[][] = [];
  for (const dir of dirs) {
    const info = readModuleNameVersion(dir);
    if (!info) continue;
    const loaded = d.registry.hasModule(info.name) && !['UNLOADED', 'FAULTED'].includes(d.registry.getModule(info.name).state);
    rows.push([info.name, info.version, loaded ? 'yes' : 'no']);
  }
  return formatTable(['NAME', 'VERSION', 'LOADED'], rows);
}

export function handleModulesStatus(d: ConsoleHandlerDeps): string {
  const modules = d.registry.getAllModules();
  if (modules.length === 0) return 'No modules registered.';

  const rows = modules.map((m) => [
    m.name,
    m.version,
    m.state,
    isQuarantined(m.name) ? 'yes' : 'no',
    String(d.usage.activeCount(m.name)),
    String(m.commands.length),
  ]);
  return formatTable(['NAME', 'VERSION', 'STATE', 'QUARANTINED', 'ACTIVE', 'CMDS'], rows);
}

export async function handleModulesLoad(d: ConsoleHandlerDeps, name: string): Promise<string> {
  const result = await d.manager.load(name);
  return result.ok ? `Loaded module '${name}'` : `Error: ${result.error}`;
}

export async function handleModulesUnload(d: ConsoleHandlerDeps, name: string, force: boolean): Promise<string> {
  const result = await d.manager.unload(name, { force });
  if (!result.ok) return `Error: ${result.error}`;
  if (result.outcome === 'draining') return `Module '${name}' draining: ${result.message}`;
  return `Unloaded module '${name}'${force ? ' (--force)' : ''}`;
}

export async function handleModulesReload(d: ConsoleHandlerDeps, name: string, force: boolean): Promise<string> {
  const result = await d.manager.reload(name, { force });
  return result.ok ? `Reloaded module '${name}'` : `Error: ${result.error}`;
}

export function handleHelp(): string {
  return [
    'status                          — bot status',
    'modules list                    — modules on disk',
    'modules status                  — registered modules (state/quarantine/active)',
    'modules load <name>             — load module from disk',
    'modules unload <name> [--force] — soft-stop (wait in-flight) or force unload',
    'modules reload <name> [--force] — soft or force reload',
    'help                            — this help',
    '-help / -h                      — quick help (shorthand)',
    '`averon <command>` vẫn hợp lệ — prefix tùy chọn: `averon status` == `status`',
  ].join('\n');
}
