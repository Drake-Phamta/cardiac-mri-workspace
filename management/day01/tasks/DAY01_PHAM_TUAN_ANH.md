# DAY 01 — PHẠM TUẤN ANH

**Vai trò kép hôm nay:** **Leader / Project Control** *và* **chủ sở hữu Spike A**.
Hai vai này có ưu tiên khác nhau — đừng trộn. Vai Project Control đi trước.

> **`PHASE A` · `READY: NO` · chưa cutover.** Spike A **chưa** `ACTIVE`, `started_at` vẫn `null`,
> đồng hồ DR-001 **chưa chạy**.

---

## PHẦN I — VAI LEADER / PROJECT CONTROL

Đây là việc chặn cả nhóm. Làm trước.

### NOW — theo thứ tự

| # | Việc | Chặn bởi | Xong khi |
|---:|---|---|---|
| **1** | **Nhắn Nguyễn Gia Đức Trung ngay.** Bạn ấy đang chặn **ba** cột B — của Khánh, của chính bạn ấy, và tổng hợp 4/4 | — | bạn ấy bắt đầu ①–③ trong packet của mình |
| **2** | Nhắn Vũ Hùng Anh: sửa PR #3, và `APPROVE` PR #1 (fix `50b3d10` đã push từ đêm qua) | — | bạn ấy phản hồi |
| **3** | Khi Hùng Anh sửa xong #3 → review lại. **Approve nếu đúng** | Hùng Anh | `#3` có `APPROVED` |
| **4** | Merge bốn PR practice bằng squash khi từng cái đủ điều kiện | cả nhóm | `merged=true` ×4 |
| **5** | Chấm `DAY0_SIGNOFF.md` cho cả bốn người từ **sự kiện đã verify**, không từ lời khai | 4 | cột K điền cho cả bốn |
| **6** | Điền §5 tổng hợp và ký | 5 | R3 + R4 đạt |
| **7** | Yêu cầu Project Control sinh `MASTER_PLAN_30_DAYS.md`, rồi **chấp nhận** nó | 6 | R6 + R7 đạt |
| **8** | Điền `DAY1_READINESS_CHECKLIST.md` Phần A/B/B.1/C/D/G | 7 | R5 đạt |
| **9** | **Kiểm `R1`–`R9` bằng máy**, in kết quả | 8 | tất cả `PASS` |
| **10** | **Tuyên bố cutover** — ghi giờ thật, Project Control tạo và commit `DAY01_CUTOVER_RECORD.md` **một mình, trước mọi thứ** | 9 | commit đã land |

### Anh là người duy nhất gây ra chuyển trạng thái trung tâm

> **Chỉ leader / Project Control sửa `../../spikes/SPIKE_PHASE_STATE.yaml` và `../DAY01_STATUS.md`.**

Ba người kia **không** tự chuyển spike của mình sang `ACTIVE`. Đây là **tu chính override §D.3** của
`DAY1_READINESS_CHECKLIST.md` — xem [`../DAY01_RUNBOOK.md`](../DAY01_RUNBOOK.md) §4.2. Sau cutover, anh
làm **một** commit chuyển trạng thái duy nhất cho cả bốn spike.

### Kiểm gì sau mỗi PR

```powershell
gh pr diff <n> --name-only     # chỉ file practice của chính tác giả
gh api repos/Drake-Phamta/cardiac-mri-workspace/pulls/<n>/reviews
git log --format='%an' origin/<branch>   # chỉ một tên — không ai push vào nhánh người khác
```

**Cấm cấy lỗi.** PR đúng ngay từ đầu thì reviewer approve thẳng — đó là một lượt drill hoàn chỉnh.
Tu chính ở [`../../onboarding/DAY0_SIGNOFF.md`](../../onboarding/DAY0_SIGNOFF.md) §0.

### Leader KHÔNG được

Tuyên bố READY khi còn mục `R` trượt · làm tròn một sign-off dở lên `PASS` · ghi rằng một `NEEDS_FIX` đã
xảy ra khi nó không xảy ra · để thành viên tự sửa central state · chấp nhận một baseline đóng băng
Path A/B, framework, DINOv2 recipe, ngân sách mesh, biểu diễn lỗi 3D hay chiến lược transport.

---

## PHẦN II — VAI CHỦ SỞ HỮU SPIKE A

### Được làm NGAY, trước cutover — nhưng phải dán nhãn

**Nhánh:** `spike/SPIKE_A`

Được: cài và cấu hình Android tooling · dựng khung harness với fixture tổng hợp · compile và chạy thử ·
chuẩn bị instrumentation đo · cắm máy để **cài đặt** chứ không phải để đo.

Mọi thứ ghi lại trong giai đoạn này dán nhãn, ngay lúc capture:

