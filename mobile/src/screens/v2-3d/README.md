# V2 — 3D Inspector (SCR-05)

**Cho người dùng:** xem mô hình 3D của nhĩ trái dựng từ mask dự đoán và (nếu case có) từ ground truth; xoay, zoom,
bật/tắt từng lớp; chạm vào bề mặt để biết điểm đó thuộc lát nào rồi mở đúng lát đó ở SCR-03.

**File nào làm gì:**
- `Inspector3DScreen.js` (vẽ): gọi API, tải lưới, đặt `WebView`, nút bật/tắt lớp, nút "mở ở 2D".
- `inspector3d.mjs` (quyết định, `node --test` kiểm): `meshRef` (từ `mesh_artifact_id` ra URL và checksum),
  `parseMeshHeader`, `gridMatches` (lưới phải cùng lưới của case), `toViewer` (tin nhắn gửi WebView),
  `parseViewerMessage` (tin nhắn nhận về, sai định dạng thì bỏ qua), `selectionAfterPick`, `openIn2D`, `layerStatus`.
- `viewerHtml.mjs`: trang WebGL2 tự chứa (`VIEWER_HTML`) chạy trong WebView: vẽ lưới và trả lại tam giác được chạm.

**Luồng dữ liệu:** `case_get` + `analysis_run_get` → người dùng chọn biến thể (RAW / PROCESSED) →
`reconstruction_get` cho mask dự đoán (và ground truth) → `meshRef` → `runtime.content.bytes` tải file `.cmesh` và kiểm
SHA-256 (`src/api/content.mjs`) → `parseMeshHeader` + `gridMatches` → `toViewer.mesh(role, bytes)` gửi base64 vào
WebView → WebGL vẽ. Khi chạm: WebView gửi lát của tam giác → `parseViewerMessage` → `selectionAfterPick` →
`openIn2D` → `nav.push('SCR-03', ...)` đúng run, biến thể và lát. Chế độ fixture không có byte nào nên màn hình báo
"không có dữ liệu" thay vì vẽ lưới giả.

**Test** (chạy từ thư mục gốc repo):
```powershell
node --test mobile/test/v2_inspector3d.test.mjs mobile/test/v2_viewer.test.mjs
cd mobile; npm run test:render    # các kiểm V2R* render SCR-05 với WebView giả
```
