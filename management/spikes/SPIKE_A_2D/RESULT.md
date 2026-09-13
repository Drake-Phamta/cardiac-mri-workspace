# SPIKE_A — RESULT

> **`RESULT.md` ≠ `ACCEPTED`.** File này là bản ghi công việc của chủ sở hữu. Nghiệm thu cần đủ bốn bước:
> owner → `EVIDENCE_READY` → reviewer `APPROVE` → CHAT E QA `PASS` → CHAT A chuyển trạng thái → `ACCEPTED`.
> Hiện tại spike đang ở **`ACTIVE`**, chưa yêu cầu review.

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
| A2 | Zoom/pan không đổi geometry mask nguồn | `NOT MEASURED` | chưa dựng zoom/pan — chặng S4 |
| A3 | Brush ADD chỉ sửa pixel đúng ý | `NOT MEASURED` | chưa dựng brush — chặng S5 |
| A4 | Brush ERASE chỉ sửa pixel đúng ý | `NOT MEASURED` | chưa dựng brush — chặng S5 |
| **A5** | **Brush mapping đúng pixel sau zoom/pan** | `NOT MEASURED` | **60 ca kiểm đã sẵn** trong `fixtures/brush_cases.json`, chưa chạy được vì chưa có brush |
| A6 | Undo tái lập trạng thái trước | `NOT MEASURED` | chặng S5 |
| A7 | Redo tái lập trạng thái đã undo | `NOT MEASURED` | chặng S5 |
| A8 | Save/reload tái lập đúng nét sửa | `NOT MEASURED` | chặng S5 |
| **A9** | **Slice-switch đã cache, 30 bước, p95 ≤ 200 ms** | **ĐÃ ĐO HAI LẦN — đạt ngưỡng ở cả hai** | `64×64`: **65,31 ms** · **`576×576` (thật): 50,23 ms**. Kèm phát hiện bộ nhớ **376 MB ngoại suy** cho 88 slice. Xem §Kết quả A9 |
| A10 | Phản hồi brush ≤ 100 ms, 0 nét mất | `NOT MEASURED` | chưa dựng brush — chặng S5 |
| A11 | Tách gesture sửa vs điều hướng | `NOT MEASURED` | chặng S7 |
| A12 | Chi phí phát triển mỗi ứng viên | **một phần** | Xem §A12 |

**3 tiêu chí có dữ liệu · 9 tiêu chí `NOT MEASURED`.** Không ô nào bỏ trống và không ô nào được đoán.

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
| Chưa đánh giá | brush latency, xử lý gesture, bộ nhớ ở kích thước slice thật |

**Chưa so sánh được với ứng viên nào khác** — mới dựng một ứng viên. Native Kotlin và Flutter chưa chạm
tới; Flutter còn chưa cài trên máy.

---

## Điều kiện thất bại — chưa cái nào kích hoạt

| Điều kiện | Trạng thái |
|---|---|
| `A5` sai mapping sau transform → ứng viên **không dùng được** | chưa đo |
| `A9` hoặc `A10` trượt trên thiết bị đã khai báo → không dùng được | **`A9` đạt** ở kích thước fixture · `A10` chưa đo |
| Mất nét committed → không dùng được (`NFR-PERF-003` cấm) | chưa đo |
| Không ứng viên nào đạt → `NEGATIVE_RESULT`, leo thang | chưa tới bước đó |

---

## Việc tiếp theo

1. **Zoom/pan** → `A2`, rồi **brush** → `A3` `A4` `A6` `A7` `A8` `A10`
2. **Chạy 60 ca `brush_cases.json`** → `A5`, xuất **phân bố sai số** và **đề xuất dung sai** — spec đóng
   băng không đặt dung sai cho brush mapping, spike này phải đề xuất
3. **Đo lại `A9` ở kích thước slice thật** khi Spike D `A6` có kết quả
4. Dựng ứng viên thứ hai để `A12` so sánh được
5. Nhả Galaxy A17 cho Nguyễn Gia Đức Trung — profile DR-006 và baseline `A9` đã xong, phần còn lại là
   việc desktop

**Liên quan:** [`TASK.md`](TASK.md) · [`DR006_DEVICE_PROFILE.md`](DR006_DEVICE_PROFILE.md) ·
[`EVIDENCE_TEMPLATE.md`](EVIDENCE_TEMPLATE.md) · [`../../../spikes/spike_a_2d/`](../../../spikes/spike_a_2d/)
