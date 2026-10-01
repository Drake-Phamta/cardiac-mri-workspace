# Lời nói — 4 người, 8–10 phút

Đây là **gạch đầu dòng để nói**, không phải văn bản để đọc. Đọc nguyên văn sẽ nghe như đọc báo cáo. Nắm ý,
nói bằng lời của mình, giữ đúng những chỗ **in đậm** — đó là những câu không được nói sai.

Tập một lượt tối nay, bấm giờ. Nếu quá 10 phút thì cắt ở slide 4 (bảng công nghệ đọc lướt hơn), **đừng cắt
slide 1 và 6**.

---

## 🎤 Phạm Tuấn Anh — mở đầu + slide 1 *(~1,5 phút)*

> Em chào thầy ạ. Nhóm em bốn người, đề tài là **workspace nghiên cứu ảnh MRI tim có hỗ trợ AI**.
>
> Em xin bắt đầu bằng vấn đề, vì nó quyết định cả sản phẩm.
>
> Khi huấn luyện một mô hình phân vùng, cuối cùng nhóm nghiên cứu thường nhận được **một con số** — ví dụ
> Dice trung bình 0,85. Con số đó nói mô hình tốt cỡ nào, nhưng **không nói nó sai ở đâu, sai trên ca nào,
> sai ở lát cắt nào, và sai kiểu gì**. Muốn biết thì phải mở notebook, viết code vẽ lại, lục file — mỗi lần
> muốn xem một ca là một lần làm thủ công.
>
> Nên sản phẩm của nhóm em **không phải một app phân vùng MRI**. Phân vùng chỉ là một mắt xích. Cái nhóm em
> làm là một **không gian làm việc để điều tra**: đi từ kết quả thí nghiệm xuống tới từng pixel, xem lỗi nằm
> ở đâu, và cho người dùng sửa lại.
>
> Câu hỏi dẫn đường của cả sản phẩm là câu này *(chỉ vào slide)*: **"Vì sao AI sai trên ca MRI này, và nhà
> nghiên cứu làm được gì với nó?"**
>
> Hai điều em xin nói rõ ngay từ đầu:
> - Người dùng là **nhà nghiên cứu hoặc sinh viên nghiên cứu**, không giả định là bác sĩ.
> - **Đây không phải phần mềm chẩn đoán.** Nó không đưa ra kết luận y khoa, và trong đặc tả của nhóm em có
>   ghi rõ điều đó.

---

## 🎤 Phạm Tuấn Anh — slide 2 *(~1,5 phút)*

> Đây là luồng làm việc chính. Người dùng đi theo một chuỗi:
>
> **Thí nghiệm → nhóm ca → một ca → một lát cắt → vùng lỗi → xem ở 3D → và sửa.**
>
> Bắt đầu từ bảng so sánh các thí nghiệm, thấy một ca có kết quả kém, mở ca đó ra, lật tới lát cắt có vấn
> đề, bật lớp phủ để xem AI sai chỗ nào so với nhãn thật, chuyển sang 3D để xem lỗi nằm ở đâu trong không
> gian, rồi quay lại 2D để sửa.
>
> Gom lại thì có **năm nhóm tính năng**:
>
> 1. **So sánh thí nghiệm và nhóm ca** — UNet với DINOv2, xem phân bố, lần xuống ca kém nhất.
> 2. **Trình duyệt ảnh MRI 2D** — lật lát cắt, bật tắt lớp phủ dự đoán / nhãn thật / lỗi, zoom và kéo.
> 3. **Liên kết 2D và 3D** — dựng lại tâm nhĩ trái ở 3D; chọn một vùng trên khối 3D thì quay về **đúng lát
>    cắt nguồn** của vùng đó. 3D ở đây để **phân tích**, không phải để cho đẹp.
> 4. **Con người xem lại và sửa** — chấp nhận, gắn cờ, hoặc dùng cọ sửa vùng phân vùng sai.
> 5. **Ghi nhận phát hiện** — mỗi quan sát được gắn với thí nghiệm, ca, lát cắt và vùng cụ thể.
>
> Em xin chuyển sang phần nghiên cứu, bạn Khánh phụ trách.

---

## 🎤 Bế Quốc Khánh — slide 3 *(1,5–2 phút)*

