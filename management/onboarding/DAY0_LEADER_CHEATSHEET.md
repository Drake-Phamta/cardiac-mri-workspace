# DAY 0 — LEADER CHEAT SHEET

**Mở file này trong lúc điều phối.** Chi tiết đầy đủ ở [DAY0_KICKOFF_RUNBOOK.md](DAY0_KICKOFF_RUNBOOK.md).
**2026-09-09** · Phạm Tuấn Anh · 08:30–18:00

---

### 08:30–09:00 · MỞ ĐẦU

**Mục tiêu:** cả nhóm biết ta xây gì, trả lời câu hỏi nào, và thành công nghĩa là gì.

- Workspace nghiên cứu MRI tim, mobile-first — **không** phải sản phẩm chẩn đoán lâm sàng
- RQ-A: DINOv2 có **suy giảm ít hơn** UNet khi giảm nhãn? · RQ-B: morphology giúp hay hại?
- Thành công = **câu trả lời hợp lệ**, không phải "DINOv2 thắng"
- 30 ngày, không có tuần tích hợp ở cuối
- Day 0 tồn tại vì: hợp đồng toạ độ là lỗi P0; ngữ nghĩa artifact quyết tính hợp lệ khoa học

**Chiếu:** `PROJECT_ONE_PAGE_MAP.md` §2
**Hỏi:** *"Nếu DINOv2 tệ hơn UNet ở mọi phân số, dự án có thất bại không?"* → **Không** (`PR-SCI-03`)
**⚠ Cảnh giác:** *"ta phải làm cho DINOv2 thắng"* → chấn chỉnh ngay
**Xong khi:** cả 4 nói được "thành công KHÔNG nghĩa là gì" → **sang Shared Core I**

---

### 09:00–10:30 · SHARED CORE I

**Mục tiêu:** MRI/LA, dataset, artifact, RQ, split — nền tảng khoa học.

- LGE MRI = chồng slice 2D; mục tiêu = **LA cavity**; nhiều slice là **nền thuần**
- `lgemri.nrrd` + `laendo.nrrd`; `lawall.nrrd` **loại**; **chưa ai tải gói**
- Ba lớp artifact: **IMMUTABLE / DERIVED / HUMAN**
- 6 experiment; `25% ⊂ 50% ⊂ 100%` **bắt buộc**; patient-level; cùng thành viên cho cả hai họ model
- Bài báo dùng LAScarQS 2022 — **khác dataset**, không nói "tái lập"

**Chiếu:** `TEAM_SHARED_CORE.md` §A–C, và **§D.4 vẽ lên bảng trắng**
**Hỏi (quan trọng nhất buổi sáng):** *"Vì sao không chia ngẫu nhiên theo slice?"* → slice lân cận cùng bệnh nhân gần giống nhau ⇒ **leakage**, metric giả, RQ-A vô giá trị
**⚠ Cảnh giác:** *"chia slice thì nhiều data hơn"* · *"sửa xong thì cập nhật prediction"*
**Xong khi:** cả 4 xếp đúng 4 artifact vào 3 lớp → **giải lao 10:30**

---

### 10:45–12:00 · SHARED CORE II

**Mục tiêu:** hai chế độ, metric, geometry, review — phần dễ sai nhất.

- Evaluation vs Inference & Review; **không GT ⇒ không metric phụ thuộc GT**, trả `GROUND_TRUTH_UNAVAILABLE`
- Metric chính = **3D Dice/IoU cấp ca**; cohort **dẫn xuất từ per-case**, không gộp voxel
- Empty-slice: 0 / 0 / **`NOT_APPLICABLE` (loại)** — **không phải 1**
- **Toạ độ canonical**: `(x,y,z)`, x=cột, y=hàng, z=slice; `slice_index=z`; memory order **không** thuộc hợp đồng
- Review: brush **không chờ mạng**; nét chưa sync **có thể mất**; commit tạo version **mới**

**Chiếu:** `TEAM_SHARED_CORE.md` §E–I · **viết quy ước §G.1 lên bảng và ĐỂ NGUYÊN cả ngày**
**Hỏi:** *"Slice cả GT và pred đều rỗng — Dice bao nhiêu?"* → **`NOT_APPLICABLE`, loại khỏi trung bình**
**⚠ Cảnh giác:** *"cả hai đúng nên Dice=1"* · *"numpy trả thế thì để thế"* · *"không GT thì hiện 0"*
**Xong khi:** cả 4 đọc lại được quy ước `(x,y,z)` không nhìn bảng → **nghỉ trưa**

---

### 13:30–14:30 · KIẾN TRÚC

**Mục tiêu:** ai đưa gì cho ai, suốt pipeline.

