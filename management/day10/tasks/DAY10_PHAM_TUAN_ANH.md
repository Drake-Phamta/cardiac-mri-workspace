# DAY 10 — Phạm Tuấn Anh · 2026-09-19

**Khối lượng hôm nay:** **không giới hạn giờ**: merge, nghiệm thu hai spike, viết ADR nền tảng, dựng bộ khung sản phẩm, chốt ngày.
Thành viên: **≥ 8 h** việc thật + ~2 h dự phòng, hạn **23:59**.

> **Day 9 chốt `TRƯỢT` 1,5/4**, buffer **−1 → −2**. Nhưng ngày đó đưa được `GATE-DATA-01` qua đích sau 9 ngày và cho
> dự án cái `ACCEPTED` đầu tiên. Ba điều kiện còn lại đều dừng ở **một lượt duyệt hoặc một lượt sinh lại**, không phải ở
> khối lượng công việc.

## ⚠ Bức tranh 21 ngày còn lại — vì sao hôm nay phải là ngày của `app/`

| Sự thật | Hệ quả |
|---|---|
| **Hết 9/30 ngày, `app/` chưa tồn tại.** Repo mới có `spikes/`, `contracts/`, `tools/`, `management/` | M5 (Day 9–20) trên giấy đã chạy 1 ngày mà chưa có dòng mã sản phẩm nào |
| **`MUST` `ACCEPTED`: 0/33** | M8 đòi **toàn bộ MUST** xanh trong Day 25–28 |
| **M2 quá hạn từ Day 6** — `GATE-MOB-01` mở vì Spike A và Spike B chưa `ACCEPTED` | Chưa có `TECH_STACK_ADR` thì mọi vertical đang dựng trên giả định |
| **M6 (Day 12–22)** cần `SPIKE_C1` chạy được | `C1` chỉ chạy sau `GATE-SPLIT-01`, tức hôm nay |

**Kết luận đưa vào điều kiện hôm nay:** đóng nốt M3, đóng `GATE-SPLIT-01`, **nghiệm thu Spike A và Spike B để viết
`TECH_STACK_ADR`**, và **mở `app/` với ba PR vertical đầu tiên**. Sau hôm nay, mỗi ngày còn lại là ngày viết sản phẩm.

## Điều kiện để Day 10 không trượt

| # | Điều kiện | Ai | Xong khi |
|---|---|---|---|
| 1 | **M3 đóng** — #47 được duyệt và merge; CI chạy test của cả bốn hợp đồng trên `main` | Trung → anh | `milestones.M3: DONE` |
| 2 | **`GATE-SPLIT-01` đóng** — #35 sinh lại trên manifest mới, Trung duyệt lại, merge; `SPIKE_C1` hết `BLOCKED` và preflight chạy thật | Khánh → Trung → anh | cổng ghi `CLOSED` |
| 3 | **`GATE-MOB-01` đóng** — Spike A **và** Spike B đều `ACCEPTED` qua đủ 4 bước, rồi anh viết `TECH_STACK_ADR.md` | Hùng Anh · Trung · anh | cổng `CLOSED`, M2 đóng |
| 4 | **M5 có mã thật** — bộ khung `app/` trên `main`, fixture sinh từ hợp đồng, và **ba PR vertical** (V1, V2, V4) chạy được trên fixture đó | cả nhóm | 3 PR mở, CI xanh |

⚠ Điều kiện 3 là thứ duy nhất mở khoá cho **cả bốn vertical** cùng lúc. Nếu tới 16:00 Spike B chưa `ACCEPTED`, anh
vẫn viết ADR được **với điều kiện** ghi rõ phần Spike B là `OBSERVED` một phiên — nhưng đó là quyết định của anh,
không phải mặc định.

## 🔴 SÁNG — gỡ đường cho người khác trước

