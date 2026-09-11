# DR-006 — DEVICE PROFILE · Samsung Galaxy A17 5G

**Đã chụp từ máy thật.** Mọi giá trị dưới đây đọc trực tiếp qua `adb` từ thiết bị vật lý đang cắm, không
suy diễn từ thông số công bố của nhà sản xuất, không emulator.

| Mục | Giá trị |
|---|---|
| **Spike** | `SPIKE_A` — 2D scientific viewer / brush interaction |
| **Quyết định liên quan** | **DR-006 ✅** (thiết bị demo) · DR-003a (overlay) |
| **Chủ sở hữu thiết bị** | Phạm Tuấn Anh |
| **Ngày giờ chụp** | **2026-09-11, ~12:30 +07:00** |
| **Slot đo thiết bị** | **1 / 3** — thứ tự `A → E → B` (tu chính, cutover record §4.3) |
| **Cách chụp** | Lệnh `adb` chạy trên máy tính của leader, với A17 cắm USB và đã `authorized`. Xem §10 |
| **Trạng thái** | **HOÀN TẤT phần tĩnh.** Thermal cuối bài và cấu hình đo còn chờ lần chạy A9/A10 |

> **Profile này là tiền đề của CẢ Spike A, Spike B VÀ Spike E.** Ba spike đều đo trên đúng thiết bị này.

---

## 1 · Định danh thiết bị

| Trường | Giá trị |
|---|---|
| Manufacturer | `samsung` |
| **Model identifier** | **`SM-A176B`** |
| Device codename | `a17x` |
| Serial | `R5CY931SQ…` — *rút gọn có chủ đích, repo là public* |

---

## 2 · Android version và build

| Trường | Giá trị |
|---|---|
| **Android version** | **`16`** |
| API level | **`36`** |
| **Build ID** | `BP4A.251205.006.A176BXXS6CZG7` |
| Build date | `Wed Jul 15 16:57:30 KST 2026` |

---

## 3 · RAM / performance profile

| Trường | Giá trị |
|---|---|
| **MemTotal** | **`7 641 100 kB`** ≈ **7,29 GiB** |
| MemFree lúc chụp | `176 296 kB` |
| MemAvailable lúc chụp | `2 760 136 kB` ≈ 2,63 GiB |
| **Heap growth limit / app** | **`256m`** |
| Heap size max | `512m` |

> ⚠ **`dalvik.vm.heapgrowthlimit = 256 MB` là ràng buộc thật cho Spike A và B.** Một app Android bình
> thường bị chặn ở **256 MB heap**, kể cả khi máy có 7,29 GiB RAM. Volume MRI và mesh 3D không thể nạp
> toàn bộ vào heap Java — phải dùng native memory, memory-mapped file, hoặc nạp theo slice. Đây là dữ
> kiện đầu vào trực tiếp cho `NFR-PERF-001` và cho quyết định `GATE-MOB-01`, **không phải chi tiết vặt**.
>
> *(App có thể xin `android:largeHeap="true"` để lên `512m`, nhưng đó là quyết định kiến trúc cần ghi,
> không phải mặc định.)*

---

## 4 · CPU

| Trường | Giá trị |
|---|---|
| **Platform** | `erd8535` |
| **Hardware / SoC** | **`s5e8535`** |
| Số core | **8** (`/sys/devices/system/cpu/possible` → `0-7`) |
| Chi tiết cluster | `NOT MEASURED — /proc/cpuinfo trên Android 16 không expose model name per-core` |

---

## 5 · GPU

| Trường | Giá trị |
|---|---|
| **GPU renderer** | **`ARM Mali-G68`** |
| **OpenGL ES** | **`3.2`** |
| Driver | `v1.r38p1-01eac0-mbs2v41_0.8afb03e9a27ca831737e7b78bf21f6ee` |
| EGL | `1.4 Android META-EGL` |
| Protected context | hỗ trợ (`RenderEngine supports protected context: 1`) |

Có `GL_OES_texture_3D`, `GL_EXT_texture_buffer`, `GL_OES_texture_float_linear`, ASTC/ETC compression —
đều là thứ Spike B sẽ dùng khi nạp mesh và texture volume.

---

## 6 · Màn hình

