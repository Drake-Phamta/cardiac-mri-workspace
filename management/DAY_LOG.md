# NHẬT KÝ NGÀY — AI XONG GÌ, CÒN TỒN GÌ

> **Người ghi: Project Control (leader vận hành) — DUY NHẤT.** Thành viên không sửa file này.
>
> ### Luật một dòng, quan trọng nhất trong file
>
> **Ô "Đã xong" chỉ được ghi khi có bằng chứng truy được** — commit SHA, số PR, hoặc đường dẫn file đã
> commit. Không có bằng chứng thì nó nằm ở cột **"Còn tồn"**, bất kể ai nói gì. Đây là thứ ngăn dự án
> trôi: một ngày "xong" mà không để lại dấu vết thì không phải là xong.

**Mốc cố định:** `Day 1 = 2026-09-10` · **`Day 30 = 2026-10-09` — KHÔNG lùi.**
Ngày mất **ăn vào buffer**, không đẩy hạn.

| Chỉ số | Giá trị |
|---|---|
| Ngày hôm nay | **Day 2 — 2026-09-11** |
| Ngày còn lại tới Day 30 | **29** |
| **Buffer còn** | **1 ngày** *(dự trù 2, đã tiêu 1 vì Day 1 trượt)* |
| Cutover | **chưa xảy ra** tính tới lúc ghi |
| Ngưỡng leo thang | mất thêm **1** ngày → buffer = 0 → `15` §18 trigger 2 kích hoạt |

---

## DAY 2 — 2026-09-11 · `ĐANG MỞ`

### Đã xong

| Ai | Việc | Bằng chứng |
|---|---|---|
| Nguyễn Gia Đức Trung | Review PR #4 của Khánh — `APPROVED` | API review 03:13:39Z |
| Nguyễn Gia Đức Trung | Mở PR #8 practice bản sạch (1 file) sau khi tự đóng PR #7 lẫn 19 file | PR #8, PR #7 closed |
| Bế Quốc Khánh | PR #4 được merge | `c4499bd` |
| Nguyễn Gia Đức Trung | PR #8 được merge | `39fb7af` |
| Phạm Tuấn Anh | Review + `APPROVED` PR #8 (thay Khánh vắng mặt) | API review 04:34:51Z |
| Project Control | **DR-003a** — ZeroTier thành overlay chuẩn; **DR-001a** — trigger đánh giá cuối Day 2 | `75184f5` |
| Project Control | Chấm các ô sign-off có bằng chứng; leader đạt **11/11 `PASS`** | `38c4bc4` |

### Còn tồn

| Ai | Việc | Vì sao chưa xong | Hạn |
|---|---|---|---|
| **Phạm Tuấn Anh** | Chấm **A · C · G · J** cho ba thành viên + các mục phụ Spike D/E | Không có bản ghi nào về cửa kiến thức cho ba bạn; Project Control không chấm thứ mình không thấy | trước cutover hôm nay |
| **Phạm Tuấn Anh** | §5 tổng hợp + chữ ký Day 0 | Cần cột `K` của cả bốn | sau mục trên |
| **Phạm Tuấn Anh** | Tuyên bố cutover, tạo `DAY01_CUTOVER_RECORD.md` | Cần `R1`–`R9` qua | hôm nay |
| **Bế Quốc Khánh** | Review PR thật của một đồng đội | Vắng cả 10/09 và 11/09 | đóng cột `B` khi làm |
| **Vũ Hùng Anh** | PR nhỏ thêm dòng `Reviewer:` vào `PRACTICE_VU_HUNG_ANH.md` | #3 merge đè `CHANGES_REQUESTED` chưa xử lý | technical debt |
| **Cả bốn** | Spike D · A · B · E chưa chạy | Chưa cutover | sau cutover |

### Quyết định ghi trong ngày

- **DR-003a** — overlay chuẩn = **ZeroTier** (Trung đề xuất, leader duyệt). Mọi phần thực chất của DR-003
  giữ nguyên: profile `LOCAL_DEMO`, backend vật lý ở xa, trust boundary là overlay membership, venue
  Wi-Fi không tin cậy, **`E1` LAN không phải acceptance evidence**.
- **DR-001a** — trigger dataset đánh giá cuối **Day 2** thay vì Day 1, vì Day 1 không có execution.
  Nội dung và ngưỡng **không đổi**. Không tự cho là trigger đã nổ.
- Leader review PR #8 **thay Bế Quốc Khánh** vì cậu ấy vắng — ghi rõ trong sign-off cột L.

### Blocker

