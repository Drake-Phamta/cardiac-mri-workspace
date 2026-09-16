# DAY 6 — Nguyễn Gia Đức Trung · 2026-09-15

**Khối lượng hôm nay:** phần chính **≥ 8 h** · hàng đợi dự phòng ~2 h · **hạn: 23:59 hôm nay**.

> 🔒 **Day 6 đã chốt lúc 16/09 ~01:45 — `CHƯA ĐẠT` 3/4** · buffer 0 → **−1** — [`DAY06_EOD_REVIEW.md`](../DAY06_EOD_REVIEW.md).
> Điều kiện 3 (stub 2 profile + review PR split) **trượt**, và phần lớn là **lỗi lập kế hoạch của Project Control**:
> packet giao bạn dựng stub mà không kiểm bạn có quyền SSH vào Mac mini hay không, còn PR split chỉ mở lúc 00:20.
> Việc chuyển sang packet Day 7: [`../../day07/tasks/DAY07_NGUYEN_GIA_DUC_TRUNG.md`](../../day07/tasks/DAY07_NGUYEN_GIA_DUC_TRUNG.md).

> **Hôm qua bạn xong đủ việc chính trong hạn:** PR #26 (tổng hợp lượt 4, payload 576/640, kế hoạch đo, nháp
> `RESULT.md`) và lúc 22:24 sửa đủ 3 điểm review #24 **cộng thêm `--profile`** cho harness Toybox — nhờ đó leader đo
> được đúng kế hoạch của bạn trên điện thoại. Hôm nay: dựng stub để leader đo **khung 21:00** *(khung 15:00 huỷ — xem ghi chú 13:07)*, thiết kế `E9`, và bắt đầu
> **hợp đồng ingestion (M3, Day 6–9)** — phần backend là của bạn.

