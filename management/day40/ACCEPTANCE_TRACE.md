# ACCEPTANCE TRACE — ma trận truy vết nghiệm thu 31/10/2026

| Mục | Giá trị |
|---|---|
| Mục đích | Một bảng duy nhất trả lời: với từng yêu cầu MUST (33), từng TC bắt buộc cho nghiệm thu và từng môn học, **hiện có bằng chứng gì trong repo, còn thiếu gì, ai làm, hạn nào** — để leader và nhóm biết chính xác khoảng cách tới ngày nghiệm thu 31/10/2026 |
| Ngày lập | 2026-10-18 (Day 39), để dùng từ chặng C1 (19/10) |
| Cơ sở | `main` tại `a3bc595` (CI xanh). Spec đóng băng `docs/specs/v1.0/**` (03 yêu cầu sản phẩm, 04 FR/NFR, 13 TC và truy vết, 14 vertical, 16 góc nhìn môn học); `management/DEMO_STANDARD.md` (H1–H10); `management/readiness/ERRATUM_COUNTS_2026_09_16.md` (33 MUST / 6 SHOULD / 5 COULD, 70 TC) |
| Kế hoạch đối chiếu | Bốn chặng C1 19–20/10, C2 21–24/10, C3 25–27/10, C4 28–30/10, nghiệm thu 31/10. Bản chi tiết nằm ở PR #97 (`management/day40/REPLAN_TO_2026-10-31.md`), **chưa merge vào `main`**, nên cột "Mốc" là đề xuất bám các chặng đó, không phải cam kết đã duyệt |
| Người lập / trạng thái | Project Control (phiên Claude của leader). Bản nháp để leader duyệt. **Không phải RTM chính thức** của `13` §3 và **không ghi `ACCEPTED`** cho mục nào |


> **Cập nhật cuối ngày 18/10:** sau khi tài liệu này được lập, #99 đã đưa V4 SCR-06/SCR-08 lên `main` (khung chạy được, test logic + render). Các dòng REV-01, REV-02, PROV-01, FIND-01 có thêm bằng chứng mức logic/render; vẫn **MỘT PHẦN** cho tới khi có bằng chứng thiết bị.

## 0. Đọc nhanh (sự thật hiện tại, không làm đẹp)

