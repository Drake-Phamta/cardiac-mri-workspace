# S-1 device session — Spike B real-mesh levels (B6, B7, B9, B10, B11)

| | |
|---|---|
| Slot | **S-1**, Day 22 (2026-10-01) 19:00, 90 min |
| Device | Samsung Galaxy A17 5G `SM-A176B` (the 09-18 B10/B11 handset). Its serial is read from `adb devices -l` at the session and is **not written into committed files** (public repository) |
| Operator | **Phạm Tuấn Anh** — DR-006a: the only person who touches the phone. Computes no B number. |
| Owner | **Vũ Hùng Anh** — Spike B. Designs, computes and interprets; confirms this session on Day 23. |
| Prepared by | Claude agent A4 under the Day 22 recovery override (leader's account) |
| APK | `spikes/spike_b_3d/mesh/out_real/s1_build/<stamp>/spike_b_s1_<stamp>.apk` + `build_record.json` (gitignored: it contains meshes derived from a patient mask). The exact file and SHA-256 are in the PR description. |
| Case / levels | `CASE_0059` (training case), five levels — see the table below |

## What the session measures

Each level is opened in the S-1 app (React Native 0.86.3 + react-native-webview 13.16.1, the
S7 stack; page and meshes are inside the APK). Per level, one button runs, hands-off:

1. **B10/B11** — three scripted runs of 3 s warm-up + 30 s measurement. The camera moves by
   itself (orbit 0–13 s, pan 13–23 s, zoom 23–33 s); every frame interval is recorded.
2. **B6/B7/B9 automated picks** — 6 fixed camera poses (rotations from above, side and below;
   zoomed in and out). At each pose: 36 precomputed targets on the real surface are tapped
   through the same code path as a finger, plus a 6 × 10 grid over the whole canvas. Every
   resolved pick is sent to the React Native 2D panel, which shows that slice of the mask
   and logs what it displayed (B7). Picks that resolve nothing must not navigate (B9).

Then the operator adds the manual part: rotate/zoom by hand and run the targets at that
camera (B6 after real gestures), tap the surface (B6/B7) and tap empty background (B9).

| Level | Cell (voxels) | Triangles | Offline B5 (PR #66) |
|---:|---:|---:|---|
| L0 | 1 (none) | 61,424 | within ±1 slice |
| L1 | 1.25 | 39,384 | not within (29 slices, 211 no-hits) |
| L2 | 2 | 15,412 | not within |
| L3 | 4 | 3,884 | not within |
| L4 | 8 | 968 | not within |

## Rules fixed BEFORE the session (from the Day 22 override §4 and SPIKE_B_3D/TASK.md)

- **B10** PASS at a level iff every complete scripted run has nearest-rank median ≥ 20 FPS.
- **B11** PASS at a level iff every complete run has longest frame interval ≤ 500 ms and no interval > 500 ms.
- **B6** PASS at a level iff every device pick whose ray meets the mask resolves within ±1 slice of the
  truth (exact traversal of the real mask along the ray the device logged) and none of them resolves nothing.
- **B7** PASS iff every navigation request is displayed in the 2D panel as exactly the requested slice, which
  equals the pick's resolved slice, with no display that has no request.
- **B9** PASS iff no pick that resolves nothing navigates, and no pick whose ray meets no mask voxel navigates.
- **DR-008c** = the fastest level whose offline B5 is within ±1 slice **and** whose B10 and B11 pass.
  "Fastest" = highest nearest-rank median FPS; if two such levels tie (e.g. both at the display cap), the one
  with fewer triangles (more render headroom). On PR #66's evidence only L0 can qualify.
- If L0 fails B10 or B11, no level satisfies both bounds: **`NEGATIVE_RESULT`**, escalate. The ±1 bound is not widened.
- A run is **invalid** (re-run it, never discard silently) if the screen turned off, the app went to the
  background, the phone was touched during a hands-off phase, or the status shows an error.

## 0 · Before 19:00 — workstation (two PowerShell windows)

**Repository root** in this script means the **A4 worktree** whose path is in the PR #73 description
(branch `spike-b/day22-s1-device-session`) — **not** the main clone. Only that worktree holds the
gitignored meshes the extractor needs. Every command below runs from it.

**Block A — paste into BOTH windows** (fill the three `<…>` from the PR #73 description; `$S1` must be a
folder that does not exist yet, outside the repository):

```powershell
. {
$WT  = "<A4 worktree path - PR #73 description>"
$APK = "<APK path - PR #73 description>"
$S1  = "<NEW folder outside the repository, e.g. ...\s1_sessions\s1_20261001_1900>"
Set-Location $WT
if ((git branch --show-current) -ne "spike-b/day22-s1-device-session") { throw "STOP: not the A4 worktree on spike-b/day22-s1-device-session" }
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$REC = Join-Path (Split-Path $APK) "build_record.json"
foreach ($p in @($ADB, $APK, $REC)) { if (-not (Test-Path $p)) { throw "STOP: missing $p" } }
if ((Get-FileHash $APK -Algorithm SHA256).Hash -ne "212dd248614e5131b2cdc39c6eb5196b0cb838570cf363da7fcf9509b989f978") { throw "STOP: not the session APK" }
if ([IO.Path]::GetFullPath($S1).StartsWith([IO.Path]::GetFullPath($WT))) { throw "STOP: `$S1 must be outside the repository" }
"OK  worktree $WT  apk $(Split-Path -Leaf $APK)  session folder $S1"
}
```

**Block B — window 1 only** (creates the session folder, then runs the collector for the whole session;
it prints a line every 100 records):

```powershell
. {
if (Test-Path $S1) { throw "STOP: $S1 already exists - choose a NEW folder" }
New-Item -ItemType Directory $S1 | Out-Null
git rev-parse HEAD | Out-File -Encoding ascii "$S1\repository_commit.txt"
python spikes\spike_b_3d\harness\s1_collector.py --out $S1
}
```

## 1 · Phone preparation (operator)

1. USB cable to the workstation; phone charging. Unlock it.
2. **Developer options → Stay awake: ON** (the screen must not time out during a 33-s hands-off run).
   Turn it OFF again after the session. Do not change brightness / refresh rate during the session.
3. Close other apps. Portrait orientation, auto-rotate off.
4. **Block C — window 2 only** (the serial is derived, never typed, and never committed):

```powershell
. {
if (-not (Test-Path "$S1\repository_commit.txt")) { throw "STOP: window 2 `$S1 is not the folder window 1 created" }
$found = @(& $ADB devices -l | Select-String "model:SM_A176B" | Where-Object { $_.Line -match "\sdevice\s" })
if ($found.Count -ne 1) { throw "STOP: need exactly one authorised SM-A176B on adb; found $($found.Count)" }
$SERIAL = ($found[0].Line -split "\s+")[0]
& $ADB -s $SERIAL install -r $APK                                   # prints "Success"
& $ADB -s $SERIAL reverse tcp:8766 tcp:8766
& $ADB -s $SERIAL shell monkey -p com.cardiacmri.spikebs1 1         # or tap the "Spike B S-1" icon
python spikes\spike_b_3d\harness\s1_session.py start --out $S1 --serial $SERIAL --build-record $REC
}
```

`start` must print **`READY`** and `matches build record: True`. If `start` prints `NOT READY`, fix the
listed item and run `start` again — it only keeps `session_NOT_READY.json`.
**Never re-run `start` after `READY`**: if the session has to be restarted, use a new `$S1` (Block A + B).

> After step a on **L0**, window 2: `(Invoke-RestMethod http://127.0.0.1:8766/health).records` must be **≥ 3**. If it is 0: run the `reverse` line again, tap **L0** again, check again; still 0 → STOP. (The app's `POST ok` line refreshes only when the screen changes.)

## 2 · The levels — phone time ≤ 45 min in total

Budget (suite durations measured on a diagnostic emulator; the phone may be up to ~2× slower on picks):

| Block | What | Phone time |
|---|---|---:|
| Setup | sections 0–1: install, launch, `start` → `READY` | ~6 min |
| **L0** | suite + **all manual steps c–g** — L0 is the only level that can become DR-008c | ~9 min |
| L1, L2, L3, L4 | suite only (steps a–b) | ~3–4 min each, ~15 min |
| Finish | `finish` | ~1 min |
| **Total** | | **~31 min** — the rest is margin for one re-run |

| Step | Operator does | Wait for (status line at the top of the app) | Proves |
|---|---|---|---|
| a | Tap **L*n*** | `Ln loaded · N triangles (expected N)` — the two numbers must be equal | right mesh in the APK |
| b | Tap **RUN SUITE**, then **hands off** (≈ 1 min 45 s of scripted runs, then 1–3 min of automatic picks; L0 is the slowest) | `Ln · B10/B11 run 1 … 2 … 3 complete`, then `Ln SUITE DONE` | B10/B11 ×3, B6/B7/B9 automated |
| c | *(L0 only)* Rotate with one finger and pinch-zoom with two to a **new** view (~10 s). Tap **TARGETS @ CAMERA**, hands off (~30 s) | `target test at your camera done` | B6 after real gestures |
| d | *(L0 only)* Repeat c once from a clearly different view (e.g. zoomed in from below) | same | B6 |
| e | *(L0 only)* The button reads **TAP: SURFACE**. Tap 5 different points ON the mesh (still taps). **Wait until the slice changes before the next tap** | the 2D panel changes slice for each tap | B6/B7 by finger |
| f | *(L0 only)* Tap the button so it reads **TAP: BACKGROUND**. Tap 5 points of EMPTY background (corners, gaps between lobes). **A background tap that changes the slice hit the mesh: note it, then tap a corner instead** | the 2D panel does NOT change; `no-nav` counter rises | B9 by finger |
| g | *(L0 only)* Tap it back to **TAP: SURFACE** | — | — |

Order: **L0 (a–g), L1 (a–b), L2 (a–b), L3 (a–b), L4 (a–b)**. On L1–L4, **ignore the app's manual-step
prompt** after `SUITE DONE` (`now rotate/zoom by hand…`) and go straight to the next level.

**Note the clock time of ANY level re-open, app relaunch, re-run or anomaly** (a stutter, a wrong slice, a
crash). The extractor needs those times to tell repeated records apart. To redo an invalid run, press
**RUN SUITE again on the level that is already loaded** (do not re-open the level unless the stop rules say so).

### If you see → do (stop rules)

| If you see | Do |
|---|---|
| `start` says `matches build record: False` | **STOP.** Wrong APK installed. Do not measure. |
| `Ln loaded` shows the wrong triangle count, or loading takes > 30 s | Tap **L*n*** once more (note the time). Still wrong → skip that level; if it is **L0 → STOP**. |
| A second `ERROR:` status on the same level | Skip the level (note the time); if it is **L0 → STOP**. |
| Phone very hot, or thermal status ≥ 2 (window 2: `& $ADB -s $SERIAL shell dumpsys thermalservice \| Select-String "Thermal Status"`) | Wait 5 min with the screen on; then `finish` (section 3) with what you have. |
| USB disconnected | Reconnect, run `& $ADB -s $SERIAL reverse tcp:8766 tcp:8766` again, continue; note the time. |
| Window 1 stopped counting AND the app's `POST fail` keeps rising | Finish the current level (logcat is the second copy), then `finish`. |
| 45 minutes of phone time reached | Stop after the current level and `finish`. |
| Anything else unexpected (app gone, black WebView, `webview_error`, `level disagreement`, `WebGL2 unavailable`, `load … status`) | **Stop** and note the time; tell the main session before continuing. |

The window-1 collector should keep counting (≈ 600–900 records per level).

## 3 · After L4 (operator, then hand off)

```powershell
python spikes\spike_b_3d\harness\s1_session.py finish --out $S1
```

Then Ctrl-C in window 1. Turn **Stay awake OFF**. Send the folder `$S1` and your list of noted times to
the main session. `finish` prints the payload counts per kind; expect for each level: `s1_loaded`,
`s1_suite_start`, 3 × `s1_frame_probe`, `s1_suite_done`, hundreds of `s1_pick`, matching
`s1_nav_request` / `s1_rn_nav_displayed`; and for L0 also 2 × `s1_target_test_done` and 10 `s1_pick`
with phase `tap`.

**Dry run (diagnostic, not evidence).** The same APK pipeline was run on an Android 14 emulator on
2026-10-01 (L0 and L4 suites, the manual target test, labelled taps): every navigation was displayed as
the requested slice (597/597), background taps never navigated, the HTTP and logcat copies agreed record
for record (2,341), and the device picks equalled a workstation re-intersection of the same rays. The
emulator's frame rates (software rendering) are meaningless and are not reported anywhere.

## 4 · Which record proves what

| Criterion | Records (in `s1_collector.jsonl`; copy in logcat `SPIKE_B_S1` lines) | Key fields |
|---|---|---|
| right mesh | `s1_loaded` | `triangles_parsed` = `triangles_expected`, `obj_sha256_expected`, `metadata.gl.renderer` |
| B10/B11 | `s1_frame_probe` (3 per level) | `probe.raw_frame_intervals_ms` (all ~1,800), `probe.status` |
| B6 | `s1_pick` | `ray_origin_world`, `ray_direction_world`, `resolved_slice`, `outcome`, `phase`, `target` |
| B7 | `s1_nav_request` + `s1_rn_nav_displayed` | same `pick_id`; `requested_slice` = `displayed_slice` |
| B9 | `s1_pick` with `outcome` `no_hit`/`outside_volume`; taps with `operator_label` `background` | `navigation_posted: false`, and no `s1_nav_request` with that `pick_id` |
| app / transport | `s1_rn_app_start`, `s1_rn_open_level`, `s1_nav_ack_timeout` (should be none), `webview_error` (should be none) | |

Quick checks while the session runs (window 2):

```powershell
(Select-String -Path "$S1\s1_collector.jsonl" -Pattern '"kind": "s1_frame_probe"').Count
(Select-String -Path "$S1\s1_collector.jsonl" -Pattern '"kind": "s1_rn_nav_displayed"').Count
(Select-String -Path "$S1\s1_collector.jsonl" -Pattern '"kind": "(webview_error|s1_error|s1_rn_webview_error|s1_rn_nav_error|webview_rejection|s1_nav_ack_timeout)"').Count   # must be 0
```

## 5 · Extraction (after the session — A4 / the owner, not the operator)

```powershell
python spikes\spike_b_3d\harness\s1_extract.py --session $S1
```

It writes `$S1\s1_results.json` (per level: B10/B11 per run recomputed from the raw intervals, B6 against
the mask, B7, B9, cross-check of the HTTP and logcat copies, and of the device hit against a workstation
re-intersection of the same ray) and `$S1\s1_per_pick.csv`. It needs the private LASC package and the
gitignored meshes in `spikes/spike_b_3d/mesh/out_real/CASE_0059/`.

```powershell
python spikes\spike_b_3d\harness\s1_export_evidence.py --session $S1 --out spikes\spike_b_3d\EVIDENCE_RAW\20261001_s1_device
```

**What goes into git afterwards** (`spikes/spike_b_3d/EVIDENCE_RAW/20261001_s1_device/`, written by the
command above, which also refuses to finish if the serial survives anywhere):
`PROVENANCE.md` (from the template below), `session_state.json`, `conditions_before.json`,
`conditions_after.json`, `repository_commit.txt`, `frame_probes.jsonl` (the frame-probe records only:
timings, no anatomy), `s1_results.json`, `s1_per_pick.csv` (slice indices and errors, no coordinates) and
`hashes.json`. **Not** committed: the APK, the meshes, `installed_base.apk`, and the raw pick records /
logcat, which contain surface coordinates of the patient's anatomy — their SHA-256 are in `hashes.json`,
the files stay in `$S1`. The exporter replaces the handset serial with `<A17_SERIAL>` in every copied file
(the repository is public) and records the SHA-256 of the unredacted originals in `hashes.json`.

## 6 · PROVENANCE template (fill in, commit with the evidence)

```markdown
# PROVENANCE — S-1 device session, 2026-10-01

| Role | Person |
|---|---|
| Spike B owner — design, computation, interpretation; confirms on Day 23 | Vũ Hùng Anh |
| Operator — the only person who touched the phone (DR-006a) | Phạm Tuấn Anh |
| Session preparation, extraction under the Day 22 override | Claude agent A4 (leader's account) |
| Reviewer | <name>, <date> — pending at capture time |

| Field | Value |
|---|---|
| Device | Galaxy A17 5G SM-A176B, Android <x> (session_state.json preflight; serial redacted) |
| APK | <file name>, SHA-256 <…>, built <time> from repository commit <…> (build_record.json) |
| Installed APK | SHA-256 <…> — matches the build record: <yes/no> (pulled from the phone by `start`) |
| Assets | build_id <…>; meshes = PR #66 levels, SHA-256 per level in real_mesh_frontier.json |
| Session | `start` <time> · L0 <time> · L1 <time> · L2 <time> · L3 <time> · L4 <time> · `finish` <time> (+07) |
| Conditions | before / after: battery, temperature, thermal status, brightness, refresh rate (conditions_*.json) |
| Stay awake | turned ON at <time>, OFF at <time> |
| Evidence paths | HTTP collector: <n> records · logcat: <n> payloads, <n> incomplete chunks |

## Deviations and re-runs
- <time> L<n>: <what happened, what was redone> (or "none")

## Files (SHA-256 of the committed bytes)
| File | Bytes | SHA-256 |
|---|---:|---|

## Kept outside git (patient-derived)
APK, meshes, installed_base.apk, s1_collector.jsonl, logcat_stream.txt, logcat_dump.txt,
s1_logcat_payloads.json — SHA-256 in hashes.json. (s1_per_pick.csv IS committed: slice indices and
errors only, no coordinates.)
```
