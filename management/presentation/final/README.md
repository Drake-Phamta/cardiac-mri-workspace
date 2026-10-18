# Bộ trình bày cuối: bảng, hình và slide nháp tự sinh từ artifact thí nghiệm

| Mục | Giá trị |
|---|---|
| **Mục đích** | Một lệnh dựng lại mọi bảng kết quả, mọi hình và bộ slide nháp từ artifact thí nghiệm. Khi kết quả UNet về, chạy lại lệnh đó thay vì sửa slide bằng tay |
| **Người nghe** | Giảng viên bốn môn: Học máy, Xử lý ảnh, Khoa học dữ liệu, Phát triển ứng dụng di động. Ngôn ngữ Việt, thuật ngữ kỹ thuật giữ tiếng Anh |
| **Hạn** | Nghiệm thu và bảo vệ 31/10/2026 (`management/day40/REPLAN_TO_2026-10-31.md`) |
| **Trạng thái** | **BẢN NHÁP.** Mọi tệp trong thư mục này (trừ README này) do bộ dựng sinh ra: không sửa tay, vì lần dựng sau sẽ ghi đè |
| **Chỉ số tổng hợp** | Kho mã này công khai. Thư mục này chỉ chứa số **tổng hợp**: không số theo từng case, không mã case, không ảnh MRI hay mặt nạ |

## Mỗi tệp là gì

| Tệp | Là gì | Sinh bởi |
|---|---|---|
| `results_aggregate.json` | Số tổng hợp của mọi run (trung bình, trung vị, Q1–Q3, SD, CI 95 %, IoU, RVE, FP/FN voxel), so sánh cặp, ứng viên GATE-IMG-01, huấn luyện theo epoch, profile theo vị trí lát. Cùng giản đồ với `management/day39/results_aggregate.json`, mở rộng cho mọi danh sách run (kể cả UNet); các khoá mới chỉ thêm vào | `tools/report/build_report_assets.py` |
| `RESULTS_TABLES.md` | Bảng tiếng Việt: kết quả chính kèm CI, so sánh cặp, tập độ nhạy (n = 53), ứng viên GATE-IMG-01, tóm tắt huấn luyện, nguồn gốc (checkpoint, mã chấm điểm) | `build_report_assets.py` |
| `figures/fig_a_dice_mean_ci` | (a) Dice 3D trung bình kèm CI 95 % theo run | `build_report_assets.py` |
| `figures/fig_b_data_scarcity` | (b) Dice theo số case huấn luyện, vùng mờ là CI; mỗi họ mô hình một đường (đường UNet tự xuất hiện) | như trên |
| `figures/fig_c_gate_img_01` | (c) Dice validation của sáu ứng viên hậu xử lý | như trên |
| `figures/fig_d_slice_profile` | (d) Dice 2D trung bình theo vị trí lát chuẩn hoá (trung bình theo case trong mỗi bin) | như trên |
| `figures/fig_e_training_val_dice` | (e) Dice validation theo epoch của từng run (độ ổn định huấn luyện) | như trên |
| `figures/fig_f_paired_deltas` | (f) Forest plot: delta Dice trung bình theo cặp kèm CI 95 % | như trên |
| `CARDIAC_MRI_DECK_DRAFT.pptx` | Bộ slide 16:9, 24 slide, ghi chú diễn thuyết tiếng Việt trên mọi slide. Bảng là bảng PowerPoint thật; hình dữ liệu là ảnh PNG lấy từ `figures/` | `tools/report/build_deck.py` |
| `DECK_OUTLINE.md` | Danh sách slide, chữ trên slide và ghi chú diễn thuyết, để cả nhóm duyệt ngay trên GitHub; ghi cả cảnh báo kiểm nguồn và bố cục | `build_deck.py` |

Mỗi hình có hai bản: `.png` (160 dpi) và `.svg` (chữ đã chuyển thành đường nét, nên hiển thị giống nhau ở mọi máy).

