# DAY 3 — Vũ Hùng Anh · 2026-09-12

> ## Việc số 1 của bạn mở khoá hai người khác
>
> `DAY01_VU_HUNG_ANH.md` gọi việc công bố format bộ geometry fixture là
> **"mốc mở khoá người khác sớm nhất trong ngày"**. Spike A và Spike F đều tiêu thụ nó.
>
> Nó vẫn chưa tồn tại. `tests/` chưa có trong repo.
>
> **Đêm qua tôi dựng sẵn một bản ĐỀ XUẤT** để bạn không phải bắt đầu từ trang trắng — PR #15.
> Nhận, sửa, hay vứt đi viết lại: **cả ba đều là kết quả tốt.**

---

## ⚠ Tôi cố tình KHÔNG viết vào `tests/fixtures/geometry/**`

Đường đó là deliverable của bạn theo **DR-013**. `15` §9 gọi nó là vùng **integration-sensitive, một
chủ sở hữu tại một thời điểm**. Và member brief của bạn ghi rõ:

> *"Cấu trúc và format nội bộ của bộ geometry fixture"* — nằm trong mục **"Tôi được TỰ quyết những gì"**

Nên bản đề xuất nằm ở `spikes/spike_b_3d/fixtures_proposal/`, mỗi file mang `_status: PROPOSAL`.
Không chiếm chỗ của bạn.

