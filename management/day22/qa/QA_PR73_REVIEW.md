# QA review: PR #73, the Spike B S-1 device-session package · verdict **READY AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | CHAT E, independent QA. **I am an LLM session (Claude) running under the team leader's account, not a second human reviewer.** |
| Target | PR #73 `spike-b/day22-s1-device-session`. Head is **`c8da2eb`**: `956ff63` plus one docs-only commit that puts a serial placeholder in `S1_SESSION_SCRIPT.md`. |
| Delta reviewed | **`49330ce..c8da2eb`**: 17 files, +8,660. I did not use the requested `origin/spike-b/day22-real-mesh-frontier...c8da2eb`, which shows 71 files. #73 is not stacked on #66's head `2e4463d`. It sits on rebased copies `2dd075a`/`49330ce` on top of `b606295`. `git range-diff` shows these copies are patch-identical (`=`) to #66's `ae247fa`/`2e4463d`, so the three-dot diff also pulls in main's merges since `f5aa763`. |
| Where I worked | My own worktree, detached at `c8da2eb`. The author's worktree was read only: I read the build record and hashed the APK. Nothing in the repository was modified. |
| Run | about 12:10–12:30 (+07). After 12:17, only lightweight checks, per the coordinator's memory notice. pid 27444 (`loc2.py`) was not mine and had already exited when I checked. |
| Not run | phone, emulator, Gradle, GPU, dataset files. `s1_extract.py` was not run: it has no self-test, no committed sample session, and it needs the private mask. |
| Out of scope | #66 mesh and picking correctness (`exact_first_voxel`, `picking_error.py`); the parallel QA covers it. |