- Đi **từng chặng**, mỗi chặng hỏi 4 câu: owner? input? output? ai tiêu thụ?
- **Đừng tự trả lời trước** — để họ nói
- Quốc Khánh đầu chuỗi · Hùng Anh geometry/3D · Đức Trung ingestion/backend · Tuấn Anh 2D + tích hợp

**Chiếu:** `PROJECT_ONE_PAGE_MAP.md` §1 và `TEAM_SHARED_CORE.md` §K.2
**Hỏi:** *"Quốc Khánh tạo `RawPredictionMask`. Ai chạm tiếp, được làm gì với nó?"* → **không ai được sửa nó**
**⚠ Cảnh giác:** ai đó chỉ mô tả được khối của mình
**Xong khi:** mỗi người kể được chặng **trước** và **sau** mình → **sang drill Git**

---

### 14:30–15:30 · DRILL GIT / PR

**Mục tiêu:** ai cũng tự tay đi hết chu trình, gồm **nhận** và **đưa** một `NEEDS_FIX`.

- Branch `chore/practice-<tên>` → sửa **chỉ** file luyện tập của mình → commit có ID → PR
- Cặp chéo: Tuấn Anh ↔ Hùng Anh · Quốc Khánh ↔ Đức Trung
- Reviewer **cố ý** yêu cầu 1 thay đổi → tác giả sửa → approve → leader squash merge 1 PR
- **KHÔNG chạm:** production · `docs/specs/v1.0/` · `management/spikes/`

**Chiếu:** `TEAM_WORKFLOW_QUICKSTART.md` §1–§2
**Hỏi:** *"Task của bạn cần sửa geometry contract mà người khác đang sửa. Làm gì?"* → **dừng và phối hợp**, đó là file integration-sensitive
**⚠ Cảnh giác:** *"cứ sửa rồi giải quyết conflict lúc merge"*
**Xong khi:** 4/4 đã nhận **và** đưa một `NEEDS_FIX` → **giải lao 15:30**

---

### 15:45–16:45 · OWNERSHIP / BRIEF CÁ NHÂN

**Mục tiêu:** ai cũng biết mình sở hữu gì **và** biết ranh giới quyền quyết định.

- Công bố **cả bốn người, cả hai trục** trước — công khai
- Nhấn: mỗi người Primary trên **cả hai** trục; mỗi khối có **Secondary Reviewer có tên**
- **Anti-bottleneck:** không chuyển ML khỏi Quốc Khánh, không chuyển Backend khỏi Đức Trung vì tốc độ
- 20 phút đọc brief riêng → mỗi người trình bày 5 phút

**Chiếu:** `PROJECT_ONE_PAGE_MAP.md` §4
**Hỏi:** 10 câu trong brief — **nghe kỹ nhất câu 7 và 8** (được tự quyết gì / phải qua DR gì)
**⚠ Cảnh giác:** mơ hồ ở câu 7–8 = người sẽ tự ý đổi thứ đã đóng băng
**Xong khi:** 4/4 trả lời được cả 10 câu → **sang cửa Shared-Core**

---

### 16:45–17:30 · CỬA SHARED-CORE

**Mục tiêu:** xác nhận hiểu biết end-to-end. **`PASS`** hoặc **`NEEDS_CLARIFICATION`**.

- **5 câu được chấm / người**, mỗi câu một nhóm:
  ① khoa học/leakage ② artifact ③ geometry ④ workflow/DR ⑤ theo vai trò
- **15 câu vẫn là ngân hàng** — xoay giữa 4 người để không ai nghe trước đáp án
- **Hỏi THÊM** khi: nghe như học thuộc · lập luận không rõ · xuất hiện hiểu nhầm nguy hiểm
- **Tiêu chuẩn `PASS` KHÔNG đổi** — thời gian tiết kiệm dùng để **đào sâu**, không để về sớm

**Chiếu:** `SHARED_CORE_CHECK.md` §Cách dùng
**Hỏi:** ưu tiên các câu in đậm **Q3 · Q4 · Q5 · Q9 · Q13 · Q14**
**⚠ Cảnh giác:** đọc lại đáp án mẫu → hỏi lại bằng tình huống khác *"nếu thay X bằng Y?"*
**Xong khi:** mỗi người có `PASS` hoặc `NEEDS_CLARIFICATION` ghi rõ → **sang Day-1 readiness**

---

### 17:30–18:00 · SẴN SÀNG DAY 1

**Mục tiêu:** điền signoff thật, xác nhận ranh giới, ai cũng biết việc đầu tiên ngày mai.

- Kiểm 8 mục: repo access · branch/PR · tooling · brief · spike TASK.md · reviewer · việc đầu tiên · leo thang
- Điền `DAY0_SIGNOFF.md` **bằng tay** — **không** điền sẵn `PASS`
- Ghi onboarding blocker vào §4 nếu cài tooling phát hiện vướng mắc
- Đọc to ranh giới Day 0 và chuỗi sau Day 0

