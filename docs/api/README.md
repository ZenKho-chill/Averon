# Service API — Core dành cho Module / Core API for Modules

> Đây là **mặt public** core expose cho module. Module **chỉ được** dùng những thứ trong trang này — không import core nội bộ dưới `core/src/` trừ `core/src/registry/types.js` (type-only `CommandContext`) (`CLAUDE.md §5.3`).
> EN: This is the **public surface** core exposes to modules. Modules must only use what's listed here — never import core internals under `core/src/`, except `core/src/registry/types.js` (type-only `CommandContext`) (`CLAUDE.md §5.3`).

## 1. `CommandContext` — context handler command

Command handler nhận: `handler(interaction, ctx)`.

```ts
// Import type (type-only) từ core
import type { CommandContext } from '../../../core/src/registry/types.js';

export async function handler(interaction: InteractionLike, ctx?: CommandContext) {
  ctx?.logger.info('used', { user: interaction.user?.id });
  const cfg = ctx?.config ?? {};
}
```

| Field | Type | Mô tả / Description |
|---|---|---|
| `config` | `Record<string, unknown>` | Config module sau khi validate (`modules/<name>/config/defaults.yml`). Là **config source chính** cho module — không đọc file trực tiếp. |
| `logger` | `Logger` | Logger chuẩn của core. Dùng để log thay vì `console.log` (có source/context, che secret, ghi file). |
| `moduleName` | `string` (optional) | Tên module sở hữu command. Core dùng nội bộ để đếm in-flight handler khi soft-unload (`DRAINING`). Module thường không cần đụng — nếu cần tên module, đọc từ `ctx.moduleName`. |
| `registry` | `RegistryLike` (optional) | Tra module đang chạy. Dùng `ctx.registry.hasModule(name)` + `ctx.registry.getModule(name).getConfig?.()` để lấy config module **mới nhất** (sau reload, config đã đổi trên đĩa sẽ được nạp lại — đừng dùng `ctx.config` nếu module có thể bị reload). |

> `RegistryLike` chỉ lộ 2 hàm non-destructive: `hasModule(name): boolean` và `getModule(name): ModuleRegistryEntry`. Đọc metadata (name/version/state/config) là an toàn; **không** gọi `handlerFn`/`commands` của module khác (vi phạm §5.3).

> Nếu module cần thêm service (database, ...), mở issue/PR — đừng tự đăng ký vào core registry.

## 1b. Event handler — context

Event handler khai báo trong `module.yml` (`events:`) nhận **ctx đối xứng với command**: core append `ctx` làm tham số **CUỐI** của handler. Signature theo từng event của discord.js:

```ts
import type { CommandContext } from '../../../core/src/registry/types.js';

// vd event `voiceStateUpdate` — discord.js truyền (oldState, newState), core thêm ctx ở cuối.
export async function handler(oldState: unknown, newState: unknown, ctx?: CommandContext) {
  const cfg = (ctx?.config ?? {}) as { hub_channel_id?: string };
  ctx?.logger.info('voice update', { channelId: (newState as { channelId?: string | null })?.channelId });
}
```

> Các field của `ctx` giống hệt `CommandContext` (§1): `config`, `logger`, `moduleName`, `registry`. Lấy config **mới nhất** sau reload: `ctx.registry?.getModule('<name>').getConfig?.()`.

## 2. `Logger` — `shared/logger`

Module nhận logger qua `ctx.logger`. Interface:

```ts
logger.debug(message: string, meta?: LogMeta): void
logger.info(message: string, meta?: LogMeta): void
logger.warn(message: string, meta?: LogMeta): void
logger.error(message: string, meta?: LogMeta): void
logger.fatal(message: string, meta?: LogMeta): void
logger.mask(value: string | null | undefined, keepLast?: number): string  // che secret
logger.child(overrides: { source?: string; context?: string }): Logger   // logger con
```

- **Level**: DEBUG < INFO < WARN < ERROR < FATAL (config `logging.level` lọc).
- **KHÔNG log secret** — dùng `logger.mask(token)`.
- Module muốn import type: `import type { Logger } from '../../../shared/logger/index.js'`.

