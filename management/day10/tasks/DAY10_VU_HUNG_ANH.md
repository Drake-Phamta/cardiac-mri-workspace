# DAY 10 — Vũ Hùng Anh · 2026-09-19

**Khối lượng hôm nay:** phần chính **≥ 8 h** *(bảng dưới cộng ~8 h)* · hàng đợi dự phòng ~1,75 h · **hạn: 23:59**.

> **Hôm qua bạn gỡ bốn nút thắt trong 25 phút** (14:50–15:15): approve #34 — lượt duyệt mở ra `GATE-DATA-01`, cổng đầu
> tiên của dự án đóng được — sửa #43 sạch cả hai lỗi, đẩy probe `B10`/`B11` chạy trong WebView, và **bắt được một lỗi
> phương pháp trong PR của leader** (#41 nói "một build, một biến" trong khi lượt 3 chạy sau khi build lại). Lượt bắt
> đó đúng và đã được sửa.
>
> **Hôm nay bạn giữ chìa khoá lớn nhất còn lại:** `GATE-MOB-01` **quá hạn từ Day 6** và chỉ đóng khi **Spike A và
> Spike B đều `ACCEPTED`**. Spike A đã gần xong. Spike B chỉ còn thiếu **diễn giải số của bạn**.

## 📌 Mới — quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng tới bạn |
|---|---|
| **Day 9 chốt `TRƯỢT` 1,5/4**, buffer **−2** | Điều kiện 4 ghi "nửa" vì số `B10`/`B11` đã đo nhưng chưa ai diễn giải. Việc 1 hôm nay khép nó lại |
| **`GATE-MOB-01` là mục tiêu ngày**: A + B `ACCEPTED` → leader viết `TECH_STACK_ADR` | Sau đó cả bốn vertical mới được dựng trên một nền tảng đã quyết, thay vì dựng trên giả định |
| **M5 bắt đầu bằng mã thật hôm nay** | Việc 5: PR hiện thực đầu tiên của V2, chạy trên fixture sinh từ hợp đồng API |

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **1** | **Diễn giải `B10`/`B11` vào `RESULT.md` Spike B.** Dữ liệu thô: nhánh `spike-b/evidence-20260918`, `EVIDENCE_RAW/b10_b11_20260918/` — **3 lượt `status: complete`**, mỗi lượt 1 800 khoảng frame, cùng một build, một lần tải trang, kèm `PROVENANCE.md`. Ghi số của bạn, kèm nhãn `OBSERVED` / `NOT MEASURED`, điều kiện thiết bị, và **giới hạn**: mesh synthetic level 0, một phiên. Theo protocol của chính bạn: `B10` đạt khi `median_fps ≥ 20` từng lượt, `B11` đạt khi `longest_stall_ms ≤ 500` và `frames_over_500ms = 0`. **Không ai tính hộ số này** | ~1 h | không | Mục `B10`/`B11` trong `RESULT.md` + JSON thô dẫn được |
| **2** | **Merge `main` vào #44** rồi nhờ Trung duyệt. Lý do: head #44 chưa chứa #43, nên phiên đo hôm qua phải phục vụ từ **bản gộp chỉ có ở local** — provenance chưa tái lập được từ GitHub | ~30 ph | Trung duyệt (việc 2 của cậu ấy) | #44 `APPROVED`, merge được |
| **3** | **Duyệt lại #41** (`741f826`). Leader đã lấy **lựa chọn 2** của bạn: `RESULT.md`, README và PR body nay ghi **ba lượt trên hai build**, bảng so sánh hai chính sách được dán nhãn *quan sát*, và commit của từng build được ghi nhận là **khoảng trống**. Soát xem lời văn đã khớp dữ liệu chưa | ~30 ph | không | `APPROVE` hoặc nêu chỗ còn sai |
| **4** | **Duyệt #31 sau khi leader rebase** (bạn đã approve ở head cũ; rebase xong cần một lượt xác nhận ngắn) | ~30 ph | leader rebase (sáng) | `APPROVE` |

## Việc Day 10

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **5** | **PR hiện thực đầu tiên của V2 — `SCR-05` 3D Inspector**, dựng trong bộ khung `app/` mà leader tạo sáng nay, chạy trên **fixture sinh từ hợp đồng API** (việc 6 của Trung), **không gọi backend thật**. Phạm vi tối thiểu: nạp mesh theo `case_id` + `run_id`, xoay/zoom/pan, chạm chọn vùng → phát ra `slice_index`, và **ba trạng thái** của `10` §8: loading · không khả dụng · dữ liệu hỏng | ~2,5 h | bộ khung `app/` (leader, trước 11:00) · fixture (Trung) | PR mở, CI xanh, chạy được trên fixture |
| **6** | **Hoàn thiện `RESULT.md` Spike B cho `ACCEPTED`**: mọi tiêu chí `B1`–`B14` có nhãn rõ, tiêu chí chưa đo ghi `NOT MEASURED` chứ không bỏ trống, và nêu điều kiện thiết bị của từng số | ~1 h | việc 1 | `RESULT.md` đủ để QA soi |
| **7** | **Fixture TP/FP/FN error-mask tổng hợp** ở `tests/fixtures/error_masks/` kèm checksum và README. `13` §11 đòi bộ này độc lập với Spike F; V1 và V2 đều cần nó để dựng lớp lỗi | ~1 h | không | fixture + checksum + README trên PR |
| **8** | **Gói `TC-TEAM-001` V2** cho `SCR-05` (UC-06…09) theo `10` §10, 6 hạng mục. Nguyên liệu đã có: #30, #38, #43, `B14`, và số `B10`/`B11` của việc 1 | ~1 h | việc 1 | `management/evidence/TC_TEAM_001_VU_HUNG_ANH.md` |

**Tổng phần chính: ~8 h.**

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **H6–H7 / SCR-05**: xoay, zoom, pan mượt **trên chính
> máy demo**, chạm vùng lỗi thì nhảy đúng lát cắt 2D. `TC-PERF-002` (≥ 20 FPS median) phải là số **đo trong app** —
> và sau việc 1 hôm nay, lần đầu tiên chúng ta có con số đó.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Duyệt #46** (container WebView của leader): đã sửa lỗi logcat cắt payload, kiểm trên máy 22:10 — probe chia 12 mảnh, ghép lại trùng bản HTTP | ~45 ph | review có nội dung |
| **Kế hoạch `B5`/`B6`** trên mesh/mask thật sau khi `GATE-SPLIT-01` đóng | ~1 h | mục kế hoạch trong `TASK.md` |

---

**Ranh giới không đổi:** **không viết `TECH_STACK_ADR.md`** — việc của leader, và chỉ sau khi A và B `ACCEPTED` ·
không tự vận hành điện thoại · không tính số `E` thay Trung · `tests/fixtures/geometry/**` là của bạn · không tự
chuyển `ACCEPTED`. **Liên quan:** PR #26 · #31 · #41 · #44 · #46 · [`../day09/DAY09_EOD_REVIEW.md`](../day09/DAY09_EOD_REVIEW.md)
