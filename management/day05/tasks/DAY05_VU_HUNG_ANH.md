# DAY 5 — Vũ Hùng Anh · 2026-09-14

**Khối lượng hôm nay:** phần chính **~7 h** · thêm ~1 h nếu còn thời gian · **hạn: 23:59 hôm nay**.

## 🔴 LÀM TRƯỚC — theo thứ tự

> **Quy tắc của leader:** nợ và việc tồn làm **trước**; việc Day 5 chỉ bắt đầu sau khi xong khối này.
> Bạn **không có nợ Day 4** — cả hai dòng dưới là review được giao tối qua.

| # | Việc | Giờ | Xong khi |
|---|---|---|---|
| **1** | **Review PR #25 — audit Spike D của Khánh.** Đây là việc **mở critical path cho cả nhóm hôm nay**: merge #25 → leader quyết `DR-002` → Khánh chạy split. **Làm đầu tiên, buổi sáng** | ~2 h | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung cụ thể |
| **2** | Review PR #24 — harness Toybox của Trung (đã gồm PR #22 của leader, nên leader không review được) | ~1 h | như trên |

**Review #25 — nên soi gì** *(Khánh tự nêu trong PR)*: diễn đạt của `A11` và `A12` (nhãn test có trong gói phát
hành ≠ có lúc chấm thi gốc), bằng chứng `A14`, cách loại trừ `desktop.ini` ở `A17`, giới hạn DDA ở `A18`. Cộng
thêm: chế độ `--archive` mới (đọc thẳng zip, giải nén từng NRRD) có cho **cùng manifest** với `--root` không.
Manifest 28 000 dòng là file sinh tự động — không cần đọc từng dòng, kiểm cách sinh ra nó.

## Việc Day 5 — sau khi xong khối trên

| # | Việc | Giờ | Xong khi |
|---|---|---|---|
| **3** | **App 3D tối thiểu (`B1`)**: dựng khung app, render mesh mức 0 (`spikes/spike_b_3d/mesh/out/level_0_cell1.obj`) trên emulator hoặc máy thật, **kèm camera xoay/zoom cơ bản**. Chọn thư viện là quyền của bạn | ~3 h | ảnh chụp mesh xoay được trên màn hình + PR nháp |
| **4** | **Diễn giải `B14`** trên nhóm hợp đồng `interior` / `surface_tangent` — đọc cột `slice/mm` trước, hai nhóm chênh đòn bẩy ~3,6 lần | ~1 h | một mục ngắn trong README Spike B hoặc comment trên PR |

## Nếu còn thời gian

- Chuẩn bị **fixture tổng hợp TP/FP/FN cho Spike F** — được phép theo `SPIKE_PHASE_STATE` (chỉ fixture, chưa làm
  phần chính khi Spike B còn `ACTIVE`) *(~1 h)*.

## 📱 Đo trên điện thoại — leader đo hộ bạn *(quyết định mới, 14/09)*

Leader đã quyết đường thiết bị cho Spike B (`DR-006a` **revision 3**, `OPEN_DECISIONS.md`): **giống Spike
E**. Hôm nay **không** thêm việc nào cho bạn; đây là để bạn biết trước cách phép đo sẽ chạy khi app `B1`
lên được máy.

| | Ai làm |
|---|---|
| Cầm máy, cài bản build, bấm chạy, commit **dữ liệu thô nguyên byte** kèm `PROVENANCE.md` ghi ai bấm, lúc nào | **Leader** |
| **Thiết kế phép đo**: kịch bản xoay/zoom, số lần lặp, các mức decimation, cách đo `B10` (phân bố FPS), quy tắc `B11` (khựng > 500 ms), giao thức picking | **Bạn** |
| **Tính mọi con số B**, viết `RESULT.md`, khuyến nghị **DR-008c** | **Bạn** — leader không tính số nào của Spike B |
| Chạy cùng bản build + instrumentation trên **emulator** (chỉ để chẩn đoán), và **tự tính lại** số từ log thô của leader | **Bạn** — thay cho việc tự bấm trên máy thật |

**Bạn chỉ cần đưa leader:** bản build app (APK hoặc lệnh build) và kịch bản đo. Leader chạy khi rảnh,
không cần hai người ngồi cùng giờ.

**Reviewer Spike B đổi từ leader sang Nguyễn Gia Đức Trung**, vì người cầm máy tạo ra bằng chứng thì không
được tự review bằng chứng đó. Không phải Khánh, vì Khánh đang gánh critical path.

**Quyền của bạn:** nếu muốn tự bấm từ xa (qua `tools/remote_adb/`) thì chỉ cần nói, không cần quyết định
mới. Hai câu *"executed by Vũ Hùng Anh"* trong `SPIKE_B_3D/TASK.md` đã được sửa công khai, có ghi lý do.

## Vì sao `B1` là việc lớn nhất hôm nay

`B1` `B3` `B7` `B9` `B10` `B11` đều cần **app chạy được trên điện thoại** — chưa có. Đó cũng là phần `00` §14 gọi
là chức năng bạn *"personally analyzed, designed, and implemented"*. Camera xoay/zoom là nền cho `B6` và picking
trên mesh thật.

---

**Liên quan:** PR #25 · PR #24 · [`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md) ·
`tests/fixtures/geometry/FORMAT.md` · [`../../day04/DAY04_EOD_REVIEW.md`](../../day04/DAY04_EOD_REVIEW.md)
