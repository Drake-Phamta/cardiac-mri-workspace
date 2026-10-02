# POST-RECOVERY REVALIDATION — Day 23, 2026-10-02

| | |
|---|---|
| **Vì sao có file này** | Ngày 01/10, leader dùng override một ngày (`RECOVERY_OVERRIDE_DAY22.md`). Agent của leader làm thay trong mọi khối, rồi merge sau QA độc lập bằng LLM (CHAT E), **không** phải duyệt của người thứ hai. Override hết hạn 23:59 ngày 01/10 |
| **Nguyên tắc** | Quyền sở hữu (`DR-013`) trở về đủ từ sáng nay. Mỗi mục làm thay được liệt kê dưới đây cho chủ khối **duyệt lại, nhận hoặc từ chối**. Lỗi thì sửa tiếp, không revert mặc định (§7) |
| **Cách ghi** | Ghi vào cột **Kết quả**: `nhận`, `cần sửa: …` (mở PR sửa), hoặc `từ chối: …` (leader quyết). Thêm tên và giờ |
| **Hạn** | **12:00** hôm nay cho các mục 🔴; các mục còn lại trước khung duyệt 20:00 |

## Bế Quốc Khánh — ML, Spike C1, V3

| # | Mục → `main` | Làm gì dưới override | Kiểm | Kết quả |
|---|---|---|---|---|
| K1 🔴 | #59 → `0c3f847` | preflight C1: hardlink root, kiểm đích liên kết; `verify_subsets` | `python spikes/spike_c_ml/c1/test_preflight.py` | |
| K2 🔴 | #60 → `b606295` | `ml/data.py` (CaseAllowlist, DR-011, cache), `ml/models.py` | `pytest ml/tests -q`; đối chiếu nguồn copy từ `probe.py` | |
| K3 🔴 | #64 → `440dab1` | `ml/evaluate.py`, `ml/export_contract2.py` | ngữ nghĩa ml-eval-1.0.0: GT rỗng là case lỗi, bootstrap 10.000 mẫu seed 2024, ddof=1 | |
| K4 🔴 | #70 → `2f62923` | `ml/train.py`, `ml/queue.py`, `ml/infer.py`, ghim split đóng băng | đối chiếu `RECIPE` với ADR-ML-001 từng dòng | |
| K5 🔴 | #79 → `3c02fd2` | Spike C1 RESULT, ADR-ML-001, DR-016/016a; **GATE-ML-01 đóng** | đọc `RESULT_C1.md`, bản ghi QA §5; viết ghi chú C1-4 cho cả hai họ | |
| K6 | hàng đợi DINOv2 | chạy trên PC leader từ 14:30, E = 50, batch 8 | `train_log.jsonl` từng run: loss giảm, không NaN; SHA checkpoint | |
| K7 | #35 → `f5aa763` (split) | QA-005 thay cho duyệt lại sau rebase | N-1, N-3…N-6 của QA-005 | |
| K8 🔴 | #61 → `d6441bc` | mô hình V3 trên contract 1.1.0; B-1…B-3 do agent A6 sửa, B-4 do phiên leader sửa | `node app/verticals/v3_study_and_compare/test_study_and_compare.mjs` (155); đọc QA-61, 61b, 61c | |
| K9 🔴 | #81 → `d907240` | khoá chặn holdout: chỉ nhận split đóng băng, bản ghi GATE-IMG-01 có cấu trúc | `pytest ml/tests -q` (207) với `CUDA_VISIBLE_DEVICES=-1`; đọc QA-081; NB-2(a) trước hàng đợi UNet | |
| K11 🔴 | #69 → `f5d5384` | màn V3 SCR-01/SCR-07 (agent A6, restack A6b, sửa B-1 bởi phiên leader) | ``npm test`` trong `mobile/`; đọc QA-069 N-1…N-7 | |
| K10 | thử end-to-end | `ml/evaluate` → Contract 2 → backend trên dự đoán validation của EXP-D-025 (chạy local, ngoài git) | đọc `day22/qa/E2E_PROOF_EXP_D_025.md` | |


## Nguyễn Gia Đức Trung — contract, backend, V4

