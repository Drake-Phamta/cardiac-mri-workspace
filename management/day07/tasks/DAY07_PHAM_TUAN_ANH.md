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
| **1** | **Merge #17** — Khánh `APPROVED` 00:29 sau khi chạy lại trên RTX 4050 (selftest 8/8 + 10/10, UNet 560 batch tối đa 15, DINOv2-S/14 tải được), CI 4/4, mergeable. **Dùng merge commit, KHÔNG xoá nhánh `spike-c0/compute-probe`**: #36 và #37 đang xếp chồng trên nhánh này — xoá nhánh là GitHub tự đóng cả hai, đúng như #28 bị đóng ngày 15/09 | ~5 ph | **Khánh** (#36, #37 chưa có CI) | #17 trên `main`, CI xanh, hai PR con còn mở |
| **2** | **Quyết `Q2`** (QA-002 §9) — mục "split và ID manifest" của `06` §9.1 trong bảng `A19`: **hoãn sang `GATE-SPLIT-01` có ghi** *(đề xuất QA: tránh phụ thuộc vòng — split cần audit, audit lại cần split)* hoặc **sinh lại audit sau khi manifest split merge** | ~10 ph | **Khánh** (việc 1 của cậu ấy) | ghi vào QA-002 §9 + packet Khánh |
| **3** | **Chọn đường dựng stub Spike E.** Trung không có quyền SSH vào Mac mini. **A (đề xuất):** Project Control dựng bằng SSH của anh theo lệnh Trung ghi trên #26 — đúng mô hình `DR-006a` rev 2 (anh vận hành phần cứng, Trung thiết kế và tính số); kèm theo, duyệt **node ZeroTier máy Trung** vào `b103a835d292ddb3` để cậu ấy tự kiểm đúng địa chỉ điện thoại dùng. **B:** cấp khoá SSH cho Trung trên Mac mini — đổi lại là thêm một khoá thành viên vào máy của anh | ~10 ph | **Trung** (điều kiện 2) | ghi vào packet Trung + comment trên #26 |
| **4** | **Duyệt `DEMO_STANDARD.md` v0** (anh hoãn từ hôm qua) và 4 điểm §11: **(1)** duyệt v0 làm chuẩn lập kế hoạch từ hôm nay · **(2)** có muốn **bảng hiệu năng trên màn hình** ở bản cuối không — `10` không có màn này, muốn thì phải qua Decision Request · **(3)** đính chính số đếm trong tài liệu quản lý cũ: 39 yêu cầu / 28 MUST / 69 test → **44 / 33 / 70** · **(4)** hình thức bảo vệ — để lại khi có lịch môn | ~30 ph | cả nhóm (dòng 🎯 mỗi packet) | v0 → v1, hoặc ghi rõ chỗ cần sửa |

## Việc Day 7

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **5** | **Quyết cách xử lý nối bệnh nhân cho `GATE-SPLIT-01`** — bài benchmark của challenge ghi **154 lần chụp từ 60 bệnh nhân**, gói không có ánh xạ; sàng lọc chỉ từ ảnh MRI của Khánh tìm lại được cặp trùng ở hạng 1 nhưng **không chứng minh được danh tính bệnh nhân** (#35). Project Control soạn **Decision Request** với các phương án trước 12:00, Khánh góp ý chuyên môn, anh quyết trong ngày. **Không liên hệ ban tổ chức nếu anh chưa đồng ý** | ~1 h | Project Control (bản thảo), Khánh (ý kiến) | quyết định ghi trong `OPEN_DECISIONS.md` |
| **6** | **Phán phần còn lại của `F5`** — phạm vi siêu dữ liệu từng case được để trong repo public; Khánh đã trích điều khoản CAP §§6–7 trong `POLICY_EVIDENCE.md` (#34). Quyết luôn chỗ để JSON điểm sàng lọc liên kết (đang giữ ngoài repo) | ~30 ph | Khánh (#34) | ghi trên #34 + QA-002 §9 |
| **7** | **Xác nhận recovery khi buffer −1** — giữ kế hoạch như quyết định 13/09, hay áp Level 1–3 của `15` §18. Đề xuất của Project Control (chỉ Level 1, không chuyển quyền sở hữu) ở [`../../day06/DAY06_EOD_REVIEW.md`](../../day06/DAY06_EOD_REVIEW.md) §11 | ~15 ph | — | ghi vào `PROJECT_STATE.recovery` |
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
