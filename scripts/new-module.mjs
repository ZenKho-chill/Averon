#!/usr/bin/env node
/**
 * scripts/new-module.mjs — scaffold module mới theo template chuẩn (CLAUDE.md §5.1).
 * EN: Creates a new module with standard structure: module.yml, commands/, events/, src/, config/, tests/, README.md.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function kebabToPascal(name) {
  return name.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function createModule(name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    console.error('Tên module phải là kebab-case (vd: ping, fun-avatar). EN: Module name must be kebab-case.');
    process.exit(1);
  }
  const moduleDir = join(root, 'modules', name);
  if (existsSync(moduleDir)) {
    console.error(`Module '${name}' đã tồn tại. EN: Module '${name}' already exists.`);
    process.exit(1);
  }

  mkdirSync(moduleDir, { recursive: true });
  mkdirSync(join(moduleDir, 'commands'));
  mkdirSync(join(moduleDir, 'events'));
  mkdirSync(join(moduleDir, 'src'));
  mkdirSync(join(moduleDir, 'config'));
  mkdirSync(join(moduleDir, 'tests'));

  // module.yml
  const moduleYml = `
name: ${name}
version: 1.0.0
runtime:
  language: typescript
  engine: node
  version: ">=18"
  transport: in-process
entry: src/index.ts
# intents: [GuildVoiceStates]   # Gateway intents module cần — core gộp khi tạo client (§4)
commands:
  - name: ${name}
    description:
      vi: "Lệnh ${name}"
      en: "${kebabToPascal(name)} command"
    handler: commands/${name}.ts
# events:                       # Event Discord module lắng nghe (handler trong events/)
#   - name: voiceStateUpdate
#     handler: events/voiceStateUpdate.ts
`;
  writeFileSync(join(moduleDir, 'module.yml'), moduleYml.trim());

  // src/index.ts
  const indexTs = `// Entry point cho module ${name}

export const onLoad = () => {
  // Hook khi module được load — khởi tạo state ở đây nếu cần.
  // KHÔNG dùng console.log: nó bypass logger (CLAUDE.md §7) và lẫn vào output operator console.
  // EN: Called when the module is loaded — init state here if needed. Do NOT console.log here.
};

export const onUnload = () => {
  // Hook khi module unload/hot-reload — cleanup ở đây (đóng handle, clear interval...).
  // EN: Called on unload/hot-reload — cleanup here (close handles, clear intervals...).
};
`;
  writeFileSync(join(moduleDir, 'src', 'index.ts'), indexTs);

  // commands/<name>.ts
  const commandTs = `// Handler cho lệnh /${name}

export async function handler(interaction) {
  await interaction.reply('Pong!');
  return 'Pong!'; // test mong đợi return content (không có test = không tồn tại, §12.3)
}
`;
  writeFileSync(join(moduleDir, 'commands', `${name}.ts`), commandTs);

  // config/defaults.yml
  const defaultsYml = `# Config mặc định cho module ${name}
# EN: Default config for module ${name}
`;
  writeFileSync(join(moduleDir, 'config', 'defaults.yml'), defaultsYml);

  // config/schema.yml
  const schemaYml = `# JSON Schema cho config module ${name}
# EN: JSON Schema for module ${name} config
$schema: http://json-schema.org/draft-07/schema#
type: object
properties: {}
`;
  writeFileSync(join(moduleDir, 'config', 'schema.yml'), schemaYml);

  // tests/<name>.test.ts
  const testTs = `import { describe, it, expect } from 'vitest';
import { handler } from '../commands/${name}';

describe('${name} command', () => {
  it('handler trả lời Pong!', async () => {
    const interaction = { reply: (msg) => msg };
    const result = await handler(interaction);
    expect(result).toBe('Pong!');
  });
});
`;
  writeFileSync(join(moduleDir, 'tests', `${name}.test.ts`), testTs);

  // README.md
  const readmeMd = `# Module ${kebabToPascal(name)}

> Lệnh /${name} — trả lời Pong!

## Cấu trúc

- commands/${name}.ts — handler cho lệnh /${name}
- src/index.ts — entry point
- config/ — config module
- tests/ — test module

## Cách dùng

1. Chạy bot: npm run dev
2. Gõ /${name} trong Discord

## Test

npm test
`;
  writeFileSync(join(moduleDir, 'README.md'), readmeMd);

  console.log(`✅ Module '${name}' đã được tạo tại modules/${name}/`);
}

// CLI
if (process.argv[2]) {
  createModule(process.argv[2]);
} else {
  console.log('Dùng: node scripts/new-module.mjs <module-name>');
  console.log('Ví dụ: node scripts/new-module.mjs ping');
}