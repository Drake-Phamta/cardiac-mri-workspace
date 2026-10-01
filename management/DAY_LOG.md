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
| Ngày hôm nay | **Day 11 — 2026-09-20** |
| Ngày còn lại tới Day 30 | **20** |
| **Buffer còn** | 🔴 **−3 ngày** *(dự trù 2 — tiêu 1 vì Day 1, 1 vì Day 3, 1 vì Day 6, 1 vì Day 9, 1 vì Day 10)* |
| Màu trạng thái | 🔴 **RED** |
| Cutover | **đã xảy ra** — 2026-09-11 12:00 +07:00 |
| Đồng hồ DR-001 | **đang chạy** |
| Trigger DR-001 | ✅ **đã đánh giá 2026-09-11 23:44 — KHÔNG nổ** |
| Ngưỡng leo thang | **đã vượt — buffer âm từ 16/09.** Hạn Day 30 không lùi: ngày mất thêm phải bù bằng thực thi |
| `15` §18 | 🔴 **ĐÃ NỔ, 3/5 điều kiện** — buffer −3 · `GATE-SPLIT-01` sống qua **hai** chu kỳ EOD với chủ sở hữu **không hoạt động** · 10/30 ngày hết mà `MUST` **0/33**. Mức áp dụng là **quyết định của leader**, đang `PENDING` — [`day10/DAY10_EOD_REVIEW.md`](day10/DAY10_EOD_REVIEW.md) §11 |
| Level 5 de-scope | **chưa tuyên bố** — `15` §414 là quyết định của leader. Và `DAY03_EOD_REVIEW` §11 cho thấy nó **mua 0 ngày** |
| Mốc đang chạy | ✅ **M3 (Day 6–9) ĐÓNG** 20/09 17:18 (`40498e5`), muộn 1 ngày · **M2 (Day 4–6) quá hạn 5 ngày** — `GATE-MOB-01` còn mở · **M4** (Day 8–12) — `GATE-SPLIT-01` chưa động, sang ngày thứ 4 · **M5** (Day 9–20) — có `app/` nhưng **chưa lên `main`** |

---

## DAY 11 — 2026-09-20 · `ĐANG MỞ` — ngày mở van

**Kế hoạch:** [`day11/DAY11_PLAN.md`](day11/DAY11_PLAN.md) · **Gói từng người:** [`day11/tasks/`](day11/tasks/)

> **Lập lúc 17:50, và bản kế hoạch nói thẳng điều đó** — còn ~6 giờ, nên nó không giả vờ là kế hoạch một
> ngày đầy đủ. Hôm nay **không thêm việc mới**: mục tiêu duy nhất là đưa thứ **đã làm xong từ hôm qua** lên
> `main`. Năm PR CI xanh đang chờ **đúng hai lượt duyệt**; chồng `#48 → #50 → #51 → #52` tuyến tính và
> `merge-tree` báo gộp sạch, nên **một lượt duyệt của Khánh mở khoá bốn PR**.

| # | Điều kiện | Loại |
|---|---|---|
| 1 | **M5 có mã thật trên `main`** — #48 + #50 + #51 + #52 merged | 🔒 cam kết |
| 2 | **Spike A `EVIDENCE_READY`** — #41 và #49 merged | 🔒 cam kết |
| 3 | **Spike A `ACCEPTED`** đủ 4 bước, **bước 3 do Trung chạy** | 🎯 cố gắng |
| 4 | **`GATE-SPLIT-01` `CLOSED`** | 🎯 cố gắng |
| 5 | `GATE-MOB-01` `CLOSED` | ⏭ chuyển Day 12 |

**Đã làm trước khi kế hoạch viết xong** *(17:44 → 17:55)*: gắn reviewer cho **#41, #50, #51, #52** — bốn PR
này **không có người duyệt nào**, tức vô hình trong hàng đợi của mọi người · cập nhật **`RESULT.md` Spike A**
(`a970167`) với kết quả `S8`, vì nó còn ghi `A8`/`A10`/`A11` là `NOT MEASURED` và Hùng Anh sẽ **không có gì
để duyệt**.

---

## DAY 10 — 2026-09-19 · ❌ **`TRƯỢT` 1,25/4** — `app/` ra đời nhưng **không lên được `main`**

**Bản chốt:** [`day10/DAY10_EOD_REVIEW.md`](day10/DAY10_EOD_REVIEW.md) *(chốt muộn 17 h 20 ph, 20/09 ~17:20)* ·
**Nguyên nhân:** [`incidents/INC-002_DAY10_TEAM_INCIDENT.md`](incidents/INC-002_DAY10_TEAM_INCIDENT.md) —
cả nhóm gặp sự cố. **Verdict `TRƯỢT` giữ nguyên** (verdict đo kết quả, không đo nỗ lực; ngày mất vẫn ăn
buffer), nhưng nguyên nhân được ghi để không ai đọc thành hai người bỏ việc.

### Đã xong — có bằng chứng truy được

| Việc | Ai | Bằng chứng |
|---|---|---|
| Merge #31 — ba xung đột thật trong `App.js` giải bằng tay | leader | `11000f1` |
| **`app/core`** — tầng trung lập nền tảng, 10 script test, **137 kiểm**, 2 job CI mới | leader | **#48**, CI 7/7 · *chưa merge* |
| **Chặng `S8`** — lưu/nạp lại (`A8`) + 2 script kết luận `A10`/`A11` | leader | **#49** · *chưa merge* |
| **Phiên đo `S8` trên A17** — `A8`, `A10`, `A11` đều `OBSERVED` | leader (bấm máy) | `EVIDENCE_RAW/SESSION_S8_RECORD.md` · `a8_save_reload_*.json` · `a10_a11_brush_feedback_*.json` |
| Bộ **QA-004** cho Spike A | leader | `2da85b5` |
| **`DR-010a`** mở — không endpoint nào trả "lát cắt tệ nhất" | leader | `b7a3e1d` |
| **Duyệt #47** → mở khoá M3 | **Trung** | `APPROVED` 21:40 |
| **Fixture sinh từ hợp đồng** — scenario cho **28/28** endpoint + 3 `stale_revision` | **Trung** | **#50**, CI 7/7 · *chưa merge* |
| **Mô hình V4** review/correction, test 4/4 | **Trung** | **#51**, CI 7/7 · *chưa merge* |
| Gói bằng chứng `TC-TEAM-001` | **Trung** | **#52**, CI 7/7 · *chưa merge* |
| `CHANGES_REQUESTED` trên #44 | **Trung** | review 21:40 |

### Còn tồn

| Việc | Ai | Vì sao |
|---|---|---|
| `GATE-SPLIT-01` — #35 vẫn DRAFT từ 15/09 | **Khánh** | **0 commit, 0 review, 0 comment cả ngày** |
| Duyệt #48 → mở khoá cả chồng #50/#51/#52 | **Khánh** | như trên |
| Diễn giải `B10`/`B11` → `GATE-MOB-01` | **Hùng Anh** | **0 commit, 0 review, 0 comment cả ngày** |
| Duyệt lại #41 · duyệt #49 · sửa #44 | **Hùng Anh** | như trên |
| Merge #47 | leader | làm muộn, **20/09 17:18** |
| Quyết `DR-010a` | leader | chưa |

> **Sự thật quyết định ngày này: hai trên bốn thành viên không chạm vào repo.** Commit cuối của Hùng Anh
> 18/09 15:12, của Khánh 18/09 11:44 — tới lúc chốt bản này là **gần hai ngày**. **Năm trên bảy blocker**
> nằm ở hai người đó. Ngày có tiến bộ kỹ thuật thật, nhưng **mọi đường lên `main` đều đi qua một lượt duyệt
> không xảy ra**. `15` §18 đã nổ; xem [`day10/DAY10_EOD_REVIEW.md`](day10/DAY10_EOD_REVIEW.md) §11.

---

## DAY 10 — kế hoạch đã đặt ra lúc đầu ngày

**Gói nhiệm vụ từng người:** [`day10/tasks/`](day10/tasks/)

> **Day 9 trượt 1,5/4, buffer −2**, nhưng `GATE-DATA-01` đã đóng và Spike D là `ACCEPTED` đầu tiên. **Bức tranh 21 ngày
> còn lại:** hết 9/30 ngày mà **`app/` chưa tồn tại**, `MUST` vẫn 0/33, và **M2 quá hạn từ Day 6** vì `GATE-MOB-01` còn
> mở. Vì vậy Day 10 nhắm đúng ba nút: đóng nốt M3, đóng `GATE-SPLIT-01` để `SPIKE_C1` chạy được, và **nghiệm thu Spike A
> + Spike B để viết `TECH_STACK_ADR`** — thứ mở khoá cho cả bốn vertical cùng lúc.

### Điều kiện để Day 10 KHÔNG trượt

