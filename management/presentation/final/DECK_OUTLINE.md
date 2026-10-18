# Dàn ý bộ slide nháp (sinh tự động)

> Tệp này do `tools/report/build_deck.py` sinh cùng `CARDIAC_MRI_DECK_DRAFT.pptx`: **không sửa tay**. Nó liệt kê từng slide, chữ hiển thị và ghi chú diễn thuyết để cả nhóm duyệt ngay trên GitHub. Mọi số liệu thí nghiệm lấy từ `results_aggregate.json`; số liệu quy trình lấy từ `tools/report/deck_facts.json` (mỗi mục được kiểm lại với tệp nguồn trong repo mỗi lần dựng).

- Số slide: **24** (16:9)
- Dữ liệu: `results_aggregate.json`, mã bf8f7892; các run: EXP-D-025, EXP-D-050, EXP-D-100, EXP-D-PP
- UNet: **chưa có (slide cần UNet hiện khung chờ "CHỜ KẾT QUẢ UNET (Khánh)")**

| # | Slide | Phần | Cần UNet |
|---|---|---|---|
| 1 | Cardiac MRI Workspace | BẢN NHÁP · SINH TỰ ĐỘNG TỪ ARTIFACT THÍ NGHIỆM | — |
| 2 | Một câu hỏi dẫn dắt cả dự án | MỞ ĐẦU | — |
| 3 | Luồng demo H1–H10 đi qua tám màn hình | SẢN PHẨM | — |
| 4 | Kiến trúc: điện thoại chỉ hiển thị, việc nặng nằm ở backend và ML | SẢN PHẨM | — |
| 5 | Dữ liệu chia đóng băng, holdout khoá, không rò rỉ theo từng case | DỮ LIỆU VÀ QUẢN TRỊ | — |
| 6 | Một công thức huấn luyện, chỉ khác dữ liệu và mô hình | HỌC MÁY · PHƯƠNG PHÁP | khung chờ |
| 7 | Dice 3D trung bình cao nhất: DINOv2 100 % + PP-4, 0,659 (n = 54) | HỌC MÁY · KẾT QUẢ | khung chờ |
| 8 | CI của từng run chồng nhau, nên cần so sánh cặp theo case | HỌC MÁY · KẾT QUẢ | — |
| 9 | Ít dữ liệu hơn thì Dice thấp hơn; mức tăng chủ yếu ở nửa đầu | HỌC MÁY · KẾT QUẢ | khung chờ |
| 10 | So sánh cặp từng case: delta Dice kèm CI 95 % | HỌC MÁY · KẾT QUẢ | — |
| 11 | RQ-A: UNet so với DINOv2 khi giảm dữ liệu | HỌC MÁY · SO SÁNH MÔ HÌNH | khung chờ |
| 12 | Từ voxel đến mặt nạ: chuẩn hoá theo volume, hai biến thể tách bạch | XỬ LÝ ẢNH · CHUẨN HOÁ VÀ RESIZE | — |
| 13 | Hậu xử lý được chọn từ danh sách khai báo trước, chỉ trên validation | XỬ LÝ ẢNH · GATE-IMG-01 | — |
| 14 | PP-4 bớt dương tính giả và gần như xoá sai lệch thể tích | XỬ LÝ ẢNH · TÁC ĐỘNG CỦA HẬU XỬ LÝ | — |
| 15 | Bề mặt 3D: chỉ mức L0 giữ đúng lát được chọn trong ±1 | XỬ LÝ ẢNH · TÁI DỰNG 3D | — |
| 16 | Phân phối trên cohort: vài ca rất thấp kéo trung bình xuống | KHOA HỌC DỮ LIỆU · PHÂN PHỐI VÀ NGOẠI LỆ | — |
| 17 | Lỗi theo lát: Dice cao ở giữa stack, về gần 0 ở hai đầu | KHOA HỌC DỮ LIỆU VÀ XỬ LÝ ẢNH · PROFILE THEO LÁT | — |
| 18 | Bộ nhớ đệm lát có giới hạn: không bao giờ tải cả khối cho mỗi cử chỉ | PHÁT TRIỂN DI ĐỘNG · HIỆU NĂNG | — |
| 19 | Hợp đồng, trạng thái và tính bất biến đều được kiểm bằng máy | PHÁT TRIỂN DI ĐỘNG · KIẾN TRÚC VÀ ĐỘ TIN CẬY | — |
| 20 | Chất lượng: luật khai báo trước, QA độc lập, spec đóng băng | CHẤT LƯỢNG VÀ KẾ HOẠCH | — |
| 21 | Giới hạn đã biết, nói thẳng | CHẤT LƯỢNG VÀ KẾ HOẠCH | — |
| 22 | Từ nay đến 31/10: bốn chặng, đường găng đi qua UNet | CHẤT LƯỢNG VÀ KẾ HOẠCH | — |
| 23 | Chuẩn bị Q&A (1/2): Học máy và Xử lý ảnh | CHUẨN BỊ Q&A | — |
| 24 | Chuẩn bị Q&A (2/2): Khoa học dữ liệu và Di động | CHUẨN BỊ Q&A | — |

## 1. Cardiac MRI Workspace

Phần: BẢN NHÁP · SINH TỰ ĐỘNG TỪ ARTIFACT THÍ NGHIỆM

**Trên slide**

- Ứng dụng di động kiểm tra vì sao AI phân đoạn sai trên MRI tim (tâm nhĩ trái)
- Nghiệm thu và bảo vệ 31/10/2026 · Học máy · Xử lý ảnh · Khoa học dữ liệu · Phát triển ứng dụng di động
- Phạm Tuấn Anh
- Trưởng nhóm · Project Control
- V1 Case Explorer / 2D MRI
- SCR-02 · 03 · 04
- Vũ Hùng Anh
- Imaging / Geometry
- V2 3D / spatial error
- SCR-05
- Bế Quốc Khánh
- ML training / evaluation
- V3 Experiment / cohort
- SCR-01 · 07
- Nguyễn Gia Đức Trung
- Backend / persistence
- V4 Review / findings
- SCR-06 · 08

**Ghi chú diễn thuyết**

Slide mở đầu. Đây là bản nháp do bộ dựng tự sinh từ artifact thí nghiệm: khi có kết quả UNet, chạy lại một lệnh (tools/report/build_all.py) thì các slide cần UNet tự điền. Giới thiệu nhóm bốn người và vai trò: Phạm Tuấn Anh (trưởng nhóm, vertical V1 Case Explorer / 2D MRI), Vũ Hùng Anh (V2 3D / sai số không gian), Bế Quốc Khánh (V3 Experiment / cohort, phụ trách huấn luyện), Nguyễn Gia Đức Trung (V4 Review / findings, backend). Mỗi người sở hữu một chức năng di động riêng và sẽ bảo vệ chức năng đó trong môn Phát triển ứng dụng di động.

## 2. Một câu hỏi dẫn dắt cả dự án

Phần: MỞ ĐẦU

**Trên slide**

