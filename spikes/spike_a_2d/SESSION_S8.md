# Phiên đo `S8` — `A8`, `A10`, `A11` (19/09)

**Người cầm máy: Phạm Tuấn Anh** (chỉ trưởng nhóm có máy A17). Dự kiến **~45 phút**.
Mục tiêu: ba tiêu chí còn thiếu của Spike A, để `TECH_STACK_ADR` có thể viết **sau khi** cả Spike A và
Spike B `ACCEPTED`.

> Bản build **phải là `release`**. Debug build làm lệch mọi con số thời gian, và một số đo trên debug
> **không phải** bằng chứng nghiệm thu. Mọi script đều ghi `build_type` để chỗ này không bị quên.

---

## 0 · Trước khi cắm máy (làm trên PC, ~5 phút)

```powershell
cd D:\cardiac-mri-workspace\spikes\spike_a_2d
node harness/test_viewer_math.mjs      # F4
node harness/test_brush.mjs            # F5
node harness/test_persist.mjs          # F6 — mới, cho S8
python harness/check_conformance.py    # F1–F5
```

Cả năm phải xanh **trước** khi đo. Một phiên đo trên mã chưa qua kiểm offline là một phiên phải đo lại.

APK release:

```
spikes/spike_a_2d/app/android/app/build/outputs/apk/release/app-release.apk
```

> ### ⚠ Kiểm APK có MỚI HƠN mã nguồn không — đã dính một lần, 19/09 11:57
>
> APK dựng lúc 03:44:34; `App.js` sửa lần cuối 03:48:32 vì phần ghi kết cục nét lên bản ghi cử chỉ (thứ
> `A11` cần) được thêm **sau** khi build. Bản trên máy có `A8` nhưng không có phần đó, nên sau **25 nét tô
> thật** `extract_a10_a11.py` vẫn trả `A11 INCOMPLETE` — và cả phần 1 phải làm lại, vì ghép phần 1 của build
> cũ với phần 2 của build mới đúng là lỗi *"một build, một biến"* của `#41`.
>
> ```powershell
> $apk = Get-Item app\android\app\build\outputs\apk\release\app-release.apk
> Get-ChildItem app\*.js | Where-Object { $_.LastWriteTime -gt $apk.LastWriteTime }
> ```
>
> **In ra bất cứ file nào là phải dựng lại.** Mất 3 phút build, rẻ hơn 15 phút tô lại.

Nếu cần dựng lại:

```powershell
cd D:\cardiac-mri-workspace\spikes\spike_a_2d\app
npx expo prebuild --platform android --clean
cd android; .\gradlew.bat assembleRelease
```

---

## 1 · Cắm máy và ghi điều kiện đầu (~3 phút)

```powershell
cd D:\cardiac-mri-workspace\spikes\spike_a_2d
adb devices                              # phải thấy đúng một thiết bị
python harness/capture_conditions.py --phase before --out "EVIDENCE_RAW\conditions_s8_before_<stamp>.json"
adb install -r app\android\app\build\outputs\apk\release\app-release.apk
adb logcat -c                            # log sạch: mỗi phiên một log
```

> ⚠ **`adb install -r` có thể treo vài phút** chờ một hộp thoại trên máy (xác nhận cài đè, hoặc cảnh báo
> Play Protect với APK ký bằng khoá debug-release cục bộ). Nhìn màn hình điện thoại, đừng ngồi đợi terminal.
> Xác nhận đã cài đúng bản mới bằng `lastUpdateTime`:
>
> ```powershell
> adb shell dumpsys package com.cardiacmri.spikea2d | findstr "versionName lastUpdateTime flags="
> ```

**Điều kiện ghi bằng script, không gõ tay.** Pin, nhiệt độ, chế độ tiết kiệm pin và thiết bị đều do
`capture_conditions.py` đọc từ máy.

---

## 2 · `A10` và `A11` — tô thật (~15 phút)

Mở ứng dụng. **Chưa bấm gì về lưu.**

| Bước | Làm gì | Vì sao |
|---|---|---|
| 2.1 | `Sửa` · `thêm` · `r = 2`, tô **10 nét** trên ít nhất 3 slice khác nhau | `A10`: mỗi nét in một `feedback_ms_p50` / `_max` thật |
| 2.2 | `xoá` · `r = 1`, tô thêm **5 nét** | nhánh xoá phải có mẫu riêng, không suy ra từ nhánh thêm |
| 2.3 | **`r = 5`** và `r = 3`, mỗi cỡ **5 nét** | bán kính lớn tô nhiều pixel hơn mỗi mẫu → đây mới là chỗ nặng. *(Bản đầu ghi `r = 0` là "nặng nhất" — sai; phiên 19/09 đo được `r5` worst 19,41 ms còn `r1` worst 30,48 ms, tức chi phí không do footprint quyết định.)* |
| 2.4 | **Trong lúc đang tô, đặt ngón thứ hai xuống** — làm **5 lần** | `A11`: nét phải **cuộn lại đúng** (`end: second_finger`), hai ngón chuyển sang pinch/pan và **không tô** |
| 2.5 | Zoom vào ~4× rồi tô tiếp **5 nét** | `A11` + `A5`: ánh xạ chạm→pixel phải giữ nguyên sau zoom |
| 2.6 | Bấm **`kiểm A2 (checksum)`** | mask **nguồn** phải vẫn khớp fixture sau tất cả những thao tác trên |

