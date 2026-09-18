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
| **3** | **Duyệt #44** (device probe Spike B). Bạn là reviewer Spike B (`DR-006a` rev 3). Soát theo hướng mới: protocol phải chạy được **trong WebView của app**, mọi số do script bắt. Nền tảng đã được kiểm giúp bạn đêm qua: WebView của A17 cho **WebGL2 thật**, renderer `Mali-G68` (PR nháp #46), nên bạn chỉ soát protocol | ~45 ph | không | review có nội dung |
| **3b** | **Sửa #33 theo [review 01:38](https://github.com/Drake-Phamta/cardiac-mri-workspace/pull/33)** — `CHANGES_REQUESTED`, **mã shell không phải sửa gì**, chỉ tài liệu. Leader đã chạy thật bộ harness của bạn trên A17 và cả bốn điều kiện đều đúng như bạn mô tả (mặc định `attempts 1`; lỗi HTTP không thử lại; phục hồi `attempts 4 · network_retries 3 · ok true`; cạn lượt dừng đúng ở `attempts 3`). Hai chỗ chặn: ① **cả hai khối lệnh thoát mã 2**: qua `adb shell`, `--operator 'Pham Tuan Anh'` bị tách thành hai tham số — dạng chạy được là gộp cờ và giá trị vào **một** phần tử, có nháy cho shell trên máy · ② **mốc thời gian tự mâu thuẫn**: mất 3 s rồi khôi phục **trong** cửa sổ chờ 15 s thì yêu cầu mesh gặp đường đã sống lại, cho `network_retries 0`, trong khi dòng nghiệm thu đòi `> 0`. Kèm 5 góp ý không chặn (tên trường `ms_including_local_rejections` nay gồm cả thời gian chờ thử lại, địa chỉ Mac mini ở khối AVD khác khối máy thật, đường dẫn `adb` cứng theo máy bạn) | ~45 ph | không | #33 `APPROVED` |