| # | Ai | Điều kiện | Mở khoá gì |
|---|---|---|---|
| 1 | **Trung → leader** | **M3 đóng**: #47 duyệt và merge, CI chạy test cả bốn hợp đồng | M3 hết quá hạn |
| 2 | **Khánh → Trung → leader** | **`GATE-SPLIT-01` đóng**: #35 sinh lại trên manifest mới, duyệt lại, merge | `SPIKE_C1` chạy được → M4 |
| 3 | **Hùng Anh · Trung · leader** | **`GATE-MOB-01` đóng**: Spike A và Spike B `ACCEPTED` đủ 4 bước → leader viết `TECH_STACK_ADR` | M2 đóng; bốn vertical có nền tảng đã quyết |
| 4 | **cả nhóm** | **M5 có mã thật**: bộ khung `app/` trên `main` + fixture sinh từ hợp đồng + **ba PR vertical** (V1, V2, V4) chạy trên fixture | sản phẩm bắt đầu tồn tại |

### Khối lượng

| Người | Phần chính | Dự phòng | Việc chặn người khác, làm trước |
|---|---|---|---|
| **Vũ Hùng Anh** | 8 h | 1,75 h | diễn giải `B10`/`B11` · merge `main` vào #44 · duyệt lại #41 · duyệt #31 |
| **Nguyễn Gia Đức Trung** | 8 h | 2,25 h | **duyệt #47** (M3 treo trên đúng lượt này) · duyệt #44 · duyệt lại #35 · fixture cho cả ba vertical |
| **Bế Quốc Khánh** | 8 h | 2 h | **sinh lại split #35** (chặn cổng, chặn `SPIKE_C1`) |
| **Phạm Tuấn Anh** | không giới hạn | — | **dựng `app/` trước 11:00** · merge · QA hai spike · `TECH_STACK_ADR` |

---

## DAY 9 — 2026-09-18 · ❌ **`TRƯỢT` 1,5/4** — nhưng `GATE-DATA-01` **ĐÓNG** và Spike D `ACCEPTED`

**Chốt muộn 2026-09-19 ~02:30** · bản đầy đủ: [`day09/DAY09_EOD_REVIEW.md`](day09/DAY09_EOD_REVIEW.md)

| Điều kiện | Kết quả |
|---|---|
| 1 · `GATE-DATA-01` | ✅ **đóng 21:40** — #34 merge 21:30, QA-003 `PASS` trên `main`, Spike D `ACCEPTED` qua đủ 4 bước. Lượt duyệt lại về 14:50, trễ hạn 11:00 |
| 2 · M3 | ❌ bốn hợp đồng đã lên `main`, nhưng job CI **không có PR** cho tới khi leader mở #47 lúc 02:2x ngày 19 |
| 3 · `GATE-SPLIT-01` | ❌ định nghĩa nhóm bắc cầu đã thống nhất, nhưng split chưa sinh lại; #35 còn nháp |
| 4 · `B10`/`B11` | ⚠ **nửa** — 3 lượt đo hợp lệ trong WebView (thô trên `spike-b/evidence-20260918`), thiếu diễn giải của chủ Spike B |

**Ngày này có:** 6 PR merge · `ACCEPTED` đầu tiên của dự án · khung `E8` thứ hai (342/342 mẫu `ok`) · phiên `B10`/`B11` đầu tiên · quyết định `E10` `PROVISIONAL`. **Buffer −1 → −2.**


**Gói nhiệm vụ từng người:** [`day09/tasks/`](day09/tasks/)

> **Day 8 đạt 4/4 đúng hạn → buffer giữ −1**, nhưng critical path dừng ở **lượt duyệt lại #34**, ngày thứ hai liên tiếp
> dừng đúng ở một lượt review. Ba mốc chồng nhau hôm nay: **M3 hết hạn** · **M4** cần đóng hai cổng · **M5 bắt đầu** khi
> `GATE-MOB-01` còn mở. **Ba quyết định của leader trước khi lập kế hoạch:** `GATE-MOB-01` đo `B10`/`B11` trong WebView của
> app RN (hướng đo, chưa phải ADR) · #34 đóng băng ở `f118491` · SCR-04 giao cho V1. **Khối lượng:** mỗi thành viên
> **≥ 8 h việc thật + ~2 h dự phòng**, hạn 23:59, **nợ tồn làm trước**.

### Điều kiện để Day 9 KHÔNG trượt

Lần này điều kiện **ghi đích danh bước "duyệt lại" và "merge"**, không dừng ở "đã duyệt".

| # | Ai | Điều kiện | Mở khoá gì |
|---|---|---|---|
| 1 | **Vũ Hùng Anh → Phạm Tuấn Anh** | **Duyệt lại #34 trước 11:00** → merge → QA-003 chốt → Spike D `ACCEPTED` → **`GATE-DATA-01` đóng** | `SPIKE_C1` hết `BLOCKED` · điều kiện 3 |
| 2 | **Trung · Vũ Hùng Anh · Phạm Tuấn Anh** | **M3 đóng**: #43, #45, #39 **merge** với **một** chuỗi `dr008a-dr012/v1.0.0`; test của **cả bốn** hợp đồng chạy trong CI | M5 dựng trên hợp đồng đã chốt |
| 3 | **Khánh → Trung → Phạm Tuấn Anh** | **`GATE-SPLIT-01` đóng**: nhóm bắc cầu, sinh lại split trên manifest mới, Trung duyệt lại, merge #35 | `SPIKE_C1` được chạy |
| 4 | **Vũ Hùng Anh · Phạm Tuấn Anh (bấm)** | **`B10`/`B11` đo trên A17 trong WebView của app RN**, có JSON thô và diễn giải của chủ Spike B | bằng chứng `GATE-MOB-01` cho một ứng viên duy nhất |

⚠ Điều kiện 3 phụ thuộc điều kiện 1, nên #34 hẹn **11:00**.

### Khối lượng và thứ tự từng người

| Người | 🔴 Làm trước (nợ) | Việc chính Day 9 | Dự phòng | Giờ chính |
|---|---|---|---|---|
| **Vũ Hùng Anh** | ① **duyệt lại #34 trước 11:00** · ② sửa #43 (`relpath`, tính lại `picking_rays`, chốt chuỗi phiên bản) · ③ duyệt lại #26 | ④ **đóng gói viewer cho WebView** + protocol trong app, hẹn 18:00 · ⑤ diễn giải `B10`/`B11` · ⑥ `TC-TEAM-001` V2 | duyệt #41, #31 · fixture TP/FP/FN | **~8,5 h** |
| **Nguyễn Gia Đức Trung** | ① #45 đổi sang `dr008a-dr012/v1.0.0` · ② phản hồi duyệt lại #45/#39 · ③ duyệt #44 | ④ **test hợp đồng vào CI** (lối ra M3) · ⑤ mock sinh từ schema API · ⑥ đề xuất `E10` · ⑦ `TC-TEAM-001` V4 | `ADR-ART-001` · ma trận SCR-06/08 | **~8,5 h** |
| **Bế Quốc Khánh** | ① **nhóm bắc cầu** trên #35 · ② #35 hết nháp + sinh lại sau khi #34 merge · ③ #42 hết nháp · ④ PR follow-up #34 | ⑤ **`c1_preflight.py`** (phải `FAIL` khi gate mở) · ⑥ thiết kế SCR-01/SCR-07 · ⑦ phản hồi review #37 | preflight thật + `C1-1` nếu hai cổng đóng · `C0-3` | **~8,25 h** |
| **Phạm Tuấn Anh** | duyệt lại #45/#39 · review #37/#42/#33 · merge #34 → **QA-003 chốt** → `GATE-DATA-01` · merge #43/#45/#39 → **M3** · merge #35 → `GATE-SPLIT-01` | 14:00 đo `E8` ban ngày *(tuỳ chọn)* · PC dựng container WebView trước 16:00 · **~20:00 đo `B10`/`B11`** · `TC-TEAM-001` V1 + SCR-04 · chốt ngày | duyệt lại #31 · chặn cache ảnh Spike A | không giới hạn |

> **🎯 Chuẩn demo:** mỗi packet có dòng 🎯 dẫn về [`DEMO_STANDARD.md`](DEMO_STANDARD.md): Hùng Anh **H6–H7**, Trung **H8–H9**,
> Khánh **H1/H2/H10**, Phạm Tuấn Anh **H3–H5** (giờ gồm cả SCR-04).

### Đã xong — trong ngày

| Ai | Việc | Bằng chứng |
|---|---|---|
| *(chưa có)* | | |

---

## DAY 8 — 2026-09-17 · ✅ **`ĐẠT` 4/4 — theo chữ và đúng hạn** · critical path **chưa qua**

**Bản chốt đầy đủ:** [`day08/DAY08_EOD_REVIEW.md`](day08/DAY08_EOD_REVIEW.md) · **Gói nhiệm vụ:** [`day08/tasks/`](day08/tasks/)

> **Chốt 17/09 ~23:55.** Cả bốn điều kiện đạt trong hạn, **không cần ngoại lệ về giờ** như Day 5 và Day 7. Nhưng
> điều kiện 1 được đặt ra để mở khoá chuỗi *duyệt #34 → merge → QA → `GATE-DATA-01`*, và chuỗi đó **dừng ở lượt
> duyệt lại**. Buffer **giữ −1**. Chuỗi *phần việc của Khánh land sau nửa đêm* (Day 4–7) **đã dừng**. Tồn đọng đưa
> lên đầu Day 9 ở §13 của bản chốt — **chưa lập kế hoạch Day 9**.

