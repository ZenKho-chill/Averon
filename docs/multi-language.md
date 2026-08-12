# Module đa ngôn ngữ & IPC / Multi-language Modules & IPC

> Core và từng module có thể viết bằng **ngôn ngữ khác nhau**. Giao tiếp chuẩn hoá qua lớp **IPC** của core. Nguồn quy tắc: `CLAUDE.md §2.3`.
> EN: Core and each module may be written in **different languages**. Communication is standardized through core's **IPC** layer. Rules source: `CLAUDE.md §2.3`.

## 1. Khi nào dùng ngôn ngữ nào / Language decision guide

**Mặc định là TypeScript** (ngôn ngữ core). Chỉ dùng ngôn ngữ khác khi có lợi ích *thực tế* — không phải vì "quen".

| Use-case | Khuyến nghị | Lý do |
|---|---|---|
| Command, embed, event, CRUD, API gọi | **TypeScript** (ngôn ngữ core) | Không overhead IPC, dễ bảo trì, type-safe |
| Xử lý ảnh / âm thanh / video | **C/C++/Rust** (FFI) hoặc **Python** (lib có sẵn) | Hiệu năng thô cao, lib chuyên dụng |
| Tính toán nặng, crypto, encoding | **C/C++/Rust** (FFI) | Hot-path, mã chạy nhanh |
| ML / data pipeline / automation | **Python** (subprocess) | Hệ sinh thái data/ML tốt nhất |
| Service độc lập, chạy lâu, nhiều tiến trình | Bất kỳ (socket) | Cô lập tốt, scale được |

Ghi rõ lý do chọn ngôn ngữ trong `README.md` của module (mục "Why this language?").

## 2. Cơ chế IPC / IPC transports

Module khai báo `runtime.transport` trong `module.yml`; core chọn cơ chế tương ứng.

| `runtime.transport` | Cơ chế | Phù hợp khi | Chi phí |
|---|---|---|---|
| `in-process` | Gọi trực tiếp trong cùng tiến trình — **mặc định** | Module cùng ngôn ngữ core (JS/TS) | 0 (nhanh nhất) |
| `subprocess` | Tiến trình con + JSON-RPC qua stdio | Module Python, cần cô lập tiến trình | Trung bình (serialize JSON) |
| `socket` | TCP/Unix socket, có thể pub/sub | Service chạy lâu, event-driven, máy khác | Cao hơn (network) |
| `ffi` | Foreign Function Interface / binding trực tiếp | Hàm thuần C/C++/Rust hot-path | Thấp, nhưng phức tạp build |

```yaml
# modules/<name>/module.yml
runtime:
  language: python          # typescript | javascript | python | c | cpp | rust
  engine: python
  version: ">=3.11"
  transport: subprocess     # in-process | subprocess | socket | ffi

ipc:
  api_version: 1            # version contract IPC (bắt buộc khi transport ≠ in-process)
  rpc_schema: src/rpc.schema.json
```

## 3. Quy tắc bắt buộc / Required rules

1. **Mặc định TypeScript.** Ngôn ngữ khác chỉ khi lợi ích thực tế — ghi lý do trong README module.
2. **Mọi dữ liệu qua IPC phải JSON-serializable**, có schema rõ ràng, có versioning riêng của contract (`ipc.api_version`).
3. **Module ngoại ngữ tự xử lý tiến trình con chết/treo** — timeout, restart, kill. Core chỉ cung cấp cơ chế; module tự quy định timeout hợp lý.
4. Module phải hoạt động được khi IPC bị gián đoạn (lỗi serialization, connection reset...).

## 4. Trạng thái triển khai / Implementation status

> ⚠️ **Hiện tại core mới implement `in-process`** — `core/src/loader/index.ts` từ chối transport khác (`Transport '...' chưa được hỗ trợ`). `subprocess`/`socket`/`ffi` là thiết kế tương lai.

Điều đó nghĩa là bây giờ:

- Module **TypeScript + `transport: in-process`** → hoạt động đầy đủ (mặc định chuẩn).
- Muốn viết module Python/C++/Rust bây giờ → cần đợi core implement transport tương ứng (mở issue/PR), hoặc mô tả kiến trúc trong README module như dự định.
- Khi core bổ sung transport, contract này không đổi: module vẫn chỉ cần khai báo `runtime.transport` + `ipc.api_version` + `rpc_schema`.

## 5. Ví dụ kiến trúc IPC cho module ngoại ngữ (thiết kế) / IPC design example (future)

**Subprocess (Python):**

```
core (Node)  ──spawn──▶  python module.py
   │                        │
   │  JSON-RPC over stdio    │
   ├──── request ──────────▶│  {"id":1,"method":"cmd.ping","params":{...}}
   │◀───────── response ────┤  {"id":1,"result":{...},"error":null}
```

**Socket (service lâu):**

```
core (Node) ──TCP/Unix socket──▶ module service (mọi ngôn ngữ)
   │  pub/sub hoặc request/reply (JSON)
```

**FFI (C/C++/Rust):**

```
core (Node) ──binding trực tiếp (ffi-napi / node-addon-api / WASM)──▶ thư viện native
```

## 6. Tham khảo / Reference

- Quy tắc module & cô lập: `CLAUDE.md §2.3`, §5.
- Tạo module (TypeScript): [`docs/module-guide.md`](module-guide.md).
- Service API cho module: [`docs/api/`](api/).