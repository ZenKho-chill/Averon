# CHANGELOG

Quy ước version tuân theo [CLAUDE.md §10](CLAUDE.md): `MAJOR.MINOR.PATCH`
EN: Versioning follows CLAUDE.md §10 — PATCH=bugfix only, MINOR=new feature, MAJOR=breaking change.

## [0.2.0] — 2026-08-11
**Loại / Type:** MINOR — tính năng mới / new feature

### Added
- Quy tắc PR/issue: **mọi thay đổi phải qua PR (hoặc issue)** — tránh system break, Golden Rule §1 (VI)
  EN: New PR/issue rule: every change must go through a PR (or issue) — prevents system break, Golden Rule §1.
- CI GitHub Actions chạy **self-hosted runner** với phân loại label (`self-hosted`, `native`, OS), test → lint → build → validate-config (VI)
  EN: GitHub Actions CI on **self-hosted runners** with label selection, test → lint → build → validate-config.
- Templates cho issue (`bug`, `feature`, `module`) và PR (VI)
  EN: Issue templates (`bug`, `feature`, `module`) and PR template.

## [0.1.0] — 2026-08-11
**Loại / Type:** MINOR — khởi tạo nền móng dự án / project foundation scaffold

### Added
- Khởi tạo dự án: `package.json`, `tsconfig`, `vitest`, `.gitignore`, `.env.example` (VI)
  EN: Project scaffold: `package.json`, `tsconfig`, `vitest`, `.gitignore`, `.env.example`.
- Cấu trúc thư mục chuẩn theo CLAUDE.md §3: core / modules / shared / config / scripts / docs (VI)
  EN: Standard folder skeleton per CLAUDE.md §3: core / modules / shared / config / scripts / docs.
- `shared/utils/mask` — che bí mật trước khi log (§7.4), kèm test (VI)
  EN: `shared/utils/mask` — secret-masking helper (§7.4), with tests.
- README song ngữ + CHANGELOG theo quy tắc version (VI)
  EN: Bilingual README + CHANGELOG following the version rules.
