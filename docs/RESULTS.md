# Kết quả đo được

Tệp này chỉ giữ **số đã đo** (chỉ có số tổng hợp: không giá trị theo từng case, không mã case, không ảnh), mỗi khối ghi rõ nguồn.
Nhiều tệp nguồn (hồ sơ đo, báo cáo nguyên mẫu) đã rời cây thư mục nhưng còn trong lịch sử git: ghi chú `(565bf5e)`
nghĩa là đọc lại bằng `git show 565bf5e:<đường dẫn>`. Dấu thập phân là dấu phẩy (0,6390), giống các bảng nguồn tiếng Việt.

## 1. Phân vùng nhĩ trái bằng DINOv2: kết quả trên tập holdout

### 1.1 Dữ liệu và các run

**Dữ liệu:** LASC 2018, 154 case MRI LGE 3D có mặt nạ nhĩ trái, chia cố định với seed 2024 thành
**train 80 (dùng được 78) · validation 20 · holdout 54**; holdout đúng bằng `Testing Set` công bố của challenge.

**Công thức chung:** DINOv2-small + decoder progressive, fine-tune toàn bộ; train theo lát 2D cỡ 560×560; loss BCE + soft Dice;
AdamW, learning rate 1e-4 cố định; bf16; seed 2024; 50 epoch; batch 8; ngưỡng 0,5; giữ checkpoint có Dice 3D trung bình
cao nhất trên validation. Các run chỉ khác tập case train (lồng nhau 20 ⊂ 38 ⊂ 78).

| Run | Dữ liệu train | Mặt nạ đem chấm |
|---|---|---|
| EXP-D-025 | 25 % (20 case) | thô |
| EXP-D-050 | 50 % (38 case) | thô |
| EXP-D-100 | 100 % (78 case) | thô |
| EXP-D-PP | không train thêm: dự đoán holdout của EXP-D-100 + hậu xử lý PP-4 (mục 1.4) | đã xử lý |

Mỗi run được dự đoán và chấm trên holdout **đúng một lần**; 54/54 case chạy thành công ở mọi run.

Nguồn: `management/day39/RESULTS_HOLDOUT_DINOV2.md` (565bf5e) bảng đầu trang và §1; `management/presentation/final/RESULTS_TABLES.md` (565bf5e) bảng đầu trang.

### 1.2 Kết quả chính (holdout, n = 54)

| Run | Dice 3D TB [CI 95 %] | Trung vị (Q1–Q3) | SD | IoU 3D TB [CI 95 %] |
|---|---|---|---|---|
| EXP-D-025 | 0,5585 [0,5051; 0,6070] | 0,6040 (0,5231–0,6881) | 0,1945 | 0,4090 [0,3647; 0,4506] |
| EXP-D-050 | 0,6156 [0,5671; 0,6595] | 0,6675 (0,5813–0,7256) | 0,1743 | 0,4639 [0,4211; 0,5045] |
| EXP-D-100 | 0,6390 [0,5945; 0,6769] | 0,6788 (0,5786–0,7397) | 0,1541 | 0,4854 [0,4448; 0,5219] |
| EXP-D-PP | **0,6590** [0,6117; 0,6995] | 0,7013 (0,5814–0,7664) | 0,1639 | 0,5099 [0,4660; 0,5499] |

| Run | Dice TB theo lát | RVE TB / trung vị | FP voxel TB | FN voxel TB |
|---|---|---|---|---|
| EXP-D-025 | 0,3940 | +19,21 % / +18,77 % | 114 977 | 88 546 |
| EXP-D-050 | 0,4213 | +12,47 % / +12,18 % | 95 113 | 80 342 |
| EXP-D-100 | 0,4264 | +14,95 % / +10,47 % | 95 990 | 74 753 |
| EXP-D-PP | 0,4816 | +1,43 % / −4,98 % | 71 956 | 79 416 |

Dice và IoU 3D tính riêng từng case rồi lấy trung bình (voxel không gộp giữa các case). CI 95 % = bootstrap phân vị của
trung bình, 10 000 lần lấy mẫu lại, seed 2024. RVE = (V dự đoán − V ground truth) / V ground truth, đếm bằng voxel; dương là đoán thừa.

