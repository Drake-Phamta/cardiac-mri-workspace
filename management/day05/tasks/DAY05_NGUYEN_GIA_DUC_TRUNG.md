# DAY 5 — Nguyễn Gia Đức Trung · 2026-09-14

**Khai báo khả dụng trước 09:00** (`15` §5) — một dòng trong nhóm: hôm nay bạn có mấy tiếng.

**Khối lượng hôm nay:** phần chính **~4,5 h** · thêm ~1,5 h nếu còn thời gian.

> **Tối qua:** 4 review có nội dung (approve #14 #18 #22 — cả ba đã merge, #18 đưa CI lên `main`), yêu cầu sửa
> #23 đúng chỗ, và mở PR #24. Leader đã đo xong **lượt 4 theo đúng thiết kế mặc định của bạn: 171/171 ok** trên
> Wi-Fi + ZeroTier `DIRECT` (`DR-003b`), file 58 MB tải trọn cả 3 lần.

## 🔴 LÀM TRƯỚC — nợ tồn

> **Quy tắc của leader:** nợ làm **trước**; việc Day 5 chỉ bắt đầu sau khi xong khối này.

| # | Nợ | Giờ | Vì sao trước |
|---|---|---|---|
| **1** | **Review lại PR #23** — đã sửa đúng điểm bạn yêu cầu (`2ed3c64`) | ~20 ph | `aggregate.py` phải nhận `wifi-overlay` **trước khi** bạn tổng hợp lượt 4; nếu không, số Wi-Fi bị hạ thành "diagnostic" |

## Việc Day 5

| # | Việc | Giờ | Xong khi |
|---|---|---|---|
| **2** | **`aggregate.py` trên lượt 4** — `spike-e/evidence-20260913`, thư mục `20260913_run4`. Đây là ràng buộc (c) của `DR-006a` rev 2: **bạn** tổng hợp, leader không tính số nào | ~1,5 h | báo cáo tổng hợp commit trên nhánh của bạn |
| **3** | **Tái sinh payload theo dữ liệu thật.** PR #25 của Khánh đo được: volume là **`uint8`**, **69 case 576×576×88** và **85 case 640×640×88**. Payload hiện giả định `int16` 576×576×88 (58 MB); volume thật ~29 và ~36 MB. Sửa `payloads/generate.py` cho cả hai kích thước | ~2 h | PR, kèm manifest payload mới |
| 4 | Kế hoạch đo lại cho leader chạy: bao nhiêu lượt, **giờ nào trong ngày** để thấy dao động (`E8`), kích thước nào | ~30 ph | file ngắn trên nhánh của bạn |

**Lượt 4 vẫn có giá trị** cho đường truyền: độ trễ yêu cầu nhỏ, `E12`, độ ổn định. Chỉ những kết quả phụ thuộc
kích thước byte mới phải đo lại trên payload mới — leader chạy ngay khi PR payload merge.

## Nếu còn thời gian

- Nháp `RESULT.md` Spike E: khung `E10` `E11` `E13` *(~1,5 h)*. Giới hạn đã biết của harness Toybox:
  `ms_to_first_byte: null` — bạn phán có đủ không.

---

**Liên quan:** PR #23 · PR #24 · `spikes/spike_e_transport/EVIDENCE_RAW/20260913_run4/PROVENANCE.md`
*(nhánh bằng chứng)* · `OPEN_DECISIONS.md` → `DR-003b`, `DR-006a` rev 2
