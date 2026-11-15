# GateFuse-LA: mã nguồn và thí nghiệm của môn Học máy

GateFuse-LA phân vùng tâm nhĩ trái trên ảnh cộng hưởng từ tim LGE-MRI, từng lát cắt ngang. Hai encoder ViT-B/16
đông cứng (DINOv3 học trên ảnh tự nhiên, MRI-CORE học trên ảnh MRI) cho hai bản đồ đặc trưng 32 x 32. Một cổng học
được, tính cho từng token, quyết định tin encoder nào ở mỗi vị trí; một decoder nhẹ sinh mặt nạ; hậu xử lý hình thái
làm sạch mặt nạ 3D. Hai đối chứng: pipeline cổ điển (Otsu) và U-Net 2D học từ đầu.

Thư mục này tự đứng riêng: nó không dùng và không bị thư mục `ml/` của ứng dụng di động dùng, và CI hiện có của
kho không chạy nó. Dữ liệu ảnh, đặc trưng, trọng số và kết quả từng lượt chạy **không nằm trong kho**
(xem "Dữ liệu và trọng số").

## Nguồn gốc của mã

GateFuse-LA là hệ thống nhóm xây dựng trong môn Xử lý ảnh; thư mục này giữ mã của hệ thống đó và thêm các thí nghiệm
của môn Học máy. Các file có sẵn từ môn Xử lý ảnh nằm trong `code/` và được giữ nguyên; các file của môn Học máy là file
mới đặt cạnh chúng, không file nào của môn Xử lý ảnh bị sửa. Dưới đây "IP" nghĩa là môn Xử lý ảnh (Image Processing).

## Bốn phần của môn Học máy

Cùng một bộ dữ liệu, cùng chia IP (72 khối huấn luyện, 8 khối kiểm định, 20 khối kiểm tra; "few" là 8 khối đầu của
danh sách huấn luyện, "full" là cả 72), mỗi phần trả lời một câu hỏi:

| Phần | Câu hỏi | Mã (`code/`) | Bảng kết quả (`results/`) |
|---|---|---|---|
| Đánh giá và thống kê | Kiểm định chéo 5 fold: khoảng tin cậy 95% của chênh lệch GateFuse - U-Net trên 80 khối ngoài fold có loại trừ 0 không? Xác suất dự đoán có hiệu chỉnh tốt không, và độ bất đồng giữa các seed có báo trước khối kém không? | `train_ml.py`, `make_folds.py`, `evaluate_ml.py`, `stats_ml.py`, `calibration.py` | `evaluate_ml/`, `stats_ml/`, `calibration/` |
| Dữ liệu | Khoảng cách GateFuse - U-Net thu hẹp thế nào khi số khối có nhãn n tăng (n = 4, 8, 16, 36, 72)? Hậu xử lý giúp ít đi khi n lớn không? | `make_subsets.py`, `learning_curve.py`, `pp_vs_n.py` | `learning_curve/`, `pp_vs_n/` |
| Mô hình sâu (U-Net) | Hàm mất mát và tăng cường dữ liệu có thu hẹp khoảng cách giữa U-Net và GateFuse ở 8 khối không? | `losses.py`, `augment.py`, `recipe_report.py` | `recipe_report/` |
| Cổng của GateFuse | Cổng token 32 x 32 có tốt hơn cổng một giá trị cho cả ảnh hoặc cổng theo kênh không? Độ rộng đầu 32 đến 256 có ảnh hưởng không? | `heads_ml.py`, `gate_analysis.py` | `gate_analysis/` |

`train_ml.py` là chung cho cả bốn phần; nó nạp `losses.py`, `augment.py` và `heads_ml.py`. Mọi script phân tích dùng
`stats_ml.py` (kiểm định cặp, hiệu chỉnh Holm, khoảng tin cậy bootstrap, kiểm định Friedman).

## Cấu trúc thư mục

