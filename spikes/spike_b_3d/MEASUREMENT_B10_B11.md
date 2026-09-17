# B10/B11 — protocol đo trên thiết bị

Đây là protocol cho **Spike B diagnostic**. Frame probe trong app chỉ ghi raw
`requestAnimationFrame` intervals; nó không tự biến một lần chạy thành bằng
chứng nghiệm thu.

## Khi nào số đo có giá trị

Chỉ nhận kết quả cho B10/B11 khi tất cả điều kiện sau được ghi cùng file JSON:

- thiết bị vật lý là **Samsung Galaxy A17 5G** (không phải Android Studio AVD);
- đã ghi model, Android version, Chrome version, trạng thái pin/nhiệt và kích
  thước màn hình; JSON đã chứa user agent, viewport, backing canvas và số tam
  giác;
- mesh là artifact được build ở lần chạy đó, với số tam giác ghi lại;
- viewer được giữ foreground, màn hình bật, trong cả lượt đo;
- operator thực hiện đúng chuỗi thao tác bên dưới và lưu raw JSON kèm notes.

Pixel/Android Studio emulator chỉ dùng để kiểm tra cài đặt, URL, thao tác chạm
và lỗi WebGL. Nó có GPU, refresh rate và compositor khác A17 nên không dùng
median FPS hay stall của emulator để quyết B10/B11 hoặc DR-008c.

## Cách chạy

1. Trên máy phục vụ file, vào `spikes/spike_b_3d` và chạy:

   ```bash
   python mesh/build_mesh.py
   python -m http.server 8765
   ```

2. Cắm A17 qua USB, bật USB debugging, xác nhận serial rồi map cổng local:

   ```bash
   adb devices -l
   adb -s <A17_SERIAL> reverse tcp:8765 tcp:8765
   ```

3. Mở Chrome trên A17 tới `http://127.0.0.1:8765/app/`. Xác nhận mesh thấy
   được, số triangles hiển thị và picking phản hồi trước khi bấm đo.
4. Bấm **run 30 s device probe**. Ba giây đầu là warm-up. Trong 30 giây đo:
   - giây 0–10: orbit liên tục bằng một ngón;
   - giây 10–20: pan bằng hai ngón;
   - giây 20–30: pinch zoom in/out, rồi chạm một lần vào mesh để kiểm tra pick.
5. Bấm **download raw frame JSON**, lưu file dưới `evidence/` cùng note thiết
   bị/browser/pin/nhiệt. Lặp tối thiểu ba lượt, ưu tiên cùng trạng thái thiết bị.

## Cách đọc raw JSON

- `median_fps` dùng cho B10, pass khi **≥20 FPS**.
- `longest_stall_ms` và `frames_over_500ms` dùng cho B11, pass khi **không có
  interval nào >500 ms**.
- Percentile được tính nearest-rank trên `raw_frame_intervals_ms`; rule này có
  trong `app/performance.js` để kiểm tra lại được bằng script/spreadsheet.
- `status: insufficient_samples`, màn hình đen, mesh không render, app bị nền,
  hoặc thiếu provenance đều là lượt **invalid**, không suy diễn pass/fail.

B5/B6 là lượt đo khác: cần mask/mesh bệnh nhân thật từ Spike D và picking error
sau xoay/zoom. Frame probe này không thay thế các phép đo đó.
