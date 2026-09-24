# SPIKE_A — RESULT

> **`RESULT.md` ≠ `ACCEPTED`.** File này là bản ghi công việc của chủ sở hữu. Nghiệm thu cần đủ bốn bước:
> owner → `EVIDENCE_READY` → reviewer `APPROVE` → CHAT E QA `PASS` → CHAT A chuyển trạng thái → `ACCEPTED`.
> **Cập nhật 2026-09-20:** spike đề nghị chuyển sang **`EVIDENCE_READY`**. Phiên `S8` ngày 19/09 đã đo nốt
> `A8`, `A10`, `A11`, nên **11/12 tiêu chí có dữ liệu** và không còn ô `NOT MEASURED` nào. `A1` và `A12` còn
> **một phần**, lý do kỹ thuật ghi ở §Ghi chú A1 và §A12 — người nghiệm thu phải quyết nhận kèm hai hạn chế
> đó hay không, chứ chúng không được lặng lẽ tính là đạt.
>
> Chặng đã merge: #31 (S5, `A3`–`A7`) tại `11000f1`. Chặng chờ `APPROVE`: **#41** (S6, `A9` ở 576×576×88) và
> **#49** (S8, `A8`/`A10`/`A11`).

| Mục | Giá trị |
|---|---|
| **Spike** | `SPIKE_A` — 2D scientific viewer / brush interaction |
| **Chủ sở hữu** | Phạm Tuấn Anh |
| **Reviewer** | Vũ Hùng Anh *(hàng đợi vị trí 2, sau Spike D — D là P0)* |
| **Ngày** | 2026-09-11 (Day 2) · bắt đầu 12:00 theo cutover record |
| **Ứng viên đang đánh giá** | **React Native / Expo** — ứng viên **thứ nhất trong nhiều ứng viên** |
| **Thiết bị** | SM-A176B, Android 16 — [`DR006_DEVICE_PROFILE.md`](DR006_DEVICE_PROFILE.md) |
| **Harness** | [`spikes/spike_a_2d/`](../../../spikes/spike_a_2d/) |

> ⚠ **Đây KHÔNG phải cơ sở để chọn framework.** `GATE-MOB-01` cần bằng chứng **cả Spike A và Spike B**,
> và mới có **một** ứng viên được dựng. Không có dòng nào dưới đây được đọc thành "RN thắng".

---

## Bảng tiêu chí A1–A12

| # | Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|---|
| **A1** | Slice render đúng, hiện `n / total` | **PASS một phần** | `n / total` hiển thị đúng, 16 slice điều hướng được, 30/30 lần load thành công. **Phần "exact match to fixture" CHƯA kiểm theo pixel** — xem ghi chú A1 |
| **A2** | **Zoom/pan không đổi geometry mask nguồn** | **ĐÃ ĐO — `OBSERVED`** (14/09, release) | checksum mask nguồn **16/16 khớp fixture** ở cả 3 lần kiểm: trước thao tác, sau **3 pinch + 1 kéo** thật, sau **13 bước zoom/pan tự động**. 0 lần khựng > 500 ms. Xem §Kết quả A2 |
| **A3** | Brush ADD chỉ sửa pixel đúng ý | **ĐÃ ĐO — `OBSERVED`** (15/09, release) | **8/8** nét thêm khớp oracle độc lập, từng pixel và từng hash slice. Xem §Kết quả A3–A7 |
| **A4** | Brush ERASE chỉ sửa pixel đúng ý | **ĐÃ ĐO — `OBSERVED`** (15/09, release) | **6/6** nét xoá khớp oracle |
| **A5** | **Brush mapping đúng pixel sau zoom/pan** | **ĐÃ ĐO — `OBSERVED`** (15/09, release) | **60/60** ca ở r = 0 và **60/60** ở r = 2; (dx, dy) = (0, 0) ở cả 50 ca trong ảnh, 10 ca ngoài ảnh không tô gì. **Dung sai đề xuất: 0 pixel nguồn** |
| **A6** | Undo tái lập trạng thái trước | **ĐÃ ĐO — `OBSERVED`** (15/09, release) | **15/15** bản ghi undo khớp hash trước từng nét |
| **A7** | Redo tái lập trạng thái đã undo | **ĐÃ ĐO — `OBSERVED`** (15/09, release) | **15/15** bản ghi redo khớp hash sau từng nét |
| **A8** | **Save/reload tái lập đúng nét sửa** | **ĐÃ ĐO — `OBSERVED`** (19/09, release) | **2 vòng NGUỘI** sau `am force-stop`, trên **hai tệp khác nhau**: mỗi vòng **16/16** checksum slice khớp và hash khối trùng đúng bản đã lưu. Thêm 5 vòng nóng, 5/5 đúng từng byte. Xem §Kết quả A8 |
| **A9** | **Slice-switch đã cache, 30 bước, p95 ≤ 200 ms** | **ĐÃ ĐO HAI LẦN — đạt ngưỡng ở cả hai** | `64×64`: **65,31 ms** · **`576×576` (thật): 50,23 ms**. Kèm phát hiện bộ nhớ **376 MB ngoại suy** cho 88 slice. Xem §Kết quả A9 |
| **A10** | **Phản hồi brush ≤ 100 ms, 0 nét mất** | **ĐÃ ĐO — `OBSERVED`** (19/09, release) | worst per-stroke **30,48 ms** trên **123 nét có commit** · p50 16,48 · p95 24,66 · **0 mẫu commit bị mất**. **Đọc trên `max`, không phải p95** — xem §Kết quả A10/A11 |
| **A11** | **Tách gesture sửa vs điều hướng** | **ĐÃ ĐO — `OBSERVED`** (19/09, release) | **12** lần ngón thứ hai chạm giữa nét, **tất cả cuộn lại** · **0** nét commit trong cử chỉ nhiều ngón · **0** nét commit mà không nhả tay sạch · 20/20 bản ghi cử chỉ mang kết cục nét |
| A12 | Chi phí phát triển mỗi ứng viên | **một phần** | Xem §A12 |

