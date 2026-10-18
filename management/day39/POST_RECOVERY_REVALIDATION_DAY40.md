# POST-RECOVERY REVALIDATION — Day 40, 2026-10-19

| | |
|---|---|
| **Vì sao có file này** | Ngày 18/10 leader dùng override một ngày (`RECOVERY_OVERRIDE_DAY39.md`). Agent của leader làm thay trong mọi khối **trừ train**, merge sau QA độc lập bằng LLM, **không** phải duyệt của người thứ hai |
| **Nguyên tắc** | Quyền sở hữu (`DR-013`) trở về đủ từ sáng 19/10. Mỗi mục làm thay dưới đây để chủ khối **duyệt lại, nhận hoặc từ chối**. Lỗi thì sửa tiếp, không revert mặc định |
| **Cách ghi** | Cột **Kết quả**: `nhận`, `cần sửa: …` (mở PR sửa), hoặc `từ chối: …` (leader quyết), kèm tên và giờ. Sửa file này bằng một PR, người duyệt là leader |
| **Hạn** | **12:00 ngày 19/10** cho các mục 🔴; các mục khác trước khung 20:00 |
| **Bản QA** | `management/day39/qa/` |

## Bế Quốc Khánh — ML, V3

| # | Mục → `main` | Làm gì dưới override | Kiểm | Kết quả |
|---|---|---|---|---|
| K1 🔴 | #92 → `a3c3904` | `ml/postprocess.py` (PP-0…PP-5), `ml/gate_img_01.py`, dẫn xuất EXP-D-PP, exporter theo DR-018 (case lỗi, run PROCESSED) | `CUDA_VISIBLE_DEVICES=-1 PYTHONIOENCODING=utf-8 python -m pytest ml/tests -q` (263); đọc QA_PR92_D39 NB-1…NB-3 | |
| K2 🔴 | #93 → `f08968a` | **GATE-IMG-01 đóng**: PP-4 đóng băng, bản ghi `holdout_authorization.json` | đọc `GATE_IMG_01_DECISION.md`, `gate_img_01/SELECTION.md`; kiểm sha256 của config `c0a68cc7…` | |
| K3 🔴 | holdout 18/10 07:22–07:36 | suy luận holdout 3 run DINOv2, EXP-D-PP, đánh giá, so sánh, xuất 4 gói Contract 2 (ngoài git, trên PC leader) | đọc log trong `cardiac-runs/_holdout_d39/`; không chạy lại holdout | |
| K4 | #96 | biên bản kết quả holdout (chỉ số tổng hợp) | đối chiếu với `metrics_summary.json` từng run | |
| K5 | #90 → `66a428c` | PR revalidation của chính bạn, merge sau QA LLM | — | |

## Nguyễn Gia Đức Trung — contract, backend, V4

| # | Mục → `main` | Làm gì dưới override | Kiểm | Kết quả |
|---|---|---|---|---|
| T1 🔴 | #94 → `01bed7b` | DR-017 (CASE_0001 tính vào cohort, fixture 5/5), N-b/N-c, QA-075 N-7, **validator DR-018**, **DR-022** (backend phục vụ 53 case holdout sau GATE-IMG-01) | `python -m pytest backend/tests -q -p no:cacheprovider`; `python contracts/api/test_api_contract.py`; đọc QA_PR94_D39 NB-1…NB-8 | |
| T2 | #95 | script E2E hero flow mức API (dùng backend) | chạy theo `tools/e2e/README.md` với `--no-writes` | |
| T3 | #87, #88 | CI job mobile, quét IPv4; điều hướng, netLog, `useCall`, checksum | duyệt lại với vai người duyệt thứ hai | |

## Vũ Hùng Anh — V2 / 3D

| # | Mục → `main` | Làm gì dưới override | Kiểm | Kết quả |
|---|---|---|---|---|
| H1 🔴 | PR khung V2 SCR-05 | backend phục vụ mesh L0 (DR-008c) từ mask, màn SCR-05 trong WebView, chạm để chọn lát → mở SCR-03 | xem mục "V2" trong gói Day 40 của bạn | |
| H2 | #87, #88, #89 | duyệt lại với vai người duyệt V1 | — | |

## Phạm Tuấn Anh — V1, tích hợp

| # | Mục | Làm gì dưới override | Kiểm | Kết quả |
|---|---|---|---|---|
| P1 | **DR-022** | quyết định do phiên leader ghi dưới override | xác nhận hoặc đổi | |
| P2 | #91, #93 | biên bản override và bản ghi cổng của chính anh | — | |