```
code/        mã nền của môn Xử lý ảnh, giữ nguyên:
  config.py, data_prep.py, encoders.py, extract_features.py, models.py, train.py, classical.py,
  postprocess.py, metrics.py, evaluate.py, analysis.py, benchmark.py, figures.py, make_tables.py,
  make_samples.py, demo.py, make_video.py, make_pptx.py
             file mới của môn Học máy (chia theo bảng trên):
  train_ml.py        bản sao của train.py thêm --split-file, --loss, --aug, --fusion; bắt buộc --out
  make_subsets.py    file chia dữ liệu cho đường cong học (n = 4, 8, 16, 36, 72 và hai lần bốc ngẫu nhiên)
  make_folds.py      file chia cho kiểm định chéo 5 fold trên 80 khối ngoài tập kiểm tra
  losses.py          hàm mất mát theo tên: bce_dice (IP), soft_dice, focal_tversky
  augment.py         tăng cường dữ liệu cho U-Net, chạy trên thiết bị huấn luyện
  heads_ml.py        các kiểu cổng theo tên: token (IP), scalar, channel
  evaluate_ml.py     chấm điểm mọi lượt chạy bằng độ đo của IP, sau từng kiểu hậu xử lý
  stats_ml.py        kiểm định cặp, Holm, bootstrap, Friedman; kiểm định chéo
  calibration.py     ECE, Brier, temperature scaling, độ bất đồng giữa các seed
  learning_curve.py  đường cong học, khoảng cách theo n, đường cong luỹ thừa
  pp_vs_n.py         lợi ích của hậu xử lý theo n
  recipe_report.py   so sánh sáu công thức huấn luyện U-Net
  gate_analysis.py   so sánh kiểu cổng, độ rộng đầu, giá trị cổng theo vùng
tests/       kiểm thử trên CPU với dữ liệu giả nhỏ (xem "Kiểm thử")
results/     bảng và hình đã tổng hợp của từng phần (CSV, JSON, PNG; không có ảnh MRI)
requirements.txt      của môn Xử lý ảnh
requirements-ml.txt   phiên bản đã dùng cho các thí nghiệm của môn Học máy
```

## Dữ liệu và trọng số

Không có gì dưới đây nằm trong kho; `.gitignore` chặn và CI của kho cũng chặn dữ liệu, checkpoint và khoá bí mật.
Mọi thứ nằm trong thư mục làm việc `LA_WORK` (mặc định `work/` cạnh `code/`).

* **Dữ liệu**: 100 khối có nhãn của *2018 Atrial Segmentation Challenge* (Xiong và cs., Medical Image Analysis 2021),
  bản `.h5` đã cắt quanh tâm nhĩ do kho UA-MT phân phối, commit
  `88ed29ad794f877122e542a7fa9505a76fa83515` của <https://github.com/yulequan/UA-MT>. Chỉ dùng cho học tập và
  nghiên cứu theo điều khoản của ban tổ chức cuộc thi.
* **DINOv3 ViT-B/16**: tự tải qua `timm` (`vit_base_patch16_dinov3.lvd1689m`, Hugging Face `timm/vit_base_patch16_dinov3.lvd1689m`,
  revision `c6a5fb7d12bbd3cf3b0079253141c3332aaed7da`, `model.safetensors` 342 579 728 byte, SHA-256
  `1f9ed8a2378d65e24bb710ba522ac9fa7be4e036d7aefb4384ce022833926332`), theo giấy phép DINOv3 của Meta.
