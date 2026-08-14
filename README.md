# Averon

> Discord bot đa chức năng, module hóa, đa ngôn ngữ lập trình.
> EN: A modular, multi-language Discord bot.

## Giới thiệu / Overview

Averon là hệ thống **Discord bot module hóa**: 1 tính năng = 1 module = 1 folder độc lập trong `modules/`. Core chỉ chịu trách nhiệm load/unload module, điều khiển lifecycle và cung cấp shared services (logger, config, IPC, kết nối Discord). Module có thể viết bằng nhiều ngôn ngữ (TypeScript, Python, C/C++, Rust...) tùy use-case — giao tiếp qua lớp **IPC** chuẩn của core.

EN: Averon is a **modular Discord bot**: one feature = one module = one standalone folder under `modules/`. The core only loads/unloads modules, drives the lifecycle, and provides shared services (logger, config, IPC, Discord connection). Modules can be written in different languages (TypeScript, Python, C/C++, Rust...) depending on the use case — communicating through core's standardized **IPC** layer.

**Nguyên tắc vàng / Golden rule:** thêm tính năng mới → tạo module mới trong `modules/`, **không sửa core** trừ khi thật sự cần thiết. **Không có test case = không tồn tại.** Mọi thay đổi phải qua **PR** — không commit thẳng `main`.

EN: **Golden rule:** new feature → create a new module under `modules/`, never touch the core unless truly necessary. **No test = doesn't exist.** Every change must go through a **PR** — never commit directly to `main`.

## Tính năng / Features

- **Operator console** — quản lý bot ngay từ terminal khi đang chạy: `status`, `modules list|status|load|unload|reload [--force]` (gõ thẳng, không cần prefix), quick `-help`/`-h`. Unload mặc định **soft-stop** (state `DRAINING`): đợi in-flight handler xong rồi mới gỡ module; `--force` để gỡ ngay.
  EN: **Operator console** — manage a running bot from the terminal: `status`, `modules list|status|load|unload|reload [--force]` (typed bare, no prefix), quick `-help`/`-h`. Unload defaults to **soft-stop** (state `DRAINING`): waits for in-flight handlers before detaching; `--force` detaches immediately.
- **Module mẫu `ping`** — phản hồi config-driven (không cần đổi code): text **plain** hoặc **embed** đầy đủ, **random** giữa nhiều câu, **placeholder** `{latency} {tag_user} {time}...` — chỉnh qua `config/config.yml → modules.ping`.
  EN: **Sample module `ping`** — config-driven responses (no code change): **plain** text or full **embed**, **random** pick among multiple, **placeholders** `{latency} {tag_user} {time}...` — tuned via `config/config.yml → modules.ping`.
- **Đa ngôn ngữ**: core và từng module có thể viết bằng nhiều ngôn ngữ khác nhau; command description hiển thị theo ngôn ngữ client (Discord localization).
  EN: **Multi-language**: core and each module may use a different language; command descriptions follow client language (Discord localization).

## Tài liệu / Documentation

| Tài liệu / Document | Nội dung / Content |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Kiến trúc & quy ước làm việc / Architecture & work conventions |
| [docs/architecture.md](docs/architecture.md) | Kiến trúc chi tiết: layers, lifecycle, console / Detailed architecture |
| [docs/module-guide.md](docs/module-guide.md) | Tạo module từ A-Z / Creating a module from scratch |
| [docs/multi-language.md](docs/multi-language.md) | Module đa ngôn ngữ & IPC / Multi-language modules & IPC |
| [docs/api](docs/api/) | Service API core expose cho module / Core service API for modules |
| [CHANGELOG.md](CHANGELOG.md) | Nhật ký thay đổi / Changelog (theo §10) |

## Bắt đầu / Getting started

Yêu cầu: **Node.js ≥ 18** (dùng ESM + `node --watch`).

```bash
npm install                                   # cài dependencies / install dependencies

# Config: copy file mẫu rồi dán token bot vào config/config.yml
cp config/config.example.yml config/config.yml

npm test                # chạy toàn bộ test / run all tests
npm run dev             # chạy dev (hot-reload module + operator console) / dev mode
npm run build           # compile TS → dist/ (tsc strict) / build to dist/
npm start               # chạy bản build từ dist/ / run the built bundle
npm run lint            # ESLint
npm run validate:config # validate config/config.yml (schema + semantic) / validate config
npm run new:module -- <name>   # scaffold module mới / scaffold a new module
```

