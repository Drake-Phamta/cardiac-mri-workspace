# DAY 7 — Vũ Hùng Anh · 2026-09-16

**Khối lượng hôm nay:** phần chính **≥ 8 h** · hàng đợi dự phòng ~2 h · **hạn: 23:59 hôm nay**.

> **Buổi sáng Day 6 của bạn là phần tốt nhất của ngày:** approve + merge #25 (10:03) đưa audit Spike D lên `main` lần đầu,
> review lại #24, review #26 với 3 điểm có nội dung, soát #27, rồi `B14` (#29) và `B1` (#30) — tất cả trước 10:21.
>
> **Nhưng sau 10:26 không có hoạt động nào**, nên bốn việc còn lại của packet không ai làm: picking `B3`/`B4`, duyệt lại
> #24/#26 (Trung đẩy bản sửa lúc 21:21–21:22 và **vẫn đang chờ**), review #27/#31, duyệt lại Spike D.
> **Day 6 chốt CHƯA ĐẠT 3/4** — [`../../day06/DAY06_EOD_REVIEW.md`](../../day06/DAY06_EOD_REVIEW.md).
>
> **Trung đã review #29 và #30 lúc 21:38–21:39, cả hai `CHANGES_REQUESTED`** — và điểm ở #30 là đúng: `B1` trong TASK là
> *"Canonical mesh renders; rotate, zoom, pan all work"*, viewer mới có xoay (drag) và zoom (wheel/pinch), **chưa có pan**.
>
> **Hôm nay bạn đang giữ việc của cả ba người còn lại:** Trung (#24/#26 → buổi đo Spike E tối nay), Khánh (#34 → critical
> path), leader (#27/#31). Làm **review trước** — mỗi cái mở khoá cho một người — rồi mới tới việc của mình.

## 🔴 LÀM TRƯỚC — nợ Day 6, theo thứ tự

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **1** | **Duyệt lại #24** — Trung sửa đúng một điểm còn lại (`be52d6f`: ID mạng ZeroTier trong `ANDROID_TOYBOX_HARNESS.md` đổi sang `b103a835d292ddb3`) | ~15 ph | không | `APPROVE` hoặc yêu cầu sửa |
| **2** | **Duyệt lại #26** (`a585907`) — **trước 14:00** để stub và buổi đo tối nay chạy đúng bản: (1) tái chạy `aggregate.py` ở PR head trên `20260913_run4` rồi so với JSON đã commit (phải có `run_quality`); (2) kế hoạch đo dùng harness Toybox có `--profile`, không phải `harness.py`; (3) `aggregate.py` nhóm theo `payload_profile` và **từ chối trộn** profile | ~1,5 h | không | `APPROVE` hoặc yêu cầu sửa |
| **3** | **#29 — xoá đoạn diễn giải bị lặp** rồi nhờ Trung review lại | ~10 ph | không | commit + request review |
| **4** | **#30 — thêm `pan`**: kéo trên desktop (vd. chuột phải hoặc Shift + kéo) **và** kéo hai ngón trên touch, dịch camera/mesh; cập nhật ảnh chụp hoặc kèm một đoạn quay ngắn; chạy lại `node spikes/spike_b_3d/app/test_obj.mjs` và `node --check viewer.js` → nhờ Trung review lại. Sau bước này `B1` mới đủ theo TASK | ~1,5 h | không | commit + request review |

## Việc Day 7

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **5** | **Duyệt lại Spike D — PR #34** *(critical path)* khi Khánh chuyển ready (hẹn 12:00): kiểm **F1** cặp `CASE_0056`/`CASE_0097` được báo trong manifest + audit và phép kiểm hash chéo đã vào `A15`/`A16` — chạy lại bằng script QA ở [`../../day06/qa002/`](../../day06/qa002/); **F2** §4 ghi spacing/origin/direction thật và câu "hình học vật lý chưa kiểm được — mm/mL tắt"; **F3** bảng `A19`; **F4** verdict `A11`/`A14` dẫn được về file; **F5** manifest hết đường dẫn tuyệt đối; **F12** log validator + môi trường + commit | ~2 h | Khánh (#34 ready) | `APPROVE` hoặc `CHANGES_REQUESTED` có nội dung |
| **6** | **Picking trên fixture chính thức** (`B3`/`B4`) trên viewer #30 sau khi có pan: chạm → tia → điểm trên mesh, so với **13 tia `expected`** của `geometry_fixture_v0.json` | ~2 h | việc 4 | bảng `B4` exact trong PR *(chẩn đoán — `B5`/`B6` trên máy thật đo sau, leader bấm)* |
| **7** | **Review #27 và #31** (Spike A — S4 zoom/pan và S5 brush; `A2` và `A3`–`A7` đều đã đo trên máy, `OBSERVED`, lệnh tái lập nằm trong comment trên #31) — làm **sau** việc 5 vì Spike D là P0 | ~1,5 h | không | review có nội dung trên từng PR |

**Tổng phần chính: ~8,9 h.**

> **🎯 Chuẩn demo** — [`../../DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **H6 / SCR-05** *(giảng viên xoay, zoom **và pan**
> khối nhĩ trái — pan không phải chi tiết nhỏ, nó nằm trong thứ người ta thử đầu tiên; bar của SCR-05 là ≥ 20 FPS trung vị,
> không khựng quá 500 ms)* · **D4** *(tính đúng phải chứng minh được: picking trên fixture hôm nay là bản nháp của
> **H7** — chạm vùng lỗi trên 3D, mở đúng slice 2D)* · **D7** *(PR đổi thứ nhìn thấy được thì kèm đoạn quay ngắn + lệnh
> kiểm)*. Code spike vẫn là code bỏ đi, nhưng lựa chọn thư viện và cách dựng camera hôm nay quyết định app cuối đẹp tới
> đâu — ghi nhận xét đó vào `B15`.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Review #36** *(và #37 khi hết nháp)* — **đã sẵn sàng từ 02:21**: base `main`, CI 4/4, Khánh nhờ bạn review; `C0-1`–`C0-10` đều có số, kèm ngoại suy lịch 4 h và 5 h GPU/ngày. Bạn là reviewer `SPIKE_C0`, xếp **sau** Spike D và Spike E trong hàng của bạn | ~1,5 h | review có nội dung |
| **M3 — hợp đồng hình học có số phiên bản**: nâng `tests/fixtures/geometry/FORMAT.md` thành hợp đồng có phiên bản, quy tắc thay đổi, mô tả contract test. Ghi rõ phát hiện QA-002: header LASC mang spacing 1 / origin 0 mặc định ⇒ toạ độ "thế giới" đọc từ header **chỉ là chỉ số voxel, không phải mm** *(chỉ bạn được viết thư mục này — `DR-013`)* | ~1 h | PR |
| **Kịch bản đo `B10`/`B11` cho leader bấm** (`DR-006a` rev 3) — khi app việc 4 chạy được | ~30 ph | file ngắn trong `spikes/spike_b_3d/` |

---

**Nhắc lại:** `DR-002` = Path A — cần giải phẫu thật thì dùng case trong `Training Set`, không đụng 54 case holdout. Đo trên
máy cho Spike B: **leader bấm, bạn thiết kế và tính số** (`DR-006a` rev 3); reviewer Spike B là Trung. **Liên quan:** PR #24 ·
#26 · #27 · #29 · #30 · #31 · #34 · [`../../day06/QA_REVIEW_002_SPIKE_D.md`](../../day06/QA_REVIEW_002_SPIKE_D.md) ·
[`../../spikes/SPIKE_B_3D/TASK.md`](../../spikes/SPIKE_B_3D/TASK.md)
