# QA-003 — Spike D, lượt soi lại độc lập · **SƠ BỘ** · 2026-09-17

**Người chạy:** Project Control cho Phạm Tuấn Anh · **Bắt đầu:** 11:14 · **Đối tượng:** PR #34 — chạy lần đầu trên `aaccae6`,
chạy lại trên `6fcc087` sau khi tác giả đẩy ba commit lúc 11:12–11:20 — đối chiếu với `main` `a92892c`
và PR #40 `ed9c6c0`. **§1 đã được giải quyết; xem §7.**

> ### ⚠ ĐÂY LÀ BẢN SƠ BỘ, KHÔNG PHẢI VERDICT
>
> Lượt này chạy **trước khi #34 được duyệt và merge**, theo quyết định của leader lúc 11:05, để rút ngắn
> chuỗi *review → merge → QA → đóng cổng* vốn đang nối tiếp. Nó **không thay** lượt QA chính thức sau
> merge, và **không** chuyển `ACCEPTED` cho ai.
>
> **Ba script cần ZIP 2,2 GB chưa chạy** — `rerun_tool_on_identical_archive.py`, `independent_census.py`,
> `near_duplicates.py`. Bản này chỉ nói được điều gì đúng trong phạm vi đã chạy.
>
> **Phát hiện ở đây KHÔNG được đưa cho Vũ Hùng Anh trước khi anh ấy gửi review #34.** Hai lượt soát chỉ có
> giá trị khi độc lập; đưa trước thì lượt của anh ấy chỉ còn là xác nhận lại lượt này.

---

## 1 · Kết quả quyết định: **#34 một mình là chưa đủ**

Cùng một bộ 33 kịch bản phá (`break_validator.py` của QA-002, chỉ đổi hằng số trỏ nhánh):

| | **#34** `aaccae6` | **#40** `ed9c6c0` |
|---|---:|---:|
| **DEFECT** | **36** | **6** |
| OK | 22 | **52** |
| **ZIPSLIP** | **1** | **0** |
| INFO | 4 | 4 |
| UNEXPECTED | 0 | 1 |

Cụ thể những gì #34 **chưa** chặn mà #40 chặn được:

| Kịch bản | #34 | #40 |
|---|---|---|
| `S28` ZIP traversal — entry `../evil`, `/abs` | **`rc=0` nhận vào**, `partitions=['..','','Training Set']`, còn **ghi file ra ngoài** | chặn |
| `S31` ZIP hỏng CRC | **sập** `zipfile.BadZipFile`, không phải `FAIL` sạch | `rc=2`, không sập |
| `A1` với `package_checksum` ghi là `000…0` | **`PASS`** dù archive quét ra `09978009cb71` | bị bắt |
| `A20` trên manifest **gõ tay** | `PASS` | **`FAIL`** |
| `S16`/`S17`/`S18` định danh trong header/comment | `A17 PASS` | chặn |
| `S26`/`S27` file ngoài thư mục case | `A17 PASS`, *không được nhắc tới* | chặn |

> **Hệ quả cho quyết định merge:** merge #34 **một mình** là nghiệm thu Spike D trên **đúng cái validator mà
> QA-002 đã bác**, kèm một lỗ **zip-slip** còn mở. #40 vá 30/36. Nhưng #40 đang **draft và xếp chồng trên
> #34** — đúng cái bẫy đã tự đóng #28.
>
> **Khuyến nghị:** #34 và #40 **về cùng nhau**, hoặc `ACCEPTED` của Spike D **chờ #40**. Việc #40 hết nháp
> và đổi base sang `main` đang là **việc 1 trong packet của Khánh** và chưa làm.

## 2 · Hai defect sống sót qua cả #40 — và chúng là hai cái quan trọng nhất

| Kịch bản | Kết quả trên **#40** | Vì sao nó nghiêm trọng |
|---|---|---|
| `S23` — **mask byte-identical giữa hai case**, MRI khác nhau | `A15 PASS`, `A16 PASS` | Đây **mô phỏng đúng `CASE_0056`/`CASE_0097`** — chính phát hiện `F1` `CRITICAL` khiến QA-002 bác Spike D |
| `S24` — **MRI byte-identical vắt qua hai partition** | `A15 PASS`, `A16 PASS` | Đây là **rò rỉ train/test trực tiếp** — đúng thứ `GATE-SPLIT-01` sinh ra để chặn |

**Không tiêu chí nào trong `A1`–`A20` `FAIL` khi hai case trùng nội dung.**

### Nhưng phải công bằng với chủ spike ở đúng chỗ này

Tôi vào lượt này với nghi ngờ rằng *"`A15` bị đổi ngữ nghĩa để `PASS`"*. **Nghi ngờ đó sai, và tôi rút lại.**
Tiêu đề `A15` vốn là **"Corrupted / missing / unreadable files _listed_"**, và phần chi tiết của nó ghi thẳng:
*"exact cross-case duplicates are listed; grouping and acceptance remain human decisions"*. `A15` làm **đúng
việc nó tuyên bố**. Đây không phải mánh, đây là **khoảng trống bao phủ**: bộ `A1`–`A20` **liệt kê** trùng lặp
nhưng **không có tiêu chí nào trượt** vì nó.

