# Thành phần dùng chung: Direction A "Clinical viewer"

Mọi màu, cỡ chữ, khoảng cách lấy từ `theme.js` (nguồn `tokens.mjs`); màn hình không tự viết mã hex.
Token: nền `color.bg / surface / field / raised`, đường kẻ `color.hair`, trên ảnh `color.glass / glassPanel`; chữ `color.t1 / t2 / t3`; trạng thái `color.accent / accentSoft / live / warn / warnSoft / danger`; dữ liệu `overlay`, `errorClass`, `family`.
Kích thước: `space.xs..xxl` (4–32), `radius.xs..l` (4–10), `size.*` (chiều cao cố định), `type.*` (vai trò chữ: `{ ...type.body, color: color.t1 }`); số xếp cột thêm `fontVariant: font.numeric`.

| Cần gì | Dùng | Ghi chú |
|---|---|---|
| Biểu tượng | `icons.js`: `IconBack`, `IconInfo`, `IconPlay`, `IconMore`, … | `size`, `color`, `strokeWidth`; nút bọc ngoài mang `accessibilityLabel` |
| Thanh đầu trang | `AppHeader.js` | shell vẽ sẵn; màn hình báo case / run bằng `nav.setContext` (thêm được `title`, `subtitle`, `onSubtitlePress`, `actions`, `overflow`, `details`: xem `navigation/header.mjs`) |
| Màn hình ảnh tràn viền | `MyScreen.chrome = CHROME.VIEWER` (`navigation/routes.mjs`) | thanh đầu nổi trên ảnh, ẩn thanh tab; màn hình tự vẽ `TopScrim` (`Floating.js`) trên ảnh, dưới chú thích của nó, và chừa 56 dp phía trên |
| Nút một biểu tượng | `IconButton` (`Controls.js`) | vùng chạm 48 dp; `active` tô `accent` |
| Nút chữ | `Button` (`Controls.js`) | `primary` / `secondary` / `quiet`; `block` giãn hết bề ngang |
| Chọn 1 trong vài | `SegmentedControl` (`Controls.js`) | rãnh 32 dp màu `field`, mục chọn `accent` trên `accentSoft` |
| Nhãn lớp trên ảnh | `Chip` (`Controls.js`) | nền `glass`; đặt các chip trong một View cột |
| Thẻ nhỏ cạnh mã | `Tag` (`Controls.js`) | `neutral` / `warn` / `danger` |
| Tiêu đề mục | `SectionLabel` (`ListRow.js`) | `section` / `column` (CASE … DICE) / `group` |
| Dòng danh sách | `ListRow` (`ListRow.js`) | `nav` 48 / `meter` 40 / `case` 52 dp; `bar`, `value`, `tag`, `trailing` |
| Thanh Dice 4 dp | `MiniBar` (`ListRow.js`) | `warn` cho outlier, còn lại xám `barNeutral` |
| Ba số lớn | `MetricStrip.js` | ô có `onPress` hiện mũi tên và mở nơi nó đếm |
| Công cụ nổi trên ảnh | `FloatingToolbar`, `ToolButton`, `BottomPanel`, `TopScrim` (`Floating.js`) | tự đặt vị trí bằng `style` |
| Bảng chi tiết | `DetailsSheet`, `Sheet`, `DetailLine` (`DetailsSheet.js`) | mã, checksum, phiên bản; tự ẩn khi màn hình bị che |
| Trạng thái màn hình | `StateView`, `StatePanel` (`StateView.js`) | chữ và nút lấy từ `stateCopy.mjs` |
| Mã định danh gập lại | `Provenance` + `IdLine` | dòng 48 dp giữa hai đường kẻ |
| Chế độ case | `CapabilityBadge` | chữ trên thẻ trung tính, không màu |

Quy tắc: màu không bao giờ đứng một mình (luôn kèm chữ hoặc biểu tượng); `t3` không đặt trên `glass`;
mọi vùng chạm ≥ 48 dp (phần nhìn thấy thấp hơn thì `hitSlop={hitSlopFor(chiều cao)}`, nhãn có thể ngắn hơn 48 dp thì thêm `minWidth: MIN_TOUCH`;
`test/render/touch_targets.mjs` đo từng thành phần dùng chung); giá trị thiếu là một chữ, không phải 0.
Bề ngang và cỡ chữ (320–480 dp, cỡ chữ hệ thống đến 1,3): nhãn một dòng trong ô cố định (tên tab, tên công cụ) rộng
bằng ô chứa nó (`alignSelf: 'stretch'`, `textAlign: 'center'`), `numberOfLines={1}` và
`maxFontSizeMultiplier={LABEL_FONT_CAP}` (thẻ `Tag` chỉ cần giới hạn phóng chữ); ô số dùng `minWidth` đủ cho cỡ chữ 1,3 chứ không dùng `width`; hàng nhãn có thể
rộng hơn màn hình thì là `ScrollView horizontal`; chữ thân bài không bị giới hạn. Mã ca và dòng phụ của header nổi (khung viewer) cũng bị giới hạn
như nhãn trong ô cố định, vì các nút quanh chúng chiếm chỗ không đổi. Một chip trên ảnh thì ngược lại: rộng bằng chữ của nó, không `width`, không `alignSelf: 'stretch'`,
không giới hạn phóng chữ, để chữ dài như "TP 546 px" không bị cắt.
Đếm path / chấm trong test: bỏ qua biểu tượng (Svg có `testID` bắt đầu bằng `icon-`).
