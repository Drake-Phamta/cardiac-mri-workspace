# V1 — Danh sách case, Case Explorer, Error Inspector (SCR-02, SCR-03, SCR-04)

**Cho người dùng:** SCR-02 là worklist: tìm theo mã, lọc theo chế độ, chọn một experiment để mỗi case có chip Dice
của server ("no GT", "run failed", "not in …" bằng chữ, không bao giờ là 0), sắp "Worst first" và đánh dấu "outlier n/3"
do server chọn. SCR-03 xem từng lát MRI: mask dự đoán (RAW/PROCESSED) và ground truth vẽ Fill / Outline / Both (viền
1–3 px), Play quét lát ~5 lát/giây, giữ ◀ ▶ để lặp, chạm đúp để zoom 2x / vừa khung. SCR-04 tô TP xanh lá, FP hồng
(viền nét đứt), FN xanh dương, đi thẳng tới các lát server xếp tệ nhất. SCR-03/04 có **Privacy mode** (mặc định bật).

**File nào làm gì** (file `.js` vẽ, file `.mjs` quyết định và được `node --test` kiểm):
- `CaseListScreen.js`, `CaseExplorerScreen.js`, `ErrorInspectorScreen.js`: ba màn hình.
- `SliceView.js`: `SliceViewport` (ảnh, lớp mask fill/viền, cử chỉ, chạm đúp), `SliceScrubber` (thanh lát, Play, giữ để
  lặp), `useSlicePlayer`, `OverlayStyleChips`, `PrivacyRow`, `useMaskOverlay`.
- `sliceControls.mjs`: `overlayStyle` (độ dày viền chia cho zoom), `createPlayer` (chỉ xin lát kế khi lát trước đã hiện:
  không bao giờ 2 lần tải song song), `createRepeater`, `isDoubleTap` / `doubleTapTransform`.
- `cases.mjs`: `createCaseExplorer`, `chooseRun`, `metricsText`, `readCaseRows`, worklist (`readExperimentCases`,
  `worklistChip`, `worklistRows`: cùng quy tắc xếp với outlier của server nên 3 dòng đầu khớp), `createSerialRunner`.
- `errorInspector.mjs`: `ERROR_CLASS` (màu an toàn cho người mù màu, FP `dashed`), đọc thứ tự lát tệ nhất **do server
  xếp** (app không sort lát), `runLevel`, `compareWithServer`.
- `scriptedRuns.js`: chạy thử A9 / L4 (nhấn giữ nhãn lát). Dùng chung: `lib/mask.mjs` (`maskOutlinePath`), `lib/privacy.mjs`.

**Quyền riêng tư:** Privacy mode dùng `expo-screen-capture` (`lib/screenCapture.js`): chụp/quay/cast màn hình ra màu đen,
ẩn ảnh trong recent apps. Module native nên **cần build APK mới**; APK cũ hiện "not available in this build". Tắt chỉ
khi chiếu màn hình. Id/checksum nằm trong thẻ Provenance (đóng sẵn).

**Test** (từ thư mục gốc repo):
```powershell
node --test mobile/test/v1*.test.mjs mobile/test/privacy.test.mjs mobile/test/readers.test.mjs
cd mobile; npm run test:render    # kiểm O*, C1, P*, W*, V5 cùng các kiểm cũ
```
