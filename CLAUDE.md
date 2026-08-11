# CLAUDE.md — Averon

> Tài liệu kiến trúc & quy ước làm việc của dự án. **Đọc file này trước khi bắt đầu bất kỳ thay đổi nào.**
> EN: Architecture & work-convention document. **Read this before making any change.**

---

## ⚠️ Nguyên tắc vàng (Golden Rule) — ĐỌC ĐẦU TIÊN

> **Khi cần thêm tính năng mới → TẠO module mới trong `modules/`.**
> **KHÔNG sửa `core/`, `shared/`, hay config tổng của core, trừ khi thật sự cần thiết và phải nêu rõ lý do.**

- 1 tính năng = 1 module = 1 folder độc lập trong `modules/`.
- Thêm tính năng → thêm folder; gỡ tính năng → xóa folder. Phần còn lại của hệ thống **không bị ảnh hưởng**.
- Mọi sửa đổi `core/` phải được xem xét như một quyết định kiến trúc, không phải việc thường ngày.

> **Không có test case nghĩa là KHÔNG TỒN TẠI.**
> Một tính năng / function / file được xem là **chưa hoàn thành** khi chưa có test case tương ứng đi kèm — dù code có chạy được. "Chạy được ở local" không phải là bằng chứng tồn tại; **test case là bằng chứng**. Merge/release một thay đổi không kèm test là vi phạm quy tắc này.

---

## 1. Tổng quan dự án (Project Overview)

Averon là hệ thống **Discord bot đa chức năng**, thiết kế theo hướng **module hóa + đa ngôn ngữ lập trình**.

- **Core (engine)** đóng vai trò nền tảng: load/unload module, quản lý lifecycle, cung cấp shared services (logger, config, database, IPC, kết nối Discord).
- **Module** tự khai báo đầy đủ thông tin trong một **module manifest** (`module.yml`): commands, events, config schema, dependencies, ngôn ngữ triển khai.
- **Đa ngôn ngữ**: core và từng module có thể viết bằng ngôn ngữ khác nhau (Node.js/TypeScript, Python, C/C++, Rust...) tùy vào use-case. Cơ chế giao tiếp chuẩn hoá qua lớp **IPC** của core (xem §2.3).

### 1.1 Ngôn ngữ chính (đề xuất, tập trung hoá)

| Thành phần | Ngôn ngữ | Ghi chú |
|---|---|---|
| **Core** | Node.js + TypeScript | Hệ sinh thái Discord.js mạnh nhất, type-safe, chạy được JS/TS module trực tiếp (in-process). |
| **Module thường** | TypeScript | Mặc định mọi tính năng thông thường (command, embed, event...). |
| **Module hiệu năng cao** | C / C++ / Rust / Python | Chỉ khi có lý do thực tế — xem §2.3. |

> Quyết định ngôn ngữ core được **tập trung hoá trong file này + `module.yml`** — đổi core sang Python cũng được, nhưng phải cập nhật lại tài liệu này và cơ chế IPC (§2.3). Module không được giả định cứng cứng rằng core là Node.

---

## 2. Kiến trúc (Architecture)

### 2.1 Các tầng (Layers)

```
┌─────────────────────────────────────────────────────────────┐
│                        Discord Gateway                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                            CORE                             │
│  bootstrap → config/validate → loader → lifecycle → discord │
│  registry (services) · ipc · crash-handler · watchdog       │
└───────────────┬───────────────────────────────┬─────────────┘
                │ load/unload                    │ shared services
┌───────────────▼──────────────┐   ┌─────────────▼─────────────┐
│          MODULES             │   │          SHARED           │
│  modules/*  (mỗi folder độc  │──▶│  logger · config · db     │
│  lập, giao tiếp qua core)    │   │  utils · i18n             │
└───────────────┬──────────────┘   └───────────────────────────┘
                │ (nếu module ngoại ngữ)
┌───────────────▼──────────────┐
│   Subprocess / FFI / Socket  │  ← lớp IPC của core
│   (Python, C, Rust…)         │
└──────────────────────────────┘
```

**Quy tắc phụ thuộc chiều:** `core → shared`, `module → core (services) + shared`. **Module không bao giờ được phụ thuộc vào module khác** (nếu cần, dùng service qua core, hoặc khai báo trong manifest để core sắp xếp thứ tự load).

