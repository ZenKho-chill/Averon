/**
 * scripts/validate-config — validate toàn bộ config theo CLAUDE.md §6.4 (fail-fast).
 * EN: Validates all config per CLAUDE.md §6.4 (fail fast).
 * Dùng chính shared/config (loader + JSON-Schema) — cùng code với runtime boot.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadConfig } from '../shared/config/index.js';
import type { AppConfig } from '../shared/config/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configDir = join(root, 'config');
const schemaFile = join(configDir, 'schemas', 'core.schema.json');

// Ưu tiên config.yml (file thật). Nếu chưa có (chưa copy từ example) → validate example,
// để CI chạy được trên repo không track config.yml.
// EN: Prefer config.yml (real). If missing, validate config.example.yml so CI works.
const file = existsSync(join(configDir, 'config.yml')) ? 'config.yml' : 'config.example.yml';

try {
  const config = loadConfig<AppConfig>({ configDir, file, schema: schemaFile });
  console.log(
    `[validate-config] OK — file=${file} app=${config.app.name} v${config.app.version} ` +
      `logging.level=${config.logging.level} register_commands=${config.discord.register_commands}`,
  );
  process.exit(0);
} catch (err) {
  console.error(`[validate-config] FAIL — ${(err as Error).message}`);
  process.exit(1);
}