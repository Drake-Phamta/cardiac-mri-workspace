# MEMBER BRIEF — VŨ HÙNG ANH

**Vai trò:**

| # | Vai trò |
|---:|---|
| 1 | **V2 3D / Spatial Error Investigation — Primary Owner** |
| 2 | **Imaging / Geometry / canonical 2D↔3D contract — Primary Owner** |
| 3 | **Spike B — Primary Owner** |
| 4 | **Spike F — Primary Owner** (sau Spike B) |
| 5 | **Spike D — Secondary Reviewer** |
| 6 | **Spike A — Secondary Reviewer** |

> ### Bạn sở hữu module rủi ro cao nhất của dự án
>
> `13` §12 xếp **"2D/3D mapping wrong in accepted build"** vào **P0/Critical**. `RISK-3D-GEOMETRY` là rủi ro HIGH loại P0 duy nhất trong register. **RA-H07, RA-H11 và RA-H14** đều nằm trong khối của bạn, và cả ba đều yêu cầu **một chủ sở hữu có tên** — đó là bạn (DR-013 ✅).
>
> Điều đó không phải để tạo áp lực, mà để nói rõ: **bộ canonical geometry fixture của bạn là thứ giữ cho backend và mobile không lệch nhau.** `TC-MAINT-002` kiểm chính xác điều đó.

---

## 1 · Tôi sở hữu gì

### V2 — 3D / Spatial Error Investigation (mobile vertical)

Hiển thị tái dựng LA · rotate/zoom/pan trên mobile · liên kết slice active ↔ mặt phẳng 3D · picking 3D → slice · tương tác bản đồ lỗi 3D.

**Requirement chính:** `PR-3D-01`…`05` · `PR-ERR-03` · `FR-3D-001`…`008` · `SCR-05` · `UC-06`…`09`
**Test sẽ kiểm:** `TC-3D-001`…`005` · `TC-PERF-002`

### Imaging / Geometry / canonical 2D↔3D contract (technical block)

Hợp đồng toạ độ canonical · bộ geometry fixture · pipeline tái dựng 3D · chuỗi biến đổi voxel↔world↔slice↔mesh.

**Requirement chính:** `07` §7 · `07` §8 (5 invariant) · `09` §6 · `NFR-MAINT-002` · `NFR-REL-003`
**Test sẽ kiểm:** **`TC-MAINT-002`** · `TC-3D-003` · `TC-3D-004` · `TC-REL-003`

### Spike B (hiện tại) và Spike F (tiếp theo)

Chi tiết ở §Spike B và §Spike F bên dưới.

---

## 2 · Vị trí của tôi trong hệ thống end-to-end

```text
RawPredictionMask (Quốc Khánh) ──► [ TÔI: 3D Reconstruction + geometry contract ]
                                              │
                                              ├──► mesh + geometry version
                                              │        └──► Đức Trung ingest (Contract 2)
                                              │
                                              └──► [ TÔI: V2 3D UI · picking · liên kết 2D↔3D ]
                                                            │
                                                            └──► người dùng

Bộ canonical geometry fixture (TÔI sở hữu)
        ├──► Spike A của Tuấn Anh tiêu thụ
        ├──► Spike F của chính tôi tiêu thụ
        └──► TC-MAINT-002: backend VÀ mobile phải cùng pass
```

**Tôi ngồi ở giữa** — nhận mask từ ML, tạo biểu diễn không gian, và định nghĩa hợp đồng mà **mọi lớp khác phải tuân theo**.

---

## 3 · Đầu vào tôi nhận

| Từ ai | Cái gì |
|---|---|
| **Bế Quốc Khánh** (ML) | `RawPredictionMask` / mask đã kiểm định để tái dựng. *(Spike B **không** phải chờ — dùng mask tổng hợp được)* |
| **Nguyễn Gia Đức Trung** (Backend) | API endpoint: geometry, reconstruction, error-reconstruction |
| Spike D (sau này) | Xác nhận gói dữ liệu thật có **axis-aligned** không → ảnh hưởng trực tiếp đến hợp đồng của tôi |
| Spec đóng băng | `07` §7, §8 · `09` §6 · **DR-008a ✅** · **SCQ-06** · **DR-012 ✅** |

---

## 4 · Đầu ra tôi tạo

