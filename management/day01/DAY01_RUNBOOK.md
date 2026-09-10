# DAY 01 RUNBOOK — 2026-09-10

> # ⚠ TRẠNG THÁI HIỆN TẠI: **PHASE A — ĐÓNG NỢ DAY 0 / CHUẨN BỊ**
>
> **`READY: NO`** · **Execution Day 1 CHƯA bắt đầu** · **Chưa spike nào `ACTIVE`** ·
> **Chưa `started_at` nào được ghi** · **Đồng hồ DR-001 CHƯA chạy**.
>
> Ngày 10/09 trên lịch **không** làm Execution Day 1 tự bắt đầu. Chỉ **tuyên bố của leader** mới làm điều
> đó, và tuyên bố chỉ hợp lệ khi cửa `R1`–`R9` bên dưới đã qua.

**Chủ sở hữu file này:** Project Control (leader vận hành).
**Nguồn thẩm quyền:** `docs/specs/v1.0/**` → `../readiness/READINESS_REVIEW_RESOLUTION.md` §10–§11 →
`../spikes/SPIKE_PHASE_STATE.yaml` → `DAY01_CUTOVER_RECORD.md` (khi tồn tại) → `DAY01_STATUS.md`.

---

## 1 · Vòng đời của ngày hôm nay

```text
PHASE A — ĐÓNG NỢ DAY 0 / CHUẨN BỊ            ← ĐANG Ở ĐÂY
    Central state không đổi. Không spike ACTIVE. Không started_at.
    KHÔNG acceptance measurement. Chuẩn bị thì ĐƯỢC (xem §3).
        │
        ▼
KIỂM CỬA R1–R9                                 ← bằng máy, không bằng lời
        │
        ▼
════════ CUTOVER ════════
    Leader tuyên bố. Project Control TẠO và commit DAY01_CUTOVER_RECORD.md.
    Commit này đứng MỘT MÌNH và đi TRƯỚC mọi thay đổi trạng thái.
        │
        ▼
PHASE B — EXECUTION DAY 1
    MỘT commit chuyển trạng thái tập trung, do Project Control thực hiện.
    D/A/B/E → ACTIVE. Bốn spike chạy. Máy đi A → E → B. Review theo sự kiện.
        │
        ▼
PHASE C — CUỐI NGÀY
    Evidence thật đầu tiên. DAY01_EOD_REVIEW.md. Quyết định Day 2.
```

---

## 2 · Cửa READY — `R1`–`R9`

Leader **chỉ được** tuyên bố Execution Day 1 khi **tất cả** các mục sau đúng, và mỗi mục được kiểm bằng
lệnh hoặc bằng API, **không bằng lời khai**.

| # | Điều kiện | Cách kiểm |
|---:|---|---|
| **R1** | Bốn PR practice đã squash merge | `gh api repos/<R>/pulls/<n>` → `merged=true` cho #1, #3, #4, PR của Trung |
| **R2** | **Mỗi người tham gia hợp lệ vào chu trình review** — mở PR của mình, được pair review, và review PR của pair. `CHANGES_REQUESTED` **chỉ bắt buộc ở nơi có lỗi thật**; `APPROVE` trên một PR đúng cũng thoả | `gh api repos/<R>/pulls/<n>/reviews` từng người |
| **R3** | `DAY0_SIGNOFF.md` cột **K** = `PASS` cho cả bốn | file |
| **R4** | §5 tổng hợp đã điền và leader đã ký | file |
| **R5** | `DAY1_READINESS_CHECKLIST.md` Phần A, B, B.1, C, D đều `PASS` hoặc được waive kèm lý do ghi rõ | file |
| **R6** | `../MASTER_PLAN_30_DAYS.md` tồn tại **và** có ghi nhận leader chấp nhận | file |
| **R7** | Baseline **không** đóng băng Path A/B · mobile framework · DINOv2 recipe · ngân sách mesh · biểu diễn lỗi 3D · chiến lược transport | rà §B.1 |
| **R8** | Trạng thái spike vẫn đúng Phần C: 6 `PREPARED` + 1 `BLOCKED`, 7 × `started_at: null` | YAML |
| **R9** | Spec 19/19 OK · không `RESULT.md` · không `DATASET_AUDIT.md` · không `data/manifests/` | lệnh dưới |

