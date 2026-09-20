# DAY 11 — Nguyễn Gia Đức Trung · 2026-09-20

**Gói này lập lúc 17:50** — còn ~6 giờ tới hạn 23:59, nên nó **không** phải gói 8 giờ.

> **Hôm qua bạn là người duy nhất làm việc**, và làm đúng thứ tự. Leader đã chạy thử code của bạn: generator
> sinh scenario cho **28/28 endpoint** kèm 3 scenario `stale_revision`, `app/core` **10/10 script test xanh**
> trên nhánh của bạn, mô hình V4 **4/4 pass**, và bạn còn **siết chặt test `D2`** để bắt buộc phải có ba
> scenario đó. Bạn cũng duyệt #47 lúc 21:40 — lượt duyệt đó **đóng M3** (merge `40498e5`, muộn 1 ngày).
>
> **Bài học đã lặp lại:** ba nhánh Day-10 của bạn đẩy lúc 10:09–10:18 nhưng tới **21:41** mới có PR. Đó đúng
> là cái làm M3 trượt hôm Day 9. Giờ #50/#51/#52 đã mở và **cả ba CI 7/7 xanh**.

## 📌 Quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng |
|---|---|
| **Bạn chạy QA-004 cho Spike A** — không phải leader | Chủ Spike A = Project Control = một người, và `acceptance_workflow` **không có điều khoản hồi tị**. Xem việc 1 |
| **`15` §18 Mức 1 mở** — từ **21:00** bạn là người duyệt dự phòng cho #48, #41, #49 | Chỉ khi chính chủ chưa duyệt. **Không chuyển quyền sở hữu của ai** |
| **Leader duyệt #50/#51/#52** | Đã gắn reviewer. Chồng tuyến tính nên merge theo đúng thứ tự `#48 → #50 → #51 → #52` |

---

## 🔴 Việc 1 — **chạy QA-004 cho Spike A** *(~45 phút, sau khi #41 và #49 merge)*

Bước **3** của `acceptance_workflow`. Script làm phần nặng:

```powershell
cd D:\cardiac-mri-workspace
python management/day10/qa004_spike_a/run_qa004.py --json qa004.json
```

Nó **tự chạy lại** bốn kiểm offline và dựng bảng `A1`–`A12` **từ tệp bằng chứng thô** trong
`spikes/spike_a_2d/EVIDENCE_RAW/`, **không** từ `RESULT.md`. Năm điều nó từ chối:

1. tiêu chí không có tệp bằng chứng → `NOT MEASURED`, văn xuôi nói gì cũng vậy;
2. bằng chứng trên bản **debug**, hoặc `build_type` còn chỗ trống → `REJECTED`;
3. bản ghi `A8` **không có vòng nạp lại NGUỘI** → từ chối — vòng nóng chỉ chứng minh codec, không chứng
   minh bản sửa sống sót khi app bị giết;
4. `A9` suy từ `p95` đã ghi so với 200 ms đóng băng, không đọc kết luận đang bị soát;
5. tệp có bản đồ `criteria` thì tiêu chí **ngoài** bản đồ **không** được kế thừa verdict cấp tệp.

> Điều 5 là một lỗi thật đã bị bắt khi viết bộ này: bản đầu gán `OBSERVED` cho `A10`/`A11` bằng cách kế
> thừa verdict cấp tệp, trong khi `extract_brush.py` nói thẳng là nó không kết luận hai cái đó.

**Việc của bạn không phải chạy script — mà là đọc bảng và ký verdict** vào
`management/day11/QA_REVIEW_004_SPIKE_A.md`. Hai chỗ cần mắt người:

- **`A1` và `A12` còn "một phần"** — `A1` chưa kiểm khớp fixture theo từng pixel (RN `Image` nội suy
  bilinear), `A12` mới có một ứng viên. Nhận kèm hạn chế ghi rõ, hay chặn?
- **`a9_slice_switch_20260912` không ghi `operator`** — caveat sổ sách, không làm sai con số, nhưng phải
  vào ghi chú.

---

## 🔴 Việc 2 — **duyệt lại #35 của Khánh** *(~45 phút, khi cậu ấy bỏ nháp)*

Đường găng. Soát: nhóm **bắc cầu** giữ nguyên qua mọi tập con · `CASE_0056`/`CASE_0097` cùng một phía
(`DR-002a`) · `CASE_0117`/`CASE_0133` vắng khỏi mọi subset hiệu dụng, train hiệu dụng **78** (`DR-002b`) ·
SHA manifest mới khớp `main`.

Bạn đã `APPROVED` bản trước từ 18/09 — lần này chỉ cần soát phần sinh lại.

---

## Việc 3 — **bốn dòng trong generator** *(~20 phút, nếu còn giờ)*

Khảo sát hôm nay tìm ra hai chỗ trong `contracts/api/generate_fixture.py` chặn **cả bốn** vertical:

1. **`analysis_run_get.default.status` = `"IN_PROGRESS"`** — `field_value` đang gán tên `status` theo từ
   vựng *review*, không phải *run*. Không scenario nào cho một run đã `SUCCEEDED`.
2. **Không endpoint nào của V1 có scenario trả `RUN_NOT_SUCCEEDED`** — `error_case` luôn lấy `errors[0]`,
   mà với cả chín endpoint của V1 thì đó là `CASE_NOT_FOUND`/`ARTIFACT_NOT_FOUND`.

Hệ quả: **trạng thái `PROCESSING` của `10` §8 không chạm tới được đầu-cuối.** Một trong bảy trạng thái bắt
buộc chưa demo được, và đó là trạng thái duy nhất mà `10` §8 đòi *"không được đóng băng giao diện"*.

Sửa: tách từ vựng `status` của run khỏi review, và thêm một scenario `run_not_succeeded` cho
`prediction_slice_get` / `analysis_slice_metrics`. Thuộc PR #50, không phải việc của V1.

---

## Hàng đợi dự phòng

- **#26** và **#33** — bạn đã đẩy bản sửa lúc 10:09 hôm qua, đang chờ Hùng Anh duyệt lại. Nếu tới tối cậu
  ấy chưa duyệt, nhắc một câu.
- V4 tiếp: `SCR-08` Findings trên cùng khuôn `index.mjs` bạn đã đặt.

---

**Ranh giới:** không tự duyệt PR của chính mình (#50/#51/#52 là của bạn) · không từ khoá đóng PR trong
commit message · nợ tồn làm trước việc mới · QA `REJECT` thì spike **không** `ACCEPTED`, bất kể chủ hay
reviewer nói gì.
