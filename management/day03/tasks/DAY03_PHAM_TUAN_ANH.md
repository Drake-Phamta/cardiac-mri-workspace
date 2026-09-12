# DAY 3 — Phạm Tuấn Anh · 2026-09-12

> **Hai vai:** Project Control + chủ sở hữu Spike A.
> Đêm qua bạn đã gỡ bế tắc bên ngoài lớn nhất của dự án. Hôm nay việc quan trọng nhất **không phải
> của bạn** — nó là của ba người kia. Vai của bạn hôm nay chủ yếu là **đừng chặn họ** và **đừng làm
> hộ nữa**.

---

## PHẦN I — `NOW`, 10 phút, mở khoá người khác

### ① Gửi `INC-001` và bốn packet Day 3 cho cả nhóm

Tin nhắn nhóm gợi ý:

> Gói dataset đã tải xong và verify đêm qua (100 + 54 case). Trigger DR-001 **không nổ**.
> Dụng cụ cho cả bốn spike đã dựng sẵn — mỗi người có một PR để review, chính là dụng cụ của mình.
> Việc hôm nay: <link `day03/tasks/`>
> Có một bản ghi về hôm qua để cả nhóm rút kinh nghiệm: <link `INC-001`>
> Luật mới từ hôm nay: **khai báo khả dụng trước 09:00**, một dòng là đủ.

### ② ~~Ký §9 profile DR-006~~ — ✅ **XONG** 2026-09-12 00:25

Đã tick theo xác nhận bằng lời của anh, và **đường ký ghi rõ ngay trong §9**: anh xác nhận trong
chat, Project Control gõ vào file. Không phải chữ ký điện tử, và bản ghi nói đúng như vậy.

### ③ Quyết PR #13

Mở **9 giờ**, reviewer `scalliontor`, 0 review. Hai đường:

- Đợi Hùng Anh review hôm nay — packet của cậu ấy đã liệt kê nó là việc ưu tiên
- Merge và ghi trung thực "không có review", như đã làm với #1 #3 #5 #6 #9

**Đừng để nó treo tiếp sang ngày thứ ba.**

---

## PHẦN II — Spike A · đo lại `A9`, và lý do nó gấp

### ④ Con số `A9` hiện tại không còn đại diện

`RESULT.md` ghi `A9` p95 = **65,31 ms**, đo trên fixture **64×64**, kèm giới hạn phạm vi bạn đã viết
sẵn: *"Kích thước slice LGE MRI thật CHƯA BIẾT… `A9` phải đo lại khi `A6` của Spike D có kết quả."*

**Đêm qua đã biết: `576×576`, có case `640×640`.**

```text
64 × 64    =      4 096 pixel
576 × 576  =    331 776 pixel     →  81 lần
640 × 640  =    409 600 pixel     → 100 lần
```

Giới hạn phạm vi đã viết sẵn nên bản ghi vẫn trung thực. Nhưng nó chuyển từ *"đo lại khi có dữ
liệu"* sang **"đo lại ngay, dữ liệu đã có"**.

### ⑤ Cách đo lại

```bash
# 1 · sinh lai fixture o kich thuoc that
cd spikes/spike_a_2d/fixtures
python generate.py --shape 576,576,16       # neu generate.py chua nhan --shape thi sua NX,NY

# 2 · build release, KHONG phai debug
cd ../app && npx expo run:android --variant release

# 3 · chot dieu kien do, giong het lan truoc de hai so so duoc
adb shell settings put system screen_brightness_mode 0
adb shell settings put system screen_brightness 128
adb logcat -c

# 4 · bam nut chay 30 buoc, roi
cd ../harness && python extract_timings.py --label "576x576 that, release, ..."
```

**Ghi thermal / pin / refresh trước và sau**, như lần trước.

> Nếu `A9` ở kích thước thật **trượt** ngưỡng 200 ms thì **đó là một kết quả hợp lệ và có giá trị** —
> nó cho `GATE-MOB-01` biết điều gì đó thật về React Native. Không nới ngưỡng. `NFR-PERF-001` đóng
> băng.

### ⑥ Fixture tạm của Spike A sẽ được thay

Hùng Anh có thể công bố format bộ canonical hôm nay. Khi đó `spikes/spike_a_2d/fixtures/` phải
chuyển sang tiêu thụ bộ của cậu ấy. **Đừng ghi vào `tests/fixtures/geometry/**`** — đó là của cậu ấy.

---

## PHẦN III — Project Control

### ⑦ ~~Tu chính hàng đợi thiết bị~~ — ✅ **XONG**, và nó đã được sửa MỘT LẦN NỮA

**`DR-006a` đã ghi** trong `OPEN_DECISIONS.md` Part 2b. Nhưng bản đầu của nó **sai một chỗ quan
trọng**, và anh là người chỉ ra: nó ghi *"buổi đo có hẹn để chủ sở hữu tự bấm"* là đường ưu tiên —
trong khi cả nhóm **ở xa nhau** nên đường đó không tồn tại. Tôi viết một phương án ưu tiên mà không
kiểm xem nó có khả thi.

**`DR-006a` revision 1** thay bằng mô hình thật, và **mở rộng sang cả Spike B và F** — vì nếu không
ai tới được máy thì `B10` `B11` `F7` cũng vướng y hệt, không riêng Spike E.

> **Hệ quả tốt:** dưới mô hình mới, **anh KHÔNG phải rút khỏi vai reviewer nữa**. Việc chuyển Spike E
> sang Hùng Anh **đã được hoàn tác** — tiền đề của nó là anh sẽ tạo ra bằng chứng, mà giờ anh không.
> Hùng Anh trở lại **bốn** suất review thay vì năm.
>
> Cả hai lần chuyển vẫn nằm trong `SPIKE_PHASE_STATE.yaml` → `reassignments`, không xoá.