### 2.2 Vòng đời module (Module Lifecycle)

Core quản lý theo 5 trạng thái: `REGISTERED → LOADING → LOADED → RUNNING → UNLOADED`

1. **REGISTERED** — `loader` đọc `module.yml`, validate manifest (bắt buộc có `name`, `version`, `entry`, `runtime`).
2. **LOADING** — resolve dependencies (`load.after`, `requires`), import entry point, attach commands/events.
3. **LOADED** — gọi hook `onLoad()` của module (nếu có).
4. **RUNNING** — module đã nhận và xử lý event/command.
5. **UNLOADED** — gọi hook `onUnload()` (cleanup: đóng handle, clear interval, unsubscribe), rồi gỡ khỏi registry.

Lỗi ở bất kỳ bước nào → module chuyển sang trạng thái **FAULTED** (bị cô lập, xem §9.2) chứ **không** làm sập core.

### 2.3 Đa ngôn ngữ & cơ chế giao tiếp (Multi-language & IPC)

Core cung cấp lớp **IPC** thống nhất (`core/src/ipc/`). Module chỉ khai báo `runtime.transport` trong `module.yml`; core tự chọn cơ chế.

| `runtime.transport` | Cơ chế | Phù hợp khi | Chi phí |
|---|---|---|---|
| `in-process` | Gọi trực tiếp trong cùng tiến trình | Module cùng ngôn ngữ core (JS/TS) — **mặc định** | 0 (nhanh nhất) |
| `subprocess` | Tiến trình con + JSON-RPC qua stdio | Module Python, hoặc cần cô lập tiến trình | Trung bình (serialize qua JSON) |
| `socket` | TCP/Unix socket, có thể pub/sub | Service chạy lâu, event-driven, hoặc module ở máy khác | Cao hơn (network) |
| `ffi` | Foreign Function Interface / binding trực tiếp | Hàm thuần C/C++/Rust gọi hot-path (tính toán nặng) | Thấp, nhưng phức tạp build |

**Khi nào nên dùng ngôn ngữ nào (decision guide):**

| Use-case | Khuyến nghị | Lý do |
|---|---|---|
| Command, embed, event, CRUD, API gọi | **TypeScript** (ngôn ngữ core) | Không overhead IPC, dễ bảo trì, type-safe |
| Xử lý ảnh / âm thanh / video | **C/C++/Rust** (FFI) hoặc **Python** (nếu dùng lib có sẵn) | Hiệu năng thô cao, lib chuyên dụng |
| Tính toán nặng, crypto, encoding | **C/C++/Rust** (FFI) | Hot-path, sinh mã nhanh |
| ML / data pipeline / automation | **Python** (subprocess) | Hệ sinh thái data/ML tốt nhất |
| Service độc lập, chạy lâu, nhiều tiến trình | Bất kỳ (socket) | Cô lập tốt, scale được |

**Quy tắc bắt buộc:**
1. **Mặc định là TypeScript.** Chỉ dùng ngôn ngữ khác khi có lợi ích *thực tế* (hiệu năng, ecosystem, thư viện độc quyền) — không phải vì "quen".
2. Ghi rõ lý do chọn ngôn ngữ trong `README.md` của module (mục "Why this language?").
3. Mọi dữ liệu qua IPC phải là **JSON-serializable**, có schema rõ ràng, có versioning riêng của contract (field `ipc.api_version` trong manifest nếu cần).
4. Module ngoại ngữ phải xử lý được việc tiến trình con bị chết/treo (timeout, restart, kill) — core chỉ cung cấp cơ chế, module tự quy định timeout hợp lý.

---

## 3. Cấu trúc thư mục (Folder Structure)

> Cấu trúc được tinh chỉnh so với đề xuất ban đầu: thêm `crash-reports/`, `config/schemas/`, `.env.example`, tách `scripts/` theo nhóm, và `core/` chia theo trách nhiệm.

