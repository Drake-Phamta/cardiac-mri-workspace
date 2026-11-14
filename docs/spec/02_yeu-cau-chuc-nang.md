# 02 — Yêu cầu chức năng

Mỗi bảng là phần của một người. PR- là yêu cầu sản phẩm, FR- là yêu cầu chức năng chi tiết. Mức và trạng thái giải
thích ở [00_tong-quan.md](00_tong-quan.md) mục 6; mã và test chứng minh từng dòng nằm trong
[`docs/trace/matrix.csv`](../trace/matrix.csv) (một ID có thể có nhiều dòng, mỗi dòng một chi tiết).

## 1. Phần chung của cả nhóm

| ID | Yêu cầu | Màn hình | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| PR-MOBILE-03 | Mỗi thành viên phụ trách một vertical: màn hình, logic và test trong thư mục riêng (`mobile/src/screens/v1-cases` … `v4-review`); test G8 chặn thư mục màn hình này import thư mục khác | Tất cả | Cả nhóm | MUST | Đã có |
| PR-PRIV-01 | Chỉ dùng dữ liệu nghiên cứu đã ẩn danh, lấy từ nguồn chính thức, giữ điều khoản sử dụng | Tất cả | Cả nhóm | MUST | Đã có |
| PR-PRIV-02 | Log, thống kê và giao diện không chứa thông tin định danh không cần thiết | Tất cả | Cả nhóm | MUST | Đã có |
| PR-FILTER-01 | Lọc và sắp xếp ca (SCR-02) và finding (SCR-08) | SCR-02, SCR-08 | Phạm Tuấn Anh, Nguyễn Gia Đức Trung | SHOULD | Đã có |
| FR-AN-003 | Run thất bại trả lý do an toàn, thử lại được, không lộ bí mật hay thông tin cá nhân | SCR-03 | Cả nhóm | SHOULD | Đã có |
| FR-AN-004 | Run hoàn tất tham chiếu dự đoán và sản phẩm dẫn xuất bất biến (có checksum) | SCR-03 | Cả nhóm | SHOULD | Đã có |

## 2. V1 — Phạm Tuấn Anh: danh sách ca, Case Explorer, Error Inspector, khung app

