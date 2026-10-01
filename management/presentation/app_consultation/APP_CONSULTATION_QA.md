# Hỏi đáp — 17 câu nhiều khả năng bị hỏi

Trả lời **2–5 câu**, không dài hơn. Chỗ nào chưa quyết thì **nói thẳng là chưa quyết** — thầy hỏi lại được,
và trả lời vống một lần thì mất tin cả buổi.

Ký hiệu người trả lời: **[TA]** Tuấn Anh · **[K]** Khánh · **[HA]** Hùng Anh · **[T]** Trung.

---

### 1. Người dùng của app này chính xác là ai? **[TA]**

Nhà nghiên cứu hoặc sinh viên nghiên cứu đang làm về phân vùng ảnh y tế. Họ đã có mô hình và có kết quả,
và họ cần hiểu **mô hình sai ở đâu**. Đặc tả của nhóm em ghi rõ người dùng **không được giả định là bác sĩ
có chứng chỉ hành nghề**, và sản phẩm không phục vụ quy trình khám chữa bệnh.

### 2. Vì sao làm trên điện thoại chứ không phải desktop hay web? **[TA]**

Vì bối cảnh dùng khác nhau. Việc huấn luyện và phân tích nặng vẫn ở máy tính; nhưng việc **xem lại, đối
chiếu và đánh dấu một ca** thì thường xảy ra lúc không ngồi trước máy — trong lúc họp, lúc trao đổi với
người khác. Và về mặt môn học, làm mobile buộc nhóm em phải giải những bài toán thật: bộ nhớ có hạn, thao
tác chạm, hiệu năng 3D trên GPU di động — những thứ trên desktop không lộ ra.

### 3. Đóng góp của AI ở đây là gì? **[K]**

Có hai phần. Một là **mô hình phân vùng** tâm nhĩ trái từ ảnh LGE MRI — đó là phần tạo ra dự đoán. Hai là
**câu hỏi nghiên cứu**: so sánh một mô hình dựa trên nền tảng thị giác DINOv2 với một UNet thường, xem cái
nào chịu được việc **giảm dữ liệu có nhãn** tốt hơn. Phần hai mới là đóng góp nghiên cứu; phần một là công
cụ.

### 4. Vì sao chọn DINOv2? **[K]**

Vì nó là mô hình nền tảng đã được huấn luyện tự giám sát trên lượng ảnh rất lớn, nên giả thuyết là đặc
trưng nó học được giúp cần **ít nhãn hơn** cho tác vụ xuôi dòng. Trong ảnh y tế, nhãn phải do người có
chuyên môn khoanh tay nên rất đắt — nếu giả thuyết đó đúng thì đó là điều đáng biết. Nhóm em kiểm tra giả
thuyết chứ không giả định nó đúng.

### 5. Nếu DINOv2 tệ hơn UNet thì sao? **[K]**

Thì nhóm em báo cáo đúng như vậy, và đó **vẫn là kết quả hợp lệ**. Trong đặc tả của nhóm có một yêu cầu
bắt buộc ghi rằng thành công của đồ án **không được phụ thuộc vào việc DINOv2 thắng**, và cấm chỉnh sửa
hay lọc bằng chứng để ép ra kết quả mong muốn. Một kết quả âm được đo đúng giao thức vẫn trả lời được câu
hỏi nghiên cứu.

### 6. Vì sao cần 3D? **[HA]**

Vì lỗi phân vùng có cấu trúc không gian mà nhìn từng lát cắt 2D không thấy được — ví dụ mô hình cắt cụt
một đoạn thành nhĩ, trên từng lát chỉ thấy thiếu một ít, nhưng nhìn khối 3D thì thấy rõ cả vùng bị mất.
3D ở đây là **công cụ phân tích**: chọn một vùng trên khối thì hệ thống đưa người dùng về **đúng lát cắt
nguồn** của vùng đó để xem bằng chứng gốc. Nếu 3D chỉ để xoay cho đẹp thì nhóm em đã không làm.

### 7. Khác gì so với 3D Slicer hay cvi42? **[HA]**

