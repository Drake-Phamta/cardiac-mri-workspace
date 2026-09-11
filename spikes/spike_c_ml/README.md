# SPIKE_C0 — ML compute probe

> ### Dụng cụ dựng cho bạn, không phải làm thay
>
> **Chủ sở hữu Spike C là Bế Quốc Khánh.** `SPIKE_C_ML/TASK.md` cho phép nguyên văn:
>
> > *"Claude **may**: build the harness, write the extrapolation script, propose candidate variants
> > and decoders, structure the result template, and analyse measurements the owner supplies."*
>
> Và giữ phép đo lại cho bạn:
>
> > *"**All hardware and timing measurements are executed by Bế Quốc Khánh on the real compute.**"*
>
> Nên `--operator` là **bắt buộc** và được ghi vào mọi output. Dựng đêm 2026-09-11 —
> [`INC-001`](../../management/incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md).

---

## ⚠ WIP — C0 không được thành primary task thứ hai

`TASK.md` nói rõ:

> *"**Spike D is this owner's ACTIVE primary task.** Spike C0 occupies the "one very small preparation
> activity" slot of `15` §7. **Spike C0 may use otherwise-idle waiting time during the dataset
> download. It MUST NOT become a second primary task competing with Spike D.**"*

Gói dataset **đã tải xong** tối 2026-09-11, nên thời gian chờ đó **không còn nữa**. Ưu tiên là
**Spike D**. C0 là việc lấp chỗ, và chạy probe mất vài phút chứ không mất ngày.

---

## Chạy

```bash
pip install -r spikes/spike_c_ml/requirements.txt
# torch phải cài đúng build cho phần cứng CỦA BẠN — https://pytorch.org/get-started/locally/

python spikes/spike_c_ml/harness/probe.py --operator "Bế Quốc Khánh" --img 560 --find-batch
python spikes/spike_c_ml/harness/extrapolate.py spikes/spike_c_ml/EVIDENCE_RAW/c0_probe_*.json
```

**Kích thước ảnh phải chia hết cho cả 16 và 14** — UNet pool 4 lần, ViT chia ô 14×14. Dùng sai thì
script báo rõ và gợi ý kích thước gần nhất chứ không fail mờ ám. Kích thước dùng được: **112, 224,
336, 448, 560, 672**.

`560` là lựa chọn hợp lý nhất hiện nay: slice thật đo được tối qua là **576×576** (và có case
640×640), nên 560 là kích thước hợp lệ gần nhất.

---

## Tiêu chí nào được trả lời, và bằng cái gì

| # | Tiêu chí | Ai / cái gì trả lời |
|---|---|---|
| `C0-1` | Khai báo compute thật | **probe đọc từ máy bạn** — GPU, VRAM, CUDA, hoặc *"chỉ có CPU"* |
| `C0-2` | Peak memory hai họ mô hình | probe |
| `C0-3` | Batch lớn nhất vừa được | probe, cờ `--find-batch` |
| `C0-4` | Throughput | probe |
| `C0-5` | **Effective output stride** | probe |
| `C0-6` | Chi phí đo được từng variant | probe |
| `C0-7` `C0-8` | Ngoại suy wall-clock + phán quyết lịch | `extrapolate.py`, **hiện rõ từng phép tính** |
| `C0-9` | Chính sách chuẩn hoá DR-011 | [`dr011_normalization.json`](dr011_normalization.json) |
| `C0-10` | Tuyên bố C0 **không** đóng `GATE-ML-01` | in ra mỗi lần chạy, ghi vào mỗi file output |

> **"Chỉ có CPU" là câu trả lời `C0-1` hợp lệ và quan trọng**, không phải thất bại. `TASK.md` viết:
> *"GPU model + VRAM, **or** is it CPU/Colab-class only?"* Nếu máy bạn không có GPU thì đó là dữ kiện
> mà cả kế hoạch 30 ngày phải biết — biết sớm tốt hơn biết muộn.

---

## Bốn ứng viên, và vì sao là bốn

| Variant | Output stride | Ý nghĩa |
|---|---:|---|
| `unet_base32_depth4` | **1** | UNet đầy đủ, skip connection khôi phục độ phân giải |
| `unet_base16_depth4` | **1** | UNet nhẹ hơn, để thấy chi phí giảm bao nhiêu khi thu nhỏ |
| `vit_s14_linear_decoder` | **14** | Một logit mỗi ô 14×14. Upsample sau đó **không thêm thông tin nào** |
| `vit_s14_progressive_decoder` | **1,75** | Ba lần upsample học được (×8); 14 = 2×7 nên không stack luỹ thừa 2 nào rơi đúng kích thước ảnh, phần dư phải nội suy |