| # | Việc | Chờ ai | Xong khi |
|---|---|---|---|
| **1** | **Merge #47 ngay khi Trung approve** → **M3 đóng**. CI đã xanh 6/6 từ đêm qua | Trung (15 ph) | M3 `DONE` trong `PROJECT_STATE` |
| **2** | **Dựng bộ khung `app/` trước 11:00** — đây là việc chặn cả ba người. Tối thiểu: cấu trúc thư mục theo vertical, một client đọc **fixture** (không gọi mạng), khung màn hình rỗng cho `SCR-01`, `SCR-03`, `SCR-05`, `SCR-06`, và **một job CI chạy test của `app/`**. Chọn nền tảng theo `TECH_STACK_ADR`; nếu ADR chưa viết xong thì dựng phần **trung lập** (client + fixture + test) trước | không | `app/` trên `main`, CI xanh |
| **3** | **Rebase #31 lên `main`** (giữ nguyên byte bằng chứng) rồi nhờ Hùng Anh xác nhận, merge | Hùng Anh | #31 merged |
| **4** | **Merge #41** khi Hùng Anh duyệt lại bản sửa `741f826` | Hùng Anh | #41 merged |
| **5** | **QA Spike A** rồi chuyển `ACCEPTED` đủ 4 bước: chạy lại `check_conformance.py`, `test_viewer_math.mjs`, `test_brush.mjs`, đối chiếu từng số `A2`/`A3`–`A7`/`A9` trong `RESULT.md` với JSON thô đã commit; ghi verdict vào `management/day10/QA_REVIEW_004_SPIKE_A.md` | việc 3 + 4 | Spike A `ACCEPTED` |

## Chiều

| # | Việc | Chờ ai | Xong khi |
|---|---|---|---|
| **6** | **Merge #35 khi Trung duyệt lại** → **đóng `GATE-SPLIT-01`** → gỡ `BLOCKED` cho `SPIKE_C1`, báo Khánh chạy preflight thật | Khánh → Trung | cổng `CLOSED` |
| **7** | **Merge #44 và nhánh bằng chứng Spike B** khi Trung duyệt; **QA Spike B** (soát 3 lượt probe, `PROVENANCE`, nhãn trong `RESULT.md`) rồi chuyển `ACCEPTED` | Hùng Anh · Trung | Spike B `ACCEPTED` |
| **8** | **Viết `TECH_STACK_ADR.md`** — chỉ sau khi A và B `ACCEPTED`. Phải có: ứng viên đã đo, số liệu dẫn nguồn (`A9` 50,84 ms trong cửa sổ · `A2` 16/16 checksum · `B10`/`B11` của Hùng Anh · `A12` chi phí dựng), **giới hạn** (mới một ứng viên được dựng, chưa so với Flutter/Kotlin), và điều kiện xét lại | việc 5 + 7 | `GATE-MOB-01` `CLOSED`, M2 đóng |

## Tối

| # | Việc | Xong khi |
|---|---|---|
| **9** | **PR hiện thực đầu tiên của V1 — `SCR-03`**: hiển thị lát cắt từ fixture, `slice n / total`, chuyển lát bằng slider và vuốt, overlay bật/tắt + độ mờ, và ba trạng thái `10` §8. Chạy trên fixture của Trung, không backend thật | PR mở, CI xanh |
| **10** | **Chốt Day 10** — `DAY10_EOD_REVIEW.md`, cập nhật `DAY_LOG`, `PROJECT_STATE`, bảng | bản chốt 14 mục |

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **H3–H5 / SCR-03, SCR-04**: chuyển lát tức thì,
> overlay thẳng hàng qua zoom-pan, chú giải giải thích **từng lớp lỗi** và không chỉ dựa vào màu. Hôm nay là ngày đầu
> tiên hook đó tồn tại dưới dạng mã chứ không phải thiết kế.

## Hàng đợi dự phòng

- **Trả `screen_off_timeout` về mặc định** trên A17 (đang để 30 phút từ phiên `S6` 17/09).
- **Quyết cách tái lập bản gộp `main`+#44** đã dùng cho phiên đo: sau khi Hùng Anh merge `main` vào #44 thì ghi lại
  commit chuẩn vào `PROVENANCE` của nhánh bằng chứng.
- **Dọn worktree scratchpad** đã dùng trong hai ngày qua — **chỉ khi anh xác nhận từng cái**.

---

**Ranh giới không đổi:** `TECH_STACK_ADR` chỉ viết **sau** khi A và B `ACCEPTED` · không tính số `B` thay Hùng Anh,
số `E` thay Trung · không chuyển `ACCEPTED` ngoài 4 bước · **không merge PR chưa approve, không tự approve PR của
chính mình** — #47 hôm qua là ví dụ · không commit byte dataset hay điểm tương quan từng cặp · không dùng từ khoá
đóng PR · **không lệnh xoá** khi chưa xác nhận. **Liên quan:** PR #26 · #31 · #33 · #35 · #41 · #44 · #46 · #47
