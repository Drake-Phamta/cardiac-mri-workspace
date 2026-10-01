# S-1 · L4 — "a slice gesture never triggers a full-volume transfer"

**For:** Phạm Tuấn Anh, phone session on the Galaxy A17 5G (SM-A176B), 2026-10-01 (~19:00).
**Decides:** Spike A L4 — `NFR-PERF-001` limb 2 — and with it `GATE-MOB-01` (leader decision, Day 22).
**Evidence it produces:** the phone's logcat (`CMW_GESTURE` lines), the laptop-side verdict of
`mobile/scripts/l4-report.mjs`, and the backend's request log for the same window.
**Not a measurement of speed.** L4 is about *what* is transferred per gesture, not how fast. Timing lines
(`CMW_SLICE`) are captured at the same time and judged separately (TC-PERF-001).

## L4 PASS means all of these

`node mobile\scripts\l4-report.mjs` checks every row and prints `L4 PASS`, `L4 FAIL` or `L4 CANNOT_JUDGE`
(exit 0 / 1 / 2). Any FAIL row fails L4.

| # | Rule | Where it shows |
|---|---|---|
| R1 | **Every request of a slice gesture is per-slice** — only `mri_slice_get`, `prediction_slice_get`, `ground_truth_slice_get`, `analysis_slice_metrics` and the slice's own artifacts (`artifact:mri`, `artifact:mask`). No `case_get`, no geometry, no volume. | `requests[].endpoint` of each `CMW_GESTURE` with `"kind":"slice"` |
| R2 | **Bytes per switch stay within a few hundred KB** — no slice gesture above 500 KB (one MRI slice PNG is ~0.1–0.3 MB; a 576×576×88 volume is ~29 MB raw). | `bytes_total`; `bytes_per_switch_kb` n / p50 / p95 / max (nearest-rank) |
| R3 | **No endpoint returns the volume** — no single response above 2 MB, and no 200 without a byte count. | `requests[].bytes`, `max_request_kb` |
| R4 | **Nothing volume-like, relative** — no response more than 10× the median of the same endpoint in the capture (and above 32 KB). Catches a mask "volume" (88 × ~2 KB) that fits under R2 and R3. | `endpoint_median_bytes`; the problem line names the ratio |
| R5 | **The new-15 pass measured something** — every one of its gestures went to the network (`"cache_hit":false`), ended `"shown"`, and carries every endpoint of the run's **scope** with more than 0 bytes: always `mri_slice_get` + `artifact:mri`; `ground_truth_slice_get` when the case declares ground truth (+ `artifact:mask` when the GT overlay was ON); `prediction_slice_get` only when the case has an analysis run. A pass where nothing was fetched or the MRI never arrived cannot pass. | each new-15 `CMW_GESTURE`; the `scope:` line |
| R6 | **The run was undisturbed** — inside the L4 passes: no `"superseded"` gesture, no `CMW_STEP_TIMEOUT`, only slice gestures, each ending `"shown"`. | `counts.superseded`, `counts.step_timeouts_in_l4` |
| R7 | **Revisits are cache hits with 0 bytes** — all 15 gestures of the `revisit-15` pass have `"cache_hit":true` and `"bytes_total":0`. | `revisit_cache_hits` = 15 |
| R8 | **The run is complete** — exactly 15 new + 15 revisit gestures. A short capture cannot pass. | `l4_new`, `l4_revisit` |

**Tonight's scope.** The backend has no analysis run ingested yet (`available_run_ids` is empty for every case), so
CASE_0061 opens as a case before its first run: MRI + ground truth, no prediction (decision (b), Day 22). The
report must print `scope: MRI + ground truth (+ mask bytes) - no analysis run for this case: predictions are not
part of this L4`. If it says `overlay off: mask bytes not measured`, the GT overlay was not switched on (§2.7) —
still a valid L4 of the MRI path, but say so in the notes. L4 judges *what* moves per slice gesture; with no run
it says nothing about prediction transfers.

`L4 CANNOT_JUDGE` = the capture has no L4 run markers (the manual fallback in step 2.8): new slices and
revisits cannot be told apart, so R5–R8 are not judged. It is **not** a PASS; rerun with the long-press menu.
The report also prints the reference line *one full volume ≈ slices × median new-slice KB* next to the largest
switch, so the distance from a full-volume transfer is visible.

## Phone budget: 20 minutes, then stop