## 1. Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | APK sha256 (Python, streamed) | **PASS** | `212dd248…b989f978`, 42,904,441 B. Equal to the PR body and to `build_record.json`. |
| 1b | Build later than the last code it contains | **PASS** | `956ff63` committed 12:04:58. Assets staged 12:05:28 with `s1_manifest.source_commit = 956ff63`. Build ran 12:05:30–12:06:16 and the APK is stamped 12:06:14. `c8da2eb` (12:10) touches only `S1_SESSION_SCRIPT.md`. |
| 1c | Build commit is on the branch | **PASS** (see N1) | `956ff63 = c8da2eb^` on `origin/spike-b/day22-s1-device-session`. The planned post-session rebase would drop it. |
| 1d | Committed build record matches | **PASS** (nothing committed by design) | The record is gitignored next to the APK. PR body values match it: sha, bytes, times, commit, `build_id b759c642b25fad41`. `tree_clean_for_s1_code` only checks `s1/`, `s1_app/` and `app/`. |
| 1e | APK assets: 5 levels and probe JS | **PASS** | 5 OBJ files whose SHA-256 equal #66's `real_mesh_frontier.json` (`870ca76d`, `1de69dba`, `dcc8e49e`, `0387a832`, `df59a63b`). The manifest has triangles 61,424 / 39,384 / 15,412 / 3,884 / 968, 36 targets and 88 slice PNGs. `s1_bundle.js` is **byte-identical** (`6949f406…`) to a rebuild from the `956ff63` blobs using the committed `bundle_js()`. The bundle embeds `frame_probe_pr44.js`, which is byte-identical to main's `app/performance.js` (`669e556b…`). `index.html` is identical. The App.js, index.js, app.json and package*.json blobs at `956ff63` and at head equal the build-record hashes. The APK manifest contains the package name, `usesCleartextTraffic` and INTERNET, and is not debuggable. |
| 1f | Committed JS test | **PASS** | `node spikes/spike_b_3d/s1/test_s1_core.mjs`: 27 passed. |
| 2a | Script copy-pasteable in PS 5.1 with full paths | **FAIL** (F1) | adb is called by full path, and that path exists on this PC. `$SERIAL` is copied by hand from `adb devices -l`. Problems: "repository root" is never defined, the §0 variables are set once but both windows need them, and `$APK`/`$REC` are placeholders. |
| 2b | Pre-flight | **PASS with notes** (N4) | Model and Android version are recorded but not asserted. USB power is asserted. Battery, thermal status, brightness and the *current* `mRefreshRate` go into `conditions_before`/`_after`. The refresh rate is not pinned. READY prints even if the conditions capture failed. |
| 2c | Install, launch, reverse 8766, collector, capture | **PASS** | `start` pulls the installed APK and hashes it against the build record, clears and streams logcat, and checks collector health. A hash mismatch is **printed, not refused** (F2). |
| 2d | Per-criterion steps | **PASS** (N6) | L0 runs a–g, L1–L4 run a–b. The status strings the script quotes match `App.js`. |
| 2e | PASS/FAIL stated before measuring | **PASS** | The "Rules fixed BEFORE the session" section. |
| 2f | Phone time ≤ 45 min | **PASS** | About 31 min budgeted. My estimate is about 1:45 of probes per level plus picks, which fits even at 2× slower picks. |
| 2g | Failure and abort paths | **FAIL** (F2) | Covered: a crash (relaunch), a dead collector (continue on logcat), an error (redo once). Missing: build-record mismatch, triangle mismatch or stuck loading, a second error after the redo, overheating, USB disconnect, time overrun. |
| 2h | Steps needing judgement the operator can't make | **FAIL** | Listed under F1, F2 and N6. |
| 3a | B6/B7/B9/B10/B11 rules pre-declared and equal to the override | **PASS** | They match override §4 and TASK.md B6–B11. B11 "≤ 500 ms, none over" is the same as TASK.md's "no stall > 500 ms". |
| 3b | DR-008c | **PASS** (wording, N7) | The script picks the fastest level with offline B5 ≤ ±1 **and** B10/B11 passing. The override picks the fastest level with B5 ≤ ±1, then requires B10/B11 at the chosen level. Together with TASK.md:190 (B10/B11 fail at every B5 level → `NEGATIVE_RESULT`) the two are equivalent. Tonight only L0 can qualify. |
| 3c | L1–L4 still measured for B12; DR-008c limited to B5-passing levels | **PASS** | L1–L4 run the suite, giving a 5-level table. The script says "only L0 can qualify". It never names B12. |
| 4a | Extractor self-test or dry run | **NOT RUN** | No self-test and no committed sample exist. Instead I replayed its `key_of`/`merge_paths` logic in stdlib Python with synthetic records, which found F3. |
| 4b | Every number derived from raw files | **PARTIAL** | B10/B11 are recomputed from raw intervals and compared with the device's numbers. B6 truth comes from an exact mask traversal along the logged ray. B7 and B9 come from the records. Done by hand instead: DR-008c, the PROVENANCE counts, times and hashes, the "reduced per-pick table", and redaction. |
| 4c | Extractor writes PROVENANCE with operator Phạm Tuấn Anh and owner Vũ Hùng Anh | **FAIL** (N8) | It writes none. There is a hand-filled template in script §6 (names correct). `session_state.json` has ASCII names. |
| 4d | Record identity is sound | **FAIL** (F3) | `pick_id` restarts on every page load, and the extractor's dict merge overwrites repeats without warning. |
| 5a | No serial, IP, hostname or absolute path in delta files at head | **FAIL (minor)** (N3) | No serial, no hostname, no IP other than 127.0.0.1. Absolute paths: `S1_SESSION_SCRIPT.md:57` `<d>\s1_sessions\…`; `build_release.ps1:22` `<build-root>`; `build_release.ps1:32` `C:\Program Files\Eclipse Adoptium\…`. |
| 5b | Serial in history | **note** (N2) | `956ff63` contains `R5CY931SQYZ`; `c8da2eb` removes it. The same serial is already public in 18 files on main (09-18 B10/B11 evidence, Spike A conditions, RESULT.md, NIGHT_LOG), so nothing new is exposed. |
| 5c | Evidence designed to avoid serial, IP and paths | **FAIL** (F4) | The collector binds loopback only, and `remote_address` is 127.0.0.1 through `adb reverse`, so no LAN IP is logged. But the planned committed files would carry the serial and absolute paths. |
| 5d | No dataset-derived bytes committed | **PASS** | The delta has no .obj, .png or .apk. `.gitignore:113 spikes/**/mesh/out_real/` covers the meshes, the APK and the staged slices (checked with `check-ignore`). |

## 2. Findings

### BLOCKING, before 19:00 (docs only, in `S1_SESSION_SCRIPT.md`; the APK stays the verified `956ff63` build)

