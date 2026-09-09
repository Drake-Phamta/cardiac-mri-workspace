# ONBOARDING PACKAGE — DAY 0

**Ngày:** **2026-09-09 — DAY 0: TEAM ONBOARDING / PRE-EXECUTION**
**Execution Day 1:** **2026-09-10**
**Đối tượng:** cả 4 thành viên
**Người điều phối:** Phạm Tuấn Anh (Team Leader)

> **Day 0 KHÔNG thuộc baseline 30 ngày.** Baseline bắt đầu **2026-09-10**.

---

## 1. Day 0 để làm gì

Day 0 tồn tại để **cả bốn người có cùng một mô hình tư duy end-to-end** trước khi bất kỳ ai viết dòng code đầu tiên.

Dự án này không phải bốn dự án nhỏ ghép lại. Đặc tả đã đóng băng (`14` §1) nói rõ:

> Nhóm **không được** chia thành bốn ốc đảo theo môn học. Mô hình bắt buộc là:
> `shared core understanding → vertical/block specialization → cross-review → integrated ownership`

Nghĩa là: **học phần lõi chung trước, chuyên sâu sau.** Ai chưa qua được cửa shared-core thì vẫn làm việc theo cặp, chưa nhận quyền sở hữu sâu độc lập (`14` §2.1).

## 2. Vì sao onboarding là bắt buộc, không phải "nice to have"

Ba lý do rất cụ thể của **dự án này**:

1. **Hợp đồng toạ độ là điểm chết.** `13` §12 xếp lỗi "2D/3D mapping wrong in accepted build" vào loại **P0/Critical**. Backend và mobile mà hiểu khác nhau về `(x, y, z)` thì cả hai đều "đúng" trong test của mình và chỉ sai khi tích hợp. Cả nhóm phải thuộc quy ước DR-008a.
2. **Ngữ nghĩa artifact quyết định tính hợp lệ khoa học.** Ghi đè `RawPrediction` bằng bản người sửa là điều kiện **loại bỏ MVP** (`03` §4). Một người hiểu sai là đủ để mất tính tái lập.
3. **30 ngày không có tuần tích hợp.** `15` §3 và §20 cấm để tích hợp về cuối. Nghĩa là mọi người phải hiểu đầu vào/đầu ra của người khác **từ ngày đầu**.

## 3. Mô hình đọc — cái gì đọc TRƯỚC buổi, cái gì đọc CÙNG NHAU trong buổi

> **Đây là hiệu chỉnh về CÁCH TRUYỀN TẢI, không phải giảm kiến thức bản thân yêu cầu.**
> Chuẩn không đổi: **cuối Day 0, mọi người phải hiểu Shared Core.**

### ĐỌC BẮT BUỘC TRƯỚC 08:30 — chỉ ba mục

| File | Thời lượng ước | Vì sao đọc trước |
|---|---|---|
| [README.md](README.md) | ~10 phút | Biết Day 0 là gì, được và không được làm gì |
| [PROJECT_ONE_PAGE_MAP.md](PROJECT_ONE_PAGE_MAP.md) | ~15 phút | Vào buổi đã có khung tư duy chung để bám vào |
| **member brief của chính mình** | ~20 phút | Biết mình sở hữu gì trước khi bàn việc chung |

**Tổng ước khoảng 45 phút.** Không nhiều hơn.

### ĐI DẪN CÙNG NHAU TRONG DAY 0 — không đọc một mình trước

| File | Khi nào |
|---|---|
| [TEAM_SHARED_CORE.md](TEAM_SHARED_CORE.md) | **09:00–12:00** — leader dẫn qua mục A–M, có câu hỏi kiểm tra sau mọi 15–20 phút |
| [TEAM_WORKFLOW_QUICKSTART.md](TEAM_WORKFLOW_QUICKSTART.md) | **14:30–15:30** — gắn với bài drill Git thực tế |

**`TEAM_SHARED_CORE.md` vẫn là tài liệu onboarding có thẩm quyền và đầy đủ nhất — nó không bị rút ngắn.**
Chỉ khác cách tiếp cận: thay vì yêu cầu mọi người tự đọc ~750 dòng trong im lặng trước 08:30, ta đi cùng
nhau trong buổi, nơi hiểu nhầm được bắt và chấn chỉnh ngay. Sau buổi nó trở thành tài liệu tra cứu.

### CHỈ DÀNH CHO LEADER

| File | Dùng khi |
|---|---|
| [DAY0_LEADER_CHEATSHEET.md](DAY0_LEADER_CHEATSHEET.md) | **Mở trong lúc điều phối** — 1–2 trang, mỗi phiên chỉ có mục tiêu, 3–5 điểm cần nói, file cần chiếu, câu cần hỏi, hiểu nhầm cần cảnh giác, tín hiệu kết thúc |
| [DAY0_KICKOFF_RUNBOOK.md](DAY0_KICKOFF_RUNBOOK.md) | Đọc **trước** buổi — kịch bản chi tiết, đáp án mong đợi đầy đủ |

Thành viên **không** cần đọc hai file này.

