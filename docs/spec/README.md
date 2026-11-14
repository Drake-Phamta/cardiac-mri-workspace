# Đặc tả sản phẩm v2 — Cardiac MRI Workspace

Đặc tả mô tả đúng sản phẩm đã xây (main + 5 nhánh tính năng), viết lại tháng 11/2026 thay cho đặc tả v1.0 (16 tài liệu tiếng Anh, đã xoá; còn trong lịch sử git).

| File | Nội dung |
|---|---|
| [00_tong-quan.md](00_tong-quan.md) · [01_ca-su-dung.md](01_ca-su-dung.md) | Mục tiêu, phạm vi, thuật ngữ · tác nhân, biểu đồ UC |
| [02_yeu-cau-chuc-nang.md](02_yeu-cau-chuc-nang.md) · [03_yeu-cau-phi-chuc-nang.md](03_yeu-cau-phi-chuc-nang.md) | Yêu cầu chức năng theo người phụ trách, hướng phát triển · phi chức năng |
| [04_kien-truc-cong-nghe.md](04_kien-truc-cong-nghe.md) · [05_du-lieu-csdl.md](05_du-lieu-csdl.md) · [06_api.md](06_api.md) | Kiến trúc, công nghệ · lưu trữ, CSDL · API (hợp đồng 1.2.0) |
| [07_giao-dien.md](07_giao-dien.md) · [08_bao-mat-rieng-tu.md](08_bao-mat-rieng-tu.md) · [09_kiem-thu-truy-vet.md](09_kiem-thu-truy-vet.md) | Màn hình · bảo mật, riêng tư · kiểm thử, truy vết |

Ma trận truy vết: [`docs/trace/matrix.csv`](../trace/matrix.csv). Kiểm tra đồng bộ đặc tả ↔ mã: `python tools/trace_check.py --allow-pending docs/trace/pending_branches.txt`.