| Cái gì | Cho ai |
|---|---|
| **Bộ canonical geometry fixture** — `tests/fixtures/geometry/**` | **Spike A** (Tuấn Anh) · **Spike F** (tôi) · **`TC-MAINT-002`** (backend + mobile) |
| Pipeline tái dựng 3D + mesh + geometry contract version | V2 3D UI · ingestion Contract 2 của Đức Trung |
| **Bằng chứng Spike B** — `RESULT.md` với số đo trên máy thật | **`GATE-MOB-01`** (cùng Spike A) · **DR-008c** |
| **Frontier decimation** — bảng ≥3 mức | **Khuyến nghị DR-008c** |
| **Bằng chứng Spike F** (sau này) | **DR-005** · điều kiện **C4** · **RA-B01** (BLOCKER duy nhất) |
| V2 3D UI chạy được với picking và liên kết hai chiều | Người dùng |

---

## 5 · Ai tiêu thụ đầu ra của tôi

- **Phạm Tuấn Anh** — Spike A của anh ấy **tiêu thụ bộ fixture của tôi**. Tôi phải **công bố format cho anh ấy trước khi** Spike A phụ thuộc vào nó (`15` §9 — integration-sensitive).
- **Nguyễn Gia Đức Trung** — ingest mesh của tôi (Contract 2); API của anh ấy phải trả geometry theo đúng quy ước của tôi.
- **`TC-MAINT-002`** — cả backend và mobile phải pass **cùng một** bộ fixture của tôi.
- **DR-008c** — khuyến nghị ngân sách mesh của tôi là đầu vào quyết định.
- **RA-B01 / điều kiện C4** — Spike F của tôi là thứ duy nhất gỡ được BLOCKER của dự án.

---

## 6 · Requirement / test / gate quan trọng nhất với tôi

| Loại | ID |
|---|---|
| **Độ chính xác picking** | **SCQ-06** — fixture: **CHÍNH XÁC TUYỆT ĐỐI**; mesh thật đã decimate: **≤ ±1 source slice** |
| **Hiệu năng** | **`NFR-PERF-002`** — **≥20 FPS median**, **không** stall >500 ms |
| **Invariant geometry** | `07` §8 invariant 1 (điểm test map nhất quán backend↔mobile) · 4 (3D selection giải ra slice hợp lệ qua cùng hợp đồng) · 5 (mặt phẳng slice tính **từ source geometry**, không phải phỏng đoán thị giác) |
| **Conformance** | **`TC-MAINT-002`** — backend và mobile **cùng pass một bộ fixture** |
| **Gate** | **`GATE-MOB-01`** / `DR-G05` — cần bằng chứng **cả Spike A và Spike B** · **DR-008c** — tôi quyết bằng bằng chứng · **DR-005** — Spike F cấp bằng chứng |
| **Điều kiện loại bỏ MVP** | `03` §4 — *"3D is decorative only and cannot link back to MRI slices"* |

---

## 7 · File / module tôi làm việc quanh đó

```text
spikes/spike_b_3d/**                          harness tạm - KHÔNG phải production code
spikes/spike_f_3d_error/**                    harness Spike F (sau này)
tests/fixtures/geometry/**                    ★ TÔI SỞ HỮU - integration-sensitive
tests/fixtures/error_masks/**                 fixture TP/FP/FN tổng hợp (Spike F)
management/spikes/SPIKE_B_3D/RESULT.md        chỉ khi có bằng chứng thật
management/spikes/SPIKE_F_3D_ERROR/RESULT.md  chỉ khi có bằng chứng thật
```

> **`tests/fixtures/geometry/**` là vùng integration-sensitive (`15` §9).** Chỉ **một** chủ sở hữu hoạt động tại một thời điểm — là tôi. **Công bố format cho Tuấn Anh trước khi Spike A phụ thuộc vào nó.**

---

## 8 · Tôi được TỰ quyết những gì

| Được |
|---|
| Cấu trúc và format nội bộ của bộ geometry fixture (miễn encode được các điểm voxel↔world↔slice đã biết theo DR-008a) |
| Chọn thư viện/phương pháp tái dựng để **thử** trong spike |
| Cách bố trí harness picking-error và instrumentation frame-rate |
| Chọn **các mức** decimation nào để trace frontier (≥3) |
| Tổ chức nội bộ code V2 3D (trong biên đã cho) |
| Chọn cách encode fixture TP/FP/FN tổng hợp cho Spike F |