| ID | Yêu cầu | Màn hình | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| PR-CASE-01 | Duyệt và mở ca MRI theo mã đã ẩn danh | SCR-02 | Phạm Tuấn Anh | MUST | Đã có |
| PR-CASE-02 | Ghi rõ ca chấm điểm được (có GT) hay chỉ suy luận và rà soát | SCR-02, SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| PR-MRI-01 | Xem khối MRI từng lát với điều hướng, zoom, di ảnh dùng được trên điện thoại | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| PR-PRED-01 | Xem mask dự đoán chồng khớp lên MRI gốc | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| PR-IMG-01 | So sánh dự đoán RAW với PROCESSED khi có cả hai | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| PR-ERR-01 | Khi có GT, hiện chỗ lệch giữa dự đoán và GT ở mức lát và pixel | SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| PR-ERR-02 | Từ lỗi tổng hợp hay lỗi một ca đi xuống được đúng lát MRI làm bằng chứng; không màn hình nào dừng ở một con số không giải thích | SCR-01, SCR-02, SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| PR-MODE-01 | Không hiện số đo cần GT cho ca không có GT | Tất cả | Phạm Tuấn Anh | MUST | Đã có |
| PR-MOBILE-01 | App điện thoại là công cụ tương tác chính, mọi tính năng chạy thật (không phải ảnh tĩnh) | Tất cả | Phạm Tuấn Anh | MUST | Đã có |
| PR-MOBILE-02 | Mọi màn hình có 7 trạng thái: đang tải, đang xử lý, thành công, không có dữ liệu, lỗi khôi phục được (Retry), dữ liệu sai bị chặn (kèm mã tham chiếu), bản cũ lệch phiên bản (Refresh); không vẽ phần trăm tiến độ giả; một màn hình lỗi khi vẽ chỉ chặn màn hình đó | Tất cả | Phạm Tuấn Anh | MUST | Một phần: chưa có test cho màn hình lỗi khi vẽ (SCREEN_CRASHED) |
| PR-CACHE-01 | Giữ trong bộ nhớ các lát và phản hồi đã mở, khoá theo phiên bản và checksum; xoá được khi muốn | SCR-03, SCR-04 | Phạm Tuấn Anh | SHOULD | Đã có |
| FR-NAV-001 | Bốn tab Study / Cases / Experiments / Findings và một ngăn xếp màn hình; gốc là SCR-01; SCR-02 mở SCR-03; SCR-03 mở SCR-04, SCR-05, SCR-06; Case Explorer và trình xem MRI 2D là một màn hình; tab Experiments mở thẳng SCR-07 | Tất cả | Phạm Tuấn Anh | MUST | Đã có |
| FR-NAV-002 | Header mỗi màn hình ghi ca, run và biến thể; chạm tiêu đề mở "About this screen" (mã màn hình, chế độ, hợp đồng, bản build) | Tất cả | Phạm Tuấn Anh | SHOULD | Đã có |
| FR-NAV-003 | Chế độ FIXTURE / LIVE: huy hiệu trên header, banner và bảng chọn kịch bản fixture; ở FIXTURE, SCR-06 vẽ mask thay thế ghi rõ SYNTHETIC | Tất cả | Phạm Tuấn Anh | SHOULD | Đã có |
| FR-CASE-001 | Liệt kê ca theo mã ẩn danh (trang đầu của danh sách, thứ tự server); mở thẳng một mã gõ vào khi mã đó không có trong trang | SCR-02 | Phạm Tuấn Anh | MUST | Đã có |
| FR-CASE-002 | Mỗi ca cho biết có GT hay không (EVALUATION / INFERENCE_REVIEW); chế độ và cờ GT mâu thuẫn thì báo, không tự chọn | SCR-02, SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| FR-CASE-003 | Server trả chi tiết ca gồm kích thước khối, khoảng cách voxel, gốc, hướng, quy ước chỉ số, phiên bản và trạng thái hình học; SCR-03 dùng kích thước để kiểm từng lát và hiện ghi chú trạng thái hình học | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| FR-CASE-004 | Worklist: tìm theo mã, lọc chế độ; chọn thí nghiệm để có chip Dice của server cho mỗi ca ("no GT", "run failed", "not in …" bằng chữ, không bao giờ là 0); "Server order" / "Worst first"; dấu "outlier n/3" do server chọn | SCR-02 | Phạm Tuấn Anh | SHOULD | Đã có |
| FR-MRI-001 | Hiện một lát MRI của khối 3D; ca chưa có run mở với MRI (và GT nếu có) kèm lý do | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MRI-002 | Chuyển lát bằng thanh trượt, nút ◀ ▶ (giữ để lặp) và −10 / +10 | SCR-03, SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MRI-003 | Cử chỉ đổi lát nằm trên thanh lát; kéo một ngón trên ảnh là di ảnh, nên đổi lát không lẫn với di ảnh hay vẽ | SCR-03, SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MRI-004 | Chụm hai ngón để zoom, kéo để di, chạm đúp zoom 2x / về vừa khung; SCR-03 có thêm nút Fit | SCR-03, SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MRI-005 | Ảnh và mask luôn khớp sau zoom / di; chạm ảnh hiện toạ độ pixel nguồn (x, y, lát, zoom) | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MRI-006 | Hiện "slice n / tổng (z = k)" | SCR-03, SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MRI-007 | Trình xem luôn khớp ca và run đang chọn, đổi ca / run không để lại lớp hay số cũ; mã và checksum nằm trong thẻ "Provenance" gập sẵn | SCR-03, SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MRI-008 | Play / Pause quét lát khoảng 5 lát mỗi giây, chỉ tải lát kế khi lát trước đã hiện | SCR-03, SCR-04 | Phạm Tuấn Anh | SHOULD | Đã có |
| FR-MASK-001 | Bật / tắt lớp dự đoán (tắt thì chỉ còn MRI); không chồng mọi lớp cùng lúc | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MASK-002 | Lớp GT chỉ có khi ca có GT | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MASK-003 | Độ mờ lớp mask 25 / 50 / 75 / 100 % | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MASK-004 | Chọn run (khi có nhiều) và biến thể RAW / PROCESSED trước khi xem, không mặc định, không đổi ngầm; app nhớ lựa chọn trong phiên | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MASK-005 | Mask vẽ theo đúng hình học của lát, không kéo giãn riêng | SCR-03, SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| FR-MASK-006 | Kiểu vẽ mask Fill / Outline / Both, viền 1 / 2 / 3 px | SCR-03, SCR-04 | Phạm Tuấn Anh | SHOULD | Đã có |
| FR-ERR-001 | Khi có GT, tính TP / FP / FN cho từng pixel của lát | SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| FR-ERR-002 | Tô TP / FP / FN kèm chú giải gọn (bảng màu an toàn cho người mù màu, FP viền nét đứt); chạm chú giải để ẩn / hiện một lớp; dòng "Matches / Differs from the server" so phần vẽ với số của server; lỗi xem ở màn hình riêng, không phải một lớp ở SCR-03 | SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| FR-ERR-003 | Đi tới lát tệ nhất theo thứ tự server chọn (app không tự xếp hạng lát) | SCR-04 | Phạm Tuấn Anh | MUST | Đã có |
| FR-ERR-004 | Ca không GT: nút và số đo lỗi bị khoá kèm giải thích, không bao giờ trông như "lỗi bằng 0" | SCR-03, SCR-04 | Phạm Tuấn Anh | MUST | Đã có |

