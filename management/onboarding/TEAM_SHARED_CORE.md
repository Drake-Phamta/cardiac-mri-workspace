# TEAM SHARED CORE

**Mức:** LEVEL 1 — **MỌI NGƯỜI PHẢI ĐỌC HẾT**
**Mục tiêu:** cả bốn người có cùng một mô hình tư duy end-to-end về **dự án này**
**Cửa kiểm tra:** [SHARED_CORE_CHECK.md](SHARED_CORE_CHECK.md)

> Đây **không** phải bài giảng chung về AI y tế. Mọi mục dưới đây nói về **chính dự án này**, và dẫn ID gốc trong `docs/specs/v1.0/` để bạn tra khi cần.

---

# A. DANH TÍNH SẢN PHẨM / NGHIÊN CỨU

## A.1 Chúng ta đang xây cái gì

**AI-assisted Cardiac MRI Research Workspace** — một **workspace nghiên cứu/giáo dục**, ưu tiên mobile, để nghiên cứu **phân vùng tâm nhĩ trái (Left Atrium — LA)** từ ảnh **cardiac LGE MRI**.

**MUST KNOW — đây KHÔNG phải sản phẩm chẩn đoán lâm sàng.** `00` §2 và `12` §1 nói rõ: không được đưa ra tuyên bố chẩn đoán, điều trị, hay chăm sóc bệnh nhân; UI/báo cáo không được hàm ý đã được cấp phép hay kiểm định lâm sàng.

## A.2 Vấn đề thật mà sản phẩm giải

`01` §1: nghiên cứu phân vùng ảnh y tế thường chỉ cho ra **mask** và **một con số trung bình**. Một điểm Dice trung bình không nói cho nhà nghiên cứu biết **mô hình sai ở đâu**, lỗi có tập trung ở slice nào, hai mô hình khác nhau thực chất thế nào, hay chuỗi 2D liên hệ ra sao với cấu trúc 3D.

> **Câu hỏi bắc đẩu của demo** (`01` §10, `16` §2):
> **"Vì sao AI sai trên ảnh MRI này, và nhà nghiên cứu có thể làm gì?"**

## A.3 Bốn nguyên tắc sản phẩm (`00` §5)

| Nguyên tắc | Nghĩa thực tế |
|---|---|
| **P1 Workspace-first** | Một luồng nghiên cứu mạch lạc, **không** phải 4 module ML/ảnh/analytics/mobile rời rạc |
| **P2 Case-centered** | **Ca MRI là đối tượng tương tác sâu nhất.** Mọi metric, experiment, finding, view 3D phải quay về được bằng chứng cấp ca |
| **P3 Evidence-driven** | Mọi số liệu truy được về bằng chứng MRI/model. Mọi dự đoán soi được. Mọi lần người sửa đều truy vết được |
| **P4 Mobile-first interaction** | App mobile **không** phải viewer thụ động: điều hướng slice, overlay, zoom/pan, brush, khám phá 3D, liên kết 2D↔3D, điều tra lỗi |

## A.4 Ba vòng lặp lặp lại (`00` §6)

```text
LOOP A — ANALYZE
  MRI → preprocessing → model → prediction → derived mask/3D → metrics

LOOP B — INVESTIGATE
  cohort anomaly → case → slice → pixel/region → error type → finding

LOOP C — REVIEW / IMPROVE
  prediction → human review → accept/flag/correct → reviewed artifact
             → đầu vào cho experiment tương lai (thủ công, tường minh)
```

**MUST KNOW:** Loop C **không có** huấn luyện lại tự động. `01` §8 xếp "automatic continuous retraining after a correction" vào **OUT OF SCOPE**.

## A.5 Mô hình điều hướng

```text
Research Study / Workspace
      │
      ├── cohort  ──────────────► phân bố, outlier, so sánh experiment
      │
      ├── experiment ───────────► UNet vs DINOv2, 25/50/100%
      │
      └── case  ────────────────► ca MRI (đối tượng sâu nhất)
             │
             ├── slice  ───────► ảnh 2D + overlay + metric per-slice
             │      │
             │      └── pixel / region ──► FP/FN, brush correction
             │
             └──────── ↕ liên kết hai chiều ↕ ────────► 3D
```

**Ràng buộc UX (`02` §6):** không use case nào được kết thúc ở một con số tổng hợp không giải thích được, khi bằng chứng cấp thấp hơn tồn tại.

---

# B. CÂU HỎI NGHIÊN CỨU

## B.1 RQ-A — khan hiếm nhãn (câu hỏi chính)

> **Mô hình phân vùng dựa trên DINOv2 có suy giảm ÍT HƠN so với UNet baseline khi lượng dữ liệu huấn luyện có nhãn bị giảm đi hay không?**

**MUST KNOW — chú ý cách phát biểu.** Câu hỏi **không** phải "DINOv2 có tốt hơn UNet?" mà là **"tốc độ suy giảm khi giảm nhãn có khác nhau?"**. Đây là câu hỏi về **tương tác** giữa họ mô hình và lượng nhãn — khó trả lời hơn một so sánh đơn lẻ.

## B.2 Sáu cấu hình lõi (`08` §2)

| Experiment ID | Model | Training fraction | Prediction variant |
|---|---|---:|---|
| `EXP-U-025` | UNet | 25% | raw primary |
| `EXP-U-050` | UNet | 50% | raw primary |
| `EXP-U-100` | UNet | 100% | raw primary |
| `EXP-D-025` | DINOv2-based | 25% | raw primary |
| `EXP-D-050` | DINOv2-based | 50% | raw primary |
| `EXP-D-100` | DINOv2-based | 100% | raw primary |

## B.3 Bốn luật cứng của RQ-A

| # | Luật | Nguồn |
|---:|---|---|
| 1 | **`25% ⊂ 50% ⊂ 100%` là BẮT BUỘC** (nested), với **làm tròn số bệnh nhân xác định** | **SCQ-05** đã trả lời — luật cứng, không còn là "preference" |
| 2 | **Thành viên tập ở mức bệnh nhân (patient-level) và xác định (deterministic)** — cùng seed cho ra cùng danh sách | `06` §7, seed mặc định `2024` |
| 3 | **Cùng một phân số / cùng thành viên dùng cho CẢ HAI họ mô hình** | `06` §7, `08` §4 |
| 4 | Kiến trúc và recipe **giống hệt** giữa `EXP-D-025/050/100`; tương tự cho UNet. Chỉ **thành viên tập huấn luyện** khác | `08` §2 |

