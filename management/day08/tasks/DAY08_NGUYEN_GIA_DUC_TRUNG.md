# DAY 8 — Nguyễn Gia Đức Trung · 2026-09-17

**Khối lượng hôm nay:** phần chính **≥ 8 h** *(bảng dưới cộng ~8,75 h)* · hàng đợi dự phòng ~1,5 h · **hạn: 23:59**.

> **Tối qua bạn làm bốn việc trong 12 phút và không việc nào làm cho xong chuyện.** Review #35 của bạn bám đúng
> **ba ràng buộc `DR-002b`** — ngưỡng có được khai **trước** mọi lượt train không, luật gom nhóm và loại case có
> áp đồng đều không, số đếm có khớp danh sách không — thay vì duyệt vì thấy selftest xanh. Hợp đồng ingestion 2
> (#39) ép cả hai gate và holdout 54 case. Quy trình `E9` cho máy thật đã có. Và bạn **tổng hợp riêng từng
> profile**, không trộn.
>
> **Con số bạn tính ra là phát hiện lớn nhất Day 7 — và một đính chính của Project Control, không phải của bạn.**
> Bản ghi quản lý hôm qua gán số của bạn vào `NFR-PERF-001`. **Sai phạm vi:** `04:102` chỉ ràng buộc slice
> *"already available/cached"* **trên máy demo**, còn `E4 navigate_s1` phát **đúng URL** của `E3 uncached_slice_s1`
> (`harness.py:128` và `:132`), không cache, trên **máy trạm**, đo **`ms_total` của một HTTP GET**. Bằng chứng:
> `E4 s1` còn *nhanh hơn* `E3` (2 864 vs 3 326 và 1 844 vs 2 646 ms) — cùng phân phối vì cùng endpoint.
>
> **Số của bạn không đổi và vẫn là phát hiện lớn nhất trong ngày.** Nó nói ba điều, cả ba đều đúng phạm vi:
> **①** tiêu chí **`E4` của chính Spike E trượt** — chiến lược prefetch `s4` p95 **28 606 ms** / **6 181 ms**,
> *chậm hơn* per-slice `s1`; **②** chiến lược `s3` tải trọn volume (p50 **338,9 s** / **121,4 s**) **vi phạm limb 2
> của `NFR-PERF-001`** — đúng thứ điều khoản đó cấm; **③** slice **chưa cache** (`E3` p95 3 326 / 2 646 ms)
> **không có trần nào để so** → đó là **`RA-H13`**, và Decision Request hôm nay mở theo khung đó.
>
> **Việc của bạn:** sửa hai câu trong `RESULT.md` (quanh dòng 59–61 và 98–99) từ *"`NFR-PERF-001` không đạt"*
> thành ba câu trên. Đừng đổi một con số nào. Chi tiết ở comment leader trên #26.
>
> **Hôm nay bạn nhận thêm việc chính mới: hợp đồng API (`11`).** Đó là **lối ra M3 duy nhất chưa ai động tới**,
> và M3 chỉ còn hôm nay và mai. Nó đúng khối kỹ thuật của bạn (`DR-013`) và cùng khuôn với hai hợp đồng ingestion
> bạn vừa viết.

## 🔴 LÀM TRƯỚC

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **1** | **Duyệt lại #35** — Khánh đã thực hiện `DR-002b` lúc 00:21: ngưỡng `r ≥ 0.75` khai **trong manifest**, 4 nhóm giữ nguyên qua mọi tập con, loại `CASE_0133` (kéo theo `CASE_0117`) → train hiệu dụng **78**, tập con 20/38/78. Ba phép kiểm của bạn: **(a)** ngưỡng được khai **trước** mọi lượt train — kiểm bằng **lịch sử commit**, không bằng lời; **(b)** luật gom nhóm và loại case áp **đồng đều**, không có ngoại lệ lặng lẽ; **(c)** số đếm trong manifest khớp danh sách loại. *Lưu ý: điểm từng cặp hiện in `RESTRICTED_BY_F5` — leader phán trong sáng nay, đừng chặn PR vì riêng chỗ đó* | ~1 h | Khánh (đã đẩy) · leader (phán điểm) | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung |
| **2** | **Sửa #32** — lỗi leader tìm ra: đặt `dataset.geometry_validation_status = NOT_VALIDATED` trong khi mọi artifact khai `VALIDATED_AXIS_ALIGNED` thì validator vẫn trả `PASS`, `exit=0` (lớp QA-002 `F15`). Thêm **phép kiểm nhất quán** giữa trạng thái mức dataset và mức artifact, **mã lỗi riêng** (vd. `GEOMETRY_STATUS_INCONSISTENT`), và **một ca kiểm tổng hợp cho chính nó** — để nó không rơi vào nhóm "phép kiểm không bao giờ FAIL được". Kèm một dòng README: `package_checksum` **chưa được kiểm ở v0** | ~1,5 h | không | commit trên #32, trả lời review |
| **3** | **Duyệt lại #29, #30 và #38** — ba PR của Hùng Anh đều đang chờ bạn: #29 đã bỏ đoạn lặp; **#30 đã thêm pan** desktop + touch *(pan là `PR-3D-02`, một `MUST`)*; #38 là POC linked-MPR xếp chồng trên #30 | ~1,5 h | không | review có nội dung trên từng PR |

## Việc Day 8

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **4** | **Hợp đồng API `11` — bản thảo v0** *(việc chính hôm nay; lối ra M3, leader giao 17/09)*. Cùng khuôn với hai hợp đồng ingestion của bạn: `contracts/api/` với **README + JSON Schema + validator + ca kiểm tổng hợp**. Phải phủ: endpoint §3–§9 (study/case, slice + ground truth, experiment + compare, analysis run, reconstruction, review/brush, finding); **15 mã lỗi** §10 — trong đó `GROUND_TRUTH_UNAVAILABLE` **không bao giờ được trả 0 thay cho "không có"**; **mọi phản hồi có hình học phải mang `geometry_contract_version` + trạng thái validate** (`11` §2, §4); luật **chống ghi đè cũ** (`expected_revision`/ETag, `STALE_REVISION`); và `11` §11 rule 5 — **mock/fixture sinh từ schema, không viết tay**. Ghi rõ `DRAFT v0`, không đóng băng API | ~3 h | không | PR mới, CI 4/4, ghi `DRAFT v0` |
| **5** | **Nhờ review #39 và #33** — hai PR của bạn đang **không ai được giao**, nên chúng đứng yên dù CI xanh. #39 (hợp đồng 2) đề xuất nhờ leader *(khối Integration / cross-contract)*; #33 (`E9`) nhờ Hùng Anh *(reviewer Spike E)* | ~15 ph | không | mỗi PR có người review |
| **6** | **`E7` — kế hoạch đo bộ nhớ app** *(nợ dự phòng Day 7)*: ghi vào nháp `RESULT.md` rằng `E7` cần app thật (Spike A/B), đề xuất cách đo khi có (vd. `dumpsys meminfo` theo từng chiến lược tải), và ngưỡng nào là đáng lo | ~30 ph | không | một mục trong `RESULT.md` |
| **7** | **`E9` chạy thật trên máy, buổi tối** — leader cầm máy, bạn thiết kế và đọc kết quả, theo đúng quy trình bạn viết ở #33: mất kết nối có kiểm soát giữa một lần tải slice và một lần tải mesh, ghi thời điểm mất, thời gian hồi phục, số lần thử lại, dữ liệu sau thử lại có trùng byte không | ~1 h | leader (thiết bị, buổi tối) | dữ liệu thô + phần `E9` trong `RESULT.md` |

**Tổng phần chính: ~8,75 h.**

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md) *(v1)*: **D5** *(tốc độ là số đo, không phải
> lời tuyên bố — và số bạn vừa đo làm **trượt tiêu chí `E4`** và **phơi ra khoảng trống `RA-H13`**, đó là thông
> tin quý chứ không phải thất bại)* ·
> **D3** *(trạng thái trung thực: `E9` chứng minh app mất mạng rồi hồi phục thế nào)* · **H3/H4** *(giảng viên mở
> một ca và lướt slice qua mạng thật)*. Hợp đồng API việc 4 quyết định **mọi màn hình lấy dữ liệu ra sao** — nó là
> thứ nối `SCR-01`…`SCR-09` với backend.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **`E10`, `E11`, `E13`** — `DR-006a` rev 2 và `SPIKE_E/TASK.md:196` bắt buộc **chính bạn** viết. ⭐ **Leader vừa quyết `DR-015` (c) lúc 10:15: ngân sách first-load sẽ là mục tiêu ràng buộc có acceptance test — nhưng _con số là của bạn_, leader không viết hộ.** Đề xuất tạm của bạn (≤ 1 000 ms p95) đang **mâu thuẫn với chính dữ liệu của bạn**: run-4 đo 445 ms p95, còn buổi tối 16/09 đo **3 103 ms** trên hồ sơ 576. **Năm điều kiện để `E10` được duyệt** *(đủ ở `OPEN_DECISIONS` → `DR-015` limb 1)*: ① nêu rõ **sự kiện bắt đầu và kết thúc** đồng hồ + máy + đường truyền + hồ sơ payload · ② nêu **thống kê**, kèm p50 · ③ **không gộp hai hồ sơ** · ④ kèm **acceptance test** dạng `TC-` · ⑤ ghi rõ còn thiếu **khung giờ ban ngày** (`E8`). Mã đã đặt sẵn: `PERF-FIRSTLOAD-01` / `TC-PERF-FIRSTLOAD-01`. **`E13` giờ đã có khung**: `DR-015` limb 2 đã loại **tải trọn volume** (hai lý do độc lập), chọn **per-slice là hướng V1**, **bác bản prefetch `s4` đã thử** (28 606 / 6 181 ms — chậm hơn không prefetch), và để mở **artifact URL** vì chưa ai đo | ~1,5 h | ba mục trong nháp `RESULT.md` |
| ⚠ **`E10` không ép vào hôm nay** — nó cần khung giờ mà `E8` còn thiếu, và packet của bạn đã ~8,75 h. Đây là **ứng viên việc chính Day 9**; bản thảo `ADR-ART-001` *(khối của bạn theo `DR-013` Axis B, leader là secondary)* đi sau `E10` | — | — |
| **Khung giờ ban ngày cho `E8`** — hiện mới có một khung tối, và khung đó lại bắt đầu 21:50 chứ không phải 21:00 | ~30 ph | ghi vào kế hoạch đo |

---

**Nhắc lại:** bạn là **reviewer Spike B** (`DR-006a` rev 3). Leader là operator duy nhất của điện thoại cho Spike E;
**mọi con số `E` do bạn tính** — Project Control không tính hộ. **Liên quan:** PR #26 · #32 · #33 · #35 · #39 ·
[`../../day07/DAY07_EOD_REVIEW.md`](../../day07/DAY07_EOD_REVIEW.md) · `docs/specs/v1.0/11_API_CONTRACT.md`
