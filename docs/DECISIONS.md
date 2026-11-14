# Các quyết định kỹ thuật

Mỗi mục: quyết định là gì, vì sao. Số đo đi kèm có nguồn trong [RESULTS.md](RESULTS.md). Đặc tả đầy đủ của sản phẩm
nằm trong [specs/v1.0/](specs/v1.0/) (ví dụ `07` là `07_ML_AND_IMAGE_PROCESSING_SPEC.md`).

## Sản phẩm và kiến trúc

**1. App chỉ xem và rà soát kết quả đã tính sẵn.** Điện thoại không train và không chạy mô hình. Kết quả phân vùng
được tính trước trên máy có GPU (`ml/`), đóng gói, rồi backend phục vụ cho app; yêu cầu "chạy phân tích mới" luôn
trả `RUN_NOT_DEPLOYABLE`. Lý do: điện thoại không đủ sức chạy DINOv2 trên khối 3D, và mục tiêu môn học là khám phá,
so sánh, sửa kết quả chứ không phải suy luận trên máy.

**2. App mobile dùng React Native / Expo (Expo SDK 57, React Native 0.86.3, JavaScript).** Đây là ứng viên duy nhất
có số đo thật trên điện thoại mục tiêu (Galaxy A17): viewer 2D, zoom/pan, brush, undo/redo và lưu/mở lại đều khớp
từng pixel, chuyển lát p95 dưới 200 ms (RESULTS 2.1). Android native (Kotlin) và web app (PWA) không có số đo nào và
sẽ phải làm lại phần đã đo trong thời gian còn lại. Viewer 3D vẫn là WebGL2, chạy bên trong WebView của app.

**3. Logic nằm cạnh màn hình dùng nó, dưới dạng file `.mjs` thuần mà test Node import thẳng.** (Thay quyết định cũ
"logic dùng chung trong `app/core`, không phụ thuộc framework".) Toàn bộ mã app ở một cây `mobile/src/`: `api/` (hợp
đồng API, 7 trạng thái màn hình, client, cache, tải byte có kiểm checksum), `lib/` (toán zoom/pan, mask, SHA-256),
`components/`, `navigation/`, và mỗi người một thư mục `screens/v1-cases`, `v2-3d`, `v3-study`, `v4-review`. Trong
mỗi thư mục, file `.js` chỉ vẽ (React Native), file `.mjs` quyết định và không bao giờ import React hay file `.js`, nên
`node --test` kiểm đúng mã chạy trên điện thoại mà không cần điện thoại. Lý do đổi: `app/core` được tách ra khi chưa chọn
framework; khi đã chọn React Native, hai cây (`app/` và `mobile/src/`) làm mỗi màn hình rải ở hai nơi, có helper bị
chép hai ba lần, và người giải thích một màn hình phải đi qua nhiều lớp. Một cây, một thư mục cho mỗi người, mỗi helper
một bản là dễ đọc và dễ bảo vệ hơn. Test `registry.test.mjs` (G8) chặn một thư mục màn hình import thư mục màn hình khác.

**4. Backend là Python + FastAPI + SQLite, chạy trên máy tính của nhóm.** Python cùng ngôn ngữ với phần ML; SQLite là
một file, không cần cài máy chủ CSDL. Điện thoại nối với máy tính bằng cáp USB và `adb reverse tcp:8000 tcp:8000`,
nên backend chỉ nghe `127.0.0.1`, không lộ ra mạng nào. Mã backend giữ tương thích Python 3.9 (CI chạy test trên 3.9).

**5. `contracts/api/contract.json` là định nghĩa API dùng chung.** Backend chỉ khởi động khi đúng phiên bản hợp đồng
(hiện 1.1.0 trên main; nhánh `v4/trung-upgrades` nâng lên 1.2.0, chỉ thêm `review_history_list` và lý do gắn cờ);
app kiểm mọi response theo hợp đồng; dữ liệu giả cho chế độ fixture được *sinh* từ hợp đồng, không viết
tay; mọi response trong test backend đều được kiểm theo schema. Lý do: bốn người làm song song mà không lệch nhau,
và app chạy được ở chế độ fixture khi chưa có backend.

