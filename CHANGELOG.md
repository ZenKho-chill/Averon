# CHANGELOG

Quy ước version tuân theo [CLAUDE.md §10](CLAUDE.md): `MAJOR.MINOR.PATCH`
EN: Versioning follows CLAUDE.md §10 — PATCH=bugfix only, MINOR=new feature, MAJOR=breaking change.

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
