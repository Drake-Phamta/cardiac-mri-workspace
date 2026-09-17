# QA-REVIEW-002 — soi đối kháng Spike D trước nghiệm thu

| | |
|---|---|
| **Ngày** | 2026-09-15, 11:08–11:52 +07:00 · Project Control kiểm lại F1 lúc 11:58 |
| **Đối tượng** | Spike D — audit bộ LASC 2018 trên `main` tại `a92892c` (PR #25; chủ spike Bế Quốc Khánh; reviewer Vũ Hùng Anh `APPROVE` 10:03) |
| **Bước** | 3/4 của nghiệm thu: chủ spike → reviewer `APPROVE` → **QA Red Team** → Project Control |
| **Người soi** | Một phiên QA / Red Team độc lập (`17` §3, CHAT E), chỉ nhận bằng chứng và một nhiệm vụ: *"bằng chứng nào cho thấy Spike D chưa được ACCEPTED?"* |
| **Phương pháp** | **Chạy thật, không review bằng đọc:** tái chạy scanner đã commit trên bản ZIP trùng SHA-256; đọc lại độc lập không qua pynrrd hay validator; 33 kịch bản phá validator (63 lượt chạy) |
| **Kết luận** | ❌ **REJECT** — Spike D chuyển `NEEDS_FIX`, trả chủ spike |

> **REJECT không có nghĩa số đo sai.** Mọi con số trong `RESULT.md` và `DATASET_AUDIT.md` khớp khi tính lại.
> Chạy lại scanner cho ra manifest **không khác trường nào** (trừ `generated_at`, `package_root`); một cách đọc
> độc lập khớp đủ 308 hash file, shape và tập giá trị mask. QA bác vì **những gì bằng chứng cho thấy mà audit
> không báo**: một case bị trùng, header không mang hình học vật lý, và artifact nghiệm thu còn thiếu phần bắt buộc.

---

## 1 · Kết quả tổng

| Mức | Phát hiện | Chặn `ACCEPTED` |
|---|---|---|
| CRITICAL | 1 — F1 | có |
| HIGH | 4 — F2, F3, F4, F5 | có, trừ khi leader miễn trừ rõ ràng |
| MEDIUM | 8 — F6…F13 | không |
| LOW | 3 — F14…F16 | không |

Phá validator: 33 kịch bản, 63 lượt — **41 DEFECT · 18 OK · 4 INFO** (sau khi QA tự sửa 4 kết luận chấm nhầm của
chính mình).

---

## 2 · F1 (CRITICAL) — một case bị trùng, và split nháp đã đặt hai bản ở hai phía

| Sự thật | Bằng chứng |
|---|---|
| `CASE_0056` và `CASE_0097`, cả hai thuộc `Training Set`, có `laendo.nrrd` **giống hệt từng byte** | manifest đã commit: cùng SHA-256 `685f964b…` (`dataset_manifest.json` dòng 10166 và 17631) |
| `lawall.nrrd` của hai case cũng giống hệt | SHA-256 `ccd380f1…` ở cả hai; IoU 1,0 |
| MRI **không** trùng byte nhưng gần như một ảnh | Pearson r = 0,9965; 36,8% voxel trùng. Cặp giống thứ nhì trong 5 916 cặp cùng kích thước: r = 0,787 |
| Không phải nhãn gán nhầm | mask khoang dùng chung khớp thành của **cả hai** case đúng như khớp thành của chính nó (0,61; các cặp đúng khác 0,60–0,70, cặp sai 0,02–0,06) |
| Audit không báo | `DATASET_AUDIT.md:136` — *"Anomalies: 0"*; `A15`, `A16` PASS; validator không có phép kiểm nào bắt được (kịch bản S22–S24) |
| **Split nháp đặt hai bản ở hai phía** | manifest split của PR #28 (đã đóng): `CASE_0056` ở **train** (dòng 43, cả tập 50% và 100%), `CASE_0097` ở **validation** (dòng 219) → **rò rỉ train ↔ validation**, loại P0 của `13` §12 |

- **Project Control đã chạy lại** script so cặp của QA lúc 11:58 trên cùng bản ZIP: ra đúng các số trên.
- **Không có cặp gần trùng nào vắt sang 54 case holdout**, theo phương pháp tương quan voxel. Phương pháp này
  **không** phát hiện được cùng một bệnh nhân chụp ở một lần khác.
- `CASE_0097` cũng là case duy nhất có file lạ `desktop.ini`.

---

## 3 · Bốn phát hiện HIGH

| # | Vấn đề | Bằng chứng | Sửa |
|---|---|---|---|
| **F2** | **Header không mang hình học vật lý.** Cả 462 file có spacing `(1,1,1)`, origin `(0,0,0)`, direction đơn vị, không có trường units. "Thẳng trục" và "không cần resample" chỉ đúng **ở mức header**. `06` §4 đòi giữ ghi chú về giá trị công bố; audit §4 không nêu giá trị nào | census 462/462; `DATASET_AUDIT.md:73-95` | Audit §4 ghi các giá trị và câu *"hình học vật lý chưa kiểm được — chỉ số mm/mL tiếp tục tắt"* (`06` §4, TC-SCI-002); lời đóng `C6` và câu trích trong `DR-002` ghi rõ giới hạn này |
| **F3** | **`A19` chưa đạt.** `06` §9.1 đòi *"selected split path and exact manifest IDs"* — audit hoãn (dòng 127–128); mục hình học/bất thường và loại trừ chỉ phủ một phần. `A19` còn `NOT_RUN` | bảng đối chiếu ở §5 | Leader ghi quyết định hoãn mục split sang `GATE-SPLIT-01` (training vẫn `BLOCKED`), hoặc sinh lại audit sau khi manifest split merge. F1 và F2 hoàn tất hai mục còn lại |
| **F4** | **Thiếu verdict viết của chủ spike.** Không có verdict **Q4 / `A14`** mà TASK đòi *"citing the specific files and values"*. Verdict `A11` chỉ dẫn mô tả trên web và "mask nhị phân" — điều đó không phân biệt được khoang với thành | `TASK.md:150-151`; `RESULT.md:33-44` | Chủ spike viết verdict Q4 dẫn 462 header đơn vị; `A11` dẫn một phép kiểm trên chính gói dữ liệu (QA đã đo: `laendo` không chồng `lawall` ở 154/154) |
| **F5** | **Quản trị dữ liệu, repo public.** Verdict `A18` của chủ spike: *không phát tán dữ liệu thô hoặc dẫn xuất khi chưa xác nhận DDA* — nhưng manifest public có 308 hash file, 154 ID thư mục phát hành, min/max từng volume, và **đường dẫn tuyệt đối** (`package_root`, `license_terms_path`). Không có nội dung ảnh, định danh bệnh nhân hay username → **chưa xác lập là vi phạm** | `dataset_manifest.json` dòng 5 và 15; `gh repo view` → PUBLIC | Bỏ đường dẫn tuyệt đối; leader phán phần còn lại theo điều khoản CAP (hai PDF nằm trên máy Khánh) |

---

## 4 · MEDIUM và LOW — không chặn, phải theo dõi trước khi validator thành cổng ingestion/geometry

| # | Mức | Vấn đề |
|---|---|---|
| F6 | MEDIUM | `A9` chỉ so origin — cho PASS khi mask lật trục, khác shape hoặc khác spacing *(sửa của QA-001 mới được một phần)* |
| F7 | MEDIUM | `A17` dò khoá theo danh sách cấm, không phải allowlist — lọt định danh trong `DICOM_0010_0010`, comment, `content:`; nhánh sidecar trả PASS trước phép kiểm header chưa đọc *(hồi quy so với QA-001)* |
| F8 | MEDIUM | `A10` không thể FAIL: mask `{0,1}`, `{0,254,255}`, mask rỗng đều PASS |
| F9 | MEDIUM | `--archive` không băm file ZIP; SHA-256 chép từ JSON |
| F10 | MEDIUM | File ngoài thư mục case hoặc trong thư mục con không được ghi; mục ZIP `../` và đường dẫn tuyệt đối được nhận làm case; thành viên ZIP trùng tên âm thầm thay nhau |
| F11 | MEDIUM | Hàng direction `NaN` hoặc toàn 0 vẫn PASS `A14`/`A7`; `NaN` bị ghi vào JSON |
| F12 | MEDIUM | `RESULT.md` thiếu log output của validator (TASK:145-146), môi trường, commit đã kiểm, bảng ràng buộc |
| F13 | MEDIUM | Lời lẽ lạc quan hơn bằng chứng: *"owner verdicts complete"*, *"no corruption"*, hình học trình bày không kèm giới hạn; trong "16 PASS" chỉ 6 phép kiểm có thể FAIL trên dữ liệu thật |
| F14 | LOW | Thành viên ZIP hỏng làm `--archive` crash (exit 1 thay vì 2) |
| F15 | LOW | `A16`, `A20` không thể FAIL; schema nhận một manifest tự mâu thuẫn |
| F16 | LOW | Sai lệch nhỏ trong README/audit; loại trừ `desktop.ini` gắn theo ID vị trí và chưa có code ingestion nào thực thi |

---

## 5 · `A1`–`A20` và `06` §9.1

- **`SUPPORTED`:** `A1`–`A14`, `A17`, `A20` — `A7`–`A9` chỉ ở mức header (F2); `A11` nhờ phép đo của QA (F4);
  `A14` thiếu verdict chủ spike (F4).
- **`NOT SUPPORTED`:** `A15`, `A16` (F1) · `A19` (F3).
- **Chưa kiểm được ở máy này:** `A18` — hai PDF điều khoản.

| Mục `06` §9.1 | Audit | Phủ |
|---|---|---|
| Nguồn và thời điểm tải | §1 | đủ |
| Checksum gói | §1 | đủ |
| Số case theo phần phát hành | §2 | đủ |
| Nhãn: có hay không, nguồn gốc | §3 | đủ |
| Tóm tắt hình học và bất thường | §4 | **một phần** — thiếu giá trị, thiếu ghi chú header mặc định, thiếu case trùng |
| Ánh xạ nhãn tiền cảnh | §5 | đủ |
| Đường split đã chọn và ID manifest | §6 | **không có** — hoãn ở dòng 127–128 |
| Loại trừ và file hỏng | §7 | **một phần** — thiếu case trùng |

---

## 6 · Những gì QA xác nhận ĐÚNG

- **Danh tính archive:** cùng SHA-256 và kích thước với bản đã ghi.
- **Manifest không sửa tay:** tái chạy scanner → 0 khác biệt (144 s, không để lại file tạm); giữa các revision của
  PR #25 chỉ phần kết quả đổi; file Spike D ở `fdaf920` (bản được duyệt) giống hệt `a92892c`.
- **Header không chứa định danh:** mỗi file chỉ có 8 trường chuẩn và 2 comment chuẩn.
- **Các sửa của QA-001 vẫn giữ:** `A9` FAIL khi origin lệch; `A17` `NOT_RUN` khi header không đọc được; `A14` FAIL
  khi hướng xiên; `A4` FAIL với file 0 byte, cắt dở, 2D; `--selftest` đạt; không thể ghi ra ngoài thư mục tạm.
- `--root` và `--archive` cho **cùng trạng thái** ở cả 30 kịch bản chạy hai chế độ.

---

## 7 · Dữ liệu QA đã dùng, và giới hạn

- File ZIP của chủ spike (ổ `D:` máy Khánh) **không có** ở máy này. QA dùng bản
  `C:\cardiac-data\lasc2018\2018_UTAH_MICCAI.zip` — bản leader tải trong INC-001 — **cùng kích thước
  2 200 962 438 byte, cùng SHA-256 `bee5ee5b…`**; chỉ đọc, không ghi gì ngoài scratchpad.
- Phép sàng lọc trùng lặp của QA so **cả mask** trên 154 case, **kể cả 54 case holdout** — chỉ để kiểm tính toàn
  vẹn dữ liệu và rò rỉ. Kết quả **không** được dùng cho bất kỳ quyết định mô hình, ngưỡng, hậu xử lý hay chọn
  checkpoint nào (`06` §6).
- **Chưa kiểm được:** file của chính chủ spike *(không chặn — nếu cần chuỗi giữ bằng chứng từ file của Khánh:
  Khánh chạy `Get-FileHash` và lệnh tái tạo, rồi so manifest, bỏ qua `generated_at` và `package_root`)* · hai PDF
  điều khoản CAP (cần cho F5) · độ phân giải vật lý công bố (Khánh ghi theo `06` §4) · liên kết bệnh nhân (gói
  không có định danh).

---

## 8 · Đường tới PASS

1. **Bắt buộc:** sửa F1–F4 trong artifact · ghi phán quyết F5 · sửa F12 và F13.
2. **Theo dõi:** F6–F11, F14–F15 — dùng các kịch bản phá của QA làm test hồi quy, xong **trước** khi validator trở
   thành cổng ingestion hoặc geometry.
3. Sau khi sửa: reviewer duyệt lại → QA soi lại phần đã sửa → Project Control.

---

## 9 · Leader cần quyết

| # | Câu hỏi | Phương án | Project Control đề xuất |
|---|---|---|---|
| **Q1** | Cặp `CASE_0056` / `CASE_0097` trong split (`GATE-SPLIT-01`) | **(a)** coi là **một nhóm**, ghim vào train — giữ nguyên 80/20 case và seed 2024; validation còn 20 case khác nhau; manifest ghi rõ train có 79 lần chụp khác nhau · **(b)** **loại một bản** — còn 99 case, lệch con số 80/20 của `06` §6 → cần Decision Request | **(a)** — chặn được rò rỉ mà không đổi con số đã đóng băng; ghi minh bạch trong manifest, audit và báo cáo |
| **Q2** | F3 — mục "split và ID manifest" của `06` §9.1 | hoãn sang `GATE-SPLIT-01` có ghi (training vẫn `BLOCKED`) · hoặc sinh lại audit sau khi manifest split merge | **hoãn có ghi** — tránh phụ thuộc vòng: split cần audit, audit lại cần split |
| **Q3** | F5 — manifest trong repo public | giữ như siêu dữ liệu · hoặc hạn chế | **bỏ đường dẫn tuyệt đối ngay**; phán phần còn lại sau khi Khánh trích điều khoản CAP liên quan |

**Leader đã quyết, 15/09 12:29:** **Q1 = (a)** → ghi thành [`DR-002a`](../readiness/OPEN_DECISIONS.md) · **Q3 như đề xuất** —
bỏ đường dẫn tuyệt đối khỏi manifest ngay, phần còn lại chờ Khánh trích điều khoản CAP.

**Leader đã quyết, 16/09: `Q2` = hoãn có ghi.** Bảng `A19` ghi mục *"split và ID manifest"* của `06` §9.1 là **hoãn sang
`GATE-SPLIT-01`**, kèm câu nói rõ **training vẫn `BLOCKED`** tới khi gate đó đóng. Lý do: tránh phụ thuộc vòng — audit cần
ID manifest split, mà split lại cần audit đã qua nghiệm thu; và `GATE-SPLIT-01` đang có blocker riêng (nối bệnh nhân), nên
**không ai được đọc chỗ hoãn này thành "split đã ổn"**. Khánh viết đúng câu đó vào `A19` trong PR #34.

**Phần còn lại của F5 vẫn mở.** Khánh đã trích CAP §§6–7 trong `POLICY_EVIDENCE.md` (PR #34) và kết luận: hai PDF chính sách
**không** đủ để khẳng định bản phát hành LASC 2018 cho phép công khai siêu dữ liệu từng case — cần điều khoản của chính bản
phát hành/DDA.

**Leader đã quyết `F5`, 16/09: thu hẹp.** Giữ phương án hẹp hơn cho tới khi đọc được điều khoản của chính bản phát
hành/DDA — khi chưa rõ thì thu hẹp còn sửa lại được, phát tán rồi thì không.

| Giữ trong repo public | Chuyển sang kênh hạn chế *(ngoài repo, có hash công khai)* |
|---|---|
| Mã case — vốn đã công khai trong bản phát hành · số lượng case, shape, dtype, thống kê tổng hợp · verdict `A1`–`A20` và lệnh tái lập | Bảng **SHA-256 từng file dữ liệu** · **điểm tương quan từng cặp case** của sàng lọc liên kết (#35 đang giữ ngoài repo) |

Tái lập **không mất**: manifest hạn chế nằm ngoài repo, nhưng **hash của nó và lệnh sinh lại từ bản ZIP đều công khai** —
người review có ZIP tự dựng lại rồi so hash.

**Cách làm — Khánh, trong #34 hoặc một PR ngay sau đó, nhưng phải xong trước lượt QA soi lại:**

1. Manifest public giữ **mã case · shape/dtype · thống kê tổng hợp · verdict `A1`–`A20`**.
2. **Bảng SHA-256 từng file** và **điểm sàng lọc từng cặp** chuyển sang **manifest hạn chế nằm ngoài repo**.
3. Manifest public ghi **hash của manifest hạn chế** và **lệnh sinh lại nó từ bản ZIP** — đó là thứ giữ tính tái lập.
4. ⚠ `tools/dataset_split/split.py` đang đọc `dataset_manifest.json`: nếu nó dùng checksum từng case để từ chối nguồn
   chưa sẵn sàng thì phải đổi sang đọc manifest hạn chế khi có, hoặc đối chiếu bằng hash tổng — ghi rõ cách chọn trong PR.
5. Nếu làm trong #34 mà lỡ mốc **12:00** thì tách thành PR riêng; PR đó **phải merge trước khi Spike D được QA soi lại**,
   vì `F5` là phát hiện chặn nghiệm thu.

### 9.1 · `DR-002b` × `F5` — leader phán 17/09

Hai quyết định cùng ngày 16/09 va nhau đúng một chỗ. `DR-002b` **(c)+(d)** buộc công bố **danh sách case bị loại
kèm điểm tương quan** — đó là căn cứ của một quyết định khoa học. `F5` **thu hẹp** lại đẩy **điểm từng cặp** sang
manifest hạn chế. Nên #35 in `RESTRICTED_BY_F5` ở đúng cột điểm, và Trung không duyệt tiếp được.

**Phán quyết: điểm từng cặp nằm ở manifest hạn chế** — nhất quán với `F5`, vì khi chưa đọc được điều khoản của
chính bản phát hành thì thu hẹp còn sửa lại được, phát tán rồi thì không.

**Đổi lại, manifest public phải mang đủ phần còn lại để _audit được quyết định mà không cần điểm_:**

| Trường bắt buộc trong manifest public | Vì sao |
|---|---|
| **Ngưỡng `r ≥ 0.75` khai thành một trường**, không phải một câu trong tài liệu | `DR-002b` (c) đòi ngưỡng **khai trước mọi lượt train**; ở trong manifest thì lịch sử commit chứng minh được điều đó, ở trong văn xuôi thì không |
| **Mã của mọi case bị loại** và **mã của mọi nhóm** *(4 nhóm; `CASE_0133` kéo theo `CASE_0117`)* | người đọc kiểm được luật áp **đồng đều**, không có ngoại lệ lặng lẽ |
| **Số đếm**: tập con **20 / 38 / 78**, **train hiệu dụng 78** | khớp chéo với danh sách loại — sai lệch một case là lộ ra ngay |
| **Hash manifest hạn chế** + **lệnh sinh lại** nó từ bản ZIP | người có ZIP dựng lại **từng điểm số** rồi so hash ⇒ tính tái lập không mất |

**Cách đọc:** người review có ZIP thì kiểm được **mọi con số**; người không có ZIP vẫn kiểm được hai điều quan
trọng nhất — luật đã **khai trước** khi train, và đã áp **đồng đều**. Điều `F5` bảo vệ là *giá trị từng file*,
không phải *quy tắc*; quy tắc thì phải công khai, nếu không thì `DR-002b` (d) — công bố giới hạn — thành rỗng.

**Việc của Khánh:** thêm bốn nhóm trường trên vào split manifest public trong #35. **Việc của Trung:** ba phép
kiểm khi duyệt lại — ngưỡng khai trước *(kiểm bằng lịch sử commit, không bằng lời trong file)*, luật áp đồng đều,
số đếm khớp danh sách loại — và **không giữ PR chỉ vì cột điểm in `RESTRICTED_BY_F5`**.

---

## 10 · Tái lập

Script của QA được giữ trong [`qa002/`](qa002/) (xem `README.md` ở đó). Chúng chỉ đọc bộ dữ liệu cục bộ và in
chẩn đoán; output của chúng **không** được commit vì có giá trị dẫn xuất theo từng case.

**Liên quan:** PR #25 · PR #28 · [`../day03/QA_REVIEW_001.md`](../day03/QA_REVIEW_001.md) ·
[`../spikes/SPIKE_D_DATASET/TASK.md`](../spikes/SPIKE_D_DATASET/TASK.md) ·
[`../spikes/SPIKE_D_DATASET/RESULT.md`](../spikes/SPIKE_D_DATASET/RESULT.md) · [`../DATASET_AUDIT.md`](../DATASET_AUDIT.md) ·
`06` §4, §6, §9.1 · `12` §2–§3 · `13` §12
