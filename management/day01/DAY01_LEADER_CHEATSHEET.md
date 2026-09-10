# DAY 01 — LEADER CHEATSHEET

> **`PHASE A` · `READY: NO` · chưa cutover · chưa spike nào `ACTIVE` · đồng hồ DR-001 chưa chạy.**

Mở file này trên điện thoại trong lúc điều phối. Chi tiết đầy đủ ở [`DAY01_RUNBOOK.md`](DAY01_RUNBOOK.md).

---

## 1 · Ai đang chặn READY, ngay lúc này

| Thứ tự gỡ | Ai | Việc | Gỡ được gì |
|---:|---|---|---|
| **1** | **Nguyễn Gia Đức Trung** | mở PR practice · **review PR #4** | gỡ cột B của **Khánh + chính bạn ấy** |
| 2 | **Vũ Hùng Anh** | sửa PR #3 · `APPROVE` PR #1 | gỡ cột B của **anh + chính bạn ấy** |
| 3 | **Bế Quốc Khánh** | review PR của Trung sau khi có | gỡ cột B của Trung |
| 4 | **Anh** | approve #3, merge cả bốn, chấm sign-off | gỡ R1–R4 |
| 5 | **Project Control** | sinh `MASTER_PLAN_30_DAYS.md`, anh chấp nhận | gỡ R6–R7 |

**Trung là nút thắt.** Nhắn bạn ấy trước tiên, trước cả khi làm gì khác.

---

## 2 · Sau mỗi PR — kiểm gì

```powershell
gh pr view <n> --json state,mergedAt
gh api repos/Drake-Phamta/cardiac-mri-workspace/pulls/<n>/reviews
gh pr diff <n> --name-only        # phải nằm trong management/onboarding/practice/
```

| Kiểm | Đạt khi |
|---|---|
| Phạm vi diff | chỉ file practice của chính tác giả |
| Review | do **đúng pair** submit, không phải tự approve |
| `CHANGES_REQUESTED` | chỉ khi **có lỗi thật** — PR đúng thì approve thẳng |
| Không ai push vào nhánh người khác | `git log --format='%an' <branch>` chỉ có một tên |
| Merge | squash |

> **Cấm cấy lỗi.** Tu chính đã ghi ở `../onboarding/DAY0_SIGNOFF.md` §0. Approve một PR đúng là một lượt
> drill hoàn chỉnh.

---

## 3 · Cửa READY — `R1`–`R9`

| # | Điều kiện |
|---:|---|
| R1 | Bốn PR practice **merged** |
| R2 | Mỗi người **tham gia hợp lệ**: mở PR · được pair review · review PR của pair |
| R3 | `DAY0_SIGNOFF.md` cột **K** = `PASS` ×4 |
| R4 | §5 tổng hợp điền + anh ký |
| R5 | `DAY1_READINESS_CHECKLIST.md` A · B · B.1 · C · D |
| R6 | `../MASTER_PLAN_30_DAYS.md` tồn tại **và** có ghi nhận anh chấp nhận |
| R7 | Baseline **không** đóng băng Path A/B · framework · DINOv2 · mesh budget · lỗi 3D · transport |
| R8 | 6 `PREPARED` + 1 `BLOCKED`, 7 × `started_at: null` |
| R9 | Spec 19/19 · 0 `RESULT.md` · 0 `DATASET_AUDIT.md` · 0 `data/manifests/` |

```bash
cd docs/specs/v1.0 && sha256sum -c SPEC_MANIFEST_SHA256.txt | grep -c ": OK"   # 19
find management -name 'RESULT.md' | wc -l                                      # 0
grep -c 'status: ACTIVE' management/spikes/SPIKE_PHASE_STATE.yaml              # 0
grep -c 'started_at: null' management/spikes/SPIKE_PHASE_STATE.yaml            # 7
```

**Trượt một mục ⇒ không tuyên bố.**

### Baseline 30 ngày nằm ở đâu trong trình tự

