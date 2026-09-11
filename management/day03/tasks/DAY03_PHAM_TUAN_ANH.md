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

### ② Ký §9 profile DR-006

Ô `☐ ĐÃ ĐỌC VÀ ĐỒNG Ý` trong
[`DR006_DEVICE_PROFILE.md`](../../spikes/SPIKE_A_2D/DR006_DEVICE_PROFILE.md) vẫn trống. Đây là
attestation của chủ sở hữu thiết bị, chỉ bạn tick được.

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

### ⑦ Tu chính hàng đợi thiết bị — nợ quản trị

Máy Galaxy A17 là **tài sản cá nhân của bạn** và không bàn giao. Mô hình `WIP-CONFLICT-02` — *"một
máy, một người giữ, bàn giao theo cổng"* — **không thực hiện được** với thiết bị không thuộc dự án.

Đêm qua đã ghi vào `SPIKE_PHASE_STATE.yaml` là `NOT_YET_AMENDED`, kèm lý do chưa chặn ai: `GATE 2`
của Trung dù sao cũng chưa mở.

**Phải giải quyết trước khi Trung đủ điều kiện vào `GATE 2`** — có thể là hôm nay nếu cậu ấy đóng
được hai ô phần cứng. Ba đường:

| Đường | Đánh đổi |
|---|---|
| **Buổi đo có hẹn, chủ sở hữu spike tự bấm** | Giữ nguyên luật *"executed by <tên>"*. Cần hai người cùng chỗ hoặc remote vào PC của bạn |
| Bạn vận hành, chủ sở hữu diễn giải | Cần tu chính đè hai câu trong `SPIKE_E_TRANSPORT/TASK.md`, và bạn phải **rút khỏi vai reviewer Spike E** |
| Hoãn tới khi cần thật | Hợp lệ, nhưng đừng để nó thành bất ngờ vào đúng lúc Trung sẵn sàng |

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
