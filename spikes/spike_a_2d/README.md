# SPIKE_A — 2D viewer + brush harness

> ### THROWAWAY SPIKE CODE — không phải production
>
> Thư mục này tồn tại để **sinh bằng chứng** cho `GATE-MOB-01`, không phải để thành app.
> Ranh giới lấy từ [`../../management/spikes/SPIKE_A_2D/TASK.md`](../../management/spikes/SPIKE_A_2D/TASK.md):
> Spike A được viết trong `spikes/spike_a_2d/**`, **không** tạo module production
> (`mobile/`, `backend/`…), **không** viết `TECH_STACK_ADR.md`, và **không chọn hay đóng băng
> mobile framework** — `GATE-MOB-01` cần bằng chứng **cả Spike A và Spike B**.

**Ứng viên đang dựng:** React Native / Expo. Chọn đầu tiên vì nó là ứng viên **rủi ro nhất** ở đúng chỗ
spike quan tâm — `A10` brush ≤100 ms và `A9` p95 ≤200 ms đều đi qua bridge JS. Native Kotlin gần như
chắc chắn đạt nên **không phân biệt được gì**; RN đạt hay trượt mới là thông tin.

**Phiên bản chính xác** *(dữ liệu cho `A12`)*:

| | |
|---|---|
| Expo SDK | `~57.0.21` |
| React Native | `0.86.3` |
| React | `19.2.3` |
| Node | `v24.14.0` · npm `11.9.0` |
| JDK | 17 (Eclipse Adoptium) |
| Android SDK | platform 35/36 · build-tools 34.0.0 / 36.1.0 |
| Thiết bị | **SM-A176B**, Android 16 — xem [`DR006_DEVICE_PROFILE.md`](../../management/spikes/SPIKE_A_2D/DR006_DEVICE_PROFILE.md) |

---

## Cấu trúc

```text
spikes/spike_a_2d/
├── fixtures/
│   ├── generate.py              sinh fixture, deterministic, stdlib thuần
│   ├── volume_synthetic.json    64×64×16, giá trị voxel mã hoá toạ độ + marker định hướng
│   ├── mask_synthetic.json      đĩa nhị phân, biên rõ, label mapping ghi tường minh
│   └── brush_cases.json         60 ca (zoom, pan, touch) → pixel nguồn kỳ vọng
├── app/                         Expo app — viewer + instrumentation
├── harness/
│   ├── check_conformance.py     F1–F3 chạy được ngay; A2–A8 chờ app xuất mask
│   └── extract_timings.py       logcat → phân bố → A9/A10
└── EVIDENCE_RAW/                output thô từng lần chạy, có timestamp
```

---

## ⚠ Fixture ở đây là TẠM THỜI

Bộ **canonical geometry fixture** là deliverable của **Vũ Hùng Anh**, nằm ở
`tests/fixtures/geometry/**`. Theo `15` §9 đó là **vùng integration-sensitive, một chủ sở hữu tại một
thời điểm**, và DR-013 giao nó cho anh ấy. **Spike A tiêu thụ, không viết vào đó.**

Fixture trong thư mục này tồn tại **chỉ để Spike A bắt đầu được trước khi bộ của anh ấy có**, và sẽ được
thay ngay khi nó land. Mỗi file đều mang trường `_warning` nói rõ điều đó.

---

## Ràng buộc hình học — DR-008a, đóng băng

```text
voxel (x, y, z):   x = CỘT ảnh nguồn,  y = HÀNG ảnh nguồn,  z = CHỈ SỐ SLICE
shape_xyz = [Nx, Ny, Nz]           slice_index = z, hợp lệ 0..Nz-1
một slice có shape [Ny, Nx]
màn hình (u, v) → (x = u, y = v, z = slice_index)
gốc trên-trái, +x sang phải, +y xuống dưới
```

Thứ tự bộ nhớ của thư viện **không** thuộc hợp đồng. Buffer trong `generate.py` là row-major `[Ny][Nx]`
— đó là lựa chọn cài đặt, không phải hợp đồng; mọi thứ đọc nó phải đi qua `shape_xyz`.

Phép biến đổi app phải cài, viết **một lần** trong `brush_cases.json` để app và harness không trôi khỏi
nhau:

```text
source_x = (u - pan_x) / zoom
source_y = (v - pan_y) / zoom      làm tròn: floor
```

Floor vì pixel `(x,y)` phủ `[x, x+1) × [y, y+1)` dưới gốc trên-trái. Touch ngoài ảnh → **không được vẽ**.

---

## Cách chạy

