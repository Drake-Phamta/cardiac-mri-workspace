# cvi42 — ghi chú tham chiếu thiết kế

| Mục | Giá trị |
|---|---|
| Loại tài liệu | **Tham chiếu thiết kế — KHÔNG phải yêu cầu** |
| Ghi ngày | 2026-09-22 |
| Dùng khi nào | Khi bắt đầu thiết kế giao diện sản xuất, tức **sau khi `GATE-MOB-01` đóng** |
| Ràng buộc | **Không** tạo yêu cầu mới · **không** sửa spec đóng băng · **không** chọn framework |

> ### ⚠ inspiration ≠ requirement
>
> Không dòng nào trong tài liệu này là một yêu cầu. Không dòng nào được trích dẫn như căn cứ nghiệm thu.
> Nếu một ý ở đây muốn trở thành ràng buộc, nó phải đi qua đúng đường: **Decision Request → phân tích tác
> động → leader duyệt → cập nhật đặc tả**. Trước đó nó chỉ là một gợi ý để cân nhắc.

---

## 1. Vì sao cvi42 đáng tham chiếu

cvi42 của Circle Cardiovascular Imaging là phần mềm đọc và báo cáo ảnh tim mạch, vendor mô tả là
*"Comprehensive, fast, accurate reading and reporting for cardiac MR"*. Nó chạy trên **máy trạm desktop**
kèm một **web viewer**, và có các nhóm chức năng: Function, Flow, Tissue characterization (T1/T2/T2\*),
Strain, 4D Flow, Quantitative Perfusion, Reporting, cùng **contour tự động bằng AI**.

Lý do đáng học **không** phải vì nó cùng loại sản phẩm với dự án này — nó không cùng loại. Lý do là:

- Nó giải **cùng một bài toán trình bày** mà dự án sẽ gặp: ảnh y tế, **đường viền/mask chồng lên ảnh**, và
  **số liệu định lượng** phải cùng tồn tại trên một màn hình mà vẫn đọc được.
- Nó phục vụ **người dùng chuyên môn**, nên chấp nhận mật độ thông tin cao — gần với người dùng của dự án
  (nhà nghiên cứu) hơn là một ứng dụng tiêu dùng.
- Nó là sản phẩm thương mại đã tồn tại lâu, tức các lựa chọn bố cục của nó **đã qua sàng lọc thực tế**, dù
  ta không biết lý do cụ thể phía sau từng lựa chọn.

### Điều phải nhớ về sự khác hạng mục

| | cvi42 | Dự án này |
|---|---|---|
| Hạng mục | **thiết bị y tế được quản lý ở Mỹ** — có nhiều số 510(k), dùng theo kê đơn (Rx) | **nghiên cứu / học tập**, **không** lâm sàng |
| Nền tảng | máy trạm desktop + web viewer | **mobile-first**, Android |
| Mục đích | đọc và báo cáo ca bệnh | **điều tra hành vi sai của mô hình AI** |

Khác hạng mục nghĩa là: **mượn cách bố trí thì được, mượn tuyên bố năng lực thì không.** Không bao giờ nói
hay ngụ ý rằng sản phẩm của nhóm tương đương cvi42 về mặt lâm sàng.

---

## 2. Những mẫu UI / quy trình đáng nghiên cứu

Danh sách này là **câu hỏi để quan sát**, không phải kết luận đã rút ra.

**a. Phân tầng thông tin.** Cái gì luôn hiện, cái gì ẩn sau một lần chạm, cái gì chỉ hiện khi liên quan?
Một màn hình chuyên môn thường có ba tầng: định danh ca luôn hiện · công cụ theo ngữ cảnh · số liệu chi
tiết theo yêu cầu.

**b. Quy trình nhiều khung ảnh.** Nhiều khung cạnh nhau (các mặt cắt, các chuỗi ảnh khác nhau) và cách
chúng **đồng bộ với nhau**. Điều đáng học không phải "có nhiều khung", mà là **khung nào đồng bộ với khung
nào và theo trục gì**.

**c. Overlay sống chung với ảnh gốc.** Đây là điểm đáng học nhất. Đường viền và mask phải nhìn thấy được
**mà không che mất ảnh bên dưới** — vì người dùng cần đánh giá chính cái ảnh đó. Quan sát: độ dày nét,
dùng viền hay tô nền, độ trong suốt, và **cách bật/tắt nhanh để so sánh có–không**.

**d. Bảng số đặt ở đâu so với ảnh.** Số liệu định lượng nằm cạnh ảnh, dưới ảnh, hay trong panel riêng? Khi
người dùng nhìn một con số, họ có thấy được vùng ảnh sinh ra con số đó không? Đây là câu hỏi trung tâm của
dự án này, vì cả sản phẩm xoay quanh việc **truy số về bằng chứng ảnh**.

**e. Làm thông tin không gian dễ hiểu.** Khi có nhiều mặt cắt hoặc thành phần 3D, làm sao người dùng biết
mình **đang ở đâu** trong khối? Chỉ báo vị trí, đường tham chiếu chéo, thu nhỏ tổng quan.

**f. Mật độ thị giác cho người dùng chuyên môn.** Người chuyên môn chấp nhận — và thường muốn — mật độ cao
hơn người dùng phổ thông. Quan sát ranh giới: bao nhiêu là đủ dày để hiệu quả, bao nhiêu là quá dày.

**g. Điều hướng giữa các trạng thái.** Chuyển giữa ca, giữa chuỗi ảnh, giữa các bước phân tích. Người dùng
có mất ngữ cảnh khi chuyển không? Quay lại có về đúng chỗ cũ không?

---

## 3. Mẫu nào **có thể** chuyển tốt sang workspace nghiên cứu trên di động

