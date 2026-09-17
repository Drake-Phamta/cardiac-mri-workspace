# DAY 9 — Phạm Tuấn Anh · 2026-09-18

**Khối lượng hôm nay:** **không giới hạn giờ**: duyệt, merge, QA chốt, đóng cổng, hai phiên đo trên máy, V1, chốt ngày.
Thành viên: **≥ 8 h** việc thật + ~2 h dự phòng, hạn **23:59**.

> **Day 8 anh chốt `ĐẠT` 4/4 đúng hạn**: [`../../day08/DAY08_EOD_REVIEW.md`](../../day08/DAY08_EOD_REVIEW.md). Buffer giữ
> **−1**. Nhưng critical path dừng ở **lượt duyệt lại #34**, ngày thứ hai liên tiếp dừng đúng ở một lượt review.
>
> **Ba mốc chồng lên nhau hôm nay:** **M3 hết hạn** (còn #39, #43, #45 chưa merge, và #43/#45 mâu thuẫn chuỗi phiên bản) ·
> **M4** cần đóng `GATE-DATA-01` và `GATE-SPLIT-01` để `SPIKE_C1` được chạy · **M5 bắt đầu** trong khi `GATE-MOB-01`
> chưa thể đóng.

## 📌 Ba quyết định anh đưa ra trước khi lập kế hoạch

| Quyết định | Ghi ở | Ai bị ảnh hưởng |
|---|---|---|
| **`GATE-MOB-01` đi hướng RN + WebGL2 trong WebView**: đo `B10`/`B11` trong WebView của app Spike A, tái dùng viewer Spike B. Đây là **hướng đo**, **chưa phải `TECH_STACK_ADR`** | `OPEN_DECISIONS` | Hùng Anh (đóng gói viewer), Trung (duyệt #44), anh (bấm) |
| **#34 đóng băng ở `f118491`**; hai việc nhỏ của Khánh đi PR riêng sau merge | `PROJECT_STATE` | Khánh, Hùng Anh |
| **SCR-04 (Error Inspector) giao cho V1**, tức anh | `OPEN_DECISIONS` `DR-013`, `DEMO_STANDARD` | anh (thêm UC-05, TC-ERR-001…003) |

## Điều kiện để Day 9 không trượt

| # | Điều kiện | Ai | Xong khi |
|---|---|---|---|
| 1 | **`GATE-DATA-01` đóng.** Duyệt lại #34 **trước 11:00** → merge → QA-003 chốt → Spike D `ACCEPTED` | Hùng Anh → anh | Cổng ghi `CLOSED` |
| 2 | **M3 đóng.** #43, #45, #39 **merge** với **một** chuỗi phiên bản `dr008a-dr012/v1.0.0`; test của cả bốn hợp đồng chạy trong CI | Trung · Hùng Anh · anh | 3 merge + CI có job hợp đồng |
| 3 | **`GATE-SPLIT-01` đóng.** Định nghĩa nhóm bắc cầu, sinh lại split trên manifest mới, Trung duyệt lại, merge #35 | Khánh → Trung → anh | Cổng ghi `CLOSED` |
| 4 | **Bằng chứng `GATE-MOB-01` cho ứng viên duy nhất.** `B10`/`B11` đo trên A17 **trong WebView của app RN**, có JSON thô và diễn giải của chủ Spike B | Hùng Anh · anh (bấm) | Evidence + mục trong `RESULT.md` Spike B |

⚠ Điều kiện 3 phụ thuộc điều kiện 1, nên #34 hẹn **11:00** chứ không phải 12:00.

## 🔴 SÁNG — gỡ đường cho người khác

| # | Việc | Chờ ai | Xong khi |
|---|---|---|---|
| **1** | **Duyệt lại #45 và #39** (bản sửa của Trung lúc 22:14–22:15): kiểm hai chỗ sập `null`, validator có nạp `schema.json`, luật theo endpoint | không | approve, hoặc yêu cầu sửa trước 10:00 để Trung còn cả ngày |
| **2** | **Review #37, #42, #33**, nhận từ Hùng Anh để gỡ nút thắt. #37 là tiên quyết của preflight C1 | không | review có nội dung trên cả ba |
| **3** | **Khi Hùng Anh approve #34:** merge → **QA-003 chốt** trên head đã merge (chạy đủ bộ, gồm `duplicate_mask_pair.py` và `verify_dr002b.py` băm lại từ ZIP) → Spike D `ACCEPTED` sau đủ 4 bước (chủ spike · reviewer `APPROVE` · QA `PASS` · Project Control) → **đóng `GATE-DATA-01`**, gỡ `BLOCKED` cho `SPIKE_C1` | Hùng Anh (hẹn 11:00) | `PROJECT_STATE`: cổng `CLOSED`, Spike D `ACCEPTED` |
| **4** | **Merge #43** (sau khi Hùng Anh sửa), **#45**, **#39** → ghi **M3 đóng**. **Merge #26** khi Hùng Anh approve. Nhớ: merge commit, grep từ khoá đóng PR trước | Hùng Anh, Trung | 4 merge, CI xanh |
| **5** | **Khi Trung duyệt lại #35:** merge → **đóng `GATE-SPLIT-01`** | Khánh → Trung | cổng `CLOSED` |

## Chiều

| # | Việc | Cần quyền gì | Xong khi |
|---|---|---|---|
| **6** | **14:00 ±15 — đo `E8` ban ngày cho Trung** (tuỳ chọn). Dùng stub hai profile trên Mac mini; kiểm sức khoẻ là **địa chỉ + HTTP 200 từ điện thoại + peer `DIRECT`**, không phải PID | **SSH Mac mini + điện thoại**, chỉ anh có | JSONL thô trên nhánh evidence Spike E, chuyển Trung |
| **7** | **Project Control dựng container WebView** trong app Spike A: thêm `react-native-webview`, một màn mới nạp URL viewer của Hùng Anh qua `adb reverse`, bắt `postMessage` về logcat; build release **trước 16:00**. Anh duyệt diff | điện thoại (cài APK) | APK cài được, màn WebView mở viewer |

## Tối

| # | Việc | Cần quyền gì | Xong khi |
|---|---|---|---|
| **8** | **~20:00 — phiên đo `B10`/`B11` trong WebView** theo protocol của Hùng Anh (hẹn 18:00). Số do script bắt; JSON thô chuyển Hùng Anh diễn giải, **anh không diễn giải hộ** | điện thoại | JSON thô committed trên nhánh evidence Spike B |
| **9** | **V1: gói `TC-TEAM-001`** cho **SCR-03 và SCR-04 mới nhận** (UC-03/04/05; TC-MRI-001…003, TC-MASK-001/003, **TC-ERR-001…003**, TC-PERF-001) · **ma trận trạng thái SCR-03/SCR-04** theo `10` §8 (trung lập công nghệ) | không | file `management/evidence/TC_TEAM_001_PHAM_TUAN_ANH.md` |
| **10** | **Chốt Day 9** | — | `DAY09_EOD_REVIEW.md` |

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **H3–H5 / SCR-03, SCR-04**: chuyển lát cắt tức thì
> (`A9` 50,84 ms trong cửa sổ ±3 đã có số), overlay dự đoán / ground truth / lỗi **thẳng hàng qua zoom-pan**, chú giải
> giải thích **từng lớp lỗi** và không chỉ dựa vào màu. SCR-04 giờ là của anh.

## Hàng đợi dự phòng

- **Duyệt lại #31**, và **nhờ Hùng Anh duyệt #41** nếu anh ấy chưa kịp. Cả hai nằm trên đường Spike A `ACCEPTED`
  → `GATE-MOB-01`.
- **Cửa sổ cache có giới hạn thật cho Spike A**: chặn **chính cache ảnh** (Fresco), vì `S6` chứng minh cửa sổ ở
  tầng component không đủ.

---

**Ranh giới không đổi:** không sửa `docs/specs/v1.0/**` · **không viết `TECH_STACK_ADR.md`** (`GATE-MOB-01` còn mở) ·
không tính số `B` thay Hùng Anh, số `E` thay Trung · không chuyển `ACCEPTED` ngoài 4 bước · không merge PR chưa approve,
không tự approve PR của chính mình · không commit điểm tương quan từng cặp · không dùng từ khoá đóng PR · **không lệnh
xoá** khi chưa xác nhận. **Liên quan:** PR #26 · #31 · #33 · #34 · #35 · #37 · #39 · #41 · #42 · #43 · #44 · #45
