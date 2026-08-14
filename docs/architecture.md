# Kiến trúc Averon / Averon Architecture

> Tài liệu kiến trúc chi tiết — nguồn sự thật ngắn gọn là `CLAUDE.md`. **Đọc CLAUDE.md trước.**
> EN: Detailed architecture document — concise source-of-truth is `CLAUDE.md`. **Read CLAUDE.md first.**

## 1. Tổng quan / Overview

Averon là Discord bot theo hướng **module hóa**: core đóng vai trò nền tảng, module là những tính năng độc lập. Nguyên tắc phụ thuộc chiều bắt buộc:

```
core → shared      module → core (services) + shared
```

Module **không bao giờ phụ thuộc module khác**; nếu cần dùng chung → service registry của core hoặc utility trong `shared/`.

### Các tầng / Layers

```
┌─────────────────────────────────────────────────────────────┐
│                        Discord Gateway                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                            CORE                             │
│  bootstrap → config/validate → loader → lifecycle → discord │
│  registry (services) · ipc · crash-handler · watchdog       │
│  console (operator REPL quản lý module)                     │
└───────────────┬───────────────────────────────┬─────────────┘
                │ load/unload                    │ shared services
┌───────────────▼──────────────┐   ┌─────────────▼─────────────┐
│          MODULES             │   │          SHARED           │
│  modules/*  (mỗi folder độc  │──▶│  logger · config · db     │
│  lập, giao tiếp qua core)    │   │  utils · i18n ·           │
│                              │   │  placeholders            │
└───────────────┬──────────────┘   └───────────────────────────┘
                │ (nếu module ngoại ngữ)
┌───────────────▼──────────────┐
│   Subprocess / FFI / Socket  │  ← lớp IPC của core
└──────────────────────────────┘
```

## 2. Core subsystems

| Subsystem | File | Trách nhiệm / Responsibility |
|---|---|---|
| `bootstrap` | `core/src/bootstrap.ts` | Pipeline khởi động: config → logger → anti-crash → load module → discord.login → syncCommands → operator console |
| `config` | `core/src/config/` | Load + validate config tổng (`config/config.yml`), lấy `app.version` từ `package.json` |
| `loader` | `core/src/loader/` | Parse `module.yml`, validate manifest, import entry, nạp config module (defaults + schema validate) |
| `discover` | `core/src/loader/discover.ts` | Quét `modules/*` trên đĩa để tìm module (glob các folder có `module.yml`) |
| `lifecycle` | `core/src/lifecycle/` | Quản lý trạng thái module + gọi hook `onLoad`/`onUnload` |
| `registry` | `core/src/registry/` | Service registry (DI) + module registry |
| `usage` | `core/src/registry/usage.ts` | `UsageTracker` — đếm in-flight handler theo module (phục vụ soft-stop) |
| `discord` | `core/src/discord/` | Wrap Discord gateway: login, `registerCommand`/`removeCommand`, `syncCommands` (REST) |
| `crash` | `core/src/crash/` | Anti-crash: global handler, quarantine module, crash report |
| `console` | `core/src/console/` | Operator console: stdin REPL `averon` + `ModuleManager` (status/load/unload/reload) |

### Luồng khởi động / Boot flow

```
loadCoreConfig (schema + semantic validate) → backup config
→ createLogger → registry (services) → CrashReporter.install
→ ModuleLoader + Lifecycle + UsageTracker + DiscordClient
→ ModuleManager.loadAll() (discover modules/* → load từng module → attach commands)
→ discord.login() → syncCommands (global/guild/user theo config)
→ OperatorConsole.start() (nếu console.enabled)
```

## 3. Vòng đời module / Module lifecycle

7 trạng thái:

```
REGISTERED → LOADING → LOADED → RUNNING → DRAINING → UNLOADED
                                             │
                        (lỗi ở bất kỳ bước nào → FAULTED — cô lập, không làm sập core)
```

1. **REGISTERED** — loader đọc `module.yml`, validate manifest (bắt buộc `name`, `version`, `entry`, `runtime`).
2. **LOADING** — `Lifecycle.loadModule` đang gọi `onLoad()`.
3. **LOADED** — `onLoad()` xong không lỗi.
4. **RUNNING** — module đã attach command (set bởi `ModuleManager`) — có thể nhận/xử lý command.
5. **DRAINING** — đang soft-unload: đã detach Discord listener (ngừng nhận command mới), **chờ in-flight handler xong** (`UsageTracker.waitIdle`) rồi mới `onUnload`.
6. **UNLOADED** — `onUnload()` xong (cleanup), entry vẫn ở lại registry (state `UNLOADED`).
7. **FAULTED** — lỗi ở bất kỳ bước nào → cô lập (quarantine nếu fail liên tục).