Nhóm em không nói họ thiếu gì — từng năng lực riêng lẻ họ đều có và thường tốt hơn. Khác biệt nằm ở **cách
ghép**: một chuỗi liền mạch từ **kết quả thí nghiệm** xuống **vùng lỗi trên lát cắt**, qua **3D**, rồi tới
**thao tác sửa**, và chạy **trên điện thoại**. 3D Slicer là nền tảng desktop đa dụng; cvi42 là phần mềm
lâm sàng chạy trên máy trạm và web. Sản phẩm của nhóm em là workspace **điều tra lỗi AI**, mobile-first,
dùng cho nghiên cứu.

### 8. Đây có phải ứng dụng chẩn đoán không? **[TA]**

**Không.** Đặc tả của nhóm ghi rõ sản phẩm dành cho **nghiên cứu và học tập**, **không dùng cho chẩn đoán
hay quyết định điều trị**, và giao diện không được đưa ra bất kỳ tuyên bố nào ngụ ý đã được kiểm định lâm
sàng. Chẩn đoán lâm sàng, khuyến nghị điều trị, tích hợp hệ thống bệnh viện đều nằm **ngoài phạm vi** ngay
từ đầu.

### 9. Dữ liệu lấy từ đâu? **[K]**

Bộ **LASC 2018 / Atria Segmentation Data**, tải từ trang chính thức của **Cardiac Atlas Project**. Gồm
**154 ca**, mỗi ca có một khối ảnh LGE MRI và một nhãn tâm nhĩ trái. Nhóm em đã tải gói chính thức, ghi
lại mã băm của gói, và kiểm từng file trước khi dùng. Dữ liệu công khai, đã khử định danh.

### 10. Làm sao chống rò rỉ dữ liệu giữa train và test? **[K]**

Ba lớp, **nguyên tắc đã quyết, bản chia cuối cùng đang chờ nghiệm thu**. Một, **tập test chính thức được
khoá lại**, không dùng để chọn mô hình. Hai, nhóm em
phát hiện **hai ca thực chất là cùng một lần chụp xuất ra hai lần** — nhãn trùng nhau từng byte — nên gộp
làm một nhóm và ghim cả hai vào phía huấn luyện. Ba, gói dữ liệu **không có bảng ánh xạ ca sang bệnh
nhân**, nên nhóm em không thể khẳng định tách theo bệnh nhân; thay vào đó chạy sàng lọc tương đồng ảnh và
loại những ca giống nhau vượt ngưỡng ra khỏi tập huấn luyện. Giới hạn này được ghi rõ **bên cạnh mọi con
số đánh giá**, không giấu.

### 11. App di động sẽ dùng công nghệ gì? **[T]**

Nhắm nền tảng **Android**. Ứng viên đang dựng thử là **React Native + Expo**, đã chạy thật trên máy
Samsung Galaxy A17 5G. Phần hiển thị 2D — zoom, kéo, cọ vẽ — nhóm em **tự viết bằng JavaScript thuần**
thay vì dùng thư viện, vì cần kiểm soát chính xác việc chạm nào rơi vào pixel nguồn nào. **Framework cuối
cùng chưa được chọn**, sẽ chốt sau khi có đủ số đo của phần 2D và phần 3D.

### 11b. Backend dùng framework gì? **[T]**

**Nhóm em chưa chọn framework backend.** Hiện có hai thứ đã tồn tại: một **hợp đồng API** viết bằng JSON
Schema, và các **công cụ dòng lệnh bằng Python** để nạp dữ liệu và kiểm tính hợp lệ. Việc chọn framework
web để lại tới khi bắt đầu hiện thực hoá API — chọn sớm mà chưa biết hình dạng dữ liệu thì dễ phải làm
lại.

### 11c. Lưu trữ bằng cơ sở dữ liệu gì? **[T]**

Hiện tại **chưa dùng cơ sở dữ liệu**. Dữ liệu và kết quả mô hình được mô tả bằng **các tệp JSON manifest
có đánh phiên bản**, mỗi tệp ghi nguồn gốc và mã băm của thứ nó trỏ tới. Với quy mô 154 ca và một số ít
lần chạy thí nghiệm thì cách này đủ và dễ kiểm chứng hơn. Nếu sau này cần truy vấn phức tạp thì mới thêm
cơ sở dữ liệu.