> **Day 7 đạt 4/4 theo nội dung → buffer giữ −1.** Hôm nay critical path chỉ còn thiếu **một lượt review**: #34
> đã sẵn sàng từ 00:10 với nội dung đủ (7/7 phát hiện có câu trả lời, `A19` theo `Q2`, `F5` đã thực hiện) và
> **chưa ai duyệt**. Song song, **M3 (Day 6–9) chỉ còn hôm nay và mai** mà `contracts/` chưa có gì trên `main`,
> **hợp đồng API chưa ai bắt đầu**, và `geometry_contract_version` **chưa tồn tại trong repo** — trong khi
> **M4 bắt đầu chính hôm nay**. **Khối lượng:** mỗi thành viên **≥ 8 h việc thật + ~2 h dự phòng**, hạn 23:59.

### Điều kiện để Day 8 KHÔNG trượt

| # | Ai | Điều kiện | Mở khoá gì |
|---|---|---|---|
| 1 | **Vũ Hùng Anh** *(nợ)* | **Duyệt lại #34 trước 12:00** — P0, việc đầu tiên trong ngày | merge → **QA soi lại** → `GATE-DATA-01` đóng → `SPIKE_C1` hết `BLOCKED` |
| 2 | **Nguyễn Gia Đức Trung** *(nợ)* | **Duyệt lại #35** (`DR-002b`) + **sửa #32** (manifest tự mâu thuẫn vẫn PASS) | `GATE-SPLIT-01` · hợp đồng ingestion 1 của M3 |
| 3 | **Bế Quốc Khánh** | **#40 hết nháp, base `main`** + **tuyên bố loại trừ `Unet.py`/`preprocess_data.py`** cho `A17` + **trả lời review #34 trong ngày** | validator sạch · Spike D không dừng ở vòng review |
| 4 | **Trung + Vũ Hùng Anh** | **M3 đi một bước thật**: PR bản thảo **hợp đồng API v0** · **`geometry_contract_version`** | M3 chỉ còn hôm nay và mai |

**Không đủ bốn thì ngày này tính là trượt.** Luật mới thay cho mốc đẩy 12:00/18:00 *(đã thử ở Day 7 và không có
tác dụng)*: **việc đang chặn người khác phải làm trước việc của chính mình** — cụ thể, phần trả lời review của
Khánh xếp trên mọi việc khác của cậu ấy.

### Khối lượng và thứ tự từng người

| Người | 🔴 Làm trước (nợ Day 7) | Việc chính Day 8 | Dự phòng | Giờ chính |
|---|---|---|---|---|
| **Bế Quốc Khánh** | ① #40 hết nháp + base `main` · ② tuyên bố loại trừ `A17` · ③ **trả lời review #34** | ④ #35 theo phán quyết `DR-002b` × `F5` · ⑤ **chuẩn bị `SPIKE_C1`** (chỉ thiết kế) · ⑥ #37 hết nháp · ⑦ gói bằng chứng `TC-TEAM-001` | `C0-3` tìm trần thật · `C0-9` | **~9 h** |
| **Nguyễn Gia Đức Trung** | ① **duyệt lại #35** · ② **sửa #32** · ③ duyệt lại #29 #30 #38 | ④ **hợp đồng API `11` v0** *(lối ra M3)* · ⑤ nhờ review #39 #33 · ⑥ `E7` · ⑦ `E9` máy thật buổi tối | `E10` `E11` `E13` · khung ban ngày cho `E8` | **~8,75 h** |
| **Vũ Hùng Anh** | ① **duyệt lại #34 trước 12:00** · ② duyệt lại #26 · ③ **picking `B3`/`B4`** | ④ **`geometry_contract_version`** *(lối ra M3)* · ⑤ **`RESULT.md` cho Spike B** *(chưa có file nào)* | `B10`/`B11` · fixture TP/FP/FN cho Spike F | **~8,25 h** |
| **Phạm Tuấn Anh** | ① **`DR-002b` × `F5` đã phán** → ghi QA-002 §9 + #35/#34 · ② **đính chính `NFR-PERF-001`** khắp bản ghi · ③ merge #26 · ④ merge #34 → **QA soi lại Spike D** | ⑤ **Decision Request `RA-H13`** · ⑥ review #39 · ⑦ **Spike A chặng `S6`** (dựng cache ±3 rồi đo hai chính sách) · ⑧ merge phần còn lại · ⑨ chốt ngày | `TC-TEAM-001` (V1) · khung trạng thái màn hình | không giới hạn |

> **🎯 Chuẩn demo:** [`DEMO_STANDARD.md`](DEMO_STANDARD.md) **v1 đã duyệt** — mỗi packet có dòng 🎯 dẫn về luật
> (D1–D7), bước demo (H1–H10) hoặc màn hình (SCR-01…09).

### Đã xong — trong ngày

| Ai | Việc | Bằng chứng |
|---|---|---|
| **Vũ Hùng Anh** | **Duyệt #34 trước 12:00**, kèm phát hiện chặn: `A17 PASS` không phải audit toàn gói | review 11:07 |
| **Vũ Hùng Anh** | Picking `B3`/`B4` *(nợ Day 7)* · **`geometry_contract_version`** + checker trong CI · approve #40 · device probe | `9e839ef` · #43 · #44 |
| **Bế Quốc Khánh** | **#40 hết nháp, base `main`, merged** · **tuyên bố loại trừ `A17`** + `package_findings` · trả lời review #34 ×3 | `133f1a0` · `6fcc087` · `98dc4fa` |
| **Bế Quốc Khánh** | Kế hoạch đo `SPIKE_C1` (chỉ thiết kế) + gói `TC-TEAM-001` V3 · #37 hết nháp | #42 |
| **Nguyễn Gia Đức Trung** | **Duyệt lại #35** (`APPROVED`) · **sửa #32**, merged · approve #29 #30 #38 | `dfa9ef6` · `c44ee31` |
| **Nguyễn Gia Đức Trung** | **Hợp đồng API `11` v0** · `E7` trên app thật · `E10`/`E13` theo `DR-015` · sửa phạm vi `NFR-PERF-001` ở #26 · sửa #39, #45 theo review | #45 · `097fdee` · `f6dc950` · `fdec7bb` |
| **Phạm Tuấn Anh** | `DR-002b` × `F5` · **`DR-015`** · luật merge đè `CHANGES_REQUESTED` cũ · đính chính `NFR-PERF-001` | `7cde4eb` · `99575df` · `0c6039f` |
| **Phạm Tuấn Anh** | **Spike A `S6`**: `A9` ở `576×576×88` — 98,72 / 50,84 ms, 376 MB → 135,90 MB thực đo | #41 · `6f1d09b` |
| **Phạm Tuấn Anh** | **QA-003 sơ bộ** trên 3 head của #34 · review #39 #43 #45 #29 #32 · **merge #40 #29 #30 #38 #32** · gỡ chồng nhánh #30 | `53f3325` … `10eaacb` · `44fa56a` |

### Còn tồn — chuyển sang Day 9

Xem [`day08/DAY08_EOD_REVIEW.md`](day08/DAY08_EOD_REVIEW.md) §13. Nhiều nhất và quan trọng nhất: **Vũ Hùng Anh duyệt lại
#34** — đó là mắt xích duy nhất còn giữ `GATE-DATA-01`.

---

## DAY 7 — 2026-09-16 · **`ĐẠT` 4/4 theo nội dung** *(2/4 theo chữ của hạn giờ — quyết định của leader)*

**Bản chốt đầy đủ:** [`day07/DAY07_EOD_REVIEW.md`](day07/DAY07_EOD_REVIEW.md)

**Gói nhiệm vụ từng người:** [`day07/tasks/`](day07/tasks/)

> **Day 6 chốt CHƯA ĐẠT 3/4 → buffer −1.** Hôm nay **việc tồn của Day 6 đứng đầu mọi packet**. Critical path: **#34**
> (Khánh chuyển ready trước 12:00) → Hùng Anh duyệt lại → merge → **QA soi lại** → `ACCEPTED` → `GATE-DATA-01` đóng.
> Song song: leader quyết cách xử lý **154 lần chụp từ 60 bệnh nhân** cho `GATE-SPLIT-01`, và stub Spike E dựng theo
> đường leader chọn để đo khung 21:00. **Khối lượng giữ như Day 6:** mỗi thành viên **≥ 8 h việc thật + ~2 h hàng đợi
> dự phòng**, hạn 23:59.

### Điều kiện để Day 7 KHÔNG trượt

| # | Ai | Điều kiện | Mở khoá gì |
|---|---|---|---|
| 1 | **Bế Quốc Khánh** | **PR #34 chuyển ready trước 12:00** — xác nhận HITL (`A11`/`A14`/F5), bảng `A19` theo `Q2`, trả lời từng phát hiện QA-002 · nhờ Trung review **#35** | Hùng Anh duyệt lại trong ngày → QA soi lại → `GATE-DATA-01` |
| 2 | **Nguyễn Gia Đức Trung** *(nợ Day 6)* | **Review #35** có nội dung + **stub 2 profile đã kiểm trước 20:30**, trên đúng địa chỉ điện thoại dùng | split được review · leader đo Spike E khung 21:00 |
| 3 | **Vũ Hùng Anh** *(nợ Day 6)* | **Duyệt lại #24 và #26** (Trung chờ từ 21:22 hôm qua) + **duyệt lại #34** khi Khánh chuyển ready | merge #24/#26 → buổi đo tối · Spike D sang bước QA |
| 4 | **Vũ Hùng Anh** | **`B1` đủ theo TASK** — thêm **pan** (desktop + touch) vào #30, bỏ đoạn lặp ở #29, nhờ Trung review lại | `B1` trọn · nền cho picking `B3`/`B4` |