## 3. V2 — Vũ Hùng Anh: 3D Inspector, lưới 3D và hình học lỗi

| ID | Yêu cầu | Màn hình | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| PR-3D-01 | Dựng mô hình 3D nhĩ trái từ mask phân vùng đã kiểm | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| PR-3D-02 | Xoay, zoom, di mô hình 3D trên điện thoại | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| PR-3D-03 | Mô hình 3D hiện lát đang xem (lát mở SCR-05) thành dải lát | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| PR-3D-04 | Chọn một điểm hợp lệ trên 3D dẫn tới đúng lát MRI; 3D không phải hình trang trí | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| PR-3D-05 | Khi có GT, mô hình 3D hiện lỗi và chỉ ra các lát gây lỗi | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| PR-ERR-03 | Biểu diễn lỗi phân vùng trên 3D, nối với bằng chứng 2D | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| PR-SCI-02 | Không hiện thể tích hay khoảng cách thật (mm, mL) khi hình học chưa kiểm định | SCR-05, SCR-07 | Vũ Hùng Anh | MUST | Đã có |
| FR-3D-001 | Dựng bề mặt 3D (lưới L0, không giảm tam giác) từ mask bằng bước ngoại tuyến `python -m backend.mesh.build_cache` | Backend | Vũ Hùng Anh | MUST | Đã có |
| FR-3D-002 | Xoay, zoom, di bằng cử chỉ | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| FR-3D-003 | Lát 2D ánh xạ sang vị trí z trong 3D theo cùng quy ước voxel; dải lát đứng yên đúng chỗ khi xoay / zoom | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| FR-3D-004 | Mở SCR-05 từ một lát thì lát đó hiện thành dải; lát chọn trong 3D thay dải đó | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| FR-3D-005 | Chạm điểm hợp lệ trên bề mặt cho ra số lát; chạm nền không gây điều hướng | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| FR-3D-006 | "Open in 2D" (bấm rõ ràng) mở SCR-03 tại lát đó; chỉ truyền số lát | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| FR-3D-007 | Khi có GT, biểu diễn lỗi 3D: bề mặt dự đoán và một điểm cho mỗi vùng FP / FN liên thông (26 láng giềng), đọc từ file `cardiac-error-geometry/1` do backend dựng sẵn | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| FR-3D-008 | Chạm điểm lỗi hiện loại, dải lát, số voxel và "Open in 2D"; Previous / Next đi qua các vùng (hết FN rồi FP, mỗi loại vùng lớn trước) | SCR-05 | Vũ Hùng Anh | MUST | Đã có |
| FR-3D-009 | Bề mặt dự đoán (đặc) và GT (trong suốt), công tắc từng lớp, độ mờ 30 / 60 / 100 % cho mỗi bề mặt | SCR-05 | Vũ Hùng Anh | SHOULD | Đã có |
| FR-3D-010 | "Cut at slice" ẩn phần bề mặt và điểm lỗi phía trên lát đang chọn | SCR-05 | Vũ Hùng Anh | SHOULD | Đã có |
| FR-3D-011 | Nút nhìn theo trục voxel ±X / ±Y / ±Z và Fit; trục voxel ở góc (x cột, y hàng, z lát), không ghi hướng giải phẫu | SCR-05 | Vũ Hùng Anh | SHOULD | Đã có |

