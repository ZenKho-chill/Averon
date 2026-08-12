/**
 * core/loader/resolve — giải đường dẫn import cho file module (entry/handler).
 * EN: core/loader/resolve — resolve the import path for a module file (entry/handler).
 *
 * Dev (`npm run dev`, tsx) import được file source `.ts`. Bản build (`npm start`, node thuần)
 * KHÔNG import được `.ts` → phải trỏ sang bản biên dịch `dist/modules/<name>/<file>.js`.
 * Manifest (`module.yml`) và `config/*.yml` vẫn đọc từ source `modules/` (yml không được compile).
 */
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Đang chạy từ bản build (dist)? node thuần không import được .ts — phải dùng file đã biên dịch. */
export const RUNNING_FROM_DIST = fileURLToPath(import.meta.url).includes(`${sep}dist${sep}`);

export interface ResolveModuleFileOptions {
  /** true = chạy bản build (npm start) → ưu tiên file .js trong dist/. */
  runningFromDist: boolean;
  /** Project root (nơi có modules/ và dist/). */
  root: string;
  /** Thư mục module (source) — vd `D:/.../modules/ping`. */
  moduleDir: string;
  /** Đường dẫn tương đối trong module — vd `commands/ping.ts`. */
  relative: string;
}

/**
 * Trả về đường dẫn thực sự import được cho file module.
 * - runningFromDist=false → file source (tsx import .ts).
 * - runningFromDist=true → map `modules/<name>/<file>.ts` → `dist/modules/<name>/<file>.js` (nếu có);
 *   thiếu file built → fallback source (import() sẽ báo lỗi rõ).
 */
export function resolveModuleFile(opts: ResolveModuleFileOptions): string {
  const { runningFromDist, root, moduleDir, relative: relPath } = opts;
  if (!runningFromDist) return join(moduleDir, relPath);

  const relModule = relative(join(root, 'modules'), moduleDir);
  const builtRel = relPath.endsWith('.ts') ? `${relPath.slice(0, -3)}.js` : relPath;
  const builtPath = join(root, 'dist', 'modules', relModule, builtRel);
  return existsSync(builtPath) ? builtPath : join(moduleDir, relPath);
}
