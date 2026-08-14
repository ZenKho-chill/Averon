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
random: false               # true → chọn ngẫu nhiên 1 trong responses; false → dùng prefer_type (bên dưới)
prefer_type: embed          # random=false: chọn response đầu tiên khớp 'plain'|'embed'. Bỏ trống → response đầu
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

**Chọn response / Response picking:**

- `random: true` (mặc định) → mỗi lần `/ping` chọn ngẫu nhiên 1 trong `responses`.
- `random: false` → mặc định luôn dùng **response đầu tiên** trong danh sách; thêm `prefer_type: 'plain' | 'embed'` để luôn chọn response đầu tiên **khớp type đó** (dù nó không đứng đầu). Nếu không có response nào khớp `prefer_type` → fallback response đầu tiên.
- EN: `random: true` (default) → each `/ping` picks one of `responses` at random. `random: false` → default uses the **first response**; set `prefer_type: 'plain' | 'embed'` to always pick the first response **matching that type** (even if not first). No match → fallback to the first response.

### Placeholder built-in

| Key | Ý nghĩa / Meaning |
|---|---|
| `{time}` | Giờ địa phương `HH:MM:SS` |
| `{tag_user}` | Tag user `<@id>` |
| `{latency}` | Độ trễ gateway (ms). Sau khởi động, `client.ws.ping` chưa có cho tới khi heartbeat đầu tiên được ACK (~41s — Discord heartbeat interval) → module đo RTT tới `discord.com/api/v10/gateway` làm giá trị tạm, sau đó tự thay bằng `ws.ping` khi có. Chỉ `...` khi cả 2 cách đều không đo được. |
| EN: Gateway latency (ms). Right after startup `client.ws.ping` is absent until the first heartbeat ACK (~41s — Discord heartbeat interval) → the module measures RTT to `discord.com/api/v10/gateway` as a temporary value, then switches to `ws.ping` once available. Only falls back to `...` when neither works. |
| `{username}` | Tên user |
| `{user_id}` | ID user |
| `{guild}` | Tên guild |
| `{guild_id}` | ID guild |

Không có config (hoặc chưa cấu hình `responses`) → fallback `Pong!`.

## Test

```bash
npm test          # chạy test toàn bộ repo (module test nằm trong tests/)
```