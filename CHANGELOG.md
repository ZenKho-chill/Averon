## [3.5.0] — 2024-05-18
**Loại / Type:** MINOR — thêm tính năng mới / new feature

### Added
- `modules/webio`: thêm module quản lý qua web dashboard và API (VI)
  EN: Added `webio` module for web dashboard and API management.
- `core/registry`: thêm các service manager, discord, usage, registry, root (VI)
  EN: Added `manager`, `discord`, `usage`, `registry`, `root` services to `core/registry`.

# CHANGELOG

Quy ước version tuân theo [CLAUDE.md §10](CLAUDE.md): `MAJOR.MINOR.PATCH`
EN: Versioning follows CLAUDE.md §10 — PATCH=bugfix only, MINOR=new feature, MAJOR=breaking change.

## [3.4.0] — 2026-08-14
**Loại / Type:** MINOR — thêm tính năng mới / new feature

### Added
- `modules/tempvoice`: module mới — kênh thoại tạm thời (kiểu VoiceMaster). User join kênh "hub" → bot tạo kênh voice riêng (tên theo `channel_name_template`, `{username}` = tên user) và chuyển user vào; user rời + kênh rỗng → xóa sau `delete_empty_delay_ms`. Config: `hub_channel_id`, `channel_name_template`, `category_id`, `max_users`, `bitrate_kbps`, `delete_empty_delay_ms`. Chỉ xóa kênh do module tạo (track trong module-scope). Khai báo `intents: [GuildVoiceStates]` trong module.yml — restart bot để áp dụng. Kèm 20 test (VI)
  EN: New `modules/tempvoice` — temporary voice channels (VoiceMaster-style). Joining the "hub" channel makes the bot create a private voice channel (name per `channel_name_template`, `{username}` = user name) and move the user in; leaving + empty → deleted after `delete_empty_delay_ms`. Config: `hub_channel_id`, `channel_name_template`, `category_id`, `max_users`, `bitrate_kbps`, `delete_empty_delay_ms`. Only module-created channels are deleted (tracked in module scope). Declares `intents: [GuildVoiceStates]` in module.yml — restart the bot to apply. 20 tests included.

## [3.3.0] — 2026-08-14
**Loại / Type:** MINOR — thêm tính năng mới / new feature

### Added
- `core/discord` + `core/console`: **event handler nhận ctx đối xứng với command** — `registerEvent` truyền `{ config, logger, moduleName, registry }` làm tham số **cuối** của handler (`handler(oldState, newState, ctx)`), giúp module event-based (vd tempvoice) đọc config/log/registry theo chuẩn mà không phải hardcode hay import core nội bộ (§5.3). `attachModuleEvents` truyền đầy đủ ctx như `attachModuleCommands`. Cập nhật `docs/api/README.md` §1b (VI)
  EN: **Event handlers now receive a command-like ctx** — `registerEvent` appends `{ config, logger, moduleName, registry }` as the handler's LAST argument (`handler(oldState, newState, ctx)`), so event-based modules (e.g. tempvoice) can read config/log/registry the standard way without hardcoding or importing core internals (§5.3). `attachModuleEvents` passes the full ctx like `attachModuleCommands`. Updated `docs/api/README.md` §1b.

## [3.2.0] — 2026-08-14
**Loại / Type:** MINOR — thêm tính năng mới / new feature

### Added
- `core/loader` + `core/discord` + `core/console`: **MODULE EVENTS được nối dây** — trước đây `events:` trong module.yml chỉ là metadata (TODO bootstrap.ts), handler không bao giờ được import/gắn → module event-based (vd `voiceStateUpdate`) không hoạt động. Giờ: loader import `evt.handler` (file export `handler`) → `handlerFn` trong registry; manager attach/detach listener khi load/reload/unload; `registerEvent`/`removeEvent` track listener theo `(module, event)` (nhiều module nghe cùng event không đụng nhau) + count in-flight qua UsageTracker (soft-stop chờ handler chạy dở). Gỡ TODO `bootstrap.ts:144`. Kèm test loader/discord/manager (VI)
  EN: **Module events are now wired** — previously `events:` in module.yml was metadata only (TODO at bootstrap.ts), handlers were never imported/attached, so event-based modules (e.g. `voiceStateUpdate`) did not work. Now: the loader imports `evt.handler` (files export `handler`) → `handlerFn` on the registry entry; the manager attaches/detaches listeners on load/reload/unload; `registerEvent`/`removeEvent` track listeners by `(module, event)` (multiple modules may share an event) and count in-flight via UsageTracker (soft-stop waits for running handlers). Removed TODO `bootstrap.ts:144`. Tests added for loader/discord/manager.
- `core/discord` + module manifest: **intents chuyển từ core config sang module config** — `discord.intents` trong `config.yml` bị gỡ; module khai báo intent cần qua `intents:` trong `module.yml` (vd `[GuildVoiceStates]`). Bootstrap gộp `CORE_INTENTS` (`Guilds`) + toàn bộ intents module trên đĩa trước khi tạo Discord client (discord.js không thêm intent sau login). Manifest intent sai tên GatewayIntentBits → từ chối load. Module load muộn cần intent client không bật → warn, hướng dẫn restart. `config.yml` còn khai báo `discord.intents` → cảnh báo legacy. File mới `core/src/discord/intents.ts` (VI)
  EN: **Intents moved from core config to module config** — `discord.intents` removed from `config.yml`; modules declare needed intents via `intents:` in `module.yml` (e.g. `[GuildVoiceStates]`). Bootstrap merges `CORE_INTENTS` (`Guilds`) + all on-disk module intents before creating the Discord client (discord.js cannot add intents after login). Invalid intent names are rejected at load. A module loaded later that needs an intent the client lacks → warning, restart required. Legacy `discord.intents` in `config.yml` → warning. New file `core/src/discord/intents.ts`.
- `scripts/new-module.mjs`: scaffold thêm template `intents:` + `events:` (commented) trong module.yml (VI)
  EN: `scripts/new-module.mjs`: scaffold now includes `intents:` + `events:` (commented) templates in module.yml.
- `CLAUDE.md §4` + `§6.5`: cập nhật manifest `intents`/`events` + bỏ `intents` khỏi config example (VI)
  EN: `CLAUDE.md §4` + `§6.5`: manifest `intents`/`events` documented, `intents` removed from the config example.

## [3.1.0] — 2026-08-14
**Loại / Type:** MINOR — thêm tính năng mới / new feature