**Vì sao luật 4 quan trọng:** nếu recipe thay đổi giữa các phân số, ta không còn đo được ảnh hưởng của lượng nhãn — ta đo lẫn cả ảnh hưởng của recipe.

## B.4 Kết quả âm là kết quả hợp lệ

**MUST KNOW.** `03` **PR-SCI-03** và `00` §14:

> Thành công khoa học nghĩa là **một câu trả lời hợp lệ** cho câu hỏi nghiên cứu, **không** phải yêu cầu DINOv2 phải thắng UNet. Kết quả null/âm vẫn được chấp nhận khi giao thức và bằng chứng vững.

`TC-SCI-003` kiểm tra chính điều này: bảng kết quả cuối phải sinh từ artifact đánh giá đã đóng băng, giữ đúng thứ tự quan sát được; **không được loại ca có chọn lọc hay tinh chỉnh để ép ra hướng của bài báo tham chiếu**.

**Đối xứng của điều đó:** cũng không được trình bày kết quả null như bằng chứng "hai bên tương đương" nếu phép đánh giá không đủ sức phân biệt. **DR-014 ✅** vì vậy yêu cầu **khoảng tin cậy 95%** cho metric cohort chính và cho hiệu số theo cặp, kèm mục hạn chế tường minh. *(Không có cửa phân tích lực thống kê hình thức.)*

## B.5 RQ-B — ablation xử lý ảnh

> **Một bước hậu xử lý hình thái học (morphology) xác định có cải thiện hay làm hại chất lượng phân vùng LA của DINOv2?**

| Điểm | Nội dung |
|---|---|
| **Đối tượng** | Áp lên **raw prediction của DINOv2** |
| **Experiment** | **`EXP-D-PP`** — theo **SCQ-04**, là một **Experiment dẫn xuất hạng nhất (first-class derived Experiment)** với các `AnalysisRun` dẫn xuất, mỗi run tham chiếu **cả** `AnalysisRun` gốc của `EXP-D-100` **và** raw prediction của nó |
| **KHÔNG huấn luyện lại** | Dùng đúng cùng raw prediction, chỉ khác bước morphology (`08` §9) |
| **Tham số morphology** | **Đóng băng bằng dữ liệu development/validation MÀ THÔI**, rồi áp nguyên vẹn lên holdout (`07` §5, `GATE-IMG-01`) |
| **Không được giả định** | `07` §5: *"do not assume image processing must improve the model"* — báo cáo trung thực cải thiện / xấu đi / không đổi |

**SCQ-04 cũng chốt:** so sánh raw-vs-processed là **ablation hợp lệ có chủ ý** — được coi là comparable **khi mọi trường comparability khác trùng nhau** (`08` §7 tiêu chí 1, 2, 3, 5, 6). Tiêu chí 4 nghĩa là variant phải được **nêu tường minh**, không phải phải giống nhau.

---

# C. DATASET

## C.1 Nguồn chính thức

**LASC 2018 / 2018 Atria Segmentation Data** từ Cardiac Atlas Project (`06` §1).

**MUST KNOW:** bài báo tham chiếu (Kundu et al. 2024, DINOv2 cho phân vùng LA) dùng **LAScarQS 2022**, khác dataset của ta. `06` §10 và `PR-SCI-01` cấm nói "chúng tôi tái lập kết quả LAScarQS của Kundu et al." Ta báo cáo **kết quả LASC 2018 theo giao thức riêng của dự án**.

## C.2 Hai file lõi mỗi ca (`06` §2)

| File | Ý nghĩa |
|---|---|
| **`lgemri.nrrd`** | Khối ảnh MRI LGE đầu vào (3D) |
| **`laendo.nrrd`** | Mask tham chiếu/annotation của **khoang tâm nhĩ trái (LA cavity)** |

**`lawall.nrrd`** — nếu có trong gói — **bị loại khỏi core MVP** cho tới khi provenance và ngữ nghĩa nhãn được xác minh tường minh (`06` §2).

## C.3 Vì sao phải audit gói thật TRƯỚC khi huấn luyện

`06` §9.1: **"Training tasks remain BLOCKED until this gate is ACCEPTED."**

Lý do thẳng thắn: mô tả công bố và header file thật **có thể khác nhau** do lịch sử release/resampling (`06` §4). Đoán rồi sửa sau là không được, vì `06` §6 cấm đổi split sau khi đã thấy kết quả test.

## C.4 GATE-DATA-01 — kiểm gì (`06` §3, §9)

| Nhóm | Nội dung kiểm |
|---|---|
| Provenance | URL nguồn, ngày tải, tên gói, checksum khi khả thi, điều khoản license |
| Nội dung gói | Danh sách file thật, có/thiếu file bắt buộc mỗi ca |
| Số lượng | Số ca theo từng partition đã phát hành |
| Shape / dtype | MRI là 3D, mask là 3D, dtype từng loại file, **phân bố shape toàn cohort** |
| Geometry | `spacing`, `origin`, `direction` từ header |
| Ngữ nghĩa mask | Tập giá trị duy nhất, và **ánh xạ foreground/background chính xác — GHI LẠI, không phỏng đoán** |
| Corruption | File hỏng/thiếu/không đọc được; các ca bị loại kèm lý do |
| Geometry support | Có tương thích biên giới hạn **axis-aligned-only** không |
| Split path | Bằng chứng cho **Path A vs Path B** |
| Privacy | Đối chiếu metadata với allowlist (`NFR-SEC-005`, `12` §2) |

## C.5 Path A vs Path B — chỉ là logic điều kiện

**MUST KNOW: chưa ai biết path nào áp dụng. Đừng nói như đã biết.**

