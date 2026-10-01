# B10/B11 — protocol trong React Native WebView

Đây là protocol cho **SPIKE_B diagnostic viewer** chạy bên trong container
React Native của Spike A. Nó tạo raw evidence; không tự đưa ra kết luận thay
cho chủ Spike B.

## Phạm vi và URL cố định

Chỉ nhận lượt đo trên **Samsung Galaxy A17 5G vật lý**, bản release của app có
container WebView (PR #46 hoặc commit đã merge), và source commit đã chứa PR
#43 để fixture mang `geometry_contract_version`. Không dùng Chrome hay Android
Studio emulator: chúng chỉ phù hợp để kiểm URL, thao tác và lỗi WebGL.

URL của lượt `B10`/`B11` đầu tiên là cố định:

```text
http://127.0.0.1:8765/app/?mesh=synthetic&level=0&probe_sink=/probe
```

- `mesh=synthetic` là artifact chẩn đoán hiện có, không phải mask bệnh nhân;
- `level=0` là mesh không decimate, 5.648 triangles ở artifact hiện tại;
- `probe_sink=/probe` bắt buộc để một payload được lưu độc lập ở máy trạm, bên
  cạnh payload qua React Native bridge/logcat.

Hằng `WEBVIEW_URL` ở `spikes/spike_a_2d/app/App.js` phải là đúng URL trên khi
build app cho phiên này. Nếu chỉ đổi `level`, chỉ đổi một chữ số trong URL và
build lại; không trộn các level trong cùng một file evidence.

## Chuẩn bị phiên

Làm trên máy trạm ở root repository, với thư mục evidence nằm **ngoài** Git:

```bash
OUT="$HOME/cardiac-mri-evidence/b10-b11-$(date +%Y%m%dT%H%M%S)"
mkdir -p "$OUT"
git rev-parse HEAD > "$OUT/repository_commit.txt"
python3 spikes/spike_b_3d/mesh/build_mesh.py
python3 spikes/spike_b_3d/harness/serve_viewer.py --out "$OUT"
```

Giữ tiến trình `serve_viewer.py` mở ở terminal thứ nhất. Nó chỉ bind loopback,
phục vụ viewer và nhận `POST /probe`; điện thoại chỉ thấy nó qua `adb reverse`.
Lệnh từ chối `--out` trong repository để raw evidence không lẫn với source.

Ở terminal thứ hai, chạy:

```bash
python3 management/day09/b10_b11_session/session.py start --out "$OUT"
```

Script kiểm thiết bị, màn hình, lock screen, USB, release app, server `200` và
`adb reverse tcp:8765`. Nó tự thêm reverse khi đó là thiếu sót duy nhất, xóa
logcat cũ, rồi lưu điều kiện trước phiên. Nếu in `NOT READY`, dừng ở đó và giữ
`session_NOT_READY.json`; không bấm đo trong điều kiện đó.

## Thao tác trong app

1. Trên A17 mở Spike A, chạm **3D · WebView (B10/B11)** và đợi trạng thái
   `level_0_cell1.obj · loaded` cùng triangle count hiện ra.
2. Chạm **run 30 s device probe**. Ba giây đầu là warm-up, không được tính.
3. Trong 30 giây tiếp theo, làm liên tục và theo thứ tự: 0–10 s orbit một
   ngón; 10–20 s pan hai ngón; 20–30 s pinch zoom in/out, rồi chạm một điểm
   trên mesh để kiểm picking. Giữ viewer foreground và màn hình bật.
4. Chờ nhãn `raw evidence: RN + HTTP`. Nếu chỉ có một đường gửi, ghi lại đúng
   trạng thái đó; nếu không có collector, lượt đo invalid.
5. Lặp lại **ba lượt** với cùng URL, mesh level, app build và điều kiện thiết
   bị. Nút download JSON chỉ là dự phòng browser; WebView dùng bridge và HTTP.

Hai ngón và pinch phải do operator thực hiện. `adb input` chỉ tạo được một
pointer nên không thể thay những thao tác này.

## Kết thúc và handoff

Sau lượt cuối, chạy ở terminal thứ hai rồi dừng server bằng `Ctrl-C`:

```bash
python3 management/day09/b10_b11_session/session.py finish --out "$OUT"
shasum -a 256 "$OUT/webview_probe_payloads.jsonl" > "$OUT/webview_probe_payloads.jsonl.sha256"
```

Một phiên hợp lệ có những file sau:

| File | Nguồn | Mục đích |
|---|---|---|
| `conditions_before.json`, `conditions_after.json` | session script | nhiệt, pin, màn hình và trạng thái thiết bị |
| `webview_logcat.txt`, `webview_payloads.json` | React Native bridge | bản gốc các payload `SPIKE_B_WEBVIEW` |
| `webview_probe_payloads.jsonl` | HTTP `/probe` | bản gốc dự phòng của từng frame probe |
| `session_state.json` | session script | preflight, số payload và hash các file session |
| `repository_commit.txt` | Git | commit source đã đo |

Phải có ba `kind: "spike_b_frame_probe"` trong `webview_payloads.json` và ba
record tương ứng trong JSONL HTTP. Mỗi payload phải có URL cố định, `mesh_id`
`synthetic`, `mesh_level` `0`, triangle count, geometry contract version,
`median_fps`, `longest_stall_ms`, `frames_over_500ms` và raw frame intervals.
Thiếu bất kỳ trường nào, mismatch URL/level, viewer bị background, hoặc thiếu
conditions trước/sau làm cả lượt **invalid**.

Chủ Spike B mới diễn giải các byte này trong `RESULT.md`:

- **B10 PASS** khi `median_fps ≥ 20` ở từng lượt hợp lệ;
- **B11 PASS** khi `longest_stall_ms ≤ 500` và `frames_over_500ms = 0` ở từng
  lượt hợp lệ;
- `status: insufficient_samples`, lỗi render hoặc evidence thiếu provenance là
  `NOT MEASURED`, không suy ra PASS hay FAIL.

`B5`/`B6` và quyết định frontier `B12`/`B13` là lượt khác: chúng cần mesh/mask
bệnh nhân thật và picking error. Synthetic level 0 ở đây chỉ xác thực đường đo
`GATE-MOB-01` trong app.