**6. Hai hợp đồng nhập liệu tách riêng.** Contract 1 nhập dữ liệu gốc (MRI, mask ground truth) một lần, trước khi train;
Contract 2 nhập gói kết quả của mỗi thí nghiệm (dự đoán, chỉ số, checksum). Lý do: hai loại lỗi khác nhau (dữ liệu
hỏng so với nguồn gốc kết quả bị sai), nên mỗi loại có schema, bộ kiểm và test riêng. Một case dự đoán hỏng vẫn phải
được liệt kê là FAILED, không được lặng lẽ bỏ khỏi gói.

## Dữ liệu và thí nghiệm

**7. Chia dữ liệu cố định trước khi train.** LASC 2018 có 154 case: 100 case `Training Set` chia 80 train / 20
validation (seed 2024), 54 case `Testing Set` làm holdout khoá: không dùng để train, chỉnh ngưỡng, chọn checkpoint
hay chọn mô hình. Lý do: holdout 54 case diễn giải được tốt hơn nhiều so với 15 case nếu tự cắt từ tập train.

**8. Không kiểm được bệnh nhân, nên nhóm hoá case giống nhau.** Bài báo của bộ dữ liệu ghi 154 lần chụp từ 60 bệnh
nhân nhưng gói dữ liệu không có bảng case → bệnh nhân. Cặp case có mask giống hệt từng byte được gộp một nhóm vào
train; một phép sàng lọc ảnh (tương quan Pearson, ngưỡng r ≥ 0,75 khai báo trước) loại thêm 2 case khỏi train (80 → 78).
Kết quả còn được báo trên tập độ nhạy 53 case. Lý do: tránh rò rỉ giữa train và holdout ở mức kiểm được.

**9. Chuẩn hoá ảnh theo từng khối, không dùng thống kê của cả tập.** Mỗi khối được cắt ở phân vị 0,5 % / 99,5 % rồi
đưa về [0, 1]; DINOv2 dùng thêm mean/std cố định của checkpoint. Lý do: tập train khác nhau ở các mức 25/50/100 % dữ
liệu; thống kê tính trên tập train sẽ khác theo từng mức và làm nhiễu chính phép so sánh cần đo.

**10. Một cấu hình train cố định cho cả UNet và DINOv2, mọi mức dữ liệu.** DINOv2-small fine-tune toàn bộ với decoder
progressive (stride 1,75); UNet2D (base 32, depth 4) train từ đầu; ảnh 560×560, loss 0,5·BCE + 0,5·soft Dice, AdamW
learning rate 1e-4 cố định, batch 8, 50 epoch, bf16, seed 2024, giữ checkpoint có Dice validation cao nhất, ngưỡng 0,5.
Lý do: so sánh công bằng giữa hai họ mô hình; batch 8 là mức lớn nhất cả hai chạy được trên GPU 4 GiB; decoder linear
(stride 14) bỏ sót khoảng 1/5 cấu trúc mảnh (RESULTS 2.3). Kết quả âm của họ nào cũng là kết quả hợp lệ.

**11. Hậu xử lý được chọn trên validation, bằng luật viết trước.** Sáu ứng viên PP-0..PP-5 được chấm trên 20 case
validation; luật: Dice trung bình cao nhất, chênh ≤ 0,001 coi là hoà và ID nhỏ hơn thắng. PP-4 (opening 3D khối 3×3×3,
rồi giữ thành phần liên thông lớn nhất) thắng và được đóng băng (`ml/records/gate_img_01/`, có sha256) trước khi chạm
holdout; mỗi run được dự đoán và chấm trên holdout đúng một lần. Lý do: không để số holdout ảnh hưởng tới lựa chọn.

**12. Báo cáo kèm độ bất định.** Mọi chỉ số tổng hợp và mọi chênh lệch theo cặp đều có CI 95 % (bootstrap 10 000 lần,
seed 2024) và một mục giới hạn; không kiểm định power. Lý do: holdout nhỏ, nên một kết quả "không khác biệt" có thể chỉ
là không đủ dữ liệu để phân biệt; CI cho thấy điều đó.

## Hình học và hiển thị

