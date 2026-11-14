# V1 — Danh sách case, Case Explorer, Error Inspector (SCR-02, SCR-03, SCR-04)

**Cho người dùng:** SCR-02 liệt kê các case (tìm theo mã, lọc theo chế độ Evaluation / Inference & review).
SCR-03 mở một case: xem từng lát MRI, bật/tắt mask dự đoán (RAW hoặc PROCESSED) và ground truth, zoom/pan, đọc Dice
của lát. SCR-04 đi thẳng tới các lát mô hình sai nhiều nhất và tô TP / FP / FN.

**File nào làm gì** (file `.js` vẽ, file `.mjs` quyết định và được `node --test` kiểm):
- `CaseListScreen.js`, `CaseExplorerScreen.js`, `ErrorInspectorScreen.js`: ba màn hình.
- `SliceView.js`: `SliceViewport` (ảnh + lớp mask + cử chỉ), `SliceScrubber` (thanh chọn lát), `useMaskOverlay`.
- `cases.mjs`: mô hình trạng thái `createCaseExplorer` (open, goToSlice, setVariant, setOverlay), `chooseRun`,
  `metricsText`, `readCaseRows` / `filterRows`, `createSerialRunner` (lát mới nhất thắng), `sliceCacheKey`.
- `errorInspector.mjs`: `readSelection` / `readWorstSlices` đọc thứ tự lát tệ nhất **do server xếp** (app không sort),
  `runLevel`, `compareWithServer`.
- `scriptedRuns.js`: chạy thử A9 / L4 (nhấn giữ nhãn lát) và log thời gian `CMW_SLICE`; người dùng không cần.

**Luồng dữ liệu SCR-03:** `case_get` → `chooseRun` chọn run → `createCaseExplorer` gọi `mri_slice_get`,
`prediction_slice_get`, `ground_truth_slice_get`, `analysis_slice_metrics` qua `runtime.sliceClient` (cache theo lát,
`src/api/cache.mjs`). Server trả `content_url` + `checksum`; `runtime.imageStore` tải PNG MRI, kiểm SHA-256
(`src/api/content.mjs`) rồi đưa data URI cho `<Image>`. Mask đi qua `runtime.maskStore` → `decodeMaskPng`
(`src/lib/maskPng.js`) → `maskRuns` / `runsToPath` (`src/lib/mask.mjs`) → một `<Path>` SVG cùng hệ toạ độ với ảnh
(x = cột, y = hàng). SCR-04 dùng `disagreementRuns(gt, pred)` để có ba lớp TP / FP / FN.

**Test** (chạy từ thư mục gốc repo):
```powershell
node --test mobile/test/v1.test.mjs mobile/test/v1_error.test.mjs mobile/test/v1_model.test.mjs mobile/test/v1_cache_key.test.mjs mobile/test/readers.test.mjs
cd mobile; npm run test:render    # render các màn hình thật (kiểm S*, L*, N*, E*)
```