```
averon/
├── CLAUDE.md                      # tài liệu này — đọc trước khi làm việc
├── README.md                      # giới thiệu dự án — SONG NGỮ (Việt + Anh trong 1 file, hoặc 2 file, xem §11)
├── CHANGELOG.md                   # nhật ký thay đổi — SONG NGỮ, tuân thủ quy tắc version (§10)
├── LICENSE
├── .gitignore
├── .env.example                   # MẪU biến môi trường (SECRET KHÔNG BAO GIỜ commit; xem §6.3)
├── package.json                   # workspace root (core + module TS)
├── tsconfig.base.json             # config TS dùng chung
│
├── core/                          # ⚙️ ENGINE — hạn chế tối đa việc sửa đổi
│   ├── src/
│   │   ├── bootstrap.ts           # entry point: config → logger → anti-crash → loader → discord
│   │   ├── config/                # load + merge + validate config YAML (dùng shared/config)
│   │   ├── loader/                # module loader: parse module.yml, import entry, attach commands/events
│   │   ├── lifecycle/             # pipeline start / stop / reload, trạng thái module
│   │   ├── registry/              # service registry (DI) + module registry
│   │   ├── ipc/                   # lớp giao tiếp đa ngôn ngữ: in-process / subprocess / socket / ffi
│   │   ├── discord/               # client Discord gateway wrapper (login, middleware, rate-limit)
│   │   └── crash/                 # global error handlers, quarantine logic, crash report writer
│   ├── tests/
│   └── tsconfig.json
│
├── modules/                       # 📦 MỖI FOLDER = 1 TÍNH NĂNG ĐỘC LẬP (Golden Rule)
│   └── <module-name>/
│       ├── module.yml             # module manifest — core dựa vào đây để load (schema §4)
│       ├── README.md              # mô tả module — SONG NGỮ
│       ├── commands/              # các lệnh (1 file / lệnh)
│       │   └── <command>.ts
│       ├── events/                # các event listener (1 file / event)
│       │   └── <event>.ts
│       ├── src/                   # logic nội bộ module
│       │   ├── index.ts           # entry point (được khai báo trong manifest)
│       │   └── ...
│       ├── config/                # config riêng của module
│       │   ├── defaults.yml       # giá trị mặc định
│       │   └── schema.yml         # validate config module khi load
│       └── tests/
│
├── shared/                        # 🔧 DÙNG CHUNG cho core + module (không phụ thuộc feature nào)
│   ├── logger/                    # logger đa cấp độ: console màu (dev) + file rotate (prod)
│   ├── config/                    # config loader, merge theo env, JSON-Schema validator
│   ├── db/                        # database client / connection pool / migration
│   ├── i18n/                      # (tuỳ chọn) đa ngôn ngữ hiển thị
│   └── utils/                     # hàm tiện ích thuần, không state, không phụ thuộc module
│
├── config/                        # 🧾 CONFIG TỔNG (core-level)
│   ├── default.yml                # giá trị mặc định cho mọi môi trường
│   ├── dev.yml                    # override khi chạy dev
│   ├── prod.yml                   # override khi chạy prod
│   └── schemas/                   # JSON Schema để validate config lúc khởi động
│       ├── core.schema.json       #   schema cho config tổng
│       └── module.schema.json     #   schema cho module.yml (manifest)
│
├── logs/                          # 📝 (gitignored) file log
├── crash-reports/                 # 💥 (gitignored) crash report khi hệ thống sập (§9.4)
│
├── scripts/                       # 🛠 CÔNG CỤ OPS
│   ├── watchdog.mjs               # process manager / auto-restart + retry limit (§9.3)
│   ├── new-module.mjs             # scaffold module mới theo template chuẩn (nên chạy khi thêm feature)
│   ├── validate-config.mjs        # validate toàn bộ config YAML + schema
│   ├── build/                     # build core + module (compile, bundle, native build)
│   └── deploy/                    # deploy script (dev/staging/prod)
│
└── docs/
    ├── architecture.md            # tài liệu kiến trúc chi tiết — SONG NGỮ
    ├── multi-language.md          # hướng dẫn viết module bằng ngôn ngữ khác + IPC — SONG NGỮ
    ├── module-guide.md            # hướng dẫn tạo module từ A-Z — SONG NGỮ
    └── api/                       # tài liệu service API mà core expose cho module
```

**Giải thích các bổ sung so với đề xuất gốc:**
- `core/src/*` chia theo trách nhiệm rõ ràng (loader / lifecycle / registry / ipc / discord / crash) — tránh "core" thành túi rác.
- `crash-reports/` — lưu crash dump riêng, tách khỏi logs.
- `config/schemas/*.json` — validate config bằng schema, "fail-fast" thay vì crash im lặng.
- `.env.example` — secret (token, DB password) **không** nằm trong YAML (xem §6.3).
- `scripts/new-module.mjs` — scaffold module để mọi module sinh ra đều chuẩn cấu trúc.
- `shared/` tách logger/config/db/utils — đây là nơi duy nhất chứa "tiện ích dùng chung".