## Việc Day 9

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **4** | **Lối ra M3 "contract tests run":** thêm job chạy `test_contract1.py`, `test_contract2.py`, `test_api_contract.py` vào `.github/workflows/guardrails.yml`, cạnh job geometry của #43. Khối CI thuộc leader (`DR-013`), nên mở PR và nhờ leader duyệt | ~1,5 h | không | CI chạy đủ job hợp đồng và xanh |
| **5** | **Mock/fixture sinh từ schema API đã chấp nhận.** `11` §11.4 và `09` §12 đòi mock **sinh ra từ** hợp đồng đã chấp nhận, không viết tay. Dùng `contracts/api/generate_fixture.py`; sinh bộ fixture cho các endpoint V1 (slice, geometry, prediction) và V4 (review, working mask, commit, findings) để hai vertical dựng trên đó | ~1,5 h | #45 merge. Chưa merge thì làm việc 6 trước | Bộ fixture sinh tự động trên PR, kèm lệnh sinh lại |
| — | **📌 Mới 14:00 — `E8` ban ngày KHÔNG đo được hôm nay.** Lúc 13:55 điện thoại, Mac mini và máy trạm cùng ở Wi-Fi `B14-PTIT` (`10.170.75.x`), nên đường ZeroTier `DIRECT` đi trong LAN, khác hẳn đường Internet của lượt 16/09; đo lúc đó thì giờ-trong-ngày bị lẫn với đổi đường. Leader quyết **đo tối nay ở nhà**. Hệ quả cho bạn: vẫn **chưa có khung ban ngày**, nên điều kiện 5 của `DR-015` phải ghi rõ giới hạn đó trong `E10` | — | — | — |
| — | **📌 Mới 21:40 — M3 chỉ còn thiếu PR của bạn.** #43 (geometry) đã merge; ingestion 1, ingestion 2, API đã ở `main` từ trước. **Nhánh `ci/day9-contract-tests-trung` (14:02) chưa có PR** — mở PR ngay để leader duyệt; đó là lối ra cuối của M3. Đồng thời `GATE-DATA-01` đã đóng, nên Khánh sẽ sinh lại **#35** — bạn duyệt lại để đóng `GATE-SPLIT-01`. **#44** (probe `B10`/`B11` của Hùng Anh) vẫn chờ review của bạn và chặn bằng chứng tối nay | ~1 h | không | PR CI mở · #35 và #44 có review |
| — | **📌 Mới 16:30 — `E8` khung chiều ĐÃ ĐO được, thay cho mục 14:00 ở trên.** Khi điện thoại về lại Wi-Fi nhà, đường đi lại đúng như 16/09 (peer `DIRECT` qua `171.224.180.45`). Hai profile đo **16:16–16:27**, mỗi profile **171/171 mẫu `ok`**, 3 lượt lặp. Dữ liệu thô, log stub và `PROVENANCE.md` nằm trên nhánh **`spike-e/evidence-20260918`** (`EVIDENCE_RAW/20260918_afternoon/`). **Chưa tính số nào — phần đó là của bạn.** Lưu ý: stub trên Mac mini đã được dựng lại ở đúng commit `a585907` vì thư mục payload cũ không còn; payload sinh lại khớp từng kích thước với manifest 16/09, `PROVENANCE` ghi đầy đủ. Lượt 15:58 trả 404 toàn bộ, bị loại, không nằm trong nhánh | ~1 h | không | aggregate hai khung `E8` (tối 16/09 · chiều 18/09) vào `RESULT.md` |
| — | **📌 Mới 15:29 — leader đã quyết về `E10` và duyệt lại #33.** ① **`E10` được nhận ở trạng thái `PROVISIONAL`** (p95 ≤ 3 500 ms mỗi profile, định nghĩa của bạn giữ nguyên), kèm **hai sửa** để thành ràng buộc: `TC-PERF-FIRSTLOAD-01` phải có vòng đo riêng chỉ gồm cold-open, **≥ 20 mẫu mỗi profile** (hiện chỉ có 3 mẫu, nên "p95" chính là mẫu tệ nhất); và con số được xem lại sau lượt `E8` tối nay. Chi tiết trên [#26](https://github.com/Drake-Phamta/cardiac-mri-workspace/pull/26) và `OPEN_DECISIONS` → `DR-015` · ② **#33 vẫn `CHANGES_REQUESTED`**: mốc thời gian đã đúng, nhưng dạng `'--operator "Pham Tuan Anh"'` **bị PowerShell 5.1 bỏ nháy kép** → điện thoại nhận ba tham số rời. Dạng chạy được là `"--operator 'Pham Tuan Anh'"`; địa chỉ khối máy thật vẫn phải là `10.64.193.115` | ~45 ph | không | #26 cập nhật hai sửa · #33 `APPROVED` |
| **6** | **Đề xuất `E10`** theo **5 điều kiện của `DR-015`**: ① sự kiện bắt đầu/kết thúc đồng hồ + máy + đường truyền + hồ sơ payload · ② thống kê kèm p50 · ③ không gộp hai hồ sơ · ④ kèm acceptance test dạng `TC-` · ⑤ ghi rõ giới hạn khung giờ. Nếu leader đo được **`E8` ban ngày lúc 14:00** thì dùng số đó; nếu không thì ghi giới hạn. Mã đã đặt: `PERF-FIRSTLOAD-01` / `TC-PERF-FIRSTLOAD-01` | ~1,5 h | leader vận hành `E8` lúc 14:00 (tuỳ chọn) | Mục `E10` trong `RESULT.md` Spike E đủ 5 điều kiện |
| **7** | **Gói `TC-TEAM-001` V4** theo `10` §10 cho **SCR-06, SCR-08** (UC-13…15): 6 hạng mục. Nguyên liệu: hai hợp đồng ingestion, hợp đồng API (endpoint review/working mask/commit/findings) | ~1 h | không | File `management/evidence/TC_TEAM_001_NGUYEN_GIA_DUC_TRUNG.md`, PR |

**Tổng phần chính: ~9,25 h** *(đã gồm việc 3b mới nhận)*. **Nếu chạm trần thời gian:** việc 7 (gói `TC-TEAM-001` V4,
~1 h) được lùi sang đầu Day 10, miễn là bạn **báo trước 18:00**. Việc chặn người khác thì không được lùi.

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
