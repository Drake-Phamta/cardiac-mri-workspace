# Yêu cầu bắt buộc (MUST)

**MUST** là mức bắt buộc: phải có thì bản MVP mới được nghiệm thu và buổi demo chính mới chạy được.
Định nghĩa đầy đủ của từng yêu cầu nằm ở [specs/v1.0/03_PRODUCT_REQUIREMENTS_PRD.md](specs/v1.0/03_PRODUCT_REQUIREMENTS_PRD.md) (mục 3). Ngoài 33 MUST, spec còn 6 SHOULD và 5 COULD, không đưa vào bảng này.
Trạng thái được đánh giá ngày 18 tháng 10 năm 2026, theo bằng chứng có trong repo lúc đó; việc làm sau ngày đó chưa được tính. Đến ngày đó chưa có yêu cầu nào được nghiệm thu chính thức.

Bốn vertical: **V1** Case Explorer + Error Inspector — Phạm Tuấn Anh (kiêm khung app và tích hợp); **V2** 3D Inspector — Vũ Hùng Anh; **V3** Study overview + so sánh thí nghiệm — Bế Quốc Khánh (kiêm ML); **V4** Review/Correction + Findings — Nguyễn Gia Đức Trung (kiêm backend). Dấu "+" là phần góp thêm.

Cách đọc bảng. Cột **Trạng thái** giữ đúng ba mức của bản đánh giá; cột **Còn thiếu chính** là chỗ thiếu lớn nhất bản
đánh giá ghi cho yêu cầu đó (nhiều mục còn thiếu cả bằng chứng trên điện thoại):

- **Đủ bằng chứng**: test và kiểm tra dữ liệu trong repo đã chứng minh đủ; yêu cầu không cần thao tác trên giao diện. Vẫn chưa nghiệm thu.
- **Một phần**: đã có mã và test logic hoặc chạy thử qua API (vài mục có đo trên bản thử nghiệm), nhưng còn thiếu phần ở cột cuối.
- **Chưa có**: chưa có gì chạy được trong app; mới có một module rời chưa nối vào.