> ✅ **09:48 — leader đã dừng stub cũ PID 32227**, cổng `10.64.193.115:8787` trống → **việc 2 không còn chờ ai**, làm
> được ngay. Stub **60294 của bạn** trên `10.134.129.115:8787` vẫn chạy, không đụng tới. Log cũ
> `spikes/spike_e_transport/logs/stub-20260913-net-b103a835.jsonl` giữ nguyên (66 192 byte, SHA-256 `3004f87b…7a117c`);
> bản sao từng lượt đã có trên nhánh `spike-e/evidence-20260913`. Repo trên Mac mini đang ở `37877e8` (13/09) — `git
> fetch` rồi checkout nhánh của #26 (`chore/day5-trung`) trước khi sinh payload. *(Mac mini không tới được lúc 06:10 và
> 06:14, tới được lại 09:38.)*
>
> ⚠ **10:04 và 10:09 — Hùng Anh đã review #24 và #26, cả hai `CHANGES_REQUESTED`.** #24 còn **1 điểm**:
> `ANDROID_TOYBOX_HARNESS.md` vẫn ghi mạng ZeroTier cũ `3b19b3a71652c5f0` (nay là `b103a835d292ddb3`) — sửa xong là
> Hùng Anh approve. #26 có **3 điểm** có nội dung (việc 1b). **#28 bị đóng tự động 10:03** khi #25 merge — bạn review
> bản Khánh mở lại. Bạn là **reviewer Spike B**: Hùng Anh vừa mở **#29** (`B14`) và **#30** (`B1`).
> **Thứ tự mới:** 1a (15 phút) → 1b → **việc 2 — stub, hạn 20:30** → 1d → 1c khi PR có → việc 3, 4.
>
> 🕘 **13:07 — leader chỉ cắm được điện thoại buổi tối → khung đo 15:00 huỷ.** Stub 2 profile cần chạy và kiểm xong
> **trước 20:30** cho khung 21:00. Hôm nay chỉ có dữ liệu một khung giờ, nên `E8` (độ trải theo khung giờ) cần thêm một
> khung ban ngày vào ngày khác — ghi vào kế hoạch đo trong #26.
>
> ❌ **11:52 — QA Red Team `REJECT` Spike D** ([`../QA_REVIEW_002_SPIKE_D.md`](../QA_REVIEW_002_SPIKE_D.md)). Hai chỗ chạm việc
> của bạn: **1c** — khi review PR split mới, kiểm cặp `CASE_0056`/`CASE_0097` (một lần chụp bị xuất hai lần) **nằm cùng
> một phía**; **việc 5** — hợp đồng ingestion 1 phải có phép phát hiện case trùng theo hash, và header hình học mặc
> định (spacing 1, origin 0) ⇒ `GEOMETRY_NOT_VALIDATED` cho mọi đơn vị vật lý.

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **1a** | ✅ **21:22 — `be52d6f`** · **Sửa #24** — đổi ID mạng ZeroTier cũ trong `spikes/spike_e_transport/client/ANDROID_TOYBOX_HARNESS.md` sang `b103a835d292ddb3`, hoặc trỏ tới nguồn chuẩn (`OPEN_DECISIONS.md` / `SPIKE_PHASE_STATE.yaml`) thay vì ghi cứng | ~15 ph | không | commit trên #24, trả lời review |
| **1b** | ✅ **21:21 — `a585907`** (sửa `aggregate.py`, sinh lại JSON tổng hợp, cập nhật kế hoạch đo — **trả lời từng điểm trên PR** để Hùng Anh duyệt lại) · **Sửa #26 — 3 điểm của Hùng Anh:** (1) tái sinh `SPIKE_E_RUN4_AGGREGATE.json` bằng `aggregate.py` ở PR head (ghi `run_quality` trước khi serialise), hoặc ghi rõ và commit đúng bản script đã sinh JSON cũ; (2) thay khối lệnh `python client/harness.py` trong kế hoạch đo bằng lệnh harness Toybox chính xác (có `--profile`), ghi rõ harness Python chỉ là công cụ chẩn đoán trên máy trạm; (3) đưa profile vào nhóm/báo cáo của `aggregate.py`, hoặc bắt buộc mỗi profile một lần chạy và từ chối trộn | ~2 h | không | commit trên #26, trả lời từng điểm |
| **1c** | **Review PR split của Khánh** (thay #28) — *thêm theo `DR-002a` (leader quyết 12:29): `CASE_0056` và `CASE_0097` là một nhóm **ghim vào train**, 80/20 và seed giữ nguyên, các tập con chứa cả hai hoặc không case nào, manifest ghi 79 lần chụp khác nhau*: chạy lại `split.py --selftest`, JSON Schema, đếm **80/20/54**, holdout **đúng** 54 case `Testing Set`, `20 ⊂ 40 ⊂ 80`, chạy hai lần ra **cùng** file, từ chối nguồn chưa sẵn | ~1,5 h | Khánh mở PR mới | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung |
| **1d** | **Review #29** (`B14`, chỉ README) và **#30** (`B1`, PR nháp: viewer WebGL2 + ảnh) — bạn là reviewer Spike B (`DR-006a` rev 3) | ~1 h | không | review có nội dung trên từng PR |

## Việc Day 6

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **2** | **Dựng stub 2 profile trên Mac mini** — **trước 20:30** để kịp khung 21:00 *(khung 15:00 huỷ: leader chỉ có máy buổi tối)*. Từ nhánh #26 (ghi commit): `payloads/generate.py` cả hai profile → `stub/server.py --payloads … --bind 10.64.193.115 --port 8787 --log <file>`. ✅ Leader đã dừng instance cũ PID 32227 lúc 09:48 — cổng trống. Kiểm **ngay trên Mac mini**: `/health` 200, `?profile=576x576x88` và `640x640x88` trả đúng `Content-Length` | ~1 h | không *(✅ 09:48)* | comment trên #26: commit, lệnh, output kiểm, đường dẫn log. Payload bytes **không commit** (`.gitignore`) |
| **3** | **`E9` reconnect/retry trên harness Toybox**: kịch bản mất kết nối có kiểm soát giữa một lần tải slice và một lần tải mesh (vd. operator `adb shell svc wifi disable` → `enable`, hoặc tắt/bật network ZeroTier). Ghi: thời điểm mất, thời gian hồi phục, số lần thử lại, dữ liệu sau thử lại có trùng byte không, trạng thái lỗi. Diễn tập trên AVD (`lan-diagnostic`, chỉ chẩn đoán) | ~2,5 h | không | PR (nhánh mới từ `docs/day4-avd-diagnostic`) + hướng dẫn một trang để leader chạy trên máy thật |
| **4** | **Tổng hợp các lượt đo mới trong ngày**: khi leader đẩy dữ liệu thô khung 21:00 *(15:00 huỷ)*, chạy `aggregate.py` **riêng từng nhóm** path/profile/khung giờ; cập nhật nháp `RESULT.md` (`E2`–`E6`, `E8` độ trải theo khung giờ, `E12`) | ~1,5 h | leader (dữ liệu thô) | commit trên nhánh #26. *Chưa có dữ liệu thì làm việc 5* |
| **5** | *(xuống cuối hàng 11:15 — sau các việc trên)* **M3 — Hợp đồng ingestion 1 (dữ liệu thô), bản nháp v0** theo bảng "Contract 1" của `DR-004`: schema manifest cho `MRICase` / `MRIVolume` / `GroundTruthMask`; các kiểm bắt buộc (NRRD mở được, shape + spacing khớp, label `{0, 255}` ghi rõ, **axis-aligned, không thì `GEOMETRY_NOT_VALIDATED`** — DR-012, allowlist metadata); idempotency (checksum đổi là lỗi, không ghi đè); bị chặn bởi `GATE-DATA-01`. Dựng trên `dataset_manifest.json` của Spike D (trên `main` từ `a92892c`). **Chỉ tài liệu + JSON Schema + ca kiểm trên dữ liệu tổng hợp — không module production, không đóng băng API** | ~2 h | không | PR nháp `contracts/ingestion/contract1_raw_dataset/` — ghi rõ `DRAFT v0` |

**Tổng phần chính: ~10 h** — gồm sửa #24 và #26 cùng 3 review mới; việc 5 (M3 hợp đồng ingestion 1) làm sau cùng.

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

**Nhắc lại:** bạn là **reviewer Spike B** (`DR-006a` rev 3) — hôm nay có #29 và #30 để review (việc 1d). Leader là
operator duy nhất của điện thoại cho Spike E; mọi con số `E` do **bạn** tính. **Liên quan:** PR #24 · PR #26 · PR #28 ·
[`../../day05/DAY05_EOD_REVIEW.md`](../../day05/DAY05_EOD_REVIEW.md) · `OPEN_DECISIONS.md` → `DR-004`, `DR-003b`, `DR-006a`