### Added
- `core/discord`: **log usage command lên console** — khi user Discord dùng lệnh của module, log `[INFO] Command '/<name>' used by <userId> in guild <guildId>` kèm meta `{ module }` (guild = `DM` nếu không trong guild). Đúng CLAUDE.md §7.1 (`user dùng lệnh → INFO`) + §7.4 (chỉ log `userId`, không log nội dung nhạy cảm) (VI)
  EN: **Command usage logging to console** — when a Discord user runs a module command, logs `[INFO] Command '/<name>' used by <userId> in guild <guildId>` with `{ module }` meta (`DM` when not in a guild). Per CLAUDE.md §7.1 (command use → INFO) + §7.4 (only `userId` is logged, never sensitive content).

## [3.0.1] — 2026-08-14
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- `core/console`: **startup/hot-operations không log module load — vi phạm CLAUDE.md §7.1 (module load phải log INFO)** — `ModuleManager.loadDir` (startup `loadAll` + lệnh `modules load`) và `reload` giờ log `[INFO] [core/loader] [modules/<name>] Loading module '<name> v<version>` + `Module '<name>' loaded (<n> commands, <n> events)` (dùng `logger.child({ source, context })` đúng format §7.2). Kèm test assert source/context + thông báo (VI)
  EN: Module loads were never logged at startup or during hot operations — violating CLAUDE.md §7.1 (module load must log INFO). `ModuleManager.loadDir` (startup `loadAll` + the `modules load` command) and `reload` now log `[INFO] [core/loader] [modules/<name>] Loading module '<name> v<version>` + `Module '<name>' loaded (<n> commands, <n> events)` via a `logger.child({ source, context })` matching the §7.2 format. Added a test asserting source/context + messages.

## [3.0.0] — 2026-08-14
**Loại / Type:** MAJOR — breaking config change (gỡ section `app` khỏi config.yml) / breaking config change (`app` section removed from config.yml)

### Changed
- `shared/config`: `app` (name + version) **KHÔNG còn khai báo trong config.yml** — name + version **lấy hoàn toàn từ package.json** (nguồn sự thật duy nhất, chống drift §10). Đổi `readPackageVersion` → `readPackageInfo(root)` trả `{ name, version }`; `loadCoreConfig()` điền `config.app` từ package.json thay vì ghi đè từ hàm đọc version. Schema `core.schema.json` bỏ `app` khỏi `required`/`properties` (config cũ để lại `app` vẫn load được, kèm cảnh báo) (VI)
  EN: `app` (name + version) is **no longer declared in config.yml** — name + version are **taken entirely from package.json** (single source of truth, prevents drift §10). Replaced `readPackageVersion` with `readPackageInfo(root)` returning `{ name, version }`; `loadCoreConfig()` fills `config.app` from package.json instead of overriding via the version-only function. Removed `app` from `core.schema.json` `required`/`properties` (a legacy `app` section still loads, with a warning).
- `config/config.example.yml`, `CLAUDE.md §6.5`: gỡ mục khai báo `app` trong ví dụ (VI)
  EN: `config/config.example.yml`, `CLAUDE.md §6.5`: removed the `app` declaration from the sample config.
- `shared/config/semantic`: thêm cảnh báo khi config vẫn còn section `app` cũ — name/version giờ lấy từ package.json (VI)
  EN: `shared/config/semantic`: added a warning when a legacy `app` section is still present — name/version now come from package.json.

## [2.2.0] — 2026-08-14
**Loại / Type:** MINOR — thay đổi hành vi / behavior change

### Changed
- `core` + `shared/config`: **khi config invalid, thay vì RESTORE (ghi đè file bằng backup) → giờ LOAD backup gần nhất** — `config.yml`/`defaults.yml` bị lỗi **không bị ghi đè**, chỉ nội dung backup mới nhất được dùng tạm cho lần boot đó. Admin thấy rõ file đang lỗi và sửa; restart sau khi sửa để dùng config thật. Thay `restoreLatestValidConfig()` bằng `loadLatestBackupContent()` (chỉ đọc, không ghi); `loadCoreConfig()` hỗ trợ load từ chuỗi backup qua `loadConfigFromContent()` (VI)
  EN: When the config is invalid, instead of RESTORE (overwriting the file with the backup) we now LOAD the newest backup — the broken `config.yml`/`defaults.yml` is NOT overwritten, only the newest backup content is used temporarily for that boot. The admin can see the broken file and fix it; restart after fixing. Replaced `restoreLatestValidConfig()` with `loadLatestBackupContent()` (read-only); `loadCoreConfig()` now supports loading from backup content via `loadConfigFromContent()`.
- `shared/config`: `restoreLatestValidConfig` đã bị gỡ (auto-restore) — rollback thủ công `npm run restore:config` vẫn dùng `restoreConfig` (VI)
  EN: `restoreLatestValidConfig` removed (auto-restore); manual rollback `npm run restore:config` still uses `restoreConfig`.
- Ghi chú hành vi mới thêm vào CLAUDE.md §6.6 (VI)
  EN: CLAUDE.md §6.6 updated with the new behavior.

## [2.1.1] — 2026-08-14
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- `modules/ping`: **latency "load cực lâu" sau khi bot khởi động** — `client.ws.ping` của discord.js chỉ có sau heartbeat ACK đầu tiên (heartbeat interval Discord ~41s), nên `/ping` hiển thị `{latency}` = `...ms` trong gần 1 phút. Fix: khi `ws.ping` chưa sẵn, module đo RTT tới endpoint công khai `discord.com/api/v10/gateway` (không cần auth), cache tạm 30s; `ws.ping` thay thế ngay khi có. `...` chỉ còn xuất hiện khi cả 2 cách đều fail. File mới `src/latency.ts` + 2 test (VI)
  EN: **Latency "loads very slowly" after bot startup** — discord.js `client.ws.ping` only exists after the first heartbeat ACK (Discord heartbeat interval ~41s), so `/ping` showed `{latency}` = `...ms` for ~a minute. Fixed: when `ws.ping` isn't ready, the module measures RTT to the public `discord.com/api/v10/gateway` endpoint (no auth), cached for 30s; `ws.ping` takes over as soon as available. `...` now only appears when both methods fail. New `src/latency.ts` + 2 tests.

## [2.1.0] — 2026-08-14
**Loại / Type:** MINOR — thêm tính năng mới / new feature