- “Vì sao AI sai trên ca MRI này, và nhà nghiên cứu làm được gì?”
- Học máy
- DINOv2 so với UNet thế nào, nhất là khi giảm dữ liệu gán nhãn xuống 25 % và 50 %?
- Xử lý ảnh
- Voxel và mặt nạ thành biểu diễn 2D/3D xem được ra sao, và hậu xử lý tất định có giúp không?
- Khoa học dữ liệu
- Mô hình hành xử thế nào trên cả cohort; ngoại lệ và profile theo lát cho thấy gì ngoài số trung bình?
- Phát triển di động
- Quy trình ảnh y khoa kèm AI phức tạp thành một tương tác nghiên cứu dùng được trên điện thoại thế nào?
- Một sản phẩm, bốn góc nhìn: mỗi chức năng demo phục vụ ít nhất hai môn (spec 16 §4).

**Ghi chú diễn thuyết**

Câu hỏi bắc đẩu của dự án không phải là liệt kê tính năng. Một chỉ số Dice trung bình không cho biết mô hình sai ở đâu, sai ở lát nào, hay hai mô hình khác nhau thế nào trên cùng một giải phẫu. Sản phẩm biến luồng input → mask → metric thành một cuộc điều tra nhiều tầng: cohort → thí nghiệm → case → lát → vùng/pixel → giải phẫu 3D, và mọi số liệu đều lần ngược được về bằng chứng MRI. Bốn môn học là bốn góc nhìn lên cùng một sản phẩm (spec 16 §3, §4), không phải bốn dự án riêng.

## 3. Luồng demo H1–H10 đi qua tám màn hình

Phần: SẢN PHẨM

**Trên slide**

- H1
- Mở tổng quan cohort / thí nghiệm
- SCR-01
- H2
- Tìm ca ngoại lệ
- H3
- Mở trình khám MRI
- SCR-02 → 03
- H4
- Đến lát có vấn đề
- SCR-03 · 04
- H5
- So sánh dự đoán, ground truth, lỗi
- H6
- Mở 3D và bản đồ lỗi
- SCR-05
- H7
- Chọn vùng lỗi, nhảy về lát 2D
- SCR-05 → 03
- H8
- Gắn cờ hoặc sửa bằng brush
- SCR-06 · 08
- H9
- Lưu mask đã duyệt, giữ dự đoán gốc
- SCR-06
- H10
- Về so sánh mô hình và ít dữ liệu
- SCR-07
- Study Overview
- V3
- SCR-02
- Case List
- V1
- SCR-03
- Case Explorer 2D
- SCR-04
- Error Inspector
- 3D Inspector
- V2
- Review / Correction

Nguồn: Mục tiêu 60–90 giây, một lượt quay, ca demo đại diện (chọn theo quy tắc, không theo kết quả). Nguồn: management/DEMO_STANDARD.md §3–§4.

**Ghi chú diễn thuyết**

Kịch bản demo dài 60 đến 90 giây, một lượt quay liên tục, trên ca demo đại diện, chọn theo quy tắc chứ không phải vì mô hình trông tốt trên ca đó. Luồng bắt đầu ở tổng quan cohort (H1), tìm ca ngoại lệ (H2), mở ca trong trình khám MRI (H3), đến lát có vấn đề (H4), so sánh dự đoán với ground truth và bản đồ lỗi (H5), mở 3D (H6), chọn vùng lỗi và nhảy về lát 2D (H7), gắn cờ hoặc sửa bằng brush (H8), lưu mask đã duyệt mà vẫn giữ nguyên dự đoán gốc (H9) và quay về so sánh mô hình / ít dữ liệu (H10). Tám màn hình SCR-01 đến SCR-08 chia cho bốn vertical. Nguồn: management/DEMO_STANDARD.md §3 và §4.

## 4. Kiến trúc: điện thoại chỉ hiển thị, việc nặng nằm ở backend và ML

Phần: SẢN PHẨM

**Trên slide**

- Điện thoại
- Samsung Galaxy A17 5G (Android 16)
- Ứng dụng Expo SDK 57 · React Native 0.86.3 · React 19.2.3
- 2D: view native + lớp phủ SVG, brush
- 3D: WebGL2 trong react-native-webview
- app/core: hợp đồng, vận chuyển, 7 trạng thái màn hình
- Backend
- Mac mini M2 · FastAPI + SQLite
- 28 endpoint (23 cho hero flow)
- Review (bất biến) và finding trong SQLite
- Artifact trên đĩa: PNG theo lát, mesh L0, sha256
- 74 case phục vụ
- Pipeline ML
- PyTorch · máy tính riêng
- ml.infer → ml.postprocess → ml.evaluate
- DINOv2 và UNet, cùng công thức
- Xuất gói Contract 2 (dự đoán, chỉ số, 3D)
- Chỉ số theo case, CI bootstrap
- HTTP/JSON qua overlay riêng
- ảnh theo lát, không tải cả khối
- gói Contract 2
- Hợp đồng dùng chung, CI kiểm: API Contract 1.1.0 · Contract 2 (gói thí nghiệm) · geometry contract (fixture voxel ↔ lát ↔ thế giới, cả backend và app đều phải qua cùng fixture)

Nguồn: Nguồn: docs/specs/v1.0/09, management/adr/TECH_STACK_ADR.md, backend/README.md, mobile/README.md.

**Ghi chú diễn thuyết**

Kiến trúc logic theo spec 09. Bên trái là ứng dụng di động Expo / React Native, chạy trên Galaxy A17 5G: 2D dùng view native với lớp phủ SVG và brush, 3D là WebGL2 chạy trong react-native-webview, và lớp app/core viết bằng JavaScript thuần chịu trách nhiệm hợp đồng, vận chuyển và bảy trạng thái màn hình. Ở giữa là backend FastAPI + SQLite chạy trên Mac mini M2, điện thoại gọi qua mạng overlay riêng ZeroTier; 28 endpoint, trong đó 23 endpoint của hero flow, phiên bản API Contract 1.1.0. Bên phải là pipeline ML (PyTorch, máy tính riêng): suy luận, hậu xử lý, chấm điểm rồi xuất gói Contract 2; kết quả đến ứng dụng chỉ qua các gói này. Thanh dưới cùng là các hợp đồng dùng chung, được CI kiểm: không ai tự viết một biến đổi hình học riêng.

## 5. Dữ liệu chia đóng băng, holdout khoá, không rò rỉ theo từng case

Phần: DỮ LIỆU VÀ QUẢN TRỊ

**Trên slide**

- Train
- 80
- Val
- 20
- Holdout
- 54
- Tập con lồng nhau: 20 ⊂ 38 ⊂ 78 case hiệu dụng
- Holdout khoá
- 54 case chỉ chấm đúng một lần, sau khi GATE-IMG-01 đóng; không dùng để chọn mô hình, ngưỡng hay hậu xử lý.
- Không rò rỉ theo case
- Kho mã công khai chỉ có số tổng hợp (trung bình, CI, delta). Số theo từng case, ảnh MRI và mặt nạ nằm ngoài git.
- INT-12: ẩn, không mù
- Một case holdout dùng như case chỉ-suy-luận trong app. Vẫn nằm trong 54 case, nên thống kê cohort có thể suy ra giá trị của nó (DR-017).

Nguồn: Nguồn: management/spikes/SPIKE_D_DATASET/SPLIT_RESULT.md, management/day39/RESULTS_HOLDOUT_DINOV2.md, DR-002b, DR-017.

**Ghi chú diễn thuyết**

