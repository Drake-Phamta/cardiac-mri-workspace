# DAY 01 — VŨ HÙNG ANH

**Spike B — linked 3D, geometry, picking.** Đồng thời là **reviewer của Spike D và Spike A**.

> **`PHASE A` · `READY: NO` · chưa cutover.** Spike B **chưa** `ACTIVE`, `started_at` = `null`.

---

## PHẦN I — NỢ DAY 0 · LÀM TRƯỚC

### ① Sửa PR #3 của bạn

PR #3 đang có `CHANGES_REQUESTED` từ Phạm Tuấn Anh: **thiếu dòng `Reviewer:`** —
[`../../onboarding/practice/README.md`](../../onboarding/practice/README.md) liệt kê đây là required
field số 7.

```powershell
git switch chore/practice-hung-anh
git pull
# thêm vào cuối management/onboarding/practice/PRACTICE_VU_HUNG_ANH.md:
#   * **Reviewer:** Phạm Tuấn Anh
git status --short          # phải thấy dòng M ...
git add management/onboarding/practice/PRACTICE_VU_HUNG_ANH.md
git commit -m "chore(practice): PRACTICE-01 add reviewer field"
git push
```

Rồi báo Tuấn Anh để approve.

### ② `APPROVE` PR #1

Tuấn Anh đã push fix `50b3d10` từ đêm qua — bỏ chữ thừa ở dòng Role và thêm dòng `Reviewer`. PR đang chờ
bạn re-review:

```powershell
gh pr diff 1 --name-only     # kiểm biên
gh pr review 1 --approve -b "APPROVE: du field, diff nam trong practice/"
```

### ③ Ghi nhớ hai điều cho các vòng review sau

> **Cấm cấy lỗi.** Luật đã đổi: reviewer chỉ `CHANGES_REQUESTED` khi có **lỗi thật** trong PR **đúng như
> tác giả nộp**. PR đúng thì approve thẳng — đó là một lượt drill **hoàn chỉnh**. Toàn văn:
> [`../../onboarding/DAY0_SIGNOFF.md`](../../onboarding/DAY0_SIGNOFF.md) §0.
>
> **Không push vào nhánh của người khác.** Trên PR #1 hôm qua có một commit đi thẳng vào nhánh của tác
> giả. Trên việc thật, điều này phá luật một-chủ-sở-hữu trên file integration-sensitive (`15` §9) — và
> `tests/fixtures/geometry/**` của **chính bạn** là ví dụ điển hình của loại file đó. Góp ý thuộc về
> review; sửa thuộc về tác giả.

---

## PHẦN II — CHUẨN BỊ TRƯỚC CUTOVER

**Nhánh:** `spike/SPIKE_B`

### Được làm — và bạn có nhiều việc không cần máy nhất trong nhóm

