# PROJECT ONE-PAGE MAP

**Mở file này suốt dự án.** Bản tra cứu nhanh — chi tiết ở [TEAM_SHARED_CORE.md](TEAM_SHARED_CORE.md).

---

## 1 · RESEARCH PIPELINE

```text
Official Dataset (LASC 2018: lgemri.nrrd + laendo.nrrd)
   │
   ▼  Spike D · GATE-DATA-01
Dataset Audit  →  DATASET_AUDIT.md + dataset_manifest.*
   │
   ▼  GATE-SPLIT-01 · patient-level · seed 2024 · 25% ⊂ 50% ⊂ 100% (BẮT BUỘC)
Split / Subsets
   │
   ▼  GATE-ML-01 (chờ Spike C1) · 6 run lõi · DR-011 no cohort-fitted norm
Training  ──►  RawPredictionMask [IMMUTABLE]
                   │
                   ├──►  ProcessedPredictionMask [DERIVED]  →  EXP-D-PP (ablation, không retrain)
                   ├──►  Metrics: CaseMetricSet · SliceMetric · CohortMetricSummary
                   └──►  Reconstruction3D [DERIVED]
                              │
                              ▼  DR-004: HAI hợp đồng ingestion riêng
                        Artifact Ingestion
                              │
                              ▼
                        Backend / Persistence   (Mac mini M2 24 GB — ở XA)
                              │  cellular 4G/5G → Tailscale overlay xác thực
                              ▼
                        Mobile Workspace        (Galaxy A17 5G — MỘT máy duy nhất)
                              │
                              ▼
                        Review / ReviewedMask / Finding [HUMAN]
                              └── KHÔNG huấn luyện lại tự động
```

---

## 2 · PRODUCT INTERACTION

```text
Research Study / Workspace
   │
   ├─► cohort ────────► phân bố · outlier (3 ca Dice thấp nhất) · so sánh experiment
   │                         │
   ├─► experiment ────► UNet vs DINOv2 × 25/50/100%  ·  EXP-D-PP
   │                         │
   └─► case ──────────► CA MRI = đối tượng tương tác SÂU NHẤT
          │
          ├─► slice ──► ảnh 2D + overlay (MRI/pred/GT/error/reviewed) + SliceMetric
          │      │
          │      └─► pixel / region ──► FP/FN · brush add/erase · undo/redo/reset
          │
          └───────  ↕  LIÊN KẾT HAI CHIỀU  ↕  ───────► 3D
                    2D→3D: đổi slice ⇒ cập nhật mặt phẳng 3D
                    3D→2D: chọn điểm/vùng ⇒ mở ĐÚNG slice
```

**LOOP A** Analyze · **LOOP B** Investigate · **LOOP C** Review/Improve

> Demo bắc đẩu: **"Vì sao AI sai trên ảnh MRI này, và nhà nghiên cứu có thể làm gì?"**

---

## 3 · ARTIFACT HIERARCHY

```text
IMMUTABLE ─── MRIVolume · GroundTruthMask · RawPredictionMask
              └── KHÔNG BAO GIỜ ghi đè

DERIVED ───── ProcessedPredictionMask · Reconstruction3D · Metrics
              └── tái tạo được từ nguồn + version

HUMAN ─────── Review · ReviewedMask · Finding
              └── commit ⇒ ReviewedMask version MỚI, bất biến
              └── Finding KHÔNG bắt buộc cho mọi lần sửa
              └── 3 aggregate ĐỘC LẬP (SCQ-01)
```

| Metric entity | Khoá |
|---|---|
| `CaseMetricSet` | `analysis_run_id` |
| `SliceMetric` | `run_id` + `slice_index` |
| `CohortMetricSummary` | phạm vi Experiment, dẫn xuất từ per-case |

**Mọi metric phải khai `RAW_PREDICTION` hoặc `PROCESSED_PREDICTION`.** So sánh chính dùng **RAW**.

---

## 4 · OWNERSHIP MAP — hai trục

