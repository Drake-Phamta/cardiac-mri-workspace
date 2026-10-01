# S-1 · L4 — "a slice gesture never triggers a full-volume transfer"

**For:** Phạm Tuấn Anh, phone session on the Galaxy A17 5G, 2026-10-01 (~19:00).
**Decides:** Spike A L4 — `NFR-PERF-001` limb 2 — and with it `GATE-MOB-01` (leader decision, Day 22).
**Evidence it produces:** the phone's logcat (`CMW_GESTURE` lines), the laptop-side verdict of
`mobile/scripts/l4-report.mjs`, and the backend's request log for the same window.
**Not a measurement of speed.** L4 is about *what* is transferred per gesture, not how fast. Timing lines
(`CMW_SLICE`) are captured at the same time and judged separately (TC-PERF-001).

The commands are PowerShell on the laptop. `$adb` is the full path every time — the default `java`/`adb` on
`PATH` are not trusted.

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
```

## 0 · Before you start (T−10 min)

1. **The APK is the right one.** Open the `.apk.build.txt` next to the APK in `mobile\release\` and check:
   `mode live` · `api_base_url` is the Mac mini overlay address · `git_sha` is the PR head you expect ·
   `built_at` is **after** the last code change · `source_tree staging copy of committed HEAD`.
   Note the APK file name and its `apk_sha256` in your session notes.
2. **The backend answers.** On the Mac mini, `/health` returns `"status": "ok"` and `"data_ready": true`. (The
   phone-side check is step 2.3 below: the case list loads.)
3. **The network path is the acceptance path.** Phone on Wi-Fi, ZeroTier connected, `zerotier-cli peers` on the
   Mac mini shows the phone as `DIRECT` (DEMO_STANDARD §8). Write the path down.
4. **Phone:** charged above 50 %, screen timeout ≥ 5 min, no battery saver, USB debugging on and authorised:

   ```powershell
   & $adb devices -l          # one device, state "device"
   ```

## 1 · Install and start clean

```powershell
& $adb install -r "<full path to mobile\release\cardiac-mri-workspace-live-YYYYMMDD-HHMMSS.apk>"
& $adb shell am force-stop com.cardiacmri.workspace     # cold start: nothing cached in the app
& $adb logcat -c                                       # empty the log buffer
```

Start the capture **in a second PowerShell window** and leave it running until step 3:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
& $adb logcat -v threadtime -s ReactNativeJS:V | Out-File -Encoding utf8 "S1_L4_logcat_$stamp.txt"
```

## 2 · On the phone

1. Launch **Cardiac MRI Workspace**. The header badge must read **LIVE** (not FIXTURE). If the app opens on
   **CONFIGURATION ERROR**, the APK was built without a backend URL — stop, rebuild.
2. Tap the **Cases** tab (SCR-02).
3. The list loads with the backend's cases. *(If it shows "Something went wrong — The backend could not be
   reached", fix the network first; the screen names the URL it tried.)*
4. Type `CASE_0061` in the search box and tap the row (or **Open CASE_0061 directly**).
5. If asked, choose the run and the prediction variant (either variant is fine for L4; note which).
6. Wait until the viewer shows **slice 45 / 88 (z = 44)** with the MRI image.
7. **Long-press the slice label** (`slice 45 / 88 …`, under the image) for ~1 s → choose **L4 15 + 15**.
   The app now steps ▶ through **15 slices it has never shown** (z 45 → 59), then ◀ back through **the same
   15** (z 58 → 44), 400 ms after each slice is on screen. The controls are locked while it runs; it ends with an
   **"L4 finished"** dialog (about 30–60 s).
   - *Manual fallback (only if the long-press menu fails):* tap **▶** 15 times, waiting for each new slice to
     appear, then **◀** 15 times. The report then has no run markers — keep the log and note "manual".
8. Do **not** touch anything else until the dialog appears.

## 3 · Stop and collect