Cài toolchain mesh/render và chạy thử trên desktop · dựng khung sinh **canonical geometry fixture** theo
DR-008a · thử surface extraction trên volume tổng hợp · dựng khung harness picking chạy trên desktop ·
đọc kỹ [`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md).

Dán nhãn mọi thứ ghi lại ở giai đoạn này:

```
PREP / DIAGNOSTIC ONLY — NOT ACCEPTANCE EVIDENCE
```

### Trước cutover KHÔNG được

Ghi con số **FPS / stall / picking error chính thức** · tính bất kỳ phép đo nào vào B4/B5/B10/B11 · ghi
`started_at` · nói Spike B đang `ACTIVE`.

---

## PHẦN III — SAU CUTOVER

| # | Việc | Phụ thuộc | Output |
|---:|---|---|---|
| **1** | **Bộ canonical geometry fixture** theo DR-008a — **và CÔNG BỐ FORMAT cho Phạm Tuấn Anh ngay** | — | `tests/fixtures/geometry/**` |
| 2 | Surface extraction + **≥3 mức decimation**, mỗi mức có triangle count | 1 | mesh artifacts |
| 3 | Harness picking: fixture-exact (B4) và real-mesh (B5), **chạy desktop trước** | 2 | harness |
| 4 | **Review Spike D** khi Khánh `EVIDENCE_READY` | Khánh | verdict |
| 5 | Đo trên máy: FPS median, stall, picking sau khi xoay/zoom camera | **GATE 3** — máy về sau Đức Trung | measurements |
| 6 | Bảng decimation frontier + **đề xuất DR-008c** | 5 | `RESULT.md` |

> **Việc 1 là thứ mở khoá người khác sớm nhất.** Spike A của Tuấn Anh **và** Spike F sau này đều tiêu thụ
> bộ fixture của bạn. Bạn **sở hữu** nó, họ **tiêu thụ**. Công bố format trước khi họ phụ thuộc vào nó.

### Cổng thiết bị — bạn là GATE 3, cuối hàng `A → E → B`

**Điều kiện vào:** ≥3 mức decimation đã dựng **và** harness picking chạy được trên desktop.
Chưa đủ thì đừng nhận máy — nó nhảy sang người kế và bạn xếp lại hàng.

> ⚠ Đây là **tu chính**: bản gốc `WIP-CONFLICT-02` ghi `A → B → E`, tức bạn đo thứ hai. Đổi thành
> `A → E → B` vì bạn có nhiều giờ việc không cần máy nhất, còn Spike E thì gating vào chính khả năng máy
> tới được backend. Xem [`../DAY01_RUNBOOK.md`](../DAY01_RUNBOOK.md) §4.3.

---

## Acceptance criteria — trích `SPIKE_B_3D/TASK.md`

| # | Phải chứng minh | Ràng buộc |
|---:|---|---|
| B1–B3 | Mesh render; rotate/zoom/pan; plane/marker tính từ source geometry; picking hoạt động ổn định | định tính + khớp fixture |
| **B4** | **Fixture picking trả về ĐÚNG slice kỳ vọng** | **chính xác tuyệt đối — dung sai bằng 0** |
| **B5** | **Picking error trên mesh thật đã decimate** | **≤ ±1 source slice** |
| B6–B9 | B4/B5 giữ nguyên **sau khi xoay và zoom camera** · 2D điều hướng đúng slice · geometry đúng sau thao tác camera bất kỳ · chọn nền không gây điều hướng sai | cùng biên; **0** false navigation |
| **B10** | **≥20 FPS median** trong bài test tương tác | `NFR-PERF-002` |
| **B11** | **Không stall >500 ms** do render thường | **zero** |
| **B12** | **Bảng decimation frontier** — ≥3 mức, mỗi mức có triangle count, median FPS, picking error | bắt buộc dạng bảng |
| **B13** | **Đề xuất DR-008c**: ngân sách tối đa hoá frame rate **với điều kiện picking error ≤ ±1 slice** | đề xuất tường minh |
| **B14** | Điểm **interior** và **surface-tangent** báo cáo **RIÊNG** | cả hai nhóm |
| B15 | Chi phí phát triển mỗi framework ứng viên | định tính, cho `09` §7 |

### Điều kiện thất bại — xử đúng, đừng lách

| Tình huống | Phải làm |
|---|---|
| **B4 fail** (fixture không exact) | Cài đặt geometry sai. **Sửa trước khi đi tiếp** |
| **B5 fail** (>±1 slice) ở **mọi** mức đạt B10 | **`NEGATIVE_RESULT` → leo thang.** **KHÔNG nới trần** |
| **B10/B11 fail** ở **mọi** mức đạt B5 | **`NEGATIVE_RESULT` → leo thang** |

## Evidence phải commit

Bộ fixture canonical · bảng triangle count theo mức · bảng picking error **tách interior / surface-tangent**
· phân bố frame-time (không chỉ một median) · bảng frontier B12 · đề xuất DR-008c. Mesh artifact quá lớn
thì để ngoài git, ghi checksum + lệnh sinh, tóm tắt vào file được track. Trường không đo được ghi
**`NOT MEASURED — <lý do>`**.

## Reviewer

**Phạm Tuấn Anh** — hàng đợi vị trí **1** của anh ấy (B trước E).

## Hàng đợi review CỦA BẠN

```
Spike D  →  Spike A
```

**Spike D được ưu tiên khi cả hai cùng sẵn sàng** — D là P0 và nằm trên critical path. Nếu Spike A
`EVIDENCE_READY` mà D chưa, bạn **được** review A trước; nhưng khi D sẵn sàng, **D lấy slot trống kế
tiếp**. Một item `REVIEWING` tại một thời điểm, **không preempt** review đang chạy.

## Spike B KHÔNG được

**Nới trần ±1 source slice** để một mức "cho pass" — không mức nào đạt cả B5 và B10 thì đó là
`NEGATIVE_RESULT`, phải leo thang · đổi quy ước toạ độ canonical **DR-008a** (cần DR) · để **thứ tự bộ nhớ
của thư viện** (ví dụ `[z,y,x]`) trở thành API contract — adapter phải đưa về canonical `(x,y,z)` ·
chọn hay đóng băng **mobile framework** (`GATE-MOB-01` cần bằng chứng **cả** A và B) · **chốt DR-008c bằng
phán đoán** thay vì bằng số đo · bắt đầu **Spike F** như primary thứ hai · **push vào nhánh người khác** ·
chuyển Spike B sang `ACTIVE` (chỉ Project Control làm).

## Chuyển bước khi

**Format bộ fixture đã công bố cho Phạm Tuấn Anh.** Đó là mốc mở khoá người khác sớm nhất trong ngày.

---

**Liên quan:** [`../DAY01_RUNBOOK.md`](../DAY01_RUNBOOK.md) · [`../DAY01_STATUS.md`](../DAY01_STATUS.md) ·
[`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md) ·
[`../../spikes/SPIKE_B_3D/EVIDENCE_TEMPLATE.md`](../../spikes/SPIKE_B_3D/EVIDENCE_TEMPLATE.md) ·
[`../../onboarding/3D_MESH_UI_FPS_REFERENCE.md`](../../onboarding/3D_MESH_UI_FPS_REFERENCE.md) ·
[`../../onboarding/member_briefs/VU_HUNG_ANH.md`](../../onboarding/member_briefs/VU_HUNG_ANH.md)
