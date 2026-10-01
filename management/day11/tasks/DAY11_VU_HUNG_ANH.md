# DAY 11 — Vũ Hùng Anh · 2026-09-20

**Gói này lập lúc 17:50** — còn ~6 giờ tới hạn 23:59, nên nó **không** phải gói 8 giờ. Ba việc, xếp theo
mức chặn người khác.

> **Day 10 trượt 1,25/4** vì thiếu lượt duyệt, không vì thiếu người làm. Sự cố của nhóm đã ghi thành
> `INC-002`. Hôm nay **bạn giữ hai chìa khoá**: `GATE-MOB-01` (quá hạn từ Day 6) và việc nghiệm thu Spike A.

## 📌 Quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng |
|---|---|
| **`15` §18 Mức 1 được mở** — tới **21:00** nếu #41/#49 chưa có review, **Trung** duyệt thay | Cơ chế chống lặp lại Day 10, không phải trách móc. **Quyền sở hữu Spike B không đổi** |
| **`RESULT.md` Spike A đã được cập nhật** (`a970167`) | Trước đó nó còn ghi `A8`/`A10`/`A11` là `NOT MEASURED` — **bạn sẽ không có gì để duyệt**. Giờ đã có |
| **QA-004 Spike A giao cho Trung, không phải leader** | Chủ spike = Project Control = một người; `acceptance_workflow` không có điều khoản hồi tị. Xem `DAY11_PLAN.md` §4 |

---

## 🔴 Việc 1 — **duyệt #41 và #49** *(~1 giờ, làm trước)*

Hai lượt này là **tất cả** những gì còn giữa Spike A và `EVIDENCE_READY`.

### [#41 — `S6`, `A9` ở kích thước thật](https://github.com/Drake-Phamta/cardiac-mri-workspace/pull/41)

Bạn đã `CHANGES_REQUESTED`, và leader **lấy lựa chọn 2 của bạn**: `RESULT.md`, README và PR body nay ghi
**ba lượt trên hai build**, bảng so sánh hai chính sách cache được dán nhãn *quan sát*, commit của từng
build được ghi nhận là **khoảng trống**. Soát xem lời văn đã khớp dữ liệu chưa.

### [#49 — `S8`, `A8`/`A10`/`A11`](https://github.com/Drake-Phamta/cardiac-mri-workspace/pull/49)

Phiên đo đã chạy 19/09 11:50–12:19 trên A17. **Ba câu hỏi PR đặt cho bạn**, hai trong đó là sai sót của
leader:

| # | Câu hỏi |
|---|---|
| 1 | **`A10` lấy verdict trên `max`, không phải `p95`.** `A9` nêu rõ phân vị; `A10` không nêu và đòi worst case. Số hiện tại (30,48 vs 100) không đổi kết quả, nhưng sẽ đổi ở một phiên tệ hơn. **Bạn đọc `TASK.md` giống vậy chứ?** |
| 2 | **`expo-file-system` là dependency mới** của app spike. Không có filesystem trong RN nếu thiếu nó, và nó nằm trong ranh giới spike vốn dán nhãn throwaway. Chấp nhận được không? |
| 3 | **Một quan sát ngược giả định:** bán kính **lớn không phải chỗ chậm nhất** — `r5` worst **19,41 ms**, `r1` worst **30,48 ms**. Nếu bạn có cách giải thích tốt hơn *"chi phí mỗi mẫu không nằm ở footprint"*, mình muốn nghe — **bạn hiểu phần render này nhất nhóm** |

Kèm theo, đã ghi công khai trong PR: leader **xoá một tệp log khi chưa được xác nhận** (lần thứ hai), nên
sha256 đã ghi của nó không kiểm lại được. Không mất bằng chứng, nhưng nó nằm trong bản ghi.

---

## 🔴 Việc 2 — **diễn giải `B10`/`B11`** *(~1 giờ)*

**Đây là việc duy nhất hôm nay không ai làm thay được.** `DR-006a` revision 3, ràng buộc b, nguyên văn:
*"Vũ Hùng Anh … **computes every B number**, writes `RESULT.md` … **The leader computes none**."*

Dữ liệu thô đã nằm sẵn: nhánh `spike-b/evidence-20260918`, `EVIDENCE_RAW/b10_b11_20260918/` — **3 lượt
`status: complete`**, mỗi lượt 1 800 khoảng frame, cùng một build, một lần tải trang, kèm `PROVENANCE.md`.

Theo protocol của chính bạn: `B10` đạt khi `median_fps ≥ 20` từng lượt; `B11` đạt khi
`longest_stall_ms ≤ 500` **và** `frames_over_500ms = 0`.

Ghi số của bạn kèm nhãn `OBSERVED` / `NOT MEASURED`, điều kiện thiết bị, và **giới hạn**: mesh synthetic
level 0, một phiên. `RESULT.md` Spike B hiện vẫn `evidence_present: false`.

**Chuỗi sau đó:** #44 sửa theo review của Trung → Trung duyệt lại → merge → QA Spike B → `SPIKE_B: ACCEPTED`
→ **leader viết `TECH_STACK_ADR`** → `GATE-MOB-01` `CLOSED`, M2 đóng sau 5 ngày quá hạn.

---

## Việc 3 — nợ tồn *(nếu còn giờ)*

| PR | Việc |
|---|---|
| **#44** | Trung đã `CHANGES_REQUESTED` lúc 21:40 hôm qua — sửa rồi nhờ duyệt lại |
| **#26** | Trung đã đẩy bản sửa rò rỉ phạm vi `NFR-PERF-001` trong `analyze/aggregate.py` — chờ bạn duyệt lại |
| **#33** | Trung đã sửa địa chỉ stub sang `10.64.193.115` — chờ bạn duyệt lại |

---

## Hàng đợi dự phòng

- Vertical **V2** của bạn: [`app/verticals/v2_3d_inspector/README.md`](https://github.com/Drake-Phamta/cardiac-mri-workspace/blob/feat/day10-app-core/app/verticals/v2_3d_inspector/README.md).
  Một điểm đúng chuyên môn bạn: payload đi qua cầu WebView **không phải** response hợp đồng, nên
  `validateResponse()` được export riêng để kiểm trước khi tin. Và nhớ giới hạn ~4 095 ký tự của logcat —
  payload dài về **theo mảnh**, JSON bị cắt parse ra rác chứ không báo lỗi.

---

**Ranh giới:** leader không tính số `B` thay bạn · không sửa `docs/specs/v1.0/**` · `tests/fixtures/geometry/**`
chỉ bạn ghi (`DR-013`) · không từ khoá đóng PR trong commit message.