| Trường | Giá trị |
|---|---|
| **Resolution** | **`1080 × 2340`** |
| Density | `450 dpi` (thực đo `386,366 × 385,948 dpi`) |
| **Refresh rate hỗ trợ** | **`[90.0, 60.0]` Hz** |
| **Refresh rate ĐANG chạy** | **`60.0` Hz** — `mActiveRenderFrameRate=60.0`, mode id 1 |
| Cutout | có, `Rect(470, 0 – 610, 100)` — notch giữa trên |
| Rounded corners | bán kính 110 px cả bốn góc |

> ⚠ **Máy hỗ trợ 90 Hz nhưng đang chạy 60 Hz.** Đây là phát hiện quan trọng nhất của mục này:
>
> - `NFR-PERF-002` đòi **≥20 FPS median**. Ở 60 Hz thì budget mỗi frame là **16,7 ms**; ở 90 Hz là
>   **11,1 ms** — cùng một đoạn code có thể đạt ở chế độ này và trượt ở chế độ kia.
> - Android **tự chuyển mode** theo nội dung và theo chế độ tiết kiệm pin. Nếu không **ghim** refresh
>   rate khi đo, hai lần chạy Spike B có thể ra hai kết quả mà không ai giải thích được.
> - **Spike B phải ghi rõ refresh rate đang hoạt động cho từng phép đo**, và nên ghim một mode cố định.
>
> Cutout và rounded corners ảnh hưởng tới vùng vẽ khả dụng của viewer — Spike A cần tính khi map toạ độ
> touch sang pixel nguồn (`A5`).

---

## 7 · Cấu hình lúc chụp profile

| Trường | Giá trị |
|---|---|
| Build type app đo | `NOT MEASURED — chưa có app; sẽ ghi ở lần chạy A9/A10, PHẢI là release` |
| **Mức pin** | `33 %` |
| **Đang cắm sạc?** | **CÓ — USB powered `true`**, AC `false`, status `2` (charging) |
| **Power saving** (`low_power`) | **`0` — TẮT** |
| **Brightness** | `149` / 255 · **`screen_brightness_mode = 1` → TỰ ĐỘNG** |
| **Nhiệt độ pin lúc chụp** | **`35,5 °C`** (`temperature: 355`) |
| **Thermal status lúc bắt đầu** | **`0`** — `THERMAL_STATUS_NONE`, không throttling |
| Nhiệt từ thermal HAL | `NOT MEASURED — HAL 2.0 connected nhưng "Current temperatures from HAL" trả về rỗng` |
| **Thermal status lúc kết thúc** | `[CAPTURE — điền sau khi chạy xong A9/A10]` |
| **Có throttling không?** | `[CAPTURE — điền sau khi chạy xong A9/A10]` |
| App nền đang chạy | `com.android.settings/.SubSettings` (chỉ Settings, máy rảnh) |
| **Mạng** | Viettel · **`LTE`** · `mDataConnectionState=2` (connected) · airplane mode `0` |

> ⚠ **Hai điều phải xử lý TRƯỚC khi đo A9/A10:**
>
> **1 · Auto-brightness đang BẬT** (`mode = 1`). Độ sáng tự thay đổi trong lúc chạy bài đo sẽ làm đổi
> công suất và nhiệt, khiến hai lần chạy không so được với nhau. **Chuyển sang manual và ghi giá trị cố
> định** trước khi đo:
> ```bash
> adb shell settings put system screen_brightness_mode 0
> adb shell settings put system screen_brightness 128
> ```
>
> **2 · Máy đang cắm sạc USB.** Sạc làm máy ấm lên và đổi hành vi thermal. Quyết định một lần rồi giữ
> nguyên cho **cả ba spike**: đo khi cắm sạc, hay đo khi dùng pin. Ghi lựa chọn đó vào từng bản evidence.
>
> **3 · Mạng đang là LTE, không phải 5G.** Không vi phạm gì — DR-003 ghi *"real 4G/5G cellular"*, và LTE
> là 4G hợp lệ. Nhưng **Spike E phải ghi công nghệ mạng thực tế cho từng phép đo**, vì latency 4G và 5G
> khác nhau đáng kể và `E8` đòi báo cáo độ tản.

---

## 8 · Hệ quả cho ba spike dùng máy

