# QA-003 — lượt chạy trước trên head đóng băng `f118491` của #34

| Mục | Giá trị |
|---|---|
| Chạy lúc | 2026-09-18, 01:41–01:52 (+07) |
| Người chạy | Project Control, thay mặt leader |
| Head soi | `f118491` (*"merge main into Spike D repair after validator hardening"*), đúng head đã đóng băng theo quyết định 18/09 |
| Worktree | `scratchpad/wt-qa-d34c`, bộ script `scratchpad/qa003c` (bản sao của `qa003b`, chỉ đổi đường dẫn) |
| ZIP | `2018_UTAH_MICCAI.zip`, 2 200 962 438 byte |
| Mục đích | Để khi #34 merge, **chỉ còn một lượt xác nhận** trên `main` chứ không phải chạy lại từ đầu |

> **Đây chưa phải verdict.** Verdict QA-003 chỉ được viết sau khi #34 merge và bộ này chạy lại trên `main`.
> Không con số tương quan từng cặp nào, không giá trị suy ra theo từng case nào nằm trong file này
> (ruling `DR-002b` × `F5`, 17/09).

## 1. Head đóng băng khác gì head đã soi hôm qua: không gì trong phạm vi Spike D

`6fcc087` là head QA-003 đã soi ngày 17/09; `f118491` là head đóng băng hôm nay.

| Kiểm | Kết quả |
|---|---|
| Blob `data/manifests/dataset_manifest.json` | **giống hệt**: `8886eb5a0b85fd8f82b796691c4ac8021e474813` ở cả hai head |
| File thay đổi thuộc `tools/`, `data/`, `spikes/spike_d*`, `docs/data` | **không có file nào** (`tools/board/days.yaml` là bảng quản trị, không thuộc Spike D) |
| Tổng thay đổi giữa hai head | 31 file, toàn bộ là nội dung `main` được merge vào: docs board, packet Day 8, `OPEN_DECISIONS`, harness Spike A |

Nghĩa là mọi kết luận QA-003 ngày 17/09 áp dụng nguyên vẹn cho head đóng băng. Lượt chạy dưới đây xác nhận
điều đó bằng số chứ không suy luận.

## 2. `break_validator.py` — khớp từng con số với bản ghi 17/09

| Hạng mục | Bản ghi 17/09 trên `6fcc087` | Lượt này trên `f118491` |
|---|---|---|
| `DEFECT` | 6 | **6** |
| `ZIPSLIP` | 0 | **0** |
| `INFO` | 4 | **4** |
| `UNEXPECTED` | 1 | **1** |
| `OK` | — | 52 |

`--selftest` của `validate.py` thoát 0. Hai `A9`/`A14` `FAIL` in ra trong selftest là kết quả **mong đợi** trên
mask lệch và volume xiên cố ý, đúng hợp đồng 0/1 đã ghi.

## 3. `independent_census.py` — 462 header NRRD, các trường đồng nhất

Đọc thẳng header từ ZIP, không qua manifest:

| Trường | Giá trị duy nhất | Số header |
|---|---|---|
| `dimension` | `3` | 462 |
| `space` | `left-posterior-superior` | 462 |
| `space directions` | `(1,0,0) (0,1,0) (0,0,1)` | 462 |
| `kinds` | `domain domain domain` | 462 |
| `encoding` | `raw` | 462 |
| `space origin` | `(0,0,0)` | 462 |

Script vẫn **dừng ở `KeyError: 'sha256'`** ở bước đối chiếu hash (dòng 192), **sau** khi đã in xong phần census.
Đây là hệ quả đã biết của `F5` (manifest công khai không còn hash từng file), không phải lỗi mới của head này,
và đã được ghi trong `day08/qa003/README.md`.

## 4. `duplicate_mask_pair.py` và `verify_dr002b.py` — băm lại từ ZIP

- `duplicate_mask_pair.py` chạy hết, gom nhóm bằng hash băm lại từ ZIP. Phần hiệu chuẩn in ra **giá trị theo
  từng case**; theo ruling `F5`, những giá trị đó **không vào repo**, chỉ nằm trong scratchpad.
- `verify_dr002b.py` tái lập **độc lập**: tập loại trừ `CASE_0133` kéo theo `CASE_0117`, train hiệu dụng
  **80 − 2 = 78**, subset `20/38/78`. Khớp đúng những gì manifest công khai khai báo.
- **Câu hỏi còn treo, không đổi:** lượt tính lại tìm **4 cặp trên ngưỡng gộp thành 3 thành phần liên thông**,
  trong khi bản ghi nói **4 nhóm**. Đây là việc 1 của Khánh hôm nay; cách gọi tên phải thống nhất trước khi
  `GATE-SPLIT-01` đóng.

## 5. Còn lại sau khi #34 merge

1. Chạy lại đúng bộ này trên head đã merge của `main` — **một lượt**, không phải bốn.
2. Viết verdict vào `day08/QA_REVIEW_003_SPIKE_D_PRELIM.md` (hoặc bản chốt của nó).
3. `PASS` thì Spike D đi đủ **4 bước** (chủ spike · reviewer `APPROVE` · QA `PASS` · Project Control) rồi mới
   `ACCEPTED`, và `GATE-DATA-01` mới ghi `CLOSED`.