```text
NẾU gói chính thức CÓ nhãn test 54 ca VÀ provenance xác minh được:
    → PATH A
      Official Training Set 100 ca  →  80 train / 20 validation  (development)
      Official Testing Set  54 ca   →  HOLDOUT CUỐI, khoá lại
      Nhãn test chỉ dùng cho đánh giá cuối — KHÔNG dùng cho chọn preprocessing,
      post-processing, threshold, model selection, early stopping, hyperparameter

NGƯỢC LẠI (không có nhãn test, hoặc provenance không xác minh được):
    → PATH B
      Chỉ dùng 100 ca training đã xác minh
      → 70 train / 15 validation / 15 internal test (khoá)
      54 ảnh MRI test vẫn có thể dùng để demo Inference & Review Mode,
      nhưng KHÔNG hiển thị bất kỳ metric phụ thuộc GT nào cho chúng
```

Cả hai path: **patient-level, deterministic, seed `2024`** (`06` §6).

**Tình trạng hiện tại:** nguồn chính thức **tự mâu thuẫn** — phần mô tả challenge lịch sử nói nhãn test bị giữ lại, còn phần mô tả file hiện tại nói Test Set gồm 54 MRI **và** nhãn LA cavity. Đây là câu hỏi **mở** (`RA-H02`), và **chỉ Spike D giải được bằng cách đọc file thật**. Việc **chọn** path là **DR-002 / GATE-SPLIT-01** — quyết định của leader/spec owner, **không** phải của Spike D.

## C.6 Vì sao leakage phá hỏng nghiên cứu

**MUST KNOW.** Luật cứng (`06` §6, `08` §3, `NFR-REP-002`):

- **Chỉ split theo bệnh nhân.** **Không** split theo slice.
- **Một bệnh nhân không được xuất hiện ở hai partition.**
- Tập validation/test **cố định** cho mọi experiment comparable.
- Holdout **không** dùng cho model selection.

**Vì sao slice-level split là thảm hoạ:** các slice liền nhau của **cùng một bệnh nhân** gần như giống nhau. Nếu slice 40 vào train và slice 41 vào test, mô hình đã "thấy" gần đúng câu trả lời. Điểm số sẽ cao một cách vô nghĩa, và **toàn bộ RQ-A trở thành vô giá trị** — ta không còn đo được khả năng tổng quát hoá sang bệnh nhân mới.

`TC-EXP-008` kiểm tra không ca nào xuất hiện xuyên partition. `13` §12 xếp "data leakage" vào **P0/Critical**.

---

# D. NGỮ NGHĨA ARTIFACT — mục dễ sai nhất

## D.1 Sáu loại artifact

| Artifact | Là gì | Ai tạo |
|---|---|---|
| **`MRIVolume`** | Khối ảnh MRI gốc từ dataset (`lgemri.nrrd`) | Dataset |
| **`GroundTruthMask`** | Mask tham chiếu do dataset cung cấp (`laendo.nrrd`) | Dataset |
| **`RawPredictionMask`** | Đầu ra trực tiếp của model sau quy tắc threshold/binarization đã ghi rõ | Model |
| **`ProcessedPredictionMask`** | Dẫn xuất từ raw qua cấu hình hậu xử lý xác định | Pipeline |
| **`ReviewedMask`** | Artifact do **người** tạo bằng brush correction | Người dùng |
| **`Finding`** | Quan sát có neo bằng chứng (experiment/case/slice/region + note) | Người dùng |

## D.2 Ba lớp — thuộc lòng (`05` §3)

```text
┌─────────────────────────────────────────────────────────────┐
│  IMMUTABLE  (bất biến — không bao giờ ghi đè)               │
│    MRIVolume · GroundTruthMask · RawPredictionMask          │
├─────────────────────────────────────────────────────────────┤
│  DERIVED  (dẫn xuất xác định — tái tạo được)                │
│    ProcessedPredictionMask · Reconstruction3D · Metrics     │
├─────────────────────────────────────────────────────────────┤
│  HUMAN  (do người tạo — truy vết được)                      │
│    Review · ReviewedMask · Finding                          │
└─────────────────────────────────────────────────────────────┘
```

## D.3 Năm luật MUST KNOW

| # | Luật | Nguồn |
|---:|---|---|
| 1 | **`RawPrediction` KHÔNG BAO GIỜ bị ghi đè.** `NFR-REL-001`, `FR-REV-009` | Ghi đè nó là **điều kiện loại bỏ MVP** (`03` §4) |
| 2 | **Một lần sửa tạo ra một `ReviewedMask` MỚI, bất biến.** Mỗi lần lưu là một version mới, không mutate version cũ | `05` §6, `FR-REV-008` |
| 3 | **`ProcessedPrediction` không được âm thầm coi như `RawPrediction`.** Backend **không** được thay thế processed cho raw | `11` §6, `TC-MASK-004` |
| 4 | **`Finding` KHÔNG bắt buộc** cho mọi lần sửa. Có finding mà không sửa, và có sửa mà không finding | `05` §6, **SCQ-01** |
| 5 | **KHÔNG huấn luyện lại tự động** sau khi sửa | `01` §8 OUT OF SCOPE |

**SCQ-01 đã chốt thêm:** `Review`, `ReviewedMask` và `Finding` là **ba aggregate độc lập**. Sơ đồ ở `05` §1 chỉ **nhóm** các artifact do người tạo, **không** biểu thị quan hệ chứa. `05` §2 và §6 mới là chuẩn.

## D.4 Ví dụ — một ca đi qua tất cả các loại

```text
CASE_0001
│
├── MRIVolume            lgemri.nrrd, 3D               [IMMUTABLE]
├── GroundTruthMask      laendo.nrrd, LA cavity        [IMMUTABLE]
│
└── AnalysisRun (thuộc EXP-D-100, DINOv2 100%)
    │
    ├── RawPredictionMask                              [IMMUTABLE]
    │     threshold_or_binarization_version = ...
    │     checksum = ...            ◄── không bao giờ đổi
    │
    ├── ProcessedPredictionMask                        [DERIVED]
    │     source_prediction_mask_id = RawPredictionMask ở trên
    │     postprocessing_version = ...   (đây là đầu vào của EXP-D-PP)
    │
    ├── CaseMetricSet                                  [DERIVED]
    │     Dice 3D, IoU 3D  · prediction_variant = RAW_PREDICTION
    │     reference = GroundTruthMask ở trên
    │
    ├── Reconstruction3D                               [DERIVED]
    │     source_mask_id = RawPredictionMask · method_version = ...
    │
    └── Review  (scope: source_mask_id + variant tường minh)   [HUMAN]
          status: NOT_REVIEWED → FLAGGED → CORRECTED
          revision: 0 → 1 → 2      (monotonic)
          │
          ├── ReviewedMask v1                          [HUMAN, IMMUTABLE]
          │     source_mask_id = RawPredictionMask ở trên
          │     parent_reviewed_mask_id = null
          │
          └── ReviewedMask v2                          [HUMAN, IMMUTABLE]
                parent_reviewed_mask_id = ReviewedMask v1
                                          ▲
                    v1 KHÔNG bị sửa — v2 là bản mới
```

