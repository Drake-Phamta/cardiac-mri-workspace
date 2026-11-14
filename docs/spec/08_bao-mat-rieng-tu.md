# 08 — Bảo mật và quyền riêng tư

App chỉ dùng cho nghiên cứu và học tập, không dùng để chẩn đoán. Dữ liệu là bộ LASC 2018 đã ẩn danh; app chỉ thấy mã
giả danh `CASE_0001` … `CASE_0154`. Mọi biện pháp dưới đây đều có trong mã (cột "Ở đâu"); ID nối tới yêu cầu ở
[03_yeu-cau-phi-chuc-nang.md](03_yeu-cau-phi-chuc-nang.md) và tới test trong ma trận.

## 1. Phần chung của cả nhóm

| Biện pháp | Ở đâu | ID |
|---|---|---|
| Dữ liệu lấy từ nguồn chính thức, ghi URL, ngày, checksum; giữ điều khoản, không phân phối lại | `data/manifests/dataset_manifest.json`, trang "About this data" | PR-PRIV-01 |
| Không lưu tên, ngày sinh, số định danh, số hồ sơ, liên lạc; chỉ mã ca ẩn danh và siêu dữ liệu kỹ thuật cần cho hình học | Mô hình dữ liệu backend, fixture, hợp đồng API | NFR-SEC-001, PR-PRIV-02 |
| Nhập liệu chỉ nhận siêu dữ liệu trong danh sách cho phép; trường lạ bị từ chối (`METADATA_NOT_ALLOWED`) | `contracts/ingestion/contract1_raw_dataset/` | NFR-SEC-005 |
| Ảnh, mask, checkpoint, gói kết quả, CSDL nằm ngoài repo (`CARDIAC_BACKEND_DATA`); backend từ chối đường dẫn nằm trong git work tree | `backend/app/config.py` | NFR-SEC-004 |
| CI chặn file ảnh y tế, checkpoint, secret, file > 10 MB và địa chỉ IPv4 nội bộ trong mỗi thay đổi | Job `no-forbidden-bytes` trong `.github/workflows/guardrails.yml` | NFR-SEC-004 |
| App chỉ mang địa chỉ backend, không có token hay khoá nào | `mobile/src/config.mjs` | NFR-SEC-004 |
| Log request mỗi dòng có phương thức, route, mã trạng thái, thời gian, số byte, các mã ẩn danh (ca, lát, run, review, thí nghiệm, digest sản phẩm) và giá trị query trong danh sách cho phép; không có địa chỉ client, header, thân request hay byte ảnh | `backend/app/middleware.py` (`RequestLogMiddleware`) | NFR-SEC-003 |
| Backend chỉ nghe `127.0.0.1`; điện thoại vào qua cáp USB (`adb reverse`); không có mạng overlay hay máy chủ công khai | `backend/scripts/run_local.ps1`, `docs/DECISIONS.md` mục 4 | NFR-SEC-002, NFR-SEC-013 |
| Thân request tối đa 1 MiB (413), phương thức lạ trả 405 theo mẫu lỗi, trang tài liệu OpenAPI tắt, không bật CORS nếu không khai báo | `backend/app/middleware.py`, `backend/app/main.py` | NFR-SEC-013 |
| Thư mục dữ liệu không bao giờ được phục vụ dạng liệt kê; byte chỉ trả theo sha256 đã biết | Route `/api/v1/artifacts/<sha256>` | NFR-SEC-013 |

## 2. Phạm Tuấn Anh — SCR-02, SCR-03, SCR-04, khung app

| Biện pháp | Ở đâu | ID |
|---|---|---|
| Privacy mode ở SCR-03 / SCR-04, bật mặc định: chụp, quay, chiếu màn hình ra màu đen, ảnh bị ẩn trong danh sách app gần đây (cần APK có `expo-screen-capture`; APK cũ ghi "not available in this build") | `mobile/src/lib/privacy.mjs`, `lib/screenCapture.js` | NFR-SEC-007 |
| Che màn hình sau 5 phút ở nền hoặc 10 phút không chạm | `mobile/src/components/session.mjs`, `SessionCover.js` | NFR-SEC-006 |
| "Clear cached images" ở About this screen và lớp che phiên; từ chối khi còn nét sửa chưa lưu | `components/session.mjs`, `navigation/Navigator.js` | NFR-SEC-006 |
| Cache chỉ trong RAM, có giới hạn, khoá theo phiên bản, checksum, biến thể; không ghi file | `mobile/src/api/cache.mjs` | NFR-SEC-008 |
| Log mạng theo cử chỉ (logcat) ghi mã ca, lát, endpoint, mã HTTP, kích thước và thời gian; không có URL, host hay nội dung | `mobile/src/api/http.mjs` | NFR-SEC-003 |
| Mã và checksum nằm trong thẻ Provenance gập sẵn, không hiện mặc định | `mobile/src/components/Provenance.js` | FR-MRI-007 |
| Ca không GT không bao giờ có số đo cần GT | `mobile/src/lib/caseMode.mjs` | PR-MODE-01 |