### Chỗ vẫn còn vấn đề thật

| | `main` `a92892c` | `#34` `aaccae6` |
|---|---|---|
| `duplicate_evidence` | **không có trường này** | **2 mục** ✅ |
| `A15` detail | `0 anomaly(ies): none` | `2 anomaly(ies): …CASE_0056, CASE_0097` ✅ |
| **`summary`** | `pass 16 · fail 0 · not_run 1 · machine_checks_clean false` | **giống hệt từng chữ** ⚠ |

Manifest **có** mang tín hiệu mới *(`duplicate_evidence` là trường mới, và detail của `A15` đổi)*. Nhưng
**khối `summary` giống hệt nhau**: người đọc — hoặc một cổng — chỉ nhìn `pass/fail` thì **không phân biệt
được** bản "chưa biết có case trùng" với bản "đã tìm ra một phát hiện `CRITICAL`". Đây là lớp `F13`.

**Đề nghị:** `summary` có thêm một trường đếm bất thường *(ví dụ `anomalies: 2`)*, hoặc `machine_checks_clean`
được dùng để phân biệt — hiện nó là `false` ở **cả hai** bản nên không phân biệt được gì.

## 3 · `F5` đã thực hiện, và nó **cắt đứt** khả năng tái lập `F1` từ artifact công khai

Chạy `recompute_manifest.py`: mọi phép tính lại từ `M6` đến `M10` **khớp hoàn toàn, 0 sai lệch** — shape, căn
trục, hình học MRI↔mask, giá trị mask, sidecar. Rồi nó dừng:

```text
=== M11 checksums and duplicate content ===
required volumes without 64-hex sha256   308
companion sha256 values                  {'None': 154}
KeyError: 'sha256'
```

**308 volume bắt buộc** (154 case × 2) **không còn `sha256`**. Đây là **`F5` hoạt động đúng như leader
quyết**, không phải lỗi của Khánh. Nhưng hệ quả phải được ghi:

> `F1` — cặp trùng — **không còn tái lập được từ manifest công khai**. Manifest *khai* phát hiện đó
> (`duplicate_evidence`), nhưng **không chứng minh được nó**. Muốn kiểm phải có ZIP hoặc manifest hạn chế.
>
> Kèm theo: **hai script QA `recompute_manifest.py` và `duplicate_mask_pair.py` không chạy được nguyên trạng
> trên artifact công khai nữa.** Bất kỳ lượt QA nào sau này cũng vấp đúng chỗ này.

## 4 · Lệnh sinh lại công bố **chưa copy-paste chạy được**

```json
"regenerate": "python tools/dataset_validate/validate.py --archive <private ZIP path>
               --acquisition <private acquisition.json path> --write-manifest --write-audit"
```

Hai chỗ `<private …>` là chỗ trống. `F12` đòi *"lệnh đã chạy"*, và bản này là **mẫu**, không phải lệnh đã
chạy. Cũng chưa thấy `--restricted-manifest-out` trong lệnh công bố dù chính bản hạn chế được sinh ra.

## 5 · Đính chính của Project Control trong lượt này

1. **`A17` trên #34 là `PASS`, không phải `FAIL`.** Tôi nói sai với người duyệt **hai lần** (01:52 và 10:15).
   `A17` nói về `CASE_0097/desktop.ini`, **giống hệt `main`**. `A17 FAIL` nằm ở **#40**, nhánh khác. Đã đăng
   đính chính lúc 11:17.
2. **`Unet.py` / `preprocess_data.py` có thật** — mở ZIP kiểm trực tiếp: 621 entry, đúng hai entry ở thư mục
   gốc. **Nhưng không phải "phát hiện mới":** QA-002 đã biết từ **15/09** — `misc_checks.py` hard-code đúng hai
   tên này, và `F10` nêu đúng vấn đề. #40 làm validator **báo cáo** chúng, tức **vá `F10`**, chứ không tìm ra.
3. **Nghi ngờ "`A15` đổi ngữ nghĩa" của tôi là sai** — xem §2.

## 6 · Chưa chạy

| Script | Cần | Sẽ cho biết |
|---|---|---|
| `rerun_tool_on_identical_archive.py` | ZIP | manifest có bị sửa tay không |
| `independent_census.py` | ZIP | đọc lại 154 case không qua validator — `A4`–`A11`, `A14`, `A17` |
| `near_duplicates.py` | ZIP | tương quan/Dice mọi cặp cùng shape — hiệu chỉnh `F1` |
| `duplicate_mask_pair.py` | ZIP | **sẽ `KeyError`** như §3; phải sửa để băm lại từ ZIP |
| `misc_checks.py` | ZIP | file ở gốc gói, lịch sử manifest |
| `rejudge.py` | — | trỏ lại thư mục run mới |

---