| # | Mục → `main` | Làm gì dưới override | Kiểm | Kết quả |
|---|---|---|---|---|
| T1 🔴 | #62 → `dbee96d` | API contract v1.0 (kèm sửa test V1) | `python contracts/api/test_api_contract.py` | |
| T2 🔴 | #68 → `9ba01e8` | backend FastAPI + SQLite, deploy offline cp39 | `pytest backend/tests -q`, dưới Python 3.9 nếu có | |
| T3 🔴 | #71 → `a7b4950` | contract 1.1.0 (sửa B1/B2 của QA #62) | README "Deviations"; các phiên bản ghim | |
| T4 | deploy Mac mini (12:59) | từ `a7b4950`, bind địa chỉ overlay | `/health`; quy trình redeploy | |
| T5 | #50 → `8782517` | fixture V1–V4; CI không chạy lại sau khi đổi base | chạy generator và test fixture | |
| T6 | #35 (split) | duyệt lại sau rebase (approval cũ ở `dc26b35`) | đọc `QA_REVIEW_005_SPLIT.md` | |
| T7 | #44 (Spike B B10/B11) | CHANGES_REQUESTED của bạn đã được sửa, nhưng chưa ai duyệt lại | duyệt lại `b0ae3e5` | |
| T8 | #58, #67 | biên bản override, bản ghi GATE-SPLIT-01 | đọc §1–§5 | |
| T13 | #82 TECH_STACK_ADR | ADR-MOB-001 ACCEPTED | đọc ADR §4–§8 với vai người duyệt thứ hai | |
| T14 | Spike B (reviewer) | ACCEPTED dưới override, QA LLM đứng thay bạn | APPROVE hoặc REJECT + lý do | |
| T9 | #53, #80 (V1) | người duyệt thứ hai cho khối V1 của leader | đọc diff, chạy `test_case_explorer.mjs` | |
| T10 🔴 | #63 → `254044a` | mô hình V4: review, brush, findings | ba file test V4 (33, 22, 25); đọc QA-063 N-1…N-7 | |
| T11 🔴 | #75 → `985c9c3` | metrics và ingest gói thử nghiệm; **chặn dữ liệu N-1** (INT-12) | `pytest backend/tests -q` (50); đọc QA-075 | |
| T12 | redeploy Mac mini (15:07) | `-SkipData` từ `985c9c3` | `/health`; `metrics.py` mới trên máy chủ | |


## Vũ Hùng Anh — V2 / 3D, Spike B; reviewer của Spike A và Spike C1

| # | Mục → `main` | Làm gì dưới override | Kiểm | Kết quả |
|---|---|---|---|---|
| H1 🔴 | #66 → `e5ccd38` | frontier mesh thật, B5/B9/B12 offline (agent A4) | `python spikes/spike_b_3d/harness/test_real_mesh_frontier.py`; README phần cơ chế | |
| H2 🔴 | #79 → `3c02fd2` | **SPIKE_C1 ACCEPTED** dưới override, QA LLM đứng thay APPROVE của bạn | APPROVE hoặc REJECT + lý do. REJECT thì GATE-ML-01 mở lại | |
| H3 | #41 → `a524b25` | Spike A S6: merge với `main` và sửa chữ sau khi bạn đã approve | duyệt lại `d0225d1` với vai reviewer của Spike A | |
| H4 | #44 → `8a94172` | leader sửa dòng B10/B11 trong TC-TEAM-001 của bạn (`b0ae3e5`) | xác nhận hoặc sửa | |
| H5 | phiên S-1 tối 01/10 | leader cầm máy; agent chuẩn bị gói và trích xuất | đọc `PROVENANCE.md`, kết quả trích xuất; viết B15 | |
| H6 🔴 | #74 → `be86cb1` | `backend/mesh` (agent A4) | `pytest backend/mesh/tests -q` (131); đọc QA-074; N-2, N-4, N-5 trước khi có endpoint | |
| H7 🔴 | #73 → `40b1316`: **Spike B ACCEPTED, DR-008c = L0** | leader cầm máy; agent trích xuất, xuất bằng chứng và viết RESULT | đọc RESULT và `PROVENANCE.md`; xác nhận chuỗi tap với leader (nhãn bị đảo); **viết B15 trước 10:00**; tự tính lại B6 từ mask | |