### PHẢI HIỂU TRƯỚC KHI QUA CỬA SHARED-CORE

**Toàn bộ khái niệm shared-core liên quan** — xem [SHARED_CORE_CHECK.md](SHARED_CORE_CHECK.md).
Kiểm lúc **16:45–17:30**. Tiêu chuẩn `PASS` **không thay đổi**.

### THAM CHIẾU KHI CẦN — không đọc tuyến tính

Chi tiết ở §3.1 bên dưới.

---

## 3.1 Từng file dùng khi nào

### CÁ NHÂN — đọc trước buổi

| Thành viên | Brief | Spike TASK.md hiện tại |
|---|---|---|
| Phạm Tuấn Anh | [member_briefs/PHAM_TUAN_ANH.md](member_briefs/PHAM_TUAN_ANH.md) | `../spikes/SPIKE_A_2D/TASK.md` |
| Vũ Hùng Anh | [member_briefs/VU_HUNG_ANH.md](member_briefs/VU_HUNG_ANH.md) | `../spikes/SPIKE_B_3D/TASK.md` |
| Bế Quốc Khánh | [member_briefs/BE_QUOC_KHANH.md](member_briefs/BE_QUOC_KHANH.md) | `../spikes/SPIKE_D_DATASET/TASK.md` |
| Nguyễn Gia Đức Trung | [member_briefs/NGUYEN_GIA_DUC_TRUNG.md](member_briefs/NGUYEN_GIA_DUC_TRUNG.md) | `../spikes/SPIKE_E_TRANSPORT/TASK.md` |

### THAM CHIẾU KHI CẦN — không đọc tuyến tính

- `docs/specs/v1.0/00` … `17` — **Frozen Specification v1.0**
- `../readiness/READINESS_REVIEW_RESOLUTION.md` — **§10 và §11 là bản ghi có thẩm quyền** về quyết định và trạng thái
- `../readiness/OPEN_DECISIONS.md` — toàn bộ DR và kết quả đã duyệt
- `../spikes/SPIKE_PHASE_PLAN.md` · `../spikes/SPIKE_PHASE_STATE.yaml`

> ### ⚠ Đừng đọc `00`→`17` tuyến tính trước Day 1
>
> Bộ spec đóng băng **là nguồn chân lý** — nhưng nó có **39 product requirement, 79 FR/NFR, 17 use case, 69 acceptance test**. **Không ai** cần đọc hết trước Day 1.
>
> Cách dùng đúng: đọc LEVEL 1–3, rồi **tra cứu** spec theo ID khi cần. Mọi tài liệu onboarding đều dẫn ID gốc (`07` §6, `PR-REV-02`, `DR-008a`, …) để bạn nhảy thẳng tới đúng chỗ.
>
> Khi tài liệu onboarding và spec đóng băng khác nhau: **spec đóng băng thắng**, và hãy báo ngay cho leader.

## 4. Trạng thái mong đợi cuối Day 0

| Mục | Mục tiêu |
|---|---|
| Shared Core | **4/4 PASS** ([SHARED_CORE_CHECK.md](SHARED_CORE_CHECK.md)) |
| Git/PR workflow | 4/4 đã thực hành xong bài drill |
| Hiểu nhiệm vụ cá nhân | 4/4 trả lời được 10 câu trong runbook §15:45 |
| Repo access + môi trường | 4/4 READY |
| Ký nhận | [DAY0_SIGNOFF.md](DAY0_SIGNOFF.md) do **người thật** điền |
| **Spike ACTIVE** | **0 — không spike nào được ACTIVE** |

## 5. Day 0 — ĐƯỢC và KHÔNG ĐƯỢC

### ✅ ĐƯỢC làm

đọc · thảo luận · xem spec · xem spike `TASK.md` · cài đặt và cấu hình tooling · kiểm tra quyền truy cập repo · học thư viện ở mức khái niệm · làm bài drill Git · hỏi kỹ thuật · làm rõ ownership · rà soát kiến trúc · hoàn thành các bài kiểm tra onboarding

### ❌ KHÔNG ĐƯỢC tính là spike execution

| Không được | Vì sao |
|---|---|
| **Tải dataset chính thức như công việc Spike D** | Đồng hồ trigger **DR-001** phải bắt đầu **2026-09-10**, không phải trong onboarding |
| Thu thập bằng chứng Spike D | Cùng lý do |
| Hiện thực harness spike A/B/E "thật" | Đó là execution |
| Đo trên thiết bị | Đó là execution |
| Đo transport qua cellular | Đó là execution |
| Thu bằng chứng geometry | Đó là execution |
| Thu bằng chứng ML | Đó là execution |
| **Tạo `RESULT.md`** | Chỉ tồn tại khi có bằng chứng thật |
| **Chuyển spike sang `ACTIVE`** | `ACTIVE` = đã thực sự bắt đầu |

> **Nếu việc cài tooling phát hiện vướng mắc → ghi vào cột "Clarifications Required" của [DAY0_SIGNOFF.md](DAY0_SIGNOFF.md) như một onboarding blocker.** Tuyệt đối không biến nó thành spike execution giả.

