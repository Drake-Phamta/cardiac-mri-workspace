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
| **A9** | **Slice-switch đã cache, 30 bước, p95 ≤ 200 ms** | **ĐÃ ĐO — đạt ngưỡng, phạm vi hạn chế** | **p95 = 65,31 ms**. Xem §Kết quả A9 |
| A10 | Phản hồi brush ≤ 100 ms, 0 nét mất | `NOT MEASURED` | chưa dựng brush — chặng S5 |
| A11 | Tách gesture sửa vs điều hướng | `NOT MEASURED` | chặng S7 |
| A12 | Chi phí phát triển mỗi ứng viên | **một phần** | Xem §A12 |

**3 tiêu chí có dữ liệu · 9 tiêu chí `NOT MEASURED`.** Không ô nào bỏ trống và không ô nào được đoán.

---

## Kết quả A9 — slice-switch đã cache

**Bài test 30 bước, chuỗi cố định** (8 bước tiến, 8 bước lùi, 8 bước nhảy, 6 bước tiến).
Dữ liệu thô: [`EVIDENCE_RAW/a9_slice_switch_20260911T140919+0700.json`](../../../spikes/spike_a_2d/EVIDENCE_RAW/)

| Phép đo | n | min | p50 | p95 | max |
|---|---:|---:|---:|---:|---:|
| **ms tới frame hiển thị** | 30 | 33,01 | 34,21 | **65,31** | 65,41 |
| ms tới decode xong | 30 | 18,78 | 22,62 | 46,94 | 48,64 |

**Ngưỡng `NFR-PERF-001`: p95 ≤ 200 ms. Đo được 65,31 ms — dưới ngưỡng, dư khoảng 3 lần.**

**Định nghĩa đang đo là gì**, vì con số không có nghĩa nếu thiếu định nghĩa:
- `ms_to_frame` = từ lúc state đổi đến **frame đầu tiên vẽ xong sau khi ảnh decode**. Spec nói *"update
  the **visible** slice"* nên đây là con số trung thực.
- `ms_to_load` = tới lúc decode xong. Giữ lại để thấy tách bạch decode và paint.
- Percentile **nearest-rank**, không nội suy, **không loại outlier**.

### Điều kiện đo

Build **RELEASE** (`--variant release`, APK 68.815.824 byte, `flags=0x0` — không có `FLAG_DEBUGGABLE`).
Thermal status **0 trước và sau**, không throttling. Pin 80→79%, cắm USB nhưng **status 4 =
`NOT_CHARGING`** nên không có nhiệt do sạc. Brightness **manual 128** (auto đã tắt trước khi chạy).
Refresh **60 Hz** suốt bài. Chỉ harness ở foreground.

### ⚠ Bốn giới hạn phạm vi — đọc trước khi dùng con số này

1. **Fixture là 64×64. Kích thước slice LGE MRI thật CHƯA BIẾT** — Spike D tiêu chí `A6` mới ghi phân bố
   shape của cohort. Nên **65,31 ms là chặn dưới, không phải bằng chứng ở kích thước dữ liệu thật.**
   **`A9` phải đo lại khi `A6` của Spike D có kết quả.**
2. **Nửa sau của `A9` — *"không full-volume transfer mỗi gesture"* — `NOT MEASURED`.** Fixture nằm local,
   chưa có đường mạng nào. Nửa đó thuộc về Spike E.
3. **Một lần chạy 30 bước.** Tiêu chí đòi bài 30 bước nên số mẫu đúng yêu cầu, nhưng một lần chạy không
   mô tả được biến động giữa các lần.
4. Ảnh decode từ PNG đã encode sẵn, giữ trong bộ nhớ. Viewer thật decode từ ổ đĩa hoặc mạng theo yêu cầu
   sẽ khác.

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
