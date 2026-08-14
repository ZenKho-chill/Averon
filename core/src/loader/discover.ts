/**
 * core/loader/discover — quét module trên đĩa (CLAUDE.md §5.1).
 * EN: core/loader/discover — scan modules/ directory on disk.
 *
 * Thay thế danh sách hardcode trong bootstrap: phát hiện module qua modules/*.
 * Dùng cho `averon modules list` (đĩa) và `averon modules load <name>` (resolve dir).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

/**
 * Quét modules/* trả về đường dẫn tuyệt đối của các thư mục module (dir có module.yml).
 * Bỏ qua file và dir không có module.yml.
 */
export function discoverModuleDirs(root: string): string[] {
  const modulesDir = join(root, 'modules');
  if (!existsSync(modulesDir)) return [];

  const dirs: string[] = [];
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (existsSync(join(modulesDir, entry.name, 'module.yml'))) {
      dirs.push(join(modulesDir, entry.name));
    }
  }
  return dirs;
}

/** Giải tên module → đường dẫn thư mục (modules/<name> có module.yml), undefined nếu không có. */
export function resolveModuleDir(root: string, name: string): string | undefined {
  const dir = join(root, 'modules', name);
  if (existsSync(join(dir, 'module.yml'))) return dir;
  return undefined;
}

/** Đọc { name, version } từ module.yml (dùng cho `modules list`). undefined nếu đọc/parse lỗi. */
export function readModuleNameVersion(moduleDir: string): { name: string; version: string } | undefined {
  try {
    const manifest = YAML.parse(readFileSync(join(moduleDir, 'module.yml'), 'utf8')) as {
      name?: unknown;
      version?: unknown;
    };
    if (typeof manifest?.name !== 'string' || typeof manifest?.version !== 'string') return undefined;
    return { name: manifest.name, version: manifest.version };
  } catch {
    return undefined;
  }
}

/**
 * Gộp toàn bộ intents module khai báo trong module.yml (field `intents`) trên đĩa.
 * Dùng TRƯỚC khi tạo Discord client — discord.js không cho thêm intent sau login (§4).
 * Manifest lỗi bị bỏ qua (loader sẽ báo riêng khi load module).
 */
export function collectDeclaredIntents(root: string): string[] {
  const intents = new Set<string>();
  for (const dir of discoverModuleDirs(root)) {
    try {
      const manifest = YAML.parse(readFileSync(join(dir, 'module.yml'), 'utf8')) as { intents?: unknown };
      if (Array.isArray(manifest.intents)) {
        for (const intent of manifest.intents) {
          if (typeof intent === 'string') intents.add(intent);
        }
      }
    } catch {
      // bỏ qua manifest lỗi — loader sẽ báo lỗi riêng khi load module
    }
  }
  return [...intents];
}
