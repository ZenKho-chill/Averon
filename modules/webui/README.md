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
| `host` | `127.0.0.1` | Địa chỉ bind. Khác localhost (vd `0.0.0.0`) → bắt buộc có Discord OAuth2 (oauth2 client_secret). |
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
| `webui.oauth2.client_secret` | Discord OAuth2 client secret (bắt buộc khi host không phải localhost). |

```yaml
# config/config.yml
webui:
  oauth2:
    client_secret: "discord-oauth2-client-secret"
```

## Cách dùng / Usage

1. Cài `ws` (đã có trong workspace root `package.json`).
2. Thêm secret `webui.oauth2.client_secret` vào `config/config.yml`.
3. Điền non-secret (host/port/admin_user_ids/oauth2 client_id + redirect_uri) trong `modules/webui/config/defaults.yml`.
4. Restart bot → mở `http://127.0.0.1:3000`.

- **Admin dashboard**: login **Discord OAuth2** (tài khoản trong `admin_user_ids` = admin) → xem status/modules/logs realtime, load/unload/reload module, xem **usage command**.
- **User dashboard**: login Discord OAuth2 → xem server (guilds) mà bot và bạn cùng ở — icon, số thành viên, badge "bạn quản lý guild này", nút invite bot điền sẵn guild.
- **Trang chủ**: status bot (online/modules) public, cập nhật realtime qua WebSocket.

## API / Endpoints

| Method + Path | Auth | Mô tả / EN |
|---|---|---|
| `GET /` | public | Homepage / admin dashboard SPA |
| `GET /api/v1/status` | public | Status public: online, modules count |
| `POST /api/v1/logout` | session | Đăng xuất |
| `GET /api/v1/me` | session | Session hiện tại |
| `GET /oauth2/login` · `GET /oauth2/callback` | — | Discord OAuth2 flow (login duy nhất) |
| `GET /api/v1/admin/status` · `modules` · `logs` | admin | Dữ liệu dashboard admin |
| `POST /api/v1/admin/modules/:name/:action` | admin | `load` / `unload` / `reload` module |
| `GET /api/v1/admin/usage` | admin | Thống kê usage command (tổng + theo module/lệnh/guild) |
| `GET /api/v1/user/guilds` | user | Guilds dùng chung bot ↔ user (kèm iconUrl + userCanManage) |
| `WS /ws?token=…` | admin session | Realtime snapshot (status + modules + log stream) mỗi 3s |

## Bảo mật / Security

- Auth 100% qua **Discord OAuth2** (không có API token) — admin = user trong `admin_user_ids`; session id random 32-byte.
- OAuth2 dùng `state` (ngẫu nhiên, 1 lần dùng) chống CSRF.
- Static file chống path traversal (guard `..` + normalize); WS session sai → đóng `4001`.
- Host non-localhost mà thiếu OAuth2 → boot từ chối (fail-fast).

## Test

```bash
npx vitest run modules/webui
```

Che: `config` (resolve settings + secrets), `auth` (session, OAuth2 state), `api` (status/modules/actions, shared guilds), `logs` (LogTailer: tail/rotation/truncate/usage aggregation), `server` (HTTP routes, auth middleware, static, traversal, WS realtime log stream).
EN: Covers config resolution/secrets, auth (sessions, OAuth2 state), api (status/modules/actions, shared guilds), logs (LogTailer), server (HTTP routes, auth middleware, static, traversal, WebSocket).