1. In the capture window press **Ctrl+C**. Check the file is not empty:

   ```powershell
   Select-String -Path "S1_L4_logcat_*.txt" -Pattern "CMW_GESTURE" | Measure-Object | Select-Object Count
   ```

   Expect **31 or more** (`open` + 15 new + 15 revisit, plus anything you did before the run).
2. Copy the backend's request log for the same window from the Mac mini: `requests.jsonl` from the backend data
   directory (`<data-dir>/var/`, added by A3 for this session), and the `uvicorn.log` next to it.
3. Keep, side by side: the logcat file, the APK `.build.txt`, `requests.jsonl`, `uvicorn.log`, the network path
   (`DIRECT`), device and Android version, and the time window.

## 4 · Verdict (on the laptop)

```powershell
node mobile\scripts\l4-report.mjs "S1_L4_logcat_<stamp>.txt"
```

It prints the counts, the new-slice KB (min / median / max), the largest single response, every problem it
found, and `L4 PASS` or `L4 FAIL` (exit 0 / 1). **PASS means all of these:**

| # | Rule | Where it shows |
|---|---|---|
| 1 | **Every request of a slice gesture is per-slice** — only `mri_slice_get`, `prediction_slice_get`, `ground_truth_slice_get`, `analysis_slice_metrics` and the slice's own artifacts (`artifact:mri`, `artifact:mask`). No `case_get`, no geometry, no volume. | `requests[].endpoint` of each `CMW_GESTURE` with `"kind":"slice"` |
| 2 | **Bytes per switch stay within a few hundred KB** — the report fails any slice gesture above 500 KB (one MRI slice PNG is ~0.1–0.3 MB; a 576×576×88 volume is ~29 MB raw). | `bytes_total` |
| 3 | **No endpoint returns the volume** — no single response above 2 MB, from any endpoint. | `requests[].bytes`, `max_request_kb` |
| 4 | **Revisits are cache hits with 0 bytes** — all 15 gestures of the `revisit-15` pass have `"cache_hit":true` and `"bytes_total":0`. | `revisit_cache_hits` = 15 |
| — | The run is complete: 15 new + 15 revisit gestures. A short capture cannot pass. | `l4_new`, `l4_revisit` |

Then **cross-check against the server**, which does not depend on the app's own accounting:
- in `requests.jsonl`, the 15 new-slice gestures appear as per-slice requests (`/cases/CASE_0061/slices/{z}/…`,
  `/analysis-runs/…/slices/{z}/…`, `/artifacts/<sha256>.png`) — **no** request for a whole case volume;
- during the revisit pass the server logged **no request at all** from the phone;
- the byte counts of the artifact downloads match the `artifact:*` sizes in the phone's lines.

If the report and the server log disagree, the server log wins, and the disagreement is a finding to record.

## 5 · What each `CMW_GESTURE` line is

```json
{"seq":7,"kind":"slice","case":"CASE_0061","from":49,"to":50,
 "requests":[{"endpoint":"mri_slice_get","bytes":842,"ms":61,"status":200}, …,
             {"endpoint":"artifact:mri","bytes":187320,"ms":140,"status":200}],
 "cache_hit":false,"bytes_total":192514,"max_request_bytes":187320,"ms":420,"outcome":"shown"}
```

- one line per slice switch, written when that slice is **on screen** (`outcome:"shown"`), or when the switch
  ended in an error state (`outcome` = that state), or was overtaken by the next switch (`"superseded"` — never
  merged into the next one);
- `bytes` is `Content-Length` when the server sends it, otherwise the counted body; the MRI and mask bytes are
  counted exactly because the app fetches them itself (and shows the MRI from those bytes);
- no URL, host or payload is ever written (TC-SEC-003).

`CMW_SLICE` lines in the same file carry the timing of each switch (`ms_to_frame`, `meta_cached`,
`image_seen_before`); they feed TC-PERF-001, not L4.
