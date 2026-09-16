# DAY 07 — END OF DAY REVIEW

| Mục | Giá trị |
|---|---|
| **Ngày** | 2026-09-16 (Day 7 / 30) |
| **Ghi bởi** | Project Control (leader vận hành) |
| **Artifact bắt buộc bởi** | `15` §15 — 18 trường, đối chiếu ở §10 |
| **Trạng thái bản này** | ✅ **CHỐT 17/09 ~01:30**, sau khi soát từng mục packet bằng `git` và GitHub API |
| **Màu trạng thái** | 🔴 **RED** — xem §12 |
| **Kết quả ngày** | ✅ **ĐẠT 4/4 — theo quyết định của leader** · **2/4 theo chữ của hạn giờ**, xem §1 · buffer giữ **−1** |

---

## 1 · Kết quả ngày

| # | Điều kiện | Ai | Bằng chứng | Giờ thực tế |
|---|---|---|---|---|
| 1 | **#34 chuyển ready trước 12:00** — HITL `A11`/`A14`/`F5`, bảng `A19` theo `Q2`, trả lời từng phát hiện QA-002 | Bế Quốc Khánh | PR hết draft, nhờ Hùng Anh review; **7/7 phát hiện (`F1`–`F5`, `F12`, `F13`) có câu trả lời riêng kèm file:dòng và lệnh kiểm lại**; `A19` ghi *"DEFERRED / NOT PASSED … training remains BLOCKED"*; `F5` đã thực hiện (`aaccae6`, manifest công khai rút 473 dòng) | ✅ nội dung đủ — **00:10 ngày 17/09**, trễ hạn 12:00 và quá 23:59 **11 phút** |
| 2 | **Review #35** + **stub 2 profile đã kiểm trước 20:30** | Nguyễn Gia Đức Trung | `CHANGES_REQUESTED` có nội dung trên #35, tự chạy `split.py --selftest` 11/11, `linkage_screen.py --selftest` 5/5, schema 0 lỗi, bám đúng ba ràng buộc `DR-002b` · comment xác nhận stub: `/health` liệt kê hai profile, `Content-Length` 29 196 288 / 36 044 800 đúng từng profile | ✅ nội dung đủ — review **22:48**, xác nhận stub **23:02** (trễ hạn 20:30 hai tiếng rưỡi) |
| 3 | **Duyệt lại #24 và #26** | Vũ Hùng Anh | #24 `APPROVED` 22:02 *(kèm tự đính chính công khai: lần trước cậu ấy tra nhầm đường dẫn repo)* → merge `ff6431e` · #26 review có nội dung 15:45, **tự tái lập `SPIKE_E_RUN4_AGGREGATE.json` từ 171 mẫu thô** | ✅ **trong ngày** |
| 4 | **`B1` đủ theo TASK** — pan desktop + touch ở #30, bỏ đoạn lặp ở #29 | Vũ Hùng Anh | `d223cc4` (15:48) · `0d079e8` + `712fbe9` (17:10–17:13), PR hết nháp, nhờ Trung duyệt lại | ✅ **trong ngày** |

### Hai cách đọc, và quyết định

**Luật viết từ đầu ngày:** *"Không đủ bốn thì ngày này tính là trượt."* Bốn điều kiện đều nói về **nội dung**, và
cả bốn đều có bằng chứng. Nhưng ba phần land **sau hạn giờ của chúng**:

| Cách đọc | Kết quả |
|---|---|
| Theo **chữ của hạn giờ** (12:00 · 20:30 · 23:59) | **2/4** — chỉ hai điều kiện của Vũ Hùng Anh nằm trong hạn |
| Theo **nội dung** (điều kiện có được làm xong không) | **4/4** |

**Leader quyết ngày 17/09: `ĐẠT` 4/4**, và yêu cầu ghi cả hai cách đọc để người đọc sau không hiểu nhầm là đạt
đúng hạn. Đây là ngoại lệ **thứ hai** cùng loại sau Day 5 — lần đó cũng là nội dung đủ, hạn thì trượt.

**Điều phải ghi thẳng, vì bản ghi ngày sinh ra để theo dõi đúng thứ này:**