Bộ dữ liệu LASC 2018 gồm 154 case MRI tim. Phép chia Path A, seed 2024, đóng băng bằng sha256: train danh nghĩa 80 case (hiệu dụng 78 sau khi loại 2 case do nghi trùng bệnh nhân với một case holdout, DR-002b), validation 20 case dùng để chọn checkpoint và cấu hình, holdout 54 case chính là tập kiểm thử của cuộc thi, chỉ dùng để chấm cuối. Các tập con 25, 50, 100 phần trăm lồng nhau: 20 ⊂ 38 ⊂ 78 case hiệu dụng. Quản trị: holdout bị khoá cho tới khi GATE-IMG-01 đóng, mỗi run được dự đoán và chấm đúng một lần; kho mã công khai chỉ chứa số tổng hợp, số theo từng case nằm ngoài git; case INT-12 là case chỉ-suy-luận trong app, ẩn nhưng không làm mù (DR-017): nó vẫn nằm trong 54 case nên thống kê cohort có thể suy ra giá trị của nó.

## 6. Một công thức huấn luyện, chỉ khác dữ liệu và mô hình

Phần: HỌC MÁY · PHƯƠNG PHÁP · Khung chờ: **CHỜ KẾT QUẢ UNET (Khánh)** (tự thay khi có EXP-U-*)

**Trên slide**

- Hạng mục
- Giá trị đóng băng
- DINOv2
- dinov2-small, decoder tiến dần, fine-tune toàn bộ
- UNet
- UNet2D (base 32, depth 4), train từ đầu
- Đầu vào
- 560×560, mọi lát của mọi case
- Loss
- 0,5·BCE + 0,5·soft Dice
- Tối ưu
- AdamW, lr 1e-4 hằng số, bf16, seed 2024
- Lịch huấn luyện
- 50 epoch, batch 8, ngưỡng 0,5
- Chọn checkpoint
- epoch có Dice 3D validation cao nhất
- 0,558
- [0,505; 0,607]
- 0,616
- [0,567; 0,660]
- 0,639
- [0,594; 0,677]
- CHỜ KẾT QUẢ UNET (Khánh)
- DINOv2 100 % + PP-4: 0,659
- không huấn luyện thêm: hậu xử lý áp lên dự đoán của DINOv2 100 %

Nguồn: Nguồn: management/adr/ADR_ML_001.md; số trong ô lấy từ results_aggregate.json.

**Ghi chú diễn thuyết**

ADR-ML-001, đóng băng ngày 01/10, quy định một công thức duy nhất cho sáu run huấn luyện lõi: DINOv2 và UNet, mỗi họ ở 25, 50 và 100 phần trăm dữ liệu. DINOv2: dinov2-small, decoder tiến dần, fine-tune toàn bộ. UNet: UNet2D (base 32, depth 4), train từ đầu. Dùng chung: đầu vào 560×560, mọi lát của mọi case, loss 0,5·BCE + 0,5·soft Dice, AdamW, lr 1e-4 hằng số, bf16, seed 2024, 50 epoch, batch 8, ngưỡng 0,5, checkpoint là epoch có Dice 3D validation cao nhất. Mục tiêu là công bằng khoa học: cùng dữ liệu, cùng tiền xử lý, cùng loss, optimizer, batch, epoch, seed, ngưỡng và luật chọn checkpoint, nên chênh lệch kết quả là do mô hình và lượng dữ liệu. Kết quả không như kỳ vọng vẫn là kết quả hợp lệ (PR-SCI-03); không chỉnh gì sau khi thấy kết quả. EXP-D-PP không huấn luyện thêm: nó áp hậu xử lý đã đóng băng lên dự đoán của EXP-D-100. Hàng UNet đang chờ kết quả do Khánh huấn luyện.

## 7. Dice 3D trung bình cao nhất: DINOv2 100 % + PP-4, 0,659 (n = 54)

Phần: HỌC MÁY · KẾT QUẢ · Khung chờ: **CHỜ KẾT QUẢ UNET (Khánh)** (tự thay khi có EXP-U-*)

**Trên slide**

- Run
- Dice 3D TB [CI 95 %]
- Trung vị (Q1–Q3)
- SD
- IoU TB
- Sai lệch thể tích TB
- DINOv2 25 %
- 0,558  [0,505; 0,607]
- 0,604 (0,523–0,688)
- 0,194
- 0,409
- +19,2 %
- DINOv2 50 %
- 0,616  [0,567; 0,660]
- 0,668 (0,581–0,726)
- 0,174
- 0,464
- +12,5 %
- DINOv2 100 %
- 0,639  [0,594; 0,677]
- 0,679 (0,579–0,740)
- 0,154
- 0,485
- +14,9 %
- DINOv2 100 % + PP-4
- 0,659  [0,612; 0,699]
- 0,701 (0,581–0,766)
- 0,164
- 0,510
- +1,4 %
- CHỜ KẾT QUẢ UNET (Khánh)
- Ba run UNet (25 %, 50 %, 100 %) sẽ xuất hiện trong bảng này khi có kết quả holdout.

Nguồn: Hàng được tô = Dice cao nhất. Sai lệch thể tích = (V dự đoán − V ground truth) / V ground truth, theo voxel. Nguồn: results_aggregate.json (n = 54).

**Ghi chú diễn thuyết**

Kết quả cuối trên holdout khoá, n = 54 case, mỗi run dự đoán và chấm đúng một lần. Dice 3D tính theo từng case rồi lấy trung bình; CI 95 % là bootstrap phân vị của trung bình theo case, 10 000 lần, seed 2024. DINOv2 25 %: 0,558 [0,505; 0,607], trung vị 0,604. DINOv2 50 %: 0,616 [0,567; 0,660], trung vị 0,668. DINOv2 100 %: 0,639 [0,594; 0,677], trung vị 0,679. DINOv2 100 % + PP-4: 0,659 [0,612; 0,699], trung vị 0,701. Sai lệch thể tích (RVE) tính theo số voxel vì spacing là placeholder đơn vị. Chưa có UNet nên chưa so sánh được hai họ mô hình.

## 8. CI của từng run chồng nhau, nên cần so sánh cặp theo case

Phần: HỌC MÁY · KẾT QUẢ · Hình: `figures/fig_a_dice_mean_ci.png`

**Trên slide**

- 0,659
- Dice 3D TB cao nhất: DINOv2 100 % + PP-4
- CI 95 % [0,612; 0,699]
- Các run xếp từ ít đến nhiều dữ liệu, rồi đến bản hậu xử lý; điểm là trung bình, vạch là CI 95 %.
- 5 trong 6 cặp run có CI chồng nhau: nhìn riêng từng CI không đủ để kết luận.
- Phép so sánh đúng là so sánh cặp theo từng case (slide sau).

Nguồn: Nguồn: results_aggregate.json (n = 54); hình sinh bởi tools/report/build_report_assets.py.

**Ghi chú diễn thuyết**

Hình này là số trung bình Dice 3D và CI 95 % của từng run trên 54 case. Cao nhất là DINOv2 100 % + PP-4 với 0,659 [0,612; 0,699]. Điểm cần nói rõ: nhiều khoảng tin cậy của các run khác nhau chồng lên nhau (5 trên 6 cặp), vì mỗi CI chỉ mô tả độ bất định của một run. Khi các run được chấm trên cùng tập case, phép so sánh mạnh hơn là delta cặp theo từng case, ở slide kế tiếp.