Người dùng có thể tạo thêm một `Finding` neo vào `CASE_0001` + `slice 54` + `UNDER_SEGMENTATION` — **hoặc không**. Cả hai đều hợp lệ.

---

# E. EVALUATION MODE vs INFERENCE & REVIEW MODE

## E.1 Hai chế độ (`00` §7, `02` §5)

| | **Evaluation Mode** | **Inference & Review Mode** |
|---|---|---|
| Có gì | MRI **+ GT** + prediction | MRI + prediction (**không GT**) |
| Làm được | Dice/IoU, metric per-slice, bản đồ FP/FN, hình dung lỗi 2D và 3D, so sánh experiment, phân tích outlier, review, brush, finding | Prediction, soi 2D, tái dựng 3D, review, flag, brush correction, finding |
| **KHÔNG làm được** | — | **Dice, IoU, bản đồ FP/FN dựa GT, hay bất kỳ metric cần mask tham chiếu** |

## E.2 Vì sao hai chế độ phải phân biệt rõ

**MUST KNOW.** `00` §7 và `PR-MODE-01`:

> UI và API **không được bịa** metric kiểm định cho các ca chỉ có inference.

Đây là vấn đề **trung thực khoa học**, không phải chi tiết UI. Nếu app hiện "Dice: 0.00" cho một ca không có GT, người xem sẽ hiểu là mô hình sai hoàn toàn — trong khi thực tế **không có gì để so sánh**.

Enforce tới tận mã lỗi API: `11` §4 và §6 bắt trả **`GROUND_TRUTH_UNAVAILABLE`**, và nói rõ *"never return an all-zero placeholder as if it were a reference mask"*, *"never synthesize zero accuracy"*.

`10` §7: khi không có GT, UI phải hiện trạng thái **không khả dụng rõ ràng**, chứ không phải biểu đồ rỗng hàm ý "lỗi bằng không". `TC-USAB-003` kiểm tra đúng điều này.

---

# F. METRIC

## F.1 Metric chính (`07` §6, `08` §5)

| Metric | Định nghĩa |
|---|---|
| **Case-level 3D Dice** | Tính trên **toàn bộ khối** LA cavity của **từng ca** |
| **Case-level 3D IoU / Jaccard** | Như trên |

## F.2 Tổng hợp cohort — và vì sao KHÔNG gộp voxel

**MUST KNOW.** `07` §6 nói thẳng:

> Tổng hợp cohort được tính **từ các giá trị per-case này**; **không** thu được bằng cách gộp toàn bộ voxel của mọi bệnh nhân vào một mask khổng lồ.

**Vì sao điều này quan trọng:** nếu gộp voxel toàn cohort, **bệnh nhân có tâm nhĩ lớn sẽ chi phối điểm số**. Một ca LA lớn có thể nhiều voxel gấp vài lần một ca nhỏ; gộp lại thì kết quả phản ánh chủ yếu vài ca lớn, chứ không phản ánh "mô hình hoạt động thế nào trên một bệnh nhân điển hình". Tính per-case rồi lấy trung bình cho **mỗi bệnh nhân một phiếu bằng nhau**.

Tổng hợp cần có (`08` §7 + **DR-014 ✅**): **mean · median · std · số ca đánh giá · khoảng tin cậy 95%** cho metric chính và hiệu số theo cặp · phân bố trực quan · nêu rõ ca bị loại/thất bại.

## F.3 Ba entity metric (**SCQ-02** đã chốt)

| Entity | Khoá | Chứa gì |
|---|---|---|
| **`CaseMetricSet`** | `analysis_run_id` (1 run = 1 ca) | Metric 3D cấp ca — Dice/IoU chính |
| **`SliceMetric`** | **`run_id` + `slice_index`** | Metric per-slice, theo luật empty-slice bên dưới |
| **`CohortMetricSummary`** | **Phạm vi Experiment** | mean/median/std/phân bố/N — **dẫn xuất từ CaseMetricSet đã lưu** |

## F.4 Luật empty-slice per-slice (`07` §6) — MUST KNOW

| GT | Prediction | Dice per-slice |
|---|---|---|
| **không rỗng** | rỗng | **`0`** |
| rỗng | **không rỗng** | **`0`** |
| rỗng | rỗng | **`NOT_APPLICABLE` / `NaN`** — **loại khỏi** trung bình và phân bố per-slice |

**Vì sao loại trường hợp cả-hai-rỗng:** một khối MRI có rất nhiều slice hoàn toàn là background (chưa tới hoặc đã qua tâm nhĩ). Nếu cho chúng Dice = `1` (vì "cả hai đều đúng là rỗng"), điểm per-slice trung bình sẽ bị **thổi phồng** bởi hàng chục slice không chứa thông tin gì. `07` §6 nói rõ: gán `1` là sai.

**Lưu ý:** metric 3D cấp ca **vẫn tính bình thường** trên toàn khối — luật này chỉ áp cho metric per-slice.

## F.5 FP / FN và Relative Volume Error — mức thực dụng

Trên mỗi voxel, so prediction với GT:

```text
        GT = 1        GT = 0
pred=1  TP  (đúng)    FP  (dự đoán thừa)
pred=0  FN  (bỏ sót)  TN  (đúng, nền)
```

| Ý nghĩa thực tế | Diễn giải |
|---|---|
| **FP nhiều** | Mô hình **over-segmentation** — vẽ tâm nhĩ rộng hơn thực tế |
| **FN nhiều** | Mô hình **under-segmentation** — bỏ sót phần tâm nhĩ |

`FR-ERR-002` yêu cầu viewer 2D hiển thị **ít nhất** vùng overlap/đúng, **false positive**, và **false negative**.

**Relative Volume Error** (`07` §6):