### 11d. Phần 3D dùng thư viện gì — Three.js? **[HA]**

**Không dùng thư viện 3D nào.** Hiện là **WebGL2 viết tay**, mesh xuất ra định dạng **OBJ**. Lý do là
spike cần đo chính xác chi phí vẽ và độ chính xác khi chạm vào mesh — một thư viện sẽ thêm một tầng mà
nhóm em không kiểm soát được, làm số đo khó quy trách nhiệm. **Có dùng thư viện hay không thì chưa chốt**;
nếu về sau cần tính năng phức tạp hơn thì cân nhắc lại.

### 12. Vì sao chưa chọn xong framework? **[T]**

Vì hai yêu cầu quan trọng nhất đều là yêu cầu hiệu năng trên máy thật: lật lát cắt phải dưới một ngưỡng
thời gian, và 3D phải giữ được khung hình tối thiểu. Chọn framework theo cảm tính rồi phát hiện không đạt
thì phải làm lại từ đầu. Nên nhóm em dựng một ứng viên, **đo trên máy thật**, và chỉ chốt khi có số. Hiện
phần 2D đã có số đo, phần 3D đang đo nốt.

### 13. Điện thoại kết nối với backend thế nào? **[T]**

Điện thoại nối Internet qua **Wi-Fi**, vào một **mạng riêng có xác thực** dựng bằng **ZeroTier**, rồi mới
tới **Mac mini M2 24 GB** đặt ở xa. Máy chủ không phơi ra Internet công cộng; chỉ thiết bị đã được cấp
quyền vào mạng riêng mới gọi được API. Nhóm em có thử đường **4G/5G** và đo được là **quá chậm** cho việc
tải khối ảnh, nên đường chuẩn là Wi-Fi.

### 14. Nếu mất mạng lúc demo thì sao? **[T]**

Nhóm em coi đó là rủi ro phải chuẩn bị chứ không phải chuyện xui. Kiểm tra đường truyền tại chỗ **trước
buổi demo**; dữ liệu và kết quả dùng cho demo là **artifact đã tính sẵn**, không phải chạy mô hình tại
chỗ; và ứng dụng có trạng thái **"không kết nối được, thử lại"** rõ ràng thay vì treo hoặc hiện màn hình
trắng. Nhóm em cũng đang giữ phương án trình bày bằng bản ghi màn hình nếu mạng tại chỗ không đạt.

### 15. Mỗi thành viên phụ trách chức năng gì? **[TA]**

Bốn người, mỗi người một mảng dọc của sản phẩm **và** một mảng kỹ thuật ngang:

| Người | Mảng sản phẩm | Mảng kỹ thuật |
|---|---|---|
| Phạm Tuấn Anh | Case Explorer 2D + Error Inspector | tích hợp, CI, hợp đồng chung |
| Vũ Hùng Anh | 3D và điều tra lỗi không gian | ảnh học, hình học, liên kết 2D–3D |
| Bế Quốc Khánh | So sánh thí nghiệm và nhóm ca | huấn luyện và đánh giá ML |
| Nguyễn Gia Đức Trung | Review / sửa tay và Findings | backend, lưu trữ, nạp dữ liệu |

Mỗi người là **chủ sở hữu thật** của mảng mình, và là người review cho mảng của người khác.

### 16. Từng người có tự bảo vệ được phần của mình không? **[TA]**

Có. Mỗi người có một gói bằng chứng riêng ghi: yêu cầu nào thuộc về mình, thiết kế màn hình, phần code
mình viết, và kết quả kiểm thử của phần đó. Ngoài ra mọi thay đổi đều đi qua pull request và **phải có
người khác duyệt** — nên mỗi người vừa hiểu phần mình, vừa đã đọc phần của người khác.

### 17. Hiện đã làm được đến đâu? **[TA]**

