# V4 — Review / Correction và Findings (SCR-06, SCR-08), Direction A

**Cho người dùng.** SCR-06 là màn hình ảnh tràn viền (`chrome = CHROME.VIEWER`): thanh đầu nổi (ca, "Raw prediction", Info, "more"), thẻ trạng thái
review ở góc trên trái, cột công cụ bên phải (Add, Erase, Pan, giữ Source, Undo, Redo), bảng dưới (Slice 45 / 88, Reset, Save, cỡ bút).
Chạm thẻ trạng thái hoặc "more" mở **sheet Review**: Accept / Flag (bắt buộc lý do) / Not reviewed, lịch sử dạng dòng, Cancel edits, zoom,
"New finding here" (mang theo case, run, lát và experiment). Mã, revision, checksum nằm ở **Details** (nút Info của shell; màn hình báo mục qua `nav.setContext`).
Vì SCR-06 hiện ảnh MRI và mask, thanh trên có khiên **Privacy mode** như SCR-03 và SCR-04 (`usePrivacyMode('SCR-06')`, bật mặc định, nhớ trong phiên); SCR-08 chỉ có chữ nên không có khiên.
SCR-08 là danh sách dòng dày (mới nhất trước): tab trạng thái, chip loại, Export PDF; chạm một dòng mở sheet với ghi chú đầy đủ, Open evidence, Review / correct, Resolve / Reopen và mọi mã.

**File nào làm gì** (`.js` vẽ, `.mjs` quyết định và được `node --test` kiểm):
- `ReviewCorrectionScreen.js` ghép màn hình, giữ leave guard, báo header; `ReviewCanvas.js` ảnh + chạm + chú thích; `ReviewTools.js` cột công cụ
  (nút Source không mờ khi giữ: `activeOpacity` 1, lỗi B6); `ReviewPanel.js` bảng dưới (hàng slice cố định, lỗi B4; mỗi hàng xuống dòng khi hẹp hoặc chữ lớn, và bảng báo chiều cao đo được cho ảnh và cột công cụ); `ReviewPanels.js` sheet Review; `toolIcons.js` icon còn thiếu.
- `reviewScreen.mjs` bộ điều khiển SCR-06 (khung nhìn nằm giữa thanh trên và bảng dưới; Save giữ zoom và xoá lịch sử undo, lỗi B7); `reviewDetails.mjs` các mục của Details.
- `review.mjs` gọi API review; `brush.mjs` sửa pixel, undo/redo; `outline.mjs` viền mask; `history.mjs` dòng lịch sử; `notes.mjs` kiểm ghi chú (riêng tư).
- `FindingsScreen.js` + `findings.mjs` (model, lọc, báo cáo PDF, `whereLine` / `detailLines`); `pdfExport.js` nạp `expo-print` trong try (APK cũ: nút tắt, nói rõ).
- `format.mjs` số lát không cần tổng, tên trạng thái, nhãn experiment ("DINOv2 100 %", lấy từ ma trận của V3) và dòng "ở đâu" (`placeLine`: "CASE_0029 · Slice 45 · DINOv2 100 % · Raw"); số lát có tổng ("45 / 88") dùng `lib/sliceNumber.mjs` của shell.
- Dùng chung hai màn hình: `Notice.js` (một dòng chữ, hộp trống không bao giờ được vẽ), `NoteCheck.js`, `confirm.js` (`useConfirm`: câu hỏi Cancel / OK là một Sheet của viewer, không còn hộp thoại hệ thống).
- `Why.js` bọc điều khiển đang tắt: `accessibilityHint` là lý do, chạm vào thì hiện lý do thành một dòng ghi chú trên ảnh. Lý do do bộ điều khiển tính (`st.why` trong `reviewScreen.mjs`, `statusHint` trong `review.mjs`), nên `node --test` kiểm được.

**Quy tắc.** Lát đếm từ 1 cho người (z = 44 là lát 45); z không hiện ở đâu cả. Không hiện mã, revision, checksum, run trên bề mặt chính (mã của finding, run, experiment chỉ ở phần Details của sheet; chỗ người đọc thì dùng nhãn experiment).
Vùng chạm ≥ 48 dp: điều khiển nhỏ hơn thì bù bằng `hitSlop` hoặc `minHeight`, và hai hàng chip khi xuống dòng cách nhau 16 dp để vùng chạm không chồng lên nhau. Mỗi điều khiển đang tắt có một lý do bằng lời.
Backend: `experiment_compare` chỉ "comparable" khi cùng loại mask tham chiếu và cùng geometry policy (`backend/app/metrics.py`).

**Test** (từ thư mục gốc repo):
```powershell
node --test mobile/test/v4_*.test.mjs
cd mobile; npm run test:render    # các kiểm V4a ... V4z
python -m pytest backend/tests -q -p no:cacheprovider
```
