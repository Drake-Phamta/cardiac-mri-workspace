# DAY 5 — Vũ Hùng Anh · 2026-09-14

**Khai báo khả dụng trước 09:00** (`15` §5) — một dòng trong nhóm: hôm nay bạn có mấy tiếng.

**Khối lượng hôm nay:** phần chính **~5 h** · thêm ~1 h nếu còn thời gian.

## 🔴 LÀM TRƯỚC — theo thứ tự

> **Quy tắc của leader:** nợ và việc tồn làm **trước**; việc Day 5 chỉ bắt đầu sau khi xong khối này.
> Bạn **không có nợ Day 4** — cả hai dòng dưới là review được giao tối qua.

| # | Việc | Giờ | Xong khi |
|---|---|---|---|
| **1** | **Review PR #25 — audit Spike D của Khánh.** Đây là việc **mở critical path cho cả nhóm hôm nay**: merge #25 → leader quyết `DR-002` → Khánh chạy split | ~2 h | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung cụ thể |
| **2** | Review PR #24 — harness Toybox của Trung (đã gồm PR #22 của leader, nên leader không review được) | ~1 h | như trên |

**Review #25 — nên soi gì** *(Khánh tự nêu trong PR)*: diễn đạt của `A11` và `A12` (nhãn test có trong gói phát
hành ≠ có lúc chấm thi gốc), bằng chứng `A14`, cách loại trừ `desktop.ini` ở `A17`, giới hạn DDA ở `A18`. Cộng
thêm: chế độ `--archive` mới (đọc thẳng zip, giải nén từng NRRD) có cho **cùng manifest** với `--root` không.
Manifest 28 000 dòng là file sinh tự động — không cần đọc từng dòng, kiểm cách sinh ra nó.

## Việc Day 5 — sau khi xong khối trên

| # | Việc | Giờ | Xong khi |
|---|---|---|---|
| 3 | **Bắt đầu app 3D tối thiểu (`B1`)**: dựng khung app, render mesh mức 0 (`spikes/spike_b_3d/mesh/out/level_0_cell1.obj`) trên emulator hoặc máy thật. Chọn thư viện là quyền của bạn | ~2 h | ảnh chụp mesh hiện trên màn hình + PR nháp |

## Nếu còn thời gian

- Diễn giải `B14` trên nhóm hợp đồng `interior` / `surface_tangent` — đọc cột `slice/mm` trước, hai nhóm chênh
  đòn bẩy ~3,6 lần *(~1 h)*.

## Vì sao `B1` là việc chính chứ không phải `B14`

`B1` `B3` `B7` `B9` `B10` `B11` đều cần **app chạy được trên điện thoại** — chưa có. Đó cũng là phần `00` §14 gọi
là chức năng bạn *"personally analyzed, designed, and implemented"*. `B14` là diễn giải trên số đã có; để sau
không chặn ai.

---

**Liên quan:** PR #25 · PR #24 · [`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md) ·
`tests/fixtures/geometry/FORMAT.md` · [`../../day04/DAY04_EOD_REVIEW.md`](../../day04/DAY04_EOD_REVIEW.md)