```bash
cd docs/specs/v1.0 && sha256sum -c SPEC_MANIFEST_SHA256.txt | grep -c ": OK"   # 19
find management -name 'RESULT.md' | wc -l                                      # 0
grep -c 'status: ACTIVE' management/spikes/SPIKE_PHASE_STATE.yaml              # 0
grep -c 'started_at: null' management/spikes/SPIKE_PHASE_STATE.yaml            # 7
```

> **Trượt một mục ⇒ không tuyên bố.** Đóng một phần thì ghi đúng là một phần. **Không làm tròn lên.**

---

## 3 · Luật PREP / DIAGNOSTIC — trước cutover

Phase A không phải là ngồi chờ. Chuẩn bị được khuyến khích, miễn là nó không giả làm bằng chứng.

**ĐƯỢC làm trước cutover:**

cài dependency và tooling · dựng harness · compile và chạy code tổng hợp · cấu hình Android tooling ·
cài và cấu hình Tailscale · dựng backend stub trên Mac mini · verify tooling khởi động được · chuẩn bị
fixture · debug kết nối.

**Mọi thứ ghi lại trong Phase A phải dán nhãn, ngay lúc capture:**

```
PREP / DIAGNOSTIC ONLY — NOT ACCEPTANCE EVIDENCE
```

**KHÔNG được làm trước cutover:**

| Không được |
|---|
| Ghi con số p95 / latency / FPS **chính thức** cho acceptance |
| Tính bất kỳ phép đo nào vào tiêu chí acceptance của Spike A, B hay E |
| Ghi `started_at` thật |
| Đánh dấu evidence là accepted |
| Đánh giá trigger DR-001 bằng một lần acquisition thuộc Execution Day 1 |
| Nói bất kỳ spike nào đang `ACTIVE` |

Số diagnostic lấy trước cutover phải bị **loại trừ đích danh** khỏi acceptance dataset — ghi thẳng trong
file evidence rằng nó là prep và không được tính.

---

## 4 · Ba tu chính đang có hiệu lực

Ghi ở đây để không ai áp dụng ngầm. Cả ba sẽ được nhắc lại trong `DAY01_CUTOVER_RECORD.md`.

### 4.1 · Tu chính bài drill Git

Bản gốc đòi mọi người phải **nhận** và **đưa** một `NEEDS_FIX`. Thay bằng: reviewer chỉ từ chối khi **có
lỗi thật**; PR đúng thì approve; drill chấm trên **tham gia hợp lệ**. Toàn văn:
[`../onboarding/DAY0_SIGNOFF.md`](../onboarding/DAY0_SIGNOFF.md) §0.

### 4.2 · Tu chính §D.3 — một người ghi central state

`DAY1_READINESS_CHECKLIST.md` §D.3 ghi *"mỗi chủ sở hữu tự làm cho spike của mình"*. **Điều này bị override.**

> **Chỉ leader / Project Control được sửa `../spikes/SPIKE_PHASE_STATE.yaml` và `DAY01_STATUS.md`.**

Lý do: bốn nhánh cùng chạm một file YAML vừa gây merge conflict vừa làm việc chuyển trạng thái mất tính
nguyên tử. Thành viên tạo ra sự thật qua **nhánh spike, file evidence, commit, PR và reviewer state**;
Project Control phản chiếu sự thật đã verify vào trong.

### 4.3 · Tu chính thứ tự thiết bị — `A → E → B`

`WIP-CONFLICT-02` và `DAY1_READINESS_CHECKLIST.md` PHẦN E ghi **A → B → E**. Đổi thành **A → E → B**, vì
Spike B có nhiều giờ việc không cần máy để lấp chỗ chờ, còn Spike E thì gating vào chính khả năng máy tới
được backend. Ghi vào `wip_conflicts` trong YAML tại commit chuyển trạng thái.