```text
RVE = (V_pred − V_gt) / V_gt × 100%
```

`V` ban đầu là **số voxel** khi spacing vật lý chưa được kiểm định. Chỉ khi geometry qua được cửa physical-volume thì mới được dùng thể tích vật lý (mL) và phải ghi nhãn rõ (`00` §10, `PR-SCI-02`, `TC-SCI-002`).

## F.6 Mọi metric phải khai variant

**MUST KNOW.** `07` §6:

> Mỗi MetricSet **phải nêu rõ** nó đánh giá **`RAW_PREDICTION`** hay **`PROCESSED_PREDICTION`**.

Và: **so sánh chính UNet-vs-DINOv2 về khan hiếm nhãn dùng variant RAW.** Hậu xử lý được báo cáo như một **ablation riêng** và **không được âm thầm thay vào so sánh chính**.

---

# G. HỢP ĐỒNG GEOMETRY / 2D ↔ 3D

> **MUST KNOW cho cả bốn người.** `13` §12 xếp sai mapping 2D/3D vào **P0/Critical**. Đây là khiếm khuyết dễ xảy ra nhất của dự án.

## G.1 Quy ước canonical đã ĐÓNG BĂNG (**DR-008a ✅**)

```text
canonical voxel coordinate = (x, y, z)

  x = source image COLUMN        (cột của ảnh nguồn)
  y = source image ROW           (hàng của ảnh nguồn)
  z = source SLICE INDEX         (chỉ số slice nguồn)

  shape_xyz    = [Nx, Ny, Nz]
  spacing_xyz  = [Sx, Sy, Sz]

  API:  slice_index = z,   miền hợp lệ  0 .. Nz-1

  một slice nguồn logic có shape  [Ny, Nx]      (hàng × cột)

  source pixel (u, v)  →  voxel (x = u, y = v, z = slice_index)

  gốc toạ độ: pixel trên-trái của slice nguồn là (0, 0)
              +x hướng SANG PHẢI
              +y hướng XUỐNG DƯỚI
```

## G.2 Thứ tự bộ nhớ của thư viện **KHÔNG** phải hợp đồng

**MUST KNOW.** Thư viện đọc NRRD, thư viện mảng, hay API render nội bộ dùng thứ tự trục nào là **chi tiết hiện thực**. **Adapter phải chuyển về đúng biểu diễn canonical ở MỌI biên** — payload API, metadata artifact, geometry fixture, và mô hình slice trong app mobile.

Nói cách khác: bạn **không** được phép để "vì numpy trả về như thế" lọt ra khỏi module của mình.

## G.3 Vì sao điều này quan trọng — năm chỗ cụ thể

| Nơi | Sai quy ước thì hỏng thế nào |
|---|---|
| **Brush correction** | Người dùng vẽ ở một chỗ, pixel bị sửa ở chỗ khác — hoặc bị lật/chuyển vị. `FR-REV-011`, `07` §8 invariant 3 |
| **Chọn điểm trên 3D** | Toạ độ 3D giải ra slice **sai**. `FR-3D-005` |
| **Nhảy tới slice 2D đúng** | Người dùng bấm vào vùng lỗi trong 3D và app mở sai slice. `FR-3D-006` |
| **Hình dung lỗi FP/FN** | Mask lỗi lệch so với ảnh MRI → vùng lỗi hiện sai vị trí. `FR-MASK-005` |
| **Tái dựng 3D** | Mesh bị xoay/lật so với khối nguồn, phá vỡ liên kết. `07` §7 |

**Cơ chế bảo vệ:** `09` §6 bắt buộc có **canonical geometry fixture** với các điểm `voxel ↔ world ↔ slice` đã biết trước, và `TC-MAINT-002` kiểm **backend và mobile cùng pass một bộ fixture**. Đây là deliverable của Vũ Hùng Anh trong Spike B.

## G.4 Biên giới hạn hỗ trợ hiện tại

| Điểm | Trạng thái |
|---|---|
| **Chính sách** | **DR-012 ✅ APPROVED** — MVP chỉ hỗ trợ geometry **axis-aligned đã kiểm định**; geometry không hỗ trợ bị **từ chối** với mã `GEOMETRY_NOT_VALIDATED` |
| **Tương thích thực tế với dataset** | **CHƯA XÁC ĐỊNH — chờ bằng chứng Spike D** |

**MUST KNOW:** chính sách đã duyệt **không** chứng minh gói dữ liệu thật nằm trong biên đó. Nếu Spike D phát hiện khối không axis-aligned thì `RA-M02` leo thang và cần một DR mới. Đây chính là lý do **điều kiện C6 vẫn MỞ** (`PARTIALLY_RESOLVED`).

---

# H. 3D LÀ CÔNG CỤ PHÂN TÍCH, KHÔNG PHẢI TRANG TRÍ

## H.1 Giá trị 3D bắt buộc phải có

| Năng lực | Requirement |
|---|---|
| Tái dựng LA 3D từ mask đã kiểm định | `PR-3D-01`, `FR-3D-001` |
| Rotate / zoom / pan trên mobile | `PR-3D-02`, `FR-3D-002` |
| **Liên kết slice đang xem** → mặt phẳng/vị trí trong 3D | `PR-3D-03`, `FR-3D-003/004` |
| **Chọn trong 3D → mở đúng slice 2D** | `PR-3D-04`, `FR-3D-005/006` |
| **Điều tra lỗi không gian** — vùng lỗi 3D liên kết về slice đóng góp | `PR-ERR-03`, `PR-3D-05`, `FR-3D-007/008` |

**MUST KNOW.** `03` §4 liệt kê điều kiện **loại bỏ MVP**:

> *"3D is decorative only and cannot link back to MRI slices."*

Một view 3D đẹp mà không nhảy về được slice là **thất bại nghiệm thu**, không phải "tính năng chưa hoàn thiện".

## H.2 Luật độ chính xác đã đóng băng (**SCQ-06**)

| Ngữ cảnh | Ràng buộc |
|---|---|
| **Canonical synthetic geometry fixture** | **CHÍNH XÁC TUYỆT ĐỐI** — slice kỳ vọng, dung sai bằng 0 |
| **Picking trên mesh thật đã decimate** | **Sai số tối đa ±1 source slice** |

