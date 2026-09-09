# 3D MESH UI & FPS — QUICK REFERENCE

**Mức:** `REFERENCE` — tài liệu hình dung nhanh cho Vũ Hùng Anh / Spike B

**Phạm vi:** mesh LA, luồng 2D↔3D, picking và hướng tối ưu hiệu năng mobile

**Không phải:** spec mới, quyết định framework, kết quả đo, hay bằng chứng nghiệm thu

> Khi tài liệu này khác `docs/specs/v1.0/` hoặc `management/spikes/SPIKE_B_3D/TASK.md`, tài liệu có
> thẩm quyền cao hơn thắng. Mọi con số ví dụ bên dưới đều là **MINH HỌA — KHÔNG PHẢI SỐ ĐO**.

---

## 1. Mesh 3D của dự án trông như thế nào?

Mesh là **bề mặt khoang tâm nhĩ trái (LA cavity)** dựng từ một binary mask 3D. Nó không nhất thiết là
toàn bộ quả tim.

```text
RawPredictionMask / GroundTruthMask
        │  volume voxel 0/1
        ▼
surface extraction (ví dụ Marching Cubes)
        │
        ▼
triangle mesh của LA
        │
        ├── rotate / zoom / pan
        ├── active-slice plane hoặc marker
        └── picking → source slice
```

Ví dụ gần với loại hiển thị ta sẽ làm:

- [3D Slicer — Automated Left Atrium Segmentation](https://www.slicer.org/wiki/Documentation/Nightly/Modules/AutomatedLASegmentation)
- [3D Slicer — Image Segmentation](https://slicer.readthedocs.io/en/latest/user_guide/image_segmentation.html)
- [LASC 2018 — nguồn dataset của dự án](https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/)

Các link trên chỉ để hình dung. **Repo hiện chưa có screenshot/video/mesh do dự án tạo ra**; artifact đó chỉ
được sinh khi Spike B thực sự chạy và có bằng chứng thật.

---

## 2. Hai layout UI có thể thử trong spike

Spec bắt buộc **hành vi liên kết**, không đóng băng layout cuối cùng.

### Phương án A — chuyển giữa 2D và 3D

Phù hợp màn hình điện thoại vì mỗi view có nhiều diện tích.

```text
┌──────────────────────────┐      ┌──────────────────────────┐
│ Case: CASE_0001          │      │ Case: CASE_0001          │
│ Run: EXP-D-100 / RAW     │      │ Run: EXP-D-100 / RAW     │
├──────────────────────────┤      ├──────────────────────────┤
│                          │      │          ╭────╮          │
│       MRI slice 42       │      │      ╭───╯    ╰──╮       │
│     + mask overlay       │      │      │ ────────  │       │
│                          │      │      ╰──╮    ╭───╯       │
├──────────────────────────┤      │         ╰────╯           │
│ Slice 42 / 88            │      ├──────────────────────────┤
│ ◀ ━━━━━━━●━━━━━━━━━ ▶    │      │ Rotate · Zoom · Pan      │
│              [Open 3D] ──┼─────►│ Tap mesh → Open slice    │
└──────────────────────────┘      └──────────────────────────┘
```

### Phương án B — split view

Hữu ích để demo liên kết tức thời, nhưng mỗi view nhỏ hơn.

```text
┌──────────────────────────┐
│         3D mesh          │
│        ╭──────╮          │
│       │────────│         │ ← plane/marker của slice 42
│        ╰──────╯          │
├──────────────────────────┤
│      MRI slice 42        │
│    + selected overlay    │
├──────────────────────────┤
│ ◀ ━━━━━━●━━━━━━━━━━ ▶    │
│       42 / 88            │
└──────────────────────────┘
```

Hai phương án đều phải dùng cùng một `activeSliceIndex`; không để 2D và 3D giữ hai bản state độc lập.

---

## 3. Ba demo hành vi nên dựng

### Demo 1 — 2D → 3D

```text
Người dùng kéo slider đến slice 42
→ activeSliceIndex = 42
→ tính plane/marker từ source geometry
→ 3D hiển thị đúng vị trí của slice 42
→ rotate/zoom không làm plane trôi khỏi vị trí đó
```

Plane phải được tính từ `origin + direction + spacing`, không đặt bằng mắt cho “trông đúng”.

### Demo 2 — 3D → 2D

```text
Touch màn hình
→ screen ray
→ ray/mesh intersection
→ world point
→ inverse geometry transform
→ continuous voxel coordinate (x,y,z)
→ resolve source slice từ z
→ cập nhật activeSliceIndex
→ mở 2D Inspector tại slice đó
```

Nếu chỉ xác định chắc chắn được slice, UI chỉ mở slice; không bịa một pixel highlight chính xác hơn dữ
liệu transform cho phép.

### Demo 3 — invalid/background selection

```text
Touch không giao mesh
→ không đổi activeSliceIndex
→ không tự nhảy về slice 0
→ có thể hiện feedback nhẹ: "No surface selected"
```

Selection sai không được gây điều hướng gây hiểu nhầm.

### Demo 4 — error view (Spike F, sau Spike B)

Khi có Ground Truth:

```text
TP / FP / FN representation
→ bật/tắt từng loại lỗi
→ chọn vùng lỗi
→ mở source slice hoặc tập contributing slices
```

Không có Ground Truth thì không được hiện FP/FN giả hoặc Dice giả.

---

## 4. “Độ chính xác 3D” được hiểu theo ba lớp

### A. Segmentation accuracy — chất lượng mask AI

Tính trên toàn bộ volume của từng ca:

```text
Dice = 2 × |Prediction ∩ GroundTruth| / (|Prediction| + |GroundTruth|)
IoU  =     |Prediction ∩ GroundTruth| / |Prediction ∪ GroundTruth|
```

Đây là độ chính xác của **prediction mask**, không phải tốc độ render hay picking.

### B. Geometry/picking accuracy — phần Spike B phải chứng minh

| Đối tượng | Ràng buộc đã đóng băng |
|---|---|
| Canonical synthetic fixture | Trả về **đúng tuyệt đối** expected slice, error `0` |
| Mesh thật đã decimate | Maximum error **≤ ±1 source slice** |

```text
expected slice = 42
observed = 42      → exact
observed = 41/43   → chỉ chấp nhận cho real decimated mesh
observed = 40/44   → FAIL
```

Phải báo cáo riêng điểm `interior` và điểm `surface-tangent`.

### C. Surface fidelity — độ méo của mesh

Spec hiện chưa đặt threshold riêng như “mesh decimated lệch tối đa bao nhiêu mm so với mesh gốc”. HD95
là metric optional sau khi geometry vật lý được kiểm định và chủ yếu đánh giá biên prediction so với GT;
nó không tự động thay cho phép đo sai lệch do decimation.

Vì thế không được nói “mesh chính xác X mm” nếu chưa có metric và bằng chứng tương ứng.

---

## 5. Pipeline dựng mesh nên giữ

```text
validated binary mask + geometry
        │
        ├── check shape / label values
        ├── preserve origin / spacing / direction
        ▼
surface extraction
        │
        ├── vertices
        ├── triangle indices
        └── normals
        ▼
canonical/world transform
        │
        ▼
native mesh
        │
        ├── decimation level 1
        ├── decimation level 2
        └── decimation level 3+
        ▼
mobile GPU buffers + picking structure
```

Transform khái niệm:

```text
world = origin + direction × (spacing ⊙ voxelIndex)
```

Thứ tự bộ nhớ của thư viện, ví dụ `[z,y,x]`, không được trở thành API contract. Adapter phải đưa mọi thứ
về canonical `(x,y,z)`.

---

## 6. Tối ưu FPS — làm theo thứ tự

### 6.1 Đo đúng trước

- Dùng **release build** trên Samsung Galaxy A17 5G thật.
- Ghi frame-time distribution; không chỉ nhìn một FPS counter tức thời.
- `20 FPS` tương đương khoảng `50 ms/frame`; stall `500 ms` là một lần đứng hình rất rõ.
- Ghi thermal state, battery/power mode, background load và throttling.
- Giữ cùng camera path / thao tác test giữa các mesh level.

### 6.2 Giảm chi phí hình học

- Sinh ít nhất ba mức decimation có triangle count rõ ràng.
- Loại triangle/vertex không dùng và geometry trùng nếu pipeline tạo ra chúng.
- Upload vertex/index buffer lên GPU một lần; không tạo lại mesh mỗi frame.
- Reuse buffers; tránh cấp phát object liên tục khi drag để giảm GC pause.
- Dùng picking acceleration structure nếu ray/triangle test toàn mesh quá chậm.

> Không chọn mức nhẹ nhất theo FPS trước. Lọc bỏ mọi mức có picking error `> ±1 slice`, rồi mới so FPS
> giữa các mức còn hợp lệ.

### 6.3 Giảm chi phí render

- Dùng material/shader đơn giản cho mesh trong spike.
- Giảm số draw call và số pass; tránh transparency nhiều lớp khi không cần.
- Không rebuild normals, error colors hoặc slice plane trong mỗi frame nếu dữ liệu không đổi.
- Chỉ render liên tục trong lúc có animation/gesture; khi scene đứng yên có thể render-on-demand nếu stack
  hỗ trợ.
- Có thể thử giảm **render scale** trong lúc tương tác nếu fill-rate là bottleneck, nhưng transform picking
  phải dùng đúng viewport thực tế và vẫn phải qua test accuracy.

### 6.4 Giảm công việc trên UI thread

- Mesh generation/decimation/parse không chạy đồng bộ trên UI thread.
- Precompute hoặc load artifact bất đồng bộ.
- Coalesce move events khi gesture phát quá dày, nhưng không làm mất trạng thái cuối.
- Không log từng frame vào console trong release measurement; ghi vào buffer rồi xuất sau.

### 6.5 Chỉ tối ưu bottleneck đã đo thấy

```text
CPU cao, GPU thấp    → xem parsing, allocations, raycast, state update
GPU cao              → xem triangle count, overdraw, shader, render scale
stall khi load       → xem I/O, decode, buffer upload, main-thread blocking
picking chậm         → xem acceleration structure và số ray tests
```

Không đổi framework hoặc geometry semantics chỉ vì “cảm giác chậm”. Framework cuối chỉ được chọn sau
bằng chứng của cả Spike A và Spike B.

---

## 7. Bảng thử nghiệm mẫu

**BẢNG MINH HỌA — KHÔNG PHẢI KẾT QUẢ ĐO CỦA DỰ ÁN.**

| Level | Triangle count | Median FPS | Longest stall | Max picking error | Đạt cả hai? |
|---|---:|---:|---:|---:|---|
| Native | `[MEASURE]` | `[MEASURE]` | `[MEASURE]` | `[MEASURE]` | |
| Medium | `[MEASURE]` | `[MEASURE]` | `[MEASURE]` | `[MEASURE]` | |
| Low | `[MEASURE]` | `[MEASURE]` | `[MEASURE]` | `[MEASURE]` | |

Quy tắc chọn:

```text
candidates = levels có:
    median FPS ≥ 20
    longest stall ≤ 500 ms
    max picking error ≤ 1 source slice

recommendation = candidate cho hiệu năng tốt nhất
                 mà không vi phạm accuracy
```

Nếu `candidates` rỗng: ghi `NEGATIVE_RESULT` và báo leader; không nới ±1 slice.

---

## 8. Checklist demo nhanh

```text
□ Mesh LA hiện được
□ Rotate / zoom / pan hoạt động
□ Slice slider làm plane/marker 3D di chuyển đúng
□ Tap mesh mở đúng source slice
□ Camera rotate/zoom xong picking vẫn đúng
□ Tap background không gây false navigation
□ Fixture exact: error = 0
□ Real decimated mesh: error ≤ ±1 slice
□ Median FPS ≥ 20
□ Không stall > 500 ms
□ Có ít nhất 3 decimation levels
□ Số liệu lấy từ máy thật, release build
```

---

## 9. Ranh giới Day 0

Trong Day 0, dùng file này để hình dung và thảo luận. Chưa:

- chuyển Spike B sang `ACTIVE`;
- tạo harness nghiệm thu;
- đo FPS/picking;
- tạo `RESULT.md`;
- ghi số minh họa thành số đo thật.

Khi Execution Day 1 được leader tuyên bố, nguồn thực thi là:

- [`../spikes/SPIKE_B_3D/TASK.md`](../spikes/SPIKE_B_3D/TASK.md)
- [`../spikes/SPIKE_B_3D/EVIDENCE_TEMPLATE.md`](../spikes/SPIKE_B_3D/EVIDENCE_TEMPLATE.md)
- [`TEAM_SHARED_CORE.md`](TEAM_SHARED_CORE.md), đặc biệt §G–H
