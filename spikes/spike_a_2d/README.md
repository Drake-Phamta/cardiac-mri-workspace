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
│   ├── brush_cases.json         60 ca (zoom, pan, touch) → pixel nguồn kỳ vọng
│   └── brush_ops.json           S5: 14 nét cọ kịch bản → pixel + SHA-256 kỳ vọng, undo/redo/reset, tập tô A5
├── app/                         Expo app — viewer + instrumentation
│   ├── viewerMath.js            toán transform thuần (S4)
│   ├── brushMath.js             logic cọ thuần, không React (S5)
│   └── persist.js               mã hoá run-length + checksum mask làm việc (S8)
├── harness/
│   ├── check_conformance.py     F1–F5 chạy được ngay; A2–A8 chờ đo trên máy
│   ├── test_viewer_math.mjs     F4 — viewerMath.js với tham chiếu độc lập
│   ├── test_brush.mjs           F5 — brushMath.js với brush_ops.json
│   ├── test_persist.mjs         F6 — persist.js, round-trip + bộ giải mã thứ hai (S8)
│   ├── extract_timings.py       logcat → phân bố → A9/A10
│   ├── extract_a2.py            logcat → A2
│   ├── extract_brush.py         logcat → A3–A7 (+ dữ liệu thô cho A10/A11)
│   └── extract_a8.py            logcat → A8, từ chối kết luận nếu không có vòng nạp lại NGUỘI
├── SESSION_S8.md                kịch bản phiên đo A8/A10/A11 — thứ tự bấm, lệnh, nơi ghi bằng chứng
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
cd fixtures && python generate.py                        # mặc định 64×64×16
cd fixtures && python generate.py --nx 576 --ny 576 --nz 88   # chặng S6: kích thước thật

# 2 · kiểm conformance không cần máy
cd ../harness && python check_conformance.py

# 3 · build và cài lên máy thật
cd ../app && npx expo run:android --variant release

# 4 · sau khi chạy bài 30 bước trong app, kéo số liệu về
cd ../harness && python extract_timings.py --label "release, sạc USB, 60Hz"

# 5 · A2 (chặng S4) — trên máy: "kiểm A2" → pinch + kéo vài lần → "kiểm A2" → "A2 tự động"
cd ../harness && python extract_a2.py --label "release, ..."

# 6 · A3–A7 (chặng S5) — trên máy: "kiểm A5" → "A3–A7 tự động" → vài nét cọ thật ở chế độ "Sửa"
cd ../harness && python extract_brush.py --label "release, ..."
```

### Chặng S6 — đo hai chính sách cache (quy trình đầy đủ)

Một build, **hai lượt đo**, chỉ khác đúng một biến: nút chính sách cache trong app.

```bash
# trước mỗi lượt: xoá buffer để hai lượt không trộn mẫu
python harness/extract_timings.py --clear

# app đang mở → chọn chính sách → chờ "Đang nạp cache slice…" biến mất
python harness/capture_conditions.py --phase before --out run_all_before.json

#   ↳ trên máy: bấm "chạy 30 bước (A9)", đợi chạy xong (~11 giây)

python harness/capture_conditions.py --phase after  --out run_all_after.json
python harness/extract_timings.py \
    --label "release, 576x576x88, cache=toàn bộ, sạc USB" \
    --meminfo-before run_all_before.json \
    --meminfo-after  run_all_after.json