Nguồn: `management/presentation/final/RESULTS_TABLES.md` (565bf5e) §1, sinh bởi `tools/report/build_report_assets.py`; số đủ chữ số
trong `results_aggregate.json` cùng thư mục. Mã chấm: `ml/evaluate.py`, phiên bản chỉ số `ml-eval-1.0.0`.

### 1.3 So sánh cặp từng case (Dice 3D, run B − run A)

| A → B | Câu hỏi | Δ TB [CI 95 %] | CI chứa 0? | Case B tốt hơn / A tốt hơn |
|---|---|---|---|---|
| EXP-D-025 → EXP-D-050 | ít dữ liệu | +0,0572 [+0,0361; +0,0828] | không | 43 / 11 |
| EXP-D-025 → EXP-D-100 | ít dữ liệu | +0,0806 [+0,0469; +0,1183] | không | 41 / 13 |
| EXP-D-050 → EXP-D-100 | ít dữ liệu | +0,0234 [−0,0006; +0,0514] | **có** | 28 / 26 |
| EXP-D-100 → EXP-D-PP | hậu xử lý | +0,0199 [+0,0145; +0,0257] | không | 45 / 9 |

- **Ít dữ liệu:** tăng từ 20 lên 78 case train đi kèm Dice holdout cao hơn 0,081 (CI không chứa 0). Phần lớn mức tăng nằm ở
  bước 25 → 50 %; bước 50 → 100 % nhỏ và CI chạm 0, nên **không khẳng định được** lợi ích của lần nhân đôi cuối.
- **Hậu xử lý:** PP-4 tăng Dice trung bình 0,020 (45/54 case tốt lên) và gần như xoá thiên lệch thể tích (RVE trung bình
  +14,95 % → +1,43 %). App cố ý trả `comparable: false` cho cặp thô / đã xử lý; dòng này là ablation ngoại tuyến.
- Bốn CI **không** hiệu chỉnh đa so sánh. Mỗi mức dữ liệu chỉ có **một** lần train (một seed): chênh lệch giữa các mức còn lẫn dao động giữa các lần chạy.
- **Tập độ nhạy (n = 53)**, bỏ 1 case holdout nghi trùng bệnh nhân với một case phát triển: Dice TB 0,5549 · 0,6128 · 0,6375 · 0,6573
  (025 · 050 · 100 · PP). Kết luận giữ nguyên; CI bước 50 → 100 % thành [−0,00003; +0,0521], vẫn chạm 0.

Nguồn: `management/presentation/final/RESULTS_TABLES.md` (565bf5e) §2 và §4; `management/day39/RESULTS_HOLDOUT_DINOV2.md` (565bf5e) §2–§4.

### 1.4 Bước chọn hậu xử lý (chỉ trên validation)

Trước khi chạm holdout, sáu ứng viên được chấm trên dự đoán thô của EXP-D-100 cho 20 case validation. Danh sách
ứng viên và luật chọn được ghi vào repo trước khi chạy.

| Ứng viên | Thao tác theo thứ tự | Dice 3D TB | IoU 3D TB | RVE tuyệt đối TB (%) | Case trên / dưới PP-0 |
|---|---|---|---|---|---|
| PP-0 | giữ nguyên mặt nạ thô (tham chiếu, không được chọn) | 0,5712 | 0,4135 | 38,59 | — |
| PP-1 | thành phần liên thông 3D lớn nhất | 0,5855 | 0,4300 | 35,94 | 19 / 1 |
| PP-2 | lấp lỗ 2D từng lát → PP-1 | 0,5858 | 0,4304 | 36,42 | 19 / 1 |
| PP-3 | closing 3D → PP-1 | 0,5859 | 0,4291 | 40,02 | 19 / 1 |
| **PP-4** | **opening 3D → PP-1** | **0,5930** | 0,4385 | 30,25 | 18 / 2 |
| PP-5 | closing 3D → lấp lỗ 2D → PP-1 | 0,5858 | 0,4292 | 40,58 | 17 / 3 |

