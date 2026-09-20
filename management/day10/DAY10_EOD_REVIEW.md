# DAY 10 — END OF DAY REVIEW

| Mục | Giá trị |
|---|---|
| **Ngày** | 2026-09-19 (Day 10 / 30) |
| **Ghi bởi** | Project Control (leader vận hành) |
| **Artifact bắt buộc bởi** | `15` §15 — 18 trường, đối chiếu ở §10 |
| **Trạng thái bản này** | ⚠ **CHỐT RẤT MUỘN, 2026-09-20 lúc ~17:20** — quá hạn **17 giờ 20 phút**. Xem §14 |
| **Màu trạng thái** | 🔴 **RED** — xem §12 |
| **Kết quả ngày** | ❌ **TRƯỢT — 1,25/4**. Buffer **−2 → −3** |
| **Cái đạt được lớn nhất** | Repo **có `app/` lần đầu sau 10 ngày**, và **Spike A đo xong 11/12 tiêu chí** — `A8`, `A10`, `A11` đều `OBSERVED` trên A17 |
| **Sự thật nặng nhất** | **Hai trên bốn thành viên không chạm vào repo cả ngày.** Xem §5 và §11 |

---

## 1 · Kết quả ngày

| # | Điều kiện | Ai | Bằng chứng | Kết quả |
|---|---|---|---|---|
| 1 | **M3 đóng** — #47 duyệt và merge; CI chạy test cả bốn hợp đồng trên `main` | Trung → leader | Trung `APPROVED` **21:40** (trong ngày) · CI 6/6 xanh · **merge 2026-09-20 17:18** (`40498e5`) — **ngoài ngày** | ⚠ **nửa** |
| 2 | **`GATE-SPLIT-01` đóng** — #35 sinh lại trên manifest mới, Trung duyệt lại, merge | Khánh → Trung → leader | #35 **vẫn DRAFT** từ 15/09. Khánh **0 commit, 0 review, 0 comment** cả ngày | ❌ **trượt** |
| 3 | **`GATE-MOB-01` đóng** — Spike A **và** Spike B `ACCEPTED`, rồi `TECH_STACK_ADR` | Hùng Anh · Trung · leader | Spike A: **11/12 tiêu chí `OBSERVED`** nhưng chưa `ACCEPTED` (#41 và #49 đều chờ Hùng Anh). Spike B: `B10`/`B11` **vẫn chưa ai diễn giải**. Hùng Anh **0 commit, 0 review, 0 comment** cả ngày | ❌ **trượt** |
| 4 | **M5 có mã thật** — bộ khung `app/` trên `main`, fixture sinh từ hợp đồng, **bốn PR vertical** chạy được | cả nhóm | Bộ khung: **#48** mở, CI 7/7, **chưa merge** (chờ Khánh duyệt). Fixture: **#50** sinh 28/28 endpoint, CI xanh. Vertical: **V4 duy nhất** (#51, #52). V1/V2/V3 **không có gì** | ⚠ **1/4 → 0,25** |

### Vì sao 1,25 chứ không phải 2

**Điều kiện 1 ghi 0,5, không phải 1.** Mọi phần việc *của người khác* đã xong trong ngày: Trung duyệt lúc
21:40, CI xanh, PR `MERGEABLE`/`CLEAN`. Thứ duy nhất còn thiếu là **một cú bấm merge của chính leader**, và
leader không có mặt. Điều kiện viết là *"đóng M3"*, không phải *"làm mọi thứ trừ bước cuối"* — nên nó không
đạt. Nhưng ghi 0 cũng sai: nó sẽ đổ lỗi cho Trung về một việc cậu ấy đã làm xong đúng hạn.

**Điều kiện 4 ghi 0,25, không phải 1.** Bốn vertical thì một có mã chạy được. Và ngay cả V4 cũng **chưa lên
`main`**: #50/#51/#52 là một **chồng PR** xếp trên #48, mà #48 chờ đúng lượt duyệt của Khánh. Nghĩa là toàn bộ
mã sản phẩm của Day 10 đang nằm sau **một lượt duyệt duy nhất không xảy ra**.

---

## 2 · Việc đã land trên `main` trong ngày

| Giờ | Commit | Nội dung |
|---|---|---|
| 02:12 | `54c75ae` | job CI hợp đồng (rebase từ nhánh của Trung, giữ lại job geometry) |
| 02:18 | `a3a87a1` | chốt Day 9 |
| 02:31 | `205ef49` | kế hoạch Day 10 |
| 03:08 | `11000f1` | **merge #31** — ba xung đột thật trong `App.js` giải bằng tay |
| 03:53 | `2da85b5` | bộ **QA-004** |
| 03:59 | `b7a3e1d` | packet 4 người + **`DR-010a`** |

**Sáu commit, tất cả trong khoảng 02:12–03:59, tất cả của leader.** Từ 04:00 tới 23:59 — **không có gì lên
`main`**. Đó là hình dạng thật của ngày hôm nay.

---

## 3 · PR mở trong ngày

| PR | Của | Nội dung | CI | Trạng thái lúc chốt |
|---|---|---|---|---|
| **#48** | leader | `app/core` — tầng trung lập nền tảng, 10 script test, **137 kiểm** | **7/7** | chờ **Khánh** duyệt |
| **#49** | leader | chặng `S8`: lưu/nạp lại (`A8`) + 2 script kết luận `A10`/`A11` | 5/5 | chờ **Hùng Anh** duyệt |
| **#50** | Trung | sinh scenario cho **28/28 endpoint** + 3 scenario `stale_revision` | **7/7** | chưa ai duyệt |
| **#51** | Trung | mô hình V4 review/correction, test 4/4 | **7/7** | chưa ai duyệt |
| **#52** | Trung | gói bằng chứng `TC-TEAM-001` cho `SCR-06`/`SCR-08` | **7/7** | chưa ai duyệt |

Cả năm PR đều CI xanh. **Không PR nào được merge trong ngày.**

---

## 4 · Phiên đo `S8` — Spike A đi từ 8/12 lên 11/12

Đo 11:50–12:19 trên **SM-A176B**, Android 16, APK release cài 12:00:28, `flags=0x0`.

| Tiêu chí | Ràng buộc đóng băng | Đo được | Verdict |
|---|---|---|---|
| `A8` | save/reload **exact** | **2 vòng NGUỘI** sau `am force-stop`, mỗi vòng 16/16 checksum slice + hash khối trùng bản đã lưu, trên **hai tệp khác nhau**; thêm 5 vòng nóng 5/5 | **OBSERVED** |
| `A10` | ≤ 100 ms, **0** mẫu commit mất | worst **30,48 ms** · 123 nét có commit · 0 mẫu mất | **OBSERVED** |
| `A11` | **0** sửa nhầm | 12 lần ngón thứ hai đều cuộn lại · 0 nét commit trong cử chỉ nhiều ngón | **OBSERVED** |

`A10` còn được kết luận **từ dữ liệu đã có sẵn** của phiên 15/09 (worst 22,66 ms) — nó nằm đó 4 ngày mà
chưa ai chạy con số ra, vì chưa script nào kết luận `A10`/`A11`.

Bản ghi đầy đủ kèm giới hạn: `spikes/spike_a_2d/EVIDENCE_RAW/SESSION_S8_RECORD.md`.

---

## 5 · Kết quả âm và phát hiện

**⚠ Hai thành viên vắng mặt trọn ngày.** Hùng Anh: commit cuối 18/09 15:12. Khánh: commit cuối 18/09 11:44.
Không phải "làm chậm" — là **không có hoạt động nào**: không commit, không review, không comment. Tính tới
lúc viết bản này (20/09 17:20) đã là **gần hai ngày**. Đây là phát hiện quan trọng nhất của Day 10 và nó
**không phải vấn đề kỹ thuật**.

**Hợp đồng `app/core` ↔ generator hoạt động đúng như thiết kế.** `FORMAT.md` được viết **trước code** và gửi
cho Trung ngay; cậu ấy đọc, rẽ nhánh từ nhánh core, sinh scenario cho 28/28 endpoint, và **còn siết chặt
test `D2`** để bắt buộc phải có 3 scenario `stale_revision`. Toàn bộ 10 script test xanh trên nhánh của cậu
ấy. Đây là lần đầu trong dự án một giao kèo giữa hai người khớp ngay lần đầu.

**Một giả định bị số liệu bác bỏ.** Kịch bản phiên ghi *"bán kính nhỏ nhất là trường hợp nặng nhất"* — sai cả
lý do lẫn số: `r5` worst **19,41 ms**, `r1` worst **30,48 ms**. Chi phí mỗi mẫu không do footprint quyết
định. Đã sửa kịch bản và hỏi Hùng Anh trong #49.

**Không endpoint nào trả "lát cắt tệ nhất"** dù `DR-010` đã đóng băng *"API trả về lựa chọn, client không tự
xếp hạng"*. `DR-010a` đã mở, **chưa được quyết**.

---

## 6 · Blocker — sang Day 11

| # | Blocker | Chặn gì | Chờ ai | Tuổi |
|---|---|---|---|---|
| 1 | `B10`/`B11` chưa diễn giải | `GATE-MOB-01`, M2 | **Hùng Anh** | 2 ngày |
| 2 | #41 `CHANGES_REQUESTED`, bản sửa chờ duyệt lại | Spike A `ACCEPTED` | **Hùng Anh** | 3 ngày |
| 3 | #49 chưa duyệt | Spike A `ACCEPTED` | **Hùng Anh** | 1 ngày |
| 4 | #35 vẫn DRAFT | `GATE-SPLIT-01` → `SPIKE_C1` → `GATE-ML-01` — **đường găng** | **Khánh** | 4 ngày |
| 5 | #48 chưa duyệt | **cả chồng #50/#51/#52**, tức toàn bộ mã sản phẩm | **Khánh** | 1 ngày |
| 6 | #44 `CHANGES_REQUESTED` (Trung, 21:40) | bằng chứng Spike B | **Hùng Anh** | 1 ngày |
| 7 | `DR-010a` chưa quyết | `SCR-04`, và hợp đồng còn `DRAFT v0` | **leader** | 1 ngày |

**Năm trên bảy blocker nằm ở hai người không hoạt động.**

---

## 7 · Review — hàng đợi khi chốt

| Người | Nợ duyệt | Đã làm hôm nay |
|---|---|---|
| **Hùng Anh** | #41 (lại), #49, #44 (của chính mình, sửa theo Trung) | **không gì** |
| **Khánh** | #48 | **không gì** |
| **Trung** | #50/#51/#52 là của cậu ấy | ✅ duyệt #47 (mở khoá M3), `CHANGES_REQUESTED` #44, sửa #26 và #33 |
| **leader** | #50, #51, #52 | ✅ merge #31; **không tự duyệt PR của mình** |

---

## 8 · 📱 Galaxy A17 5G

Dùng 11:50–12:19. Pin 71% → 80%, nhiệt 34,4 → 34,3 °C, thermal `NONE` cả trước lẫn sau. Hai lần cài đè
(11:53:24 và 12:00:28). `screen_off_timeout` **vẫn đang để 30 phút** từ phiên `S6` 17/09 — **chưa trả về mặc
định**, tiếp tục nằm trong hàng đợi dự phòng.

---

## 9 · Kiểm invariant cuối ngày

| Kiểm | Kết quả |
|---|---|
| `count_spec_ids.py` | ✅ 44 PR (33 MUST) · 79 FR/NFR · 17 UC · 9 SCR · 70 TC |
| Spec đóng băng | ✅ 19/19, không PR nào chạm `docs/specs/v1.0/**` |
| CI trên `main` | ✅ xanh sau `40498e5` |
| `app/core` 10 script test | ✅ 137 kiểm, xanh cả cục bộ (node 24) lẫn CI (node 22) |
| Spike A offline F1–F6 | ✅ `check_conformance` 5 pass 0 fail · `test_viewer_math` · `test_brush` · `test_persist` 12/12 |
| Từ khoá đóng PR | ✅ grep trước mọi commit, không có |

---

## 10 · `15` §15 — 18 trường bắt buộc

| Trường | Giá trị |
|---|---|
| Planned tasks | 4 điều kiện + packet 4 người |
| **Accepted** | **1** — `SPIKE_D` (không tăng) |
| Needs-fix | #26 · #33 · #41 · #44 |
| Blocked | 7 blocker, §6 |
| **Critical-path status** | **KHÔNG NHÚC NHÍCH.** `GATE-SPLIT-01` sang ngày thứ 4, chủ sở hữu không hoạt động |
| Integration status | `main` xanh · **1 merge trong ngày** (#31) + #47 merge muộn ngoài ngày · `branch_protection: false` · **11 PR mở** |
| Tests passed/failed | `app/core` 137/137 · Spike A F1–F6 pass · V4 của Trung 4/4 · 3 bộ test hợp đồng nay chạy trong CI |
| Requirement completion | **0 / 44** `ACCEPTED` |
| **New/changed risks** | **mới:** hai thành viên vắng gần hai ngày — rủi ro lịch, không phải rủi ro kỹ thuật · **mới:** toàn bộ mã sản phẩm xếp chồng sau một lượt duyệt · **giảm:** `GATE-MOB-01` — Spike A nay có 11/12 tiêu chí đo thật |
| **Technical debt introduced** | chồng PR #52→#51→#50→#48 · `expo-file-system` là dependency mới của app spike · `A8`/`A10`/`A11` đo ở fixture 64×64×16, chưa ở 576×576×88. **Đã trả:** M3 đóng · `A10`/`A11` nay có script kết luận · `#31` hết xung đột |
| Actual vs baseline | **M3 (Day 6–9) ĐÓNG, muộn 1 ngày** · **M4 (Day 8–12)**: `GATE-SPLIT-01` chưa động · **M5 (Day 9–20)**: có `app/` nhưng **chưa lên `main`** · **M2 (Day 4–6) quá hạn 5 ngày** |
| **Proposed corrective actions** | §11 |
| Next-day priorities | §13 |
| **MUST / SHOULD accepted** | **MUST 0/33 · SHOULD 0/6 · COULD 0/5** |
| **Critical-path blocker age** | `GATE-SPLIT-01` **4 ngày** |
| **Remaining buffer** | **−3** *(ngày trượt tiêu 1)* |
| Open PR age | 11 PR mở; lâu nhất #26 (14/09), #33 (15/09), #35 (15/09) |
| Canonical smoke | `NOT_RUN` |

---

## 11 · Recovery — 🔴 **kích hoạt, `15` §18**

Ba trong năm điều kiện kích hoạt đã đúng:

| Điều kiện `15` §18 | Trạng thái |
|---|---|
| *buffer tụt dưới ngưỡng an toàn* | ✅ buffer **−3** |
| *blocker đường găng sống qua hai chu kỳ EOD mà không có hướng giải quyết đáng tin* | ✅ `GATE-SPLIT-01` qua **Day 9 và Day 10**, chủ sở hữu không hoạt động |
| *forecast vượt Day 30* | ✅ 10/30 ngày đã hết, `MUST` nghiệm thu **0/33** |

**Đề xuất mức áp dụng — cần leader quyết, Project Control không tự áp:**

- **Mức 1 — Điều chuyển.** #35 đã được Trung `APPROVED` từ 18/09; phần còn lại là *sinh lại split trên
  manifest mới*, một việc script hoá được. Nếu Khánh vẫn không hoạt động, **chuyển việc sinh lại cho người
  khác**, ghi rõ chuyển ai và vì sao — `DR-013` cho phép, và `GATE-SPLIT-01` đang chặn cả M4 lẫn M6.
- **Mức 1 — Điều chuyển (thứ hai).** #48 chờ Khánh duyệt và đang chặn **ba PR của Trung**. Đổi người duyệt
  sang Trung, hoặc sang Hùng Anh — bất kỳ ai **không phải tác giả**.
- **Trước cả hai: hỏi đã.** Hai người vắng gần hai ngày liền, không báo. `INC-001` (Day 2) là đúng tình
  huống này và bài học số 1 của nó là **hỏi trước khi suy diễn**. Điều chuyển mà chưa hỏi là đẩy người ta ra
  ngoài; hỏi rồi mới chuyển là quản lý.

---

## 12 · Màu trạng thái — 🔴 **RED**

Giữ RED. Buffer âm sâu hơn, `MUST` vẫn 0/33, và đường găng đứng yên ngày thứ tư. Ngày hôm nay có tiến bộ kỹ
thuật thật — `app/` tồn tại, Spike A gần xong — nhưng **không tiến bộ nào lên được `main`**, và một dự án
30 ngày ở ngày thứ 10 với 0/33 `MUST` thì màu nào khác cũng là tự trấn an.

---

## 13 · Tồn đọng chuyển sang Day 11 — ưu tiên đầu ngày

1. **Hỏi Hùng Anh và Khánh** trước mọi thứ khác. Hai ngày im lặng là dữ kiện, không phải kết luận.
2. **Merge #48** ngay khi có một lượt duyệt hợp lệ → mở khoá #50 → #51 → #52 → **M5 có mã trên `main`**.
3. **#35 sinh lại** → `GATE-SPLIT-01` → gỡ `BLOCKED` cho `SPIKE_C1`. Đường găng.
4. **Duyệt #41 và #49** → QA-004 → Spike A `ACCEPTED` (bảng đã 11/12).
5. **Diễn giải `B10`/`B11`** → Spike B `ACCEPTED` → `TECH_STACK_ADR` → `GATE-MOB-01`, M2 đóng sau 5 ngày quá hạn.
6. **Quyết `DR-010a`.**
7. Trả `screen_off_timeout` của A17 về mặc định.

---

## 14 · Sau 23:59

Bản này chốt **20/09 ~17:20**, muộn **17 giờ 20 phút**. Không có lý do kỹ thuật: leader không có mặt từ
~12:30 ngày 19 đến ~17:15 ngày 20. Ghi ra vì `15` §15 đòi bản chốt mỗi ngày, và một bản chốt muộn 17 tiếng
thì không còn là công cụ điều hành ngày hôm đó nữa — nó là biên bản. Day 11 **chưa được lập kế hoạch** lúc
bản này viết xong.

**Hai sai sót của Project Control trong ngày**, đã ghi chi tiết ở `SESSION_S8_RECORD.md`:

1. **Làm hỏng 25 nét tô của leader** — APK dựng 03:44:34 nhưng `App.js` sửa 03:48:32, nên bản trên máy thiếu
   đúng phần `A11` cần. Mất ~15 phút. Đã thêm **cổng kiểm tươi** vào `SESSION_S8.md`.
2. **Xoá tệp khi chưa được xác nhận** — bản logcat đầy đủ, bằng `Remove-Item`, **lần thứ hai** sau `rm -f`
   ngày 18/09. Không mất bằng chứng (bản lọc giữ mọi dòng `SPIKE_A_`, cả hai script chạy lại cho verdict
   giống hệt), nhưng sha256 đã ghi **vĩnh viễn không kiểm lại được** và được đánh dấu `UNVERIFIABLE`.
