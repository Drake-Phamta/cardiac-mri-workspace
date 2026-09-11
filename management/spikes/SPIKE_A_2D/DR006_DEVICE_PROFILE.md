# DR-006 — DEVICE PROFILE · Samsung Galaxy A17 5G

> # ⚠ TEMPLATE RỖNG — CHƯA CÓ SỐ ĐO NÀO
>
> **Mọi trường dưới đây là `[CAPTURE]`.** Project Control **không điền bất kỳ giá trị nào** — SCQ-09 và
> `TASK.md` §"Bằng chứng KHÔNG được bịa" cấm tôi sinh ra thông số thiết bị, và spec **cố ý không ghi**
> RAM / chipset / GPU / độ phân giải của A17 chính là để buộc phải đọc từ máy thật.
>
> **Người chụp: Phạm Tuấn Anh, từ chính thiết bị.** Emulator **không** được chấp nhận.

| Mục | Giá trị |
|---|---|
| **Spike** | `SPIKE_A` — 2D scientific viewer / brush interaction |
| **Quyết định liên quan** | **DR-006 ✅** (thiết bị demo) · DR-003a (overlay) |
| **Người chụp** | Phạm Tuấn Anh |
| **Ngày giờ chụp** | `[CAPTURE]` |
| **Slot đo thiết bị** | **1 / 3** — thứ tự `A → E → B` (tu chính, xem cutover record §4.3) |
| **Trạng thái** | `[CAPTURE]` → `HOÀN TẤT` khi mọi trường có giá trị hoặc `NOT MEASURED — <lý do>` |

> **Profile này là tiền đề của CẢ Spike A, Spike B VÀ Spike E.** Ba spike đều đo trên đúng thiết bị này,
> nên mọi kết quả của cả ba sẽ được đọc dựa trên cấu hình ghi ở đây. Xong nó thì nhả máy cho
> Nguyễn Gia Đức Trung (GATE 2).

---

## 0 · Chuẩn bị

```bash
adb devices          # phải thấy đúng một thiết bị ở trạng thái "device"
```

Không thấy máy → bật **Developer options** → **USB debugging** trên A17, cắm lại, chấp nhận hộp thoại
`Allow USB debugging` hiện trên màn hình điện thoại.

**Quy tắc điền:** đọc được thì dán **nguyên văn output**, đừng diễn giải hay làm tròn. Không đọc được thì
ghi **`NOT MEASURED — <lý do cụ thể>`**. Đó là trung thực và được chấp nhận; bịa một giá trị trông hợp lý
thì không.

---

## 1 · Định danh thiết bị

```bash
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
adb shell getprop ro.product.device
adb shell getprop ro.serialno
```

| Trường | Giá trị |
|---|---|
| Manufacturer | `[CAPTURE]` |
| **Model identifier** | `[CAPTURE]` |
| Device codename | `[CAPTURE]` |
| Serial *(có thể rút gọn nếu ngại lộ)* | `[CAPTURE]` |

---

## 2 · Android version và build

```bash
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell getprop ro.build.display.id
adb shell getprop ro.build.date
```

| Trường | Giá trị |
|---|---|
| **Android version** | `[CAPTURE]` |
| API level | `[CAPTURE]` |
| **Build ID** | `[CAPTURE]` |
| Build date | `[CAPTURE]` |

---

## 3 · RAM / performance profile

```bash
adb shell cat /proc/meminfo | head -5
adb shell getprop dalvik.vm.heapgrowthlimit
adb shell getprop dalvik.vm.heapsize
```

| Trường | Giá trị |
|---|---|
| **MemTotal** | `[CAPTURE]` |
| MemAvailable lúc chụp | `[CAPTURE]` |
| Heap growth limit per app | `[CAPTURE]` |
| Heap size max | `[CAPTURE]` |

> Heap limit quan trọng với Spike A và B: volume MRI và mesh đều lớn, và giới hạn heap của một app
> Android quyết định chiến lược nạp — nó là dữ kiện đầu vào cho `NFR-PERF-001` chứ không phải chi tiết vặt.

---

## 4 · CPU

```bash
adb shell getprop ro.board.platform
adb shell getprop ro.hardware
adb shell cat /proc/cpuinfo | grep -E "Hardware|processor" | tail -20
adb shell cat /sys/devices/system/cpu/possible
```

| Trường | Giá trị |
|---|---|
| **Platform / chipset** | `[CAPTURE]` |
| Hardware string | `[CAPTURE]` |
| Số core | `[CAPTURE]` |
| Ghi chú cluster *(nếu đọc được)* | `[CAPTURE]` |

---

## 5 · GPU

```bash
adb shell dumpsys SurfaceFlinger | grep -i -A2 "GLES"
```

| Trường | Giá trị |
|---|---|
| **GPU renderer** | `[CAPTURE]` |
| GL vendor | `[CAPTURE]` |
| GL version | `[CAPTURE]` |

