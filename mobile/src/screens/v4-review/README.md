# V4 — Review / Correction và Findings (SCR-06, SCR-08)

**Cho người dùng:** SCR-06: chấp nhận, gắn cờ (bắt buộc ghi lý do) hoặc sửa mask dự đoán bằng bút / tẩy (undo, redo),
lưu thành một phiên bản mới; mask gốc không bao giờ bị ghi đè. Mask gốc vẽ thành **đường viền** dưới các nét sửa; giữ
nút **Hold: source** để xem riêng mask gốc. Cỡ bút ghi bằng **px** (1–11), vòng tròn bút hiện ở ngón tay. Nút
**History** mở dòng thời gian: ai, làm gì, lúc nào (người rà soát hiện bằng bí danh dự án). SCR-08: ghi finding gắn
case / run / lát, lọc theo trạng thái và loại, mới nhất trước, **Export PDF**, đánh dấu đã xử lý, mở lại đúng chỗ.

**File nào làm gì** (file `.js` vẽ, file `.mjs` quyết định và được `node --test` kiểm):
- `ReviewCorrectionScreen.js`, `FindingsScreen.js`: hai màn hình; `NoteCheck.js`: bộ đếm ký tự + cảnh báo dưới ô chữ.
- `reviewScreen.mjs`: bộ điều khiển SCR-06 (mở review, tải lát, `holdSource`, vòng bút `ring`, hộp lý do cờ
  `startFlag` / `submitFlag`, timeline `wants.history` → `provideHistory`, lưu) và `createGestureController`.
- `review.mjs`: gọi `review_create`, `review_patch` (cờ phải có `reason`), `working_mask_put`, `review_commit`.
- `brush.mjs`: sửa pixel, undo/redo, `brushSizePx` (2r + 1), `brushRing`, mã hoá BITPACK_BASE64.
- `outline.mjs`: `outlinePath` — đường viền mask từ các cạnh pixel (hình vuông đặc → đúng 4 cạnh).
- `history.mjs`: `timelineLines` — hàng `review_history_list` → dòng mới nhất trước, gộp các lát của một lần lưu.
- `notes.mjs`: `checkNote` — quyền riêng tư: tối đa 500 ký tự; cảnh báo ngày tháng, dãy số giống CCCD / SĐT,
  email, danh xưng + tên (Dr Smith, bà Lan). Cảnh báo không chặn (nút "… anyway"), quá dài thì chặn.
- `findings.mjs`: model + bộ điều khiển SCR-08: lọc `filterFindings`, đếm `countFindings`, báo cáo
  `findingsReportHtml` (mọi ghi chú được escape HTML, không có ảnh, ghi "Research use only").
- `pdfExport.js`: nơi duy nhất nạp `expo-print` (require trong try): APK cũ chưa có module thì nút tắt và nói rõ.

**Backend + hợp đồng:** `GET /api/v1/reviews/{id}/history` (contract 1.2.0), `reason` tuỳ chọn trên `review_patch`;
mỗi lần ghi lưu bí danh `CARDIAC_REVIEWER_ALIAS` (mặc định `project-reviewer`), không bao giờ lưu email (spec 12 §2, §5).

**Test** (từ thư mục gốc repo):
```powershell
node --test mobile/test/v4_*.test.mjs
cd mobile; npm run test:render    # các kiểm V4a ... V4w
```
