# DEVICE_SESSION — phiên điện thoại bằng một lệnh

**Dành cho:** Phạm Tuấn Anh (V1 owner), Galaxy A17 5G (SM-A176B), Windows + `adb`.
**Làm gì:** cắm máy, mở khóa, trả lời vài câu hỏi; script `mobile/scripts/device_session.ps1` tự làm phần còn lại:
preflight → cài APK → chạy A9 / TC-PERF-001 (3 lượt) → chụp màn hình SCR-01..SCR-08 → chấm T1–T4 → viết `SUMMARY.md` và
`PROVENANCE_DRAFT.md`. Thủ tục gốc vẫn là `mobile/A9_TC_PERF_001_SCRIPT.md` (tiêu chí PASS T1–T4) và
`mobile/S1_L4_SCRIPT.md` (quy ước adb); script chỉ tự động hóa đúng các bước đó.

## 1. Trước khi cắm máy (T−15 phút)

**Điện thoại**

- Pin trên 50 %, tắt Tiết kiệm pin. Nhiệt độ máy bình thường (script ghi mức pin và nhiệt độ; từ 40 °C nó cảnh báo).
- **Gỡ lỗi USB (USB debugging)** đang bật: Cài đặt → Tùy chọn nhà phát triển. Nếu có mục *Cài đặt qua USB (Install via USB)*
  thì bật luôn, nếu không máy sẽ hỏi xác nhận mỗi lần cài.
- **Màn hình luôn sáng:** script tự bật "Stay awake while charging" cho cả phiên và **trả lại như cũ** khi xong (tắt bằng
  `-NoStayAwake`). Dù vậy nên để thời gian tắt màn hình ≥ 5 phút. Đừng đổi *Motion smoothness* (Cài đặt → Màn hình) trong phiên;
  nhìn và ghi lại giá trị đang dùng vào PROVENANCE.
- **Wi-Fi bật, ZeroTier (overlay) đã kết nối**: trên Mac mini `zerotier-cli peers` thấy điện thoại là `DIRECT`. Ghi đường mạng này
  vào PROVENANCE (script không thể tự biết).
- Không mở app khác, tắt thông báo/cuộc gọi trong lúc chạy.

**Máy tính**

