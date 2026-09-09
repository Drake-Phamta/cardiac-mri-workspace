# MEMBER BRIEF — BẾ QUỐC KHÁNH

**Vai trò:**

| # | Vai trò |
|---:|---|
| 1 | **V3 Experiment / Cohort Analysis — Primary Owner** |
| 2 | **ML Training / Evaluation Pipeline — Primary Owner** |
| 3 | **Spike D — Primary Owner** — **P0, ưu tiên cao nhất cả phase** |
| 4 | **Spike C0 / C1 — Primary Owner** (sau Spike D) |

> ### Bạn giữ spike P0 của dự án
>
> Spike D chặn nhiều việc hạ nguồn hơn bất kỳ spike nào khác: **toàn bộ training**, `GATE-SPLIT-01`, `GATE-ML-01` (qua Spike C1), và **hai điều kiện readiness C1 và C6**.
>
> Bạn **cũng** là Primary Owner thật sự, **không** phải người hỗ trợ cho hai thành viên có kinh nghiệm hơn. **Anti-bottleneck rule là ràng buộc (DR-013 ✅):** ownership ML **không được** chuyển sang Vũ Hùng Anh vì lý do tốc độ ngắn hạn. Vũ Hùng Anh là **reviewer và lưới an toàn** của bạn — dùng anh ấy đúng vai đó.

---

## 1 · Tôi sở hữu gì

### V3 — Experiment / Cohort Analysis (mobile vertical)

So sánh experiment · trực quan hoá khan hiếm dữ liệu · drill-down outlier · thống kê cohort.

**Requirement chính:** `PR-COHORT-01`/`02` · `PR-EXP-01`…`04` · `FR-EXP-001`…`006` · `SCR-01` · `SCR-07` · `UC-10`…`12`
**Test sẽ kiểm:** `TC-EXP-001`…`007` · `TC-EXP-009`

### ML Training / Evaluation Pipeline (technical block)

Audit dataset · split/subset · training 6 run lõi · đánh giá · ngữ nghĩa metric · ablation `EXP-D-PP`.

**Requirement chính:** `06` toàn bộ · `07` §2, §3, §6, §10 · `08` toàn bộ · `NFR-REP-001`…`004`
**Test sẽ kiểm:** `TC-EXP-008` (no leakage) · `TC-REP-001`…`004` · `TC-SCI-001`…`003`

### Spike D (hiện tại) và Spike C0 / C1 (tiếp theo)

Chi tiết ở §Spike D và §Spike C bên dưới.

---

## 2 · Vị trí của tôi trong hệ thống end-to-end

```text
Official Dataset ──► [ TÔI: Dataset Audit ] ──► DATASET_AUDIT.md + dataset_manifest.*
                                                       │
                     [ TÔI: Split / Subsets ] ◄─────────┘
                              │
                     [ TÔI: Training ] ──► RawPredictionMask ──┬──► Vũ Hùng Anh (mesh)
                              │                                ├──► Đức Trung (ingest)
                     [ TÔI: Metrics ] ──► CaseMetricSet ────────┘
                              │            SliceMetric
                              │            CohortMetricSummary
                              ▼
                     [ TÔI: V3 Cohort UI ] ──► người dùng ──► nhảy vào case explorer (Tuấn Anh)
```

**Tôi ở đầu chuỗi.** Nếu audit dataset của tôi sai, **mọi thứ hạ nguồn đều mất giá trị khoa học**.

---

## 3 · Đầu vào tôi nhận

| Từ ai | Cái gì |
|---|---|
| Nguồn chính thức | Gói **LASC 2018 / Atria Segmentation Data** từ Cardiac Atlas Project (`06` §1) |
| Spec đóng băng | `06` §3 (danh sách field manifest) và `06` §9 (danh sách check) — **đây là checklist có thẩm quyền của Spike D** |
| **Quyết định đã duyệt** | **DR-001 ✅** (trigger leo thang) · **DR-011 ✅** (normalization) · **DR-012 ✅** (biên geometry) · **SCQ-05** (nesting bắt buộc) · **SCQ-02** (3 entity metric) · **SCQ-04** (`EXP-D-PP`) · **DR-014 ✅** (95% CI) |
| **Nguyễn Gia Đức Trung** | Hợp đồng ingestion — output của tôi phải khớp schema manifest của anh ấy |

---

## 4 · Đầu ra tôi tạo

