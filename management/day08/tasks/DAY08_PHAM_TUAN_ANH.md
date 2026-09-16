# DAY 8 — Phạm Tuấn Anh · 2026-09-17

**Khối lượng hôm nay:** **không giới hạn giờ** — quyết định, review, merge, QA soi lại, đo trên máy, chốt ngày.
Thành viên: **≥ 8 h** việc thật + ~2 h dự phòng, hạn **23:59**.

> **Day 7 anh chốt `ĐẠT` 4/4 theo nội dung** (2/4 theo chữ của hạn giờ) — bản chốt:
> [`../../day07/DAY07_EOD_REVIEW.md`](../../day07/DAY07_EOD_REVIEW.md). Buffer giữ **−1**.
>
> **Hôm nay critical path chỉ còn thiếu một lượt review.** #34 sẵn sàng từ 00:10 với nội dung đủ; Hùng Anh duyệt
> trước 12:00 thì trong ngày có thể đi trọn: merge → **QA soi lại** → `ACCEPTED` → **`GATE-DATA-01` đóng** →
> `SPIKE_C1` hết `BLOCKED`. Đó cũng là điều kiện để `M4` (bắt đầu hôm nay) không trượt ngay từ ngày đầu.
>
> **Hai mốc đang ép cùng lúc:** `M3` (Day 6–9) còn hôm nay và mai mà `contracts/` **chưa có gì trên `main`**;
> `M4` (Day 8–12) bắt đầu với `SPIKE_C1` còn `BLOCKED`.

## 🔴 LÀM TRƯỚC — việc đang giữ người khác

| # | Việc | Giờ | Giữ ai | Xong khi |
|---|---|---|---|---|
| **1** | **`DR-002b` × `F5` — ĐÃ PHÁN 17/09, còn phần ghi lại.** Phán quyết: **điểm từng cặp ở manifest hạn chế** *(nhất quán với `F5`)*; đổi lại **manifest public phải mang đủ phần còn lại để audit được quyết định mà không cần điểm**: ngưỡng **`r ≥ 0.75`** khai **thành trường**, **mã mọi case bị loại và mọi nhóm**, **số đếm** (tập con 20/38/78, train hiệu dụng 78), và **hash + lệnh sinh lại** bản hạn chế. Người có ZIP dựng lại được từng điểm; người không có vẫn kiểm được rằng luật **khai trước** khi train và **áp đồng đều**. Việc còn lại: ghi vào QA-002 §9, `OPEN_DECISIONS` `DR-002b`, comment #35 *(cho Khánh biết viết gì)* và #34 *(một dòng cho nhất quán)* | ~20 ph | **Khánh và Trung** — cả hai đang kẹt ở đây | ghi trên #35 + QA-002 §9 |
| **2** | **Merge #26** khi Hùng Anh approve → Spike E có `RESULT.md` trên `main`, `evidence_present` chuyển `true`. Head mới `eaa878f` đã có phần tổng hợp hai profile | ~15 ph | **Trung** | `main` xanh sau merge |
| **3** | **Merge #34** khi có approve → rồi **chạy QA soi lại Spike D** (phiên độc lập, dùng lại [`../../day06/qa002/`](../../day06/qa002/)): kiểm đúng những gì QA-002 đã bác, cộng `A17` với hai file mới phát hiện. `PASS` → Project Control chuyển **`ACCEPTED`**, **đóng `GATE-DATA-01`**, gỡ `BLOCKED` cho `SPIKE_C1`, cập nhật `C1`/`C6`. `REJECT` → trả Khánh kèm bản ghi như QA-002 | ~2,5 h | **Hùng Anh** (duyệt, hẹn 12:00) | bản ghi QA + state cập nhật |

