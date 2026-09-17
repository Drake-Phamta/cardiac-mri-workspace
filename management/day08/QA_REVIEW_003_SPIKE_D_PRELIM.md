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

## 8 · CẬP NHẬT 11:55 — hai script cần ZIP đã chạy. Đối chứng độc lập **khớp**.

`independent_census.py` đọc thẳng 2,2 GB archive: **không qua `pynrrd`, không qua validator**, tự stream và
tự phân tích header. 462 NRRD trong **233 giây**.

### 8.1 · Điều tra bản thân gói — sạch

| Kiểm | Kết quả |
|---|---|
| dung lượng giải nén | **14,19 GiB** · 465 entry: 462 `.nrrd` · 2 `.py` · 1 `.ini` |
| **tên đáng ngờ** (tuyệt đối, `..`, backslash, ổ đĩa) | **`[]` — không có** |
| tên trùng · tên trùng khi bỏ qua hoa thường | **`[]` · `[]`** |
| entry mã hoá | **0** |
| thư mục case lồng trong thư mục case khác | **`[]`** |
| **file KHÔNG nằm trong thư mục case** | **đúng hai**: `preprocess_data.py` (5 076 B) · `Unet.py` (6 456 B) |
| thư mục case | **154** — `Testing Set` **54** · `Training Set` **100** |
| bộ tên file mỗi case | 153 case `{laendo, lawall, lgemri}` · **1 case** thêm `desktop.ini` |

> Hai điều đáng chú ý. **Một:** archive thật **không có** entry traversal nào — nên lỗ `S28` mà QA-003 tìm ra
> là **rủi ro tiềm năng**, không phải thứ đang xảy ra với gói này; nó vẫn phải vá, và đã vá. **Hai:** "đúng
> hai file ngoài thư mục case" nay được xác nhận **độc lập**, khớp chính xác `package_findings` của manifest.

`desktop.ini` — 66 byte, `[.ShellClassInfo]`, đúng một khoá `LocalizedResourceName`, **không có đường dẫn
ổ đĩa, không có SID**. Có ký tự `@`, gần như chắc chắn là tham chiếu tài nguyên kiểu
`@%SystemRoot%\system32\shell32.dll,-21787` chứ không phải email — **nhưng chủ spike nên xác nhận bằng mắt**,
vì đây là thứ duy nhất trong gói có hình dạng giống một chuỗi định danh.

### 8.2 · Điều tra header — không có định danh ẩn nào

Đếm trên **toàn bộ 462 file**:

| Trường | Giá trị | Số file |
|---|---|---:|
| magic | `NRRD0004` | 462 |
| `type` | `unsigned char` | 462 |
| `dimension` | `3` | 462 |
| `space` | `left-posterior-superior` | 462 |
| `space directions` | **`(1,0,0) (0,1,0) (0,0,1)`** | 462 |
| `space origin` | **`(0,0,0)`** | 462 |
| `sizes` | `640 640 88` · `576 576 88` | **255** · **207** |
| **`key:=value` tuỳ biến** | **không có trường nào** | **0** |
| comment | chỉ `standard teem comment` | 924 |

> **`key:=value` = 0 là kết quả có ý nghĩa nhất ở đây.** NRRD cho phép trường tuỳ biến, và đó chính là chỗ
> một định danh bệnh nhân sẽ nằm nếu có. **Không file nào có một trường nào.** Đây là bằng chứng độc lập cho
> `A17`, mạnh hơn phép kiểm allowlist vì nó **đếm toàn bộ**, không dựa vào danh sách cấm.

### 8.3 · Đối chiếu với manifest — khớp chính xác

| | manifest khai | census độc lập |
|---|---|---|
| `[640, 640, 88]` | **85** case | 255 file ÷ 3 = **85** |
| `[576, 576, 88]` | **69** case | 207 file ÷ 3 = **69** |
| tổng | 154 | **154** |
| căn trục | `A14` `PASS` 308/308 | **462/462 ma trận đơn vị** |
| dtype | `A5` `uint8` ×154 | **`unsigned char` ×462** |
| gốc toạ độ | `A9` "cùng gốc" 154 | **`(0,0,0)` ×462** |