---

## 4. Module manifest (`module.yml`)

Mỗi module **bắt buộc** có `module.yml` ở root folder của module. Core dựa vào file này để biết cách load. Dưới đây là schema chuẩn (bản tiếng Việt — các field luôn viết bằng tiếng Anh):

```yaml
# modules/<name>/module.yml
name: example                      # bắt buộc — tên module (kebab-case, trùng tên folder)
version: 1.0.0                     # bắt buộc — tuân theo quy tắc version §10
description:
  vi: "Mô tả ngắn tiếng Việt"
  en: "Short English description"
author: "Averon Team"

runtime:                           # bắt buộc — quyết định cơ chế giao tiếp core↔module
  language: typescript             # typescript | javascript | python | c | cpp | rust
  engine: node                     # node | python | native (với ngôn ngữ biên dịch)
  version: ">=18"                  # ràng buộc phiên bản runtime
  transport: in-process            # in-process | subprocess | socket | ffi  (xem §2.3)

entry: src/index.ts                # bắt buộc — entry point (tương đối với folder module)

load:
  after: ["database", "logger"]    # các service phải SẴN SÀNG trước khi load module này
  requires: ["logger"]             # service BẮT BUỘC — thiếu thì KHÔNG load, báo lỗi rõ
  optional: ["database"]           # service tuỳ chọn — module tự xử lý khi thiếu

commands:                          # core tự đăng ký lệnh
  - name: example
    description:
      vi: "Lệnh ví dụ"
      en: "Example command"
    handler: commands/example.ts
    enabled: true

events:                            # core tự attach listener
  - name: messageCreate            # tên event Discord (hoặc event nội bộ core)
    handler: events/messageCreate.ts

config:                            # config riêng của module
  schema: config/schema.yml        # validate khi load
  defaults: config/defaults.yml

ipc:                               # CHỈ cần khi runtime.transport ≠ in-process
  api_version: 1                   # version của contract IPC
  rpc_schema: src/rpc.schema.json  # schema cho message qua IPC

dependencies:                      # dependencies bên ngoài
  npm: []                          # dùng khi engine = node
  pip: []                          # dùng khi engine = python
  system: []                       # thư viện hệ thống (C/C++)

tests:
  command: "npm test"              # lệnh chạy test của module
  dir: tests/
```

**Quy tắc manifest:**
- Field bắt buộc: `name`, `version`, `runtime.*`, `entry`. Thiếu → core **từ chối load** và log ERROR với lý do cụ thể.
- `name` phải trùng tên folder module, kebab-case, không trùng module khác.
- Core validate manifest bằng `config/schemas/module.schema.json` ngay ở giai đoạn REGISTERED.

---

## 5. Quy tắc module (Module Rules)

### 5.1 Thêm module mới
1. Dùng scaffold: `node scripts/new-module.mjs <name>` (hoặc copy 1 module mẫu).
2. Folder mới được tạo trong `modules/<name>/` — **không sửa bất kỳ file core nào**.
3. Viết đầy đủ `module.yml`, `commands/`, `events/`, `src/`, `config/`, `tests/`.
4. Khai báo dependency qua `load.after` / `requires` — **không import thẳng module khác**.
5. Cập nhật `CHANGELOG.md` theo quy tắc §10.

### 5.2 Gỡ module
- Xóa folder module. Core bỏ qua những module không còn trên đĩa khi khởi động.
- Nếu module đang chạy, unload qua lifecycle (gọi `onUnload` để cleanup) trước khi xóa.

### 5.3 Cô lập (Isolation)
- Module **không được** gọi trực tiếp code của module khác. Muốn dùng chung → tạo service trong `core/registry` hoặc utility trong `shared/`.
- Module **không được** import core nội bộ (bên dưới `core/src/`), chỉ dùng **service API** do core expose (`core/registry`).
- Tài nguyên (state, biến toàn cục) của module phải nằm trong scope module — dễ hot-reload, dễ gỡ.