| Thành viên | Mobile vertical (V) | Technical block | Spike hiện tại | Sau đó |
|---|---|---|---|---|
| **Phạm Tuấn Anh** *(Leader)* | **V1** Case Explorer / 2D MRI | **Integration / CI / cross-contract coordination** | **Spike A** | — |
| **Vũ Hùng Anh** | **V2** 3D / Spatial Error | **Imaging / Geometry** | **Spike B** | **Spike F** |
| **Bế Quốc Khánh** | **V3** Experiment / Cohort | **ML Training / Evaluation** | **Spike D** (P0) | **Spike C0 / C1** |
| **Nguyễn Gia Đức Trung** | **V4** Review / Findings | **Backend / Persistence / Ingestion** | **Spike E** | — |

### Ai review ai

| Khối | Primary | Secondary Reviewer |
|---|---|---|
| V1 2D · Spike A | Phạm Tuấn Anh | **Vũ Hùng Anh** |
| V2 3D · Geometry · Spike B/F | Vũ Hùng Anh | **Phạm Tuấn Anh** |
| V3 Cohort · ML · Spike D/C0/C1 | Bế Quốc Khánh | **Vũ Hùng Anh** |
| V4 Review · Backend · Spike E | Nguyễn Gia Đức Trung | **Phạm Tuấn Anh** |
| Integration / CI | Phạm Tuấn Anh | **Vũ Hùng Anh** |

> **Mỗi người là Primary Owner trên CẢ HAI trục.** Không ai chỉ cần hiểu khối của mình — Secondary Reviewer phải **tự giải thích, review thiết kế, chạy lại luồng quan trọng, và giúp debug khi Primary bị chặn** (`14` §5–§6).
>
> **Anti-bottleneck (ràng buộc):** KHÔNG chuyển ML khỏi Bế Quốc Khánh, KHÔNG chuyển Backend khỏi Nguyễn Gia Đức Trung vì lý do tốc độ ngắn hạn. Ghép cặp (`15` §18 Level 2) giữ ownership; chuyển giao thì phá nó.

---

## 5 · SPIKE MAP

| Spike | Chủ đề | Ưu tiên | Primary | Reviewer | Trạng thái |
|---|---|:---:|---|---|---|
| **D** | Dataset acquisition / validation / provenance | **P0** | Bế Quốc Khánh | Vũ Hùng Anh | **PREPARED** |
| **A** | 2D viewer / brush interaction | P1 | Phạm Tuấn Anh | Vũ Hùng Anh | **PREPARED** |
| **B** | 3D linked interaction | P1 | Vũ Hùng Anh | Phạm Tuấn Anh | **PREPARED** |
| **C0** | ML compute feasibility — sơ bộ, dữ liệu tổng hợp | P1 | Bế Quốc Khánh | Vũ Hùng Anh | **PREPARED** |
| **C1** | ML compute feasibility — cuối, subset thật | P1 | Bế Quốc Khánh | Vũ Hùng Anh | **BLOCKED** ← Spike D |
| **E** | Artifact transport trên đường demo thật | P2 | Nguyễn Gia Đức Trung | Phạm Tuấn Anh | **PREPARED** |
| **F** | 3D error representation | P1 | Vũ Hùng Anh | Phạm Tuấn Anh | **PREPARED** ← sau B |

**`ACTIVE` = đã thực sự bắt đầu.** Hiện **0 spike ACTIVE**, mọi `started_at` = `null`, **không có `RESULT.md`**.

### Hai luật tuần tự hoá

```text
REVIEW  (1 slot REVIEWING mỗi người)
  Vũ Hùng Anh    : Spike D  →  Spike A     (D là P0)
  Phạm Tuấn Anh  : Spike B  →  Spike E     (B là P1, nạp GATE-MOB-01 + DR-008c; E là P2)

THIẾT BỊ  (MỘT máy Galaxy A17 5G)
  Thứ tự ĐO:  1. Spike A   →   2. Spike B   →   3. Spike E
  Việc dựng harness/code CHẠY SONG SONG được — chỉ cửa sổ ĐO không được chồng
```

---

## 6 · GATE DEPENDENCIES