# lặp lại y hệt với nút "cache: cửa sổ ±3"
```

**Vì sao phải `--clear` giữa hai lượt.** `extract_timings.py` đã tự giới hạn vào lượt cuối trong buffer, và
nó in ra khi thấy buffer chứa nhiều lượt. `--clear` là lớp phòng thứ hai, rẻ hơn là phải đọc lại bản ghi.

**Đọc kết quả thế nào.** Bản ghi tách **hai** p95, và tách có lý do:

| Trường | Nghĩa |
|---|---|
| `summary_ms_to_frame` | **mọi** bước — con số người dùng thật sự cảm thấy |
| `scope.summary_ms_to_frame_in_window` | chỉ những bước mà slice **đã nằm trong cache** — **đây mới là con số đối chiếu được với `NFR-PERF-001`** |
| `scope.summary_ms_to_frame_missed` | các bước nhảy ra ngoài cửa sổ — cache **miss**, *không* thuộc phạm vi `NFR-PERF-001` |

Với chính sách *toàn bộ* thì mọi bước đều in-window nên hai con số trùng nhau. Với *cửa sổ ±3* thì bài 30
bước có **22 hit và 8 miss** theo thiết kế: chuỗi điều hướng suy theo **bước di chuyển**, nên đoạn cuộn liền
kề vẫn nằm trong cửa sổ còn tám cú nhảy thì ra ngoài — đúng kiểu một người đọc lướt stack rồi nhảy.

⚠ **Gộp hai con số đó lại là sai phạm vi**, đúng loại lỗi bản ghi Day 7 mắc với `E4` của Spike E. Bản ghi để
chúng tách nhau và ghi rõ cái nào so được với cái gì.

**Không còn trường nào phải gõ tay.** `build_type` suy từ `__DEV__` do chính app báo; `conditions` và bộ nhớ
do `capture_conditions.py` đọc thẳng từ máy; chính sách cache, `nx/ny/nz` và chuỗi bước đọc từ dòng
`SPIKE_A_TIMING_RUN_START` của app. Một con số gõ tay là một con số có thể sai mà không ai kiểm được.

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

## Chặng S5 — brush (A3–A7)

**15/09.** Cọ chỉnh sửa trên **mask làm việc** — một bản chép theo từng slice của mask nguồn. Mask nguồn
(`MASK_BYTES`) chỉ được **đọc**, nên "kiểm A2" vẫn băm đúng các byte gốc. Ở S5 chưa có lưu, dòng trạng
thái luôn ghi **"chưa lưu"**; lưu/nạp lại là **chặng S8** bên dưới.

**Đã dựng**

- `app/brushMath.js` — toàn bộ logic cọ, **không import React**, test bằng node y như `viewerMath.js`:
  footprint, Bresenham, áp nét, rollback, lịch sử undo/redo/reset, diff theo hàng để vẽ, và hai hàm cho nút
  kiểm trên máy (`runA5`, `runOpsScript`).
- `app/App.js` — chỉ nối cử chỉ và UI vào `brushMath.js`. Thanh công cụ theo SCR-06: **Xem / Sửa**,
  **thêm / xoá**, **r 0 1 2 3 5**, **hoàn tác**, **làm lại**, **đặt lại…** (hỏi xác nhận trước). Chỗ mask làm
  việc khác nguồn được vẽ theo từng dải hàng, cùng transform với ảnh, đè lên overlay mask nguồn của S4:
  **xanh = thêm**, **đỏ = xoá**, chú giải "nguồn / thêm / xoá". Dòng trạng thái: chế độ, công cụ, cỡ, số nét,
  độ sâu hoàn tác / làm lại, "chưa lưu". Mọi tag log và payload của S4 **giữ nguyên**. Phần nút bên dưới
  viewport giờ cuộn được; viewport nằm ngoài ScrollView để tô và pinch không tranh với cuộn.
- `fixtures/brush_ops.json` — oracle do `generate.py` tính bằng một cài đặt Python **độc lập** (không chung
  code với app): 14 nét trên slice 0, 3, 8, 12, cả thêm và xoá, r = 0/1/2/3/5, cho bằng **toạ độ màn hình**
  dưới cả 5 hình học của `brush_cases.json`; có nét cắt biên đĩa, stamp bị cắt ở mép ảnh, mẫu ra ngoài ảnh
  rồi vào lại. Mỗi nét ghi pixel tâm, số và danh sách pixel đổi, SHA-256 slice trước/sau và SHA-256 cả khối;
  kèm đường undo, đường redo, hash sau undo-all / redo-all / reset, và tập pixel tô kỳ vọng của 60 ca A5 ở
  r = 0 và r = 2. Ba fixture cũ **giữ nguyên từng byte** — SHA-256 trước và sau khi sinh lại trùng nhau.
- `harness/test_brush.mjs` (**F5**) và `harness/extract_brush.py`.

**Quyết định thiết kế**

```text
pixel tâm     screenToSource (floor); null ngoài ảnh → mẫu đó không tô gì
footprint     {(x,y) : (x−cx)² + (y−cy)² ≤ r², 0 ≤ x < Nx, 0 ≤ y < Ny}, tính bằng pixel NGUỒN
              → zoom/pan không đổi được vùng một stamp phủ; r = 0 là đúng pixel tâm
nét           mẫu trong ảnh liên tiếp nối bằng đường Bresenham nguyên giữa hai pixel tâm (tính cả hai đầu),
              stamp footprint ở mọi pixel của đường; mẫu ngoài ảnh cắt đoạn — không nội suy qua vùng ngoài
