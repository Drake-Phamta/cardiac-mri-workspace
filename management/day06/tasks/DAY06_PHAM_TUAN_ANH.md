# DAY 6 — Phạm Tuấn Anh · 2026-09-15

**Khối lượng hôm nay:** **không giới hạn giờ** — review, merge, quyết định và chốt ngày. Thành viên: **≥ 8 h**
việc thật + ~2 h dự phòng, hạn **23:59**.

> **Day 5 đạt 3/3 theo quyết định của anh.** Hôm nay critical path có thể đi **xa nhất từ đầu dự án**: #25 merge →
> **QA Spike D** → `ACCEPTED` → `GATE-DATA-01` đóng → `SPIKE_C1` hết `BLOCKED`. Nấc song song: bằng chứng nối bệnh
> nhân của Khánh → **anh quyết** → `GATE-SPLIT-01`.

## 🔴 LÀM TRƯỚC — việc đang giữ người khác

| # | Việc | Giờ | Giữ ai | Xong khi |
|---|---|---|---|---|
| **1** | **Sửa PR #17 — 2 lỗi runtime Khánh tìm trên RTX 4050** + chữ `extrapolate.py` *(Claude viết, anh duyệt)*: chạy tìm batch **kể cả khi** batch dự định không vừa, rồi đo ở batch tìm được; bắt `OSError` khi dựng/tải DINOv2, ghi lỗi và **chạy tiếp** biến thể khác; lỗi tải checkpoint trước vòng lặp ra thông báo rõ thay vì traceback; `--train-cases 80` ghi là giá trị đã quyết | ~1,5 h | **Khánh** (việc 4) | push lên #17, CI xanh, trả lời trên PR — **trước 12:00** |
| **2** | **Merge #25 ngay khi Hùng Anh `APPROVE`** → cập nhật state; packet Khánh đã ghi việc đổi base #28 | ~5 ph | Khánh, QA | #25 trên `main` |
| **3** | **Dừng stub cũ PID 32227** trên Mac mini để Trung dựng stub 2 profile *(anh đồng ý 15/09)*. ⚠ **06:10 và 06:14: Mac mini không tới được** — không ping được ở cả hai mạng ZeroTier, cổng 22 đóng; overlay phía laptop vẫn chạy (điện thoại ping được). Cần người ở phía Mac mini bật máy / đánh thức / khởi động lại ZeroTier; packet Trung đã ghi | ~5 ph | **Trung** (việc 2) | cổng 8787 trống — **trước 13:30** |

## Việc Day 6

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **4** | **Bước 3 nghiệm thu Spike D — QA Red Team** sau khi #25 merge: phiên QA **độc lập** soi bằng chứng thật (manifest, `DATASET_AUDIT.md`, `A1`–`A20`, tái chạy lệnh). `PASS` → Project Control chuyển `ACCEPTED`, đóng `GATE-DATA-01`, gỡ `BLOCKED` cho `SPIKE_C1`; xác nhận `C6` trên verdict `A14`. `REJECT` → trả Khánh | ~2 h | Hùng Anh → merge | bản ghi QA + state cập nhật |
| **5** | **Quyết giới hạn nối case ↔ bệnh nhân** (`GATE-SPLIT-01`) sau bằng chứng việc 3 của Khánh *(hẹn 18:00)*. Project Control soạn sẵn hai phương án: chấp nhận có ghi rõ, hoặc đòi bằng chứng nguồn | ~30 ph | Khánh | quyết định ghi trong `OPEN_DECISIONS.md` |
| **6** | **Đo lại Spike E** theo kế hoạch của Trung: **khung 15:00** (576 rồi 640) và **khung 21:00** (576 rồi 640), harness Toybox `--profile` (`710090f`, ghi rõ chưa review như lượt 1–4), Wi-Fi + ZeroTier, ghi `E12` | ~1,5 h | Trung (stub) | dữ liệu thô + `PROVENANCE.md` trên nhánh `spike-e/evidence-20260915` |
| **7** | Merge **#24** và **#26** khi Hùng Anh `APPROVE` · nhờ Hùng Anh review **#27** | ~15 ph | Hùng Anh | CI xanh sau mỗi merge |
| **8** | **Spike A chặng S5 — brush** *(Claude + anh)*: ADD / ERASE, undo / redo, xuất mask để checksum; kiểm offline `A3` `A4` `A6` `A7` và chạy 60 ca `brush_cases.json` cho `A5` | ~3 h | không | PR nháp + kiểm offline đạt; đo trên máy sau |
| **9** | **Chuẩn demo "wow" — bản nháp v0** *(Project Control soạn, anh duyệt)*: gắn với **9 màn hình** (`10`), **69 acceptance test** giảng viên chạy được (`13`), các con số hiệu năng hiện trên màn hình, kịch bản demo, và "wow" cho từng vertical. Nâng **chất lượng thực thi trong phạm vi spec** — không thêm yêu cầu mới ngoài quy trình `00` §13 | ~1 h | không | `management/DEMO_STANDARD.md` — mọi packet từ Day 7 bám vào |
| **10** | **Chốt Day 6** | ~1 h | — | `DAY06_EOD_REVIEW.md` |

## Hàng đợi dự phòng

- Spike A: đo lại `A9` với **cache giới hạn ±3 slice** — từ phát hiện bộ nhớ 376 MB cho 88 slice *(~1,5 h, cần máy)*.

---

**Liên quan:** PR #17 · #25 · #28 · #24 · #26 · #27 · [`../../day05/DAY05_EOD_REVIEW.md`](../../day05/DAY05_EOD_REVIEW.md) ·
`PROJECT_STATE.yaml` → `gates.GATE-SPLIT-01.open_question`