### 5.4 Hot-reload (dev)
- Khi sửa code module trong môi trường dev, core (nếu bật `dev.hot_reload: true`) sẽ reload module bị thay đổi.
- Module cần hỗ trợ `onUnload()` (dọn state) để hot-reload an toàn.

---

## 6. Quy tắc config (Config Rules)

### 6.1 Nguyên tắc chung
- **Toàn bộ config ở dạng YAML** (`.yml`). Config core nằm trong `config/`, config module nằm trong `config/` của chính folder module.
- Mọi config có: **defaults + schema**, validate khi khởi động (§6.4).
- Key dùng kebab-case (`max_failures`), có comment tiếng Anh giải thích từng field.

### 6.2 Thứ tự merge (Merge order)
Config tổng được merge theo thứ tự — giá trị sau đè giá trị trước:

```
config/default.yml
      + config/<env>.yml          # env = AVARON_ENV | NODE_ENV (dev | prod | staging...)
      + biến môi trường (process.env)  # chỉ cho secret, xem §6.3
      + config/module/defaults.yml (riêng từng module, do core merge)
```

### 6.3 Secret (bí mật) — KHÔNG nằm trong YAML
- Token bot, mật khẩu DB, API key → **chỉ** trong `.env` / `process.env` (file `.env` phải được gitignore).
- YAML có thể tham chiếu bằng `${VAR_NAME}` (core resolve lúc load).
- Commit YAML có secret là **lỗi nghiêm trọng**. Logging phải che secret (xem §7.4).

### 6.4 Validate khi khởi động (Fail-fast)
- Khi boot, core validate toàn bộ config bằng JSON Schema (`config/schemas/*.json`).
- Thiếu field bắt buộc / sai kiểu / sai enum → **in lỗi rõ ràng** (liệt kê đúng field, module, file, dòng) và **thoát với mã lỗi ≠ 0** — KHÔNG chạy tiếp với config sai im lặng.
- Có thể chạy trước bằng script: `node scripts/validate-config.mjs`.

### 6.5 Ví dụ config tổng (`config/default.yml`)

```yaml
app:
  name: averon
  version: 0.1.0          # tuân theo quy tắc version §10

discord:
  token: ${DISCORD_TOKEN}  # secret — từ .env
  intents: [Guilds, GuildMessages, MessageContent]

logging:
  level: INFO             # DEBUG | INFO | WARN | ERROR | FATAL
  console_color: false
  file:
    enabled: true
    dir: logs/
    max_size_mb: 20
    keep_files: 7

crash:
  max_failures: 5         # số lần lỗi trước khi quarantine module
  fail_window_ms: 300000  # cửa sổ 5 phút
  watchdog:
    enabled: true
    max_restarts: 5       # giới hạn restart trong cửa sổ
    window_min: 5

dev:
  hot_reload: false
  show_stacktrace: true
```

---

## 7. Quy tắc logging (Logging Rules)

### 7.1 Cấp độ (Levels)
Tối thiểu 5 cấp, dùng chung cho core + module:

| Level | Dùng khi |
|---|---|
| `DEBUG` | Chi tiết quá trình (chỉ dev) — param, payload, state |
| `INFO` | Sự kiện quan trọng: load module, start/stop, user dùng lệnh |
| `WARN` | Vấn đề không nghiêm trọng: config lỗi nhỏ, retry, module bị quarantine |
| `ERROR` | Lỗi nghiêm trọng nhưng hệ thống vẫn chạy: 1 command fail, 1 module fail |
| `FATAL` | Hệ thống không thể tiếp tục: toàn bộ tiến trình sắp sập |

### 7.2 Format chuẩn
```
[2026-08-11T14:03:22.123Z] [INFO ] [core/loader] [modules/example] Loading module 'example'
 ^ timestamp ISO8601           ^level ^nguồn         ^context            ^message
```
- **Timestamp**: ISO 8601 kèm timezone, độ chính xác ms.
- **Nguồn (source)**: file/hàm gọi log — vd `core/loader`, `modules/example/commands/ping.ts`.
- **Context**: module hoặc service liên quan — vd `modules/example`, `core/ipc`, `service/database`.
- Có thể thêm field meta (userId, guildId, command...) khi cần debug.

