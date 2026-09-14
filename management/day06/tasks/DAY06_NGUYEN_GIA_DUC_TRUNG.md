# DAY 6 — Nguyễn Gia Đức Trung · 2026-09-15

**Khối lượng hôm nay:** phần chính **≥ 8 h** · hàng đợi dự phòng ~2 h · **hạn: 23:59 hôm nay**.

> **Hôm qua bạn xong đủ việc chính trong hạn:** PR #26 (tổng hợp lượt 4, payload 576/640, kế hoạch đo, nháp
> `RESULT.md`) và lúc 22:24 sửa đủ 3 điểm review #24 **cộng thêm `--profile`** cho harness Toybox — nhờ đó leader đo
> được đúng kế hoạch của bạn trên điện thoại. Hôm nay: dựng stub để leader đo **khung 15:00**, thiết kế `E9`, và bắt đầu
> **hợp đồng ingestion (M3, Day 6–9)** — phần backend là của bạn.

> ⚠ **06:40 — Mac mini không tới được từ laptop leader**: `10.64.193.115` và `10.134.129.115` đều không ping được,
> cổng 22 và 8787 đóng; overlay phía leader vẫn chạy (điện thoại `10.64.193.140` ping được). Stub cũ PID 32227 **chưa
> dừng được**. **Trước việc 2:** kiểm Mac mini còn bật, không ngủ, và ZeroTier trên đó đang chạy
> (`zerotier-cli listnetworks` thấy `b103a835d292ddb3` `OK`). Nếu bạn vào được máy, tự dừng PID 32227 rồi dựng stub mới.

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **1** | **Review PR #28** — split Path A của Khánh *(việc 6 Day 5, PR chỉ có từ 00:58)*: chạy lại `split.py --selftest`, JSON Schema, đếm **80/20/54**, holdout **đúng** 54 case `Testing Set`, `20 ⊂ 40 ⊂ 80`, chạy hai lần ra **cùng** file, từ chối nguồn chưa sẵn. PR xếp chồng trên #25 nhưng review được ngay | ~1,5 h | không | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung |

## Việc Day 6

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **2** | **Dựng stub 2 profile trên Mac mini** — **trước 14:00** để kịp khung 15:00. Từ nhánh #26 (ghi commit): `payloads/generate.py` cả hai profile → `stub/server.py --payloads … --bind 10.64.193.115 --port 8787 --log <file>`. Leader dừng instance cũ (PID 32227) trước — xem packet leader. Kiểm **ngay trên Mac mini**: `/health` 200, `?profile=576x576x88` và `640x640x88` trả đúng `Content-Length` | ~1 h | leader dừng PID 32227 | comment trên #26: commit, lệnh, output kiểm, đường dẫn log. Payload bytes **không commit** (`.gitignore`) |
| **3** | **`E9` reconnect/retry trên harness Toybox**: kịch bản mất kết nối có kiểm soát giữa một lần tải slice và một lần tải mesh (vd. operator `adb shell svc wifi disable` → `enable`, hoặc tắt/bật network ZeroTier). Ghi: thời điểm mất, thời gian hồi phục, số lần thử lại, dữ liệu sau thử lại có trùng byte không, trạng thái lỗi. Diễn tập trên AVD (`lan-diagnostic`, chỉ chẩn đoán) | ~2,5 h | không | PR (nhánh mới từ `docs/day4-avd-diagnostic`) + hướng dẫn một trang để leader chạy trên máy thật |
| **4** | **Tổng hợp các lượt đo mới trong ngày**: khi leader đẩy dữ liệu thô khung 15:00 và 21:00, chạy `aggregate.py` **riêng từng nhóm** path/profile/khung giờ; cập nhật nháp `RESULT.md` (`E2`–`E6`, `E8` độ trải theo khung giờ, `E12`) | ~1,5 h | leader (dữ liệu thô) | commit trên nhánh #26. *Chưa có dữ liệu thì làm việc 5* |
| **5** | **M3 — Hợp đồng ingestion 1 (dữ liệu thô), bản nháp v0** theo bảng "Contract 1" của `DR-004`: schema manifest cho `MRICase` / `MRIVolume` / `GroundTruthMask`; các kiểm bắt buộc (NRRD mở được, shape + spacing khớp, label `{0, 255}` ghi rõ, **axis-aligned, không thì `GEOMETRY_NOT_VALIDATED`** — DR-012, allowlist metadata); idempotency (checksum đổi là lỗi, không ghi đè); bị chặn bởi `GATE-DATA-01`. Dựng trên `dataset_manifest.json` của Spike D (PR #25). **Chỉ tài liệu + JSON Schema + ca kiểm trên dữ liệu tổng hợp — không module production, không đóng băng API** | ~2 h | không | PR nháp `contracts/ingestion/contract1_raw_dataset/` — ghi rõ `DRAFT v0` |

**Tổng phần chính: ~8,5 h** *(+ trả lời review #26 của Hùng Anh khi có, ~1 h)*.

> **🎯 Chuẩn demo** *(leader, 15/09: sản phẩm cuối phải "wow")*: giảng viên sẽ cảm nhận Spike E qua **tốc độ mở ca và
> lướt slice trên máy thật**. Việc 4 xuất **bảng + biểu đồ phân bố** (p50/p95/max theo khung giờ và profile) dùng
> thẳng cho báo cáo và demo. Việc 5: mỗi kiểm tra của hợp đồng ingestion có **thông báo lỗi dễ hiểu** — khi demo có
> thể cố ý nạp một gói hỏng để chứng minh hệ thống từ chối đúng.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Hợp đồng ingestion 2 (artifact thí nghiệm), khung schema v0** theo `DR-004` "Contract 2" và `08` §10: mọi trường manifest, gồm id manifest split/subset/tập đánh giá, phiên bản code + metric, checksum, cờ `precomputed`; bị chặn bởi `GATE-SPLIT-01` + `GATE-ML-01`. `DR-002` = Path A → artifact dự đoán là của **54 case holdout** | ~1,5 h | cùng PR nháp việc 5 |
| **Kế hoạch đo `E7`** (bộ nhớ app theo chiến lược tải): ghi rõ cần app thật (Spike A/B), đề xuất cách đo khi có (vd. `dumpsys meminfo` theo từng chiến lược) | ~30 ph | một mục trong nháp `RESULT.md` |

---

**Nhắc lại:** bạn là **reviewer Spike B** (`DR-006a` rev 3) — hôm nay chưa có bằng chứng Spike B để review. Leader là
operator duy nhất của điện thoại cho Spike E; mọi con số `E` do **bạn** tính. **Liên quan:** PR #24 · PR #26 · PR #28 ·
[`../../day05/DAY05_EOD_REVIEW.md`](../../day05/DAY05_EOD_REVIEW.md) · `OPEN_DECISIONS.md` → `DR-004`, `DR-003b`, `DR-006a`
