# DAY 01 STATUS — 2026-09-10

> **Người ghi file này: Project Control (leader vận hành) — DUY NHẤT.**
>
> Thành viên **không** sửa file này từ nhánh của mình. Bạn tạo ra sự thật bằng **nhánh spike, file
> evidence, commit, PR và reviewer state**; Project Control phản chiếu sự thật **đã verify** vào đây.
> Nhờ vậy dashboard không bao giờ hiển thị trạng thái tự khai.

---

## PHA HIỆN TẠI

```
PHASE B — EXECUTION            ĐANG CHẠY
READY: YES (có điều kiện)
Cutover: 2026-09-11 12:00 +07:00   -> day01/DAY01_CUTOVER_RECORD.md
Hôm nay: DAY 2                 Day 30 = 2026-10-09 (KHÔNG lùi)
Đồng hồ DR-001: ĐANG CHẠY      trigger đánh giá CUỐI HÔM NAY (DR-001a)
Buffer: 1 / 2 ngày             Day 1 trượt, ăn vào buffer
```

> ⚠ **Buffer còn một ngày cho 29 ngày còn lại.** Mất thêm một ngày là buffer bằng 0 và `15` §18
> recovery trigger 2 kích hoạt.

**Leader đã chốt ngày:** `Execution Day 1 = 2026-09-10`, `Day 30 = 2026-10-09`. Ngày đã chốt **không
đồng nghĩa** với đã tuyên bố — đồng hồ DR-001 chỉ chạy từ lúc leader tuyên bố và
`DAY01_CUTOVER_RECORD.md` được commit.

**Khởi tạo từ trạng thái đã verify lúc lập file.** Mọi mốc thời gian thật sẽ được ghi khi nó thực sự xảy
ra — file này không chứa giờ dự kiến.

---

## 1 · Việc còn chặn READY

Đối chiếu cửa `R1`–`R9` trong [`DAY01_RUNBOOK.md`](DAY01_RUNBOOK.md) §2.

| # | Mục | Trạng thái | Ai gỡ |
|---:|---|---|---|
| **R1** | Bốn PR practice merged | **2/4** — #1 và #3 đã merged; #4 còn `open`; PR của Trung **chưa tồn tại** | Khánh + Trung |
| **R2** | Mỗi người tham gia hợp lệ vào chu trình review | **CHƯA** — **không PR nào trong drill có `APPROVED`**; xem §2.1 | cả bốn |
| **R3** | `DAY0_SIGNOFF.md` cột K = `PASS` ×4 | **CHƯA** — 1/4 điền một phần, 3/4 trống | leader chấm |
| **R4** | §5 tổng hợp điền và ký | **CHƯA** | leader |
| **R5** | `DAY1_READINESS_CHECKLIST.md` A/B/B.1/C/D | **MỘT PHẦN** — **Phần B 12/12 `PASS`**, **Phần C 6/6 `PASS`**. **Phần A vẫn 0/10** — chờ Khánh + Trung. Phần D và G chỉ điền tại cutover | Project Control ✔ / **hai bạn** |
| **R6** | `MASTER_PLAN_30_DAYS.md` tồn tại và được chấp nhận | **✅ ĐẠT** — sinh 2026-09-10, leader chấp nhận §14 | — |
| **R7** | Baseline không đóng băng gì phụ thuộc bằng chứng | **✅ ĐẠT** — 4 phép kiểm §B.1 chạy bằng máy, đều đạt; kết quả ghi ở baseline §14 | — |
| **R8** | Trạng thái spike đúng Phần C | **ĐẠT** — 6 `PREPARED` + 1 `BLOCKED`, 7 × `started_at: null` | — |
| **R9** | Spec 19/19 · không `RESULT.md` · không `DATASET_AUDIT.md` · không `data/manifests/` | **ĐẠT** | — |

