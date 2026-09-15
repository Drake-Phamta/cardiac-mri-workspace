# DAY 6 — Phạm Tuấn Anh · 2026-09-15

**Khối lượng hôm nay:** **không giới hạn giờ** — review, merge, quyết định và chốt ngày. Thành viên: **≥ 8 h**
việc thật + ~2 h dự phòng, hạn **23:59**.

> **Day 5 đạt 3/3 theo quyết định của anh.** Hôm nay critical path có thể đi **xa nhất từ đầu dự án**: #25 merge →
> **QA Spike D** → `ACCEPTED` → `GATE-DATA-01` đóng → `SPIKE_C1` hết `BLOCKED`. Nấc song song: bằng chứng nối bệnh
> nhân của Khánh → **anh quyết** → `GATE-SPLIT-01`.

## 🔴 LÀM TRƯỚC — việc đang giữ người khác

| # | Việc | Giờ | Giữ ai | Xong khi |
|---|---|---|---|---|
| **1** | ✅ **06:42 — đã đẩy `08d7166`, đã nhờ Khánh review lại.** ⚠ *PR #17 đã bị **đóng nhầm lúc 06:01** vì commit kế hoạch Day 6 (`18e1871`) ghi "fix #17" — từ khoá tự đóng của GitHub; Project Control mở lại ~06:55, comment giải thích trên PR.* Kiểm trên 3050 Ti tìm thêm 2 lỗi và đã sửa (CUDA hỏng cả tiến trình sau OOM → tách tiến trình con; batch tràn VRAM bị ghi như số thật). **Sửa PR #17 — 2 lỗi runtime Khánh tìm trên RTX 4050** + chữ `extrapolate.py` *(Claude viết, anh duyệt)*: chạy tìm batch **kể cả khi** batch dự định không vừa, rồi đo ở batch tìm được; bắt `OSError` khi dựng/tải DINOv2, ghi lỗi và **chạy tiếp** biến thể khác; lỗi tải checkpoint trước vòng lặp ra thông báo rõ thay vì traceback; `--train-cases 80` ghi là giá trị đã quyết | ~1,5 h | **Khánh** (việc 4) | push lên #17, CI xanh, trả lời trên PR — **trước 12:00** |
| **2** | ✅ **#25 trên `main`** — Hùng Anh `APPROVE` 10:03:17 rồi **tự merge** 10:03:26 (`a92892c`, squash). Nhánh `spike/SPIKE_D` bị xoá khi merge → **#28 bị đóng tự động**; packet Khánh đã ghi cách mở lại (Project Control thử rebase: sạch) | ~5 ph | Khánh, QA | #25 trên `main` |
| **3** | ✅ **09:48 — đã dừng stub cũ PID 32227** trên Mac mini *(anh đồng ý 15/09)*: SIGTERM, thoát trong 1 s, có chốt kiểm đúng lệnh chạy trước khi dừng. `10.64.193.115:8787` trống; stub 60294 của Trung trên `10.134.129.115:8787` **không đụng tới**. Log `stub-20260913-net-b103a835.jsonl` giữ nguyên (66 192 byte, 374 dòng, SHA-256 `3004f87b…7a117c`, request cuối 13/09 19:19); bản sao từng lượt đã có trên `spike-e/evidence-20260913`. Packet Trung đã ghi. *Mac mini không tới được lúc 06:10 và 06:14, tới được lại 09:38. SSH đi qua `10.134.129.115` vì chỉ địa chỉ này có host key đã tin cậy; `10.64.193.115` chưa có trong `known_hosts` nên không nhận khoá mới khi chưa kiểm.* | ~5 ph | **Trung** (việc 2) | cổng 8787 trống — **trước 13:30** |

