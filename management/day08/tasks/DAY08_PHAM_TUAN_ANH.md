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
| **1** | **Phán `DR-002b` × `F5`** — hai quyết định của anh hôm qua va nhau đúng một chỗ: Trung yêu cầu danh sách case bị loại **kèm điểm tương quan**, còn `F5` (thu hẹp) đẩy điểm sang manifest hạn chế, nên #35 in `RESTRICTED_BY_F5`. Hai lựa chọn: **(a)** điểm nằm trong manifest hạn chế, public chỉ có hash + lệnh sinh lại — người review có ZIP thì tự dựng lại *(nhất quán với `F5`)*; **(b)** công khai điểm **riêng cho mấy case bị loại**, vì đó là căn cứ của một quyết định khoa học và số lượng rất nhỏ. Cần một câu, không cần văn bản dài | ~15 ph | **Khánh và Trung** — cả hai đang kẹt ở đây | ghi trên #35 + QA-002 §9 |
| **2** | **Merge #26** khi Hùng Anh approve → Spike E có `RESULT.md` trên `main`, `evidence_present` chuyển `true`. Head mới `eaa878f` đã có phần tổng hợp hai profile | ~15 ph | **Trung** | `main` xanh sau merge |
| **3** | **Merge #34** khi có approve → rồi **chạy QA soi lại Spike D** (phiên độc lập, dùng lại [`../../day06/qa002/`](../../day06/qa002/)): kiểm đúng những gì QA-002 đã bác, cộng `A17` với hai file mới phát hiện. `PASS` → Project Control chuyển **`ACCEPTED`**, **đóng `GATE-DATA-01`**, gỡ `BLOCKED` cho `SPIKE_C1`, cập nhật `C1`/`C6`. `REJECT` → trả Khánh kèm bản ghi như QA-002 | ~2,5 h | **Hùng Anh** (duyệt, hẹn 12:00) | bản ghi QA + state cập nhật |

## Việc Day 8

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **4** | **Decision Request cho `NFR-PERF-001`** — đây là **kết quả đo đầu tiên của dự án không đạt ngưỡng spec**: `E4` p95 **2 864 ms** (576) và **1 844 ms** (640) so với trần **200 ms**; tải trọn volume p50 338,9 s và 121,4 s, trên chính đường nghiệm thu `wifi-overlay` `DIRECT`. Project Control soạn DR nêu: số đo thật và điều kiện đo · khoảng cách tới trần · các phương án (**cache/prefetch** — `PR-CACHE-01` hiện là `SHOULD`; **giảm payload / đổi chiến lược tải**; **định nghĩa lại điều kiện đo** nếu trần vốn nói về slice đã cache). **Spec đóng băng — Decision Request là đường duy nhất.** Anh quyết trong ngày; để lâu thì chiến lược tải của V1 và Spike E cùng trôi | ~1 h | Project Control (bản thảo) · Trung (ý kiến) | quyết định trong `OPEN_DECISIONS.md` |
| **5** | **Review #39** — hợp đồng ingestion 2 của Trung, thuộc khối *Integration / cross-contract* của anh, và là **lối ra M3**. Kiểm: ép đủ `GATE-SPLIT-01` + `GATE-ML-01`, holdout đúng 54 case, checksum/provenance, và **thử phá nó** như em đã làm với #32 | ~1 h | không | review có nội dung |
| **6** | **Spike A buổi tối, khi có máy: đo lại `A9` với cache giới hạn ±3 slice.** `RESULT.md` của chính spike này nói đây **quan trọng hơn brush**: prewarm cả volume ngoại suy **376 MB** cho 88 slice — con số đó và `NFR-PERF-001` vừa trượt là hai mặt của cùng một vấn đề tải dữ liệu. Nếu còn giờ: `A10` (độ trễ brush thật, không phải proxy JS) và `A11` | ~2 h | thiết bị *(anh giữ máy)* | số đo + evidence trên nhánh Spike A |
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