**Đường tới hạn của Phase A:** `Trung mở PR` → `Trung review #4` → `Khánh merge` → ... Trung đang chặn
**ba** cột B: của Khánh, của chính bạn ấy, và gián tiếp cả tổng hợp 4/4.

---

## 2 · Nợ Day 0 — trạng thái PR

| PR | Nhánh | Tác giả | Trạng thái | Còn thiếu gì |
|---|---|---|---|---|
| **#1** | `chore/practice-tuan-anh` | Phạm Tuấn Anh | **merged** `b28921f` 13:16 | — |
| **#3** | `chore/practice-hung-anh` | Vũ Hùng Anh | **merged** `01ab6a0` 13:14 | **dòng `Reviewer:` vẫn thiếu trên `main`** — `CHANGES_REQUESTED` chưa được xử lý trước khi merge |
| **#4** | `chore/practice-quoc-khanh` | Bế Quốc Khánh | `open`, 1 commit | **Review của Nguyễn Gia Đức Trung** — chưa có review nào |
| — | `chore/practice-duc-trung` | Nguyễn Gia Đức Trung | **chưa tồn tại** | tạo file, nhánh, push, mở PR |
| **#5** | `docs/day01-phase-a-control` | Project Control | `open` | `APPROVE` của Vũ Hùng Anh — dashboard Day-01 chưa lên được cho tới khi merge |

**PR #2** (`docs: add 3D mesh UI and FPS reference`) đã merged — `2096a35`. Không thuộc drill.

### 2.1 · Ghi nhận cách #1 và #3 được merge

Ghi lại đúng sự việc, không đánh giá con người, vì nó ảnh hưởng trực tiếp tới `R2`:

- Cả **#1** và **#3** được merge bởi `scalliontor` lúc 13:14 và 13:16 ngày 2026-09-10.
- **Không PR nào có review `APPROVED`.** #1 chỉ có `CHANGES_REQUESTED` của `scalliontor`; #3 chỉ có
  `CHANGES_REQUESTED` của `Drake-Phamta`.
- **#3 được merge đè lên `CHANGES_REQUESTED` đang mở, bởi chính tác giả**, và thay đổi được yêu cầu
  **chưa được thực hiện** — `PRACTICE_VU_HUNG_ANH.md` trên `main` vẫn thiếu dòng `Reviewer:`.
- Không dùng squash: #3 tạo merge commit `01ab6a0`; #1 đưa cả ba commit vào `main` riêng lẻ.

Điều này lệch với `TEAM_WORKFLOW_QUICKSTART.md` §2 luật **3** (*cần ít nhất một reviewer được chỉ định
approve mới merge được*) và luật **4** (*squash merge là mặc định*), nguồn `15` §8.

**PR #5 (`365e53e`) cũng merge không có `APPROVED` — ghi rõ hoàn cảnh:**

- PR #5 được request review cho `scalliontor` lúc 2026-09-10, và **không có review nào được submit**.
- Leader báo rằng **Vũ Hùng Anh đã đọc PR và đồng ý bằng lời**, nhưng **không submit được từ máy của mình
  do máy đang có sự cố**.
- Leader chỉ đạo merge vì cả nhóm đang không có bảng việc Day-01 nào để làm việc.
- **Project Control đã từ chối submit review dưới tài khoản `scalliontor`.** Một dòng
  *"scalliontor approved"* do người khác bấm sẽ là chữ ký giả trong bản ghi công khai. Thay vào đó PR được
  merge **dưới tài khoản leader**, và sự đồng ý bằng lời của Vũ Hùng Anh được ghi ở đây đúng như nó là —
  **một lời đồng ý, không phải một review đã submit**.

**Vì vậy, tính tới lúc này: cả ba PR đã merge — #1, #3, #5 — đều không có review `APPROVED`.**
`R2` **CHƯA THOẢ**, và không được chấm cao hơn chỉ vì các PR đã đóng.

