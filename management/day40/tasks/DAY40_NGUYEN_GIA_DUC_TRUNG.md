# DAY 40 — Nguyễn Gia Đức Trung · 2026-10-19 (Chủ nhật)

**Vai:** chủ khối contract, backend và V4. Hôm qua agent của leader làm thay phần lớn khối backend dưới override.
Từ sáng nay khối trở lại với bạn.

## 📌 Quyết định chạm tới bạn

| Quyết định | Ảnh hưởng |
|---|---|
| **DR-017** (đã làm trong #94) | CASE_0001 tính vào `successful_n`, `metric_summary`, compare; app không nhận giá trị từng case của nó. API giữ **1.1.0** (chỉ đổi nghĩa và fixture) |
| **DR-018** (đã làm trong #94) | validator Contract 2 kiểm: run + lỗi = `num_test_cases`, mỗi case đúng một lần, liên kết artifact ↔ run, loại mask ↔ variant, không có run FAILED |
| **DR-022** (mới, leader xác nhận hôm nay) | sau GATE-IMG-01, `ingest --include-holdout --holdout-authorization <record>` thêm 53 case holdout ở chế độ EVALUATION; CASE_0001 luôn INFERENCE_REVIEW |
| **DR-021** | V4 gọi dữ liệu qua `useCall` của shell |

## 🔴 Việc 1 — duyệt lại phần làm thay *(sáng, trước 12:00)*

Hàng T1–T3 trong [`../../day39/POST_RECOVERY_REVALIDATION_DAY40.md`](../../day39/POST_RECOVERY_REVALIDATION_DAY40.md):
- **T1 #94:** `python -m pytest backend/tests -q -p no:cacheprovider` (74 pass), `python contracts/api/test_api_contract.py`.
  Đọc QA_PR94_D39 NB-1…NB-8. NB-1 và NB-2 (gia cố kiểm bản ghi cho phép, CASE_0001 luôn không GT) đã được làm thêm
  trong PR khung V2; kiểm lại.
- **T2 #95:** chạy `python tools/e2e/hero_flow_api.py --base-url http://127.0.0.1:<port> --no-writes` theo
  `tools/e2e/README.md`.
- **T3 #87, #88:** duyệt lại với vai người duyệt thứ hai.

## 🔴 Việc 2 — V4 SCR-06/SCR-08 (#72)

- Rebase #72 lên `main`, chốt QA-063 N-4 (luật tiếp tục một review đã CORRECTED), chuyển sang `useCall`, thôi nháp và
  xin duyệt thường (CP-07).
- Backend đã chứng minh luồng review → commit → phiên bản bất biến trên dữ liệu thật (E2E H8/H9 PASS). Màn hình V4
  chỉ cần gọi đúng các endpoint đó.

## Việc 3 — Mac mini *(đã deploy 18/10, bạn duyệt lại)*

- **Đã deploy 18/10 09:00** từ `main` `a3bc595`: 74 case, 4 thí nghiệm, 216 run, 289 mesh, 0 gói bị từ chối; E2E `--no-writes` từ PC qua overlay: 20 PASS / 0 FAIL.
- Việc của bạn: đọc lại quy trình deploy (gói thí nghiệm và mesh được chép bằng tay vào `~/cardiac-backend-data/experiments` và `derived_meshes`; script deploy chỉ chép `data_cache`), đề xuất đưa hai bước đó vào script.

Ghi chú cũ:

- Dữ liệu thật đã dựng trên PC leader: `cardiac-data/backend_d39` (74 case, 4 gói, khoảng 1,3 GB; mesh L0 nếu PR V2
  đã merge). Mac mini còn khoảng 19 GB trống.
- Dùng `backend/scripts/deploy_macmini.ps1` (đọc phần hướng dẫn DR-022 trong `backend/README.md`), rồi chạy E2E
  `--no-writes` từ PC tới Mac mini.

## Hàng đợi dự phòng

- QA_PR94_D39 NB-3…NB-7 (đường dẫn `..`, hai README cũ, N-c thiếu `experiment_id`).
- Đo TC-PERF-003 và TC-REV-003 cho SCR-06 trên A17 khi #72 merge. TC-TEAM-001 của bạn.