## Một lệnh dựng lại tất cả

Chạy từ gốc repo, PowerShell. `<CARDIAC_RUNS_ROOT>` là thư mục chứa các thư mục run trên máy leader (chỉ đọc, không bao giờ bị sửa); đường dẫn thật không được ghi vào repo.

```powershell
python tools/report/build_all.py --runs-root <CARDIAC_RUNS_ROOT> `
    --runs EXP-D-025 EXP-D-050 EXP-D-100 EXP-D-PP `
    --comparisons <CARDIAC_RUNS_ROOT>/_holdout_d39/comparisons
```

`build_all.py` chạy `build_report_assets.py` rồi `build_deck.py` (hai bước này cũng chạy riêng được; xem phần đầu mỗi tệp). Mặc định ghi vào `management/presentation/final/`; đổi bằng `--out`. Bộ dựng chỉ đọc `--runs-root`: mỗi run cần `evaluation/final_holdout/{metrics_summary,per_case_metrics,per_slice_metrics}.json`, `run_manifest.json`, và với run huấn luyện có `run_state.json` và `train_log.jsonl`; `--comparisons` là thư mục các tệp `ml-paired-comparison/1`. Run thiếu hoặc không đọc được bị bỏ qua kèm cảnh báo (ghi ở khoá `skipped_runs`), không làm hỏng lần dựng. Cặp so sánh không có tệp được liệt kê ở khoá `missing_comparisons`; bộ dựng không tự tính lại (chạy `python -m ml.evaluate compare` rồi dựng lại).

## Số liệu nào được phép vào repo

- **Vào repo:** chỉ số tổng hợp: trung bình, trung vị, tứ phân vị, SD, CI bootstrap, delta cặp, số case, trung bình Dice validation theo epoch, trung bình theo bin vị trí lát.
- **Không vào repo:** giá trị theo từng case, mã case đi với số, ảnh MRI hay mặt nạ, địa chỉ IP, số serial, đường dẫn tuyệt đối. Sau khi ghi, bộ dựng tự quét tệp văn bản và SVG vừa sinh; thấy mã `CASE_…`, địa chỉ giống IPv4 hay đường dẫn tuyệt đối thì **dừng với mã thoát 2**.
- **Hình theo từng case** (biểu đồ strip theo case; scatter thô so với đã xử lý theo case) chỉ ghi vào `--local-out`, **ngoài git**. Mặc định là thư mục `_report_local` ngay trong `--runs-root`. Bộ dựng từ chối nếu `--local-out` nằm trong một cây làm việc git hoặc trong `--out`. Thêm `--no-local` để bỏ qua.

## Kết quả UNet đi vào thế nào

Hiện họ UNet (EXP-U-025, EXP-U-050, EXP-U-100) chưa có. Các slide cần UNet hiện khung chờ **"CHỜ KẾT QUẢ UNET (Khánh)"**: bảng kết quả chính, ma trận thí nghiệm (slide 6), đường scarcity (slide 9), slide RQ-A (slide 11); giới hạn và kế hoạch cũng tự đổi lời. Khi UNet có kết quả holdout:

1. Khánh đánh giá holdout UNet dưới bản ghi cho phép mới và xuất `evaluation/final_holdout` trong thư mục từng run, như với họ DINOv2.
2. Chạy `python -m ml.evaluate compare` cho các cặp cần hiển thị: từng mức UNet với DINOv2 cùng tỉ lệ (cặp `EXP-D-xxx` với `EXP-U-xxx`) và các cặp mức dữ liệu của UNet; đặt kết quả vào thư mục `--comparisons`.
3. Chạy lại một lệnh ở trên, thêm `EXP-U-025 EXP-U-050 EXP-U-100` vào `--runs`.
4. Mở `DECK_OUTLINE.md`: cột "Cần UNet" không còn "khung chờ", và không slide nào còn chữ "CHỜ KẾT QUẢ UNET". Họ UNet tự thành một dòng trong bảng, một đường trong hình scarcity, các dòng trong forest plot và ma trận ở slide 6 và 11.
5. Đọc lại các câu kết luận do bộ dựng viết từ dữ liệu (tiêu đề và tóm tắt dùng quy tắc "CI có chứa 0 hay không") và ghi chú diễn thuyết; nếu UNet đổi bức tranh, chỉnh lời kể, không chỉnh số.

