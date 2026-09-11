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
spikes/spike_b_3d/
├── fixtures_proposal/
│   ├── FORMAT.md                 ★ ĐỌC CÁI NÀY TRƯỚC — đề xuất format, và 1 phát hiện cần anh soi
│   ├── generate.py               sinh fixture, deterministic, stdlib thuần
│   └── geometry_fixture_v0.json  32 điểm test có nhóm + 13 tia picking
├── mesh/
│   ├── build_mesh.py             voxel-face surface + 4 mức decimation
│   └── out/                      .obj mỗi mức + mesh_levels.json + picking_error.json
└── harness/
    ├── conformance.py            B2 B4 B8 — thư viện tái dùng được cho TC-MAINT-002
    └── picking_error.py          B5 B6 B12 B14 — sai số picking, 6 hướng camera
```

> ⚠ **`fixtures_proposal/` KHÔNG phải `tests/fixtures/geometry/**`.** Bộ canonical là deliverable
> của anh theo DR-013, vùng một-chủ-sở-hữu theo `15` §9, và **format là quyền anh quyết**. Bản này
> nằm ngoài đường của anh có chủ ý. Chi tiết trong [`FORMAT.md`](fixtures_proposal/FORMAT.md).

---

## Chạy

```bash
python spikes/spike_b_3d/fixtures_proposal/generate.py   # sinh lại fixture (chạy 2 lần ra checksum giống hệt)
python spikes/spike_b_3d/harness/conformance.py          # 32 điểm, bound EXACT
python spikes/spike_b_3d/mesh/build_mesh.py              # 4 mức decimation
python spikes/spike_b_3d/harness/picking_error.py        # sai số picking × 6 hướng camera
```

Chỉ cần `numpy`. Không thêm dependency nào — chọn thư viện mesh cho Spike B là việc của anh.

---

## Trạng thái tiêu chí — cái gì chạy được desktop, cái gì cần máy

| # | Tiêu chí | Bound | Trạng thái |
|---|---|---|---|
| **B2** | Slice plane tính từ source geometry | khớp fixture | **desktop — đạt** trên fixture đề xuất |
| **B4** | Picking trên fixture ra **đúng** slice | **exact, zero tolerance** | **desktop — 32/32 điểm, 0 finding** |
| **B8** | Geometry đúng sau thao tác camera bất kỳ | fixture re-check | **desktop — 6 hướng camera, đạt** |
| **B5** | Sai số picking trên **mesh thật** đã decimate | **≤ ±1 slice** | `DIAGNOSTIC` trên **mesh tổng hợp** — mesh thật cần Spike D |
| **B6** | B4 và B5 giữ nguyên sau xoay/zoom camera | cùng bound | `DIAGNOSTIC` — 6 hướng xoay đã chạy |
| **B12** | Bảng frontier ≥3 mức | bảng | **4 mức** có triangle count + sai số; **thiếu cột FPS** |
| **B14** | Tách interior / surface-tangent | hai nhóm | **có** — và kết quả **ngược kỳ vọng**, xem `FORMAT.md` §6 |
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

## Kết quả chạy đêm 2026-09-11 — `DIAGNOSTIC`, không phải bằng chứng nghiệm thu

**Mesh, từ mask tổng hợp deterministic 48×40×24, 6855 voxel foreground:**

| Mức | cell | đỉnh | tam giác | giảm | decimate |
|---:|---:|---:|---:|---:|---:|
| 0 | 1 | 2825 | 5648 | — | 0,02 ms |
| 1 | 2 | 721 | 1448 | 74,4% | 1,82 ms |
| 2 | 3 | 317 | 632 | 88,8% | 1,43 ms |
| 3 | 4 | 178 | 356 | 93,7% | 1,36 ms |

**Sai số picking, 13 tia × 6 hướng camera:**

| Mức | interior max / mean | surface_tangent max / mean | Trong bound ±1 |
|---:|---|---|---|
| 0 | 0 / 0,000 | 0 / 0,000 | ✓ *(phải bằng 0 — đây là ground truth)* |
| 1 | 1 / 0,400 | 1 / 0,063 | ✓ |
| 2 | 1 / 0,333 | 1 / 0,083 | ✓ |
| 3 | 1 / 0,433 | 1 / 0,063 | ✓ |

**Bốn giới hạn phạm vi — đọc trước khi dùng bảng trên:**

1. **Mesh tổng hợp, không phải giải phẫu.** Mask thật từ Spike D có tỉ lệ khung hình, độ cong và
   vùng lõm khác — kết luận có thể đảo.
2. **Không có số FPS nào.** Chạy desktop. `B10` `B11` cần Galaxy A17 và cần chính anh chạy.
3. **Mức 0 bằng 0 là kiểm tra tính đúng đắn của harness, không phải kết quả.** Nếu nó khác 0 thì
   harness sai chứ không phải mesh sai.
4. **Zoom không được mô phỏng** — zoom không đổi tam giác nào bị tia cắt. Xoay thì có, nên xoay được
   chạy. Lý do ghi trong `picking_error.py` thay vì lặng lẽ bỏ qua.

---

## Nguyên tắc không đổi trong thư mục này

- **Bound `±1 slice` là SCQ-06 đóng băng trước Spike B.** Harness đo theo nó, **không thương lượng
  với nó**. Vượt bound là một kết quả; nới bound là vi phạm cần Decision Request (`00` §13).
- **Fixture bound là EXACT, zero tolerance.** Không có "gần đủ".
- **Generator và checker không dùng chung code.** Checker suy lại từ công thức trong fixture rồi so.
- **Ground truth là mesh mức 0**, nơi mọi điểm bề mặt nằm đúng trên biên cell — nên slice của nó
  không mơ hồ. So với một hình cầu giải tích sẽ trộn sai số của phương pháp trích bề mặt vào rồi đổ
  lỗi cho decimation.
- **Mọi output mang nhãn `DIAGNOSTIC`** cho tới khi anh chạy trên máy thật.

---

## Việc tiếp theo — của anh

1. Đọc [`FORMAT.md`](fixtures_proposal/FORMAT.md), đặc biệt **§6** — phát hiện `interior` sai nhiều
   hơn `surface_tangent` gấp ~7 lần, ngược kỳ vọng của spec. Tôi **không** tự sửa nhãn nhóm; định
   nghĩa nhóm là một phần hợp đồng fixture và là quyết định của anh.
2. Nhận / sửa / thay bộ fixture → chuyển sang `tests/fixtures/geometry/**`, rồi **xoá
   `fixtures_proposal/`**.
3. Công bố format cho Phạm Tuấn Anh — Spike A đang dùng fixture tạm riêng và sẽ thay bằng bộ của anh.
4. Thay mask tổng hợp bằng mask thật khi Spike D có dữ liệu, chạy lại `build_mesh.py`.
5. Nhận Galaxy A17 (GATE 3), đo `B10` `B11`, điền cột FPS vào bảng frontier, rồi mới đề xuất
   **DR-008c**.

**Liên quan:** [`../../management/spikes/SPIKE_B_3D/TASK.md`](../../management/spikes/SPIKE_B_3D/TASK.md) ·
[`../../management/spikes/SPIKE_B_3D/EVIDENCE_TEMPLATE.md`](../../management/spikes/SPIKE_B_3D/EVIDENCE_TEMPLATE.md) ·
[`../../management/day01/tasks/DAY01_VU_HUNG_ANH.md`](../../management/day01/tasks/DAY01_VU_HUNG_ANH.md)