| Step | Budget |
|---|---|
| Install, cold start, open the case, GT on (§1, §2.1–2.7) | 6 min |
| The L4 run (§2.8) — about 1 min; one rerun allowed, only as §2b says | 4 min |
| Stop, dump, collect (§3) | 5 min |
| Slack | 5 min |

**Abort** — stop, keep what you have, and record `L4 NOT MEASURED — <reason>` in the session notes — when:
the preflight (§0.2) is not `PREFLIGHT PASS`; the app opens on **CONFIGURATION ERROR**; the case list still does
not load 3 minutes after fixing the network; `get-state` is not `device` twice in a row; the L4 run ends without
the "L4 finished" dialog twice; or the 20 minutes are up. Do not "try one more thing" past the budget.

## Session setup — run this block in **both** PowerShell windows

`$adb` is the full path every time — the default `java`/`adb` on `PATH` are not trusted. `$CAP` is an absolute
folder under `mobile\release\`, which is gitignored: the raw capture can never be committed by accident (the
block checks that). The serial is derived from `adb devices -l`, never typed, and never committed.

```powershell
. {
$adb    = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$MOBILE = "<full path of the mobile folder of the checkout the APK was built from - it holds release\ and .env.local>"
$CAP    = "$MOBILE\release\s1_l4_20261001"      # the SAME line in both windows
if (-not (Test-Path "$MOBILE\.env.local")) { throw "STOP: $MOBILE is not the build checkout's mobile folder" }
New-Item -ItemType Directory -Force $CAP | Out-Null
git -C $MOBILE check-ignore -q "$CAP\x.txt"
if ($LASTEXITCODE -ne 0) { throw "STOP: $CAP is not gitignored" }
$found = @(& $adb devices -l | Select-String "model:SM_A176B" | Where-Object { $_.Line -match "\sdevice\s" })
if ($found.Count -ne 1) { throw "STOP: need exactly one authorised SM-A176B on adb; found $($found.Count)" }
$SERIAL = ($found[0].Line -split "\s+")[0]
$state = (& $adb -s $SERIAL get-state).Trim()
if ($state -ne "device") { throw "STOP: get-state says '$state', not 'device'" }
"OK  capture folder $CAP  device pinned"
}
```

Every `adb` call below uses `-s $SERIAL`. If the phone is unplugged and plugged back, run the block again in
both windows.

## 0 · Before you start (T−10 min)

1. **The APK is the right one.** Open the `.apk.build.txt` next to the APK in `$MOBILE\release\` and check:
   `mode live` · `contract 1.1.0` · `git_sha` is the commit you expect · `built_at` is **after** that commit ·
   `source_tree staging copy of committed HEAD` · `api_base_url` is a `sha256:` hash, never the address. **Do
   not publish that hash** (session notes in the repo, PR text): an unsalted SHA-256 of an overlay address can be
   reversed by trying every candidate address (#77 QA N-6) — before committing the sidecar, replace its
   `api_base_url` value with `<redacted>`. To confirm the hash is the Mac mini's URL, hash the value in
   your untracked `mobile\.env.local` **normalised the way the build normalises it** (quotes and spaces
   trimmed, trailing `/` removed) — the block reads the file itself, so the address is never typed or shown:

   ```powershell
   . {
   $line = Get-Content "$MOBILE\.env.local" | Where-Object { $_ -match '^\s*EXPO_PUBLIC_API_BASE_URL\s*=' } | Select-Object -First 1
   $u = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'").Trim().TrimEnd('/')
   "sha256:" + ((([System.Security.Cryptography.SHA256]::Create()).ComputeHash([Text.Encoding]::UTF8.GetBytes($u)) | ForEach-Object { $_.ToString('x2') }) -join '')
   }
   ```

   It must equal `api_base_url` in the `.build.txt` (compare on screen; do not copy the hash into notes). Note the
   APK file name and its `apk_sha256` in your session notes. Tonight's APK:
   `cardiac-mri-workspace-live-20261001-141939.apk`, `git_sha 0bfaba3`, apk_sha256 `3f72f04cd938…4b935c`.
2. **The backend answers.** On the Mac mini, `/health` returns `"status": "ok"` and `"data_ready": true`. (The
   phone-side check is step 2.3 below: the case list loads.) Then, **on the laptop, from the checkout the APK was
   built from** (same `mobile\.env.local`), run the preflight — it drives the backend with the app's own code
   (runtime, V1 model, checksum check, mask decoder) and never prints the address:

   ```powershell
   node --no-warnings "$MOBILE\scripts\preflight-live.mjs" --case CASE_0061
   ```

   `--no-warnings` matters: without it Node 24 prints a `MODULE_TYPELESS_PACKAGE_JSON` warning on stderr that
   contains the absolute path of a file on this PC (#77 QA re-check R-2).

   It must end with `PREFLIGHT PASS`. Tonight P3 reads `run none - MRI + ground truth only` (no run is ingested)
   and P5 `prediction none (no analysis run)`; P4–P6 must still pass. `FAIL P1 … REBUILD` means the backend's
   `contract_version` is not the one
   this APK was built with — the app would answer every screen with `CONTRACT_DRIFT`; stop and rebuild from a
   checkout with the backend's contract. `P6` is a one-slice rehearsal of the L4 rules (per-slice requests only; going
   back costs 0 bytes). Paste only the lines from `preflight:` to `PREFLIGHT …` into your session notes.
3. **The network path is the acceptance path.** Phone on Wi-Fi, ZeroTier connected, `zerotier-cli peers` on the
   Mac mini shows the phone as `DIRECT` (DEMO_STANDARD §8). Write the path down.
4. **Phone:** charged above 50 %, screen timeout ≥ 5 min, no battery saver, USB debugging on and authorised —
   the setup block above already proved one authorised SM-A176B in state `device`.

## 1 · Install and start clean (window 1)

```powershell
& $adb -s $SERIAL install -r "$MOBILE\release\<cardiac-mri-workspace-live-YYYYMMDD-HHMMSS.apk>"   # prints "Success"
& $adb -s $SERIAL shell am force-stop com.cardiacmri.workspace     # cold start: nothing cached in the app
& $adb -s $SERIAL logcat -c                                       # empty the log buffer
```

Start the capture **in window 2** (after its setup block) and leave it running until step 3:

```powershell
& $adb -s $SERIAL logcat -v threadtime -s ReactNativeJS:V | Out-File -Encoding utf8 "$CAP\S1_L4_logcat.txt"
```

## 2 · On the phone

1. Launch **Cardiac MRI Workspace**. The header badge must read **LIVE** (not FIXTURE). If the app opens on
   **CONFIGURATION ERROR**, the APK was built without a backend URL — stop, rebuild.
2. Tap the **Cases** tab (SCR-02).
3. The list loads with the backend's cases. *(If it shows "Something went wrong — The backend could not be
   reached", fix the network first. The screen says `backend http://<configured>` — by design it never shows the
   address. Check, in this order: ZeroTier on the phone, the Mac mini `/health`, and that the `.build.txt` hash
   matches `mobile\.env.local` (§0.1).)*