> Em chào thầy. Em phụ trách phần dữ liệu và mô hình.
>
> Trong sản phẩm này có một **câu hỏi nghiên cứu nhỏ** chứ không chỉ là làm phần mềm. Câu hỏi là:
>
> **Khi giảm lượng dữ liệu có nhãn xuống, mô hình dựa trên DINOv2 có suy giảm ít hơn một UNet thường
> không?**
>
> Lý do câu hỏi này đáng hỏi: gán nhãn ảnh y tế rất đắt, phải người có chuyên môn ngồi khoanh từng lát cắt.
> Nếu một mô hình nền tảng đã học sẵn đặc trưng ảnh giúp giảm được lượng nhãn cần thiết thì đó là điều
> thực tế đáng biết.
>
> Cách làm: **sáu lần huấn luyện** — UNet và DINOv2, mỗi loại ở **25%, 50% và 100%** dữ liệu huấn luyện.
> Quan trọng là các tập con **lồng nhau**: tập 25% nằm trong tập 50%, 50% nằm trong 100%, cùng seed, và
> **hai mô hình dùng đúng cùng một tập**. Như vậy khác biệt đo được là do **lượng nhãn**, không phải do
> chia dữ liệu may rủi.
>
> Dữ liệu là bộ **LASC 2018** từ Cardiac Atlas Project — **154 ca**, nhóm em đã tải và kiểm từng file.
> Giao thức chia dữ liệu **đang được hoàn tất**: nguyên tắc đã quyết là giữ một phần dữ liệu **khoá lại**
> không đụng tới cho tới cuối, và loại bỏ những ca trùng lặp để không rò rỉ giữa hai phía — bản chia cuối
> cùng đang chờ nghiệm thu.
>
> Một điểm em xin nói thẳng: **nhóm em không đặt mục tiêu DINOv2 phải thắng.** Trong đặc tả của nhóm có một
> yêu cầu bắt buộc ghi rằng kết quả âm — tức DINOv2 không tốt hơn — **vẫn là kết quả hợp lệ**, miễn là giao
> thức đúng và bằng chứng đầy đủ. Nhóm em báo cáo cái đo được, không chỉnh để ra kết quả mong muốn.
>
> *(nếu còn giờ, 15 giây)* Còn một câu hỏi phụ nữa: một bước **hậu xử lý hình thái** sau khi mô hình chạy
> thì **cải thiện hay làm hại** kết quả. Cũng để mở, không giả định là sẽ cải thiện.
>
> Em xin chuyển cho bạn Trung nói phần công nghệ.

---

## 🎤 Nguyễn Gia Đức Trung — slide 4, phần chính *(~90 giây)*

> **Đọc tên công nghệ theo nhóm, đừng đọc từng thư viện.** Chi tiết — NumPy, Hugging Face `transformers`,
> mesh OBJ, `pynrrd`, chưa dùng cơ sở dữ liệu — để dành trả lời khi thầy hỏi, có sẵn trong `QA` mục 11b–11d.

> Em chào thầy. Em phụ trách backend, lưu trữ và phần review.
>
> Em xin điểm nhanh theo nhóm.
>
> **Ứng dụng** nhắm **Android**, đang dựng thử bằng **React Native và Expo**, đã chạy trên máy thật.
>
> **Phía học máy** là **Python** và **PyTorch** — một **UNet** làm baseline và một mô hình dựa trên
> **DINOv2**. Ảnh y tế ở định dạng **NRRD**.
>
> **Hiển thị**: phần 2D viết bằng **JavaScript thuần** trong React Native — zoom, kéo và cọ vẽ nhóm em tự
> viết, vì cần kiểm soát chính xác chạm nào rơi vào pixel nào. Phần 3D dùng **WebGL2, không thư viện**.
>
> **Hạ tầng**: một **Mac mini M2 24 GB** làm máy chủ, điện thoại nối vào qua **Wi-Fi** và mạng riêng
> **ZeroTier**. Mã nguồn và kiểm thử tự động trên **GitHub** và **GitHub Actions**.
>
> Có **ba chỗ nhóm em chưa chốt**, em xin nói thẳng chứ không để thầy tự đoán: **framework di động**,
> **framework backend** — hiện mới có hợp đồng API và công cụ dòng lệnh Python — và **thư viện 3D**.
> Cả ba sẽ chốt khi có đủ số đo, không chốt theo cảm tính.
>
> Cuối cùng, phần review em phụ trách: khi người dùng sửa bằng cọ, **dự đoán gốc của mô hình không bị ghi
> đè** — mỗi lần lưu tạo một phiên bản mới, truy vết được.

## 🎤 Vũ Hùng Anh — xen vào slide 4, phần 3D *(~20 giây)*

> Em bổ sung dòng 3D ạ. Nhóm em dựng mesh từ mask rồi hiển thị bằng **WebGL2**. Ràng buộc khó nhất không
> phải là vẽ cho mượt, mà là: khi người dùng **chạm vào một điểm trên khối 3D**, hệ thống phải trả về
> **đúng lát cắt nguồn** của điểm đó — sai lệch cho phép tối đa **một lát cắt**. Muốn chạy mượt trên điện
> thoại thì phải giảm số tam giác của mesh, nhưng giảm nhiều quá thì sai vị trí. **Ngưỡng giảm bao nhiêu
> thì nhóm em chưa chốt** — đang đo.

---

## 🎤 Vũ Hùng Anh — slide 5 *(~1,5 phút)*

