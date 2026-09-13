# DAY 4 — Bế Quốc Khánh · 2026-09-13

> ## Trước tiên: việc còn nợ từ Day 3 — và nó **vẫn là của bạn**
>
> Day 3 đã đóng với kết quả **TRƯỢT**. Điều kiện số 1 của ngày là audit Spike D, và nó không đạt.
> Đây là **ngày thứ năm** critical path của dự án không nhích một bước.
>
> | Nợ | Từ | Ai đóng được |
> |---|---|---|
> | Audit `A1`–`A20` → `dataset_manifest.json` + `DATASET_AUDIT.md` trên `main` | Day 2 | **chỉ bạn** |
> | Verdict `A11` `A13` `A18` · mapping `A10` · provenance `A12` | Day 2 | **chỉ bạn** |
> | Xác nhận **đĩa trống + thư viện NRRD trên máy bạn** | Day 0 | **chỉ bạn** |
> | Khai báo compute ML (`C0-1`) — `ml_compute.declared` vẫn `UNVERIFIED` | Day 0 | **chỉ bạn** |
> | Cột `B` sign-off — review một PR thật của đồng đội | Day 0 | **chỉ bạn** |
>
> Đêm 2026-09-11 Project Control có làm thay một số việc, dưới ngoại lệ `INC-001`. Ngoại lệ đó
> **đã hết hiệu lực lúc 00:00 ngày 2026-09-12** và không tự gia hạn. `INC-001` §5 ghi nguyên văn:
> **“làm thay không xoá nghĩa vụ.”** Năm dòng trên không có dòng nào được chuyển sang người khác,
> và không có dòng nào Project Control đóng hộ được mà không bịa.
>
> Điều đã thay đổi: **mọi lý do bên ngoài đều đã bị gỡ.** Gói dữ liệu nằm trên đĩa. Dụng cụ đã dựng,
> đã bị soi đối kháng, và tối qua đã sửa **4 lỗi sẽ chặn bạn ngay lệnh đầu tiên**. Việc còn lại của
> bạn là **chạy và ký**.

---

## Tối qua đã sửa 4 lỗi trong dụng cụ — trước khi bạn gõ lệnh đầu tiên

