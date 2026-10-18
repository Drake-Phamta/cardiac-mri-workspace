# DAY 40 — Bế Quốc Khánh · 2026-10-19 (Chủ nhật)

**Vai:** chủ khối ML/imaging và V3. Hôm qua (18/10) agent của leader làm thay trong khối ML dưới override,
**trừ train**. Hôm nay quy trình thường quay lại đầy đủ. **Đường găng của cả dự án đi qua máy RTX 4050 của bạn.**

## 📌 Quyết định chạm tới bạn

| Quyết định | Ảnh hưởng |
|---|---|
| **GATE-IMG-01 đóng 18/10** (`management/day39/GATE_IMG_01_DECISION.md`) | PP-4 đóng băng, sha256 `c0a68cc7…4961e`. Họ UNet là **raw primary**; nếu muốn hậu xử lý cho UNet thì phải khai riêng (`08` §2) |
| **Kết quả holdout DINOv2** (`management/day39/RESULTS_HOLDOUT_DINOV2.md`) | 25 % 0,559 · 50 % 0,616 · 100 % 0,639 · PP-4 0,659. RQ-A chỉ trả lời được khi có UNet |
| **DR-016a** (xác nhận 01/10) | E = 50, batch 8, công thức không đổi. 4050 không chạy được thì lịch trễ, không đổi công thức |
| **DR-018** | exporter đã xuất được case lỗi và run PROCESSED (#92). Bạn duyệt lại |
| **DR-002c** | che số r ở `management/spikes/SPIKE_D_DATASET/RESULT.md:29` theo F5 (việc cũ, còn mở) |

## 🔴 Việc 1 — duyệt lại phần làm thay *(sáng, trước 12:00)*

Ghi vào [`../../day39/POST_RECOVERY_REVALIDATION_DAY40.md`](../../day39/POST_RECOVERY_REVALIDATION_DAY40.md), các hàng K1–K5:
- **K1 #92:** `ml/postprocess.py`, `ml/gate_img_01.py`, dẫn xuất EXP-D-PP, exporter.
  Chạy `CUDA_VISIBLE_DEVICES=-1 PYTHONIOENCODING=utf-8 python -m pytest ml/tests -q` (263 pass).
  Đọc QA_PR92_D39 NB-1…NB-3 (NB-2: exporter đặt checkpoint trước khi kiểm bản ghi cho phép).
- **K2 #93:** GATE-IMG-01. Đọc `SELECTION.md`; kiểm `sha256sum management/day39/gate_img_01/postprocess_config.frozen.json`.
- **K3:** log holdout trên PC leader (`cardiac-runs/_holdout_d39/`). **Không chạy lại holdout.**
- **K4 #96:** đối chiếu số trong `RESULTS_HOLDOUT_DINOV2.md` với `metrics_summary.json`.

## 🔴 Việc 2 — chạy họ UNet trên RTX 4050 *(ngay sau việc 1)*

Làm đúng theo [`../../day23/tasks/DAY23_BE_QUOC_KHANH.md`](../../day23/tasks/DAY23_BE_QUOC_KHANH.md) mục "Việc 2"
(các bước 1–6, tripwire ≤ 1,13 s mỗi bước và không tràn bộ nhớ), với bốn điểm mới:
1. Máy bạn mới có file ZIP chính thức (#90). **Giải nén** ra thư mục dữ liệu ngoài repo, đặt `CARDIAC_DATA_ROOT`, rồi
   chạy preflight để hash của `dataset_manifest.json` khớp `f64d461f…` trước khi train.
2. Đã kiểm 18/10: `git diff --stat c7a37e0 origin/main -- ml/train.py ml/data.py ml/models.py` **không in gì**,
   nên dùng `main` mới nhất là hợp lệ theo DR-016a mục 4.
3. Báo leader **kết quả tripwire** ngay sau epoch 1 của EXP-U-025 (số giây mỗi bước, VRAM, Shared GPU memory).
4. **Bước 3 của Day 23 (tự tạo file queue) không còn phải làm:** file queue đã nằm trong git,
   `ml/configs/queues/unet_adr_ml_001.json` (EXP-U-025 → 050 → 100, cặp so sánh U-vs-U, đúng ADR-ML-001).
   - Chạy thử: `python -m ml.queue --queue ml/configs/queues/unet_adr_ml_001.json --epochs 50 --batch 8 --dry-run`.
   - Rồi chạy lại đúng lệnh đó, **không** có `--dry-run`.
   - `--epochs 50 --batch 8` là bắt buộc (DR-016a): file để `SET_E` / `SET_BATCH` có chủ đích, thiếu thì `ml.train` từ chối chạy.
   - Bị ngắt thì chạy lại đúng lệnh cũ, nó tự tiếp tục từ `last.pt`.

Ước lượng: khoảng 24 h cho 3 run nếu 4050 không tràn bộ nhớ. Holdout của UNet **chỉ** chạy khi leader ký bản ghi cho
phép mới (thêm EXP-U-025/050/100, `postprocessing_config_sha256` giữ nguyên).

Khi cả 3 run COMPLETE (bạn chỉ làm đến đây, phần còn lại là việc của leader):
- Báo leader, rồi **chép** (không move) nguyên thư mục 3 run sang `<runs>` trên PC leader. `checkpoints/last.pt` có thể bỏ lại.
- Leader chạy `tools/ml/make_holdout_authorization.py` (ký bản ghi), commit lên `main`, rồi **một lệnh**
  `tools/ml/holdout_pipeline.py` (inference holdout, chấm, so sánh, export Contract 2, tổng hợp số).
- Chi tiết từng lệnh: `ml/README.md`, mục "UNet family: from training to the app". Bạn không chạy holdout.

## Việc 3 — V3 với số thật *(chiều)*

- Backend có 4 gói thật. Mở SCR-01/SCR-07 với backend local (`tools/e2e/README.md` hướng dẫn dựng dữ liệu, hoặc Mac
  mini khi đã deploy). Ghi lại những gì màn hình hiển thị sai hoặc khó đọc với dữ liệu thật.
- So sánh RAW vs PROCESSED (EXP-D-100 vs EXP-D-PP): backend trả `comparable: false`, lý do "khác prediction variant".
  Đề xuất cách V3 hiển thị phép so sánh hậu xử lý (RQ-B) mà không gọi đó là "comparable".
- QA-069 N-1, N-3, N-4, N-6 còn mở.

## Hàng đợi dự phòng

- TC-TEAM-001 của bạn (`management/evidence/TC_TEAM_001_BE_QUOC_KHANH.md`): ghi phần agent làm thay ngày 01/10 và 18/10.
- Bằng chứng thiết bị V3 (TC-USAB-004, TC-MOBILE-STATE-001), xếp lịch A17 với leader.

**Ranh giới:** không đổi công thức; không đụng holdout của UNet khi chưa có bản ghi; không commit checkpoint hay giá trị từng case.