## 4. V3 — Bế Quốc Khánh: Study Overview, Experiment Comparison

| ID | Yêu cầu | Màn hình | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| PR-STUDY-01 | Một study nhĩ trái gồm bộ dữ liệu, ca, thí nghiệm, run và finding | SCR-01 | Bế Quốc Khánh | MUST | Đã có |
| PR-COHORT-01 | Xem tóm tắt hiệu năng trên cohort cho các run so sánh được | SCR-01, SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| PR-COHORT-02 | Tìm và mở ca điểm thấp / bất thường từ phân tích cohort | SCR-01, SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| PR-EXP-01 | Kết quả DINOv2 25 / 50 / 100 % và bản hậu xử lý là các gói kết quả tái lập được, backend phục vụ | SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| PR-EXP-02 | So sánh run tương thích ở mức cohort và từng ca theo luật so sánh được của server | SCR-07 | Bế Quốc Khánh | MUST | Một phần: server chưa kiểm loại mask tham chiếu và chính sách hình học |
| PR-EXP-03 | Kết quả theo 25 / 50 / 100 % dữ liệu có nhãn; màn hình xử lý cả hai họ mô hình | SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| PR-EXP-04 | DINOv2 thô (EXP-D-100) và hậu xử lý (EXP-D-PP) hiện thành hai tóm tắt có nhãn; server ghi "không so sánh được" vì khác biến thể; hiệu số ghép cặp nằm trong `docs/RESULTS.md` | SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| PR-SCI-01 | App ghi rõ dữ liệu là LASC 2018 (nguồn, điều khoản), không phải tái lập kết quả LAScarQS 2022 của bài báo gốc | SCR-01, SCR-07 | Bế Quốc Khánh | MUST | Một phần: chưa có câu "không phải tái lập LAScarQS 2022" trong app và RESULTS.md |
| PR-SCI-03 | Bảng kết quả sinh từ tổng hợp đóng băng theo thứ tự cố định; báo đúng kết quả quan sát, kể cả khi không khác biệt | SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| FR-STUDY-001 | Server trả thông tin bộ dữ liệu, số ca theo chế độ, danh sách thí nghiệm và khả năng của study | SCR-01 | Bế Quốc Khánh | MUST | Đã có |
| FR-EXP-001 | Mỗi thí nghiệm có họ mô hình, % dữ liệu, tiền / hậu xử lý, split, phiên bản checkpoint và đánh giá | SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| FR-EXP-002 | Server lưu và trả chỉ số từng ca của run đánh giá | SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| FR-EXP-003 | Server tính thống kê cohort từ chỉ số từng ca, ghi N dự kiến và N thành công | SCR-01, SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| FR-EXP-004 | Ma trận UNet / DINOv2 × 25 / 50 / 100 % và biểu đồ xu hướng (từng ca, trung vị, q1–q3, chỉ nối khi server cho phép); dữ liệu thật hiện có DINOv2, ma trận đủ chạy bằng dữ liệu fixture | SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| FR-EXP-005 | Thô và hậu xử lý là hai thí nghiệm có nhãn; phép so sánh giữa chúng là "không so sánh được" | SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| FR-EXP-006 | Mở bằng chứng ca từ kết quả; bảng ca của mỗi thí nghiệm liệt kê mọi dòng, kể cả FAILED / EXCLUDED / WITHHELD có lý do | SCR-01, SCR-07 | Bế Quốc Khánh | MUST | Đã có |
| FR-EXP-007 | Bộ chọn chỉ số và thống kê (median / mean) không mặc định; chú giải chỉ số, HD95 và mL bị khoá vì hình học chưa kiểm định | SCR-07 | Bế Quốc Khánh | SHOULD | Đã có |
| FR-EXP-008 | Biểu đồ hiệu số từng ca cho cặp server nói so sánh được: xếp từ thấp tới cao, đường trung vị, chạm để mở ca | SCR-07 | Bế Quốc Khánh | SHOULD | Đã có |

