# Module TempVoice

> Kênh thoại tạm thời (kiểu VoiceMaster) — join kênh "hub" để bot tự tạo kênh riêng cho bạn.
> EN: Temporary voice channels (VoiceMaster-style) — join the "hub" channel and the bot creates a private channel for you.

## Cách dùng / Usage

1. Cấu hình `config/defaults.yml`:
   - `hub_channel_id` — ID kênh voice hub (bắt buộc để module hoạt động; để `""` → module idle).
   - `channel_name_template` — template tên kênh tạm, `{username}` = tên Discord của user.
   - `category_id` — (tùy chọn) category chứa kênh tạm.
   - `max_users` / `bitrate_kbps` — giới hạn slot / bitrate (0 = mặc định).
   - `delete_empty_delay_ms` — delay xóa kênh khi rỗng.
2. User join kênh hub → bot tạo kênh thoại tạm (đặt theo template) và chuyển user vào.
3. User rời kênh tạm → nếu kênh rỗng, bot xóa sau `delete_empty_delay_ms`.

### Why this language?
TypeScript — module thuần event + config, không có hot-path tính toán nặng; dùng ngôn ngữ core (không overhead IPC). EN: Pure event + config module with no hot compute path — uses the core language (no IPC overhead).

## Cấu trúc / Structure

- `events/voiceStateUpdate.ts` — handler sự kiện `voiceStateUpdate` (join hub → tạo kênh; rời kênh tạm → dọn).
- `src/tempvoice.ts` — logic thuần (test dễ): build tên kênh, tạo kênh, lên lịch xóa.
- `src/index.ts` — entry point (lifecycle hooks).
- `config/` — defaults + schema config module.
- `tests/` — test module.

## Test

```bash
npm test
```

## Lưu ý / Notes

- Cần `GuildVoiceStates` intent — khai báo trong `module.yml` (`intents:`), core gộp khi tạo Discord client; **restart bot** để áp dụng.
- Kênh tạm được theo dõi trong module-scope (`src/tempvoice.ts`) — sau khi restart bot, các kênh tạm còn sót lại (nếu có) không được theo dõi nữa; có thể xóa tay hoặc nhắc user rời hết trước khi restart.