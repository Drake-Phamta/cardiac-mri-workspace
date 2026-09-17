# DAY 9 — Nguyễn Gia Đức Trung · 2026-09-18

**Khối lượng hôm nay:** phần chính **≥ 8 h** *(bảng dưới cộng ~8,5 h)* · hàng đợi dự phòng ~2 h · **hạn: 23:59**.

> **Nửa cuối Day 8 là của bạn.** Từ 17:26 bạn gỡ hết bốn PR đang chờ mình duyệt (#35, #30, #29, #38), sửa #32 (**đã
> merge — hợp đồng ingestion 1 là lối ra M3 đầu tiên lên `main`**), mở **#45 hợp đồng API `11`**, rồi tới 22:19 còn sửa
> #26, #39, #45 theo review. Thứ tự làm đúng: việc chặn người khác trước, việc của mình sau.
>
> **Điều cần đổi là giờ bắt đầu.** Tới 17:26 không có hoạt động nào, nên cả buổi sáng bốn PR của người khác đứng chờ.
> **M3 hết hạn hôm nay**, và hai trong ba lối ra còn lại (#39, #45) là của bạn.

## 📌 Mới hôm nay — quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng tới bạn |
|---|---|
| **Chuỗi phiên bản geometry là `dr008a-dr012/v1.0.0`** | Theo `DR-013`, hợp đồng geometry thuộc khối Hùng Anh; hợp đồng API **tiêu thụ** chuỗi đó. #45 phải đổi. Việc 1 |
| **`GATE-MOB-01` đi hướng RN + WebGL2 trong WebView** | #44 (device probe) bạn duyệt hôm nay sẽ được viết lại cho lượt đo **trong app**; duyệt theo hướng đó |
| **Review #33 chuyển sang leader** | #33 của bạn đã có người duyệt |
| **SCR-04 giao cho V1** | V4 của bạn giữ SCR-06, SCR-08 |

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **1** | **#45: đổi `geometry_contract.version` thành `dr008a-dr012/v1.0.0`**, và đổi phép kiểm tiền tố `GEOM_` thành **so khớp chính xác** với phiên bản geometry đã công bố. Chuỗi `GEOM_` (chỉ tiền tố) hiện vẫn qua validator | ~45 ph | Hùng Anh xác nhận chuỗi (việc 2 của anh ấy). Chưa xác nhận thì dùng chuỗi đang có trong #43 và ghi chú lại | Chuỗi của #43 được #45 **chấp nhận** |
| **2** | **Phản hồi lượt duyệt lại #45 và #39 của leader** (bản sửa 22:14–22:15 của bạn). Những điểm review đã nêu: `null` làm sập bằng `AttributeError` (cả `dataset: null` ở hợp đồng ingestion 1 đã merge, sửa cùng một cách cho cả ba), luật suy từ đường dẫn (`{slice_index}` → `SLICE_OUT_OF_RANGE`, `{case_id}` → `CASE_NOT_FOUND`, `geometry_response` → `GEOMETRY_NOT_VALIDATED`, request ghi mask phải mang `geometry_contract_version`), khoá `method`. Sửa và đẩy **trong ngày** | ~1,5 h | leader duyệt lại (buổi sáng). Chưa có thì làm việc 4 trước | #45 và #39 `APPROVED` |
| **3** | **Duyệt #44** (device probe Spike B). Bạn là reviewer Spike B (`DR-006a` rev 3). Soát theo hướng mới: protocol phải chạy được **trong WebView của app**, mọi số do script bắt | ~45 ph | không | review có nội dung |

## Việc Day 9

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **4** | **Lối ra M3 "contract tests run":** thêm job chạy `test_contract1.py`, `test_contract2.py`, `test_api_contract.py` vào `.github/workflows/guardrails.yml`, cạnh job geometry của #43. Khối CI thuộc leader (`DR-013`), nên mở PR và nhờ leader duyệt | ~1,5 h | không | CI chạy đủ job hợp đồng và xanh |
| **5** | **Mock/fixture sinh từ schema API đã chấp nhận.** `11` §11.4 và `09` §12 đòi mock **sinh ra từ** hợp đồng đã chấp nhận, không viết tay. Dùng `contracts/api/generate_fixture.py`; sinh bộ fixture cho các endpoint V1 (slice, geometry, prediction) và V4 (review, working mask, commit, findings) để hai vertical dựng trên đó | ~1,5 h | #45 merge. Chưa merge thì làm việc 6 trước | Bộ fixture sinh tự động trên PR, kèm lệnh sinh lại |
| **6** | **Đề xuất `E10`** theo **5 điều kiện của `DR-015`**: ① sự kiện bắt đầu/kết thúc đồng hồ + máy + đường truyền + hồ sơ payload · ② thống kê kèm p50 · ③ không gộp hai hồ sơ · ④ kèm acceptance test dạng `TC-` · ⑤ ghi rõ giới hạn khung giờ. Nếu leader đo được **`E8` ban ngày lúc 14:00** thì dùng số đó; nếu không thì ghi giới hạn. Mã đã đặt: `PERF-FIRSTLOAD-01` / `TC-PERF-FIRSTLOAD-01` | ~1,5 h | leader vận hành `E8` lúc 14:00 (tuỳ chọn) | Mục `E10` trong `RESULT.md` Spike E đủ 5 điều kiện |
| **7** | **Gói `TC-TEAM-001` V4** theo `10` §10 cho **SCR-06, SCR-08** (UC-13…15): 6 hạng mục. Nguyên liệu: hai hợp đồng ingestion, hợp đồng API (endpoint review/working mask/commit/findings) | ~1 h | không | File `management/evidence/TC_TEAM_001_NGUYEN_GIA_DUC_TRUNG.md`, PR |

**Tổng phần chính: ~8,5 h.**

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **H8–H9 / SCR-06**: lưu mask đã sửa thành **phiên bản
> bất biến mới**, prediction gốc giữ nguyên, checksum nguồn không đổi. `STALE_REVISION` và mọi lỗi hiện ra **đọc được**
> trên màn hình, không phải traceback. Hai chỗ sập `null` ở việc 2 chính là loại lỗi giảng viên sẽ vấp khi thử.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Bản thảo `ADR-ART-001`** (khối của bạn, `DR-013` Axis B; leader là secondary) theo hướng `DR-015` limb 2: loại tải trọn volume, per-slice là hướng V1, bác bản prefetch `s4` đã thử, để mở artifact URL. Làm **sau** `E10` | ~1,5 h | PR nháp |
| **Ma trận trạng thái màn hình SCR-06/SCR-08** theo `10` §8 (loading / không khả dụng / đang xử lý / lỗi thử lại được / dữ liệu hỏng). Thuần thiết kế, không vi phạm `GATE-MOB-01` | ~1 h | vào gói V4 |

---

**Không cần Mac mini hay điện thoại cho việc nào ở trên.** `E8` do leader bấm; bạn thiết kế và đọc số. **Ranh giới:**
không sửa `docs/specs/v1.0/**` · Project Control không tính số `E` hộ bạn · không tự chuyển `ACCEPTED`. **Liên quan:** PR
#26 · #33 · #39 · #44 · #45 · [`../../readiness/OPEN_DECISIONS.md`](../../readiness/OPEN_DECISIONS.md) → `DR-015`