Nếu chỉ có một phần UNet (ví dụ chỉ EXP-U-025), các ô còn thiếu vẫn hiện khung chờ và liệt kê run còn thiếu.

## Kiểm tra

| Kiểm tra | Lệnh | Ý nghĩa |
|---|---|---|
| Luồng UNet tự động | `python tools/report/selftest_unet_flow.py` | Tự tạo run **giả** (số ngẫu nhiên, không dữ liệu bệnh nhân) trong thư mục tạm; dựng hai lần, không có và có UNet; kiểm khung chờ biến mất, họ UNet có mặt, run lạ được giữ, run thiếu bị bỏ qua. In PASS hoặc FAIL |
| Bố cục chữ | tự chạy cuối `build_deck.py` (`lint`) | Mở lại tệp pptx, ước lượng kích thước chữ theo phông Calibri, báo chữ tràn khỏi khung, shape ra ngoài slide, các hộp chữ chồng nhau. `--strict` làm lần dựng thất bại nếu có cảnh báo |
| Kiểm nguồn số liệu quy trình | tự chạy đầu `build_deck.py` | Mỗi mục trong `tools/report/deck_facts.json` (số test, số job CI, số đo thiết bị, lịch...) có tệp nguồn và một chuỗi phải còn tìm thấy trong tệp đó; mục nào nguồn không còn nói thế được báo trong log và `DECK_OUTLINE.md` |
| Xem slide thật | `powershell -ExecutionPolicy Bypass -File tools\report\render_deck.ps1` | Xuất mọi slide ra PNG bằng PowerPoint (Windows, cần PowerPoint cài sẵn), ghi ngoài git, để xem bằng mắt |
| Bảng màu hình | `node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a" --mode light --pairs all` (trong thư mục kỹ năng dataviz) | Ba màu xanh (DINOv2 thô), cam (đã hậu xử lý PP-4), ngọc (UNet) đạt mọi ngưỡng cứng; màu ngọc dưới 3:1 trên nền sáng nên hình luôn có nhãn trực tiếp và có bảng song song ở `RESULTS_TABLES.md` |

## Ghi chú thiết kế và giới hạn

- **Mọi số thí nghiệm** trên slide đọc từ `results_aggregate.json` lúc dựng, không gõ tay; số quy trình đọc từ `deck_facts.json` có kiểm nguồn.
- **Hình trong slide là ảnh PNG** (không phải biểu đồ PowerPoint gốc): PowerPoint không có biểu đồ forest hay dot-whisker kèm CI gốc. Bảng thì là bảng PowerPoint thật, sửa được.
- **Làm tròn:** `results_aggregate.json` giữ 6 chữ số thập phân cho chỉ số 0–1, rồi chỉ làm tròn một lần khi hiển thị (3 chữ số trên slide, 4 chữ số trong bảng), nên không bị làm tròn hai lần. Dấu thập phân trên slide, hình và bảng tiếng Việt là dấu phẩy.
- **Phông:** Calibri (có sẵn cùng Office). Máy không có Calibri sẽ thay phông và bố cục có thể lệch; ước lượng của `lint` khi đó chỉ gần đúng.
- **Chưa có trong bộ slide:** ảnh chụp màn hình hay video của app trên thiết bị (chưa có bằng chứng thiết bị cho màn hình sản phẩm); đây là việc của các chặng C2–C3, và nên thêm vào bản cuối bằng tay sau khi sinh.
