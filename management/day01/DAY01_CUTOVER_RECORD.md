# EXECUTION CUTOVER RECORD

> **File này chỉ được tạo một lần, tại đúng thời điểm leader tuyên bố.** Nó không tồn tại trước đó, và
> commit tạo ra nó **đứng trước** mọi thay đổi trạng thái spike. Thứ tự đó chứng minh được từ `git log`.

---

## 1 · Tuyên bố

```
Tôi, Phạm Tuấn Anh — Team Leader, tuyên bố

    EXECUTION BẮT ĐẦU

Ngày:  2026-09-11        Giờ (local, UTC+7):  12:00
```

| Mục | Giá trị |
|---|---|
| **Giờ cutover** | **2026-09-11 12:00 +07:00** (`2026-09-11T05:00:23Z`) |
| `main` SHA tại thời điểm tuyên bố | `9cc1f55479f77d4b6817d5d61aa79617c9d79aa5` |
| Người tuyên bố | Phạm Tuấn Anh — Team Leader |
| Ghi bởi | Project Control, theo chỉ thị tường minh của leader |

**Mọi `started_at` phải ≥ giờ trên. Không lùi ngày, không suy diễn.**

---

## 2 · Hoàn cảnh — ghi đúng, không làm đẹp

**Đây là cutover của Day 2, không phải Day 1.**

| | |
|---|---|
| `Day 1` | **2026-09-10 — ĐÃ TRƯỢT.** 0 spike chạy, 0 `started_at`, 0 bằng chứng spike |
| `Day 2` | **2026-09-11 — hôm nay.** Execution thực sự bắt đầu từ giờ ghi ở §1 |
| `Day 30` | **2026-10-09 — KHÔNG lùi.** Leader quyết giữ deadline cố định |
| **Buffer** | **1 / 2 ngày.** Ngày mất ăn vào buffer thay vì đẩy hạn |

Ngày Day 1 đã được ghi trong `MASTER_PLAN_30_DAYS.md` §1 từ 10/09, nhưng **tuyên bố chưa bao giờ xảy
ra** — không có file này, `ACTIVE=0`, `started_at` 7/7 `null`, `dr_001_clock_running: false`. Cả ngày
10/09 dùng để đóng nợ Day 0 và bài drill Git.

> **Cảnh báo đang bật:** buffer còn **một** ngày cho 29 ngày còn lại. Mất thêm một ngày nữa là buffer
> bằng 0 và `15` §18 recovery trigger 2 kích hoạt.

---

## 3 · Ảnh chụp cửa READY — kiểm bằng máy lúc 12:00

| # | Điều kiện | Kết quả | Cách kiểm |
|---|---|---|---|
| **R1** | Bốn PR practice merged | **✅ 4/4** | `gh api .../pulls/{1,3,4,8} --jq .merged` → `true` ×4 |
| **R2** | Tham gia hợp lệ chu trình review | **✅ có điều kiện** | #1 `scalliontor:CHANGES_REQUESTED` · #3 `Drake-Phamta:CHANGES_REQUESTED` · #4 `TrungNGD195:APPROVED` · #8 `Drake-Phamta:APPROVED`. **Khánh thiếu vai reviewer** → `NEEDS_CLARIFICATION`, không chặn Spike D |
| **R3** | Cột `K` = `PASS` ×4 | **✅ 4/4** | `DAY0_SIGNOFF.md` |
| **R4** | §5 tổng hợp + chữ ký | **✅ ĐÃ KÝ** 2026-09-11 | `DAY0_SIGNOFF.md` §5, kết luận `SẴN SÀNG CÓ ĐIỀU KIỆN` |
| **R5** | Checklist Day-1 A/B/B.1/C/D | **✅** | A: 10 `PASS` + **A8 `NEEDS_CLARIFICATION`** · B 12/12 · B.1 12/12 · C 6/6 · D 7/7 |
| **R6** | Baseline tồn tại + được chấp nhận | **✅** | `MASTER_PLAN_30_DAYS.md` §14, 2026-09-10 |
| **R7** | Baseline không đóng băng gì phụ thuộc bằng chứng | **✅** | §8 liệt kê 7 mục còn mở; quét không thấy cách diễn đạt chốt sẵn |
| **R8** | Trạng thái spike hợp lệ | **✅** | `ACTIVE=0` `ACCEPTED=0` `PREPARED=6` `BLOCKED=1` `started_at: null` ×7 |
| **R9** | Spec + không bằng chứng bịa | **✅** | spec **19/19 OK** · `RESULT.md`=0 · `DATASET_AUDIT.md`=0 · `data/manifests/`=0 |

**Hai điều kiện qua có điều kiện, ghi rõ chứ không làm tròn lên:**

- **`R2`** — Bế Quốc Khánh mở PR #4 và được Trung approve, nhưng **chưa review PR của ai**. Cậu ấy vắng
  cả 10/09 và 11/09 nên leader đã review PR #8 thay. Cột `B` của cậu ấy là `NEEDS_CLARIFICATION`, đóng
  khi cậu ấy review một PR thật của đồng đội.
- **`A8`** — bốn mục phần cứng chưa ai xác nhận: đĩa trống và thư viện NRRD của Khánh, Mac mini và
  ZeroTier của Trung. **Không chặn tuyên bố, nhưng chặn bước 1 của Spike D và cổng GATE 2 của Spike E
  trên thực tế.**

---

## 4 · Bốn tu chính có hiệu lực từ thời điểm này

### 4.1 · Tu chính bài drill Git