### Added
- `modules/ping`: config mới `prefer_type` (`'plain' | 'embed'`) — khi `random: false`, `/ping` chọn response đầu tiên khớp type đó thay vì luôn lấy response đầu tiên (hữu ích khi response embed không đứng đầu danh sách). Không khai → giữ nguyên hành vi cũ (response đầu tiên); không có response khớp → fallback response đầu tiên. Update schema, defaults, README; kèm 3 test (VI)
  EN: New `prefer_type` config (`'plain' | 'embed'`) in `modules/ping` — when `random: false`, `/ping` picks the first response matching that type instead of always the first one (useful when the embed isn't first in the list). Unset → previous behavior (first response); no match → fallback to the first response. Schema, defaults, README updated; 3 tests added.

## [2.0.1] — 2026-08-14
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- `core/loader`: **config module không được truyền tới handler — `/ping` luôn trả plain fallback "Pong!"** — `loadModule` gán nhầm wrapper `{ content, config }` (trả về từ `loadModuleConfig`) vào `entry.config`/`getConfig()` thay vì `moduleConfig.config` (merged config thật). Handler đọc `cfg.responses` → `undefined` → `pickResponse` fallback → reply "Pong!", nên mọi thay đổi `defaults.yml` (đổi plain→embed, `random: false`, thứ tự response) đều không có tác dụng dù đã `modules reload ping`. Fix: `config: moduleConfig.config`, `getConfig: () => moduleConfig.config ?? {}`. Kèm regression test (VI)
  EN: Module config was never delivered to handlers — `/ping` always replied the plain "Pong!" fallback. `loadModule` assigned the `{ content, config }` wrapper (returned by `loadModuleConfig`) to `entry.config`/`getConfig()` instead of the real merged config (`moduleConfig.config`). Handlers read `cfg.responses` → `undefined` → `pickResponse` fallback → "Pong!", so any `defaults.yml` change (plain→embed, `random: false`, response order) had no effect even after `modules reload ping`. Fixed: `config: moduleConfig.config`, `getConfig: () => moduleConfig.config ?? {}`. Added a regression test.


## [2.0.0] — 2026-08-14
**Loại / Type:** MAJOR — breaking change (gỡ prefix lệnh) / breaking change (command prefix removed)

### Changed (breaking)
- `core/console`: **gỡ hẳn prefix `averon` khỏi lệnh** — trước đây phải gõ `averon status`/`averon modules ...`; giờ gõ thẳng `status`, `help`, `modules list`, `modules load <name>`, ... Gõ `averon ...` → báo lỗi hướng dẫn rõ ràng: `'averon' prefix removed — type commands directly: status, modules list, help` (VI)
  EN: The `averon` prefix is fully removed from console commands — previously `averon status`/`averon modules ...`; now type bare `status`, `help`, `modules list`, `modules load <name>`, ... Typing `averon ...` returns a clear hint: `'averon' prefix removed — type commands directly: status, modules list, help`.
- `core/console`: help text không còn nhắc prefix (`averon status` không xuất hiện); error message trong `manager.ts` đổi sang `modules load/reload ...` (VI)
  EN: Help text no longer mentions the prefix; `manager.ts` error hints now say `modules load/reload ...`.
- Test: parser + end-to-end hoạt động với lệnh thẳng; test `averon ...` bị reject (VI)
  EN: Tests: bare commands via parser + end-to-end; `averon ...` is rejected.

## [1.0.4] — 2026-08-14
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- `shared/logger`: **`[INFO ]`/`[WARN ]` có khoảng trắng thừa trước `]`** — `formatLine` pad level bằng `padEnd(5)`; bỏ padding → level xuất hiện tự nhiên `[DEBUG]`/`[INFO]`/`[WARN]`/`[ERROR]`/`[FATAL]`. Hệ quả phụ: `colorizeLevel` cũng do đó mà bỏ sót INFO/WARN — regex đã cho phép khoảng trắng (`\s*`) để tô màu đủ 5 level dù có/không pad. Kèm regression test cho cả 5 level (VI)
  EN: `[INFO ]`/`[WARN ]` had a stray space before `]` — `formatLine` padded the level with `padEnd(5)`; padding removed so levels render naturally as `[DEBUG]`/`[INFO]`/`[WARN]`/`[ERROR]`/`[FATAL]`. Side effect: `colorizeLevel` had also been skipping INFO/WARN because of that padding — its regex now allows optional whitespace (`\s*`), coloring all 5 levels whether padded or not. Added a per-level regression test.
- `core/console` + `core/config`: **prompt console thiếu `>` — khó phân biệt đang ở màn nhập lệnh** — config `console.prompt` giữ nguyên là tên gốc (`averon`); dấu `> ` **tự động thêm khi render** (`renderPrompt` trong `OperatorConsole`) → hiển thị `averon> `. Thêm test cho `renderPrompt` (VI)
  EN: The console prompt was missing `>` — hard to tell you're at the input line — config `console.prompt` keeps only the base name (`averon`); the `> ` suffix is **appended automatically at render time** (`renderPrompt` in `OperatorConsole`) → displays `averon> `. Added `renderPrompt` tests.

## [1.0.3] — 2026-08-14
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Changed
- `core/console` + `core/config`: prompt console đổi từ `averon> ` → `averon` (bỏ hậu tố `> ` không cần thiết) — sync default (`core/config`), config files (`config.yml`, `config.example.yml`), test, docs/README (VI)
  EN: Console prompt changed from `averon> ` to `averon` (dropped the unneeded `> ` suffix) — synced the default, config files, tests, and docs/README.

### Fixed
- `core/bootstrap`: `console.prompt` trong config trước đây bị bỏ qua — bootstrap không truyền prompt vào `OperatorConsole` nên prompt thật luôn là default hardcode `averon`. Giờ truyền `prompt: getConsoleConfig(config).prompt` → config là nguồn sự thật, default chỉ là fallback. Kèm test `getConsoleConfig` (override/default/tắt) (VI)
  EN: `console.prompt` from config used to be ignored — bootstrap never passed it to `OperatorConsole`, so the prompt was always the hardcoded `averon` default. Now bootstrap passes `prompt: getConsoleConfig(config).prompt`, making config the source of truth with the code default as fallback. Added `getConsoleConfig` tests (override/default/disabled).

## [1.0.2] — 2026-08-14
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- `core/discord`: fix `DeprecationWarning` — event `ready` đã được rename thành `clientReady` (discord.js v14.16+, sẽ gỡ `ready` ở v15); chờ `clientReady` khi login (VI)
  EN: Fixed the `ready` → `clientReady` `DeprecationWarning` (discord.js v14.16+; `ready` removed in v15) when waiting for the gateway after login.
- `core/console`: **log không còn chèn vào dòng nhập CLI** — thêm `ProtectedOutput`: khi console TTY hiện prompt, mỗi dòng log xoá dòng hiện tại → in log → render lại prompt (bootstrap tạo guard + logger ghi qua nó) (VI)
  EN: Logs no longer corrupt the CLI input line — added `ProtectedOutput`: while the TTY prompt is shown, each log line clears the current line, prints, then re-renders the prompt (bootstrap wires the guard into the logger).
- `core/console`: **bấm Enter không có lệnh → không còn in `Error: empty input`** — dòng trống được bỏ qua im lặng, chỉ nhắc lại prompt (VI)
  EN: Pressing Enter with no input no longer prints `Error: empty input` — empty lines are silently ignored and the prompt is re-shown.

## [1.0.1] — 2026-08-14
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- **Backup config module lưu nhầm chung folder với core**: trước đây `shared/config/backup` đẩy mọi backup về `<root>/config/backups/` — giờ module backup nằm trong chính folder module (`modules/<name>/config/backups/`), cô lập theo Golden Rule (§5.3). Đồng bộ `restore-config.ts` (list/rollback module dùng `modules/<name>/`), `core/loader` restore module, `.gitignore` (VI)
  EN: Module config backups used to be stored in the same shared folder as core backups (`<root>/config/backups/`) — now they live inside the module's own folder (`modules/<name>/config/backups/`), isolated per the Golden Rule (§5.3). Synced `restore-config.ts` (module list/rollback targets `modules/<name>/`), the `core/loader` module restore path, and `.gitignore`.

## [1.0.0] — 2026-08-14
**Loại / Type:** MAJOR — breaking change / breaking change

### Changed (breaking)
- **Gỡ override config module khỏi core config**: bỏ section `modules.<name>` trong `config/config.yml` (schema, loader, bootstrap). Config module giờ **chỉ nằm trong folder module** (`modules/<name>/config/defaults.yml`) — admin chỉnh thẳng file đó, không còn override từ core config (VI)
  EN: **Removed the per-module config override from the core config**: dropped the `modules.<name>` section in `config/config.yml` (schema, loader, bootstrap). Module config now **lives only in the module folder** (`modules/<name>/config/defaults.yml`) — admins edit that file directly; no more override from the core config.

## [0.9.0] — 2026-08-14
**Loại / Type:** MINOR — thêm tính năng mới / new feature

### Added
- `shared/errors`: hệ thống lỗi chuẩn cho module + core — `UserError`, `NotFoundError`, `PermissionError`, `RateLimitError`, `InvalidArgumentError` + `toUserMessage()` (VI)
  EN: Added `shared/errors` — standard error types for modules + core plus `toUserMessage()`.
- `core/discord`: boundary bắt lỗi command giờ **tự phản hồi cho user theo loại error** — module `throw` typed error (KHÔNG reply hardcode); lỗi nội bộ: dev hiện chi tiết (`dev.show_stacktrace`), prod che giấu internals; interaction đã ack → tự fallback `followUp` (§8, §9.1) (VI)
  EN: `core/discord` command boundary now **auto-replies to the user by error type** — modules throw typed errors instead of hardcoding replies; internal errors show detail in dev (`dev.show_stacktrace`), hidden in prod; already-acknowledged interactions fall back to `followUp` (§8, §9.1).

### Changed
- `modules/ping` + `shared/config/module-semantic`: bỏ `validateConfig` hardcode trong module — config module validate hoàn toàn bằng JSON Schema (`config/schema.yml`), hệ thống tự xử lý nhiều loại error (required, type, enum/const, pattern, additionalProperties, oneOf...) (VI)
  EN: Removed the hardcoded `validateConfig` from `modules/ping` and its hook in `shared/config/module-semantic` — module config is validated entirely by JSON Schema (`config/schema.yml`), which auto-handles many error types (required, type, enum/const, pattern, additionalProperties, oneOf...).

### Fixed
- `core/loader`: `root is not defined` khi config module không hợp lệ và cần restore từ backup — dùng `this.root` thay vì biến không tồn tại (VI)
  EN: Fixed `root is not defined` in `core/loader` when module config is invalid and a backup restore is needed — now uses `this.root`.
- `core/discord` test login: timeout 5s do không mock gateway ready — mock `client.isReady()` để login resolve ngay (VI)
  EN: Fixed the `discord.login` test timeout caused by an un-mocked gateway ready — mocked `client.isReady()` so login resolves immediately.

## [0.8.4] — 2026-08-13
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Added
- **Config module tự xử lý validate**: module có thể export hàm `validateConfig(config)` để tự validate config của chính mình (thay vì hardcode logic trong `shared/config/module-semantic.ts`). Module `ping` đã di chuyển logic validate vào `src/index.ts` (VI)
  EN: Modules can now export a `validateConfig(config)` function to self-validate their config (replacing the hardcoded logic in `shared/config/module-semantic.ts`). The `ping` module has moved its validation logic to `src/index.ts`.

### Fixed
- **Ping -1 + phản hồi sai lúc mới khởi động**: trước đây `bootstrap` load modules + mở operator console **trước khi** Discord client sẵn sàng → lệnh `/ping` đầu tiên trả `{latency}` = -1 (ws.ping chưa đo được). Fix: `DiscordClient.login()` đợi `ready` event trước khi resolve, `bootstrap` gọi login **trước** khi load modules và sync commands; bỏ `discord.login()` kép còn sót lại (gây unhandled rejection "tried to connect a shard that wasn't idle" mỗi lần boot). `/ping` hiển thị `...` thay vì `-1` khi ws.ping chưa đo được (VI)
  EN: -1 ping + wrong response right after boot: bootstrap previously loaded modules + started the operator console **before** the Discord client was ready → the first `/ping` returned `{latency}` = -1 (ws.ping not measured yet). Fixed: `DiscordClient.login()` now waits for the `ready` event before resolving, `bootstrap` logs in **before** loading modules and syncing commands; removed the leftover duplicate `discord.login()` (caused an unhandled rejection "tried to connect a shard that wasn't idle" on every boot). `/ping` now shows `...` instead of `-1` while ws.ping is not measured yet.
- **Module `ping` load thất bại do validate config sai**: `shared/config/module-semantic.ts` kiểm tra field `response` nhưng config thực tế dùng `responses`. Fix: di chuyển logic validate vào module `ping` và gọi qua hook `validateConfig` (VI)
  EN: Module `ping` failed to load due to incorrect config validation: `shared/config/module-semantic.ts` checked for a `response` field but the actual config used `responses`. Fixed: moved validation logic into the `ping` module and called via the `validateConfig` hook.
- **Reload module sau thay đổi config không có hiệu lực**: `ModuleManager.reload` tái dùng entry cũ trong registry → config đổi trên đĩa (`modules/<name>/config/defaults.yml` hoặc `config/config.yml → modules.<name>`) **không** được nạp lại; handler còn đọc config qua closure cũ. Fix: `reload` (soft + `--force`) giờ load lại **fresh từ đĩa** (giống `load`): gỡ entry cũ, `loader.loadModule` lại (đọc lại defaults.yml + handler), attach lại; `CommandContext` thêm field `registry` để handler lấy config **mới nhất** qua `registry.getModule(name).getConfig()` thay vì closure (VI)
  EN: Module reload after a config change did not take effect: `ModuleManager.reload` reused the stale registry entry → on-disk config changes (`modules/<name>/config/defaults.yml` or `config/config.yml → modules.<name>`) were **not** re-read, and the handler kept reading config via a closure captured at attach time. Fixed: `reload` (soft + `--force`) now reloads **fresh from disk** (same as `load`): drops the stale entry, re-runs `loader.loadModule` (re-reads defaults.yml + handlers), re-attaches; `CommandContext` gained a `registry` field so handlers read the **latest** config via `registry.getModule(name).getConfig()` instead of a closure.
- **Config loader trả `{}` thay vì `undefined`**: module không khai báo `config.defaults` → `entry.config`/`getConfig()` trả `{}` (object rỗng, không `undefined`) để handler luôn có config hợp lệ; vẫn chỉ validate schema khi defaults thực sự load được (VI)
  EN: Config loader returns `{}` instead of `undefined`: a module without `config.defaults` now yields `entry.config`/`getConfig()` = `{}` (empty object, never `undefined`) so handlers always get a valid config; schema validation still only runs when defaults were actually loaded.
- **Test `discord.login` timeout**: `login()` đợi `ready` khiến test cũ (mock login nhưng không bao giờ ready) treo 5s → cập nhật test cho hành vi mới + thêm test "chờ ready event" (VI)
  EN: `discord.login` test timed out: `login()` now waits for `ready`, so the old test (mock login but never ready) hung for 5s → updated the test for the new behavior + added a "waits for ready event" test.
- **Boot treo vô hạn nếu gateway không ready**: `login()` đợi `ready` không có giới hạn → mạng chậm/đứt có thể treo boot mãi. Fix: `DiscordClient.login()` bọc toàn bộ login + chờ ready trong timeout (config mới `discord.login_timeout_ms`, mặc định 30000ms); vượt hạn → destroy client (cleanup) + throw để boot fail-fast (§9.1) (VI)
  EN: Boot could hang forever if the gateway never became ready: `login()` waited for `ready` unbounded → a slow/broken network could hang boot indefinitely. Fixed: `DiscordClient.login()` wraps the whole login + ready-wait in a timeout (new config `discord.login_timeout_ms`, default 30000ms); on timeout → destroys the client (cleanup) + throws so boot fails fast (§9.1).
- **Reload module không nạp lại CODE đã sửa**: Node cache `import()` theo URL → sau reload, handler/entry vẫn là bản code CŨ trong cache (chỉ config mới có hiệu lực). Fix: `ModuleLoader` import ESM với cache-buster (`?v=<time>-<seq>`) để mỗi lần load/reload nạp lại code mới nhất từ đĩa (hot-reload code qua `averon modules reload`) (VI)
  EN: Module reload did not pick up CODE changes: Node caches `import()` by URL → after reload, handlers/entries were still the OLD cached code (only config took effect). Fixed: `ModuleLoader` imports ESM with a cache-buster query (`?v=<time>-<seq>`) so every load/reload imports the latest code from disk (hot-reload code via `averon modules reload`).

## [0.8.4] — 2026-08-13
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- **Reload module sau thay đổi config chậm + race condition config cũ/mới**: handler giữ closure config cũ → config mới không có hiệu lực sau reload. Fix: cache config đã merge trong `ModuleEntry` (thay vì merge lại mỗi lần load), handler lấy config mới nhất từ `registry.getModule` thay vì closure. Thêm cache-buster cho `import()` handler để Node.js nạp lại code mới nhất khi reload (hot-reload code) (VI)
  EN: Slow module reload after config changes + config race: handlers kept a closure of the old config → new config never took effect after reload. Fixed: cache the merged config in `ModuleEntry` (no re-merge on each load), handlers read the latest config from `registry.getModule` instead of the closure. Added a cache-buster to `import()` so Node.js re-imports the latest handler code on reload (hot-reload code).
- **Latency -1ms khi khởi động**: Discord gateway chưa sẵn sàng khi handler chạy lần đầu → `interaction.client.ws.ping` là -1. Fix: bot đợi gateway ready hoàn toàn trước khi attach command (hiển thị `...` thay vì -1 gây hiểu nhầm). Thêm timeout 30s cho login (fail-fast thay vì treo vô hạn) (VI)
  EN: -1ms latency on startup: Discord gateway not ready when the first handler ran → `interaction.client.ws.ping` was -1. Fixed: bot now waits for gateway ready before attaching commands (shows `...` instead of a misleading -1). Added a 30s timeout for login (fail-fast instead of hanging indefinitely).

## [0.8.2] — 2026-08-12

### Fixed
- **Không phản hồi commands ở bản build (npm start / dist)**: core loader import file source `.ts` (`modules/ping/commands/ping.ts`) từ manifest, node thuần ở dist không import được `.ts` → `handlerFn` bị `undefined` → command được sync lên Discord nhưng bot không phản hồi khi gọi. Fix: tạo `core/src/loader/resolve.ts` chứa hàm pure `resolveModuleFile` để tự động map đường dẫn sang file đã biên dịch trong `dist/modules/<name>/*.js` nếu đang chạy bản build (runningFromDist=true), giữ fallback về source nếu thiếu file built (VI)
  EN: No command response in built dist (npm start): core loader imported source `.ts` files (`modules/ping/commands/ping.ts`) from manifest, but plain node in dist cannot import `.ts` → `handlerFn` became `undefined` → commands synced to Discord but bot never responded. Fixed: created `core/src/loader/resolve.ts` with pure `resolveModuleFile` to automatically map paths to compiled `.js` files in `dist/modules/<name>/*.js` when running from dist (runningFromDist=true), keeping a fallback to source if missing.

## [0.8.1] — 2026-08-12
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- **Loop load↔reload sau khi unload**: `load` chặn module UNLOADED ("already registered — use reload") còn `reload` chặn UNLOADED ("already unloaded — use load") → không đường nào load lại được. Fix: `load` cho phép module UNLOADED — gỡ entry cũ khỏi registry, load fresh lại từ đĩa (VI)
  EN: load↔reload loop after unload: `load` rejected UNLOADED modules ("already registered — use reload") while `reload` rejected them ("already unloaded — use load") → no way to re-load. Fixed: `load` accepts UNLOADED modules — drops the stale registry entry and re-loads fresh from disk.
- **Console xử lý lệnh song song → race**: `rl.on('line')` gọi `void handleLine()` không await — lệnh sau (vd `load`) chạy đè lệnh trước đang dở (vd `unload` còn DRAINING) khi pipe nhanh hoặc soft-stop chờ in-flight. Fix: `OperatorConsole` tuần tự hoá qua promise chain — mỗi lệnh đợi lệnh trước xong (VI)
  EN: Console processed commands concurrently → race: `rl.on('line')` fired `void handleLine()` un-awaited, so a later command (e.g. `load`) ran over an earlier in-flight one (e.g. `unload` still DRAINING) on fast pipes or during soft-stop waits. Fixed: `OperatorConsole` serializes via a promise chain — each command waits for the previous to finish.
- **Scaffold module (`scripts/new-module.mjs`) lẫn escape ANSI**: template README sinh ra chứa byte màu `\x1b[36m...` → README module mới hiện rác `[36m...`. Đã strip toàn bộ escape khỏi template (VI)
  EN: Module scaffold (`scripts/new-module.mjs`) leaked ANSI color bytes `\x1b[36m...` into the generated README → new modules showed raw `[36m...` garbage. Stripped all escapes from the template.
- **Scaffold sinh test FAIL ngay**: template command `commands/<name>.ts` gọi `await interaction.reply('Pong!')` nhưng **không return** — test scaffold sinh ra assert `result === 'Pong!'` → module mới fail ngay `npm test`. Fix: handler template return content (khớp `modules/ping`) (VI)
  EN: Scaffold generated a FAILING test: the command template `commands/<name>.ts` called `await interaction.reply('Pong!')` without **returning** — the generated test asserts `result === 'Pong!'`, so a fresh module failed `npm test` immediately. Fixed: handler template returns the content (matches `modules/ping`).

### Docs
- **README + docs/ cập nhật cho 0.8.1**: `README.md` (feature hiện tại, operator console, getting-started với config), `modules/ping/README.md` (phản hồi config-driven), thêm mới `docs/architecture.md`, `docs/module-guide.md`, `docs/multi-language.md`, `docs/api/README.md` (service API) (VI)
  EN: Updated READMEs + new docs for 0.8.1: `README.md` (current features, operator console, config-based getting-started), `modules/ping/README.md` (config-driven responses), new `docs/architecture.md`, `docs/module-guide.md`, `docs/multi-language.md`, `docs/api/README.md` (service API).

## [0.8.0] — 2026-08-12
**Loại / Type:** MINOR — tính năng mới / new feature (core/console — quyết định core subsystem, có nêu rõ lý do theo §13.3: điều khiển lifecycle là control-plane của core, và §5.3 cấm module điều khiển module khác)
EN: new core subsystem `core/console` — deliberate core decision (lifecycle control is core's control-plane; §5.3 forbids modules controlling other modules).

### Added
- **Operator console** (`core/console/`, stdin REPL prompt `averon> `): lệnh `averon status`, `averon modules list` (module trên đĩa) / `status` (registry), `averon modules load <name>`, `averon modules unload|reload <name> [--force]`, `averon help` (VI)
  EN: Operator console (`core/console/`, stdin REPL): `averon status`, `averon modules list` (on-disk) / `status` (registry), `averon modules load <name>`, `averon modules unload|reload <name> [--force]`, `averon help`.
- **Soft-stop unload/reload**: state `DRAINING` mới — unload/reload không `--force` sẽ detach Discord listener (ngừng nhận command mới), đợi in-flight handler xong (`UsageTracker.waitIdle`) rồi mới `onUnload`; timeout → giữ DRAINING + hướng dẫn `--force` (VI)
  EN: Soft-stop unload/reload — new `DRAINING` state: non-`--force` detaches Discord listeners, waits for in-flight handlers (`UsageTracker.waitIdle`), then `onUnload`; timeout keeps DRAINING and suggests `--force`.
- **Module discovery theo đĩa**: `core/loader/discover.ts` (glob `modules/*`) thay danh sách hardcode `modules/ping` trong bootstrap (VI)
  EN: Disk-based module discovery (`core/loader/discover.ts`, glob `modules/*`) replaces the hardcoded `modules/ping` list in bootstrap.
- **`DiscordClient.removeCommand` + lưu listener ref**: gỡ được command khỏi client khi unload (VI)
  EN: `DiscordClient.removeCommand` + stored listener refs — commands can now be detached on unload.
- **Config `console:`** (`enabled`/`prompt`/`soft_stop_timeout_ms`) — optional, mặc định trong code (VI)
  EN: New `console:` config section (`enabled`/`prompt`/`soft_stop_timeout_ms`) — optional, defaults in code.
- **`CommandContext.moduleName`** (additive) — để đếm in-flight handler theo module (VI)
  EN: `CommandContext.moduleName` (additive) — enables per-module in-flight tracking.
- **Quick command `-help` / `-h`**: gõ thẳng `-help` hoặc `-h` không cần prefix `averon` để xem help (VI)
  EN: Quick commands `-help` / `-h`: type bare `-help` or `-h` (no `averon` prefix) to show help.
- **`app.version` lấy từ `package.json`**: config.yml không khai báo version nữa — boot tự đọc từ package.json (nguồn sự thật duy nhất, chống drift §10). Thêm `shared/config.readPackageVersion`; `loadCoreConfig` ghi đè `app.version` (VI)
  EN: `app.version` is now derived from `package.json` — config.yml no longer declares a version; boot reads it from package.json (single source of truth, prevents drift §10). Added `shared/config.readPackageVersion`; `loadCoreConfig` overrides `app.version`.

### Fixed
- **Console không nhận lệnh khi `npm run dev`**: `tsx watch` nuốt stdin cho phím restart "rs" → `averon> ` không đọc được input. Đổi dev script sang `node --watch --import tsx` (vẫn tự restart khi sửa file, stdin forward đầy đủ). Có regression test `core/src/console/dev-stdin.test.ts` (VI)
  EN: Console unresponsive under `npm run dev`: `tsx watch` swallows stdin for the "rs" restart key, so `averon> ` never reads input. Switched the dev script to `node --watch --import tsx` (still auto-restarts on file change, stdin fully forwarded). Regression test in `core/src/console/dev-stdin.test.ts`.
- **Output trùng khi unload/reload module**: `modules/ping` in `Module ping unloaded` qua `console.log` (bypass logger, lẫn vào output của operator console `Unloaded module 'ping'`). Bỏ console.log trong `onLoad`/`onUnload` của module mẫu + sửa scaffold `scripts/new-module.mjs` để module mới không tái phạm (VI)
  EN: Duplicate output on unload/reload: `modules/ping` printed `Module ping unloaded` via `console.log` (bypassing the logger, mixing into the operator console's own `Unloaded module 'ping'`). Removed console.log from the sample module's `onLoad`/`onUnload` + fixed the `scripts/new-module.mjs` scaffold so new modules don't repeat it.
- **`npm start` (bản build) fail**: `bootstrap.ts` tính project root bằng `join(dirname(import.meta.url), '..', '..')` → từ `dist/core/src` ra `dist` (sai), nên `backupConfig` tìm `dist/config/config.yml` không có. Đổi sang `findProjectRoot()` — chạy đúng từ src lẫn dist (VI)
  EN: `npm start` (built bundle) failed: `bootstrap.ts` computed the project root as `join(dirname(import.meta.url), '..', '..')` → from `dist/core/src` that resolved to `dist` (wrong), so `backupConfig` looked for the missing `dist/config/config.yml`. Switched to `findProjectRoot()` — correct from both src and dist.

## [0.7.0] — 2026-08-12
**Loại / Type:** MINOR — tính năng mới / new feature

### Added
- **Command description đa ngôn ngữ qua Discord localization**: mô tả lệnh hiển thị theo ngôn ngữ client, lấy từ `description.vi/en` trong `module.yml` (VI)
  EN: Bilingual command descriptions via Discord localization, sourced from `description.vi/en` in `module.yml`.
- **`modules/ping` custom phản hồi qua config** — admin chỉnh `config/config.yml → modules.ping` (không cần đổi code): phản hồi **plain text hoặc embed** (toàn bộ EmbedBuilder), **nhiều câu + random** (`random: true`), **placeholder** `{time} {tag_user} {latency} {username} {user_id} {guild} {guild_id}`; không có config → fallback `Pong!` (VI)
  EN: `modules/ping` config-driven responses via `config/config.yml → modules.ping` (no code change): **plain or embed** replies (full EmbedBuilder), **multiple random** choices (`random: true`), **placeholders** `{time} {tag_user} {latency} {username} {user_id} {guild} {guild_id}`; no config → `Pong!` fallback.
- **`shared/placeholders`**: `renderPlaceholders(text, vars)` thay `{key}` — utility dùng chung, module khác tái dùng được (VI)
  EN: `shared/placeholders`: `renderPlaceholders(text, vars)` replaces `{key}` — shared utility reusable by other modules.
- **Config riêng cho module**: `module.yml` khai báo `config.schema/defaults`; loader validate defaults bằng schema + merge override `modules.<name>` từ config tổng; handler nhận `CommandContext { config, logger }` (VI)
  EN: Per-module config: `module.yml` declares `config.schema/defaults`; loader validates defaults against schema and merges the `modules.<name>` override from the core config; handlers receive `CommandContext { config, logger }`.

### Fixed
- **`modules/ping` embed color**: nhận chuỗi hex chuẩn `#RRGGBB`/`RRGGBB` thay vì int (VI)
  EN: `modules/ping` embed color accepts standard `#RRGGBB`/`RRGGBB` hex strings instead of int.
- **`modules/ping` type tường minh**: response khai báo rõ `type: plain | embed` để đỡ nhầm lẫn (VI)
  EN: `modules/ping` responses now declare an explicit `type: plain | embed` to avoid ambiguity.

## [0.6.1] — 2026-08-11
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- **`core/discord` + `shared/logger`**: log dùng giờ local + độ chính xác ms; `syncCommands` gom vào `set()` bulk thay vì delete lẻ từng command — tránh race/overwrite (VI)
  EN: `core/discord` + `shared/logger`: log timestamps use local time + ms precision; `syncCommands` now uses a bulk `set()` instead of deleting commands one-by-one — avoids races/overwrites.
- **`modules/ping` register nhưng không phản hồi**: gắn command handler để `/ping` thực sự reply (VI)
  EN: Fixed `/ping` being registered but never replying — command handler is now wired up.

## [0.6.0] — 2026-08-11
**Loại / Type:** MINOR — tính năng mới / new feature

### Added
- **`syncCommands` fetch + diff + xóa stale**: khi boot, fetch command hiện có trên Discord → xóa command không còn trong manifest (kể cả lệnh đổi scope global→guild) → đăng ký lại. Gộp slash + context menu vào 1 lần `set()` cho target global (tránh overwrite). Có test cho từng scope (VI)
  EN: `syncCommands` now fetches existing Discord commands, deletes stale ones (incl. scope-changed), then re-registers. Slash + context menus merged into one global `set()` to avoid overwrites. Tested per scope.
- **Semantic checks config** (`shared/config/semantic.ts`): `register_commands.guild=true` bắt buộc `discord.guild_id`; token placeholder trong config thật → lỗi; path Windows hardcode → cảnh báo. Chạy trong boot + `validate:config` (VI)
  EN: Config semantic checks: `guild:true` requires `guild_id`; placeholder token in real config is an error; Windows hardcoded paths warn. Runs at boot + `validate:config`.
- **Backup config tự động + rollback**: mỗi boot với config hợp lệ → backup `config.yml` vào `config/backups/`, giữ 10 bản mới nhất; `npm run restore:config` list + khôi phục (`--yes` để xác nhận) (VI)
  EN: Auto config backup each successful boot into `config/backups/` (keep 10); `npm run restore:config` lists + restores (`--yes` to confirm).

## [0.5.0] — 2026-08-11
**Loại / Type:** MINOR — thay đổi kiến trúc config / config architecture change (có phá vỡ config cũ / breaking config change: nạp lại config từ default/dev/prod sang 1 file `config.yml`)

### Changed
- **Config 1 file duy nhất** `config/config.yml` (gitignored) + `config/config.example.yml` (tracked) — bỏ `default.yml`/`dev.yml`/`prod.yml` + bỏ merge theo env (VI)
  EN: Single `config/config.yml` (gitignored) + tracked `config/config.example.yml` — dropped `default.yml`/`dev.yml`/`prod.yml` + env-based merge.
- **Bỏ toàn bộ biến môi trường** (`process.env`/`AVERON_ENV`/`NODE_ENV`) — user tự sửa trực tiếp `config.yml`; không còn `.env` (VI)
  EN: Removed all env vars (`process.env`/`AVERON_ENV`/`NODE_ENV`) — edit `config.yml` directly; no more `.env`.
- **Cross-platform path**: `defaultConfigDir()` bỏ nhánh `process.cwd()` — luôn tính từ `import.meta.url` → `findProjectRoot`, chạy đúng Windows + Linux (VI)
  EN: `defaultConfigDir()` no longer uses `process.cwd()` — always resolved from `import.meta.url` → `findProjectRoot`, correct on Windows + Linux.
- **`discord.register_commands` theo 3 scope** `global`/`guild`/`user` (object thay vì boolean): global = slash toàn app, guild = slash cho guild cụ thể (cần `guild_id`, tức thời ở dev), user = context menu (type user/message). Mỗi lệnh trong module.yml khai báo `type` + `scope`; core chỉ đăng ký scope được bật — tránh re-register guild/user mỗi lần restart ở dev (VI)
  EN: `discord.register_commands` is now a 3-scope object `global`/`guild`/`user`: global = app-wide slash, guild = guild-scoped slash (needs `guild_id`, instant for dev), user = context menus (type user/message). Each command in module.yml declares `type` + `scope`; core only registers enabled scopes — avoids re-registering guild/user on every dev restart.

## [0.4.0] — 2026-08-11
**Loại / Type:** MINOR — tính năng mới / new feature

### Added
- `core/config`: wrapper `shared/config` — load config tổng + validate bằng `core.schema.json`, kèm test (VI)
  EN: `core/config`: wraps `shared/config` — loads core config + validates with `core.schema.json`, with tests.
- `core/crash`: global anti-crash handlers (uncaughtException/unhandledRejection) + quarantine module lỗi liên tục + crash report ra `crash-reports/`, kèm test (VI)
  EN: `core/crash`: global anti-crash handlers + repeated-failure quarantine + crash reports to `crash-reports/`, with tests.
- `core/registry`: service registry (DI) + module registry, kèm test (VI)
  EN: `core/registry`: service registry (DI) + module registry, with tests.
- `core/lifecycle`: pipeline load/unload/reload module với hook onLoad/onUnload, kèm test (VI)
  EN: `core/lifecycle`: module load/unload/reload pipeline with onLoad/onUnload hooks, with tests.
- `core/loader`: parse `module.yml` + import entry point (in-process) + register commands/events, kèm test (VI)
  EN: `core/loader`: parse `module.yml` + import entry point (in-process) + register commands/events, with tests.
- `core/discord`: wrapper Discord.js client (login, intents từ config), kèm test (VI)
  EN: `core/discord`: Discord.js client wrapper (login, intents from config), with tests.
- `core/ipc`: lớp giao tiếp đa ngôn ngữ (in-process / subprocess qua JSON-RPC; socket/ffi sẽ bổ sung), kèm test (VI)
  EN: `core/ipc`: multi-language communication layer (in-process / subprocess over JSON-RPC; socket/ffi TBD), with tests.
- `core/bootstrap`: entry point chạy pipeline config → logger → anti-crash → module loader → discord login (§9.1), kèm test (VI)
  EN: `core/bootstrap`: entry point running the boot pipeline config → logger → anti-crash → module loader → discord login (§9.1), with tests.
- `scripts/new-module.mjs`: scaffold module mới theo template chuẩn (§5.1) + module mẫu `/ping` (VI)
  EN: `scripts/new-module.mjs`: scaffold a new module per standard template (§5.1) + sample `/ping` module.

## [0.3.0] — 2026-08-11
**Loại / Type:** MINOR — tính năng mới / new feature

### Added
- `shared/config`: YAML loader + merge theo env + validate fail-fast bằng AJV JSON Schema (§6), kèm test (VI)
  EN: `shared/config`: YAML loader + env merge + fail-fast AJV JSON-Schema validation (§6), with tests.
- `shared/logger`: 5 level + format §7.2 + console màu (dev) + file rotate theo size (prod) + mask secret (§7.4), kèm test (VI)
  EN: `shared/logger`: 5 levels + §7.2 format + colored console (dev) + size-rotating file (prod) + secret masking (§7.4), with tests.
- Config mặc định `default.yml` + override `dev.yml`/`prod.yml` + `schemas/core.schema.json` (§6.5) (VI)
  EN: Default `default.yml` + `dev.yml`/`prod.yml` overrides + `schemas/core.schema.json` (§6.5).
- `validate-config` giờ dùng chính `shared/config` (bỏ placeholder) (VI)
  EN: `validate-config` now uses the real `shared/config` (placeholder removed).

## [0.2.0] — 2026-08-11
**Loại / Type:** MINOR — tính năng mới / new feature

### Added
- Quy tắc PR/issue: **mọi thay đổi phải qua PR (hoặc issue)** — tránh system break, Golden Rule §1 (VI)
  EN: New PR/issue rule: every change must go through a PR (or issue) — prevents system break, Golden Rule §1.
- CI GitHub Actions chạy **self-hosted runner** với phân loại label (`self-hosted`, `native`, OS), test → lint → build → validate-config (VI)
  EN: GitHub Actions CI on **self-hosted runners** with label selection, test → lint → build → validate-config.
- Templates cho issue (`bug`, `feature`, `module`) và PR (VI)
  EN: Issue templates (`bug`, `feature`, `module`) and PR template.

## [0.1.0] — 2026-08-11
**Loại / Type:** MINOR — khởi tạo nền móng dự án / project foundation scaffold

### Added
- Khởi tạo dự án: `package.json`, `tsconfig`, `vitest`, `.gitignore` (VI)
  EN: Project scaffold: `package.json`, `tsconfig`, `vitest`, `.gitignore`.
- Cấu trúc thư mục chuẩn theo CLAUDE.md §3: core / modules / shared / config / scripts / docs (VI)
  EN: Standard folder skeleton per CLAUDE.md §3: core / modules / shared / config / scripts / docs.
- `shared/utils/mask` — che bí mật trước khi log (§7.4), kèm test (VI)
  EN: `shared/utils/mask` — secret-masking helper (§7.4), with tests.
- README song ngữ + CHANGELOG theo quy tắc version (VI)
  EN: Bilingual README + CHANGELOG following the version rules.
