# DAY 05 — END OF DAY REVIEW

| Mục | Giá trị |
|---|---|
| **Ngày** | 2026-09-14 (Day 5 / 30) |
| **Ghi bởi** | Project Control (leader vận hành) |
| **Artifact bắt buộc bởi** | `15` §15 — 18 trường, đối chiếu ở §10 |
| **Trạng thái bản này** | ✅ **CHỐT sáng 15/09** (~05:45), sau khi kiểm GitHub lần cuối. Việc sau 23:59 nằm ở **§14** |
| **Màu trạng thái** | 🔴 **RED** — xem §12 |
| **Kết quả ngày** | ✅ **ĐẠT 3/3 — theo quyết định của leader**, xem §1 |

---

## 1 · Kết quả ngày

| # | Điều kiện | Ai | Kết quả khi chốt |
|---|---|---|---|
| 1 | **PR #25** được review, Khánh sửa nếu cần, **merge** | Vũ Hùng Anh → Bế Quốc Khánh | ✅ **ĐẠT — theo quyết định của leader.** Hùng Anh review **11:31** → `CHANGES_REQUESTED`, mọi kiểm tra nội dung đạt, chỉ yêu cầu xoá **một khoảng trắng** cuối dòng 3 `RESULT.md`. Khánh sửa lúc **00:44 ngày 15/09** (`fdaf920`), **45 phút sau 23:59**, nhờ review lại 01:01. **Chưa merge** khi chốt |
| 2 | **`DR-002` quyết**, ghi vào `OPEN_DECISIONS.md` | Phạm Tuấn Anh | ✅ **ĐẠT** — **Path A**, 21:41 (`b600085`) |
| 3 | Báo cáo tổng hợp lượt 4 + payload `uint8` 576/640 → PR | Nguyễn Gia Đức Trung | ✅ **ĐẠT** — **PR #26**, 08:51 (`339021f`) |

**Luật đã viết từ đầu ngày:** không đủ ba thì ngày trượt. **Theo chữ của luật, lúc 23:59 là 2/3** — điều kiện 1
chưa sửa, chưa merge. **Leader quyết tính Day 5 ĐẠT 3/3** (sáng 15/09). Project Control đã đề xuất ghi
"MỘT PHẦN 2/3"; quyết định cuối là của leader và được ghi đúng như vậy.

**Ngoại lệ được ghi rõ, vì nó khác Day 4:**

| | Day 4 | Day 5 |
|---|---|---|
| Gia hạn báo trước | có — tới 07:00 | **không** — hạn 23:59 là luật khối lượng leader đặt cùng ngày |
| Phần của thành viên xong khi nào | 03:10, **trong** khung gia hạn | 00:44, **sau** hạn 45 phút |
| Còn thiếu khi tính đạt | review | review lại + merge |
| Cùng một sản phẩm? | audit Spike D | **audit Spike D — lần ngoại lệ thứ hai liên tiếp** |

Buffer **giữ 0** — critical path không mất ngày: `DR-002` đã quyết, audit đã sửa, manifest split đã có PR nháp.

### Hạn cứng của Bế Quốc Khánh — **TRƯỢT**, leader **ghi nhận, không báo giảng viên**

Quyết định recovery 13/09: *"`DATASET_AUDIT.md` + `dataset_manifest.json` trên `main`, do Khánh commit, trước
23:59 ngày 14/09 — trễ thì leader báo giảng viên hướng dẫn."* Khi hạn đến: audit **chưa** trên `main`, bản sửa
cuối cùng đến **00:44**. Leader, sáng 15/09: *"tôi ghi nhận nhé"* — **ghi nhận, không leo thang.** Toàn bộ phần
Khánh phải tự làm xong lúc 01:01 (§14); phần còn lại là review lại của Hùng Anh và merge.

---

## 2 · `started_at` từng spike