**Ràng buộc này được chốt TRƯỚC Spike B.** Spike B **kiểm chứng sự phù hợp**, không phải tự suy ra hay thương lượng lại giá trị. **Không được âm thầm nới lỏng.** Muốn nới phải qua Decision Request theo `00` §13.

## H.3 Ngân sách mesh CHƯA được quyết

**MUST KNOW:** **DR-008c vẫn MỞ.** Ngân sách decimation (bao nhiêu tam giác) phải do **Spike B đo ra**, và phải thoả **đồng thời**:

- `NFR-PERF-002` — **≥20 FPS median**, không stall >500 ms; **và**
- ràng buộc **≤ ±1 source slice**.

> **Mức decimation vượt ±1 slice là KHÔNG chấp nhận được, bất kể frame rate cao thế nào.** Nếu không mức nào thoả cả hai → ghi **`NEGATIVE_RESULT`** và leo thang. Độ chính xác thắng frame rate, vì `13` §12 xếp sai mapping vào P0.

---

# I. NGỮ NGHĨA REVIEW

## I.1 Bốn trạng thái review (`04` FR-REV-001, `05` §6)

```text
NOT_REVIEWED  ──┬──►  ACCEPTED  ──┐
                ├──►  FLAGGED   ──┼──►  CORRECTED
                └──►  CORRECTED ──┘
```

- `ACCEPTED → FLAGGED/CORRECTED` được phép **chỉ khi** lịch sử audit được giữ lại.
- `NOT_REVIEWED` có thể biểu diễn bằng **việc chưa có record Review nào** cho tới hành động đầu tiên.
- **`CORRECTED` đòi ít nhất một `ReviewedMask` đã lưu thành công.**
- **`ACCEPTED` KHÔNG nghĩa là "đã kiểm định lâm sàng"** — nghĩa là người review của dự án chấp nhận cho luồng nghiên cứu này (`05` §6).

## I.2 Phạm vi Review (**DR-009 ✅**)

**MUST KNOW:** một `Review` gắn với **đúng `source_mask_id`** **và** **một prediction variant tường minh**.

Hệ quả thực tế: một run có raw prediction được `ACCEPTED` **và** processed prediction bị `FLAGGED` — đó là **hai Review khác nhau**, biểu diễn được.

## I.3 Concurrency (**DR-009 ✅**)

| Điểm | Nội dung |
|---|---|
| **`revision` đơn điệu (monotonic)** | Review mang một số revision tăng dần |
| **`expected_revision`** | Client gửi kèm khi ghi |
| **`STALE_REVISION`** | Mã lỗi khi client ghi dựa trên bản cũ. `11` §2 cấm **silent last-write-wins** |

## I.4 Working buffer và độ bền (**DR-009 ✅**) — đọc kỹ

| # | Luật |
|---:|---|
| 1 | **Mobile giữ working buffer brush cục bộ, tức thời** |
| 2 | **Server CÓ THỂ giữ working draft đồng bộ bất đồng bộ** |
| 3 | **Phản hồi brush KHÔNG BAO GIỜ chờ mạng** |
| 4 | **Phục hồi sau restart chỉ đảm bảo tới working draft đã sync thành công gần nhất. Nét chưa sync CÓ THỂ MẤT.** |

**Vì sao 3 và 4 đi cùng nhau:** luật 3 là điều khiến `NFR-PERF-003` (phản hồi nét ≤100 ms) khả thi — endpoint working-mask `PUT` ở `11` §8 là **kênh sync bất đồng bộ, không phải đường tương tác**. Luật 4 là **cái giá trung thực** của lựa chọn đó. `NFR-REL-002` bảo vệ artifact review **đã persist** khỏi hỏng ngầm; nó **không** hứa độ bền cho một nét đang bay chưa sync. UI nên cho người review thấy trạng thái sync để họ không bị nhầm về những gì đã an toàn.

## I.5 Các thao tác trong phiên chỉnh sửa (**DR-009 ✅**)

| Thao tác | Ngữ nghĩa |
|---|---|
| **Undo / Redo** | Phạm vi **phiên chỉnh sửa cục bộ hiện tại** |
| **Cancel** | Bỏ phần draft chưa commit; **KHÔNG xoá các `ReviewedMask` bất biến trước đó** |
| **Reset-to-source** | Phục hồi về **đúng source mask đã khai** |
| **Commit** | Tạo một **`ReviewedMask` version MỚI, bất biến**; **KHÔNG bao giờ ghi đè source prediction** |

## I.6 Luật quan trọng về Ground Truth

`10` §5: **Ground truth KHÔNG bao giờ là source có thể sửa mặc định, và KHÔNG được copy vào một ReviewedMask như thể là bản người sửa.** Backend phải từ chối các cố gắng dùng GT làm source prediction ẩn (`11` §8). `TC-REV-002` kiểm điều này.

Lý do: nếu ai đó "sửa" bằng cách copy GT, chỉ số Dice sẽ hoàn hảo và hoàn toàn vô nghĩa. `05` §4 invariant 6: **một reviewed mask không bao giờ được gán nhãn sai thành dataset ground truth.**

---

# J. NGỮ NGHĨA OUTLIER / WORST SLICE (**DR-010 ✅**)

## J.1 Outlier tác nghiệp

> **Ba ca đã đánh giá thành công có case-level 3D Dice thấp nhất**, cho **experiment và prediction variant được chọn tường minh**.
>
> **Tie-break:** `|FP+FN|` cao hơn trước, rồi **`case_id` ổn định**.

| Điểm | Ghi chú |
|---|---|
| **Chỉ ca "đánh giá thành công"** | Ca thất bại/bị loại không phải ứng viên — phù hợp `08` §8.1, vốn bắt báo cáo riêng ca thất bại và **không được âm thầm bỏ**. Danh sách outlier phải đọc kèm N dự kiến vs N thành công (`NFR-REP-003`) |
| **Experiment và variant là tham số tường minh** | Không mặc định — luật không-thay-thế-ngầm của `11` §6 cũng áp ở đây |
| **Số lượng cố định = 3** | Xác định và luôn không rỗng với cohort ≥3 ca. Quy tắc IQR sẽ không đảm bảo được điều đó |

