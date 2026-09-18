# DAY 10 — Nguyễn Gia Đức Trung · 2026-09-19

**Khối lượng hôm nay:** phần chính **≥ 8 h** *(bảng dưới cộng ~8 h)* · hàng đợi dự phòng ~2,25 h · **hạn: 23:59**.

> **Bạn bắt đầu sớm hơn hôm trước 3,5 tiếng** (13:56 thay vì 17:26) và làm đúng thứ tự: sửa #33, đề xuất `E10`, viết
> job CI. Tối muộn còn tổng hợp khung `E8` thứ hai vào `RESULT.md`.
>
> **Nhưng M3 hết hạn vì một PR không được mở.** Job CI bạn viết lúc 14:02 nằm trên nhánh `ci/day9-contract-tests-trung`
> và **không có PR nào**, nên lối ra cuối của M3 không tồn tại về mặt quy trình. Leader đã mở hộ **#47** lúc 02:2x đêm
> qua — rebase lên `main` và **giữ lại job geometry** mà nhánh cũ của bạn sẽ xoá mất, vì nó ra đời trước khi #43 merge.
> CI **xanh 6/6**. Bài học: *việc chỉ tính khi nó nằm trên một PR mở*.

## 📌 Mới — quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng tới bạn |
|---|---|
| **Day 9 chốt `TRƯỢT` 1,5/4**, buffer **−2** | M3 trượt vì lối ra CI; việc 1 hôm nay đóng nó lại trong 15 phút |
| **`E10` giữ `PROVISIONAL`** | Ngưỡng 3 500 ms chỉ thành ràng buộc khi `TC-PERF-FIRSTLOAD-01` có vòng cold-open riêng **≥ 20 mẫu/profile**. Hiện mỗi khung vẫn 3 mẫu |
| **M5 bắt đầu bằng mã thật hôm nay** | Việc 6 và 7: fixture sinh từ hợp đồng, rồi PR hiện thực đầu tiên của V4 |

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **1** | **Duyệt [#47](https://github.com/Drake-Phamta/cardiac-mri-workspace/pull/47)** — job CI hợp đồng, chính là job bạn viết. CI đã xanh 6/6; leader **không được tự duyệt PR của mình**, nên **M3 đang treo trên đúng lượt duyệt này**. Soát: ba bộ test chạy đúng thư mục, job geometry còn nguyên | ~15 ph | không | `APPROVE` → leader merge → **M3 đóng** |
| **2** | **Duyệt #44** (probe `B10`/`B11` của Hùng Anh). Bạn là reviewer Spike B theo `DR-006a` rev 3. Protocol đã được **chạy thật** tối qua: 3 lượt hợp lệ, dữ liệu trên `spike-b/evidence-20260918`. Soát: mọi số do script bắt, URL cố định, và phần Hùng Anh vừa merge `main` vào để provenance tái lập được từ GitHub | ~45 ph | Hùng Anh merge `main` vào #44 | review có nội dung |
| **3** | **#33: đổi một dòng.** Khối chạy trên máy thật vẫn trỏ `http://10.134.129.115:8787`, địa chỉ điện thoại **không tới được** (đo 01:53: timeout; `10.64.193.115` trả 200). Đổi sang `10.64.193.115` hoặc thêm bước preflight gọi `/health` **từ điện thoại**. Dấu nháy bạn sửa hôm qua đã đúng | ~15 ph | không | #33 `APPROVED` |
| **4** | **#26: gỡ rò rỉ phạm vi `NFR-PERF-001`** trong `analyze/aggregate.py:231-255` theo review của Hùng Anh — mọi đầu vào `E4` đang được in và serialize như một miss của `NFR-PERF-001` | ~1 h | không | Hùng Anh duyệt lại, `RESULT.md` Spike E lên `main` |
| **5** | **Duyệt lại #35** sau khi Khánh sinh lại split trên manifest mới. Soát: nhóm **bắc cầu** giữ nguyên qua mọi tập con, `CASE_0117`/`CASE_0133` vắng khỏi mọi subset hiệu dụng, SHA manifest mới khớp | ~45 ph | Khánh sinh lại (việc 1 của cậu ấy) | #35 `APPROVED` → leader merge → **`GATE-SPLIT-01` đóng** |

## Việc Day 10

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **6** | **Fixture sinh từ hợp đồng API đã chấp nhận** bằng `contracts/api/generate_fixture.py`: bộ cho endpoint V1 (slice, geometry, prediction, per-slice metrics, error), V2 (mesh, error-reconstruction), V3 (experiment metrics/compare), V4 (review, working mask, commit, findings). `11` §11.4 và `09` §12 cấm mock viết tay. **Cả ba vertical hôm nay dựng trên bộ này**, nên nó là việc chặn người khác — làm trước việc 7 | ~1,5 h | không | Fixture trên PR + lệnh sinh lại, mỗi file dẫn về endpoint của nó |
| **7** | **PR hiện thực đầu tiên của V4 — `SCR-06` Review/Correction**, trong bộ khung `app/` leader tạo sáng nay, chạy trên fixture của việc 6. Phạm vi tối thiểu: mở một `reviewed_mask` theo `case_id`+`run_id`, hiển thị `revision`, chặn ghi khi `STALE_REVISION`, và **ba trạng thái** `10` §8: loading · lỗi thử lại được · dữ liệu hỏng. Không backend thật | ~2,5 h | việc 6 · bộ khung `app/` | PR mở, CI xanh, chạy trên fixture |
| **8** | **Gói `TC-TEAM-001` V4** cho `SCR-06`, `SCR-08` (UC-13…15) theo `10` §10, 6 hạng mục | ~1 h | không | `management/evidence/TC_TEAM_001_NGUYEN_GIA_DUC_TRUNG.md` |

**Tổng phần chính: ~8 h.**

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **H8–H9 / SCR-06**: mask đã sửa lưu thành **phiên bản
> bất biến mới**, prediction gốc không đổi, checksum nguồn giữ nguyên; `STALE_REVISION` hiện ra **đọc được** trên màn
> hình chứ không phải traceback. Việc 7 hôm nay là bước đầu tiên có thật của hook đó.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Vòng đo cold-open ≥ 20 mẫu/profile** cho `TC-PERF-FIRSTLOAD-01` — thiết kế script, leader bấm máy sau | ~45 ph | script + mô tả trong `RESULT.md` |
| **Bản thảo `ADR-ART-001`** theo `DR-015` limb 2: loại tải trọn volume, per-slice là hướng V1, bác bản prefetch `s4` đã thử, để mở artifact URL | ~1,5 h | PR nháp |

---

**Không cần Mac mini hay điện thoại cho việc nào ở trên.** **Ranh giới:** không sửa `docs/specs/v1.0/**` · Project
Control không tính số `E` hộ bạn · không tự chuyển `ACCEPTED`. **Liên quan:** PR #26 · #33 · #35 · #44 · #47 ·
[`../day09/DAY09_EOD_REVIEW.md`](../day09/DAY09_EOD_REVIEW.md)