> Em nói tiếp phần sản phẩm tham chiếu.
>
> Nhóm em nghiên cứu hai sản phẩm, và học hai thứ khác nhau từ chúng.
>
> **3D Slicer** là nền tảng mã nguồn mở để xem và phân tích ảnh y sinh, chạy trên desktop. Nhóm em học ở
> đây **quy trình phân vùng** và **cách liên kết 2D với 3D** — người dùng làm việc trên lát cắt nhưng vẫn
> thấy được hình khối. Một điểm đáng chú ý: chính tài liệu của 3D Slicer ghi rằng phần mềm **không được
> duyệt cho sử dụng lâm sàng và dành cho mục đích nghiên cứu**. Sản phẩm của nhóm em cũng được giới hạn ở
> nghiên cứu/học tập, nhưng nhóm không coi hai sản phẩm là tương đương về phạm vi, mức độ trưởng thành hay
> validation.
>
> **cvi42** thì khác hẳn: đó là phần mềm thương mại để đọc và báo cáo ảnh tim mạch, và nó là **thiết bị y
> tế được cơ quan quản lý cấp phép**, dùng theo kê đơn. Nhóm em **không** so mình với nó về năng lực y
> khoa. Cái nhóm em học từ cvi42 là **cách tổ chức thông tin**: lớp phủ đặt cạnh ảnh gốc thế nào để vẫn
> nhìn được ảnh, bảng số đặt ở đâu so với ảnh, và làm sao để màn hình dày đặc thông tin mà người dùng
> chuyên môn vẫn đọc được.
>
> Em xin nói rõ: đây là **tham khảo cách bố trí và quy trình**, không sao chép giao diện, không dùng
> thương hiệu của họ, và **không tuyên bố sản phẩm của nhóm tương đương về mặt lâm sàng**. Nhóm em cũng
> không nói họ thiếu tính năng nào — nhóm không kiểm chứng được điều đó.
>
> Em xin trả lại cho bạn Tuấn Anh.

---

## 🎤 Phạm Tuấn Anh — slide 6 + chốt *(~1,5 phút)*

> Cuối cùng là điểm khác biệt, và em xin nói một cách thận trọng.
>
> Nhóm em **không** nói rằng chưa có sản phẩm nào làm được những việc này. Từng năng lực riêng lẻ — xem
> ảnh, phân vùng, dựng 3D, sửa mask — **đều đã tồn tại** ở đâu đó, và thường là tốt hơn những gì một đồ án
> môn học làm được.
>
> Cái nhóm em đặt ra là **cách ghép chúng lại**: một chuỗi liền mạch từ **kết quả thí nghiệm** xuống tới
> **vùng lỗi trên một lát cắt**, qua **3D**, rồi tới **thao tác sửa của con người** — và tất cả **trên
> điện thoại**.
>
> Bốn điểm cụ thể:
> - Đi từ **bảng kết quả xuống tận bằng chứng ảnh**, chứ không dừng ở biểu đồ.
> - Trọng tâm là **điều tra lỗi**, không phải trình bày dự đoán cho đẹp.
> - Liên kết **2D và 3D là xác định** — chọn trên 3D ra đúng lát cắt, không phải áng chừng.
> - **Sửa tay không xoá dấu vết của AI** — dự đoán gốc giữ nguyên, bản sửa là một phiên bản mới.
>
> Và thí nghiệm về khan hiếm dữ liệu **nằm trong chính workspace đó**, không phải một notebook rời bên
> ngoài.
>
> Về phạm vi, nhóm em giữ thực tế: một sản phẩm MVP chạy trên **một thiết bị đã khai báo**, dữ liệu công
> khai, **không** tích hợp hệ thống bệnh viện, **không** quy trình bệnh nhân, **không** chẩn đoán.
>
> Nhóm em xin hết phần trình bày, mong nhận góp ý của thầy ạ.

---

## 🎤 Nếu thầy hỏi: "Đã làm được gì rồi?" *(Tuấn Anh, 30–60 giây)*

> Dạ, hiện tại nhóm em đã xong phần **nền**:
>
> Đặc tả sản phẩm và các **hợp đồng dùng chung** giữa bốn người đã định nghĩa xong — API, định dạng dữ
> liệu, hệ toạ độ chung cho 2D và 3D — và có kiểm tra tự động trong CI.
>
> **Cổng dữ liệu đã nghiệm thu**: 154 ca đã tải, kiểm từng file, và cách chia dữ liệu chống rò rỉ đã được
> quyết và kiểm chứng độc lập.
>
> Hai spike về **2D và 3D trên điện thoại thật** đang chạy — phần 2D đã có số đo trên máy, sắp tới điểm
> quyết định nền tảng. Mã sản phẩm cho các phần màn hình đang được tích hợp dần.
>
> Bước then chốt tiếp theo là **kiểm tra khả thi huấn luyện trên dữ liệu thật** rồi mới chạy bộ thí nghiệm
> đầy đủ.

**Không** nói: số phần trăm hoàn thành, số ngày còn lại, số yêu cầu đã nghiệm thu, tên cổng hay mã quyết
định. Nếu thầy hỏi sâu hơn thì mở `APP_CONSULTATION_QA.md`.
