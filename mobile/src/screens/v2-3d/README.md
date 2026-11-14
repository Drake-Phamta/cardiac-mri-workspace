# V2 — 3D Inspector (SCR-05)

**Cho người dùng:** xem mô hình 3D nhĩ trái dựng từ mask dự đoán (đặc) và ground truth (trong suốt 30%), cùng các
**điểm lỗi**: mỗi vùng FN (chấm tròn xanh, ground truth bị bỏ sót) và FP (ô vuông hồng, dự đoán thừa) là một điểm.
Chạm vào điểm lỗi → "FN, slices 11-13 (z = 10-12), 523 voxels" → "Open in 2D" mở SCR-03 đúng lát đó; nút Previous /
Next đi lần lượt qua các vùng (lớn trước). Nút +X/−X/+Y/−Y/+Z/−Z nhìn theo trục voxel, Fit đưa về góc mặc định; góc
trái dưới là trục voxel (x col, y row, z slice — không phải A/P/S vì hình học chưa kiểm định, không có mm).
"Cut at slice" ẩn phần bề mặt phía trên lát đang chọn để nhìn vào bên trong; mỗi lớp có độ mờ 30/60/100%.

**File nào làm gì:**
- `Inspector3DScreen.js` (vẽ): gọi API, tải lưới và file lỗi, đặt `WebView`, các nút lớp/độ mờ/cắt/trục, thẻ vùng chọn.
- `inspector3d.mjs` (quyết định, `node --test` kiểm): `meshRef`/`errorsRef` (từ id ra URL và checksum),
  `parseMeshHeader`, `parseErrorGeometry` (điểm lỗi phải cùng lưới và cùng bề mặt dự đoán đang hiện), `toViewer`,
  `parseViewerMessage`, `selectionAfterPick`, `selectionForMarker`, `stepMarker`, `markerText`, `cutStatus`, `openIn2D`.
- `viewerHtml.mjs`: trang WebGL2 tự chứa chạy trong WebView: vẽ bề mặt, điểm lỗi (vẽ đè, không bị bề mặt che vì vùng FP
  nằm bên trong bề mặt dự đoán), mặt cắt (`uCutZ`), trục voxel; trả lại tam giác hoặc điểm lỗi được chạm.

**Luồng dữ liệu:** `reconstruction_get` (dự đoán, ground truth) → `.cmesh`; `error_reconstruction_get` →
`ERRGEOM_<sha256>` → `/artifacts/<sha256>.json` (kiểm SHA-256, `cardiac-error-geometry/1`, dựng sẵn bởi
`backend/mesh/build_cache.py`) → `parseErrorGeometry` → `toViewer.markers`. Case không có ground truth thì không hỏi
file lỗi; thiếu file lỗi thì bề mặt vẫn hiện và hàng "Errors" ghi lý do.

**Riêng tư:** WebView `incognito`, `cacheEnabled={false}`, không DOM storage, không cookie; vào WebView chỉ có hình học
theo đơn vị voxel (không mã case, run, mask, server hay checksum); rời màn hình thì trang giải phóng bộ nhớ GPU.

**Test** (từ thư mục gốc repo):
```powershell
node --test mobile/test/v2_inspector3d.test.mjs mobile/test/v2_viewer.test.mjs
cd mobile; npm run test:render    # các kiểm V2R* (V2R15-19: điểm lỗi, cắt, độ mờ, riêng tư)
```
