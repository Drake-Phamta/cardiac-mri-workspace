# 00 — Tổng quan

## 1. Mục tiêu

Nghiên cứu phân vùng ảnh y tế thường chỉ cho ra mask và một con số tổng hợp (ví dụ Dice trung bình). Con số đó không
cho biết mô hình sai ở đâu, sai ở lát nào, hai mô hình khác nhau thế nào trên cùng một ca, hay chuỗi mask 2D ứng với
hình 3D ra sao.

Ứng dụng **Cardiac MRI Workspace** giúp người nghiên cứu xem và truy vết kết quả phân vùng **nhĩ trái (LA)** trên MRI
tim ngay trên điện thoại, đi liền một mạch:

`tập ca (cohort) → thí nghiệm → ca → lát → pixel / vùng lỗi → mô hình 3D`

và giữ lại bằng chứng cho mọi kết quả, mọi lần rà soát và mọi chỉnh sửa. Câu hỏi dẫn dắt buổi demo: *"Vì sao AI
phân vùng sai ở ca MRI này, và người nghiên cứu làm gì được với lỗi đó?"*

## 2. Người dùng

- **Người nghiên cứu / sinh viên nghiên cứu** ảnh y tế và AI: xem dự đoán, so sánh thí nghiệm, tìm lỗi, rà soát và
  sửa mask, ghi lại phát hiện (finding).
- Không phải bác sĩ chẩn đoán hay bệnh nhân. App không đưa ra kết luận lâm sàng; "Accepted" chỉ có nghĩa là người rà
  soát của dự án chấp nhận cho mục đích nghiên cứu.

## 3. Phạm vi (đã xây)

- 8 màn hình (SCR-01 … SCR-08, xem [07_giao-dien.md](07_giao-dien.md)) chia cho 4 người, mỗi người một vertical:

  | Vertical | Người phụ trách | Màn hình và phần chung |
  |---|---|---|
  | V1 | Phạm Tuấn Anh | Danh sách ca SCR-02, Case Explorer SCR-03, Error Inspector SCR-04; khung app (điều hướng, header, chế độ fixture) |
  | V2 | Vũ Hùng Anh | 3D Inspector SCR-05; dựng lưới 3D và hình học lỗi ở backend (`backend/mesh/`) |
  | V3 | Bế Quốc Khánh | Study Overview SCR-01, Experiment Comparison SCR-07; quy trình ML ngoại tuyến |
  | V4 | Nguyễn Gia Đức Trung | Review / Correction SCR-06, Findings SCR-08; API backend và CSDL |

- Dữ liệu: bộ **LASC 2018** (Left Atrial Segmentation Challenge), 154 ca đã ẩn danh (mã `CASE_0001` … `CASE_0154`).
  100 ca `Training Set` chia 80 train / 20 validation; 54 ca `Testing Set` là holdout khoá. Backend phục vụ 74 ca:
  20 ca validation và 53 ca holdout ở chế độ EVALUATION, 1 ca holdout ở chế độ INFERENCE_REVIEW.
- Kết quả phân vùng được tính **trước** trên máy có GPU (DINOv2 với 25 / 50 / 100 % dữ liệu có nhãn, và bản hậu xử
  lý), đóng gói, rồi backend phục vụ. Điện thoại không train và không chạy mô hình.
- Backend Python/FastAPI chạy trên máy tính của nhóm; điện thoại nối qua cáp USB (`adb reverse tcp:8000 tcp:8000`),
  backend chỉ nghe `127.0.0.1`. Không có mạng overlay hay máy chủ công khai.
- App còn chạy được ở **chế độ FIXTURE**: dữ liệu giả sinh từ hợp đồng API, không cần backend.

## 4. Ngoài phạm vi

Chẩn đoán lâm sàng và khuyến nghị điều trị; kết nối bệnh viện / PACS; dữ liệu có danh tính bệnh nhân; tự train lại
sau khi sửa mask; bộ công cụ gán nhãn chuyên nghiệp; phân vùng cơ quan khác ngoài nhĩ trái; chạy mô hình trên điện
thoại. Những việc có thể làm tiếp nằm ở mục *Hướng phát triển* cuối [02_yeu-cau-chuc-nang.md](02_yeu-cau-chuc-nang.md).

