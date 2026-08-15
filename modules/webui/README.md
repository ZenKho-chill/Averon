# webui — Web UI (Homepage + Dashboard)

Trang chủ của bot + dashboard quản trị (system admin) + dashboard người dùng (user), dưới dạng **HTTP server thuần** (không phải Discord command/event).
EN: Bot homepage + system-admin dashboard + user dashboard, served by a **plain HTTP server** (no Discord commands/events).

## Why this language? / Tại sao TypeScript?

- Mặc định của core là TypeScript (§2.3) — module chạy `in-process`, không overhead IPC.
- HTTP + WebSocket nhẹ, không cần lib nặng: dùng Node built-in `http`/`crypto` + `ws` (Node built-in không có WebSocket server). OAuth2 dùng `fetch` built-in (Node ≥ 18).
- EN: Default module language is TypeScript (§2.3) — runs `in-process`, no IPC overhead. Uses Node built-in `http`/`crypto` + `ws` (no built-in WebSocket server). OAuth2 via built-in `fetch` (Node ≥ 18).

## Yêu cầu / Requirements

- Core **≥ 3.5.0** (dùng `registry.getService()` — onLoad sẽ báo lỗi rõ nếu core cũ hơn).
- `ws` dependency ở workspace root.

## Cấu hình / Configuration

### Non-secret (modules/webui/config/defaults.yml — tracked)

| Key | Mặc định | Ý nghĩa / EN |
|---|---|---|
| `host` | `127.0.0.1` | Địa chỉ bind. Khác localhost (vd `0.0.0.0`) → bắt buộc có auth (api_token hoặc oauth2 client_secret). |
| `port` | `3000` | Cổng HTTP. |
| `static_dir` | `public` | Thư mục frontend tĩnh (tương đối với folder module). |
| `public_home` | `true` | Cho phép trang chủ public (không cần đăng nhập). `false` → buộc login. |
| `admin_user_ids` | `[]` | Discord user IDs được xem là system admin (khi login qua OAuth2). |
| `oauth2.client_id` | `""` | Discord OAuth2 client ID (Discord Developer Portal). |
| `oauth2.redirect_uri` | `""` | Redirect URI — phải khớp trong Portal (vd `http://127.0.0.1:3000/oauth2/callback`). |

### Secret (config/config.yml — gitignored, KHÔNG track)

Repo này PUBLIC — secret đặt trong config tổng, KHÔNG nằm trong module config (file tracked). Xem ví dụ ở cuối `config/config.example.yml`.

| Key | Ý nghĩa / EN |
|---|---|
| `webui.api_token` | Admin API token cho admin dashboard (xác thực timing-safe). |
| `webui.oauth2.client_secret` | Discord OAuth2 client secret. |

```yaml
# config/config.yml
webui:
  api_token: "my-admin-token"
  oauth2:
    client_secret: "discord-oauth2-client-secret"
```

## Cách dùng / Usage

1. Cài `ws` (đã có trong workspace root `package.json`).
2. Thêm secret `webui.*` vào `config/config.yml`.
3. Điền non-secret (host/port/admin_user_ids/oauth2 client_id + redirect_uri) trong `modules/webui/config/defaults.yml`.
4. Restart bot → mở `http://127.0.0.1:3000`.

- **Admin dashboard**: login bằng API token (`webui.api_token`) hoặc Discord OAuth2 (nếu `admin_user_ids` chứa user ID của bạn) → xem status/modules/config/logs, load/unload/reload module, sửa config (trang web hiện ảnh được đã được **mask secret**, lưu thật vào đĩa).
- **User dashboard**: login Discord OAuth2 → xem server (guilds) mà bot và bạn cùng ở.
- **Trang chủ**: status bot (online/modules) public, cập nhật realtime qua WebSocket.

## API / Endpoints

| Method + Path | Auth | Mô tả / EN |
|---|---|---|
| `GET /` | public | Homepage / admin dashboard SPA |
| `GET /api/status` | public | Status public: online, modules count |
| `POST /api/login` | body `{ token }` | Login admin bằng API token |
| `POST /api/logout` | cookie | Đăng xuất |
| `GET /api/me` | cookie | Session hiện tại |
| `GET /oauth2/login` · `GET /oauth2/callback` | — | Discord OAuth2 flow |
| `GET /api/admin/status` · `modules` · `config` · `logs` | admin | Dữ liệu dashboard admin |
| `POST /api/admin/modules/:name/:action` | admin | `load` / `unload` / `reload` module |
| `POST /api/admin/config` | admin | Lưu core hoặc module config (validate trước khi ghi) |
| `GET /api/user/guilds` | user | Guilds dùng chung bot ↔ user |
| `WS /ws?token=…` | admin token | Realtime snapshot (status + modules) mỗi 3s |

## Bảo mật / Security

- Secret (`api_token`, `client_secret`) KHÔNG bao giờ được trả ra web — config hiển thị được mask theo key pattern `/(token|secret|password)/i`.
- So sánh token **timing-safe** (`crypto.timingSafeEqual`); session id random 32-byte, cookie `HttpOnly; SameSite=Lax`.
- OAuth2 dùng `state` (ngẫu nhiên, 1 lần dùng) chống CSRF.
- Static file chống path traversal (guard `..` + normalize); WS token sai → đóng `4001`.
- Host non-localhost mà thiếu auth → boot từ chối (fail-fast).
- Config lưu qua web được **validate lại** bằng schema của core/module trước khi ghi đĩa.

## Test

```bash
npx vitest run modules/webui
```

Che: `config` (resolve settings + secrets), `auth` (safeEqual, session, OAuth2 state), `api` (mask, status/modules/actions, read/save config, logs), `server` (HTTP routes, auth middleware, static, traversal, WS).
EN: Covers config resolution/secrets, auth (timing-safe compare, sessions, OAuth2 state), api (masking, status/modules/actions, read/save config, logs), server (HTTP routes, auth middleware, static, traversal, WebSocket).