**Không đủ bốn thì ngày này tính là trượt.** Điều kiện 1 và 2 phụ thuộc **leader quyết `Q2` và chọn đường dựng stub
trước 10:00**; leader merge **#17** để hai PR bằng chứng C0 của Khánh có CI.

### Khối lượng và thứ tự từng người

| Người | 🔴 Làm trước (nợ Day 6) | Việc chính Day 7 | Dự phòng | Giờ chính |
|---|---|---|---|---|
| **Bế Quốc Khánh** | ① **#34 ready trước 12:00** · ✅ ② #36 `C0-7`/`C0-8` *(02:19)* · ✅ ③ base #36/#37 sang `main`, CI 4/4 · ④ nhờ Trung review #35 | ⑤ sửa lỗi validator `F6`–`F11`, `F14`, `F15` kèm test hồi quy · ⑥ góp ý Decision Request nối bệnh nhân · ⑦ #35 sau khi #34 merge | tìm nguồn ánh xạ bệnh nhân · rà trường siêu dữ liệu cho `F5` | **~9,25 h** |
| **Nguyễn Gia Đức Trung** | ① **stub 2 profile** theo đường leader chọn · ② **review #35** · ③ theo dõi #24/#26, đổi base #33 | ④ hợp đồng ingestion 2 v0 · ⑤ `E9` cho máy thật · ⑥ tổng hợp lượt đo khung 21:00 | kế hoạch `E7` · đối chiếu hợp đồng 1 với manifest thật | **~9 h** |
| **Vũ Hùng Anh** | ① duyệt lại #24 · ② **duyệt lại #26 trước 14:00** · ③ #29 bỏ đoạn lặp · ④ **#30 thêm pan** | ⑤ **duyệt lại #34** · ⑥ picking `B3`/`B4` · ⑦ review #27 và #31 | review C0 #36/#37 · hợp đồng hình học · kịch bản `B10`/`B11` | **~8,9 h** |
| **Phạm Tuấn Anh** | ✅ ① **merge #17** *(squash `8bf1a2f`, 02:19)* · ✅ ② **`Q2` = hoãn có ghi** · ✅ ③ **stub = phương án A** · ✅ ④ **chuẩn demo duyệt thành v1 + đính chính 44/33/70** | ⑤ quyết nối bệnh nhân (`GATE-SPLIT-01`) · ⑥ phán `F5` · ⑦ xác nhận recovery khi buffer −1 · ⑧ stub · ⑨ **đo Spike E khung 21:00** · ⑩ merge + QA soi lại · ⑪ chốt ngày | review #32 · `A9` cache ±3 | không giới hạn |

> **🎯 Chuẩn demo:** [`DEMO_STANDARD.md`](DEMO_STANDARD.md) v0 **chờ leader duyệt sáng nay**; mỗi packet có dòng 🎯 dẫn
> tới luật (D1–D7), bước demo (H1–H10) hoặc màn hình (SCR-01…09) tương ứng.

### Đã xong — trong ngày

| Ai | Việc | Bằng chứng |
|---|---|---|
| Phạm Tuấn Anh | **Merge #17** lúc 02:19 (squash) — **không xoá nhánh**, nên #36 và #37 không bị đóng tự động | `8bf1a2f` |
| Bế Quốc Khánh | Rebase #36 và #37 lên `main` (diff sạch, chỉ file C0) → **CI 4/4 lần đầu**; thêm ngoại suy lịch theo **4 h và 5 h GPU/ngày** → `C0-7`/`C0-8` có số; **#36 chuyển ready**, nhờ Hùng Anh review | `cb5585b` · PR #36 |
| Phạm Tuấn Anh *(Project Control chạy bằng SSH của leader)* | **Stub 2 profile Spike E đã chạy** 11:06 — `10.64.193.115:8787`, PID 73790, worktree riêng `a585907`, payload ngoài repo; `/health` 2 profile · `HEAD` 29 196 288 và 36 044 800 đúng `X-Payload-Profile`; stub cũ không bị đụng | comment trên PR #26 |
| Phạm Tuấn Anh *(operator, Project Control chạy harness)* | **Đo Spike E tối 16/09** — hai profile `576`/`640`, 3 lượt mỗi profile, Wi-Fi + ZeroTier `DIRECT`: **171/171 mẫu `ok`** mỗi profile, 0 body bị cắt, 0 local-connect rejection, volume đủ byte. Dữ liệu thô + log server + `PROVENANCE.md` trên nhánh `spike-e/evidence-20260916`; **số `E` để Trung tính** | `c3c2ab5` · comment trên #26 |
| **Vũ Hùng Anh** | **Duyệt lại #24** (15:45 — vẫn còn ID mạng cũ ở dòng 14) · **duyệt lại #26** (15:45 — ba phát hiện đã sửa, cậu ấy **tự tái lập** JSON tổng hợp; còn vướng thứ tự merge với #24) | review trên #24 · #26 |
| **Vũ Hùng Anh** | **`B1` đủ theo TASK**: #29 bỏ đoạn lặp (15:48) · **#30 thêm pan** desktop + touch, ảnh mới, hết nháp (17:10–17:13) → nhờ Trung duyệt lại | `d223cc4` · `0d079e8` · `712fbe9` |
| **Vũ Hùng Anh** | **APPROVE #27** (17:14 — tự chạy `extract_a2.py`, tái lập `A2` `OBSERVED`) · **APPROVE #36** (17:17 — sinh lại `RESULT.md` và biểu đồ **byte-identical**) | review trên #27 · #36 |
| Phạm Tuấn Anh | **Merge #27** (merge commit `6ca1e21`, **giữ nhánh**) → đổi base #31 sang `main`, chuyển ready · **Merge #36** (squash `e6e3b0b`) → **Spike C0 `EVIDENCE_READY`**, `A2` lên `main` | `6ca1e21` · `e6e3b0b` |
| Phạm Tuấn Anh | **Phán quyết #32**: `CHANGES_REQUESTED` — manifest tự mâu thuẫn vẫn PASS (lớp QA-002 `F15`); 9/10 phép phá khác bị chặn đúng | review trên #32 |
| Phạm Tuấn Anh *(Project Control chạy)* | ⚠ **Mac mini rơi khỏi overlay** (13:34–21:33): stub vẫn sống nhưng `LISTEN` trên địa chỉ đã biến mất → join lại mạng, **chạy lại stub 21:33 (PID 28976)**, kiểm lại hai profile đạt; ghi vào `RISK-DEMO-NET-01` và checklist T−60 của chuẩn demo | `RISK_REGISTER_INITIAL.md` · `DEMO_STANDARD.md` §8 |
| Phạm Tuấn Anh *(Project Control chạy)* | **Soát kỹ thuật #32** — hợp đồng ingestion 1: `test_contract1.py` 10/10, soi đối kháng 9/10 phép phá bị chặn đúng; **1 lỗi thật**: manifest tự mâu thuẫn vẫn PASS (lớp QA-002 `F15`). Phán quyết `APPROVE`/`CHANGES_REQUESTED` chờ leader | comment trên PR #32 |
| Phạm Tuấn Anh | **`DR-002b` = (c) + (d)** — gom nhóm theo ngưỡng **khai trước mọi lượt train**, **loại khỏi train** case nghi trùng bệnh nhân với holdout, ghi rõ giới hạn ở mọi chỗ có số đánh giá, thêm phân tích độ nhạy · **`F5` = thu hẹp** (SHA-256 từng file và điểm sàng lọc sang manifest hạn chế; hash + lệnh sinh lại vẫn public) | [`OPEN_DECISIONS.md` Part 2b](readiness/OPEN_DECISIONS.md) · [QA-002 §9](day06/QA_REVIEW_002_SPIKE_D.md) |
| Phạm Tuấn Anh | **4 quyết định**: `Q2` hoãn có ghi · stub Spike E theo phương án A · `DEMO_STANDARD` duyệt thành **v1** + đính chính số đếm **44 / 33 / 70** · recovery khi buffer −1: **giữ kế hoạch + 5 hành động Level 1** | [QA-002 §9](day06/QA_REVIEW_002_SPIKE_D.md) · [`DEMO_STANDARD.md`](DEMO_STANDARD.md) · `PROJECT_STATE.recovery` |

---

## DAY 6 — 2026-09-15 · **`CHƯA ĐẠT` 3/4** — Spike D lên `main` rồi bị QA bác; stub Spike E không dựng được

**Bản chốt đầy đủ:** [`day06/DAY06_EOD_REVIEW.md`](day06/DAY06_EOD_REVIEW.md)

**Gói nhiệm vụ từng người:** [`day06/tasks/`](day06/tasks/)