| ID | Ý nghĩa | Vertical phụ trách | Trạng thái | Còn thiếu chính |
|---|---|---|---|---|
| PR-STUDY-01 | Một không gian nghiên cứu phân vùng nhĩ trái: dữ liệu, case, thí nghiệm, lượt chạy, finding | V3 (Khánh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-COHORT-01 | Xem tóm tắt hiệu năng trên cả tập case (cohort) cho các lượt chạy so sánh được | V3 (Khánh) | Một phần | kết quả UNet (chưa train) |
| PR-COHORT-02 | Từ phân tích cohort, tìm và mở được các case điểm thấp hoặc bất thường | V3 (Khánh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-CASE-01 | Duyệt và mở case MRI theo mã đã ẩn danh | V1 (Tuấn Anh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-CASE-02 | Ghi rõ case nào chấm điểm được (có ground truth), case nào chỉ suy luận và review | V1 (Tuấn Anh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-MRI-01 | Xem MRI từng lát trên điện thoại: chuyển lát, phóng to, kéo ảnh | V1 (Tuấn Anh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-PRED-01 | Xem mask dự đoán của mô hình chồng khớp lên ảnh MRI gốc | V1 (Tuấn Anh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-IMG-01 | So sánh dự đoán thô với dự đoán đã hậu xử lý, khi có đủ hai bản | V1 (Tuấn Anh) + ML | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-ERR-01 | Khi có ground truth, hiện chỗ dự đoán lệch so với nhãn chuẩn ở mức lát và pixel | V1 (Tuấn Anh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-ERR-02 | Từ lỗi tổng hợp hoặc lỗi của một case, bấm xuống được đúng lát MRI làm bằng chứng | V1 (Tuấn Anh) + V3 | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-ERR-03 | Hiển thị lỗi phân vùng trên mô hình 3D, liên kết với bằng chứng 2D | V2 (Hùng Anh) | Chưa có | chưa có trong app |
| PR-3D-01 | Dựng mô hình 3D nhĩ trái từ mask phân vùng đã kiểm | V2 (Hùng Anh) | Đủ bằng chứng | chỉ còn bước nghiệm thu |
| PR-3D-02 | Xoay, phóng to, kéo mô hình 3D trên điện thoại | V2 (Hùng Anh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-3D-03 | Đổi lát MRI thì mặt phẳng lát trên mô hình 3D đổi theo | V2 (Hùng Anh) + V1 | Một phần | một phần chức năng hoặc hiển thị trong app |
| PR-3D-04 | Chạm một vùng trên mô hình 3D thì nhảy tới lát MRI tương ứng | V2 (Hùng Anh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-3D-05 | Khi có ground truth, mô hình 3D hiện lỗi và chỉ ra các lát gây ra lỗi đó | V2 (Hùng Anh) | Chưa có | chưa có trong app |
| PR-EXP-01 | Kết quả UNet và DINOv2 được lưu thành gói kết quả so sánh được, tái lập được | ML (Khánh) + V3 | Một phần | kết quả UNet (chưa train) |
| PR-EXP-02 | So sánh các lượt chạy tương thích ở mức cả tập case và từng case | V3 (Khánh) | Một phần | kết quả UNet (chưa train) |
| PR-EXP-03 | Có kết quả với 25 %, 50 %, 100 % dữ liệu có nhãn cho cả UNet và DINOv2 | ML (Khánh) | Một phần | kết quả UNet (chưa train) |
| PR-EXP-04 | Cho xem kết quả so sánh DINOv2 dự đoán thô với DINOv2 đã hậu xử lý | ML (Khánh) + V3 | Một phần | một phần chức năng hoặc hiển thị trong app |
| PR-REV-01 | Ghi trạng thái review: chưa xem, chấp nhận, gắn cờ, đã sửa | V4 (Trung) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-REV-02 | Sửa mask 2D bằng bút thêm/xóa rồi lưu mask đã review | V4 (Trung) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-PROV-01 | Dự đoán gốc không bao giờ bị ghi đè; mỗi lần sửa tạo một bản riêng, truy được nguồn | V4 (Trung) + Backend | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-FIND-01 | Tạo finding gắn với bằng chứng: thí nghiệm, case, lát và vùng nếu có | V4 (Trung) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-MODE-01 | Không hiện số đo độ chính xác hay lỗi cho case không có ground truth | Tích hợp (Tuấn Anh), mọi màn hình | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-SCI-01 | Nói rõ nhóm làm theo giao thức LASC 2018, khác giao thức LAScarQS 2022 của bài báo gốc | Báo cáo (Tuấn Anh) | Một phần | báo cáo, slide hoặc hồ sơ thành viên |
| PR-SCI-02 | Chỉ đưa ra thể tích thật (mm³, mL) khi hình học và khoảng cách voxel đã được kiểm | V2 (Hùng Anh) + ML | Một phần | báo cáo, slide hoặc hồ sơ thành viên |
| PR-SCI-03 | Báo cáo đúng kết quả quan sát được, kể cả khi DINOv2 không hơn UNet | ML (Khánh) | Một phần | kết quả UNet (chưa train) |
| PR-MOBILE-01 | App điện thoại là công cụ tương tác chính, không chỉ để xem kết quả tĩnh | Tích hợp (Tuấn Anh) | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-MOBILE-02 | Luồng chính có đủ trạng thái đang tải, đang xử lý, rỗng, lỗi và thử lại | Tích hợp (Tuấn Anh) + mọi vertical | Một phần | bằng chứng khi chạy app thật trên điện thoại |
| PR-MOBILE-03 | Mỗi thành viên tự làm và bảo vệ được ít nhất một chức năng mobile, và hiểu phần lõi chung | Cả nhóm | Một phần | báo cáo, slide hoặc hồ sơ thành viên |
| PR-PRIV-01 | Chỉ dùng dữ liệu nghiên cứu đã ẩn danh; không cần danh tính bệnh nhân thật | Backend (Trung) | Đủ bằng chứng | chỉ còn bước nghiệm thu |
| PR-PRIV-02 | Log, thống kê và giao diện không chứa thông tin định danh không cần thiết | Backend (Trung) + mọi người | Một phần | bằng chứng khi chạy app thật trên điện thoại |

**Đếm theo trạng thái (33 MUST):** Đủ bằng chứng 2 · Một phần 29 (còn thiếu chính: bằng chứng trên điện thoại 19, kết quả UNet 5, tài liệu 3, chức năng 2) · Chưa có 2 · Đã nghiệm thu 0.

Hai mục "Chưa có" đều là phần hiển thị lỗi trên mô hình 3D.