---

## 5 · Thủ tục cutover

> **`DAY01_CUTOVER_RECORD.md` KHÔNG tồn tại trước cutover.** Không skeleton, không draft, không placeholder.
> File chỉ được **TẠO** tại đúng thời điểm leader tuyên bố.

1. Kiểm `R1`–`R9` bằng máy. In kết quả.
2. Leader tuyên bố miệng và ghi giờ **thật** theo đồng hồ của mình.
3. Project Control **tạo** `DAY01_CUTOVER_RECORD.md` theo format §5.1.
4. Commit **một mình**: `docs(day01): record Execution Day 1 cutover`.
5. **Chỉ sau đó** mới tới commit chuyển trạng thái YAML.

Lịch sử git phải đọc ra đúng thứ tự này:

```text
pre-cutover state
  → CREATE DAY01_CUTOVER_RECORD.md
  → chore(spikes): start Execution Day 1
  → spike evidence …
```

### 5.1 · Format của cutover record

```markdown
# EXECUTION DAY 1 — CUTOVER RECORD

Tuyên bố:      <nguyên văn lời tuyên bố của leader>
Ngày:          2026-09-10
Giờ (local):   <giờ leader nêu — KHÔNG suy ra, KHÔNG lùi>
main SHA:      <SHA của main tại thời điểm tuyên bố>
Người tuyên bố: Phạm Tuấn Anh — Team Leader

## Ảnh chụp cửa READY
R1 … R9  — từng mục, kết quả kiểm, lệnh hoặc endpoint đã dùng

## Tu chính có hiệu lực từ thời điểm này
1. Tu chính bài drill Git
2. Override §D.3 — một người ghi central state
3. Thứ tự thiết bị A → E → B

## Đồng hồ DR-001
Bắt đầu tại giờ ghi trên. Trigger đánh giá vào CUỐI ngày execution này.
```

**Mọi `started_at` phải ≥ giờ ghi ở đây.** Không lùi ngày, không suy diễn. **00:00 không phải cutover.**

---

## 6 · Sau cutover — một commit chuyển trạng thái duy nhất

Do **Project Control** thực hiện, không phải bốn người tự làm:

| Trường | Giá trị |
|---|---|
| `phase` | `EXECUTION` |
| `execution_day_1_started_at` | ghi **một lần**, bằng giờ trong cutover record |
| `SPIKE_D` `SPIKE_A` `SPIKE_B` `SPIKE_E` | → `ACTIVE`, mỗi cái một `started_at` hợp lệ **≥ cutover** |
| `SPIKE_C0` `SPIKE_F` | giữ `PREPARED` — **không** thành primary thứ hai của ai |
| `SPIKE_C1` | giữ `BLOCKED`, `blocked_by: SPIKE_D` |
| `wip_conflicts` | ghi tu chính 4.2 và 4.3 |

Commit: `chore(spikes): start Execution Day 1`.

---

## 7 · Thiết bị — Galaxy A17 5G, theo cổng chứ không theo giờ

Một máy, một người giữ. Mọi lần bàn giao do Project Control ghi vào `DAY01_STATUS.md`.

```text
GATE 0 · trước cutover
    Chuẩn bị được. Mọi thứ capture ở đây là PREP / DIAGNOSTIC ONLY
    và bị loại trừ đích danh. KHÔNG acceptance measurement.

GATE 1 · Phạm Tuấn Anh — profile DR-006, rồi baseline Spike A
    vào:  commit chuyển trạng thái đã land
    nhả:  profile đã commit + baseline A9/A10 đã capture
    song song: Hùng Anh làm fixture/mesh (không cần máy)
               Trung làm stub + overlay (không cần máy)

GATE 2 · Nguyễn Gia Đức Trung — cellular + overlay, phân bố latency
    vào:  backend stub tới được VÀ overlay đã lên — chưa thì KHÔNG nhận máy
    nhả:  đã capture phân bố, đã ghi direct-vs-relayed

GATE 3 · Vũ Hùng Anh — FPS median, stall, picking sau khi xoay/zoom camera
    vào:  ≥3 mức decimation đã dựng VÀ harness picking chạy được trên desktop
```