**MUST KNOW — đây là định nghĩa TÁC NGHIỆP cho "ca hiệu năng thấp", KHÔNG phải phát hiện outlier thống kê suy diễn.** Nó không nói gì về phân bố; nó chỉ nói "ba ca tệ nhất theo Dice". Đừng gọi nó là outlier theo nghĩa thống kê trong báo cáo.

## J.2 Worst anatomical slice

Trong các slice có **GT không rỗng**, xếp theo:

| Thứ tự | Khoá | Chiều |
|---:|---|---|
| 1 | Dice per-slice | **tăng dần** |
| 2 | `FP+FN` voxel count | **giảm dần** |
| 3 | `slice_index` | **tăng dần** |

**Loại trừ và tách biệt:**

- **Slice cả-hai-rỗng (`NOT_APPLICABLE`) bị LOẠI** khỏi xếp hạng — nhất quán với `07` §6.
- **Slice chỉ có FP trên nền** (GT rỗng, prediction không rỗng) **có thể được nêu RIÊNG** như "problematic FP slice", nhưng **KHÔNG định nghĩa "worst anatomical slice" chính**.

**Vì sao điểm cuối quan trọng:** theo `07` §6, một slice chỉ-FP có Dice = `0`. Nếu xếp hạng thô, nó **đồng hạng với — và thường vượt lên trên** — những slice thất bại giải phẫu thật. Người dùng bấm "nhảy tới slice tệ nhất" sẽ đến một slice nền có vài voxel nhiễu, và câu chuyện demo ở `16` §2 sụp đổ.

- Khoá thứ ba (`slice_index` tăng) đảm bảo thứ tự **ổn định, tái lập** giữa các build.

---

# K. PIPELINE HỆ THỐNG

## K.1 Luồng end-to-end đầy đủ

```text
   ┌──────────────────────────┐
   │  Official Dataset        │  LASC 2018 · lgemri.nrrd + laendo.nrrd
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐
   │  Dataset Audit           │  Spike D · GATE-DATA-01 · DATASET_AUDIT.md + manifest
   └────────────┬─────────────┘  provenance · counts · shape · geometry · mask semantics
                ▼
   ┌──────────────────────────┐
   │  Split / Subsets         │  GATE-SPLIT-01 · patient-level · seed 2024
   └────────────┬─────────────┘  25% ⊂ 50% ⊂ 100% (BẮT BUỘC)
                ▼
   ┌──────────────────────────┐
   │  Training                │  6 run lõi · GATE-ML-01 · recipe đóng băng
   └────────────┬─────────────┘  DR-011: không cohort-fitted normalization
                ▼
   ┌──────────────────────────┐
   │  RawPredictionMask       │  [IMMUTABLE]
   └────────────┬─────────────┘
                ├──────────────► ProcessedPredictionMask  [DERIVED] → EXP-D-PP
                ▼
   ┌──────────────────────────┐
   │  Metrics                 │  CaseMetricSet · SliceMetric · CohortMetricSummary
   └────────────┬─────────────┘  variant phải khai: RAW / PROCESSED
                ▼
   ┌──────────────────────────┐
   │  3D Reconstruction       │  [DERIVED] · geometry_contract_version
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐
   │  Artifact Ingestion      │  DR-004: HAI hợp đồng riêng
   └────────────┬─────────────┘   (1) raw dataset/case   (2) precomputed experiment artifact
                ▼
   ┌──────────────────────────┐
   │  Backend / Persistence   │  Mac mini M2 24 GB (ở XA) · API · artifact store
   └────────────┬─────────────┘
                │  cellular 4G/5G → ZeroTier overlay xác thực
                ▼
   ┌──────────────────────────┐
   │  Mobile Workspace        │  Galaxy A17 5G · study → cohort → case → slice ↔ 3D
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐
   │  Review / ReviewedMask   │  [HUMAN] · commit tạo version mới, bất biến
   │  / Finding               │  KHÔNG huấn luyện lại tự động
   └──────────────────────────┘
```

## K.2 Bốn người ngồi ở đâu trên pipeline

```text
Official Dataset ──► Dataset Audit ──► Split ──► Training ──► RawPrediction
                     ╰──────────── BẾ QUỐC KHÁNH ────────────────────╯
                          (ML Training/Evaluation · Spike D → C0/C1)

RawPrediction ──► Metrics ──► CohortMetricSummary
                  ╰── BẾ QUỐC KHÁNH (tính) ──╯──► BẾ QUỐC KHÁNH (V3 hiển thị cohort)

RawPrediction ──► 3D Reconstruction ──► mesh + geometry
                  ╰────────── VŨ HÙNG ANH ──────────╯
                    (Imaging/Geometry · Spike B → F · V2 3D)

Artifacts ──► Ingestion ──► Backend/Persistence ──► API
              ╰────── NGUYỄN GIA ĐỨC TRUNG ──────╯
                (Backend/Persistence/Ingestion · Spike E)

API ──► Mobile: 2D viewer / slice / overlay / brush
        ╰────────── PHẠM TUẤN ANH ──────────╯
          (V1 Case Explorer/2D · Spike A)
        + Integration / CI / cross-contract coordination (toàn tuyến)

Mobile ──► Review / ReviewedMask / Finding ──► persistence
           ╰────── NGUYỄN GIA ĐỨC TRUNG (V4) ──────╯

Mobile ──► 3D view / picking / error 3D
           ╰────── VŨ HÙNG ANH (V2) ──────╯
```

**MUST KNOW:** Không ai chỉ cần hiểu khối của mình. `14` §5 bắt mỗi khối có **Secondary Reviewer** đủ năng lực **tự giải thích, review thiết kế, review PR, chạy lại luồng quan trọng, và giúp debug khi Primary Owner bị chặn**.

---

# L. CÁI GÌ ĐÃ ĐÓNG BĂNG vs CÁI GÌ CHỜ BẰNG CHỨNG

## L.1 ĐÃ ĐÓNG BĂNG / ĐÃ DUYỆT — không tự ý đổi