Tối thiểu **25 nét có commit** và **5 nét bị chặn bởi ngón thứ hai**. Ít hơn thì `A10` chỉ là giai thoại.

```powershell
python harness/extract_brush.py --label "S8 A10/A11 — release, A17, 25+ nét thật"
```

---

## 3 · `A8` — lưu và nạp lại (~15 phút)

### 3.1 Vòng tự động (chứng minh codec và tệp, **không** chứng minh A8)

| Bước | Làm gì | Kỳ vọng trên màn hình |
|---|---|---|
| 3.1.1 | Bấm **`A8 tự động (5)`** | `5/5 vòng lưu→nạp lại đúng từng byte` |

Vòng này chạy **trong cùng một tiến trình**. Nó nói codec đúng và tệp ghi/đọc được. Nó **không** nói bản
sửa sống sót qua việc ứng dụng bị tắt — nên nó **không** đủ cho `A8`.

### 3.2 Vòng nguội — **đây mới là `A8`**

| Bước | Làm gì | Kỳ vọng |
|---|---|---|
| 3.2.1 | Tô thêm vài nét (để bản lưu **có chỉnh sửa thật**) | dòng trạng thái tăng số nét |
| 3.2.2 | Bấm **`lưu`** | `A8 lưu: … KB (…% của … MB thô) · … ms` — **chép lại `volume_sha256` trong log** |
| 3.2.3 | `adb shell am force-stop com.cardiacmri.spikea2d` | ứng dụng tắt hẳn, không phải chỉ về màn hình chính |
| 3.2.4 | Mở lại ứng dụng từ biểu tượng | dòng trạng thái: **`có bản lưu từ lần chạy trước (… KB)`** |
| 3.2.5 | Bấm **`nạp lại`** | **`A8 nạp lại (NGUỘI — tệp từ lần chạy trước)`** · `88/88 slice khớp checksum` · `hash khối khớp` |
| 3.2.6 | Lặp lại 3.2.1–3.2.5 **một lần nữa** | hai vòng nguội độc lập, không phải một |

**Chữ `NGUỘI` phải xuất hiện trên màn hình.** Nếu nó ghi `nóng`, tiến trình chưa chết thật — `force-stop`
lại. `extract_a8.py` sẽ trả `INCOMPLETE` nếu không có vòng nguội, và sẽ **không** nhận vòng nóng thay thế.

```powershell
python harness/extract_a8.py --label "S8 A8 — release, A17, 2 vòng nguội sau force-stop"
```

Script từ chối kết luận `OBSERVED` khi:
- không có vòng nguội nào;
- có vòng nguội nhưng trong log không có lần `lưu` nào ghi đúng `volume_sha256` đó;
- bản lưu tương ứng là mask **chưa sửa** (`edited_slices = 0`);
- bất kỳ vòng nào lệch checksum slice hoặc lệch hash khối → **`FAIL`**.

---

## 4 · Điều kiện cuối và thu dọn (~5 phút)

```powershell
python harness/capture_conditions.py --label "S8 sau — release, A17"
adb logcat -d > EVIDENCE_RAW\s8_device_session_<stamp>_logcat.txt
```

Bốn tệp bằng chứng của phiên:

| Tệp | Nội dung |
|---|---|
| `EVIDENCE_RAW/a8_save_reload_<stamp>.json` | `A8` — có `verdict`, phân bố `save_ms` / `reload_ms`, từng bản ghi thô |
| `EVIDENCE_RAW/a3_a7_brush_<stamp>.json` | `A10` / `A11` — `feedback_ms` từng nét, các nét bị cuộn lại |
| `EVIDENCE_RAW/conditions_<stamp>.json` × 2 | pin/nhiệt/chế độ, **trước và sau** |
| `EVIDENCE_RAW/s8_device_session_<stamp>_logcat.txt` | log thô, để người khác tự trích lại |

Điền tay đúng ba trường mà máy không tự biết: `operator`, `device`, `build_type`.

---

## Ranh giới của phiên này

- **Không sửa mã trong lúc đo.** Một biến đổi giữa phiên là bài học `#41`: "một build, một biến".
  Nếu phát hiện lỗi, ghi lại, đo nốt, sửa sau.
- **Không gõ số vào bằng chứng.** Mọi con số do script trích từ log.
- **Không kết luận `A12`** (chi phí dựng) từ phiên này — đó là số giờ, lấy từ nhật ký công việc.
- Phiên này **không** đóng `GATE-MOB-01`. Nó cho Spike A đủ dữ liệu để QA xét; cổng còn cần Spike B
  `ACCEPTED` và `TECH_STACK_ADR`.