**F1. The operator cannot start without guessing where to run and how to set up.**
- The commands only work in the author's worktree, the one on `spike-b/day22-s1-device-session`. The main clone `<repo>` is on `main@8a94172`. There, `spikes\spike_b_3d\harness\s1_collector.py` does not exist, and `repository_commit.txt` would record the wrong commit. The worktree location is only in the PR body.
- Window 1 needs `$S1`, but the script never says to paste the §0 block into both windows.

Fix: one block, marked "paste into BOTH windows":
```powershell
Set-Location "<worktree path from the PR description>"   # NOT the main clone
if ((git branch --show-current) -ne "spike-b/day22-s1-device-session") { throw "wrong checkout" }
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$S1  = "<NEW session folder outside the repo>"
$APK = "<APK path from the PR description>"
$REC = Join-Path (Split-Path $APK) "build_record.json"
if (-not (Test-Path $APK) -or -not (Test-Path $REC)) { throw "APK or build record not found" }
```
In window 2, derive the serial instead of copying it:
```powershell
$SERIAL = ((& $ADB devices -l) | Select-String 'model:SM_A176B' | ForEach-Object { ($_.Line -split '\s+')[0] })
if (@($SERIAL).Count -ne 1) { throw "exactly one SM-A176B" }
```
Owner: **A4**.

**F2. No stop rules for the failures that void the evidence.** Add an "If you see → do" table:

| If you see | Do |
|---|---|
| `matches build record:` is not `True` | **STOP**, do not measure, report |
| Step a: triangle numbers differ, or `loading level n…` for more than 30 s | Retap the level once. Still wrong: skip the level. For L0: STOP |
| ERROR a second time on the same level | Skip it and note the time. For L0: STOP |
| Phone hot, or `& $ADB -s $SERIAL shell dumpsys thermalservice \| Select-String "Thermal Status"` shows ≥ 2 between levels | Wait 5 min with the app idle and note it. Still ≥ 2: run `finish` and stop |
| USB drops | Reconnect, re-run `reverse`, check the app's `POST ok/fail` line, continue the same level, note the time |
| Window-1 count frozen **and** `POST fail` rising | Finish the current level, then `finish`, then report |
| 45 min of phone time reached | Stop after the current level |
| Anything else | Stop, note the time, call Vũ Hùng Anh |

Also: redo an invalid run by tapping **RUN SUITE again on the loaded level**, without re-opening it. Re-open a level or relaunch the app only after an ERROR, and **write down the time** (see F3).

Owner: **A4**.

### BLOCKING before any S-1 number is computed or published (does not block the session)

**F3. `pick_id` collision makes the extractor lose records without warning and report false B7/B9 FAILs.**
- `pickSeq` resets on every WebView load. Re-opening a level or relaunching the app, which is the script's own recovery path, repeats `L0-1`, `L0-2`, …
- `merge_paths` keys records by `(kind, pick_id)` and overwrites repeats. The path cross-check still shows 0 differences.
- Replayed with the extractor's own functions: 2 picks became 1, the B9 code-path test gave **FAIL**, and the B7 pairing gave **FAIL**, on a case where nothing was actually wrong.
- Duplicate displays are also hidden, so B7's `len(d) == 1` check can never fire.

Fix: segment records by page load (`s1_rn_app_start` / `s1_rn_open_level` / `s1_loaded`, using append order in `s1_collector.jsonl` and line order in logcat) and key by `(segment, pick_id)`. Refuse to run on unexplained repeats. The raw data captured tonight is enough for this. Owner: **A4**; re-derived by Vũ Hùng Anh on Day 23.

