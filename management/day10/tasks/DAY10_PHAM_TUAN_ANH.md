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
| 4 | **M5 có mã thật** — bộ khung `app/` trên `main`, fixture sinh từ hợp đồng, và **bốn PR vertical** (V1, V2, **V3**, V4) chạy được trên fixture đó | cả nhóm | 4 PR mở, CI xanh |

> **Sửa điều kiện 4 — 19/09 03:10.** Bản gốc ghi *"ba PR vertical (V1, V2, V4)"*. Sai: packet của Khánh
> (việc 5) dựng `SCR-01`, tức **V3**. Hôm nay có **bốn** vertical, và bộ khung `app/core` phải phục vụ cả
> nhóm endpoint experiment mà `SCR-07` cần — nó đã được viết theo hướng đó.

⚠ Điều kiện 3 là thứ duy nhất mở khoá cho **cả bốn vertical** cùng lúc. Nếu tới 16:00 Spike B chưa `ACCEPTED`, anh
vẫn viết ADR được **với điều kiện** ghi rõ phần Spike B là `OBSERVED` một phiên — nhưng đó là quyết định của anh,
không phải mặc định.

## ✅ ĐÃ XONG TRONG ĐÊM (02:45 → 04:00) — anh không phải làm lại

| Việc | Kết quả |
|---|---|
| **#31 đã merge vào `main`** (`11000f1`) | Ba xung đột thật trong `App.js` + `README.md`, giải bằng tay: giữ cả brush `S5` lẫn cache `S6`. Kiểm offline trước khi đẩy |
| **Bộ khung `app/core` — PR #48**, nhờ **Khánh** duyệt | 10 script test, **137 kiểm, CI xanh 7/7**. Trung lập nền tảng: không npm, không `package.json`, không React/RN/Flutter — có job CI **từ chối** cả bốn thứ đó. Ba vertical **rẽ nhánh từ nhánh này**, không chờ merge |
| **`app/core/fixtures/FORMAT.md`** | Định dạng bundle cho Trung — **gửi cậu ấy trước khi bàn gì khác sáng nay** |
| **Chặng `S8` cho Spike A — PR #49**, nhờ **Hùng Anh** duyệt | `A8` **trước nay chưa có cài đặt nào**. Giờ có: lưu/nạp lại run-length + checksum, hai script trích xuất, **APK release đã dựng sạch** (65,7 MB) |
| **`A10` đã `OBSERVED`** từ log 15/09 có sẵn | worst-case 22,66 ms / ngưỡng 100 ms, 20 nét, 0 mẫu mất. **Không đụng vào máy** — chỉ là chưa ai từng kết luận nó |
| **Bộ QA-004** trên `main` (`2da85b5`) | Dựng bảng `A1`–`A12` **từ tệp bằng chứng thô**, không từ `RESULT.md`. Hiện: **8 `OBSERVED`**, 4 `NOT MEASURED` (`A1`/`A12` theo thiết kế, `A8`/`A11` chờ phiên đo) |
| **`DR-010a` đã mở** | Không endpoint nào trả "lát cắt tệ nhất" — **cần anh quyết** (khuyến nghị: phương án **(b)**) |

## 🔴 SÁNG — gỡ đường cho người khác trước

| # | Việc | Chờ ai | Xong khi |
|---|---|---|---|
| **1** | **Gửi `app/core/fixtures/FORMAT.md` cho Trung** — 10 phút có đòn bẩy lớn nhất hôm nay. Rồi **nhắc duyệt #47** → **M3 đóng**. CI đã xanh 6/6 từ đêm qua | Trung (15 ph) | M3 `DONE` trong `PROJECT_STATE` |
| **2** | ~~Dựng bộ khung `app/`~~ → **xong, PR #48.** Việc còn lại: **nhờ Khánh duyệt**, và bảo ba người **rẽ nhánh từ `feat/day10-app-core`** ngay, đừng đợi merge | Khánh | #48 merged |
| **3** | ~~Rebase #31~~ → **xong, đã merge** (`11000f1`) | — | ✅ |
| **4** | **Merge #41** khi Hùng Anh duyệt lại bản sửa `741f826` | Hùng Anh | #41 merged |
| **5** | **Nhờ Hùng Anh duyệt #49** (chặng `S8`). Ba câu hỏi đã ghi sẵn trong PR: dependency `expo-file-system`, cách đọc `A10` lấy trên `max`, và ngưỡng cỡ mẫu | Hùng Anh | #49 merged trước phiên đo chiều |

## Chiều

| # | Việc | Chờ ai | Xong khi |
|---|---|---|---|
| **5b** | 🔑 **PHIÊN ĐO `S8` trên A17 — ~45 phút, chỉ anh làm được.** Kịch bản từng bước: [`SESSION_S8.md`](../../../spikes/spike_a_2d/SESSION_S8.md). Lấy `A8` (**bắt buộc có vòng nạp lại NGUỘI sau `force-stop`** — script từ chối kết luận nếu thiếu) và `A11` (≥ 5 lần đặt ngón thứ hai giữa nét). APK release đã dựng sẵn, chỉ việc `adb install -r` | máy trong tay anh | 4 tệp bằng chứng trong `EVIDENCE_RAW/` |
| **5c** | **QA Spike A**: `python management/day10/qa004_spike_a/run_qa004.py` → bảng `A1`–`A12`. Verdict viết tay vào `management/day10/QA_REVIEW_004_SPIKE_A.md`, rồi `ACCEPTED` đủ 4 bước | việc 4 + 5 + 5b | Spike A `ACCEPTED` |
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

| **11** | **Quyết `DR-010a`** — không endpoint nào trả "lát cắt tệ nhất", dù `DR-010` đã đóng băng *"API trả về lựa chọn, client không tự xếp hạng"*. Bốn phương án đã ghi trong `OPEN_DECISIONS.md` Part 2b; khuyến nghị **(b)**: thêm khối `worst_slice_selection` vào `analysis_run_metrics`. `SCR-04` chưa chặn hôm nay, nhưng hợp đồng còn `DRAFT v0` — sửa muộn thành ADR phiên bản | quyết định ghi vào `OPEN_DECISIONS.md` |

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
