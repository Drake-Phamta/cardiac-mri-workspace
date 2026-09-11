# DAY 3 — Bế Quốc Khánh · 2026-09-12

> ## Bạn đang đứng trên critical path của cả dự án
>
> ```text
> SPIKE_D → GATE-DATA-01 → GATE-SPLIT-01 → SPIKE_C1 → training → metrics → Day 30
> ```
>
> Ba ngày qua Spike D chưa chạy. **Hôm nay không còn lý do bên ngoài nào cả:**
>
> | Thứ từng chặn bạn | Trạng thái |
> |---|---|
> | Chưa có gói dataset | ✅ **đã tải xong đêm qua**, giải nén rồi, ở `C:\cardiac-data\lasc2018\extracted` |
> | Chưa có script validate | ✅ **đã dựng xong** — PR #14, 15/20 tiêu chí cơ khí hoá |
> | Chưa biết cấu trúc gói | ✅ **Training Set 100 case · Testing Set 54 case** |
>
> Việc còn lại là **chạy, đọc số, và ký tên bạn dưới nó**.

---

## ⚠ Đọc trước: gói do leader tải, audit vẫn là của bạn

Đêm 2026-09-11 leader tải gói về như một **hành động recovery**, ghi trong
[`INC-001`](../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md).

**Thu thập chuyển giao được. Audit thì không.** `SPIKE_D_DATASET/TASK.md:196`:

> *"All of the above must be read from the actual downloaded package **by Bế Quốc Khánh**."*

Tiêu chí `A2`–`A20` **không đổi một chữ nào** và vẫn là của bạn. Cái duy nhất thay đổi: bạn không
phải chờ tải nữa.

Và điều này quan trọng cho chính bạn: `TC-TEAM-001` đòi **bốn** gói bằng chứng thành viên, mỗi gói
truy vết qua **`commits/PR` mang tên người đó**. Không ai làm hộ phần đó được.

---

## PHẦN I — `NOW`, làm trước mọi thứ khác

### ① Xác nhận hai ô phần cứng của **máy bạn** — 5 phút

Hai ô này `NOT_CHECKED` từ Day 0 và **không ai xác nhận hộ được**:

```bash
# dung luong trong
df -h .                      # hoac tren Windows: Get-PSDrive C

# thu vien doc NRRD
pip install -r tools/dataset_validate/requirements.txt
python -c "import nrrd; print('pynrrd', nrrd.__version__)"
```

Gói giải nén khoảng **6 GB**. Báo lại con số thật của máy bạn.

### ② Chạy self-test của dụng cụ trước khi tin nó — 1 phút

```bash
python tools/dataset_validate/validate.py --selftest
```

Nó dựng 5 case tổng hợp, trong đó **cố tình cài một volume oblique**, và **phải báo `A14 FAIL`**.
Nếu nó báo tất cả pass thì dụng cụ hỏng — nói ngay.

---

## PHẦN II — Audit Spike D · việc chính hôm nay

### ③ Chạy validator trên gói thật

```bash
python tools/dataset_validate/validate.py \
    --root "C:/cardiac-data/lasc2018/extracted" \
    --acquisition "C:/cardiac-data/lasc2018/acquisition.json" \
    --write-manifest --write-audit
```

Sinh ra:

```text
data/manifests/dataset_manifest.json     ← artifact nghiệm thu GATE-DATA-01 (A20)
management/DATASET_AUDIT.md              ← A19, sinh từ manifest, KHÔNG sửa tay
```

> **Đừng sửa tay `DATASET_AUDIT.md`.** Sửa tay là nó lệch khỏi manifest, mà manifest mới là artifact
> `GATE-DATA-01` nhận. Muốn đổi nội dung thì sửa script rồi sinh lại.

Có thể mất vài phút — nó tính SHA-256 cho mọi file. Muốn nhanh thì `--no-checksums`, nhưng `A1` sẽ
báo thiếu checksum.

### ④ Trả lời bốn tiêu chí mà script **từ chối trả lời hộ bạn**

Script cố ý không trả lời bốn cái này, và in ra `OWNER_VERDICT_REQUIRED`:

| # | Câu hỏi | Vì sao máy không trả lời được |
|---|---|---|
| **`A11`** | `laendo.nrrd` có đúng là target **khoang** nhĩ trái của gói này không? | Ý nghĩa của một annotation không đọc được từ byte |
| **`A12`** | Nhãn test có provenance thế nào? | Có file là quan sát; **provenance** là phán đoán |
| **`A13`** | Bằng chứng Path A vs Path B | Spike này **cấp bằng chứng**; `DR-002` chọn đường |
| **`A18`** | Điều khoản license đã lưu chưa? | Chỉ người tải biết |

Mỗi câu cần **một đoạn viết tay, dẫn file và giá trị cụ thể**.

---

## ⚠ Năm thứ leader đã thấy khi probe 4/154 case — **kiểm lại trên toàn cohort**

Đây là quan sát trên **4 case**, không phải câu trả lời tiêu chí. Chúng là **manh mối**, và mỗi cái
đều có thể làm hỏng việc nếu bạn không kiểm:

| # | Quan sát | Liên quan | Vì sao phải cẩn thận |
|---|---|---|---|
| 1 | **Kích thước trong mặt phẳng KHÁC NHAU** — thấy cả `576×576×88` và `640×640×88` | `A6` | Nếu đúng trên toàn cohort thì mọi pipeline phải xử lý shape thay đổi. Đây cũng là con số Spike A đang chờ |
| 2 | **Testing Set CÓ `laendo.nrrd`** | `A12` `RA-H02` | Ảnh hưởng thẳng tới `DR-002`: nếu nhãn test là chính thức thì Path A khả thi; nếu không rõ provenance thì không |
| 3 | **Giá trị mask là `0` và `255`**, KHÔNG phải `0`/`1` | `A10` | **Code nào giả định `== 1` sẽ ra mask rỗng và không báo lỗi gì.** Đúng lý do `06` §9 viết *"recorded rather than assumed"* |
| 4 | **`lawall.nrrd` tồn tại** trong mọi case đã mở | `06` §2 | `06` §2 cấm dùng file ngoài nhiệm vụ LA cavity làm target khi chưa xác minh provenance. **Đừng train lên nó** |
| 5 | `space directions` là **ma trận đơn vị** `1/1/1` | `A7` `A8` | Spacing thật của LGE MRI không phải 1 mm đẳng hướng. Header có thể **không mang spacing vật lý**. `06` §4: metric thể tích tuyệt đối **bị vô hiệu** cho tới khi geometry được validate. Cái này cần bạn kết luận rõ |

---

## PHẦN III — nếu còn thời gian

### ⑤ Review PR #14 — dụng cụ dựng cho chính bạn

Tôi muốn bạn review **bốn điểm**:

1. Các kiểm `06` §9 có khớp thứ bạn đọc trong spec không? Thiếu cái nào là lỗi thật.
2. Schema manifest có phải thứ bạn muốn ký tên dưới không?
3. Bốn chỗ script từ chối trả lời có đúng chỗ không — có cái thứ năm nó cũng không nên trả lời?
4. **Bạn chạy được không?** README không đủ để đi từ zero tới bảng kết quả thì đó là lỗi README.

### ⑥ Probe C0 — **chỉ khi Spike D đã xong**

```bash
pip install -r spikes/spike_c_ml/requirements.txt
python spikes/spike_c_ml/harness/probe.py --operator "Bế Quốc Khánh" --img 560 --find-batch
```

Đóng `C0-1` tới `C0-6`. Mất vài phút.

> `TASK.md`: *"Spike C0 may use otherwise-idle waiting time **during the dataset download**."*
> **Thời gian chờ đó không còn nữa** — gói đã tải xong. C0 **không được** thành primary task thứ hai
> cạnh tranh với Spike D (`15` §7).

### ⑦ Review một PR thật của đồng đội — cột `B` sign-off vẫn mở

PR #15 (Hùng Anh) hoặc #16 (Trung) hoặc #13 (leader). Cột `B` của bạn mở từ Day 0 và **chỉ đóng khi
chính bạn review**. Leader đã review thay PR #8 hôm 11/09, và bản ghi vẫn để nghĩa vụ của bạn **mở**.

---

## Acceptance hôm nay

**Không phải "audit xong hoàn hảo".** Hôm nay đạt khi:

```text
☐  hai ô phần cứng của máy bạn đã xác nhận, có số thật
☐  dataset_manifest.json + DATASET_AUDIT.md đã land trên main, do BẠN commit
☐  bốn verdict A11 A13 A18 (+ A12) đã viết tay, dẫn file và giá trị cụ thể
☐  năm quan sát ở trên đã kiểm trên toàn cohort, xác nhận hoặc bác bỏ
```

Đủ bốn dòng thì `SPIKE_D` thành `EVIDENCE_READY` và **Vũ Hùng Anh** review.

## Spike D KHÔNG được

| Việc | Vì sao |
|---|---|
| **Chọn Path A hay Path B** | Đó là **`DR-002`**. Spike này cấp bằng chứng, không chọn |
| **Split theo slice** — dù chỉ để thử | **Patient-level là INVARIANT.** Seed `2024` |
| **Suy đoán mapping nhãn** | `A10` đòi ghi **giá trị thật**. Bạn đã thấy nó là `0/255` chứ không phải `0/1` |
| **Dùng `lawall.nrrd` làm target** | `06` §2 cấm khi chưa xác minh provenance |
| **Commit dataset bytes** | `.gitignore` chặn sẵn, nhưng đừng thử. **Chỉ manifest được track** |
| **Thay dataset khác** | Cần đủ chuỗi `00` §13 |
| Sửa `DATASET_AUDIT.md` bằng tay | Nó là file **sinh ra**. Sửa script rồi sinh lại |
| Bắt đầu `SPIKE_C1` | Còn `BLOCKED_BY_SPIKE_D` cho tới khi D được `ACCEPTED` |

## Trường không xác định được

Ghi **`NOT MEASURED — <lý do>`**. Đó là trung thực và được chấp nhận. **Bịa một giá trị hợp lý thì
không.**

---

**Liên quan:** [`../../spikes/SPIKE_D_DATASET/TASK.md`](../../spikes/SPIKE_D_DATASET/TASK.md) ·
[`../../spikes/SPIKE_D_DATASET/EVIDENCE_TEMPLATE.md`](../../spikes/SPIKE_D_DATASET/EVIDENCE_TEMPLATE.md) ·
`tools/dataset_validate/README.md` · [`../../day02/DAY02_EOD_REVIEW.md`](../../day02/DAY02_EOD_REVIEW.md) §4