| Mục | Nguồn |
|---|---|
| Câu hỏi nghiên cứu RQ-A, RQ-B | `00` §9, `08` §1 |
| **`25% ⊂ 50% ⊂ 100%` nesting BẮT BUỘC**, làm tròn xác định | **SCQ-05** |
| **Quy ước toạ độ canonical `(x,y,z)`** | **DR-008a ✅** |
| **Luật độ chính xác: fixture chính xác tuyệt đối / mesh thật ≤ ±1 slice** | **SCQ-06** |
| Metric chính = 3D Dice/IoU cấp ca; cohort dẫn xuất từ per-case | `07` §6, `08` §5 |
| **Ba entity metric** `CaseMetricSet` / `SliceMetric` / `CohortMetricSummary` | **SCQ-02** |
| Luật empty-slice per-slice | `07` §6 |
| **Khoảng tin cậy 95%** cho metric cohort chính và hiệu số theo cặp | **DR-014 ✅** |
| **Ngữ nghĩa review** (scope, revision, buffer, undo/cancel/reset/commit) | **DR-009 ✅** |
| Bất biến của `MRI` / `GT` / `RawPrediction` | `NFR-REL-001` |
| **KHÔNG huấn luyện lại tự động** sau khi sửa | `01` §8 |
| **Định nghĩa outlier / worst slice** | **DR-010 ✅** |
| **Chính sách normalization** — không cohort-fitted | **DR-011 ✅** |
| **Chính sách geometry** — chỉ axis-aligned, từ chối bằng `GEOMETRY_NOT_VALIDATED` | **DR-012 ✅** |
| **Deployment profile** — `LOCAL_DEMO — PRIVATE OVERLAY / CELLULAR ACCESS` | **DR-003 ✅** |
| **Ma trận ownership** hai trục | **DR-013 ✅** |
| **Một thiết bị Galaxy A17 5G duy nhất** được cấp phép; thứ tự đo A→B→E | **DR-006 ✅**, `WIP-CONFLICT-02` |
| **Hai hợp đồng ingestion riêng** | **DR-004 ✅** |
| Trigger leo thang dataset cuối ngày execution đầu tiên | **DR-001 ✅** |
| `EXP-D-PP` là Experiment dẫn xuất hạng nhất | **SCQ-04** |
| Trần MUST scope (28 MUST product requirement) | `03` §5 scope firewall |

## L.2 CHƯA ĐÓNG BĂNG — chờ bằng chứng

| Mục | Chờ gì | Decision |
|---|---|---|
| **Mobile framework cuối cùng** | Bằng chứng **Spike A + Spike B** | `GATE-MOB-01` / `DR-G05` |
| **Kiến trúc/variant/decoder DINOv2 cuối cùng** | Bằng chứng **Spike C1** (C0 **không đủ**) | `GATE-ML-01` / `DR-G03` |
| **Ngân sách mesh decimation** | Bằng chứng **Spike B** | **DR-008c** |
| **Biểu diễn lỗi 3D** | Bằng chứng **Spike F** | **DR-005** |
| **Path A hay Path B thực tế** | Bằng chứng **Spike D** | **DR-002** / `GATE-SPLIT-01` |
| **Chiến lược artifact transport + fallback** | Bằng chứng **Spike E** | `ADR-ART-001` |
| **Ngân sách hiệu năng first-load** | Bằng chứng **Spike E** | `RA-H13` |
| Cấu hình morphology cho `EXP-D-PP` | Bằng chứng validation | `GATE-IMG-01` / `DR-G04` |
| **Tương thích geometry của gói dữ liệu thật** | Bằng chứng **Spike D** | điều kiện **C6** vẫn MỞ |

## L.3 ⚠ "Chưa đóng băng" KHÔNG có nghĩa là mỗi người tự chọn

**MUST KNOW.** Đây là điểm dễ hiểu sai nhất trong bảng trên.

Một mục "chưa đóng băng" nghĩa là: **chưa ai có quyền quyết, và nó sẽ được quyết bằng bằng chứng qua đúng cửa (gate/DR)**.

Nó **không** nghĩa là:

- ❌ "Tôi cứ chọn framework tôi thích rồi báo sau."
- ❌ "Tôi chọn variant DINOv2 tiện nhất."
- ❌ "Tôi giảm mesh tới mức chạy mượt là được."

`00` §13 nêu quy trình bắt buộc:

```text
Problem → Decision Request → impact analysis → leader/spec-owner approval
        → specification update → implementation
```

Và `17` §15: **code không bao giờ được dùng để định nghĩa lại spec chỉ vì code đã tồn tại.**

## L.4 Ba điều kiện readiness còn MỞ

| Điều kiện | Trạng thái | Cần gì |
|---|---|---|
| **C1** | **MỞ** | Spike D hoàn tất; `DATASET_AUDIT.md` + manifest được ACCEPTED |
| **C4** | **MỞ** | Bằng chứng Spike F, rồi quyết định DR-005 (`RA-B01` — BLOCKER duy nhất của dự án) |
| **C6** | **MỞ / `PARTIALLY_RESOLVED`** | Chính sách axis-aligned **đã duyệt**; còn chờ **xác nhận đối chiếu gói dữ liệu thật từ Spike D** |

**Đừng nói C1, C4 hay C6 đã đóng.** C2, C3, C5, C7, C8 đã đóng; ba cái trên thì chưa.

---

# M. NĂM ĐIỀU TUYỆT ĐỐI KHÔNG LÀM

| # | KHÔNG | Nếu vi phạm |
|---:|---|---|
| 1 | **Ghi đè `RawPredictionMask`** | Điều kiện loại bỏ MVP (`03` §4); P0 |
| 2 | **Split theo slice, hay để bệnh nhân xuyên partition** | Data leakage — P0; RQ-A vô giá trị |
| 3 | **Hiện metric phụ thuộc GT khi không có GT** | Vi phạm `PR-MODE-01`; bịa số liệu khoa học |
| 4 | **Nới lỏng ràng buộc ±1 slice để framework "pass"** | Vi phạm SCQ-06; sai mapping 2D/3D là P0 |
| 5 | **Âm thầm đổi bất kỳ quyết định đã đóng băng** | Vi phạm `00` §13 / `17` §11 — phải qua DR |

---

**Tiếp theo:** [PROJECT_ONE_PAGE_MAP.md](PROJECT_ONE_PAGE_MAP.md) → [TEAM_WORKFLOW_QUICKSTART.md](TEAM_WORKFLOW_QUICKSTART.md) → member brief của bạn.
**Kiểm tra hiểu biết:** [SHARED_CORE_CHECK.md](SHARED_CORE_CHECK.md)
