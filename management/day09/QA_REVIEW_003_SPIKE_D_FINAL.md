# QA-003 — Spike D, verdict chốt · **PASS** · 2026-09-18

| Mục | Giá trị |
|---|---|
| Soát trên | `main` tại **`7d49df4`** (merge #34, head đóng băng `f118491`), worktree `scratchpad/wt-qa-main` |
| Chạy lúc | 21:31–21:37 (+07) |
| Người chạy | Project Control, vai QA (`acceptance_workflow` bước 3) |
| ZIP | `2018_UTAH_MICCAI.zip`, 2 200 962 438 byte |
| Bản sơ bộ | [`../day08/QA_REVIEW_003_SPIKE_D_PRELIM.md`](../day08/QA_REVIEW_003_SPIKE_D_PRELIM.md) · lượt chạy trước [`QA003_PRERUN_ON_FROZEN_HEAD.md`](QA003_PRERUN_ON_FROZEN_HEAD.md) |

> Không con số tương quan từng cặp nào, không giá trị suy ra theo từng case nào nằm trong file này
> (ruling `DR-002b` × `F5`). Chỉ có mã case, số đếm và cờ đúng/sai.

## 1. `main` đúng là cái đã được soát

| Kiểm | Kết quả |
|---|---|
| Blob `dataset_manifest.json` trên `main` | `8886eb5a…`, **giống hệt** `f118491` và `6fcc087` |
| File phạm vi Spike D khác giữa `f118491` và `main` | **không có** |

## 2. Bộ chạy lại trên `main`

| Script | Kết quả | So với bản ghi 17/09 |
|---|---|---|
| `break_validator.py` (33 kịch bản) | `DEFECT 6 · ZIPSLIP 0 · INFO 4 · UNEXPECTED 1 · OK 52` | **khớp từng số** |
| `independent_census.py` | 462/462 header `NRRD0004`, cùng 8 trường, `unsigned char`, 3 chiều; 2 file `.py` và 1 `.ini` ngoài thư mục case | khớp |
| `duplicate_mask_pair.py` (băm lại từ ZIP) | 308/308 volume bắt buộc, 0 thiếu; **đúng một nhóm trùng byte:** mask của `CASE_0056`/`CASE_0097` (`laendo` trùng, `lawall` trùng, MRI **không** trùng) | khớp `F1` |
| `verify_dr002b.py` | tập loại trừ `{CASE_0117, CASE_0133}`, train hiệu dụng **80 − 2 = 78**; 3 thành phần liên thông | khớp |

## 3. Năm phát hiện chặn của QA-002, từng cái một

| # | QA-002 đòi gì | Có gì trên `main` | Trạng thái |
|---|---|---|---|
| **F1** CRITICAL | cặp trùng phải được báo, và không được nằm ở hai phía split | manifest `duplicate_evidence` 2 mục nêu đích danh `CASE_0056`/`CASE_0097`; audit ghi *"DR-002a: … one group, both pinned to training"*; tái lập độc lập từ ZIP ở §2 | ✅ Việc giữ hai case cùng một phía là của `GATE-SPLIT-01` (#35) |
| **F2** HIGH | audit ghi giá trị header và *"hình học vật lý chưa kiểm được — tắt mm/mL"* | audit §4.2: spacing `(1,1,1)`, origin `(0,0,0)`, không có trường đơn vị; *"Physical geometry is NOT VERIFIED; mm/mL measurements remain disabled (DR-012, TC-SCI-002)"* | ✅ đúng câu yêu cầu |
| **F3** HIGH | `A19`: leader ghi quyết định hoãn sang `GATE-SPLIT-01`, training vẫn `BLOCKED` | *"A19 split-evidence status — DEFERRED / NOT PASSED by the leader's 2026-09-16 Q2 decision"* | ✅ |
| **F4** HIGH | verdict của chủ spike cho `Q4`/`A14` dẫn 462 header; `A11` dẫn phép kiểm trên chính gói | `A14`: 308/308 header bắt buộc thẳng trục; `A11`: 154/154 file khoang khác SHA-256 với file thành; Khánh xác nhận qua HITL | ✅ (xem ghi chú 3 ở §4) |
| **F5** HIGH | bỏ đường dẫn tuyệt đối; hash từng file ra khỏi manifest công khai | 0 đường dẫn tuyệt đối; `package_root` = *"EXTERNAL PRIVATE ARCHIVE"*; còn đúng **5** SHA-256, đều ở cấp gói (2 file giấy phép, ZIP, gói nguồn, manifest hạn chế) | ✅ |

## 4. Không chặn — ghi lại, có người nhận

1. **Khoảng trống bao phủ `S23`/`S24`.** Bộ `A1`–`A20` **liệt kê** case trùng nội dung nhưng không có tiêu chí nào
   `FAIL` vì nó. Chỗ chặn thực sự là `GATE-SPLIT-01` (nhóm `DR-002a`/`DR-002b`, #35). Chấp nhận được vì tiêu chí
   làm đúng điều nó tuyên bố, và cổng split tồn tại chính để chặn chỗ này.
2. **`F13` — khối `summary` không đếm bất thường**, và **`F12` — lệnh sinh lại còn chỗ trống `<private …>`.** Cả hai
   nằm trong **PR follow-up của Khánh** mà leader đã hẹn sau khi #34 merge (packet Day 9 của Khánh, việc 4).
3. **`A11` dẫn chứng bằng khác biệt SHA-256**, tức chỉ chứng minh hai file khác nhau, không chứng minh khoang và thành
   là hai cấu trúc tách biệt. QA-002 đã đo trực tiếp `laendo` không chồng `lawall` ở 154/154; nên thêm phép đo đó vào
   verdict khi Khánh làm PR follow-up.

## 5. Verdict

**QA-003: `PASS`.** Mọi phát hiện chặn của QA-002 đã được sửa và **kiểm chứng trên `main`**, không chỉ trên nhánh.
Bằng chứng thực tế — manifest, audit, header gói, hash băm lại từ ZIP — khớp với những gì spike tuyên bố.

| Bước `acceptance_workflow` | Ai | Bằng chứng |
|---|---|---|
| 1 · chủ spike ghi bằng chứng | Bế Quốc Khánh | `RESULT.md`, `DATASET_AUDIT.md`, manifest trên `main` |
| 2 · reviewer `APPROVE` | Vũ Hùng Anh | review #34, 2026-09-18 14:50, tại `f118491` |
| 3 · QA `PASS` | Project Control (QA) | file này |
| 4 · Project Control chuyển trạng thái | Phạm Tuấn Anh | `SPIKE_D: ACCEPTED`, **`GATE-DATA-01: CLOSED`** |

`SPIKE_C1` **vẫn `BLOCKED`**: nó cần cả `GATE-SPLIT-01`.