```
PREP / DIAGNOSTIC ONLY — NOT ACCEPTANCE EVIDENCE
```

**Trước cutover KHÔNG được:** ghi con số p95 / brush latency chính thức · tính bất kỳ phép đo nào vào
A9/A10 · ghi `started_at` · nói Spike A đang `ACTIVE`.

### SAU CUTOVER — theo thứ tự

| # | Việc | Phụ thuộc | Output |
|---:|---|---|---|
| 1 | **Chụp profile thiết bị DR-006 từ Galaxy A17 5G** — tiền đề của **cả** Spike A, B **và** E | commit chuyển trạng thái đã land | file profile trong `../../spikes/SPIKE_A_2D/` |
| 2 | **Nhả máy cho Đức Trung** | 1 đã commit | bàn giao, Project Control ghi vào `DAY01_STATUS.md` |
| 3 | Harness Spike A trên fixture tổng hợp — A1–A8, A11 | format fixture của Hùng Anh | `RESULT.md` (một phần) |
| 4 | Baseline A9/A10 khi còn giữ máy ở GATE 1 | 1 | phân bố, không phải một con số |
| 5 | Review **Spike B**, rồi **Spike E**, khi từng cái `EVIDENCE_READY` | chủ sở hữu | verdict trong PR |

**Profile DR-006 chụp từ chính máy, không suy diễn thông số nào:** model identifier · Android version +
build · RAM/performance profile · CPU info từ tooling · GPU info từ tooling · resolution + refresh · exact
test configuration (build type, thermal, power mode, background load, brightness, throttling observed).

### Acceptance criteria — trích `SPIKE_A_2D/TASK.md`

| # | Phải chứng minh | Ràng buộc |
|---:|---|---|
| A1–A4 | Slice render đúng `n / total` · zoom/pan **không** đổi geometry source · brush ADD/ERASE chỉ sửa pixel đúng | checksum source mask **không đổi**; chính xác so fixture |
| **A5** | **Brush mapping đúng pixel SAU zoom và pan** | **nêu dung sai + báo cáo phân bố sai số đầy đủ**, không phải một con số |
| A6–A8 | Undo · Redo · Save/reload | chính xác |
| **A9** | Slice-switch đã cache, test 30 bước | **p95 ≤ 200 ms**; không full-volume transfer mỗi gesture |
| **A10** | Phản hồi brush | **≤ 100 ms**; **0** nét committed bị mất |
| A11 | Tách gesture sửa vs điều hướng, kịch bản scripted | **0** lần sửa ngoài ý |
| A12 | Chi phí phát triển mỗi framework ứng viên | định tính, cho `09` §7 |

**A5 là câu hỏi phân biệt.** Spec đóng băng **không** đặt dung sai pixel cho brush mapping — spike này
phải **đề xuất** một dung sai kèm phân bố quan sát được. Đừng âm thầm cho là "gần đủ".

### Evidence phải commit

Profile DR-006 · bảng kết quả A1–A11 · **phân bố sai số A5** · **phân bố latency A9/A10** (không chỉ p95) ·
bản ghi cấu hình test. Artifact thô quá lớn thì để ngoài git, ghi định danh + checksum + lệnh sinh, tóm tắt
vào file được track.

### Reviewer

**Vũ Hùng Anh** — hàng đợi vị trí **2**, sau Spike D (P0). Nếu Spike D chưa `EVIDENCE_READY` khi Spike A
sẵn sàng, bạn ấy **được** review A trước.

### Spike A KHÔNG được

Chọn hay đóng băng **mobile framework** — `GATE-MOB-01` cần bằng chứng **cả** A và B · nới
`NFR-PERF-001`/`-003` · đổi quy ước toạ độ **DR-008a** · nới dung sai brush-mapping "cho pass" · **giữ máy
khi không đo** · báo median mà không có phân bố · mang số prep vào acceptance.

### Chuyển bước khi

Profile DR-006 đã commit **và** máy đã bàn giao cho Đức Trung.

---

**Liên quan:** [`../DAY01_RUNBOOK.md`](../DAY01_RUNBOOK.md) ·
[`../DAY01_LEADER_CHEATSHEET.md`](../DAY01_LEADER_CHEATSHEET.md) · [`../DAY01_STATUS.md`](../DAY01_STATUS.md)
· [`../../spikes/SPIKE_A_2D/TASK.md`](../../spikes/SPIKE_A_2D/TASK.md) ·
[`../../spikes/SPIKE_A_2D/EVIDENCE_TEMPLATE.md`](../../spikes/SPIKE_A_2D/EVIDENCE_TEMPLATE.md) ·
[`../../onboarding/member_briefs/PHAM_TUAN_ANH.md`](../../onboarding/member_briefs/PHAM_TUAN_ANH.md)
