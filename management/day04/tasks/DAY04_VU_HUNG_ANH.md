# DAY 4 — Vũ Hùng Anh · 2026-09-13

> ## Trước tiên: việc còn nợ từ Day 3 — và nó **vẫn là của bạn**
>
> Day 3 đã đóng với kết quả **TRƯỢT**. Một trong ba điều kiện của ngày là hàng đợi review, và nó
> đạt **1/6**. Đây là **ngày thứ tư liên tiếp** không có hoạt động nào từ phía bạn.
>
> | Nợ | Từ | Ai đóng được |
> |---|---|---|
> | Nhận / sửa / thay **bộ canonical geometry fixture** + **công bố format** | Day 1 | **chỉ bạn** — `DR-013` |
> | **Review PR #13** *(mở từ trưa 11/09, 33,7 giờ lúc chốt Day 3)* và **PR #15** | Day 2 | **chỉ bạn hoặc đồng đội** |
> | Phán định nghĩa nhóm cho `B14` | Day 2 | **chỉ bạn** |
> | Dòng `Reviewer:` trong `PRACTICE_VU_HUNG_ANH.md` trên `main` | **Day 0** | **chỉ bạn** |
>
> Đêm 2026-09-11, dưới ngoại lệ `INC-001`, Project Control có dựng dụng cụ hộ. Ngoại lệ đó **đã hết
> hiệu lực lúc 00:00 ngày 2026-09-12** và không tự gia hạn. `INC-001` §5: **“làm thay không xoá
> nghĩa vụ.”** Bốn dòng trên không dòng nào chuyển sang ai.
>
> Riêng dòng `Reviewer:` thì Project Control **làm được** mà không bịa gì — và **cố tình không làm**.
> `management/onboarding/practice/README.md:51` nói trường đó là *“lời của chính tác giả”*; đóng hộ sẽ
> biến một hành động truy vết được của bạn thành hành động của leader. Nó **không chặn gì cả** — chỉ
> là một dòng còn treo bốn ngày.

---

## Việc của bạn **không còn thứ gì chặn** — đây là điều quan trọng nhất trong packet này

`GATE 3` là cổng thiết bị của bạn. Điều kiện vào: **≥3 mức decimation dựng xong** *và* **harness
picking chạy được trên desktop**. **Cả hai đã xong** từ PR #15. Không có dependency nào của bạn đang
đợi ai.

Thứ đang đợi **bạn** thì có: `spikes/spike_b_3d/fixtures_proposal/` mang nhãn `_status: PROPOSAL` và
nó **ở đúng trạng thái đó cho tới khi bạn quyết**. `tests/fixtures/geometry/**` **chưa bị chạm một
byte** — `DR-013` ghi thư mục đó là của bạn.

Và Spike A lẫn Spike F **đều đang chờ đúng một thứ**: bạn công bố format.

---

## Đã dựng sẵn cho bạn — PR #15

```text
spikes/spike_b_3d/
  fixtures_proposal/generate.py + FORMAT.md    ← ĐỀ XUẤT, nhãn _status: PROPOSAL
  mesh/build_mesh.py                            ← voxel-face extraction
  harness/conformance.py
  harness/picking_error.py
```

**`build_mesh.py` dùng voxel-face extraction, không phải marching cubes.** Lý do phải nói rõ vì nó
là quyết định thiết kế bạn có quyền bác: mặt voxel cho mesh **khớp chính xác** với lưới mà ground
truth ray-march đi trên đó, nên sai số picking đo được là sai số của **phép picking**, không lẫn sai
số nội suy iso-surface. Nếu bạn muốn marching cubes cho `B13`, đó là quyết định của bạn — nhưng khi
đó ground truth phải đổi theo.

---

> ## ⚠ Một phát hiện tôi đã công bố cho bạn là SAI. Đã rút lại công khai.
>
> Bản trước nói nhóm `interior` có sai số **~7 lần** nhóm `surface_tangent`. **Không đúng.** Đó là
> artefact của chính bộ sinh: **mọi tia “surface_tangent” đều bắn lệch 11–17° so với pháp tuyến**, nên
> nó **kém nhạy ~20 lần** với sai lệch bề mặt. Con số không đo cái nó tự nhận là đang đo.
>
> Đã rút lại tại: `fixtures_proposal/FORMAT.md` · `spikes/spike_b_3d/README.md` · comment trên PR #15
> · và packet Day 3 của bạn.
>
> **Ground truth hiện tại là DDA ray-march trên chính voxel mask** — không còn self-check vòng tròn.
> Bản đầu tiên có một self-check ở level 0 **mang tính tautology** (so mesh với chính mesh), và luồng
> soi đối kháng đã bắt nó. Nên khi bạn phán `B14`, hãy phán **trên số đã sửa**, và đừng thừa kế kết
> luận nào của tôi.

---

## PHẦN I — `NOW`

### ① Khai báo khả dụng — một dòng

Hôm nay bạn có bao nhiêu giờ. **“Không có giờ nào” là câu trả lời hợp lệ.** Im lặng thì không:
`15` §11 — *“im lặng không phải chấp thuận”*, và bốn ngày im lặng đã đẩy dự án sang **🔴 RED**,
buffer về **0**.

### ② Review PR #13 — việc đơn lẻ đang chặn nhiều nhất

```bash
gh pr view 13 --web
```