## 9. Ít dữ liệu hơn thì Dice thấp hơn; mức tăng chủ yếu ở nửa đầu

Phần: HỌC MÁY · KẾT QUẢ · Hình: `figures/fig_b_data_scarcity.png` · Khung chờ: **CHỜ KẾT QUẢ UNET (Khánh)** (tự thay khi có EXP-U-*)

**Trên slide**

- Họ DINOv2, 20 → 78 case: Dice +0,081 [+0,047; +0,118], CI không chứa 0.
- 25 % → 50 %: +0,057 [+0,036; +0,083]
- 50 % → 100 %: +0,023 [−0,001; +0,051] (CI chạm 0)
- Mỗi mức là một run, một seed: chênh lệch gồm cả phương sai giữa các lần chạy.
- CHỜ KẾT QUẢ UNET (Khánh)
- họ UNet sẽ thành đường thứ hai trong hình

Nguồn: Nguồn: results_aggregate.json (n = 54); hình sinh bởi tools/report/build_report_assets.py.

**Ghi chú diễn thuyết**

Đây là đường scarcity của họ DINOv2: Dice theo số case huấn luyện hiệu dụng, vùng mờ là CI 95 %. Từ 20 lên 78 case Dice tăng +0,081 [+0,047; +0,118]. Có bước mà CI chạm 0, nên thí nghiệm này không thể khẳng định lợi ích của bước đó. Lưu ý quan trọng: mỗi mức là một lần huấn luyện (seed 2024) và checkpoint được chọn ở các epoch rất sớm, không ổn định (xem slide giới hạn), nên chênh lệch giữa các mức gồm cả phương sai giữa các lần chạy mà thiết kế này không tách ra được. Điểm hình thoi là bản hậu xử lý PP-4 áp lên run 100 %. Họ UNet sẽ là đường thứ hai khi có kết quả; hình tự cập nhật.

## 10. So sánh cặp từng case: delta Dice kèm CI 95 %

Phần: HỌC MÁY · KẾT QUẢ · Hình: `figures/fig_f_paired_deltas.png`

**Trên slide**

- Chấm đặc: CI không chứa 0. Chấm rỗng: CI chứa 0, chưa khẳng định được.
- Hậu xử lý: +0,020 [+0,015; +0,026]; 45/54 case tốt hơn.
- DINOv2 50 % → DINOv2 100 %: CI chạm hoặc chứa 0.
- Không hiệu chỉnh đa so sánh; mỗi mức dữ liệu một seed.

Nguồn: Nguồn: results_aggregate.json (n = 54); hình sinh bởi tools/report/build_report_assets.py.

**Ghi chú diễn thuyết**

Mỗi dòng là một phép so sánh cặp theo từng case (run B trừ run A) trên cùng 54 case, kèm CI 95 % bootstrap theo cặp. 3 trong 4 phép so sánh có CI không chứa 0 (chấm đặc); chấm rỗng là CI chứa 0, tức chưa khẳng định được. Hậu xử lý: +0,020 [+0,015; +0,026], 45 trên 54 case tốt hơn. 4 khoảng tin cậy này không được hiệu chỉnh đa so sánh. Ứng dụng cố ý trả comparable = false cho cặp mặt nạ thô với đã xử lý; dòng hậu xử lý là phân tích ablation ngoại tuyến (spec 08 §2). Các phép so sánh UNet với DINOv2 sẽ xuất hiện ở đây khi có kết quả UNet.

## 11. RQ-A: UNet so với DINOv2 khi giảm dữ liệu

Phần: HỌC MÁY · SO SÁNH MÔ HÌNH · Khung chờ: **CHỜ KẾT QUẢ UNET (Khánh)** (tự thay khi có EXP-U-*)

**Trên slide**

- CHỜ KẾT QUẢ UNET (Khánh)
- Chưa có run UNet nào trong results_aggregate.json. Câu hỏi RQ-A chưa trả lời được.
- Sẽ hiện ở đây
- Dice 3D của ba mức × hai mô hình
- Delta cặp UNet − DINOv2 tại từng mức, kèm CI 95 %
- Cách điền tự động
- Thêm EXP-U-* vào --runs và chạy lại tools/report/build_all.py
- Không sửa slide bằng tay
- Lịch và rủi ro
- UNet 3/3 dự kiến 24/10 tối
- Đường găng: UNet trên RTX 4050 (Khánh) → đánh giá holdout UNet → H10 đủ → TC-E2E-001 → báo cáo

Nguồn: Nguồn: management/day40/REPLAN_TO_2026-10-31.md; ADR-ML-001; DR-016a.

**Ghi chú diễn thuyết**

Câu hỏi nghiên cứu RQ-A: DINOv2 so với UNet khi giảm dữ liệu. Hiện chưa trả lời được: họ UNet (EXP-U-025, EXP-U-050, EXP-U-100) chưa huấn luyện xong; Bế Quốc Khánh phụ trách, kế hoạch là xong 24/10 tối. Khi có kết quả, chạy lại bộ dựng: bảng này sẽ điền Dice của ba mức, delta cặp UNet và DINOv2 tại từng mức kèm CI, và hình scarcity thêm đường UNet. Cho đến lúc đó, đừng nói bất kỳ điều gì về việc mô hình nào tốt hơn. Nếu UNet không kịp, báo cáo ghi rõ điều đó (rủi ro đã nêu trong kế hoạch).

## 12. Từ voxel đến mặt nạ: chuẩn hoá theo volume, hai biến thể tách bạch

Phần: XỬ LÝ ẢNH · CHUẨN HOÁ VÀ RESIZE

**Trên slide**

- 1 · Volume NRRD
- mảng [z, y, x]; tách thành lát theo trục z
- 2 · Chuẩn hoá
- cắt theo phân vị 0,5–99,5 của từng volume, rồi chia về [0, 1]; không dùng thống kê cohort
- 3 · Resize về 560×560
- ảnh: bilinear + antialias · mask: nearest-exact, giữ nguyên nhãn
- 4 · Mô hình
- DINOv2 hoặc UNet cho ra logits trên từng lát
- 5 · Về kích thước gốc
- logits resize bilinear về lát gốc, ngưỡng 0,5 → mặt nạ THÔ (bất biến)
- 6 · Hậu xử lý PP-4
- mở hình thái 3D (khối 3×3×3, 1 lần), rồi giữ thành phần liên thông 26 lớn nhất
- 7 · Khối 3D và chỉ số
- xếp lát thành khối; Dice, IoU, sai lệch thể tích tính theo từng case
- 8 · Bề mặt L0
- mesh giữ ánh xạ voxel ↔ thế giới; 2D ↔ 3D dùng chung hợp đồng hình học

Nguồn: Nguồn: docs/specs/v1.0/07, management/adr/ADR_ML_001.md (ml-preproc-1.0.0), DR-011.

**Ghi chú diễn thuyết**