### 7.3 Console & file
- **Console**: màu theo level ở **dev** (DEBUG=grey, INFO=cyan, WARN=yellow, ERROR=red, FATAL=red+đậm); không màu ở **prod**.
- **File** (prod): `logs/averon-YYYY-MM-DD.log`, **rotate theo dung lượng** (mặc định 20MB/file, giữ 7 file, ghi đè file cũ nhất).
- Module có thể override level riêng qua config module (`logging.level`).

### 7.4 Quy tắc an toàn khi log
- **KHÔNG BAO GIỜ log secret**: token, mật khẩu, API key. Dùng hàm mask (`logger.mask(secret)`).
- Không log nội dung nhạy cảm của user (thay bằng `userId`).
- Ở **prod**, stack trace đầy đủ chỉ ghi vào file + crash-report, **không** hiển thị cho user trong Discord (xem §8).

---

## 8. Dev / Prod mode

Chuyển đổi qua biến môi trường `AVARON_ENV` (ưu tiên) hoặc `NODE_ENV` (fallback) → core tự nạp `config/<env>.yml`.

| | **Dev** | **Prod** |
|---|---|---|
| Log level | `DEBUG` | `INFO` |
| Console màu | Có | Không |
| Hot-reload module | Bật (nếu `dev.hot_reload: true`) | Tắt |
| Stack trace ra output user | Hiện (tiện debug) | **Ẩn** — log chi tiết vào file/crash-report |
| Message lỗi cho user | Chi tiết | Ngắn gọn, an toàn (không lộ cấu trúc nội bộ) |
| Build/optimize | Off (source map bật, build nhanh) | On (bundle, minify, source map tắt) |
| Watchdog | Bật (nhẹ) | Bật (nghiêm ngặt hơn, log đầy đủ) |

---

## 9. Anti-crash & tự phục hồi (Anti-crash & Self-recovery)

### 9.1 Chặn ở tầng core
- `bootstrap.ts` đăng ký global handler: `uncaughtException`, `unhandledRejection` — ghi ERROR + crash report, không để sập cả process vì lỗi 1 module.
- Mọi command/event handler của module được chạy **trong boundary** (try/catch của core) — exception trong handler chỉ làm fail handler đó, không lan ra ngoài.

### 9.2 Cô lập module (Quarantine)
- Nếu 1 module fail **liên tục** (mặc định `crash.max_failures: 5` lần trong cửa sổ 5 phút) → core **tự động unload (disable) module đó** + log `WARN`/`ERROR` rõ ràng.
- Bot vẫn chạy bình thường với các module còn lại.
- Module bị disable: cần restart hoặc lệnh bật lại thủ công (có flag `enabled` trong config module). Lý do disable được lưu trong crash-report để debug.

### 9.3 Auto-restart & giới hạn retry (Watchdog)
- `scripts/watchdog.mjs` (chạy như process manager) tự **respawn** tiến trình khi crash.
- **Giới hạn retry chống restart-loop**: mặc định tối đa 5 lần restart trong 5 phút — vượt ngưỡng → watchdog **dừng hẳn** và log `FATAL` (không để vòng lặp vô hạn đốt tài nguyên).
- Có thể thay bằng process manager bên ngoài (pm2 / systemd / Docker restart policy) miễn là có giới hạn retry tương đương.

### 9.4 Crash report
- Mỗi lần crash: ghi file vào `crash-reports/` với **stack trace, timestamp, version bot, trạng thái module lúc đó** (module nào đang chạy, module nào đang fail), env.
- File đặt tên: `crash-YYYYMMDD-HHmmss-<seq>.json` (hoặc `.log`).

---

## 10. Quy tắc version & CHANGELOG

### 10.1 Quy tắc version (SemVer tuỳ biến của dự án)
Version dạng `<MAJOR>.<MINOR>.<PATCH>`. Chỉ **một** vị trí tăng trong mỗi release:

| Vị trí tăng | Ký hiệu | Ý nghĩa | Ví dụ |
|---|---|---|---|
| **PATCH** (số cuối) | `x.x.0` → tăng số cuối | Chỉ **fix bug** — không thêm tính năng, không đổi hành vi | `1.2.3 → 1.2.4` |
| **MINOR** (số giữa) | `x.0.x` → tăng số giữa | **Thêm tính năng mới** (backward-compatible) | `1.2.4 → 1.3.0` |
| **MAJOR** (số đầu) | `0.x.x` → tăng số đầu | **Breaking change / cập nhật lớn** | `1.3.0 → 2.0.0` |

