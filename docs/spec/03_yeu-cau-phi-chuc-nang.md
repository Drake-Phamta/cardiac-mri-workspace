# 03 — Yêu cầu phi chức năng

Thiết bị mục tiêu: **Samsung Galaxy A17, Android 16**, app chỉ chạy **màn hình dọc** (`mobile/app.json`). Backend chạy
trên máy tính của nhóm (Windows), điện thoại nối qua cáp USB. Các con số dưới đây đã đo trên bản thử nghiệm
(`docs/RESULTS.md` mục 2); bản APK gộp cuối cùng còn phải đo lại, nên các dòng đó ghi "Một phần".

## 1. Hiệu năng

| ID | Yêu cầu | Cách kiểm | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| NFR-PERF-001 | Chuyển sang lát đã cache: p95 ≤ 200 ms qua 30 bước; không tải cả khối 3D mỗi cử chỉ (tải từng lát PNG) | Kịch bản A9 / L4 trên điện thoại (nhấn giữ nhãn lát), log mạng theo cử chỉ; bản thử nghiệm p95 98,72 ms | Phạm Tuấn Anh | MUST | Một phần: chờ đo trên APK gộp |
| NFR-PERF-002 | Xoay / zoom 3D: FPS trung vị ≥ 20, không khựng > 500 ms | Đo FPS trên điện thoại; bản thử nghiệm lưới L0 đạt 59,88 FPS | Vũ Hùng Anh | MUST | Một phần: chờ đo SCR-05 có lớp lỗi trên APK gộp |
| NFR-PERF-003 | Nét bút phản hồi ≤ 100 ms trên máy, không mất mẫu nào đã vẽ | Test không mất mẫu (tự động); đo thời gian trên điện thoại, bản thử nghiệm tối đa 30,48 ms | Nguyễn Gia Đức Trung | MUST | Một phần: chờ đo trên APK gộp |
| NFR-PERF-004 | Yêu cầu bất đồng bộ trả lời trong 2 s, giao diện không đứng | — | Cả nhóm | MUST | Hướng phát triển |

## 2. Khả dụng

| ID | Yêu cầu | Cách kiểm | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| NFR-USAB-001 | Mọi thao tác chính làm được bằng cảm ứng trên thiết bị mục tiêu, màn hình dọc | Render harness (tự động) và một phiên dùng thử ghi lại trên điện thoại | Phạm Tuấn Anh | MUST | Một phần: chưa ghi phiên dùng thử trên APK gộp |
| NFR-USAB-002 | Cử chỉ vẽ không bao giờ gây điều hướng; thao tác làm mất dữ liệu (rời màn hình khi chưa lưu, Reset, Cancel) phải hỏi xác nhận | Test bộ điều khiển cử chỉ, render smoke | Phạm Tuấn Anh | MUST | Đã có |
| NFR-USAB-003 | Tính năng cần GT nói rõ khi không dùng được; chú giải và chỉ số không dựa vào màu đơn thuần (có hình, chữ) | Test và render smoke | Phạm Tuấn Anh | MUST | Đã có |
| NFR-USAB-004 | Nút chính ≥ 48 dp (`MIN_TOUCH`), không có điểm chạm nhỏ cho thao tác sửa | Đọc style, cần một test style | Phạm Tuấn Anh | MUST | Một phần: chip RAW / PROCESSED / Run…, nút "Refresh this slice", "Fetch the image again", "Details" và nhãn lát còn 40 dp |
| NFR-USAB-005 | Luồng demo chính chạy thành công 5 lần liền trên thiết bị mục tiêu | Chạy trên điện thoại, ghi kèm bản build | Cả nhóm | MUST | Chưa có |

## 3. Bảo mật và riêng tư

Chi tiết từng biện pháp và nơi trong mã: [08_bao-mat-rieng-tu.md](08_bao-mat-rieng-tu.md).