> **Không đo thì không giữ máy.** Chưa đủ điều kiện vào cổng của mình thì máy nhảy sang người kế, mình
> xếp lại hàng.

---

## 8 · Review — theo sự kiện, không theo giờ

```text
Vũ Hùng Anh     :  Spike D  →  Spike A        (D trước: P0, critical path)
Phạm Tuấn Anh   :  Spike B  →  Spike E        (B trước: nạp GATE-MOB-01 + DR-008c)
```

| Luật |
|---|
| Mỗi reviewer giữ tối đa **một** item ở `REVIEWING` |
| Item kế tiếp nằm ở `QUEUED_FOR_REVIEW` |
| **Không preempt** khi một review đã bắt đầu |
| Một item chỉ thành `EVIDENCE_READY` khi chủ sở hữu **đã commit gói evidence tối thiểu** |
| Nếu item ưu tiên cao chưa `EVIDENCE_READY`, reviewer **lấy item sẵn sàng kế tiếp** thay vì ngồi không |
| Ưu tiên nhận **slot trống kế tiếp** — không chặn reviewer vô hạn |

Nghiệm thu đầy đủ vẫn là bốn bước: owner → `EVIDENCE_READY` → reviewer `APPROVE` → CHAT E QA `PASS` →
CHAT A chuyển trạng thái → `ACCEPTED`. **`RESULT.md` ≠ `ACCEPTED`.**

---

## 9 · Git và evidence

**Nhánh:** `spike/SPIKE_D` · `spike/SPIKE_A` · `spike/SPIKE_B` · `spike/SPIKE_E` ·
`chore/practice-duc-trung` · `docs/day01-*` cho artifact quản lý.

| Luật |
|---|
| **Một spike một PR.** Không PR nào trộn hai spike, không PR nào trộn spike với artifact quản lý |
| Title PR mang ID spike |
| Squash merge; cần ít nhất một reviewer được chỉ định approve |
| Không push thẳng `main`. **Không push vào nhánh người khác** |
| **Nhánh thành viên chỉ chứa implementation/evidence của spike mình — không bao giờ file central state** |

### Evidence phải commit cái gì

"Bằng chứng thật đầu tiên" **không** đòi commit artifact thô lớn. Được commit:

CSV/JSON output của phép đo · log nhỏ · manifest · checksum · bản ghi lệnh và config · bảng tóm tắt **có
artifact thô local đứng sau** · screenshot khi thật cần và cỡ hợp lý.

Artifact quá lớn thì: để ngoài git · ghi định danh và quy ước đường dẫn local · ghi checksum · ghi lệnh
sinh ra nó · tóm tắt các số đo bắt buộc vào file evidence được track.

**Không bao giờ commit:** dataset volume · checkpoint · binary lớn · secret.
`.gitignore` đã chặn `data/**`, `*.nrrd`, `*.nii`, `*.dcm`.

Trường không đo được thì ghi **`NOT MEASURED — <lý do>`**. Đó là trung thực và được chấp nhận. Bịa một giá
trị hợp lý thì không.

---

## 10 · KHÔNG được làm hôm nay

