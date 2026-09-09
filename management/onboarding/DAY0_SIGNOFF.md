# DAY 0 SIGNOFF

**Ngày:** **2026-09-09 — DAY 0**
**Người chấm:** Phạm Tuấn Anh (Team Leader)
**Điền lúc:** 17:30–18:00

> ### ⚠ ĐIỀN BẰNG TAY, BỞI NGƯỜI THẬT
>
> **Không ô nào được điền sẵn `PASS`.** Mọi ô bắt đầu ở **`NOT_CHECKED`** và chỉ đổi khi leader đã thực sự kiểm.
>
> Giá trị cho phép: **`PASS`** · **`NEEDS_CLARIFICATION`** · **`NOT_CHECKED`**

---

## 1 · Bảng ký nhận

| # | Cột | Nội dung kiểm |
|---:|---|---|
| A | **Shared Core** | Qua cửa [SHARED_CORE_CHECK.md](SHARED_CORE_CHECK.md) — hiểu end-to-end, không phải học thuộc |
| B | **Git Workflow** | Đã tự tay hoàn thành bài drill 14:30 (branch → commit → PR → nhận NEEDS_FIX → sửa → approve) |
| C | **Project Pipeline** | Vẽ/kể lại được luồng Dataset → ML → artifact → ingestion → backend → mobile → review, và nói được ai đưa gì cho ai |
| D | **Own Vertical** | Nói rõ được mobile vertical của mình (V1/V2/V3/V4) và nó làm gì |
| E | **Own Technical Block** | Nói rõ được technical block của mình và nó nằm ở đâu trên pipeline |
| F | **Current Spike** | Nói được acceptance criteria và fail condition của spike hiện tại |
| G | **Evidence Workflow** | Biết `RESULT.md` ≠ `ACCEPTED`; nói được 4 bước nghiệm thu; biết ghi `NOT MEASURED` thay vì bịa |
| H | **Blocker Escalation** | Biết leo thang cho ai, khi nào, và khi nào phải mở DR thay vì tự sửa |
| I | **Repo Access** | Đã push được nhánh và mở PR thật trong bài drill |
| J | **Environment Ready** | Tooling local cần cho spike của mình đã cài và chạy thử được |
| K | **Overall Day-0 Status** | Tổng hợp — chỉ `PASS` khi A–J không còn mục `NEEDS_CLARIFICATION` chặn việc |
| L | **Clarifications Required** | Ghi cụ thể cần làm rõ điểm nào; để trống nếu không có |

---

### PHẠM TUẤN ANH — Leader · V1 2D · Integration/CI · Spike A

| Cột | Trạng thái |
|---|---|
| A · Shared Core | `NOT_CHECKED` |
| B · Git Workflow | `NOT_CHECKED` |
| C · Project Pipeline | `NOT_CHECKED` |
| D · Own Vertical (V1 Case Explorer / 2D MRI) | `NOT_CHECKED` |
| E · Own Technical Block (Integration / CI / cross-contract) | `NOT_CHECKED` |
| F · Current Spike (**Spike A**) | `NOT_CHECKED` |
| G · Evidence Workflow | `NOT_CHECKED` |
| H · Blocker Escalation | `NOT_CHECKED` |
| I · Repo Access | `NOT_CHECKED` |
| J · Environment Ready | `NOT_CHECKED` |
| **K · Overall Day-0 Status** | `NOT_CHECKED` |
| L · Clarifications Required | |

---

### VŨ HÙNG ANH — V2 3D · Imaging/Geometry · Spike B (→ F)

| Cột | Trạng thái |
|---|---|
| A · Shared Core | `NOT_CHECKED` |
| B · Git Workflow | `NOT_CHECKED` |
| C · Project Pipeline | `NOT_CHECKED` |
| D · Own Vertical (V2 3D / Spatial Error) | `NOT_CHECKED` |
| E · Own Technical Block (Imaging / Geometry / canonical 2D↔3D) | `NOT_CHECKED` |
| F · Current Spike (**Spike B**) | `NOT_CHECKED` |
| G · Evidence Workflow | `NOT_CHECKED` |
| H · Blocker Escalation | `NOT_CHECKED` |
| I · Repo Access | `NOT_CHECKED` |
| J · Environment Ready | `NOT_CHECKED` |
| **K · Overall Day-0 Status** | `NOT_CHECKED` |
| L · Clarifications Required | |

