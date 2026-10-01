# DAY 23 — Phạm Tuấn Anh · 2026-10-02 (thứ Sáu)

**Vai:** leader, chủ V1, người tích hợp. Override Day 22 đã hết hạn lúc 23:59. Hôm nay quy trình thường quay lại
đầy đủ: mỗi PR cần một duyệt hợp lệ đúng SHA head, cộng CI xanh (CP-07). PR về split, C1, ADR-ML hoặc cổng do
leader merge.

## 📌 Việc của riêng anh trong ngày

| Việc | Khi nào |
|---|---|
| **Quyết GATE-MOB-01** dựa trên L4 đo tối qua, nếu chưa quyết ngay trong đêm: **L4 PASS**. 15 lát mới, mỗi lần tối đa 155,1 KB (1,1 % một khối); 15 lần quay lại 0 byte; log server khớp. Chỉ còn anh quyết nhận L5 (PR #82) | đầu giờ sáng |
| Nếu đóng: merge TECH_STACK_ADR, QA-004 và bản ghi Spike A, rồi #65 (shell), #77, #78 (V1), #69 (V3), #72 (V4) theo thứ tự, mỗi PR với CI xanh | sau quyết định |
| Theo dõi hai hàng đợi train. Trên PC anh: DINOv2 EXP-D-025 xong 17:15. Epoch 1 của EXP-D-100: 0,59 s mỗi bước, ngưỡng hoà vốn 1,89 s. Sáng nay kiểm cả ba run đều COMPLETE. Trên 4050 của Khánh: UNet bắt đầu 09:00 | sáng, trưa, tối |
| Khung duyệt **12:00** và **20:00**, như thường lệ | — |

## 🔴 Việc 1 — duyệt lại phần làm thay trong khối V1 *(sáng)*

| PR | Kiểm |
|---|---|
| #53 → `6b52628` (mô hình SCR-03), #80 → `c7a37e0` (mở case không có run) | chạy `node app/verticals/v1_case_explorer/test_case_explorer.mjs` (88). Theo dõi #80 N1 và N3 (variant null; run được yêu cầu nhưng không có trong danh sách); phải chốt trước khi run đã train tới SCR-03 |
| #77 (SCR-02/03 + công cụ L4), #78 (SCR-04) | xác nhận đã có QA; chờ GATE-MOB-01 |
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
| 10 | **Xác nhận DR-016a.** Nếu 4050 không chạy UNet trước 12:00, hoặc trượt tripwire, thì lịch trễ chứ công thức không đổi: UNet vẫn E = 50, batch 8; nếu 4050 không hồi lại thì chạy trên PC anh sau khi DINOv2 xong. Ghi sau C1 và sau khi hàng đợi DINOv2 đã chạy | C1 QA N-2 |
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