giá trị       thêm ghi 1, xoá ghi 0, chỉ trên slice của nét trong mask LÀM VIỆC; mask nguồn không bao giờ bị ghi
lịch sử       một nét commit = một bước undo: slice, chỉ số pixel đã đổi, giá trị cũ, giá trị mới (chỉ pixel
              thật sự đổi); undo trả giá trị cũ, redo ghi lại giá trị mới, nét mới xoá redo;
              đặt lại chép lại mọi slice từ byte nguồn và xoá lịch sử
tách cử chỉ   "Xem": giữ nguyên S4 — không chạm nào ghi mask làm việc
              "Sửa": một ngón tô; hai ngón pinch/pan như S4 và không bao giờ tô;
              ngón thứ hai chạm giữa nét → nét bị rollback chính xác, không vào lịch sử, log committed: false
```

Đường Bresenham có trường hợp **hoà** phụ thuộc chiều vẽ. App dùng vòng lặp số nguyên tám octant;
`generate.py` viết cùng đường đó dưới dạng quy tắc làm tròn (trục chính đi từng bước, trục phụ làm tròn
nửa-lên theo chiều đi). Thứ tự mẫu trong nét cố định chiều, nên kết quả tất định; F5 so hai cách viết trên
625 đoạn.

**Cử chỉ bị hệ thống cắt ngang — góp ý review PR #27 (Vũ Hùng Anh).** S4 không có `onPanResponderTerminate`:
khi Android lấy mất cử chỉ, `gest.current` và vòng `requestAnimationFrame` sống sang cử chỉ sau và làm sai số
đo khoảng hở frame. Giờ release và terminate cùng đi qua một chỗ — xoá bản ghi cử chỉ **và huỷ callback frame
đang chờ**. Nét đang tô lúc bị terminate được rollback y như luật ngón thứ hai và log
`"committed": false, "end": "terminated"` (hai cách kết thúc còn lại: `"release"`, `"second_finger"`). Cử chỉ
bị cắt ngang không ghi `SPIKE_A_GESTURE` / `SPIKE_A_TAP`: bỏ nó ra chỉ làm số cử chỉ của A2 thận trọng hơn.
F5 có kiểm riêng (`TRM`): rollback do terminate giữ nguyên mọi hash slice và độ sâu lịch sử.

**Dung sai A5 đề xuất: 0 pixel nguồn cho các bộ ba fixture**, vì ánh xạ là một phép floor tất định — không
có chỗ cho "gần đúng". Tỷ lệ trúng offline báo **chính xác**: F5 cho 60/60 ở r = 0 và 60/60 ở r = 2, phân bố
(dx, dy) = (0,0) × 50, còn 10 ca ngoài ảnh không tô gì. Rung tay thật khi chạm là chuyện của **A10/A11**,
không phải của dung sai ánh xạ.

**Chạy F5** (không cần máy):

```bash
node harness/test_brush.mjs          # riêng F5, 14 kiểm
python harness/check_conformance.py  # F1–F5 một lượt
```

F5 lấy kỳ vọng từ `brush_ops.json` và băm bằng `node:crypto`, không bao giờ bằng `sha256Hex` của app. Mỗi kiểm
đã được chứng minh **có thể trượt**: 11 lỗi cố ý trên một bản sao `brushMath.js` (quy tắc hoà, biên footprint,
vẽ qua vùng ngoài ảnh, không nối mẫu, nét mới giữ redo, reset giữ undo hoặc redo hoặc không chép gì, rollback
/ undo / redo không làm gì) đều làm ít nhất một kiểm FAIL. F5 `ok` là **logic offline**, không phải A3–A7.

**Chạy trên máy** (bản release, chủ Spike A cầm máy):

1. Mở app, chờ cache nạp xong.
2. **"kiểm A5"** — 60 ca brush chạy qua đúng `strokeSample` mà ngón tay dùng, trên slice nháp, ở r = 0 và
   r = 2 → hai dòng `SPIKE_A_A5`.
3. **"A3–A7 tự động"** — `brush_ops.json` chạy trên bản nháp chép từ mask nguồn → 45 dòng `SPIKE_A_OPS` giữa
   `SPIKE_A_OPS_START` và `SPIKE_A_OPS_END`. Mask làm việc của người dùng không bị đụng.
4. **"Sửa"**, tô vài nét thật — thêm và xoá, vài cỡ, có nét sau khi zoom/pan (quay màn hình ca này, TASK.md
   đòi); đặt ngón thứ hai giữa một nét để thấy nét bị huỷ; thử hoàn tác / làm lại / đặt lại → các dòng
   `SPIKE_A_BRUSH`.
5. `python extract_brush.py --label "release, ..."` — script **tự tính lại** mọi kỳ vọng từ fixture bằng
   `hashlib`, không tin số "pass" của app, rồi ghi `EVIDENCE_RAW/a3_a7_brush_<stamp>.json` với `OBSERVED` /
   `INCOMPLETE` / `FAIL`. `operator` và `build_type` để dạng `[RECORD — …]`, điền tay.

`OBSERVED` chỉ khi một lượt "A3–A7 tự động" **đầy đủ** khớp ở mọi bước (nét, undo, undo-all, redo, redo-all,
reset) **và** "kiểm A5" khớp 60/60 ở cả r = 0 lẫn r = 2. Lệch một giá trị ở bất kỳ đâu là `FAIL`.

> ### ⚠ `feedback_ms` là proxy phía JS, không phải độ trễ đầu-cuối
>
> Mỗi mẫu đo từ `performance.now()` lúc vào handler PanResponder tới callback `requestAnimationFrame` đầu tiên
> sau khi overlay cập nhật. Thời gian hệ thống chuyển sự kiện chạm vào JS **không** nằm trong đó;
> `nativeEvent.timestamp` ở **đồng hồ khác** nên không được trộn vào. `samples_received` chỉ đếm mẫu tới được
> handler JS — mẫu bị gộp trước đó app không thấy. Các dòng `SPIKE_A_BRUSH` là dữ liệu thô cho A10/A11 sau
> này; `extract_brush.py` **không** kết luận A10/A11.

---

## Chặng S8 — lưu và nạp lại (A8)

**19/09.** `A8` là **"đúng mask đó quay lại"**, không phải "đã ghi được một tệp". Một vòng lưu→nạp lại làm
mất đúng một voxel đã sửa trông y hệt một lần thành công, và `11` cho reviewed mask một **checksum** chính
vì thế.

**Đã dựng**

- `app/persist.js` — mã hoá **run-length** mask làm việc kèm SHA-256 từng slice và hash cả khối. Không
  React, không filesystem: App.js làm I/O, file này chỉ biến mask thành byte và ngược lại.
- `app/App.js` — ba nút **`lưu`** · **`nạp lại`** · **`A8 tự động (5)`**, và một dòng khởi động báo có tệp
  từ lần chạy trước hay không. Ghi bằng `expo-file-system` vào `Paths.document` — **không** `Paths.cache`,
  vì cache là đúng thư mục hệ thống được phép xoá, và "tệp biến mất" sẽ là lỗi của harness chứ không phải
  của ứng viên.
- `harness/test_persist.mjs` (**F6**) và `harness/extract_a8.py`.
- [`SESSION_S8.md`](SESSION_S8.md) — kịch bản phiên đo, thứ tự bấm, lệnh, nơi ghi bằng chứng.

**Vì sao run-length chứ không phải byte thô.** 576×576×88 là **29,2 MB** voxel một byte, ~39 MB sau khi
base64 độn vào tệp văn bản. Ghi ngần ấy là đo JSON, không phải đo lưu trữ. Mask là nhị phân và liền vùng,
nên run là thứ **mọi cài đặt thật** sẽ lưu. F6 báo tỷ lệ nén thực trên fixture; phiên đo ghi tỷ lệ ở kích
thước thật.

> ### ⚠ Vòng "A8 tự động" KHÔNG kết luận được A8
>
> Năm vòng ấy chạy **trong cùng một tiến trình**: chúng chứng minh codec đúng và tệp đọc/ghi được, chứ
> không chứng minh bản sửa sống sót khi ứng dụng bị giết. `A8` thật cần một lần nạp lại **NGUỘI** —
> lưu → `adb shell am force-stop` → mở lại → `nạp lại`. Màn hình phải hiện chữ **`NGUỘI`**.
>
> `extract_a8.py` cưỡng chế đúng điều đó. Nó trả `INCOMPLETE` khi: không có vòng nguội nào · có vòng nguội
> nhưng log không chứa lần `lưu` nào ghi đúng `volume_sha256` ấy · bản lưu tương ứng là mask **chưa sửa**
> (round-trip mask nguồn sẽ pass mà không hề chạm tới một chỉnh sửa nào). Và trả `FAIL` khi bất kỳ vòng nào
> lệch checksum slice hoặc lệch hash khối — kể cả vòng nóng. Tám kịch bản này đã được kiểm bằng log tổng
> hợp trước phiên đo, chứ không phát hiện lúc đang cầm máy.

**Thời gian được báo cáo, không được phán xét.** Không yêu cầu đóng băng nào ràng buộc `save_ms` /
`reload_ms`, nên script in phân bố và để `RESULT.md` diễn giải; đặt ra một ngưỡng ở đây là bịa ra một
tiêu chí.

**Nạp lại xoá lịch sử hoàn tác.** Các nét trong lịch sử trỏ tới giá trị pixel không còn nằm trong buffer
nữa; replay một nét cũ sẽ ghi một giá trị cũ ngược vào reviewed mask.

**Chạy F6** (không cần máy):

```bash
node harness/test_persist.mjs
```

F6 so `persist.js` với **bộ giải mã thứ hai** viết ngay trong test (bung từng pixel) và với `node:crypto`,
không bao giờ với `sha256Hex` của app: round-trip 16 slice fixture, 7 hình dạng biên (toàn 0, toàn 1, xen
kẽ, bắt đầu bằng 1, một pixel ở mỗi đầu, rỗng), tài liệu bị cắt cụt phải bị **từ chối**, checksum hỏng phải
được **báo cáo chứ không ném lỗi**, và format lạ phải bị ném lỗi.

---

## Trạng thái tiêu chí

| | Tiêu chí | Trạng thái |
|---|---|---|
| **F1** | Fixture toàn vẹn — shape, checksum, trường DR-008a | **ok** |
| **F2** | Pixel kỳ vọng tính lại độc lập, 60/60 khớp | **ok** |
| **F3** | Marker định hướng đúng bốn góc trên **mọi** slice | **ok** |
| **F4** | Toán transform của app (`viewerMath.js`) — SHA-256, base64, 60 ca ánh xạ, zoom quanh điểm | **ok** 6/6 |
| **F5** | Logic cọ của app (`brushMath.js`) — thêm/xoá đúng tập pixel, 60 ca A5 ở r = 0 và 2, undo, redo, reset, rollback | **ok** 14/14 |
| **F6** | Mã hoá lưu trữ của app (`persist.js`) — round-trip, bộ giải mã thứ hai, biên, tài liệu cắt cụt, checksum hỏng | **ok** 12/12 |
| A1 | Slice render đúng, hiện `n / total` | một phần — xem `RESULT.md` |
| A9 | Slice-switch đã cache, 30 bước, p95 ≤ 200 ms | **đã đo hai lần** — xem `RESULT.md` |
| A2 | zoom/pan không đổi checksum mask gốc | **đã đo 14/09, `OBSERVED`** — 16/16 qua 3 lần kiểm, bản release · `EVIDENCE_RAW/a2_zoom_pan_*` |
| A3 A4 A5 A6 A7 | brush thêm/xoá · ánh xạ sau zoom/pan · undo/redo | **đã đo 15/09, `OBSERVED`** — A3 8/8 · A4 6/6 · A5 60/60 ở r = 0 và r = 2 · A6/A7 15/15 · bản release · `EVIDENCE_RAW/a3_a7_brush_*` |
| A8 | save/reload | **đã đo 19/09, `OBSERVED`** — **2 vòng NGUỘI** sau `am force-stop`, 16/16 checksum slice + hash khối trùng bản đã lưu, trên **hai tệp khác nhau**; thêm 5 vòng nóng 5/5 · `EVIDENCE_RAW/a8_save_reload_20260919T121906+0700.json` |
| A10 | brush feedback ≤ 100 ms, 0 mẫu commit mất | **đã đo 19/09, `OBSERVED`** — worst **30,48 ms**, 123 nét có commit, 0 mẫu mất · `EVIDENCE_RAW/a10_a11_brush_feedback_20260919T121906+0700.json` |
| A11 | tách cử chỉ, 0 sửa nhầm | **đã đo 19/09, `OBSERVED`** — 12 lần ngón thứ hai đều cuộn lại, 0 nét commit trong cử chỉ nhiều ngón · cùng tệp |
| A12 | chi phí phát triển | **chưa** — là số giờ, lấy từ nhật ký công việc, không phải từ một phiên đo |

**Phiên `S8`, 19/09 11:50–12:19** — bản ghi đầy đủ kèm điều kiện, giới hạn và **hai sai sót của Project
Control** trong phiên: [`EVIDENCE_RAW/SESSION_S8_RECORD.md`](EVIDENCE_RAW/SESSION_S8_RECORD.md).

> ⚠ **Fixture của mọi số trên là 64×64×16, không phải 576×576×88.** Tính *đúng từng byte* của `A8` không phụ
> thuộc kích thước; **dung lượng tệp và thời gian thì có**. Mọi phát biểu về hai thứ đó ở độ sâu thật là
> `NOT MEASURED`.
| **S6** | Cache có giới hạn — `A9` ở **độ sâu thật** với hai chính sách | **dụng cụ đã dựng 17/09** — xem §Chặng S6 |

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
