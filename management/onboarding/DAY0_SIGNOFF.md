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

## 0 · TU CHÍNH BÀI DRILL GIT — ghi 2026-09-10, leader phê duyệt

**Phạm vi hẹp: chỉ áp dụng cho tiêu chí của bài drill Git Day 0.** Không đụng tới bất kỳ tiêu chí nào khác,
không đụng spec đóng băng.

Bản gốc của bài drill — [`DAY0_KICKOFF_RUNBOOK.md`](DAY0_KICKOFF_RUNBOOK.md) bước 6 và mục "Kết quả mong đợi
chính xác", cùng `A4` trong [`DAY1_READINESS_CHECKLIST.md`](DAY1_READINESS_CHECKLIST.md) — yêu cầu **mọi
thành viên phải NHẬN một `NEEDS_FIX`** và **ĐƯA một `NEEDS_FIX`** cho người khác.

**Yêu cầu đó được thay thế**, vì ép buộc phải có một lần từ chối sẽ tạo ra **bằng chứng giả**: reviewer
không tìm thấy lỗi thật sẽ bịa ra một lỗi, hoặc tệ hơn là **tự tạo lỗi trên nhánh của tác giả rồi yêu cầu
sửa chính lỗi mình vừa cấy**. Điều này đã thực sự xảy ra một lần trong Day 0.

### Luật thay thế

| # | Luật |
|---:|---|
| 1 | Reviewer chỉ `CHANGES_REQUESTED` / `NEEDS_FIX` khi **có lỗi thật** — lỗi tồn tại trong PR đúng như tác giả nộp |
| 2 | PR đúng ngay từ đầu thì **`APPROVE`** thẳng. Đó là một lượt drill **hoàn chỉnh và thành công** |
| 3 | **Không ai được cấy lỗi**, push lỗi vào nhánh người khác, hay bịa review comment cho khớp checklist |
| 4 | Bài drill được chấm trên việc **tham gia hợp lệ** vào chu trình PR/review: mở PR của mình · được pair review · review PR của pair · squash merge |

### Điều KHÔNG thay đổi

- **Sự kiện lịch sử giữ nguyên.** Các `CHANGES_REQUESTED` đã xảy ra vẫn là sự kiện thật và vẫn được ghi
  đúng như đã xảy ra.
- **Không bịa ngược.** Không ở đâu được ghi rằng một `NEEDS_FIX` đã xảy ra nếu nó không xảy ra.
- **Không ai `PASS` vì có tu chính này.** Tu chính chỉ đổi *tiêu chí chấm*, không tự chấm hộ ai. Cột B của
  từng người vẫn cần hành động thật của chính người đó.
- Bản runbook Day 0 **không bị viết lại** — nó là bản ghi lịch sử của điều đã được chỉ đạo hôm đó. Tu chính
  này đứng đè lên nó.

**Áp dụng cho:** `A4` của `DAY1_READINESS_CHECKLIST.md` và cột **B** của bảng dưới đây.

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
| A · Shared Core | `PASS` |
| B · Git Workflow | `NOT_CHECKED` |
| C · Project Pipeline | `PASS` |
| D · Own Vertical (V1 Case Explorer / 2D MRI) | `PASS` |
| E · Own Technical Block (Integration / CI / cross-contract) | `PASS` |
| F · Current Spike (**Spike A**) | `PASS` |
| G · Evidence Workflow | `PASS` |
| H · Blocker Escalation | `PASS` |
| I · Repo Access | `PASS` |
| J · Environment Ready | `PASS` |
| **K · Overall Day-0 Status** | `NOT_CHECKED` |
| L · Clarifications Required | **Git drill — carried into Execution Day 1.** *Done and verified on Day 0:* branch `chore/practice-tuan-anh`; the leader's commit `262a549` carrying the `PRACTICE-01` ID; PR **#1** opened; a real `CHANGES_REQUESTED` from `scalliontor` at 21:17; the fix `50b3d10`; and the leader's own `CHANGES_REQUESTED` on Vũ Hùng Anh's PR **#3** at 22:37. *Outstanding, because Vũ Hùng Anh ran out of time on Day 0:* his `APPROVE` on #1, his fix on #3, the leader's `APPROVE` on #3, and the squash merge of both. Tracked as **carry-over item 1** in `DAY1_READINESS_CHECKLIST.md`; gate **A4** there cannot pass until it closes. **Two things this record must not smooth over.** (1) The `CHANGES_REQUESTED` on #1 pointed at wording the reviewer had himself introduced by pushing `9d02c1e` into the author's branch five minutes earlier; the genuine defect — the missing `Reviewer` field required by `practice/README.md` — went uncaught, and the fix `50b3d10` closed both. (2) Execution mechanics: the leader personally performed branch, edit, commit, push and PR creation (`262a549`, 19:23); the later fix commit and the review submission on #3 were executed on his behalf by Project Control at his explicit instruction. |