## Phạm Tuấn Anh — V1, tích hợp

| # | Mục | Làm gì dưới override | Kiểm | Kết quả |
|---|---|---|---|---|
| P1 | #53 → `6b52628`, #80 → `c7a37e0` | mô hình SCR-03; mở case không có run | 88 test V1; #80 N1, N3 trước khi run thật tới SCR-03 | nhận (Phạm Tuấn Anh, 09:40 02/10). 88/88; #80 N1 sửa README, N3 sửa trong PR V1 hôm nay |
| P2 | DR-016a | ghi sau C1, sau khi hàng đợi DINOv2 đã chạy | **anh đã xác nhận 21:17 ngày 01/10** | nhận (Phạm Tuấn Anh, 21:17 01/10) |
| P3 | quyết định do QA nêu | danh sách trong gói Day 23 của anh | quyết từng mục | đã quyết 09:25 02/10: DR-002c, DR-016b, DR-017…DR-021, phụ lục DR-013a. Dữ liệu tạm: đã chuyển vào Thùng rác lúc 11:25 |
| P4 | **GATE-MOB-01** (#82 → `f06cf6d`) | đã đóng 21:17 theo quyết định của anh (nhận L5) | đọc lại TECH_STACK_ADR §8 | nhận (Phạm Tuấn Anh, 21:17 01/10) |
| P7 🔴 | #77 → `cab847a`, #78 → `92a59ff` | shell + V1 SCR-02/03/04 + công cụ L4 (agent A2/A2b) | ``npm test`` trong `mobile/` (177), render smoke; QA-078 N-4…N-10; #77 NB-1 (import shim trong `maskPng.js`) | cần sửa: QA-078 N-4…N-10; #77 NB-1, N-3, N-6…N-12. Sửa trong các PR V1 hôm nay (Phạm Tuấn Anh, 09:40 02/10). Kiểm lại: mobile 177/177 (0 bỏ qua), render 85, app/core 10/10 |
| P5 | phiên L4 tối 01/10 | đo trên APK `ffbf763`; phiên Claude điều khiển máy qua adb theo yêu cầu của anh | đọc `PROVENANCE.md` của L4 | nhận (Phạm Tuấn Anh, 09:40 02/10). Chạy lại `l4-report` trên logcat đã commit: PASS, p50 153,5 KB, max 155,1 KB |
| P6 | #77 `ffbf763` | shim `latin1` cho Hermes (app văng khi khởi động) | đọc commit và test TD1/TD2 | nhận (Phạm Tuấn Anh, 09:40 02/10). TD1/TD2 đạt; NB-1 (import shim trong `maskPng.js`) sửa trong PR V1 |

## Dữ liệu tạm dẫn xuất từ dữ liệu bệnh nhân (cần leader duyệt xoá)

Trong ngày 01/10, agent và QA tạo ra các bản sao dẫn xuất **ngoài git**:
- cache ảnh lát cho backend trong worktree của agent;
- cache và thư mục run của các lần chạy thử;
- mesh từ mask thật;
- mesh chạy lại và chi tiết lỗi của QA;
- mảng dẫn xuất của QA;
- điểm liên kết từng cặp của QA-005 (giới hạn theo F5).

Leader có danh sách đường dẫn đầy đủ trên máy mình. **Không ai xoá khi leader chưa duyệt.** Bản gốc và bằng chứng (thư mục C1, thư mục run train, cache backend thật) được **giữ**.

**Đã xử lý ngày 02/10, khoảng 11:25** (leader duyệt cả ba nhóm):
- 98 thư mục được chuyển vào Thùng rác, chưa xoá hẳn:
  - bản sao dẫn xuất từ dữ liệu thật, khoảng 4,7 GB;
  - thư mục test và QA, khoảng 2 GB;
  - 45 worktree cũ, chỉ có code.
- Trước đó đã gỡ 474 junction bằng `rmdir`, chỉ gỡ link, không đụng đích.
- Dữ liệu gốc, các thư mục C1, các run, cache backend thật và phiên S-1 có cùng số file như trước.
- Ba worktree còn thay đổi chưa commit được giữ lại.
- Leader tự dọn Thùng rác khi chắc chắn.
