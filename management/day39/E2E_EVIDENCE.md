# E2E evidence — hero flow H1–H10 qua API trên dữ liệu thật (18/10/2026)

| Mục | Giá trị |
|---|---|
| **Công cụ** | `tools/e2e/hero_flow_api.py` (#95, mở rộng H6/H7 trong #98): gọi đúng các endpoint app dùng, theo kịch bản demo `DEMO_STANDARD.md` §3 |
| **Dữ liệu** | backend 74 case (DR-022), 4 gói Contract 2 holdout (EXP-D-025/050/100, EXP-D-PP), 289 mesh L0 |
| **Phạm vi** | bằng chứng **mức API**, không phải bằng chứng thiết bị: TC-E2E-001 trên A17 vẫn phải quay video (C3) |
| **Bản đầy đủ** | JSON và console đầy đủ (có số từng lát, từng case) lưu ngoài git trên PC leader, `cardiac-runs/_holdout_d39/e2e/`. File này chỉ giữ kết quả từng bước và tóm tắt bằng chứng không có giá trị theo case |

## Backend local trên dữ liệu thật, có ghi (H8/H9), sau khung 3D

Bắt đầu `2026-10-18T01:29:16Z` · 3.57 s · contract 1.1.0 · case demo `CASE_0042` · kết quả **PASS**: PASS 22, FAIL 0, SKIP 1

| Bước | Kết quả | Nội dung | Lý do SKIP |
|---|---|---|---|
| H0 | PASS | service health, contract pin, packages accepted |  |
| H1.1 | PASS | SCR-01 study_get: dataset identity, case count, capabilities |  |
| H1.2 | PASS | experiment_list: 4 experiments on one FINAL_HOLDOUT population |  |
| H1.3 | PASS | experiment_get x4: versioned identity (family, fraction, manifests, checkpoint) |  |
| H1.4 | PASS | experiment_metrics x4: dice mean/median/CI95, N intended and successful |  |
| H1.5 | PASS | outlier entry points present for every experiment |  |
| H2 | PASS | outlier from persisted per-case values; INT-12 WITHHELD with no values |  |
| H3.1 | PASS | SCR-02 case_list: de-identified ids, evaluation vs inference-only |  |
| H3.2 | PASS | choose the demo case (first EXP-D-100 outlier, or --case) |  |
| H3.3 | PASS | SCR-03 case_get + geometry_get + slice n/total + MRI bytes (checksum) |  |
| H3.4 | PASS | the case's runs: EXP-D-100 (RAW) and EXP-D-PP (PROCESSED), active run and variant |  |
| H4.1 | PASS | analysis_run_metrics -> worst_slice_selection (DR-010, dr010-worst-slice/v1) |  |
| H4.2 | PASS | open the worst slice: MRI, ground truth, prediction bytes hash to the API checksum (DR-021) |  |
| H5 | PASS | SCR-04 errors: slice metrics, error reference, FP/FN re-derived from the two PNG masks |  |
| H6 | PASS | SCR-05 3D: reconstruction_get + mesh bytes (sha256), counts, vertices inside [0, shape], GT / RAW / PROCESSED |  |
| H6.i | PASS | INT-12 3D: prediction mesh served; ground-truth mesh and error mesh refused |  |
| H7 | PASS | pick a face in 3D -> its source slice is in range and the mask on that slice is at the face (GT, RAW) |  |
| H8 | PASS | SCR-06/08 review: open review, brush-equivalent working mask (1 px), stale/geometry guards, finding with evidence |  |
| H9 | PASS | SCR-06 save: new immutable reviewed-mask version, source identity, raw prediction checksum unchanged |  |
| H10.1 | PASS | SCR-07 experiment_compare data scarcity: 25% vs 100% and 50% vs 100% (COMPARABLE, deltas) |  |
| H10.2 | PASS | variant mismatch handled as the contract says (RAW vs PROCESSED is not fair) |  |
| H10.3 | SKIP | model comparison UNet vs DINOv2 | UNet runs are not available yet (Khanh trains them); the model comparison UNet vs DINOv2 x 25/50/100 cannot be shown |
| INT-12 | PASS | INT-12 guard: ground truth of the inference-only case is refused, never zero |  |

## Mac mini thật, gọi từ PC qua overlay ZeroTier, chỉ đọc (`--no-writes`)

Bắt đầu `2026-10-18T01:56:09Z` · 18.12 s · contract 1.1.0 · case demo `CASE_0042` · kết quả **PASS**: PASS 20, FAIL 0, SKIP 3

| Bước | Kết quả | Nội dung | Lý do SKIP |
|---|---|---|---|
| H0 | PASS | service health, contract pin, packages accepted |  |
| H1.1 | PASS | SCR-01 study_get: dataset identity, case count, capabilities |  |
| H1.2 | PASS | experiment_list: 4 experiments on one FINAL_HOLDOUT population |  |
| H1.3 | PASS | experiment_get x4: versioned identity (family, fraction, manifests, checkpoint) |  |
| H1.4 | PASS | experiment_metrics x4: dice mean/median/CI95, N intended and successful |  |
| H1.5 | PASS | outlier entry points present for every experiment |  |
| H2 | PASS | outlier from persisted per-case values; INT-12 WITHHELD with no values |  |
| H3.1 | PASS | SCR-02 case_list: de-identified ids, evaluation vs inference-only |  |
| H3.2 | PASS | choose the demo case (first EXP-D-100 outlier, or --case) |  |
| H3.3 | PASS | SCR-03 case_get + geometry_get + slice n/total + MRI bytes (checksum) |  |
| H3.4 | PASS | the case's runs: EXP-D-100 (RAW) and EXP-D-PP (PROCESSED), active run and variant |  |
| H4.1 | PASS | analysis_run_metrics -> worst_slice_selection (DR-010, dr010-worst-slice/v1) |  |
| H4.2 | PASS | open the worst slice: MRI, ground truth, prediction bytes hash to the API checksum (DR-021) |  |
| H5 | PASS | SCR-04 errors: slice metrics, error reference, FP/FN re-derived from the two PNG masks |  |
| H6 | PASS | SCR-05 3D: reconstruction_get + mesh bytes (sha256), counts, vertices inside [0, shape], GT / RAW / PROCESSED |  |
| H6.i | PASS | INT-12 3D: prediction mesh served; ground-truth mesh and error mesh refused |  |
| H7 | PASS | pick a face in 3D -> its source slice is in range and the mask on that slice is at the face (GT, RAW) |  |
| H8 | SKIP | SCR-06/08 review: open review, brush-equivalent working mask (1 px), stale/geometry guards, finding with evidence | --no-writes given |
| H9 | SKIP | SCR-06 save: new immutable reviewed-mask version, source identity, raw prediction checksum unchanged | H8 did not create a working mask |
| H10.1 | PASS | SCR-07 experiment_compare data scarcity: 25% vs 100% and 50% vs 100% (COMPARABLE, deltas) |  |
| H10.2 | PASS | variant mismatch handled as the contract says (RAW vs PROCESSED is not fair) |  |
| H10.3 | SKIP | model comparison UNet vs DINOv2 | UNet runs are not available yet (Khanh trains them); the model comparison UNet vs DINOv2 x 25/50/100 cannot be shown |
| INT-12 | PASS | INT-12 guard: ground truth of the inference-only case is refused, never zero |  |

## Không chứng minh điều gì

- Không đo hiệu năng, khung hình hay cử chỉ trên điện thoại (TC-PERF-*, TC-3D-* trên A17).
- Không thay video hero flow liên tục trên A17 (TC-E2E-001, TC-USAB-005).
- Không có UNet: H10.3 SKIP cho tới khi họ UNet được train và đánh giá holdout.
