# DAY 11 — Bế Quốc Khánh · 2026-09-20

**Gói này lập lúc 17:50** — còn ~6 giờ tới hạn 23:59, nên nó **không** phải gói 8 giờ. Chỉ hai việc, và
việc thứ nhất là thứ có đòn bẩy lớn nhất trong cả dự án tối nay.

> **Day 10 trượt 1,25/4.** Không phải vì thiếu người làm — **vì thiếu lượt duyệt**. Năm PR CI xanh nằm chờ
> đúng hai review. Sự cố của nhóm đã được ghi thành `INC-002`; verdict `TRƯỢT` giữ nguyên vì đó là sự thật,
> nhưng nguyên nhân được ghi kèm để không ai đọc thành hai người bỏ việc.

## 📌 Quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng |
|---|---|
| **`15` §18 Mức 1 được mở** — nếu tới **21:00** #48 chưa có review, **Trung** duyệt thay | Không phải trách móc: đó là cơ chế để một lượt duyệt muộn không giữ bốn PR qua đêm lần thứ hai. **Quyền sở hữu không chuyển** |
| **Điều kiện Day 10 số 4 đã sửa thành "bốn vertical"** | `SCR-01` của bạn **là V3** — bản kế hoạch gốc bỏ sót |
| **`app/core` đã có `README` riêng cho vertical của bạn** | Xem việc 1 |

---

## 🔴 Việc 1 — **duyệt #48** *(~30 phút, làm trước mọi thứ)*

[**PR #48 — `app/core`**](https://github.com/Drake-Phamta/cardiac-mri-workspace/pull/48) · CI **7/7 xanh**

**Vì sao là bạn, và vì sao là bây giờ:** #48 là đáy của một chồng **tuyến tính** `#48 → #50 → #51 → #52`.
Ba PR trên nó là của Trung, **cả ba CI xanh**, và `git merge-tree` báo gộp sạch. **Một lượt duyệt của bạn
đưa bốn PR vào `main`** — lần đầu dự án có mã sản phẩm trên `main`.

Soát gì (PR đã ghi sẵn hai câu hỏi dành riêng cho bạn):

1. [`app/verticals/v3_study_and_compare/README.md`](https://github.com/Drake-Phamta/cardiac-mri-workspace/blob/feat/day10-app-core/app/verticals/v3_study_and_compare/README.md)
   — đường ray cho `SCR-01` và `SCR-07` của bạn. **Nó có nói đúng thứ bạn cần, hay nói thứ leader đoán là
   bạn cần?** Đây là câu hỏi thật, trả lời "thiếu X" thì tốt hơn là `APPROVE` cho xong.
2. **Luật hàng của `items`**: một trường chỉ tính là có mặt nếu nó ở top level **hoặc** trên **mọi** phần
   tử `items`. Với danh sách phân trang như `case_list` thì **quá chặt hay vừa?**

Không cần đọc hết 137 kiểm — CI đã chạy chúng. Đọc `app/core/errors.mjs` (bảng 15 mã lỗi) và README của
bạn là đủ để `APPROVE` có nội dung.

---

## 🔴 Việc 2 — **sinh lại split, bỏ nháp #35** *(~1,5 giờ)*

**Đây là chặng duy nhất trên `critical_path`, và nó đứng yên sang ngày thứ 5.**

`GATE-SPLIT-01` → `SPIKE_C1` hết `BLOCKED` → `GATE-ML-01` → training. Cả M4 và M6 nằm sau nó.

- SHA manifest đã đổi sau khi #34 merge → **sinh lại trên manifest `main` hiện tại**.
- Cập nhật `SPLIT_RESULT.md` với định nghĩa **bắc cầu** bạn đã thống nhất: 5 cặp trên ngưỡng · 4 nhóm trong
  cùng phân vùng · 3 thành phần liên thông toàn đồ thị.
- Giữ `CASE_0056`/`CASE_0097` **cùng một phía** (`DR-002a`), và `CASE_0117`/`CASE_0133` vắng khỏi mọi subset
  hiệu dụng (`DR-002b`, train hiệu dụng 78).
- **Bỏ nháp** → Trung duyệt lại → leader merge.

> Trung **đã `APPROVED`** bản trước từ 18/09. Phần còn lại là sinh lại số trên manifest mới, không phải
> thiết kế lại.

---

## Hàng đợi dự phòng

- PR follow-up #34: `anomalies`/`package_findings` vào khối `summary` (`F13`) · thay `<private ZIP path>`
  bằng lệnh đã thật sự chạy (`F12`) · phép đo trực tiếp *`laendo` không chồng `lawall`* ở 154/154 (QA đề nghị).
- Sau khi cổng đóng: chạy **preflight `SPIKE_C1` thật** thay vì mô phỏng.

---

**Ranh giới:** không sửa `docs/specs/v1.0/**` · không commit byte dataset hay điểm tương quan từng cặp ·
không dùng từ khoá đóng PR trong commit message · nợ tồn làm trước việc mới.