- **0 trên 33 yêu cầu MUST đã `ACCEPTED`** (`management/PROJECT_STATE.yaml` ghi `accepted: 0`; REPLAN ghi chưa có TC nào được ghi PASS chính thức trên thiết bị). Theo bằng chứng trong repo: 2 yêu cầu `CÓ BẰNG CHỨNG`, 29 `MỘT PHẦN`, 2 `CHƯA CÓ`. `CÓ BẰNG CHỨNG` chưa phải `ACCEPTED` (cần review, tích hợp, DoD của `13` §6).
- **UNet chưa được train.** Họ DINOv2 (25/50/100 % và bản hậu xử lý PP-4) đã chấm một lần trên holdout 54 case; họ UNet (EXP-U-025/050/100) chưa có. Hệ quả: câu hỏi RQ-A (UNet so DINOv2), bước H10 đầy đủ, TC-EXP-004 và phần "thứ tự mô hình" của TC-SCI-003 **chưa trả lời được**; PR-EXP-01/02/03 chưa thể đóng.
- **Chưa có phép đo trên thiết bị nào ngoài L4 và các phiên Spike.** Cụ thể: L4 (01/10, app sản phẩm, chỉ MRI + ground truth, chưa có dự đoán), Spike A (harness, fixture 64×64×16 và 576×576), Spike B (app spike + WebView, case huấn luyện), Spike E (HTTP). Không có phiên máy nào cho SCR-05/06/08 của app sản phẩm, không có lần chạy TC-PERF-001 trong app sản phẩm (kịch bản đã viết, chưa chạy), không có lần chạy hero flow trên điện thoại, không có video hay ảnh chụp màn hình app thật.
- **Hero flow H1–H10 chỉ được chứng minh ở mức API** (`tools/e2e/hero_flow_api.py`): 22 PASS / 0 FAIL / 1 SKIP theo mô tả PR #98 (SKIP = UNet so DINOv2). Đầu ra nằm ngoài git; trong git chỉ có script và mô tả PR.
- **SCR-06 (Review/Brush) và SCR-08 (Findings) vẫn là placeholder trên `main`** (`NotBuiltYet`; PR #72 còn draft). Bốn yêu cầu MUST của V4 (PR-REV-01, PR-REV-02, PR-PROV-01, PR-FIND-01) chưa có giao diện cho người dùng; brush chỉ có bằng chứng trên harness Spike A và mô hình trong `app/verticals/v4_review_and_findings`.
- **PR-ERR-03 và PR-3D-05 (lỗi 3D) chưa có gì ở đường sản phẩm:** DR-005 vẫn OPEN, Spike F chưa chạy, `error_reconstruction_get` trả `ARTIFACT_NOT_FOUND` có chủ ý.

### Kiểm lại trong phiên lập tài liệu này (chạy tay, không sửa gì trong repo)

| Bộ test | Kết quả | Ghi chú |
|---|---|---|
| `node --test mobile/test/*.test.mjs` | 220 test: 213 đạt, 7 bỏ qua, 0 lỗi | Chạy trong CI (job `mobile-shell`) |
| `pytest backend/tests backend/mesh/tests` | 252 đạt | Chạy trong CI (job `backend-tests`) |
| `pytest ml/tests` | 263 đạt, 0 lỗi | **Không nằm trong CI** |
| Contract 1, Contract 2, API Contract 11 | PASS (Contract 2: 9 case; API: 34 case) | Chạy trong CI (job `contract-tests`) |
| `node app/verticals/v4_review_and_findings/test_brush.mjs` | PASS 22/22 | Chạy trong CI (job `app-core`) |
| `app/core/tests/run_all.mjs`, `test_findings.mjs`, `test_case_explorer.mjs` | Không chạy lại ở đây | Cần bundle fixture sinh sẵn; CI xanh trên `main` |

Test đạt chỉ chứng minh logic. Nó không thay bằng chứng thiết bị cho TC cần thiết bị.

## 1. Định nghĩa trạng thái và quy tắc bằng chứng

### 1.1 Trạng thái

| Trạng thái | Nghĩa |
|---|---|
| `CÓ BẰNG CHỨNG` | Bằng chứng đã commit đáp ứng **đầy đủ** điều mà TC kiểm. TC chỉ kiểm logic/dữ liệu (hàm thuần, artifact, manifest, quy tắc backend) thì test tự động đã commit và đạt là đủ; TC kiểm giao diện, cử chỉ hay hiệu năng thì phải có bản ghi đo trên thiết bị. **Không đồng nghĩa `ACCEPTED`** |
| `MỘT PHẦN` | Có một số bằng chứng (test đơn vị, test mức API, đo trên harness Spike, màn hình dạng khung) nhưng chưa đủ: thiếu bằng chứng thiết bị trên app sản phẩm, thiếu dữ liệu thật, hoặc thiếu một nửa phạm vi (ví dụ chỉ DINOv2, chưa có UNet) |
| `CHƯA CÓ` | Chưa có bằng chứng cho hành vi mà TC kiểm. Nếu có viên gạch liên quan (ví dụ module chưa nối) thì ghi rõ ở cột bằng chứng nhưng vẫn là `CHƯA CÓ` |
| `KHÔNG ÁP DỤNG` | Chỉ cho TC của yêu cầu SHOULD chưa kích hoạt (TC-AN-001, TC-PERF-004, TC-METRIC-001). Không tính vào số đếm |

Trạng thái của một yêu cầu sản phẩm (PR) lấy theo TC yếu nhất mà nó liên kết, và một PR đòi hỏi người dùng thao tác chỉ được tính `CÓ BẰNG CHỨNG` khi đường giao diện của nó có bằng chứng. Vì vậy PR-3D-01 và PR-PRIV-01 (không cần thao tác giao diện) là hai yêu cầu MUST duy nhất đạt `CÓ BẰNG CHỨNG` lúc này.

### 1.2 Quy tắc bằng chứng (không có ngoại lệ)

1. **Chỉ bằng chứng thiết bị hoặc bằng chứng đã commit mới được tính.** Mỗi dòng `CÓ BẰNG CHỨNG` hoặc `MỘT PHẦN` phải trỏ tới một tệp, một test có tên, một job CI hoặc một PR đã merge (số PR + SHA nếu cần). Không có tệp hoặc commit thì không có tuyên bố.
2. Mô tả PR, ý định, thiết kế, kế hoạch và PR chưa merge (kể cả #97 và #72) **không phải bằng chứng**. Khi một kết quả chỉ nằm trong mô tả PR hoặc đầu ra ngoài git (ví dụ lần chạy `hero_flow_api.py`), tài liệu này ghi rõ điều đó và coi là mức API, chưa đủ cho TC thiết bị.
3. QA bằng LLM là QA, không phải reviewer người (`RECOVERY_OVERRIDE_*`). Nó không đổi trạng thái ở đây.
4. Số trên thiết bị phải lấy từ tệp thô đã commit, thống kê đúng như NFR định nghĩa, không loại outlier, trên bản release (`DEMO_STANDARD` D1, D5). Số đo trên harness Spike không được đọc thành số đo của app sản phẩm.
5. Không bịa số đo: cái chưa đo ghi `NOT MEASURED` hoặc `CHƯA CÓ`. Không có số theo từng case, IP, serial hay đường dẫn tuyệt đối trong tài liệu này.
6. Đổi trạng thái chỉ bằng một commit có trỏ tới bằng chứng mới. Chỉ `ACCEPTED` mới tính là hoàn thành (`13` §3, TC-AUDIT-002).

### 1.3 Bằng chứng thiết bị hiện có (toàn bộ)

| Phiên | Thiết bị / bản build | Phạm vi | Bằng chứng | Giới hạn |
|---|---|---|---|---|
| L4, 01/10 | A17, app sản phẩm bản release live (V1 SCR-03), backend thật (21 case, 0 run) | 30 cử chỉ chuyển lát (15 mới, 15 quay lại), MRI + ground truth | `spikes/spike_a_2d/EVIDENCE_RAW/l4_product_app_20261001T205817+0700/` (PROVENANCE, `l4_report.txt`, `server_summary.txt`) | Không có dự đoán; cử chỉ do phiên Claude của leader thao tác qua `adb`; chỉ đo byte, không đo p95; người duyệt (Hùng Anh) chưa xác nhận lại |
| Spike A, 11–19/09 | A17, harness React Native (không phải app sản phẩm) | A2–A11: zoom/pan, brush, undo/redo, lưu/tải lại, chuyển lát, phản hồi brush, tách cử chỉ | `management/spikes/SPIKE_A_2D/RESULT.md`, `spikes/spike_a_2d/EVIDENCE_RAW/` | Fixture 64×64×16 (A9 thêm 576×576×16 và 576×576×88); QA-004 ghi L5: A2–A7 chưa đo ở kích thước thật; leader nhận giới hạn khi đóng GATE-MOB-01 |
| Spike B, 18/09 và 01/10 | A17, app spike + WebView (WebGL2) | B10/B11 FPS; S-1: pick → lát (B6/B7/B9) ở 5 mức mesh | `management/spikes/SPIKE_B_3D/RESULT.md`, `spikes/spike_b_3d/EVIDENCE_RAW/20261001_s1_device/` | Case huấn luyện; chỉ mức L0 đạt pick trên máy; không phải SCR-05 sản phẩm |
| Spike E, 13–16/09 | A17 qua lớp phủ mạng | Thời gian HTTP (E2–E6), payload tổng hợp | `management/spikes/SPIKE_E_TRANSPORT/RESULT.md` | Không phải chuyển lát đã cache; trạng thái nháp |

**Chưa có:** phiên máy nào sau 01/10; SCR-02/04/01/07/05 sản phẩm trên máy với dữ liệu holdout thật; SCR-06/08 (chưa build); TC-PERF-001/002/003 trong app sản phẩm; TC-E2E-001; TC-USAB-005; ảnh/video màn hình thật. Cũng chỉ có **một** thiết bị mục tiêu (A17 của leader), nên mọi phép đo phải xếp lịch (xem REPLAN, mục rủi ro).

### 1.4 Ký hiệu nguồn bằng chứng dùng trong các bảng

| Ký hiệu | Nguồn |
|---|---|
| [API-E2E] | `tools/e2e/hero_flow_api.py` + `tools/e2e/README.md` (PR #95, #98): hero flow qua đúng endpoint của app trên dữ liệu holdout thật. Mức API, không phải thiết bị. Kết quả chạy chỉ có trong mô tả PR |
| [L4] | `spikes/spike_a_2d/EVIDENCE_RAW/l4_product_app_20261001T205817+0700/` |
| [SPA] / [SPB] | Spike A: `management/spikes/SPIKE_A_2D/RESULT.md` + `spikes/spike_a_2d/EVIDENCE_RAW/`. Spike B: `management/spikes/SPIKE_B_3D/RESULT.md` + `spikes/spike_b_3d/EVIDENCE_RAW/` |
| [MOB-T] | `mobile/test/*.test.mjs` (CI `mobile-shell`). Các test tên `V4a`…`V4x` trong `v1_error.test.mjs` là của SCR-04 (vertical V1), không phải V4 |
| [CORE-T] | `app/core/tests/*`, `app/verticals/*/test_*.mjs` (CI `app-core`) |
| [BE-T] | `backend/tests`, `backend/mesh/tests` (CI `backend-tests`) |
| [ML-T] | `ml/tests` (**không** chạy trong CI) |
| [RES] | `management/day39/RESULTS_HOLDOUT_DINOV2.md` (kết quả holdout, chỉ số tổng hợp) |
| [SPLIT] | `management/day22/QA_REVIEW_005_SPLIT.md` + `data/manifests/split_manifest_path_a_seed2024.json` |
| [TEAM] | `management/evidence/TC_TEAM_001_*.md` (bốn gói) |

## 2. Yêu cầu sản phẩm → TC → bằng chứng

### 2.1 Bảng MUST (33 yêu cầu)

| ID | Mô tả | Vertical / owner | TC liên kết (spec 13) | Trạng thái | Bằng chứng | Còn thiếu | Mốc |
|---|---|---|---|---|---|---|---|
| PR-STUDY-01 | Một workspace nghiên cứu LA thống nhất: dataset, case, thí nghiệm, run, finding | V3 · Khánh | TC-STUDY-001 | **MỘT PHẦN** | SCR-01 (#69, `mobile/src/verticals/v3/StudyOverviewScreen.js`); test V3S1/V3S2 (`mobile/test/v3_screens.test.mjs`), V3-1 (`app/verticals/v3_study_and_compare/test_study_and_compare.mjs`); bước H1 của [API-E2E] | Chạy SCR-01 trên A17 với backend 74 case + 4 gói thật (chưa có ảnh/video/log); kiểm không có số bịa trên máy | C2 (21–24/10) |
| PR-COHORT-01 | Xem tóm tắt hiệu năng cohort cho các run so sánh được | V3 · Khánh | TC-EXP-002/003 | **MỘT PHẦN** | `experiment_metrics` (#75); `ml/evaluate.py` + `test_cohort_summary_known_values` [ML-T]; V3-4 (N intended/successful); H1 của [API-E2E]; tổng hợp có CI trong [RES] | SCR-01/07 trên máy với số thật; cohort UNet chưa tồn tại; phân phối (không chỉ trung bình) chưa thấy trên máy | C2–C3 |
| PR-COHORT-02 | Nhận diện và mở case outlier/thấp điểm từ phân tích cohort | V3 · Khánh | TC-EXP-006, TC-ERR-003 | **MỘT PHẦN** | Chọn outlier phía server (DR-010) + `test_outlier_selection_tie_breaks` [ML-T]; V3S8 (chạm điểm → SCR-03 đúng case/run/variant); H2 của [API-E2E] | Thao tác chạm outlier → mở đúng lát trên A17 (hero H2→H3) | C2 (21–24/10) |
| PR-CASE-01 | Duyệt và mở case bằng ID đã de-identify | V1 · Tuấn Anh | TC-CASE-001 | **MỘT PHẦN** | SCR-02 (#77); V1c/V1e [MOB-T]; H3 [API-E2E] (74 hàng); [L4] đã mở một case evaluation trong bản live trên A17 | Danh sách 74 case thật trên máy ([L4] chỉ có 21 case, 0 run) | C2 (21–24/10) |
| PR-CASE-02 | Chỉ rõ case hỗ trợ Evaluation Mode hay chỉ Inference & Review | V1 · Tuấn Anh | TC-CASE-002 | **MỘT PHẦN** | `CapabilityBadge.js`/`capability.mjs`; V1a/V1b/V1s [MOB-T]; `test_inference_only_case_never_exposes_ground_truth` [BE-T]; INT-12 (một case chỉ suy luận) trong [API-E2E] | Xem trên máy: nhãn nhất quán giữa danh sách và chi tiết, control GT bị khóa với case inference-only | C2 (21–24/10) |
| PR-MRI-01 | Xem volume MRI từng lát trên mobile, có điều hướng và zoom/pan | V1 · Tuấn Anh | TC-MRI-001..003 | **MỘT PHẦN** | [L4]: 15 lát mới + 15 lát quay lại trên A17, app sản phẩm, backend thật (MRI + GT); [SPA]: A2 zoom/pan giữ checksum mask 16/16, A9 p95 ≤ 200 ms ở cả 5 lần đo (harness Spike A); V1i/V1j/V1n [MOB-T]; `test_view_math.mjs` | Slice đúng pixel `n/total` trên dữ liệu thật (A1 mới đạt một phần); zoom/pan trong app sản phẩm; A9 trong app sản phẩm: kịch bản `mobile/A9_TC_PERF_001_SCRIPT.md` đã viết nhưng chưa chạy | C2 (21–24/10) |
| PR-PRED-01 | Xem mask dự đoán căn chỉnh với MRI nguồn | V1 · Tuấn Anh | TC-MASK-001/003 | **MỘT PHẦN** | H4 [API-E2E]: byte MRI/GT/prediction có SHA-256 khớp checksum API; V1-6/V1-7, V4e [CORE-T]/[MOB-T]; 216 run phục vụ từ backend (`management/day39/RESULTS_HOLDOUT_DINOV2.md`) | Overlay dự đoán thật trên máy ([L4] ghi rõ: chưa phủ prediction); căn chỉnh sau zoom/pan; điều khiển bật/tắt + opacity chưa có phép đo | C2 (21–24/10) |
| PR-IMG-01 | So sánh raw prediction và prediction hậu xử lý đã ghi tài liệu | V1 · Tuấn Anh (+ ML · Khánh) | TC-MASK-004 | **MỘT PHẦN** | Khóa cache theo variant (V1-7, V1-9); `test_prediction_slices_per_variant_never_substitute` [BE-T]; H3/H4 [API-E2E]: run chỉ RAW hỏi PROCESSED → `ARTIFACT_NOT_FOUND`; EXP-D-PP phục vụ như PROCESSED | Chuyển RAW ↔ PROCESSED trên máy với run EXP-D-100 / EXP-D-PP thật | C2 (21–24/10) |
| PR-ERR-01 | Hiển thị bất đồng phân đoạn ở mức lát/pixel khi có GT | V1 · Tuấn Anh | TC-ERR-001/002 | **MỘT PHẦN** | SCR-04 (#78); V4f = TC-ERR-001 (cặp mask tổng hợp, phép toán boolean) + V4g (chú giải) [MOB-T]; H5 [API-E2E] tính lại FP/FN/Dice từ hai PNG khớp API. Lưu ý: backend không xuất artifact lỗi, overlay lỗi do client dẫn xuất từ hai mask | Render overlay lỗi + chú giải trên máy (TC-ERR-002) | C2 (21–24/10) |
| PR-ERR-02 | Lỗi tổng hợp/ở case drill được tới bằng chứng lát MRI | V1 · Tuấn Anh (+ V3) | TC-ERR-003, TC-EXP-006 | **MỘT PHẦN** | Chọn lát tệ nhất phía server (`worst_slice_selection`, DR-010); V4a–V4c, V4i–V4o [MOB-T]; H4 [API-E2E] | Bấm vào lát tệ nhất / outlier mở đúng case-run-lát trên A17 | C2 (21–24/10) |
| PR-ERR-03 | Biểu diễn 3D của bất đồng phân đoạn, liên kết với bằng chứng 2D | V2 · Hùng Anh | TC-3D-005 | **CHƯA CÓ** | Không có bằng chứng ở đường sản phẩm: `error_reconstruction_get` trả `ARTIFACT_NOT_FOUND` có chủ ý (`test_error_reconstruction_stays_honestly_unavailable_while_dr005_is_open` [BE-T]); DR-005 vẫn OPEN; `management/spikes/SPIKE_F_3D_ERROR/` chỉ có TASK + template, chưa có RESULT. Viên gạch có sẵn: `backend/mesh/error_geometry.py` + 12 test (chưa nối vào API/app) | Quyết định DR-005 (hoặc phiếu hạ phạm vi chính thức); artifact lỗi 3D; UI SCR-05 lớp lỗi; TC-3D-005 | C1 quyết định (≤ 20/10); C2 làm |
| PR-3D-01 | Dựng biểu diễn 3D LA từ mask phân đoạn đã kiểm | V2 · Hùng Anh | TC-3D-001 | **CÓ BẰNG CHỨNG** | `backend/mesh` (#74, #98): `reconstruction_get` phục vụ mesh L0 theo sha256 của mask nguồn (`MESH_<sha256>`, `dr008c-L0/v1`); test `test_the_prediction_mesh_reference_and_its_bytes`, `test_every_face_lands_on_the_served_mask_of_its_source_slice`, `test_processed_is_its_own_mesh_and_never_the_raw_one` [BE-T]; `backend/mesh/tests/test_mesh_conformance.py`. Kiểm lại phiên này: 252 test backend + mesh đạt. H6 [API-E2E] trên dữ liệu thật | Không đổi trạng thái nhưng cần ghi: hình học ở khung chỉ số voxel (`GEOMETRY_NOT_VALIDATED`); kiểm trên dữ liệu thật chỉ nằm trong mô tả PR #98 (đầu ra ngoài git); chưa ACCEPTED (cần review + tích hợp) | C3 chốt ACCEPTED |
| PR-3D-02 | Xoay/zoom/pan biểu diễn 3D trên mobile | V2 · Hùng Anh | TC-3D-002, TC-PERF-002 | **MỘT PHẦN** | [SPB]: A17, WebGL2 Mali-G68, 3 lần/mức, FPS trung vị 59,88, đứng khung dài nhất 17 ms (app spike, case huấn luyện, mesh L0 61.424 tam giác); SCR-05 (#98) + V2W10 (cử chỉ) [MOB-T] | Đo trên SCR-05 sản phẩm với mesh thật của case holdout (TC-PERF-002) | C2 (21–24/10) |
| PR-3D-03 | Đổi lát MRI → cập nhật mặt phẳng/vị trí trên 3D | V2 · Hùng Anh (+ V1) | TC-3D-003 | **MỘT PHẦN** | SCR-05 vẽ dải theo lát 2D mà nó được mở từ đó (`Inspector3DScreen.js`: `initialSlice`); V2W9 [MOB-T] | Chưa có đồng bộ trực tiếp khi kéo slider 2D; chưa có test hình học dùng fixture chung (`tests/fixtures/geometry/geometry_fixture_v0.json`) cho hướng 2D→3D; INT-13 | C2 (21–24/10) |
| PR-3D-04 | Chọn vùng trên 3D → nhảy tới lát MRI tương ứng | V2 · Hùng Anh | TC-3D-004 | **MỘT PHẦN** | H7 [API-E2E]: bắn tia qua mesh, `face_source_slice` khớp mask 255 tại pixel; V2W3–V2W5, V2L7/L9 [MOB-T]; [SPB] B6 trên A17: mức L0 sai số tối đa 1 lát, B9: 0 lần điều hướng khi tia không trúng mask, 24 lần chạm ngón tay (app spike) | Chạm 3D → SCR-03 đúng lát trên A17 trong app sản phẩm, kể cả sau xoay/zoom camera | C2 (21–24/10) |
| PR-3D-05 | Khi có GT, 3D hiển thị lỗi liên kết với các lát đóng góp | V2 · Hùng Anh | TC-3D-005 | **CHƯA CÓ** | Như PR-ERR-03: DR-005 mở, Spike F chưa chạy, không có artifact/endpoint/UI | Như PR-ERR-03 | C1 quyết định (≤ 20/10); C2 làm |
| PR-EXP-01 | UNet và DINOv2 là artifact phân tích có thể so sánh, tái lập | ML · Khánh (+ V3) | TC-EXP-001/002 | **MỘT PHẦN** | 3 run DINOv2 + EXP-D-PP có manifest Contract 2 hợp lệ ([RES] đầu trang: `validate_contract2: PASS` mỗi gói); `ml/tests/test_export_contract2.py`; `contracts/ingestion/contract2_experiment_artifact/test_contract2.py`; ADR-ML-001 | Họ UNet chưa train, chưa xuất; manifest nằm ngoài git (git chỉ có hash trong [RES] §5) | C2 (≤ 24/10) |
| PR-EXP-02 | So sánh run tương thích ở mức cohort và case | V3 · Khánh | TC-EXP-003/006/007 | **MỘT PHẦN** | `experiment_compare` + cổng tương thích (`test_non_comparable_runs_get_no_delta` [ML-T]; `app/core/comparability.mjs`; V3S4/V3S7 [MOB-T]); H10 [API-E2E]: 025 so 100 và 050 so 100 `comparable`, 100 (RAW) so PP (PROCESSED) `comparable:false` | So sánh UNet và DINOv2 (SKIP trong [API-E2E]); SCR-07 trên máy; so sánh mức case | C2–C3 |
| PR-EXP-03 | Kết quả cho tỉ lệ nhãn 25/50/100% của UNet và DINOv2 | ML · Khánh | TC-EXP-004 | **MỘT PHẦN** | DINOv2 25/50/100 đã chấm một lần trên holdout 54 case ([RES]); tập con lồng nhau 20 ⊂ 38 ⊂ 78 ([SPLIT]) | EXP-U-025/050/100: train, chấm holdout, xuất Contract 2, nạp backend; cần bản ghi cho phép holdout mới cho họ UNet (bản hiện tại không có EXP-U) | C2 (≤ 24/10) |
| PR-EXP-04 | Cho xem kết quả ablation DINOv2 raw so với hậu xử lý | ML · Khánh (+ V3) | TC-EXP-005 | **MỘT PHẦN** | TC-EXP-005 đạt: PP-4 đóng băng trên validation (`management/day39/GATE_IMG_01_DECISION.md`, `gate_img_01/SELECTION.md`, sha256 cấu hình ghi trong file), chấm holdout một lần, so cặp ở [RES] §3; `ml/tests/test_postprocess.py`, `test_gate_img_01.py` | App chủ ý trả `comparable:false` cho RAW so PROCESSED nên kết quả ablation chỉ nằm trong tài liệu, không có màn/thẻ nào trên app; cần quyết định cách hiển thị rồi chạy trên máy | C2 (21–24/10) |
| PR-REV-01 | Ghi trạng thái review: chưa duyệt / chấp nhận / gắn cờ / đã sửa | V4 · Trung | TC-REV-001 | **MỘT PHẦN** | Máy trạng thái: V4-0..V4-5 (`app/verticals/v4_review_and_findings/test_review_correction.mjs`), `test_every_review_state_pair_through_patch`, `test_commit_moves_every_state_to_corrected` [BE-T]; H9 [API-E2E] (chuyển trạng thái sai bị từ chối) | SCR-06 trên main vẫn là placeholder (`mobile/src/verticals/v4/ReviewCorrectionScreen.js` hiện `NotBuiltYet`; #72 còn draft): chưa có UI để người dùng ghi trạng thái | C2 (21–24/10) |
| PR-REV-02 | Sửa mask 2D bằng brush thêm/xóa và lưu mask đã review | V4 · Trung | TC-REV-002..005 | **MỘT PHẦN** | [SPA] trên A17 (harness, fixture 64×64×16, bản release): A3 8/8, A4 6/6, A5 60/60 pixel sau zoom/pan, A6 15/15, A7 15/15, A8 save/reload nguội 16/16, A10 nét tệ nhất 30,48 ms/123 nét/0 mất mẫu; mô hình brush trong app (`test_brush.mjs`: 22/22, đã chạy lại phiên này); backend `working_mask_put` + `review_commit` | Màn SCR-06 chưa build; brush trong app sản phẩm ở kích thước 576×576 trên máy; TC-REV-002..005 và TC-PERF-003 trên bản sản phẩm | C2 (21–24/10) |
| PR-PROV-01 | Raw prediction bất biến; chỉnh sửa tạo artifact riêng truy vết được | V4 · Trung (+ Backend) | TC-REV-005/006 | **MỘT PHẦN** | `test_correction_creates_immutable_versions_and_never_touches_the_source`, `test_replace_cannot_overwrite_an_immutable_row`, `test_commit_is_atomic` [BE-T]; H9 [API-E2E]: checksum và id của raw prediction không đổi, phiên bản cũ nguyên vẹn; B3 trong `test_brush.mjs` | Luồng lưu → tải lại trong app (chưa có UI, TC-REV-005); TC-REL-001/002 qua luồng app thường | C2 (21–24/10) |
| PR-FIND-01 | Tạo finding neo vào thí nghiệm/case/lát/vùng | V4 · Trung | TC-FIND-001/002 | **MỘT PHẦN** | Mô hình finding F0–F10 (`test_findings.mjs`); `test_findings_keep_their_evidence` [BE-T]; H8 [API-E2E]: finding đọc lại đồng nhất | SCR-08 là placeholder (`FindingsScreen.js`): chưa có UI tạo/mở finding | C2 (21–24/10) |
| PR-MODE-01 | Không hiển thị metric phụ thuộc GT khi không có GT | Tích hợp · Tuấn Anh (mọi màn hình) | TC-MODE-001 | **MỘT PHẦN** | V1-3 (`test_case_explorer.mjs`), S2 (`stateCopy.test.mjs`: "không phải 0"); `test_inference_only_case_on_every_ground_truth_dependent_endpoint` [BE-T]; INT-12 [API-E2E] | Chạy trên máy với case inference-only ở SCR-03/04/05/07; rà từ ngữ (TC-USAB-003) | C2 (21–24/10) |
| PR-SCI-01 | Phân biệt rõ giao thức LASC 2018 với LAScarQS 2022 | Tuấn Anh (báo cáo/demo) | TC-SCI-001 | **MỘT PHẦN** | Danh tính dataset `LASC2018` do `study_get` trả (`backend/app/main.py`) và hiện ở SCR-01; câu chữ trong tài liệu tư vấn (`management/presentation/app_consultation/APP_CONSULTATION_ONE_PAGE.md`), không phải báo cáo cuối | Báo cáo/slide cuối chưa có; chưa có phép rà từ ngữ | C4 (28–30/10) |
| PR-SCI-02 | Khẳng định thể tích vật lý chỉ khi hình học đã kiểm | V2 · Hùng Anh (+ ML · Khánh) | TC-SCI-002 | **MỘT PHẦN** | Quy tắc `unvalidated_geometry_rule` trong `contracts/api/contract.json`; `test_no_response_carries_a_physical_unit` [BE-T]; chữ "no millimetre values are shown" trong `CaseExplorerScreen.js`/`Inspector3DScreen.js`; RVE tính theo voxel ([RES]); `management/DATASET_AUDIT.md` (header đều là spacing đơn vị) | Đủ ở phía sản phẩm; còn rà báo cáo/slide cuối: không mm/mL, ghi hạn chế | C4 (28–30/10) |
| PR-SCI-03 | Báo cáo kết quả quan sát được, kể cả null/âm; không ép DINOv2 hơn UNet | ML · Khánh | TC-SCI-003 | **MỘT PHẦN** | [RES]: báo cáo kết quả như quan sát (có CI, ghi rõ không hiệu chỉnh đa so sánh, ghi Dice tuyệt đối khiêm tốn, RQ-A "chưa trả lời được") | Họ UNet chưa train nên thứ tự mô hình quan sát chưa có; bảng báo cáo sinh từ artifact đóng băng chưa có (bộ sinh bảng nằm ở PR #97, chưa merge) | C2 dữ liệu; C4 báo cáo |
| PR-MOBILE-01 | Mobile là client tương tác chính, không phải trình xem tĩnh | Tích hợp · Tuấn Anh | TC-E2E-001 | **MỘT PHẦN** | App RN/Expo (`mobile/`, `app/core`); V1 + V3 tương tác trên main, V2 SCR-05 khung (#98); [L4] trên A17; hero flow mức API [API-E2E] | TC-E2E-001 trên máy chưa chạy lần nào; V4 là placeholder | C3 (25–27/10) |
| PR-MOBILE-02 | Có trạng thái loading/processing/empty/failure/retry cho luồng cốt lõi | Tích hợp · Tuấn Anh (+ mọi vertical) | TC-MOBILE-STATE-001 | **MỘT PHẦN** | `app/core/screenState.mjs` 7 trạng thái (`test_screen_state.mjs` S1–S7); `stateCopy.test.mjs` S1–S10; `FixtureScenarioPanel.js`; render smoke trong CI (job `mobile-render-bundle`, chỉ là logic, không phải bằng chứng thiết bị) | Ma trận trạng thái chạy trên máy cho từng màn hình (bản live: mất mạng, retry, dữ liệu sai); SCR-06/08 chưa có | C3 (25–27/10) |
| PR-MOBILE-03 | Mỗi thành viên sở hữu, phân tích, thiết kế, cài đặt, bảo vệ ≥ 1 chức năng mobile | Cả nhóm (Tuấn Anh theo dõi) | TC-TEAM-001 | **MỘT PHẦN** | Bốn gói `management/evidence/TC_TEAM_001_*.md`, tất cả ghi "IN PROGRESS"; mốc cập nhật cuối 18/09–01/10, trước khi V1/V3 lên main | Cập nhật từng gói theo code thực (PR, test, ảnh màn hình đã cài đặt so với thiết kế, quyền riêng tư, bảo vệ); chưa có ảnh chụp màn hình app thật | C3 (≤ 27/10) |
| PR-PRIV-01 | Dùng dữ liệu nghiên cứu đã de-identify; không cần danh tính thật | Backend · Trung | TC-SEC-001/005 | **CÓ BẰNG CHỨNG** | `management/DATASET_AUDIT.md` §7 và bảng tiêu chí (A16: 154 ID `CASE_NNNN`; A17: 0 định danh trực tiếp trong header); Contract 1 từ chối `METADATA_NOT_ALLOWED` (`contracts/ingestion/contract1_raw_dataset/test_contract1.py`, CI `contract-tests`); `test_allowlist_refuses_everything_else` [ML-T]; CI `no-forbidden-bytes` | Ghi chú: gói dữ liệu không có ánh xạ case→bệnh nhân (DR-002b), đó là vấn đề tách tập chứ không phải định danh. Chưa ACCEPTED | C3 chốt ACCEPTED |
| PR-PRIV-02 | Log, analytics, UI tránh thông tin định danh không cần thiết | Backend · Trung (+ mọi người) | TC-SEC-003/005 | **MỘT PHẦN** | `test_request_log_records_route_case_slice_and_bytes_without_the_client`, `test_request_log_keeps_only_allowlisted_query_keys` [BE-T]; `mobile/test/netlog.test.mjs` (log `CMW_HTTP` không có payload); quét IPv4 trong CI (#87); [L4] `server_summary.txt` chỉ có tổng hợp | Biên bản kiểm tra log thật (uvicorn, logcat) qua luồng thường (TC-SEC-003); rà UI không lộ địa chỉ/ID thừa | C3 (25–27/10) |

### 2.2 Bảng SHOULD (6) và COULD (5)

Theo `03` §5 (scope firewall), không SHOULD/COULD nào được vào phát triển khi còn MUST bị chặn hoặc chưa đạt. Cột trạng thái ghi hiện trạng, không phải kế hoạch.

| ID | Mức | Mô tả | Owner | TC | Trạng thái | Bằng chứng / ghi chú | Mốc |
|---|---|---|---|---|---|---|---|
| PR-AN-01 | SHOULD | Khởi tạo analysis run cho case tương thích, theo dõi trạng thái bất đồng bộ | ML · Khánh / Trung | TC-AN-001 (nếu kích hoạt) | **CHƯA CÓ** | Không kích hoạt. Chỉ có nhãn precomputed trong V1 (`runText`, V1l) — đúng phần "nhãn đúng" của phương án dự phòng | Không lên lịch (scope firewall) |
| PR-COMP-01 | SHOULD | So sánh đồng bộ nhiều run trên cùng case | V3 · Khánh | (nếu kích hoạt) | **CHƯA CÓ** | Chưa kích hoạt | Không lên lịch |
| PR-METRIC-01 | SHOULD | HD95 trên hình học vật lý đã xác nhận | V2 · Hùng Anh | TC-METRIC-001 (nếu kích hoạt) | **CHƯA CÓ** | Bị chặn theo thiết kế: hình học chưa kiểm (`GEOMETRY_NOT_VALIDATED`) | Không lên lịch |
| PR-REVAN-01 | SHOULD | Phân tích gánh nặng review | V4 · Trung | (nếu kích hoạt) | **CHƯA CÓ** | Chưa kích hoạt; phụ thuộc V4 UI | Không lên lịch |
| PR-FILTER-01 | SHOULD | Lọc/sắp xếp phong phú cho case/finding | V1 · Tuấn Anh | (nếu kích hoạt) | **MỘT PHẦN** | Lọc case theo ID + mode đã có (V1e [MOB-T]); finding chưa có | Chỉ làm nếu C2 dư thời gian |
| PR-CACHE-01 | SHOULD | Cache lát an toàn, thân thiện offline | V1 · Tuấn Anh | (nếu kích hoạt) | **MỘT PHẦN** | Cache lát trong bộ nhớ, có giới hạn, khóa theo checksum/variant (V1n, V1o, `mobile/src/runtime/sliceCache.mjs`); [L4]: quay lại lát cũ 0 byte. Không có cache bền/offline | Không lên lịch |
| PR-MODEL-EXTRA-01 | COULD | Thêm họ mô hình khác | ML · Khánh | — | **CHƯA CÓ** | Chưa bắt đầu; UNet chưa train nên bị scope firewall chặn | Không lên lịch |
| PR-COLLAB-01 | COULD | Cộng tác/bình luận nhiều người | — | — | **CHƯA CÓ** | Chưa bắt đầu | Không lên lịch |
| PR-ANN-ADV-01 | COULD | Công cụ chú thích nâng cao | V4 · Trung | — | **CHƯA CÓ** | Chưa bắt đầu | Không lên lịch |
| PR-STUDY-CREATE-01 | COULD | Tạo study tùy ý | V3 · Khánh | — | **CHƯA CÓ** | Chưa bắt đầu | Không lên lịch |
| PR-EXP-SCHED-01 | COULD | Lên lịch thí nghiệm tự động từ mobile | — | — | **CHƯA CÓ** | Chưa bắt đầu | Không lên lịch |

## 3. TC bắt buộc cho nghiệm thu

`13` §13 đòi TC-USAB-005, TC-E2E-001, TC-TEAM-001, TC-SCI-001, TC-SCI-002 và TC-SCI-003 đạt; leader thêm TC-PERF-001..003 vì chúng là phép đo thiết bị của hero flow. Ngoài ra §13 đòi mọi TC đã ánh xạ cho MUST FR/NFR đạt (hoặc có ngoại lệ được Decision Request chấp nhận), nên mục 3.3 liệt kê nốt 61 TC còn lại.

### 3.1 Bảng TC bắt buộc (9)

| TC | Kiểm gì | Trạng thái | Bằng chứng | Còn thiếu | Owner | Mốc |
|---|---|---|---|---|---|---|
| TC-E2E-001 | Hero flow mobile MRI → dự đoán → lỗi → 3D → nhảy 2D → review/brush → lưu artifact | **MỘT PHẦN** | [API-E2E] `tools/e2e/hero_flow_api.py`: H1–H10 qua đúng endpoint của app trên dữ liệu holdout thật. Kết quả ghi trong mô tả PR #95 (20 PASS/0 FAIL/3 SKIP) và PR #98 (22/0/1; SKIP còn lại = UNet). Đầu ra JSON nằm ngoài git | Chưa có lần chạy nào trên điện thoại; V4 là placeholder; bước UNet so DINOv2 SKIP; kết quả chạy API chưa được commit thành tệp (chỉ có trong mô tả PR) | Tuấn Anh | C3 (25–27/10) |
| TC-USAB-005 | Luồng E2E thành công 5 lần liên tiếp trên máy/bản build mục tiêu | **CHƯA CÓ** | Không có | Chưa có lần chạy nào trên máy. Cần kịch bản có tiêu chí PASS, 5 lần liên tiếp trên bản build cố định (bản release live), log redacted được commit | Tuấn Anh | C3 cuối (≤ 27/10); dự phòng 28/10 |
| TC-TEAM-001 | Bốn gói bằng chứng thành viên (phân tích/thiết kế/UI/cài đặt/test/riêng tư/bảo vệ) | **MỘT PHẦN** | [TEAM] 4 tệp, mỗi tệp tự ghi "IN PROGRESS — không phải PASS"; có thiết kế và sơ đồ; V1/V3/V4 có mô hình + test | Cả bốn gói lỗi thời (cập nhật cuối 18/09–01/10); không gói nào có ảnh chụp màn hình app thật so với thiết kế; V4 và V2 chưa có màn sản phẩm; mục "sẵn sàng shared-core" chưa được leader xác nhận | Cả nhóm | C3 (≤ 27/10) |
| TC-SCI-001 | Báo cáo/demo nêu rõ LASC 2018, không gọi là tái lập LAScarQS | **MỘT PHẦN** | Danh tính dataset trong `study_get`/SCR-01; câu chữ trong `management/presentation/app_consultation/` (bản tư vấn) | Báo cáo cuối và slide chưa có; cần phép rà từ ngữ có tick | Tuấn Anh | C4 (28–30/10) |
| TC-SCI-002 | Không có số mL/khoảng cách vật lý khi hình học chưa kiểm | **MỘT PHẦN** | `unvalidated_geometry_rule` (contract); `test_no_response_carries_a_physical_unit` [BE-T]; chữ trên SCR-03/SCR-05; RVE theo voxel ([RES]) | Rà báo cáo/slide cuối (không mm/mL, ghi rõ hạn chế) | Hùng Anh (+ Khánh) | C4 (28–30/10) |
| TC-SCI-003 | Bảng kết quả sinh từ artifact đóng băng, giữ thứ tự quan sát, không lọc case ép DINOv2 hơn | **MỘT PHẦN** | [RES]: DINOv2 25/50/100 + PP-4 trên holdout 54 case, mỗi run chấm một lần; ghi giới hạn và không hiệu chỉnh đa so sánh; `ml/evaluate.py` + test | UNet chưa train nên chưa có thứ tự mô hình; bảng báo cáo chưa sinh tự động từ artifact; số theo từng case nằm ngoài git (chỉ chủ ý tái lập được trên máy chủ run) | Khánh | C2 dữ liệu; C4 bảng |
| TC-PERF-001 | Chuyển lát 30 bước đã cache: p95 ≤ 200 ms, không tải cả volume mỗi cử chỉ | **MỘT PHẦN** | Nhánh 2 (không full-volume) đo trên app sản phẩm: [L4] PASS, mỗi lát mới tối đa 155,1 KB (1,1 % một volume), quay lại 0 byte, log server khớp. Nhánh 1 chỉ đo trên harness Spike A ([SPA] A9: p95 50–103 ms ở 5 lần đo, đều ≤ 200 ms, kể cả 576×576×88) | Chưa đo p95 trong app sản phẩm: `mobile/A9_TC_PERF_001_SCRIPT.md` (ba lần lặp trên A17) chưa chạy; phạm vi L4 là MRI + GT, chưa có dự đoán | Tuấn Anh | C2 (21–22/10) |
| TC-PERF-002 | Tương tác 3D ≥ 20 FPS trung vị, không khựng > 500 ms | **MỘT PHẦN** | [SPB] S-1 và B10/B11 trên A17 (app spike, WebView, mesh L0): FPS trung vị 59,88, khựng dài nhất 17 ms, 0 khung > 500 ms ở cả 5 mức mesh | Chưa đo trên SCR-05 sản phẩm, mesh thật của case holdout; bằng chứng hiện thuộc case huấn luyện | Hùng Anh | C2 (21–24/10) |
| TC-PERF-003 | Brush phản hồi ≤ 100 ms, không mất mẫu nét | **MỘT PHẦN** | [SPA] A10 trên A17 (bản release, harness): nét tệ nhất 30,48 ms trên 123 nét, p95 24,66 ms, 0 mẫu mất; B6 trong `test_brush.mjs` (nửa logic: 0 mẫu mất) | Chưa đo trên SCR-06 sản phẩm (chưa build); đo ở 576×576 và dữ liệu thật | Trung | C2 (22–24/10) |

### 3.2 Hero flow H1–H10: bằng chứng mức API và mức thiết bị

Theo `management/DEMO_STANDARD.md` (H1–H10 → TC). "Mức API" lấy từ [API-E2E] (22 PASS / 0 FAIL / 1 SKIP theo mô tả PR #98). Cột thiết bị: không bước nào có bằng chứng trên máy cho app sản phẩm, trừ phần chuyển lát của H4 trong [L4].

| Bước | Nội dung | TC chính | Mức API | Mức thiết bị (app sản phẩm) | Thiếu |
|---|---|---|---|---|---|
| H1 | Tóm tắt cohort/thí nghiệm | TC-STUDY-001, TC-EXP-003, TC-REP-003 | PASS | Chưa có | SCR-01 trên A17 |
| H2 | Nhận diện outlier | TC-EXP-006, TC-ERR-003 | PASS | Chưa có | Chạm outlier → case trên A17 |
| H3 | Mở Case Explorer | TC-CASE-001/002, TC-MRI-001/003 | PASS | Một phần ([L4]: mở một case evaluation) | 74 case thật, nhãn mode, run thật |
| H4 | Tới lát có vấn đề | TC-MRI-002, TC-ERR-003, TC-PERF-001 | PASS | Một phần ([L4]: chuyển lát, đo byte) | Jump tới lát tệ nhất; p95 trong app (script A9 chưa chạy) |
| H5 | So dự đoán / GT / lỗi | TC-MASK-001/003/004, TC-ERR-001/002, TC-MODE-001 | PASS (FP/FN/Dice tính lại từ PNG) | Chưa có | Overlay dự đoán + lỗi + zoom/pan trên A17 |
| H6 | 3D / bản đồ lỗi | TC-3D-001/002, TC-PERF-002 | PASS cho mesh dự đoán/GT; lớp lỗi: không có (DR-005) | Chỉ [SPB] (app spike) | SCR-05 trên A17; lớp lỗi 3D |
| H7 | Chọn vùng 3D → nhảy 2D | TC-3D-003/004/005 | PASS cho pick → lát → mask (3D-004); 3D-005 không có | Chỉ [SPB] B6/B9 (app spike) | SCR-05 → SCR-03 trên A17; đồng bộ 2D→3D; lỗi → lát |
| H8 | Gắn cờ / sửa bằng brush | TC-REV-001..004, TC-FIND-001, TC-USAB-002, TC-PERF-003 | PASS (ghi nhận review, sửa 1 pixel, finding) | Chỉ [SPA] (harness) | SCR-06/08 chưa build |
| H9 | Lưu mask review, giữ raw | TC-REV-005/006, TC-REL-001/002 | PASS (phiên bản mới bất biến, checksum raw không đổi) | Chỉ [SPA] A8 (harness) | Lưu/tải lại trong app; ngắt mạng giữa lúc lưu |
| H10 | Quay lại so sánh mô hình / data-scarcity | TC-EXP-004/005/007, TC-SCI-003 | PASS cho các cặp DINOv2 và nhãn không so sánh; UNet so DINOv2: SKIP | Chưa có | UNet; SCR-07 trên A17 |

### 3.3 61 TC còn lại (đủ 70 TC của spec 13)

| TC | Trạng thái | Bằng chứng | Còn thiếu | Owner | Mốc |
|---|---|---|---|---|---|
| TC-STUDY-001 | **MỘT PHẦN** | SCR-01 (#69), V3S1/V3S2, V3-1; H1 [API-E2E] | Chạy trên máy với backend thật | Khánh | C2 |
| TC-CASE-001 | **MỘT PHẦN** | SCR-02 (#77), V1c/V1e; H3 [API-E2E] | 74 case thật trên máy | Tuấn Anh | C2 |
| TC-CASE-002 | **MỘT PHẦN** | V1a/V1b/V1s; test inference-only [BE-T]; INT-12 [API-E2E] | Nhất quán list/chi tiết trên máy | Tuấn Anh | C2 |
| TC-MRI-001 | **MỘT PHẦN** | V1i; H3 [API-E2E] băm byte MRI; [SPA] A1 một phần | Lát đúng pixel trên dữ liệu thật trên máy | Tuấn Anh | C2 |
| TC-MRI-002 | **MỘT PHẦN** | V1j (slider xác định); [SPA] A9/A11 cử chỉ trên A17 (harness) | Cử chỉ trong app sản phẩm | Tuấn Anh | C2 |
| TC-MRI-003 | **MỘT PHẦN** | V1n4, V4e2 (không giữ overlay cũ); H3/H4 [API-E2E] | Đổi case/run trên máy | Tuấn Anh | C2 |
| TC-MASK-001 | **MỘT PHẦN** | `test_view_math.mjs` V1–V8, V1-6; [SPA] A2/A5 trên A17 (fixture 64×64×16) | Căn chỉnh overlay dự đoán/GT trong app sản phẩm sau zoom/pan | Tuấn Anh | C2 |
| TC-MASK-002 | **MỘT PHẦN** | V1-3; `test_ground_truth_is_served_only_for_evaluation_cases` [BE-T] | Xem trên máy ở case inference-only | Tuấn Anh | C2 |
| TC-MASK-003 | **MỘT PHẦN** | Điều khiển bật/tắt + opacity có trong code (`OPACITY_STEPS`); chưa thấy test riêng cho opacity | Test + kiểm trên máy: opacity không đổi hình học mask | Tuấn Anh | C2 |
| TC-MASK-004 | **MỘT PHẦN** | V1-7, V1-9; test per-variant [BE-T]; H4 [API-E2E] | RAW/PROCESSED thật trên máy | Tuấn Anh | C2 |
| TC-ERR-001 | **CÓ BẰNG CHỨNG** | V4f (`mobile/test/v1_error.test.mjs`): cặp mask tổng hợp, lớp lỗi = phép toán boolean; H5 [API-E2E] tính lại từ PNG. Test chạy trong CI `mobile-shell` | — | Tuấn Anh | — |
| TC-ERR-002 | **MỘT PHẦN** | V4g (chú giải bằng chữ, không chỉ màu) | Render lớp lỗi trên máy khớp dữ liệu | Tuấn Anh | C2 |
| TC-ERR-003 | **MỘT PHẦN** | V4a–V4c, V4i–V4o; H4 [API-E2E] | Bấm → đúng lát trên máy | Tuấn Anh | C2 |
| TC-MODE-001 | **MỘT PHẦN** | V1-3, S2; test inference-only [BE-T]; INT-12 [API-E2E] | Trên máy ở mọi màn hình liên quan | Tuấn Anh | C2 |
| TC-3D-001 | **CÓ BẰNG CHỨNG** | `backend/tests/test_meshes.py` + `backend/mesh/tests/*` (nguồn mask khai báo, `MESH_<sha256>`, `dr008c-L0/v1`, hình học khớp); 252 test đạt phiên này; CI `backend-tests` | — | Hùng Anh | — |
| TC-3D-002 | **MỘT PHẦN** | [SPB] (app spike); V2W10 | SCR-05 sản phẩm trên máy | Hùng Anh | C2 |
| TC-3D-003 | **MỘT PHẦN** | V2W9 (dải theo lát khi mở) | Đồng bộ trực tiếp 2D→3D + fixture hình học chung | Hùng Anh | C2 |
| TC-3D-004 | **MỘT PHẦN** | H7 [API-E2E]; V2W3–V2W5; [SPB] B6/B9 | Chạm 3D → SCR-03 trên A17 (sản phẩm), sau xoay/zoom | Hùng Anh | C2 |
| TC-3D-005 | **CHƯA CÓ** | Chỉ `backend/mesh/error_geometry.py` + 12 test (chưa nối) | DR-005, artifact, UI, điều hướng lỗi → lát | Hùng Anh | C1 quyết định; C2 |
| TC-REV-001 | **CÓ BẰNG CHỨNG** | V4-0..V4-5; `test_every_review_state_pair_through_patch`, `test_commit_moves_every_state_to_corrected`, test stale [BE-T]; H9 [API-E2E] | — (UI người dùng thuộc PR-REV-01) | Trung | — |
| TC-REV-002 | **MỘT PHẦN** | B4/B12 `test_brush.mjs`; [SPA] A3/A4 (harness) | Brush trong SCR-06 sản phẩm | Trung | C2 |
| TC-REV-003 | **MỘT PHẦN** | B5 `test_brush.mjs`; [SPA] A5 60/60 (harness) | Trong SCR-06 sản phẩm sau zoom/pan | Trung | C2 |
| TC-REV-004 | **MỘT PHẦN** | B7/B8; [SPA] A6/A7 15/15 (harness) | Trong SCR-06 sản phẩm | Trung | C2 |
| TC-REV-005 | **MỘT PHẦN** | V4-8..V4-10; [SPA] A8 save/reload nguội 16/16 (harness); H9 [API-E2E]: phiên bản mới + nguồn | Lưu → tải lại trong app sản phẩm | Trung | C2 |
| TC-REV-006 | **CÓ BẰNG CHỨNG** | `test_correction_creates_immutable_versions_and_never_touches_the_source`, `test_replace_cannot_overwrite_an_immutable_row` [BE-T]; H9 [API-E2E]: checksum raw không đổi, phiên bản cũ không đổi | — | Trung | — |
| TC-FIND-001 | **MỘT PHẦN** | F1/F5 (`test_findings.mjs`); H8 [API-E2E] | SCR-08 chưa build | Trung | C2 |
| TC-FIND-002 | **MỘT PHẦN** | F2/F10 (từ chối loại/trạng thái sai, `expected_revision`); `test_findings_keep_their_evidence` | SCR-08 chưa build | Trung | C2 |
| TC-EXP-001 | **CÓ BẰNG CHỨNG** | `ml/tests/test_export_contract2.py`, `contracts/ingestion/contract2_experiment_artifact/test_contract2.py`; 4 gói hợp lệ ([RES]). Áp dụng cho 4 manifest hiện có; manifest UNet phải qua cùng validator | — | Khánh | — |
| TC-EXP-002 | **CÓ BẰNG CHỨNG** | `ml/tests/test_evaluate.py` (known answer, `test_evaluate_run_detects_a_changed_prediction`); H5 [API-E2E] tính lại từ mask | — | Khánh | — |
| TC-EXP-003 | **CÓ BẰNG CHỨNG** | `test_cohort_summary_known_values`, `test_failed_cases_are_reported_never_dropped`; V3-4 (N intended/successful) | — | Khánh | — |
| TC-EXP-004 | **MỘT PHẦN** | DINOv2 25/50/100 + tập con lồng nhau ([RES], [SPLIT]) | 6 run UNet | Khánh | C2 |
| TC-EXP-005 | **CÓ BẰNG CHỨNG** | GATE-IMG-01 + [RES] §3 + `ml/tests/test_postprocess.py`, `test_gate_img_01.py`: cùng dự đoán thô/checkpoint EXP-D-100, một cấu hình đóng băng | — | Khánh | — |
| TC-EXP-006 | **MỘT PHẦN** | Outlier server-side; V3S8; H2 [API-E2E] | Trên máy: chạm → bằng chứng case | Khánh | C2 |
| TC-EXP-007 | **CÓ BẰNG CHỨNG** | `test_non_comparable_runs_get_no_delta`, `test_ablation_may_compare_raw_with_processed_explicitly`; `app/core/comparability.mjs`; V3S4/V3S7; H10 [API-E2E] | — | Khánh (+ Trung) | — |
| TC-EXP-008 | **CÓ BẰNG CHỨNG** | `data/manifests/split_manifest_path_a_seed2024.json` + [SPLIT] (42 phép kiểm tính lại, lồng nhau 20 ⊂ 38 ⊂ 78); `test_split_manifest_with_overlapping_partitions_is_refused`. Ở mức case; mức bệnh nhân là ngoại lệ DR-002b | — | Khánh | — |
| TC-EXP-009 | **CÓ BẰNG CHỨNG** | `test_known_answer_per_slice_and_empty_slice_rule`, `test_perfect_and_disjoint_cases`, `test_empty_reference_is_a_failed_case_not_a_score` [ML-T] | — (ml/tests chưa nằm trong CI, xem TC-MAINT-003) | Khánh | — |
| TC-AN-001 | KHÔNG ÁP DỤNG | PR-AN-01 (SHOULD) không kích hoạt | — | Khánh | — |
| TC-PERF-004 | KHÔNG ÁP DỤNG | Chỉ áp dụng khi có phân tích live; mesh được dựng sẵn | — | Trung | — |
| TC-REL-001 | **MỘT PHẦN** | H9 [API-E2E] + test bất biến [BE-T]; B3 `test_brush.mjs` | Qua luồng app thường (cần SCR-06) | Trung | C2 |
| TC-REL-002 | **MỘT PHẦN** | `test_commit_is_atomic`, V4-9/V4-10 (stale, không mất nét); [SPA] A8 (tải lại nguội); drill E9 retry (#33) | Ngắt mạng/app giữa lúc lưu trong app sản phẩm | Trung | C3 |
| TC-REL-003 | **MỘT PHẦN** | `test_a_mesh_built_for_another_shape_is_refused_as_a_geometry_mismatch` [BE-T]; hằng số phiên bản hình học ghim trong contract; V4-7 | Phía client hiển thị trạng thái không khả dụng khi lệch phiên bản (test + máy) | Hùng Anh | C2 |
| TC-USAB-001 | **MỘT PHẦN** | [SPA] cử chỉ pinch/pan/tap trên A17 (harness); [L4] (bằng `adb`) | Luồng cốt lõi bằng ngón tay trên app sản phẩm | Tuấn Anh | C3 |
| TC-USAB-002 | **MỘT PHẦN** | [SPA] A11: 12 lần ngón thứ hai chạm giữa nét đều cuộn lại, 0 nét commit trong cử chỉ nhiều ngón (harness); B8 | Trong SCR-06 sản phẩm | Trung | C2 |
| TC-USAB-003 | **MỘT PHẦN** | S2 (lý do "không phải 0"), V1-3 | Kiểm trực quan trên máy: không giống "lỗi bằng 0" | Tuấn Anh | C2 |
| TC-USAB-004 | **MỘT PHẦN** | Hằng số `MIN_TOUCH = 48` (`mobile/src/ui/theme.js`) | Rà từng control chính; ghi ngoại lệ | Tuấn Anh | C3 |
| TC-SEC-001 | **CÓ BẰNG CHỨNG** | [PR-PRIV-01]: DATASET_AUDIT A16/A17; fixture `CASE_9001`… chỉ ID tổng hợp; CI `no-forbidden-bytes` | — | Trung | — |
| TC-SEC-002 | **MỘT PHẦN** | LOCAL_DEMO qua lớp phủ mã hóa; cleartext chỉ ở bản live (`mobile/test/cleartextPlugin.test.mjs`, DR-021); `test_transport_hygiene` [BE-T] | REMOTE_DEMO/TLS chưa dựng; hồ sơ mạng tin cậy chưa có biên bản | Trung | C3 |
| TC-SEC-003 | **MỘT PHẦN** | `test_request_log_*` [BE-T]; `mobile/test/netlog.test.mjs` | Biên bản kiểm log thật | Trung | C3 |
| TC-SEC-004 | **MỘT PHẦN** | CI `no-forbidden-bytes` chặn tệp `.env/.pem/.key/...` và tệp lớn trong phần thêm của mỗi PR; quét IPv4 (#87) | Quét toàn repo và bundle mobile chưa có (CI chỉ quét tệp thêm vào) | Tuấn Anh | C3 |
| TC-SEC-005 | **CÓ BẰNG CHỨNG** | Contract 1 `METADATA_NOT_ALLOWED` (CI `contract-tests`); `test_allowlist_refuses_everything_else` [ML-T]; DATASET_AUDIT A17 | — | Trung | — |
| TC-REP-001 | **MỘT PHẦN** | [RES] §5: hash checkpoint, cấu hình PP, mã `f08968a`, split sha256; manifest Contract 2 qua `experiment_get` | Manifest và run nằm ngoài git; chưa có biên bản "giải được mọi phiên bản" cho từng báo cáo | Khánh | C4 |
| TC-REP-002 | **MỘT PHẦN** | [SPLIT] + test kiểm case nghi liên kết trên split thật (`test_real_split_suspected_linkage_*` [ML-T]) | Mức bệnh nhân KHÔNG kiểm chứng được (ngoại lệ DR-002b, có bản chạy độ nhạy 53 case) | Khánh | C4 (ghi rõ trong báo cáo) |
| TC-REP-003 | **CÓ BẰNG CHỨNG** | `experiment_metrics` trả N intended/successful + quần thể (V3-4); [RES] ghi quần thể holdout n = 54, mức case-level 3D | — | Khánh | — |
| TC-REP-004 | **CÓ BẰNG CHỨNG** | Cùng bằng chứng TC-EXP-007 | — | Khánh (+ Trung) | — |
| TC-MAINT-001 | **MỘT PHẦN** | Ánh xạ sở hữu trong `docs/specs/v1.0/14`, `app/README.md`, `mobile/src/nav/screens.mjs` (N2 kiểm khớp `14` §3) | Không có tệp bản đồ module/ranh giới tích hợp riêng | Tuấn Anh | C3 |
| TC-MAINT-002 | **MỘT PHẦN** | CI `geometry-contract` (hiện thực tham chiếu) + `backend/mesh/tests/test_mesh_conformance.py` (backend qua fixture chuẩn); JS: V2W2/V2W3 so với bản golden của Python | Phía mobile chưa chạy trực tiếp fixture hình học chuẩn (INT-13) | Hùng Anh | C2 |
| TC-MAINT-003 | **MỘT PHẦN** | CI chạy `backend/tests`, `backend/mesh/tests`, contracts, `app/core`, `mobile` (test logic + render smoke) | `ml/tests` (263 test, đạt khi chạy tay phiên này) KHÔNG nằm trong CI | Tuấn Anh | C1 |
| TC-AUDIT-001 | **MỘT PHẦN** | Tài liệu này là bản RTM đầu tiên ở mức yêu cầu sản phẩm → TC; `13` §10 có bản đồ FR/NFR | Chưa có RTM thực thi ở mức FR/NFR (`management/REQUIREMENTS_TRACEABILITY_MATRIX.md` chưa tồn tại) | Tuấn Anh | C3 |
| TC-AUDIT-002 | **MỘT PHẦN** | `PROJECT_STATE.yaml` ghi `accepted: 0`; CI `state-parses` | Cần cập nhật bảng khi có ACCEPTED đầu tiên, chỉ tính ACCEPTED | Tuấn Anh | C3 |
| TC-MOBILE-STATE-001 | **MỘT PHẦN** | `test_screen_state.mjs` S1–S7, `stateCopy.test.mjs`, `FixtureScenarioPanel`, render smoke | Chạy ma trận trạng thái trên máy cho từng màn hình | Tuấn Anh | C3 |
| TC-METRIC-001 | KHÔNG ÁP DỤNG | PR-METRIC-01 (SHOULD) không kích hoạt | — | Hùng Anh | — |

## 4. Tổng hợp

### 4.1 Số đếm theo trạng thái

| Nhóm | Tổng | CÓ BẰNG CHỨNG | MỘT PHẦN | CHƯA CÓ | KHÔNG ÁP DỤNG |
|---|---|---|---|---|---|
| Yêu cầu MUST | 33 | 2 | 29 | 2 | — |
| Yêu cầu SHOULD | 6 | 0 | 2 | 4 | — |
| Yêu cầu COULD | 5 | 0 | 0 | 5 | — |
| TC bắt buộc nghiệm thu (mục 3.1) | 9 | 0 | 8 | 1 | — |
| Toàn bộ TC của spec 13 | 70 | 15 | 50 | 2 | 3 |

`ACCEPTED`: **0** yêu cầu MUST, **0** TC. Trong 70 TC có 3 TC không áp dụng; trong 67 còn lại, 15 có bằng chứng đủ, 50 một phần, 2 chưa có.

### 4.2 Số đếm theo vertical / owner

Owner chính của từng yêu cầu/TC như trong bảng (vertical theo `14` §3 và quyết định DR-013/DR-013a: V1 Tuấn Anh, V2 Hùng Anh, V3 Khánh, V4 Trung; ML Khánh; backend và dữ liệu Trung; tích hợp và báo cáo Tuấn Anh).

| Vertical / khối | Owner | MUST | MUST có | MUST một phần | MUST chưa có | TC (trừ N/A) | TC có | TC một phần | TC chưa có |
|---|---|---|---|---|---|---|---|---|---|
| V1 Case Explorer / 2D | Tuấn Anh | 7 | 0 | 7 | 0 | 13 | 1 | 12 | 0 |
| V2 3D / không gian | Hùng Anh | 7 | 1 | 4 | 2 | 9 | 1 | 7 | 1 |
| V3 Thí nghiệm / cohort | Khánh | 4 | 0 | 4 | 0 | 2 | 0 | 2 | 0 |
| V4 Review / findings | Trung | 4 | 0 | 4 | 0 | 12 | 2 | 10 | 0 |
| ML (train, đánh giá) | Khánh | 4 | 0 | 4 | 0 | 13 | 9 | 4 | 0 |
| Backend / dữ liệu / riêng tư | Trung | 2 | 1 | 1 | 0 | 4 | 2 | 2 | 0 |
| Tích hợp / báo cáo | Tuấn Anh | 4 | 0 | 4 | 0 | 13 | 0 | 12 | 1 |
| Cả nhóm | Cả nhóm | 1 | 0 | 1 | 0 | 1 | 0 | 1 | 0 |

Gộp theo người (MUST / TC trừ N/A):

| Người | MUST | MUST có | MUST một phần | MUST chưa có | TC (trừ N/A) | TC có | TC một phần | TC chưa có |
|---|---|---|---|---|---|---|---|---|
| Tuấn Anh | 11 | 0 | 11 | 0 | 26 | 1 | 24 | 1 |
| Hùng Anh | 7 | 1 | 4 | 2 | 9 | 1 | 7 | 1 |
| Khánh | 8 | 0 | 8 | 0 | 15 | 9 | 6 | 0 |
| Trung | 6 | 1 | 5 | 0 | 16 | 4 | 12 | 0 |
| Cả nhóm | 1 | 0 | 1 | 0 | 1 | 0 | 1 | 0 |

Đọc bảng này cho đúng: số "có" của Khánh và Trung cao vì phần lớn TC của họ kiểm logic/dữ liệu (đã có test hoặc artifact), trong khi các TC của Tuấn Anh và Hùng Anh đòi phép đo trên máy mà chưa ai chạy. Đó là một khoảng cách về lịch đo thiết bị, không phải đánh giá chất lượng công việc.

### 4.3 Mười khoảng trống lớn nhất, xếp theo ảnh hưởng tới nghiệm thu 31/10

| # | Khoảng trống | Vì sao quan trọng cho 31/10 | Việc tiếp theo cụ thể | Owner | Hạn |
|---|---|---|---|---|---|
| 1 | **Hero flow chưa chạy trên điện thoại lần nào** (TC-E2E-001) và **chưa có 5 lần liên tiếp** (TC-USAB-005). Cả hai nằm trong sàn nghiệm thu `13` §13; hiện chỉ có mức API, đầu ra ngoài git | Không thể tuyên bố PR-MOBILE-01; mọi MUST giao diện chưa chốt được; TC-USAB-005 là `CHƯA CÓ` | (a) Commit bản tóm tắt kết quả `hero_flow_api.py` đã loại số theo case (số PASS/FAIL/SKIP + commit + ngày) vào `management/` ngay C1. (b) Khóa một bản build release live, viết kịch bản chạy hero flow có tiêu chí PASS từng bước (theo `mobile/A9_TC_PERF_001_SCRIPT.md`). (c) Quay một lượt liên tục trên A17 ở C3, rồi 5 lượt liên tiếp, commit log đã redact | Tuấn Anh | C1 (a); C3 (b, c) |
| 2 | **UNet chưa train**: họ EXP-U-025/050/100 chưa có; RQ-A, H10 đầy đủ, TC-EXP-004 chưa trả lời được; PR-EXP-01/02/03 và phần thứ tự của TC-SCI-003 kẹt | Đường găng của REPLAN; thiếu một nửa ma trận ML; nếu không kịp, phải có quyết định trước 24/10 | Khánh chạy hàng đợi UNet từ 19/10 qua tripwire DR-016a; ngay khi có checkpoint, leader ký bản ghi cho phép holdout riêng cho họ UNet (bản hiện tại chỉ có EXP-D-*), chấm một lần, xuất Contract 2, nạp backend, chạy lại H10. Mốc kiểm: 20/10 EXP-U-025 qua tripwire; 24/10 đủ 3 run. Nếu 20/10 12:00 chưa chạy thì chạy trên PC leader theo DR-016a; nếu đến 24/10 vẫn thiếu, leader quyết định bằng Decision Request (báo cáo nêu rõ RQ-A chưa trả lời, `PR-SCI-03` cho phép kết quả null nhưng không cho phép bỏ ma trận UNet mà không ghi) | Khánh (leader quyết định) | C1 khởi động; C2 xong |
| 3 | **V4 (SCR-06 brush/review, SCR-08 findings) là placeholder**: PR-REV-01, PR-REV-02, PR-PROV-01, PR-FIND-01 chưa có UI; TC-REV-002..005, TC-PERF-003, TC-USAB-002 chưa có bằng chứng sản phẩm | 4 MUST; bước H8–H9 của hero flow; TC-E2E-001 không thể đạt nếu thiếu | Trung hoàn thiện #72 (đang draft, cần rebase lên `main`): dùng mô hình `app/verticals/v4_review_and_findings` + code brush đã đo ở Spike A + bộ chuyển PNG của `mobile/src/imaging/`; lưu qua `working_mask_put` / `review_commit`. Vào `main` bằng quy trình thường trước 22/10, rồi đo trên A17: brush sau zoom, undo/redo, lưu → tải lại, ngắt mạng giữa lúc lưu (TC-REV-002..005, TC-REL-002, TC-PERF-003) và commit log | Trung (Tuấn Anh hỗ trợ viewer) | C2 (≤ 24/10) |
| 4 | **Lỗi 3D (PR-ERR-03, PR-3D-05, TC-3D-005) chưa có gì ở đường sản phẩm**: DR-005 mở, Spike F chưa chạy, không có artifact hay UI | 2 MUST không thể ACCEPTED; `13` §13 chỉ miễn các MUST đã hạ phạm vi chính thức | Leader và Hùng Anh quyết định DR-005 trong C1 (≤ 20/10): hoặc chọn phương án 3 (bề mặt LA + điểm đánh dấu thành phần FP/FN, đã có `backend/mesh/error_geometry.py` + 12 test làm nền) và cắt phạm vi tối thiểu (artifact lỗi mức L0, một endpoint, chạm vùng lỗi → các lát), hoặc lập Decision Request hạ phạm vi sang lỗi 2D. Không để qua C2 mà chưa quyết | Hùng Anh (leader quyết) | C1 quyết; C2 làm |
| 5 | **Chưa có phép đo thiết bị nào trên app sản phẩm** ngoài L4: TC-PERF-001 (kịch bản đã viết, chưa chạy), TC-PERF-002 (chỉ app spike, case huấn luyện), TC-PERF-003 (chỉ harness). Chỉ có một thiết bị | Ba TC hiệu năng bắt buộc đều `MỘT PHẦN`; không có số p95/FPS cho sản phẩm để bảo vệ | Cố định khung giờ đo trên A17 mỗi ngày, mỗi lúc một người. 21–22/10: Tuấn Anh chạy `mobile/A9_TC_PERF_001_SCRIPT.md` (3 lần lặp, bản release live, thêm run có dự đoán nay đã có). 22–24/10: Hùng Anh đo SCR-05 trên mesh thật của case holdout; Trung đo brush. Commit tệp thô + báo cáo, đúng thống kê NFR, không bỏ lần nào | Tuấn Anh / Hùng Anh / Trung | C2 |
| 6 | **TC-TEAM-001: bốn gói đều "IN PROGRESS" và đã lỗi thời** (cập nhật cuối 18/09–01/10, trước khi V1/V3 lên main); không gói nào có ảnh màn hình đã cài đặt so với thiết kế; mục sẵn sàng shared-core chưa được xác nhận | Nằm trong sàn nghiệm thu và là điều kiện PR-MOBILE-03 / rubric CLO3; mỗi người phải tự viết phần của mình (không ai viết thay) | Mỗi người cập nhật gói của mình theo `14` §4: yêu cầu, thiết kế so với màn hình đã cài, PR/commit, test, riêng tư, giới hạn, ghi chú bảo vệ; chụp màn hình app thật; leader rà shared-core bằng buổi hỏi đáp ngắn. Hạn nộp bản đầu 25/10 để còn sửa | Cả bốn thành viên | C3 (≤ 27/10) |
| 7 | **Báo cáo, slide và bảng kết quả chưa có**: TC-SCI-001/002/003 mới có bằng chứng phía sản phẩm; báo cáo cuối và slide theo bốn môn chưa bắt đầu; bảng kết quả chưa sinh tự động từ artifact đóng băng | Ba TC trong sàn nghiệm thu; rủi ro kéo sát hạn vì phụ thuộc UNet | C2: Khánh chốt bộ sinh bảng từ artifact đóng băng (kể cả UNet khi có). C4: Tuấn Anh viết báo cáo/slide theo lens `16` §3; rà từ ngữ bằng danh sách tick: nêu LASC 2018 và phân biệt LAScarQS (SCI-001), không mm/mL (SCI-002), thứ tự quan sát, CI, giới hạn: không augmentation, lr hằng số, 2D, không hiệu chỉnh đa so sánh, ngoại lệ tách tập DR-002b (SCI-003, REP-002) | Tuấn Anh / Khánh / Hùng Anh | C2 bảng; C4 báo cáo |
| 8 | **V2: đường 2D↔3D chưa đầy đủ trên app**: SCR-05 chỉ vẽ dải theo lát khi mở, chưa theo slider 2D (PR-3D-03); chưa có fixture hình học chuẩn chạy trên code mobile (TC-MAINT-002, INT-13); pick 3D → 2D chưa chạy trên A17 với app sản phẩm | PR-3D-02/03/04 và hero H6–H7 chỉ ở mức khung/API | Hùng Anh thêm đồng bộ lát 2D → mặt phẳng 3D và test dùng `tests/fixtures/geometry/geometry_fixture_v0.json`; đo pick → SCR-03 trên A17 sau xoay/zoom camera trên mesh thật. Nhớ giới hạn: chỉ mức L0 đạt sai số ±1 lát trên máy (quyết định DR-008c) | Hùng Anh | C2 (≤ 24/10) |
| 9 | **V1/V3 chưa kiểm trên máy với dữ liệu thật**: [L4] chỉ có 21 case, 0 run, chỉ MRI + GT; chưa thấy overlay dự đoán, RAW↔PROCESSED, case chỉ suy luận (INT-12), outlier → lát; kết quả ablation PP-4 chưa có chỗ hiển thị vì app chủ ý trả `comparable:false` cho RAW so PROCESSED (PR-EXP-04) | PR-CASE-*, PR-MRI-01, PR-PRED-01, PR-IMG-01, PR-ERR-01/02, PR-COHORT-*, PR-MODE-01 đều `MỘT PHẦN` chỉ vì thiếu bước này | Đưa backend thật (74 case + 4 gói) lên Mac mini trong C1 (mốc 20/10), build live, rồi đi theo từng bước H1–H5 và H10 trên A17, quay video + commit log đã redact. Leader quyết cách hiển thị ablation (thẻ "kết quả offline" cạnh hai thí nghiệm, vẫn không gắn nhãn so sánh được) | Tuấn Anh / Khánh | C1 hạ tầng; C2 đo |
| 10 | **Kỷ luật bằng chứng còn hở**: (a) `ml/tests` (263 test) không nằm trong CI nên bằng chứng ML chỉ dựa vào chạy tay; (b) kết quả E2E chỉ ở mô tả PR; (c) chưa có RTM thực thi (TC-AUDIT-001) và manifest/run nằm ngoài git (TC-REP-001); (d) quét secret chỉ trên tệp thêm vào, chưa quét toàn repo và bundle (TC-SEC-004) | Nghiệm thu đòi "requirements completed in code cannot be traced to tests/evidence" là điều kiện bị loại (`03` §4) | C1: thêm bước `pytest ml/tests` vào `guardrails.yml` (kiểm phụ thuộc torch/CPU trước), commit tóm tắt E2E (xem khoảng trống 1). C3: chuyển tài liệu này thành RTM thực thi (thêm FR/NFR) và cập nhật từng lần có `ACCEPTED`; thêm quét secret toàn repo; ghi biên bản "giải được mọi phiên bản" cho từng bảng kết quả báo cáo | Tuấn Anh / Khánh / Trung | C1–C3 |

## 5. Bằng chứng theo môn học (spec 16 §3, một sản phẩm bốn góc nhìn)

Cùng quy tắc trạng thái ở mục 1.1. Mỗi dòng lấy một bằng chứng mà `16` §3 yêu cầu cho môn đó.

### 5.1 Machine Learning

| Bằng chứng cần có | Trạng thái | Hiện có | Còn thiếu |
|---|---|---|---|
| Ma trận 25/50/100 % cho UNet và DINOv2 | **MỘT PHẦN** | DINOv2 25/50/100 đã chấm một lần trên holdout 54 case ([RES]); tập con lồng nhau 20 ⊂ 38 ⊂ 78 ([SPLIT]) | Toàn bộ họ UNet. Mỗi tỉ lệ chỉ một lần train (seed 2024), nên khác biệt giữa tỉ lệ gồm cả phương sai giữa các lần train (đã ghi trong [RES] §4) |
| Phân phối Dice/IoU | **MỘT PHẦN** | Trung bình, trung vị, tứ phân vị, độ lệch chuẩn, CI bootstrap trong [RES]; phân phối theo case có trong backend | Hiển thị phân phối trong SCR-07 trên máy; số theo case nằm ngoài git |
| So sánh cặp theo case | **MỘT PHẦN** | DINOv2: 025→050, 025→100, 050→100 và 100→PP-4 ([RES] §3, ghi chú không hiệu chỉnh đa so sánh) | Cặp UNet so DINOv2 |
| Giao thức tái lập | **MỘT PHẦN** | ADR-ML-001; hash checkpoint, cấu hình PP, mã, split trong [RES] §5; split đóng băng + [SPLIT]; ngoại lệ DR-002b ghi rõ; `ml/tests` 263 test đạt (chạy tay) | Manifest/run nằm ngoài git; `ml/tests` chưa trong CI; mức bệnh nhân không kiểm chứng được; TC-REP-001/002 một phần |
| Kết quả null/khiêm tốn được báo trung thực (PR-SCI-03) | **MỘT PHẦN** | [RES] §4: không ép hướng bài báo, ghi giới hạn | Cần thêm UNet; báo cáo cuối dùng đúng các câu này |

### 5.2 Image Processing

| Bằng chứng cần có | Trạng thái | Hiện có | Còn thiếu |
|---|---|---|---|
| Chính sách chuẩn hóa/resize | **CÓ BẰNG CHỨNG** | `ml/data.py` + `ml/tests/test_data.py` (DR-011: chuẩn hóa theo khối, resize gần nhất cho nhãn, khôi phục hướng nguồn) | Chỉ cần nêu trong báo cáo |
| Ablation mask raw → hậu xử lý | **CÓ BẰNG CHỨNG** | GATE-IMG-01: 6 ứng viên đóng, PP-4 chọn trên validation, đóng băng, chấm holdout một lần; `ml/tests/test_postprocess.py`, `test_gate_img_01.py`; [RES] §3 | Cách app hiển thị ablation (khoảng trống 9) |
| Hình thái học | **CÓ BẰNG CHỨNG** | `ml/postprocess.py` + 34 test (mở/đóng 3D, thành phần liên thông lớn nhất, lấp lỗ 2D, bất biến) | — |
| Dựng bề mặt/đường viền | **MỘT PHẦN** | `backend/mesh` (mặt voxel L0, `dr008c-L0/v1`), 252 test backend + mesh; mesh đã hiển thị trên A17 trong app spike ([SPB]) | SCR-05 sản phẩm trên máy với mesh thật |
| Ánh xạ voxel/pixel/world | **MỘT PHẦN** | Hợp đồng hình học `dr008a-dr012/v1.0.0` + fixture chuẩn (CI `geometry-contract`); pick → lát có sai số ±1 ở L0 ([SPB]) | Header đều là spacing/gốc mặc định nên chỉ có khung chỉ số voxel, chưa có world/mm (`GEOMETRY_NOT_VALIDATED`); mobile chưa chạy fixture chuẩn trực tiếp |
| Bản đồ lỗi 2D | **MỘT PHẦN** | SCR-04 (#78), V4f/V4g, H5 [API-E2E] | Render trên máy |
| Bản đồ lỗi 3D | **CHƯA CÓ** | Chỉ `backend/mesh/error_geometry.py` (chưa nối) | DR-005, artifact, UI (khoảng trống 4) |

### 5.3 Data Science

| Bằng chứng cần có | Trạng thái | Hiện có | Còn thiếu |
|---|---|---|---|
| Phân phối | **MỘT PHẦN** | SCR-07 (#69) vẽ dải điểm theo case; V3S3/V3S8 | Trên máy với số thật |
| Mean / median / std | **CÓ BẰNG CHỨNG** | [RES] §2, `test_cohort_summary_known_values` [ML-T]; N intended/successful (TC-REP-003) | Họ UNet |
| Outlier drill-down | **MỘT PHẦN** | Chọn outlier phía server (DR-010); H2 [API-E2E]; V3S8 | Chạm → lát trên A17 |
| Hồ sơ theo lát | **MỘT PHẦN** | SCR-04: hồ sơ lát từ `worst_slice_selection` (V4b/V4h) | Trên máy |
| Xu hướng khan nhãn | **MỘT PHẦN** | DINOv2: 25 → 50 → 100 có khác biệt cặp kèm CI, 50 → 100 chạm 0 ([RES] §3) | UNet; hiển thị xu hướng trong app |
| Kết quả thí nghiệm theo cặp | **MỘT PHẦN** | DINOv2 (offline) + cổng tương thích (H10 [API-E2E]) | UNet so DINOv2 |

### 5.4 Mobile Application Development (cả `16` §5, §5.1 rubric)

| Bằng chứng cần có | Trạng thái | Hiện có | Còn thiếu |
|---|---|---|---|
| Kiến trúc và tích hợp API | **MỘT PHẦN** | `management/adr/TECH_STACK_ADR.md` (GATE-MOB-01 đã đóng); `app/core` framework-neutral + CI; `contracts/api/` (API Contract 1.1.0, 34 case test); `mobile/` Expo; CI `mobile-shell` và `mobile-render-bundle` | Một bản build live chạy end-to-end với backend thật trên máy |
| Cử chỉ 2D | **MỘT PHẦN** | [SPA] A2/A5/A11 (harness); [L4] chuyển lát trong app sản phẩm | Zoom/pan, tách cử chỉ trong app sản phẩm |
| Brush sửa mask | **MỘT PHẦN** | [SPA] A3–A8, A10 (harness); mô hình `app/verticals/v4_review_and_findings` (22/22) | SCR-06 sản phẩm (khoảng trống 3) |
| Tương tác 3D bằng cảm ứng | **MỘT PHẦN** | [SPB] (app spike); SCR-05 khung (#98) | SCR-05 sản phẩm trên máy |
| Liên kết 2D↔3D | **MỘT PHẦN** | H7 [API-E2E]; V2W3–V2W9; [SPB] B6 | Hai chiều trên A17 trong app sản phẩm |
| Trạng thái / xử lý lỗi | **MỘT PHẦN** | `app/core` 7 trạng thái; `stateCopy`; `FixtureScenarioPanel`; render smoke | Ma trận trạng thái chạy trên máy (TC-MOBILE-STATE-001) |
| Quyền riêng tư | **MỘT PHẦN** | ID de-identify, allowlist metadata, log không payload, quét IPv4 trong CI, địa chỉ backend không commit (`mobile/README.md`) | Biên bản kiểm log thật (TC-SEC-003); TLS cho REMOTE_DEMO chưa dựng |
| Chức năng sở hữu của từng thành viên (CLO3) | **MỘT PHẦN** | [TEAM] bốn gói | Cập nhật theo code thực, ảnh màn hình so với thiết kế, bảo vệ (khoảng trống 6) |
| UI đã cài đặt so với thiết kế (CLO1/CLO2) | **CHƯA CÓ** | Thiết kế dạng sơ đồ chữ trong [TEAM]; spec `10` | Không có ảnh màn hình app thật nào trong repo để đối chiếu |
| Bản demo chạy được (CLO2) | **MỘT PHẦN** | Hướng dẫn build: `mobile/README.md`; L4 chạy bản release trên A17 | Bản build cuối cố định + quay hero flow liên tục |

## 6. Cách dùng và cập nhật tài liệu này

- Mỗi khi có bằng chứng mới (commit/PR đã merge/tệp đo thiết bị), sửa đúng dòng liên quan: cập nhật trạng thái, thay cột "Bằng chứng" bằng đường dẫn cụ thể, xóa phần đã hết thiếu. Không đổi trạng thái chỉ vì "đã làm xong code".
- Người đo thiết bị ghi theo đúng mẫu của `mobile/A9_TC_PERF_001_SCRIPT.md` (tệp thô, thống kê đúng định nghĩa, không bỏ lần chạy), không ghi serial, IP, đường dẫn tuyệt đối hay số theo từng case.
- Khi một yêu cầu đủ điều kiện, leader mới chuyển sang `ACCEPTED` theo `13` §6 (review, tích hợp, không P0/P1). Tài liệu này không tự làm việc đó.
- Chạy lại các bộ test ở mục 0 bằng lệnh: `node --test mobile/test/*.test.mjs`; `python -m pytest backend/tests backend/mesh/tests -q -p no:cacheprovider`; `python -m pytest ml/tests -q -p no:cacheprovider`; ba file `test_*.py` trong `contracts/` (xem job `contract-tests` của `.github/workflows/guardrails.yml`).