| ID | Yêu cầu | Cách kiểm | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| NFR-SEC-001 | Không cần và không lưu thông tin định danh bệnh nhân; chỉ mã ca ẩn danh và siêu dữ liệu kỹ thuật | Test backend, fixture | Cả nhóm | MUST | Đã có |
| NFR-SEC-002 | Kênh truyền an toàn: chỉ đi qua cáp USB tới `127.0.0.1` | Cấu hình, test bản build | Cả nhóm | MUST | Một phần: bản live cho phép HTTP tới mọi host, chưa chặn host không phải loopback |
| NFR-SEC-003 | Log không chứa ảnh, mask, bí mật hay địa chỉ client | Test log backend | Cả nhóm | MUST | Một phần: log truy cập của uvicorn trên console còn in địa chỉ 127.0.0.1 |
| NFR-SEC-004 | Không có bí mật trong git hay trong app; dữ liệu bệnh nhân ở ngoài repo | CI chặn file ảnh y tế, checkpoint, secret, file > 10 MB, IP nội bộ | Cả nhóm | MUST | Đã có |
| NFR-SEC-005 | Nhập liệu chỉ nhận siêu dữ liệu trong danh sách cho phép; trường định danh lạ bị từ chối | Test Contract 1 | Nguyễn Gia Đức Trung | MUST | Đã có |
| NFR-SEC-006 | Che màn hình sau 5 phút ở nền hoặc 10 phút không chạm; nút "Clear cached images" | Test đồng hồ phiên, render smoke | Phạm Tuấn Anh | MUST | Đã có |
| NFR-SEC-007 | Privacy mode ở SCR-03 / SCR-04, bật mặc định: chụp, quay, chiếu màn hình ra màu đen | Test, cần APK build từ mã này | Phạm Tuấn Anh | MUST | Đã có |
| NFR-SEC-008 | Cache chỉ trong bộ nhớ, giới hạn kích thước, khoá theo phiên bản / checksum / biến thể | Test cache | Phạm Tuấn Anh | MUST | Đã có |
| NFR-SEC-009 | WebView 3D ẩn danh: không cache, không DOM storage, không cookie, chỉ nhận hình học voxel | Test viewer, render smoke | Vũ Hùng Anh | MUST | Đã có |
| NFR-SEC-010 | Kiểm tra chữ tự do (ghi chú, lý do gắn cờ) trên điện thoại: tối đa 500 ký tự, cảnh báo khi giống thông tin cá nhân | Test `checkNote`, render smoke | Nguyễn Gia Đức Trung | MUST | Đã có |
| NFR-SEC-011 | Mọi thao tác ghi gắn với bí danh dự án (`project-reviewer`), không bao giờ lưu email | Test backend | Nguyễn Gia Đức Trung | MUST | Đã có |
| NFR-SEC-012 | App ghi rõ nguồn dữ liệu, điều khoản, mã ca giả danh và "chỉ dùng cho nghiên cứu" | Test "About this data" | Bế Quốc Khánh | MUST | Đã có |
| NFR-SEC-013 | Backend không mở ra ngoài: chỉ nghe `127.0.0.1`, giới hạn thân request 1 MiB, tắt trang tài liệu, không CORS, không liệt kê thư mục | Test transport, ghi kiểm tra cổng trên máy | Nguyễn Gia Đức Trung | MUST | Một phần: chưa ghi kiểm tra backend chỉ nghe 127.0.0.1 |

## 4. Bảo trì và truy vết

| ID | Yêu cầu | Cách kiểm | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| NFR-MAINT-001 | Ranh giới module rõ: mỗi người một thư mục màn hình; file `.mjs` quyết định, file `.js` chỉ vẽ; bảng route backend cố định | Test G8, test bảng route | Phạm Tuấn Anh | MUST | Đã có |
| NFR-MAINT-002 | Hợp đồng API và quy ước hình học định nghĩa một lần, hai phía cùng kiểm theo một bộ fixture | Test hợp đồng hai phía, fixture hình học | Vũ Hùng Anh | MUST | Một phần: phép chọn điểm 3D của app chỉ kiểm theo file mẫu Python, chưa theo fixture hình học chuẩn |
| NFR-MAINT-003 | Module quan trọng có test tự động chạy trong CI | `.github/workflows/guardrails.yml` | Cả nhóm | MUST | Đã có |
| NFR-AUDIT-001 | Mọi ID trong đặc tả có dòng trong ma trận; mọi MUST "Đã có" có test; mọi tham chiếu mã / test tồn tại | `tools/trace_check.py` trong CI (job `traceability`) | Phạm Tuấn Anh | MUST | Đã có |

## 5. Tin cậy và tái lập

| ID | Yêu cầu | Cách kiểm | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| NFR-REL-001 | MRI, GT và dự đoán gốc bất biến; dữ liệu nguồn, dẫn xuất và do người tạo tách riêng; không có đường xoá reviewed mask, lịch sử hay finding | Test checksum, trigger SQLite | Nguyễn Gia Đức Trung | MUST | Đã có |
| NFR-REL-002 | Lỗi mạng hay khởi động lại không làm hỏng bản rà soát đã lưu (lưu nguyên tử, kiểm revision) | Test backend | Nguyễn Gia Đức Trung | MUST | Đã có |
| NFR-REL-003 | Siêu dữ liệu hình học đi kèm và được kiểm cùng mỗi sản phẩm; lệch phiên bản thì từ chối | Test lưới, hợp đồng | Vũ Hùng Anh | MUST | Đã có |
| NFR-REP-001 | Kết quả truy được cấu hình mô hình, split, tiền / hậu xử lý, seed, checkpoint (manifest gói Contract 2, `ml/records`) | Test Contract 2, test ML | Bế Quốc Khánh | MUST | Đã có |
| NFR-REP-002 | Chia dữ liệu theo ca, gộp ca có mask trùng, sàng lọc ảnh giống nhau (LASC 2018 không có bảng ca → bệnh nhân) | Test split | Bế Quốc Khánh | MUST | Đã có |
| NFR-REP-003 | Số đo hiện ra ghi rõ mức tổng hợp, quần thể đánh giá và N | Test V3 | Bế Quốc Khánh | MUST | Đã có |
| NFR-REP-004 | Chỉ gọi là "so sánh được" khi cùng quần thể / split, cùng phiên bản đánh giá, biến thể rõ ràng, cùng loại mask tham chiếu và chính sách hình học | Test ML và backend | Bế Quốc Khánh | MUST | Một phần: server chưa kiểm loại mask tham chiếu và chính sách hình học |