## 5. Đặc tả này mô tả bản nào

Sản phẩm cuối là nhánh `main` cộng 5 nhánh tính năng chưa gộp: `shell/design-system` (khung giao diện),
`v1/tuan-anh-upgrades`, `v2/hung-anh-upgrades`, `v3/khanh-upgrades`, `v4/trung-upgrades`. Đặc tả mô tả sản phẩm
**sau khi gộp**. Những yêu cầu mà mã chỉ có trên một nhánh được ghi ở cột `pending_branch` của ma trận
[`docs/trace/matrix.csv`](../trace/matrix.csv); khi gộp xong, cột đó trống và bước kiểm tra chạy chế độ nghiêm ngặt
(xem [09_kiem-thu-truy-vet.md](09_kiem-thu-truy-vet.md)). Giao diện đang được làm lại theo hướng thiết kế A
"Clinical viewer" trên các nhánh, nên phần giao diện mô tả thành phần, trạng thái và hành vi, không mô tả màu hay bố cục
pixel.

## 6. Cách đọc mức và trạng thái

- **Mức**: MUST = bắt buộc để nghiệm thu và chạy demo chính; SHOULD = nên có, đã làm; COULD = có thể làm.
- **Trạng thái** (lấy từ ma trận, bước kiểm tra tự động so khớp):
  - **Đã có**: hành vi có trong mã và có test tự động chạy qua nó.
  - **Một phần**: có mã nhưng còn thiếu một phần hoặc thiếu test, hoặc chỉ còn thiếu số đo trên điện thoại; ô trạng
    thái ghi rõ thiếu gì.
  - **Chưa có**: chưa có bằng chứng nào (chỉ còn các lần chạy trên điện thoại).
  - **Hướng phát triển**: không hứa trong bản này; liệt kê ở cuối `02`.
- ID giữ nguyên từ đặc tả v1.0 (PR-, FR-, NFR-, UC-, SCR-, TC-) để test và báo cáo trích dẫn được; ID mới dùng tiếp
  dãy số cũ. Hai họ ID mới: `EP-<tên endpoint>` (một endpoint của hợp đồng) và `API-01` … `API-05` (quy tắc chung của
  API).

## 7. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| Ca (case) | Một lần chụp MRI 3D của một bệnh nhân, có mã ẩn danh `CASE_xxxx` |
| Lát (slice) | Một ảnh 2D trong khối 3D; chỉ số `z` đếm từ 0. SCR-03 / SCR-04 hiện "slice z+1 / tổng (z = k)"; SCR-06 và SCR-08 hiện thẳng `z` |
| Mask | Ảnh nhị phân đánh dấu pixel thuộc nhĩ trái |
| Ground truth (GT) | Mask nhãn chuẩn của bộ dữ liệu; không phải mask đã rà soát |
| Dự đoán RAW / PROCESSED | Mask mô hình dự đoán thô / sau hậu xử lý PP-4; người dùng luôn chọn rõ, không có mặc định |
| Run (lượt chạy phân tích) | Kết quả của một thí nghiệm trên một ca, đã tính sẵn |
| Experiment (thí nghiệm) | Một cấu hình đóng băng (họ mô hình, % dữ liệu, hậu xử lý), ví dụ `EXP-D-100` |
| Dice / IoU | Độ trùng giữa dự đoán và GT, từ 0 đến 1 |
| TP / FP / FN | Pixel đúng / dự đoán thừa / GT bị bỏ sót |
| Chế độ EVALUATION / INFERENCE_REVIEW | Ca có GT (chấm điểm được) / ca chỉ suy luận và rà soát (không có số đo cần GT) |
| Review, reviewed mask | Trạng thái rà soát một dự đoán; bản mask đã sửa, lưu thành phiên bản mới, không ghi đè dự đoán |
| Finding | Ghi chú phát hiện gắn với bằng chứng (ca, run, biến thể, lát) |
| Hình học voxel | Toạ độ `(x, y, z)` = (cột, hàng, lát); chưa kiểm định khoảng cách thật nên không có mm, mL |
| Hợp đồng API | `contracts/api/contract.json`, định nghĩa chung cho backend và app |
| FIXTURE / LIVE | App chạy bằng dữ liệu sinh từ hợp đồng / gọi backend thật qua USB |