Luật chọn: Dice TB cao nhất trong PP-1..PP-5; cách nhau không quá 0,001 coi là hoà, ID nhỏ hơn thắng. **Người thắng: PP-4** =
opening 3D với phần tử cấu trúc khối 3×3×3 (1 lần lặp), rồi giữ thành phần liên thông 26-lân cận lớn nhất.
So với mặt nạ thô: +0,0218 (0,5930 so với 0,5712).

> **Các số trong bảng này là số validation dùng để CHỌN cấu hình, không phải kết quả.** 20 case này cũng đã dùng để chọn
> checkpoint, nên +0,0218 không nói gì về khả năng tổng quát. Kết quả thật của PP-4 là dòng EXP-D-PP trên holdout
> (mục 1.2–1.3): +0,0199, cùng chiều và cùng cỡ.

Nguồn: `ml/records/gate_img_01/SELECTION.md` và `postprocess_config.frozen.json` cùng thư mục (trong repo);
`management/presentation/final/RESULTS_TABLES.md` (565bf5e) §5. Mã: `ml/postprocess.py`.

### 1.5 Quá trình train (Dice validation theo epoch)

| Run | Epoch tốt nhất (Dice val) | Dice val ở epoch cuối | Số lần tụt mạnh | Giờ train |
|---|---|---|---|---|
| EXP-D-025 | 32 (0,5703) | 0,4965 | 4 | 2,7 |
| EXP-D-050 | 13 (0,5868) | 0,0734 | 9 | 3,3 |
| EXP-D-100 | 6 (0,5712) | 0,5129 | 8 | 6,8 |

Cả ba run chạy đủ 50/50 epoch và đều có epoch Dice validation rơi về 0,0000. "Tụt mạnh" = Dice validation thấp hơn epoch trước
ít nhất 0,10. Nguồn: `management/presentation/final/RESULTS_TABLES.md` (565bf5e) §7; `results_aggregate.json` cùng thư mục, khoá `training`.

### 1.6 UNet

**Không có kết quả UNet.** Họ UNet (EXP-U-025/050/100) chưa được train, nên câu hỏi so sánh UNet với DINOv2 (RQ-A) **chưa trả
lời được**. Số UNet duy nhất trong các nguồn là phép thử ngắn của Spike C1 (mục 2.3), không phải kết quả holdout.
Nguồn: `management/day39/RESULTS_HOLDOUT_DINOV2.md` (565bf5e) dòng "Status" và §4; `management/presentation/final/README.md` (565bf5e).

### 1.7 Giới hạn (do chính các nguồn ghi)

- Spacing trong header là placeholder (1, 1, 1), nên RVE và thể tích tính bằng **voxel**, không có mm hay mL.
- Holdout chỉ có n = 54 case; mỗi mức dữ liệu chỉ một run, một seed; bốn CI không hiệu chỉnh đa so sánh.
- Không augmentation, learning rate cố định, train theo lát 2D. Checkpoint chọn ở giai đoạn train sớm, chưa ổn định (epoch 6 với EXP-D-100).
- Dice trung bình khoảng 0,64–0,66 là mức khiêm tốn cho phân vùng nhĩ trái. Mọi run đều có case Dice dưới 0,1.
- Không kiểm được tách biệt theo bệnh nhân (xem Spike D); tập độ nhạy n = 53 là biện pháp bù.

Nguồn: `management/day39/RESULTS_HOLDOUT_DINOV2.md` (565bf5e) dòng "Geometry" và §4.

## 2. Các spike công nghệ