---

## 9 · Tôi KHÔNG được quyết ngầm

| Không được | Lý do / phải qua |
|---|---|
| **Nới ràng buộc ±1 source slice** | **SCQ-06 đã đóng băng TRƯỚC Spike B.** Spike B **kiểm chứng sự phù hợp**, không suy ra lại giá trị. Muốn nới → **Decision Request** theo `00` §13 |
| **Đổi quy ước toạ độ canonical** | **DR-008a ✅** đã đóng băng |
| **Tự chốt ngân sách mesh** | **DR-008c** là quyết định của leader **dựa trên** bằng chứng của tôi — tôi **khuyến nghị**, không quyết |
| **Chọn/đóng băng mobile framework** | `GATE-MOB-01` cần **cả** Spike A và B |
| **Tự chọn biểu diễn lỗi 3D** | **DR-005** — Spike F cấp bằng chứng, leader quyết |
| **Âm thầm đơn giản hoá tính năng lỗi 3D** | `03` §4 — điều kiện **loại bỏ MVP**. Nếu không khả thi → **`NEGATIVE_RESULT` + leo thang** |
| Đổi geometry semantics, metric semantics, API contract, domain model | `00` §13 → DR |
| Bỏ qua biên axis-aligned bằng cách "che" một ca oblique | **DR-012 ✅** — phải từ chối bằng `GEOMETRY_NOT_VALIDATED` |

> ### ⚠ Cái bẫy lớn nhất dành cho bạn
>
> Bạn sẽ tìm được một mức decimation cho frame rate rất đẹp nhưng picking sai 2 slice. **Nó KHÔNG dùng được.**
>
> `13` §12 xếp sai mapping 2D/3D vào **P0/Critical**, nên **độ chính xác thắng frame rate**. Nếu **không** mức nào thoả đồng thời `NFR-PERF-002` và ±1 slice → ghi **`NEGATIVE_RESULT`** và leo thang. **Đừng nới trần.**

---

## 10 · Bằng chứng tôi phải tạo

### SPIKE B — 3D linked interaction

**Thiết bị:** Samsung Galaxy A17 5G, máy thật. **Emulator KHÔNG chấp nhận** cho B10.
**Slot đo:** **2 / 3** — sau Tuấn Anh (A), trước Đức Trung (E).
**Việc off-device (fixture + harness) CHẠY SONG SONG** trong lúc Tuấn Anh giữ máy.

#### Ràng buộc độ chính xác đã ĐÓNG BĂNG — đọc trước khi làm gì

| Ngữ cảnh | Ràng buộc |
|---|---|
| **Canonical synthetic geometry fixture** | **CHÍNH XÁC TUYỆT ĐỐI** — slice kỳ vọng, dung sai 0 |
| **Picking trên mesh thật đã decimate** | **Sai số tối đa ±1 source slice** |

**Spike B kiểm chứng sự phù hợp. Không suy ra lại, không thương lượng, KHÔNG nới lỏng.**

#### Acceptance criteria (đầy đủ ở `../spikes/SPIKE_B_3D/TASK.md`)

| # | Phải chứng minh | Ràng buộc |
|---:|---|---|
| B1 | Mesh render; rotate/zoom/pan chạy | định tính + không stall |
| B2 | Mặt phẳng slice active tính **từ source geometry** | khớp kỳ vọng fixture |
| **B3** | **Picking / selection 3D hoạt động** | **đáng tin, không chập chờn** |
| **B4** | **Picking trên fixture giải ra ĐÚNG slice kỳ vọng** | **chính xác tuyệt đối** |
| **B5** | **Sai số picking trên mesh thật đã decimate** | **≤ ±1 source slice** |
| B6 | B4 và B5 giữ nguyên **sau khi rotate và zoom camera** | cùng ràng buộc |
| B7 | Viewer 2D điều hướng tới slice đã giải | chính xác |
| B8 | Geometry vẫn đúng sau khi camera bị xoay tuỳ ý | fixture re-check pass |
| B9 | Selection không hợp lệ/nền **không** gây điều hướng sai lệch | 0 lần điều hướng sai |
| **B10** | **≥20 FPS median** trong test tương tác | **≥20 FPS** |
| **B11** | **Không stall >500 ms** do render bình thường | **0** |
| **B12** | **Frontier decimation ≥3 mức**, mỗi mức có triangle count, median FPS, picking error | bắt buộc có bảng |
| **B13** | **Khuyến nghị DR-008c** — ngân sách tối đa hoá frame rate **với điều kiện** picking error ≤ ±1 slice | khuyến nghị tường minh |
| **B14** | **Điểm interior vs surface-tangent báo cáo RIÊNG** | cả hai nhóm |
| B15 | Ghi nhận chi phí phát triển mỗi ứng viên | định tính, cho `09` §7 |

