# 09 — Kiểm thử và truy vết

## 1. Cách kiểm từng yêu cầu

| Lớp kiểm | Lệnh (từ thư mục gốc repo) | Kiểm gì | Job CI |
|---|---|---|---|
| Logic app | `node --test mobile/test/*.test.mjs` | Đúng file `.mjs` chạy trên điện thoại: mô hình màn hình, cache, hợp đồng, bút, toán zoom | `mobile-shell` |
| Render smoke | `cd mobile; npm run test:render` | Vẽ cả app bằng `react-test-renderer`, bấm nút, kiểm chữ trên màn hình (`check('ID', …)`); không thay cho bằng chứng trên máy | `mobile-render-bundle` |
| Backend | `python -m pytest backend/tests backend/mesh/tests` | Mọi endpoint, mọi phản hồi kiểm theo hợp đồng, CSDL, lưới 3D (Python 3.9) | `backend-tests` |
| Hợp đồng | `python test_contract1.py`, `test_contract2.py`, `test_api_contract.py` | Hai hợp đồng nhập liệu và hợp đồng API | `contract-tests` |
| ML | `python -m pytest ml/tests` | Chia dữ liệu, chấm điểm, hậu xử lý, xuất gói (CPU) | `ml-tests` |
| Truy vết | `python tools/trace_check.py --allow-pending docs/trace/pending_branches.txt` | Đặc tả ↔ ma trận ↔ mã ↔ test (mục 3) | `traceability` |
| Luồng API end-to-end | `python tools/e2e/hero_flow_api.py --base-url http://127.0.0.1:8000` | 11 bước H0–H10 của luồng demo qua API thật, từ chối ghi vào host không cục bộ | — (chạy tay) |
| Trên điện thoại | `tools/device/` (phiên A9 / L4, chấm kết quả) | Hiệu năng, cử chỉ, luồng demo trên Galaxy A17 | — (chạy tay) |

## 2. Ca kiểm thử

"Cách kiểm" là tên file test (chi tiết từng test trong ma trận); "+ điện thoại" là cần thêm một lần chạy trên máy để
nghiệm thu.

