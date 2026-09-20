# DAY 11 — Phạm Tuấn Anh · 2026-09-20

**Gói lập lúc 17:50**, còn ~6 giờ. Buffer **−3**, `MUST` **0/33**, còn **20 ngày**.

> **Chẩn đoán Day 10, đúng nguyên nhân:** không thiếu năng lực — **thiếu lượt duyệt**. Năm PR CI xanh chờ
> đúng hai review. Ngày hôm qua là ngày có nhiều tiến bộ kỹ thuật nhất của dự án và **gần như không gì lên
> được `main`**. Vì vậy hôm nay không thêm việc mới; hôm nay **mở van**.

## ✅ Đã làm trước khi gói này viết *(17:44 → 17:55)*

| Việc | Vì sao ngay |
|---|---|
| **Gắn reviewer cho #41, #50, #51, #52** | Bốn PR **không có reviewer nào** — vô hình trong hàng đợi. #47 hôm qua trượt M3 đúng vì vậy |
| **`RESULT.md` Spike A cập nhật kết quả `S8`** (`a970167`) | Bước 1 `acceptance_workflow`. File còn ghi `A8`/`A10`/`A11` là `NOT MEASURED` — **Hùng Anh sẽ không có gì để duyệt** |

---

## 🔴 Tối nay — theo thứ tự

| # | Việc | Chờ ai | Xong khi |
|---|---|---|---|
| **1** | **Nhắn ba người**: thứ tự hôm nay là **duyệt trước, việc mình sau**. Ba tin đã soạn sẵn ở §Tin nhắn | — | 5 phút |
| **2** | **Merge #48** ngay khi Khánh duyệt → đổi base **#50** sang `main` → **anh duyệt** → merge → **#51** → **#52** | Khánh (~30 ph) | **M5 lần đầu có mã trên `main`** |
| **3** | **Merge #41 và #49** khi Hùng Anh duyệt → Spike A **`EVIDENCE_READY`** | Hùng Anh (~1 h) | hai PR merged |
| **4** | Khi Trung ký QA-004 → **chuyển `SPIKE_A: ACCEPTED`** (chỉ bước 4) | việc 3 + Trung | `SPIKE_PHASE_STATE.yaml` |
| **5** | **Merge #35** khi Khánh bỏ nháp và Trung duyệt lại → **`GATE-SPLIT-01` `CLOSED`** → gỡ `BLOCKED` cho `SPIKE_C1` | Khánh → Trung | cổng `CLOSED` |
| **6** | **Quyết `DR-010a`** *(~10 phút)* — khuyến nghị **(b)**: thêm khối `worst_slice_selection` vào `analysis_run_metrics` | — | ghi vào `OPEN_DECISIONS.md` |
| **7** | **Chốt Day 11 trước 23:59** — `DAY11_EOD_REVIEW.md`, `DAY_LOG`, `PROJECT_STATE`, bảng | — | 14 mục |

> ⚠ **Merge đúng thứ tự `#48 → #50 → #51 → #52`.** Chồng tuyến tính, `merge-tree` báo gộp sạch, nhưng
> `delete_branch_on_merge = false` nên GitHub **không tự đổi base** — phải đổi tay sang `main` sau mỗi lần
> merge. Nhánh bị xoá là đúng cách #28 bị auto-close hôm 15/09.

---

## Quyết định chỉ anh ra được

**Spike A sẽ `ACCEPTED` với `A1` và `A12` còn "một phần".**

- `A1` — `n / total` đúng, 16 slice điều hướng được, nhưng vế *"exact match to fixture"* **chưa kiểm theo
  pixel**: React Native `Image` nội suy bilinear và không có nearest-neighbour, nên so pixel ngây thơ sẽ
  trượt **vì bộ lọc hiển thị chứ không phải vì dữ liệu sai**. Cần một cách kiểm ở tầng dữ liệu.
- `A12` — mới dựng **một** ứng viên. Chưa so sánh được với Flutter hay Kotlin native.

**Nhận kèm hai hạn chế ghi rõ, hay giữ `EVIDENCE_READY`?** Ghi câu trả lời vào QA verdict, đừng để nó
lặng lẽ tính là đạt.

---

## Tin nhắn — soạn sẵn, anh gửi

> **Khánh:** "Việc số một hôm nay là **duyệt #48** (~30 ph). Nó là đáy của chồng tuyến tính
> #48→#50→#51→#52, ba cái trên đều CI xanh — **một lượt duyệt của bạn đưa bốn PR vào `main`**, lần đầu dự
> án có mã sản phẩm ở đó. Trong PR có hai câu hỏi dành riêng cho bạn, trả lời 'thiếu X' tốt hơn approve cho
> xong. Sau đó: **sinh lại #35** — đường găng, đứng yên sang ngày thứ 5."
>
> **Hùng Anh:** "Cần bạn hai thứ tối nay. **Duyệt #41 và #49** (~1 h) — hai lượt này là tất cả những gì còn
> giữa Spike A và `EVIDENCE_READY`; `RESULT.md` mình vừa cập nhật xong nên giờ có cái để duyệt. Và **diễn
> giải `B10`/`B11`** — đó là việc duy nhất hôm nay **không ai làm thay được** (`DR-006a` rev 3). Trong #49
> có ba câu hỏi cho bạn, hai trong đó là sai sót của mình."
>
> **Trung:** "Code hôm qua chạy tốt — mình test rồi: 28/28 endpoint có scenario, V4 4/4, `app/core` 10/10
> xanh. Hôm nay nhờ bạn **chạy QA-004 cho Spike A** thay mình: chủ spike và Project Control là cùng một
> người nên mình tự QA thì `ACCEPTED` có chữ ký một người đeo ba vai. Script làm phần nặng, bạn đọc bảng và
> ký. Và **duyệt lại #35** khi Khánh bỏ nháp."

---

## Hàng đợi dự phòng

- **`INC-002`** — lập theo khuôn `INC-001`, chú thích vào `day_10_verdict_basis`. Verdict `TRƯỢT` giữ
  nguyên vì đó là sự thật; thêm nguyên nhân để người đọc sau không hiểu thành hai người bỏ việc.
- **V1 `SCR-03`** — rẽ nhánh từ `main` sau khi #50 vào. Thiết kế đã khảo sát xong: `index.mjs` theo khuôn
  Trung đặt ở V4, 8 kiểm, một dòng CI. Ba bẫy đã biết: `cacheKeyFromResponse('PREDICTION', …)` **ném**
  (`prediction_slice_get` không có `run_id` trong response) · `ground_truth_available` là chuỗi nên phải so
  `=== true` · **không có pixel nào trong bundle**.
- Trả `screen_off_timeout` A17 về mặc định *(nợ từ phiên `S6` 17/09)*.
- Dọn worktree scratchpad — **chỉ khi anh xác nhận từng cái**.

---

**Ranh giới:** `TECH_STACK_ADR` chỉ viết **sau** khi A và B `ACCEPTED` · không tính số `B` thay Hùng Anh,
số `E` thay Trung · không chuyển `ACCEPTED` ngoài 4 bước · **không tự duyệt PR của chính mình** · chuyển
**lượt duyệt** thì được (Mức 1, ghi lý do), chuyển **quyền sở hữu** thì không · không sửa
`docs/specs/v1.0/**` · không từ khoá đóng PR · **không lệnh xoá khi chưa xác nhận** — đã vượt **hai lần**.