Bản gốc đòi mọi người **nhận** và **đưa** một `NEEDS_FIX`. Thay bằng: reviewer chỉ `CHANGES_REQUESTED`
khi **có lỗi thật**; PR đúng thì `APPROVE` thẳng; drill chấm trên **tham gia hợp lệ**.
Toàn văn: [`../onboarding/DAY0_SIGNOFF.md`](../onboarding/DAY0_SIGNOFF.md) §0.

### 4.2 · Override §D.3 — một người ghi central state

`DAY1_READINESS_CHECKLIST.md` §D.3 ghi *"mỗi chủ sở hữu tự làm cho spike của mình"*. **Bị override:** chỉ
**leader / Project Control** được sửa `../spikes/SPIKE_PHASE_STATE.yaml`, `DAY01_STATUS.md` và
`../DAY_LOG.md`. Bốn nhánh cùng chạm một YAML vừa gây conflict vừa làm chuyển trạng thái mất tính nguyên
tử.

### 4.3 · Thứ tự đo thiết bị — `A → E → B`

`WIP-CONFLICT-02` và PHẦN E ghi `A → B → E`. Đổi thành **`A → E → B`**: Spike B có nhiều giờ việc không
cần máy để lấp chỗ chờ, còn Spike E gating vào chính khả năng máy tới được backend.

### 4.4 · DR-003a — overlay chuẩn là **ZeroTier**

Trung đề xuất 10/09, leader duyệt. Mọi phần thực chất của DR-003 giữ nguyên: profile `LOCAL_DEMO`,
backend vật lý ở xa, **trust boundary là overlay membership chứ không phải mạng vật lý**, venue Wi-Fi
không tin cậy và không cần thiết, **`E1` acceptance evidence phải đo trên cellular thật + overlay, LAN
chỉ là diagnostic**. Không phải sửa spec — `docs/specs/v1.0/**` vốn không nêu tên sản phẩm overlay nào.
Toàn văn: [`../readiness/OPEN_DECISIONS.md`](../readiness/OPEN_DECISIONS.md) Part 2b.

---

## 5 · Đồng hồ DR-001

**Bắt đầu từ giờ ghi ở §1: `2026-09-11 12:00 +07:00`.**

Theo **DR-001a**, trigger được đánh giá vào **cuối Day 2 hôm nay** thay vì cuối Day 1, vì Day 1 không có
execution. **Nội dung và ngưỡng của trigger không đổi:**

> Nếu tới **cuối ngày execution**, **không có gói chính thức dùng được trên máy cục bộ**, **hoặc**
> validation gói/provenance lộ **một defect chặn việc nghiệm thu `GATE-DATA-01`** — thì **`RA-H01` leo
> lên BLOCKER** và **quy trình dự phòng dataset mở ra**.

**Không âm thầm thay dataset khác** — thay dataset cần đủ chuỗi `00` §13.

> ⚠ **Đây là lần đánh giá thứ hai.** Lần thứ nhất trượt vì execution chưa bắt đầu. Nếu tối nay vẫn
> không được đánh giá thì nó đã trượt hai ngày liên tiếp và mất hoàn toàn tác dụng bảo vệ — lúc đó là
> vấn đề project-control, không còn là câu hỏi dataset.

---

## 6 · Chuyển trạng thái ngay sau commit này

Do **Project Control** thực hiện, **một commit duy nhất**, ngay sau khi file này được commit:

| Spike | Từ | Sang | `started_at` |
|---|---|---|---|
| `SPIKE_D` | `PREPARED` | **`ACTIVE`** | `2026-09-11T12:00+07:00` |
| `SPIKE_A` | `PREPARED` | **`ACTIVE`** | `2026-09-11T12:00+07:00` |
| `SPIKE_B` | `PREPARED` | **`ACTIVE`** | `2026-09-11T12:00+07:00` |
| `SPIKE_E` | `PREPARED` | **`ACTIVE`** | `2026-09-11T12:00+07:00` |
| `SPIKE_C0` | `PREPARED` | `PREPARED` | `null` — **không** thành primary thứ hai |
| `SPIKE_F` | `PREPARED` | `PREPARED` | `null` — **không** thành primary thứ hai |
| `SPIKE_C1` | `BLOCKED` | **`BLOCKED`** | `null` — `blocked_by: [SPIKE_D]` |

---

## 7 · Việc đầu tiên của từng người, từ bây giờ

| Người | Việc đầu tiên |
|---|---|
| **Bế Quốc Khánh** | **Xác nhận đĩa trống + thư viện NRRD trước**, rồi §Day-one bước 1: tải gói từ nguồn chính thức. **Đánh giá trigger DR-001 và báo leader trước cuối ngày** |
| **Phạm Tuấn Anh** | **Chụp profile thiết bị DR-006 từ Galaxy A17 5G** — tiền đề của cả Spike A, B và E. Rồi nhả máy |
| **Vũ Hùng Anh** | Bộ **canonical geometry fixture** theo DR-008a, và **công bố format sớm** — Spike A và Spike F đều chờ |
| **Nguyễn Gia Đức Trung** | Mac mini backend stub + **ZeroTier**, xác minh máy tới được qua cellular. **Không ngồi chờ máy** |

---

**Liên quan:** [`DAY01_RUNBOOK.md`](DAY01_RUNBOOK.md) · [`DAY01_STATUS.md`](DAY01_STATUS.md) ·
[`../DAY_LOG.md`](../DAY_LOG.md) · [`../MASTER_PLAN_30_DAYS.md`](../MASTER_PLAN_30_DAYS.md) ·
[`../spikes/SPIKE_PHASE_STATE.yaml`](../spikes/SPIKE_PHASE_STATE.yaml)
