# Module Ping

> Lệnh `/ping` — phản hồi config-driven: plain text hoặc embed, random, placeholder.
> EN: `/ping` command — config-driven responses: plain text or embed, random, placeholders.

## Cấu trúc / Structure

```
modules/ping/
├── module.yml          # manifest — core dựa vào đây để load (§4)
├── README.md           # file này
├── commands/ping.ts    # handler lệnh /ping
├── src/index.ts        # entry point (hooks onLoad/onUnload)
├── config/
│   ├── defaults.yml    # giá trị mặc định
│   └── schema.yml      # JSON Schema validate config module
└── tests/              # test module
```

## Cách dùng / Usage

1. Chạy bot: `npm run dev`
2. Gõ `/ping` trong Discord

## Tùy chỉnh phản hồi / Custom responses

Mặc định `/ping` trả `Pong!`. Admin chỉnh phản hồi **không cần đổi code** — sửa trực tiếp `modules/ping/config/defaults.yml` (config module chỉ nằm trong folder module, không có override trong `config/config.yml`):

```yaml
random: true                  # true → chọn ngẫu nhiên 1 trong responses; false → câu đầu
responses:
  - type: plain               # plain: text thuần + placeholder
    content: "Pong! ({latency}ms)"
  - type: embed               # embed: toàn bộ field EmbedBuilder
    embed:
      title: "Pong!"
      description: "Latency: {latency}ms | {tag_user} | {time}"
      color: "#5865F2"        # màu hex "#RRGGBB" / "RRGGBB" (hoặc số decimal)
      image: "https://example.com/pong.png"    # tùy chọn
      thumbnail: "https://example.com/thumb.png"
      url: "https://example.com"
      footer:
        text: "Averon"
        icon_url: "https://example.com/icon.png"
      author:
        name: "Averon"
        url: "https://example.com"
        icon_url: "https://example.com/author.png"
      fields:
        - name: "Guild"
          value: "{guild}"
          inline: true
      timestamp: true         # true = now | chuỗi ISO hợp lệ
```

### Placeholder built-in

| Key | Ý nghĩa / Meaning |
|---|---|
| `{time}` | Giờ địa phương `HH:MM:SS` |
| `{tag_user}` | Tag user `<@id>` |
| `{latency}` | Độ trễ gateway (ms) — `...` nếu chưa đo được (ws.ping = -1, thường trong vài giây đầu sau connect) |
| `{username}` | Tên user |
| `{user_id}` | ID user |
| `{guild}` | Tên guild |
| `{guild_id}` | ID guild |

Không có config (hoặc chưa cấu hình `responses`) → fallback `Pong!`.

## Test

```bash
npm test          # chạy test toàn bộ repo (module test nằm trong tests/)
```