> Ghi chú: quy tắc này khớp ngữ nghĩa SemVer chuẩn, được quy định rõ cho từng trường hợp để tránh tranh cãi khi bump. **Mỗi module có version riêng** trong `module.yml`; bot tổng có version riêng trong `config/default.yml` → `app.version`.

### 10.2 CHANGELOG — format & quy tắc
- File `CHANGELOG.md` **song ngữ**, mỗi mục version gồm: **ngày, loại thay đổi, module liên quan**.
- Mỗi entry liệt kê theo nhóm: `Added` / `Fixed` / `Changed` (breaking) / `Removed`.
- Entry phải khớp đúng loại version đã bump (ví dụ: nếu chỉ có `Fixed` thì bump PATCH; có `Added` thì bump MINOR; có `Changed`(breaking) thì bump MAJOR).

```markdown
## [1.3.0] — 2026-08-11
**Loại / Type:** MINOR — thêm tính năng mới / new feature

### Added
- `modules/fun`: thêm lệnh `/avatar` (VI)
  EN: Added `/avatar` command to `modules/fun`.
- `core/registry`: thêm service `announce` (VI)
  EN: Added `announce` service to `core/registry`.

### Fixed
- `modules/example`: sửa crash khi config thiếu field (VI)
  EN: Fixed crash when a config field is missing in `modules/example`.

## [1.2.4] — 2026-07-30
**Loại / Type:** PATCH — chỉ fix bug / bugfix only

### Fixed
- `core/discord`: fix reconnect khi mất kết nối gateway (VI)
  EN: Fixed reconnect after gateway disconnection in `core/discord`.
```

---

## 11. Song ngữ (Bilingual: Việt — Anh)

