# Hướng dẫn tạo module / Module Guide

> Tạo tính năng mới cho Averon = tạo module mới trong `modules/<name>/`. **Không sửa core** trừ khi thật sự cần thiết (Golden rule — `CLAUDE.md §1`).
> EN: A new Averon feature = a new module under `modules/<name>/`. **Never touch core** unless truly necessary (Golden rule — `CLAUDE.md §1`).

## 1. Scaffold / Scaffold

Nhanh nhất: dùng script có sẵn — tạo cấu trúc chuẩn + template hợp lệ:

```bash
npm run new:module -- <name>    # vd: npm run new:module -- fun-avatar
```

Tên phải **kebab-case** (vd `fun-avatar`). Script sinh:

```
modules/<name>/
├── module.yml          # manifest (§2)
├── README.md           # mô tả module — song ngữ
├── commands/<name>.ts  # handler lệnh đầu tiên
├── events/             # event listener (1 file / event)
├── src/index.ts        # entry point — hooks onLoad/onUnload
├── config/
│   ├── defaults.yml    # config mặc định
│   └── schema.yml      # JSON Schema validate config module
└── tests/<name>.test.ts
```

## 2. Manifest (`module.yml`)

Core dựa vào file này để load module. Field bắt buộc: `name`, `version`, `runtime.*`, `entry` — thiếu → core từ chối load + log rõ lý do.

```yaml
name: example                      # bắt buộc — kebab-case, trùng tên folder
version: 1.0.0                     # bắt buộc — version riêng của module (§10)
description:
  vi: "Mô tả ngắn tiếng Việt"
  en: "Short English description"

runtime:                           # bắt buộc
  language: typescript             # typescript | javascript | python | c | cpp | rust
  engine: node                     # node | python | native
  version: ">=18"                  # ràng buộc phiên bản runtime
  transport: in-process            # in-process (mặc định) | subprocess | socket | ffi

entry: src/index.ts                # bắt buộc — entry point (tương đối folder module)

load:
  after: ["database", "logger"]    # service phải SẴN SÀNG trước khi load module
  requires: ["logger"]             # service BẮT BUỘC — thiếu thì KHÔNG load
  optional: ["database"]           # service tuỳ chọn — module tự xử lý khi thiếu

commands:
  - name: example
    description:
      vi: "Lệnh ví dụ"
      en: "Example command"
    handler: commands/example.ts   # export `handler(interaction, ctx)`
    enabled: true
    type: chat_input               # chat_input (slash) | user | message (context menu)
    scope: [global]                # global | guild | user — mặc định ['global']

events:
  - name: messageCreate            # event Discord (hoặc event nội bộ core)
    handler: events/messageCreate.ts

config:
  schema: config/schema.yml        # validate config module khi load
  defaults: config/defaults.yml    # giá trị mặc định

ipc:                               # CHỈ cần khi runtime.transport ≠ in-process
  api_version: 1                   # version contract IPC
  rpc_schema: src/rpc.schema.json

tests:
  command: "npm test"              # lệnh chạy test module
  dir: tests/
```

## 3. Command handler

File handler (khai báo `handler:` trong manifest) export `handler(interaction, ctx)` — ESM, `async`.

```ts
// commands/example.ts
import type { CommandContext } from '../../../core/src/registry/types.js';

interface InteractionLike {
  reply(message: unknown): Promise<unknown>;
  user?: { id?: string; username?: string };
  guild?: { name?: string } | null;
}

export async function handler(interaction: InteractionLike, ctx?: CommandContext) {
  const logger = ctx?.logger;          // logger qua context — không console.log
  const cfg = ctx?.config ?? {};       // config module đã merge (defaults + override)

  logger?.info('/example used', { user: interaction.user?.id });
  await interaction.reply('Hello!');
  return 'Hello!';                     // test có thể assert return content
}
```

> **Bắt buộc return content** — test module assert giá trị trả về (`no test = doesn't exist`). Xem `modules/ping/commands/ping.ts` làm ví dụ thực tế.

`CommandContext` (service API — chi tiết `docs/api/`):

