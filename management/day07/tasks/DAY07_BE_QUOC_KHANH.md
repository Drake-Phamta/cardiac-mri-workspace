# DAY 7 — Bế Quốc Khánh · 2026-09-16

**Khối lượng hôm nay:** phần chính **≥ 8 h** · hàng đợi dự phòng ~2 h · **hạn: 23:59 hôm nay** ·
**mốc đẩy giữa ngày: 12:00 và 18:00**.

> **Đêm qua bạn làm khối lượng lớn và đúng hướng:** bản sửa Spike D theo QA-002 (#34), split `DR-002a` + bằng chứng nối
> bệnh nhân (#35), approve #17 sau khi bật pagefile, **probe C0 trọn ma trận trên RTX 4050** (#36, 20/20 phép đo) và khung
> pipeline tổng hợp (#37). Sàng lọc chỉ từ ảnh MRI của bạn **tìm lại được cặp trùng ở hạng 1** — đúng phép kiểm chính
> phương pháp mà packet hôm qua yêu cầu.
>
> **Nhưng tất cả lên trong khoảng 00:19–01:14**, sau hạn 23:59 — ngày thứ ba liên tiếp (Day 4 03:10 · Day 5 00:44).
> Leader **cho qua** cho Day 6, nên điều kiện 2 tính là đạt muộn. Hệ quả thật không nằm ở luật mà ở lịch: Hùng Anh không
> có gì để duyệt lại trong ngày, Trung không có PR split để review, và **Day 6 chốt CHƯA ĐẠT 3/4** —
> [`../../day06/DAY06_EOD_REVIEW.md`](../../day06/DAY06_EOD_REVIEW.md).
>
> **Hôm nay critical path nằm ở #34 của bạn.** Chuyển ready **trước 12:00** thì trong hôm nay còn kịp: Hùng Anh duyệt lại
> → leader merge → QA soi lại → `GATE-DATA-01`.

## 🔴 LÀM TRƯỚC — nợ Day 6

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **1** | **#34 → chuyển ready, trước 12:00** *(critical path)*: **(a)** xác nhận phần PR đang ghi là HITL — lời lẽ `A11`, `A14` và F5; **(b)** bảng `A19` mục "split và ID manifest" viết theo **Q2** leader quyết sáng nay *(đề xuất QA-002: hoãn có ghi sang `GATE-SPLIT-01`)*; **(c)** comment trả lời **từng** phát hiện F1–F5, F12, F13 theo mẫu *phát hiện → file/dòng đã sửa → lệnh kiểm lại*; **(d)** bỏ draft và nhờ **Hùng Anh** duyệt lại, kèm lệnh tái lập (script QA ở [`../../day06/qa002/`](../../day06/qa002/)) | ~2 h | leader quyết **Q2** (hẹn trước 10:00) — chưa có thì làm (a), (c), (d) trước | #34 hết draft **trước 12:00**, 7 phát hiện có 7 câu trả lời |
| **2** | **#36 — điền `C0-7`/`C0-8`**: số **giờ GPU/ngày** máy bạn thật sự chạy được → chạy lại `extrapolate.py <file> --train-cases 80 --gpu-hours-per-day <số>` → sinh lại bảng + biểu đồ bằng `summarize.py`; xác nhận câu chữ `RESULT.md`. Kèm **khai `started_at` thật của Spike C0** trong một comment (file probe đầu tiên ghi `2026-09-16T00:43:25+07:00`) để Project Control cập nhật state — trường này chỉ chủ spike khai | ~1,5 h | không | #36 không còn ô NOT MEASURED vì thiếu input; comment `started_at` |
| **3** | **Sau khi leader merge #17:** đổi base **#36** và **#37** sang `main` — `gh pr edit 36 --base main`, `gh pr edit 37 --base main`. Hai PR này đang xếp chồng trên nhánh `spike-c0/compute-probe` nên **chưa có CI lần nào** | ~15 ph | leader merge #17 (hẹn sáng) | CI 4/4 xanh trên #36 và #37 |
| **4** | **#35 — nhờ Trung review** (vẫn để draft tới khi #34 merge được): ghi trên PR cách tái lập **cho người không có bản ZIP** — `split.py --selftest`, JSON Schema, đếm 80/20/54, luật `DR-002a`, chạy hai lần ra cùng file, `linkage_screen.py --selftest` | ~30 ph | không | yêu cầu review + hướng dẫn trên #35 |

## Việc Day 7

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **5** | **Sửa lỗi validator QA-002 — F6–F11, F14, F15**, mỗi lỗi kèm **một ca kiểm hồi quy** dựng từ kịch bản phá có sẵn ở [`../../day06/qa002/break_validator.py`](../../day06/qa002/break_validator.py): `A9` chỉ so origin (F6) · `A17` dùng danh sách cấm thay vì allowlist (F7) · `A10` không thể FAIL (F8) · `--archive` không băm ZIP (F9) · file ngoài thư mục case và mục ZIP `../` (F10) · direction `NaN`/toàn 0 vẫn PASS (F11) · thành viên ZIP hỏng làm crash sai mã thoát (F14) · `A16`, `A20` không thể FAIL (F15). **PR riêng**, không nhồi vào #34 để không làm chậm lượt duyệt lại | ~3 h | không | PR mới, CI xanh; mỗi phát hiện: trước sửa FAIL, sau sửa PASS |
| **6** | **Góp ý chuyên môn cho Decision Request nối bệnh nhân** — Project Control soạn bản thảo trước 12:00 từ `PATIENT_LINKAGE_EVIDENCE.md` của bạn. Bạn ghi ý kiến **chủ Spike D** trên bản đó: phương án nào chạy được, nếu gom theo điểm tương quan thì **ngưỡng phải khai trước mọi kết quả mô hình** là bao nhiêu và chi phí ra sao, phần nào là sàng lọc chứ không phải bằng chứng | ~1 h | Project Control (bản thảo) | comment có nội dung; leader quyết trong ngày |
| **7** | **#35 sau khi #34 merge**: sinh lại split theo SHA manifest mới trên `main`, cập nhật `SPLIT_RESULT.md`, chạy lại selftest → chuyển ready | ~1 h | #34 merge | #35 ready, CI xanh |

**Tổng phần chính: ~9,25 h.**

> **🎯 Chuẩn demo** — [`../../DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **D2** *(mọi con số trên màn hình truy được về
> artifact sinh ra nó)* · **H1 / SCR-01** *(tổng quan dataset: số case kèm N, giới hạn ghi rõ)* · **D3** *(cái gì chưa kiểm
> được thì hiện là **không khả dụng**, không bao giờ là số 0 — mm/mL đang đúng tinh thần này)* · **H10 / SCR-07** *(so sánh
> mô hình)*. Việc 2 đi đúng hướng: bảng và biểu đồ C0 **sinh từ JSON bằng một lệnh**, không vẽ tay — giữ nguyên nếp đó cho
> mọi số liệu sẽ lên báo cáo và màn hình kết quả.

## Hàng đợi dự phòng — khi việc chính bị chặn hoặc xong sớm

| Việc | Giờ | Xong khi |
|---|---|---|
| **Tìm nguồn công khai có ánh xạ lần chụp → bệnh nhân** cho 154 scan (trang phát hành, phụ lục bài benchmark, mô tả bộ dữ liệu). **Chỉ đọc nguồn công khai** — liên hệ ban tổ chức chỉ khi leader đồng ý | ~1 h | ghi vào `PATIENT_LINKAGE_EVIDENCE.md`: tìm được hay không, kèm đường dẫn |
| **Liệt kê trường siêu dữ liệu từng case trong manifest công khai**: trường nào cần công khai để tái lập, trường nào nên hạn chế — đầu vào cho leader phán phần còn lại của **F5** | ~1 h | một mục trong `POLICY_EVIDENCE.md` |

---

**Nhắc lại:** `DR-002` = Path A · `DR-002a` = cặp `CASE_0056`/`CASE_0097` là **một nhóm ghim vào train**, 80/20 và seed 2024
giữ nguyên, train có **79 lần chụp khác nhau**. `SPIKE_C1` vẫn `BLOCKED` — **không chạm dữ liệu thật** cho tới khi Spike D
`ACCEPTED` và `GATE-SPLIT-01` có quyết định. **Liên quan:** PR #34 · #35 · #36 · #37 · #17 ·
[`../../day06/QA_REVIEW_002_SPIKE_D.md`](../../day06/QA_REVIEW_002_SPIKE_D.md) ·
[`../../day06/DAY06_EOD_REVIEW.md`](../../day06/DAY06_EOD_REVIEW.md)