- **README.md / CHANGELOG.md / docs/**: **bắt buộc song ngữ**. Cách tổ chức khuyến nghị:
  - Một file duy nhất, mỗi mục trình bày Việt trước rồi EN sau (như file này), **hoặc**
  - Hai file riêng: `README.vi.md` / `README.en.md` (dùng khi nội dung dài, khó đan xen).
  - Chọn 1 cách và áp dụng **nhất quán cho cả dự án**.
- **Comment code**: dùng tiếng Anh làm chuẩn (chuẩn quốc tế).
- **Config/log message**: key và log message dùng tiếng Anh; chuỗi hiển thị cho user trong Discord có thể dùng `shared/i18n` (nếu triển khai).
- **File này (CLAUDE.md)**: viết tiếng Việt (ngôn ngữ làm việc), từ khoá kỹ thuật giữ tiếng Anh.

---

## 12. Coding conventions

### 12.1 Nguyên tắc chung
- **Single Responsibility**: mỗi hàm/lớp/file chỉ làm **đúng 1 việc**. Không gộp nhiều logic vào 1 hàm. Hàm dài > ~40 dòng → cân nhắc tách.
- **Tên self-documenting**: tên biến/hàm nói lên mục đích; không viết tắt khó hiểu. Đặt tên kiểu mô tả hành động (`sendEmbedToChannel`, không phải `sndEm`).
- **Tách bạch rõ ràng**: `core` / `modules` / `shared` / `config` / `scripts` — không lẫn trách nhiệm.
- **Pure function ưu tiên**: hàm thuần (không side-effect) dễ test, để trong `shared/utils`.
- **Error handling**: không nuốt lỗi im lặng (`catch {}`). Luôn log với context, hoặc throw lên boundary của core (§9.1).
- **Không có magic number/string**: hằng số khai báo rõ tên, hoặc đưa vào config.

### 12.2 Ngôn ngữ
- **TypeScript**: strict mode (`strict: true`), `ESM` mặc định, có type cho mọi hàm public, `import` không dùng `any` trừ khi bất khả kháng.
- **Python**: type hints, follow PEP 8, `docstring` ngắn cho hàm public.
- **C/C++**: clang-format, biên dịch với warning-as-error khi build.
- **Module ngoại ngữ**: xem `docs/multi-language.md`.

### 12.3 Test
> **Nguyên tắc: "không có test case = không tồn tại" (§ đầu file).** Mọi code mới hoặc code đã sửa đều phải có test case đi kèm, chạy được và xanh — nếu không, thay đổi đó không được xem là hoàn thành.

- Mỗi module có `tests/` riêng (lệnh khai báo trong `module.yml`).
- Test bắt buộc cho: parse config, validate manifest, handler command/event, logic thuần.
- Khi sửa bug: viết test tái hiện bug **trước** khi sửa, rồi chạy test sau khi sửa để chứng minh bug đã hết (regression test).
- CI (nếu có) chạy: lint → test từng module → build → validate-config. Test fail = release bị chặn.

---

## 13. Hướng dẫn cho AI khi được yêu cầu thêm / sửa module

> Đây là phần **phải tuân theo khi được yêu cầu làm việc** trên Averon.

### 13.1 Khi được yêu cầu **thêm tính năng mới**
1. **Xác định phạm vi**: tính năng này có thuộc module hiện có không?
   - Có → sửa trong folder module đó (mục 13.2).
   - Không → **TẠO module mới** trong `modules/<name>/`. **KHÔNG sửa core.**
2. **Scaffold**: tạo cấu trúc chuẩn (copy 1 module mẫu hoặc `node scripts/new-module.mjs <name>`):
   - `module.yml` (manifest đầy đủ — §4) + `commands/` + `events/` + `src/index.ts` + `config/` + `tests/` + `README.md`.
3. **Chọn ngôn ngữ** theo §2.3 (mặc định TypeScript; chỉ ngoại ngữ khi có lý do thực tế, ghi rõ trong README).
4. **Khai báo đúng**: commands/events trong manifest để core tự đăng ký; dependency qua `load.after` / `requires`.
5. **Config**: viết `config/defaults.yml` + `config/schema.yml` cho module (bất kỳ tuỳ chỉnh nào của module phải có config, không hard-code).
6. **Test**: viết test cho logic module; chạy được bằng lệnh trong `module.yml`.
7. **Cập nhật docs**: README module (song ngữ) + `CHANGELOG.md` theo §10 (đúng loại bump: Added → MINOR).
8. **Tự kiểm tra**:
   - [ ] Không sửa file nào ngoài folder module (trừ CHANGELOG.md)?
   - [ ] `module.yml` hợp lệ theo schema (§4)?
   - [ ] Config module có defaults + schema, validate qua khi boot?
   - [ ] Module cô lập: không import module khác, không import core nội bộ (§5.3)?
   - [ ] Không hard-code config/secret; không log secret (§6.3, §7.4)?
   - [ ] Log đúng level, có nguồn + context (§7)?
   - [ ] Module hỗ trợ `onUnload` để hot-reload an toàn (§5.4)?
   - [ ] **Toàn bộ code mới / code đã sửa đều có test case đi kèm và chạy xanh?** (no test = doesn't exist, §12.3)
   - [ ] CHANGELOG cập nhật đúng quy tắc version?

### 13.2 Khi được yêu cầu **sửa module hiện có**
- Chỉ sửa trong folder module đó. Giữ nguyên contract trong `module.yml` (nếu đổi contract → đây là breaking change → bump MAJOR của module).
- Cập nhật `CHANGELOG.md` (Fixed → PATCH, Added → MINOR, breaking → MAJOR).
- Chạy test của module để đảm bảo không vỡ.

### 13.3 Khi cần sửa **core / shared** (chỉ khi thật sự cần thiết)
- **KHÔNG tự ý sửa.** Nêu rõ: vì sao module không làm được? Impact lên toàn hệ thống?
- Bắt buộc: mọi service core expose cho module đều có tài liệu trong `docs/api/`; giữ backward-compatible; test core đầy đủ.
- Cập nhật `CHANGELOG.md` đúng loại (thay đổi hành vi public của core → MAJOR).

### 13.4 Việc KHÔNG được làm
- ❌ Sửa core cho "tiện" khi có thể làm trong module.
- ❌ Import chéo module ↔ module (§5.3).
- ❌ Nuốt lỗi im lặng, không log.
- ❌ Viết / sửa code mà **không kèm test case** (không có test = tính năng không tồn tại, §12.3).
- ❌ Hard-code config / token vào code.
- ❌ Commit secret vào git (token, `.env`).
- ❌ Bump version sai loại so với nội dung thay đổi (§10).

---

*Tài liệu này là nguồn sự thật (source of truth) cho kiến trúc & quy ước. Khi có xung đột giữa tài liệu này và thói quen code cũ — ưu tiên tài liệu này. Mọi thay đổi cấu trúc lớn phải cập nhật lại đây.*