Vẫn là **giả thuyết**, chưa kiểm chứng trên người dùng thật.

| Mẫu | Vì sao có thể hợp |
|---|---|
| **Định danh ca luôn hiện** | Trên màn hình nhỏ càng dễ lạc ngữ cảnh. Một dải mỏng luôn hiện ghi ca / run / variant có thể đáng giá hơn trên mobile so với desktop |
| **Bật/tắt overlay nhanh, một chạm** | So sánh có–không là thao tác gốc của việc điều tra lỗi. Trên mobile nó còn quan trọng hơn vì không thể hiện hai khung cạnh nhau ở kích thước hữu ích |
| **Overlay bằng viền thay vì tô đặc** | Giữ được ảnh gốc nhìn thấy — quan trọng gấp đôi trên màn hình nhỏ |
| **Số liệu gắn với vùng ảnh sinh ra nó** | Đúng trọng tâm dự án: mọi con số phải lần ngược về bằng chứng |
| **Chỉ báo "đang ở đâu" trong khối** | Với `n / total` và liên kết 2D⇄3D, đây là thứ dự án chắc chắn cần |
| **Phân tầng: luôn hiện / theo ngữ cảnh / theo yêu cầu** | Nguyên tắc này độc lập với kích thước màn hình |

---

## 4. Mẫu nào **có lẽ không** chuyển thẳng sang di động

| Mẫu desktop | Vì sao khó |
|---|---|
| **Nhiều khung ảnh cùng lúc** | Màn hình 1080×2340 chia bốn thì mỗi khung quá nhỏ để đánh giá phân vùng. Có thể phải thay bằng **một khung + chuyển nhanh**, và đó là một thiết kế khác chứ không phải thu nhỏ |
| **Thanh công cụ dày đặc nút nhỏ** | Ngón tay không phải con trỏ chuột. Cần ít công cụ hơn, vùng chạm lớn hơn |
| **Hover để xem thông tin** | Trên cảm ứng **không có hover**. Mọi thông tin phụ thuộc hover phải tìm đường khác |
| **Panel số liệu cố định bên cạnh** | Chiều ngang quá hẹp. Có thể phải thành panel kéo lên từ dưới, hoặc lớp phủ |
| **Menu nhiều tầng** | Chậm và dễ lạc trên cảm ứng |
| **Chuột phải / phím tắt** | Không tồn tại. Cần cử chỉ thay thế, mà cử chỉ lại đụng vào cử chỉ zoom/pan/cọ đã có |
| **Báo cáo nhiều trang trên màn hình** | Việc của desktop; trên mobile có lẽ chỉ nên xem và xuất |

**Ràng buộc riêng của dự án này mà cvi42 không có:** cử chỉ vẽ cọ phải **tách bạch** với cử chỉ zoom/pan —
một ngón để tô, hai ngón để di chuyển. Bất kỳ mẫu tương tác nào mượn về đều phải kiểm tra không phá luật
đó.

---

## 5. Câu hỏi để quay lại khi bắt đầu thiết kế giao diện sản xuất

1. Trên một màn hình, tối thiểu bao nhiêu thông tin phải **luôn** hiện để người dùng không lạc? (ca? run?
   variant? `n / total`?)
2. Bật/tắt overlay bằng cử chỉ gì mà **không** đụng cọ, zoom, pan?
3. Khi hiện số liệu, vùng ảnh sinh ra nó có được đánh dấu đồng thời không?
4. Lúc chuyển từ 3D về 2D, màn hình nên **khôi phục** trạng thái xem cũ hay **nhảy tới** vùng vừa chọn?
5. Trạng thái "không có nhãn thật" hiển thị thế nào để **không** bị đọc nhầm thành "lỗi bằng 0"?
6. Phân biệt **dự đoán gốc** với **bản sửa chưa lưu** và **bản sửa đã lưu** bằng dấu hiệu thị giác nào —
   không chỉ bằng chữ?
7. Mật độ bao nhiêu là quá dày trên 1080×2340 ở khoảng cách cầm tay bình thường?
8. Cái gì **không** nên có trên mobile dù desktop vẫn có?

---

## 6. Tuyên bố ranh giới

**inspiration ≠ requirement.**

Tài liệu này **không**:
- thay đổi bất kỳ yêu cầu đóng băng nào trong `docs/specs/v1.0/**`;
- cho phép sao chép giao diện, bố cục cụ thể, hay bất kỳ yếu tố thương hiệu nào của cvi42;
- chọn framework hay công nghệ nào;
- ngụ ý sản phẩm của nhóm tương đương cvi42 về mặt lâm sàng hay về năng lực đã được kiểm định;
- tạo ra nghĩa vụ thiết kế cho bất kỳ thành viên nào.

Tài liệu này **có**: ghi lại một danh sách câu hỏi để quan sát, để khi tới lúc thiết kế giao diện sản xuất
thì nhóm không bắt đầu từ con số không.

---

**Nguồn đã kiểm:** trang sản phẩm Cardiac MR của Circle Cardiovascular Imaging (mô tả, danh sách module,
nền tảng desktop + web viewer) và cơ sở dữ liệu định danh thiết bị của FDA — AccessGUDID (trạng thái thiết
bị y tế được quản lý, product code, các số 510(k)). Kiểm ngày 2026-09-22.

**Liên quan:** [`../../docs/specs/v1.0/10_MOBILE_UX_AND_INTERACTION_SPEC.md`](../../docs/specs/v1.0/10_MOBILE_UX_AND_INTERACTION_SPEC.md)
· [`../DEMO_STANDARD.md`](../DEMO_STANDARD.md)
· [`../presentation/app_consultation/`](../presentation/app_consultation/)