## Việc Day 8

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **3b** | ⚠ **Đính chính bản ghi `NFR-PERF-001` — lỗi của Project Control, đã lan ra 6 file.** Bản Day-7 ghi *"kết quả đo đầu tiên không đạt ngưỡng spec"*. Sai phạm vi: `04:102` chỉ quản slice **đã cache trên máy demo**, `13:314` ghi *"30-step **cached**"*; còn `E4 navigate_s1` phát **đúng URL** của `E3 uncached_slice_s1` (`harness.py:128`/`:132`), không cache, trên máy trạm, đo `ms_total` HTTP — và `E4 s1` còn **nhanh hơn** `E3` (2 864 vs 3 326; 1 844 vs 2 646), cùng phân phối vì cùng endpoint. Phép đo đúng phạm vi là **`A9` = p95 65,31 / 50,23 ms → đạt**. Sửa: `DAY07_EOD_REVIEW` §5/§10/§11/§12/§13 · `PROJECT_STATE` (màu, #26, `decisions_pending`) · `days.yaml` + dựng lại bảng · packet Trung/Hùng Anh · comment #26 · tin nhắn nhóm | ~45 ph | không | `grep -ri NFR-PERF-001` chỉ còn cách đọc đúng |
| **4** | **Decision Request khung `RA-H13`** *(thay chỗ DR cũ)* — vấn đề thật không phải một ngưỡng bị trượt mà **một ngưỡng không tồn tại**: `04` không ràng buộc first-load, slice chưa cache, hay mesh, nên số Spike E **không có gì để đối chiếu** và `ADR-ART-001` không có tiêu chí để biện minh. RA-H13 là HIGH và ngay từ đầu đã yêu cầu *"raise a DR to add a first-load NFR with a measurable target and a matching acceptance test"*. **Bằng chứng nay đã có:** `E3` uncached p95 **3 326** / **2 646 ms** · tiêu chí `E4` **trượt** (prefetch `s4` **28 606** / **6 181 ms**, chậm hơn `s1`) · `s3` tải trọn volume p50 **338,9 s** / **121,4 s** **vi phạm limb 2 của `NFR-PERF-001`** · `A9` cached **đạt**. Phương án: **(a)** thêm NFR first-load đo được + acceptance test; **(b)** quyết chiến lược transport cho `ADR-ART-001`; **(c)** cả hai — PC đề xuất **(c)**, vì (a) không có (b) thì không biết đo cái gì. ⛔ **`PR-CACHE-01` giữ `SHOULD`**, không nâng lên `MUST` qua cửa sau *(firewall phạm vi lặp ở 5 file)*. **Spec đóng băng — DR là đường duy nhất** | ~1 h | Project Control (bản thảo) · Trung (ý kiến) | quyết định trong `OPEN_DECISIONS.md` |
| **5** | **Review #39** — hợp đồng ingestion 2 của Trung, thuộc khối *Integration / cross-contract* của anh, và là **lối ra M3**. Kiểm: ép đủ `GATE-SPLIT-01` + `GATE-ML-01`, holdout đúng 54 case, checksum/provenance, và **thử phá nó** như em đã làm với #32 | ~1 h | không | review có nội dung |
| **6** | **Spike A chặng `S6` — dựng cache có giới hạn rồi mới đo** *(máy đã cắm)*. Không phải một phép đo: hiện `App.js:359-369` prewarm **toàn bộ** slice bằng `<Image>` ẩn — **không cửa sổ, không eviction**; `generate.py:41` hardcode `NZ = 16` (CLI chỉ có `--nx`/`--ny`); **không script nào bắt `dumpsys meminfo`** nên hai số 68 MB / 186 MB trong evidence là **gõ tay**; `extract_timings.py` không có trường *cache policy*. PC dựng: ① cửa sổ ±N **có giải phóng bitmap** + công tắc chính sách `all`\|`±3` · ② `--nz` → fixture **576×576×88 thật** · ③ script `dumpsys meminfo` trước/sau · ④ `cache_policy`/`nz`/`memory_*` vào bản ghi · ⑤ build release. **Anh bấm đo hai chính sách** để so. Kết quả: **376 MB ngoại suy → số đo thật**. Nếu còn giờ: `A10` (cần đường đo gồm độ trễ native, hiện mới có proxy JS 22,66 ms) và `A11` | ~3–4 h | thiết bị *(anh giữ máy)* | 2 bản ghi `a9_*` có `cache_policy` + evidence trên nhánh Spike A |
| **7** | **Merge phần còn lại khi review xong**: #29 · #30 · #38 *(chờ Trung)* · #32 · #33 · #39 · #40 · #31. Nhớ luật xếp chồng: **merge commit + giữ nhánh** khi còn PR con, rồi đổi base PR con | ~1 h | Trung, Hùng Anh | CI xanh sau mỗi merge |
| **8** | **Chốt Day 8** | ~1 h | — | `DAY08_EOD_REVIEW.md` |

## Hàng đợi dự phòng

- **Gói bằng chứng `TC-TEAM-001`** (vertical V1) — 6 hạng mục theo `10` §10; anh cũng là một trong bốn thành viên
  phải có gói này, và nó nằm trong **sáu test của sàn nghiệm thu cuối** (`13` §13) *(~1,5 h)*.
- **Khung trạng thái màn hình** `PR-MOBILE-02` / `TC-MOBILE-STATE-001` — ma trận loading / không khả dụng / đang
  xử lý / lỗi có thể thử lại / dữ liệu hỏng cho `SCR-01`…`SCR-09` theo `10` §8. **Thuần thiết kế, không vi phạm
  `GATE-MOB-01`** (không chọn framework, không viết `TECH_STACK_ADR.md`). Ứng viên chính cho Day 9 *(~2 h)*.

---

**Ranh giới không đổi:** không tính số `E` thay Trung, số `B` thay Hùng Anh, không chạy C0/C1 thay Khánh · không
merge PR chưa có `APPROVE` · không tự approve PR của chính mình · không chạm `docs/specs/v1.0/**` ·
`GATE-MOB-01` còn mở nên **không chọn framework, không viết `TECH_STACK_ADR.md`** · commit trên `main` không dùng
từ khoá đóng PR. **Liên quan:** PR #26 · #31 · #34 · #35 · #39 ·
[`../../day07/DAY07_EOD_REVIEW.md`](../../day07/DAY07_EOD_REVIEW.md) · `PROJECT_STATE.yaml` → `milestones.M3`, `M4`