| Field | Ý nghĩa / Meaning |
|---|---|
| `config` | Config module sau khi merge (defaults + override từ `config/config.yml → modules.<name>`) |
| `logger` | Logger chuẩn của core (5 cấp độ, có source/context) |
| `moduleName` | Tên module sở hữu command — core dùng để đếm in-flight (soft-stop) |

### Command type & scope

- **`type`**: `chat_input` (slash command — mặc định) | `user` (context menu) | `message` (context menu).
- **`scope`**: `global` | `guild` | `user`. Core chỉ đăng ký lệnh vào scope được bật trong `discord.register_commands` (`CLAUDE.md §8`) — lệnh `scope: [guild]` không bao giờ gửi lên global.
- **Localization**: `description.vi/en` — mô tả lệnh hiển thị theo ngôn ngữ client (Discord localization).

## 4. Config module

Bất kỳ tùy chỉnh nào của module phải có config — **không hard-code**. Luồng nạp:

```
config/defaults.yml  →  validate bằng config/schema.yml (JSON Schema)
  →  merge override từ config/config.yml → modules.<name>  (admin chỉnh, không cần đổi code)
```

Ví dụ `modules/ping` (`config/defaults.yml`):

```yaml
random: true
responses:
  - type: plain
    content: "Pong! ({latency}ms)"
```

## 5. Entry point & hooks

`src/index.ts` có thể export 2 hooks:

```ts
// src/index.ts
export const onLoad = () => {
  // Khởi tạo state khi module load — KHÔNG console.log (bypass logger, lẫn operator console output)
};

export const onUnload = () => {
  // Cleanup khi unload/hot-reload: đóng handle, clear interval, unsubscribe
};
```

`onUnload` bắt buộc hỗ trợ → module unload / hot-reload an toàn.

## 6. Events

Khai báo trong manifest + file handler (1 file / event):

```yaml
events:
  - name: messageCreate
    handler: events/messageCreate.ts
```

```ts
// events/messageCreate.ts
export default async (message: unknown) => {
  // xử lý message
};
```

> ⚠️ Gắn event listener cho module đang được triển khai dần (`bootstrap.ts` có TODO) — hiện core chủ yếu xử lý **commands**; cần event → mở issue/PR cho core.

## 7. Test

**Quy tắc: "không có test case = không tồn tại"** (`CLAUDE.md §12.3`). Mọi code mới/sửa phải có test chạy được và xanh.

```ts
// tests/example.test.ts
import { describe, it, expect } from 'vitest';
import { handler } from '../commands/example.js';   // ESM — dùng .js path

describe('example command', () => {
  it('trả lời Hello!', async () => {
    const interaction = { reply: (msg: string) => msg, user: { id: '1', username: 'a' } };
    const result = await handler(interaction);
    expect(result).toBe('Hello!');
  });
});
```

Chạy: `npm test` (toàn repo, vitest).

## 8. Checklist bắt buộc / Required checklist

- [ ] Không sửa file nào ngoài folder module (trừ `CHANGELOG.md`)?
- [ ] `module.yml` hợp lệ theo schema (§2)?
- [ ] Config module có `defaults.yml` + `schema.yml`, validate qua khi boot?
- [ ] Module cô lập: không import module khác, không import core nội bộ dưới `core/src/` (§5.3)?
- [ ] Không hard-code config/secret; không log secret (§6.3, §7.4)?
- [ ] Log đúng level qua `ctx.logger`, không `console.log`?
- [ ] Hỗ trợ `onUnload` để hot-reload an toàn (§5.4)?
- [ ] **Toàn bộ code mới / sửa có test case chạy xanh?**
- [ ] README module song ngữ + `CHANGELOG.md` cập nhật đúng loại bump (Added → MINOR)?
- [ ] Làm trên branch `feature/...` + mở PR? (không commit thẳng `main`)

## 9. Tham khảo / Reference

- Module mẫu hoàn chỉnh: **`modules/ping`** — manifest, command config-driven, config schema/defaults, test.
- Kiến trúc chi tiết: [`docs/architecture.md`](architecture.md).
- Service API: [`docs/api/`](api/).
- Module đa ngôn ngữ / IPC: [`docs/multi-language.md`](multi-language.md).