| Trạng thái | Blocker |
|---|---|
| **Đã đóng** | PR practice của Trung chưa tồn tại → đã mở và merged |
| **Đã đóng** | PR #4 không ai review → Trung đã `APPROVED` |
| **Mở** | Ô `A/C/G/J` của ba thành viên — chỉ leader chấm được |
| **Mở** | Khánh vắng hai ngày liên tiếp |

### Forecast

`Day 30 = 2026-10-09` — **còn khả thi, nhưng không còn dư địa.** Buffer **1/2**. Spike D là P0 trên
critical path và **vẫn chưa chạy sang ngày thứ hai**.

---

## DAY 1 — 2026-09-10 · **`TRƯỢT`**

> **Ngày execution đầu tiên trôi qua với 0 spike chạy, 0 `started_at`, 0 bằng chứng spike.**
> Ghi lại đúng như vậy, không xoá khỏi lịch sử.

### Đã xong — nhưng đều là việc quản lý, không phải execution

| Ai | Việc | Bằng chứng |
|---|---|---|
| Vũ Hùng Anh | Merge PR #1 và #3 | `01ab6a0`, `b28921f` |
| Project Control | Bộ control Day-01: runbook, status, cheatsheet, EOD template, 4 task packet | `365e53e` (PR #5) |
| Project Control | Bỏ luật "cấy lỗi" trong `practice/README.md`; ghi tu chính drill §0 | `365e53e` |
| Project Control | Dashboard Phase A lên GitHub Pages | `365e53e`, `ba82f7b` |
| Project Control | **`MASTER_PLAN_30_DAYS.md`** — baseline 30 ngày có điều kiện | `f74e045` (PR #6) |
| Project Control | **`PROJECT_STATE.yaml`** — bắt buộc theo `15` §4, trước đó thiếu hoàn toàn | `f74e045` |
| Phạm Tuấn Anh | Chấp nhận baseline §14; `R6` và `R7` đạt | `3d80e12` |
| Project Control | Checklist Day-1 Phần B 12/12, B.1 12/12, Phần C 6/6 | `3d80e12`, `e913560` |

### Vì sao trượt

Cả ngày dùng để đóng nợ Day 0 và bài drill Git. **Một bài tập onboarding đã chặn critical path.**
Cutover không xảy ra được vì `R1`–`R4` phụ thuộc hành động của Khánh và Trung; Khánh **0 hoạt động**,
Trung **0 hoạt động** trong ngày 10/09.

### Hệ quả đã ghi

- **Buffer 2 → 1.** Giữ `Day 30 = 09/10` nên ngày mất nén vào buffer thay vì đẩy hạn.
- **Trigger DR-001 quá hạn mà không được đánh giá** → **DR-001a**.
- Luật rút ra, ghi vào runbook: **không nghi thức onboarding nào được chặn critical path quá một ngày**.

---

## DAY 0 — 2026-09-09 · `MỘT PHẦN`

### Đã xong

| Ai | Việc | Bằng chứng |
|---|---|---|
| Project Control | Bộ onboarding 13 file | `53d6913` |
| Project Control | Dashboard Day-0 lên Pages | `d5aa460` |
| Project Control | Scaffold `practice/` cho bài drill | `21f6f15` |
| Cả ba thành viên | Nhận quyền truy cập repo | Hùng Anh 10:13 · Trung 12:46 · Khánh 14:06 |
| Phạm Tuấn Anh | Qua cửa kiến thức Day-0 (5 lĩnh vực); PR #1 mở | `262a549`, sign-off §0 |
| Vũ Hùng Anh | PR #3 practice; PR #2 tài liệu 3D mesh/FPS 337 dòng | PR #3, `2096a35` |
| Bế Quốc Khánh | PR #4 practice, file đủ 7 field | PR #4 |
| Project Control | Sign-off tạm của leader (9/11) | `832509c` |

### Còn tồn khi hết ngày

Bài drill chưa đóng · sign-off 3/4 người trống · §5 chưa điền · PR của Trung chưa tồn tại.

### Vấn đề ghi trong ngày

Trên PR #1, reviewer **push commit `9cccefc` vào nhánh của tác giả để tạo ra lỗi**, rồi yêu cầu sửa chính
lỗi đó. Nguyên nhân gốc: `practice/README.md` và runbook yêu cầu mỗi người **phải nhận** một `NEEDS_FIX`.
Đã sửa bằng tu chính §0 và bỏ luật đó khỏi README.

---

**Liên quan:** [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) · [`MASTER_PLAN_30_DAYS.md`](MASTER_PLAN_30_DAYS.md)
· [`day01/DAY01_RUNBOOK.md`](day01/DAY01_RUNBOOK.md) · [`day01/DAY01_STATUS.md`](day01/DAY01_STATUS.md)
· [`onboarding/DAY0_SIGNOFF.md`](onboarding/DAY0_SIGNOFF.md)