Sinh **sau** khi nợ Day 0 đóng (R1–R4 xong), **trước** khi tuyên bố. Nó là **R6/R7**, không phải việc
tuỳ chọn — `DAY1_READINESS_CHECKLIST.md` B7/D5/D6/D7 đòi nó. Baseline phải chứa **C1, C4, C6** dưới dạng
gate · dependency · điểm bất định · decision point · recovery trigger, và **không được** đóng băng bất kỳ
quyết định nào phụ thuộc bằng chứng.

---

## 4 · Cutover — làm đúng thứ tự này

```text
1  Kiểm R1–R9 bằng lệnh. In kết quả ra.
2  Tuyên bố miệng. Ghi giờ THẬT theo đồng hồ của anh.
3  Project Control TẠO management/day01/DAY01_CUTOVER_RECORD.md
       ← file này CHƯA từng tồn tại trước giây phút này
4  Commit MỘT MÌNH:  docs(day01): record Execution Day 1 cutover
5  CHỈ SAU ĐÓ:       chore(spikes): start Execution Day 1
```

**Đồng hồ DR-001 bắt đầu ở bước 2.** Mọi `started_at` phải **≥** giờ đó. Không lùi ngày.
**00:00 không phải cutover.**

Sau cutover, **chỉ Project Control** sửa `SPIKE_PHASE_STATE.yaml` — một commit duy nhất chuyển D/A/B/E sang
`ACTIVE`, C0/F giữ `PREPARED`, C1 giữ `BLOCKED`.

---

## 5 · 📱 Cổng thiết bị — `A → E → B`

```text
GATE 0  trước cutover   máy chỉ dùng để cài/cấu hình. Mọi capture = PREP, loại trừ đích danh
GATE 1  Tuấn Anh        nhả khi: profile DR-006 committed + baseline A9/A10 captured
GATE 2  Đức Trung       vào khi: stub tới được VÀ overlay đã lên
GATE 3  Hùng Anh        vào khi: ≥3 mức decimation + harness picking chạy desktop
```

**Không đo thì không giữ máy.** Chưa đủ điều kiện vào cổng → máy nhảy sang người kế.

⚠ Đây là **tu chính**; bản gốc ghi `A → B → E`. Phải nêu trong cutover record.

---

## 6 · Hàng đợi review

```text
Vũ Hùng Anh     :  Spike D  →  Spike A      (D trước — P0)
Phạm Tuấn Anh   :  Spike B  →  Spike E      (B trước — nạp GATE-MOB-01 + DR-008c)
```

Một item `REVIEWING` mỗi người · không preempt · item cao hơn nhận **slot trống kế tiếp** · nếu item ưu
tiên chưa `EVIDENCE_READY` thì lấy item sẵn sàng kế tiếp chứ **không ngồi không**.

---

## 7 · Đừng tuyên bố sớm những điều này

| Không được nói | Cho tới khi |
|---|---|
| "Day 0 xong rồi" | cột K `PASS` ×4 **và** §5 đã ký |
| "Sẵn sàng Execution Day 1" | R1–R9 qua hết |
| "Spike đang chạy" | commit chuyển trạng thái đã land, sau cutover record |
| "Đo được X ms / X FPS" | sau cutover, trên máy thật, có phân bố chứ không chỉ một số |
| "Chọn framework rồi" | `GATE-MOB-01` — cần bằng chứng **cả** Spike A và B |
| "Chốt recipe ML rồi" | `GATE-ML-01` — cần **Spike C1**, C0 không đủ |
| "Dataset ổn rồi" | `GATE-DATA-01` — cần bằng chứng Spike D |
| "Đã nhận NEEDS_FIX" | nó thực sự xảy ra — **không bịa ngược** |

---

## 8 · Ba câu hỏi cuối ngày

1. **Trigger DR-001 đã được đánh giá chưa?** Có gói dùng được trên máy cục bộ không, hay validation lộ
   defect chặn `GATE-DATA-01`? Ra kết quả nào cũng được — **không đánh giá** mới là hỏng.
2. **Mỗi spike có bằng chứng thật đầu tiên chưa?** Nhỏ cũng được. Bịa thì không.
3. **Có reviewer nào kẹt cả ngày không?**

Ghi vào [`DAY01_EOD_REVIEW.md`](DAY01_EOD_REVIEW.md).
