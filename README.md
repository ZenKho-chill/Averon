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

> ⚠️ Đang ở giai đoạn **khởi tạo nền móng (v0.3.0)** — chưa có tính năng bot thực tế.
> EN: ⚠️ Currently in **foundation scaffold (v0.3.0)** — no bot features yet.

## Shared services

- **`shared/config`** — load YAML, merge theo môi trường, interpolate biến, validate fail-fast bằng JSON Schema (`config/schemas/`).
- **`shared/logger`** — 5 cấp độ (DEBUG→FATAL), console màu ở dev, file rotate theo dung lượng ở prod, che bí mật khi log.

EN: **`shared/config`** — YAML loading, env merge, variable interpolation, fail-fast JSON-Schema validation (`config/schemas/`). **`shared/logger`** — 5 levels (DEBUG→FATAL), colored console in dev, size-based file rotation in prod, secret masking.

## CI/CD

CI chạy trên **self-hosted runner** (tiết kiệm quota GitHub, hỗ trợ build native module C/C++/Rust).
EN: CI runs on **self-hosted runners** (saves GitHub quota, supports native C/C++/Rust module builds).

Phân loại runner theo **label** trong repo settings — ít nhất thêm label `self-hosted` cho runner của bạn (chi tiết xem `.github/workflows/ci.yml`).
EN: Select runners by **label** — add at least `self-hosted` label to your runner (details in `.github/workflows/ci.yml`).

**Quy tắc workflow / Workflow rule:** mọi thay đổi phải qua **Pull Request** (hoặc ít nhất 1 **Issue**) — không commit thẳng vào `main` (CLAUDE.md Golden Rule §1).
EN: Every change must go through a **Pull Request** (or at least one **Issue**) — never commit directly to `main`.
