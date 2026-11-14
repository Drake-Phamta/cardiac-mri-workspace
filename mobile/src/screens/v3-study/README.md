# V3 — Study Overview và Experiment Comparison (SCR-01, SCR-07)

**Cho người dùng:** SCR-01 là màn hình gốc: bộ dữ liệu, số case theo chế độ, ma trận thí nghiệm (UNet / DINOv2,
25 / 50 / 100 % dữ liệu, có hoặc không hậu xử lý), các case ngoại lai và tóm tắt finding. SCR-07 so sánh các thí
nghiệm: phân bố Dice từng case (strip chart), thống kê, và **chỉ hiện hiệu số khi server nói hai thí nghiệm so sánh
được**.

**File nào làm gì** (file `.js` vẽ, file `.mjs` quyết định và được `node --test` kiểm):
- `StudyOverviewScreen.js`, `ExperimentComparisonScreen.js`: hai màn hình.
- `parts.js`: khối giao diện dùng chung (`Card`, `Line`, `LinkButton`, `Chip`), `StripChart`, hook `useSnapshot`.
- `models.mjs`: hai mô hình trạng thái `createStudyOverview` và `createExperimentComparison`.
- `cohort.mjs`: mỗi ô của ma trận (`buildCell`, `requestCell`) và các cặp so sánh (`requestComparisons`, `deltaFor`).
- `readers.mjs`: đọc từng trường server trả về (`readMetricSummary`, `readOutlierSelection`, ...);
  `readComparability` / `presentation` quyết định có được hiện hiệu số hay không.
- `view.mjs`: biến snapshot thành chữ và màu để vẽ (`overviewView`, `comparisonView`), toạ độ strip (`stripLayout`,
  `pointAt`).

**Luồng dữ liệu:** màn hình tạo mô hình bằng `runtime.client` → `useSnapshot` chạy `model.open()` →
SCR-01 gọi `study_get`, `experiment_list`, `findings_list`; mỗi ô gọi `experiment_metrics` / `experiment_cases`;
SCR-07 thêm `experiment_compare` → `readers.mjs` đọc → snapshot đóng băng → `overviewView` / `comparisonView` →
`parts.js` vẽ. Không có chỗ nào tự xếp hạng (không `.sort(`): thứ tự ngoại lai là của server.

**Test** (chạy từ thư mục gốc repo):
```powershell
node --test mobile/test/v3_model.test.mjs mobile/test/v3_screens.test.mjs mobile/test/readers.test.mjs
cd mobile; npm run test:render
```
