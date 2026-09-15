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

python spikes/spike_c_ml/harness/probe.py --selftest              # kiểm logic tìm batch, không cần GPU
python spikes/spike_c_ml/harness/probe.py --operator "Bế Quốc Khánh" --img 560 --find-batch
python spikes/spike_c_ml/harness/probe.py --operator "Bế Quốc Khánh" --img 560 --find-batch --precision bf16
python spikes/spike_c_ml/harness/extrapolate.py spikes/spike_c_ml/EVIDENCE_RAW/c0_probe_*.json --gpu-hours-per-day 8
```

Lần chạy đầu **tải checkpoint DINOv2** về cache Hugging Face: `facebook/dinov2-small` ~85 MB và
`facebook/dinov2-base` ~330 MB. Các lần sau chạy được với `HF_HUB_OFFLINE=1`. Muốn chạy ít biến thể hơn:
`--variants dinov2_s14_full_progressive,unet_base32_depth4` (xem đủ danh sách: `--list-variants`).

**Kích thước ảnh phải chia hết cho cả 16 và 14** — UNet pool 4 lần, DINOv2 chia ô 14×14. Dùng sai thì
script báo rõ và gợi ý kích thước gần nhất. Kích thước dùng được: **112, 224, 336, 448, 560, 672**.

**Đầu vào khớp cohort thật (Spike D `A6`, PR #25):** `uint8`, 69 case **576×576×88** và 85 case
**640×640×88**. Không kích thước nào chia hết cho 14, nên probe **resize** cả hai về `--img` (mặc định
560): MRI bilinear có antialias, mask nearest. Đây là **lựa chọn cấu hình**, được ghi vào mọi output
(`input.resize_policy`). Phương án khác là pad lên bội số của 14 — C1 quyết định.

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

## Mười ứng viên — DINOv2 thật, không còn bản thế chỗ

Hai UNet, cộng **2 checkpoint × 2 chế độ backbone × 2 decoder** của DINOv2:

| Thành phần | Lựa chọn | Ghi chú |
|---|---|---|
| UNet | `unet_base32_depth4`, `unet_base16_depth4` | train từ đầu, stride **1** |
| Checkpoint DINOv2 | **ViT-S/14** `facebook/dinov2-small` (~22 M) · **ViT-B/14** `facebook/dinov2-base` (~86 M) | tải qua `transformers.Dinov2Model`; mỗi lượt thử ghi **repo, commit đã resolve, SHA-256 file trọng số** |
| Chế độ backbone | `full` (fine-tune toàn bộ) · `frozen` (backbone chạy `no_grad`, chỉ decoder học) | `07` §2 bắt ADR-ML-001 ghi chế độ fine-tune; đây là thứ đổi peak memory nhiều nhất |
| Decoder | `linear` — stride **14** · `progressive` — stride **1,75** | xem dưới |

Tên biến thể: `dinov2_<s14|b14>_<full|frozen>_<linear|progressive>`. Đề xuất ứng viên là việc
`TASK.md` cho phép Claude làm; **chọn** biến thể là việc của `GATE-ML-01`.

**Đầu vào của DINOv2:** kênh MRI duy nhất (đã chuẩn hoá DR-011 về [0, 1]) được nhân lên 3 kênh rồi trừ
`image_mean`/chia `image_std` **đọc từ `preprocessor_config.json` của chính checkpoint** — đó là hằng số
cố định của mô hình pretrained mà DR-011 cho phép, không phải thống kê của cohort
([`dr011_normalization.json`](dr011_normalization.json) → `backbone_constants`).

**`C0-5` là câu hỏi thú vị nhất của C0:** *effective output stride do DECODER quyết định, không phải
encoder.* Cùng một DINOv2 /14, đổi decoder thì stride đi từ **14** (một logit mỗi ô 14×14, upsample sau
đó không thêm thông tin) xuống **1,75** (ba lần upsample học được ×8; 14 = 2×7 nên phần dư phải nội suy).

Stride 14 có chấp nhận được hay không **phụ thuộc độ dày biên khoang nhĩ trái tính theo voxel** — đó
là tiêu chí `C1-5` và **cần giải phẫu thật**. C0 không trả lời được, và không giả vờ trả lời.

---

## ❌ Bản thứ hai có 5 lỗi chặn — review của Khánh (PR #17, 13/09). Đã sửa.

| # | Khánh chỉ ra | Đã sửa thế nào |
|---|---|---|
| 1 | Đo một `nn.TransformerEncoder` tự dựng, **không phải DINOv2** — `C0-2`, `C0-6` đòi đúng biến thể, nguồn checkpoint, decoder | Backbone là **DINOv2 thật** từ Hugging Face; mỗi lượt thử ghi repo, commit, SHA-256 trọng số, chế độ backbone, decoder, `attn_implementation`. Bỏ `ViTSegStandIn` và cờ `vit_is_stand_in` |
| 2 | Tìm batch chỉ nhân đôi và dừng ở lần hỏng đầu tiên; batch khởi đầu hỏng thì không thử batch 1; không dọn tensor khi hỏng | `search_batch()`: nhân đôi để **kẹp khoảng**, rồi **chia đôi** tới biên chính xác; batch khởi đầu hỏng → thử 1; mỗi lần thử dọn model/optimizer/input trong `finally`. `--selftest` kiểm 8 tình huống, gồm đúng hai ví dụ trong review |
| 3 | Thiếu **driver NVIDIA**; không ghi precision; không có throughput | Thêm driver (`nvidia-smi`), cuDNN, RAM máy, bản `transformers`; `--precision fp32/fp16/bf16` ghi theo **từng lượt thử**; thêm `steps_per_s` và `slices_per_s` kèm cách đo |
| 4 | Sinh `int16`, nhãn hình dạng "unknown" trong khi Spike D đã đo `uint8`, 576/640 × 88 | `generate.py` sinh **`uint8`** ở **cả hai kích thước**, mask **{0, 255}** như cohort; probe đọc `uint8`, chuẩn hoá DR-011 đúng như file cấu hình (bỏ z-score cũ), ghi rõ **chính sách resize** |
| 5 | Ngoại suy so với "dự án 30 ngày" chung chung và kết luận "kiến trúc quyết định lịch, không phải phần cứng" từ một máy | Ngân sách = **số ngày trong cửa sổ train × giờ GPU mỗi ngày**. Cửa sổ mặc định: sau `GATE-ML-01` (hết M4, Day 12) tới M6 (Day 22). Nhận `--remaining-days`, `--gpu-hours-per-day`, `--window-start`, `--deadline`; in phép tính; phán **VỪA / KHÔNG VỪA** cho từng biến thể; **bỏ** câu về kiến trúc với phần cứng |

Thêm một lỗi tìm ra khi chạy thử bản sửa: sau chuẩn hoá DR-011, input thành `float64` và UNet từ chối
chạy (DINOv2 tự ép kiểu nên không lộ). Đã ép về `float32`.

## ❌ Bản thứ ba còn 2 lỗi runtime — Khánh review lại trên RTX 4050 (15/09 00:52). Đã sửa (revision 4).

Hai lỗi này **chỉ lộ ra trên GPU 6 GB thật** — lần chạy thử trên máy leader không gặp:

| # | Khánh chỉ ra | Đã sửa thế nào |
|---|---|---|
| 1 | `--find-batch` **bị bỏ qua đúng lúc cần**: đo ở batch dự định và tìm batch nằm chung một `try`, batch dự định OOM là không có `batch_search` | `run_variant()` tách **ba bước**: đo ở batch dự định → **luôn** tìm batch nếu có `--find-batch` → nếu batch dự định hỏng **hoặc chỉ chạy được nhờ tràn quá VRAM**, **đo lại ở batch tìm được**. Bản ghi giữ cả lỗi của batch dự định (`intended_batch_error`, và `intended_batch_spilled_measurement` nếu nó tràn) lẫn kết quả tìm và số đo (`batch`, `measured_at`). **Trên CUDA, mỗi phép đo và mỗi lần thử batch chạy trong một tiến trình con riêng** (`--no-isolate` để tắt): trên Windows, một lần hết bộ nhớ thật làm hỏng CUDA của cả tiến trình. `extrapolate.py` dùng đúng batch đã đo cho từng biến thể |
| 2 | **`OSError` khi tải DINOv2** (`WinError 1455` — pagefile quá nhỏ) thoát khỏi mọi handler, **probe dừng mà không ghi JSON** | `OSError` được bắt khi dựng/tải từng biến thể và trong từng lần thử batch; ghi lỗi vào biến thể đó rồi **chạy tiếp**. Checkpoint tải lỗi trước vòng lặp → thông báo rõ, các biến thể dùng checkpoint đó ghi `SKIPPED`, biến thể khác vẫn chạy; lỗi nằm trong `checkpoint_errors` của file JSON |
| + | `extrapolate.py` vẫn ghi "DR-002 decides" | `--train-cases 80` giờ ghi là giá trị **đã quyết** (`DR-002` = Path A) |

**`--selftest` kiểm các đường này trên CPU, không cần GPU hay tải gì (10 kiểm):** batch dự định 8 hỏng → vẫn tìm → đo
ở 3; batch dự định **tràn VRAM** → coi là không vừa → đo ở 3; `OSError` khi dựng → ghi lỗi, không dừng; không
`--find-batch` → lỗi kèm gợi ý; bước dọn bộ nhớ ném lỗi → ghi lại, không dừng; và **tiến trình con thật**: báo lỗi
dạng dữ liệu, trả kết quả thử batch, trả số đo.

**Kiểm trên RTX 3050 Ti 4 GB của leader trước khi đẩy — tìm ra thêm 2 lỗi, đã sửa:**

| Lỗi tìm thêm | Hiện ra thế nào | Sửa |
|---|---|---|
| Sau một lần hết bộ nhớ thật trên Windows, **CUDA hỏng cho cả tiến trình** | `torch.cuda.empty_cache()` ném `CUDA error: out of memory`; sau đó thử batch 1 cũng hỏng — việc tìm batch trong cùng tiến trình không bao giờ ra kết quả | mỗi phép đo và mỗi lần thử batch trong **tiến trình con riêng**; tiến trình chính không khởi tạo CUDA; bước dọn không bao giờ ném lỗi |
| Batch dự định **chạy được nhờ tràn quá VRAM** được ghi như số đo thật | `unet_base16` batch 32 ở 560: đỉnh 12,06 GB trên card 4 GB, 21,7 s/bước — trong khi chính việc tìm batch cùng bản ghi đã đánh dấu batch 32 là không vừa (trần 10) | áp đúng quy tắc tràn VRAM của việc tìm batch cho phép đo; đo lại ở batch tìm được |

Kết quả sau sửa, cùng máy: `unet_base32` batch 32 hết bộ nhớ → tìm `32✗ 1✓ 16✗ 8✗ 4✓ 6✗ 5✓` → **đo ở batch 5**.
**Không số nào từ máy leader được commit** — C0 là của Khánh trên RTX 4050. Mỗi biến thể có `--find-batch` giờ mất vài
phút vì mỗi lần thử là một tiến trình mới: chạy đủ 10 biến thể có thể mất 30–60 phút.

> **Khánh — trên máy bạn:** nên bật pagefile (packet Day 6 việc 1). Probe giờ không chết vì `WinError 1455`, nhưng
> biến thể nào tải hỏng sẽ **không có số** — bật pagefile để cả 10 biến thể đều đo được.

---

## ❌ Bản đầu có 15 lỗi — review độc lập tìm ra. Đã sửa. *(lịch sử, 11/09)*

Nghiêm trọng nhất, đúng loại "con số sai mà trông đúng":

> **`C0-3` bịa ra trần batch.** Bản đầu coi *"không ném RuntimeError"* là *"vừa"*. Trên Windows,
> driver NVIDIA **âm thầm tràn sang system memory** thay vì báo OOM. Cả bốn variant đều báo
> `batch 64` trên card **4 GB**, trong khi chính harness ghi nhận đỉnh **8135 MB** — gấp 1,9 lần
> card — rồi in thêm *"the true ceiling may be higher"*. Con số VRAM nằm ngay trong cùng bản ghi và
> **chưa bao giờ được đọc**.

**Sau khi sửa, đo lại trên chính máy đó (`--img 224`)** — *bảng này đo **bản thế chỗ ViT** bằng cách tìm
nhân đôi cũ, nên đã **lỗi thời** từ bản thứ ba; giữ lại làm hồ sơ, không dùng làm số:*

| Variant | Trần cũ | **Trần mới** | Dừng vì |
|---|---:|---:|---|
| `unet_base32_depth4` | 64 | **16** | batch 32 ngốn **4,01 GB** / 4,00 GB VRAM |
| `unet_base16_depth4` | 64 | **64** | không tràn |
| `vit_s14_linear_decoder` | 64 | **32** | batch 64 ngốn **5,65 GB** |
| `vit_s14_progressive_decoder` | 64 | **32** | batch 64 ngốn **6,21 GB** |

Phép tìm giờ cũng **có optimizer**: bản đầu chỉ forward + backward, bỏ `exp_avg` và `exp_avg_sq` của
AdamW — hai bản sao fp32 nữa của toàn bộ tham số — trong khi `C0-3` hỏi cái gì vừa cho **training**.

### Các lỗi nặng khác

| Lỗi | Hệ quả nếu không sửa |
|---|---|
| **Peak memory trên CPU vô nghĩa** — RSS *hiện tại*, không reset, chỉ tăng. Reviewer đo UNet 4,62 M ra 588,8 MB rồi UNet 1,16 M ngay sau ra **601,5 MB**, lớn hơn | Cột `C0-2` sai trên đúng đường mà người **không có GPU** sẽ dùng |
| **Probe không chạy được với mặc định của chính nó** — `--img 518` chia hết 14 nhưng không chia hết 16 | Gõ lệnh trong README và nhận exit 2 |
| **`extrapolate.py` âm thầm bỏ mọi variant OOM**, rồi kết luận *"spread 1,8 tới 1,8 ngày"* | Kết luận so sánh kiến trúc rút từ **một** kiến trúc sống sót |
| **Không co giãn theo độ phân giải** — đo ở 224² ngoại suy cho 576² là **thiếu 6,6 lần** | Lịch training sai một bậc |
| **`--device cpu` vẫn ghi tên GPU** | Verdict đo trên CPU lưu dưới tên phần cứng chưa hề chạm |
| **`synthetic/generate.py` là artifact chết** — docstring nói nó nuôi probe, không gì đọc nó | Giờ có `--input-from` |
| **Ba định nghĩa median khác nhau** trong repo | Dùng nearest-rank p50, khớp Spike E |
| **Cùng một số in ra hai giá trị** (2,7 d ở bảng, 2,6 d ở tóm tắt) | Trong script mà mục đích là *"in mọi số trung gian để kiểm tay"* |
| `--hours-per-day 0` → `ZeroDivisionError`; `--epochs 0` → *"0,0 ngày, vừa 30 ngày"* | — |

---

## Smoke test đã chạy — và vì sao nó không nằm trong `EVIDENCE_RAW/`

Đêm 2026-09-11 toàn bộ chuỗi được chạy thử ở `112×112`, batch 1, trên một RTX 3050 Ti Laptop 4 GB.
Cả bốn variant chạy được, `extrapolate.py` in ra bảng lịch đầy đủ.

Sáng 2026-09-14, bản thứ ba được chạy thử trên **cùng RTX 3050 Ti đó (máy của leader)** với cả hai
checkpoint DINOv2 thật: đủ 10 biến thể ở `224`, bốn biến thể ở `560` có tìm batch, cả `fp32`, `fp16` và
`bf16`, đầu vào từ file `uint8` và từ bộ sinh trong bộ nhớ; `extrapolate.py` chạy với cửa sổ mặc định và
với `--target-img native`. Việc tìm batch cho ra những trần không phải luỹ thừa của 2 — đúng thứ bản
nhân đôi không bao giờ ra được — và bắt được một lần tràn VRAM âm thầm.

**Số của cả hai lần đều không được giữ.** `C0-1` hỏi *dự án này có compute gì*, mà một lần chạy trên máy người khác
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

**Phán quyết là so với lịch còn lại, không phải một "dự án 30 ngày" chung chung:**

```
ngân sách giờ GPU = số ngày trong cửa sổ train × giờ GPU mỗi ngày
cửa sổ mặc định   = từ max(hôm nay, Day 12 — hết M4, GATE-ML-01) tới Day 22 — hết M6, ma trận thí nghiệm xong
```

Mỗi biến thể được ghi **VỪA** hoặc **KHÔNG VỪA** và bao nhiêu % ngân sách. **Giờ GPU mỗi ngày là giả
định của bạn**: 8 nếu máy chỉ chạy lúc bạn ngồi làm, tới 24 nếu để chạy qua đêm được. Kết luận chỉ nói về
**máy này, lượt chạy này** — không suy ra gì cho phần cứng khác.

**Script từ chối chạy nếu không có file probe.** `TASK.md` cấm đích danh việc bịa *"any calendar figure
derived from unmeasured timings"*.

---

## Việc của bạn

1. **Spike D trước.** C0 là việc lấp chỗ, không phải primary task thứ hai.
2. `--selftest`, rồi chạy probe với `--operator "Bế Quốc Khánh"` `--img 560` `--find-batch`, một lần
   `fp32` và một lần `--precision bf16` (RTX 4050 hỗ trợ bf16), commit output dưới tài khoản của bạn →
   `C0-1` tới `C0-6`.
3. Chạy `extrapolate.py` với `--gpu-hours-per-day` đúng với cách bạn dùng máy, và `--train-cases` theo
   `DR-002` (80 Path A / 70 Path B) → `C0-7` `C0-8`.
4. Đọc và **phản biện** [`dr011_normalization.json`](dr011_normalization.json) — ngưỡng percentile
   0,5/99,5 là **lựa chọn cấu hình**, không phải phép đo. Ghi ra để bạn có thể không đồng ý với một con
   số cụ thể chứ không phải với một cảm giác.
5. **`C1` vẫn `BLOCKED_BY_SPIKE_D`.** Không làm gì cho C1 khi Spike D chưa `ACCEPTED`.

**Liên quan:** [`../../management/spikes/SPIKE_C_ML/TASK.md`](../../management/spikes/SPIKE_C_ML/TASK.md) ·
[`../../management/spikes/SPIKE_C_ML/EVIDENCE_TEMPLATE.md`](../../management/spikes/SPIKE_C_ML/EVIDENCE_TEMPLATE.md) ·
`docs/specs/v1.0/07_ML_AND_IMAGE_PROCESSING_SPEC.md`