| Cái gì | Cho ai |
|---|---|
| **`management/DATASET_AUDIT.md`** | `GATE-DATA-01` · điều kiện **C1** |
| **`data/manifests/dataset_manifest.*`** — máy đọc được, **do script sinh, không gõ tay** | ingestion Contract 1 (Đức Trung) · Spike C1 |
| **Bằng chứng Path A vs Path B** | **DR-002 / `GATE-SPLIT-01`** — leader/spec owner **chọn**, không phải tôi |
| **Verdict axis-alignment** | **Xác nhận DR-012** · điều kiện **C6** |
| Split/subset manifest (sau khi gate mở) | Training · mọi experiment comparable |
| `RawPredictionMask` (sau khi training) | Vũ Hùng Anh (mesh) · Đức Trung (ingest) · metric |
| `CaseMetricSet` / `SliceMetric` / `CohortMetricSummary` | V3 UI của tôi · Tuấn Anh (SCR-03) · báo cáo |
| **Bằng chứng Spike C1** | **`GATE-ML-01`** / `ADR-ML-001` |
| V3 cohort UI chạy được | Người dùng |

---

## 5 · Ai tiêu thụ đầu ra của tôi

- **Nguyễn Gia Đức Trung** — ingest **cả hai** loại: dataset thô (Contract 1) và artifact experiment (Contract 2).
- **Vũ Hùng Anh** — dựng mesh **từ** `RawPredictionMask` của tôi; **review Spike D** của tôi.
- **Phạm Tuấn Anh** — hiển thị metric của tôi trong SCR-03; V3 UI của tôi nhảy vào case explorer của anh ấy.
- **`GATE-DATA-01`, `GATE-SPLIT-01`, `GATE-ML-01`** — cả ba đều chờ bằng chứng của tôi.
- **Điều kiện C1 và C6** — chỉ Spike D của tôi gỡ được.

---

## 6 · Requirement / test / gate quan trọng nhất với tôi

| Loại | ID |
|---|---|
| **Gate** | **`GATE-DATA-01`** (DR-G01) · **`GATE-SPLIT-01`** (DR-G02) · **`GATE-ML-01`** (DR-G03, **chỉ đóng sau Spike C1**) · `GATE-IMG-01` (DR-G04) |
| **Tái lập** | `NFR-REP-001` · **`NFR-REP-002`** (patient-level, no leakage) · `NFR-REP-003` · `NFR-REP-004` |
| **Trung thực khoa học** | **`PR-SCI-03`** — không cần DINOv2 thắng · **`TC-SCI-003`** — không loại ca có chọn lọc |
| **No leakage** | **`TC-EXP-008`** — không ca nào xuyên partition; subset thoả luật nested |
| **Ngữ nghĩa metric** | `07` §6 · **`TC-EXP-009`** (luật empty-slice) |
| **Ca thất bại** | **`08` §8.1** — không được âm thầm bỏ; báo cả N dự kiến và N thành công |

---

## 7 · File / module tôi làm việc quanh đó

```text
tools/dataset_validate/**                       script validation - re-runnable bởi reviewer
management/DATASET_AUDIT.md                     artifact nghiệm thu 06 §9.1
data/manifests/dataset_manifest.*               máy đọc được, do script sinh
management/spikes/SPIKE_D_DATASET/RESULT.md     chỉ khi có bằng chứng thật
spikes/spike_c_ml/**                            harness feasibility (Spike C0/C1)
management/spikes/SPIKE_C_ML/RESULT.md          chỉ khi có bằng chứng thật
```

**BỊ CẤM:**

- Commit **byte dataset** vào repo (`12` §3 — không redistribute).
- Viết bất kỳ application/production module nào.
- **Chọn split** — Spike D tạo *bằng chứng*; **DR-002 / GATE-SPLIT-01 chọn path**.
- **Thay dataset khác.**

---

## 8 · Tôi được TỰ quyết những gì

| Được |
|---|
| Cấu trúc nội bộ script validation dưới `tools/dataset_validate/` |
| Format cụ thể của bảng và mục trong `DATASET_AUDIT.md` (miễn phủ **đủ** mọi field `06` §9.1) |
| Thứ tự chạy các check trong ngày (miễn **giữ đúng day-one ordering** để trigger DR-001 đánh giá được đúng hạn) |
| Cách bố trí harness feasibility Spike C0 |
| Chọn **các ứng viên** DINOv2 variant/decoder nào để **thử nghiệm** (không phải chọn cái cuối) |
| Tổ chức nội bộ code V3 cohort UI |