### Operator console

Sau khi boot, terminal hiện prompt **`averon> `** — gõ lệnh trực tiếp để quản lý bot (không cần prefix `averon`):
> EN: After boot the terminal shows the **`averon> `** prompt — type commands directly (no `averon` prefix needed).

```
status                          # tên/version app, uptime, Discord, số module
modules list                    # module trên đĩa (NAME | VERSION | LOADED)
modules status                  # module đã đăng ký (state, quarantine, in-flight, cmds)
modules load <name>             # load module từ đĩa
modules unload <name> [--force] # soft-stop (chờ in-flight) hoặc force
modules reload <name> [--force] # soft/force reload
help                            # help đầy đủ
-help / -h                      # quick help
```

> `npm run dev` dùng `node --watch --import tsx` (không phải `tsx watch`) — `tsx watch` nuốt stdin nên console không nhận lệnh; `node --watch` vẫn auto-restart khi sửa file và forward stdin đầy đủ.
> EN: `npm run dev` uses `node --watch --import tsx` (not `tsx watch`) — `tsx watch` swallows stdin so the console can't read input; `node --watch` still auto-restarts on file change and fully forwards stdin.

## Cấu trúc / Structure

```
averon/
├── core/          # ⚙️ ENGINE — hạn chế sửa đổi tối đa (§3)
│   └── src/       #   bootstrap · config · loader · lifecycle · registry · ipc · discord · crash · console
├── modules/       # 📦 MỖI FOLDER = 1 TÍNH NĂNG (Golden rule)
│   └── <name>/    #   module.yml + commands/ + events/ + src/ + config/ + tests/ + README.md
├── shared/        # 🔧 Dùng chung: logger · config · i18n · utils · placeholders
├── config/        # 🧾 config/config.yml (gitignored) + config.example.yml + schemas/
├── logs/          # 📝 (gitignored)
├── crash-reports/ # 💥 (gitignored)
└── scripts/       # 🛠 watchdog · new-module · validate-config · build · deploy
```

## Shared services

- **`shared/config`** — loader 1 file YAML + validate fail-fast (JSON Schema + semantic), `findProjectRoot`, `readPackageInfo` (app name/version lấy từ package.json), backup/rollback.
- **`shared/logger`** — 5 cấp độ (DEBUG→FATAL), console màu ở dev, file rotate theo dung lượng ở prod, che bí mật khi log.
- **`shared/placeholders`** — `renderPlaceholders(text, vars)` thay `{key}` — dùng chung cho phản hồi module.

  EN: **`shared/config`** — single-file YAML loader with fail-fast validation (JSON Schema + semantic), `findProjectRoot`, `readPackageInfo` (app name/version read from package.json), backup/rollback. **`shared/logger`** — 5 levels (DEBUG→FATAL), colored console in dev, size-based file rotation in prod, secret masking. **`shared/placeholders`** — `renderPlaceholders(text, vars)` replaces `{key}` — reusable across modules.

## CI/CD

CI chạy trên **self-hosted runner** (tiết kiệm quota GitHub, hỗ trợ build native module C/C++/Rust).
EN: CI runs on **self-hosted runners** (saves GitHub quota, supports native C/C++/Rust module builds).

Phân loại runner theo **label** trong repo settings — ít nhất thêm label `self-hosted` cho runner của bạn (chi tiết xem `.github/workflows/ci.yml`).
EN: Select runners by **label** — add at least `self-hosted` label to your runner (details in `.github/workflows/ci.yml`).

**Workflow rule:** mọi thay đổi phải qua **Pull Request** (hoặc ít nhất 1 **Issue**) — không commit thẳng vào `main`; **CI pass rồi mới merge** (CLAUDE.md Golden Rule §1).
EN: Every change must go through a **Pull Request** (or at least one **Issue**) — never commit directly to `main`; **merge only after CI passes**.