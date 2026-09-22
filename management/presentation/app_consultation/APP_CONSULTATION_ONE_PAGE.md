# MỘT TRANG — mở sẵn lúc họp

**DỰ ÁN** · AI-assisted Cardiac MRI Research Workspace — workspace **nghiên cứu / học tập** để điều tra
hành vi của mô hình phân vùng tâm nhĩ trái trên ảnh LGE MRI. **Mobile-first. Không phải phần mềm chẩn đoán.**

**MỤC ĐÍCH** · Một chỉ số Dice trung bình không cho biết mô hình **sai ở đâu**. Sản phẩm đưa người dùng từ
kết quả thí nghiệm xuống tới từng pixel, rồi cho sửa lại.
> *"Why did the AI fail on this MRI, and what can the researcher do about it?"*

**LUỒNG** · `Experiment → Cohort → Case → Slice → Error region ⇄ 3D → Review`

---

**5 NHÓM TÍNH NĂNG**

1. **Experiment & Cohort** — so sánh UNet vs DINOv2, xem phân bố, lần xuống ca kém nhất
2. **2D MRI Case Explorer** — lật slice, overlay dự đoán / nhãn thật / lỗi, zoom–pan
3. **2D ⇄ 3D liên kết** — dựng 3D; chọn vùng trên 3D → về **đúng lát cắt nguồn**
4. **Review / Correction** — chấp nhận · gắn cờ · **sửa bằng cọ**; dự đoán gốc **giữ nguyên**
5. **Findings** — ghi quan sát, gắn với thí nghiệm–case–slice–vùng

---

**NGHIÊN CỨU (`RQ-A`)** · DINOv2-based **suy giảm ít hơn** UNet khi giảm dữ liệu có nhãn?
6 lần chạy: UNet và DINOv2 × **25% / 50% / 100%** · subset lồng nhau, cùng seed
Dữ liệu **LASC 2018**, 154 ca (100 phát triển / **54 khoá lại**)
**Kết quả âm là hợp lệ** — đặc tả cấm ép DINOv2 phải thắng

---

**CÔNG NGHỆ**

| Mảng | Dự kiến | Trạng thái |
|---|---|---|
| Mobile | Android; đang dựng **React Native / Expo** | 🔶 **chưa chốt** |
| ML | **Python + PyTorch** · UNet + DINOv2-based | 🔶 cấu hình DINOv2 **chưa chốt** |
| Ảnh y tế | **NRRD** (`pynrrd`) | ✅ · đo mm/mL **tắt** |
| Hệ toạ độ 2D/3D | `x=cột, y=hàng, z=slice` | ✅ có CI kiểm |
| 3D | mesh + **WebGL2** | 🔶 ngân sách mesh **chưa chốt** |
| API | **28 endpoint · 15 mã lỗi** | 🔶 **`DRAFT v0`** |
| Lưu trữ | CLI offline + manifest có phiên bản | ✅ |
| Triển khai | **Galaxy A17 5G → Wi-Fi → ZeroTier → Mac mini M2 24 GB** | ✅ |
| CI | GitHub Actions, 5 job | ✅ |

---

**THAM CHIẾU**

| | 3D Slicer | cvi42 |
|---|---|---|
| Là gì | nền tảng mã nguồn mở, ảnh y sinh | phần mềm đọc & báo cáo tim mạch |
| Nền tảng | desktop | máy trạm + web viewer |
| Hạng mục | **không duyệt cho lâm sàng**, dùng nghiên cứu | **thiết bị y tế được quản lý**, kê đơn |
| Học gì | quy trình phân vùng, liên kết 2D–3D | **tổ chức thông tin**: overlay cạnh ảnh gốc, bảng số đặt ở đâu |

---

**KHÁC BIỆT** · Không phải "chưa ai làm được". Là **cách tích hợp**:
từ **kết quả thí nghiệm** → **vùng lỗi trên lát cắt** → **3D** → **sửa tay**, trên **điện thoại**.
· đi xuống tận **bằng chứng ảnh**, không dừng ở biểu đồ
· trọng tâm **điều tra lỗi AI**, không phải trình bày dự đoán
· liên kết 2D⇄3D **xác định**, sai lệch tối đa **1 lát cắt**
· **sửa tay không ghi đè dự đoán gốc** — tạo phiên bản mới, truy vết được
· thí nghiệm khan hiếm dữ liệu **nằm trong cùng workspace**

---

**HIỆN TRẠNG** *(chỉ nói khi được hỏi, 30–60 giây)* · Đặc tả và hợp đồng dùng chung đã xong, có CI kiểm ·
**cổng dữ liệu đã nghiệm thu**, 154 ca kiểm từng file, split chống rò rỉ đã quyết · spike 2D/3D trên máy
thật đang chạy, sắp tới điểm quyết định nền tảng · mã vertical đang tích hợp · **bước tới: khả thi ML và
cổng huấn luyện**.

---

**BỐN NGƯỜI**

| Người | Mảng sản phẩm | Mảng kỹ thuật |
|---|---|---|
| **Phạm Tuấn Anh** | Case Explorer 2D + Error Inspector | tích hợp · CI · hợp đồng chung |
| **Vũ Hùng Anh** | 3D / điều tra lỗi không gian | ảnh học · hình học · liên kết 2D–3D |
| **Bế Quốc Khánh** | So sánh thí nghiệm & nhóm ca | huấn luyện & đánh giá ML |
| **Nguyễn Gia Đức Trung** | Review / sửa tay · Findings | backend · lưu trữ · nạp dữ liệu |

---

## ⛔ SÁU CÂU KHÔNG ĐƯỢC NÓI

| Không nói | Nói thay bằng |
|---|---|
| ❌ "DINOv2 sẽ thắng UNet." | "Nhóm em đo xem cái nào suy giảm ít hơn. **Kết quả âm vẫn là kết quả hợp lệ.**" |
| ❌ "Đây là ứng dụng chẩn đoán y tế." | "**Không phải chẩn đoán.** Đây là workspace nghiên cứu / học tập." |
| ❌ "Nhóm đã chọn xong framework mobile." | "Đang dựng thử React Native/Expo và **đo trên máy thật**; **chưa chốt**, chốt sau khi có bằng chứng." |
| ❌ "Nhóm tái lập kết quả bài báo LAScarQS." | "Nhóm lấy **giả thuyết** từ bài báo, nhưng **dữ liệu khác** — kết quả là của LASC 2018 theo giao thức của nhóm." |
| ❌ "3D Slicer / cvi42 không có tính năng này." | "Từng năng lực **có thể đã tồn tại**; khác biệt của nhóm nằm ở **cách tích hợp**." |
| ❌ "Chạy qua mạng 4G/5G." | "Đường chuẩn là **Wi-Fi** vào mạng riêng ZeroTier. Cellular đo ra quá chậm." |

**Và:** không đọc số phần trăm hoàn thành, số ngày còn lại, số yêu cầu đã nghiệm thu, tên cổng hay mã
quyết định nội bộ.