## 6. Vòng đời từ Day 0 đến Execution Day 1

```text
2026-09-09  DAY 0 — TEAM ONBOARDING
                 • chỉ onboarding
                 • KHÔNG tạo MASTER_PLAN_30_DAYS.md trong Day 0
                        │
                        ▼  cuối Day 0
            DAY0_SIGNOFF.md — ghi mức sẵn sàng THỰC của người thật
                        │
                        ▼  nếu team READY, hoặc READY với các mục cần làm rõ
                           ĐƯỢC KHAI LÀ KHÔNG CHẶN
            Project Control được cấp phép ở MỘT LƯỢT RIÊNG SAU ĐÓ
            để sinh baseline 30 ngày CÓ ĐIỀU KIỆN, dựa trên signoff Day-0 thực tế
                        │
                        ▼
            LEADER CHẤP NHẬN baseline 30 ngày
                        │
                        ▼
            DAY1_READINESS_CHECKLIST.md — cửa cuối
                        │
                        ▼
2026-09-10  LEADER TUYÊN BỐ EXECUTION DAY 1
                 • baseline 30 ngày BẮT ĐẦU từ ngày này
                 • spike chuyển ACTIVE với started_at THẬT
                 • đồng hồ trigger DR-001 bắt đầu
```

### Ba điều kiện còn MỞ **KHÔNG** chặn việc tạo baseline

**C1, C4, C6 vẫn MỞ và vẫn phụ thuộc bằng chứng.** Nhưng chúng **không** phải điều kiện tiên quyết để
baseline tồn tại. Chúng phải **xuất hiện BÊN TRONG baseline** dưới dạng tường minh:

**gate** · **dependency** · **điểm bất định trên critical path** · **decision point** · **recovery trigger**

> ### ⚠ Ràng buộc với baseline được tạo trước khi có bằng chứng
>
> Nó **KHÔNG ĐƯỢC âm thầm đóng băng** bất kỳ mục nào sau đây:
>
> Path A/B · mobile framework · DINOv2 recipe cuối · ngân sách mesh cuối · biểu diễn lỗi 3D cuối ·
> chiến lược transport cuối · **bất kỳ quyết định nào khác phụ thuộc bằng chứng**.
>
> Chúng vẫn đóng qua đúng cửa (gate/DR) sau khi spike cho bằng chứng.

**Lưu ý:** không tạo baseline trong Day 0, và **không tạo trong lượt này**. Đó là một lượt riêng, sau
khi có signoff Day-0 thật.

## 6.1 Khi leader tuyên bố Execution Day 1

| Thành viên | Spike | Hành động |
|---|---|---|
| Bế Quốc Khánh | **Spike D** (P0) | → `ACTIVE`, ghi `started_at` **thật** |
| Phạm Tuấn Anh | **Spike A** | → `ACTIVE`, ghi `started_at` **thật** |
| Vũ Hùng Anh | **Spike B** | → `ACTIVE`, ghi `started_at` **thật** |
| Nguyễn Gia Đức Trung | **Spike E** | → `ACTIVE`, ghi `started_at` **thật** |

Spike **C0** và **F** giữ `PREPARED`; Spike **C1** giữ `BLOCKED` (chờ Spike D).

> **Đồng hồ execution-day của DR-001 bắt đầu cùng Execution Day 1. Không lùi ngày (`started_at`).**

Cửa cuối trước Day 1: [DAY1_READINESS_CHECKLIST.md](DAY1_READINESS_CHECKLIST.md).

## 7. Mức độ cần biết — quy ước dùng trong cả bộ tài liệu

| Nhãn | Ý nghĩa |
|---|---|
| **MUST KNOW** | Cả 4 người phải giải thích được. Vào cửa shared-core. |
| **OWN DEEPLY** | Chủ sở hữu khối phải nắm sâu; người khác hiểu ở mức giao diện |
| **REFERENCE** | Tra khi cần, không cần thuộc |

---

## 8. Danh sách file trong bộ này

```text
management/onboarding/
├── README.md                        <- bạn đang đọc
├── TEAM_SHARED_CORE.md              LEVEL 1  quan trọng nhất
├── PROJECT_ONE_PAGE_MAP.md          LEVEL 1  bản đồ 1 trang
├── TEAM_WORKFLOW_QUICKSTART.md      LEVEL 2  quy trình hằng ngày
├── DAY0_LEADER_CHEATSHEET.md        1-2 trang, leader mở trong lúc điều phối
├── DAY0_KICKOFF_RUNBOOK.md          kịch bản điều phối chi tiết cho leader
├── SHARED_CORE_CHECK.md             15 câu kiểm tra hiểu biết
├── DAY0_SIGNOFF.md                  bảng ký nhận cuối ngày
├── DAY1_READINESS_CHECKLIST.md      cửa cuối trước Execution Day 1
└── member_briefs/
    ├── PHAM_TUAN_ANH.md
    ├── VU_HUNG_ANH.md
    ├── BE_QUOC_KHANH.md
    └── NGUYEN_GIA_DUC_TRUNG.md
```