Spike là thí nghiệm nhỏ làm trước khi xây sản phẩm, để trả lời một câu hỏi kỹ thuật bằng số đo. Mã của các spike
B, C, E nằm trong `prototypes/` (`3d-viewer`, `ml-probe`, `transport`); mã spike A đã rời cây (fixture brush của nó
nằm ở `mobile/src/screens/v4-review/fixtures/`); công cụ của spike D là `tools/dataset_validate` và `tools/dataset_split`. Trạng thái cuối lấy từ
`management/spikes/SPIKE_PHASE_STATE.yaml` (565bf5e); khi khác `RESULT.md` thì theo tệp trạng thái vì nó mới hơn. Phép đo
trên thiết bị dùng một điện thoại Android thật (Galaxy A17, Android 16).

### 2.1 Spike A: viewer 2D và brush trên điện thoại

- **Câu hỏi:** app React Native/Expo có hiện đúng lát MRI, zoom/pan không lệch mask, tô/xoá, undo/redo, lưu/mở lại đúng từng pixel và đủ nhanh không?
- **Kết luận:** ACCEPTED kèm giới hạn (2026-10-01). Chỉ một ứng viên được dựng: bằng chứng khả thi, không phải so sánh
  framework. Giới hạn được chấp nhận: hiển thị chưa so từng pixel; zoom/pan, brush, undo/redo, lưu/mở lại và phản hồi
  brush đo trên fixture nhỏ 64×64×16.
- **Số chính:**
  - Chuyển lát đã cache (30 bước, ngưỡng p95 ≤ 200 ms): p95 98,72 ms khi cache cả khối 576×576×88; cửa sổ ±3 lát:
    50,84 ms trong cửa sổ, 102,73 ms khi miss. Lần đo trước: 65,31 ms (64×64×16), 50,23 ms (576×576×16).
  - Phản hồi brush (ngưỡng ≤ 100 ms): chậm nhất 30,48 ms trên 123 nét, p95 24,66 ms, 0 mẫu bị mất.
  - Brush sau zoom/pan khớp 60/60 ở r = 0 và 60/60 ở r = 2, lệch 0 pixel nguồn. Lưu/mở lại sau khi buộc dừng app:
    2 vòng, mỗi vòng 16/16 checksum lát khớp.
  - Bộ nhớ: bitmap cả khối 576×576×88 là 135,90 MB (1,54 MB/lát); cửa sổ ±3 **không** chặn được bộ nhớ (84,69 MB sau 30 bước).
  - Trên app sản phẩm với backend thật: sang lát mới tải tối đa 155,1 KB, quay lại lát cũ 0 byte.
- Nguồn: `management/spikes/SPIKE_A_2D/RESULT.md` (565bf5e) bảng A1–A12 và "Chặng S6"; `management/adr/TECH_STACK_ADR.md` (565bf5e) bảng Spike A.

### 2.2 Spike B: viewer 3D WebGL2 (`prototypes/3d-viewer`)

- **Câu hỏi:** viewer 3D (WebGL2 trong WebView của app) có xoay/zoom lưới nhĩ trái mượt, chạm lưới có nhảy đúng lát nguồn, và nên giảm tam giác tới mức nào?
- **Kết luận:** ACCEPTED (2026-10-01); chọn mức lưới **L0** (bề mặt mặt voxel, không giảm tam giác).
- **Số chính** (lưới của một case train thật, năm mức L0–L4):
  - L0: 61 424 tam giác; FPS trung vị 59,88; khung dài nhất 17 ms (ngưỡng: FPS trung vị ≥ 20, không khung nào quá 500 ms).
  - Chạm → lát ở L0: sai tối đa 1 lát, 0 lần trượt (offline, 33 085 tia mỗi mức). Trên máy: 327 tia trúng mask,
    264 sai 0 lát, 63 sai 1 lát. Độ trễ điều hướng trung vị khoảng 41–42 ms ở mọi mức.
  - L1–L4 cũng đạt 59,88 FPS nhưng chạm sai tới 5–16 lát trên máy, nên bị loại.
- Nguồn: `management/spikes/SPIKE_B_3D/RESULT.md` (565bf5e) phần "S-1 device session".

### 2.3 Spike C: phần cứng và công thức train (C0, C1; `prototypes/ml-probe`)