## 7 · CẬP NHẬT 11:45 — #34 đã nhảy sang `6fcc087`, và phần lớn §1 không còn áp dụng

Trong lúc lượt này chạy, Vũ Hùng Anh gửi review lúc **11:07** và Bế Quốc Khánh đẩy **ba commit**:
`5d2ecbf` *(đưa phần hardening vào #34)* · `98dc4fa` *(sinh lại audit toàn gói)* · `6fcc087` *(ghi tuyên bố
loại trừ `A17`)*. Leader merge **#40** lúc **11:37**. Chạy lại đúng bộ 33 kịch bản trên head mới:

| | `main` `a92892c` | #34 cũ `aaccae6` | **#34 mới `6fcc087`** | #40 `ed9c6c0` |
|---|---:|---:|---:|---:|
| **DEFECT** | — | 36 | **6** | 6 |
| **ZIPSLIP** | — | 1 | **0** | 0 |
| OK | — | 22 | **52** | 52 |

> **§1 đã được giải quyết.** Head mới của #34 sạch ngang #40: hết zip-slip, ZIP hỏng CRC cho `rc=2` thay vì
> sập, `A1` kiểm checksum gói thật *(`source_package_observation.sha256 = bee5ee5b…`, khớp ZIP
> 2 200 962 438 byte)*, `A20` bắt được manifest gõ tay. Khuyến nghị *"#34 và #40 về cùng nhau"* **đã được
> thực hiện theo cách tốt hơn**: #40 rebase thẳng lên `main` và merge độc lập, còn #34 lấy phần hardening vào.

### Phát hiện chặn của reviewer đã được xử lý

Vũ Hùng Anh nêu: *"`scan_package` và `scan_archive` chỉ thu file trong thư mục case trực tiếp… manifest không
có `package_findings`… `A17 PASS` không phải một lượt audit toàn gói."* Head mới có:

- hai trường mới ở cấp cao nhất: **`package_findings`** và **`source_package_observation`**;
- `package_findings` liệt kê `Unet.py` và `preprocess_data.py` với `kind: FILE_OUTSIDE_CASE_DIRECTORY`;
- **`A17`** đổi tiêu đề thành *"Metadata audit against the privacy allowlist"* và liệt kê **cả ba** đường dẫn
  kèm xử trí: *"explicitly excluded from ingestion/app metadata. Raw archive remains untouched."*;
- **`A15`** lên **4 anomaly**, thêm hai `FILE_OUTSIDE_CASE_DIRECTORY`.

`A17` giờ là `PASS` chứ không phải `FAIL` như review yêu cầu — nhưng review nói *"retain `A17` as `FAIL`
**until each unexpected path has an explicit, policy-compliant disposition**"*, và xử trí đó **nay đã có**.
**Đây là quyết định của reviewer, không phải của QA.**

### 🔴 Một phát hiện của §2 vừa được củng cố từ nghi ngờ thành bằng chứng ba điểm

| bản | số anomaly `A15` | khối `summary` |
|---|---:|---|
| `main` `a92892c` | **0** | `pass 16 · fail 0 · not_run 1 · machine_checks_clean false` |
| #34 cũ `aaccae6` | **2** | **giống hệt** |
| #34 mới `6fcc087` | **4** | **giống hệt** |

> Số bất thường đi **0 → 2 → 4** — bao gồm một phát hiện `CRITICAL` (`F1`) và hai file lạ ở gốc gói — mà
> **khối `summary` không đổi một chữ số nào**. Một người đọc, hoặc một cổng, chỉ đọc `pass/fail` thì không
> phân biệt được ba bản này.
>
> **Đề nghị cụ thể, rẻ:** thêm `anomalies: 4` *(và `package_findings: 2`)* vào `summary`. Hiện
> `machine_checks_clean` là `false` ở **cả ba bản** nên nó không phân biệt được gì.

### Hai defect vẫn sống sót, không đổi

`S23` *(mask byte-identical giữa hai case — mô phỏng đúng `CASE_0056`/`CASE_0097`)* và `S24` *(MRI
byte-identical vắt qua Training/Testing — rò rỉ train/test)* vẫn cho `A15 PASS`, `A16 PASS` trên **cả** head
mới **và** #40. **Không tiêu chí nào trong `A1`–`A20` trượt vì hai case trùng nội dung.** Đây là khoảng trống
bao phủ của bộ tiêu chí, không phải lỗi cài đặt — và nó là thứ `GATE-SPLIT-01` sinh ra để chặn.

### Còn lại không đổi

`F5` vẫn cắt đứt khả năng tái lập `F1` từ artifact công khai *(§3)*; lệnh sinh lại vẫn còn chỗ trống
`<private …>` *(§4)*; ba script cần ZIP vẫn chưa chạy *(§6)*.

---

**Tái lập:** worktree `aaccae6`, `6fcc087` và `ed9c6c0`; bản sao script ở scratchpad `qa003/` và `qa003_40/`, khác bản
gốc `management/day06/qa002/` **chỉ ở hằng số đường dẫn** — bản gốc là hồ sơ QA-002 và không bị sửa.
