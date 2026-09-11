# PROPOSED geometry fixture format — for Vũ Hùng Anh to adopt, amend or replace

> ## Đây là ĐỀ XUẤT, không phải deliverable
>
> Bộ canonical geometry fixture nằm ở **`tests/fixtures/geometry/**`** và thuộc về **Vũ Hùng Anh**
> theo **DR-013**. `15` §9 gọi đó là vùng **integration-sensitive, một chủ sở hữu tại một thời điểm**,
> và member brief của cậu ấy ghi rõ **format nội bộ là quyền tự quyết của cậu ấy**:
>
> > *"Cấu trúc và format nội bộ của bộ geometry fixture (miễn encode được các điểm voxel↔world↔slice
> > đã biết theo DR-008a)"* — mục "Tôi được TỰ quyết những gì"
>
> Nên bản này nằm ở `spikes/spike_b_3d/fixtures_proposal/`, **không** ở `tests/`. Nhận nguyên, sửa,
> hay vứt đi viết lại — cả ba đều là kết quả tốt. Thứ nó bỏ đi chỉ là trang giấy trắng.
>
> **Vì sao có nó:** `DAY01_VU_HUNG_ANH.md` gọi việc công bố format là *"mốc mở khoá người khác sớm
> nhất trong ngày"* — Spike A và Spike F đều tiêu thụ bộ này. Tối 2026-09-11 không ai có mặt để viết,
> nên một bản đề xuất được dựng thay vì để phụ thuộc đứng ở số không. Xem
> [`INC-001`](../../../management/incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md).

---

## 1 · Tóm tắt một màn hình

```jsonc
{
  "_status": "PROPOSAL",                    // biến mất khi bộ canonical land
  "fixture_id": "GEOM_PROPOSAL_V0",
  "contract": "DR-008a",
  "geometry_profile": "axis-aligned only (DR-012)",

  "shape_xyz":        [48, 40, 24],         // [Nx, Ny, Nz]
  "slice_shape_yx":   [40, 48],             // [Ny, Nx] — dư thừa CÓ CHỦ Ý, xem §4
  "spacing_xyz_mm":   [0.625, 0.750, 1.250],
  "origin_world_mm":  [-12.5, 7.25, -30.0],
  "space_directions": [[0.625,0,0], [0,0.750,0], [0,0,1.250]],
  "axis_aligned":     true,

  "transform": {
    "voxel_to_world": "world[i] = origin[i] + voxel[i] * spacing[i]",
    "world_to_voxel": "voxel[i] = (world[i] - origin[i]) / spacing[i]",
    "slice_index":    "slice_index = z, valid 0..Nz-1",
    "rounding":       "floor",
    "out_of_range":   "REJECT. Do not clamp into range."
  },

  "points": [ /* 32 điểm, có nhóm */ ],
  "picking_rays": [ /* 13 tia, tách interior / surface_tangent */ ]
}
```

---

## 2 · Bốn quyết định thiết kế, và lý do

### 2.1 · Volume **bất đẳng hướng** và origin **khác 0**

`spacing = [0.625, 0.750, 1.250]`, `origin = [-12.5, 7.25, -30.0]`.

Một phép biến đổi sai vẫn chạy đúng khi `spacing = 1.0` và `origin = 0`. Đó là cách phổ biến nhất để
một hợp đồng geometry **pass test rồi vẫn ship hỏng**. Ba trục ba spacing khác nhau, origin âm và không
đối xứng — sai một trục là lộ ngay.

### 2.2 · Sáu **nhóm điểm**, không phải một danh sách phẳng

| Nhóm | n | Bắt được lỗi gì |
|---|---:|---|
| `corner` | 8 | trục bị lật hoặc bị hoán vị |
| `face_centre` | 6 | lệch nửa voxel ở biên |
| `interior` | 5 | ca dễ — nếu cái này hỏng thì hỏng cơ bản |
| `slice_boundary` | 4 | off-by-one ở slice đầu và cuối |
| `half_voxel` | 3 | **luật làm tròn** — xem §3 |
| `out_of_range` | 6 | **clamp thay vì reject** — xem §3 |

Báo cáo theo nhóm vì một kết quả tốt ở `interior` **không được phép che** một thất bại ở `corner`.

