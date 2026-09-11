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
| Ngày hôm nay | **Day 3 — 2026-09-12** |
| Ngày còn lại tới Day 30 | **28** |
| **Buffer còn** | **1 ngày** *(dự trù 2, đã tiêu 1 vì Day 1 trượt)* |
| Cutover | **đã xảy ra** — 2026-09-11 12:00 +07:00 |
| Đồng hồ DR-001 | **đang chạy** |
| Trigger DR-001 | ✅ **đã đánh giá 2026-09-11 23:44 — KHÔNG nổ** |
| Ngưỡng leo thang | mất thêm **1** ngày → buffer = 0 → `15` §18 trigger 2 kích hoạt |
| `15` §18 | ⚠ **trigger 3 ĐÃ THOẢ** — xem [`incidents/INC-001`](incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md) |

---

## DAY 3 — 2026-09-12 · `ĐANG MỞ`

**Gói nhiệm vụ từng người:** [`day03/tasks/`](day03/tasks/)

### Điều kiện để Day 3 KHÔNG trượt

Ba việc. Không đủ ba thì ngày này tính là trượt, bất kể làm được gì khác.

| # | Điều kiện | Ai | Vì sao là điều kiện chứ không phải mong muốn |
|---:|---|---|---|
| 1 | **`DATASET_AUDIT.md` + `dataset_manifest.json` land trên `main`**, do Khánh commit | Bế Quốc Khánh | P0 critical path. Gói đã tải xong, dụng cụ đã dựng xong — không còn lý do bên ngoài nào |
| 2 | **Hai ô `NOT_CHECKED` của Trung đóng** — Mac mini bật được, ZeroTier lên trên cả hai máy | Nguyễn Gia Đức Trung | Cổng vào `GATE 2`. Ba ngày chưa ai xác nhận |
| 3 | **4 PR treo có review thật** | cả ba | Hàng đợi tắc hoàn toàn. `15` §11: *"silence is not approval"* |

### Đã xong

*(chờ bằng chứng — ô này chỉ được ghi khi có SHA, số PR, hoặc đường dẫn file đã commit)*

| Ai | Việc | Bằng chứng |
|---|---|---|
| | | |

### Còn tồn — mang sang từ Day 2

| Ai | Việc | Hạn |
|---|---|---|
| **Bế Quốc Khánh** | Audit `A1`–`A20` trên gói đã có · xác nhận đĩa trống + thư viện NRRD **trên máy bạn** · khai báo compute ML (`C0-1`) · review một PR thật *(cột `B` sign-off vẫn mở)* | trong Day 3 |
| **Nguyễn Gia Đức Trung** | Mac mini + ZeroTier · review PR #16 | trong Day 3 |
| **Vũ Hùng Anh** | Nhận/thay bộ geometry fixture + công bố format · review PR #13 và #15 · PR nhỏ thêm dòng `Reviewer:` | trong Day 3 |
| **Phạm Tuấn Anh** | Đo lại `A9` ở 576×576 · ký §9 profile DR-006 · `guardrails.yml` · tu chính hàng đợi thiết bị | trong Day 3 |

---

## DAY 2 — 2026-09-11 · **`MỘT PHẦN`** — ngày execution đầu tiên

> **Kết quả ngày:** gỡ được bế tắc bên ngoài lớn nhất của dự án (dataset), nhưng **không tiêu chí
> nghiệm thu nào của bất kỳ spike nào được đóng**, và **ba trên bốn thành viên không có hoạt động nào
> sau cutover**. Chi tiết: [`day02/DAY02_EOD_REVIEW.md`](day02/DAY02_EOD_REVIEW.md) ·
> [`incidents/INC-001`](incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md)

### Đã xong

| Ai | Việc | Bằng chứng |
|---|---|---|
| Phạm Tuấn Anh | Tuyên bố cutover execution, 12:00 +07:00 | `DAY01_CUTOVER_RECORD.md`, `d5d8ef7` |
| Project Control | Chuyển D/A/B/E sang `ACTIVE`, `started_at` thật | `413fa8d` |
| Phạm Tuấn Anh | **Profile thiết bị DR-006** chụp thật từ Galaxy A17 | `6d0ae77` + `9e1270c` |
| Phạm Tuấn Anh | **Spike A `A9` p95 = 65,31 ms** — phép đo hiệu năng đầu tiên của dự án | PR #13, `c9290b0` |
| **Phạm Tuấn Anh** | **Thu thập gói LASC 2018** — 2 200 962 438 byte, SHA-256 `bee5ee5b…`, 100 + 54 case, giải nén và xác minh 12/12 volume load được | `day02/dr001_usability_probe.json` |
| **Project Control** | **Trigger DR-001 đánh giá 23:44 — KHÔNG nổ** | `day02/DAY02_EOD_REVIEW.md` §4 |
| Project Control | Dụng cụ validate Spike D — 15/20 tiêu chí cơ khí hoá, 4 tiêu chí **từ chối trả lời hộ** | PR #14, `96c89f4` |
| Project Control | Harness Spike B + **bản đề xuất** geometry fixture, 32/32 điểm exact | PR #15, `c3a4719` |
| Project Control | Stub + client harness + aggregate Spike E, smoke 98/98 | PR #16, `a356772` |
| Project Control | **`INC-001`** — biên bản sự kiện và tuyên bố recovery `15` §18 | `incidents/INC-001` |
| Project Control | **`DAY02_EOD_REVIEW`** — bản EOD review đầu tiên được điền của dự án (`15` §15) | `day02/DAY02_EOD_REVIEW.md` |
| Nguyễn Gia Đức Trung | Review PR #4 của Khánh — `APPROVED` *(trước cutover)* | API review 03:13:39Z |
| Nguyễn Gia Đức Trung | PR #8 practice bản sạch được merge *(trước cutover)* | `39fb7af` |
| Bế Quốc Khánh | PR #4 được merge *(trước cutover)* | `c4499bd` |