---

### BẾ QUỐC KHÁNH — V3 Cohort · ML Training/Evaluation · Spike D (P0) (→ C0/C1)

| Cột | Trạng thái |
|---|---|
| A · Shared Core | `NOT_CHECKED` |
| B · Git Workflow | `NOT_CHECKED` |
| C · Project Pipeline | `NOT_CHECKED` |
| D · Own Vertical (V3 Experiment / Cohort) | `NOT_CHECKED` |
| E · Own Technical Block (ML Training / Evaluation) | `NOT_CHECKED` |
| F · Current Spike (**Spike D — P0**) | `NOT_CHECKED` |
| G · Evidence Workflow | `NOT_CHECKED` |
| H · Blocker Escalation | `NOT_CHECKED` |
| I · Repo Access | `NOT_CHECKED` |
| J · Environment Ready | `NOT_CHECKED` |
| **K · Overall Day-0 Status** | `NOT_CHECKED` |
| L · Clarifications Required | |

**Kiểm thêm bắt buộc cho Spike D (P0)** — ghi kết quả vào cột L nếu chưa đạt:

| Mục | Trạng thái |
|---|---|
| Hiểu **§Day-one ordering** và vì sao thứ tự quan trọng | `NOT_CHECKED` |
| Nói đúng được **trigger DR-001** và thời điểm tính | `NOT_CHECKED` |
| Hiểu rằng **không được tự chọn Path A/B** | `NOT_CHECKED` |
| Hiểu **không bao giờ âm thầm thay dataset** | `NOT_CHECKED` |
| Đủ dung lượng đĩa trống cho gói dataset | `NOT_CHECKED` |
| Thư viện đọc NRRD đã cài, chạy thử được | `NOT_CHECKED` |

---

### NGUYỄN GIA ĐỨC TRUNG — V4 Review/Findings · Backend/Persistence/Ingestion · Spike E

| Cột | Trạng thái |
|---|---|
| A · Shared Core | `NOT_CHECKED` |
| B · Git Workflow | `NOT_CHECKED` |
| C · Project Pipeline | `NOT_CHECKED` |
| D · Own Vertical (V4 Review / Findings) | `NOT_CHECKED` |
| E · Own Technical Block (Backend / Persistence / Ingestion) | `NOT_CHECKED` |
| F · Current Spike (**Spike E**) | `NOT_CHECKED` |
| G · Evidence Workflow | `NOT_CHECKED` |
| H · Blocker Escalation | `NOT_CHECKED` |
| I · Repo Access | `NOT_CHECKED` |
| J · Environment Ready | `NOT_CHECKED` |
| **K · Overall Day-0 Status** | `NOT_CHECKED` |
| L · Clarifications Required | |

**Kiểm thêm bắt buộc cho Spike E** — ghi kết quả vào cột L nếu chưa đạt:

| Mục | Trạng thái |
|---|---|
| Hiểu **LAN KHÔNG thoả bằng chứng nghiệm thu Spike E** | `NOT_CHECKED` |
| Nói được **hai hợp đồng ingestion** khác nhau ở đâu | `NOT_CHECKED` |
| Hiểu **scope firewall** trên fallback | `NOT_CHECKED` |
| Mac mini bật được, truy cập được | `NOT_CHECKED` |
| Tailscale cài được trên cả máy tính và điện thoại | `NOT_CHECKED` |

---

## 2 · Chỉ tiêu mong đợi

| Mục | Chỉ tiêu |
|---|---|
| Shared Core | **4 / 4 `PASS`** |
| Workflow (Git + Evidence) | **4 / 4 READY** |
| Hiểu nhiệm vụ cá nhân (D + E + F) | **4 / 4 READY** |
| Repo / Environment (I + J) | **4 / 4 READY** |