| Không được | Vì sao |
|---|---|
| Chuyển spike sang `ACTIVE` trước cutover | `ACTIVE` = đã thực sự bắt đầu |
| Ghi `started_at` thật trước cutover | Làm hỏng đồng hồ DR-001 |
| Acceptance measurement trước cutover | Chỉ prep/diagnostic, loại trừ đích danh |
| Chọn hoặc đóng băng **mobile framework** | `GATE-MOB-01` cần bằng chứng **cả** Spike A và Spike B |
| Đóng băng **DINOv2 recipe** | `GATE-ML-01` chỉ đóng sau **Spike C1**; C0 không đủ |
| Bắt đầu **Spike C1** | Còn `BLOCKED_BY_SPIKE_D` |
| Bắt đầu C0 hay F như primary thứ hai | Giữ `PREPARED` |
| Dùng **LAN / Wi-Fi trường** làm acceptance evidence cho Spike E | `E1`; venue Wi-Fi không tin cậy và không cần thiết (DR-003) |
| **Slice-level split** | Patient-level là **invariant** |
| Chọn Path A hay Path B | DR-002, sau bằng chứng Spike D |
| Thay dataset khác | Cần đủ chuỗi `00` §13 |
| Nới trần **±1 source slice** | Không có level nào đạt thì đó là `NEGATIVE_RESULT`, phải leo thang |
| Nới `NFR-PERF-001` / `-003` | Cần DR |
| Sửa `docs/specs/v1.0/**` | Đóng băng |
| Commit dataset bytes / secret / binary lớn | `12` §3, `NFR-SEC-004` |
| **Cấy lỗi để có `NEEDS_FIX`** | §4.1 |
| Sửa central state từ nhánh thành viên | §4.2 |

---

## 11 · Tiêu chí kết thúc Day 01

Ngày tốt **không** phải "xong hết bốn spike".

| # | Tiêu chí |
|---:|---|
| 1 | Nợ Day 0 đóng sạch: bốn PR practice merged, `DAY0_SIGNOFF.md` đủ 4/4 và đã ký |
| 2 | Baseline 30 ngày tồn tại và được leader chấp nhận, C1/C4/C6 nằm bên trong, không đóng băng gì phụ thuộc bằng chứng |
| 3 | **Cutover record tạo tại lúc tuyên bố và commit trước mọi thay đổi trạng thái** |
| 4 | D/A/B/E `ACTIVE` qua **một** commit của Project Control, mỗi `started_at` ≥ cutover |
| 5 | Mỗi spike có **bằng chứng thật đầu tiên** — nhỏ cũng được, nhưng phải là đo thật |
| 6 | **Trigger DR-001 đã được đánh giá và báo cáo**, ra kết quả nào cũng được |
| 7 | Blocker mới ghi lại kèm chủ sở hữu và hành động kế tiếp |
| 8 | Không queue review nào kẹt; không item sẵn sàng nào nằm cả ngày không ai đụng |
| 9 | Leader đủ dữ kiện quyết Day 2 |

**Chấp nhận được:** Spike D chỉ tới bước 5 · một `NEGATIVE_RESULT` · `NOT MEASURED — <lý do>` ở bất kỳ
trường nào · **trigger DR-001 nổ và RA-H01 leo lên BLOCKER**.

Trigger nổ mà **được ghi** là một ngày thành công. Trigger **không được đánh giá** thì không.

---

## 12 · Leo thang

| Loại | Đi đâu |
|---|---|
| Mâu thuẫn giữa hai file spec đóng băng | **DỪNG**, mở Decision Request — `00` §12 cấm đoán file nào thắng |
| Cần đổi thứ đã đóng băng | Decision Request → spec owner |
| Vấn đề khoa học / dataset / metric | CHAT C, rồi DR nếu cần |
| Vấn đề kiến trúc / hợp đồng | CHAT B |
| Phản biện trước `ACCEPTED` | CHAT E — QA / Red Team |
| Trạng thái / kế hoạch / blocker | CHAT A — Project Control (leader vận hành) |

**Liên quan:** [`DAY01_STATUS.md`](DAY01_STATUS.md) · [`DAY01_LEADER_CHEATSHEET.md`](DAY01_LEADER_CHEATSHEET.md)
· [`DAY01_EOD_REVIEW.md`](DAY01_EOD_REVIEW.md) · [`tasks/`](tasks/) ·
[`../onboarding/DAY1_READINESS_CHECKLIST.md`](../onboarding/DAY1_READINESS_CHECKLIST.md) ·
[`../spikes/SPIKE_PHASE_STATE.yaml`](../spikes/SPIKE_PHASE_STATE.yaml)