| ID | Kiểm gì | Cách kiểm | Người phụ trách | Trạng thái |
|---|---|---|---|---|
| TC-CASE-001 | Danh sách ca ẩn danh; chọn ca thì mở ca | v1, render smoke, test_api | Phạm Tuấn Anh | Đã có |
| TC-CASE-002 | Chế độ ca nhất quán ở danh sách, chi tiết và giao diện | v1, render smoke, test_api | Phạm Tuấn Anh | Đã có |
| TC-MRI-001 | Lát k hiện đúng ảnh và "k / tổng" | test_api, v1, render smoke + điện thoại | Phạm Tuấn Anh | Đã có |
| TC-MRI-002 | Kéo thanh lát và nút bước đổi lát xác định; khi vẽ ở SCR-06 không điều hướng | v1, v4_review_screen, render smoke + điện thoại | Phạm Tuấn Anh | Đã có |
| TC-MRI-003 | Đổi ca / run không để lại lớp hay số của ca / run trước | v1_model, render smoke | Phạm Tuấn Anh | Đã có |
| TC-MASK-001 | Lớp mask khớp ảnh qua zoom / di | view_math, v1_model, render smoke, imaging + điện thoại | Phạm Tuấn Anh | Đã có |
| TC-MASK-002 | Không hỏi và không hiện lớp GT khi không có GT | v1_model, render smoke, test_api | Phạm Tuấn Anh | Đã có |
| TC-MASK-003 | Bật / tắt và độ mờ không đổi hình học mask | v1_model, v1_outline | Phạm Tuấn Anh | Đã có |
| TC-MASK-004 | RAW / PROCESSED hiện đúng biến thể đã hỏi, không thay ngầm | v1_model, render smoke, test_api | Phạm Tuấn Anh | Đã có |
| TC-ERR-001 | TP / FP / FN trên cặp mask mẫu bằng đúng phép logic | imaging, v1_error, v1_outline, test_evaluate | Phạm Tuấn Anh | Đã có |
| TC-ERR-002 | Chú giải và lớp vẽ khớp số tính được và mã mask | v1_error, render smoke | Phạm Tuấn Anh | Đã có |
| TC-ERR-003 | Lát tệ nhất mở đúng ca / run / lát và giữ ngữ cảnh | render smoke, v1_error | Phạm Tuấn Anh | Đã có |
| TC-MODE-001 | Ca chỉ suy luận không có Dice / IoU / FP / FN hay nút cần GT; trạng thái "không có" nói đúng | render smoke, v1_model, test_api | Phạm Tuấn Anh | Đã có |
| TC-MOBILE-STATE-001 | Màn hình chính đi qua đủ trạng thái tải, không có, xử lý, lỗi, thử lại, chặn dữ liệu sai | stateCopy, api_states, v1_model, render smoke + điện thoại | Phạm Tuấn Anh | Đã có |
| TC-USAB-001 | Luồng chính làm được bằng cảm ứng trên thiết bị mục tiêu | render smoke + điện thoại | Phạm Tuấn Anh | Một phần: chưa ghi phiên trên APK gộp |
| TC-USAB-003 | Trạng thái thiếu GT dễ hiểu, không trông như lỗi bằng 0 | stateCopy, render smoke, v1_error + điện thoại | Phạm Tuấn Anh | Đã có |
| TC-USAB-004 | Nút chính đạt kích thước chạm tối thiểu | cần test style + điện thoại | Phạm Tuấn Anh | Chưa có |
| TC-PERF-001 | 30 bước chuyển lát đã cache p95 ≤ 200 ms, không tải cả khối | v1, render smoke + điện thoại | Phạm Tuấn Anh | Một phần: chờ đo trên APK gộp |
| TC-MAINT-001 | Bản đồ sở hữu thể hiện ranh giới module | registry | Phạm Tuấn Anh | Đã có |
| TC-AUDIT-001 | `tools/trace_check.py`: ID đặc tả = ID ma trận, MUST "Đã có" có test, tham chiếu tồn tại | test_trace_check | Phạm Tuấn Anh | Đã có |
| TC-3D-001 | Lưới dựng từ đúng mask nguồn đã khai, giữ phiên bản hình học | test_meshes, v2_inspector3d | Vũ Hùng Anh | Đã có |
| TC-3D-002 | Xoay / zoom / di không đổi ánh xạ nguồn; đạt TC-PERF-002 | v2_viewer + điện thoại | Vũ Hùng Anh | Một phần: sau khi xoay chỉ kiểm "lát trong khoảng"; chờ đo trên máy |
| TC-3D-003 | Lát k đặt dải lát đúng vị trí theo fixture hình học chuẩn | v2_viewer | Vũ Hùng Anh | Một phần: chưa so dải lát với fixture hình học |
| TC-3D-004 | Điểm đã biết trên lưới cho đúng lát, kể cả sau khi xoay / zoom | v2_viewer, test_mesh_conformance + điện thoại | Vũ Hùng Anh | Một phần: sau khi xoay / zoom chưa kiểm đúng lát |
| TC-3D-005 | Vùng lỗi mẫu: đúng loại lỗi, dẫn tới đúng lát | test_mesh_error_geometry, v2_inspector3d, render smoke + điện thoại | Vũ Hùng Anh | Đã có |
| TC-PERF-002 | Tương tác 3D đạt NFR-PERF-002 trên thiết bị demo | + điện thoại | Vũ Hùng Anh | Một phần: chờ đo trên APK gộp |
| TC-REL-003 | Lệch phiên bản hình học bị từ chối / báo không có, không vẽ như đã khớp | test_mesh_conformance, test_meshes, render smoke, v2_inspector3d, api_client | Vũ Hùng Anh | Đã có |
| TC-SCI-002 | Chặn mL / khoảng cách thật khi hình học chưa kiểm định | test_api, render smoke | Vũ Hùng Anh | Đã có |
| TC-MAINT-002 | Mã hình học backend và app qua cùng bộ fixture chuẩn | v2_viewer, test_mesh_conformance | Vũ Hùng Anh | Một phần: phía app dùng file mẫu Python, chưa dùng fixture chuẩn |
| TC-STUDY-001 | Tổng quan nạp bộ dữ liệu, tóm tắt ca / thí nghiệm, điều hướng, không bịa số | v3_screens, v3_model, render smoke + điện thoại | Bế Quốc Khánh | Đã có |
| TC-EXP-001 | Manifest thí nghiệm đủ cấu hình, split, tiền / hậu xử lý, seed, checkpoint, mã nguồn, phiên bản đánh giá | test_export_contract2 | Bế Quốc Khánh | Đã có |
| TC-EXP-002 | Giá trị từng ca trỏ đúng mask và khớp khi tính lại | test_evaluate, test_api | Bế Quốc Khánh | Đã có |
| TC-EXP-003 | Tổng hợp cohort tính lại từ giá trị từng ca; N dự kiến / thành công | test_evaluate, test_api | Bế Quốc Khánh | Đã có |
| TC-EXP-004 | Có đủ run UNet và DINOv2 25 / 50 / 100 % với tập con lồng nhau | test_data | Bế Quốc Khánh | Hướng phát triển |
| TC-EXP-005 | Ablation thô / hậu xử lý dùng cùng dự đoán thô, cùng checkpoint, một cấu hình PP đóng băng | test_postprocess | Bế Quốc Khánh | Đã có |
| TC-EXP-006 | Chọn ca / ca bất thường từ phân tích mở đúng bằng chứng | render smoke, v3_screens + điện thoại | Bế Quốc Khánh | Đã có |
| TC-EXP-007 | Lệch split / quần thể / phiên bản / biến thể / chính sách tham chiếu thì "không so sánh được" | test_evaluate, v3_model | Bế Quốc Khánh | Một phần: server chưa kiểm loại mask tham chiếu và hình học, chưa có test nhánh false ở backend |
| TC-EXP-008 | Không ca nào nằm ở hai tập; tập con lồng nhau | test_data, test_api | Bế Quốc Khánh | Đã có |
| TC-EXP-009 | Luật Dice lát rỗng và chỉ số 3D theo ca | test_evaluate | Bế Quốc Khánh | Đã có |
| TC-REP-001 | Thí nghiệm báo cáo truy được cấu hình, checkpoint, split, phiên bản | test_api, test_export_contract2 | Bế Quốc Khánh | Đã có |
| TC-REP-002 | Chia theo ca, gộp ca trùng, sàng lọc giống nhau; test rò rỉ qua | test_evaluate | Bế Quốc Khánh | Đã có |
| TC-REP-003 | Màn hình hiện số đo ghi mức tổng hợp, quần thể và N | v3_screens | Bế Quốc Khánh | Đã có |
| TC-REP-004 | Bộ kiểm "so sánh được" áp đủ điều kiện | test_evaluate | Bế Quốc Khánh | Một phần: bộ kiểm của server thiếu hai điều kiện |
| TC-SCI-001 | App / báo cáo ghi LASC 2018, không gọi số đo là tái lập LAScarQS | v3_upgrades | Bế Quốc Khánh | Một phần: chưa có câu "không phải tái lập LAScarQS 2022" |
| TC-SCI-003 | Bảng kết quả sinh từ tổng hợp đóng băng, giữ thứ tự quan sát | test_unet_kit | Bế Quốc Khánh | Đã có |
| TC-REV-001 | Chuyển trạng thái review: hợp lệ thì qua, sai / cũ thì lỗi mà không mất trạng thái hay lịch sử | test_api, v4_review_model | Nguyễn Gia Đức Trung | Đã có |
| TC-REV-002 | Bút thêm / xoá chỉ đổi pixel định sửa; GT không là nguồn | v4_brush, test_api | Nguyễn Gia Đức Trung | Đã có |
| TC-REV-003 | Sau zoom / di, vẽ ở toạ độ màn hình biết trước đổi đúng pixel nguồn | v4_brush, v4_review_screen + điện thoại | Nguyễn Gia Đức Trung | Đã có |
| TC-REV-004 | Undo / redo tái lập lịch sử; reset về đúng nguồn của phiên chưa lưu | v4_brush, render smoke | Nguyễn Gia Đức Trung | Đã có |
| TC-REV-005 | Lưu tạo phiên bản mới; mở lại thấy đúng nét sửa và nguồn | test_api, v4_review_screen, render smoke, hero_flow_api + điện thoại | Nguyễn Gia Đức Trung | Đã có |
| TC-REV-006 | Checksum mask nguồn không đổi sau khi lưu; phiên bản cũ bất biến | test_api, v4_brush, render smoke | Nguyễn Gia Đức Trung | Đã có |
| TC-FIND-001 | Finding giữ tham chiếu study / ca / run / lát / vùng; mở lại về đúng bằng chứng | v4_findings_screen, test_api, render smoke + điện thoại | Nguyễn Gia Đức Trung | Đã có |
| TC-FIND-002 | Sửa ghi chú / trạng thái không đổi nguồn; loại / trạng thái sai bị từ chối | test_api, v4_findings_model | Nguyễn Gia Đức Trung | Đã có |
| TC-PERF-003 | Phản hồi bút và không mất mẫu đạt NFR-PERF-003 | v4_brush + điện thoại | Nguyễn Gia Đức Trung | Một phần: chờ đo trên APK gộp |
| TC-REL-001 | Checksum chứng minh MRI / GT / dự đoán gốc không đổi qua thao tác thường | test_api, hero_flow_api | Nguyễn Gia Đức Trung | Một phần: mới băm lại dự đoán gốc, chưa băm MRI và GT |
| TC-REL-002 | Ngắt giữa lúc lưu không làm hỏng bản đã lưu; thử lại an toàn | test_api, v4_review_model, render smoke + điện thoại | Nguyễn Gia Đức Trung | Đã có |
| TC-SEC-005 | Danh sách siêu dữ liệu cho phép từ chối trường định danh lạ | test_contract1, hardening_regression | Nguyễn Gia Đức Trung | Đã có |
| TC-USAB-002 | Chế độ vẽ / di không gây vẽ nhầm hay điều hướng nhầm | v4_review_screen + điện thoại | Nguyễn Gia Đức Trung | Một phần: chưa ghi lần chạy kịch bản trên máy |
| TC-SEC-001 | App và CSDL chạy không cần danh tính; fixture chỉ có mã ẩn danh | config, test_contract1 | Cả nhóm | Đã có |
| TC-SEC-002 | Hồ sơ cục bộ đúng như khai (loopback qua USB) | cleartextPlugin + điện thoại | Cả nhóm | Một phần: chưa ghi kiểm tra cổng, chưa chặn HTTP tới host lạ |
| TC-SEC-003 | Log không có byte ảnh / mask, bí mật hay siêu dữ liệu thừa | test_api, netlog | Cả nhóm | Đã có |
| TC-SEC-004 | Quét bí mật trong repo và bundle app | CI `no-forbidden-bytes` | Cả nhóm | Một phần: CI chỉ kiểm tên / đuôi file, chưa quét nội dung và bundle |
| TC-MAINT-003 | Module quan trọng có test đăng ký trong CI | registry | Cả nhóm | Đã có |
| TC-E2E-001 | Luồng demo MRI → dự đoán → lỗi → 3D → liên kết → rà soát / sửa → bản đã lưu, trên main | hero_flow_api, render smoke + điện thoại | Cả nhóm | Một phần: chưa chạy trên điện thoại với bản gộp |
| TC-USAB-005 | Luồng demo chạy 5 lần liền trên thiết bị / bản build mục tiêu | + điện thoại | Cả nhóm | Chưa có |
| TC-PERF-004 | Yêu cầu bất đồng bộ đạt NFR-PERF-004 | — | Cả nhóm | Hướng phát triển |
| TC-AN-001 | Vòng đời lượt chạy phân tích | — | Cả nhóm | Hướng phát triển |
| TC-METRIC-001 | HD95 kiểm theo fixture khoảng cách bề mặt | — | Bế Quốc Khánh | Hướng phát triển |

