# DAY 7 — Phạm Tuấn Anh · 2026-09-16

**Khối lượng hôm nay:** **không giới hạn giờ** — quyết định, review, merge, buổi đo tối và chốt ngày. Thành viên:
**≥ 8 h** việc thật + ~2 h dự phòng, hạn **23:59**.

> **Day 6 chốt CHƯA ĐẠT 3/4 theo quyết định của anh** — [`../../day06/DAY06_EOD_REVIEW.md`](../../day06/DAY06_EOD_REVIEW.md).
> Điều kiện 2 (Khánh) tính **đạt muộn** theo quyết định "cho qua"; điều kiện 3 (Trung) trượt vì stub không dựng được —
> Project Control giao việc mà không kiểm quyền SSH. **Buffer 0 → −1**, lần đầu âm.
>
> **Hôm nay ba quyết định buổi sáng của anh mở khoá cho cả ba thành viên** (Q2 → bảng `A19` của Khánh; đường dựng stub →
> buổi đo tối; merge #17 → hai PR bằng chứng C0 của Khánh có CI). Critical path: **#34 ready trước 12:00 → Hùng Anh duyệt
> lại → merge → QA soi lại → `GATE-DATA-01`**.

## 🔴 LÀM TRƯỚC — việc đang giữ người khác (hẹn trước 10:00)

| # | Việc | Giờ | Giữ ai | Xong khi |
|---|---|---|---|---|
| **1** | ✅ **XONG 02:19 — `8bf1a2f` (squash), nhánh `spike-c0/compute-probe` giữ nguyên**, nên #36 và #37 không bị đóng; Khánh đã rebase cả hai lên `main` lúc 02:20–02:21 và CI chạy lần đầu, 4/4. *(Việc gốc: **merge #17** — Khánh `APPROVED` 00:29 sau khi chạy lại trên RTX 4050 (selftest 8/8 + 10/10, UNet 560 batch tối đa 15, DINOv2-S/14 tải được), CI 4/4, mergeable. **Dùng merge commit, KHÔNG xoá nhánh `spike-c0/compute-probe`**: #36 và #37 đang xếp chồng trên nhánh này — xoá nhánh là GitHub tự đóng cả hai, đúng như #28 bị đóng ngày 15/09 )* | — | **Khánh** (#36, #37) | ✅ #17 trên `main`, hai PR con còn mở và đã có CI |
| **2** | ✅ **XONG 16/09 — `Q2` = hoãn có ghi** (bảng `A19` ghi mục split là hoãn sang `GATE-SPLIT-01`, kèm câu training vẫn `BLOCKED`); đã ghi vào QA-002 §9 và packet Khánh. *(Việc gốc: **quyết `Q2`** — QA-002 §9 — mục "split và ID manifest" của `06` §9.1 trong bảng `A19`: **hoãn sang `GATE-SPLIT-01` có ghi** *(đề xuất QA: tránh phụ thuộc vòng — split cần audit, audit lại cần split)* hoặc **sinh lại audit sau khi manifest split merge** )* | — | **Khánh** (việc 1 của cậu ấy) | ✅ đã ghi |
| **3** | ✅ **XONG 16/09 — chọn phương án A**: Project Control dựng stub bằng SSH của anh theo lệnh Trung ghi; Trung giữ thiết kế, phép kiểm và mọi con số `E`. *(Việc gốc: **chọn đường dựng stub Spike E** — Trung không có quyền SSH vào Mac mini. **A (đề xuất):** Project Control dựng bằng SSH của anh theo lệnh Trung ghi trên #26 — đúng mô hình `DR-006a` rev 2 (anh vận hành phần cứng, Trung thiết kế và tính số); kèm theo, duyệt **node ZeroTier máy Trung** vào `b103a835d292ddb3` để cậu ấy tự kiểm đúng địa chỉ điện thoại dùng. **B:** cấp khoá SSH cho Trung trên Mac mini — đổi lại là thêm một khoá thành viên vào máy của anh )* | — | **Trung** (điều kiện 2) | ✅ đã ghi vào packet Trung; PC dựng trước 14:00 |
| **4** | ✅ **XONG 16/09 — duyệt thành v1** và **đính chính số đếm 44 / 33 / 70**; bảng hiệu năng trên màn hình để mở (muốn có phải qua Decision Request), hình thức bảo vệ để sau. *(Việc gốc: **duyệt `DEMO_STANDARD.md` v0** và 4 điểm §11: **(1)** duyệt v0 làm chuẩn lập kế hoạch từ hôm nay · **(2)** có muốn **bảng hiệu năng trên màn hình** ở bản cuối không — `10` không có màn này, muốn thì phải qua Decision Request · **(3)** đính chính số đếm trong tài liệu quản lý cũ: 39 yêu cầu / 28 MUST / 69 test → **44 / 33 / 70** · **(4)** hình thức bảo vệ — để lại khi có lịch môn )* | — | cả nhóm (dòng 🎯 mỗi packet) | ✅ v1 + `ERRATUM_COUNTS_2026_09_16.md` |

## Việc Day 7

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **5** | ✅ **XONG 16/09 — `DR-002b` = phương án (c) + (d)**: gom nhóm theo ngưỡng khai trước mọi lượt train · loại khỏi train case nghi trùng bệnh nhân với holdout · ghi rõ giới hạn ở mọi chỗ có số đánh giá · thêm phân tích độ nhạy. **Không liên hệ ban tổ chức** khi anh chưa đồng ý; có ánh xạ thật thì nó thay phần sàng lọc trước khi đóng băng split. *(Bản gốc: (`OPEN_DECISIONS.md` Part 2b, `⏸ PENDING LEADER CONFIRMATION`): 154 lần chụp từ 60 bệnh nhân, gói không có ánh xạ; sàng lọc MRI tìm lại cặp trùng ở hạng 1 nhưng **không chứng minh được danh tính**. Bốn phương án: **(a)** xin ánh xạ từ ban tổ chức *(đúng `06` §6 nhất, nhưng phụ thuộc người ngoài — **chỉ liên hệ khi anh đồng ý**)* · **(b)** ngoại lệ có ghi + gom nhóm theo ngưỡng khai trước · **(c)** = (b) + **loại khỏi train mọi case nghi trùng bệnh nhân với holdout** · **(d)** thêm phân tích độ nhạy. **Project Control đề xuất (c) + (d)** — bảo vệ đúng con số cuối cùng mà báo cáo dựa vào )* | — | Khánh thực hiện | ✅ ghi trong `OPEN_DECISIONS.md` Part 2b |
| **6** | ✅ **XONG 16/09 — `F5` = thu hẹp**: public giữ mã case, shape/dtype, thống kê tổng hợp, verdict `A1`–`A20`; bảng SHA-256 từng file và điểm sàng lọc sang manifest hạn chế ngoài repo, **hash + lệnh sinh lại vẫn công khai**. *(Bản gốc: **giữ public** mã case, shape/dtype, thống kê tổng hợp, verdict `A1`–`A20` · **chuyển sang kênh hạn chế** bảng SHA-256 từng file và điểm tương quan từng cặp — hash của manifest hạn chế và lệnh sinh lại vẫn công khai nên **không mất tái lập**. Lý do: hai PDF chính sách CAP không đủ để khẳng định phạm vi cho phép (`POLICY_EVIDENCE.md`) )* | — | Khánh thực hiện trong #34 | ✅ ghi ở QA-002 §9 |
| **7** | ✅ **XONG 16/09 — giữ kế hoạch, không de-scope, duyệt cả 5 hành động Level 1** (gỡ phụ thuộc quyền cho stub · thứ tự review của Hùng Anh · mốc đẩy 12:00/18:00 cho Khánh · Decision Request split trong ngày · packet ghi rõ việc cần quyền gì). Ghi ở `PROJECT_STATE.recovery.decision_2026_09_16` | — | — | ✅ |
| **8** | **Stub Spike E** (nếu chọn phương án A): Project Control dựng **trước 14:00** theo lệnh Trung ghi trên #26 — anh duyệt lệnh trước khi chạy; output dán lên #26 để Trung xác nhận trước 20:30 | ~30 ph | Trung (lệnh), anh (duyệt) | `/health` + HEAD hai profile có `Content-Length` khác nhau |
| **9** | **Đo Spike E khung 21:00** — hai profile theo kế hoạch của Trung (#26), Wi-Fi + ZeroTier, ghi `E12` `DIRECT`; `adb pull` + log stub nguyên byte + `PROVENANCE.md` theo mẫu lượt 4 | ~1,5 h | Trung xác nhận stub trước 20:30 | dữ liệu thô trên nhánh `spike-e/evidence-20260916` |
| **10** | **Merge theo thứ tự khi đủ điều kiện**: #24 *(Trung đổi base #33 sau đó)* → #26 → #34 khi Hùng Anh approve → **QA soi lại Spike D** (phiên độc lập) → `PASS` thì Project Control chuyển `ACCEPTED`, đóng `GATE-DATA-01`, gỡ `BLOCKED` cho `SPIKE_C1`; `REJECT` thì trả Khánh. #29/#30 merge khi Trung duyệt lại | ~2 h | Hùng Anh, Trung | CI xanh sau mỗi merge |
| **11** | **Chốt Day 7** | ~1 h | — | `DAY07_EOD_REVIEW.md` |

> **🎯 Chuẩn demo** — [`../../DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **D1** *(mọi thứ giảng viên thấy phải chạy thật
> trên Galaxy A17 với bản release — buổi đo tối nay và Spike A đang đi đúng luật này)* · **D4 / H8** *(nét brush sau zoom
> rơi đúng pixel nguồn: `A5` 60/60 ở r = 0 và r = 2 chính là bằng chứng của bước demo đó, và dựng lại được trước mặt giảng
> viên)* · **D5** *(số hiệu năng lấy từ bằng chứng thô, không phải lượt chạy đẹp nhất)*. Duyệt v0 hôm nay để từ Day 8 mọi
> dòng 🎯 trong packet bám vào một bản đã được anh chốt.

## Hàng đợi dự phòng

- **Review PR #32** — hợp đồng ingestion 1 của Trung; chưa ai được nhờ review và khối *Integration / cross-contract* là của
  anh *(~1 h)*.
- **Spike A:** đo lại `A9` với **cache giới hạn ±3 slice** — từ phát hiện bộ nhớ 376 MB cho 88 slice *(~1,5 h, cần máy)*.

---

**Ranh giới không đổi:** không tính số `E` thay Trung, không tính số `B` thay Hùng Anh, không chạy C0 thay Khánh; không
merge PR chưa có reviewer `APPROVE`; không chạm `docs/specs/v1.0/**`; không commit byte dữ liệu; commit trên `main` không
dùng từ khoá đóng PR. **Liên quan:** PR #17 · #24 · #26 · #27 · #31 · #32 · #34 · #35 · #36 · #37 ·
[`../../day06/DAY06_EOD_REVIEW.md`](../../day06/DAY06_EOD_REVIEW.md) · `PROJECT_STATE.yaml` → `gates.GATE-SPLIT-01`
