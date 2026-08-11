// scripts/validate-config.mjs
// Placeholder của validate-config cho CD giai đoạn nền móng.
// Khi shared/config sẵn sàng, script này sẽ load + JSON-Schema validate toàn bộ config (CLAUDE.md §6.4).
// EN: Placeholder — will load + validate all YAML config via shared/config once it lands (CLAUDE.md §6.4).
import { existsSync, readdirSync } from 'node:fs';

const configDir = new URL('../config/', import.meta.url);

if (!existsSync(configDir)) {
  console.log('[validate-config] config/ không tồn tại — không có gì để validate (OK)');
  process.exit(0);
}

const files = readdirSync(configDir).filter((f) => f.endsWith('.yml'));
console.log(`[validate-config] các file config: ${files.join(', ') || '(chưa có)'}`);

// TODO(shared/config): load + validate từng file bằng JSON Schema, fail-fast khi thiếu/sai field (§6.4)
process.exit(0);