## 3. Ma trận truy vết và bước kiểm tra tự động

[`docs/trace/matrix.csv`](../trace/matrix.csv) có một dòng cho mỗi chi tiết của một yêu cầu (một ID có thể có nhiều
dòng, phân biệt bằng `sub_item`). Ma trận viết bằng tiếng Anh ngắn gọn vì nó trích tên hàm và tên test. Cột:

| Cột | Nghĩa |
|---|---|
| `id`, `sub_item` | ID trong đặc tả và chi tiết (rỗng = dòng chính) |
| `spec_doc`, `owner` | File đặc tả định nghĩa ID; người phụ trách (V1–V4 hoặc CHUNG) |
| `priority`, `status`, `action` | MUST / SHOULD / COULD; DONE / PARTIAL / NOT_DONE / FUTURE_WORK; NONE / IMPLEMENT / DEVICE_RUN / FUTURE_WORK |
| `code_refs`, `test_refs` | `đường-dẫn:ký-hiệu; …` — ký hiệu phải có nguyên văn trong file; test là một phần tên `test('…')`, một `check('ID'` của render smoke, hoặc tên `def` pytest |
| `device_evidence` | yes = cần một lần chạy trên điện thoại để nghiệm thu |
| `pending_branch` | Nhánh chưa gộp chứa mã của dòng này (`shell`, `v1` … `v4`, nối bằng `+`) |
| `gap`, `source` | Chỗ còn thiếu; ID của bản kiểm tra đặc tả cũ mà dòng này kế thừa (`CNS:n` = tính năng có trong mã nhưng đặc tả cũ chưa có) |