## 5. V4 — Nguyễn Gia Đức Trung: Review / Correction, Findings, API backend

| ID | Yêu cầu | Màn hình | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| PR-REV-01 | Ghi trạng thái rà soát NOT_REVIEWED / ACCEPTED / FLAGGED / CORRECTED | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| PR-REV-02 | Sửa mask dự đoán 2D bằng bút thêm / xoá và lưu mask đã rà soát | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| PR-PROV-01 | Dự đoán gốc bất biến; mỗi lần sửa tạo phiên bản riêng truy được nguồn | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| PR-FIND-01 | Tạo finding gắn bằng chứng: thí nghiệm, ca, run, biến thể, lát | SCR-06, SCR-08 | Nguyễn Gia Đức Trung | MUST | Một phần: SCR-06 chưa truyền experiment_id của run |
| FR-REV-001 | Trạng thái và chuyển trạng thái theo hợp đồng; CORRECTED chỉ đạt được qua lưu (commit) | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-002 | Bút thêm (Add) | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-003 | Bút xoá (Erase) | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-004 | Cỡ bút 1 / 3 / 5 / 7 / 11 px, vòng tròn bút hiện ở ngón tay | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-005 | Undo | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-006 | Redo | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-007 | Reset về đúng mask nguồn của phiên chưa lưu; Cancel bỏ mọi thay đổi chưa lưu | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-008 | Lưu tạo một phiên bản reviewed mask mới bất biến; review CORRECTED sửa tiếp từ phiên bản mới nhất; reviewed mask chỉ vẽ ở SCR-06 | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-009 | Lưu không đổi dự đoán gốc; GT không bao giờ là nguồn để sửa | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-010 | Phiên bản lưu ghi nguồn, ca, run, thời điểm và bí danh người rà soát; app hiện nguồn và biến thể trước khi lưu; không gọi mask đã sửa là ground truth | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-011 | Toạ độ bút đúng sau zoom / di (biến đổi ngược từ màn hình về pixel nguồn) | SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-REV-012 | Gắn cờ (Flag) bắt buộc ghi lý do 1–500 ký tự | SCR-06 | Nguyễn Gia Đức Trung | SHOULD | Đã có |
| FR-REV-013 | Nút History: dòng thời gian ai (bí danh), làm gì, lúc nào, kèm lý do gắn cờ | SCR-06 | Nguyễn Gia Đức Trung | SHOULD | Đã có |
| FR-REV-014 | Mask nguồn vẽ thành viền dưới nét sửa; giữ "Hold: source" để xem riêng mask nguồn | SCR-06 | Nguyễn Gia Đức Trung | SHOULD | Đã có |
| FR-FIND-001 | Tạo finding từ một lát ở SCR-06 (ghi ca, run, biến thể, lát) | SCR-06, SCR-08 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-FIND-002 | API nhận vùng tuỳ chọn cho finding (`region_reference`, một đối tượng JSON tối đa 4096 ký tự); app đọc dạng POINT / BOX theo pixel nguồn | Backend | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-FIND-003 | Loại finding: UNDER_SEGMENTATION, OVER_SEGMENTATION, BOUNDARY_DISAGREEMENT, DISCONNECTED_ARTIFACT, OTHER | SCR-08 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-FIND-004 | Finding giữ nguyên tham chiếu bằng chứng; chỉ ghi chú và trạng thái được sửa; không đổi dữ liệu nguồn | SCR-08 | Nguyễn Gia Đức Trung | MUST | Đã có |
| FR-FIND-005 | Danh sách mới nhất trước; lọc theo trạng thái và loại, có đếm | SCR-08 | Nguyễn Gia Đức Trung | SHOULD | Đã có |
| FR-FIND-006 | Resolve / Reopen; "Open evidence" mở lại bằng chứng mạnh nhất (ca và lát ở SCR-03, hoặc SCR-07 nếu finding chỉ gắn thí nghiệm); "Review / correct" mở SCR-06 của run | SCR-08 | Nguyễn Gia Đức Trung | SHOULD | Đã có |
| FR-FIND-007 | "Export PDF" các finding đang hiện (hộp thoại in Android, ghi "Research use only", ghi chú được escape HTML, không có ảnh); cần APK build từ mã này | SCR-08 | Nguyễn Gia Đức Trung | SHOULD | Đã có |

