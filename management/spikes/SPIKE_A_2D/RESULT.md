# SPIKE_A — RESULT

> **`RESULT.md` ≠ `ACCEPTED`.** File này là bản ghi công việc của chủ sở hữu. Nghiệm thu cần đủ bốn bước:
> owner → `EVIDENCE_READY` → reviewer `APPROVE` → CHAT E QA `PASS` → CHAT A chuyển trạng thái → `ACCEPTED`.
> Hiện tại spike đang ở **`ACTIVE`**. Review đã được yêu cầu cho từng chặng — #27 (S4, `A2`) và #31 (S5, `A3`–`A7`) —
> chưa chặng nào được `APPROVE`.

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
| A8 | Save/reload tái lập đúng nét sửa | `NOT MEASURED` | chặng S6 — app chưa lưu mask |
| **A9** | **Slice-switch đã cache, 30 bước, p95 ≤ 200 ms** | **ĐÃ ĐO HAI LẦN — đạt ngưỡng ở cả hai** | `64×64`: **65,31 ms** · **`576×576` (thật): 50,23 ms**. Kèm phát hiện bộ nhớ **376 MB ngoại suy** cho 88 slice. Xem §Kết quả A9 |
| A10 | Phản hồi brush ≤ 100 ms, 0 nét mất | `NOT MEASURED` | **có dữ liệu thô, chưa kết luận:** 25 nét thật, 0 mẫu không tính được trong 20 nét commit; proxy JS tới frame kế tiếp lớn nhất 22,66 ms — không gồm độ trễ chuyển chạm từ native nên chưa phải con số `A10` |
| A11 | Tách gesture sửa vs điều hướng | `NOT MEASURED` | **có dữ liệu thô:** 5 nét bị huỷ đúng lúc ngón thứ hai chạm; chưa có lượt kiểm theo kịch bản cho "0 sửa nhầm" |
| A12 | Chi phí phát triển mỗi ứng viên | **một phần** | Xem §A12 |

**9 tiêu chí có dữ liệu · 3 tiêu chí `NOT MEASURED`** (`A8`, `A10`, `A11`). Không ô nào bỏ trống và không ô nào được
đoán. *(`A2` thêm 14/09 — PR #27; `A3`–`A7` thêm 15/09 — PR #31. Cả hai PR chưa được `APPROVE`.)*

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
| `A9` hoặc `A10` trượt trên thiết bị đã khai báo → không dùng được | **`A9` đạt** ở kích thước fixture · `A10` chưa đo |
| Mất nét committed → không dùng được (`NFR-PERF-003` cấm) | chưa kết luận — dữ liệu thô: 0 mẫu không tính được trong 20 nét commit; bài đo `A10` theo kịch bản chưa chạy |
| Không ứng viên nào đạt → `NEGATIVE_RESULT`, leo thang | chưa tới bước đó |

---

## Việc tiếp theo

1. ~~**Zoom/pan** → `A2`~~ ✅ 14/09 · ~~**brush** → `A3` `A4` `A5` `A6` `A7`~~ ✅ 15/09 · tiếp: **lưu/tải lại** →
   `A8` (chặng S6) và bài đo theo kịch bản cho `A10`/`A11`
2. ~~**Chạy 60 ca `brush_cases.json`** → `A5`~~ ✅ 15/09 — sai số toàn (0, 0), **dung sai đề xuất 0 pixel nguồn**;
   đưa vào hợp đồng hình học khi Vũ Hùng Anh nâng phiên bản (`DR-013`)
3. **Đo lại `A9` ở kích thước slice thật** khi Spike D `A6` có kết quả
4. Dựng ứng viên thứ hai để `A12` so sánh được
5. Nhả Galaxy A17 cho Nguyễn Gia Đức Trung — profile DR-006 và baseline `A9` đã xong, phần còn lại là
   việc desktop

**Liên quan:** [`TASK.md`](TASK.md) · [`DR006_DEVICE_PROFILE.md`](DR006_DEVICE_PROFILE.md) ·
[`EVIDENCE_TEMPLATE.md`](EVIDENCE_TEMPLATE.md) · [`../../../spikes/spike_a_2d/`](../../../spikes/spike_a_2d/)