| Spike | Chủ sở hữu | Status | `started_at` | `evidence_present` |
|---|---|---|---|---|
| `SPIKE_D` **P0** | Bế Quốc Khánh | `ACTIVE` | 2026-09-11T12:00+07 | **`false`** — audit ở PR #25, chờ review lại |
| `SPIKE_A` | Phạm Tuấn Anh | `ACTIVE` | 2026-09-11T12:00+07 | `false` *(`A2` đã đo, bằng chứng ở PR nháp #27)* |
| `SPIKE_B` | Vũ Hùng Anh | `ACTIVE` | 2026-09-11T12:00+07 | `false` |
| `SPIKE_E` | Nguyễn Gia Đức Trung | `ACTIVE` | 2026-09-11T12:00+07 | `false` *(nháp `RESULT.md` ở PR #26)* |
| `SPIKE_C0` | Bế Quốc Khánh | `PREPARED` | `null` | `false` *(`C0-1` đã khai báo)* |
| `SPIKE_C1` | Bế Quốc Khánh | **`BLOCKED`** `[SPIKE_D]` | `null` | `false` |
| `SPIKE_F` | Vũ Hùng Anh | `PREPARED` | `null` | `false` |

**`ACCEPTED = 0`.**

---

## 3 · Việc đã land trong ngày

| Giờ | Ai | Việc | Bằng chứng |
|---|---|---|---|
| 08:36 | **Nguyễn Gia Đức Trung** | Review lại PR #23 → `APPROVED` | API review |
| 08:48–08:51 | **Nguyễn Gia Đức Trung** | **PR #26** — tổng hợp lượt 4 (171/171), payload `uint8` 576/640 + stub phục vụ cả hai, kế hoạch đo 6 lượt, nháp `RESULT.md` Spike E | `339021f` |
| 11:31 | **Vũ Hùng Anh** | Review **#25** → `CHANGES_REQUESTED`: selftest, JSON Schema, audit khớp manifest, CI đều đạt; 1 khoảng trắng | API review |
| 11:34 | **Vũ Hùng Anh** | Review **#24** → `CHANGES_REQUESTED`: 3 điểm, cả 3 đúng (operator/owner sai, ví dụ vẫn cellular, dòng trống cuối file) | API review |
| 22:24 | **Nguyễn Gia Đức Trung** | Sửa đủ 3 điểm #24 **và thêm `--profile`** vào harness Toybox; `diff --check` sạch, `sh -n` đạt, CI 4/4 | `710090f` |
| 06:09 · 06:37 | Project Control | Chốt Day 4 + kế hoạch Day 5 · dựng lại bảng điều phối (13 mục, sinh từ state) | `e9dfad9` · `66a96b7` |
| 07:16 | Project Control *(leader duyệt)* | **Sửa PR #17 — 5/5 lỗi Khánh nêu**: DINOv2 thật, tìm batch chia đôi, driver/precision/throughput, `uint8` 576/640 + DR-011, ngân sách lịch còn lại | `542887e` |
| 07:20 | Phạm Tuấn Anh | **`DR-006a` revision 3** — leader bấm máy cho Spike B; reviewer Spike B → Trung | `04d8e97` |
| 11:29 | Phạm Tuấn Anh | Merge **#23** (merge commit) | `b4208d0` |
| ~11:50 | Phạm Tuấn Anh | Tắt sshd — `Running/Automatic` → `Stopped/Disabled`, cổng 22 đóng | `132e519` |
| 11:28 → 21:31 | Phạm Tuấn Anh *(chủ Spike A, tự bấm)* | **Spike A S4 zoom/pan** — code + kiểm offline 6/6 → **`A2` đo trên máy: `OBSERVED`**, checksum mask 16/16 qua 3 lần kiểm, 0 lần khựng | `1b362e8` · `fb006da` · `311eefe` · PR #27 |
| 21:41 | Phạm Tuấn Anh | **`DR-002` = Path A** | `b600085` |
| 21:46 | Project Control | Ghi ảnh hưởng của `DR-002` thẳng vào tài liệu từng người | `3b603eb` |

**Review của thành viên tiếp tục bắt lỗi thật:** Hùng Anh — khoảng trắng mà chính PR #25 nói đã kiểm, và
provenance sai trong ví dụ của Trung; Khánh (§14) — hai lỗi runtime của bản sửa #17 mà kiểm offline của
Project Control bỏ sót.

---

## 4 · Quyết định governance

| Quyết định | Nội dung | Ghi ở |
|---|---|---|
| **Khối lượng** *(sáng 14/09)* | Thành viên ~8 h/ngày, hạn 23:59, không khai báo giờ rảnh; leader không giới hạn | `PROJECT_STATE.capacity_policy` |
| **`DR-006a` rev 3** | Spike B đo như Spike E: leader bấm, Hùng Anh thiết kế + tính số; reviewer Spike B → Trung; Hùng Anh có quyền đổi lại | `OPEN_DECISIONS.md` |
| **`DR-002` = Path A** | 80/20 theo bệnh nhân, seed 2024, 54 case khoá cứng. Quyết **trước khi #25 merge** vì nội dung bằng chứng đã qua review | `OPEN_DECISIONS.md` |
| **Báo tin qua tài liệu** | Việc/quyết định của leader đụng tới ai thì ghi thẳng vào packet + bảng của người đó | bộ nhớ Project Control |
| **Kết quả Day 5** | ĐẠT 3/3 theo quyết định leader | §1 |
| **Hạn cứng Khánh** | Trượt — ghi nhận, không báo giảng viên | §1 |

---

## 5 · Kết quả âm (`NEGATIVE_RESULT`)

Không có.

---

## 6 · Blocker — sang Day 6

| # | Blocker | Chặn gì | Ai gỡ |
|---|---|---|---|
| 1 | **#25 chưa merge** — chờ review lại (thay đổi 1 dòng) | `GATE-DATA-01` · PR #28 (xếp chồng trên #25) · `evidence_present` Spike D | **Vũ Hùng Anh** → leader merge |
| 2 | **Không nối được case với bệnh nhân** — gói dữ liệu không có bảng ánh xạ; PR #28 dùng mỗi case làm một nhóm, ghi `NOT VERIFIABLE` | đóng `GATE-SPLIT-01` (*"patient-level split … provenance resolved"*) | **leader** — chấp nhận giới hạn có ghi rõ, hay đòi bằng chứng |
| 3 | **PR #17: 2 lỗi runtime** (Khánh review 00:52) — `--find-batch` bị bỏ khi batch dự định không vừa; `OSError` khi tải DINOv2 làm dừng cả probe | `C0-2`…`C0-8` | **leader** (Claude viết) |
| 4 | **Đo lại Spike E** — cần #24 review lại + #26 review, rồi stub mới phục vụ profile trên Mac mini | `E1`–`E9` trên payload thật, `E8` theo khung giờ | Vũ Hùng Anh (review) → leader (đo) |
| 5 | **Hàng review của Hùng Anh:** #25, #24, #26 — cộng 2 việc riêng chưa bắt đầu | mọi thứ ở 1 và 4 | leader — cân lại tải trong packet Day 6 |

---

## 7 · Review — hàng đợi khi chốt

| PR | Tác giả | Trạng thái | Chờ |
|---|---|---|---|
| **#25** | Bế Quốc Khánh | `CHANGES_REQUESTED` → **đã sửa 00:44**, nhờ review lại 01:01 | **Vũ Hùng Anh** |
| **#17** | Phạm Tuấn Anh | `CHANGES_REQUESTED` lần 2 (00:52) — 2 lỗi runtime + 1 chỗ chữ | **leader** sửa |
| **#24** | Nguyễn Gia Đức Trung | `CHANGES_REQUESTED` → **đã sửa 22:24** | Vũ Hùng Anh |
| **#26** | Nguyễn Gia Đức Trung | chưa review | Vũ Hùng Anh |
| #27 *(nháp)* | Phạm Tuấn Anh | `A2` đã đo — chưa nhờ review | Vũ Hùng Anh *(Day 6)* |
| #28 *(nháp)* | Bế Quốc Khánh | xếp chồng trên #25 | Nguyễn Gia Đức Trung *(sau khi #25 merge)* |

**Trong ngày:** 1 merge (#23) · **5 review có nội dung** (Trung #23 · Hùng Anh #25 #24 · Khánh #17 lúc 00:52) ·
0 review dưới tài khoản người khác.

---

## 8 · 📱 Galaxy A17 5G

| | |
|---|---|
| Spike A | **`A2` đo trên máy** 21:24–21:25 · bản **release** `1b362e8` · 60 Hz · đang sạc · pin 45→48 % · 33,0→34,5 °C · thermal 0 · người bấm: chủ Spike A |
| Spike E | **không đo** — chờ #24 + #26 và stub profile mới. Khung 15:00 và 21:00 đã qua → Day 6 |
| Spike B | chưa có app — không đo |
| Laptop leader | **sshd tắt**; chia sẻ adb tắt; firewall rule vẫn cài, vô hại |

---

## 9 · Kiểm invariant cuối ngày

| # | Invariant | Kết quả |
|---:|---|---|
| 1 | Spec đóng băng | ✅ **19/19** — guardrails xanh trên mọi push lên `main` trong ngày |
| 2 | 0 commit chạm `docs/specs/v1.0/` | ✅ |
| 3 | `ACCEPTED = 0` | ✅ |
| 4 | `evidence_present: true` | ✅ **0** |
| 5 | `SPIKE_C1` vẫn `BLOCKED [SPIKE_D]` | ✅ |
| 6 | `SPIKE_C0.started_at` vẫn `null` | ✅ |
| 7 | 0 dataset byte trong git | ✅ — kiểm "no dataset bytes" đạt cả trên PR #28 *(manifest chỉ chứa mã case)* |
| 8 | `DATASET_AUDIT.md` / `data/manifests/` **không** trên `main` | ✅ — chỉ ở PR #25 và PR #28 |
| 9 | `tests/fixtures/geometry/**` chỉ do chủ sở hữu viết | ✅ không ai chạm trong ngày |
| 10 | Không `TECH_STACK_ADR.md`, không `ADR-ML-001` | ✅ |
| 11 | Mọi commit: tác giả thật | ✅ Drake-Phamta · Trung · qkhanhbe |
| 12 | Không review dưới tài khoản người khác | ✅ |
| 13 | `RESULT.md` trên `main` | ✅ chỉ `SPIKE_A_2D/RESULT.md` *(Spike D ở #25, Spike E nháp ở #26)* |
| 14 | Split chưa chạy trên kết quả test nào | ✅ chưa có kết quả test — `DR-002` quyết trước mọi con số |

---

## 10 · `15` §15 — 18 trường bắt buộc

| Trường | Giá trị |
|---|---|
| Planned tasks | 3 điều kiện + packet 4 người |
| **Accepted** | **0** |
| Needs-fix | 3 — #25 (1 khoảng trắng, **đã sửa**) · #24 (3 điểm, **đã sửa**) · #17 (2 lỗi runtime, **còn mở**) |
| Blocked | 5 blocker, §6 |
| **Critical-path status** | **NHÍCH** — `DR-002` quyết · audit sửa xong · manifest split có PR nháp. Còn: #25 merge |
| Integration status | `main` xanh · `ci_configured: true` · `branch_protection: false` · 1 merge |
| Tests passed/failed | probe `--selftest` 8/8 *(Khánh chạy lại trên RTX 4050: 8/8)* · `viewerMath` 6/6 · parser `extract_a2` 3/3 · split `--selftest` 9/9 *(Khánh)* · harness Toybox `sh -n` đạt |
| Requirement completion | **0 / 39** `ACCEPTED` |
| **New/changed risks** | **mới:** không nối được case↔bệnh nhân (`GATE-SPLIT-01`) · máy Khánh **không có pagefile** → tải DINOv2 lỗi `WinError 1455` · hàng review dồn vào Hùng Anh. **Giảm:** RISK-SPLIT-01 (`DR-002` quyết) |
| **Technical debt introduced** | không. **Đã trả:** sshd · slot đo Spike B/E sai trong state · `next_action` Spike E cũ · đếm "4 lỗi" sai ở 6 chỗ |
| Actual vs baseline | **chậm 3 ngày** — Day 5 tính đạt, không cộng thêm |
| **Proposed corrective actions** | §11 |
| Next-day priorities | §13 |
| **MUST / SHOULD accepted** | **MUST 0/28 · SHOULD 0/6 · COULD 0/5** |
| **Critical-path blocker age** | **6 ngày** *(`SPIKE_D` từ 2026-09-09)* — giờ chỉ chờ một lần review lại |
| **Remaining buffer** | **0** — giữ nguyên |
| Open PR age | 6 PR mở (#17 #24 #25 #26 · nháp #27 #28) — mọi PR không nháp đều có người được giao |
| Canonical smoke | `NOT_RUN` |

---

## 11 · Recovery và hành động khắc phục

**Recovery 13/09 vẫn giữ: không de-scope.** Hạn cứng của Khánh trượt 45 phút — leader ghi nhận, không leo thang.

**Hành động khắc phục đề xuất:**

1. **Hùng Anh review lại #25 đầu Day 6** — thay đổi 1 dòng — rồi leader merge; Khánh đổi base #28 sang `main`.
2. **Leader quyết giới hạn nối case↔bệnh nhân** trước khi `GATE-SPLIT-01` được xét. Không có quyết định thì gate
   không đóng được dù manifest đã có.
3. **Sửa 2 lỗi runtime #17** (Claude viết, leader duyệt) → Khánh chạy lại đúng lệnh anh ấy đã dùng.
4. **Cân lại tải review của Hùng Anh** — 3 PR đang chờ, 2 việc riêng Day 5 chưa bắt đầu. Review split #28 giữ ở
   Trung như kế hoạch.
5. **Ghi để theo dõi, không quyết:** việc của Khánh tiếp tục dồn sau nửa đêm (Day 4 03:10, Day 5 00:44) trong khi
   luật khối lượng đặt hạn 23:59.

---

## 12 · Màu trạng thái — 🔴 RED

Giữ RED. Buffer 0, `ACCEPTED = 0`, và #25 chưa merge. Critical path nhích rõ — nên xét lại màu khi Spike D
`ACCEPTED` và `GATE-DATA-01` đóng.

---

## 13 · Ưu tiên Day 6 (15/09)

| # | Việc | Ai |
|---|---|---|
| 1 | **Review lại #25** → merge | Vũ Hùng Anh → Phạm Tuấn Anh |
| 2 | **Quyết giới hạn nối case↔bệnh nhân** cho `GATE-SPLIT-01` | Phạm Tuấn Anh |
| 3 | Sửa 2 lỗi runtime **#17** | Phạm Tuấn Anh *(Claude)* |
| 4 | Review lại #24 · review #26 → stub profile → **đo lại Spike E** theo khung giờ | Vũ Hùng Anh → Phạm Tuấn Anh |
| 5 | `B1` app 3D + `B14` — mang sang từ Day 5 | Vũ Hùng Anh |
| 6 | #28 lên `main` sau #25 · chạy lại C0 khi #17 sửa xong | Bế Quốc Khánh |
| 7 | Review split #28 | Nguyễn Gia Đức Trung |

Packet đầy đủ: `management/day06/tasks/`.

---

## 14 · Sau 23:59 — việc land tới lúc chốt

| Giờ (15/09) | Ai | Việc | Bằng chứng |
|---|---|---|---|
| 00:44 | **Bế Quốc Khánh** | Xoá khoảng trắng #25; `git diff --check origin/main...HEAD` sạch | `fdaf920` |
| 00:52 | **Bế Quốc Khánh** | **Review lại #17 trên RTX 4050** → `CHANGES_REQUESTED`: 5 lỗi cũ đã xử lý, selftest 8/8; **2 lỗi runtime mới, tái hiện được** + chữ "DR-002 decides" trong `extrapolate.py` | API review |
| 00:58–00:59 | **Bế Quốc Khánh** | **PR #28 (nháp) — manifest split Path A**: 80/20/54, seed 2024, tập con lồng 20 ⊂ 40 ⊂ 80, từ chối nguồn chưa sẵn, selftest 9/9, tự review tìm và sửa một lỗ hổng | `9cde2cd` · `772c786` |
| 01:00 | **Bế Quốc Khánh** | **Khai báo `C0-1`** (nợ từ Day 4): RTX 4050 Laptop 6141 MiB · driver 595.79 · RAM 15,25 GiB · Ryzen 7 7735HS · PyTorch 2.11 + CUDA 12.8 · **không có pagefile** | comment PR #17 |
| 01:01 | **Bế Quốc Khánh** | Nhờ Hùng Anh review lại #25 | comment PR #25 |

**Phát hiện đổi Day 6:** gói dữ liệu **không có** ánh xạ case→bệnh nhân (PR #28) — `GATE-SPLIT-01` cần một quyết
định của leader, không chỉ một manifest.