### Còn tồn

| Ai | Việc | Vì sao chưa xong | Hạn |
|---|---|---|---|
| **Bế Quốc Khánh** | Audit `A1`–`A20` Spike D | **0 hoạt động sau cutover.** Gói và dụng cụ giờ đã sẵn | Day 3 |
| **Bế Quốc Khánh** | Đĩa trống + thư viện NRRD **trên máy bạn** | `NOT_CHECKED` ba ngày. Không ai xác nhận hộ được | Day 3 |
| **Bế Quốc Khánh** | Khai báo compute ML (`C0-1`) | `ml_compute.declared: UNVERIFIED` | Day 3 |
| **Bế Quốc Khánh** | Review PR thật của đồng đội — cột `B` | vắng 10/09, 11/09 | khi làm |
| **Nguyễn Gia Đức Trung** | Mac mini bật được + ZeroTier trên cả hai máy | **0 hoạt động sau cutover.** Đây là cổng vào `GATE 2`, không phải điện thoại | Day 3 |
| **Vũ Hùng Anh** | Bộ canonical geometry fixture | **0 hoạt động cả ngày.** Bản đề xuất đã có ở PR #15 để nhận hoặc thay | Day 3 |
| **Vũ Hùng Anh** | Dòng `Reviewer:` trong `PRACTICE_VU_HUNG_ANH.md` trên `main` | nợ kỹ thuật từ Day 0 | Day 3 |
| **Cả ba** | Review 4 PR đang treo | hàng đợi trống hoàn toàn | Day 3 |
| **Phạm Tuấn Anh** | Đo lại `A9` ở kích thước slice thật | `A6` sơ bộ mới có tối nay | Day 3 |
| **Phạm Tuấn Anh** | Ký §9 profile DR-006 · `guardrails.yml` · tu chính hàng đợi thiết bị | — | Day 3 |

### Quyết định ghi trong ngày

- **Trigger DR-001: KHÔNG nổ.** Có gói chính thức dùng được trên máy cục bộ lúc 23:41:51.
- **`15` §18 recovery kích hoạt** — Level 1 cho đúng việc thu thập dataset, Level 5 de-scope kế hoạch
  ngày. **Quyền sở hữu không chuyển cho ai.** Lý do đầy đủ: `INC-001` §4.
- **Ranh giới của đêm phục hồi:** sinh **dụng cụ**, không sinh **bằng chứng của người khác**. Không
  `RESULT.md` nào cho D/B/E/C, không cờ `EVIDENCE_READY`, không commit dưới tài khoản người khác.
- **Bộ geometry fixture dựng thành bản đề xuất có nhãn**, đặt ngoài `tests/fixtures/geometry/**` —
  DR-013 giao đường đó cho Vũ Hùng Anh và format là quyền cậu ấy quyết.
- **Máy Galaxy A17 không bàn giao** — tài sản cá nhân của leader. Cần tu chính `WIP-CONFLICT-02`, ghi
  là nợ quản trị mang sang Day 3. Không chặn ai hôm nay vì `GATE 2` chưa mở.

### ⚠ Phát hiện đổi kế hoạch

- **Kích thước slice thật là 576×576 hoặc 640×640**, không phải 64×64 như fixture Spike A. Con số
  `A9` = 65,31 ms **không còn đại diện** — nhiều hơn 81–100 lần số pixel. Đo lại là ưu tiên cao.
- **Testing Set CÓ `laendo.nrrd`** — liên quan `A12` / `RA-H02` và ảnh hưởng lựa chọn Path A/B (DR-002).
- **Giá trị mask là `0` và `255`**, không phải `0`/`1`. Code giả định `==1` sẽ ra mask rỗng.
- **`lawall.nrrd` tồn tại** — `06` §2 cấm dùng làm target khi chưa xác minh provenance.
- **`space directions` là ma trận đơn vị** — header có thể không mang spacing vật lý thật. `06` §4:
  metric thể tích tuyệt đối **bị vô hiệu** cho tới khi geometry được validate.

*(Cả năm quan sát trên **4 / 154 case**. Câu trả lời toàn cohort thuộc về Bế Quốc Khánh.)*

### Blocker

| Trạng thái | Blocker |
|---|---|
| **Đã đóng** | Gói dataset chưa có trên máy → đã tải, đã xác minh |
| **Đã đóng** | Không có dụng cụ validate dataset → PR #14 |
| **Đã đóng** | Bộ geometry fixture chưa tồn tại → PR #15 (đề xuất) |
| **Đã đóng** | Không có stub/harness Spike E → PR #16 |
| **Mở** | Đĩa trống + thư viện NRRD của Khánh — **chỉ Khánh** |
| **Mở** | Mac mini + ZeroTier của Trung — **chỉ Trung** |
| **Mở** | Compute ML chưa khai báo — **chỉ Khánh** |
| **Mở** | 4 PR mở, **0 review submit** |

### Forecast

`Day 30 = 2026-10-09` — **còn khả thi.** Buffer **1/2**. Critical path **không còn bị chặn bởi yếu tố
bên ngoài**; từ đây nó chỉ còn phụ thuộc vào việc chủ sở hữu có chạy hay không.

Màu trạng thái: 🟠 **AMBER** — `15` §16. Không RED vì bế tắc bên ngoài lớn nhất đã gỡ và có bằng chứng
thật. Không GREEN vì **0 tiêu chí nghiệm thu nào được đóng** và ba người không sản xuất gì sau cutover.

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