Chuỗi xử lý ảnh của dự án. Volume NRRD được cắt thành các lát theo trục z. Chuẩn hoá: cắt theo phân vị 0,5–99,5 của từng volume, rồi chia về [0, 1] (DR-011), tuyệt đối không dùng thống kê của cả cohort, nên không có rò rỉ. Resize: ảnh nội suy bilinear có antialias về 560×560; mặt nạ dùng nearest-exact để giữ nguyên nhãn, không sinh giá trị lạ. Mô hình xuất logits, được resize ngược về kích thước lát gốc bằng bilinear, rồi lấy ngưỡng 0,5 ra mặt nạ THÔ, và mặt nạ thô là bất biến. Hậu xử lý PP-4 tạo mặt nạ ĐÃ XỬ LÝ riêng; hai biến thể không bao giờ bị thay thế âm thầm cho nhau. Chỉ số 3D tính trên khối đã xếp từ các lát; mesh bề mặt L0 giữ ánh xạ voxel – thế giới để 2D và 3D dùng chung một hợp đồng hình học.

## 13. Hậu xử lý được chọn từ danh sách khai báo trước, chỉ trên validation

Phần: XỬ LÝ ẢNH · GATE-IMG-01 · Hình: `figures/fig_c_gate_img_01.png`

**Trên slide**