### 2.3 · `out_of_range` là nhóm quan trọng nhất

Sáu điểm nằm ngoài volume. Một implementation đúng **từ chối** chúng. Một implementation clamp chúng
vào trong sẽ pass mọi test khác và vẫn khiến viewer 3D **điều hướng tới slice sai mà không báo gì** —
đúng cái tiêu chí `B9` cấm.

Đây là điểm mà tôi nghĩ bộ canonical nên giữ lại dù format có đổi thế nào.

### 2.4 · Tia picking đi **kèm** fixture, không nằm riêng

13 tia, mỗi tia có origin + direction trong world space, gắn nhãn `interior` hoặc `surface_tangent`.
`SPIKE_B_3D/TASK.md` `B14` đòi hai nhóm này báo riêng, nên chúng được **định nghĩa một lần trong
fixture** thay vì mỗi harness tự sinh — hai harness sinh tia khác nhau thì hai kết quả không so được.

---

## 3 · Hai luật phải nêu tường minh, vì đoán sai là im lặng

### `rounding: "floor"`

Voxel `(x,y,z)` phủ `[x, x+1) × [y, y+1) × [z, z+1)` dưới gốc trên-trái, nên `floor` là lựa chọn nhất
quán. Một consumer làm tròn về gần nhất sẽ **lệch với fixture ở mọi điểm nửa voxel** — và đó chính là
lý do nhóm `half_voxel` tồn tại. Nếu không có nhóm đó, hai implementation có thể khác nhau suốt nhiều
tuần mà không ai biết.

Luật này **giống hệt** luật brush của Spike A trong `spikes/spike_a_2d/fixtures/brush_cases.json`. Giữ
chúng giống nhau là chủ ý.

### `out_of_range: "REJECT"`

Không clamp. Xem §2.3.

---

## 4 · `slice_shape_yx` dư thừa có chủ ý

`slice_shape_yx = [Ny, Nx]` suy ra được từ `shape_xyz`. Nó vẫn được ghi ra, vì đây đúng là chỗ hay
nhầm nhất trong DR-008a: `shape_xyz` là `[Nx, Ny, Nz]` nhưng **một slice có shape `[Ny, Nx]`** — đảo
thứ tự. Ghi cả hai cho phép conformance test **bắt mâu thuẫn** thay vì để mỗi consumer tự suy ra rồi
suy sai.

`conformance.py` kiểm đúng điều này (mục `self_consistency`).

> **Thứ tự bộ nhớ của thư viện KHÔNG thuộc hợp đồng.** Mọi consumer đi qua `shape_xyz`.

---

## 5 · Cách kiểm — và vì sao checker không dùng chung code với generator

```bash
python spikes/spike_b_3d/fixtures_proposal/generate.py      # sinh lại, deterministic
python spikes/spike_b_3d/harness/conformance.py             # kiểm
```

`generate.py` **ghi** giá trị kỳ vọng; `conformance.py` **suy lại** từ công thức nằm trong chính
fixture rồi so. Hai file không dùng chung một dòng code nào. Một implementation tự kiểm chính nó thì
không chứng minh được gì — cùng lý do check `F2` của Spike A tồn tại.

`conformance.py` được viết thành **thư viện + CLI mỏng**, vì `SPIKE_B_3D/TASK.md` nói thẳng:

> *"This is the same test `TC-MAINT-002` will later use across backend and mobile — build it to be
> reusable."*

Hàm `check_fixture(fixture, impl)` nhận một implementation bất kỳ dưới dạng ba callable. Backend và
mobile mỗi bên đưa implementation của mình vào cùng hàm đó, cùng fixture đó — đúng thứ `TC-MAINT-002`
khẳng định.

**Kết quả hiện tại: 32/32 điểm exact, 0 finding.**

---

## 6 · ❌ RÚT LẠI — "phát hiện" ở bản đầu là SAI

Bản đầu của file này báo rằng nhóm `interior` sai gấp ~7 lần nhóm `surface_tangent`, và gọi đó là
phát hiện ngược kỳ vọng của spec. **Sai. Đó là tạo tác từ chính cách tôi dựng tia.**

Một luồng review độc lập đo lại từng tia:

| nhóm (nhãn cũ) | \|d_z\| TB | slice lệch / mm dọc tia | góc tới so với **pháp tuyến** |
|---|---:|---:|---|
| `interior` | 0,984 | **0,787** | 0–15° |
| `surface_tangent` | 0,049 | **0,0395** | **11–17°** |

Mọi tia gắn nhãn `surface_tangent` **đâm gần vuông góc với bề mặt**, ngược hẳn cái tên, và **kém
nhạy 20 lần** theo trục z. Với tỉ lệ đó, nhóm `interior` **buộc phải** ra số lớn hơn. Con số 7× là số
học, không phải hình học.

**Và kiểm "mức 0 phải bằng 0" là tautology** — nó so mesh mức 0 với chính nó. Người review dịch mesh
đi 5 slice, nó vẫn báo 0.

### Đã sửa cả hai

| Cũ | Mới |
|---|---|
| ground truth = ray-cast vào mesh mức 0 | **DDA ray-march trực tiếp trên mask voxel** — không chạm mesh nào |
| nhóm lấy từ nhãn đặt sẵn trong fixture | **tính tại điểm chạm** theo góc tia–pháp tuyến bề mặt |
| không báo độ nhạy | báo `slices/mm dọc tia` cho từng nhóm, để phân biệt hình học với đòn bẩy |

**Kết quả mới, trên cùng mesh tổng hợp:**

| Mức | tam giác | nhóm | góc tới TB | slice/mm | max | mean |
|---:|---:|---|---:|---:|---:|---:|
| 0 | 5648 | grazing | 76,3° | 0,432 | 0 | 0,000 |
| 0 | 5648 | steep | 26,4° | 0,375 | **1** | **0,016** |
| 3 | 356 | grazing | 76,3° | 0,432 | 1 | 0,125 |
| 3 | 356 | steep | 26,4° | 0,375 | 1 | 0,210 |

Ba điều đáng chú ý:

1. **Mức 0 giờ KHÁC 0** (steep, mean 0,016). Tautology biến mất — đó là chi phí thật của phương pháp
   trích bề mặt theo mặt voxel, đo được vì ground truth không còn là chính nó.
2. **Độ nhạy hai nhóm giờ chỉ chênh 1,15 lần** (0,432 vs 0,375), không phải 20 lần. So sánh mới công bằng.
3. **Không còn chênh lệch 7×.** Khi kiểm soát độ nhạy, hai nhóm gần như ngang nhau. **Đó mới là câu
   trả lời thật, và nó nhạt hơn nhiều so với cái tôi báo lần đầu.**

**Việc của anh không đổi:** định nghĩa nhóm cho `B14` vẫn là quyết định của anh. Ngưỡng 60° tôi chọn
là **tuỳ tiện** — ghi ra để anh phản biện một con số cụ thể.

---

## 7 · Nếu anh nhận bản này

1. Chuyển nội dung sang `tests/fixtures/geometry/**` theo format anh muốn
2. **Xoá `_status: PROPOSAL`** và các trường `_` khác
3. Trỏ `conformance.py` sang đường dẫn mới bằng `--fixture`
4. **Xoá thư mục `fixtures_proposal/`** — nó chỉ tồn tại để lấp khoảng trống
5. Báo format cho Phạm Tuấn Anh: Spike A đang dùng fixture tạm của riêng nó ở
   `spikes/spike_a_2d/fixtures/` và sẽ thay bằng bộ của anh

Nếu anh **không** nhận: vứt cả thư mục đi. Không có gì phụ thuộc vào nó ngoài harness Spike B, và
harness đọc đường dẫn qua tham số.

---

**Liên quan:** [`generate.py`](generate.py) · [`../harness/conformance.py`](../harness/conformance.py) ·
[`../harness/picking_error.py`](../harness/picking_error.py) ·
[`../../../management/spikes/SPIKE_B_3D/TASK.md`](../../../management/spikes/SPIKE_B_3D/TASK.md) ·
`docs/specs/v1.0/09_SYSTEM_ARCHITECTURE_SPEC.md` §6 · `docs/specs/v1.0/13_TEST_ACCEPTANCE_AND_TRACEABILITY.md` §11