## Việc Day 6

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **4** | ✅ **11:52 — xong: `REJECT`** → Spike D `NEEDS_FIX`, trả Khánh — [`../QA_REVIEW_002_SPIKE_D.md`](../QA_REVIEW_002_SPIKE_D.md). 1 CRITICAL (cặp case trùng `CASE_0056`/`CASE_0097`, split nháp đặt ở train và validation), 4 HIGH; mọi con số khác tái lập đúng — QA tìm được bản ZIP trùng hash trên máy anh (`C:\cardiac-data`, bản tải trong INC-001). Project Control chạy lại phép so cặp lúc 11:58: khớp. **Đã quyết 12:29: Q1 (a) → `DR-002a`, Q3 như đề xuất. Q2 đang cân nhắc** (§9 bản ghi). **Bước 3 nghiệm thu Spike D — QA Red Team** sau khi #25 merge: phiên QA **độc lập** soi bằng chứng thật (manifest, `DATASET_AUDIT.md`, `A1`–`A20`, tái chạy lệnh). `PASS` → Project Control chuyển `ACCEPTED`, đóng `GATE-DATA-01`, gỡ `BLOCKED` cho `SPIKE_C1`; xác nhận `C6` trên verdict `A14`. `REJECT` → trả Khánh | ~2 h | không *(#25 đã merge 10:03)* | bản ghi QA + state cập nhật |
| **5** | **Quyết giới hạn nối case ↔ bệnh nhân** (`GATE-SPLIT-01`) sau bằng chứng việc 3 của Khánh *(hẹn 18:00)*. Project Control soạn sẵn **ba** phương án theo ba kết luận có thể của Khánh; **Q1 của QA-002 đã quyết: `DR-002a`** | ~30 ph | Khánh | quyết định ghi trong `OPEN_DECISIONS.md` |
| **6** | **Đo lại Spike E** theo kế hoạch của Trung: **khung 15:00** (576 rồi 640) và **khung 21:00** (576 rồi 640), harness Toybox `--profile` (`710090f`, ghi rõ chưa review như lượt 1–4), Wi-Fi + ZeroTier, ghi `E12` | ~1,5 h | Trung (stub) | dữ liệu thô + `PROVENANCE.md` trên nhánh `spike-e/evidence-20260915` |
| **7** | Merge **#24** và **#26** khi Hùng Anh `APPROVE` — *10:04 / 10:09 cả hai `CHANGES_REQUESTED`, chờ Trung sửa* · ✅ **10:51 — đã nhờ Hùng Anh review #27**: PR chuyển ready, mô tả cập nhật, checklist 4 bước. *Hùng Anh đã soát lúc 10:13 (4/4 kiểm đạt, góp ý `onPanResponderTerminate` → đưa vào S5); 11:09 đã trả lời trên PR* | ~15 ph | Hùng Anh | CI xanh sau mỗi merge |
| **8** | ✅ **12:13 — PR nháp #31** (xếp chồng trên #27): Claude viết trong worktree riêng; Project Control review và tự chạy lại F4 6/6, F5 14/14, F1–F5, bundle Metro sạch; góp ý `onPanResponderTerminate` của Hùng Anh đã sửa. **Đo `A3`–`A7` trên máy khi anh cắm điện thoại** (~15 phút: "kiểm A5" → "A3–A7 tự động" → vài nét thật → `extract_brush.py`) — **Spike A chặng S5 — brush** *(Claude + anh)*: ADD / ERASE, undo / redo, xuất mask để checksum; kiểm offline `A3` `A4` `A6` `A7` và chạy 60 ca `brush_cases.json` cho `A5` | ~3 h | không | PR nháp + kiểm offline đạt; đo trên máy sau |
| **9** | ✅ **Chuẩn demo "wow" — bản nháp v0 đã soạn, chờ anh duyệt:** [`management/DEMO_STANDARD.md`](../../DEMO_STANDARD.md) — 7 luật D1–D7, kịch bản demo H1–H10, 9 màn hình, **70 acceptance test**. *Đếm lại bằng lệnh 15/09: spec có **70** test chứ không phải 69 (cách đếm cũ bỏ sót `TC-MOBILE-STATE-001`), và **44** product requirement / **33** MUST chứ không phải 39 / 28 (bỏ sót `PR-3D-01`…`05`). Spec không sai — chỉ các tài liệu quản lý cũ ghi lệch; đính chính là việc anh quyết (§11 của file).* Con số hiệu năng lấy từ bằng chứng đo trên máy; **`10` không có bảng hiệu năng trên màn hình** — muốn có thì phải qua Decision Request. Nâng **chất lượng thực thi trong phạm vi spec** — không thêm yêu cầu mới ngoài quy trình `00` §13 | ~1 h | không | `management/DEMO_STANDARD.md` — mọi packet từ Day 7 bám vào |
| **10** | **Chốt Day 6** | ~1 h | — | `DAY06_EOD_REVIEW.md` |

## Hàng đợi dự phòng

- Spike A: đo lại `A9` với **cache giới hạn ±3 slice** — từ phát hiện bộ nhớ 376 MB cho 88 slice *(~1,5 h, cần máy)*.

---

**Liên quan:** PR #17 · #25 · #28 · #24 · #26 · #27 · [`../../day05/DAY05_EOD_REVIEW.md`](../../day05/DAY05_EOD_REVIEW.md) ·
`PROJECT_STATE.yaml` → `gates.GATE-SPLIT-01.open_question`