* **MRI-CORE ViT-B/16** (Apache-2.0, <https://github.com/mazurowski-lab/mri_foundation>): file `MRI_CORE_vitb.pth`,
  435 830 190 byte, SHA-256 `0ca90aeba09568f2e10a2e9851d2f2e22b21796067f5dfc7d65548e1a3078276`, từ Google Drive.
* Lát đã xử lý (`prep/`, khoảng 1,1 GB), đặc trưng đã trích (`features/`, khoảng 28 GB ở float16), checkpoint và dự đoán
  của từng lượt chạy (`runs/`, `runs_ml/`) là sản phẩm của các lệnh dưới đây.

```powershell
$env:LA_WORK = "<thư mục làm việc, cần khoảng 35 GB trống>"
git clone --filter=blob:none --sparse https://github.com/yulequan/UA-MT.git "$env:LA_WORK/data/uamt_src"
git -C "$env:LA_WORK/data/uamt_src" sparse-checkout set data
git -C "$env:LA_WORK/data/uamt_src" checkout 88ed29ad794f877122e542a7fa9505a76fa83515
New-Item -ItemType Directory -Force "$env:LA_WORK/weights/mricore" | Out-Null
gdown 1nPkTI3H0vsujlzwY8jxjKwAbOCTJv4yW -O "$env:LA_WORK/weights/mricore/MRI_CORE_vitb.pth"
```

Trên Linux hoặc macOS thay dòng đầu bằng `export LA_WORK=<thư mục>` và các đường dẫn bằng `$LA_WORK/...`.

## Môi trường

Python 3.12.6. Các thí nghiệm của môn Học máy chạy trên Windows 11 với GPU NVIDIA RTX 3050 Ti Laptop (4 GB), PyTorch
2.5.1 bản CUDA 12.1; mỗi lúc chỉ chạy một việc trên GPU. Phiên bản đã dùng nằm trong `requirements-ml.txt`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121
python -m pip install -r research/gatefuse-la/requirements-ml.txt
```

`requirements.txt` là file của môn Xử lý ảnh (máy Apple M2 Pro, nhắm tới cả `mps`); mã tự chọn `mps`, `cuda` hoặc `cpu`.
Đặt `HF_HUB_DISABLE_SYMLINKS_WARNING=1` trên Windows để bỏ cảnh báo của Hugging Face.

## Cách chạy

Chạy từ thư mục `research/gatefuse-la`, với `LA_WORK` đã đặt như trên.

**1. Chuẩn bị (mã nền, không đổi).**

```powershell
python code/data_prep.py --raw "$env:LA_WORK/data/uamt_src/data"   # 8 800 lát -> prep/ (images.npy, labels.npy, meta.csv, splits.json)
python code/extract_features.py --encoder dinov3                   # -> features/dinov3.npy
python code/extract_features.py --encoder mricore                  # -> features/mricore.npy
```

**2. Đường cơ sở: 24 lượt chạy bằng `train.py` nguyên bản của môn Xử lý ảnh**, kết quả vào `runs/`; rồi đối chứng cổ điển
và chấm điểm theo IP:

```powershell
foreach ($lab in 'full','few') { foreach ($m in 'gate','unet') { foreach ($s in 0,1,2) {
    python code/train.py --model $m --labels $lab --seed $s } } }
foreach ($m in 'dinov3','mricore','concat') { foreach ($s in 0,1,2) { python code/train.py --model $m --labels few --seed $s } }
foreach ($s in 0,1,2) { python code/train.py --model concat --labels full --seed $s }
python code/classical.py
python code/evaluate.py          # bảng của môn Xử lý ảnh -> results/tables/
```

**3. File chia dữ liệu** (xác định, sinh từ `prep/splits.json`; ghi vào `LA_WORK/splits/`):

```powershell
python code/make_subsets.py      # n4, n8, n16, n36, n72, n8_draw1, n8_draw2
python code/make_folds.py        # fold0_full ... fold4_few
```

**4. Các lượt chạy của môn Học máy bằng `train_ml.py`**, kết quả vào `runs_ml/<tên>` (`--out` là bắt buộc). Với mặc định,
`train_ml.py` huấn luyện y hệt `train.py` (kiểm thử kiểm tra từng bit). Khi có `--split-file`, `--labels` chỉ chọn lịch
huấn luyện: `few` là 2000 vòng, `full` là 4000 vòng. Mỗi lệnh dưới đây chạy với seed 0, 1, 2 (hai lần bốc ngẫu nhiên và
kiểm định chéo chỉ seed 0). Các script phân tích nhận ra lượt chạy qua `config.json` của nó, không qua tên thư mục,
nhưng tên theo mẫu `gate_w32_s0`, `gate_scalar_s0`, `gate72_scalar_s0`, `lc_n4_gate_s0`, `lc_n8long_unet_s0`,
`lc_n8draw1_gate_s0`, `recipe_soft_dice_augnone_s0`, `recipe72_best_s0`, `cv_fold0_few_gate_s0` cho dễ tra:

| Nhóm | Lệnh (rút gọn, thêm `--seed S --device cuda --out $env:LA_WORK/runs_ml/<tên>_sS`) | Số lượt |
|---|---|---|
| Cổng một giá trị, theo kênh (8 khối) | `--model gate --labels few --fusion scalar` hoặc `--fusion channel` | 6 |
| Độ rộng đầu 32, 64, 256 (8 khối) | `--model gate --labels few --width 32` | 9 |
| Cổng một giá trị, theo kênh (72 khối) | `--model gate --labels full --fusion scalar` hoặc `--fusion channel` | 6 |
| Đường cong học n = 4 | `--model gate` hoặc `unet`, `--labels few --split-file $env:LA_WORK/splits/n4.json` | 6 |
| Đường cong học n = 16, 36 | `--model gate` hoặc `unet`, `--labels full --split-file $env:LA_WORK/splits/n16.json` | 12 |
| Hai lần bốc ngẫu nhiên 8 khối (seed 0) | `--labels few --split-file $env:LA_WORK/splits/n8_draw1.json` | 4 |
| Đối chứng lịch 4000 vòng ở 8 khối | `--labels full --split-file $env:LA_WORK/splits/n8.json` | 6 |
| Công thức U-Net (8 khối) | `--model unet --labels few` với `--loss soft_dice` hoặc `focal_tversky` và `--aug none`, và với `--loss bce_dice`, `soft_dice` hoặc `focal_tversky` và `--aug on` | 15 |
| Công thức tốt nhất ở 72 khối | `--model unet --labels full --loss <loss> --aug <aug>` (chọn bởi `recipe_report.py`) | 3 |
| Kiểm định chéo 5 fold | `--model gate` hoặc `unet`, `--labels full` hoặc `few`, `--split-file $env:LA_WORK/splits/fold0_full.json` | 20 |

Điểm n = 8 và n = 72 của đường cong học, và cổng token, `dinov3`, `mricore`, `concat`, U-Net chuẩn, lấy từ 24 lượt của
bước 2. Chú thích trong mã nói "đêm 1, 2, 3": đó chỉ là ba đợt chạy qua đêm trên một máy (đêm 1 là bước 1 và 2, đêm 2 và
đêm 3 chia các lượt của bước 4); không phải một khái niệm của phương pháp.

Mỗi lượt xong để lại `summary.json`; khi chạy lại cả danh sách, bỏ qua lượt nào đã có file này (`evaluate_ml.py` cũng
bỏ qua và nêu tên lượt chưa có `summary.json`). Thời gian trung bình của một lượt trên máy ở mục "Môi trường" (3 seed): cổng 4,8 phút
ở 8 khối và 17,6 phút ở 72 khối; U-Net 8,0 và 15,9 phút.

**5. Chấm điểm và phân tích** (chạy trên CPU, ghi vào `LA_WORK/analysis/<tên script>/`):

```powershell
python code/evaluate_ml.py       # mọi lượt trong runs/ và runs_ml/ -> analysis/evaluate_ml/per_case.csv, summary.csv
python code/recipe_report.py     # chọn công thức tốt nhất theo Dice trên tập kiểm định -> best_recipe.json
```

Rồi huấn luyện công thức đó ở 72 khối (lệnh nằm trong khoá `night3_args` của `best_recipe.json`; nếu đó chính là U-Net
của IP thì không cần, vì `runs/unet_full_s*` đã có), chạy lại `evaluate_ml.py` cho các lượt mới, và chạy các phân tích
còn lại:

```powershell
python code/recipe_report.py
python code/stats_ml.py
python code/gate_analysis.py
python code/learning_curve.py
python code/pp_vs_n.py
python code/calibration.py
```

Bảng và hình trong `results/` là bản sao các file nhỏ (CSV, JSON, PNG) của những thư mục `analysis/` đó. `per_case.csv`
(mỗi hàng một khối, một lượt, một kiểu hậu xử lý, khoảng 2,4 MB) và `per_run/` quá lớn nên không đưa vào kho; `evaluate_ml.py`
sinh lại chúng. Trong `results/recipe_report/best_recipe.json` đường dẫn đã viết lại thành tương đối so với `LA_WORK`.

## Kiểm thử

```powershell
python -m pip install -r research/gatefuse-la/requirements-ml.txt
python -m pytest research/gatefuse-la/tests
```

Kiểm thử chạy trên CPU với một `LA_WORK` giả rất nhỏ (vài lát ngẫu nhiên và đặc trưng ngẫu nhiên), không cần dữ liệu thật.
Chúng kiểm tra, trong số khác, rằng `train_ml.py` với mặc định huấn luyện giống hệt `train.py`.