---

## 9 · Tôi KHÔNG được quyết ngầm — đọc rất kỹ

### ❌ TÔI KHÔNG ĐƯỢC chọn Path A hay Path B trước khi có bằng chứng

Spike D **tạo bằng chứng**. Việc **chọn** là **DR-002 / `GATE-SPLIT-01`** — quyết định của **leader / spec owner**.

Và cẩn thận: Path A không chỉ đòi "có file nhãn" mà đòi **provenance xác minh được** (`06` §6). Thấy file ≠ chọn được Path A.

**Tình trạng hiện tại:** nguồn chính thức **tự mâu thuẫn** (mô tả challenge lịch sử nói nhãn test bị giữ lại; mô tả file hiện tại nói Test Set gồm 54 MRI **và** nhãn LA cavity). Tôi **không được khẳng định chiều nào** — tôi đọc file và ghi lại bằng chứng ở mức file.

### ❌ TÔI KHÔNG ĐƯỢC âm thầm chọn

| Không được | Phải qua |
|---|---|
| **Kiến trúc / variant / decoder DINOv2 cuối cùng** | `GATE-ML-01` / `ADR-ML-001` — **cần bằng chứng Spike C1**; **C0 KHÔNG đủ** |
| **Preprocessing cuối cùng** | Đóng băng theo `GATE-ML-01`; và **DR-011 ✅** đã chốt chính sách normalization |
| **Chính sách split cuối cùng** | `GATE-SPLIT-01` / DR-002 |
| **Ngữ nghĩa metric khác** | `07` §6 và **SCQ-02** đã đóng băng — cần DR |
| **Cấu hình morphology cho `EXP-D-PP`** | `GATE-IMG-01` — chọn bằng **dữ liệu development/validation MÀ THÔI** |
| **Thay dataset khác** | `00` §13 — Decision Request đầy đủ. **KHÔNG BAO GIỜ âm thầm** |

### Ba luật khoa học tôi phải giữ

| # | Luật |
|---:|---|
| 1 | **Chỉ split patient-level.** Không split slice. Không bệnh nhân nào xuyên partition. Holdout **không** dùng cho model selection |
| 2 | **`25% ⊂ 50% ⊂ 100%` nesting BẮT BUỘC** (SCQ-05), làm tròn số bệnh nhân xác định, **cùng thành viên** cho cả hai họ model |
| 3 | **Ca thất bại KHÔNG được âm thầm bỏ** (`08` §8.1). Ghi lý do; báo **cả** N dự kiến và N thành công. *Một mô hình không được trông tốt hơn chỉ vì các ca nó fail đã biến mất khỏi mẫu số* |

---

## 10 · Bằng chứng tôi phải tạo

### SPIKE D — dataset acquisition / validation / provenance (**P0**)

#### ⚠ THỨ TỰ NGÀY MỘT — bắt buộc, để trigger DR-001 đánh giá được

**DR-001 ✅ đo trigger vào CUỐI NGÀY EXECUTION ĐẦU TIÊN.** Xếp việc sao cho **tải gói và đọc provenance sơ bộ đi TRƯỚC** validation sâu.