| Ngày | Phần việc của Bế Quốc Khánh land lúc |
|---|---|
| Day 4 | 03:10 |
| Day 5 | 00:44 |
| Day 6 | 00:19 |
| **Day 7** | **00:08 – 00:36** |

**Bốn ngày liên tiếp.** Hành động Level 1 ngày 16/09 đặt mốc đẩy giữa ngày **12:00 và 18:00** cho Khánh —
**mốc đó chưa có tác dụng nào**. Xem §11.

Buffer **giữ −1**: ngày đạt không tiêu thêm buffer, và không có ngày critical-path nào bị mất thêm.

---

## 2 · `started_at` từng spike

| Spike | Chủ sở hữu | Status | `started_at` | `evidence_present` |
|---|---|---|---|---|
| `SPIKE_D` **P0** | Bế Quốc Khánh | **`NEEDS_FIX`** | 2026-09-11T12:00+07 | **`true`** — bản sửa QA-002 ở PR #34, **chờ duyệt lại** |
| `SPIKE_A` | Phạm Tuấn Anh | `ACTIVE` | 2026-09-11T12:00+07 | **`true`** — `A9` và `A2` trên `main` (#27 merge `6ca1e21`); `A3`–`A7` ở PR #31 |
| `SPIKE_B` | Vũ Hùng Anh | `ACTIVE` | 2026-09-11T12:00+07 | `false` — **chưa có `RESULT.md`**; `B1` ở #30, `B14` ở #29, POC MPR ở #38 |
| `SPIKE_E` | Nguyễn Gia Đức Trung | `ACTIVE` | 2026-09-11T12:00+07 | `false` — đã đo và đã tổng hợp, nhưng `RESULT.md` còn ở PR #26 |
| `SPIKE_C0` | Bế Quốc Khánh | **`EVIDENCE_READY`** | **2026-09-16T00:43:25+07** | **`true`** — PR #36 merge `e6e3b0b`; `C0-1`…`C0-10` có số |
| `SPIKE_C1` | Bế Quốc Khánh | **`BLOCKED`** `[SPIKE_D]` | `null` | `false` — cả 10 tiêu chí chưa đo |
| `SPIKE_F` | Vũ Hùng Anh | `PREPARED` | `null` | `false` — cả 12 tiêu chí chưa đo |

**`ACCEPTED = 0`.** Ba spike có `evidence_present: true` nhưng chưa spike nào qua đủ bốn bước nghiệm thu.

---

## 3 · Việc đã land trong ngày

| Giờ | Ai | Việc | Bằng chứng |
|---|---|---|---|
| 02:19 | Phạm Tuấn Anh | **Merge #17** (squash) — **giữ nhánh**, nhờ đó #36 và #37 không bị đóng tự động như #28 | `8bf1a2f` |
| 02:19–02:21 | **Bế Quốc Khánh** | Rebase #36/#37 lên `main` → **CI 4/4 lần đầu**; ngoại suy lịch **4 h và 5 h GPU/ngày** → `C0-7`/`C0-8` có số; #36 chuyển ready | `cb5585b` · `d93688d` |
| 11:02–11:25 | Phạm Tuấn Anh | **Sáu quyết định**: `Q2` hoãn có ghi · stub phương án A · `DEMO_STANDARD` **v1** + đính chính đếm **44/33/70** · recovery buffer −1 (giữ kế hoạch + 5 hành động Level 1) · **`DR-002b` = (c)+(d)** · **`F5` = thu hẹp** | `1ef7ef6` · `3454a11` · `a16ee78` |
| 11:06 | Phạm Tuấn Anh *(PC chạy bằng SSH của leader)* | **Stub 2 profile chạy** trên `10.64.193.115:8787`, worktree riêng `a585907`, payload ngoài repo; `/health` + `HEAD` hai profile đạt | comment #26 |
| ~11:20 | Project Control | **Đính chính số đếm spec** + tool đếm lại bằng một lệnh | `ERRATUM_COUNTS_2026_09_16.md` · `tools/spec_counts/count_spec_ids.py` |
| 15:45 | **Vũ Hùng Anh** | Duyệt lại #24 và #26 — **tự tái lập JSON tổng hợp từ 171 mẫu thô**; nêu lỗi thứ tự merge của #26 | review #24 · #26 |
| 15:48 · 17:10–17:13 | **Vũ Hùng Anh** | #29 bỏ đoạn lặp · **#30 thêm pan** desktop + touch, ảnh chụp mới, PR hết nháp | `d223cc4` · `0d079e8` · `712fbe9` |
| 17:14 · 17:17 | **Vũ Hùng Anh** | **APPROVE #27** (tự chạy `extract_a2.py`, tái lập `A2` `OBSERVED`) · **APPROVE #36** (sinh lại `RESULT.md` và biểu đồ **byte-identical**, ghi rõ không chạy được selftest GPU) | review #27 · #36 |
| 21:41 · 22:01 | **Vũ Hùng Anh** | #30 đổi cách render sang kiểu phân vùng lâm sàng · **PR #38 — linked MPR + POC 3D** (crosshair 3 mặt cắt, overlay, gửi mặt phẳng axial sang viewer `B1`) | `c5ecb4d` · `99e03ce` |
| 21:46 · 21:47 · 22:37 | Phạm Tuấn Anh | **Merge #27** (merge commit, giữ nhánh → #31 sống, đổi base sang `main` và chuyển ready) · **Merge #36** → Spike C0 `EVIDENCE_READY` · **Merge #24** → harness Toybox lên `main`, #33 đổi base | `6ca1e21` · `e6e3b0b` · `ff6431e` |
| 21:50–22:26 | Phạm Tuấn Anh *(operator; PC chạy harness)* | **Đo Spike E hai profile** — `wifi-overlay` + `DIRECT`, 3 lượt mỗi profile: **171/171 mẫu `ok`**, 0 body bị cắt, 0 local-connect rejection, volume nhận đủ byte; dữ liệu thô + log server + `PROVENANCE.md` | `c3c2ab5` |
| 22:00–22:03 | Phạm Tuấn Anh *(PC soát)* | **Soát kỹ thuật #32** rồi ra phán quyết `CHANGES_REQUESTED`: 10/10 ca kiểm đạt, **9/10 phép phá bị chặn đúng**, 1 lỗi thật (manifest tự mâu thuẫn vẫn PASS) | review #32 |
| 22:03 | **Vũ Hùng Anh** | Review #31 — yêu cầu sửa một điểm tài liệu (tiêu đề còn ghi *"device run pending"* trong khi bằng chứng đã có) | review #31 |
| 22:48 | **Nguyễn Gia Đức Trung** | **Review #35** — chạy selftest 11/11 và 5/5, bám đúng ba ràng buộc `DR-002b` | review #35 |
| 22:55 | **Nguyễn Gia Đức Trung** | **PR #39 — hợp đồng ingestion 2 (artifact thí nghiệm) v0**: schema, validator, 220 dòng test; ép `GATE-SPLIT-01` + `GATE-ML-01`, holdout 54 case, checksum + provenance | `541c54c` |
| 22:57 | **Nguyễn Gia Đức Trung** | **`E9` — quy trình chạy trên máy thật cho leader** (+86 dòng vào #33) | `fdf6d48` |
| 23:00–23:02 | **Nguyễn Gia Đức Trung** | **Tổng hợp dữ liệu đo riêng từng profile** (`E2`–`E6`, `E12`) · xác nhận stub · đối chiếu hợp đồng 1 với manifest thật trên #32 | `eaa878f` · comment #26 · #32 |
| 21:33 | Phạm Tuấn Anh *(PC chạy)* | ⚠ **Mac mini rơi khỏi overlay** (13:34–21:33) — stub vẫn sống nhưng `LISTEN` trên địa chỉ đã biến mất → join lại, chạy lại stub, kiểm lại hai profile | `RISK-DEMO-NET-01` · `DEMO_STANDARD.md` §8 |

**Review của thành viên tiếp tục bắt lỗi thật, và một lần bắt nhầm được sửa công khai:** Hùng Anh yêu cầu #26 sửa
thứ tự merge (đúng), rồi **tự đính chính** rằng lần review trước cậu ấy tra nhầm đường dẫn nên đã bắt oan #24 —
ghi lại thay vì lặng lẽ đổi verdict. Trung bám đúng ba ràng buộc `DR-002b` khi review #35 thay vì duyệt cho xong.

---

## 4 · Quyết định governance

| Quyết định | Nội dung | Ghi ở |
|---|---|---|
| **`Q2`** | Mục "split và ID manifest" của `A19` **hoãn sang `GATE-SPLIT-01` có ghi**, kèm câu training vẫn `BLOCKED` | QA-002 §9 |
| **Stub Spike E** | **Phương án A**: Project Control dựng bằng SSH của leader theo lệnh chủ spike; Trung giữ thiết kế, phép kiểm và mọi con số `E` | `days.yaml` policies · packet Trung |
| **`DEMO_STANDARD` v1** | Duyệt làm chuẩn lập kế hoạch từ Day 7; **đính chính số đếm 39/28/69 → 44/33/70**; bảng hiệu năng trên màn hình vẫn cần Decision Request | `DEMO_STANDARD.md` §11 · `ERRATUM_COUNTS_2026_09_16.md` |
| **Recovery khi buffer −1** | **Giữ kế hoạch, không de-scope**, cộng **5 hành động Level 1**; không dùng Level 2/3 | `PROJECT_STATE.recovery.decision_2026_09_16` |
| **`DR-002b`** | Tách theo bệnh nhân **không kiểm chứng được** → phương án **(c) + (d)**: gom nhóm theo ngưỡng khai trước mọi lượt train · loại khỏi train case nghi trùng với holdout · ghi giới hạn ở mọi chỗ có số đánh giá · công bố phân tích độ nhạy. `06` §6 ghi là **ngoại lệ có văn bản** | `OPEN_DECISIONS.md` Part 2b |
| **`F5`** | **Thu hẹp**: public giữ mã case, shape/dtype, thống kê tổng hợp, verdict; bảng SHA-256 từng file và điểm sàng lọc sang **manifest hạn chế ngoài repo**, hash + lệnh sinh lại vẫn công khai | QA-002 §9 |
| **Kết quả Day 7** | **`ĐẠT` 4/4 theo nội dung**, 2/4 theo chữ — ngoại lệ có văn bản | §1 |

---

## 5 · Kết quả âm (`NEGATIVE_RESULT`)

Không có `NEGATIVE_RESULT` chính thức. Nhưng ngày này sinh ra **kết quả đo đầu tiên không đạt ngưỡng spec** —
`NFR-PERF-001` — và nó được ghi đúng như nó là, xem §10 và §11. Đây là thứ Spike E sinh ra để tìm; tìm được ở
Day 7 tốt hơn nhiều so với tìm được ở tuần demo.

---

## 6 · Blocker — sang Day 8

| # | Blocker | Chặn gì | Ai gỡ |
|---|---|---|---|
| 1 | **#34 chưa ai duyệt** — ready từ 00:10, **0 review** | `GATE-DATA-01` · `SPIKE_C1` · cả mốc **M4** | **Vũ Hùng Anh** → leader merge → QA soi lại |
| 2 | **#26 chưa duyệt lại** — điểm chặn thứ tự merge đã gỡ lúc 22:37 khi #24 merge | `RESULT.md` Spike E lên `main` · `evidence_present` Spike E | **Vũ Hùng Anh** |
| 3 | **#35 chờ vòng hai** — Khánh đã thực hiện `DR-002b` lúc 00:21 | `GATE-SPLIT-01` · `SPIKE_C1` | **Trung** duyệt lại → **Khánh** sinh lại sau khi #34 merge |
| 4 | **`DR-002b` đụng `F5`** — Trung đòi danh sách case bị loại **kèm điểm**; Khánh in `RESTRICTED_BY_F5` theo quyết định thu hẹp cùng ngày | #35 không đóng được vòng review | **leader** — một câu phán |
| 5 | **`A17` `FAIL` vì hai file mới phát hiện** — `Unet.py` và `preprocess_data.py` ở gốc gói chính thức, do #40 tìm ra | Spike D không `PASS` trọn `A1`–`A20` | **Khánh** tuyên bố loại trừ + luật trong validator |
| 6 | **#32 chưa sửa** — manifest tự mâu thuẫn vẫn `PASS` | hợp đồng ingestion 1 (mốc **M3**) | **Trung** |
| 7 | **Picking `B3`/`B4` chưa có phép đo nào** — viewer hiện **không có code picking** | `B5`/`B6` · `PR-3D-04` | **Vũ Hùng Anh** |
| 8 | **`geometry_contract_version` không tồn tại trong repo** dù `11` §2/§4, `05` và `TC-REL-003` đều tham chiếu | lối ra **M3** (Day 6–9) | **Vũ Hùng Anh** |
| 9 | **Hợp đồng API (`11`) chưa ai bắt đầu** | lối ra **M3** | **Trung** (leader giao 17/09) |
| 10 | **#39 và #33 chưa ai được nhờ review** | M3 hợp đồng 2 · `E9` | **Trung** nhờ review |

---

## 7 · Review — hàng đợi khi chốt

| PR | Tác giả | Trạng thái | Chờ |
|---|---|---|---|
| **#34** | Bế Quốc Khánh | ready 00:10, **0 review**, CI 4/4 | **Vũ Hùng Anh** — P0 |
| **#26** | Nguyễn Gia Đức Trung | `CHANGES_REQUESTED`; head `eaa878f` có phần tổng hợp | **Vũ Hùng Anh** |
| **#35** *(nháp)* | Bế Quốc Khánh | `CHANGES_REQUESTED` → đã thực hiện `DR-002b` | **Trung** |
| **#29 · #30 · #38** | Vũ Hùng Anh | đã sửa / mới mở | **Trung** |
| **#31** | Phạm Tuấn Anh | `CHANGES_REQUESTED` → tiêu đề đã sửa, nhờ review lại | Vũ Hùng Anh |
| **#32** | Nguyễn Gia Đức Trung | `CHANGES_REQUESTED` (leader) | **Trung** |
| **#33 · #39** | Nguyễn Gia Đức Trung | CI 4/4, **chưa nhờ ai review** | Trung nhờ review |
| **#37 · #40** *(nháp)* | Bế Quốc Khánh | #40 base còn là `codex/day6-khanh` | **Khánh** |

**Trong ngày:** **4 merge** (#17, #27, #36, #24) · **9 review có nội dung** (Hùng Anh 6, Trung 2, leader 1) ·
0 review dưới tài khoản người khác. **12 PR mở khi chốt, CI 4/4 xanh cả 12.**

---

## 8 · 📱 Galaxy A17 5G

| | |
|---|---|
| Spike E | **Đo thật 21:50–22:26** — hai profile × 3 lượt, `wifi-overlay`, `E12` `DIRECT` (xác nhận từ peer list Mac mini), pin 58 → 78 %, AP 38,2 → 45,2 °C, thermal 0 |
| Spike A | không đo — `A8`, `A10`, `A11` và `A9` cache ±3 vẫn chờ |
| Spike B | chưa có app trên máy; `B10`/`B11` chờ slot 3 |
| Mac mini | ⚠ **rơi khỏi mạng ZeroTier 13:34–21:33**, stub `LISTEN` trên địa chỉ chết; join lại và chạy lại lúc 21:33 (PID 28976) |

---

## 9 · Kiểm invariant cuối ngày

| # | Invariant | Kết quả |
|---:|---|---|
| 1 | Spec đóng băng | ✅ **19/19** — guardrails xanh trên mọi push |
| 2 | 0 commit chạm `docs/specs/v1.0/` | ✅ |
| 3 | `ACCEPTED = 0` | ✅ — dù ba spike đã có `evidence_present` |
| 4 | `evidence_present: true` | **3** — `SPIKE_D` (`a92892c`), `SPIKE_A` (`6ca1e21`), `SPIKE_C0` (`e6e3b0b`). Đúng luật: `RESULT.md` trên `main` |
| 5 | `SPIKE_C1` vẫn `BLOCKED [SPIKE_D]` | ✅ |
| 6 | `SPIKE_C0.started_at` | ✅ **đã khai** `2026-09-16T00:43:25+07:00`, lấy từ file bằng chứng của chủ spike; cậu ấy xác nhận bằng comment trên #36 |
| 7 | 0 dataset byte trong git | ✅ — guardrail "no dataset bytes" xanh trên cả 12 PR |
| 8 | Manifest công khai trên `main` | ⚠ **vẫn còn đường dẫn tuyệt đối** cho tới khi #34 merge; bản hẹp đã sẵn trong #34 |
| 9 | `tests/fixtures/geometry/**` chỉ do chủ sở hữu viết | ✅ 0 commit chạm trong ngày |
| 10 | Không `TECH_STACK_ADR.md`, không `ADR-ML-001` | ✅ — `GATE-MOB-01` và `GATE-ML-01` còn mở |
| 11 | Mọi commit: tác giả thật | ✅ Drake-Phamta · qkhanhbe · Trung · scallion |
| 12 | Không review dưới tài khoản người khác | ✅ |
| 13 | `RESULT.md` trên `main` | ✅ `SPIKE_A_2D` · `SPIKE_D_DATASET` · **`SPIKE_C_ML` (mới)**; Spike B **chưa có**, Spike E còn ở #26 |
| 14 | Split chưa chạy trên kết quả test nào | ✅ — ngưỡng `DR-002b` khai **trước** mọi lượt train, kiểm được bằng lịch sử commit |
| 15 | Không từ khoá đóng PR trong commit trên `main` | ✅ |
| 16 | PR xếp chồng không bị đóng khi merge base | ✅ — #17 và #27 merge **giữ nhánh**, #36/#37 và #31 sống; #33 đã đổi base sau khi #24 merge. ⚠ **#40 vẫn đang xếp chồng trên #34** |

---

## 10 · `15` §15 — 18 trường bắt buộc

| Trường | Giá trị |
|---|---|
| Planned tasks | 4 điều kiện + packet 4 người |
| **Accepted** | **0** |
| Needs-fix | #26 · #29 · #30 · #31 · #32 · #35 — sáu PR đang ở `CHANGES_REQUESTED` |
| Blocked | 10 blocker, §6 |
| **Critical-path status** | **NHÍCH NHƯNG CHƯA QUA** — bản sửa Spike D đã đủ nội dung và đã ready, nhưng **chưa ai duyệt**; `GATE-DATA-01` vẫn mở sang ngày thứ tám |
| Integration status | `main` xanh · **4 merge** trong ngày · `ci_configured: true` · `branch_protection: false` · 12 PR mở |
| Tests passed/failed | Không có test sản phẩm. Dụng cụ: `split.py --selftest` 11/11 và `linkage_screen.py` 5/5 *(Trung chạy lại)* · `test_contract1.py` 10/10 + **9/10 phép phá bị chặn** *(PC soi đối kháng)* · `hardening_regression.py` **8/8** *(#40)* · validator trên cohort chính thức 16 PASS / 0 FAIL / `A19` NOT_RUN · `extract_a2.py` tái lập `A2` `OBSERVED` *(Hùng Anh)* · `summarize.py` sinh lại `RESULT.md` C0 **byte-identical** *(Hùng Anh)* · đo Spike E **171/171 × 2 profile** |
| Requirement completion | **0 / 44** `ACCEPTED` |
| **New/changed risks** | **mới, lớn nhất trong ngày: `NFR-PERF-001` trượt trần trên đường truyền thật.** Số của chủ spike: `E4` p95 **2 864 ms** (profile 576) và **1 844 ms** (640) so với trần **200 ms**; tải trọn volume p50 **338,9 s** và **121,4 s**. Đây là đường `wifi-overlay` `DIRECT`, payload tổng hợp đúng hình dạng thật · **mới:** máy chủ tự rơi khỏi overlay mà tiến trình vẫn sống (`RISK-DEMO-NET-01`) · **mới:** gói chính thức có hai file lạ ở thư mục gốc (`A17`) · **giảm:** RISK-COMPUTE — `C0-1`…`C0-10` đã có số trên `main` |
| **Technical debt introduced** | #40 xếp chồng trên #34 (bẫy đã đóng #28) · #38 xếp chồng trên #30 chưa merge · manifest trên `main` còn đường dẫn tuyệt đối · `PROJECT_STATE.sizing_rule` và hai câu trong `SPIKE_PHASE_STATE` còn lệch thực tế *(sửa khi chốt ngày này)*. **Đã trả:** 8 lỗi validator QA-002 có 8 test hồi quy (#40) · `F5` đã thực hiện · stub không còn phụ thuộc quyền truy cập |
| Actual vs baseline | **M3 (Day 6–9) còn hôm nay và mai** mà `contracts/` chưa có gì trên `main`, hợp đồng API chưa bắt đầu · **M4 (Day 8–12) bắt đầu hôm nay** với `SPIKE_C1` còn `BLOCKED` |
| **Proposed corrective actions** | §11 |
| Next-day priorities | §13 |
| **MUST / SHOULD accepted** | **MUST 0/33 · SHOULD 0/6 · COULD 0/5** |
| **Critical-path blocker age** | **8 ngày** *(`SPIKE_D` từ 2026-09-09)* — bản sửa đã sẵn sàng, chỉ thiếu một lượt review |
| **Remaining buffer** | **−1** — không đổi |
| Open PR age | 12 PR mở; lâu nhất #26 (mở 14/09) · #29/#30 (15/09) · #31 (15/09). **Hai PR (#33, #39) chưa từng được giao cho ai** |
| Canonical smoke | `NOT_RUN` |

---

## 11 · Recovery và hành động khắc phục

**Trigger `15` §18 khi chốt Day 7:** trigger 2 vẫn nổ (buffer −1, không đổi). Trigger 3 **theo dõi**: câu hỏi nối
bệnh nhân đã có quyết định (`DR-002b`) nên không còn là blocker không lối ra; thay vào đó **`GATE-DATA-01` bước
sang ngày thứ tám** — nếu hết Day 8 mà #34 vẫn chưa được duyệt thì trigger 3 nổ thật.

**Đánh giá 5 hành động Level 1 duyệt ngày 16/09 — sau một ngày:**

| # | Hành động | Kết quả sau một ngày |
|---|---|---|
| 1 | Gỡ phụ thuộc quyền cho stub Spike E | ✅ **có tác dụng rõ** — stub dựng trong ngày, và buổi đo tối cho **171/171 mẫu `ok` × 2 profile** |
| 2 | Thứ tự review của Hùng Anh | ✅ cậu ấy làm 6 review + 3 sản phẩm; nhưng **#34 đến 00:10 mới ready nên không thể duyệt trong ngày** |
| 3 | Mốc đẩy 12:00 / 18:00 cho Khánh | ❌ **chưa có tác dụng** — phần việc vẫn land 00:08–00:36, ngày thứ tư liên tiếp |
| 4 | Decision Request split quyết trong ngày | ✅ `DR-002b` quyết 11:15–11:22, Khánh thực hiện ngay trong đêm |
| 5 | Packet ghi rõ việc cần quyền gì | ✅ áp dụng từ packet Day 7; không có việc nào trượt vì thiếu quyền nữa |

**Đề xuất cho Day 8 — vẫn Level 1, không chuyển quyền sở hữu:**

1. **Đảo thứ tự phụ thuộc thay vì siết hạn giờ.** Hành động 3 thất bại vì nó cố đổi giờ làm việc của một người.
   Thay bằng: **việc chặn người khác phải đi trước việc của chính mình** trong packet — #34 của Khánh xong thì
   Hùng Anh mới có việc; nên phần "trả lời review" của Khánh xếp trên mọi việc khác của cậu ấy trong Day 8.
2. **#34 là việc số một của Hùng Anh, đặt mốc 12:00** — không phải "trong ngày".
3. **Gỡ bẫy xếp chồng ngay**: #40 đổi base sang `main` trước khi #34 merge.
4. **M3 phải đi một bước thật trong Day 8** (hợp đồng API v0 + `geometry_contract_version`), vì cửa sổ chỉ còn
   hôm nay và mai; nếu hết Day 9 vẫn chưa xong thì M3 trượt và M5 bắt đầu trên nền hợp đồng chưa chốt.
5. **`NFR-PERF-001`**: Project Control soạn Decision Request trong Day 8, leader quyết trong ngày. Spec đóng
   băng — Decision Request là đường duy nhất, và để càng lâu thì chiến lược tải của cả V1 lẫn Spike E càng trôi.

---

## 12 · Màu trạng thái — 🔴 RED

Giữ RED. Buffer −1, `ACCEPTED = 0`, `GATE-DATA-01` sang ngày thứ tám, và ngày này thêm một kết quả đo **không
đạt ngưỡng spec**. Xét lại màu khi Spike D `ACCEPTED` và `GATE-DATA-01` đóng.

---

## 13 · Ưu tiên Day 8 (17/09)

| # | Việc | Ai |
|---|---|---|
| 1 | **Duyệt lại #34 trước 12:00** → merge → **QA soi lại** → `ACCEPTED` → `GATE-DATA-01` đóng | Vũ Hùng Anh → Phạm Tuấn Anh |
| 2 | **Duyệt lại #35** + **sửa #32** | Nguyễn Gia Đức Trung |
| 3 | **#40 hết nháp, base `main`** + **tuyên bố loại trừ `Unet.py`/`preprocess_data.py`** + trả lời review #34 | Bế Quốc Khánh |
| 4 | **M3 đi một bước thật**: bản thảo **hợp đồng API v0** · **`geometry_contract_version`** | Trung · Vũ Hùng Anh |
| 5 | **Phán `DR-002b` × `F5`** (điểm tương quan của case bị loại) | Phạm Tuấn Anh |
| 6 | **Decision Request cho `NFR-PERF-001`** | Project Control → Phạm Tuấn Anh |
| 7 | **Picking `B3`/`B4`** trên fixture chính thức | Vũ Hùng Anh |
| 8 | **Chuẩn bị `SPIKE_C1`** — chỉ thiết kế, không chạm dữ liệu thật | Bế Quốc Khánh |

Packet đầy đủ: `management/day08/tasks/`.

---

## 14 · Sau 23:59 — việc land tới lúc chốt

| Giờ (17/09) | Ai | Việc | Bằng chứng |
|---|---|---|---|
| 00:08 | **Bế Quốc Khánh** | **Thực hiện `F5`** — manifest công khai rút 473 dòng, bảng SHA-256 từng file chuyển sang manifest hạn chế ngoài repo, public giữ hash + lệnh sinh lại; validator từ chối ghi bản hạn chế vào repo | `aaccae6` |
| 00:10 | **Bế Quốc Khánh** | **#34 hết draft + nhờ Hùng Anh review**; comment trả lời **7/7 phát hiện** kèm file:dòng và lệnh kiểm lại; `A19` = `DEFERRED / NOT PASSED` | PR #34 |
| 00:10 | **Bế Quốc Khánh** | Khai `started_at` thật của Spike C0 (`2026-09-16T00:43:25+07:00`) | comment #36 |
| 00:21 | **Bế Quốc Khánh** | **Thực hiện `DR-002b`**: ngưỡng `r ≥ 0.75` khai trong manifest **trước mọi lượt train**, 4 nhóm, loại `CASE_0133` (kéo theo `CASE_0117`) khỏi train → **train hiệu dụng 78**, tập con 20/38/78, câu giới hạn dùng chung, chỗ cho phân tích độ nhạy | `dc26b35` |
| 00:35 | **Bế Quốc Khánh** | **PR #40 — vá 8 lỗi validator** `F6`–`F11`, `F14`, `F15`, mỗi lỗi một ca kiểm hồi quy (`hardening_regression.py`, **8/8 PASS**); chạy lại trên gói chính thức: `A1` khớp SHA-256 2,2 GB, `A9` 154/154, `A10` 154/154, `A14` 308/308 | `ed9c6c0` |
| 00:35 | **Bế Quốc Khánh** | **Phát hiện mới:** gói chính thức có `Unet.py` và `preprocess_data.py` ở thư mục gốc — `A17` để **`FAIL`** chờ chủ spike tuyên bố loại trừ, thay vì lặng lẽ bỏ qua | `VALIDATOR_HARDENING.md` |

**Ghi nhận:** phần việc đêm của Khánh có chất lượng cao và **tự phơi ra một phát hiện bất lợi cho chính mình**
(hai file lạ làm `A17` FAIL) thay vì giấu. Vấn đề còn lại thuần tuý là **thời điểm**, không phải nội dung.

**Phát hiện đổi Day 8:** M3 chỉ còn hai ngày và hai trong bốn lối ra của nó chưa ai bắt đầu — hợp đồng API và
`geometry_contract_version`.
