# DAY 8 — Vũ Hùng Anh · 2026-09-17

**Khối lượng hôm nay:** phần chính **≥ 8 h** *(bảng dưới cộng ~8,25 h)* · hàng đợi dự phòng ~2 h · **hạn: 23:59**.

> **Day 7 là ngày mạnh nhất của cả nhóm, và phần lớn là của bạn:** 6 review có nội dung (approve #24, #27, #36;
> yêu cầu sửa #26, #31) cộng 3 sản phẩm riêng (#29 sửa, **#30 thêm pan**, **#38 linked MPR + POC 3D**). Hai điểm
> đáng ghi riêng: bạn **tự chạy lại `extract_a2.py` và `summarize.py`** để tái lập kết quả của người khác thay vì
> tin bảng số; và khi phát hiện mình bắt oan #24 vì tra nhầm đường dẫn repo, bạn **tự đính chính công khai** ngay
> trong lần approve. Đó là thứ giữ cho toàn bộ chuỗi bằng chứng của dự án này còn đáng tin.
>
> **Hôm nay cả critical path đứng sau một lượt review của bạn.** #34 (bản sửa Spike D) đã sẵn sàng từ **00:10**
> với nội dung đủ — 7/7 phát hiện có câu trả lời kèm file:dòng, `A19` viết theo `Q2`, `F5` đã thực hiện — và
> **chưa có review nào**. `GATE-DATA-01` đang sang **ngày thứ tám**.
>
> Và một việc M3 chỉ bạn làm được: **`geometry_contract_version` hiện không tồn tại ở đâu trong repo**, dù `11`
> §2 và §4, `05` và `TC-REL-003` đều tham chiếu tới nó.

## 🔴 LÀM TRƯỚC

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **1** | **Duyệt lại #34 — trước 12:00.** P0, việc đầu tiên trong ngày. Script QA ở [`../../day06/qa002/`](../../day06/qa002/) dùng lại được: **F1** cặp `CASE_0056`/`CASE_0097` được báo trong manifest và audit, phép kiểm hash chéo đã vào `A15`/`A16` · **F2** §4 ghi spacing/origin/direction thật + câu "hình học vật lý chưa kiểm được, mm/mL tắt" · **F3** bảng `A19` ghi `DEFERRED / NOT PASSED` kèm câu training vẫn `BLOCKED` · **F4** verdict `A11`/`A14` dẫn được về file · **F5** manifest công khai đã bỏ bảng checksum, còn hash + lệnh sinh lại bản hạn chế · **F12** log validator, môi trường, commit. Chú ý luôn `A17`: Khánh để `FAIL` vì hai file lạ trong gói — đó là chủ ý, không phải sót | ~2 h | không | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung |
| **2** | **Duyệt lại #26** — điểm chặn duy nhất của bạn (thứ tự merge với #24) đã gỡ lúc 22:37. Head mới `eaa878f` có thêm **phần tổng hợp hai profile** của Trung: `E2`–`E6`, `E12` riêng từng profile. ⚠ **Hai câu kết luận trong `RESULT.md` đang sai phạm vi và Trung sẽ sửa hôm nay** — chúng ghi *"`NFR-PERF-001` không đạt"*, nhưng điều khoản đó chỉ quản slice **đã cache trên máy demo**, còn `E4` đo HTTP uncached trên máy trạm. Cách đọc đúng: **tiêu chí `E4` trượt** (prefetch `s4` p95 28 606 / 6 181 ms), **`s3` vi phạm limb 2** (tải trọn volume), **slice chưa cache không có trần → `RA-H13`**. Lỗi gán nhãn là của Project Control, không phải của Trung. Soát **cách tổng hợp**, đừng soát giùm kết luận — số là của chủ spike | ~45 ph | không | `APPROVE` hoặc yêu cầu sửa |
| **3** | **Picking `B3`/`B4` trên fixture chính thức** *(nợ Day 7)* — chạm → tia → điểm trên mesh, so với **13 tia `expected`** của `geometry_fixture_v0.json`. Hiện trạng cần biết: viewer #30 mới có **xoay, zoom, pan**; **chưa có dòng code picking nào** (không raycaster, không giao tia–tam giác, không đường từ điểm chạm về chỉ số slice), nên 13 tia kia **chưa từng được chạy qua app**. `B4` cũ trong README là **33/33 điểm của harness offline**, không phải phép đo này | ~2 h | không | bảng `B4` exact trong PR *(chẩn đoán; `B5`/`B6` trên máy thật đo sau, leader bấm)* |

## Việc Day 8

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **4** | **`geometry_contract_version` — lối ra M3** *(việc chính hôm nay)*. `09` §6 đòi **một hợp đồng hình học có phiên bản** dùng chung giữa backend và mobile; `11` §2 và §4 đòi mọi phản hồi có hình học **mang chuỗi phiên bản đó**; `05` đặt nó làm trường của hai thực thể; `TC-REL-003` đòi **từ chối khi lệch phiên bản** — mà chuỗi đó **chưa có giá trị nào trong repo** (`geometry_fixture_v0.json` mới có `fixture_id`, `contract: DR-008a`, `schema_version: 1`). Việc: **(a)** đặt chuỗi phiên bản gắn `DR-008a` + `DR-012` và phát ra trong fixture; **(b)** viết **quy tắc đổi phiên bản** — thay đổi nào là breaking (`11` §11 xếp payload hình học vào nhóm nhạy cảm, đòi test hồi quy conformance); **(c)** nâng `harness/conformance.py` thành **checker dùng lại được** cho `TC-MAINT-002` *(backend và mobile phải qua **cùng** bộ fixture)* và đưa vào CI — đó chính là mục "contract tests run" của M3; **(d)** ghi caveat QA-002 `F2` vào `FORMAT.md`: 462/462 header mang hình học mặc định nên toạ độ đọc từ header **là chỉ số voxel, không phải mm**. *(Chỉ bạn được viết `tests/fixtures/geometry/**` — `DR-013`)* | ~2,5 h | không | PR: fixture + `FORMAT.md` + checker + job CI |
| **5** | **`RESULT.md` cho Spike B** — spike này **chưa có file `RESULT.md` nào**, trong khi `B2`, `B4`, `B8`, `B12`, `B14` đã có số từ hôm 13/09 và `B1` sắp merge. Viết đúng như nó là: mỗi tiêu chí kèm nhãn **`DIAGNOSTIC`** (desktop, mesh tổng hợp), nói rõ **`B12` còn thiếu cột FPS** nên `DR-008c` (ngân sách decimation) **chưa khuyến nghị được**, và `B3`/`B5`/`B6`/`B7`/`B9`/`B10`/`B11`/`B13`/`B15` còn `NOT MEASURED` kèm lý do | ~1 h | không | `management/spikes/SPIKE_B_3D/RESULT.md` trong PR |

**Tổng phần chính: ~8,25 h.**

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md) *(v1)*: **H6 / SCR-05** *(giảng viên xoay, zoom
> và pan khối nhĩ trái — bar là ≥ 20 FPS trung vị, không khựng quá 500 ms; `B10`/`B11` sẽ đo đúng hai số này)* ·
> **D4** *(tính đúng phải chứng minh được: picking việc 3 chính là bản nháp của **H7** — chạm vùng lỗi trên 3D, mở
> đúng slice 2D)* · **D7** *(PR đổi thứ nhìn thấy được thì kèm đoạn quay ngắn)*. `geometry_contract_version` ở
> việc 4 là thứ giữ cho 2D và 3D **không lệch nhau** khi demo.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Kịch bản `B10`/`B11` cho leader bấm** (`DR-006a` rev 3, slot thiết bị 3) — bạn thiết kế, leader bấm, bạn tính số | ~30 ph | file ngắn trong `spikes/spike_b_3d/` |
| **Fixture TP/FP/FN tổng hợp** ở `tests/fixtures/error_masks/` — `13` §11 đòi *"small binary mask pair with known TP/FP/FN/Dice/IoU"* **độc lập với Spike F**, và `SPIKE_F/TASK.md` cho phép làm ngay; đây là việc F duy nhất được phép khi Spike B còn `ACTIVE` | ~1 h | PR fixture + README |
| **Gói bằng chứng `TC-TEAM-001`** (vertical V2) — 6 hạng mục theo `10` §10; một trong sáu test của sàn nghiệm thu cuối `13` §13 | ~1,5 h | file trong `management/` |

---

**Nhắc lại:** đo trên máy cho Spike B — **leader bấm, bạn thiết kế và tính số** (`DR-006a` rev 3); reviewer Spike B
là Trung. **Liên quan:** PR #26 · #29 · #30 · #34 · #38 ·
[`../../day07/DAY07_EOD_REVIEW.md`](../../day07/DAY07_EOD_REVIEW.md) ·
[`../../day06/QA_REVIEW_002_SPIKE_D.md`](../../day06/QA_REVIEW_002_SPIKE_D.md) ·
[`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md)