`A5`, `A6`, `A9`, `A14` và toàn bộ điều tra case đều **được xác nhận độc lập**, tính từ byte thô chứ không
đọc lại manifest.

### 8.4 · `F5` chặn script thứ ba

`Z5` — bước duy nhất của `independent_census` cần đối chiếu hash — dừng đúng chỗ:

```text
File "independent_census.py", line 192
    if r["sha256"] == v["sha256"]:
KeyError: 'sha256'
```

Vậy là **ba** script QA (`recompute_manifest`, `duplicate_mask_pair`, `independent_census`) đều không chạy
hết trên artifact công khai. Mọi lượt QA sau này phải dùng ZIP hoặc manifest hạn chế. **Đây là hệ quả đúng
của `F5`, không phải lỗi** — nhưng nó đáng được ghi vào chính `F5` để lần sau không ai mất thời gian.

### 8.5 · Còn lại

`near_duplicates.py` và `duplicate_mask_pair.py` cần sửa để **băm lại từ ZIP** thay vì đọc `sha256` của
manifest. Đó là việc còn lại trước khi QA-003 chuyển từ **sơ bộ** sang **verdict**.

---

## 9 · CẬP NHẬT 12:15 — `F1` tái lập được trở lại, và `DR-002b` được kiểm chứng độc lập

> ⚠ **Ranh giới `F5` áp cho chính mục này.** Điểm tương quan từng cặp là dữ liệu **hạn chế** theo phán quyết
> `F5` và ruling `DR-002b` × `F5` ngày 17/09. Mục này ghi **mã case bị loại, ngưỡng và số đếm** — đúng những
> thứ ruling cho công khai — và **không ghi một điểm số nào**. Số nằm trong output của lượt chạy, giữ ngoài
> repo cùng chỗ với manifest hạn chế.

### 9.1 · `duplicate_mask_pair.py` chạy lại được sau khi băm từ ZIP

Script gốc chết ở `KeyError: 'sha256'` (§3). Bản QA-003 **băm lại 308 volume bắt buộc thẳng từ archive**
trong **36,4 giây**, không thiếu member nào. Đây không phải cách lách: `F1` vốn đứng trên **byte**, còn hash
trong manifest chỉ là bản sao đệm. Băm lại **bỏ hẳn bản đệm khỏi chuỗi bằng chứng**.

Kết quả: **đúng một nhóm** volume bắt buộc trùng byte trên toàn bộ 154 case — **`CASE_0056` / `CASE_0097`,
vai `mask`**. Đúng `F1`, tái lập từ byte thô.

Và nó trả lời được câu `F1` đặt ra mà manifest không trả lời được — *hai case này là **cùng một lần chụp**,
hay hai lần chụp khác nhau dùng chung một file nhãn?*

| Quan sát | Kết quả |
|---|---|
| `laendo.nrrd` trùng byte | **có** |
| `lawall.nrrd` trùng byte | **có** |
| `lgemri.nrrd` trùng byte | **không** |
| nhãn chung khớp thành `lawall` của **cả hai** case | **khớp như nhau**, và ở mức của **cặp cùng case** |
| so với hiệu chỉnh cặp chéo trên các case khác cùng shape | mức cặp chéo **thấp hơn một bậc độ lớn** |

> Nhãn dùng chung ôm vừa thành tim của **cả hai** case ở mức mà một case bình thường ôm vừa nhãn **của chính
> nó**, trong khi ghép chéo giữa các case khác thì kém hẳn một bậc. Cộng với `lgemri` **khác byte**: đây là
> **cùng một lần chụp được xuất hai lần với tiền xử lý khác nhau**, không phải hai lần chụp chia nhau nhãn.
>
> Đó chính xác là tiền đề `DR-002a` dựa vào khi ghim cặp này thành một nhóm. **Tiền đề đó nay được xác nhận
> độc lập từ byte**, không phải từ lời của manifest.

