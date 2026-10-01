# DAY 23 — Nguyễn Gia Đức Trung · 2026-10-02 (thứ Sáu)

**Gói này lập tối 01/10, sau override Day 22.** Hôm qua agent làm thay trong khối contract, backend và V4. Mọi
merge đều qua QA độc lập (CHAT E, một LLM, không phải người thứ hai). **Quyền sở hữu không chuyển.** Từ sáng
nay các khối này trở lại với bạn.

## 📌 Quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng |
|---|---|
| **API contract 1.1.0 đã lên `main`** (#62 → #68 → #71) | Backend, app/core và fixture đều ghim **1.1.0**. Đổi gì cũng phải nâng phiên bản |
| **Backend đã deploy lên Mac mini** (từ `main` `a7b4950`, 12:59 ngày 01/10) | `/health`: contract 1.1.0, **21 case**: 20 EVALUATION + 1 INFERENCE_REVIEW (CASE_0001, INT-12). Hiện có **0 run**: số đo thật chỉ có sau GATE-IMG-01. Bind vào địa chỉ overlay, không có `0.0.0.0` |
| **`review_commit` là cách duy nhất vào CORRECTED** (nguyên tử) | PATCH sang CORRECTED luôn bị trả INVALID_REVIEW_TRANSITION |
| **INT-12** | CASE_0001 được ẩn GT trong app nhưng **vẫn được tính** trong quần thể đánh giá. Hàng của nó là WITHHELD, không mang giá trị |

## 🔴 Việc 1 — duyệt lại và nhận phần làm thay *(sáng, ~1,5 h)*

Ghi **"nhận"** hoặc **"cần sửa: …"** cho từng mục vào `management/day22/POST_RECOVERY_REVALIDATION_DAY23.md`.

| PR → `main` | Nội dung | Kiểm |
|---|---|---|
| #62 → `dbee96d` | contract v1.0, kèm sửa test V1 (`7900fc1`) | `python contracts/api/test_api_contract.py` |
| #68 → `9ba01e8` | backend FastAPI + SQLite, deploy offline cp39 | `pytest backend/tests -q`, chạy dưới Python 3.9 nếu có |
| #71 → `a7b4950` | contract 1.1.0 | đọc README "Deviations"; xác nhận `METRIC_SOURCES` chỉ có trong #75 |
| #50, #51, #52 (merge sáng 01/10) | fixture V1–V4, mô hình V4, bằng chứng TC-TEAM-001 V4 | duyệt lại #50 (CI không chạy lại sau khi đổi base) |
| #63 → `254044a`, #75 → `985c9c3` | mô hình V4 trên 1.1.0; metrics backend | xem việc 2 |
| #82 → `f06cf6d` (TECH_STACK_ADR) | bạn là **người duyệt thứ hai** của ADR-MOB-001, đã ACCEPTED dưới override | đọc ADR §4–§8; APPROVE hoặc ghi "cần sửa" (T13) |
| Spike B (#73 → `40b1316`) | bạn là **reviewer của Spike B**; ACCEPTED dưới override, QA bằng LLM đứng thay | đọc RESULT phần S-1; APPROVE hoặc REJECT + lý do (T14) |

## 🔴 Việc 2 — V4 và metrics *(trước 15:00)*

- **#63 (mô hình V4) đã merge** tối 01/10 → `254044a`, sau QA-063 MERGE (`management/day22/qa/QA_PR63_V4_MODEL.md`). Bạn duyệt lại, rồi sửa các điểm QA nêu:
  - **N-1:** kiểm câu trả lời của `review_commit`: status phải là CORRECTED, `source_mask_id` và `source_mask_kind` phải khớp; bỏ fallback `??`;
  - **N-2:** so `run_id` của `review_create` với run đang mở;
  - **N-3:** lưu lại khi không có thay đổi thì trả `NOTHING_TO_SAVE`;
  - **N-4 (chốt trước khi #72 thôi là nháp):** luật tiếp tục một review đã CORRECTED. Lấy phiên bản đã duyệt mới nhất làm nền, reset về prediction gốc; kiểm kind theo `SOURCE_KIND_FOR_VARIANT`;
  - **N-5:** test in `SKIP` thay vì `ok` khi file spike không còn; F10 dùng `?.`;
  - **N-7:** sửa chữ.
- **#75 (metrics) đã merge** → `985c9c3`, sau QA-075 MERGE · REDEPLOY OK (`management/day22/qa/QA_PR75_BACKEND_METRICS.md`). **Mac mini đã redeploy** lúc 15:07 ngày 01/10 bằng `-SkipData`. `/health`: contract 1.1.0, 21 case, 0 experiment, 0 run, không có gói bị từ chối.
  - **Chặn dữ liệu (QA-075 N-1).** Hiện số liệu tổng hợp của cohort còn tính cả case WITHHELD (INT-12). Lấy `metric_summary` trừ đi các hàng SUCCEEDED là ra lại được giá trị của case đó.
    - **Chưa được đưa gói Contract 2 thật nào lên Mac mini** cho tới khi leader quyết N-a và bạn sửa xong.
    - Hướng QA khuyên: WITHHELD được tính trong `evaluation_n`, nhưng không tính trong `successful_n`, `metric_summary`, quần thể và summary của compare. Backend tính lại các số này từ bản ghi từng case.
  - **N-2..N-8:**
    - N-2: chặn `package_root` thoát ra ngoài `experiments_root`;
    - N-3: file producer sai định dạng thì trả 500 không có envelope;
    - N-4: hash lại file metric khi đọc;
    - N-5: bất biến qua các lần khởi động lại;
    - N-6: test tie-break DR-010;
    - N-7: WITHHELD được ưu tiên trước FAILED;
    - N-8: phiên bản và nhãn.
- **#72** (màn SCR-06/SCR-08, nháp): GATE-MOB-01 **đã đóng** và #77 đã lên `main`. Chốt N-4, rebase lên `main`, thôi nháp và xin duyệt thường (CP-07). Đã nối với API shell của #77 (`runtime.content`, `maskPng.js`, `setLeaveGuard`).

## Việc 3 — nợ kỹ thuật đã ghi *(chiều; ưu tiên theo thứ tự)*

1. **Chặn trước PR 3 phục vụ số thật:**
   - **N-a:** n của cohort tính cả case WITHHELD đã đánh giá; sửa fixture thành 5/5; ghi rõ INT-12 *ẩn nhưng không làm mù*.
   - **N-b:** ghi loại trừ WITHHELD vào DR-010; khớp literal với `ml/evaluate`.
   - **N-c:** validator kiểm `outlier_selection` (số lượng, đúng 3 thấp nhất, khớp hàng, khớp id).
2. **#68:**
   - **N-14:** `describe()` của request log chạy DB lookup trên event loop, nên một lần commit review làm khựng mọi request. Dời sang thread, hoặc dùng connection chỉ đọc.
   - **R-2:** 413/400/405 trả về VALIDATION_ERROR với 422.
   - **N-6:** test INT-12 bằng audit hook (chứng minh file GT không bao giờ được mở).
   - **N-8:** tái dùng pid trong `serve_macmini.sh`.
3. **Contract:**
   - **N-d:** bind các trường variant.
   - **N-e:** ghim `row_fields`; từ chối `review_patch` trả 200 với CORRECTED.
   - **N-f:** test nguyên tử với lỗi giữa transaction.
   - **N-g, N-h:** README, nhãn phiên bản cũ.
   - **N6, N7, N8:** mang sang từ #62.
4. **Generator:**
   - kịch bản `stale_revision` cho `finding_patch`;
   - echo id case/run đã yêu cầu (guard V1 cần);
   - metrics của EXP-D-PP ở dạng PROCESSED.

## Việc 4 — thiết bị *(cổng đã đóng; sau khi #72 merge)*

Đo TC-PERF-003 và TC-REV-003 cho SCR-06 trên A17. Bổ sung TC-TEAM-001 của bạn.

## ⚠ Đường găng D24–D25: số thật lên app *(kết quả thử end-to-end tối 01/10)*

Agent đã chạy thử local cả chuỗi `ml/evaluate` → `ml/export_contract2` → `validate_contract2` → backend → API. Ba điều chặn số thật lên app:

1. **Contract 2, exporter và backend chỉ nhận quần thể FINAL_HOLDOUT (54 case).** Gói thật chỉ có sau khi chạy inference trên holdout. Việc đó diễn ra sau GATE-IMG-01 (D24).
2. **Data cache của backend hiện chỉ có 20 case validation và CASE_0001.** Với một gói holdout, 53/54 case sẽ trả `ARTIFACT_NOT_FOUND`.
   - **Việc của bạn:** ingest Contract 1 cho **54 case FINAL_HOLDOUT** vào cache của backend, rồi redeploy.
   - **Làm ngay sau khi GATE-IMG-01 đóng băng**, không làm trước: luật cấm chạm holdout vẫn áp dụng.
3. **Exporter ghi vào thư mục run** (`<run>/contract2/`) và không có tuỳ chọn thư mục ra.
   - Bàn với Khánh xem gói được ghi ở đâu và chuyển sang Mac mini thế nào.
   - Mỗi gói mang theo `best.pt` (khoảng 89 MB) vì validator kiểm checksum của nó.

Thêm: **QA-075 N-1 đã được tái hiện.** `evaluation_n` và n của từng metric đều tính cả case WITHHELD. Đây là quyết định N-a của leader.

## Hàng đợi dự phòng

- Contract 2 chưa biểu diễn được case FAILED: bàn với leader về sửa đổi.
- `prediction_mask_id` có phải id artifact của run không: xác nhận trong contract.

---

**Ranh giới:**
- không mở file GT của CASE_0001;
- không đưa dữ liệu dẫn xuất vào work tree;
- không commit địa chỉ, alias hay đường dẫn máy;
- không force-push `main`;
- không xoá khi chưa hỏi leader.