**Chiếu:** `DAY0_SIGNOFF.md` · `DAY1_READINESS_CHECKLIST.md`
**Hỏi:** từng người *"việc đầu tiên của bạn sáng mai là gì?"* — đòi câu trả lời **cụ thể**
**Xong khi:** signoff đã ký, 0 spike `ACTIVE` → **kết thúc Day 0**

---
---

## PRE-READ CHECK — hỏi lúc 08:30

Ba file, tổng ~45 phút. **Không** yêu cầu đọc trước `TEAM_SHARED_CORE.md`.

| Đã đọc? | File |
|---|---|
| ☐ | `README.md` |
| ☐ | `PROJECT_ONE_PAGE_MAP.md` |
| ☐ | member brief **của chính mình** |

Ai chưa đọc → cho 15 phút đầu buổi đọc, đừng bỏ qua.

---

## DAY 0 BOUNDARY — đọc to đầu và cuối buổi

| ✅ ĐƯỢC | ❌ KHÔNG ĐƯỢC |
|---|---|
| đọc · thảo luận · xem spec/TASK.md | **tải dataset chính thức như công việc Spike D** |
| cài + cấu hình tooling | thu bằng chứng Spike D |
| kiểm quyền truy cập repo | hiện thực harness spike "thật" |
| học thư viện ở mức khái niệm | **đo trên thiết bị / đo transport cellular** |
| drill Git | thu bằng chứng geometry / ML |
| hỏi, làm rõ ownership | **tạo `RESULT.md`** |
| hoàn thành kiểm tra onboarding | **chuyển spike sang `ACTIVE`** |

**Vướng mắc khi cài tooling = onboarding blocker** (ghi `DAY0_SIGNOFF.md` §4), **không** phải spike execution giả.

---

## SHARED-CORE PASS PROTOCOL

```
5 câu được chấm/người  →  1 câu mỗi nhóm
   ① khoa học/leakage   ② artifact   ③ geometry   ④ workflow/DR   ⑤ vai trò

Hỏi THÊM khi:  học thuộc  ·  lập luận không rõ  ·  hiểu nhầm nguy hiểm

Kết quả:  PASS  hoặc  NEEDS_CLARIFICATION     (chỉ hai giá trị)

PASS = hiểu end-to-end đủ dùng, giải thích được VÌ SAO
       Tiêu chuẩn KHÔNG hạ. Giảm số câu chỉ là giảm TẢI.

NEEDS_CLARIFICATION → vẫn làm việc theo cặp trên shared-core (14 §2.1)
                      ghi rõ cần làm rõ gì · hẹn buổi ngắn trước/đầu Day 1
```

---

## DAY 0 SIGNOFF

```
12 cột × 4 người   ·   PASS / NEEDS_CLARIFICATION / NOT_CHECKED
Điền BẰNG TAY. KHÔNG điền sẵn PASS.

Chỉ tiêu:  4/4 Shared Core PASS  ·  4/4 Workflow READY
           4/4 hiểu nhiệm vụ cá nhân  ·  4/4 Repo/Env READY

Thực tế không đạt 4/4 → GHI ĐÚNG THỰC TẾ
   15 §1: "Plan follows reality. Never mark reality as complete
            just to match the schedule."

Xác nhận cuối: 0 spike ACTIVE · mọi started_at = null · 0 RESULT.md
               không tải dataset · spec 19/19 OK
```

---

## POST-DAY0 → BASELINE 30 NGÀY → DAY 1

```
Day 0 (2026-09-09)  kết thúc
        │
        ▼
DAY0_SIGNOFF.md ký          người thật ghi mức sẵn sàng thực
        │
        ▼   nếu READY, hoặc READY với các mục làm rõ ĐƯỢC KHAI LÀ KHÔNG CHẶN
LƯỢT RIÊNG của Project Control
   sinh baseline 30 ngày CÓ ĐIỀU KIỆN, dựa trên signoff Day-0 thực tế
        │
        ▼
LEADER CHẤP NHẬN baseline
        │
        ▼
DAY1_READINESS_CHECKLIST.md         cửa cuối
        │
        ▼
LEADER TUYÊN BỐ Execution Day 1  =  2026-09-10
        │
        ▼
spike → ACTIVE với started_at THẬT   ·   đồng hồ DR-001 bắt đầu
```

**C1, C4, C6 vẫn MỞ — và KHÔNG chặn việc tạo baseline.**
Chúng nằm **bên trong** baseline như **gate · dependency · điểm bất định · decision point · recovery trigger**.

**Baseline KHÔNG được âm thầm đóng băng:** Path A/B · mobile framework · DINOv2 recipe · ngân sách mesh · biểu diễn lỗi 3D · chiến lược transport · mọi quyết định phụ thuộc bằng chứng khác.

**Không lùi ngày `started_at`.**
