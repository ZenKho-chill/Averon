/**
 * scripts/validate-config — validate toàn bộ config theo CLAUDE.md §6.4 (fail-fast).
 * EN: Validates all config per CLAUDE.md §6.4 (fail fast).
 * Dùng chính shared/config (loader + JSON-Schema) — cùng code với runtime boot.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../shared/config/index.js';
import type { AppConfig } from '../shared/config/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configDir = join(root, 'config');
const schemaFile = join(configDir, 'schemas', 'core.schema.json');

try {
  const config = loadConfig<AppConfig>({ configDir, schema: schemaFile });
  const env = process.env.AVERON_ENV ?? process.env.NODE_ENV ?? 'dev';
  console.log(
    `[validate-config] OK — env=${env} app=${config.app.name} v${config.app.version} ` +
      `logging.level=${config.logging.level}`,
  );
  process.exit(0);
} catch (err) {
  console.error(`[validate-config] FAIL — ${(err as Error).message}`);
  process.exit(1);
}