> **Đây là CHỈ TIÊU, không phải giá trị điền sẵn.** Giá trị thực do người thật ghi. Nếu thực tế không đạt 4/4, **ghi đúng thực tế** — `15` §1: *"Plan follows reality. Never mark reality as complete just to match the schedule."*

### Nếu ai đó `NEEDS_CLARIFICATION` ở Shared Core

Không sao, đó là mục đích của cửa này. `14` §2.1:

> Thành viên chưa qua cửa **vẫn làm việc theo cặp trên shared-core**, chưa nhận quyền sở hữu sâu độc lập.

Ghi rõ cần làm rõ điểm nào vào cột **L**, và hẹn một buổi làm rõ ngắn **trước hoặc đầu Execution Day 1**.

---

## 3 · Xác nhận ranh giới Day 0

Leader xác nhận **cuối Day 0**:

| Mục | Trạng thái |
|---|---|
| **Không spike nào ở `ACTIVE`** | `NOT_CHECKED` |
| **Mọi `started_at` vẫn là `null`** | `NOT_CHECKED` |
| **Không `RESULT.md` nào được tạo** | `NOT_CHECKED` |
| **Không tải dataset chính thức như công việc Spike D** | `NOT_CHECKED` |
| **Không `DATASET_AUDIT.md`** | `NOT_CHECKED` |
| **Không thu bằng chứng thiết bị / mạng / ML / geometry** | `NOT_CHECKED` |
| **Không tạo module production** | `NOT_CHECKED` |
| **`docs/specs/v1.0/` không bị sửa** (checksum 19/19 OK) | `NOT_CHECKED` |
| **Không `MASTER_PLAN_30_DAYS.md`** | `NOT_CHECKED` |
| Bài drill Git chỉ chạm file luyện tập, **không** chạm spec/spike/production | `NOT_CHECKED` |

---

## 4 · Onboarding blocker phát hiện trong Day 0

Ghi lại các vướng mắc phát hiện khi cài tooling / kiểm truy cập. **Đây là onboarding blocker, KHÔNG phải spike execution.**

| # | Người | Vướng mắc | Ảnh hưởng tới | Hành động | Hạn xử lý |
|---:|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

## 5 · KÝ NHẬN CỦA LEADER

| Mục | Nội dung |
|---|---|
| **Ngày Day 0 thực tế** | 2026-09-09 |
| **Giờ bắt đầu / kết thúc thực tế** | |
| **Số người có mặt đủ ngày** | ___ / 4 |
| **Shared Core `PASS`** | ___ / 4 |
| **Workflow READY** | ___ / 4 |
| **Hiểu nhiệm vụ cá nhân READY** | ___ / 4 |
| **Repo / Environment READY** | ___ / 4 |
| **Onboarding blocker còn mở** | ___ |
| **Có blocker nào chặn việc bắt đầu Execution Day 1?** | ☐ Không ☐ Có → ghi chi tiết bên dưới |

**Chi tiết blocker chặn Day 1 (nếu có):**

```
(để trống nếu không có)
```

**Kết luận của leader về việc bắt đầu Execution Day 1 (2026-09-10):**

☐ **SẴN SÀNG** — chuyển sang [DAY1_READINESS_CHECKLIST.md](DAY1_READINESS_CHECKLIST.md)
☐ **SẴN SÀNG CÓ ĐIỀU KIỆN** — cần làm rõ các mục ghi ở cột L, xử lý đầu Day 1
☐ **CHƯA SẴN SÀNG** — nêu lý do và hành động khắc phục

**Chữ ký / xác nhận:**

```
Phạm Tuấn Anh — Team Leader

Chữ ký: ______________________     Ngày: 2026-09-09     Giờ: ________
```

---

> **Nhắc cuối:** Execution Day 1 (**2026-09-10**) **chỉ bắt đầu khi leader tuyên bố rõ ràng**. Đồng hồ trigger execution-day của DR-001 bắt đầu **từ lúc đó**. **Không lùi ngày `started_at`.**
