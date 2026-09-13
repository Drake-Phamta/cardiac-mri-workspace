# SPIKE_B — 3D linked interaction harness

> ### THROWAWAY SPIKE CODE — và nó được dựng HỘ, không dựng THAY
>
> **Chủ sở hữu Spike B là Vũ Hùng Anh.** Thư mục này là **dụng cụ**, không phải bằng chứng.
> `SPIKE_B_3D/TASK.md` cho phép nguyên văn:
>
> > *"Claude **may**: build the harness and fixture generator, write the conformance and
> > picking-error tests, write frame-rate instrumentation, prepare the result template, and
> > analyse measurements the owner supplies."*
>
> Và ngay trên đó, ai giữ bằng chứng:
>
> > *"**All on-device measurements are executed by Vũ Hùng Anh.**"*
>
> Nên ở đây **không có** `RESULT.md`, không con số nào được tính vào `B4` `B5` `B10` `B11`, và mọi
> output đều mang nhãn `DIAGNOSTIC`. Dựng trong đêm 2026-09-11, xem
> [`INC-001`](../../management/incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md).

---

## Cấu trúc

```text
tests/fixtures/geometry/          ★ FIXTURE CHÍNH THỨC — của Vũ Hùng Anh (DR-013), PR #20
spikes/spike_b_3d/
├── fixtures_proposal/            SUPERSEDED — bản nháp mà fixture chính thức được nhận từ đó
│   ├── FORMAT.md
│   ├── generate.py
│   └── geometry_fixture_v0.json  33 điểm test có nhóm + 13 tia picking
├── mesh/
│   ├── build_mesh.py             voxel-face surface + 4 mức decimation
│   └── out/                      .obj mỗi mức + mesh_levels.json + picking_error.json
└── harness/
    ├── conformance.py            B2 B4 B8 — thư viện tái dùng được cho TC-MAINT-002
    └── picking_error.py          B5 B6 B12 B14 — sai số picking, 6 hướng camera
```