- `adb` ở `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` (hoặc truyền `-Adb <đường dẫn>`); `node` có trong `PATH`.
- APK `live` mới nhất trong `mobile\release\` cùng file `.build.txt` bên cạnh (script tự chọn file `*live*.apk` mới nhất,
  tính SHA-256 và so với `apk_sha256` trong `.build.txt`; lệch là dừng). Muốn dùng build khác: `-Apk <file>`.
- Backend trên Mac mini đang chạy (`/health` trả `ok`). URL backend nằm trong biến môi trường `EXPO_PUBLIC_API_BASE_URL` hoặc
  `mobile\.env.local` (không commit). Có URL thì script kiểm `/health` từ máy tính (chỉ in `reachable` / `unreachable`, **không bao giờ in địa chỉ**) và
  chạy `preflight-live.mjs --case <case>`. Không có URL thì hai bước đó được bỏ qua, và kiểm tra phía điện thoại là danh sách case tải được.
- Cắm cáp USB, **mở khóa máy**, bấm **Cho phép (Allow)** ở hộp "Allow USB debugging?" (tick "Luôn cho phép").

## 2. Một lệnh

```powershell
powershell -ExecutionPolicy Bypass -File mobile\scripts\device_session.ps1
```

Chạy thử không cần điện thoại (in ra việc sẽ làm, kiểm APK/adb/node, không gửi gì): thêm `-DryRun`.
Ước lượng: cài 3 phút, mỗi lượt A9 ~5 phút (3 lượt), tour ~8 phút, chấm 1 phút. Tổng ~30–40 phút.

| Tham số | Ý nghĩa |
|---|---|
| `-Steps all` (mặc định) | hoặc danh sách `preflight,install,a9,tour,judge` (luôn chạy theo thứ tự đó) |
| `-Reps 3` | số lượt A9 |
| `-Case CASE_0061` | case của A9 (mở thẳng, không có run: MRI + ground truth) |
| `-TourCase CASE_0042` | case của tour; nếu case này **không có analysis run**, tour bỏ qua SCR-04/05/06 và ghi rõ lý do |
| `-Apk`, `-Out`, `-Adb`, `-MobileDir` | file APK; thư mục kết quả (phải **ngoài git**); đường dẫn adb; thư mục `mobile` của checkout đã build APK |
| `-Record` | thêm đoạn quay màn hình 60 s của một lượt "hero flow" ngắn (sau tour) |
| `-DryRun` | chỉ in kế hoạch |
| `-Unattended` | trả lời mọi câu hỏi bằng giá trị mặc định (dùng cho thử nghiệm / diễn tập) |

Chấm lại sau này, không cần điện thoại: `-Steps judge -Out D:\02_Research\cardiac-runs\_device_sessions\<thư mục>`.

## 3. Các câu hỏi script sẽ hỏi

| Câu hỏi | Nghĩa là gì, trả lời thế nào |
|---|---|
| `The phone is asleep or locked. Unlock it now ... press Enter` | Mở khóa máy rồi Enter. (Khóa bảo mật không mở được qua adb.) |
| `Continue anyway (the result will not be evidence)? [y/N]` | `PREFLIGHT` không PASS. Mặc định **N** = dừng (đúng quy tắc abort của thủ tục). `y` chỉ để diễn tập; kết quả khi đó không phải bằng chứng. |
| `Uninstall the old app ...? [y/N]` | App đang cài được ký khác hoặc mới hơn nên `install -r` bị từ chối. `y` = gỡ app cũ rồi cài lại (app không giữ dữ liệu cần thiết). |
| `Press Enter when it is done (S = skip this step, Q = stop the session)` | Một bước UI tự động **không làm được** (ví dụ không thấy nút). Script đã lưu ảnh chụp và UI dump vào `failures\`, và in ra *điều nó mong thấy*. Bạn **làm đúng bước đó bằng tay** trên điện thoại, rồi **Enter**. `S` = bỏ qua bước. `Q` = dừng phiên (vẫn chấm phần đã có). |
| `Repetition k done. Was the phone disturbed during the run ...? [y/N]` | Trả `y` nếu trong lượt vừa rồi có chạm màn hình, cuộc gọi, thông báo, khóa màn hình. Script dùng **lượt chạy lại duy nhất** của phiên (A9 §3b): giữ file cũ với tên `A9_rep<k>_attempt1_*`, chạy lại lượt đó, ghi lý do vào PROVENANCE. Quyết định **trước khi** xem báo cáo, không bao giờ vì con số xấu. Quá một lần chạy lại thì dừng. |
| `Open SCR-06 for the screenshot? [Y/n]` | Mở màn hình Review làm app gửi **một** `review_create` lên backend (idempotent: trả review đã có của run đó, hoặc tạo mới ở trạng thái `NOT_REVIEWED`). Script **không** bấm Accept / Flag / Mark corrected / Save, không vẽ, không commit review. Trả `n` nếu không muốn ghi gì lên backend demo. |

## 4. Trong lúc chạy

- Khi thấy dòng `A9 running ... Do not touch the phone` (khoảng 30–90 s mỗi lượt): **không chạm, không rút cáp**. Script không gọi gì lên máy trong
  khoảng này (không `uiautomator`, không `input`, không chụp màn hình); nó chỉ đọc file logcat trên máy tính, đến khi thấy `CMW_RUN_END` của
  lượt đo. `dumpsys meminfo` (M1) chạy **trước** khi bấm OK ở hộp "A9 finished".
- Nếu 3 phút (`-A9TimeoutSec`) không có "A9 finished": coi là lượt bị treo, dùng lượt chạy lại duy nhất; hỏng lần hai thì dừng và verdict là
  `NOT MEASURED` (không phải FAIL).
- Mọi lần bấm đều tìm control theo chữ trên màn hình (không dùng tọa độ cố định): tab dưới đáy, dòng case (`CASE_0061, ...`),
  nhãn `slice 45 / 88`, `Ground truth: OFF/ON`, nút `A9 30-step` (không phân biệt hoa thường), `OK`.
  Script **từ chối** bấm các nút ghi (Accept, Flag, Save, Resolve, Create finding ...) dù ai gọi.

## 5. Kết quả nằm ở đâu

`D:\02_Research\cardiac-runs\_device_sessions\<yyyyMMdd-HHmmss>\` (mặc định). **Ngoài git**: script từ chối `-Out` nằm trong repo.

| File | Nội dung | Commit? |
|---|---|---|
| `A9_rep{k}_logcat.txt` | log `ReactNativeJS` stream của từng lượt | **có** |
| `A9_rep{k}_meminfo_M0.txt`, `..._M1.txt` | `dumpsys meminfo` trước / sau mỗi lượt | **có** |
| `slice_timing_rep{k}.txt`, `slice_timing_all_reps.txt`, `l4_report_rep{k}.txt` | đầu ra của `slice-timing-report.mjs`, `l4-report.mjs` (từng lượt và gộp) | **có** |
| `apk_build_record.txt`, `preflight.txt` | `.build.txt` của APK (không có địa chỉ backend), các dòng `preflight:` … `PREFLIGHT PASS` | **có** |
| `SUMMARY.md` | verdict từng lượt và tổng, p50/p95, bộ đếm 62/63/2/2, bộ nhớ M0→M1, T1–T4 | **có** |
| `PROVENANCE_DRAFT.md` | nháp PROVENANCE (operator, thiết bị không có serial, APK, deviations, đồng hồ, SHA-256 các file ngoài git) | **có**, sau khi điền `TODO` và đổi tên thành `PROVENANCE.md` |
| `A9_rep{k}_attempt1_*` | các file của lượt hỏng nếu có chạy lại | **có** (liệt kê, không gộp) |
| `*_dump.txt`, `A9_all_reps_logcat.txt`, `session.log`, `session_state.json`, `*.xml`, `tour_logcat.txt` | bản sao / nhật ký làm việc | không (ghi SHA-256 trong PROVENANCE) |
| `screens\`, `videos\`, `failures\` | ảnh chụp tour, video, ảnh khi một bước hỏng | không (chỉ cho slide và cho D7, không vào repo công khai) |

**Quét an toàn trước khi commit** (script tự chạy ở cuối): trong đúng các file ở cột "có" không được có serial điện thoại, địa chỉ IPv4,
URL, tên người dùng Windows. File nào dính được gắn `HOLD` kèm `file:dòng` (không in nội dung khớp). Serial chỉ nằm trong bộ nhớ và được ghi là
`<device-serial>`; mọi dòng log và file text đều đi qua bộ che này.

Gợi ý chỗ commit: `management/evidence/TC_PERF_001/a9_product_app_<YYYYMMDDTHHMMSS+0700>/` (bạn quyết định). Phần đối chiếu server (§4.4: `requests.jsonl`,
`uvicorn.log` từ Mac mini, `summarize_request_log.py`) vẫn làm tay; script không làm phần này.

## 6. Đọc kết quả

Dòng cuối: `TC-PERF-001 PASS — MRI + ground-truth path; prediction overlay not covered, CASE_0061, 3/3 repetitions`, hoặc
`FAIL — T1, repetition 2`, hoặc `INCOMPLETE — 2 of 3`, hoặc `NOT MEASURED — <lý do>` (đúng lời văn của thủ tục A9). Mã thoát: `0` = chạy xong,
`2` = chạy xong nhưng verdict không phải PASS, `1` = dừng vì lỗi hoặc do bạn bấm Q.

- **T1** p95 ≤ 200 ms và n = 31 ở hàng `A9:measured`; **T2** release + live (không có hàng `(DEV build)`, cả hai `CMW_RUN_START` có `"dev":false,"mode":"live"`);
  **T3** 31 cử chỉ đều `cache_hit:true`, hai `CMW_NET_TOTALS` bằng nhau, không `CMW_STEP_TIMEOUT` trong lượt đo; **T4** `l4-report` có `"problems": []`
  (`L4 CANNOT_JUDGE` là dạng đúng cho capture A9).
- Build không phải `live` hoặc badge ghi **FIXTURE**: phiên là *diễn tập*, verdict ghi `NOT MEASURED — rehearsal, not evidence`.
- Một lượt mà lượt đo **không bao giờ kết thúc** là `NOT MEASURED`, không bị tính là FAIL của T1–T3.

## 7. Sự cố thường gặp

| Triệu chứng | Làm gì |
|---|---|
| `No phone found on adb` | Cắm lại cáp, mở khóa máy, bật Gỡ lỗi USB, bấm Cho phép; chạy lại cùng lệnh. |
| `has not authorised this PC` | Mở khóa máy và bấm Allow trên hộp "Allow USB debugging?". |
| `adb sees the phone as OFFLINE` | Rút cáp, cắm lại, mở khóa. |
| `adb install` treo | Máy đang chờ bạn bấm "Cài đặt" (Install via USB). |
| `CONFIGURATION ERROR` / badge `FIXTURE` | APK sai (không có URL backend / không phải live): build lại `mobile\scripts\build-release.ps1 -Mode live`. |
| Danh sách case báo lỗi (`could not be reached`) | Kiểm mạng trước: ZeroTier trên điện thoại, `/health` trên Mac mini. Script tự bấm Retry vài lần. |
| `PREFLIGHT FAIL P1 ... REBUILD` | Contract của backend khác contract trong APK: build lại từ checkout có contract đúng. |
| Một bước UI hỏng | Làm bước đó bằng tay theo thông báo (mục 3). Ảnh chụp và UI dump ở `failures\`. |
| Muốn xem lại những gì script đã làm | `session.log` trong thư mục kết quả (đã che serial / IP / đường dẫn người dùng). |

## 8. Kiểm thử không cần điện thoại

```powershell
powershell -ExecutionPolicy Bypass -File mobile\scripts\device_session.ps1 -SelfTest    # 32 kiểm tra: parser UI, tra control, bộ chấm T1–T4, che serial/IP
powershell -Command "Invoke-Pester mobile\test\ps"                                        # cùng các kiểm tra + chạy trọn phiên với "điện thoại giả"
$env:CMW_E2E_TOUR = '1'                                                                   # (tùy chọn) thêm tour ~2 phút vào Invoke-Pester
```

`mobile/test/ps/fake_adb/` là một điện thoại giả (adb giả + mô hình các màn hình từ mã nguồn app) để chạy trọn phiên khi không có máy: nó kiểm
**thứ tự và logic** của script (chờ, tra control, không chạm trong lúc chạy, không bấm nút ghi, chấm điểm), không kiểm giao diện thật của app.

**Chưa kiểm được khi không có điện thoại thật:** hình dạng chính xác của `uiautomator dump` trên Android 16 / One UI (script tra theo `text` và `content-desc`, có dự phòng),
tọa độ thật, thời gian thật, `dumpsys window` phát hiện khóa màn hình, quyền `settings put global stay_on_while_plugged_in`, chụp WebView 3D, hành vi `input swipe` làm long-press ≥ 800 ms.
Bước nào lệch thì script rơi về "làm bằng tay một bước" chứ không đoán bừa.