> **Hôm nay critical path có thể đi xa nhất từ đầu dự án:** #25 merge → **QA Spike D** → `ACCEPTED` → `GATE-DATA-01`
> đóng → `SPIKE_C1` hết `BLOCKED`. Song song: bằng chứng nối case↔bệnh nhân → leader quyết `GATE-SPLIT-01`.
> **Khối lượng (leader, 15/09): mỗi thành viên ≥ 8 h việc thật + ~2 h hàng đợi dự phòng**, hạn 23:59 — sau khi hôm
> qua phần đẩy lên của một thành viên chỉ gói trong khoảng 17 phút sau nửa đêm. Việc nào bị chặn đều có việc
> thay thế trong cùng packet.

### Điều kiện để Day 6 KHÔNG trượt

| # | Ai | Điều kiện | Mở khoá gì |
|---|---|---|---|
| 1 | **Vũ Hùng Anh** → Phạm Tuấn Anh | ✅ **PR #25 trên `main`** — Hùng Anh approve 10:03:17 rồi tự merge 10:03:26 (`a92892c`) | bước QA Spike D → `GATE-DATA-01` |
| 2 | **Bế Quốc Khánh** | ✅ **ĐẠT MUỘN** *(leader cho qua)* — bằng chứng nối bệnh nhân ở PR #35 lúc **00:20**, probe C0 ở PR #36 lúc **01:08**; cả hai sau 23:59 | leader quyết `GATE-SPLIT-01` · `C0-2`…`C0-8` có số thật |
| 3 | **Nguyễn Gia Đức Trung** | ❌ **TRƯỢT** — stub không dựng được: Trung **không có quyền SSH** vào Mac mini (Project Control giao việc mà không kiểm quyền) · PR split để review chỉ mở lúc **00:20** | leader đo lại Spike E khung 21:00 · split được review |
| 4 | **Vũ Hùng Anh** | ✅ **`B1`** theo chữ của điều kiện — PR nháp #30 (10:21): viewer WebGL2 xoay/zoom + ảnh chụp *(review Trung 21:39: `B1` trong TASK đòi cả **pan** — chưa có)* | nợ Day 5 · nền cho `B3`–`B11` |

**Không đủ bốn thì ngày này tính là trượt** → **kết quả: CHƯA ĐẠT 3/4**, leader chốt 16/09 ~01:00. Buffer 0 → **−1**.

### Khối lượng và thứ tự từng người

| Người | 🔴 Làm trước | Việc chính Day 6 | Dự phòng | Giờ chính |
|---|---|---|---|---|
| **Bế Quốc Khánh** | ① pagefile · ② đổi base #28 | ③ **bằng chứng nối bệnh nhân** · ④ **probe C0 RTX 4050** · ⑤ khung pipeline C0 tổng hợp · ⑥ nháp `RESULT.md` C0 | bản đồ bằng chứng QA · kiểm `A19` | **~9 h** |
| **Nguyễn Gia Đức Trung** | ① **review #28** | ② **stub 2 profile** · ③ **`E9`** harness · ④ tổng hợp lượt mới · ⑤ **M3 hợp đồng ingestion 1** | hợp đồng ingestion 2 · kế hoạch `E7` | **~8,5 h** |
| **Vũ Hùng Anh** | ① **review lại #25** · ② review lại #24 · ③ **`B1`** · ④ `B14` | ⑤ **review #26** · ⑥ picking fixture `B3`/`B4` | review #27 · hợp đồng hình học · kịch bản `B10`/`B11` | **~8,3 h** |
| **Phạm Tuấn Anh** | ① **sửa #17** trước 12:00 · ② merge #25 · ③ dừng stub cũ | ④ **QA Spike D** · ⑤ **quyết nối bệnh nhân** · ⑥ **đo Spike E 15:00 + 21:00** · ⑦ merge #24 #26 · ⑧ Spike A S5 brush · ⑨ **chuẩn demo "wow" v0** · ⑩ chốt ngày | `A9` cache ±3 | không giới hạn |

> **🎯 Chuẩn demo (leader, 15/09):** sản phẩm cuối phải "wow" — giao diện và mọi thứ giảng viên thấy, thử và đánh giá
> được. Từ hôm nay mỗi packet có dòng 🎯 gắn việc của người đó với thứ sẽ hiện ra khi demo; `management/DEMO_STANDARD.md`
> (bản nháp hôm nay) là chuẩn chung.

