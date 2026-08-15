# Webio Module

**Mô tả / Description:**
Module webio cung cấp một web dashboard và API để quản lý bot từ xa, bao gồm việc quản lý module, xem trạng thái, xem log realtime và cập nhật cấu hình.
EN: The webio module provides a web dashboard and API to remotely manage the bot, including managing modules, viewing status, realtime logs, and updating configs.

**Tính năng / Features:**
- Web dashboard (HTML/JS thuần)
- Quản lý Module (Load, Unload, Reload, Status)
- Xem log realtime qua WebSocket
- Xem trạng thái Discord realtime qua WebSocket
- Cập nhật config của các module (có validate và backup)
- Bảo mật bằng Bearer token

**Cấu hình / Configuration:**
Thay đổi token mặc định trong `config/defaults.yml` (hoặc thông qua web API) bằng một token mạnh để đảm bảo an toàn.
EN: Change the default token in `config/defaults.yml` (or via web API) to a strong token for security.
