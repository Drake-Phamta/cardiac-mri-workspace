# DAY 5 — Vũ Hùng Anh · 2026-09-14

## 🔴 LÀM TRƯỚC — việc tồn từ tối 13/09

> **Quy tắc của leader (13/09):** nợ tồn phải trả **trước**; nhiệm vụ Day 5 bên dưới chỉ bắt đầu sau khi xong khối này.

| # | Việc | Từ | Vì sao phải làm trước |
|---|---|---|---|
| **1** | **Review PR #24** (PR của Trung, gồm harness Toybox đã sửa) — bạn là reviewer Spike E | tối 13/09, leader chuyển sang Day 5 | harness này là thứ đã tạo ra dữ liệu Spike E; nó phải được review trước khi Spike E đi tiếp |

Bạn **không có nợ Day 4** — mọi việc Day 4 của bạn đã xong. Xong dòng trên rồi mới sang nhiệm vụ Day 5.

---

> ## Hôm qua bạn trả hết nợ Day 3 trong một buổi chiều
>
> | | |
> |---|---|
> | Review PR #13 | ✅ approve + merge — Spike A lên `main` |
> | Fixture hình học chính thức | ✅ PR #20, `50a5433` — leader review: 33/33 exact, hợp đồng khớp dữ liệu |
> | Review PR #15 | ✅ **3 phát hiện, cả 3 đúng** — lỗi cú pháp bạn tìm bằng `py_compile` đã lọt qua luồng soi đối kháng |
> | Dòng `Reviewer:` | ✅ PR #21 — nợ từ Day 0 đã đóng |
>
> Không còn nợ nào mang tên bạn.

---

## PHẦN I — `NOW`

### ① Review PR #24 — bạn là reviewer Spike E

~~Re-review PR #15~~ ✅ bạn approve và merge lúc 19:47 tối 13/09 (`ee9ef60`).

**PR #24** là PR của Trung: tiến độ Day 4, diagnostic AVD *(chỉ chẩn đoán)*, và harness Toybox — đã gồm
**PR #22** của leader (thử lại khi kernel từ chối kết nối tại chỗ, kiểm body bị cắt, nhãn `wifi-overlay`).
Vì có code của leader trong đó nên **leader không review được**; bạn review với vai reviewer Spike E
(`DR-006a` rev 2). Harness này đã chạy lượt 1–4 trên `spike-e/evidence-20260913` — lượt 4 là 171/171 trên
Wi-Fi + ZeroTier `DIRECT`.

---

## PHẦN II — `THEN`

### ② Diễn giải `B14` trên nhóm hợp đồng — đọc cột này trước

| nhóm | slice/mm theo tia |
|---|---:|
| `interior` | **0,695** |
| `surface_tangent` | **0,194** |

**Đòn bẩy chênh ~3,6 lần.** Cùng một độ dịch hình học, `interior` sẽ ra sai số slice lớn hơn — nên chênh
lệch sai số trung bình giữa hai nhóm **không** tự nó là tính chất của decimation. Diễn giải là của bạn;
có nên bắt buộc báo cột này trong `FORMAT.md` không cũng là quyết định của bạn.

### ③ Bắt đầu phần bạn tự dựng — app 3D tối thiểu

`B1` `B3` `B7` `B9` vẫn `NOT MEASURED` vì **chưa có app** render mesh trên điện thoại. Đó là phần `00`
§14 gọi là chức năng bạn *"personally analyzed, designed, and implemented"* — và là điều kiện để đo
`B10` `B11` sau này. Chọn thư viện render là quyền của bạn.

---

## Vai mới: reviewer Spike E

Từ `DR-006a` revision 2, leader là operator duy nhất của Spike E nên phải rút khỏi vai reviewer — **bạn
review Spike E.** Chưa có gì để review hôm nay. Tải của bạn giờ là 5 suất review + 2 spike; tuần tự hoá
vẫn áp dụng — mỗi lúc chỉ một review ở trạng thái `REVIEWING`.

Dòng *"Spikes I review"* trong `PRACTICE_VU_HUNG_ANH.md` còn thiếu Spike E — cập nhật khi tiện.

---

## Đường thiết bị cho `B10` `B11`

`DR-006a` revision 2 **chỉ phủ Spike E**. Leader sẽ quyết đường cho Spike B. Nếu bạn có ưu tiên — tự đo
từ xa qua `tools/remote_adb/`, hay để leader bấm theo thiết kế của bạn — nói trước, để không lặp lại bài
toán hẹn giờ.

---

**Liên quan:** `tests/fixtures/geometry/FORMAT.md` · `spikes/spike_b_3d/README.md` *(nhánh PR #15)* ·
[`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md)