4. Type `CASE_0061` in the search box and tap the row (or **Open CASE_0061 directly**).
5. Tonight the viewer opens directly: the line under the case id reads **No analysis run for this case - MRI and
   ground truth only**, and there is no run or variant to choose. *(If the backend lists a run by then, the app asks
   for the run and the prediction variant instead — either variant is fine for L4; note which.)*
6. Wait until the viewer shows **slice 45 / 88 (z = 44)** with the MRI image.
7. In **Overlays**, tap **Ground truth: OFF** so it reads **Ground truth: ON** (the cyan outline appears). The GT mask
   bytes are then part of every new slice.
8. **Long-press the slice label** (`slice 45 / 88 …`, under the image) for ~1 s → choose **L4 15 + 15**.
   The app now steps ▶ through **15 slices it has never shown** (z 45 → 59), then ◀ back through **the same
   15** (z 58 → 44), 400 ms after each slice is on screen. The controls are locked while it runs; it ends with an
   **"L4 finished"** dialog (about 30–60 s).
   - *Manual fallback (only if the long-press menu fails):* tap **▶** 15 times, waiting for each new slice to
     appear, then **◀** 15 times. The capture then has no run markers and the report says
     `L4 CANNOT_JUDGE` (manual) — it is evidence of R1–R4 only; note "manual".
9. Do **not** touch anything else until the dialog appears. Do not press **Refresh this slice** or **Retry**
   during the run (a refresh is logged as its own gesture and disturbs R6).

### 2b · The one rerun (only for a disturbed or hung run)

