# CHANGELOG

Quy ước version tuân theo [CLAUDE.md §10](CLAUDE.md): `MAJOR.MINOR.PATCH`
EN: Versioning follows CLAUDE.md §10 — PATCH=bugfix only, MINOR=new feature, MAJOR=breaking change.

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