```text
Spike D ──┬──► GATE-DATA-01 (DR-G01) ──► điều kiện C1
          ├──► DR-002 / GATE-SPLIT-01 (DR-G02)   [Path A hay B?]
          ├──► xác nhận DR-012 ──► điều kiện C6
          └──► Spike C1 ──► GATE-ML-01 (DR-G03) ──► GATE-IMG-01 (DR-G04)
                            ▲
              Spike C0 ─────┘  chỉ là bằng chứng SƠ BỘ — KHÔNG đóng được GATE-ML-01

Spike A ──┬──► GATE-MOB-01 (DR-G05)   ← cần CẢ HAI
Spike B ──┘         └──► TECH_STACK_ADR.md
Spike B ─────► DR-008c  (ngân sách mesh, trong trần ±1 slice)

Spike F ─────► DR-005 ──► điều kiện C4 ──► RA-B01 (BLOCKER duy nhất)

Spike E ─────► ADR-ART-001 · ngân sách first-load (RA-H13) · fallback kết nối demo
```

**Đã đóng:** GATE-DEPLOY-01 (DR-G06 ✅ — `LOCAL_DEMO — PRIVATE OVERLAY / CELLULAR ACCESS`)
**Điều kiện đã đóng:** C2 · C3 · C5 · C7 · C8 · **Còn MỞ:** **C1 · C4 · C6**

---

## 7 · NĂM ĐIỀU "DO NOT"

| # | KHÔNG BAO GIỜ | Vì sao |
|---:|---|---|
| **1** | Ghi đè `RawPredictionMask` | Điều kiện **loại bỏ MVP** (`03` §4) · P0 |
| **2** | Split theo slice, hay để một bệnh nhân xuyên partition | **Data leakage** · P0 · RQ-A vô giá trị |
| **3** | Hiện metric phụ thuộc GT khi **không có GT** | `PR-MODE-01` · bịa số liệu khoa học |
| **4** | Nới lỏng ràng buộc **±1 source slice** để framework "pass" | SCQ-06 · sai mapping 2D/3D là **P0** |
| **5** | Âm thầm đổi một quyết định đã đóng băng vì code dễ hơn | `00` §13 · `17` §15 — **phải qua DR** |

---

## 8 · SỐ LIỆU & HỢP ĐỒNG TRA NHANH

| Mục | Giá trị |
|---|---|
| **Toạ độ canonical** | `(x,y,z)` · x=cột · y=hàng · z=slice index · `shape_xyz=[Nx,Ny,Nz]` · `slice_index=z ∈ 0..Nz-1` · slice shape `[Ny,Nx]` · `(u,v)→(x=u,y=v,z)` · gốc trên-trái · +x phải · +y xuống · **memory order KHÔNG thuộc hợp đồng** |
| **Picking accuracy** | fixture: **chính xác tuyệt đối** · mesh thật đã decimate: **≤ ±1 source slice** |
| **Empty slice** | GT có/pred rỗng → `0` · GT rỗng/pred có → `0` · **cả hai rỗng → `NOT_APPLICABLE`, LOẠI khỏi trung bình** |
| **Outlier** | **3** ca Dice 3D thấp nhất (đã đánh giá thành công) · tie: `|FP+FN|` cao hơn, rồi `case_id` |
| **Worst slice** | GT không rỗng · Dice ↑ · `FP+FN` ↓ · `slice_index` ↑ · slice chỉ-FP nêu **riêng** |
| **Hiệu năng** | slice đã cache **p95 ≤ 200 ms** · brush feedback **≤ 100 ms**, 0 nét mất · 3D **≥20 FPS median**, không stall >500 ms · tạo request async ≤ 2 s |
| **Split** | patient-level · seed **2024** · `25% ⊂ 50% ⊂ 100%` **bắt buộc** |
| **Deployment** | `LOCAL_DEMO — PRIVATE OVERLAY / CELLULAR ACCESS` · trust = thành viên overlay, **KHÔNG** phải mạng vật lý · Wi-Fi hội trường **không tin cậy, không cần** · **không** endpoint/domain/port-forward/dataset công khai |
| **Thiết bị** | **MỘT** Samsung Galaxy A17 5G · profile phần cứng phải **đọc từ máy**, **không suy diễn** |
| **Ngày** | **Day 0 = 2026-09-09** (không thuộc baseline) · **Execution Day 1 = 2026-09-10** |
| **Đếm đã kiểm chứng** | 39 product requirement (28 MUST) · 79 FR/NFR · 17 UC · 9 SCR · 69 TC |

**Nguồn chân lý:** `docs/specs/v1.0/` (đóng băng, 19/19 checksum OK) · `../readiness/READINESS_REVIEW_RESOLUTION.md` **§10 và §11** · `../spikes/SPIKE_PHASE_STATE.yaml`