*(Và vì packet hôm 10/09 đã nhắc tôi đúng chuyện này — có một commit đi thẳng vào nhánh người khác
trên PR #1 — nên lần này tôi để nguyên đường của bạn.)*

---

> ### ⚠ Dụng cụ đang nằm trên nhánh PR, chưa lên `main`
>
> ```bash
> git fetch origin && git switch spike-b/harness-and-fixture-proposal
> ```

---

## PHẦN I — `NOW` · bộ geometry fixture

### ① Đọc bản đề xuất — 15 phút

```bash
git fetch origin && git checkout spike-b/harness-and-fixture-proposal
cat spikes/spike_b_3d/fixtures_proposal/FORMAT.md
python spikes/spike_b_3d/harness/conformance.py     # 32/32 diem exact, 0 finding
```

Bốn quyết định thiết kế tôi đã ghi lý do trong `FORMAT.md`, tóm tắt:

| Quyết định | Lý do |
|---|---|
| Volume **bất đẳng hướng** `[0.625, 0.750, 1.250]`, origin **khác 0** `[-12.5, 7.25, -30]` | Phép biến đổi sai vẫn chạy đúng ở `spacing = 1.0, origin = 0`. Đó là cách phổ biến nhất để hợp đồng geometry **pass test rồi vẫn ship hỏng** |
| **Sáu nhóm điểm** thay vì một danh sách phẳng | Kết quả tốt ở `interior` không được phép che một thất bại ở `corner` |
| **`out_of_range` là nhóm quan trọng nhất** — 6 điểm ngoài volume | Implementation **clamp** thay vì **reject** sẽ pass mọi test khác và vẫn khiến viewer điều hướng tới slice sai. Đúng cái `B9` cấm |
| **13 tia picking đi kèm fixture**, tách `interior` / `surface_tangent` | `B14` đòi hai nhóm báo riêng. Định nghĩa **một lần trong fixture** để hai harness không sinh tia khác nhau rồi không so được |

### ② Quyết: nhận, sửa, hay thay

**Nếu nhận:** chuyển sang `tests/fixtures/geometry/**` theo format bạn muốn, xoá các trường `_`,
trỏ `conformance.py --fixture <đường mới>`, rồi **xoá `fixtures_proposal/`**.

**Nếu thay:** viết bộ của bạn, xoá cả thư mục đề xuất. Không gì phụ thuộc vào nó ngoài harness, và
harness nhận đường dẫn qua tham số.

### ③ **Công bố format cho Phạm Tuấn Anh**

Đây mới là mốc thật. Spike A đang dùng fixture tạm riêng ở `spikes/spike_a_2d/fixtures/` và sẽ thay
bằng bộ của bạn.

---

## ❌ RÚT LẠI — "phát hiện" tôi báo cho bạn là SAI

**Bỏ qua hoàn toàn phần này nếu bạn đã đọc bản trước.** Tôi đã nói với bạn rằng nhóm `interior` sai
gấp ~7 lần nhóm `surface_tangent`, và gọi đó là một phát hiện ngược kỳ vọng của spec. **Nó không phải
phát hiện. Nó là tạo tác từ chính cách tôi dựng tia.**

Một luồng review độc lập đo lại từng tia và cho kết quả:

| nhóm | \|d_z\| trung bình | slice z lệch trên mỗi mm dọc tia | góc tới so với **pháp tuyến bề mặt** |
|---|---:|---:|---|
| `interior` | 0,984 | **0,787** | 0–15° |
| `surface_tangent` | 0,049 | **0,0395** | **11–17°** |

**Mọi tia tôi gắn nhãn `surface_tangent` đều đâm vào bề mặt ở 11–17° so với pháp tuyến** — tức gần
vuông góc, **ngược hẳn với cái tên**. Và chúng **kém nhạy 20 lần** theo trục z. Với tỉ lệ nhạy
0,787 / 0,0395 ≈ 20, nhóm `interior` **chắc chắn phải thua**. Con số 7× là hệ quả số học của cách
đặt tia, không chứa thông tin gì về geometry.

**Nghĩa là `B14` chưa được đo.** Harness cũ không phân nhóm theo thứ quyết định sai số.

Và một lỗi nữa cùng chỗ: **kiểm "mức 0 phải bằng 0" là tautology** — nó so mesh mức 0 với **chính
nó**. Người review dịch mesh đi 5 slice và nó **vẫn báo sai số 0**. Dòng trong README cũ nói *"nếu
khác 0 thì harness sai"* là vô nghĩa: nó **không thể** khác 0.

**Tôi đã sửa harness** — xem PR #15, commit sau bản đầu. Ground truth giờ là **ray-march trực tiếp
trên mask voxel**, độc lập với mọi mesh, và nhóm được tính **tại thời điểm chạm theo góc tia–pháp
tuyến** chứ không theo nhãn đặt sẵn. Kết quả mới nằm trong `FORMAT.md` §6.

**Việc của bạn không đổi:** vẫn cần bạn phán định nghĩa nhóm cho `B14`. Nhưng giờ bạn phán trên số
đúng, không phải trên số tôi dựng sai.

---

## PHẦN II — hàng đợi review, và một thay đổi ảnh hưởng tới bạn

**6 PR mở, 0 review được submit.** `15` §11: *"silence is not approval"*.

> ### ⚠ Bạn vừa nhận thêm một suất review — và tôi nói luôn cái giá
>
> **`DR-006a`** (ghi đêm 2026-09-12) cho phép leader làm **operator** cầm máy đo cho Spike E, vì
> Galaxy A17 là máy cá nhân của anh ấy và không bàn giao. Ràng buộc đi kèm: **người tạo ra số đo
> không được là người review số đó**, nên leader rút khỏi vai reviewer Spike E và **nó chuyển sang
> bạn**.
>
> Bạn giờ giữ **năm** suất review — `D` `A` `C0` `C1` `E` — trong khi vẫn sở hữu Spike B và Spike F.
> `WIP-CONFLICT-01` chỉ cho **một** suất `REVIEWING` tại một thời điểm, nên **hàng đợi dài ra chứ
> việc không biến mất**. Nếu Spike D và Spike E cùng sẵn sàng một ngày thì **D thắng vì P0**.
>
> Đây là đánh đổi có chủ ý: hi sinh thông lượng để giữ tính độc lập của review. Nếu nó thành nút
> thắt thật thì **nói ra** — đó là dữ kiện leader cần, không phải chuyện bạn phải gánh im lặng.

| PR | Của | Tại sao bạn |
|---|---|---|
| **#13** | Spike A của leader — profile DR-006 + phép đo `A9` | Bạn là reviewer Spike A. **Mở hơn 12 giờ** |
| **#15** | Harness Spike B + fixture đề xuất | Dụng cụ dựng cho **chính bạn** |
| #16 | Stub + harness Spike E | **mới**: bạn là reviewer Spike E từ `DR-006a` |

Với #15 tôi muốn bạn soi: format fixture có phải thứ bạn muốn ký tên dưới không · nhóm
`out_of_range` có đúng không · phát hiện ở trên bạn đọc ra cách khác không · **bạn chạy được không**
(`14` §6 — *"A block is not considered healthy if only one person can explain/run/debug it"*).

---

## PHẦN III — Spike B, phần không cần máy

### ④ Thay mask tổng hợp bằng mask thật

Khi Khánh xong audit, `C:\cardiac-data\lasc2018\extracted` có 100 case có nhãn. Chạy lại:

```bash
python spikes/spike_b_3d/mesh/build_mesh.py --cells 1,2,3,4
python spikes/spike_b_3d/harness/picking_error.py
```

**Slice thật là `576×576×88`** (có case `640×640`), không phải `48×40×24` như fixture. Số tam giác sẽ
lớn hơn nhiều bậc, và bảng frontier sẽ khác hẳn.

### ⑤ Nợ kỹ thuật: dòng `Reviewer:`

`PRACTICE_VU_HUNG_ANH.md` trên `main` vẫn thiếu dòng `Reviewer:` — PR #3 merge đè lên
`CHANGES_REQUESTED` đang mở. Một PR nhỏ là xong.

---

## Acceptance hôm nay

```text
☐  quyết về bộ fixture: nhận / sửa / thay — và format ĐÃ CÔNG BỐ cho Phạm Tuấn Anh
☐  PR #13 và #15 có review thật (APPROVE hoặc NEEDS_FIX, không phải im lặng)
☐  đọc và phán về phát hiện interior-vs-tangent
```

Dòng đầu quan trọng nhất: nó mở khoá Spike A và Spike F.

## Spike B KHÔNG được

| Việc | Vì sao |
|---|---|
| **Nới bound `±1 slice`** | **SCQ-06 đóng băng trước Spike B.** Cần Decision Request `00` §13 |
| **Nới tolerance fixture** | Bound là **EXACT, zero tolerance** |
| **Đổi quy ước DR-008a** | Đóng băng |
| **Chốt `DR-008c` bằng phán đoán** | Cần **số đo FPS**. Mức 3 giảm 93,7% mà vẫn trong bound — **đó chưa phải đề xuất**, vì `B13` đòi *maximising frame rate subject to* bound, mà cột FPS chưa tồn tại |
| Để thứ tự bộ nhớ thư viện thành hợp đồng API | Không thuộc hợp đồng |
| Chọn hay đóng băng mobile framework | `GATE-MOB-01` cần **cả A và B** |
| **Push vào nhánh người khác** | `15` §9. Góp ý thuộc về review; sửa thuộc về tác giả |
| Bắt đầu Spike F như primary thứ hai | WIP-limited sau Spike B |

## Cổng thiết bị — bạn là `GATE 3`

Thứ tự `A → E → B`. **Điều kiện vào:** ≥3 mức decimation dựng xong **và** harness picking chạy được
desktop — **cả hai đã xong** trong PR #15, nên bạn đủ điều kiện ngay khi tới lượt.

> ⚠ Máy là **tài sản cá nhân của leader** và không bàn giao. Mô hình "một người giữ, bàn giao theo
> cổng" đang cần tu chính. Ghi là nợ quản trị, chưa chặn bạn vì `GATE 2` cũng chưa mở.

---

**Liên quan:** [`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md) ·
`spikes/spike_b_3d/fixtures_proposal/FORMAT.md` · `spikes/spike_b_3d/README.md` ·
[`../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md)