**Hệ quả cho `R2`:** tính đến lúc này **không lượt drill nào có `APPROVED`**, nên `R2` chưa thoả — kể cả
với hai PR đã merged. `R2` không được chấm cao hơn thực tế chỉ vì PR đã đóng.

**Chờ leader quyết:** (a) giữ chuẩn — Hùng Anh mở PR nhỏ bổ sung dòng `Reviewer:`, leader approve, và
Hùng Anh approve PR #5; hoặc (b) leader áp dụng cùng thực tế đã dùng cho #1/#3 cho PR #5, và bản ghi nêu
rõ cả ba PR đều merge không qua approval.

---

## 3 · Bốn thành viên

### Phạm Tuấn Anh — Leader / Project Control · Spike A

| | |
|---|---|
| **NOW** | PR #1 đã merged. Còn: đốc Trung · quyết cách xử lý #1/#3 merge không approval (§2.1) · hoàn tất sign-off. Prep tooling Android **được**, dán nhãn `PREP` |
| **SAU READY** | Chụp profile DR-006 → nhả máy → harness Spike A |
| **Reviewer của mình** | Vũ Hùng Anh (hàng đợi vị trí 2, sau Spike D) |
| **Mình review** | Spike B → Spike E |
| **Chặn bởi** | Trung, Hùng Anh |
| **Task packet** | [`tasks/DAY01_PHAM_TUAN_ANH.md`](tasks/DAY01_PHAM_TUAN_ANH.md) |

### Vũ Hùng Anh — Spike B · Imaging/Geometry

| | |
|---|---|
| **NOW** | PR #3 đã merged nhưng **dòng `Reviewer:` vẫn thiếu trên `main`** → mở PR nhỏ bổ sung · **`APPROVE` PR #5** để dashboard Day-01 lên được. Prep toolchain mesh/render **được**, dán nhãn `PREP` |
| **SAU READY** | Fixture canonical DR-008a → **công bố format sớm** → ≥3 mức decimation → đo máy sau cùng |
| **Reviewer của mình** | Phạm Tuấn Anh (vị trí 1) |
| **Mình review** | **Spike D → Spike A** — D ưu tiên vì là P0 |
| **Chặn bởi** | — |
| **Task packet** | [`tasks/DAY01_VU_HUNG_ANH.md`](tasks/DAY01_VU_HUNG_ANH.md) |

### Bế Quốc Khánh — Spike D · **P0 · critical path**

| | |
|---|---|
| **NOW** | **Chờ Trung review PR #4.** Trong lúc chờ: prep tooling NRRD trên file **tự sinh**, dán nhãn `PREP` |
| **SAU READY** | §Day-one bước 1–5 → **đánh giá trigger DR-001 và báo leader trước cuối ngày** |
| **Reviewer của mình** | Vũ Hùng Anh (vị trí 1 — D là P0) |
| **Mình review** | Nguyễn Gia Đức Trung (PR practice) |
| **Chặn bởi** | **Nguyễn Gia Đức Trung** |
| **Task packet** | [`tasks/DAY01_BE_QUOC_KHANH.md`](tasks/DAY01_BE_QUOC_KHANH.md) |

### Nguyễn Gia Đức Trung — Spike E · **đang chặn ba người**

| | |
|---|---|
| **NOW** | ① điền file practice · ② nhánh + push + mở PR · ③ **review PR #4 của Khánh**. Ba việc này **trước** mọi việc Spike E |
| **SONG SONG** | Sau khi ①–③ đã chạy: prep Mac mini stub + ZeroTier + debug kết nối, tất cả dán nhãn `PREP` |
| **SAU READY** | Cellular 5G thật + overlay → **phân bố** latency → ghi direct-vs-relayed từng phép đo |
| **Reviewer của mình** | Bế Quốc Khánh |
| **Mình review** | **Bế Quốc Khánh — PR #4** |
| **Chặn bởi** | — |
| **Task packet** | [`tasks/DAY01_NGUYEN_GIA_DUC_TRUNG.md`](tasks/DAY01_NGUYEN_GIA_DUC_TRUNG.md) |