Đặc tả và các hợp đồng dùng chung đã xong và có kiểm tra tự động. **Cổng dữ liệu đã nghiệm thu** — 154 ca
đã kiểm từng file, cách chia dữ liệu đã quyết và được kiểm chứng độc lập. Hai phần đo trên điện thoại thật
đang chạy, phần 2D đã có số. Mã sản phẩm cho các màn hình đang được tích hợp. Bước tới là **kiểm tra khả
thi huấn luyện trên dữ liệu thật** rồi chạy bộ thí nghiệm đầy đủ.

---

## Câu khó hơn — chuẩn bị sẵn phòng khi

### Có sản phẩm nào so sánh thí nghiệm ML như nhóm không? **[K]**

Có, nhưng ở mảng khác. Các công cụ theo dõi thí nghiệm như **MLflow** hay **Weights & Biases** làm rất tốt
việc ghi và so sánh các lần chạy; **MONAI Label** thì gắn mô hình y tế vào công cụ khoanh vùng như 3D
Slicer. Điểm nhóm em làm khác là **nối bảng so sánh thí nghiệm thẳng xuống bằng chứng ảnh của từng ca**,
trong cùng một ứng dụng — thường thì hai việc đó nằm ở hai công cụ rời nhau.

### Vì sao không dùng luôn 3D Slicer, thêm plugin vào? **[HA]**

Đó là một hướng hợp lý cho môi trường desktop, và 3D Slicer có hơn 150 extension. Nhưng đề tài của nhóm em
đặt ra là **workspace trên điện thoại**, mà 3D Slicer là phần mềm desktop. Ngoài ra nhóm em muốn tự giải
bài toán liên kết 2D–3D và bài toán hiệu năng trên thiết bị di động — đó là phần học thuật của môn này.

### Dữ liệu có phải của bệnh nhân thật không, có vấn đề đạo đức không? **[K]**

Là dữ liệu bệnh nhân thật nhưng **đã khử định danh và công bố công khai** phục vụ nghiên cứu, thông qua
một challenge khoa học. Nhóm em dùng đúng gói chính thức, không tự thu thập, không xử lý dữ liệu định danh,
và không hiển thị thông tin nhận dạng nào trong ứng dụng.

### Nhóm có tái lập được kết quả của bài báo gốc không? **[K]**

**Không, và nhóm em không tuyên bố điều đó.** Bài báo gốc dùng một bộ dữ liệu khác mà nhóm em không có
quyền truy cập. Nhóm em lấy **giả thuyết** từ bài báo, nhưng đo trên bộ LASC 2018, nên kết quả phải được
đọc là **"kết quả trên LASC 2018 theo giao thức của nhóm"**, không phải tái lập số của bài báo.

### Phạm vi này có quá lớn cho một đồ án môn học không? **[TA]**

Đó là rủi ro nhóm em nhận diện từ đầu, nên có hai biện pháp. Một, **phạm vi được đóng băng bằng văn bản**
và có danh sách rõ những thứ **nằm ngoài**: không chẩn đoán, không tích hợp bệnh viện, không quy trình
bệnh nhân, một thiết bị duy nhất. Hai, những quyết định kỹ thuật rủi ro cao được tách thành **các phần đo
riêng** làm trước — nếu một hướng không khả thi thì nhóm em biết sớm và đổi, chứ không phát hiện vào tuần
cuối.

---

## Nguồn của những phát biểu về sản phẩm tham chiếu

Hai câu dưới đây là **phát biểu có kiểm chứng**, nếu thầy hỏi nguồn thì trả lời được:

| Phát biểu | Nguồn |
|---|---|
| 3D Slicer *"NOT approved for clinical use and the distributed application is intended for research use"*; giấy phép BSD; chạy Linux/macOS/Windows | tài liệu chính thức 3D Slicer, mục About |
| cvi42 là **thiết bị y tế được quản lý ở Mỹ**, dùng theo kê đơn; có nhiều số 510(k) | cơ sở dữ liệu định danh thiết bị của FDA (AccessGUDID) |
| cvi42 chạy trên **máy trạm desktop và web viewer**; có các module Function, Flow, Tissue characterization, Strain, Reporting, contour bằng AI | trang sản phẩm Cardiac MR của Circle Cardiovascular Imaging |

**Không** phát biểu gì ngoài ba dòng này về hai sản phẩm đó.