> ⚠ **Một lỗi tôi phải báo:** commit ghi lý do cho lần đổi reviewer đầu tiên **vào nhầm nhánh
> `spike-b`** lúc 00:31 thay vì `main`. Nên trong vài giờ, `main` mang thay đổi reviewer **mà không
> có lý do kèm theo**, nằm ngay dưới một cờ ghi *"không đổi reviewer"*. Đã gộp về `main` và ghi lại
> trong `commit_hygiene_note`.

### ⑦b · **Mở buổi đo từ xa** — thứ thay thế cho "bàn giao máy"

Đây là **mô hình chính** từ `DR-006a` revision 1: chủ sở hữu tự bấm từ xa, anh chỉ cung cấp thiết bị.

```powershell
# tren may anh, khi bat dau buoi do
adb kill-server
adb -a -P 5037 nodaemon server        # nghe tren moi interface, gom ca ZeroTier

# chu so huu, tren may ho:
#   export ANDROID_ADB_SERVER_ADDRESS=10.134.129.145
#   adb devices        -> phai thay R5CY931SQ...
```

> ⚠ **Bề mặt bảo mật — ghi lại chứ không lờ đi.** adb server nghe trên overlay thì **bất kỳ ai trên
> mạng ZeroTier đó cũng điều khiển được máy anh**. Overlay có xác thực và chỉ thành viên (DR-003a),
> nên phơi bày giới hạn trong nhóm — nhưng nó có thật. **Mở theo buổi, `adb kill-server` ngay sau
> khi xong**, và ghi lại buổi đó.

**Vì sao kênh điều khiển đi USB chứ không đi overlay:** nếu điều khiển cũng đi qua cellular + overlay
thì nó **làm nhiễm đúng đường `E1` đang đo**. Đi USB thì Wi-Fi điện thoại tắt, traffic đo đi cellular
thật.

### ⑦c · Overlay — đã verify, còn thiếu đúng hai mắt xích

Đêm qua xác minh: Mac mini **sống và tới được** (`10.134.129.115`, ping 20/20, chữ ký cổng macOS).
Còn thiếu: **stub chưa chạy** (cổng 8787 đóng) — việc của Trung hôm nay — và **ZeroTier trên điện
thoại** chưa cần nữa, vì mô hình từ xa dùng USB làm kênh điều khiển.

### ⑧ Theo dõi hàng đợi review

**5 PR mở, 0 review.** Bốn trong số đó là dụng cụ dựng cho từng người, gán reviewer là **chính chủ
sở hữu spike** — cố ý, để ép họ đọc dụng cụ trước khi dùng (`14` §6).

Nếu tới chiều vẫn 0 review thì đó là dấu hiệu sớm cho ngày mai, không phải chuyện đợi tới EOD.

### ⑨ Cuối ngày

- Đóng khối `DAY 3` trong [`DAY_LOG.md`](../../DAY_LOG.md) — ô "Đã xong" **chỉ ghi khi có SHA / số PR
  / đường dẫn file**
- Viết `management/day03/DAY03_EOD_REVIEW.md` theo `15` §15
- Cập nhật `PROJECT_STATE.yaml`
- Kiểm 5 trigger `15` §18 — buffer vẫn **1 ngày**, mất thêm một ngày là **0**

---

## Acceptance hôm nay

```text
☐  INC-001 + bốn packet đã tới tay cả nhóm
☐  §9 profile DR-006 đã ký
☐  PR #13 đã quyết — merge hoặc có review
☐  A9 đo lại ở 576×576, hoặc ghi rõ vì sao chưa
☐  DAY03_EOD_REVIEW + DAY_LOG đóng ngày
```

## Leader KHÔNG được — hôm nay đặc biệt quan trọng

| Việc | Vì sao |
|---|---|
| **Làm hộ việc của ba người nữa** | Ngoại lệ đêm qua **hết hiệu lực khi Day 3 bắt đầu**. `INC-001` §4.5. Lặp lại là hỏng `TC-TEAM-001` vĩnh viễn |
| **Commit hay review dưới tài khoản người khác** | Chữ ký giả trong bản ghi công khai. Đã từ chối một lần, vẫn từ chối |
| **Điền ô `[RECORD]` mang tên người vắng mặt** | Bịa bằng chứng của người khác |
| **Đóng hai ô `NOT_CHECKED` của Khánh hay Trung** | Dữ kiện máy của họ. Project Control **không suy đoán thành sự thật** |
| Ghi vào `tests/fixtures/geometry/**` | DR-013 — của Hùng Anh |
| Nới `NFR-PERF-001` nếu `A9` trượt ở kích thước thật | Đóng băng. Trượt là **một kết quả** |
| Giữ máy khi không đo | `15` — nhưng xem ⑦, luật này cần tu chính |
| Chốt `GATE-MOB-01` trên riêng Spike A | Cần **cả A và B** |

---

**Liên quan:** [`../../day02/DAY02_EOD_REVIEW.md`](../../day02/DAY02_EOD_REVIEW.md) ·
[`../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md) ·
[`../../spikes/SPIKE_A_2D/TASK.md`](../../spikes/SPIKE_A_2D/TASK.md) ·
[`../../spikes/SPIKE_A_2D/RESULT.md`](../../spikes/SPIKE_A_2D/RESULT.md) · [`../../DAY_LOG.md`](../../DAY_LOG.md)