### 9.2 · `DR-002b` — tập loại trừ và số đếm **tái lập được**

`verify_dr002b.py` tính lại **mọi** cặp cùng shape và liệt kê **tất cả** cặp ≥ ngưỡng `r ≥ 0.75` *(không
phải top-N như `near_duplicates`)*, rồi gom thành **thành phần liên thông** — tức grouping **bắc cầu**.

| Điều `DR-002b` khai | QA-003 tính lại độc lập |
|---|---|
| ngưỡng `r ≥ 0.75` khai trước mọi lượt train | dùng đúng ngưỡng đó |
| `CASE_0133` bị loại khỏi train | ✅ **đúng** — nó nối với một case **holdout** trên ngưỡng |
| `CASE_0117` bị kéo theo cùng nhóm | ✅ **đúng** — nối với `CASE_0133` trên ngưỡng, nên cùng thành phần |
| tập loại trừ | ✅ **đúng hai case**, không hơn không kém |
| train hiệu dụng **78** | ✅ **đúng** |

**`DR-002b` được thực hiện đúng như đã quyết.** Đây là kết luận quan trọng nhất của §9: quyết định khoa học
của leader được kiểm chứng từ byte, không phải từ tuyên bố.

### 9.3 · Một lỗi QA tự mắc, ghi lại để không ai lặp

Lần tính đầu tôi so tập loại trừ với **100 case Training Set** và ra "train hiệu dụng 98", tưởng là lệch với
con số 78. **Sai baseline.** `DR-002` Path A chia 100 case phát triển đó thành **80 train / 20 validation**;
ngân sách `DR-002b` tiêu là **80**, không phải 100. **80 − 2 = 78.** Con số của chủ spike đúng ngay từ đầu.

Câu này đã được viết thẳng vào script để lượt QA sau không mắc lại.

### 9.4 · Một câu hỏi còn lại cho chủ spike — **hỏi, không phải cáo buộc**

Bản ghi nói **4 nhóm**. Cách tính này tìm ra **4 cặp** trên ngưỡng, nhưng chúng gộp thành **3 thành phần liên
thông**, vì một case xuất hiện trong hai cặp.

Hai khả năng, **cả hai đều chính đáng**:

- phương pháp sàng lọc của chủ spike tìm ra **một cặp thứ tư** mà cách này không thấy — rất có thể, vì
  `near_duplicates` dùng thumbnail stride `z4/y8/x8` và z-score, còn phương pháp của chủ spike có thể khác;
- hoặc chữ **"nhóm"** đang được đếm **theo cặp** ở một chỗ và **theo thành phần liên thông** ở chỗ kia.

Chỉ cần hai chỗ dùng **cùng một định nghĩa**. Điều này quan trọng vì `DR-002b` yêu cầu nhóm **giữ nguyên qua
mọi tập con** — mà "giữ nguyên" chỉ có nghĩa nếu nhóm là **bắc cầu**: nếu `A~B` và `B~C` thì tách `A` khỏi
`C` vẫn là rò rỉ.

### 9.5 · Giới hạn của phương pháp, giữ nguyên từ QA-002

Cách này tìm **cùng một lần chụp được xuất hai lần**. Nó **không** phát hiện được **cùng một bệnh nhân chụp ở
lần khám khác**, vì giải phẫu thay đổi giữa hai lần. Đó chính là lý do `06` §6 được ghi là **lệch có văn bản**
chứ không phải **đã thoả mãn**, và §9 này **không** làm yếu câu đó.

---

**Tái lập:** worktree `aaccae6`, `6fcc087` và `ed9c6c0`; bản sao script ở scratchpad `qa003/` và `qa003_40/`, khác bản
gốc `management/day06/qa002/` **chỉ ở hằng số đường dẫn** — bản gốc là hồ sơ QA-002 và không bị sửa.
