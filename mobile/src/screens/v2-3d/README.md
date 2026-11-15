# V2 — 3D Inspector (SCR-05)

**Cho người dùng:** xem nhĩ trái 3D dựng từ mask dự đoán (đặc) và ground truth (trong suốt), cùng các **điểm lỗi**: FN
(chấm tròn xanh, ground truth bị bỏ sót) và FP (ô vuông hồng, dự đoán thừa). Ảnh 3D tràn màn hình, thanh đầu nổi phía trên
(tên case, `EXP-D-100 · Raw`), không có thanh tab. Chạm điểm lỗi hoặc bề mặt → bảng dưới nói vùng đó là gì, bao nhiêu voxel,
lát nào, "Slice 45 / 88"; "Open in 2D" mở SCR-03 đúng lát đó. Mã run, checksum, số tam giác, chỉ số z nằm trong sheet
Details (nút ⓘ của thanh đầu).

**Công cụ nằm trong trang WebView** (kính mờ Direction A, vùng chạm 48): Views (+X…−Z, Fit), Cut (ẩn bề mặt phía trên lát
đang chọn), Layers (ẩn/hiện, độ mờ 30/60/100 %), Errors với Previous / Next và công cụ lặng "Small regions (N)". Các nhóm
công cụ không đè lên nhau: nhóm lớp có hộp riêng dưới nhóm Views / Cut / gizmo và cuộn nếu vùng trống quá thấp (307 px ở 320 dp,
cỡ chữ 1,3). Trạng thái các công cụ do **trang** giữ; app chỉ gửi dữ liệu. Previous / Next bật lớp Errors trước khi chọn vùng, nên không bao giờ chọn
vùng khi lớp đang tắt. Góc trên trái có gizmo trục nhỏ (chỉ chữ x / y / z, cách xa mô hình); chữ đó nghĩa là gì (trục voxel,
x = cột, y = hàng, z = lát) nằm ở mục Frame của sheet Details.

**Nhiều vùng lỗi:** kích thước marker tăng theo căn bậc ba của số voxel của vùng (6 px cho vùng rất nhỏ, 28 px cho vùng lớn
nhất của case). Mặc định chỉ hiện vùng không nhỏ; vùng **nhỏ** là vùng có ít voxel hơn 0,5 % vùng lớn nhất của case (case
CASE_0029: dưới 824 voxel, giữ 6 vùng, ẩn 58 vùng chiếm 2,2 % voxel lỗi; vùng lớn nhất không bao giờ bị ẩn). "Small regions (N)"
bật phần còn lại. Previous / Next và "Region k of N" đi qua các vùng đang hiện, từ lớn đến nhỏ; tổng số vùng/voxel ở bảng dưới
vẫn đúng và bảng nói "N small regions hidden". Quy tắc nằm trong `inspector3d.mjs` (`regionList`, `markerSize`); trang chỉ vẽ.

**File nào làm gì:**
- `Inspector3DScreen.js`: gọi API, tải lưới và file lỗi, đặt `WebView` tràn màn hình (`chrome = CHROME.VIEWER`), báo
  tiêu đề / Details cho shell bằng `nav.setContext`, gửi cho trang chiều cao thanh đầu và bảng dưới (`insets`).
- `SelectionPanel.js`: bảng dưới (`BottomPanel`): dự đoán nào, lát `sliceParts`, vùng được chọn, "Open in 2D".
- `inspector3d.mjs` (quyết định, `node --test` kiểm): `meshRef`/`errorsRef`, `parseMeshHeader`, `parseErrorGeometry`,
  `regionList`/`markerSize` (cỡ marker, vùng nhỏ, thứ tự), `toViewer`, `parseViewerMessage`, `selectionAfterPick`,
  `selectionForMarker`, `selectionPanel`, `detailSections`, `openIn2D`.
- `viewerHtml.mjs`: trang WebGL2 tự chứa (bề mặt, điểm lỗi, dải lát `bandRange`, cắt, gizmo trục, chọn bằng tia).
- `viewerTools.mjs`: CSS và mã các công cụ; màu lấy từ token (`PALETTE`), số lát do app viết (`label`), trang không tự định dạng.

**Luồng dữ liệu:** `reconstruction_get` → `.cmesh`; `error_reconstruction_get` → `ERRGEOM_<sha256>` → `.json` (kiểm SHA-256) →
`parseErrorGeometry` → `toViewer.markers`. Case không có ground truth thì một câu nói rõ, không hỏi file lỗi.

**Riêng tư:** WebView `incognito`, không cache / storage / cookie; vào trang chỉ có hình học theo voxel (không mã case, run,
mask, server hay checksum); rời màn hình thì trang giải phóng GPU.

**Test** (từ gốc repo): `node --test mobile/test/v2_inspector3d.test.mjs mobile/test/v2_viewer.test.mjs mobile/test/v2_geometry.test.mjs`
(TC-3D-003/004 và TC-MAINT-002 chạy fixture hình học chuẩn qua trang); `cd mobile; npm run test:render` (V2R1–V2R20).