### Soft-stop (DRAINING)

Unload/reload **không `--force`** là soft-stop:

1. `ModuleManager.unload` guard state → `DiscordClient.removeCommand` (**detach listener**) → module không nhận lệnh mới.
2. `Lifecycle.unloadModule` set state **DRAINING**.
3. Chờ in-flight handler xong qua `UsageTracker.waitIdle(timeout)` (poll 50ms).
4. Idle → `onUnload()` → **UNLOADED**.
5. **Timeout** (mặc định `console.soft_stop_timeout_ms: 15000`) → giữ DRAINING, báo admin "retry `--force`".
6. `--force` → bỏ qua chờ, `onUnload` nuốt lỗi → UNLOADED ngay.

> `DRAINING` > 0 (IN_PROGRESS handler) hiển thị trong `modules status` (cột ACTIVE).

## 4. Module manifest (`module.yml`)

Mỗi module bắt buộc có `module.yml` ở root folder. Schema đầy đủ xem `CLAUDE.md §4`. Field bắt buộc: `name`, `version`, `runtime.*`, `entry` — thiếu → core từ chối load + log rõ lý do.

```yaml
name: ping                # kebab-case, trùng tên folder
version: 1.1.0            # version riêng của module (§10)
runtime:
  language: typescript    # typescript | javascript | python | c | cpp | rust
  engine: node
  version: ">=18"
  transport: in-process   # in-process | subprocess | socket | ffi (§IPC)
entry: src/index.ts       # entry point — có thể export onLoad/onUnload hooks
config:
  schema: config/schema.yml
  defaults: config/defaults.yml
commands:
  - name: ping
    description: { vi: "Lệnh ping", en: "Ping command" }
    handler: commands/ping.ts   # export `handler(interaction, ctx)`
    type: chat_input            # chat_input | user | message
    scope: [global]             # global | guild | user
```

### Config module

Core nạp config module trực tiếp từ folder module: `config/defaults.yml` → validate bằng `config/schema.yml` (JSON Schema). Admin chỉnh được hành vi module **không cần đổi code** — sửa thẳng `modules/<name>/config/defaults.yml` (vd: custom `/ping` response).

### Entry point & hooks

```ts
// modules/ping/src/index.ts (ESM)
export const onLoad = (): void => { /* init state */ };
export const onUnload = (): void => { /* cleanup: đóng handle, clear interval */ };
```

- **Không `console.log` trong hook** — bypass logger, lẫn vào output operator console. Dùng logger qua `ctx.logger`.
- `onUnload` bắt buộc hỗ trợ để hot-reload / unload an toàn.

## 5. Operator console

Subsystem `core/console/` — REPL đọc **stdin**, prompt `averon> `, cho phép quản lý bot đang chạy. Đây là **core subsystem** (điều khiển lifecycle = control-plane của core), không phải module: §5.3 cấm module điều khiển module khác.

Lệnh:

``` 
status                          # tên/version app, uptime, Discord (ws/ping/guilds), số module
modules list                    # module trên đĩa (glob modules/*): NAME | VERSION | LOADED
modules status                  # module trong registry: NAME | VERSION | STATE | QUARANTINED | ACTIVE | CMDS
modules load <name>             # load từ đĩa; cho phép module đã UNLOADED (gỡ entry cũ, load fresh)
modules unload <name> [--force] # soft-stop (DRAINING → chờ idle → UNLOADED) | force
modules reload <name> [--force] # soft/force reload (tái dùng entry registry)
help                            # help đầy đủ
-help / -h                      # quick help (không cần prefix)
```