Rerun **only** for one of these reasons:
- the run was disturbed: you touched the screen, a call or notification came in, or the screen locked;
- **"L4 finished" has not appeared about 2 minutes after the long-press** and the controls are still locked. This is
  a known, rare hang (#77 QA re-check R-3): a stale step timer drops the waiter. It can only ever produce a FAIL,
  never a PASS.

Decide **before** you run the report. Never rerun because the verdict says FAIL. A rerun into the same capture fails
R8 (30 new-slice gestures), and a rerun in the same app session fails R5 (the "new" slices are already cached), so do
exactly this:

1. Window 2: **Ctrl+C**, then keep attempt 1 under its own name:

   ```powershell
   Rename-Item "$CAP\S1_L4_logcat.txt" "S1_L4_logcat_attempt1.txt"
   ```

2. Window 1: back up attempt 1, then cold-start the app (empties every cache) and empty the log buffer:

   ```powershell
   & $adb -s $SERIAL logcat -d -v threadtime -s ReactNativeJS:V | Out-File -Encoding utf8 "$CAP\S1_L4_logcat_attempt1_dump.txt"
   & $adb -s $SERIAL shell am force-stop com.cardiacmri.workspace
   & $adb -s $SERIAL logcat -c
   ```

3. Window 2: start the capture for attempt 2:

   ```powershell
   & $adb -s $SERIAL logcat -v threadtime -s ReactNativeJS:V | Out-File -Encoding utf8 "$CAP\S1_L4_logcat_attempt2.txt"
   ```

4. Redo §2.1–2.9 on the phone.
5. In §3 and §4, use `S1_L4_logcat_attempt2.txt` instead of `S1_L4_logcat.txt`, and write the dump to
   `S1_L4_logcat_attempt2_dump.txt`.
6. **Judge attempt 2 only.** Keep both attempt-1 files as evidence and record in the notes why you reran. If attempt 2
   also ends without "L4 finished", stop: `L4 NOT MEASURED — run did not finish twice` (the abort rule above).

## 3 · Stop and collect

1. In window 2 press **Ctrl+C**. Then, in window 1, dump the phone's buffer as a backup of the same window (the
   buffer was emptied in §1, so it holds exactly this session):

   ```powershell
   & $adb -s $SERIAL logcat -d -v threadtime -s ReactNativeJS:V | Out-File -Encoding utf8 "$CAP\S1_L4_logcat_dump.txt"
   Select-String -Path "$CAP\S1_L4_logcat.txt", "$CAP\S1_L4_logcat_dump.txt" -Pattern "CMW_GESTURE" | Group-Object Path | Select-Object Count, Name
   ```

   Expect **31 or more** in each (`open` + 15 new + 15 revisit, plus anything you did before the run). If the
   streamed file has fewer lines than the dump, judge the dump and note it.
2. Copy the backend's request log for the same window from the Mac mini: `requests.jsonl` from the backend data
   directory (`<data-dir>/var/`, added by A3 for this session), and the `uvicorn.log` next to it, into `$CAP`.
3. Keep, side by side in `$CAP`: the logcat files, the APK `.build.txt`, `requests.jsonl`, `uvicorn.log`, the
   network path (`DIRECT`), device and Android version, and the time window. **Before committing any of it**
   (copy out of `$CAP` first), replace the backend's host/IP with `<configured>` in `requests.jsonl` /
   `uvicorn.log` and in screenshots (the app's own lines never contain it).

## 4 · Verdict (on the laptop)

```powershell
node --no-warnings "$MOBILE\scripts\l4-report.mjs" "$CAP\S1_L4_logcat.txt"     # after a rerun: S1_L4_logcat_attempt2.txt
```

It prints the counts, the bytes per new-slice switch (n / p50 / p95 / max, nearest-rank), the full-volume
reference line, the endpoint medians, the largest single response, every problem it found (each tagged with
its rule, R1–R8 in the table at the top), and `L4 PASS`, `L4 FAIL` or `L4 CANNOT_JUDGE`.

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
- `kind` is `slice` for a switch, `open` for the first slice of a case, `variant` for a prediction-variant switch
  and `refresh` for **Refresh this slice** / **Retry**; only `slice` gestures belong in the L4 passes;
- `bytes` is `Content-Length` when the server sends it, otherwise the counted body; the MRI and mask bytes are
  counted exactly because the app fetches them itself (and shows the MRI from those bytes);
- no URL, host or payload is ever written (TC-SEC-003).

`CMW_SLICE` lines in the same file carry the timing of each switch (`ms_to_frame`, `meta_cached`,
`image_seen_before`); they feed TC-PERF-001, not L4. `CMW_STEP_TIMEOUT` marks a scripted step whose slice did not
reach the screen within 6 s.
