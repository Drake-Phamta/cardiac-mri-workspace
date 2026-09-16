# DAY 06 — END OF DAY REVIEW

| Mục | Giá trị |
|---|---|
| **Ngày** | 2026-09-15 (Day 6 / 30) |
| **Ghi bởi** | Project Control (leader vận hành) |
| **Artifact bắt buộc bởi** | `15` §15 — 18 trường, đối chiếu ở §10 |
| **Trạng thái bản này** | ✅ **CHỐT 16/09 ~01:45** theo quyết định của leader, sau lần kiểm GitHub cuối lúc 01:25. Việc sau 23:59 nằm ở **§14** |
| **Màu trạng thái** | 🔴 **RED** — xem §12 |
| **Kết quả ngày** | ❌ **CHƯA ĐẠT — 3/4** · buffer **0 → −1**, xem §1 |

---

## 1 · Kết quả ngày

| # | Điều kiện | Ai | Kết quả khi chốt |
|---|---|---|---|
| 1 | **PR #25 trên `main`** | Vũ Hùng Anh → Phạm Tuấn Anh | ✅ **ĐẠT** — Hùng Anh approve 10:03:17 rồi tự merge 10:03:26 (`a92892c`) |
| 2 | **Bằng chứng nối case↔bệnh nhân** (PR) + **lượt probe C0 trên RTX 4050** được commit | Bế Quốc Khánh | ✅ **ĐẠT MUỘN — theo quyết định của leader.** Cả hai lên **sau 23:59**: bằng chứng nối bệnh nhân ở PR nháp #35 lúc **00:20** (`d66925b`), probe C0 ở PR nháp #36 lúc **01:08** (`36789c0`, fp32 + bf16, 20/20 phép đo). Leader, ~01:00: *"Khánh nộp muộn cũng cho qua"*. Lượt probe lên **sau** lúc leader quyết; Project Control áp cùng quyết định đó — leader có thể bác, kết quả ngày không đổi |
| 3 | **Stub 2 profile chạy trên Mac mini** (đã kiểm, trước 20:30) + **review PR split** | Nguyễn Gia Đức Trung | ❌ **TRƯỢT** — cổng `10.64.193.115:8787` vẫn đóng lúc 21:28; Trung ghi trên #26 (22:20) là **không có quyền SSH** để khởi động tiến trình. PR split để review chỉ mở lúc 00:20 (#35) |
| 4 | **`B1`** — app 3D render mesh + camera (PR nháp có ảnh) | Vũ Hùng Anh | ✅ **ĐẠT theo chữ của điều kiện** — PR nháp #30 lúc 10:21: WebGL2, xoay + zoom, ảnh chụp. *Review của Trung 21:39: `B1` trong TASK đòi xoay, zoom **và pan** — #30 chưa có pan, nên `B1` theo TASK chưa trọn* |

**Luật viết từ đầu ngày:** không đủ bốn thì ngày trượt. **Leader, 16/09 ~01:00: chốt Day 6 chưa đạt.** Buffer
**0 → −1** — lần đầu âm. Hạn Day 30 không lùi.

### Vì sao điều kiện 3 trượt — phần lớn là lỗi lập kế hoạch của Project Control

| | |
|---|---|
| Việc đã giao | Trung dựng stub 2 profile trên Mac mini, kiểm `/health` và từng profile (packet Day 6, việc 2) |
| Điều packet không kiểm | **Trung vào Mac mini bằng cách nào.** Sau khi dừng stub cũ lúc 09:48, Project Control ghi *"việc 2 không còn chờ ai"* mà không hỏi quyền truy cập. 22:20 Trung ghi trên #26: *"Tôi không có quyền SSH để restart process"* |
| Thay đổi trong ngày | 13:07 — leader chỉ có điện thoại buổi tối → huỷ khung 15:00, hạn stub dời sang 20:30 |
| Phần review | PR split thay #28 mở lúc 00:20 (#35) — sau hạn, không thể review trong ngày |
| Trung vẫn làm được | sửa #24 (`be52d6f`) và #26 (`a585907`) · review #29 và #30 · `E9` drill (#33) · hợp đồng ingestion 1 v0 (#32) · kiểm HEAD tiến trình đang chạy lúc 22:27: **cùng payload 58 392 576 byte cho cả hai profile** |