**F4. The evidence files would publish the serial and absolute machine paths.**
- `s1_results.json` contains `device.serial`, `session_dir`, `per_pick_table.path` and `installed_apk.build_record`.
- `session_state.json` contains `preflight.collector.file` (the collector's `/health` returns the absolute path) and `installed_apk.build_record`.
- The script only redacts the serial, and only in `session_state.json` and `conditions_*.json`. The 09-18 evidence on main uses basenames only.

Fix: write basenames and `<A17_SERIAL>` in the publishable copies (for example a `--publish-dir` that also records the hashes of the originals), plus a pre-commit grep for drive paths and the serial. Owner: **A4**.

### NON-BLOCKING

- **N1. Stacking and provenance.**
  - The PR says "the first two commits disappear once #66 merges". That is not true: they are different SHAs from #66's, so a rebase is needed.
  - That rebase drops `956ff63`, the APK's build commit, from the branch. Tag it first (for example `s1-apk-956ff63`).
  - Owner: A4.
- **N2. Serial policy.** The redaction rule contradicts main, where the serial is already public. Either drop the manual redaction (hand-editing hashed evidence is a risk in itself) or scrub it consistently. Owner: leader and Vũ Hùng Anh.
- **N3. Absolute paths.** Fix the three in committed files (5a). The public PR body also carries the full worktree path of the APK. Owner: A4.
- **N4. Harden `start`.**
  - Assert SM-A176B and Android 16.
  - Print READY only if `conditions_before.json` was written.
  - Record the Samsung refresh-rate ("Motion smoothness") setting.
  - Refuse on a hash mismatch in code. The harness is not in the APK, so this can change.
  - Say "never re-run `start` after READY": it truncates `logcat_stream.txt` while the first adb process is still writing, and clears the device logcat.
  - Say "use a new `$S1`": the collector appends to an existing file.
  - Owner: A4.
- **N5. Operator checks.** The error check misses `s1_rn_webview_error`, `s1_rn_nav_error`, `webview_rejection` and `s1_nav_ack_timeout`. After `start`, tell the operator to read the app's `POST ok ≥ 1 · POST fail 0` line; nothing else shows that the phone-to-PC path works before 100 records arrive. Owner: A4.
- **N6. Operator wording.**
  - After SUITE DONE, the app tells L1–L4 to do the manual steps. The script should say "ignore this on L1–L4".
  - "Wait until the slice changes before the next tap": a second tap before the image loads leaves the first request undisplayed, which counts as a B7 FAIL under the rule.
  - "A background tap that changes the slice hit the mesh: note it and tap a corner."
  - Drop the optional L2 c–g block: it has no reference time, and L2 cannot be DR-008c.
  - Owner: A4.
- **N7. Rules wording.**
  - Say that B6/B7/B9 are judged at the chosen level; L1–L4 will fail B6/B9 by construction and are measured only for B12.
  - Name B12.
  - Define "fastest" as the minimum over complete runs of each run's nearest-rank median (the extractor's `median_fps_min_over_runs`).
  - Require 3 complete runs at the chosen level.
  - Set a minimum number of projected targets in steps c–d.
  - Define how invalid runs are excluded: the operator notes the time, the owner lists the runs, the extractor reports with and without them.
  - Owner: A4, confirmed by Vũ Hùng Anh.
- **N8. Extractor quality.**
  - Add a `--self-test` with a synthetic cube mask, mesh and records, including the re-open case.
  - Generate `PROVENANCE.md` with Phạm Tuấn Anh as operator and Vũ Hùng Anh as owner, taking counts, times and hashes from the files.
  - Compute DR-008c from #66's B5 and the table.
  - No tool produces the "per-pick table reduced to slice indices". Also, `s1_per_pick.csv` holds no coordinates yet is listed as patient-derived; clarify which is meant.
  - Owner: A4.
- **N9. B7 direction.** Only 3D→2D is evidenced. The 2D→3D band (`set_slice`) is drawn but never logged. TASK.md B7 only asks for 3D→2D, so do not claim two-way linkage. Owner: Vũ Hùng Anh.
- **N10. The emulator dry run used an earlier build**, with the same App.js hash and asset `build_id`, not APK `212dd…`. The session APK has never been launched. The script's "same APK pipeline" wording should say so. Residual risk is low: `start`'s installed-hash check and step a catch the obvious failures. Owner: A4.

## 3. Verdict

**READY AFTER FIXES.** Fix **F1 and F2** before 19:00. Both are docs-only (about 25 lines in `S1_SESSION_SCRIPT.md`), need no rebuild, and keep the APK as the verified `956ff63` build.

**F3 and F4** do not affect what is captured tonight, as long as the operator writes down the time of any level re-open or relaunch. They must be fixed before `s1_extract.py` results are computed or any S-1 evidence is committed.

What holds:
- APK provenance end to end: the hash, the page bundle reproduced byte for byte from the git blobs, the probe identical to #44's, and the meshes equal to #66's.
- Rules pre-declared and consistent with the override and TASK.md.
- A realistic 31-min phone budget.
- A loopback-only collector.
- No dataset bytes in git.

I modified nothing in the repository. My scratch scripts are in the session scratchpad under `qa73\`: `apk_check.py`, `bundle_check.py`, `collision_demo.py` and `manifest_check.py`.