> ❌ **11:52 — QA Red Team `REJECT` Spike D** ([`day06/QA_REVIEW_002_SPIKE_D.md`](day06/QA_REVIEW_002_SPIKE_D.md)) →
> `NEEDS_FIX`, trả Khánh. Số đo tái lập đúng, nhưng `CASE_0056` và `CASE_0097` là một lần chụp bị xuất hai lần mà audit
> không báo, và split nháp đã đặt hai bản ở train và validation. **`GATE-DATA-01` không đóng hôm nay.** Leader cần quyết
> Q1 (cặp trùng trong split), Q2 (hoãn mục split của `A19`), Q3 (manifest trong repo public). **12:29 — leader quyết Q1 (a)
> → `DR-002a` và Q3 như đề xuất; Q2 đang cân nhắc.**
>
> 🕘 **21:28 — stub 2 profile của Trung vẫn chưa chạy (cổng 8787 đóng) → chưa đo được Spike E khung 21:00.** Trung
> hoạt động lại lúc 21:21 (đẩy bản sửa #24 và #26).

### Đã xong — trong ngày

| Ai | Việc | Bằng chứng |
|---|---|---|
| Phạm Tuấn Anh *(Claude viết, leader duyệt)* | Sửa PR #17 — 2 lỗi runtime Khánh tìm trên RTX 4050, cộng 2 lỗi tìm thêm khi kiểm trên RTX 3050 Ti | `08d7166` trên #17 · CI xanh · trả lời trên PR 06:42 |
| Phạm Tuấn Anh | Dừng stub cũ PID 32227 trên Mac mini lúc 09:48 — `10.64.193.115:8787` trống cho stub 2 profile của Trung | output kiểm ở [`day06/tasks/DAY06_PHAM_TUAN_ANH.md`](day06/tasks/DAY06_PHAM_TUAN_ANH.md) việc 3 |
| Phạm Tuấn Anh | PR #27 (Spike A S4) chuyển ready, nhờ Hùng Anh review lúc 10:51, checklist 4 bước trên PR | PR #27 — comment `issuecomment-5674459831` |
| Phạm Tuấn Anh *(Project Control soạn)* | Chuẩn demo v0 — **bản nháp, chờ leader duyệt** | [`DEMO_STANDARD.md`](DEMO_STANDARD.md) |
| Vũ Hùng Anh | Review lại #25 → `APPROVE` 10:03 và merge | `a92892c` trên `main` |
| Bế Quốc Khánh | Audit Spike D đầy đủ lên `main` sau review | `a92892c` — `management/DATASET_AUDIT.md` · `data/manifests/dataset_manifest.json` · `spikes/SPIKE_D_DATASET/RESULT.md` |
| Vũ Hùng Anh | Review lại #24 (`CHANGES_REQUESTED`, 1 điểm) · review #26 (`CHANGES_REQUESTED`, 3 điểm) · soát #27 (4/4 kiểm đạt) | review trên PR #24 10:04 · #26 10:09 · #27 10:13 |
| Vũ Hùng Anh | `B14` — diễn giải của chủ spike | PR #29 |
| Vũ Hùng Anh | `B1` — viewer 3D WebGL2 xoay/zoom + ảnh chụp | PR nháp #30 |
| Phạm Tuấn Anh *(phiên QA độc lập; Project Control kiểm lại F1)* | **QA Red Team Spike D — `REJECT`**: 1 CRITICAL (cặp case trùng bị split nháp đặt ở train và validation), 4 HIGH; mọi con số khác tái lập đúng | [`day06/QA_REVIEW_002_SPIKE_D.md`](day06/QA_REVIEW_002_SPIKE_D.md) · script ở `day06/qa002/` |
| Phạm Tuấn Anh *(Claude viết, leader duyệt)* | Spike A chặng S5 — brush thêm/xoá, hoàn tác/làm lại/đặt lại, tách cử chỉ, hook đo trên máy; kiểm offline F5 14/14, bundle Metro sạch — **chưa đo trên máy** | PR nháp #31 (`cf84802`) |
| Phạm Tuấn Anh *(chủ Spike A, bấm trên máy)* | Đo S5 trên máy 21:13–21:21 — `A3`–`A7` `OBSERVED` (A3 8/8 · A4 6/6 · A5 60/60 ở r = 0 và r = 2 · A6/A7 15/15); `A2` kiểm lại trên bản S5 `OBSERVED` | `1c62a00` trên PR #31 · `EVIDENCE_RAW/a3_a7_brush_20260915T212121+0700.json` |
| Nguyễn Gia Đức Trung | Sửa #24 (ID mạng ZeroTier) · sửa #26 (tổng hợp theo profile, JSON sinh lại, kế hoạch đo) — đã trả lời review 22:08, chờ duyệt lại | `be52d6f` trên #24 · `a585907` trên #26 |
| Nguyễn Gia Đức Trung | Review **#29** (`B14`, đoạn lặp) và **#30** (`B1`, **thiếu pan**) — cả hai `CHANGES_REQUESTED`, 21:38–21:39 | review trên PR #29 · #30 |
| Nguyễn Gia Đức Trung | **`E9`** reconnect/retry drill cho harness Toybox (PR #33, xếp chồng trên #24) · **hợp đồng ingestion 1 v0** (PR #32, 9/9 ca kiểm tổng hợp) | `32ef07a` · `f97b78f` |
| Nguyễn Gia Đức Trung | Kiểm HEAD tiến trình đang chạy 22:27: hai profile cùng `Content-Length` 58 392 576, không có `X-Payload-Profile` → stub 2 profile **chưa chạy** | comment trên #26 |
| Bế Quốc Khánh *(sau 23:59 — leader cho qua)* | #34 sửa Spike D theo QA-002 (00:19) · #35 split `DR-002a` + bằng chứng nối bệnh nhân (00:20) · bật pagefile · **approve #17** (00:29) · #36 probe C0 20/20 (01:08) · #37 khung pipeline (01:14) | `b52d81d` · `d66925b` · `36789c0` · `06cff72` · [§14](day06/DAY06_EOD_REVIEW.md) |

---

## DAY 5 — 2026-09-14 · **`ĐẠT` 3/3 — theo quyết định của leader** — `DR-002` quyết, critical path nhích

**Bản chốt đầy đủ:** [`day05/DAY05_EOD_REVIEW.md`](day05/DAY05_EOD_REVIEW.md)

**Gói nhiệm vụ từng người:** [`day05/tasks/`](day05/tasks/)

> **Hôm nay critical path có thể nhích ba nấc:** PR #25 merge → `DR-002` → split theo bệnh nhân. Mỗi packet mở
> bằng khối **🔴 LÀM TRƯỚC** (quy tắc của leader 13/09) và ghi **giờ ước tính**. **Thành viên ~8 h/ngày, hạn
> 23:59, không cần khai báo giờ rảnh; leader không giới hạn giờ** (quyết định của leader 14/09).

### Điều kiện để Day 5 KHÔNG trượt

| # | Ai | Điều kiện | Mở khoá gì |
|---|---|---|---|
| 1 | **Vũ Hùng Anh** → Bế Quốc Khánh | **PR #25** được review, sửa nếu cần, **merge** | `GATE-DATA-01` |
| 2 | **Phạm Tuấn Anh** | **`DR-002` quyết** (Path A / B), ghi vào `OPEN_DECISIONS.md` | `GATE-SPLIT-01` |
| 3 | **Nguyễn Gia Đức Trung** | Báo cáo tổng hợp lượt 4 + **payload `uint8` 576/640** → PR | lượt đo chuẩn cho Spike E |

**Không đủ ba thì ngày này tính là trượt.**

### Khối lượng và thứ tự từng người

| Người | 🔴 Làm trước | Việc chính Day 5 | Giờ chính · thêm |
|---|---|---|---|
| **Vũ Hùng Anh** | ① review **#25** *(critical path)* · ② review #24 | ③ app 3D `B1` + camera · ④ diễn giải `B14` | ~7 h · ~1 h |
| **Bế Quốc Khánh** | ① khai báo `C0-1` · ② sửa theo review #25 | ③ script split **cả Path A và B**, seed 2024 · ④ chạy split khi `DR-002` xong · ⑤ review bản sửa #17 · ⑥ chạy probe C0 hình dạng thật | ~7 h · ~1 h |
| **Nguyễn Gia Đức Trung** | ① review lại **#23** | ② tổng hợp lượt 4 · ③ payload `uint8` 576/640 + stub · ④ kế hoạch đo lại · ⑤ nháp `RESULT.md` · ⑥ review split của Khánh | ~7 h · ~1 h |
| **Phạm Tuấn Anh** | ① `disable_sshd.ps1` | ② **quyết `DR-002`** · ③ sửa **#17** · ④ merge #25 → #23 → #24 · ⑤ đường thiết bị Spike B · ⑥ đo lại Spike E | không giới hạn |

### Đã xong — trong ngày

| Ai | Việc | Bằng chứng |
|---|---|---|
| **Nguyễn Gia Đức Trung** | Review lại #23 → `APPROVED` (08:36) · **PR #26**: tổng hợp lượt 4, payload `uint8` 576/640, kế hoạch đo, nháp `RESULT.md` | `339021f` |
| **Nguyễn Gia Đức Trung** | Sửa đủ 3 điểm review #24 **+ thêm `--profile`** vào harness Toybox (22:24) | `710090f` |
| **Vũ Hùng Anh** | Review **#25** (11:31) và **#24** (11:34) — cả hai `CHANGES_REQUESTED`, lỗi chỉ ra đều đúng | API review |
| **Phạm Tuấn Anh** | **`DR-002` = Path A** · **`DR-006a` rev 3** · merge **#23** · tắt sshd | `b600085` · `04d8e97` · `b4208d0` · `132e519` |
| **Phạm Tuấn Anh** *(chủ Spike A)* | **Spike A S4 — `A2` đo trên máy: `OBSERVED`**, checksum mask 16/16 qua 3 lần kiểm, 0 lần khựng | `fb006da` · `311eefe` · PR #27 |
| Project Control *(leader duyệt)* | **Sửa PR #17 — 5/5 lỗi** Khánh nêu · dựng lại bảng điều phối | `542887e` · `66a96b7` |
| **Bế Quốc Khánh** — *sau 23:59* | Sửa #25 (00:44) · review lại #17 trên RTX 4050 (00:52, 2 lỗi runtime thật) · **PR #28 nháp: manifest split Path A** (00:59) · **khai báo `C0-1`** (01:00) | `fdaf920` · `772c786` · API review · comment #17 |

### Điều kiện ngày — chốt sáng 15/09

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | PR #25 review + sửa + merge | ✅ **theo quyết định của leader** — review 11:31; Khánh sửa **00:44** (sau hạn 45 phút); **chưa merge** |
| 2 | `DR-002` quyết | ✅ Path A, 21:41 |
| 3 | Báo cáo lượt 4 + payload `uint8` → PR | ✅ PR #26, 08:51 |

**3/3 — Day 5 ĐẠT theo quyết định của leader.** Theo chữ của luật lúc 23:59 là 2/3; Project Control đề xuất
"MỘT PHẦN", leader quyết tính đạt. **Đây là lần ngoại lệ thứ hai liên tiếp cho cùng sản phẩm (audit Spike D), và
lần này không có gia hạn báo trước.** Buffer **giữ 0**.

**Hạn cứng của Khánh** (audit trên `main` trước 23:59 14/09): **trượt.** Leader: *"tôi ghi nhận nhé"* — ghi nhận,
**không báo giảng viên**.

### Quyết định trong ngày

- **Khối lượng:** thành viên ~8 h/ngày, hạn 23:59, không khai báo giờ rảnh; leader không giới hạn
- **`DR-006a` rev 3:** leader bấm máy cho Spike B; Hùng Anh thiết kế + tính số; reviewer Spike B → Trung
- **`DR-002` = Path A:** 80/20 theo bệnh nhân, seed 2024, 54 case khoá cứng — quyết trước khi #25 merge
- **Báo tin qua tài liệu:** quyết định đụng tới ai thì ghi thẳng vào packet + bảng của người đó
- **Kết quả Day 5** tính đạt · **hạn cứng Khánh** ghi nhận, không leo thang

### Còn tồn — sang Day 6

| Ai | Việc |
|---|---|
| **Vũ Hùng Anh** | Review lại **#25** *(critical path)* và **#24** · review **#26** · **`B1` app 3D + `B14`** — không có commit trong Day 5 |
| **Phạm Tuấn Anh** | Merge #25 · **quyết giới hạn nối case↔bệnh nhân** cho `GATE-SPLIT-01` · sửa **2 lỗi runtime #17** · đo lại Spike E · nhờ review #27 |
| **Bế Quốc Khánh** | Đổi base #28 sang `main` sau khi #25 merge · chạy lại C0 khi #17 sửa xong |
| **Nguyễn Gia Đức Trung** | Review split #28 |

> **Phát hiện đổi kế hoạch (PR #28):** gói dữ liệu **không có** ánh xạ case→bệnh nhân. Manifest dùng mỗi case làm
> một nhóm và ghi `NOT VERIFIABLE` — `GATE-SPLIT-01` cần quyết định của leader, không chỉ một manifest.

---

## DAY 4 — 2026-09-13 · **`ĐẠT` 3/3** — hai người vắng quay lại, Spike D có bằng chứng lần đầu

**Gói nhiệm vụ từng người:** [`day04/tasks/`](day04/tasks/)

> **Ngày đầu tiên dự án ở trạng thái 🔴 RED với buffer 0.** Mọi bế tắc bên ngoài đã được gỡ trong
> Day 3 — dataset trên đĩa, dụng cụ bốn spike đã dựng và sửa hết lỗi chặn, Mac mini tới được, bảng
> tự sinh từ state file. **Từ hôm nay, thứ duy nhất còn chặn critical path là khả dụng của người.**

### Điều kiện để Day 4 KHÔNG trượt

| # | Ai | Điều kiện | Vì sao |
|---|---|---|---|
| 1 | **Bế Quốc Khánh** | `dataset_manifest.json` + `DATASET_AUDIT.md` land trên `main`, **do chính cậu ấy commit** | P0, ngày thứ 5. Lệnh giờ chạy được từ lệnh đầu — 4 lỗi chặn đã sửa ở `3bf2a80` |
| 2 | **Nguyễn Gia Đức Trung** | Stub chạy trên Mac mini → **cổng 8787 mở** | Cổng vào `GATE 2`. **Không cần điện thoại** |
| 3 | **Vũ Hùng Anh** | Review **PR #13** *(mở từ trưa 11/09, 0 review)* và **quyết bộ geometry fixture** | Leader là tác giả nên không tự approve được. Fixture chặn cả Spike A lẫn Spike F |

**Không đủ ba thì ngày này tính là trượt** — cùng luật đã áp cho Day 1 và Day 3.

### Đã xong — trong ngày *(chốt sơ bộ 17:00)*

| Ai | Việc | Bằng chứng |
|---|---|---|
| **Vũ Hùng Anh** | **Review PR #13 → `APPROVED`**, rồi merge — Spike A lên `main` | review 14:44 · `2f3a51d` |
| **Vũ Hùng Anh** | **Bộ geometry fixture chính thức** — nhận bản đề xuất, 33 điểm + 13 tia, khối `b14_grouping` định nghĩa nhóm B14 hợp đồng | PR #20 · `50a5433` |
| **Vũ Hùng Anh** | **Review PR #15 → `CHANGES_REQUESTED`, 3 phát hiện đúng** — một lỗi cú pháp làm harness không chạy được, lệch 32/33 điểm, nhóm B14 lệch hợp đồng | review + comment 14:44–14:49 |
| **Vũ Hùng Anh** | Dòng `Reviewer:` — nợ từ Day 0 | PR #21 · `f11da28` |
| **Nguyễn Gia Đức Trung** | **Stub chạy trên Mac mini → `GATE 2` MỞ.** Leader xác nhận 12:35 | `day04/gate2_verification_20260913.md` |
| **Nguyễn Gia Đức Trung** | **Harness Toybox** cho điện thoại không có HTTP client · diagnostic AVD 8 endpoint · bản ghi tiến độ | nhánh `docs/day4-avd-diagnostic` *(chưa có PR)* |
| **Nguyễn Gia Đức Trung** | Phát hiện lỗi PR #14: phán quyết resample bỏ qua `origin` và hướng trục · phát hiện packet ghi sai `--host` | sửa tại `a1744e8`, ghi công Trung |
| Phạm Tuấn Anh | **Quyết recovery**: giữ kế hoạch, không de-scope, hạn cứng cho Khánh | `PROJECT_STATE` `recovery.decision_2026_09_13` |
| Phạm Tuấn Anh | **`DR-006a` revision 2** — leader là operator duy nhất của Spike E; Trung không đụng điện thoại; reviewer Spike E → Hùng Anh | `a6ef70e` |
| Phạm Tuấn Anh | Review + merge PR #20 và #21 · gán reviewer #18 (Trung), #14 (Trung), re-review #15 (Hùng Anh) | API review |
| Phạm Tuấn Anh | Cài ZeroTier lên Galaxy A17 — node `078280bae8`, v1.16.0 | **chưa Auth** |
| Project Control | Sửa 3 phát hiện PR #15 · sửa lỗi PR #14 + selftest chứng minh bắt được lỗi cũ | `2310330` · `a1744e8` |
| Project Control | `tools/remote_adb/` *(giờ không dùng cho Spike E)* · `tools/host_hardening/disable_sshd.ps1` *(chờ anh chạy admin)* | commit hôm nay |
| Phạm Tuấn Anh | **Chuyển overlay sang network mới `b103a835d292ddb3`** (tài khoản của anh) — không ai tìm được tài khoản quản trị mạng cũ. Laptop `10.64.193.145` · Mac mini `10.64.193.115` · **điện thoại `10.64.193.140` — lần đầu tới được Mac mini** | ZeroTier Central 17:42 |
| **Bế Quốc Khánh** | **03:10 ngày 14/09 — PR #25: audit Spike D đầy đủ** (16 PASS · 0 FAIL · 1 NOT_RUN · 3 owner verdicts, 154 case, `uint8`, nhãn test 54/54) · tự thêm chế độ `--archive` đọc thẳng zip vì máy không đủ 14,2 GiB | PR #25 · CI 4/4 |
| **Bế Quốc Khánh** | **02:59 — review PR #17 → `CHANGES_REQUESTED`, 5 lỗi chặn thật** *(ghi nhầm là 4 tới 14/09 — review có 5 điểm)* — review thật đầu tiên, đóng cột `B` | API review |
| **Nguyễn Gia Đức Trung** | **22:56 — review 4 PR có nội dung**: approve #14, #18, #22 (tự chạy thử harness trên AVD, 10/10) · **yêu cầu sửa #23** (docstring còn ghi cellular — đúng) · **mở PR #24** cho nhánh của mình | API review |
| **Vũ Hùng Anh** | Review lại PR #15 → `APPROVED` 19:47, merge | `ee9ef60` |
| Project Control | Merge #14 (`726e09f`), **#18 — CI guardrails lên `main`** (`3077d46`), #22 vào nhánh của Trung (`c913050`) · sửa #23 theo review của Trung (`2ed3c64`) · gán Hùng Anh review #24 | — |
| Phạm Tuấn Anh *(operator)* | **Lượt đo 3 và 4 trên đường nghiệm thu mới (Wi-Fi, E12 `DIRECT`)** — lượt 3: 57/57 · **lượt 4, đủ thiết kế 3 lượt lặp: 171/171**, file 58 MB tải trọn cả 3 lần, 0 lần bị từ chối, client và server khớp từng đường dẫn. Dữ liệu thô, **chưa tổng hợp** | `spike-e/evidence-20260913` · `7c05c8c` |
| Phạm Tuấn Anh | **`DR-003b` — đường nghiệm thu Spike E đổi từ 4G/5G sang Wi-Fi + ZeroTier** (cellular: `RELAY`, tải lớn không nổi; Wi-Fi nhà: `DIRECT`) · công cụ: PR #23, PR #22 | `e697885` |
| Project Control | Tìm ra gốc lỗi `Network is unreachable` — bộ đệm đường đi theo từng nhân CPU bị ghi đè bởi multicast (cpu4/cpu6 lỗi 5/5, sáu nhân khác 5/5) · sửa harness thử lại + đếm · sửa lỗi ghi tải-dở thành `ok` | PR #22 |
| Phạm Tuấn Anh *(operator)* | Lượt đo 2 (cellular, harness đã sửa) — **dừng** sau 2,2 MB/12 phút của file 58 MB qua `RELAY` | `spike-e/evidence-20260913` · `0d4ad1e` |
| Phạm Tuấn Anh *(operator)* | **Lượt đo Spike E đầu tiên trên đường thật** — 5G Viettel → ZeroTier **RELAY** → Mac mini. 57 mẫu: 30 ok, **27 lỗi `Network is unreachable` phía điện thoại**, xen kẽ. Dữ liệu thô, chưa tổng hợp | nhánh `spike-e/evidence-20260913` · `bd5e931` |

### Điều kiện ngày — chốt sáng 14/09

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | Audit Spike D, do Khánh commit | ✅ **ĐẠT theo quyết định của leader** — PR #25 mở **03:10 ngày 14/09**, trong khung gia hạn 07:00; chỉ còn chờ review của Hùng Anh |
| 2 | Stub → cổng 8787 | ✅ **ĐẠT** 12:35, do đúng người sở hữu |
| 3 | Review PR #13 + quyết fixture | ✅ **ĐẠT** — approve 14:44, fixture merge |

**Quyết định của leader tối 13/09:** PR #23, #24, #17 chuyển thành nhiệm vụ Day 5 · khung điều kiện 1
gia hạn tới **07:00 ngày 14/09**; hạn cứng 23:59 ngày 14/09 không đổi.

**3/3 — Day 4 ĐẠT**, ngày đầu tiên đạt kể từ Day 1. Buffer **giữ 0**. Hai ngoại lệ so với chữ của luật, cả hai
là quyết định của leader và được ghi rõ: khung điều kiện 1 gia hạn tới 07:00, và "trên `main`" được tính
khi PR đã mở vì chỉ còn thiếu review. Review PR #25 là **việc làm trước số 1** của Day 5.

### Quyết định trong ngày

- **Recovery — giữ kế hoạch, KHÔNG de-scope.** Lý do: `DAY03_EOD_REVIEW` §11 — de-scope mua 0 ngày.
  **Hạn cứng: audit Spike D trước 23:59 ngày 14/09.** Trễ → leader báo giảng viên hướng dẫn. Không ai
  làm hộ.
- **`DR-006a` revision 2** — leader đo toàn bộ Spike E khi rảnh, không phải hẹn giờ trùng với Trung.
  Ràng buộc (c) được thay công khai; cái giá ghi trong `OPEN_DECISIONS.md`.
- **SSH trên laptop leader** — tắt, vì máy không phục vụ gì ngoài code. Script sẵn, **chờ chạy admin**.

### Còn tồn

| Ai | Việc | Ai đóng được |
|---|---|---|
| **Bế Quốc Khánh** | Audit `A1`–`A20` · verdict `A11` `A13` `A18` · mapping `A10` · provenance `A12` · đĩa trống + NRRD · compute `C0-1` · review PR #14 và #17 *(dụng cụ của chính cậu ấy)* | **chỉ cậu ấy — hạn 14/09 23:59** |
| **Nguyễn Gia Đức Trung** | **Mở PR** cho `docs/day4-avd-diagnostic` · review PR #14 (bản đã sửa) và #18 | chỉ cậu ấy |
| **Vũ Hùng Anh** | Re-review PR #15 · diễn giải B14 trên nhóm hợp đồng | chỉ cậu ấy |
| **Phạm Tuấn Anh** | **Auth node `078280bae8`** trên my.zerotier.com — **chặn toàn bộ phần đo Spike E** · chạy `disable_sshd.ps1` bằng quyền admin · buổi đo Spike E khi rảnh | leader |

> **`INC-001` §5:** *"làm thay không xoá nghĩa vụ."* Ngoại lệ đã hết hiệu lực 00:00 ngày 12/09.

### Hàng đợi review — **4 PR mở, cả 4 đã có người được giao**

| PR | Nhánh | Tuổi | Review |
|---|---|---|---|
| #14 | `tools/spike-d-validation` | 42 giờ | chờ Trung *(bản sửa)* + Khánh |
| #15 | `spike-b/harness-and-fixture-proposal` | 42 giờ | Hùng Anh `CHANGES_REQUESTED` → đã sửa, chờ re-review |
| #17 | `spike-c0/compute-probe` | 41 giờ | chờ Khánh |
| #18 | `chore/ci-guardrails` | 41 giờ | chờ Trung |

Hôm qua: **5 PR mở, 0 review**. Hôm nay: **3 PR merge, 4 review thật, 0 PR không người review.**

---

## DAY 3 — 2026-09-12 · **`TRƯỢT`** — mọi bế tắc bên ngoài đã gỡ, critical path vẫn đứng yên

**Gói nhiệm vụ từng người:** [`day03/tasks/`](day03/tasks/)

### Điều kiện để Day 3 KHÔNG trượt

Ba việc. Không đủ ba thì ngày này tính là trượt, bất kể làm được gì khác.

| # | Điều kiện | Ai | Vì sao là điều kiện chứ không phải mong muốn |
|---:|---|---|---|
| 1 | **`DATASET_AUDIT.md` + `dataset_manifest.json` land trên `main`**, do Khánh commit | Bế Quốc Khánh | P0 critical path. Gói đã tải xong, dụng cụ đã dựng xong — không còn lý do bên ngoài nào |
| 2 | **Hai ô `NOT_CHECKED` của Trung đóng** — Mac mini bật được, ZeroTier lên trên cả hai máy | Nguyễn Gia Đức Trung | Cổng vào `GATE 2`. Ba ngày chưa ai xác nhận |
| 3 | **4 PR treo có review thật** | cả ba | Hàng đợi tắc hoàn toàn. `15` §11: *"silence is not approval"* |

### Đã xong — đêm 2026-09-12, 00:00–01:30

| Ai | Việc | Bằng chứng |
|---|---|---|
| **Phạm Tuấn Anh** | Kết nối ZeroTier cho Mac mini · mở khoá máy cho bài đo | xác minh ở `day03/overlay_reachability_20260912.md` |
| **Phạm Tuấn Anh** / PC | **Đo lại `A9` ở kích thước slice THẬT `576×576`** — p95 **50,23 ms** | `0bc4b0b`, `EVIDENCE_RAW/a9_slice_switch_20260912T005710` |
| Project Control | **Xác minh Mac mini tới được trên overlay** — `10.134.129.115`, ping 20/20, chữ ký cổng macOS. Hai ô `NOT_CHECKED` của Trung đóng bằng **quan sát**, không phải lời khai | `7d07954` |
| Project Control | **`DR-006a`** — thiết bị ở lại với chủ, tách vai *operator* / *owner*, kèm 4 ràng buộc | `7d07954` |
| Phạm Tuấn Anh | **Ký §9 profile DR-006**, ghi rõ đường ký | `7d07954` |
| Project Control | Trả nợ `A → E → B` trong 4 file còn ghi sai · đổi reviewer Spike E sang Hùng Anh kèm **ghi rõ cái giá** | `7d07954`, `5f21ea2` |
| Project Control | **`.gitattributes`** — `sha256sum -c` trên Windows có thể **pass vì lý do không liên quan**; đã sửa tận gốc | `e9c2db1` |
| Project Control | **CI guardrails đã chứng minh biết ĐỎ** — nhánh âm sửa 1 dòng spec → 2 job spec FAIL, 2 job kia vẫn pass | PR #19 (đóng, không merge) |
| **Luồng review độc lập** | **Soi đối kháng 4 gói dụng cụ → 49 lỗi, 8 CRITICAL** | `day03/QA_REVIEW_001.md` |
| Project Control | **Sửa toàn bộ 49 lỗi**, mỗi bản sửa kiểm lại bằng chính trigger của người review | `f449380` `3a8f257` `0e0c8fe` `fabbe83` |
| Project Control | **Rút lại công khai** "phát hiện" `B14` sai mà tôi đã báo cho Hùng Anh | `9296fc0`, PR #15 |

### Đã xong — trong ngày và tối 2026-09-12

| Ai | Việc | Bằng chứng |
|---|---|---|
| **Nguyễn Gia Đức Trung** | **Review PR #16 thật** — `CHANGES_REQUESTED` 16:54 → `APPROVED` 17:10. Ba phát hiện đúng, **một cái luồng review đối kháng đã bỏ sót** | API review |
| **Nguyễn Gia Đức Trung** | `03147e3` — 141 dòng / 6 file, tự sửa cả ba phát hiện của mình | commit |
| Project Control | Merge PR #16, **kèm bản ghi** rằng hai commit đi vào nhánh người khác (`15` §191) và `APPROVED` xác nhận commit của chính người approve | `6a36909` |
| Phạm Tuấn Anh | **`DR-006a` revision 1** — đính chính lỗi nhầm kênh điều khiển với đường dữ liệu; **ZeroTier trên điện thoại VẪN bắt buộc** | `91bd052` |
| Phạm Tuấn Anh | Bảng **sinh tự động từ state file** + kho lưu trữ theo ngày, 27 link | `888c4e1` |
| Phạm Tuấn Anh | Đo chặng overlay: 100 ping, p50 **29 ms**, **max 235 ms**, mất **0%**, MTU 1500 — `DIAGNOSTIC` | `day03/` |
| Phạm Tuấn Anh | **4 lỗi chặn trong dụng cụ Spike D** — `--root` sai đường dẫn · **UTF-8 BOM** · licence bịa · `A17` không quét sidecar | `3bf2a80` |
| Project Control | **9 mục state hygiene** — gồm 7 trường device profile `UNVERIFIED` **đang chặn nghiệm thu A/B/E/F** | `2ba21cc` |
| Project Control | **`DAY03_EOD_REVIEW.md`** — 18 trường `15` §15, gồm cả trường `DAY02` thiếu | `day03/` |

### Còn tồn — sang Day 4

| Ai | Việc | Vì sao chưa xong |
|---|---|---|
| **Bế Quốc Khánh** | Audit `A1`–`A20` · verdict `A11` `A13` `A18` · mapping `A10` · provenance `A12` · đĩa trống + NRRD **trên máy bạn** · compute `C0-1` · review một PR thật | **0 hoạt động ngày thứ 4.** Gói, dụng cụ và lệnh giờ đều sẵn |
| **Vũ Hùng Anh** | Bộ geometry fixture + công bố format · review PR #13 *(33 giờ)* và #15 · phán nhóm `B14` · dòng `Reviewer:` | **0 hoạt động ngày thứ 4** |
| **Nguyễn Gia Đức Trung** | **Chạy stub → cổng 8787 → mở `GATE 2`** · ZeroTier trên điện thoại · `E1`–`E9` `E12` | có làm hôm nay, phần thiết bị chưa tới |
| **Phạm Tuấn Anh** | Gán reviewer cho PR #18 · **quyết recovery** · quyết cài gì lên Galaxy A17 | chờ quyết định |

### Kết quả ngày — **TRƯỢT**

**Hai trên ba điều kiện không đạt.** Điều kiện 1 không đạt; điều kiện 2 đạt một nửa và **do sai
người** (leader xác minh, không phải Trung), stub vẫn chưa chạy; điều kiện 3 đạt **1/6**.

**Buffer 1 → 0.** `15` §18 **trigger 2 nổ**, chồng lên **trigger 3 đã nổ** từ Day 2 và nay sống qua
**chu kỳ EOD thứ ba**. Màu trạng thái chuyển **🔴 RED**.

> **Điều đáng ghi nhất của ngày:** mọi bế tắc **bên ngoài** đã được gỡ — dataset về máy, dụng cụ
> dựng xong và sửa xong 4 lỗi chặn, Mac mini tới được, lệnh của Khánh giờ chạy được từ lệnh đầu.
> **Critical path vẫn đứng yên sang ngày thứ tư.** Từ đây nó không còn phụ thuộc vào công cụ hay dữ
> liệu nữa.

Chi tiết đầy đủ: [`day03/DAY03_EOD_REVIEW.md`](day03/DAY03_EOD_REVIEW.md)

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
