# V1 — Danh sách case, Case Explorer, Error Inspector (SCR-02, SCR-03, SCR-04)

**Giao diện Direction A** (mẫu `design/A_cases.png`, `A_viewer.png`): SCR-02 có ô tìm mã, tab lọc kèm số đếm, chọn
"Dice of" (sheet các experiment), Server / Worst first, dòng 52 dp với thẻ Outlier n/3, thanh Dice và giá trị; khi
Worst first, case không có Dice nằm dưới "No Dice for this experiment" và nói bằng chữ (No GT, Run failed), không bao giờ là 0.
SCR-03 bật `CaseExplorerScreen.chrome = CHROME.VIEWER`: ảnh tràn màn hình (mở ở 1,6x), thanh đầu nổi (case, model ·
experiment, chọn run khi có nhiều run, khiên privacy, Info, nút "more"), chip lớp, thanh Fill / Outline / Both, một
panel dưới gồm Raw / Processed, "Slice 45 / 88", thanh trượt và nút phát. Mã, checksum, run, z, phiên bản metric nằm
trong sheet **Details** (Info); lối sang SCR-04/05/06, độ dày viền, độ mờ, Fit, Refresh nằm trong sheet **Tools** ("more").
SCR-04 cùng ngôn ngữ: chip TP / FP / FN (FP ô màu nét đứt), nút "Jump to the worst slice", dải metric.

**Lỗi trên máy đã sửa:** B1 ảnh cũ giữ nguyên tới khi ảnh mới giải mã xong (`viewerFrame`, không còn khung đen khi Play);
B2 About / Provenance chuyển vào Details; B3 panel dưới hiện đủ biến thể + thanh trượt + nút phát; B5 một hàm đánh số
`lib/sliceNumber.mjs` ("45 / 88", 1-based) dùng chung SCR-03/04, SCR-06 import được. Vùng chạm đều ≥ 48 dp.

**File:** `CaseListScreen.js`, `CaseExplorerScreen.js`, `ErrorInspectorScreen.js` (ba màn hình); `SliceView.js`
(`SliceViewport` ảnh hai lớp + mask + cử chỉ, `SliceReadout`, `SliceControls`, `DrawModeToolbar`, `useSlicePlayer`,
`useMaskOverlay`); `sliceControls.mjs` (`overlayStyle`, `createPlayer`, `framing`, `zoomReadout`, `viewerFrame`);
`cases.mjs` (model, worklist, `diceCornerText`, `runSubtitle`); `errorInspector.mjs` (DR-010 do server xếp, app không sort);
`scriptedRuns.js` (A9 / L4: nhấn giữ số lát).

**Privacy:** `expo-screen-capture` cần APK mới; APK cũ ghi "not available in this build", khiên không sáng.

**Test** (từ gốc repo):
```powershell
node --test mobile/test/v1*.test.mjs mobile/test/privacy.test.mjs mobile/test/readers.test.mjs
cd mobile; npm run test:render    # A1..A4, B1 (F1), C1, C2, O*, P*, W0..W4, V5 cùng các kiểm cũ
```
Cần điện thoại: độ mượt Play, cử chỉ trên ảnh tràn viền, màu khiên khi đã bật privacy, chữ trên mô sáng.