- **Câu hỏi:** máy có đủ bộ nhớ và tốc độ để train UNet và DINOv2 kịp lịch không? Chọn cỡ ảnh, batch, decoder nào?
- **Kết luận:** C0 (dữ liệu tổng hợp) là đo sơ bộ, dừng ở EVIDENCE_READY. C1 (dữ liệu thật) ACCEPTED 2026-10-01; công thức ở mục 1.1 lấy từ đây.
- **C0** (RTX 4050 Laptop 6 GiB, khối tổng hợp 640×640×88; 10 biến thể × 2 độ chính xác): bf16 giảm bộ nhớ và tăng tốc
  ở mọi cấu hình fine-tune toàn bộ. Với 4 giờ GPU/ngày, 7/10 biến thể kịp lịch (8/10 với 5 giờ/ngày); DINOv2-B/14
  fine-tune toàn bộ không kịp ở cả hai mức.
- **C1** (RTX 3050 Ti Laptop 4 GiB; chỉ 20 case của tập con 25 %, chia nội bộ 16/4; không nạp validation hay holdout):
  - Điểm chọn 560×560, batch 8. Bộ nhớ đỉnh: UNet 3387,3 MiB, DINOv2 3159,4 MiB. Một bước train: UNet 1010,67 ms, DINOv2 485,95 ms.
  - Cấu trúc mảnh: độ dày p5 là 7,215 px. Tỉ lệ cấu trúc mảnh hơn stride: decoder linear (stride 14) 0,19786, khoảng 1/5;
    progressive (stride 1,75) và UNet (stride 1) bằng 0. Vì vậy chọn decoder progressive.
  - Sau 1 500 bước cả hai họ đều học (loss giảm, không NaN/Inf). Dice fold nội bộ: UNet 0,78807, DINOv2 0,34948 (đỉnh
    0,429 ở bước 750). Đây chỉ là kiểm tra "có học không", **không** phải ước lượng hiệu năng.
  - Lịch: 50 epoch vừa kịp; hàng đợi DINOv2 ước 12,35 giờ.
- Nguồn: `management/spikes/SPIKE_C_ML/RESULT.md` (565bf5e) cho C0; `management/spikes/SPIKE_C_ML/RESULT_C1.md` (565bf5e) cho C1.

### 2.4 Spike D: kiểm tra dữ liệu và chia tập

- **Câu hỏi:** gói dữ liệu có đủ ảnh và mask đọc được không, hình học ra sao, và chia tập thế nào để không rò rỉ?
- **Kết luận:** ACCEPTED (2026-09-18). `RESULT.md` viết trước ngày đó nên còn ghi "chưa ACCEPTED"; tệp trạng thái
  mới hơn ghi ACCEPTED. Phép chia cố định ở đây dùng cho mọi run ở mục 1.
- **Số chính:**
  - 154 case (100 `Training Set`, 54 `Testing Set`), mỗi case có `lgemri.nrrd` và `laendo.nrrd` đọc được: 308 khối
    3D `uint8`, mask chỉ có giá trị {0, 255}. Kích thước: 69 case 576×576×88, 85 case 640×640×88.
  - Header: spacing mặc định (1, 1, 1), origin (0, 0, 0), nên spacing vật lý **chưa kiểm được**; số đo mm/mL bị tắt.
  - Bộ kiểm tra dữ liệu: 16 PASS · 0 FAIL · 1 NOT_RUN. Một cặp case có mask giống hệt từng byte: gộp một nhóm, cả hai vào train.
  - Chia: train 80 (dùng được 78) · validation 20 · holdout 54; tập con lồng nhau 20 ⊂ 40 ⊂ 80 (danh nghĩa), 20 ⊂ 38 ⊂ 78 (thực dùng).
  - Sàng lọc case giống nhau bằng tương quan Pearson trên ảnh MRI, ngưỡng r ≥ 0,75 khai báo trước khi train, trên
    11 781 cặp: 5 cặp, 9 case. Một cặp nối một case phát triển với một case holdout, nên case đó và case cùng nhóm
    bị loại khỏi train (80 → 78).
  - Bài báo của challenge ghi 154 lần chụp từ 60 bệnh nhân, nhưng gói dữ liệu không có bảng case → bệnh nhân. Vì vậy
    tách biệt theo bệnh nhân là **NOT VERIFIABLE**; chỉ bảo đảm tách theo case cộng nhóm hoá theo sàng lọc.