## 3. `shared/config` — utility config

| Hàm / Function | Mô tả / Description |
|---|---|
| `loadConfig<T>(options)` | Load + tuỳ chọn validate 1 file YAML (configDir/file/schema). |
| `validateConfig(config, schema, path)` | Validate object theo JSON Schema. |
| `deepMerge(base, override)` | Merge sâu object (dùng cho config module). |
| `findProjectRoot(startDir)` | Tìm thư mục chứa `package.json` (walk-up). Chạy đúng cả từ src lẫn dist. |
| `readPackageInfo(root)` | Đọc `{name, version}` từ `package.json` — nguồn duy nhất cho `app` (§10, config không khai báo `app`). |
| `backupConfig(dir)` / `listBackups(dir)` / `restoreConfig(dir, file)` | Backup + rollback config. |

```ts
import { renderPlaceholders, findProjectRoot } from '../../../shared/config/index.js';
```

> Module thường **không cần** đọc config file trực tiếp — config module đã qua `ctx.config`. `shared/config` hữu ích khi module có config riêng ngoài core.

## 4. `shared/placeholders` — placeholder text

```ts
import { renderPlaceholders, type PlaceholderVars } from '../../../shared/placeholders/index.js';

renderPlaceholders("Pong! ({latency}ms)", { latency: "42" }); // → "Pong! (42ms)"
```

- Cú pháp `{key}`; placeholder thiếu var → thay `''`.
- Vars built-in mặc định: `time`, `tag_user`, `latency`, `username`, `user_id`, `guild`, `guild_id` — và mở rộng `[key: string]` tùy module.

## 6. `shared/errors` — hệ thống lỗi (error handling system)

**Module KHÔNG reply hardcode chuỗi lỗi trong handler** — `throw` typed error để core bắt ở boundary và tự map sang response cho user theo loại error (§8, §9.1).

```ts
import { UserError, NotFoundError, PermissionError, RateLimitError, InvalidArgumentError } from '../../../shared/errors/index.js';

throw new NotFoundError('Không tìm thấy thành viên. EN: Member not found.');
throw new PermissionError('Bạn không có quyền dùng lệnh này. EN: No permission.');
throw new RateLimitError('Quá nhanh, chờ một chút. EN: Too fast, slow down.');
```

| Error class | Dùng khi / When |
|---|---|
| `UserError` | Base — lỗi hiển thị được cho user (message do module thiết kế, user-safe) |
| `NotFoundError` | Không tìm thấy tài nguyên (user, guild, file, record...) |
| `PermissionError` | User thiếu quyền thực hiện hành động |
| `RateLimitError` | User bị giới hạn tần suất / cooldown / quota |
| `InvalidArgumentError` | Đối số / dữ liệu user nhập không hợp lệ |

**Quy tắc:** message của `UserError` (và subclass) hiển thị **trực tiếp** cho user → viết user-safe (song ngữ, không lộ internals/secret).

**Lỗi nội bộ khác (generic `Error`):** core log đầy đủ, còn response cho user phụ thuộc mode (§8):
- **Dev** (`dev.show_stacktrace: true`) → message chung + chi tiết lỗi (dễ debug).
- **Prod** → message chung an toàn, **che giấu internals** (`GENERIC_ERROR_MESSAGE`).

> Helper `toUserMessage(err, { showStacktrace })` map lỗi → message (core dùng nội bộ; module không cần gọi).

## 7. Core-internal (không dùng cho module)

Các thành phần sau là **nội bộ core**, module KHÔNG được dùng trực tiếp:

- `ModuleManager` (`core/src/console/manager.ts`) — coordinator lifecycle; dùng bởi bootstrap + operator console.
- `UsageTracker` (`core/src/registry/usage.ts`) — đếm in-flight; core tự xử lý khi soft-stop.
- `Lifecycle` / `ModuleLoader` / `Registry` / `DiscordClient` — nội bộ core.

Nếu module cần khả năng nào trong số đó → mở issue/PR đề xuất service public (giữ backward-compatible).
