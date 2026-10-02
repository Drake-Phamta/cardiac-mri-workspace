# DAY 23 — Phạm Tuấn Anh · 2026-10-02 (thứ Sáu)

**Vai:** leader, chủ V1, người tích hợp. Override Day 22 đã hết hạn lúc 23:59. Hôm nay quy trình thường quay lại
đầy đủ: mỗi PR cần một duyệt hợp lệ đúng SHA head, cộng CI xanh (CP-07). PR về split, C1, ADR-ML hoặc cổng do
leader merge.

## 📌 Việc của riêng anh trong ngày

| Việc | Khi nào |
|---|---|
| **Đã xong tối qua:** GATE-MOB-01 đóng 21:17 (anh nhận L5); DR-016a xác nhận 21:17; merge #82, #77, #78, #73 (squash), #69; #65 đóng vì #77 thay thế | — |
| **Hàng đợi DINOv2: xong.** Cả ba run COMPLETE lúc 05:44; watchdog không phải chạy lại lần nào. Giờ có thể pull thư mục repo chính; nếu UNet phải chạy dự phòng trên PC này, dùng một worktree riêng ở `c7a37e0` | ✅ 09:03 |
| **Đồng hồ PC:** đã tự đúng lại trước 00:05 ngày 02/10 | ✅ |
| Khung duyệt **12:00** và **20:00**, như thường lệ | — |

## 🔴 Việc 1 — duyệt lại phần làm thay trong khối V1 *(sáng)*

| PR | Kiểm |
|---|---|
| #53 → `6b52628` (mô hình SCR-03), #80 → `c7a37e0` (mở case không có run) | chạy `node app/verticals/v1_case_explorer/test_case_explorer.mjs` (88). Theo dõi #80 N1 và N3 (variant null; run được yêu cầu nhưng không có trong danh sách); phải chốt trước khi run đã train tới SCR-03 |
| #77 → `cab847a` (shell, SCR-02/03, công cụ L4, shim `latin1`), #78 → `92a59ff` (SCR-04) | agent A2/A2b làm thay trong khối anh. Chạy `npm test` trong `mobile/` (177) và render smoke; đọc QA-078 delta và #77 NB-1 (import shim trong `maskPng.js`) |
| Gói Day 23 + bảng + DAY_LOG (đã merge tối qua) | đọc lại |

## Quyết định — đã chốt lúc 09:25 ngày 02/10

| # | Câu hỏi | Quyết | Ghi ở |
|---|---|---|---|
| 1, 2 | F5 và ba điểm số; danh sách độ nhạy thứ hai | F5 có áp dụng (che số trong văn bản hiện tại); **không** có danh sách thứ hai | DR-002c |
| 3, 4 | Bộ endpoint hero; literal "DRAFT v0" | Giữ 23 endpoint và giữ literal; sửa câu chữ | DR-020 |
| 5 | Contract 2 | Case lỗi không có run, nằm trong failures; kiểm đủ 54 case, mỗi case một lần, loại mask khớp variant; exporter xuất được run PROCESSED | DR-018 |
| 6, 10 | Địa chỉ overlay, số serial A17 | Mạng ZeroTier đã kiểm là PRIVATE (09:22); từ nay dùng placeholder và CI quét IPv4; không sửa bằng chứng hay lịch sử | DR-019 |
| 7, 8 | CI cho mobile; checksum, `useCall`, băm URL | Một job `npm ci` cho render smoke và bundle; cleartext chỉ ở bản live; giữ khoá dọc; checksum một lần mỗi URL; `useCall` cho V2–V4; bỏ băm URL | DR-021 |
| 11 | Nếu C1 bị REJECT | UNet chạy tiếp; chỉ mở lại GATE-ML-01 khi reject vì công thức hoặc bằng chứng | DR-016b |
| 12 | N-a (INT-12) | **Tính vào** số liệu cohort, "ẩn chứ không làm mù" | DR-017 |
| QA-078 N-4, N-6 | Retry; lớp lỗi vẽ trên máy | Retry chỉ xoá lát đó; số lấy từ server, có so id mask | phụ lục DR-013a |
| **9** | **Xoá dữ liệu tạm dẫn xuất từ dữ liệu bệnh nhân** | **Còn chờ:** cuối ngày có danh sách chính xác; anh xác nhận riêng thì mới xoá | — |

## Việc V1 từ QA-078 (SCR-04)

- **N-4:** quyết luật: Retry chỉ xoá cache lỗi của đúng lát đó, hay giữ như SCR-03. Hai màn phải giống nhau.
- **N-5:** README và header của `ErrorInspectorScreen.js` vẫn nói có chặn theo `GROUND_TRUTH_UNAVAILABLE` của run metrics, nhưng code chưa chặn. Hoặc thêm chặn, hoặc sửa chữ.
- **N-6:** ghi lựa chọn "lớp lỗi vẽ trên máy từ hai mask, số lấy từ server" vào DR-013a; so `reference_mask_id` / `prediction_mask_id` với mask đang vẽ.
- **N-7:** không clamp lát server chỉ định ngoài khoảng.
- **N-8:** quay lại từ SCR-04 thì mất run và lát. Giữ `runId`, `variant`, `sliceIndex` trong stack, kèm test.
- **N-9:** đưa render smoke vào CI.
- **N-10:** `readSelection` của app/core.

## Hàng đợi dự phòng (V1)

- #76: hai guard (`canEnter3D` ngoài SUCCESS, `canEnterError` theo GT từng lát).
- #77 QA N-3, N-5…N-12 (N-6 là việc thật: hash URL).
- #65 QA N-8…N-11.
- A9/TC-PERF-001 trên màn sản phẩm. TC-TEAM-001 của anh.