- Nguồn: `management/spikes/SPIKE_D_DATASET/RESULT.md` và `SPLIT_RESULT.md` cùng thư mục (565bf5e). Mã: `tools/dataset_validate/validate.py`, `tools/dataset_split/split.py`.

### 2.5 Spike E: tải dữ liệu qua mạng (`prototypes/transport`)

- **Câu hỏi:** mở case lần đầu và tải lát chưa cache từ máy chủ về điện thoại qua mạng thật mất bao lâu? Nên tải từng
  lát, tải trước theo cửa sổ, hay tải cả khối?
- **Kết luận:** **chưa được chấp nhận** (bản nháp, NEEDS_FIX): bộ nhớ app (E7) và mất/nối lại kết nối (E9) chưa đo, đo theo
  giờ trong ngày (E8) mới có hai khung. Đề xuất: tải **từng lát PNG khi cần**; không tải cả khối, không tải trước theo cửa sổ.
- **Số chính** (dữ liệu giả đúng kích thước, 171/171 mẫu thành công mỗi lần đo; buổi tối 2026-09-16):
  - Mở case, lát đầu, p50 / p95: 1 126 / 3 103 ms (576×576×88) và 597 / 1 058 ms (640×640×88). Buổi chiều
    2026-09-18: 338 / 557 ms và 471 / 539 ms.
  - Tải cả khối: p50 338 905 ms (576) và 121 447 ms (640).
  - Điều hướng: tải trước theo cửa sổ chậm hơn tải từng lát, p95 28 606 so với 2 864 ms (576), 6 181 so với 1 844 ms (640).
  - Mục tiêu tạm đề xuất cho lần tải đầu: p95 ≤ 3 500 ms (chưa được chấp nhận).
- Nguồn: `management/spikes/SPIKE_E_TRANSPORT/RESULT.md` (565bf5e) §3A, §3B, §4, §5.

### 2.6 Spike F: biểu diễn lỗi 3D

- **Câu hỏi:** biểu diễn lỗi 3D nào (vùng TP/FP/FN) cho phép chạm vùng lỗi trên mô hình 3D để nhảy tới các lát liên quan, với chi phí lưới chấp nhận được?
- **Kết luận:** **không có kết quả.** Spike chỉ có `TASK.md`, trạng thái PREPARED, chưa bắt đầu đo.
- Nguồn: `management/spikes/SPIKE_F_3D_ERROR/TASK.md` (565bf5e); `management/spikes/SPIKE_PHASE_STATE.yaml` (565bf5e).

## 3. Hình

| Hình | Nội dung |
|---|---|
| [fig_a_dice_mean_ci.png](figures/fig_a_dice_mean_ci.png) | Dice 3D trung bình kèm CI 95 % của từng run |
| [fig_b_data_scarcity.png](figures/fig_b_data_scarcity.png) | Dice theo số case train (20, 38, 78), vùng mờ là CI |
| [fig_c_gate_img_01.png](figures/fig_c_gate_img_01.png) | Dice validation của sáu ứng viên hậu xử lý PP-0..PP-5 |
| [fig_d_slice_profile.png](figures/fig_d_slice_profile.png) | Dice 2D trung bình theo vị trí lát đã chuẩn hoá (20 bin) |
| [fig_e_training_val_dice.png](figures/fig_e_training_val_dice.png) | Dice validation theo epoch của từng run (độ ổn định khi train) |
| [fig_f_paired_deltas.png](figures/fig_f_paired_deltas.png) | Forest plot: delta Dice theo cặp kèm CI 95 % |

Nguồn: `management/presentation/final/README.md` (565bf5e) bảng "Mỗi tệp là gì"; hình sinh bởi `tools/report/build_report_assets.py`
(565bf5e) từ cùng số tổng hợp với mục 1.
