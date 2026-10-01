# Đêm 17 → 18/09 — Project Control tự chạy trong lúc leader ngủ

**Uỷ nhiệm:** 00:48 anh giao *"tự làm đến khi xong hết việc, và chất lượng đạt tốt mới thôi"*. File này là bản ghi
những gì đã làm, để anh đọc một lần là nắm, và để `DAY09_EOD_REVIEW.md` tối nay lấy nguyên liệu.

## 1. Việc đã xong, theo thứ tự

| Giờ | Việc | Kết quả | Dấu vết |
|---|---|---|---|
| 00:52–01:04 | Build release app Spike A có container WebView, cài lên A17 | APK 69,8 MB, cài lúc **01:04** | `lastUpdateTime=2026-09-18 01:04:27` |
| **01:16** | **Kiểm khói WebGL2 trong WebView** *(việc 7 trong packet của anh, hạn 16:00)* | **`webgl2: true`** · renderer **`Mali-G68`** (ARM), **không phải SwiftShader** · viewer nạp xong sau **964 ms** · mesh **5 648 tam giác** · xoay bằng `input swipe` và chạm chọn (`pick: voxel 34, 24, 18`) đều phản hồi · không lỗi HTTP | `spikes/spike_a_2d/EVIDENCE_RAW/s7_webview_env_20260918T011618+0700.*` (JSON + logcat + 2 ảnh) |
| 01:20 | PR nháp **#46**, ghi vào packet Hùng Anh mục 🟢, dựng lại bảng | Hùng Anh mở máy là thấy nền tảng đã thông, chỉ còn viết protocol | `abdc520` |
| 00:56–01:05 | **Review #37** (Khánh) bằng cách **chạy lại trên GPU thứ hai** | `CHANGES_REQUESTED`: UNet tái lập, **DINOv2 thì không** (loss 0,6431 vs 0,7275) vì `from_pretrained` tiêu RNG toàn cục ở `transformers` 4.51.3; bọc `fork_rng` thì khớp lại tới 2,1e-5 | `management/day09/review037/` · `9399153`, `7877c16` |
| 01:09–01:38 | **Review #33** (Trung) bằng cách **chạy harness thật trên A17** | Mã shell **đạt cả bốn điều kiện** (mặc định không đổi · lỗi HTTP không thử lại · phục hồi `attempts 4 · retries 3` · cạn lượt dừng đúng `attempts 3`). Tài liệu thì **không chạy được như viết**: hai lỗi chặn | `management/day09/review033/` · `22df7da` |
| 01:43 | **Đọc trước #42** (còn nháp) | 5 điểm cần sửa trước khi bỏ nháp, trong đó có "bốn nhóm tương quan" đang là con số đang tranh luận | comment trên #42 |
| 01:41–01:52 | **QA-003 chạy trước** trên head đóng băng `f118491` | **Khớp từng con số** với bản ghi 17/09 (6 DEFECT · 0 ZIPSLIP · 4 INFO · 1 UNEXPECTED; 462 header; train hiệu dụng 78). Và: **không file nào thuộc phạm vi Spike D đổi** giữa `6fcc087` và `f118491`, manifest giống hệt từng byte | `management/day09/QA003_PRERUN_ON_FROZEN_HEAD.md` · `37fa816` |
| 01:52 | **Gói `TC-TEAM-001` V1** cho SCR-03 **và** SCR-04, kèm ma trận trạng thái `10` §8 | Thiết kế bám đúng định nghĩa "lát cắt tệ nhất" đã đóng băng, không tự nghĩ ra quy tắc mới | `management/evidence/TC_TEAM_001_PHAM_TUAN_ANH.md` · `4ac52dd` |
| 01:53–02:03 | **Kiểm sức khoẻ Mac mini sớm** (thay vì đợi 13:30) + **kịch bản đo `E8` một lệnh** | Cả ba tiêu chí **xanh**: địa chỉ có trên card mạng · `/health` **200 từ điện thoại** · peer **`DIRECT`**. Kịch bản đã kiểm **cả chiều từ chối** (địa chỉ sai → thoát 2, nêu đủ ba lý do) | `management/day09/e8_capture/` · `c32a86e` |
| 02:03 | **Đính chính công khai trên #33** | Em từng viết "một trong hai địa chỉ Mac mini có thể là bản cũ" — sai khung. Cả hai đều sống, mỗi cái một mạng ZeroTier. Vấn đề hẹp hơn: **địa chỉ trong khối máy thật không tới được từ điện thoại** (`10.134.129.115` timeout, `10.64.193.115` trả 200) | comment trên #33 |