> **Cập nhật 2026-09-13.** Vũ Hùng Anh đã **nhận** bộ fixture và công bố nó ở
> `tests/fixtures/geometry/` (PR #20): hình học giống bản đề xuất từng giá trị, cộng quyền sở hữu,
> trạng thái `CANONICAL` và khối `b14_grouping`. **Cả ba công cụ giờ mặc định đọc fixture chính
> thức.** `fixtures_proposal/` giữ lại làm lịch sử, không còn là nguồn.

---

## Chạy

```bash
python spikes/spike_b_3d/harness/conformance.py          # 33 điểm, bound EXACT — fixture chính thức
python spikes/spike_b_3d/mesh/build_mesh.py              # 4 mức decimation
python spikes/spike_b_3d/harness/picking_error.py        # sai số picking × 6 hướng camera
```

Chỉ cần `numpy`. Không thêm dependency nào — chọn thư viện mesh cho Spike B là việc của anh.

---

## Trạng thái tiêu chí — cái gì chạy được desktop, cái gì cần máy

| # | Tiêu chí | Bound | Trạng thái |
|---|---|---|---|
| **B2** | Slice plane tính từ source geometry | khớp fixture | **desktop — đạt** trên fixture chính thức |
| **B4** | Picking trên fixture ra **đúng** slice | **exact, zero tolerance** | **desktop — 33/33 điểm, 0 finding** |
| **B8** | Geometry đúng sau thao tác camera bất kỳ | fixture re-check | **desktop — 6 hướng camera, đạt** |
| **B5** | Sai số picking trên **mesh thật** đã decimate | **≤ ±1 slice** | `DIAGNOSTIC` trên **mesh tổng hợp** — mesh thật cần Spike D |
| **B6** | B4 và B5 giữ nguyên sau xoay/zoom camera | cùng bound | `DIAGNOSTIC` — 6 hướng xoay đã chạy |
| **B12** | Bảng frontier ≥3 mức | bảng | **4 mức** có triangle count + sai số; **thiếu cột FPS** |
| **B14** | Tách interior / surface-tangent | hai nhóm | **có** — theo **nhãn hợp đồng** trong `b14_grouping` của fixture chính thức, kèm độ nhạy từng nhóm. Phán nhóm là của anh |
| B1 B3 B7 B9 | render, picking, điều hướng 2D, chọn nền | — | `NOT MEASURED` — chưa dựng app |
| **B10 B11** | **≥20 FPS median · không stall >500 ms** | | `NOT MEASURED` — **cần Galaxy A17 và cần chính anh** |
| **B13** | Đề xuất DR-008c | | **chưa đủ dữ kiện** — xem dưới |
| B15 | Chi phí phát triển mỗi ứng viên | | `NOT MEASURED` |

### Vì sao `B13` chưa chốt được

Harness cho thấy **mức 3 (93,7% ít tam giác hơn) vẫn nằm trong ±1 slice** trên mesh tổng hợp. Đó
**không** phải đề xuất DR-008c. `B13` đòi *"the budget maximising frame rate **subject to** picking
error ≤ ±1 slice"* — mà **cột frame rate chưa tồn tại**. Một mức decimation picking chính xác nhưng
render 12 FPS là **trượt `B10`**.

`DAY01_VU_HUNG_ANH.md` liệt kê *"chốt DR-008c bằng phán đoán thay vì bằng số đo"* vào mục **không
được làm**. Nên bảng này để trống cột FPS thay vì điền bằng suy đoán.

---

## Kết quả chạy 2026-09-13 trên fixture chính thức — `DIAGNOSTIC`, không phải bằng chứng nghiệm thu

**Mesh, từ mask tổng hợp deterministic 48×40×24, 6855 voxel foreground** *(số đỉnh và tam giác
deterministic; thời gian decimate đổi theo từng lần chạy):*

| Mức | cell | đỉnh | tam giác | giảm | decimate |
|---:|---:|---:|---:|---:|---:|
| 0 | 1 | 2825 | 5648 | — | 0,025 ms |
| 1 | 2 | 721 | 1448 | 74,4% | 1,942 ms |
| 2 | 3 | 317 | 632 | 88,8% | 1,756 ms |
| 3 | 4 | 178 | 356 | 93,7% | 1,961 ms |

**Sai số picking — 13 tia × 6 hướng camera, 78 tia chạm mask:**

> ### ❌ Bản đầu của bảng này SAI. Đã rút lại.
>
> Ground truth cũ là *ray-cast vào mesh mức 0*, nên **mức 0 được so với chính nó** — sai số 0 là một
> đồng nhất thức, không phải một phép kiểm. Và nhãn nhóm không mô tả đúng hình học: mọi tia
> `surface_tangent` đâm gần **vuông góc** với bề mặt và **kém nhạy 20 lần** theo trục z, nên chênh
> lệch "7×" tôi báo là số học chứ không phải phát hiện. Chi tiết: [`FORMAT.md`](fixtures_proposal/FORMAT.md) §6.
>
> **Đã sửa:** ground truth là **DDA ray-march trên mask voxel**, không chạm mesh nào; góc tới **tính
> tại điểm chạm** theo góc tia–pháp tuyến; và độ nhạy được báo cùng bảng.
>
> **Sửa tiếp 2026-09-13 (review PR #15 của Vũ Hùng Anh):** bản 12/09 đã **bỏ luôn nhãn nhóm của
> fixture** và nhóm theo `steep`/`grazing`. Sai: nhóm B14 là hợp đồng của chủ sở hữu hình học.
> `by_group` giờ theo đúng nhãn `interior` / `surface_tangent`; `steep`/`grazing` chỉ còn là chẩn
> đoán phụ, báo tách riêng.

**Nhóm B14 — nhãn hợp đồng của fixture (`by_group`):**

| Mức | tam giác | nhóm | n | góc tới TB | slice/mm | nohit | max | mean | trong bound |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---|
| 0 | 5648 | `interior` | 30 | 35,2° | 0,695 | 0 | 0 | 0,000 | ✓ |
| 0 | 5648 | `surface_tangent` | 48 | 29,5° | 0,194 | 0 | 1 | 0,062 | ✓ |
| 1 | 1448 | `interior` | 30 | 35,2° | 0,695 | 0 | 1 | 0,333 | ✓ |
| 1 | 1448 | `surface_tangent` | 48 | 29,5° | 0,194 | 0 | 1 | 0,062 | ✓ |
| 2 | 632 | `interior` | 30 | 35,2° | 0,695 | 0 | 1 | 0,200 | ✓ |
| 2 | 632 | `surface_tangent` | 48 | 29,5° | 0,194 | 0 | 1 | 0,062 | ✓ |
| 3 | 356 | `interior` | 30 | 35,2° | 0,695 | 0 | 1 | 0,300 | ✓ |
| 3 | 356 | `surface_tangent` | 48 | 29,5° | 0,194 | 0 | 1 | 0,042 | ✓ |

**Đọc cột `slice/mm` trước cột `mean`.** Trên fixture này hai nhóm hợp đồng có đòn bẩy **chênh ~3,6
lần** (0,695 vs 0,194): cùng một độ dịch hình học, `interior` sẽ ra sai số slice lớn hơn. Chênh lệch
`mean` giữa hai nhóm vì thế **không** tự nó là tính chất của decimation. Diễn giải là việc của anh.

*Chẩn đoán phụ — góc tới tại điểm chạm (`by_incidence_diagnostic`), **không** phải nhóm B14:*

| Mức | lớp | n | góc tới TB | slice/mm | mean |
|---:|---|---:|---:|---:|---:|
| 0 | grazing | 8 | 72,3° | 0,523 | 0,000 |
| 0 | steep | 70 | 27,0° | 0,371 | 0,043 |
| 1 | grazing | 8 | 72,3° | 0,523 | 0,250 |
| 1 | steep | 70 | 27,0° | 0,371 | 0,157 |
| 2 | grazing | 8 | 72,3° | 0,523 | 0,000 |
| 2 | steep | 70 | 27,0° | 0,371 | 0,129 |
| 3 | grazing | 8 | 72,3° | 0,523 | 0,125 |
| 3 | steep | 70 | 27,0° | 0,371 | 0,143 |

**Bốn giới hạn phạm vi — đọc trước khi dùng bảng trên:**

1. **Mesh tổng hợp, không phải giải phẫu.** Mask thật từ Spike D có thể đảo kết luận.
2. **Không có số FPS nào.** `B10` `B11` cần Galaxy A17 và cần chính anh chạy.
3. **Mức 0 khác 0 là một KẾT QUẢ, không phải lỗi harness** — nó đo chi phí của phương pháp trích bề
   mặt theo mặt voxel, và chỉ đo được vì ground truth không còn là chính nó.
4. **Zoom không được mô phỏng** — zoom không đổi tam giác nào bị tia cắt. Xoay thì có, nên xoay được chạy.

---

## Nguyên tắc không đổi trong thư mục này

- **Bound `±1 slice` là SCQ-06 đóng băng trước Spike B.** Harness đo theo nó, **không thương lượng
  với nó**. Vượt bound là một kết quả; nới bound là vi phạm cần Decision Request (`00` §13).
- **Fixture bound là EXACT, zero tolerance.** Không có "gần đủ".
- **Generator và checker không dùng chung code.** Checker suy lại từ công thức trong fixture rồi so.
- **Ground truth là DDA ray-march trên mask voxel** — không chạm mesh nào. *(Dòng này từng ghi
  "ground truth là mesh mức 0"; đó chính là tautology đã sửa ngày 12/09.)*
- **Mọi output mang nhãn `DIAGNOSTIC`** cho tới khi anh chạy trên máy thật.

---

## Việc tiếp theo — của anh

1. ~~Nhận / sửa / thay bộ fixture~~ ✅ **xong 13/09** — PR #20.
2. ~~Công bố format~~ ✅ **xong 13/09** — `tests/fixtures/geometry/FORMAT.md`.
3. Diễn giải nhóm B14 trên bảng trên — nhớ đọc cột `slice/mm`. *(Phát hiện "~7 lần" từng ghi ở đây
   **đã rút lại** ngày 12/09; đừng thừa kế nó.)*
4. Quyết có xoá `fixtures_proposal/` không — nó không còn là nguồn của công cụ nào.
5. Thay mask tổng hợp bằng mask thật khi Spike D có dữ liệu, chạy lại `build_mesh.py`.
6. `B10` `B11` trên Galaxy A17, điền cột FPS vào bảng frontier, rồi mới đề xuất **DR-008c**.

**Liên quan:** [`../../management/spikes/SPIKE_B_3D/TASK.md`](../../management/spikes/SPIKE_B_3D/TASK.md) ·
[`../../management/spikes/SPIKE_B_3D/EVIDENCE_TEMPLATE.md`](../../management/spikes/SPIKE_B_3D/EVIDENCE_TEMPLATE.md) ·
[`../../management/day01/tasks/DAY01_VU_HUNG_ANH.md`](../../management/day01/tasks/DAY01_VU_HUNG_ANH.md)
