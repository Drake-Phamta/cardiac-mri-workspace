# DAY 7 — Nguyễn Gia Đức Trung · 2026-09-16

**Khối lượng hôm nay:** phần chính **≥ 8 h** · hàng đợi dự phòng ~1,5 h · **hạn: 23:59 hôm nay**.

> **Điều kiện 3 của Day 6 trượt, và phần lớn là lỗi lập kế hoạch của Project Control, không phải của bạn.** Packet hôm qua
> giao bạn dựng stub 2 profile trên Mac mini và sau khi leader dừng stub cũ lúc 09:48 còn ghi *"việc 2 không còn chờ ai"* —
> mà **không ai kiểm bạn vào Mac mini bằng cách nào**. 22:20 bạn ghi rõ trên #26: không có quyền SSH để khởi động lại tiến
> trình. Từ hôm nay mọi việc trong packet cần quyền truy cập đều ghi **cần quyền gì · ai đang có** —
> [`../../day06/DAY06_EOD_REVIEW.md`](../../day06/DAY06_EOD_REVIEW.md) §11.
>
> **Tối qua bạn làm được nhiều:** sửa #24 (`be52d6f`) và #26 (`a585907`), **review #29 và #30** — trong đó bắt được `B1`
> thiếu **pan** trong khi TASK đòi xoay, zoom *và* pan, `E9` reconnect/retry drill (#33) và **hợp đồng ingestion 1 v0**
> (#32, 9/9 ca kiểm tổng hợp, có phát hiện checksum trùng và từ chối header hình học mặc định theo QA-002). Kiểm HEAD của
> bạn lúc 22:27 cho thấy tiến trình đang chạy trả **cùng một payload 58 392 576 byte cho cả hai profile** — đúng thứ cần
> biết trước khi đo.
>
> ⚠ **Comment GitHub của bạn đang bị mất ký tự** (`^G585907`, `un_quality`, `olume_id`, `est_contract1.py`): PowerShell đọc
> dấu backtick trong chuỗi kép là ký tự thoát (`` `a `` `` `r `` `` `t ``). Dùng `gh pr comment <số> --body-file <file.md>`
> hoặc chuỗi nháy đơn.

## 🔴 LÀM TRƯỚC — nợ Day 6

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **1** | ✅ **Leader đã chọn phương án A (16/09): Project Control dựng stub bằng SSH của leader**, chạy đúng lệnh trong `SPIKE_E_MEASUREMENT_PLAN.md` và `payloads/generate.py` ở commit `a585907`; **bạn giữ thiết kế, phép kiểm và mọi con số `E`** — chỉ phần *chạy lệnh trên máy* chuyển sang leader/PC, đúng mô hình `DR-006a` rev 2. **Phần của bạn:** (1) đọc output PC dán trên #26 và **đối chiếu với `PROFILE_MANIFEST.json`** — `576x576x88` phải ra `Content-Length` 29 196 288 và `640x640x88` ra 36 044 800, mỗi phản hồi có `X-Payload-Profile` đúng, `/health` liệt kê cả hai profile; (2) nếu muốn **tự kiểm trực tiếp** trên đúng địa chỉ điện thoại dùng (`10.64.193.115`), gửi **node ID ZeroTier máy bạn** cho leader duyệt vào mạng `b103a835d292ddb3`; (3) ghi xác nhận trên #26 — **trước 20:30** để leader kịp khung 21:00. Lệnh nào bạn muốn chạy khác đi thì ghi lên #26, PC chạy đúng lệnh đó | ~1 h | không còn chờ quyền — PC dựng trước 14:00 | comment xác nhận trên #26 **trước 20:30** |
| **2** | **Review PR #35** — split Path A thay #28, theo `DR-002a`: `split.py --selftest` (11/11), JSON Schema, đếm **80/20/54**, holdout đúng 54 case `Testing Set`, **`CASE_0056` và `CASE_0097` cùng nằm ở train**, tập con `20 ⊂ 40 ⊂ 80` chứa **cả hai hoặc không case nào**, chạy hai lần ra **cùng** file, từ chối nguồn chưa sẵn, `linkage_screen.py --selftest` (5/5). Không có bản ZIP thì ghi rõ phần nào **không** tái lập được thay vì bỏ qua | ~2 h | Khánh nhờ review (PR vẫn draft vẫn review được) | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung |
| **3** | **Theo dõi #24 và #26** — trả lời nếu Hùng Anh hỏi thêm; **sau khi #24 merge, đổi base #33 sang `main`** (`gh pr edit 33 --base main`). #33 đang xếp chồng trên `docs/day4-avd-diagnostic` nên chưa có CI, và nếu nhánh base bị xoá lúc merge thì GitHub tự đóng #33 như đã xảy ra với #28 | ~30 ph | Hùng Anh duyệt lại → leader merge | #33 nhắm `main`, CI 4/4 |

## Việc Day 7

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **4** | **Hợp đồng ingestion 2 (artifact thí nghiệm) — khung schema v0** *(nợ hàng dự phòng Day 6)* theo `DR-004` "Contract 2" và `08` §10: mọi trường manifest, gồm id manifest split/subset/tập đánh giá, phiên bản code + metric, checksum, cờ `precomputed`; ghi rõ bị chặn bởi `GATE-SPLIT-01` + `GATE-ML-01`. `DR-002` = Path A → artifact dự đoán là của **54 case holdout**. Chỉ tài liệu + JSON Schema + ca kiểm trên dữ liệu tổng hợp | ~2,5 h | không | PR nháp `contracts/ingestion/contract2_*` ghi rõ `DRAFT v0` |
| **5** | **`E9` trên máy thật** — bổ sung vào `management/day06/E9_RECONNECT_DRILL.md` (#33) phần **leader bấm**: từng bước, lệnh Toybox đầy đủ, dữ liệu kỳ vọng, cách đọc kết quả, ranh giới "chẩn đoán ≠ bằng chứng nghiệm thu". Bản hiện tại mới mô tả diễn tập trên AVD | ~1 h | không | commit trên #33 |
| **6** | **Tổng hợp lượt đo khung 21:00** khi leader đẩy dữ liệu thô: `aggregate.py` chạy **riêng từng profile**, không trộn; cập nhật nháp `RESULT.md` (`E2`–`E6`, `E12`); ghi rõ `E8` mới có **một** khung giờ nên chưa kết luận được độ trải theo khung | ~1,5 h *(buổi tối)* | leader (dữ liệu thô) | commit trên nhánh #26 |

**Tổng phần chính: ~9 h.**

> **🎯 Chuẩn demo** — [`../../DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **D5** *(tốc độ là số đo, không phải lời tuyên bố:
> p50/p95/max theo profile, sinh thẳng từ `aggregate.py`)* · **H3 / H4** *(giảng viên mở một ca và lướt slice trên máy thật —
> đường mạng của bạn là thứ quyết định cảm giác đó)* · **D3** *(trạng thái trung thực: `E9` cho thấy app mất mạng rồi hồi
> phục thế nào, có thử lại, không bịa tiến trình)*. Hợp đồng 1 và 2: **thông báo lỗi đọc được** — khi demo có thể cố ý nạp
> một gói hỏng để chứng minh hệ thống từ chối đúng chỗ.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Kế hoạch đo `E7`** (bộ nhớ app theo chiến lược tải): ghi rõ cần app thật (Spike A/B), đề xuất cách đo khi có | ~30 ph | một mục trong nháp `RESULT.md` |
| **Đối chiếu schema Contract 1 với `data/manifests/dataset_manifest.json` trên `main`** (chỉ siêu dữ liệu, không byte ảnh): trường nào khớp, trường nào thiếu, trường nào manifest thật có mà hợp đồng chưa mô tả | ~1 h | một mục trong #32 |

---

**Nhắc lại:** bạn là **reviewer Spike B** (`DR-006a` rev 3) — #29 và #30 sẽ quay lại sau khi Hùng Anh sửa. Leader là
**operator duy nhất** của điện thoại cho Spike E; mọi con số `E` do **bạn** tính. **Liên quan:** PR #24 · #26 · #32 · #33 ·
#35 · [`../../day06/DAY06_EOD_REVIEW.md`](../../day06/DAY06_EOD_REVIEW.md) · `OPEN_DECISIONS.md` → `DR-004`, `DR-003b`,
`DR-006a`