`3bf2a80`, nhánh `tools/spike-d-validation` (PR #14):

| # | Lỗi | Nếu không sửa thì bạn gặp gì |
|---|---|---|
| 1 | README dạy `--root "C:/cardiac-data/lasc2018/2018_UTAH_MICCAI"` — **thư mục không tồn tại** (3 chỗ) | copy-paste lệnh đầu → `exit 2` |
| 2 | `json.load` đọc `acquisition.json` bằng `utf-8` thuần | **UTF-8 BOM** → `Unexpected UTF-8 BOM`, chết ở bước 3 |
| 3 | README trích `"license_terms_path": ".../LICENSE_TERMS.txt"` — **gói không có file licence nào** | bạn đi tìm một file không tồn tại để trả lời `A18` |
| 4 | `A17` **chỉ mở `lgemri.nrrd` và `laendo.nrrd`** | `desktop.ini` thật trong gói và `lawall.nrrd` (có ở **cả 154 case**) **vô hình** với đúng cái check có việc là phát hiện nội dung lạ |

Lỗi 4 là lỗi nặng nhất: `SPIKE_D_DATASET/TASK.md:130` đòi định danh *“trong header **hoặc
sidecar**”*, và bản đầu chưa từng mở sidecar nào.

**Đã kiểm bằng cách chạy thật trên cả 154 case**, không phải bằng selftest:

```text
15 PASS · 1 FAIL · 1 NOT_RUN · 3 OWNER_VERDICT_REQUIRED
```

---

> ### ⚠ Project Control **không** sinh artifact nào. Đó là quyết định, không phải thiếu sót.
>
> Lệnh chạy được rồi, và thêm `--write-manifest --write-audit` là xong trong hai phút. **Không làm.**
>
> `SPIKE_D_DATASET/TASK.md:196` gắn 16 tiêu chí đó **đích danh bạn**, và chính `validate.py` in ra:
> *“Commit them under the account of the person who ran this command.”*
>
> Nên trong repo hôm nay **không có** `management/DATASET_AUDIT.md`, **không có** `data/manifests/`.
> Kiểm được: `git ls-files | grep -E "DATASET_AUDIT|data/manifests"` → rỗng.

---

## PHẦN I — `NOW`

### ① Khai báo khả dụng — một dòng

Nhắn nhóm: hôm nay bạn có bao nhiêu giờ. **“Hôm nay tôi bận cả ngày” là câu trả lời hợp lệ** — nó
cho leader lập lại kế hoạch trên số thật. Thứ không hợp lệ là im lặng: `15` §11 ghi *“im lặng không
phải chấp thuận”*, và bốn ngày im lặng là thứ đã đẩy trạng thái dự án sang **🔴 RED**.

### ② Đĩa trống + thư viện NRRD **trên máy bạn** — 5 phút

> ⚠ **Con số trong packet Day 3 của bạn SAI.** Dòng 73 ghi *“khoảng 6 GB”*. Gói giải nén thật là
> **14,2 GiB** — `15 235 201 656` byte. Sai **2,4 lần**, và đó đúng là con số bạn dùng để kiểm đĩa.
> Cộng bản zip nếu bạn giữ lại: cần tính **~16,3 GiB** dư.

```powershell
Get-PSDrive C | Select-Object Used,Free
python -c "import nrrd; print(nrrd.__version__)"
```

Ô này `NOT_CHECKED` từ Day 0. Nó là **dữ kiện phần cứng trên máy bạn** — không ai quan sát hộ được.

### ③ `--selftest` trước khi chạm gói thật

```bash
git fetch origin && git switch tools/spike-d-validation
pip install -r tools/dataset_validate/requirements.txt
python tools/dataset_validate/validate.py --selftest
```

Nó dựng 5 case tổng hợp trong temp, trong đó **một volume có direction matrix oblique cố tình**, và
**phải báo `A14 FAIL`**. Nếu nó báo toàn PASS thì checker chưa từng được thử với input xấu — đừng
tin nó. Selftest **không ghi gì vào repo** và **không đo gì thật**.

---

## PHẦN II — `THEN` · phần chỉ bạn làm được

### ④ Chạy trên gói thật → sinh manifest + `DATASET_AUDIT.md`, commit dưới tài khoản bạn

```bash
# xem truoc, khong ghi gi
python tools/dataset_validate/validate.py --root "C:/cardiac-data/lasc2018/extracted"

# sinh artifact nghiem thu
python tools/dataset_validate/validate.py \
    --root "C:/cardiac-data/lasc2018/extracted" \
    --acquisition C:/cardiac-data/lasc2018/acquisition.json \
    --write-manifest --write-audit
```

Exit code: `0` không FAIL · `1` có ≥1 FAIL · `2` không chạy được.

### ⑤ `A17` **sẽ báo FAIL**, và đó là kết quả đúng

```text
Training Set/CMPXO4J23G58J53Q98SZ/desktop.ini      ← nhãn scanner: CASE_0097
```

Một `desktop.ini` do Windows sinh, lọt vào một case của `Training Set`. Đây **không phải lỗi dụng
cụ** — nó là nội dung lạ thật trong gói, và `A17` vừa mới nhìn thấy được.

**Quyết định là của bạn, và phải ghi ra:** loại trừ nó như artefact hệ điều hành *(kèm lý do)*, hay
giải trình nó trong audit. Đừng xoá file rồi chạy lại — như thế bằng chứng biến mất khỏi lịch sử.

Cùng lúc, `lawall.nrrd` ở cả 154 case giờ đã được mở header. Nó **không phải** target của `A11`.

### ⑥ Bốn verdict dụng cụ từ chối trả lời hộ

| Tiêu chí | Vì sao script không được trả lời |
|---|---|
| `A11` | `laendo.nrrd` có đúng là LA **cavity** không — **ý nghĩa** của nhãn không đọc được từ byte |
| `A13` | bằng chứng Path A vs Path B — spike cấp bằng chứng, **`DR-002` mới chọn đường** |
| `A18` | licence/terms — gói **không có file licence**, nên `A18` nghĩa là **lưu lại trang Cardiac Atlas riêng**; chỉ người tải mới biết đã đồng ý những gì |
| `A10` `A12` | mapping foreground và provenance — phán đoán của chủ sở hữu spike |

### ⑦ `A19` **chưa đạt được hôm nay dù có sinh file** — biết trước để đừng mất thời gian

`06` §9.1 đòi 8 trường. **Hai trường bị chặn:** foreground mapping chờ chính bạn (⑥), và split path
chờ **`DR-002`** chưa quyết. Sinh file ra vẫn để trống hai ô đó. Cứ sinh — nó là đầu vào cho
`DR-002` — nhưng đừng đánh dấu `A19` đạt.

---

## PHẦN III — `LATER`

### ⑧ Review PR #14 và #17 — dụng cụ dựng cho **chính bạn**

Cả hai đều do leader viết, nên **anh ấy không tự approve được** (GitHub cấm). Hàng đợi review đang
tắc **5 PR, 0 review**, và `15` §7 gọi đúng tình trạng này là *“a large queue of unreviewed ‘done’
work”*. Đây cũng là cách đóng cột `B` sign-off còn nợ từ Day 0 — một review thật, không phải tự
comment vào PR của mình.

### ⑨ Khai báo compute `C0-1` **trước khi** chạy probe

`spikes/spike_c_ml/probe.py` **bắt buộc `--operator`** và ghi vào evidence. Số đo trên card 4 GB của
leader **trả lời về máy leader**, không về máy bạn. `ml_compute.declared` là ô `UNVERIFIED` cuối
cùng còn lại trong state file.

---

## Ba dữ kiện về gói — kiểm lại, đừng tin sẵn

| Dữ kiện | Hệ quả |
|---|---|
| **Mask mang giá trị `0` và `255`**, không phải `0`/`1` | code giả định `== 1` sẽ ra mask **rỗng** và test vẫn xanh |
| **Testing Set CÓ nhãn** (54 case) | ảnh hưởng trực tiếp lựa chọn Path A/B của `DR-002` |
| 154 case · 576×576, có case 640×640 · toàn bộ axis-aligned | `A14` pass trên gói thật; oblique chỉ có trong selftest |

---

## Ràng buộc không đổi

- **Split theo bệnh nhân, seed `2024`** — bất biến, không thương lượng.
- **Không commit byte dataset.** Manifest và audit là text.
- Bằng chứng đi kèm **tên người chạy**. Đó là lý do file nào cũng có trường operator.

---

**Liên quan:** [`../../spikes/SPIKE_D_DATASET/TASK.md`](../../spikes/SPIKE_D_DATASET/TASK.md) ·
`tools/dataset_validate/README.md` *(nhánh `tools/spike-d-validation`)* ·
[`../../day03/DAY03_EOD_REVIEW.md`](../../day03/DAY03_EOD_REVIEW.md) ·
[`../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md)