Lệnh gõ thẳng **không cần prefix** (`status`, `modules list`, ...). Prefix `averon` đã bị gỡ (gõ `averon status` → báo lỗi hướng dẫn gõ thẳng).
```

Thành phần:

- **`parser.ts`** — parse dòng lệnh (thuần, test dễ): grammar + reject `--force` trên `load`.
- **`handlers.ts`** — render output từng lệnh + `formatTable`.
- **`manager.ts`** — `ModuleManager` = coordinator: phối hợp lifecycle + discord attach/detach + usage wait + loader. `loadAll()` được bootstrap dùng để nạp toàn bộ module lúc khởi động.
- **`index.ts`** — `OperatorConsole`: readline loop, input/output injectable (test bằng PassThrough), **tuần tự hoá lệnh** qua promise chain (lệnh sau đợi lệnh trước — tránh race DRAINING).

### Vì sao kiến trúc như vậy

- **QLifecycle giữ nguyên role** state + hooks (chỉ thêm `force`); `ModuleManager` điều phối, bootstrap không lặp attach cứng.
- Registry cấm trùng tên module → `load` cần xử lý riêng case đã UNLOADED (hết lỗi "loop load↔reload" — xem `CHANGELOG [0.8.1]`).

## 6. IPC — đa ngôn ngữ / Multi-language IPC

Core cấp lớp IPC thống nhất (`core/src/ipc/`). Module chỉ khai báo `runtime.transport` trong `module.yml`.

| `transport` | Cơ chế | Phù hợp khi | Chi phí |
|---|---|---|---|
| `in-process` | Gọi trực tiếp cùng tiến trình — **mặc định** | Module JS/TS | 0 |
| `subprocess` | Tiến trình con + JSON-RPC qua stdio | Python, cần cô lập tiến trình | Trung bình |
| `socket` | TCP/Unix socket, có thể pub/sub | Service lâu, event-driven, nhiều máy | Cao hơn |
| `ffi` | Foreign Function Interface | Hàm thuần C/C++/Rust hot-path | Thấp nhưng phức tạp build |

> ⚠️ Hiện tại **chỉ `in-process` đã được implement** (`importEntry` từ chối transport khác — xem `core/src/loader/index.ts`). Các transport khác là thiết kế tương lai. Chi tiết: `docs/multi-language.md`.

**Quy tắc:** mặc định TypeScript (ngôn ngữ core); dữ liệu qua IPC phải JSON-serializable, có schema + versioning (`ipc.api_version`); module ngoại ngữ tự xử lý tiến trình con chết/treo (timeout, restart, kill).

## 7. Anti-crash & tự phục hồi / Self-recovery

- **Global handler** (`bootstrap` + `CrashReporter.install`): bắt `uncaughtException`/`unhandledRejection` → log + crash report, không sập cả process vì lỗi 1 module.
- **Boundary**: command/event handler chạy trong try/catch của core — exception chỉ fail handler đó.
- **Quarantine**: module fail liên tục (mặc định 5 lần/5 phút) → auto-unload + log rõ; bot vẫn chạy với module còn lại.
- **Watchdog** (`scripts/watchdog.mjs`): respawn khi crash, giới hạn 5 restart/5 phút chống restart-loop.
- **Crash report**: `crash-reports/crash-YYYYMMDD-HHmmss-<seq>.json` gồm stack trace, timestamp, version bot, trạng thái module lúc đó.

## 8. Config / Configuration

- **1 file duy nhất**: `config/config.yml` (gitignored, chứa token). Bot đọc đúng file này lúc boot.
- **`config.example.yml`** (tracked) là mẫu; copy rồi sửa.
- **Validate fail-fast**: 2 lớp — JSON Schema (`config/schemas/`) + semantic (`shared/config/semantic.ts`). Sai → in lỗi rõ field/file/dòng + **thoát mã ≠ 0**.
- **`app.version` lấy từ `package.json`** (`shared/config.readPackageVersion`) — nguồn sự thật duy nhất, config.yml không khai báo version (§10).
- **Backup/rollback**: mỗi boot hợp lệ tự backup vào `config/backups/` (giữ 10 bản); `npm run restore:config` để rollback.
- **Đường dẫn cross-platform**: không hard-code `D:\...` / `process.cwd()` — dùng `findProjectRoot()` (chạy đúng từ `src` lẫn `dist`).

## 9. Version & CHANGELOG / Versioning

Quy tắc `MAJOR.MINOR.PATCH` theo `CLAUDE.md §10`:

- **PATCH** — chỉ fix bug
- **MINOR** — thêm tính năng mới (backward-compatible)
- **MAJOR** — breaking change

Bot version nằm ở **`package.json`** (đổ vào `app.version` khi boot); module version riêng ở **`module.yml`**. CHANGELOG song ngữ, mới nhất trên đầu, entry khớp loại bump. **Fix sau khi một version đã merge → entry mới**, không nhét vào entry đã ship.

## 10. Map tài liệu / Doc map

| Cần tìm / Looking for | File |
|---|---|
| Quy ước & golden rules | `CLAUDE.md` |
| Tạo module mới | `docs/module-guide.md` |
| Module đa ngôn ngữ / IPC | `docs/multi-language.md` |
| Service API cho module | `docs/api/` |
| Nhật ký thay đổi | `CHANGELOG.md` |