---

## 4 · Execution frontier — trạng thái spike

Đọc từ [`../spikes/SPIKE_PHASE_STATE.yaml`](../spikes/SPIKE_PHASE_STATE.yaml).

| Spike | Chủ sở hữu | Trạng thái | `started_at` | Ghi chú |
|---|---|---|---|---|
| **SPIKE_D** | Bế Quốc Khánh | **`ACTIVE`** | `2026-09-11T12:00+07:00` | **P0**, critical path `D → C1/C6 → SPIKE_C1 → GATE-ML-01` |
| **SPIKE_A** | Phạm Tuấn Anh | **`ACTIVE`** | `2026-09-11T12:00+07:00` | Nạp `GATE-MOB-01` cùng B |
| **SPIKE_B** | Vũ Hùng Anh | **`ACTIVE`** | `2026-09-11T12:00+07:00` | Nạp `GATE-MOB-01` + DR-008c |
| **SPIKE_E** | Nguyễn Gia Đức Trung | **`ACTIVE`** | `2026-09-11T12:00+07:00` | Nạp `ADR-ART-001` |
| **SPIKE_C0** | Bế Quốc Khánh | `PREPARED` | `null` | **Không** thành primary thứ hai |
| **SPIKE_F** | Vũ Hùng Anh | `PREPARED` | `null` | **Không** thành primary thứ hai |
| **SPIKE_C1** | Bế Quốc Khánh | **`BLOCKED`** | `null` | `blocked_by: SPIKE_D` |

`ACTIVE = 4` (D·A·B·E) · `PREPARED = 2` (C0·F) · `BLOCKED = 1` (C1) · `ACCEPTED = 0` · `evidence_present = false` ×7.

---

## 5 · 📱 Galaxy A17 5G

```
NGƯỜI GIỮ HIỆN TẠI:  Phạm Tuấn Anh — GATE 1
ĐANG LÀM:            chụp profile thiết bị DR-006
ĐIỀU KIỆN NHẢ:       profile committed + baseline A9/A10 captured
NGƯỜI KẾ TIẾP:       Nguyễn Gia Đức Trung (GATE 2) — vào khi stub tới được và ZeroTier đã lên
```

Trong `GATE 0`, máy **được** dùng để cài và cấu hình tooling. Mọi thứ capture ở đây là
`PREP / DIAGNOSTIC ONLY` và **bị loại trừ đích danh** khỏi acceptance dataset.

**Hàng đợi đo dự kiến sau READY — `A → E → B`:**

| Thứ tự | Người | Cổng vào | Cổng nhả |
|---:|---|---|---|
| 1 | Phạm Tuấn Anh | commit chuyển trạng thái đã land | profile DR-006 committed + baseline A9/A10 captured |
| 2 | Nguyễn Gia Đức Trung | stub tới được **và** overlay đã lên | phân bố latency captured + direct-vs-relayed ghi đủ |
| 3 | Vũ Hùng Anh | ≥3 mức decimation dựng xong + harness picking chạy desktop | đo FPS/stall/picking xong |

> ⚠ **`A → E → B` là TU CHÍNH.** Bản gốc `WIP-CONFLICT-02` và `DAY1_READINESS_CHECKLIST.md` PHẦN E ghi
> **`A → B → E`**. Xem [`DAY01_RUNBOOK.md`](DAY01_RUNBOOK.md) §4.3.

**Không đo thì không giữ máy.**

---

## 6 · Hàng đợi review

Theo **sự kiện**, không theo giờ. Một item `REVIEWING` mỗi người, không preempt.