| Spike | Profile này cho biết gì |
|---|---|
| **SPIKE_A** | **Heap 256 MB** là ràng buộc cứng — không nạp cả volume vào heap Java, phải native/mmap/theo slice. 8 core và Mali-G68 đủ cho render 2D; rủi ro thật nằm ở **bộ nhớ** và ở việc map touch→pixel sau zoom/pan (`A5`) khi có cutout |
| **SPIKE_B** | **Mali-G68 + OpenGL ES 3.2** đủ tính năng. Nhưng **refresh 60/90 Hz thay đổi được** là rủi ro đo lường lớn nhất: `B10` ≥20 FPS median chỉ so sánh được khi refresh được ghim và ghi lại. Heap 256 MB cũng giới hạn ngân sách mesh — liên quan trực tiếp DR-008c |
| **SPIKE_E** | **7,29 GiB RAM tổng nhưng 256 MB heap/app** định hình `E7` (memory footprint per strategy). Mạng hiện là **LTE Viettel** — `E12` phải ghi direct-vs-relayed *và* công nghệ mạng cho từng phép đo |

---

## 9 · Ký nhận của chủ sở hữu thiết bị

```
Người chịu trách nhiệm:  Phạm Tuấn Anh

Mọi giá trị trong tài liệu này được đọc TRỰC TIẾP từ Samsung Galaxy A17 5G thật (SM-A176B,
serial R5CY931SQ…) đang cắm USB và ở trạng thái authorized, KHÔNG phải emulator, KHÔNG suy diễn
từ thông số công bố của nhà sản xuất, và KHÔNG có giá trị nào được ước lượng.

Trường không đọc được đã ghi NOT MEASURED kèm lý do — có 3 trường như vậy.

Xác nhận:  ☐ ĐÃ ĐỌC VÀ ĐỒNG Ý     Ngày: ______________     Giờ: ________
```

---

## 10 · Cách chụp — ghi để tái lập được

Thiết bị do **Phạm Tuấn Anh** cắm và authorize trên máy tính của chính anh
(`adb devices` → `R5CY931SQ…  device`). Các lệnh `adb` đọc giá trị **do Project Control chạy** trên cùng
máy đó, theo yêu cầu của leader, và **toàn bộ output là dữ liệu thật trả về từ thiết bị** — không có giá
trị nào do Project Control sinh ra.

Ranh giới giữ nguyên: **mọi phép đo hiệu năng — `A9` p95 slice-switch, `A10` brush latency, `B10` FPS,
`B11` stall, `E8` phân bố latency — vẫn do chủ sở hữu tự chạy trên máy thật.** Mục này chỉ là thuộc tính
tĩnh của thiết bị.

```bash
export PATH="$PATH:$LOCALAPPDATA/Android/Sdk/platform-tools"
adb devices
adb shell getprop ro.product.manufacturer; adb shell getprop ro.product.model
adb shell getprop ro.build.version.release; adb shell getprop ro.build.display.id
adb shell cat /proc/meminfo | head -3; adb shell getprop dalvik.vm.heapgrowthlimit
adb shell getprop ro.board.platform; adb shell cat /sys/devices/system/cpu/possible
adb shell dumpsys SurfaceFlinger | grep -i "GLES"
adb shell wm size; adb shell wm density; adb shell dumpsys display | grep -i "renderFrameRate\|supportedRefreshRates"
adb shell dumpsys battery | grep -iE "level|status|powered|temperature"
adb shell settings get global low_power; adb shell settings get system screen_brightness_mode
adb shell dumpsys thermalservice | head -20
```

---

## 11 · Việc tiếp theo

1. **Ghim brightness sang manual** và quyết định sạc/pin trước khi chạy A9/A10
2. **Ghim refresh rate**, hoặc ghi rõ mode đang hoạt động cho từng phép đo
3. Chạy baseline A9/A10 → điền hai ô thermal còn lại ở §7
4. **Nhả Galaxy A17 cho Nguyễn Gia Đức Trung** (GATE 2), báo Project Control ghi bàn giao
5. Tiếp tục harness Spike A trên fixture tổng hợp — không cần máy

**Liên quan:** [`TASK.md`](TASK.md) · [`EVIDENCE_TEMPLATE.md`](EVIDENCE_TEMPLATE.md) ·
[`../../day01/DAY01_CUTOVER_RECORD.md`](../../day01/DAY01_CUTOVER_RECORD.md) ·
[`../../day01/tasks/DAY01_PHAM_TUAN_ANH.md`](../../day01/tasks/DAY01_PHAM_TUAN_ANH.md)