```bash
# 1 · sinh lại fixture (chạy hai lần phải ra checksum giống hệt)
cd fixtures && python generate.py

# 2 · kiểm conformance không cần máy
cd ../harness && python check_conformance.py

# 3 · build và cài lên máy thật
cd ../app && npx expo run:android --variant release

# 4 · sau khi chạy bài 30 bước trong app, kéo số liệu về
cd ../harness && python extract_timings.py --label "release, sạc USB, 60Hz"

# 5 · A2 (chặng S4) — trên máy: "kiểm A2" → pinch + kéo vài lần → "kiểm A2" → "A2 tự động"
cd ../harness && python extract_a2.py --label "release, ..."
```

**Chặng S4 — zoom/pan (A2), 14/09.** Hai ngón = pinch-zoom quanh điểm giữa hai ngón; một ngón = kéo; chạm
nhẹ = hiện pixel gốc dưới ngón tay. Zoom/pan chỉ đổi **transform hiển thị** `{zoom, panX, panY}`; mask gốc
được giải mã một lần và **không đoạn code transform nào nhận nó**. Nút **"kiểm A2"** băm SHA-256 cả 16 slice
mask gốc và so với `slice_sha256` của fixture; `extract_a2.py` **tự tính lại** hash kỳ vọng bằng `hashlib`
chứ không tin con số "khớp" của app. A2 chỉ ghi `OBSERVED` khi có một lần kiểm **trước** mọi thao tác, ít
nhất **một pinch và một lần kéo thật**, rồi một lần kiểm **sau** — đều khớp 16/16. Mỗi thao tác còn ghi
**khoảng hở frame lớn nhất** (TASK.md: khựng > 500 ms). Toán transform nằm ở `app/viewerMath.js`, kiểm
offline bằng `node harness/test_viewer_math.mjs` (F4).

> ### ⚠ Phải là RELEASE BUILD
>
> `TASK.md` ghi rõ *"release-mode measurement required; debug builds distort timings"*. Debug build của
> RN chạy JS qua Metro và bật dev-mode check — số đo sẽ **sai lệch nặng và vô giá trị**.
> `--variant release` không phải tuỳ chọn, nó là điều kiện để số đo được tính là bằng chứng.

---

## Trạng thái tiêu chí

| | Tiêu chí | Trạng thái |
|---|---|---|
| **F1** | Fixture toàn vẹn — shape, checksum, trường DR-008a | **ok** |
| **F2** | Pixel kỳ vọng tính lại độc lập, 60/60 khớp | **ok** |
| **F3** | Marker định hướng đúng bốn góc trên cả 16 slice | **ok** |
| **F4** | Toán transform của app (`viewerMath.js`) — SHA-256, base64, 60 ca ánh xạ, zoom quanh điểm | **ok** 6/6 |
| A1 | Slice render đúng, hiện `n / total` | một phần — xem `RESULT.md` |
| A9 | Slice-switch đã cache, 30 bước, p95 ≤ 200 ms | **đã đo hai lần** — xem `RESULT.md` |
| A2 | zoom/pan không đổi checksum mask gốc | **đã dựng (S4, 14/09)** — chờ đo trên máy |
| A3 A4 A5 A6 A7 A8 | brush · undo/redo · save/reload · mapping sau zoom/pan | **chưa dựng** — chặng S5/S6 |
| A10 A11 A12 | brush latency · tách gesture · chi phí phát triển | **chưa** |

`F2` tồn tại vì `generate.py` và `check_conformance.py` **không dùng chung code**: generator ghi pixel kỳ
vọng, checker suy ra lại từ công thức trong fixture rồi so. Một cài đặt tự kiểm chính nó thì không chứng
minh được gì.

---

## Luật không đổi trong thư mục này

- **Không con số hiệu năng nào được viết tay.** `extract_timings.py` đọc mẫu thô từ logcat; không có
  mẫu thì nó **thoát với lỗi** chứ không in ra số.
- **Tiêu chí chưa kiểm ghi `NOT MEASURED — <lý do>`**, không bỏ trống và không đoán. Một checker báo
  `PASS` cho thứ nó chưa nhìn còn tệ hơn không có checker.
- **`RESULT.md` chỉ được tạo khi đã có bằng chứng thật.**
- **Mọi phép đo trên máy do chủ sở hữu chạy** — Project Control dựng harness và phân tích số, không sinh
  ra số.

**Liên quan:** [`TASK.md`](../../management/spikes/SPIKE_A_2D/TASK.md) ·
[`EVIDENCE_TEMPLATE.md`](../../management/spikes/SPIKE_A_2D/EVIDENCE_TEMPLATE.md) ·
[`DR006_DEVICE_PROFILE.md`](../../management/spikes/SPIKE_A_2D/DR006_DEVICE_PROFILE.md)