**`C0-5` là câu hỏi thú vị nhất của C0:** *effective output stride do DECODER quyết định, không phải
encoder.* Cùng một ViT-S/14, đổi decoder thì stride đi từ **14** xuống **1,75**.

Stride 14 có chấp nhận được hay không **phụ thuộc độ dày biên khoang nhĩ trái tính theo voxel** — đó
là tiêu chí `C1-5` và **cần giải phẫu thật**. C0 không trả lời được, và không giả vờ trả lời.

### ViT ở đây KHÔNG phải DINOv2 thật

Nó là **bản thế chỗ tương đương về hình dạng và chi phí tính toán** cho DINOv2 ViT-S/14: cùng patch
size, cùng chiều embedding, cùng số tầng, cùng số head. Peak memory và thời gian mỗi bước phụ thuộc
**hình dạng tensor và số tầng**, không phụ thuộc **giá trị trong trọng số** — nên với câu hỏi của C0,
nó trả lời đúng. Với câu hỏi của **C1** (hội tụ, chất lượng) thì nó **hoàn toàn vô dụng**, và đó chính
là lý do hai giai đoạn tách nhau.

Mọi file output đều ghi câu này.

---

## Smoke test đã chạy — và vì sao nó không nằm trong `EVIDENCE_RAW/`

Đêm 2026-09-11 toàn bộ chuỗi được chạy thử ở `112×112`, batch 1, trên một RTX 3050 Ti Laptop 4 GB.
Cả bốn variant chạy được, `extrapolate.py` in ra bảng lịch đầy đủ.

**Kết quả đó đã bị xoá.** `C0-1` hỏi *dự án này có compute gì*, mà một lần chạy trên máy người khác
trả lời về máy người khác. Giữ lại chỉ mời người ta đọc nhầm.

Hai lỗi thật do smoke test phát hiện và đã sửa trước khi commit:

1. UNet **fail** ở `--img 140` vì 140 không chia hết cho 16 → thêm kiểm tra kích thước đầu vào, báo rõ
   và gợi ý kích thước gần nhất.
2. Decoder progressive ra `80×80` khi đầu vào `140×140` → 14 = 2×7 nên không stack luỹ thừa 2 nào rơi
   đúng; giờ nội suy phần dư và **stride báo là 1,75 chứ không phải 1**.

---

## Ngoại suy lịch — hiện rõ mọi giả định

`extrapolate.py` in **mọi** con số trung gian vì `C0-7` đòi *"method shown"* và `C0-8` đòi *"arithmetic
shown"*. Nó tách rõ hai nhóm:

- **ĐO ĐƯỢC** — thời gian mỗi bước, từ probe trên phần cứng thật
- **GIẢ ĐỊNH** — số epoch, hệ số overhead, số case train, số giờ compute mỗi ngày

Số epoch **không đo được trên dữ liệu tổng hợp** — hội tụ là `C1-6`. Một ước lượng mà giả định của nó
vô hình thì chỉ là phỏng đoán đeo con số.

**Script từ chối chạy nếu không có file probe.** `TASK.md` cấm đích danh việc bịa *"any calendar figure
derived from unmeasured timings"*.

---

## Việc của bạn

1. **Spike D trước.** C0 là việc lấp chỗ, không phải primary task thứ hai.
2. Chạy probe với `--operator "Bế Quốc Khánh"` `--img 560` `--find-batch`, commit output dưới tài khoản
   của bạn → đóng `C0-1` tới `C0-6`.
3. Chạy `extrapolate.py`, chỉnh giả định cho khớp thực tế → `C0-7` `C0-8`.
4. Đọc và **phản biện** [`dr011_normalization.json`](dr011_normalization.json) — ngưỡng percentile
   0,5/99,5 là **lựa chọn cấu hình**, không phải phép đo. Ghi ra để bạn có thể không đồng ý với một con
   số cụ thể chứ không phải với một cảm giác.
5. **`C1` vẫn `BLOCKED_BY_SPIKE_D`.** Không làm gì cho C1 khi Spike D chưa `ACCEPTED`.

**Liên quan:** [`../../management/spikes/SPIKE_C_ML/TASK.md`](../../management/spikes/SPIKE_C_ML/TASK.md) ·
[`../../management/spikes/SPIKE_C_ML/EVIDENCE_TEMPLATE.md`](../../management/spikes/SPIKE_C_ML/EVIDENCE_TEMPLATE.md) ·
`docs/specs/v1.0/07_ML_AND_IMAGE_PROCESSING_SPEC.md`
