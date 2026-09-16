# DAY 6 — Vũ Hùng Anh · 2026-09-15

**Khối lượng hôm nay:** phần chính **≥ 8 h** · hàng đợi dự phòng ~2 h · **hạn: 23:59 hôm nay**.

> 🔒 **Day 6 đã chốt lúc 16/09 ~01:45 — `CHƯA ĐẠT` 3/4** · buffer 0 → **−1** — [`DAY06_EOD_REVIEW.md`](../DAY06_EOD_REVIEW.md).
> Điều kiện 1 và 4 của bạn **đạt** (merge #25 lúc 10:03 · `B1` ở #30 lúc 10:21). Việc 6–9 chưa làm — picking `B3`/`B4`,
> duyệt lại #24/#26, review #27/#31, duyệt lại Spike D — chuyển sang packet Day 7, cộng hai bản sửa Trung yêu cầu ở
> #29 và #30: [`../../day07/tasks/DAY07_VU_HUNG_ANH.md`](../../day07/tasks/DAY07_VU_HUNG_ANH.md).

> **Hôm qua:** hai review buổi sáng rất tốt — #25 bạn bắt được khoảng trắng mà chính PR nói đã kiểm, #24 bạn bắt được
> provenance sai. Nhưng **`B1` và `B14` không có commit nào**, nên cả hai thành **nợ** hôm nay.
>
> **Hôm nay bạn đang giữ việc của 3 người** (#25 cho Khánh và leader, #24 và #26 cho Trung). Làm **review trước** — mỗi
> cái mở khoá cho người khác — rồi mới tới app. Mỗi việc xong là đẩy lên ngay.
>
> ✅ **Cập nhật 11:15 — buổi sáng rất hiệu quả:** approve + merge #25 (10:03), review lại #24 (10:04, còn 1 điểm),
> review #26 (10:09, 3 điểm có nội dung — tái chạy `aggregate.py`), soát #27 (10:13, 4/4 kiểm đạt), #29 `B14` (10:14),
> #30 `B1` (10:21). **Việc còn lại:** 6 picking, 7 duyệt lại #24/#26 khi Trung sửa, 8 review chính thức #27 và PR S5.
>
> ❌ **11:52 — QA Red Team `REJECT` Spike D** ([`../QA_REVIEW_002_SPIKE_D.md`](../QA_REVIEW_002_SPIKE_D.md)). Mọi con số bạn đã
> kiểm đều tái lập đúng; QA tìm ra những gì audit **không báo**: một case bị trùng, header không mang hình học vật lý,
> `A19` còn thiếu. Khi Khánh đẩy bản sửa, bạn **duyệt lại** (việc 9). Cho hợp đồng hình học: header LASC mang spacing 1
> và origin 0 mặc định — toạ độ "thế giới" đọc từ header chỉ là chỉ số voxel, **không phải mm**.

## 🔴 LÀM TRƯỚC — theo thứ tự

| # | Việc | Giờ | Xong khi |
|---|---|---|---|
| **1** | ✅ **Review lại PR #25** — `APPROVE` 10:03:17 và merge 10:03:26 (`a92892c`). Spike D sang bước QA | ~20 ph | `APPROVE` |
| **2** | ✅ **Review lại PR #24** — 10:04 `CHANGES_REQUESTED`, còn 1 điểm (ID mạng ZeroTier cũ trong hướng dẫn Toybox) | ~30 ph | `APPROVE` hoặc yêu cầu sửa |
| **3** | ✅ **`B1` — app 3D tối thiểu** *(nợ Day 5)* — PR nháp #30 (10:21): WebGL2, xoay + zoom, ảnh chụp; mới kiểm trên trình duyệt desktop (Playwright) | ~3 h | PR nháp + ảnh chụp mesh xoay được |
| **4** | ✅ **`B14` — diễn giải** *(nợ Day 5)* — PR #29 (10:14), mục trong README Spike B | ~1 h | một mục trong README Spike B hoặc comment trên PR |

## Việc Day 6

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **5** | ✅ **Review PR #26** — 10:09 `CHANGES_REQUESTED`, 3 điểm có nội dung. Nội dung đã giao: tái chạy `aggregate.py` trên `20260913_run4` và so với báo cáo; payload đúng `A6` (`uint8`, 576/640 × 88); stub phục vụ cả hai profile; kế hoạch đo **chạy được trên điện thoại** (phải dùng harness Toybox, không phải `harness.py`); nháp `RESULT.md` không có số nào không truy được về dữ liệu thô | ~2 h | không | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung |
| **6** | **Picking trên fixture chính thức trong app** (`B3`/`B4`, trên viewer #30 hoặc emulator): chạm → tia → điểm trên mesh, so với 13 tia `expected` của `geometry_fixture_v0.json` | ~1,5 h | việc 3 | bảng `B4` exact trên emulator *(chẩn đoán — `B5`/`B6` trên máy thật đo sau, leader bấm)* |
| **7** | **Duyệt lại #24 và #26** — ✅ Trung đã đẩy bản sửa 21:21–21:22 (`be52d6f`, `a585907`), **làm được ngay** | ~1 h | không | `APPROVE` hoặc yêu cầu sửa |
| **8** | **Review chính thức #27** (đã soát 10:13 — approve hoặc yêu cầu sửa) · **review PR #31** (S5 brush — logic kiểm offline và **bằng chứng đo trên máy 21:21, `OBSERVED`**; lệnh tái lập ở comment trên PR) | ~1,5 h | leader (S5) | review có nội dung |
| **9** | **Duyệt lại Spike D** khi Khánh đẩy bản sửa theo QA-002 (F1–F5, F12, F13) — có thể dùng script ở [`../qa002/`](../qa002/) để kiểm lại cặp trùng | ~1 h | Khánh | `APPROVE` hoặc yêu cầu sửa |

**Tổng phần chính: ~8,3 h** ban đầu — khoảng 6 h đã xong trước 10:21; còn việc 6–9 (~5 h) + hàng dự phòng.

> **🎯 Chuẩn demo** *(leader, 15/09: sản phẩm cuối phải "wow")*: app 3D là thứ giảng viên nhìn thấy **đầu tiên**.
> Ngay từ `B1`: xoay/zoom mượt, **ánh sáng/shading đọc được hình khối** nhĩ trái, màu và nền nhất quán; kèm PR một
> **đoạn quay màn hình ngắn**. Code spike vẫn là code bỏ đi — nhưng lựa chọn thư viện hôm nay quyết định app cuối
> đẹp được đến đâu, nên ghi nhận xét đó vào `B15`.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| ✅ **Soát PR #27** — 10:13, 4/4 kiểm đạt; góp ý `onPanResponderTerminate` được đưa vào S5. 10:51 leader chuyển PR sang ready và gửi yêu cầu review; 11:09 leader trả lời — review chính thức ở việc 8 | ~1 h | review có nội dung |
| **M3 — hợp đồng hình học**: nâng `tests/fixtures/geometry/FORMAT.md` thành hợp đồng có **số phiên bản**, quy tắc thay đổi, và mô tả contract test *(chỉ bạn được viết thư mục này — DR-013)* | ~1 h | PR |
| **Kịch bản đo `B10`/`B11` cho leader bấm** (`DR-006a` rev 3) — chỉ khi app việc 3 chạy được | ~30 ph | file ngắn trong `spikes/spike_b_3d/` |

---

**Nhắc lại:** `DR-002` = Path A — khi cần giải phẫu thật, dùng case trong **Training Set**, không dùng 54 case holdout.
Đo trên máy cho Spike B: leader bấm, **bạn** thiết kế và tính số. **Liên quan:** PR #25 · #24 · #26 · #27 ·
[`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md) · [`../../day05/DAY05_EOD_REVIEW.md`](../../day05/DAY05_EOD_REVIEW.md)
