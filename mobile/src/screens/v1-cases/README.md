# V1 — Danh sách case, Case Explorer, Error Inspector (SCR-02, SCR-03, SCR-04)

**Giao diện Direction A** (mẫu `design/A_cases.png`, `A_viewer.png`): SCR-02 có ô tìm mã, tab lọc kèm số đếm, "Dice of"
(sheet các experiment), Server / Worst first, dòng 52 dp với thẻ Outlier n/3, thanh Dice và giá trị; case không có Dice nằm
dưới "No Dice for this experiment" và nói bằng chữ (No GT, Run failed), không bao giờ là 0.
**Mở ra là đã có experiment:** DINOv2 ở tỉ lệ dữ liệu lớn nhất server liệt kê, Raw trước Processed (cùng luật với SCR-01,
`defaultExperimentCandidates`); đáp án không có Dice thì sang experiment kế tiếp; chọn "None" là lựa chọn riêng. Nhãn là tên
người đọc ("DINOv2 100 % · Raw", vừa một dòng ở 384 dp); mã `EXP-D-100` nằm ở dòng phụ của sheet chọn và trong Details.
SCR-03 bật `CaseExplorerScreen.chrome = CHROME.VIEWER`: ảnh tràn màn hình (mở ở 1,6x), thanh đầu nổi (case, model ·
experiment, chọn run, khiên privacy, Info, "more"), chip lớp (ground truth và prediction đều bật sẵn khi có GT), thanh
Fill / Outline / Both, panel dưới gồm Raw / Processed, "Slice 45 / 88", thanh trượt và nút phát. Thu nhỏ bằng hai ngón dừng
ở vừa khít (1,0x, `pinchTransform`); Play chạy tới lát cuối thì dừng, bấm Play ở lát cuối thì phát lại từ lát 1.
Mã, checksum, run, z, phiên bản metric nằm trong **Details** (Info); lối sang SCR-04/05/06, độ dày viền, độ mờ, Fit,
Refresh nằm trong sheet **Tools** ("more"). SCR-04 cùng ngôn ngữ: chip TP / FP / FN (FP ô màu nét đứt), "Jump to the worst
slice", dải metric; nhãn mục không ghi "server ·" hay mã DR-010, nguồn số liệu nói một lần trong Details.

**Lỗi trên máy đã sửa:** B1 ảnh cũ giữ tới khi ảnh mới giải mã xong (`viewerFrame`); B2 About / Provenance vào Details; B3 panel
dưới đủ biến thể + thanh trượt + nút phát; B5 một hàm đánh số `lib/sliceNumber.mjs` ("45 / 88", 1-based). Vùng chạm ≥ 48 dp
(`hitSlopFor` trong `components/tokens.mjs`).

**File:** `CaseListScreen.js`, `CaseExplorerScreen.js`, `ErrorInspectorScreen.js`; `SliceView.js` (viewport, `SliceControls`,
`useSlicePlayer`); `sliceControls.mjs` (`createPlayer`, `pinchTransform`, `framing`, `viewerFrame`); `cases.mjs` (model, worklist,
`experimentLabel`); `errorInspector.mjs` (DR-010 do server xếp, app không sort); `scriptedRuns.js` (A9 / L4).
**Privacy:** `expo-screen-capture` cần APK mới; APK cũ ghi "not available in this build".
**Test:** `node --test mobile/test/v1*.test.mjs mobile/test/privacy.test.mjs`; `cd mobile; npm run test:render` (A1.., L3, O*, P3, P4, W1..W5).
Cần điện thoại: độ mượt Play (GT bật sẵn tải thêm một mask mỗi lát), cử chỉ trên ảnh tràn viền, màu khiên, chữ trên mô sáng.