> Trường này là đầu vào trực tiếp cho Spike B (`B10` ≥20 FPS median, `B11` không stall >500 ms).

---

## 6 · Màn hình — độ phân giải và refresh

```bash
adb shell wm size
adb shell wm density
adb shell dumpsys display | grep -iE "fps|refresh|DisplayDeviceInfo" | head -10
```

| Trường | Giá trị |
|---|---|
| **Resolution** | `[CAPTURE]` |
| Density (dpi) | `[CAPTURE]` |
| **Refresh rate** | `[CAPTURE]` |
| Có chế độ refresh thay đổi không? | `[CAPTURE]` |

> **Refresh rate là trần cứng của `NFR-PERF-002`.** Nếu màn hình chạy 90 Hz hay 120 Hz thay vì 60 Hz thì
> con số "≥20 FPS median" được đọc trong ngữ cảnh khác — và nếu máy tự hạ refresh khi tiết kiệm pin thì
> phải ghi lại, vì nó làm sai lệch phép đo của Spike B.

---

## 7 · Cấu hình test chính xác

Đây là phần hay bị bỏ qua nhất, và là phần khiến số đo có thể tái lập được hay không.

```bash
adb shell dumpsys battery
adb shell settings get global low_power
adb shell settings get system screen_brightness
adb shell settings get system screen_brightness_mode
adb shell dumpsys thermalservice | head -20
adb shell dumpsys activity activities | grep -E "ResumedActivity|mResumedActivity"
```

| Trường | Giá trị |
|---|---|
| **Build type của app đo** | `[CAPTURE]` — phải là **release**, không phải debug |
| Mức pin lúc đo | `[CAPTURE]` |
| Đang cắm sạc? | `[CAPTURE]` |
| **Power saving mode** (`low_power`) | `[CAPTURE]` |
| **Brightness** + auto hay manual | `[CAPTURE]` |
| **Thermal status lúc bắt đầu** | `[CAPTURE]` |
| **Thermal status lúc kết thúc** | `[CAPTURE]` |
| **Có quan sát thấy throttling không?** | `[CAPTURE]` |
| App nền đang chạy | `[CAPTURE]` |
| Chế độ mạng lúc đo | `[CAPTURE]` |

> **Thermal và throttling phải ghi cả đầu và cuối.** Một bài đo 30 bước trên máy đã nóng cho kết quả
> khác hẳn máy nguội, và nếu không ghi thì sau này không ai biết vì sao hai lần đo lệch nhau.

---

## 8 · Hệ quả cho ba spike dùng máy

Điền sau khi đã có số ở trên. Đây là phần **phân tích**, và nó chỉ hợp lệ khi dựa trên số thật.

| Spike | Điều profile này cho biết |
|---|---|
| **SPIKE_A** | `[CAPTURE]` — heap limit và CPU ảnh hưởng thế nào tới `A9` (p95 ≤ 200 ms) và `A10` (brush ≤ 100 ms) |
| **SPIKE_B** | `[CAPTURE]` — GPU và refresh rate ảnh hưởng thế nào tới `B10` (≥20 FPS) và `B11` (không stall >500 ms) |
| **SPIKE_E** | `[CAPTURE]` — RAM và chế độ mạng ảnh hưởng thế nào tới `E7` (memory footprint) và đường đo cellular |

---

## 9 · Ký nhận của người chụp

```
Người chụp:  Phạm Tuấn Anh

Tôi xác nhận mọi giá trị trong tài liệu này được đọc TRỰC TIẾP từ Samsung Galaxy A17 5G thật,
không phải emulator, không suy diễn từ thông số công bố của nhà sản xuất, và không có giá trị
nào được ước lượng. Trường nào không đọc được đã ghi NOT MEASURED kèm lý do.

Chữ ký: ______________________     Ngày: ______________     Giờ: ________
```

---

## 10 · Sau khi xong

1. Commit file này lên nhánh `spike/SPIKE_A`
2. Mở PR, title mang ID spike, reviewer **Vũ Hùng Anh** *(hàng đợi vị trí 2, sau Spike D — D là P0)*
3. **Nhả Galaxy A17 cho Nguyễn Gia Đức Trung** và báo Project Control để ghi bàn giao vào
   `day01/DAY01_STATUS.md`
4. Tiếp tục harness Spike A trên fixture tổng hợp — phần đó không cần máy

**Liên quan:** [`TASK.md`](TASK.md) · [`EVIDENCE_TEMPLATE.md`](EVIDENCE_TEMPLATE.md) ·
[`../../day01/DAY01_CUTOVER_RECORD.md`](../../day01/DAY01_CUTOVER_RECORD.md) ·
[`../../day01/tasks/DAY01_PHAM_TUAN_ANH.md`](../../day01/tasks/DAY01_PHAM_TUAN_ANH.md)