| Bước | Việc ngày 1 | Tạo ra |
|---:|---|---|
| **1** | Tải gói từ nguồn chính thức đã ghi; ghi timestamp, tên file, kích thước, checksum khi khả thi | acquisition record |
| **2** | Giải nén; tạo **danh sách file thô** và **số ca** | inventory |
| **3** | **Đọc provenance sơ bộ: partition test có file nhãn nào không?** | trả lời sơ bộ Q2 |
| **4** | Mở 2–3 khối: xác nhận NRRD load được, là 3D, đọc `spacing`/`origin`/**`direction`** | trả lời sơ bộ Q4 |
| **5** | **Đánh giá trigger DR-001 và báo leader** | quyết định trigger |

Bước 6+ (validation toàn cohort) tiếp tục các ngày sau.

#### Trigger DR-001 — nguyên văn

> **Nếu tới cuối ngày execution đầu tiên**, **không có gói chính thức dùng được trên máy cục bộ**, **hoặc** validation gói/provenance lộ **một defect chặn việc nghiệm thu `GATE-DATA-01`** — thì **RA-H01 leo lên BLOCKER** và **quy trình dự phòng dataset mở ra**.

**KHÔNG âm thầm thay dataset khác.** Thay dataset là đổi giao thức, cần đủ chuỗi `00` §13: Decision Request → phân tích ảnh hưởng → leader/spec-owner duyệt → cập nhật spec.

#### 20 acceptance criteria — tóm lược (đầy đủ ở `../spikes/SPIKE_D_DATASET/TASK.md`)

| Nhóm | Phải có |
|---|---|
| **Provenance** (A1, A18) | URL nguồn · ngày tải · tên file · checksum khi khả thi · **file license/terms được lưu trữ** |
| **Inventory** (A2–A5) | Số ca theo partition · **hiện diện từng file mỗi ca** · mọi NRRD load được · MRI 3D, mask 3D · dtype |
| **Geometry** (A6–A9, **A14**) | **Phân bố shape toàn cohort, nêu rõ in-plane có khác nhau không** · spacing/origin/**direction** mỗi ca · tương thích shape+spacing MRI↔mask · mask có sẵn khớp không · **verdict axis-alignment** |
| **Ngữ nghĩa nhãn** (A10–A11) | **Tập giá trị duy nhất** và **ánh xạ foreground/background chính xác — GHI LẠI, không phỏng đoán** · **xác minh tường minh `laendo.nrrd` là LA cavity target của GÓI NÀY** |
| **Provenance nhãn test** (**A12–A13**) | **Nhãn test có tồn tại không, và provenance ra sao — kèm bằng chứng ở mức file** · **bằng chứng Path A vs B, kèm lập luận** *(không chọn)* |
| **Tính toàn vẹn** (A15–A16) | File hỏng/thiếu/không đọc được · ca bị loại kèm lý do · `case_id` duy nhất · gán ID de-identified (`CASE_0001`) |
| **Privacy** (**A17**) | **Đối chiếu metadata với allowlist** — identifier trực tiếp bất thường phải báo và **loại khỏi đường metadata của app** |
| **Artifact nghiệm thu** (A19–A20) | `DATASET_AUDIT.md` phủ đủ `06` §9.1 · `dataset_manifest.*` **máy đọc được, do script sinh** |

#### Hai câu hỏi quyết định

| Q | Vì sao quan trọng |
|---|---|
| **Q2 — nhãn test có thật sự tồn tại VÀ dùng được?** | Quyết **Path A vs Path B** — holdout **54 ca** vs **15 ca**, khác nhau **3.6 lần** về cỡ tập đánh giá |
| **Q4 — mọi khối có axis-aligned?** | **DR-012 ✅** khai biên chỉ-axis-aligned. Nếu gói có geometry không axis-aligned → **RA-M02 leo thang**, cần DR mới, và **điều kiện C6 KHÔNG đóng được** |

### SPIKE C — hai giai đoạn, KHÔNG được lẫn

> **Luật đặt tên:** luôn viết **"Spike C0"** và **"Spike C1"** kèm chữ *Spike*. Một `C1` trơn nghĩa là **điều kiện readiness C1** (Spike D / GATE-DATA-01). Điều kiện C1 tình cờ **là tiền đề** của Spike C1 — nhưng chúng là hai thứ khác nhau.

| | **Spike C0** | **Spike C1** |
|---|---|---|
| **Dữ liệu** | tổng hợp / khớp shape | **subset THẬT nhỏ, đại diện, đã kiểm định** |
| **Tiền đề** | không — bắt đầu ngay được | **Spike D đã ACCEPTED** (điều kiện C1) |
| **Đóng được `GATE-ML-01`?** | **KHÔNG — hoàn toàn không đủ** | **CÓ — gate chỉ đóng sau C1** |

**Vì sao gate phải chờ:** `08` §2 đòi recipe **giống hệt** giữa `EXP-D-025/050/100`. Một recipe đóng băng trên bằng chứng dữ liệu tổng hợp có thể **không dùng được trên khối thật**, và phát hiện điều đó **sau** `GATE-ML-01` sẽ **làm mất giá trị các run đã hoàn thành**.

#### ⚠ Ràng buộc WIP cho Spike C0

**Spike D là primary task DUY NHẤT của tôi.** Spike C0 chiếm ô **"một hoạt động chuẩn bị NHỎ"** của `15` §7.

> **Spike C0 chỉ được dùng thời gian rỗi trong lúc tải/I-O. TUYỆT ĐỐI không được thành primary task thứ hai cạnh tranh với Spike D.**

Nếu C0 bắt đầu chiếm sự tập trung mà Spike D cần — **đặc biệt là ngày 1, khi trigger DR-001 phải được đánh giá** — **tạm dừng C0.** Spike D là P0; C0 thì không.

#### Ràng buộc DR-011 ✅ — cấu hình từ đầu, đừng gắn vào sau

> **KHÔNG dùng thống kê normalization fit trên cohort** giữa các experiment phân số dữ liệu. Dùng **normalization per-image / per-volume** có ghi rõ, **cộng hằng số pretrained-model cố định** khi backbone yêu cầu, áp **giống hệt nhau giữa các họ model và giữa mọi phân số dữ liệu**.

Ghi vào `preprocessing_version` để nó xuất hiện trong **mọi** manifest `08` §10. **Spike C1 phải xác nhận sự phù hợp.**

#### Luật subset của Spike C1

Lấy từ **partition training MÀ THÔI**, sau khi `GATE-SPLIT-01` (DR-002) giải quyết. **Không bao giờ** dữ liệu validation hay holdout (`06` §6, `07` §10).

### Bằng chứng KHÔNG được bịa

> **Claude không được tạo:** danh sách file · số ca · việc nhãn test có tồn tại hay không · ngữ nghĩa hay provenance nhãn · shape · dtype · spacing · direction matrix · tập giá trị mask · verdict alignment · checksum · phát hiện corruption · nội dung metadata · thông số GPU/VRAM · peak memory · throughput · wall-clock · hành vi hội tụ · giá trị loss · bất kỳ con số lịch nào suy ra từ timing chưa đo.
>
> **Mọi thứ trên do CHÍNH TÔI đọc từ gói dữ liệu thật / đo trên compute thật.**
>
> Claude **được** viết script validation, định nghĩa schema manifest, cấu trúc `DATASET_AUDIT.md`, dựng harness feasibility, viết script ngoại suy, đề xuất ứng viên variant/decoder, và **phân tích output tôi cung cấp**.

### Trường không đo được

Ghi **`NOT MEASURED — <lý do>`**. Trung thực và được chấp nhận. **Bịa thì không.**

---

## 11 · Ai review tôi

| Việc của tôi | Reviewer |
|---|---|
| **Spike D** | **Vũ Hùng Anh** — ưu tiên **1** trong hàng đợi của anh ấy (D là **P0**) |
| **Spike C0 / C1** | **Vũ Hùng Anh** — ưu tiên 3 |
| V3 Cohort vertical | **Vũ Hùng Anh** |
| ML Training / Evaluation block | **Vũ Hùng Anh** |

**Vũ Hùng Anh sẽ phản biện gì:** đặc biệt **verdict axis-alignment (A14)** và **provenance nhãn test (A12)** — vì cả hai ảnh hưởng trực tiếp tới hợp đồng geometry của anh ấy và tới điều kiện C6. Hãy chuẩn bị **bằng chứng ở mức file**, không phải kết luận.

**Sau đó:** **CHAT E — QA/Red Team** phải **soi bằng chứng thực tế** của Spike D, không chỉ verdict tóm tắt. **QA REJECT chặn nghiệm thu bất kể ý kiến tôi hay reviewer.**

**Tôi không review spike của ai trong wave này** — WIP của tôi đã đầy với P0.

---

## 12 · Hành động đầu tiên của tôi trên Execution Day 1 (2026-09-10)

```text
1.  Đặt Spike D → ACTIVE, ghi started_at THẬT (không lùi ngày).
2.  ĐỌC LẠI §Day-one ordering trong SPIKE_D_DATASET/TASK.md TRƯỚC KHI làm gì.
        ← trigger DR-001 tính theo ngày execution đầu tiên, nên thứ tự việc
          quan trọng hơn tốc độ
3.  Bắt đầu TẢI GÓI từ nguồn chính thức đã ghi trong 06 §1.
4.  Ghi acquisition record trong lúc tải (timestamp, tên file, kích thước).
5.  Giải nén → inventory file thô + số ca.
6.  Đọc provenance sơ bộ: partition test có file nhãn không?
7.  Mở 2–3 khối: NRRD load được? 3D? spacing/origin/DIRECTION là gì?
8.  ĐÁNH GIÁ TRIGGER DR-001 và BÁO LEADER trước cuối ngày.
```

**Trong lúc chờ tải (I-O rỗi):** được làm **chuẩn bị NHỎ** cho Spike C0 — ví dụ khai báo compute thực có. **Không** để nó thành primary thứ hai.

---

## 13 · Tôi cần biết gì về việc của người khác

| Người | Tôi cần biết vì |
|---|---|
| **Vũ Hùng Anh** | Anh ấy **review tôi**, và **verdict axis-alignment của tôi ảnh hưởng trực tiếp hợp đồng geometry của anh ấy**. Anh ấy dựng mesh từ `RawPredictionMask` của tôi. Tôi phải hiểu quy ước canonical đủ để bàn giao mask đúng |
| **Nguyễn Gia Đức Trung** | Anh ấy ingest **cả hai** loại output của tôi. **Contract 1** (dataset thô) gate bởi **GATE-DATA-01 của tôi**; **Contract 2** (artifact experiment) gate bởi **GATE-SPLIT-01 + GATE-ML-01 của tôi**. Manifest của tôi phải khớp schema của anh ấy |
| **Phạm Tuấn Anh** | Metric của tôi hiện trong SCR-03 của anh ấy; V3 UI của tôi nhảy vào case explorer của anh ấy. Anh ấy là leader — **trigger DR-001 của tôi là mục blocker nóng nhất Day 1** |

---

## 14 · Cách leo thang blocker

| Tình huống | Làm gì |
|---|---|
| **Cuối ngày 1 không có gói dùng được, HOẶC có defect chặn GATE-DATA-01** | **Kích hoạt trigger DR-001**: báo leader ngay, **RA-H01 → BLOCKER**, mở quy trình dự phòng. **KHÔNG thay dataset khác** |
| **Provenance nhãn test mơ hồ, không xác minh được** | **Ghi lại là mơ hồ.** Đừng đoán. `06` §6 đã định nghĩa Path B là nhánh cho provenance không xác minh được — nhưng **leader chọn**, không phải tôi |
| **Gói có geometry KHÔNG axis-aligned** | Báo leader: **RA-M02 leo thang**, cần DR mới, **C6 không đóng được** |
| **Tìm thấy identifier trực tiếp bất thường trong metadata** | Báo ngay; phải **loại khỏi đường metadata của app** trước bất kỳ ingestion nào (`NFR-SEC-005`, `12` §2) |
| **Spike C1: verdict lịch là "không đủ thời gian"** | **Kết quả hợp lệ và có giá trị.** Giảm input resolution hay cỡ model **TRƯỚC** khi đóng băng recipe, **không** giữa ma trận; ghi thay đổi vào `GATE-ML-01` |
| **Memory không vừa ở bất kỳ batch size dùng được** | Leo thang; nạp vào hồ sơ feasibility `ADR-ML-001` |
| Mâu thuẫn giữa hai file spec đóng băng | **DỪNG**, mở Decision Request (`00` §12) |
| Bị chặn bởi việc của người khác | Báo **Phạm Tuấn Anh** ngay, đừng giấu tới EOD (`15` §13) |

---

## Nhắc lại ranh giới Day 0 (2026-09-09) — **đặc biệt quan trọng với bạn**

> ### ❌ HÔM NAY KHÔNG TẢI DATASET CHÍNH THỨC
>
> Không phải vì việc tải là xấu, mà vì **đồng hồ trigger execution-day của DR-001 phải bắt đầu 2026-09-10**, không phải trong onboarding.
>
> Nếu tải hôm nay, ngày execution đầu tiên trở nên mơ hồ và trigger mất ý nghĩa.

Hôm nay: **KHÔNG** đặt Spike D sang `ACTIVE` · **KHÔNG** `RESULT.md` · **KHÔNG** `DATASET_AUDIT.md` · **KHÔNG** thu bằng chứng dataset · **KHÔNG** thu bằng chứng ML.

Hôm nay **ĐƯỢC**: đọc `SPIKE_D_DATASET/TASK.md` thật kỹ (đặc biệt §Day-one ordering và 20 acceptance criteria) · cài Python/tooling và thư viện đọc NRRD · kiểm tra dung lượng đĩa trống · học khái niệm về format NRRD · drill Git · hỏi mọi câu về provenance.

**Nếu việc cài tooling phát hiện vướng mắc** (thiếu thư viện, không đủ đĩa, không có quyền) → ghi vào cột "Clarifications Required" của `DAY0_SIGNOFF.md` như **onboarding blocker**. Đó chính là giá trị của Day 0.