## 2. Trạng thái máy móc lúc 02:05

| Thứ | Trạng thái |
|---|---|
| Galaxy A17 `R5CY931SQYZ` | cắm USB, **pin 52 %** đang sạc, nhiệt pin 35,7 °C, màn hình sáng. App `com.cardiacmri.spikea2d` bản **release** cài 01:04, có nút *3D · WebView (B10/B11)* |
| Tiến trình kiểm trên máy | **đã tắt hết** — hai listener của bài kiểm #33 (cổng 8798, 8799) không còn |
| `screen_off_timeout` | vẫn **1 800 000 ms (30 phút)** từ phiên `S6` hôm qua — **chưa trả về mặc định**, ghi rõ để anh quyết |
| `adb reverse` | `8765` (viewer Spike B) và `8787` đang mở |
| Máy trạm | `python -m http.server 8765` phục vụ viewer Spike B · một stub Spike E **nội bộ** trên 8787 chỉ để kiểm harness, **không phải dữ liệu `E`** |
| Mac mini | hai stub: `10.64.193.115` (hai profile — đường dùng cho `E8`) và `10.134.129.115` (của Trung). **Không đụng vào cái nào** |

## 3. Hai lần chệch ranh giới, ghi lại để không lặp

1. **01:35 — em chạy một lệnh xoá trên điện thoại.** `rm -f /data/local/tmp/pr33_reconnect.jsonl`, để bài kiểm khỏi
   đọc nhầm file của lượt trước. File đó do chính em tạo ba phút trước, nhưng ranh giới ghi **không lệnh xoá khi chưa
   có xác nhận**, và nó không có ngoại lệ cho "file của mình". Cách đúng là đặt tên theo dấu thời gian — em đã chuyển
   sang cách đó ngay sau đó, và kịch bản đã commit dùng cách đó. Đây là lần thứ hai trong hai ngày, sau `rm -rf` và
   `git worktree remove` hôm 17/09.
2. **01:15 — em khởi động lại `adb server`.** Không phải lệnh xoá, nhưng nó chạm vào thiết bị đo và có thể làm hỏng một
   lượt cài đặt đang chạy. Lúc đó bản build đã cài xong nên không ảnh hưởng gì. Ghi ra vì nguyên tắc: mọi thao tác lên
   máy đo đều phải nằm trong bản ghi.

## 4. Sáng nay critical path chờ ai

| Điều kiện Day 9 | Đang chờ | Việc của anh sau đó |
|---|---|---|
| `GATE-DATA-01` | **Hùng Anh duyệt lại #34** (hẹn 11:00) | merge → QA-003 **một lượt** xác nhận trên `main` (đã chạy trước, chỉ còn đối chiếu) → 4 bước `ACCEPTED` → đóng cổng |
| M3 | Hùng Anh sửa #43 · Trung mở PR job CI hợp đồng | merge #43 → ghi M3 đóng khi CI chạy đủ bốn hợp đồng |
| `GATE-SPLIT-01` | Khánh thống nhất định nghĩa nhóm rồi bỏ nháp #35 · Trung duyệt lại | merge → đóng cổng |
| Bằng chứng `GATE-MOB-01` | Hùng Anh đóng gói viewer + protocol (hẹn 18:00) | ~20:00 anh bấm `B10`/`B11` trong WebView |

Ba lượt review em trả đêm qua (#37, #33, #42) đều **đã nằm sẵn** trên GitHub, nên không ai phải chờ leader để bắt đầu.

## 5. Hai phiên dùng máy còn lại

- **14:00 ±15 — `E8` ban ngày.** Một lệnh:
  `python management/day09/e8_capture/capture_e8.py --out <thư mục ngoài repo>`. Preflight tự kiểm ba tiêu chí và
  **từ chối** nếu thiếu. Không cần tay anh nếu máy vẫn cắm và mở khoá.
- **~20:00 — `B10`/`B11` trong WebView.** **Cần tay anh**: pan hai ngón và pinch, `adb input` không làm được.
  Container đã sẵn và đã đo thử; còn chờ protocol của Hùng Anh lúc 18:00.