**Điểm tốt của ngày, ghi lại để không bị kết quả che mất:** lần đầu có bằng chứng Spike D trên `main`; QA Red Team
bắt được lỗi rò rỉ dữ liệu **trước** khi train; Spike A đo `A3`–`A7` trên máy `OBSERVED`; review của Trung bắt được
`B1` thiếu pan; Khánh chạy trọn ma trận probe C0.

---

## 2 · `started_at` từng spike

| Spike | Chủ sở hữu | Status | `started_at` | `evidence_present` |
|---|---|---|---|---|
| `SPIKE_D` **P0** | Bế Quốc Khánh | **`NEEDS_FIX`** | 2026-09-11T12:00+07 | **`true`** — `RESULT.md` trên `main` từ `a92892c`; QA-002 `REJECT`; bản sửa ở PR nháp #34 |
| `SPIKE_A` | Phạm Tuấn Anh | `ACTIVE` | 2026-09-11T12:00+07 | `false` *(`A2` ở PR #27, `A3`–`A7` ở PR #31 — đều `OBSERVED`)* |
| `SPIKE_B` | Vũ Hùng Anh | `ACTIVE` | 2026-09-11T12:00+07 | `false` *(`B14` #29, `B1` #30 — cả hai bị yêu cầu sửa)* |
| `SPIKE_E` | Nguyễn Gia Đức Trung | `ACTIVE` | 2026-09-11T12:00+07 | `false` *(nháp `RESULT.md` ở PR #26)* |
| `SPIKE_C0` | Bế Quốc Khánh | `PREPARED` | `null` | `false` — ⚠ **probe đã chạy** (file đầu tiên ghi 16/09 00:43:25, PR nháp #36). `started_at` do chủ spike khai; Project Control cập nhật theo |
| `SPIKE_C1` | Bế Quốc Khánh | **`BLOCKED`** `[SPIKE_D]` | `null` | `false` |
| `SPIKE_F` | Vũ Hùng Anh | `PREPARED` | `null` | `false` |

**`ACCEPTED = 0`.**

---

## 3 · Việc đã land trong ngày

| Giờ | Ai | Việc | Bằng chứng |
|---|---|---|---|
| 06:42 | Phạm Tuấn Anh *(Claude viết, leader duyệt)* | **Sửa PR #17** — 2 lỗi runtime Khánh tìm trên RTX 4050, cộng 2 lỗi tìm thêm trên RTX 3050 Ti (CUDA hỏng cả tiến trình sau OOM → mỗi phép đo một tiến trình con; batch tràn VRAM bị ghi như số thật) | `08d7166` |
| ~06:55 | Project Control | Mở lại #17 — bị đóng nhầm 06:01 vì commit kế hoạch Day 6 ghi "fix #17". Từ đó không commit nào trên `main` dùng từ khoá đóng PR | `43f27f8` · comment #17 |
| 09:48 | Phạm Tuấn Anh | Dừng stub cũ PID 32227 trên Mac mini (SIGTERM, có chốt kiểm lệnh chạy); log cũ giữ nguyên | `1293854` |
| 10:03 | **Vũ Hùng Anh** | Approve + merge **#25** — audit Spike D lên `main` | `a92892c` |
| 10:04 · 10:09 · 10:13 | **Vũ Hùng Anh** | Review lại #24 (`CHANGES_REQUESTED`, 1 điểm) · review #26 (`CHANGES_REQUESTED`, 3 điểm) · soát #27 (4/4 kiểm đạt) | API review |
| 10:14 · 10:21 | **Vũ Hùng Anh** | **`B14`** diễn giải (#29) · **`B1`** viewer WebGL2 xoay/zoom + ảnh (#30 nháp) | PR #29 · PR #30 |
| 10:51 · 11:06 | Phạm Tuấn Anh · Project Control | #27 chuyển ready, nhờ Hùng Anh review · **chuẩn demo v0** — chờ leader duyệt | `3b126a4` |
| 11:52 | Phạm Tuấn Anh *(phiên QA độc lập; Project Control chạy lại F1 lúc 11:58)* | **QA Red Team Spike D — `REJECT`** (QA-002): 1 CRITICAL · 4 HIGH · 8 MEDIUM · 3 LOW; mọi con số khác tái lập đúng | `f7455f8` |
| 12:13 | Phạm Tuấn Anh *(Claude viết, leader duyệt)* | **Spike A S5 brush** — PR nháp #31; kiểm offline F5 14/14, F4 6/6 | `cf84802` · `c69f21d` |
| 12:29 | Phạm Tuấn Anh | **`DR-002a`** (Q1) · Q3 | `c0d33ce` |
| 13:07 | Phạm Tuấn Anh | Huỷ khung Spike E 15:00 — leader chỉ có điện thoại buổi tối; hạn stub 20:30 | `8cda63d` |
| 21:13–21:21 | Phạm Tuấn Anh *(chủ Spike A, tự bấm)* | **S5 trên máy: `A3`–`A7` `OBSERVED`** (A3 8/8 · A4 6/6 · A5 60/60 ở r = 0 và r = 2 · A6/A7 15/15) · `A2` kiểm lại `OBSERVED` | `1c62a00` · `92aa143` |
| 21:21–21:22 | **Nguyễn Gia Đức Trung** | Sửa #26 (tổng hợp theo profile, JSON sinh lại, kế hoạch đo Toybox) · sửa #24 (ID mạng ZeroTier) | `a585907` · `be52d6f` |
| 21:31 → 22:03 | **Nguyễn Gia Đức Trung** | **`E9`** reconnect/retry drill cho harness Toybox — PR #33, xếp chồng trên #24 | `32ef07a` |
| 21:38–21:39 | **Nguyễn Gia Đức Trung** | Review #29 (`CHANGES_REQUESTED`: đoạn diễn giải lặp) · #30 (`CHANGES_REQUESTED`: **thiếu pan**) | API review |
| 22:01–22:25 | **Nguyễn Gia Đức Trung** | **Hợp đồng ingestion 1 v0** — PR #32: schema, validator offline, 9 ca kiểm tổng hợp, gồm checksum trùng và header hình học mặc định (theo QA-002) | `f97b78f` |
| 22:08–22:27 | **Nguyễn Gia Đức Trung** | Trả lời review #24/#26 · kiểm HEAD tiến trình đang chạy: hai profile cùng `Content-Length` 58 392 576, không có `X-Payload-Profile` | comment #24 · #26 |

**Review tiếp tục bắt lỗi thật:** Trung — `B1` thiếu pan, đoạn lặp ở #29; Hùng Anh — JSON tổng hợp của #26 sinh từ
bản script cũ; Khánh (§14) — xác nhận bản sửa #17 trên GPU thật và chỉ ra lỗi Unicode của console. QA-002 — cặp case
trùng mà cả audit **lẫn** review đều bỏ sót.

---

## 4 · Quyết định governance

| Quyết định | Nội dung | Ghi ở |
|---|---|---|
| **Khối lượng** *(sáng 15/09)* | Thành viên ≥ 8 h việc thật + ~2 h dự phòng; việc bị chặn luôn có việc thay thế | `days.yaml` policies |
| **Chuẩn demo** *(15/09)* | Sản phẩm cuối phải "wow"; mỗi packet có dòng 🎯. v0 soạn 11:06 — **leader duyệt Day 7** | `DEMO_STANDARD.md` |
| **`DR-002a`** *(12:29)* | `CASE_0056`/`CASE_0097` là một nhóm, ghim vào train; 80/20 và seed 2024 giữ nguyên | `OPEN_DECISIONS.md` |
| **Q3** *(12:29)* | Bỏ đường dẫn tuyệt đối khỏi manifest ngay; phần còn lại chờ Khánh trích điều khoản CAP | QA-002 §9 |
| **Q2** | **Chưa quyết** — hoãn tới cuối ngày, rồi sang Day 7 | QA-002 §9 |
| **Khung đo Spike E** *(13:07)* | Huỷ khung 15:00; stub trước 20:30 cho khung 21:00 | packet Trung · leader |
| **Khánh nộp muộn** *(16/09 ~01:00)* | Cho qua — tính cho điều kiện 2 | §1 |
| **Kết quả Day 6** *(16/09 ~01:00)* | Chưa đạt | §1 |

---

## 5 · Kết quả âm (`NEGATIVE_RESULT`)

Không có. QA `REJECT` Spike D là trả về sửa (`NEEDS_FIX`), không phải kết quả âm.

---

## 6 · Blocker — sang Day 7

| # | Blocker | Chặn gì | Ai gỡ |
|---|---|---|---|
| 1 | **Spike D `NEEDS_FIX`** — bản sửa ở PR nháp #34; Khánh chưa xác nhận lời lẽ `A11`/`A14`/F5; Q2 chưa quyết | `GATE-DATA-01` · `SPIKE_C1` | Khánh (ready) → leader (Q2, F5) → Hùng Anh (duyệt lại) → QA soi lại |
| 2 | **`GATE-SPLIT-01` — nối bệnh nhân:** bài benchmark của challenge ghi 154 lần chụp từ **60 bệnh nhân**; gói không có ánh xạ; Khánh kết luận `BLOCKED_PATIENT_LINKAGE` (#35) | đóng `GATE-SPLIT-01` · `SPIKE_C1` · mốc M4 | **leader** — Decision Request |
| 3 | **Stub Spike E chưa dựng** — thiếu quyền SSH; tiến trình đang chạy trả cùng một payload cho hai profile | đo lại `E1`–`E9` trên payload thật · `E8` | **leader** chọn đường → Project Control hoặc Trung |
| 4 | **Hàng review của Hùng Anh:** #24 #26 (Trung chờ từ 21:22) · #27 #31 · #34 khi ready · #36 #37 — không có hoạt động sau 10:26 | merge Spike E · Spike D · Spike A · C0 | Hùng Anh — thứ tự trong packet Day 7 |
| 5 | **#17 đã approve, chưa merge** — #36/#37 xếp chồng trên nhánh của nó nên chưa có CI | review bằng chứng C0 | **leader** merge (merge commit, giữ nhánh) |

---

## 7 · Review — hàng đợi khi chốt

| PR | Tác giả | Trạng thái | Chờ |
|---|---|---|---|
| **#17** | Phạm Tuấn Anh | **`APPROVED`** 00:29 (Khánh) · CI 4/4 · mergeable | **leader** merge |
| **#24** | Nguyễn Gia Đức Trung | `CHANGES_REQUESTED` → **đã sửa 21:22** | **Vũ Hùng Anh** |
| **#26** | Nguyễn Gia Đức Trung | `CHANGES_REQUESTED` → **đã sửa 21:21** | **Vũ Hùng Anh** |
| #27 | Phạm Tuấn Anh | soát 10:13 (4/4) · nhờ review 10:51 | Vũ Hùng Anh |
| #29 | Vũ Hùng Anh | `CHANGES_REQUESTED` 21:38 (Trung) — đoạn lặp | Vũ Hùng Anh sửa |
| #30 *(nháp)* | Vũ Hùng Anh | `CHANGES_REQUESTED` 21:39 (Trung) — thiếu pan | Vũ Hùng Anh sửa |
| #31 *(nháp)* | Phạm Tuấn Anh | `A3`–`A7` `OBSERVED` · nhờ review | Vũ Hùng Anh |
| #32 | Nguyễn Gia Đức Trung | chưa nhờ ai review | đề xuất: leader (khối integration / cross-contract) |
| #33 | Nguyễn Gia Đức Trung | xếp chồng trên #24 · chưa có CI | Vũ Hùng Anh, sau #24 |
| **#34** *(nháp)* | Bế Quốc Khánh | HITL — chưa ready | Khánh → **Vũ Hùng Anh** |
| #35 *(nháp)* | Bế Quốc Khánh | chờ #34 | Nguyễn Gia Đức Trung |
| #36 *(nháp)* | Bế Quốc Khánh | xếp chồng trên #17 | Vũ Hùng Anh |
| #37 *(nháp)* | Bế Quốc Khánh | xếp chồng trên #17 | Vũ Hùng Anh |

**Trong ngày:** 1 merge (#25) · review có nội dung: Hùng Anh #25 #24 #26 (+ soát #27) · Trung #29 #30 · Khánh #17
(sau 23:59) · 0 review dưới tài khoản người khác. **13 PR mở khi chốt.**

---

## 8 · 📱 Galaxy A17 5G

| | |
|---|---|
| Spike A | **S5 bản release** 21:13–21:21 — `A3`–`A7` `OBSERVED`, `A2` kiểm lại `OBSERVED` · người bấm: chủ Spike A · `1c62a00` |
| Spike E | **không đo** — lúc 21:28 cổng `10.64.193.115:8787` đóng, chưa có stub 2 profile |
| Spike B | chưa có app trên máy — #30 mới chạy trên trình duyệt desktop |
| Mac mini | stub cũ PID 32227 dừng 09:48 · tiến trình ở `10.134.129.115:8787` trả payload cũ 58 392 576 byte cho cả hai profile (Trung kiểm 22:27) |

---

## 9 · Kiểm invariant cuối ngày

| # | Invariant | Kết quả |
|---:|---|---|
| 1 | Spec đóng băng | ✅ **19/19** — guardrails xanh trên mọi push lên `main` trong ngày |
| 2 | 0 commit chạm `docs/specs/v1.0/` | ✅ — `git log --all` từ 15/09: 0 |
| 3 | `ACCEPTED = 0` | ✅ |
| 4 | `evidence_present: true` | **1** — `SPIKE_D`, vì `RESULT.md` lên `main` (`a92892c`). Đúng luật; không phải `ACCEPTED` |
| 5 | `SPIKE_C1` vẫn `BLOCKED [SPIKE_D]` | ✅ |
| 6 | `SPIKE_C0.started_at` vẫn `null` | ⚠ **đúng trong file, lệch thực tế** — probe chạy 16/09 00:43 (#36). Chủ spike khai, Project Control cập nhật trong Day 7 |
| 7 | 0 dataset byte trong git | ✅ — kiểm "no dataset bytes" đạt trên #32 #34 #35; #36 #37 chưa có CI (base không phải `main`), danh sách file chỉ có JSON số đo, SVG và script |
| 8 | Manifest trên `main` sạch đường dẫn máy cá nhân | ⚠ `dataset_manifest.json` trên `main` (`a92892c`) **vẫn còn đường dẫn tuyệt đối** (QA-002 F5, Q3) — bản sửa ở #34 |
| 9 | `tests/fixtures/geometry/**` chỉ do chủ sở hữu viết | ✅ 0 commit chạm trong ngày |
| 10 | Không `TECH_STACK_ADR.md`, không `ADR-ML-001` | ✅ |
| 11 | Mọi commit: tác giả thật | ✅ Drake-Phamta · Trung · qkhanhbe *(cùng email với "Quoc Khanh")* · scallion *(Hùng Anh)* |
| 12 | Không review dưới tài khoản người khác | ✅ |
| 13 | `RESULT.md` trên `main` | ✅ `SPIKE_A_2D` · `SPIKE_D_DATASET` *(Spike E nháp ở #26, C0 ở #36)* |
| 14 | Split chưa chạy trên kết quả test nào | ✅ chưa có kết quả mô hình nào — `DR-002a` quyết trước mọi con số |
| 15 | Không từ khoá đóng PR trong commit trên `main` sau sự cố 06:01 | ✅ `git log --grep` từ 06:02: 0 |

---

## 10 · `15` §15 — 18 trường bắt buộc

| Trường | Giá trị |
|---|---|
| Planned tasks | 4 điều kiện + packet 4 người |
| **Accepted** | **0** |
| Needs-fix | Spike D (QA-002) · #24 #26 (đã sửa, chờ duyệt lại) · #29 #30 (chờ Hùng Anh sửa) |
| Blocked | 5 blocker, §6 |
| **Critical-path status** | **LÙI RỒI NHÍCH** — #25 merge → QA `REJECT` → `NEEDS_FIX`; bản sửa ở #34 (00:19). `GATE-SPLIT-01` thêm một chặn: 60 bệnh nhân, không có ánh xạ |
| Integration status | `main` xanh · `ci_configured: true` · `branch_protection: false` · 1 merge (#25, do reviewer merge) · 13 PR mở |
| Tests passed/failed | Chưa có test sản phẩm. Kiểm dụng cụ spike: S5 brush F5 14/14 + F4 6/6 (offline) · `A3`–`A7` `OBSERVED` trên máy · hợp đồng 1: 9/9 (Trung) · split 11/11 + sàng lọc MRI 5/5 (#35) · probe 8/8 + 10/10, ma trận C0 20/20 (#36) · pipeline 5/5 (#37) · validator trên cohort chính thức 16 PASS / 0 FAIL / `A19` NOT_RUN (#34) |
| Requirement completion | **0 / 44** `ACCEPTED` *(đếm lại 15/09; tài liệu quản lý cũ ghi 39 — đính chính chờ leader, `DEMO_STANDARD.md` §11)* |
| **New/changed risks** | **mới:** 154 lần chụp / 60 bệnh nhân, không ánh xạ → `GATE-SPLIT-01` bị chặn · 462/462 header hình học mặc định → mm/mL tắt · việc cần quyền truy cập được giao mà không kiểm quyền · hàng review dồn vào Hùng Anh (7 PR). **Giảm:** RISK-COMPUTE — probe C0 đã có số trên RTX 4050 |
| **Technical debt introduced** | lỗi validator F6–F11, F14–F15 (QA-002) chưa sửa · manifest trên `main` còn đường dẫn tuyệt đối tới khi #34 merge · 3 chồng PR (#31 trên #27 · #33 trên #24 · #36 #37 trên #17) · `SPIKE_C0.started_at` trễ thực tế · đính chính số đếm yêu cầu. **Đã trả:** 2 lỗi runtime #17 · stub cũ · pagefile máy Khánh |
| Actual vs baseline | **chậm thêm 1 ngày** — buffer −1. Lối ra M1 (Day 1–4) và M2 (Day 4–6) đều chưa đạt |
| **Proposed corrective actions** | §11 |
| Next-day priorities | §13 |
| **MUST / SHOULD accepted** | **MUST 0/33 · SHOULD 0/6 · COULD 0/5** *(đếm lại 15/09)* |
| **Critical-path blocker age** | **7 ngày** *(`SPIKE_D` từ 2026-09-09)* — bằng chứng lên `main` rồi bị QA bác |
| **Remaining buffer** | **−1** *(0 → −1)* |
| Open PR age | 13 PR mở — lâu nhất #17 (97 h, đã approve) · #24 (50 h) · #26 (41 h) · #27 (38 h). #32 chưa có người được nhờ review |
| Canonical smoke | `NOT_RUN` |

---

## 11 · Recovery và hành động khắc phục

**Trigger `15` §18 khi chốt Day 6:**

| Trigger | Trạng thái |
|---|---|
| 1 · dự báo vượt Day 30 | không tính được — chưa có việc `ACCEPTED` để ngoại suy (`forecast.current_completion_day: null`) |
| 2 · buffer dưới ngưỡng an toàn | ⚠ **NỔ lần nữa** — 0 → **−1** |
| 3 · blocker critical path sống qua hai chu kỳ EOD | ⚠ **theo dõi** — câu hỏi nối bệnh nhân của `GATE-SPLIT-01` ghi từ lúc chốt Day 5, vẫn mở khi chốt Day 6. Đường gỡ: Decision Request trong Day 7 |
| 4 · smoke hỏng lặp lại | không áp dụng — chưa có smoke |
| 5 · gate khoa học chưa giải quyết tới ngày bắt đầu an toàn cuối | ⚠ **đang tới gần** — `GATE-SPLIT-01` phải đóng trước `SPIKE_C1` (mốc M4, Day 8–12) |

**Quyết định recovery đang có hiệu lực:** 13/09 — *giữ kế hoạch, không de-scope* (de-scope `COULD` mua 0 ngày,
`DAY03_EOD_REVIEW` §11). Quyết định đó đưa ra khi buffer 0; nay buffer −1 nên **leader cần xác nhận lại hoặc đổi**
trong Day 7.

**Đề xuất của Project Control — chỉ Level 1, không chuyển quyền sở hữu (`DR-013`):**

1. **Gỡ phụ thuộc quyền truy cập cho stub Spike E.** Phương án A: Project Control dựng stub bằng SSH của leader theo lệnh
   Trung ghi trên #26 — giống cách leader bấm điện thoại cho Spike E (`DR-006a` rev 2); Trung vẫn thiết kế, tự kiểm và
   tính số. Phương án B: leader cấp khoá SSH cho Trung. Leader chọn trước 10:00.
2. **Thứ tự review của Hùng Anh:** #24/#26 (ngắn, mở khoá buổi đo tối) → #34 (P0, khi ready) → #27/#31 → C0 (#36/#37).
   Vẫn một review tại một thời điểm; không đổi reviewer.
3. **Mốc đẩy giữa ngày cho Khánh: 12:00 và 18:00** — ba ngày liền phần việc lên sau nửa đêm (Day 4 03:10 · Day 5 00:44 ·
   Day 6 00:19–01:14).
4. **`GATE-SPLIT-01`:** Project Control soạn Decision Request trước 12:00 Day 7, leader quyết trong ngày — để câu hỏi không
   sang chu kỳ EOD thứ ba.
5. **Luật lập kế hoạch, Project Control tự sửa:** việc cần quyền (SSH, tài khoản, thiết bị, dữ liệu) ghi rõ **cần quyền gì ·
   ai đang có** ngay trong packet và được kiểm trước khi giao. Áp dụng từ packet Day 7.
6. **Merge PR có PR khác xếp chồng bằng merge commit và giữ nhánh base** tới khi PR phía trên đổi base — #28 đã bị đóng tự
   động ngày 15/09 khi nhánh base bị xoá.
7. **Chưa đề xuất Level 2/3:** ghép cặp không làm #34 nhanh hơn (phần còn lại là xác nhận của chủ spike) và không thay được
   quyết định của leader về split. Xét lại khi chốt Day 7 nếu Spike D chưa được duyệt lại.

---

## 12 · Màu trạng thái — 🔴 RED

Giữ RED. Buffer −1, `ACCEPTED = 0`, Spike D bị QA bác, `GATE-SPLIT-01` bị chặn bởi nối bệnh nhân. Xét lại khi Spike D
`ACCEPTED` và `GATE-SPLIT-01` có quyết định.

---

## 13 · Ưu tiên Day 7 (16/09)

| # | Việc | Ai |
|---|---|---|
| 1 | **#34 ready trước 12:00** → duyệt lại → merge → **QA soi lại** Spike D | Bế Quốc Khánh → Vũ Hùng Anh → Phạm Tuấn Anh |
| 2 | **Merge #17** *(đã xong 02:19 — `8bf1a2f`, squash, giữ nhánh)* · **quyết Q2 · chọn đường dựng stub** trước 10:00 · duyệt `DEMO_STANDARD` v0 | Phạm Tuấn Anh |
| 3 | **Decision Request nối bệnh nhân** — soạn trước 12:00, quyết trong ngày | Project Control → Phạm Tuấn Anh |
| 4 | Duyệt lại **#24 · #26** → merge → stub 2 profile đã kiểm trước 20:30 → **đo Spike E khung 21:00** | Vũ Hùng Anh → Phạm Tuấn Anh → Nguyễn Gia Đức Trung → Phạm Tuấn Anh |
| 5 | **Review #35** | Nguyễn Gia Đức Trung |
| 6 | **#30 thêm pan · #29 bỏ đoạn lặp** → picking `B3`/`B4` | Vũ Hùng Anh |
| 7 | #36 `C0-7`/`C0-8` · đổi base #36/#37 sau khi #17 merge · lỗi validator F6–F11, F14–F15 | Bế Quốc Khánh |

Packet đầy đủ: `management/day07/tasks/`.

---

## 14 · Sau 23:59 — việc land tới lúc chốt

| Giờ (16/09) | Ai | Việc | Bằng chứng |
|---|---|---|---|
| 00:19 | **Bế Quốc Khánh** | **PR nháp #34 — sửa Spike D theo QA-002** (F1–F5, F12, F13): kiểm hash chéo giữa các case tìm ra `CASE_0056`/`CASE_0097`; 462/462 header hình học mặc định ghi là chỉ mức header, mm/mL tắt; bỏ đường dẫn tuyệt đối; trích điều khoản CAP §§6–7; cohort chính thức 16 PASS / 0 FAIL / `A19` NOT_RUN; CI 4/4. Còn HITL: lời lẽ `A11`/`A14`/F5 | `b52d81d` |
| 00:20 | **Bế Quốc Khánh** | **PR nháp #35 — thay #28:** split Path A theo `DR-002a` (selftest 11/11) + `PATIENT_LINKAGE_EVIDENCE.md`: bài benchmark của challenge ghi **154 lần chụp từ 60 bệnh nhân**; sàng lọc chỉ từ ảnh MRI (11 781 cặp) tìm lại cặp trùng ở **hạng 1** (r = 0,996141); kết luận `BLOCKED_PATIENT_LINKAGE`; JSON điểm từng case để ngoài repo chờ quyết F5; CI 4/4 | `d66925b` |
| 00:20 | **Bế Quốc Khánh** | Bật pagefile `C:\pagefile.sys` 15 610 MiB — nợ Day 6 việc 1 | comment #17 |
| 00:29 | **Bế Quốc Khánh** | **Approve #17** sau khi chạy lại trên RTX 4050: 2 lỗi runtime hết khi chạy thật; selftest 8/8 + 10/10; UNet `--img 560 --find-batch` báo batch tối đa 15; `facebook/dinov2-small` tải và đo được. Góp ý không chặn: `--operator` tiếng Việt lỗi Unicode trên console cp1252 | API review |
| 01:08 | **Bế Quốc Khánh** | **PR nháp #36 — bằng chứng C0:** fp32 + bf16 cho cả 10 biến thể, 20/20 phép đo; `RESULT.md` + biểu đồ sinh từ JSON (`summarize.py`); `C0-7`/`C0-8` NOT MEASURED chờ số giờ GPU/ngày; sửa lỗi Unicode | `36789c0` |
| 01:14 | **Bế Quốc Khánh** | **PR nháp #37 — khung pipeline C0 tổng hợp:** UNet base16 và DINOv2-S/14 frozen + progressive, mỗi mô hình một epoch, nạp lại checkpoint PASS; 0 byte dữ liệu thật | `06cff72` |

Chưa ai review #34–#37 lúc chốt. #36 và #37 xếp chồng trên #17 nên chưa có CI.

**Phát hiện đổi Day 7:** tách theo bệnh nhân **không kiểm được** bằng dữ liệu đang có — `GATE-SPLIT-01` cần một quyết
định của leader qua Decision Request, không chỉ một manifest.
