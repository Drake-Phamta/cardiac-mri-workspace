# V3 — Study Overview và Experiment Comparison (SCR-01, SCR-07), giao diện Direction A

**Cho người dùng:** SCR-01 theo `A_overview`: dòng dataset (ô ảnh giữ chỗ + tên), dòng "About this data", dải 3 số
(Cases / Findings / Resolved), số case theo chế độ, các hàng "Median Dice · UNet vs DINOv2" (25 / 50 / 100 % data; **chỉ khi
server nói so sánh được** mới có hai điểm tròn / tam giác và hai số, còn lại là "Not compared" và "—") và danh sách "Lowest Dice"
mỗi thí nghiệm (thanh nhỏ, chạm để mở case). SCR-07 cùng ngôn ngữ: Metric / Statistic là `SegmentedControl`, ma trận ô, Dice từng
case (UNet tròn xanh, DINOv2 tam giác cam), hiệu số cặp so sánh được, xu hướng 25/50/100 %; trạng thái "Not shown: …" là một dòng chữ.
Không có mã kỹ thuật trên màn chính: checksum, tên capability, phiên bản metric, cohort / population nằm trong sheet "About this data".

**Riêng tư:** hai màn chỉ nhận và vẽ **con số và mã case giả danh** (CASE_0001…CASE_0154, do dự án gán lúc nhập): không ảnh MRI,
không tên, ngày sinh hay số hồ sơ bệnh viện. Không lưu gì xuống máy (không storage, không log nội dung); đóng app là hết.
Dữ liệu là bộ LASC 2018 (không phải LAScarQS 2022), chỉ dùng nghiên cứu và giảng dạy, không dùng chẩn đoán. Fixture: mọi số là giả.

**File nào làm gì** (`.js` vẽ, `.mjs` quyết định và được `node --test` kiểm):
- `StudyOverviewScreen.js`, `ExperimentComparisonScreen.js`: hai màn. `DiceRows.js`: hàng Median Dice trên thang 0–1.
- `AboutDataSheet.js`: "About this data" trên `DetailsSheet` dùng chung. `charts.js`: `Marker`, `FamilyKey`, `FamilyLegend`, biểu đồ.
- `parts.js`: `Section`, `Note`, `InfoRow`, `LinkRow`, `CellRow`, `MetricLegend`, `StripChart`, hook `useSnapshot`.
- Dùng từ `components/`: `ListRow`, `MetricStrip`, `SegmentedControl`, `DetailsSheet`; chạm ≥ 48 dp (`hitSlop` khi hàng thấp hơn).
- `models.mjs`, `cohort.mjs`, `readers.mjs`: mô hình trạng thái, ô ma trận, đọc từng trường server; `readComparability` quyết định so sánh.
- `view.mjs`, `tiles.mjs`, `about.mjs`: chữ, link, số cho SCR-01, nội dung sheet. `paired.mjs`, `trend.mjs`: hiệu số cặp và xu hướng.

**Luồng dữ liệu:** `runtime.client` → `model.open()` (qua `useSnapshot`) → `study_get`, `experiment_list`, `findings_list`,
`experiment_metrics` / `experiment_cases`, `experiment_compare` → `readers.mjs` → snapshot đóng băng → `.mjs` ra chữ và toạ độ → `.js` vẽ.
**Demo FIXTURE:** chạm Fixture → `experiment_list: full_matrix`, `experiment_compare: comparable`; test dùng `test/_v3_server.mjs`.

**Test** (từ thư mục gốc repo):
```powershell
node --test mobile/test/v3_model.test.mjs mobile/test/v3_screens.test.mjs mobile/test/v3_upgrades.test.mjs
cd mobile; npm run test:render
```