Quy tắc trạng thái: DONE đi với NONE; PARTIAL / NOT_DONE phải ghi `gap` và có IMPLEMENT (cần mã hoặc test) hoặc
DEVICE_RUN (chỉ còn chạy trên điện thoại); FUTURE_WORK đi với FUTURE_WORK. Trạng thái của một ID trong các bảng đặc tả
là tổng hợp các dòng không phải FUTURE_WORK: tất cả DONE → "Đã có"; tất cả NOT_DONE → "Chưa có"; còn lại → "Một phần".

`tools/trace_check.py` (chỉ dùng thư viện chuẩn Python) báo lỗi và thoát mã 1 khi:

1. một ID có trong `docs/spec/*.md` mà không có dòng trong ma trận, hoặc ngược lại;
2. giá trị ma trận sai, trùng `(id, sub_item)`, hay các dòng của một ID khác mức;
3. một dòng MUST đã DONE mà không trích test nào;
4. một tham chiếu mã không có file hoặc file không chứa ký hiệu; một tham chiếu test không tìm thấy test;
5. các chỗ ghim phiên bản hợp đồng lệch nhau, khác phiên bản `06_api.md` nêu, endpoint của hợp đồng khác tập `EP-*`,
   hay mã lỗi của hợp đồng khác các dòng của API-02;
