## Mô tả / Description
<!-- Ngắn gọn thay đổi này làm gì, vì sao. EN: What & why, briefly. -->

## Kiểu thay đổi / Type of change
<!-- Chọn đúng 1 (theo CLAUDE.md §10). Pick one. -->
- [ ] **MAJOR** — breaking change / cập nhật lớn (bump `x.0` đầu)
- [ ] **MINOR** — tính năng mới / new feature (bump `0.x` giữa)
- [ ] **PATCH** — chỉ fix bug / bugfix only (bump `..x` cuối)

## Issue liên quan / Related issue
<!-- Gắn issue nếu có: Closes #123 -->
Closes #

## Checklist (bắt buộc / required)
- [ ] Rule "no test = no exist" (§12.3): **code mới / đã sửa đều có test case đi kèm và chạy xanh**
- [ ] Không vi phạm quy tắc cô lập module (§5.3)
- [ ] Không commit secret / token (§6.3)
- [ ] Config có defaults + schema nếu thêm field
- [ ] Log đúng level, không log secret (§7)
- [ ] Không sửa `core/` / `shared/` trừ khi thật cần & nêu rõ lý do (Golden Rule)
- [ ] CHANGELOG.md cập nhật đúng loại bump + song ngữ (§10)
- [ ] README/docs cập nhật nếu cần (§11)
- [ ] Không commit thẳng `main` — PR này là bằng chứng

## Kiểm thử / Testing
<!-- Cách chạy để verify. EN: How to verify. -->
```bash
npm test
npm run build
```

## Screenshots (nếu có / if applicable)