**13. Một quy ước toạ độ duy nhất, chỉ hỗ trợ hình học thẳng trục.** Voxel `(x, y, z)` = (cột, hàng, lát), gốc ở pixel
trên-trái, `slice_index = z`. Backend, ML và app đều đổi về quy ước này ở biên. Header của bộ dữ liệu không có spacing
thật (placeholder 1, 1, 1), nên hình học là `GEOMETRY_NOT_VALIDATED` và app **không** hiện số mm hay mL. Một fixture hình
học chuẩn (`tests/fixtures/geometry/`) được kiểm chính xác tuyệt đối trong CI.

**14. "Lát tệ nhất" và "case bất thường" có định nghĩa cố định, do API tính.** Lát tệ nhất: trong các lát có ground
truth, xếp theo Dice lát tăng dần, rồi FP+FN giảm dần, rồi số lát tăng dần. Case bất thường: 3 case có Dice 3D thấp
nhất trong các case chấm thành công. App chỉ đọc lựa chọn của server, không tự xếp hạng. Lý do: kết quả lặp lại được,
và lát chỉ có dự đoán thừa trên nền không đẩy lát giải phẫu thật ra khỏi danh sách.

**15. Viewer 3D dùng lưới L0 không giảm tam giác.** Trên Galaxy A17, L0 (61 424 tam giác) vẫn đạt FPS trung vị 59,88 và
chạm → lát sai tối đa 1 lát; các mức giảm tam giác chạm sai tới 5–16 lát (RESULTS 2.2). Backend tự dựng lưới L0 từ mask
(`backend/mesh/`). Biểu diễn **lỗi** trên mô hình 3D là phương án 3 (trưởng nhóm chọn ngày 2026-11-14): bề mặt dự
đoán và một điểm đánh dấu cho mỗi vùng FP / FN liên thông, kèm dải lát chính xác; backend dựng sẵn bằng
`python -m backend.mesh.build_cache` (mã trên nhánh `v2/hung-anh-upgrades`). FPS trên máy khi bật lớp lỗi chưa đo.

**16. Tải dữ liệu theo từng lát, có checksum.** Mỗi lát MRI/mask là một PNG riêng có địa chỉ theo sha256; app kiểm
SHA-256 trước khi dùng và cache lát đã xem. Không tải cả khối (p50 trên 2 phút), không tải trước theo cửa sổ (chậm hơn
tải từng lát) (RESULTS 2.5). Trên app thật, sang lát mới tải tối đa 155,1 KB, quay lại lát cũ 0 byte.

## Rà soát và dữ liệu nhạy cảm

**17. Sửa mask không bao giờ ghi đè dự đoán gốc.** Mỗi review gắn với đúng một mask nguồn và một biến thể (thô / đã
hậu xử lý); mỗi lần ghi gửi `expected_revision`, bản cũ bị từ chối (`STALE_REVISION`); brush phản hồi ngay trên máy,
không chờ mạng; "commit" tạo một phiên bản mask mới bất biến, có cha và checksum (trigger SQLite chặn sửa/xoá). Lý do:
truy được nguồn gốc mọi chỉnh sửa và giữ phản hồi brush dưới 100 ms.

**18. Một case chỉ suy luận, ẩn nhưng không bị loại.** Một case holdout được hiện như case "chỉ suy luận và rà soát":
app không bao giờ đưa ground truth hay số đo theo case của nó. Case này vẫn được tính trong thống kê 54 case để app và
báo cáo dùng cùng một tập. Lý do: thể hiện đúng chế độ dùng thật (có ảnh, có dự đoán, chưa có nhãn).

**19. Dữ liệu bệnh nhân và thông tin máy không vào git.** Ảnh, mask, checkpoint, gói kết quả và CSDL review nằm ở thư
mục ngoài repo (`CARDIAC_BACKEND_DATA`); backend và công cụ từ chối đường dẫn nằm trong một git work tree. CI chặn file
ảnh y tế, checkpoint, secret, file > 10 MB và địa chỉ IPv4 nội bộ; log không ghi địa chỉ client hay nội dung request;
app ghi backend là `http://<configured>`. Lý do: điều khoản của bộ dữ liệu không cho phân phối lại, và repo là công khai.
