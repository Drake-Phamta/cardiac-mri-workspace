# V3 — Study Overview và Experiment Comparison (SCR-01, SCR-07), giao diện Direction A

**Cho người dùng:** SCR-01 theo `A_overview`: dòng dataset (hình vẽ minh hoạ + tên), "About this data", dải 3 số (Cases / Findings /
Resolved), số case theo chế độ, các hàng "Median Dice · UNet vs DINOv2" (**chỉ khi server nói so sánh được** mới có điểm tròn / tam giác
và hai số, còn lại "Not compared" và "—"; dưới hàng chỉ một câu) và **một** danh sách "Lowest Dice" (mặc định DINOv2 ở tỉ lệ dữ liệu
lớn nhất; hàng "Experiment" mở sheet để đổi). SCR-07 là các mục gồm hàng dày, mỗi hàng một giá trị: Metric (`SegmentedControl`), Experiments
(dấu họ, tên, "5 of 5 cases", thanh + trung vị), Distribution, Comparisons (hiệu số trung vị, hoặc "Not compared"), Per-case differences,
Trend. Chạm một hàng để mở sheet chi tiết (id, mean, q1, q3, N, phán quyết của server, lý do, từng case). Trang chỉ hiện trung vị.
Mã kỹ thuật (checksum, capability, id EXP-…, phiên bản metric, cohort) chỉ nằm trong các sheet; "Metric definitions" là một sheet riêng.

**Riêng tư:** hai màn chỉ nhận và vẽ **con số và mã case giả danh** (CASE_0001…CASE_0154, do dự án gán lúc nhập): không ảnh MRI,
không tên, ngày sinh hay số hồ sơ bệnh viện (ô hình ở SCR-01 là hình vẽ). Không lưu gì xuống máy, không log nội dung.
Dữ liệu là bộ LASC 2018 (không phải LAScarQS 2022), chỉ dùng nghiên cứu và giảng dạy, không dùng chẩn đoán. Fixture: mọi số là giả.

**File nào làm gì** (`.js` vẽ, `.mjs` quyết định và được `node --test` kiểm):
- `StudyOverviewScreen.js`, `ExperimentComparisonScreen.js`: hai màn. `DiceRows.js`: hàng Median Dice. `DatasetThumb.js`: hình vẽ. `Picker.js`: hàng + sheet chọn.
- `parts.js`: `Section`, `Note`, `ExperimentRow`, `ValueRow`, `LinkRow`, `MetricLegend`, `StripChart`, `useSnapshot`. `charts.js`: `Marker`, `FamilyKey`, biểu đồ.
- Dùng từ `components/`: `ListRow`, `MetricStrip`, `SegmentedControl`, `DetailsSheet` / `Sheet`; chạm ≥ 48 dp (`hitSlop` khi hàng thấp hơn).
- `models.mjs`, `cohort.mjs`, `readers.mjs`: trạng thái, ô ma trận, đọc từng trường server; `readComparability` quyết định so sánh.
- `view.mjs` (chữ, tên, giá trị từng hàng), `tiles.mjs`, `about.mjs` (nội dung sheet), `paired.mjs`, `trend.mjs`: chữ và số cho hai màn.

**Luồng dữ liệu:** `runtime.client` → `model.open()` (qua `useSnapshot`) → `study_get`, `experiment_list`, `findings_list`,
`experiment_metrics` / `experiment_cases`, `experiment_compare` → `readers.mjs` → snapshot → `.mjs` ra chữ và toạ độ → `.js` vẽ.
**Demo FIXTURE:** chạm Fixture → `experiment_list: full_matrix`, `experiment_compare: comparable`; test dùng `test/_v3_server.mjs`.

**Test** (từ thư mục gốc repo):
```powershell
node --test mobile/test/v3_model.test.mjs mobile/test/v3_screens.test.mjs mobile/test/v3_upgrades.test.mjs
cd mobile; npm run test:render
```
