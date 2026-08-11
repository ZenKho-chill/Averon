# Averon

> Discord bot đa chức năng, module hóa, đa ngôn ngữ lập trình.
> EN: A modular, multi-language Discord bot.

## Giới thiệu / Overview

Averon được thiết kế theo hướng **module hóa**: 1 tính năng = 1 module = 1 folder độc lập trong `modules/`. Core chỉ chịu trách nhiệm load/unload module và cung cấp shared services (logger, config, database, IPC). Module có thể viết bằng nhiều ngôn ngữ khác nhau (TypeScript, Python, C/C++, Rust...) tùy use-case.

EN: Averon is designed to be **modular**: one feature = one module = one standalone folder under `modules/`. The core only loads/unloads modules and provides shared services (logger, config, database, IPC). Modules can be written in different languages (TypeScript, Python, C/C++, Rust...) depending on the use case.

**Nguyên tắc vàng / Golden rule:** thêm tính năng mới → tạo module mới trong `modules/`, **không sửa core** trừ khi thật sự cần thiết. EN: new feature → create a new module under `modules/`, never touch the core unless truly necessary.

## Tài liệu / Documentation

| Tài liệu / Document | Nội dung / Content |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Kiến trúc & quy ước làm việc / Architecture & work conventions |
| [CHANGELOG.md](CHANGELOG.md) | Nhật ký thay đổi / Changelog (theo §10) |
| `docs/` | Tài liệu chi tiết: architecture, module guide, multi-language |

## Bắt đầu / Getting started

```bash
npm install     # cài dependencies / install dependencies
npm test        # chạy test / run tests
npm run dev     # chạy dev (chưa khả dụng — chờ core skeleton) / dev mode (pending core skeleton)
```

> ⚠️ Đang ở giai đoạn **khởi tạo nền móng (v0.1.0)** — chưa có tính năng bot thực tế.
> EN: ⚠️ Currently in **foundation scaffold (v0.1.0)** — no bot features yet.