## 3. Vũ Hùng Anh — SCR-05, lưới 3D

| Biện pháp | Ở đâu | ID |
|---|---|---|
| WebView chạy ẩn danh, không cache, không DOM storage, không cookie; vào trang chỉ có hình học voxel (không mã ca, run, mask, địa chỉ server hay checksum); rời màn hình thì giải phóng bộ nhớ GPU | `mobile/src/screens/v2-3d/Inspector3DScreen.js`, `inspector3d.mjs`, `viewerHtml.mjs` | NFR-SEC-009 |
| Không hiện mm, mL; trục ghi theo voxel, không ghi hướng giải phẫu vì hình học chưa kiểm định | `viewerHtml.mjs`, hợp đồng (`unvalidated_geometry_rule`) | PR-SCI-02 |
| Lưới và file lỗi dẫn xuất ghi ra thư mục ngoài repo, ghi một lần, kiểm sha256 mỗi lần đọc | `backend/mesh/build_cache.py`, `backend/app/meshes.py` | FR-3D-001 |

## 4. Bế Quốc Khánh — SCR-01, SCR-07

| Biện pháp | Ở đâu | ID |
|---|---|---|
| Trang "About this data": nguồn LASC 2018, điều khoản, mã ca giả danh, chỉ số tổng hợp, "chỉ dùng cho nghiên cứu" | `mobile/src/screens/v3-study/about.mjs`, `AboutDataSheet.js` | NFR-SEC-012 |
| SCR-01 và SCR-07 chỉ hiện số tổng hợp và chỉ số từng ca, không có ảnh; ca chỉ suy luận là dòng WITHHELD không có số | `screens/v3-study/readers.mjs`, `view.mjs` | UC-16 |

## 5. Nguyễn Gia Đức Trung — SCR-06, SCR-08, API backend

| Biện pháp | Ở đâu | ID |
|---|---|---|
| Kiểm chữ tự do (ghi chú finding, lý do gắn cờ) ngay khi gõ: tối đa 500 ký tự (quá thì chặn); cảnh báo ngày tháng, dãy số giống CCCD / số điện thoại, email, danh xưng + tên; cảnh báo không chặn ("Create anyway", "Flag anyway") | `mobile/src/screens/v4-review/notes.mjs`, `NoteCheck.js` | NFR-SEC-010 |
| Mọi thao tác ghi lưu bí danh `CARDIAC_REVIEWER_ALIAS` (mặc định `project-reviewer`); header `X-Reviewer-Id` hợp lệ có thể nêu bí danh khác; bí danh có `@` bị bỏ, nên không bao giờ lưu email | `backend/app/config.py`, `backend/app/routes/reviews.py` | NFR-SEC-011 |
| PDF finding: mọi ghi chú được escape HTML, không có ảnh, ghi "Research use only" | `screens/v4-review/findings.mjs`, `pdfExport.js` | FR-FIND-007 |
| Lịch sử review và finding chỉ thêm, không sửa, không xoá (trigger SQLite) | `backend/app/storage.py` | NFR-REL-001 |
| Mask đã sửa không bao giờ được gọi là ground truth | `screens/v4-review/ReviewCorrectionScreen.js` | FR-REV-010 |

## 6. Chỗ còn thiếu (đã biết)

- Bản live cho phép HTTP tới mọi host; cần chặn `http://` tới host không phải loopback (NFR-SEC-002).
- Log truy cập của uvicorn trên console còn in địa chỉ 127.0.0.1; cần chạy với `--no-access-log` (NFR-SEC-003).
- Chưa ghi lại kiểm tra cổng cho thấy backend chỉ nghe `127.0.0.1` (NFR-SEC-013).
- Kiểm chữ tự do chỉ làm trên điện thoại; server nhận ghi chú finding tới 4000 ký tự mà không kiểm (NFR-SEC-010).