**11 tiêu chí có dữ liệu · 0 tiêu chí `NOT MEASURED`** — `A1` và `A12` còn **một phần**, lý do ghi ở §Ghi chú A1
và §A12. Không ô nào bỏ trống và không ô nào được đoán.
*(`A2` thêm 14/09 — PR #27 · `A3`–`A7` thêm 15/09 — PR #31, **đã merge `11000f1`** · `A8`/`A10`/`A11` thêm 19/09 —
PR #49, chờ `APPROVE`.)*

---

## Kết quả A9 — slice-switch đã cache

**Đã đo HAI LẦN, ở hai kích thước slice.** Lần thứ hai là lần có ý nghĩa.

| Lần | Fixture | Ngày | p50 | **p95** | max | Ngưỡng 200 ms |
|---|---|---|---:|---:|---:|---|
| 1 | `64×64×16` | 2026-09-11 14:09 | 34,21 | **65,31** | 65,41 | đạt |
| **2** | **`576×576×16`** — kích thước slice **THẬT** | 2026-09-12 00:52 | 35,68 | **50,23** | 50,45 | **đạt** |

Dữ liệu thô: [`EVIDENCE_RAW/`](../../../spikes/spike_a_2d/EVIDENCE_RAW/) · 30 mẫu mỗi lần, chuỗi 30
bước cố định, percentile **nearest-rank**, **không loại outlier**.

### Vì sao lần 2 quan trọng

`RESULT.md` bản đầu ghi giới hạn phạm vi số 1: *"Kích thước slice LGE MRI thật CHƯA BIẾT… `A9` phải
đo lại khi `A6` của Spike D có kết quả."* Gói dataset mở đêm 2026-09-11 cho thấy **`576×576×88`**
(có case `640×640`). Fixture cũ nhỏ hơn **81 lần** về số pixel.

Đã đo lại. **Chỉ MỘT biến thay đổi:** `Nz` giữ nguyên 16 để chuỗi 30 bước giống hệt.

### ⚠ Kết quả ngược trực giác — và cách đọc nó cho đúng

**Ở 81 lần số pixel, p95 KHÔNG tăng. Nó giảm, 65,31 → 50,23 ms.**

Lời giải thích khả dĩ, và nó là điều quan trọng nhất trong mục này: **`A9` đo việc chuyển giữa các
slice ĐÃ CACHE.** Toàn bộ 16 slice được decode một lần ở bước prewarm trước khi bài đo bắt đầu. Chi
phí mỗi bước chuyển là **bridge JS + compositing của React Native**, cộng việc GPU thu nhỏ một bitmap
đã decode sẵn — **không phải chi phí theo số pixel**.

Nếu đúng thì đây là dữ kiện có giá trị cho `GATE-MOB-01`: với kiến trúc nạp sẵn, `NFR-PERF-001`
**không nhạy với kích thước slice**.

> **Nhưng đây KHÔNG phải một thí nghiệm có kiểm soát, và tôi không trình bày nó như vậy.**
> Ba điều kiện khác nhau giữa hai lần chạy:
>
> | | Lần 1 | Lần 2 |
> |---|---|---|
> | Brightness | 128 | **255** |
> | Pin | 80%, `NOT_CHARGING` | **19%, đang sạc** |
> | Nhiệt độ pin | 35,0 °C | **36,6 °C** |
>
> Chiều của chênh lệch (thấp hơn ở 81 lần pixel) không được giải thích bởi bất kỳ điều nào ở trên,
> nhưng **độ lớn của chúng so được với độ lớn của chênh lệch**. Nên đây là **một quan sát**, không
> phải một kết luận. Muốn kết luận thì chạy lại cả hai kích thước trong cùng một điều kiện.

### 🔴 Phát hiện quan trọng hơn cả con số p95 — bộ nhớ

| Thời điểm | Graphics | TOTAL PSS |
|---|---:|---:|
| Trước bài đo | 268 KB | 79,6 MB |
| **Sau bài đo** | **69 994 KB ≈ 68 MB** | **186 MB** |

**≈ 4,3 MB graphics mỗi slice** (volume + mask overlay, đã decode sang bitmap).

**Ngoại suy tới độ sâu THẬT của cohort — 88 slice:**

```text
4,3 MB/slice × 88 slice  ≈  376 MB graphics memory
```

> **Chiến lược "prewarm toàn bộ volume" KHÔNG co giãn tới dữ liệu thật.** 376 MB là con số đáng lo
> ngay cả khi graphics memory nằm ngoài heap Java 256 MB mà profile DR-006 đã cảnh báo.
>
> Điều này **không làm hỏng con số `A9`** — `A9` hỏi về slice *đã cache*, và với 16 slice thì chúng
> đã cache thật. Nhưng nó nói rằng **một viewer thật không thể cache cả volume**, nên nó sẽ phải
> decode theo yêu cầu — và lúc đó `A9` **sẽ** nhạy với kích thước slice theo cách lần đo này không
> thấy được.
>
> **Đây là việc tiếp theo của Spike A, và nó quan trọng hơn phần brush:** đo `A9` với một cache có
> giới hạn (ví dụ cửa sổ ±3 slice) thay vì cache toàn bộ. Đó mới là hành vi của ứng dụng thật.

### Định nghĩa đang đo là gì

- `ms_to_frame` = từ lúc state đổi đến **frame đầu tiên vẽ xong sau khi ảnh decode**. Spec nói
  *"update the **visible** slice"* nên đây là con số trung thực.
- `ms_to_load` = tới lúc decode xong. Giữ lại để thấy tách bạch decode và paint.
- Percentile **nearest-rank**, không nội suy, **không loại outlier**.

### Điều kiện lần đo thứ hai

Build **RELEASE** — cài lúc 00:37:03, `flags=0x0`, APK 82 888 384 byte (so với 68 815 824 byte của
bản 64×64; chênh lệch đúng bằng fixture). Thermal status **0 trước và sau**. Pin 19→20%, **đang
sạc**. Brightness **manual 255**. `low_power = 0`. Governor `energy_aware`. Refresh **60 Hz** suốt
bài. Màn hình ghim sáng bằng `svc power stayon usb` để không khoá giữa chừng.

**Ai vận hành:** Project Control bấm nút qua `adb input tap`, **theo chỉ đạo của leader**, trên máy do
chính anh cắm và mở khoá. Chủ sở hữu Spike A là Phạm Tuấn Anh; theo **DR-006a** operator và owner
được ghi tách bạch. **Không con số nào do Project Control sinh ra** — tất cả đến từ thiết bị.

### Ba giới hạn phạm vi còn lại

1. **Nửa sau của `A9` — *"không full-volume transfer mỗi gesture"* — vẫn `NOT MEASURED`.** Fixture
   nằm local, chưa có đường mạng nào. Nửa đó thuộc Spike E.
2. **Mỗi kích thước chạy một lần.** Chuỗi 30 bước đúng yêu cầu tiêu chí, nhưng một lần chạy không mô
   tả được biến động giữa các lần.
3. **`Nz = 16`, độ sâu thật là 88.** Giữ cố định có chủ ý để cô lập biến kích thước slice — nhưng nó
   chính là lý do con số bộ nhớ ở trên phải **ngoại suy** thay vì đo trực tiếp.

---

## Kết quả A2 — zoom/pan không đổi mask nguồn *(chặng S4, 2026-09-14 21:24–21:25)*

**Tiêu chí (`TASK.md` A2):** *"Pinch-zoom and pan work, and provably do not alter source-mask geometry —
checksum of source mask unchanged."*

**Cách đo.** Zoom/pan chỉ đổi transform hiển thị `{zoom, panX, panY}`; mask nguồn được giải mã một lần và
không đoạn code transform nào nhận nó. Nút "kiểm A2" băm SHA-256 cả 16 slice mask nguồn **trên máy**;
`harness/extract_a2.py` **tự tính lại** hash kỳ vọng từ fixture bằng `hashlib` và so từng slice — không tin
con số "khớp" app tự báo.

| Lần kiểm | Thời điểm | Thao tác trước đó | Checksum khớp fixture (tính lại độc lập) |
|---|---|---|---|
| 0 | 21:24:32 | **không có** — trước mọi thao tác | **16/16** |
| 1 | 21:25:00 | **4 thao tác tay thật**: 1 kéo · 3 pinch (zoom ×1,00 → ×0,56 → ×0,96 → ×0,65) · kèm 4 lần chạm | **16/16** |
| 2 | 21:25:04 | **13 bước zoom/pan tự động** qua nhiều slice, kết thúc ở fit | **16/16** |

**Kết luận từ log thô: `OBSERVED`** — checksum mask nguồn không đổi qua zoom/pan thật và tự động.

| Đo kèm | Kết quả |
|---|---|
| Ánh xạ chạm → pixel của app, trên máy | **60/60** ca `brush_cases.json` *(tiền đề cho `A5`, **chưa phải** `A5` — chưa có brush)* |
| 4 lần chạm, kiểm tay một ca | chạm `(223,3; 279,1)`, zoom 3,128, pan `(75,5; 104,8)` → `floor((223,3−75,5)/3,128) = 47`, `floor((279,1−104,8)/3,128) = 55` → app báo **`[47, 55]`** ✓ |
| Khoảng hở frame lớn nhất mỗi thao tác | 18,7 · 44,9 · 20,0 · 18,8 ms — **0 lần khựng > 500 ms** *(nhịp `requestAnimationFrame` phía JS, không phải trace compositor; 1 frame ở 60 Hz = 16,7 ms)* |
| Nhận xét cảm quan của người bấm (`TASK.md`) | **không thấy khựng** khi pinch hay kéo — nguyên văn: *"tôi không thấy khựng"* |

**Điều kiện:** bản **release** từ `1b362e8`, SM-A176B Android 16, màn hình chạy 60 Hz, cắm USB đang sạc
(pin 45 → 48 %), nhiệt độ pin 33,0 → 34,5 °C, thermal status 0. Người bấm: **Phạm Tuấn Anh**, chủ Spike A,
trên máy của chính mình.

**Bằng chứng:** `spikes/spike_a_2d/EVIDENCE_RAW/a2_zoom_pan_20260914T212552+0700.json` và
`…_logcat.txt` (14 dòng logcat mang tag `SPIKE_A_`, nguyên byte).

**Giới hạn, ghi rõ:** fixture 64×64 — mask nguồn là dữ liệu tổng hợp của Spike A, chưa phải cohort thật; một
lượt đo; mới 1 lần kéo trong 4 thao tác tay (3 pinch).
`A2` là **đã đo**, chưa **nghiệm thu** — cần reviewer `APPROVE` → QA `PASS` → `ACCEPTED`.

---

## Kết quả A3–A7 — brush trên máy *(chặng S5, 2026-09-15 21:13–21:21)*

**Cách đo.** Mọi mẫu chạm đi qua đúng một hàm, `strokeSample` trong `app/brushMath.js`. Nút **"kiểm A5"** chạy 60 ca
`brush_cases.json` qua hàm đó trên slice nháp, ở r = 0 và r = 2. Nút **"A3–A7 tự động"** chạy 14 nét kịch bản của
`brush_ops.json` trên bản nháp chép từ mask nguồn — thêm, xoá, undo lùi hết, redo tiến hết, đặt lại — và log hash
từng bước. `harness/extract_brush.py` **tự tính lại** mọi kỳ vọng bằng `hashlib` từ fixture (oracle Python độc lập
trong `generate.py`), không tin số "pass" của app.

| Tiêu chí | Kết quả trên máy (tính lại độc lập) |
|---|---|
| `A3` thêm | **8/8** nét khớp — đúng tập pixel, đúng hash slice và hash cả khối |
| `A4` xoá | **6/6** nét khớp |
| `A5` ánh xạ sau transform | r = 0: **60/60** · r = 2: **60/60** · (dx, dy) = (0, 0) ở 50 ca trong ảnh · 10 ca ngoài ảnh không tô gì |
| `A6` undo | **15/15** bản ghi khớp (14 bước lùi và trạng thái undo-all = mask nguồn) |
| `A7` redo | **15/15** bản ghi khớp (14 bước tiến và trạng thái redo-all) |
| đặt lại | **1/1** — cả 16 slice về đúng hash mask nguồn |

**Kết luận từ log thô: `OBSERVED`** cho `A3`, `A4`, `A5`, `A6`, `A7`.

**Nét tô thật** *(dữ liệu thô cho `A10`/`A11`, chưa kết luận)*: 25 nét — 20 commit, **5 bị huỷ vì ngón thứ hai
chạm** (đúng thiết kế: hai ngón là điều hướng); **0** mẫu không tính được trong các nét commit; `feedback_ms` lớn
nhất **22,66 ms** — đo từ lúc vào handler JS tới frame kế tiếp, **không** gồm thời gian hệ thống chuyển sự kiện chạm
vào JS.

**Kiểm lại `A2` trên bản S5:** `OBSERVED` — lần kiểm trước mọi thao tác và lần kiểm sau **6 pinch + 1 kéo** đều khớp
16/16 slice mask nguồn; khoảng hở frame lớn nhất 36,4 ms, 0 lần khựng > 500 ms. Cọ sửa mask **làm việc**, không đụng
mask nguồn.

**Dung sai `A5` đề xuất: 0 pixel nguồn** cho các bộ ba fixture — ánh xạ là phép floor tất định, và cả offline (F5)
lẫn trên máy đều trúng 100%. Rung tay khi chạm thật là câu hỏi của `A10`/`A11`, không phải của dung sai ánh xạ.

**Điều kiện:** bản **release** từ PR #31 @ `cf84802` (`expo run:android --variant release`, APK 68 865 408 byte, cài
21:03:28), SM-A176B Android 16, cắm USB đang sạc (pin 54 % lúc 21:19 theo ảnh chụp). Người bấm: **Phạm Tuấn Anh**,
chủ Spike A, trên máy của chính mình. Log lấy từ mốc giờ điện thoại đặt trước phiên — chỉ đọc, không xoá log trên máy.