PR #13 là Spike A: harness viewer 2D + phép đo `A9` đầu tiên của dự án (p95 **65,31 ms** ở 64×64 và
**50,23 ms** ở 576×576 — kích thước slice thật). **Leader là tác giả, nên anh ấy không thể tự
approve** — GitHub cấm. Nó nằm đó từ trưa 11/09 với **0 review**.

`15` §7 nói thẳng về tình trạng này: *“If review capacity is unavailable, Project Control must treat
that as a planning constraint rather than allowing a large queue of unreviewed ‘done’ work.”*
**Năm PR chưa review chính là hàng đợi đó.**

Bạn được review gì: có `A9` đo hai lần ở hai kích thước không · alignment check có thật sự kiểm
alignment không *(bản đầu trả PASS vô điều kiện — đã sửa)* · phép ngoại suy 376 MB graphics memory cho
88 slice có hợp lý không.

---

## PHẦN II — `THEN` · phần chỉ bạn làm được

### ③ Quyết bộ canonical geometry fixture

Ba lựa chọn, cái nào cũng hợp lệ:

| | Bạn làm gì | Hệ quả |
|---|---|---|
| **Nhận** | copy từ `fixtures_proposal/` sang `tests/fixtures/geometry/`, bỏ nhãn `_status: PROPOSAL`, commit dưới tài khoản bạn | nhanh nhất |
| **Sửa** | đổi tham số/độ phân giải/nhóm rồi mới nhận | vẫn là quyết định của bạn |
| **Thay** | bỏ hẳn, tự sinh theo cách bạn muốn | bản đề xuất chỉ là bản nháp |

**Đừng để nó ở trạng thái `PROPOSAL` thêm một ngày.** Nhãn đó là cách tôi giữ `DR-013` nguyên vẹn,
nhưng nó cũng có nghĩa **không ai được dùng bộ fixture đó** — và Spike A, Spike F đều đang đợi.

### ④ Công bố format — mốc mở khoá Spike A và Spike F

Một file `FORMAT.md` trên `main`, mang tên bạn, nói: fixture nằm ở đâu, mỗi trường nghĩa là gì, đọc
bằng gì, và **ray/nhóm nào dùng để đo cái gì** *(đúng chỗ tôi đã sai — xem hộp rút lại ở trên)*.

Sau khi có nó, Spike A và Spike F mới có thứ để conform tới. Trước khi có nó, cả hai chỉ đang đoán.

---

## PHẦN III — `LATER`

### ⑤ Phán `B14` trên số đã sửa

Chạy `harness/picking_error.py` với ground truth DDA, đọc số **của bạn**, rồi quyết định nghĩa nhóm.
Đừng đọc tiếp con số 7× — nó đã bị rút.

### ⑥ `B10` `B11` và picking trên mesh thật — **bạn tự chạy, từ xa**

Máy Android là **tài sản cá nhân của leader** và **không bàn giao** — hai người ở xa nhau. Đường đã
dựng sẵn để bạn vẫn là người bấm:

```text
máy CỦA BẠN  --ZeroTier overlay-->  PC của leader  --USB-->  Galaxy A17
                                                              |
                                 traffic ĐO đi ----------------+--> cellular THẬT
```

```bash
# tren may BAN, sau khi leader da mo adb server
export ANDROID_ADB_SERVER_ADDRESS=10.134.129.145
export ANDROID_ADB_SERVER_PORT=5037
adb devices
```

Luật *“executed by chính bạn”* **giữ nguyên**; leader **không** phải rút khỏi vai reviewer. Chỉ khi
buổi từ xa không thực hiện được thì mới dùng phương án dự phòng — leader bấm, bạn diễn giải — và khi
đó bốn ràng buộc `DR-006a` mới có hiệu lực, cho đúng spike đó, đúng bằng chứng đó.

> ⚠ **Cảnh báo kỹ thuật, đã kiểm trên máy thật:** `adb` **không bind được một địa chỉ đơn** — nó trả
> *“listening on specified hostname currently unsupported”*. Nghĩa là mở adb server cho bạn sẽ mở nó
> **rộng hơn** mức mong muốn trên máy leader. Leader đang phải quyết cách xử lý; nó **không chặn**
> việc ③ và ④ của bạn.

### ⑦ PR nhỏ: dòng `Reviewer:` vào `PRACTICE_VU_HUNG_ANH.md`

Một dòng. Nợ từ Day 0. Không chặn gì, nhưng nó là ô cuối cùng của bạn trong bảng Day 0.

---

## Ràng buộc không đổi

- `DR-012` — **mọi volume trong gói thật đều axis-aligned**. Oblique chỉ tồn tại trong selftest của
  Spike D. Đừng viết code giả định phải xử lý oblique cho MVP.
- `DR-013` — `tests/fixtures/geometry/**` là của bạn. Không ai khác ghi vào đó.
- **`SCQ-06` biên ±1 slice không bao giờ được nới.**
- `docs/specs/v1.0/**` **đóng băng** — 19/19 SHA-256 khớp, chưa commit nào chạm.

---

**Liên quan:** [`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md) ·
`spikes/spike_b_3d/fixtures_proposal/FORMAT.md` *(nhánh `spike-b/harness-and-fixture-proposal`)* ·
[`../../day03/DAY03_EOD_REVIEW.md`](../../day03/DAY03_EOD_REVIEW.md) ·
[`../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md)