**Vì sao B14 quan trọng:** điểm **surface-tangent** — nơi tia picking gần song song với mặt phẳng slice — là ca khó. Báo cáo riêng để một kết quả interior tốt **không che được** thất bại ở tangent.

**Vì sao B3 là câu hỏi phân biệt:** **picking, không phải rendering.** Một framework render đẹp mà không picking đáng tin là **thất bại** — `FR-3D-005/006` đòi giải touch thành slice index.

### SPIKE F — 3D error representation (sau này)

**Trạng thái:** `PREPARED`, xếp sau Spike B. **Chuẩn bị fixture TP/FP/FN tổng hợp được làm ngay**, nhưng **implementation Spike F không được thành primary thứ hai** khi Spike B còn `ACTIVE` (`15` §7).

**Có lý do kỹ thuật để xếp sau:** acceptance criterion **F7 đòi năng lực picking mà Spike B chứng minh**. Chạy F trước B là đánh giá region-picking trên một nền chưa được chứng minh.

**Ba ứng viên phải so sánh:**

| # | Biểu diễn | Trade-off dự kiến **[GIẢ ĐỊNH — phải kiểm]** |
|---:|---|---|
| 1 | **Ba mesh riêng** (TP / FP / FN), bật/tắt độc lập | Khớp legend `10` §7; nhân ba ngân sách mesh; mesh FN có thể degenerate |
| 2 | **Một mặt LA + phân loại lỗi theo vertex** | Một mesh, render rẻ, picking tự nhiên; **chỉ** biểu diễn lỗi **trên mặt** — không thể hiện đảo FP tách rời |
| 3 | **Mặt LA + marker thành phần liên thông FP/FN addressable**, mỗi cái mang sẵn khoảng slice | Có thể khớp FR-3D-008 nhất — "vùng → slice đóng góp" thành **thuộc tính đã lưu** thay vì tính lúc runtime |

**Giả định cốt lõi phải kiểm (Q2):** vùng FN là **vỏ mỏng** giữa biên prediction và biên reference — chúng có **phân mảnh** thành hình học degenerate dưới isosurface extraction không, và điều đó có làm chúng **không picking được** không?

**`NEGATIVE_RESULT` là kết quả hợp lệ.** Nếu tính năng MUST không khả thi trong khung thời gian: **báo cáo kết quả âm và kích hoạt quyết định scope hình thức** qua DR-005. **Đừng âm thầm đơn giản hoá.**

### Bằng chứng KHÔNG được bịa

> **Claude không được tạo:** frame rate · thời lượng stall · sai số picking · quan hệ triangle-count↔FPS · thời gian sinh mesh trên máy thật · memory trên máy · hành vi nhiệt · tỉ lệ chọn vùng thành công · phán đoán về độ dễ đọc thị giác · bất kỳ thông số phần cứng nào.
>
> **Mọi phép đo trên máy do CHÍNH TÔI thực hiện.**
>
> Claude **được** dựng harness và bộ sinh fixture, viết conformance test và picking-error test, viết instrumentation frame-rate, dựng pipeline phân loại lỗi và gán nhãn thành phần, tính triangle count và kích thước artifact từ mesh đã sinh, chuẩn bị template, và **phân tích số liệu tôi cung cấp**.

---

## 11 · Ai review tôi

| Việc của tôi | Reviewer |
|---|---|
| **Spike B** | **Phạm Tuấn Anh** — ưu tiên **1** trong hàng đợi của anh ấy (B là P1, nạp `GATE-MOB-01` + DR-008c) |
| **Spike F** | **Phạm Tuấn Anh** — ưu tiên 3 |
| V2 3D vertical | **Phạm Tuấn Anh** |
| Imaging / Geometry block | **Phạm Tuấn Anh** |

