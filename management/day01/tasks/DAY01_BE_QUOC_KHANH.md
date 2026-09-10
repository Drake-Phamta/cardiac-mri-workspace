# DAY 01 — BẾ QUỐC KHÁNH

**Spike D — P0. Bạn nằm trên critical path của cả dự án:**

```
SPIKE_D  →  điều kiện C1 / C6  →  SPIKE_C1  →  GATE-ML-01
```

> **`PHASE A` · `READY: NO` · chưa cutover.** Spike D **chưa** `ACTIVE`, `started_at` = `null`,
> **đồng hồ DR-001 chưa chạy**.

---

## PHẦN I — NỢ DAY 0

### NOW: PR #4 của bạn đang chờ review của Nguyễn Gia Đức Trung

File practice của bạn đã đầy đủ **7 field** và diff nằm đúng trong `management/onboarding/practice/`.
Không có gì phải sửa trước — **bạn đang chờ người khác**, không phải bị thiếu việc.

> **Nếu Trung approve thẳng, đó là kết quả hợp lệ.** Luật đã đổi: reviewer chỉ `NEEDS_FIX` khi có **lỗi
> thật**; PR đúng thì approve, và đó là một lượt drill **hoàn chỉnh**. Đừng ai cấy lỗi vào để "cho đủ thủ
> tục". Toàn văn: [`../../onboarding/DAY0_SIGNOFF.md`](../../onboarding/DAY0_SIGNOFF.md) §0.

### Việc của bạn với tư cách reviewer

Bạn là reviewer chéo của **Nguyễn Gia Đức Trung**. Khi bạn ấy mở PR:

```powershell
gh pr diff <n> --name-only    # kiểm biên trước
gh pr view <n>
```

Đủ 7 field, nội dung hợp lý, diff đúng biên → **`gh pr review <n> --approve`**.
Có lỗi thật → `--request-changes` nêu đúng lỗi đó. **Không cấy lỗi. Không push vào nhánh bạn ấy.**

Sau khi PR #4 được approve, merge:

```powershell
gh pr merge 4 --squash --delete-branch
```

---

## PHẦN II — CHUẨN BỊ TRƯỚC CUTOVER

**Nhánh:** `spike/SPIKE_D`

### Được làm

Đọc kỹ [`../../spikes/SPIKE_D_DATASET/TASK.md`](../../spikes/SPIKE_D_DATASET/TASK.md) — đặc biệt
**§Day-one ordering** và 20 acceptance criteria · cài Python và tooling · **cài thư viện đọc NRRD** ·
kiểm dung lượng đĩa trống · học khái niệm format NRRD · dựng khung script inventory.

Dán nhãn mọi thứ ghi lại ở giai đoạn này:

```
PREP / DIAGNOSTIC ONLY — NOT ACCEPTANCE EVIDENCE
```

### 🔴 Trước cutover TUYỆT ĐỐI KHÔNG

> **KHÔNG tải / thu thập gói dataset chính thức như công việc Spike D.**
>
> Lý do không phải vì tải là xấu, mà vì **đồng hồ trigger DR-001 phải bắt đầu tại cutover**. Nếu bạn tải
> trước, ngày execution đầu tiên trở nên mơ hồ và trigger mất ý nghĩa — nó được đánh giá vào **cuối ngày
> execution**, nên "ngày đó bắt đầu lúc nào" phải rõ.

Cũng không: ghi `started_at` · nói Spike D đang `ACTIVE` · tạo `RESULT.md` · tạo `DATASET_AUDIT.md` ·
bắt đầu C0 hay C1.

> ⚠ **Chỗ dễ trượt của bạn.** Muốn "chạy thử" thư viện NRRD thì cần một file NRRD, và nước đi tự nhiên
> nhất là lấy một case thật từ dataset — **đó đúng là ranh giới**. Cách đúng: **tự sinh một NRRD nhỏ tổng
> hợp**, hoặc dùng sample ngoài dự án. File prep đó **không bao giờ** được dùng làm bằng chứng
> acquisition.

---

## PHẦN III — SAU CUTOVER · §Day-one ordering, bước 1–5

Hôm nay **chỉ** 5 bước này. A1–A20 đầy đủ tiếp tục các ngày sau. Thứ tự này bắt buộc để trigger DR-001
đánh giá được đúng hạn.