- Danh sách ứng viên và luật chọn ghi vào repo (#91) trước khi chạy.
- Chọn trên 20 case validation; hoà trong 0,001 thì lấy mã thấp.
- Thắng: PP-4, mở hình thái 3D (khối 3×3×3, 1 lần), rồi giữ thành phần liên thông 26 lớn nhất.
- Đóng băng bằng sha256, áp nguyên cho holdout, không chỉnh theo case.

Nguồn: Số validation dùng để chọn, không phải kết quả. Nguồn: management/day39/gate_img_01/SELECTION.md, results_aggregate.json.

**Ghi chú diễn thuyết**

GATE-IMG-01 là cổng đóng băng cấu hình hình thái học bằng bằng chứng trên validation. Luật chọn và danh sách ứng viên PP-0 đến PP-5 được merge vào repo trước khi chạy (#91), nên không thể tinh chỉnh theo kết quả. Chọn trên 20 case validation của mặt nạ thô EXP-D-100; hoà trong 0,001 thì lấy mã thấp hơn. Người thắng PP-4 (mở 3D → thành phần lớn nhất) với Dice 0,5930, hơn mặt nạ thô PP-0 (0,5712) +0,0218. Cấu hình được đóng băng bằng sha256 c0a68cc7…, rồi áp nguyên cho 54 case holdout, không chỉnh tay theo case. Đây là số validation dùng để chọn, không phải kết quả; 20 case này cũng đã chọn checkpoint, nên mức +0,0218 có thể lạc quan.

## 14. PP-4 bớt dương tính giả và gần như xoá sai lệch thể tích

Phần: XỬ LÝ ẢNH · TÁC ĐỘNG CỦA HẬU XỬ LÝ

**Trên slide**

- +0,020
- Δ Dice 3D trung bình
- CI 95 % [+0,015; +0,026]
- 45 / 54
- case được cải thiện
- 9 case xấu đi nhẹ
- −25 %
- voxel dương tính giả TB
- 95 990 → 71 956
- +14,9 → +1,4 %
- sai lệch thể tích TB
- RVE theo voxel
- PP-4: mở hình thái 3D (khối 3×3×3, 1 lần), rồi giữ thành phần liên thông 26 lớn nhất.
- Âm tính giả đổi +6,2 % (74 753 → 79 416 voxel): hậu xử lý là một đánh đổi, không miễn phí.
- Cấu hình chọn trên validation (+0,0218); holdout xác nhận hướng và độ lớn.
- Dice 2D trung bình theo lát tăng 0,426 → 0,482: PP-4 xoá dự đoán thừa ở hai đầu stack (profile theo lát: phần Khoa học dữ liệu).
- Không giả định xử lý ảnh luôn giúp (spec 07 §5): báo cáo cả case xấu đi.

Nguồn: FP/FN tính theo voxel, trung bình theo case, mặt nạ thô so với đã xử lý. Nguồn: results_aggregate.json (fp_voxels_mean, rve_percent_mean).

**Ghi chú diễn thuyết**

Hậu xử lý PP-4 áp lên dự đoán của DINOv2 100 %. Dice 3D tăng +0,020 [+0,015; +0,026]; 45 trên 54 case tốt hơn và 9 case xấu đi nhẹ. Voxel dương tính giả trung bình giảm 25.0 phần trăm (95 990 xuống 71 956); voxel âm tính giả thay đổi +6.2 phần trăm (74 753 lên 79 416), nên đây là đánh đổi chứ không phải miễn phí. Sai lệch thể tích tương đối trung bình giảm từ +14,9 % xuống +1,4 %: mặt nạ thô vốn to hơn ground truth, hậu xử lý kéo về sát. Holdout xác nhận hướng và độ lớn đã thấy trên validation. Kết luận thận trọng: spec 07 §5 yêu cầu báo cáo cải thiện, xấu đi hay không đổi, không giả định xử lý ảnh luôn giúp; ở đây nó giúp, với bằng chứng trên cả hai tập.

## 15. Bề mặt 3D: chỉ mức L0 giữ đúng lát được chọn trong ±1

Phần: XỬ LÝ ẢNH · TÁI DỰNG 3D

**Trên slide**

- Mức
- Bề mặt
- Chọn lát chính xác (offline)
- Trên thiết bị (A17)
- L0
- voxel, không decimate
- tối đa 1 lát, không trượt
- đạt B6 (đúng lát), B7, B9 · 59,88 FPS · dừng ≤ 17 ms
- L1–L4
- giảm tam giác (gom đỉnh)
- sai tới 29–40 lát
- B6 trượt ở cả bốn mức
- Quyết định DR-008c = L0
- Mức nhanh nhất vẫn giữ đúng lát trong ±1. Các mức decimate thất bại cả offline lẫn trên thiết bị, không phải ứng viên.
- Giới hạn nói thẳng
- Một thiết bị, một phiên, một case huấn luyện. FPS bị trần 60 Hz nên không so được chi phí render giữa các mức. 3D vẫn là mô-đun có điều kiện.

Nguồn: Nguồn: management/spikes/SPIKE_B_3D/RESULT.md (S-1, 01/10), management/adr/TECH_STACK_ADR.md §3.

**Ghi chú diễn thuyết**

Spike B kiểm bề mặt 3D theo hai bài: chọn một điểm trên mặt 3D thì nhảy đúng lát nguồn (sai lệch tối đa một lát), và độ mượt khi xoay trên thiết bị. Chỉ mức L0, bề mặt voxel không decimate, giữ mọi lần chọn trong ±1 lát, không trượt và không điều hướng sai. Bốn mức giảm tam giác L1 đến L4 đều trượt, sai tới 29–40 lát. Trên Galaxy A17 5G, L0 chạy trung vị 59,88 FPS với khung dừng dài nhất 17 ms và 0 khung quá 500 ms; FPS bị trần 60 Hz nên không phân biệt được các mức về chi phí render. Quyết định DR-008c là L0. Giới hạn cần nói: một thiết bị, một phiên, một case huấn luyện, một người thao tác; mô-đun 3D vẫn ở mức có điều kiện cho tới khi Spike B được chấp nhận chính thức.

## 16. Phân phối trên cohort: vài ca rất thấp kéo trung bình xuống

Phần: KHOA HỌC DỮ LIỆU · PHÂN PHỐI VÀ NGOẠI LỆ

**Trên slide**

- Run
- Trung vị
- Q1–Q3
- SD
- Trung bình
- DINOv2 25 %
- 0,604
- 0,523–0,688
- 0,194
- 0,558
- DINOv2 50 %
- 0,668
- 0,581–0,726
- 0,174
- 0,616
- DINOv2 100 %
- 0,679
- 0,579–0,740
- 0,154
- 0,639
- DINOv2 100 % + PP-4
- 0,701
- 0,581–0,766
- 0,164
- 0,659
- Cách đọc
- Trung vị cao hơn trung bình ở mọi run: phân phối lệch trái, đuôi là vài ca rất thấp.
- SD giảm khi có thêm dữ liệu: 0,194 → 0,154.
- Luật ngoại lệ DR-010: ba case đánh giá thành công có Dice 3D thấp nhất; hoà thì FP+FN giảm dần, rồi mã case.
- App mở thẳng ca ngoại lệ (H2); số theo case không công bố ở đây.
- Tập độ nhạy bỏ 1 case nghi trùng bệnh nhân (DR-002b): Dice TB đổi tối đa 0,0036.
- Mọi kết luận giữ nguyên trên tập độ nhạy.

Nguồn: Nguồn: results_aggregate.json (n = 54); luật DR-010 trong management/readiness/OPEN_DECISIONS.md.

**Ghi chú diễn thuyết**

Một con số trung bình che đi hình dạng phân phối. Trên 54 case: DINOv2 25 %: trung bình 0,558, trung vị 0,604, Q1–Q3 0,523–0,688, SD 0,194. DINOv2 50 %: trung bình 0,616, trung vị 0,668, Q1–Q3 0,581–0,726, SD 0,174. DINOv2 100 %: trung bình 0,639, trung vị 0,679, Q1–Q3 0,579–0,740, SD 0,154. DINOv2 100 % + PP-4: trung bình 0,659, trung vị 0,701, Q1–Q3 0,581–0,766, SD 0,164. Trung vị cao hơn trung bình ở mọi run: phân phối lệch trái, có đuôi các ca rất thấp. Ngoại lệ được định nghĩa bằng luật DR-010 cố định: ba case đánh giá thành công có Dice 3D thấp nhất; hoà thì FP+FN giảm dần, rồi mã case; ứng dụng mở thẳng các ca này (bước H2) để xem bằng chứng, còn giá trị theo từng case không được công bố trong bộ slide. Tập độ nhạy bỏ một case nghi trùng bệnh nhân (DR-002b), n = 53: Dice trung bình đổi tối đa 0.0036, kết luận không đổi.

## 17. Lỗi theo lát: Dice cao ở giữa stack, về gần 0 ở hai đầu

Phần: KHOA HỌC DỮ LIỆU VÀ XỬ LÝ ẢNH · PROFILE THEO LÁT · Hình: `figures/fig_d_slice_profile.png`

**Trên slide**

- Giữa stack: Dice lát tới 0,74 (DINOv2 100 %).
- Hai đầu: ground truth vắng, dự đoán thừa tính Dice = 0.
- PP-4 xoá bớt dự đoán thừa: Dice lát TB 0,426 → 0,482.
- Lát cả hai rỗng bị loại khỏi trung bình (spec 07 §6).

Nguồn: Trung bình theo case trong 20 bin; n = 54 case. Nguồn: results_aggregate.json (slice_profile).

**Ghi chú diễn thuyết**

Profile Dice 2D theo vị trí lát chuẩn hoá: mỗi case được chia thành 20 bin theo vị trí, lấy trung bình các lát trong bin, rồi trung bình trên case. Giữa stack, run DINOv2 100 % đạt Dice lát khoảng 0,74; ở hai đầu stack ground truth thường vắng nên mọi dự đoán thừa tính Dice bằng 0, và đó là phần lớn lý do Dice trung bình theo lát thấp hơn Dice 3D. Theo quy tắc spec 07 §6 lát mà cả hai mặt nạ rỗng bị loại khỏi trung bình, không tính là 1. Hậu xử lý PP-4 xoá bớt dự đoán thừa ở các đầu: Dice trung bình theo lát từ 0,426 lên 0,482. Đây là một mẫu hình mà con số trung bình không cho thấy, và là lý do ứng dụng có màn hình Error Inspector để nhảy tới lát tệ nhất.

## 18. Bộ nhớ đệm lát có giới hạn: không bao giờ tải cả khối cho mỗi cử chỉ

Phần: PHÁT TRIỂN DI ĐỘNG · HIỆU NĂNG

**Trên slide**

- ≤ 155,1 KB
- mỗi lát mới
- trung vị 153,5 KB · 1,1 % một khối
- 0 byte
- khi quay lại lát đã xem
- 15/15 lần quay lại
- 98,72 ms
- p95 chuyển lát đã cache
- ngưỡng 200 ms · 576×576×88
- Cache theo từng lát, không bao giờ cả khối (DR-015); LRU có giới hạn: tối đa 600 mục.
- Khoá cache là URL băm nội dung kèm case/run, lát và biến thể: mặt nạ THÔ và ĐÃ XỬ LÝ không dùng chung mục; lỗi không bị lưu.
- Đo trên Samsung Galaxy A17 5G (Android 16), app sản phẩm, backend thật: L4 PASS (01/10); byte tải về băm ra đúng checksum.
- Giới hạn: bitmap giải mã nằm ngoài heap Java 256 MB nên cửa sổ cache không chặn được bộ nhớ ảnh (sẽ đo trong TC-PERF-001); L4 chỉ gồm MRI và ground truth.

Nguồn: Nguồn: management/spikes/SPIKE_A_2D/RESULT.md (A9, L4), management/adr/TECH_STACK_ADR.md §3, §7.

**Ghi chú diễn thuyết**

Yêu cầu hiệu năng NFR-PERF-001 có hai nhánh: chuyển lát đã cache có p95 không quá 200 ms, và không tải cả khối ảnh cho mỗi cử chỉ. Nhánh một đo trong Spike A: p95 chuyển lát đã cache 98,72 ms trên kích thước thật 576×576×88. Nhánh hai không đo được trong Spike A, nên được đo trên app sản phẩm tối 01/10 trên Galaxy A17 5G với backend thật (L4 PASS): 15 lát mới, trung vị 153,5 KB mỗi lần chuyển, lớn nhất 155,1 KB, tức 1,1 % một khối; 15 lần quay lại lát đã xem tải 0 byte; log của server khớp. Số đo lấy từ tệp thô đã commit, thống kê như NFR định nghĩa, không loại outlier. Giới hạn: phép đo L4 chỉ gồm MRI và ground truth của một case, chưa có dự đoán; TC-PERF-001 chính thức trên app sản phẩm chưa chạy. Bộ nhớ đệm hiện thực ở mobile/src/runtime/sliceCache.mjs: lưu theo từng lát, LRU tối đa 600 mục, khoá bằng URL băm nội dung nên RAW và PROCESSED không dùng chung mục, không lưu lỗi. Bitmap đã giải mã nằm ngoài heap Java 256 MB, nên một cửa sổ cache ở mức component không chặn được bộ nhớ ảnh: mức này sẽ được đo trên A17 trong TC-PERF-001.

## 19. Hợp đồng, trạng thái và tính bất biến đều được kiểm bằng máy

Phần: PHÁT TRIỂN DI ĐỘNG · KIẾN TRÚC VÀ ĐỘ TIN CẬY

**Trên slide**

- Checksum mọi artifact
- Ảnh, mask, mesh đánh địa chỉ theo sha256; app kiểm checksum của byte tải về, ETag = checksum.
- 7 trạng thái màn hình
- Dùng chung: tải, đang xử lý, thành công, không khả dụng, lỗi thử lại, không hợp lệ, lệch phiên bản. Không bịa tiến độ.
- 3D trong WebView
- WebGL2 trong react-native-webview: 59,88 FPS trung vị, 0 khung quá 500 ms (A17, mức L0).
- Review bất biến
- Commit tạo phiên bản mới; trigger SQLite chặn UPDATE/DELETE; dự đoán gốc không bao giờ bị ghi.
- CI: 11 job độc lập
- Checksum spec 19/19, quét byte cấm và IPv4, app-core, framework-neutral, mobile-shell, render smoke và bundle.
- E2E API: 22 / 0 / 1
- PASS / FAIL / SKIP của hero flow H1–H10 trên dữ liệu thật; SKIP là bước UNet. Mức API, chưa phải video thiết bị.

Nguồn: Nguồn: .github/workflows/guardrails.yml, backend/README.md, mobile/README.md, management/day39/E2E_EVIDENCE.md, management/day40/ACCEPTANCE_TRACE.md (số test ngày 18/10).

**Ghi chú diễn thuyết**

Sáu điểm kỹ thuật chính của phần di động. Một: mọi ảnh, mặt nạ và mesh có sha256 và app kiểm tra. Hai: bảy trạng thái màn hình trong app/core (tải, trống, đang xử lý, lỗi có thể thử lại, dữ liệu không hợp lệ...) dùng chung cho mọi vertical, không có màn hình tự bịa tiến độ. Ba: 3D chạy WebGL2 trong react-native-webview, trung vị 59,88 FPS, 0 khung quá 500 ms trên A17 ở mức L0. Bốn: review bất biến: mỗi lần commit tạo một phiên bản mới của mặt nạ đã duyệt, trigger SQLite từ chối UPDATE và DELETE, dự đoán gốc không bao giờ bị ghi. Năm: CI chạy 11 job độc lập, gồm checksum 19/19 của spec, quét byte cấm và địa chỉ IPv4, test app/core, kiểm tra app/core không phụ thuộc framework, test mobile và render smoke kèm bundle. Sáu: hero flow H1–H10 chạy mức API trên dữ liệu thật: 22 PASS, 0 FAIL, 1 SKIP (bước UNet); đây là bằng chứng mức API, chưa thay video trên thiết bị. Số test lúc kiểm ngày 18/10: mobile 220, backend 252, brush 22/22.

## 20. Chất lượng: luật khai báo trước, QA độc lập, spec đóng băng

Phần: CHẤT LƯỢNG VÀ KẾ HOẠCH

**Trên slide**

- Luật khai báo trước
- Luật chọn hậu xử lý merge (#91) trước mọi ứng viên
- Holdout mở bằng bản ghi cho phép (sha256), chấm đúng một lần
- 5/5 cổng đã đóng (DATA, SPLIT, ML, MOB, IMG)
- Duyệt và QA độc lập
- Quy trình thường (CP-07): mỗi PR cần một duyệt hợp lệ đúng SHA + CI xanh
- Ngày override: QA LLM độc lập thay duyệt người, ghi rõ là QA LLM, không phải reviewer người
- Biên bản QA lưu trong management/day39/qa
- Spec đóng băng
- 19 spec v1.0, checksum 19/19 trong CI
- Không PR nào được sửa docs/specs/v1.0
- Đổi spec chỉ qua Decision Request
- Trạng thái trung thực: 0 trên 33 yêu cầu MUST đã ACCEPTED chính thức; chưa có TC nào được ghi PASS trên thiết bị cho màn hình sản phẩm. Chỉ bằng chứng đã commit mới được tính.

Nguồn: Nguồn: management/day39/GATE_IMG_01_DECISION.md, management/day40/ACCEPTANCE_TRACE.md, .github/workflows/guardrails.yml.

**Ghi chú diễn thuyết**

Ba cơ chế giữ cho kết quả đáng tin. Một: luật khai báo trước. Luật chọn hậu xử lý được merge (#91) trước khi có ứng viên nào được đánh giá; holdout chỉ mở bằng một bản ghi cho phép mang sha256 và mỗi run chấm đúng một lần; 5/5 cổng đã đóng. Hai: duyệt và QA độc lập. Quy trình thường (CP-07, hiệu lực từ 19/10): mỗi PR cần một duyệt hợp lệ đúng SHA đầu của người được chỉ định cộng với CI xanh. Trong các ngày override (01/10 và 18/10) duyệt người được thay bằng một phiên QA bằng LLM độc lập cộng CI xanh; cần nói rõ đó là QA bằng LLM, không phải reviewer người, và biên bản được lưu trong management/day39/qa. Ba: spec đóng băng. 19 spec v1.0 được CI kiểm checksum (19/19) và không PR nào được sửa docs/specs/v1.0; mọi thay đổi đi qua Decision Request. Về trạng thái trung thực: tính đến ngày lập tài liệu truy vết, 0 trên 33 yêu cầu MUST ở mức ACCEPTED chính thức, vì còn thiếu bằng chứng thiết bị; chúng tôi không tuyên bố hơn bằng chứng đang có.

## 21. Giới hạn đã biết, nói thẳng

Phần: CHẤT LƯỢNG VÀ KẾ HOẠCH · Hình: `figures/fig_e_training_val_dice.png`

**Trên slide**

- Không augmentation, lr hằng số: Dice validation tụt mạnh rồi hồi phục (hình).
- Một seed cho mỗi mức dữ liệu; huấn luyện 2D theo lát.
- Spacing là placeholder đơn vị: sai lệch thể tích theo voxel, chưa có mm hay mL.
- UNet chưa có: RQ-A chưa trả lời được.
- Dice tuyệt đối khiêm tốn (0,56–0,66); kết quả khiêm tốn vẫn hợp lệ (PR-SCI-03).
- Bằng chứng thiết bị mới có L4 và S-1; chưa có TC chính thức trên A17.

Nguồn: Chấm tròn = epoch được chọn làm checkpoint. Nguồn: results_aggregate.json (training), management/day39/RESULTS_HOLDOUT_DINOV2.md §4.

**Ghi chú diễn thuyết**

Các giới hạn cần nói trước khi bị hỏi. Không có augmentation và learning rate hằng số: Dice validation tụt mạnh rồi hồi phục ở cả ba run huấn luyện (hình bên phải), tổng cộng 21 lần tụt từ 0,10 trở lên, nên checkpoint được chọn ở các epoch sớm và không ổn định. Mỗi mức dữ liệu chỉ một seed. Huấn luyện 2D theo lát; spacing là placeholder đơn vị nên sai lệch thể tích tính theo voxel, chưa có mm hay mL. UNet chưa có nên RQ-A chưa trả lời được. Dice tuyệt đối khiêm tốn, khoảng 0,56 đến 0,66; kết quả khiêm tốn hay null vẫn là kết quả hợp lệ theo PR-SCI-03. Bằng chứng thiết bị mới có L4 và S-1 (01/10); chưa có TC chính thức nào trên Galaxy A17 cho màn hình sản phẩm.

## 22. Từ nay đến 31/10: bốn chặng, đường găng đi qua UNet

Phần: CHẤT LƯỢNG VÀ KẾ HOẠCH

**Trên slide**

- C1 · 19–20/10
- Nhận lại, khởi động
- Hàng đợi UNet chạy
- Backend thật lên Mac mini
- C2 · 21–24/10
- Hoàn thiện vertical + UNet
- SCR-05, 06, 08 trên app
- Đánh giá holdout UNet: RQ-A
- C3 · 25–27/10
- Hội tụ, nghiệm thu nội bộ
- TC-E2E-001 trên A17
- Rà 33 MUST, 0 lỗi P0/P1
- C4 · 28–30/10
- Báo cáo, slide, tổng duyệt
- Slide theo từng môn
- 2 lần tổng duyệt có bấm giờ
- Đường găng: UNet trên RTX 4050 (Khánh) → đánh giá holdout UNet → H10 đủ → TC-E2E-001 → báo cáo
- 31/10/2026: nghiệm thu và bảo vệ bốn môn.

Nguồn: Nguồn: management/day40/REPLAN_TO_2026-10-31.md.

**Ghi chú diễn thuyết**

Kế hoạch lại tới nghiệm thu 31/10/2026. Bốn chặng: C1 (19–20/10) nhận lại và khởi động, chạy hàng đợi UNet, đưa backend thật lên Mac mini; C2 (21–24/10) hoàn thiện vertical và UNet, đánh giá holdout UNet để RQ-A trả lời được; C3 (25–27/10) hội tụ: TC-E2E-001 trên A17 quay một lượt hero flow, rà 33 MUST, 0 lỗi P0 P1; C4 (28–30/10) báo cáo, slide theo từng môn, bảng bằng chứng, hai lần tổng duyệt có bấm giờ. Đường găng: UNet trên RTX 4050 (Khánh) → đánh giá holdout UNet → H10 đủ → TC-E2E-001 → báo cáo. Slide này, cùng các slide cần UNet, sẽ tự cập nhật khi chạy lại bộ dựng sau khi có kết quả UNet.

## 23. Chuẩn bị Q&A (1/2): Học máy và Xử lý ảnh

Phần: CHUẨN BỊ Q&A

**Trên slide**

- Học máy
- UNet hay DINOv2 tốt hơn?
- Chưa trả lời được: họ UNet chưa huấn luyện xong (Khánh, dự kiến 24/10 tối). Chúng tôi không đoán trước kết quả.
- Sao Dice chỉ khoảng 0,56–0,66?
- Không augmentation, lr hằng số, huấn luyện 2D, một seed; kết quả khiêm tốn vẫn hợp lệ (PR-SCI-03) và được đo trung thực trên holdout khoá.
- Nhiều dữ liệu hơn có chắc tốt hơn?
- 20 → 78 case: +0,081 [+0,047; +0,118]; bước 50 % → 100 % có CI chạm 0, chưa khẳng định được. Mỗi mức một seed.
- Xử lý ảnh
- Hậu xử lý có tune trên test không?
- Không. PP-4 chọn trên validation từ danh sách khai báo trước; holdout chỉ xác nhận: +0,020 [+0,015; +0,026], 45/54 case tốt hơn.
- Chuẩn hoá và resize thế nào?
- Cắt theo phân vị 0,5–99,5 của từng volume rồi đưa về [0, 1], không dùng thống kê cohort (DR-011); ảnh bilinear, mask nearest-exact để giữ nhãn.
- Sao dùng mesh L0, không giảm tam giác?
- Chỉ L0 giữ chọn lát trong ±1; các mức giảm tam giác sai tới 29–40 lát và trượt B6 trên thiết bị (Spike B).

Nguồn: Câu trả lời lấy số từ results_aggregate.json và deck_facts.json; cập nhật khi chạy lại bộ dựng.

**Ghi chú diễn thuyết**

Các câu hỏi giảng viên có thể hỏi và đáp án ngắn có số liệu. Học máy: so sánh mô hình (hiện chưa có UNet), vì sao Dice khiêm tốn, và ý nghĩa của chênh lệch giữa các mức dữ liệu. Xử lý ảnh: hậu xử lý có bị tune trên test không (không, chọn trước trên validation), chuẩn hoá và resize, và lý do chọn mesh L0. Luôn quay lại nguyên tắc: không bịa số, nêu giới hạn trước.

## 24. Chuẩn bị Q&A (2/2): Khoa học dữ liệu và Di động

Phần: CHUẨN BỊ Q&A

**Trên slide**

- Khoa học dữ liệu
- Số trung bình có che ngoại lệ không?
- Có thể, nên chúng tôi báo thêm trung vị, Q1–Q3 và SD. Ngoại lệ theo luật DR-010 (ba case Dice thấp nhất) mở thẳng trong app; không công bố giá trị theo case.
- Kết quả có nhạy với một case nghi trùng bệnh nhân?
- Không đáng kể: bỏ case đó (n = 53) Dice TB đổi tối đa 0,0036 và kết luận giữ nguyên.
- CI tính thế nào, có hiệu chỉnh đa so sánh?
- Bootstrap phân vị của trung bình theo case, 10 000 lần, seed 2024. Không hiệu chỉnh đa so sánh, và chúng tôi nói rõ điều đó.
- Phát triển di động
- Sao React Native và WebView, không native?
- Chọn theo bằng chứng spike trên A17; Kotlin và PWA bị loại vì chưa có bằng chứng. 3D là mô-đun có điều kiện (59,88 FPS trung vị ở L0).
- Hiệu năng chuyển lát?
- p95 98,72 ms (ngưỡng 200 ms); lát mới ≤ 155,1 KB, quay lại 0 byte (L4).
- Brush có đúng pixel sau zoom? Quyền riêng tư?
- Spike A: 60/60 ca, lệch 0 pixel nguồn (fixture nhỏ, giới hạn L5). Case ẩn danh, kho công khai chỉ có số tổng hợp, CI quét IPv4 và byte cấm.

Nguồn: Câu trả lời lấy số từ results_aggregate.json và deck_facts.json; cập nhật khi chạy lại bộ dựng.

**Ghi chú diễn thuyết**

Khoa học dữ liệu: trung bình có che ngoại lệ không (nên báo trung vị, tứ phân vị, SD và luật ngoại lệ DR-010), độ nhạy với case nghi trùng, và cách tính CI. Di động: lý do chọn React Native cùng WebView theo bằng chứng spike, số đo hiệu năng chuyển lát, độ chính xác brush sau zoom (đo trên fixture nhỏ, đây là giới hạn L5) và quyền riêng tư. Mỗi thành viên cần giải thích được chức năng mình sở hữu: yêu cầu, thiết kế UI, kiến trúc và API, commit và PR, test, demo tích hợp, riêng tư, giới hạn (spec 16 §6).