**Bằng chứng** (nhánh `spike-a/s5-brush`, PR #31): `spikes/spike_a_2d/EVIDENCE_RAW/a3_a7_brush_20260915T212121+0700.json`
· `…/a2_zoom_pan_20260915T212121+0700.json` · `…/s5_device_session_20260915T212121+0700_logcat.txt` (99 dòng
`SPIKE_A_*`, nguyên văn) · `…/s5_brush_after_zoom_20260915T211941+0700.jpg` (nét thêm xanh, xoá đỏ trên overlay mask
nguồn, sau pinch và kéo — zoom ×0,83, ảnh lệch khỏi vị trí fit).

**Giới hạn, ghi rõ:** fixture 64×64 tổng hợp, chưa phải cohort thật; một lượt đo; nét tô thật không có kỳ vọng pixel
nên chỉ là dữ liệu thô; `A8` (lưu/tải lại) chưa dựng. Đã đo, **chưa nghiệm thu** — cần reviewer `APPROVE` → QA
`PASS` → `ACCEPTED`.

---

## Kết quả A8 — lưu và nạp lại *(chặng S8, 2026-09-19 11:50–12:19)*

Bản ghi phiên đầy đủ: [`EVIDENCE_RAW/SESSION_S8_RECORD.md`](../../../spikes/spike_a_2d/EVIDENCE_RAW/SESSION_S8_RECORD.md) ·
thô: `a8_save_reload_20260919T121906+0700.json`.

**`A8` là "đúng mask đó quay lại", không phải "đã ghi được một tệp".** Một vòng làm mất đúng một voxel đã
sửa trông y hệt một lần thành công, nên mọi slice được băm lại đối chiếu checksum mà bản lưu đã ghi.

| Vòng | Loại | Slice khớp checksum | Hash khối | Thời gian |
|---|---|---|---|---|
| 1–5 | **nóng** (cùng tiến trình) | 16/16 mỗi vòng | khớp | lưu 43,3–76,9 ms · nạp 19,0–20,7 ms |
| **6** | **NGUỘI** — sau `am force-stop`, mở lại | **16/16** | **khớp** `8b43fc60…` | nạp **25,1 ms** |
| **7** | **NGUỘI** — tệp thứ hai, nội dung khác | **16/16** | **khớp** `1283fcbc…` | nạp **22,4 ms** |

**Chỉ hai vòng nguội mới kết luận được `A8`.** Năm vòng nóng chạy trong cùng một tiến trình: chúng chứng
minh codec và tệp, **không** chứng minh bản sửa sống sót khi ứng dụng bị giết. `extract_a8.py` từ chối trả
`OBSERVED` nếu không có vòng nguội, nếu vòng nguội không khớp lần `lưu` nào trong cùng log, hoặc nếu bản
lưu tương ứng là mask **chưa sửa** — round-trip mask nguồn sẽ pass mà không chạm tới một chỉnh sửa nào.
Tám kịch bản từ chối đó đã chạy thử bằng log tổng hợp **trước** phiên đo.

Tệp 5 147 / 5 435 byte = **7,85% / 8,29%** của 65 536 byte thô, nhờ mã hoá run-length.

**Thời gian được báo cáo, không được phán xét:** không yêu cầu đóng băng nào ràng buộc `save_ms` hay
`reload_ms`. Đặt ra một ngưỡng ở đây là bịa ra một tiêu chí.

---

## Kết quả A10 / A11 — phản hồi cọ và tách cử chỉ *(cùng phiên S8)*

Thô: `a10_a11_brush_feedback_20260919T121906+0700.json` · **123 nét có commit** trên **3 slice**, bán kính
**r1 / r2 / r3 / r5**, cả `thêm` lẫn `xoá`, **12** lần ngón thứ hai chạm giữa nét.

| | Ràng buộc `TASK.md` | Đo được |
|---|---|---|
| `A10` | *"visible feedback ≤ 100 ms; zero committed stroke samples lost"* | worst **30,48 ms** · p50 16,48 · p95 24,66 · **0 mẫu mất** |
| `A11` | *"zero accidental edits"* | 12/12 lần bị ngón thứ hai chặn đều **cuộn lại**; **0** nét commit trong cử chỉ nhiều ngón; **0** nét commit mà không nhả tay sạch |

### Hai cách đọc được nêu ra để phản biện, không ngầm định

**1 · `A10` lấy verdict trên `max`, không phải `p95`.** `A9` nêu rõ phân vị; `A10` **không nêu**, và bảng
"Measurements required" đòi *"p50 **and worst case**"*. Cách đọc thẳng là ràng buộc áp cho mọi mẫu. Với số
hiện tại (30,48 so với 100) hai cách đọc cùng kết quả, nhưng ở một phiên tệ hơn thì khác — nên cách đọc
được ghi ra, và nếu `p95` mới đúng thì đó là một **Decision Request**, không phải một lần sửa script.

**2 · `feedback_ms` là proxy phía JS.** Đo từ `performance.now()` lúc vào handler `PanResponder` tới
callback `requestAnimationFrame` đầu tiên sau khi overlay cập nhật. **Không gồm** khâu hệ thống chuyển sự
kiện chạm vào JS, và `nativeEvent.timestamp` ở đồng hồ khác nên không được trộn vào. Độ trễ đầu-cuối thật
**lớn hơn** con số này. `A10` đạt là **đạt trên cận dưới**, và đó là giới hạn của harness chứ không phải
thứ để giấu.

### Một quan sát ngược với giả định của chính chúng tôi

**Bán kính lớn không phải chỗ chậm nhất:** `r5` worst **19,41 ms**, `r1` worst **30,48 ms**. Kịch bản phiên
ban đầu ghi `r 0` là "trường hợp nặng nhất về số mẫu trên một nét" — sai cả lý do (số mẫu chạm không phụ
thuộc bán kính; chi phí *mỗi* mẫu mới phụ thuộc) lẫn số (chi phí không do footprint quyết định). Đã sửa
kịch bản và nêu câu hỏi cho reviewer.

### Giới hạn, ghi rõ

Fixture **64×64×16**, **không phải** 576×576×88. Tính *đúng từng byte* của `A8` **không** phụ thuộc kích
thước; **dung lượng tệp và thời gian thì có** — 5 147 byte / 7,85% của 65 KB **không nói gì** về 29,2 MB
thô. Mọi phát biểu về hai thứ đó ở độ sâu thật là `NOT MEASURED`. Một thiết bị, một phiên; hai vòng nguội
không phải một con số độ tin cậy. Ngưỡng cỡ mẫu (20 nét, 5 lần ngón thứ hai) là thuộc tính của harness,
**không phải** yêu cầu đóng băng.

### Hai sai sót của Project Control trong phiên

Ghi đầy đủ ở [`SESSION_S8_RECORD.md`](../../../spikes/spike_a_2d/EVIDENCE_RAW/SESSION_S8_RECORD.md) §"Hai sai
sót": APK dựng **trước** một lần sửa mã nên 25 nét đầu của trưởng nhóm phải bỏ và tô lại trên một build
duy nhất; và một tệp log bị xoá khi chưa được xác nhận, khiến sha256 đã ghi của nó **vĩnh viễn không kiểm
lại được** (đánh dấu `UNVERIFIABLE`). Không mất bằng chứng — bản lọc đã commit giữ mọi dòng `SPIKE_A_` và
cả hai script chạy lại trên chính nó cho verdict giống hệt.

---

## Ghi chú A1

`n / total` hiển thị đúng và 16 slice điều hướng được — phần đó đạt. Nhưng tiêu chí còn vế **"exact match
to fixture"**, và vế đó **chưa kiểm theo pixel**.

Lý do không chỉ là chưa làm: **React Native `Image` nội suy bilinear và không expose tuỳ chọn
nearest-neighbour.** Fixture 64×64 phóng lên ~1000 px hiện ra mượt chứ không thấy ô pixel vuông. Một phép
so pixel ngây thơ giữa ảnh hiển thị và fixture sẽ **trượt**, nhưng trượt vì bộ lọc hiển thị chứ không phải
vì dữ liệu sai. Cần một cách kiểm khác — so ở tầng dữ liệu, không ở tầng ảnh đã render.

Marker định hướng trong **fixture** đã được `check_conformance.py` F3 xác minh đủ 16/16 slice. Việc **app
render đúng hướng** thì mới chỉ xác nhận bằng mắt, chưa bằng test.

---

## A12 — chi phí phát triển, ứng viên React Native / Expo

| Mục | Ghi nhận |
|---|---|
| **Phiên bản** | Expo SDK `57.0.21` · React Native `0.86.3` · React `19.2.3` · Node `24.14.0` · JDK 17 |
| Scaffold tới app trắng | nhanh — `create-expo-app` + `npm install`, **~2 phút**, 464 gói |
| **Build release đầu tiên** | **6 phút 44 giây** *(sau khi cache Gradle đã ấm)*. Lần đầu **thất bại vì timeout mạng** khi tải `react-android-0.86.3-release.aar` 161 MB và `hermes-android` 78 MB; tổng cache Gradle 653 MB |
| Kích thước APK release | **68,8 MB** cho một viewer hiển thị ảnh 64×64 |
| Viewer + instrumentation | thẳng thắn mà nói là **dễ** — JSX, state, `Image`, đo thời gian bằng `performance.now()` |
| **Điểm trừ đã gặp** | **Không có nearest-neighbour** trên `Image`. Với viewer khoa học đây là vấn đề thật: biên mask hiển thị mượt hơn biên dữ liệu, người review sẽ thấy một đường biên không tồn tại |
| **Xử lý gesture** *(14/09, chặng S4)* | `PanResponder` **có sẵn trong React Native đủ cho pinch + kéo + chạm** — không cần thêm thư viện gesture nào, nên không phải build lại phần native. Khoảng **120 dòng** trong `App.js`, toán transform tách ra `viewerMath.js` để test được bằng Node. Build release tăng dần **38 giây**. Điểm cần làm tay: phải tự tính toạ độ ngón tay theo trang (`pageX − gốc viewport`), vì `locationX` đổi theo phần tử con dưới ngón tay |
| Chưa đánh giá | brush latency, tách gesture sửa/điều hướng (`A11`), bộ nhớ ở kích thước slice thật |

**Chưa so sánh được với ứng viên nào khác** — mới dựng một ứng viên. Native Kotlin và Flutter chưa chạm
tới; Flutter còn chưa cài trên máy.

---

## Điều kiện thất bại — chưa cái nào kích hoạt

| Điều kiện | Trạng thái |
|---|---|
| `A5` sai mapping sau transform → ứng viên **không dùng được** | **không kích hoạt** — 60/60 ở r = 0 và r = 2 trên máy (15/09) |
| `A9` hoặc `A10` trượt trên thiết bị đã khai báo → không dùng được | **không kích hoạt** — `A9` p95 50,23 ms / 200 · `A10` worst 30,48 ms / 100 (19/09) |
| Mất nét committed → không dùng được (`NFR-PERF-003` cấm) | **không kích hoạt** — **0 mẫu commit bị mất** trên 123 nét (19/09) |
| Không ứng viên nào đạt → `NEGATIVE_RESULT`, leo thang | chưa tới bước đó |

---

## Việc tiếp theo

1. ~~**Zoom/pan** → `A2`~~ ✅ 14/09 · ~~**brush** → `A3`–`A7`~~ ✅ 15/09 · ~~**lưu/tải lại** → `A8`, và bài đo
   theo kịch bản cho `A10`/`A11`~~ ✅ **19/09, chặng S8**
2. ~~**Chạy 60 ca `brush_cases.json`** → `A5`~~ ✅ 15/09 — sai số toàn (0, 0), **dung sai đề xuất 0 pixel nguồn**;
   đưa vào hợp đồng hình học khi Vũ Hùng Anh nâng phiên bản (`DR-013`)
3. ~~**Đo lại `A9` ở kích thước slice thật**~~ ✅ 12/09 — 576×576, p95 50,23 ms
4. **Nghiệm thu** — đường còn lại, theo đúng `acceptance_workflow`: reviewer `APPROVE` **#41** và **#49**
   → QA chạy `management/day10/qa004_spike_a/run_qa004.py` và ký verdict → Project Control chuyển
   `SPIKE_A: ACCEPTED`. **Người chạy QA không nên là chủ spike** — xem ghi chú xung đột vai bên dưới
5. **Đo `A8` ở độ sâu thật** (576×576×88) nếu muốn phát biểu về dung lượng và thời gian lưu — hôm nay chỉ
   có ở 64×64×16
6. Dựng ứng viên thứ hai để `A12` so sánh được — đây là hạn chế lớn nhất còn lại của cả spike
7. Nhả Galaxy A17 cho Nguyễn Gia Đức Trung — profile DR-006 và baseline `A9` đã xong, phần còn lại là
   việc desktop

> ### ⚠ Xung đột vai ở bước 3 và 4, nêu ra chứ không đi vòng
>
> Chủ sở hữu Spike A là **Phạm Tuấn Anh**, và anh cũng là **Project Control**. `acceptance_workflow`
> (`SPIKE_PHASE_STATE.yaml` dòng 836) **không có điều khoản hồi tị** cho bước 3 (QA) hay bước 4. Spike D
> không vướng vì chủ (Bế Quốc Khánh) và reviewer (Vũ Hùng Anh) là hai người khác nhau, còn Project Control
> chỉ đeo thêm vai QA.
>
> Ở đây, nếu chủ spike tự chạy QA thì `ACCEPTED` có chữ ký một người đeo **ba vai**. Đề xuất: **Nguyễn Gia
> Đức Trung chạy bước 3** (bộ QA-004 đã script hoá, phần nặng là máy làm), Project Control chỉ làm bước 4.
> Đây là một **khoảng trống trong đặc tả**, được ghi lại như `INC-001` §4.1 đã làm với khoảng trống của nó,
> chứ không dán một cái nhãn cho vừa.

**Liên quan:** [`TASK.md`](TASK.md) · [`DR006_DEVICE_PROFILE.md`](DR006_DEVICE_PROFILE.md) ·
[`EVIDENCE_TEMPLATE.md`](EVIDENCE_TEMPLATE.md) · [`../../../spikes/spike_a_2d/`](../../../spikes/spike_a_2d/)
