# DAY 09 — END OF DAY REVIEW

| Mục | Giá trị |
|---|---|
| **Ngày** | 2026-09-18 (Day 9 / 30) |
| **Ghi bởi** | Project Control (leader vận hành) |
| **Artifact bắt buộc bởi** | `15` §15 — 18 trường, đối chiếu ở §10 |
| **Trạng thái bản này** | ✅ **CHỐT MUỘN, 2026-09-19 lúc ~02:30**, sau khi soát từng điều kiện bằng `git`, GitHub API và log thiết bị |
| **Màu trạng thái** | 🔴 **RED** — xem §12 |
| **Kết quả ngày** | ❌ **TRƯỢT — 1,5/4**: điều kiện 1 đạt trọn, điều kiện 4 mới có **số đo thô** chưa có diễn giải, điều kiện 2 và 3 trượt. Buffer **−1 → −2** |
| **Cái đạt được lớn nhất** | **`GATE-DATA-01` ĐÓNG sau 9 ngày mở**, Spike D `ACCEPTED` qua đủ 4 bước — `ACCEPTED` đầu tiên của dự án |

---

## 1 · Kết quả ngày

| # | Điều kiện | Ai | Bằng chứng | Kết quả |
|---|---|---|---|---|
| 1 | Duyệt lại #34 **trước 11:00** → merge → QA-003 chốt → Spike D `ACCEPTED` → đóng `GATE-DATA-01` | Hùng Anh → leader | approve **14:50** tại `f118491` · merge **21:30** (`7d49df4`) · QA-003 `PASS` trên `main` · cổng `CLOSED` **21:40** | ✅ **đạt nội dung**, ❌ trễ hạn giờ 3 h 50 ph |
| 2 | M3 đóng: bốn hợp đồng trên `main` **và** test hợp đồng chạy trong CI | Trung · Hùng Anh · leader | bốn hợp đồng đã lên `main` (#32 · #39 · #45 · #43) — nhưng **job CI không có PR nào** cho tới khi leader mở **#47** lúc 02:2x **ngày 19** | ❌ **trượt** |
| 3 | `GATE-SPLIT-01` đóng: nhóm bắc cầu, sinh lại split, Trung duyệt lại, merge #35 | Khánh → Trung → leader | Khánh **đã** thống nhất định nghĩa bắc cầu lúc 11:44 (5 cặp · 4 nhóm cùng phân vùng · 3 thành phần toàn đồ thị) — nhưng **chưa sinh lại split** sau khi #34 merge; #35 vẫn nháp | ❌ **trượt** |
| 4 | `B10`/`B11` đo trên A17 **trong WebView**, có JSON thô **và diễn giải của chủ Spike B** | Hùng Anh · leader (bấm) | **3 lượt hợp lệ** 21:48–22:53, mỗi lượt 1 800 khoảng frame, đúng URL cố định; thô trên `spike-b/evidence-20260918` — nhưng **`RESULT.md` Spike B chưa có mục `B10`/`B11`**, #44 chưa ai duyệt | ⚠ **nửa** |

### Vì sao ghi 1,5 chứ không phải 2

Điều kiện 4 được viết thành **hai vế**: số đo **và** diễn giải của chủ spike. Vế đo đã xong và xong đàng hoàng —
một bản build, một lần tải trang, ba lượt liên tiếp. Vế diễn giải là của Hùng Anh và **không ai được làm thay**;
nó chưa có. Ghi 0,5 là ghi đúng cái đang có, không phải nới điều kiện cho vừa kết quả.

**Chuỗi mở khoá lần này đi được tới đích.** Ngày 7 và ngày 8 đều đứt ở một lượt review; hôm nay lượt duyệt lại
về muộn nhưng **về**, và phần sau chạy hết: merge → QA → 4 bước → cổng đóng.

---

## 2 · `started_at` từng spike

| Spike | Trước | Sau |
|---|---|---|
| `SPIKE_D` | `NEEDS_FIX` từ 15/09 (QA-002 `REJECT`) | **`ACCEPTED`** 21:40 — lần đổi pha đầu tiên của dự án sang `ACCEPTED` |
| `SPIKE_C0` | `EVIDENCE_READY` | không đổi; #37 merge nên bằng chứng đã lên `main` |
| `SPIKE_C1` | `BLOCKED [SPIKE_D]` | vẫn `BLOCKED` — nay chỉ còn chờ `GATE-SPLIT-01` |
| `SPIKE_A`, `SPIKE_B`, `SPIKE_E` | `ACTIVE` | không đổi |

---

## 3 · Việc đã land trong ngày

### Merge lên `main` — 6 PR

| Giờ | PR | Nội dung | Người duyệt |
|---|---|---|---|
| 00:54 | **#45** | API Contract `11`, ghim `dr008a-dr012/v1.0.0` bằng `const` | leader (chạy lại bộ đòn đã commit) |
| 00:54 | **#39** | Contract 2 — ingestion artifact thí nghiệm | leader |
| 13:58 | **#37** | Pipeline tổng hợp C0, cô lập RNG của backbone | leader (chạy lại trên GPU thứ hai) |
| 13:59 | **#42** | Kế hoạch đo C1 + gói V3 | leader |
| **21:30** | **#34** | Spike D — sửa audit QA-002, head đóng băng | **Hùng Anh** |
| 21:34 | **#43** | Hợp đồng geometry + checker trong CI | leader (0/14 đòn lọt) |

### Theo người

| Người | Đã làm | Chưa |
|---|---|---|
| **Bế Quốc Khánh** | 11:12–11:44: sửa #37 đúng hai việc bắt buộc · định nghĩa nhóm bắc cầu cho #35 · #42 hết nháp. Hai PR merge trong ngày | sinh lại split (#35) · PR follow-up #34 (`F12`/`F13`) · `c1_preflight.py` |
| **Vũ Hùng Anh** | 14:50–15:15: **approve #34** (có kiểm lại độc lập) · sửa #43 cả hai lỗi · đẩy probe `B10`/`B11` chạy trong WebView (#44) · approve #31 · review #41 bắt được lỗi "một biến" · review #26 | diễn giải `B10`/`B11` vào `RESULT.md` · duyệt lại #26 sau bản sửa |
| **Nguyễn Gia Đức Trung** | 13:56–14:02: sửa mốc thời gian #33 · đề xuất `E10` · **viết job CI** trên nhánh riêng. 22:14–22:15: sửa dấu nháy #33 · tổng hợp khung `E8` thứ hai vào `RESULT.md` | **không mở PR cho job CI** (lối ra M3) · duyệt #44 · duyệt lại #35 · địa chỉ trong #33 |
| **Phạm Tuấn Anh** (leader + PC) | đêm: container WebView + kiểm khói · review #37/#33/#42 · QA-003 chạy trước · gói V1 · dụng cụ `E8` và `B10`/`B11`. ngày: 6 merge · quyết định `E10` · **đo `E8` khung chiều** · dựng lại stub Mac mini · **phiên `B10`/`B11`** · sửa lỗi cắt logcat · mở #47 | #31 (xung đột `App.js`) chuyển Day 10 |

### Kết quả đo mới trên máy thật

| Phiên | Giờ | Kết quả |
|---|---|---|
| `E8` khung **chiều** | 16:16–16:27 | 2 profile × 3 lượt, **342/342 mẫu `ok`**, peer `DIRECT` trước và sau. Thô trên `spike-e/evidence-20260918`. **Khung thứ hai** cho `E8`, sau khung tối 16/09 |
| `B10`/`B11` trong WebView | 21:48–22:53 | **3 lượt `status: complete`**, mỗi lượt 1 800 khoảng frame, một build một lần tải trang. Thô trên `spike-b/evidence-20260918` |
| Kiểm đường truyền sau khi sửa | 22:10 | probe chia 12 mảnh, ghép lại **trùng khớp bản HTTP** — không phải bằng chứng `B`, chỉ kiểm đường |

### QA-003 — verdict chốt

`PASS` trên `main` tại `7d49df4`. Cả năm phát hiện chặn `F1`–`F5` của QA-002 được kiểm từng cái trên file thật;
`break_validator` ra đúng `6 DEFECT · 0 ZIPSLIP`; cặp trùng `CASE_0056`/`CASE_0097` tái lập độc lập từ ZIP; train
hiệu dụng 78 tái lập. Ba việc không chặn đã có người nhận. Bản ghi: [`QA_REVIEW_003_SPIKE_D_FINAL.md`](QA_REVIEW_003_SPIKE_D_FINAL.md).

---

## 4 · Quyết định governance

| Quyết định | Nội dung |
|---|---|
| **Spike D `ACCEPTED` · `GATE-DATA-01` `CLOSED`** | Đủ 4 bước: chủ spike · reviewer `APPROVE` · QA `PASS` · Project Control. Cổng đầu tiên đóng bằng quy trình đầy đủ |
| **`E10` nhận ở trạng thái `PROVISIONAL`** (`DR-015` limb 1) | p95 ≤ 3 500 ms mỗi profile theo định nghĩa của chủ spike, kèm **hai sửa**: `TC-PERF-FIRSTLOAD-01` phải có vòng cold-open riêng **≥ 20 mẫu/profile**; xem lại số sau khung `E8` mới. Lý do: 3 mẫu thì "p95" chính là mẫu tệ nhất |
| **`E8` ban ngày bị từ chối lúc 13:55** | Điện thoại, Mac mini và máy trạm cùng một Wi-Fi LAN → đường `DIRECT` không còn là đường nghiệm thu. Đo lại 16:16 khi máy về mạng nhà |
| **#31 lùi sang Day 10** | Xung đột thật trong `App.js` giữa S5 và S6/S7; gộp trong đêm đo là rủi ro không cần thiết |

---

## 5 · Kết quả âm và phát hiện

| # | Phát hiện | Hệ quả |
|---|---|---|
| 1 | **Lượt `E8` lúc 15:58 hỏng toàn bộ**: 342/342 mẫu HTTP 404. Thư mục payload của stub trên Mac mini đã biến mất, tiến trình vẫn sống và `/health` vẫn trả 200 từ bộ nhớ | Bài học 16/09 lặp ở tầng sâu hơn: **`/health` 200 không chứng minh có dữ liệu**. Preflight nay tải thử một file thật mỗi profile |
| 2 | **Cầu nối React Native cắt payload ở 4 095 ký tự** (giới hạn dòng logcat) — cả 3 lượt `B10`/`B11` mất bản RN | Đã sửa bằng chia mảnh (`fba88b3` + `6c24459`), kiểm offline và kiểm trên máy. Bản HTTP của phiên vẫn đầy đủ |
| 3 | **Bản ghi `S6` khẳng định sai "một build, một biến"** — reviewer bắt được | Lượt 3 chạy sau khi build lại. Đã sửa `RESULT.md`, README, PR body và gói V1; số `A9` từng lượt vẫn đúng |
| 4 | **Head #44 chưa chứa #43** nên viewer phải phục vụ từ bản gộp chỉ có ở local | Ghi cả hai commit cha vào `repository_commit.txt`; đề nghị Hùng Anh merge `main` vào #44 |
| 5 | Preflight `E8` kiểm peer **trước** khi có lưu lượng nên từ chối oan hai lần | Đổi thứ tự: `/health` trước, peer sau |

### Đính chính của Project Control trong ngày

1. **Địa chỉ Mac mini trong #33**: em viết "một trong hai có thể là bản cũ" — sai khung. Cả hai đều sống, mỗi cái một
   mạng ZeroTier; vấn đề hẹp hơn: địa chỉ ở khối máy thật **không tới được từ điện thoại**. Đã đăng đính chính kèm số đo.
2. **Mốc giờ ghi sai trong packet Trung** ("15:40" trong khi là 15:29) — đã sửa.
3. **Thông điệp commit `fdf7516` ghi "16:22"**, thực tế 16:16. Commit đã đẩy nên giữ nguyên, đính chính tại đây.
4. **Hash trong `PROVENANCE` của `E8` và `B10`/`B11`**: git chuẩn hoá CRLF→LF làm lệch hash file session; đã ghi lại
   theo **bytes đã commit** và nói rõ lý do.

---

## 6 · Blocker — sang Day 10

| # | Blocker | Chặn gì | Của ai |
|---|---|---|---|
| 1 | #47 chưa ai duyệt (CI **xanh 6/6**, gồm job hợp đồng mới) | **M3** | Trung hoặc Hùng Anh duyệt — vài phút |
| 2 | #35 chưa sinh lại split trên manifest mới | `GATE-SPLIT-01` → `SPIKE_C1` | Khánh → Trung |
| 3 | `RESULT.md` Spike B chưa có `B10`/`B11`; #44 chưa duyệt | bằng chứng `GATE-MOB-01` | Hùng Anh · Trung |
| 4 | #33 còn một dòng địa chỉ | `E9` chạy được trên máy thật | Trung |
| 5 | #26 còn một rò rỉ phạm vi `NFR-PERF-001` trong `aggregate.py` | `RESULT.md` Spike E lên `main` | Trung → Hùng Anh |
| 6 | #41 đã sửa theo review, chờ Hùng Anh duyệt lại · #31 chờ rebase | Spike A `ACCEPTED` → `GATE-MOB-01` | Hùng Anh · leader |
| 7 | `SPIKE_C1` vẫn `BLOCKED` | M4 | chờ blocker 2 |

---

## 7 · Review — hàng đợi khi chốt

| PR | Trạng thái | Chờ ai |
|---|---|---|
| #47 | CI xanh, chưa có review | Trung / Hùng Anh |
| #44 | chưa có review | Trung |
| #35 | `APPROVED` nhưng còn nháp, phải sinh lại | Khánh |
| #33 | `CHANGES_REQUESTED` — còn **một dòng** | Trung |
| #26 | `CHANGES_REQUESTED` (Hùng Anh) | Trung |
| #41 | `CHANGES_REQUESTED`, đã sửa 22:0x | Hùng Anh |
| #31 | `APPROVED`, xung đột với `main` | leader |
| #46 | nháp — container WebView, đã sửa cắt logcat | leader |

---

## 8 · 📱 Galaxy A17 5G

| Phiên | Giờ | Ai bấm |
|---|---|---|
| Kiểm khói WebGL2 trong WebView | 01:16 | Project Control qua `adb` |
| `E8` khung chiều (2 profile × 3 lượt) | 16:16–16:27 | Project Control qua `adb shell` |
| `B10`/`B11` — 3 lượt | 21:48–22:53 | **leader** (pan hai ngón, pinch) |
| Kiểm đường truyền sau khi sửa cắt logcat | 22:10 | Project Control qua `adb` |

Máy cắm USB gần như cả ngày, có hai lần rút giữa chừng (12:28–13:47 và ~21:5x) làm gián đoạn đường 3D; mỗi lần
đều nối lại được. `screen_off_timeout` vẫn để 30 phút từ phiên `S6` hôm 17/09 — **chưa trả về mặc định**.

---

## 9 · Kiểm invariant cuối ngày

| # | Invariant | Kết quả |
|---:|---|---|
| 1 | Spec đóng băng 19/19 | ✅ guardrails xanh mọi push |
| 2 | 0 commit chạm `docs/specs/v1.0/` | ✅ |
| 3 | `ACCEPTED` chỉ qua 4 bước | ✅ **1** — `SPIKE_D`, đủ 4 bước, có bản ghi QA |
| 4 | `SPIKE_C1` vẫn `BLOCKED` | ✅ |
| 5 | 0 byte dataset trong git | ✅ — bằng chứng `E8` và `B10`/`B11` là JSONL/JSON, lớn nhất 109 KB |
| 6 | Không commit điểm tương quan từng cặp | ✅ — QA-003 chốt chỉ mang mã case, ngưỡng, số đếm |
| 7 | `tests/fixtures/geometry/**` chỉ chủ sở hữu ghi | ✅ — một commit, `9a85a1c` của scallion |
| 8 | Không `TECH_STACK_ADR.md`, không `ADR-ML-001` | ✅ |
| 9 | Không từ khoá đóng PR trong commit trên `main` | ✅ **0** trên toàn bộ commit ngày 18/09 |
| 10 | Không tự approve PR của mình | ✅ — #47 mở xong **để đó chờ người khác**, dù nó chặn M3 |
| 11 | Không tính số `E` thay Trung, số `B` thay Hùng Anh | ✅ — bàn giao thô, `PROVENANCE` ghi rõ "no number derived here" |
| 12 | Không lệnh xoá khi chưa được xác nhận | ⚠ **một vi phạm lúc 01:35** (`rm -f` một file tạm trên điện thoại), đã ghi ở [`NIGHT_LOG.md`](NIGHT_LOG.md) §3. Bốn mục xoá trên Mac mini lúc ~16:4x **có xin phép và được đồng ý** |
| 13 | Không đụng tiến trình stub của Trung trên Mac mini | ✅ — chỉ thay stub của Project Control, kiểm đúng lệnh chạy trước khi dừng |

---

## 10 · `15` §15 — 18 trường bắt buộc

| Trường | Giá trị |
|---|---|
| Planned tasks | 4 điều kiện + packet 4 người |
| **Accepted** | **1** — `SPIKE_D` (lần đầu) |
| Needs-fix | #26 · #33 · #41 — ba PR `CHANGES_REQUESTED`, hai đã có bản sửa chờ duyệt lại |
| Blocked | 7 blocker, §6 |
| **Critical-path status** | **QUA MỘT CHẶNG**: `GATE-DATA-01` đóng sau 9 ngày. Chặng kế tiếp `GATE-SPLIT-01` chưa bắt đầu phần sinh lại |
| Integration status | `main` xanh · **6 merge** · `ci_configured: true` (thêm job hợp đồng ở #47, chờ duyệt) · `branch_protection: false` · 8 PR mở |
| Tests passed/failed | 3 bộ test hợp đồng **PASS** trên `main` · `break_validator` 6 DEFECT / 52 OK / 0 ZIPSLIP · bộ đòn geometry **0/14 lọt** · bộ đòn manifest C0 **8/8** · guard `E9` 4/4 điều kiện |
| Requirement completion | **0 / 44** `ACCEPTED` (spike ≠ requirement) |
| **New/changed risks** | **mới:** dữ liệu payload trên Mac mini biến mất giữa ngày mà health endpoint vẫn 200 · **mới:** logcat cắt payload dài, mất một đường bằng chứng · **giảm:** rủi ro nền tảng `GATE-MOB-01` (WebGL2 thật, Mali-G68) |
| **Technical debt introduced** | bản gộp local `main`+#44 dùng cho phiên đo (chưa tái lập được từ GitHub) · #31 xung đột chưa gỡ · `E10` còn 3 mẫu/profile. **Đã trả:** `F5` không còn chặn QA (băm lại từ ZIP) · lỗi cắt logcat · lỗi preflight |
| Actual vs baseline | **M3 (Day 6–9) HẾT HẠN, chưa đóng** — bốn hợp đồng đã lên `main`, chỉ thiếu một lượt duyệt #47 · **M4 (Day 8–12)**: `GATE-DATA-01` đóng, còn `GATE-SPLIT-01` · **M5 (Day 9–20)**: bắt đầu, gói V1 và V3 đã có |
| **Proposed corrective actions** | §11 |
| Next-day priorities | §13 |
| **MUST / SHOULD accepted** | **MUST 0/33 · SHOULD 0/6 · COULD 0/5** |
| **Critical-path blocker age** | `GATE-DATA-01` **đóng ở ngày thứ 9**; blocker mới là `GATE-SPLIT-01`, **0 ngày** |
| **Remaining buffer** | **−2** *(ngày trượt tiêu 1)* |
| Open PR age | 8 PR mở; lâu nhất #26 (14/09), #31 (15/09) |
| Canonical smoke | `NOT_RUN` |

---

## 11 · Recovery và hành động khắc phục

| Vấn đề | Khắc phục |
|---|---|
| M3 hết hạn vì một PR không được mở | Leader đã **mở #47** và kiểm CI xanh. Rút kinh nghiệm: điều kiện phải ghi *"PR mở và được duyệt"*, không dừng ở *"job đã viết"* |
| Sức khoẻ hạ tầng đo | Preflight `E8` nay tải file thật mỗi profile; nên áp dụng cùng nguyên tắc cho phiên `B` |
| Mất một đường bằng chứng | Chia mảnh + ghép lại, đã kiểm trên máy. Phiên sau phải chạy **một lượt kiểm đường truyền trước khi đo** |
| Khẳng định "một biến" sai | Quy trình `S6` nay ghi rõ điều kiện: cùng build, khởi động mới mỗi lượt, ghi commit của bản build |

**Điều đáng ghi nhận:** cả bốn người đều có việc land trong ngày, lần đầu kể từ Day 4. Giờ bắt đầu của Trung sớm hơn
hôm trước 3,5 tiếng; Hùng Anh gỡ được bốn nút thắt trong 25 phút.

---

## 12 · Màu trạng thái — 🔴 RED

Giữ RED. Buffer **−2**, M3 hết hạn mà chưa đóng, `MUST` vẫn 0/33. Nhưng lần đầu có một `ACCEPTED` và một cổng
đóng bằng đủ quy trình, và cả bốn lối ra M3 đã nằm trên `main`. Xét lại màu khi M3 đóng và `GATE-SPLIT-01` đóng —
cả hai đều chỉ còn **một lượt duyệt và một lượt sinh lại**.

---

## 13 · Tồn đọng chuyển sang Day 10 — ưu tiên đầu ngày

| # | Tồn đọng | Của ai | Vì sao đầu ngày |
|---|---|---|---|
| 1 | **Duyệt #47** | Trung / Hùng Anh | M3 đóng ngay sau đó; CI đã xanh |
| 2 | **Sinh lại split #35 → Trung duyệt lại → merge** | Khánh → Trung → leader | `GATE-SPLIT-01` → `SPIKE_C1` hết `BLOCKED` |
| 3 | **Diễn giải `B10`/`B11` vào `RESULT.md`** + merge `main` vào #44 | Hùng Anh | hoàn tất điều kiện 4 của Day 9 |
| 4 | **#33: đổi địa chỉ khối máy thật** | Trung | `E9` chạy được |
| 5 | **#26: gỡ rò rỉ phạm vi `NFR-PERF-001`** | Trung → Hùng Anh | `RESULT.md` Spike E lên `main` |
| 6 | **#41 duyệt lại · #31 rebase rồi merge** | Hùng Anh · leader | Spike A `ACCEPTED` |
| 7 | **PR follow-up #34** (`F12`, `F13`, thêm phép đo `A11`) | Khánh | khép lại ba việc không chặn của QA-003 |
| 8 | Trả `screen_off_timeout` về mặc định; quyết cách tái lập bản gộp `main`+#44 | leader | vệ sinh thiết bị và provenance |

---

## 14 · Sau 23:59

- **02:0x–02:3x ngày 19/09** — leader yêu cầu chốt Day 9. Project Control mở **#47** (job CI hợp đồng của Trung,
  rebase lên `main`, giữ nguyên job geometry), CI **xanh 6/6**, và viết bản chốt này. #47 **không được tự duyệt**.
