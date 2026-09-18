# DAY 10 — Bế Quốc Khánh · 2026-09-19

**Khối lượng hôm nay:** phần chính **≥ 8 h** *(bảng dưới cộng ~8 h)* · hàng đợi dự phòng ~2 h · **hạn: 23:59**.

> **Spike D của bạn là `ACCEPTED` đầu tiên của cả dự án.** #34 merge 21:30, QA-003 chạy lại **trên `main`** và `PASS`:
> cả năm lỗi chặn F1–F5 của QA-002 được kiểm từng cái trên file thật, `break_validator` ra đúng 6 DEFECT / 0 ZIPSLIP,
> cặp trùng `CASE_0056`/`CASE_0097` tái lập độc lập từ ZIP, train hiệu dụng 78 tái lập. **`GATE-DATA-01` đóng sau 9 ngày.**
>
> Và bản sửa #37 của bạn khớp tới từng chữ số khi leader chạy lại trên GPU khác. Hai PR merge trong ngày.
>
> **Hôm nay bạn giữ cổng cuối chặn `SPIKE_C1`.** Split sinh lại là việc chặn Trung, chặn cổng, chặn cả M4 — làm trước.

## 📌 Mới — quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng tới bạn |
|---|---|
| **Day 9 chốt `TRƯỢT` 1,5/4**, buffer **−2** | Điều kiện 3 trượt chỉ vì split chưa sinh lại. Đó là việc 1 hôm nay |
| **Spike D `ACCEPTED`, `GATE-DATA-01` `CLOSED`** | Preflight C1 của bạn nay kiểm được điều kiện đó **thật** thay vì mô phỏng |
| **M5 bắt đầu bằng mã thật hôm nay** | Việc 5: PR hiện thực đầu tiên của V3 trên fixture sinh từ hợp đồng |

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **1** | **Sinh lại split trên manifest `main` mới rồi đưa #35 hết nháp.** SHA manifest đã đổi sau khi #34 merge. Cập nhật `SPLIT_RESULT.md` với định nghĩa **bắc cầu** bạn đã thống nhất hôm qua (5 cặp trên ngưỡng · 4 nhóm trong cùng phân vùng · 3 thành phần toàn đồ thị), rồi nhờ Trung duyệt lại. **`GATE-SPLIT-01` đóng trên PR này, và nó đang chặn `SPIKE_C1`** | ~1,5 h | không | #35 ready, Trung duyệt lại, leader merge |
| **2** | **PR follow-up #34** như đã hẹn: ① `anomalies` và `package_findings` vào khối `summary` (`F13` — số anomaly đi 0 → 2 → 4 mà `summary` không đổi một chữ số) · ② thay `<private ZIP path>` bằng **lệnh đã thật sự chạy** (`F12`) · ③ **QA đề nghị thêm**: verdict `A11` hiện chỉ dẫn "khác SHA-256", nên bổ sung phép đo trực tiếp *`laendo` không chồng `lawall`* ở 154/154 như QA-002 đã đo | ~1 h | không | PR riêng, CI xanh |

## Việc Day 10

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **3** | **`c1_preflight.py`** theo §1 của `C1_MEASUREMENT_PLAN.md` (đã merge ở #42): sinh `c1_preflight_<ts>.json` kiểm Spike D `ACCEPTED`, hai cổng, manifest trên `main`, hash (manifest công khai · màn sàng lọc hạn chế · code · preprocessing · **`torch`/`transformers`/`huggingface_hub`/cuDNN**), subset **20/38/78**, `CASE_0117`/`CASE_0133` vắng mặt, và **`validation_paths_resolved: 0`, `holdout_paths_resolved: 0`** bằng cách thử phân giải thật dưới data root. **Phải có ca kiểm `FAIL` khi một cổng còn mở** | ~2 h | máy RTX 4050 của bạn, ZIP local | Script + ca kiểm `FAIL`, trên PR |
| **4** | **Chạy preflight thật rồi bắt đầu `C1-1`** ngay khi `GATE-SPLIT-01` đóng: xác nhận hoặc sửa lại C0 trên **dữ liệu thật**, chỉ subset train hiệu dụng, **không mở nhãn 54 case holdout**. Dùng dung sai đã chốt ở kế hoạch: 5e-5 cho loss, 5e-4 cho Dice | ~2 h | việc 1 + Trung duyệt + leader merge. Chưa đóng cổng thì làm việc 5 trước | `c1_preflight_<ts>.json` `PASS` + bản ghi `C1-1` |
| **5** | **PR hiện thực đầu tiên của V3 — `SCR-01` Study Overview**, trong bộ khung `app/` leader tạo sáng nay, chạy trên **fixture sinh từ hợp đồng** (việc 6 của Trung): danh sách cohort với **N hiển thị cùng mọi con số**, bảng model × fraction, nhãn **"không so được"** cho run khác quần thể, và ba trạng thái `10` §8 | ~1,5 h | fixture (Trung) · bộ khung `app/` | PR mở, CI xanh, chạy trên fixture |

**Tổng phần chính: ~8 h.**

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **H1, H2, H10 / SCR-01, SCR-07**: mọi con số trên
> màn hình có **N** và truy được về artifact sinh ra nó; run không so được thì **hiện nhãn**, không lặng lẽ ẩn. Giảng
> viên sẽ bấm vào một outlier và hỏi nó đến từ đâu — `DR-002b` và preflight của việc 3 là câu trả lời.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **`C0-3` — tìm trần batch thật** cho các biến thể đang ghi `16 (cap)` | ~1 h | commit trên nhánh C0 |
| **Cập nhật gói `TC-TEAM-001` V3** với `SCR-01` vừa dựng và số C1 đầu tiên nếu có | ~1 h | gói V3 cập nhật |

---

**Ranh giới không đổi:** `SPIKE_C1` chỉ được chạy **sau khi cả hai cổng đóng**; **không mở nhãn holdout** · không commit
byte dataset · **không commit điểm tương quan từng cặp** (`DR-002b` × `F5`) · không tự chuyển `ACCEPTED`.
**Liên quan:** PR #35 · [`../day09/QA_REVIEW_003_SPIKE_D_FINAL.md`](../day09/QA_REVIEW_003_SPIKE_D_FINAL.md) ·
[`../day09/DAY09_EOD_REVIEW.md`](../day09/DAY09_EOD_REVIEW.md)