## 6. Hướng phát triển

Những mục dưới đây **không** có trong bản này và không được hứa. ID giữ lại để truy vết.

| ID | Nội dung | Mức cũ | Vì sao chưa làm |
|---|---|---|---|
| PR-EXP-01, PR-EXP-03, FR-EXP-004, UC-11, PR-SCI-03, TC-SCI-003, TC-EXP-004 | Kết quả UNet 25 / 50 / 100 % trên holdout và so sánh UNet với DINOv2 trên dữ liệu thật (màn hình Experiment Comparison đã chạy được với dữ liệu fixture) | MUST | Chưa train UNet trong quy trình sản phẩm; quyết định của trưởng nhóm |
| PR-AN-01, UC-17, FR-AN-001, FR-AN-002, SCR-09, NFR-PERF-004, TC-PERF-004, TC-AN-001 | Yêu cầu chạy phân tích mới từ điện thoại và theo dõi QUEUED / RUNNING / SUCCEEDED / FAILED | SHOULD | App chỉ xem kết quả tính sẵn; backend luôn trả `RUN_NOT_DEPLOYABLE` |
| PR-COMP-01 | So sánh hai run cạnh nhau, đồng bộ trên cùng ca | SHOULD | Chưa làm; mỗi lần mở ca ở một run |
| PR-METRIC-01, TC-METRIC-001 | HD95 và các khoảng cách bề mặt | SHOULD | Hình học chưa kiểm định (không có khoảng cách voxel thật) |
| PR-REVAN-01 | Thống kê công sức rà soát | SHOULD | Chưa làm |
| PR-COLLAB-01 | Nhiều người dùng, bình luận | COULD | Chỉ có một bí danh người rà soát |
| PR-ANN-ADV-01 | Công cụ gán nhãn nâng cao ngoài bút thêm / xoá | COULD | Chưa làm |
| PR-MODEL-EXTRA-01 | Thêm họ mô hình khác | COULD | Chờ ma trận UNet / DINOv2 đủ |
| PR-STUDY-CREATE-01 | Tạo study tuỳ ý | COULD | Chỉ có study nhĩ trái định sẵn |
| PR-EXP-SCHED-01 | Lên lịch thí nghiệm từ điện thoại (máy GPU chạy) | COULD | Điện thoại không chạy mô hình |
| FR-3D-004 | Đổi lát ở Case Explorer thì dải lát của 3D Inspector đang mở đổi theo ngay | MUST | Hai màn hình xếp chồng; liên kết chỉ áp dụng khi mở |
| FR-3D-006 | Tô điểm đã chọn ngay trong lát 2D | MUST | Hiện chỉ truyền số lát |
| FR-FIND-001, FR-FIND-002, UC-15 | Tạo finding từ thí nghiệm / cohort, hoặc vẽ một vùng trên ảnh | MUST | API nhận các trường này nhưng app chưa có lối vào |
| NFR-SEC-002, API-02 | Hồ sơ triển khai từ xa: HTTPS, đăng nhập, mã `UNAUTHORIZED`, cổng kiểm tra riêng tư | MUST | Chỉ có hồ sơ cục bộ qua USB |
| NFR-USAB-001 | Giao diện xoay ngang | COULD | App khoá dọc (`mobile/app.json`) |
