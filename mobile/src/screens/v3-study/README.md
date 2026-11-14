# V3 — Study Overview và Experiment Comparison (SCR-01, SCR-07)

**Cho người dùng:** SCR-01 có thẻ số case, thẻ finding (đang mở / đã xử lý), Dice trung vị từng cặp UNet–DINOv2 **chỉ
khi server nói so sánh được** (chip "Comparable"), 3 case Dice thấp nhất mỗi thí nghiệm dạng thanh nhỏ, ma trận thí nghiệm
và mọi phán quyết của server. SCR-07 vẽ Dice từng case (UNet tròn xanh, DINOv2 tam giác cam), hiệu số từng case của cặp so
sánh được, xu hướng 25/50/100 % (từng case, trung vị, q1–q3; chỉ nối khi server cho phép), chú giải metric (HD95 bị khoá
vì hình học chưa xác thực). Nút "About this data": nguồn LASC 2018, điều khoản, mã case giả danh, chỉ dùng nghiên cứu.

**File nào làm gì** (file `.js` vẽ, file `.mjs` quyết định và được `node --test` kiểm):
- `StudyOverviewScreen.js`, `ExperimentComparisonScreen.js`: hai màn hình. `AboutDataSheet.js`: trang "About this data".
- `parts.js`: khối giao diện chung (`Card`, `Tile`, `Pill`, `OutlierBar`, `MetricLegend`, `StripChart`), hook `useSnapshot`.
- `charts.js`: `Marker` (tròn / tam giác), `FamilyLegend`, `PairedChart`, `TrendChart`.
- `models.mjs`: mô hình trạng thái hai màn hình; `cohort.mjs`: từng ô ma trận và phép so sánh (`deltaFor`, `buildTrend`).
- `readers.mjs`: đọc từng trường server trả về; `readComparability` / `presentation` quyết định có được so sánh.
- `view.mjs`: chữ và link (`overviewView`, `comparisonView`), toạ độ strip, màu + hình mỗi họ (`FAMILY_STYLE`).
- `paired.mjs`: ghép case theo ID, hiệu số DINOv2 − UNet, xếp từ thấp đến cao, trung vị; chỉ khi COMPARABLE.
- `trend.mjs`: biểu đồ xu hướng; `tiles.mjs`: các thẻ SCR-01; `about.mjs`: "About this data" và chú giải metric.

**Luồng dữ liệu:** `runtime.client` → `model.open()` (qua `useSnapshot`) → `study_get`, `experiment_list`, `findings_list`,
`experiment_metrics` / `experiment_cases` mỗi ô, `experiment_compare` mỗi cặp → `readers.mjs` → snapshot đóng băng → các
`.mjs` ra chữ và toạ độ → các `.js` vẽ. Chỉ `paired.mjs` sắp xếp (để vẽ); 3 case Dice thấp nhất giữ thứ tự của server.

**Demo FIXTURE:** chạm FIXTURE → `experiment_list: full_matrix`, `experiment_compare: comparable`. Fixture trả cùng một
bộ case cho mọi thí nghiệm nên mọi hiệu số là 0; test dùng `test/_v3_server.mjs` để có số khác nhau.

**Test** (chạy từ thư mục gốc repo):
```powershell
node --test mobile/test/v3_model.test.mjs mobile/test/v3_screens.test.mjs mobile/test/v3_upgrades.test.mjs
cd mobile; npm run test:render
```
