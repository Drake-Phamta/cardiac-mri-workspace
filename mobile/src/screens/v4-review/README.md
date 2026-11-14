# V4 — Review / Correction và Findings (SCR-06, SCR-08)

**Cho người dùng:** SCR-06 cho người rà soát chấp nhận, gắn cờ hoặc sửa mask dự đoán của một lát bằng bút / tẩy
(undo, redo), rồi lưu thành một phiên bản reviewed mask mới; mask gốc không bao giờ bị ghi đè. SCR-08 ghi nhận xét
(finding) gắn với case / run / lát, liệt kê, đánh dấu đã xử lý và mở lại đúng chỗ đã thấy.

**File nào làm gì** (file `.js` vẽ, file `.mjs` quyết định và được `node --test` kiểm):
- `ReviewCorrectionScreen.js`, `FindingsScreen.js`: hai màn hình.
- `reviewScreen.mjs`: bộ điều khiển SCR-06 `createReviewScreen` (mở review, tải lát, lưu), `createGestureController`
  (chạm → nét bút, hai ngón → zoom/pan), `syntheticSourceSlice` (lát giả cho chế độ fixture).
- `review.mjs`: `createReviewCorrection` gọi `review_create`, `review_patch`, `working_mask_put`, `review_commit`,
  luôn kèm `expected_revision`; `checkTransition` theo bảng `REVIEW_TRANSITIONS`.
- `brush.mjs`: sửa pixel `createBrushSession` (`footprint`, `linePixels`, undo/redo, `diffRuns`) và mã hoá gửi lên
  `encodeMaskPayload` (BITPACK_BASE64).
- `findings.mjs`: `createFindings` (gọi `findings_list`, `finding_create`, `finding_patch`), `evidenceLocation`,
  `createFindingsScreen`.
- `fixtures/`: dữ liệu mẫu cho test bút (`brush_ops.json`, `brush_cases.json`), không dùng trong app.

**Luồng dữ liệu SCR-06:** `RunReader` / `SliceReader` (trong file màn hình, không vẽ gì) gọi `analysis_run_get`,
`prediction_slice_get`, `mri_slice_get` rồi đưa kết quả cho bộ điều khiển (`provideRun`, `provideSlice`) →
`createReviewCorrection` mở review (`review_create`) → `runtime.content.bytes` tải PNG theo `content_url`, kiểm SHA-256
→ `decodeMaskPng` → `createBrushSession` giữ lát nguồn và lát đang sửa → khi vẽ: lát nguồn thành `maskRuns` → một
`<Path>`, phần đã lưu / chưa lưu là các `<Rect>` của `diffRuns`. Lưu: `encodeMaskPayload` → `working_mask_put` →
`review_commit`; nếu người khác đã lưu trước, server trả `STALE_REVISION` và không gì bị ghi đè.

**Test** (chạy từ thư mục gốc repo):
```powershell
node --test mobile/test/v4_review_model.test.mjs mobile/test/v4_brush.test.mjs mobile/test/v4_findings_model.test.mjs mobile/test/v4_review_screen.test.mjs mobile/test/v4_findings_screen.test.mjs
cd mobile; npm run test:render    # các kiểm V4a ... V4q
```
