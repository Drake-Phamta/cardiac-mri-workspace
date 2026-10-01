# DAY 23 — Phạm Tuấn Anh · 2026-10-02 (thứ Sáu)

**Vai:** leader, chủ V1, người tích hợp. Override Day 22 đã hết hạn lúc 23:59. Hôm nay quy trình thường quay lại
đầy đủ: mỗi PR cần một duyệt hợp lệ đúng SHA head, cộng CI xanh (CP-07). PR về split, C1, ADR-ML hoặc cổng do
leader merge.

## 📌 Việc của riêng anh trong ngày

| Việc | Khi nào |
|---|---|
| **Đã xong tối qua:** GATE-MOB-01 đóng 21:17 (anh nhận L5); DR-016a xác nhận 21:17; merge #82, #77, #78, #73 (squash), #69; #65 đóng vì #77 thay thế | — |
| **Kiểm hàng đợi DINOv2 lúc 08:00.** Hàng đợi bị một Ctrl+C dừng lúc khoảng 20:59 trong epoch 12 của EXP-D-100; chạy lại lúc 21:30 từ `last.pt` (epoch 11), lần này tách khỏi mọi console. EXP-D-100 dự kiến xong khoảng **04:00**, EXP-D-050 khoảng **08:00–09:00** sáng 02/10. Nếu dừng lần nữa, chạy lại đúng lệnh cũ; nó tự tiếp tục từ `last.pt`. **Không `git pull` hay checkout trong thư mục repo chính trên PC cho tới khi EXP-D-050 xong**: hàng đợi chạy mã `c7a37e0` từ thư mục đó (DR-016a), còn `ml/` trên `main` đã đổi (#81). Trên 4050 của Khánh: UNet bắt đầu 09:00 | 08:00, trưa, tối |
| **Đồng hồ PC lệch:** sau khi khởi động lại, đồng hồ PC chậm khoảng 66 phút vì dịch vụ Windows Time không chạy. Bật lại cần quyền admin: `w32tm /resync` sau khi bật dịch vụ. Trước khi sửa, dấu giờ do PC ghi trong log đều lệch | sáng |
| Khung duyệt **12:00** và **20:00**, như thường lệ | — |

## 🔴 Việc 1 — duyệt lại phần làm thay trong khối V1 *(sáng)*

| PR | Kiểm |
|---|---|
| #53 → `6b52628` (mô hình SCR-03), #80 → `c7a37e0` (mở case không có run) | chạy `node app/verticals/v1_case_explorer/test_case_explorer.mjs` (88). Theo dõi #80 N1 và N3 (variant null; run được yêu cầu nhưng không có trong danh sách); phải chốt trước khi run đã train tới SCR-03 |
| #77 → `cab847a` (shell, SCR-02/03, công cụ L4, shim `latin1`), #78 → `92a59ff` (SCR-04) | agent A2/A2b làm thay trong khối anh. Chạy `npm test` trong `mobile/` (177) và render smoke; đọc QA-078 delta và #77 NB-1 (import shim trong `maskPng.js`) |
| Gói Day 23 + bảng + DAY_LOG (đã merge tối qua) | đọc lại |

## Quyết định đang chờ anh

| # | Câu hỏi | Nguồn |
|---|---|---|
| 1 | F5 còn bao ba điểm số chính xác đang công khai trong `OPEN_DECISIONS.md` DR-002b không | QA-005 N-2 |
| 2 | Có khai **danh sách độ nhạy thứ hai** (case holdout gần ngưỡng) không. Chỉ được khai **trước** khi có bất kỳ số đo holdout nào | QA-005 N-7 |
| 3 | Bộ endpoint hero có khớp DEMO H1–H10 không (experiment_compare, experiment_list, analysis_slice_error) | contract N4 |
| 4 | Contract 1/2 vẫn gửi literal "DRAFT v0" | contract N10 |
| 5 | Sửa Contract 2: case FAILED, kiểm đủ số case, kiểm đúng loại mask | #64 N-5, A1 |
| 6 | Địa chỉ overlay đã lộ công khai (ca3447b và nhiều file trên `main`): ZeroTier có bắt duyệt thành viên không; có dọn không | #65 N-3, #68 N-13 |
| 7 | Job CI bundle cho `mobile/`; cleartext HTTP; khoá màn hình dọc | #65 N-5, N-12b |
| 8 | Kiểm checksum mọi ảnh hay chỉ lần đầu; bắt buộc `useCall` cho V2–V4; hash URL dùng HMAC hay bỏ | A2 |
| 9 | **Xoá dữ liệu tạm dẫn xuất từ dữ liệu bệnh nhân**, nằm trong các thư mục agent (danh sách trong `POST_RECOVERY_REVALIDATION_DAY23.md`) | cần anh duyệt |
| 10 | **Số serial A17** đã công khai trên `main` từ Day 3 (18 file, cùng RESULT Spike B): dọn từ giờ, dọn cả lịch sử, hay giữ. Gộp với câu 6 thành một chính sách | QA #73 N2 |
| 11 | SPIKE_C1 ACCEPTED và GATE-ML-01 đóng **dưới override**, dựa trên QA bằng LLM. Vũ Hùng Anh duyệt lại hôm nay; nếu anh ấy REJECT thì mở lại | #79 |
| 12 | **INT-12 trong số liệu cohort (N-a).** Hiện case WITHHELD vẫn nằm trong `successful_n` và `metric_summary`, nên tính ngược ra được giá trị của nó. QA khuyên: tính nó trong `evaluation_n` nhưng loại khỏi `successful_n`, `metric_summary` và quần thể của compare; sửa contract cho khớp. **Chưa có gói Contract 2 thật nào lên Mac mini trước khi chốt** | QA-075 N-1, QA #62 N-a |

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