| Reviewer | Hàng đợi | Đang `REVIEWING` | Đang `QUEUED` |
|---|---|---|---|
| **Vũ Hùng Anh** | `Spike D → Spike A` | — | — |
| **Phạm Tuấn Anh** | `Spike B → Spike E` | — | — |

Chưa có gì trong hàng đợi vì chưa spike nào chạy. Một item chỉ vào hàng khi chủ sở hữu đã commit **gói
evidence tối thiểu** và đặt nó thành `EVIDENCE_READY`.

---

## 7 · Evidence đã có

| Spike | Acceptance evidence |
|---|---|
| SPIKE_D | **chưa có** |
| SPIKE_A | **chưa có** |
| SPIKE_B | **chưa có** |
| SPIKE_E | **chưa có** |
| SPIKE_C0 · SPIKE_F · SPIKE_C1 | **chưa có** |

Không `RESULT.md` nào tồn tại. Không `DATASET_AUDIT.md`. Không `data/manifests/`.

**Artifact quản lý đã có** (không phải acceptance evidence, nhưng là deliverable của Project Control):

| Artifact | Trạng thái |
|---|---|
| `../MASTER_PLAN_30_DAYS.md` | **đã sinh và được leader chấp nhận** 2026-09-10 §14 |
| `../PROJECT_STATE.yaml` | **đã sinh** — bắt buộc theo `15` §4, trước đó thiếu. `day: 0`, `forecast.confidence: null` |
| `../onboarding/DAY1_READINESS_CHECKLIST.md` | Phần B **12/12 `PASS`**, Phần C **6/6 `PASS`**, Phần A **0/10** |

> Output của giai đoạn prep **không** phải acceptance evidence và không bao giờ được chuyển thành
> acceptance evidence bằng cách gỡ nhãn.

---

## 8 · Blocker đang mở

| # | Blocker | Chủ | Hành động kế tiếp |
|---:|---|---|---|
| 1 | PR practice của Nguyễn Gia Đức Trung chưa tồn tại | Nguyễn Gia Đức Trung | tạo file → nhánh → push → PR |
| 2 | PR #4 chưa có review | Nguyễn Gia Đức Trung | review trung thực: approve nếu đúng, chỉ request changes khi có lỗi thật |
| 3 | `PRACTICE_VU_HUNG_ANH.md` trên `main` thiếu dòng `Reviewer:` — merged khi `CHANGES_REQUESTED` còn mở | Vũ Hùng Anh | mở PR nhỏ bổ sung field, leader approve |
| 4 | **PR #5 chưa có `APPROVED`** → dashboard Day-01 chưa lên được, cả nhóm chưa có bảng việc | Vũ Hùng Anh | `gh pr review 5 --approve` |
| 5 | **`R2` chưa thoả** — chưa lượt drill nào có `APPROVED` (§2.1) | leader quyết | giữ chuẩn, hoặc ghi nhận thực tế đã áp dụng |
| ~~6~~ | ~~Baseline 30 ngày~~ | — | **ĐÃ ĐÓNG** 2026-09-10 — baseline sinh và được chấp nhận, `R6` + `R7` đạt |

**Không có operational blocker nào chặn việc chuẩn bị.** Cả bốn người đều có việc prep làm được ngay.

---

## 9 · KHÔNG LÀM HÔM NAY

Không spike nào `ACTIVE` trước cutover · không `started_at` thật · không acceptance measurement trước
cutover · không **Spike C1** · không đóng băng **DINOv2 recipe** · không đóng băng **mobile framework** ·
không dùng **LAN/Wi-Fi trường** làm acceptance evidence cho Spike E · không **slice-level split** · không
chọn Path A/B · không sửa `docs/specs/v1.0/**` · không commit dataset bytes, secret hay binary lớn ·
không **cấy lỗi** để có `NEEDS_FIX` · không sửa central state từ nhánh thành viên.

Toàn văn: [`DAY01_RUNBOOK.md`](DAY01_RUNBOOK.md) §10.
