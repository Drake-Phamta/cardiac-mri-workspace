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
| **1** | **#34 → chuyển ready, trước 12:00** *(critical path)*: **(a)** xác nhận phần PR đang ghi là HITL — lời lẽ `A11`, `A14` và F5; **(b)** ✅ **`Q2` đã quyết 16/09 — hoãn có ghi**: bảng `A19` ghi mục "split và ID manifest" của `06` §9.1 là **hoãn sang `GATE-SPLIT-01`**, kèm câu nói rõ **training vẫn `BLOCKED`** tới khi gate đó đóng; **không** viết theo kiểu ngụ ý split đã ổn; **(c)** comment trả lời **từng** phát hiện F1–F5, F12, F13 theo mẫu *phát hiện → file/dòng đã sửa → lệnh kiểm lại*; **(d)** bỏ draft và nhờ **Hùng Anh** duyệt lại, kèm lệnh tái lập (script QA ở [`../../day06/qa002/`](../../day06/qa002/)) | ~2 h | **không còn chờ ai** — `Q2` đã quyết | #34 hết draft **trước 12:00**, 7 phát hiện có 7 câu trả lời |
| **2** | ✅ **XONG 02:19–02:21** — bạn đã khai 4–5 giờ GPU/ngày không cần trông, sinh ngoại suy cho **4 h/ngày** (7/10 biến thể vừa 6 lượt + 1 ablation trong cửa sổ 10 ngày) và **5 h/ngày** (8/10), `RESULT.md` sinh lại bằng `summarize.py`, #36 chuyển ready và đã nhờ Hùng Anh review. *(Việc gốc: **#36 — điền `C0-7`/`C0-8`**:* số **giờ GPU/ngày** máy bạn thật sự chạy được → chạy lại `extrapolate.py <file> --train-cases 80 --gpu-hours-per-day <số>` → sinh lại bảng + biểu đồ bằng `summarize.py`; xác nhận câu chữ `RESULT.md`. Kèm **khai `started_at` thật của Spike C0** trong một comment (file probe đầu tiên ghi `2026-09-16T00:43:25+07:00`) để Project Control cập nhật state — trường này chỉ chủ spike khai *)* | — | ✅ #36 không còn ô NOT MEASURED. **Còn lại:** khai `started_at` thật của Spike C0 trong một comment (file probe đầu tiên ghi `2026-09-16T00:43:25+07:00`) — Project Control chỉ chuyển state khi #36 merge sau review, không lấy từ mô tả PR |
| **3** | ✅ **XONG 02:20–02:21** — leader squash-merge #17 lúc 02:19 (`8bf1a2f`) và **giữ nhánh**, nên #36/#37 không bị đóng như #28; bạn rebase cả hai lên `main`, diff sạch (chỉ file C0), **CI 4/4 lần đầu** | — | ✅ |
| **4** | **#35 — nhờ Trung review** (vẫn để draft tới khi #34 merge được): ghi trên PR cách tái lập **cho người không có bản ZIP** — `split.py --selftest`, JSON Schema, đếm 80/20/54, luật `DR-002a`, chạy hai lần ra cùng file, `linkage_screen.py --selftest`. Nói rõ phần **`DR-002b`** (việc 6) sẽ vào cùng PR này để Trung review một lượt | ~30 ph | không | yêu cầu review + hướng dẫn trên #35 |

## Việc Day 7

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **5** | **Sửa lỗi validator QA-002 — F6–F11, F14, F15**, mỗi lỗi kèm **một ca kiểm hồi quy** dựng từ kịch bản phá có sẵn ở [`../../day06/qa002/break_validator.py`](../../day06/qa002/break_validator.py): `A9` chỉ so origin (F6) · `A17` dùng danh sách cấm thay vì allowlist (F7) · `A10` không thể FAIL (F8) · `--archive` không băm ZIP (F9) · file ngoài thư mục case và mục ZIP `../` (F10) · direction `NaN`/toàn 0 vẫn PASS (F11) · thành viên ZIP hỏng làm crash sai mã thoát (F14) · `A16`, `A20` không thể FAIL (F15). **PR riêng**, không nhồi vào #34 để không làm chậm lượt duyệt lại | ~3 h | không | PR mới, CI xanh; mỗi phát hiện: trước sửa FAIL, sau sửa PASS |
| **6** | ▶ **`DR-002b` đã quyết 16/09 — phương án (c) + (d)** ([`OPEN_DECISIONS.md`](../../readiness/OPEN_DECISIONS.md) Part 2b). Việc của bạn, đúng thứ tự: **(1)** đề xuất **ngưỡng tương quan** từ phân bố 11 781 cặp bạn đã có — phải bắt được cặp r ≈ 0,996, kèm số cặp/ca bị ảnh hưởng; **(2)** **khai ngưỡng trong split manifest TRƯỚC mọi lượt train** (khai sau là hỏng cả quyết định); **(3)** gom nhóm trong development, nhóm giữ nguyên trong mọi tập con; **(4)** **loại khỏi train** mọi case có điểm với một case holdout vượt ngưỡng — liệt kê mã case + điểm trong `SPLIT_RESULT.md`, kèm **số case train còn lại**; **(5)** một câu giới hạn để mọi báo cáo dùng lại: *tách theo bệnh nhân KHÔNG kiểm chứng được cho bản phát hành này; cái đã làm là tách theo case + gom nhóm theo sàng lọc tương quan*; **(6)** chừa chỗ cho **phân tích độ nhạy** (metric khi bỏ các case nghi ngờ) trong `SPLIT_RESULT.md` để C1 chạy sau. **Không liên hệ ban tổ chức** — leader chưa cho phép | ~2 h | không | #35 cập nhật, Trung review lại |
| **7** | **#35 sau khi #34 merge**: sinh lại split theo SHA manifest mới trên `main`, cập nhật `SPLIT_RESULT.md`, chạy lại selftest → chuyển ready | ~1 h | #34 merge | #35 ready, CI xanh |

> ▶ **`F5` đã quyết 16/09 — thu hẹp** (QA-002 §9): manifest public giữ **mã case · shape/dtype · thống kê tổng hợp · verdict**;
> **bảng SHA-256 từng file và điểm sàng lọc từng cặp chuyển sang manifest hạn chế ngoài repo**, còn manifest public ghi
> **hash của manifest hạn chế + lệnh sinh lại từ ZIP** — đó là thứ giữ tính tái lập. Làm trong **#34** nếu không lỡ mốc
> **12:00**; lỡ thì tách PR riêng, nhưng PR đó **phải merge trước lượt QA soi lại** vì `F5` là phát hiện chặn nghiệm thu.
> ⚠ Kiểm xem `tools/dataset_split/split.py` có dựa vào checksum từng case không — nếu có thì đổi sang manifest hạn chế
> hoặc hash tổng, ghi rõ cách chọn trong PR.

**Tổng phần chính: ~11 h** *(thêm `DR-002b` ~2 h và `F5` ~45 ph)* — việc 5 (lỗi validator) xuống hàng dự phòng nếu cần.

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