### Tôi review ai

| Spike | Ưu tiên trong hàng đợi của tôi | Lý do |
|---|---|---|
| **Spike D** (Bế Quốc Khánh) | **1** | Spike D là **P0** |
| **Spike A** (Phạm Tuấn Anh) | **2** | |
| Spike C0 / C1 (Bế Quốc Khánh) | 3 | |

**Luật tuần tự hoá:** tôi giữ tối đa **MỘT** review ở `REVIEWING`. Nếu Spike A sẵn sàng mà Spike D chưa, tôi **được** review A — nhưng khi D sẵn sàng, **D lấy slot kế tiếp**.

**Review Spike D nghĩa là gì với tôi:** tôi phải hiểu đủ về dataset và provenance để **phản biện** verdict axis-alignment của Quốc Khánh — vì nó ảnh hưởng **trực tiếp** đến hợp đồng geometry của tôi và đến điều kiện **C6**.

---

## 12 · Hành động đầu tiên của tôi trên Execution Day 1 (2026-09-10)

```text
1.  Đặt Spike B → ACTIVE, ghi started_at THẬT (không lùi ngày).
2.  Bắt đầu BỘ CANONICAL GEOMETRY FIXTURE theo quy ước DR-008a.
        ← đây là việc đầu tiên, vì nó là đầu vào của Spike B, Spike F
          VÀ của TC-MAINT-002. Nó cũng là việc off-device nên chạy được
          ngay trong lúc Tuấn Anh giữ máy.
3.  Công bố format fixture cho Phạm Tuấn Anh (Spike A tiêu thụ nó).
4.  Dựng pipeline mesh + harness picking (off-device).
5.  Đăng ký slot đo thiết bị #2 với Tuấn Anh.
```

---

## 13 · Tôi cần biết gì về việc của người khác

| Người | Tôi cần biết vì |
|---|---|
| **Bế Quốc Khánh** | Tôi **review Spike D** → phải hiểu provenance dataset, ngữ nghĩa mask, và đặc biệt **verdict axis-alignment** (ảnh hưởng trực tiếp hợp đồng của tôi + điều kiện C6). Mask của anh ấy là đầu vào tái dựng của tôi |
| **Phạm Tuấn Anh** | Tôi **review Spike A** → phải hiểu brush coordinate mapping, vốn dùng **cùng** quy ước canonical của tôi. Anh ấy **tiêu thụ bộ fixture của tôi** |
| **Nguyễn Gia Đức Trung** | API của anh ấy phải trả geometry theo quy ước của tôi; anh ấy ingest mesh của tôi (Contract 2); Spike E của anh ấy đo transport mesh ở các mức decimation của tôi |

---

## 14 · Cách leo thang blocker

| Tình huống | Làm gì |
|---|---|
| **Không mức decimation nào thoả cả FPS và ±1 slice** | Ghi **`NEGATIVE_RESULT`**, báo leader ngay. **KHÔNG nới trần.** |
| **Fixture không pass chính xác tuyệt đối (B4 fail)** | Hiện thực geometry của tôi **sai** — sửa trước khi tiếp tục. Đây không phải vấn đề dung sai |
| **Spike F: không ứng viên nào khả thi** | **`NEGATIVE_RESULT`** → kích hoạt quyết định scope DR-005 qua leader. Đừng đơn giản hoá ngầm |
| **Spike D báo geometry không axis-aligned** | **RA-M02 leo thang**; cần DR mới; **C6 không đóng được**. Báo leader |
| Mâu thuẫn giữa hai file spec đóng băng | **DỪNG**, mở Decision Request (`00` §12 cấm tự đoán file nào thắng) |
| Cần đổi hợp đồng geometry | **Decision Request** — đừng tự sửa dù tôi là chủ sở hữu khối |
| Bị chặn bởi việc của người khác | Báo **Phạm Tuấn Anh** ngay, đừng giấu tới EOD (`15` §13) |

---

## Nhắc lại ranh giới Day 0 (2026-09-09)

Hôm nay: **KHÔNG** đặt Spike B sang `ACTIVE` · **KHÔNG** `RESULT.md` · **KHÔNG** đo trên máy · **KHÔNG** thu bằng chứng geometry. Chỉ đọc, thảo luận, cài tooling, drill Git, và hoàn thành cửa onboarding.