| Bước | Việc | Sinh ra |
|---:|---|---|
| **1** | Tải gói từ **nguồn chính thức đã ghi trong tài liệu**; ghi timestamp, tên file, kích thước, checksum khi khả thi | acquisition record |
| **2** | Giải nén; lập **raw file inventory** và **case count** | inventory |
| **3** | **Đọc provenance vòng đầu: phân vùng test có chứa file nhãn hay không?** | trả lời sơ bộ **A12** |
| **4** | Mở **2–3 volume**: xác nhận NRRD load được, là 3D, và đọc spacing / origin / **direction** | trả lời sơ bộ **A14** |
| **5** | **Đánh giá trigger DR-001 và báo leader — trước cuối ngày** | trigger verdict |

### Trigger DR-001 — nguyên văn

> Nếu tới **cuối ngày execution đầu tiên**, **không có gói chính thức dùng được trên máy cục bộ**,
> **hoặc** validation gói/provenance lộ **một defect chặn việc nghiệm thu `GATE-DATA-01`** — thì
> **`RA-H01` leo lên BLOCKER** và **quy trình dự phòng dataset mở ra**.

**Ra kết quả nào cũng được — trigger nổ mà được ghi lại là một ngày thành công. Không đánh giá mới là
hỏng.** Và **không âm thầm thay dataset khác**: thay dataset cần đủ chuỗi `00` §13 (Decision Request →
phân tích ảnh hưởng → duyệt → cập nhật spec).

---

## Acceptance hôm nay

**Không phải "đã audit xong dataset".** Hôm nay đạt khi: bước 1–5 hoàn thành, và **trigger DR-001 được
đánh giá và báo cáo**.

Các tiêu chí A1–A20 liên quan tới hôm nay: **A1** (ngày tải, URL nguồn, tên gói, checksum) · **A2** (case
count theo phân vùng) · **A12** (test label có hay không, **kèm bằng chứng cấp file**) · **A14** (verdict
axis-alignment, tương thích biên DR-012). Các tiêu chí còn lại: ngày sau.

## Evidence phải commit

Acquisition record · inventory và case count · trả lời sơ bộ A12 kèm bằng chứng cấp file · trả lời sơ bộ
A14 · verdict trigger DR-001.

**Không commit dataset bytes.** `.gitignore` đã chặn `data/**`, `*.nrrd`, `*.nii`, `*.dcm` — nhưng đừng
tìm cách lách. Chỉ **manifest** được track (nó là artifact nghiệm thu `GATE-DATA-01`), **volume thì không**.
Trường không xác định được ghi **`NOT MEASURED — <lý do>`**.

## Reviewer

**Vũ Hùng Anh** — hàng đợi vị trí **1**. Spike D là **P0** nên được ưu tiên trước Spike A khi cả hai cùng
sẵn sàng.

## Spike D KHÔNG được

| Không được | Vì sao |
|---|---|
| **Slice-level split** — dù chỉ để thử | **Patient-level split là INVARIANT.** Slice-level rò rỉ dữ liệu giữa train và test, làm hỏng toàn bộ tính hợp lệ khoa học của RQ-A |
| **Chọn Path A hay Path B** | Đó là **DR-002**, quyết sau bằng chứng. Spike này **nêu bằng chứng** (A13), không chọn |
| Âm thầm thay dataset khác | Cần đủ chuỗi `00` §13 |
| Bắt đầu **Spike C1** | Còn `BLOCKED_BY_SPIKE_D` |
| Bắt đầu **Spike C0** như primary thứ hai | Giữ `PREPARED`; chỉ việc chuẩn bị **nhỏ** trong lúc chờ I/O |
| **Đóng băng DINOv2 recipe** hay chạy training sớm | `GATE-ML-01` chỉ đóng sau **Spike C1**; C0 không đủ |
| Chuyển Spike D sang `ACTIVE` | Chỉ Project Control làm, sau cutover |
| Tạo `RESULT.md` / `DATASET_AUDIT.md` khi chưa có dữ liệu thật | `RESULT.md` ≠ `ACCEPTED` |
| Suy đoán mapping nhãn | **A10** đòi ghi lại giá trị thật, không giả định |

## Chuyển bước khi

Bước 1–5 xong **và** verdict trigger DR-001 đã tới tay leader.

---

**Liên quan:** [`../DAY01_RUNBOOK.md`](../DAY01_RUNBOOK.md) · [`../DAY01_STATUS.md`](../DAY01_STATUS.md) ·
[`../../spikes/SPIKE_D_DATASET/TASK.md`](../../spikes/SPIKE_D_DATASET/TASK.md) ·
[`../../spikes/SPIKE_D_DATASET/EVIDENCE_TEMPLATE.md`](../../spikes/SPIKE_D_DATASET/EVIDENCE_TEMPLATE.md) ·
[`../../onboarding/member_briefs/BE_QUOC_KHANH.md`](../../onboarding/member_briefs/BE_QUOC_KHANH.md)
