# DAY 6 — Vũ Hùng Anh · 2026-09-15

**Khối lượng hôm nay:** phần chính **≥ 8 h** · hàng đợi dự phòng ~2 h · **hạn: 23:59 hôm nay**.

> **Hôm qua:** hai review buổi sáng rất tốt — #25 bạn bắt được khoảng trắng mà chính PR nói đã kiểm, #24 bạn bắt được
> provenance sai. Nhưng **`B1` và `B14` không có commit nào**, nên cả hai thành **nợ** hôm nay.
>
> **Hôm nay bạn đang giữ việc của 3 người** (#25 cho Khánh và leader, #24 và #26 cho Trung). Làm **review trước** — mỗi
> cái mở khoá cho người khác — rồi mới tới app. Mỗi việc xong là đẩy lên ngay.

## 🔴 LÀM TRƯỚC — theo thứ tự

| # | Việc | Giờ | Xong khi |
|---|---|---|---|
| **1** | **Review lại PR #25** — Khánh đã sửa đúng dòng bạn yêu cầu (`fdaf920`, diff 1 dòng). **Critical path** — merge xong thì Spike D sang bước QA và Khánh đổi base #28 | ~20 ph | `APPROVE` |
| **2** | **Review lại PR #24** — Trung sửa đủ 3 điểm của bạn + thêm `--profile` (`710090f`); `diff --check` sạch, CI 4/4 | ~30 ph | `APPROVE` hoặc yêu cầu sửa |
| **3** | **`B1` — app 3D tối thiểu** *(nợ Day 5)*: render `spikes/spike_b_3d/mesh/out/level_0_cell1.obj` + camera xoay/zoom. Emulator được cho `B1` (chẩn đoán); thư viện do bạn chọn | ~3 h | PR nháp + ảnh chụp mesh xoay được |
| **4** | **`B14` — diễn giải** trên nhóm hợp đồng `interior` / `surface_tangent` *(nợ Day 5)* — đọc cột `slice/mm` trước, hai nhóm chênh đòn bẩy ~3,6 lần | ~1 h | một mục trong README Spike B hoặc comment trên PR |

## Việc Day 6

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **5** | **Review PR #26** (Spike E, bạn là reviewer): tái chạy `aggregate.py` trên `20260913_run4` và so với báo cáo; payload đúng `A6` (`uint8`, 576/640 × 88); stub phục vụ cả hai profile; kế hoạch đo **chạy được trên điện thoại** (phải dùng harness Toybox, không phải `harness.py`); nháp `RESULT.md` không có số nào không truy được về dữ liệu thô | ~2 h | không | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung |
| **6** | **Picking trên fixture chính thức trong app** (`B3`/`B4`, emulator): chạm → tia → điểm trên mesh, so với 13 tia `expected` của `geometry_fixture_v0.json` | ~1,5 h | việc 3 | bảng `B4` exact trên emulator *(chẩn đoán — `B5`/`B6` trên máy thật đo sau, leader bấm)* |

**Tổng phần chính: ~8,3 h.**

> **🎯 Chuẩn demo** *(leader, 15/09: sản phẩm cuối phải "wow")*: app 3D là thứ giảng viên nhìn thấy **đầu tiên**.
> Ngay từ `B1`: xoay/zoom mượt, **ánh sáng/shading đọc được hình khối** nhĩ trái, màu và nền nhất quán; kèm PR một
> **đoạn quay màn hình ngắn**. Code spike vẫn là code bỏ đi — nhưng lựa chọn thư viện hôm nay quyết định app cuối
> đẹp được đến đâu, nên ghi nhận xét đó vào `B15`.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Review PR #27** — Spike A S4 zoom/pan của leader, `A2` đã đo trên máy (bạn là reviewer Spike A). *10:51: leader đã chuyển PR sang ready và gửi yêu cầu review cho bạn, kèm checklist 4 bước ngay trên PR. Vẫn làm **sau** #25, #24 và #26* | ~1 h | review có nội dung |
| **M3 — hợp đồng hình học**: nâng `tests/fixtures/geometry/FORMAT.md` thành hợp đồng có **số phiên bản**, quy tắc thay đổi, và mô tả contract test *(chỉ bạn được viết thư mục này — DR-013)* | ~1 h | PR |
| **Kịch bản đo `B10`/`B11` cho leader bấm** (`DR-006a` rev 3) — chỉ khi app việc 3 chạy được | ~30 ph | file ngắn trong `spikes/spike_b_3d/` |

---

**Nhắc lại:** `DR-002` = Path A — khi cần giải phẫu thật, dùng case trong **Training Set**, không dùng 54 case holdout.
Đo trên máy cho Spike B: leader bấm, **bạn** thiết kế và tính số. **Liên quan:** PR #25 · #24 · #26 · #27 ·
[`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md) · [`../../day05/DAY05_EOD_REVIEW.md`](../../day05/DAY05_EOD_REVIEW.md)