**Basis for A · C · D · E · F · G · H** — the leader completed an **interactive Day-0 knowledge gate on
2026-09-09** covering five areas:

1. scientific validity / data leakage
2. artifact provenance
3. geometry
4. governance / Gate / DR
5. ownership boundaries

A **geometry misconception surfaced during the gate and was corrected before pass** — the gate was not a
recitation check, and it was not passed on the first answer to that topic.

**Basis for I · J** — verified mechanically on 2026-09-09 through the GitHub API: a real push to
`origin/chore/practice-tuan-anh` and PR **#1** opened against `main`; `git` and `gh` authenticated and
working, repository role `admin`/`push`. Mobile tooling is deliberately **not** installed — it waits on
`GATE-MOB-01`.

**Why K is not `PASS`** — column B is a **mandatory** Day-0 requirement and it is open. A mandatory Day-0
requirement is not deferred into Execution Day 1 while readiness is declared, so the leader's Day-0
sign-off stands **INCOMPLETE** until the cross-reviewed drill genuinely happens.

**No operational blocker was found** — repository access, tooling and ownership are all satisfied. That is
**not** a declaration of readiness for Execution Day 1. **Readiness is NOT declared** while column B is
open, and this record must not be read as declaring it.

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
| **Không spike nào ở `ACTIVE`** | `PASS` — repo-verified |
| **Mọi `started_at` vẫn là `null`** | `PASS` — repo-verified (7/7) |
| **Không `RESULT.md` nào được tạo** | `PASS` — repo-verified |
| **Không tải dataset chính thức như công việc Spike D** | `PASS` — **leader-attested** |
| **Không `DATASET_AUDIT.md`** | `PASS` — repo-verified |
| **Không thu bằng chứng thiết bị / mạng / ML / geometry** | `PASS` — **leader-attested** |
| **Không tạo module production** | `PASS` — repo-verified (tracked tree) + **leader-attested** (uncommitted work) |
| **`docs/specs/v1.0/` không bị sửa** (checksum 19/19 OK) | `PASS` — repo-verified, 19/19 OK |
| **Không `MASTER_PLAN_30_DAYS.md`** | `PASS` — repo-verified |
| Bài drill Git chỉ chạm file luyện tập, **không** chạm spec/spike/production | `PASS` — repo-verified, PR #1 diff = 1 file |

> ### Hai loại bằng chứng, không trộn lẫn
>
> **`repo-verified`** — chứng minh trực tiếp từ repository: `SPIKE_PHASE_STATE.yaml`, `sha256sum -c
> SPEC_MANIFEST_SHA256.txt`, quét filesystem, diff cây tracked so với `d5aa460`, và `git diff` phạm vi của
> PR #1.
>
> **`leader-attested`** — **không** chứng minh được từ repository, vì đó là hoạt động của con người ngoài
> Git. Việc repo trống **không** phải bằng chứng là không ai tải dataset hay không ai đo máy. Ba hàng này
> được ghi trên cơ sở **Phạm Tuấn Anh đã hỏi trực tiếp cả ba thành viên trong ngày 2026-09-09 và xác nhận
> không ai vượt ranh giới** — không phải trên cơ sở suy diễn từ repository.

---

## 4 · Onboarding blocker phát hiện trong Day 0

Ghi lại các vướng mắc phát hiện khi cài tooling / kiểm truy cập. **Đây là onboarding blocker, KHÔNG phải spike execution.**

| # | Người | Vướng mắc | Ảnh hưởng tới | Hành động | Hạn xử lý |
|---:|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

**Phạm Tuấn Anh — không có onboarding blocker.** Quyền truy cập repo đã đủ (`admin`/`push`), cả ba lời mời
cho thành viên đã được nhận, `git` và `gh` hoạt động. Mục drill Git còn mở được theo dõi ở **cột L**, không
ghi ở đây — nó không phải vướng mắc tooling hay truy cập.

Ba mục dưới đây **không** phải blocker và **không** chặn Execution Day 1; chúng là **việc follow-up
Integration/CI của Day 1** thuộc technical block của leader (`NFR-MAINT-001`/`002`/`003`):

| # | Mục | Vì sao chưa làm hôm nay |
|---:|---|---|
| 1 | Chưa có `.github/` — không có PR template, không có CI skeleton | Day 0 chỉ cài tooling và drill; dựng CI là việc của block Integration/CI trên Execution Day 1 |
| 2 | `delete_branch_on_merge = false` trên repository | Thiết lập tiện dụng, không phải yêu cầu Day 0 |
| 3 | Không có branch protection trên `main` | Cần quyết định chính sách review trước khi bật, không phải việc Day 0 |

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