6. cột "Mức" / "Trạng thái" của bảng đặc tả khác ma trận; ID dưới mục "Hướng phát triển" khác tập ID có dòng
   FUTURE_WORK.

Test của chính bước kiểm tra: `python -m pytest tools/tests` (hoặc `python -m unittest discover -s tools/tests`).

**Hiện nay (trước khi gộp)**: mã của nhiều dòng chỉ có trên 5 nhánh tính năng. CI chạy
`python tools/trace_check.py --allow-pending docs/trace/pending_branches.txt`: tham chiếu không tìm thấy trên một dòng
có `pending_branch` nằm trong danh sách được báo **PENDING** thay vì lỗi; phiên bản hợp đồng (main 1.1.0, đặc tả 1.2.0)
và endpoint `review_history_list` cũng được nới như vậy.

**Sau khi gộp cả 5 nhánh vào main**: xoá `docs/trace/pending_branches.txt`, đổi job `traceability` sang
`python tools/trace_check.py --strict`. Chế độ nghiêm ngặt không chấp nhận tham chiếu nào thiếu; nó in danh sách các
dòng mà `pending_branch` có thể xoá cho gọn. Muốn kiểm trước trên một bản gộp thử ở thư mục khác:
`python tools/trace_check.py --strict --code-root <thư-mục-bản-gộp>`.
