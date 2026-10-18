# A9 · TC-PERF-001 — 30-step cached slice navigation in the product app

**For:** Phạm Tuấn Anh (V1 owner), phone session on the Galaxy A17 5G (SM-A176B), Day 24, 2026-10-03.
**Decides:** `TC-PERF-001` for V1 SCR-03, MRI + ground-truth path (scope below). The written script that
`management/DEMO_STANDARD.md:123` (and D6, `:50`) asks for before a scripted device test.
**Evidence:** three repetitions of the app's own **A9 30-step** run (warm pass, then measured pass), each with its
logcat and `dumpsys meminfo` before and after; `slice-timing-report.mjs` and `l4-report.mjs` output; the backend log.
**Template:** `mobile/S1_L4_SCRIPT.md` (L4, 2026-10-01). "As S1_L4 §x" means: run that section exactly as written.

## 0 · Purpose and pass criteria

> **NFR-PERF-001** — On the target demo device, switching among already available/cached slices shall update the
> visible slice within **200 ms p95** during a 30-step navigation test; normal slice gestures shall not trigger a
> full-volume network transfer. — `docs/specs/v1.0/04_FUNCTIONAL_AND_NONFUNCTIONAL_SPEC.md:102`

> **TC-PERF-001** — 30-step cached slice navigation meets `NFR-PERF-001` p95 ≤ 200 ms and avoids full-volume
> request per gesture. — `docs/specs/v1.0/13_TEST_ACCEPTANCE_AND_TRACEABILITY.md:314`

`DEMO_STANDARD.md`: live on the A17, release build (D1, `:45`); "the statistic the NFR defines … plus p50, over the
defined test, on a release build, over every run — never the best one", from committed raw evidence (D5, `:49`);
SCR-03 "slice switch p95 ≤ 200 ms measured" (`:97`, shown as "the measured p50/p95 from the evidence file", `:137`).

**TC-PERF-001 PASS = T1–T4 hold in each of the 3 repetitions.** Otherwise FAIL — write which check, which repetition.
Report p50 and p95 of every repetition and of the three pooled (`n  93`); none is dropped (D5). Memory: §3.5.

| # | Check | §4 |
|---|---|---|
| T1 | **p95 ≤ 200 ms over the measured pass**: the `A9:measured` row of `slice-timing-report.mjs` reads `n  31` and `p95` ≤ 200 (`ms_to_frame`, nearest-rank, no outlier removal — `mobile/scripts/slice-timing-report.mjs:11-16`) | 4.1 |
| T2 | **Release, live**: no `(DEV build)` row (`DEMO_STANDARD.md:142-143`); both `CMW_RUN_START` lines read `"dev":false,"mode":"live"` | 4.1 |
| T3 | **The measured pass was cached navigation**: its 31 `CMW_GESTURE` lines all read `"cache_hit":true`; the two `CMW_NET_TOTALS` lines have equal `requests`, `bytes`, `unattributed`, `late`; no `CMW_STEP_TIMEOUT` in it | 4.2 |
| T4 | **No full-volume request per gesture**: `l4-report.mjs` shows `"problems": []` (R1–R4 on every slice gesture of the capture) | 4.3 |

**Why 31 samples.** `runA9` (`mobile/src/verticals/v1/CaseExplorerScreen.js:575-579`) runs `[0, ...buildNavSequence(nz)]`
per pass: a jump to slice 0, then Spike A's 30 steps (`mobile/src/verticals/v1/explorer.mjs:117-150`). For CASE_0061
(576 × 576 × 88, the L4 case): z = 1…8, 7…0, 46, 0, 87, 23, 64, 12, 76, 35, 36…41 — 22 distinct slices, 23 with the
opening one. All 31 measured switches are cached, and all count.

**Scope: MRI + ground truth, live.** The backend has 0 analysis runs until `GATE-IMG-01`
(`management/readiness/OPEN_DECISIONS.md:57`) and the N-a / DR-018 Contract 2 work land, so CASE_0061 opens with no
run, as for L4: MRI + GT overlay (keep it **ON**: the hero flow navigates with overlays, `DEMO_STANDARD.md:66-67`), no
prediction — write "… — MRI + ground-truth path; prediction overlay not covered", and rerun with predictions once a run is in.
**Fixture mode is not evidence:** no image store, no gesture log (`mobile/src/runtime/createRuntime.mjs:93-106`) — a
placeholder grid, `CMW_SLICE` `"how":"no-image","mode":"fixture"`, no `CMW_GESTURE`: neither limb can be judged. D1
wants the live product; the fallback is "never an offline product mode" (`:168-169`). Rehearse taps with it only.
**L4 cannot be reused for timing:** its cached `revisit-15` pass is 15 steps of −1, no jump, one run — not the 30 steps.

## Phone budget: 30 minutes, then stop

Install 3 min · three repetitions, ~5 min each, 15 min · one rerun (§3b) 5 min · collect 4 min · slack 3 min. **Abort**
on S1_L4's abort list ("Phone budget"; "L4 finished" read as "A9 finished") or if the APK is not a `main` build with
#86–#88: keep what you have, write `TC-PERF-001 NOT MEASURED — <reason>`; fewer than 3 repetitions: `INCOMPLETE — k of 3`.

## 1 · Preflight (T−15 min; the APK of §2.1 is built)

1. **Session setup** — S1_L4's "Session setup" block in **both** windows, its `$CAP` line replaced by
   `$CAP = "$MOBILE\release\a9_20261003"`. `$MOBILE` is the build checkout's `mobile` folder; `$CAP` is gitignored.
2. **APK, backend, network, phone** — S1_L4 §0.1–§0.4 unchanged; `preflight-live.mjs --case CASE_0061` ends
   `PREFLIGHT PASS` (P3 `run none - MRI + ground truth only` expected). The §0.1 sidecar check also requires
   `git_branch main` and the `git_sha` checked in §2.1.
3. **Device profile** into the notes: `& $adb -s $SERIAL shell getprop ro.build.version.release`,
   `& $adb -s $SERIAL shell dumpsys battery | Select-String "level:|temperature:"` (0.1 °C), **Settings → Display →
   Motion smoothness** (unchanged all session: `ms_to_frame` ends on a frame). No screen recording during the runs.

## 2 · Build and install

1. **Build from `main` after #86, #87, #88 are merged** (#88 adds `CMW_NET_TOTALS`, read by T3), in a clean checkout
   no running job uses, with its own `mobile\.env.local` (only committed HEAD is built, `mobile/scripts/build-release.ps1:162-166`):

   ```powershell
   git -C <repo> switch main; git -C <repo> pull --ff-only
   git -C <repo> grep -c CMW_NET_TOTALS HEAD -- mobile/src/verticals/v1/CaseExplorerScreen.js   # 1 or more
   powershell -ExecutionPolicy Bypass -File <repo>\mobile\scripts\build-release.ps1 -Mode live  # mobile/README.md:105
   ```

   As for L4, note from `<apk>.build.txt` (`build-release.ps1:241-257`): APK file name, full `git_sha`, full
   `apk_sha256`, `built_at`. If #86–#88 are not on `main` by then, a branch build is a labelled **rehearsal**, not evidence.
2. **Install** — S1_L4 §1, first line only (`install -r` → `Success`). Cold start and capture are per repetition.

## 3 · The run — three repetitions

Each repetition starts cold, so its warm pass fetches from an empty cache and the three are independent. Set
`$k = 1` (then 2, then 3) in **both** windows first.

**3.1 Cold start, capture.**

```powershell
& $adb -s $SERIAL shell am force-stop com.cardiacmri.workspace     # window 1: empties every in-app cache
& $adb -s $SERIAL logcat -c                                       # window 1
& $adb -s $SERIAL logcat -v threadtime -s ReactNativeJS:V | Out-File -Encoding utf8 "$CAP\A9_rep${k}_logcat.txt"   # WINDOW 2, running until 3.5
```

**3.2 Open the case — as S1_L4 §2.1–§2.7.** **LIVE** badge → **Cases** → `CASE_0061` → **No analysis run for this
case - MRI and ground truth only** → wait for **slice 45 / 88 (z = 44)** with the MRI → **Ground truth: ON** (cyan
outline; same in every repetition). Touch nothing else.

**3.3 Memory before (M0)** — window 1:
`& $adb -s $SERIAL shell dumpsys meminfo com.cardiacmri.workspace | Out-File -Encoding utf8 "$CAP\A9_rep${k}_meminfo_M0.txt"`

**3.4 Start A9.** **Long-press the slice label** (`slice 45 / 88 …`, under the image) ~1 s (≥ 800 ms,
`mobile/src/verticals/v1/SliceScrubber.js:52`) → **A9 30-step** in "Scripted slice navigation" (not **L4 15 + 15**;
Android may show capitals). The menu is in every build — release or debug, live or fixture — behind no dev switch
(`CaseExplorerScreen.js:581-591`, `:693`). Controls locked, the app runs the **warm** pass (31 steps from slice 45,
fetching the 22 distinct slices once), then straight away the **measured** pass (the same 31 steps, all cached), each
step 350 ms after the previous slice is on screen (`:578`); a slice not on screen after 6 s logs `CMW_STEP_TIMEOUT`
(`:520-532`). It ends with an **"A9 finished"** dialog (~30–60 s). Touch nothing until then.
*If adb drives the phone* (the leader's Claude session): only `shell input swipe <x> <y> <x> <y> 1200` (long-press,
label centre) and `shell input tap <bx> <by>` (**A9 30-step**), never during the run, with coordinates from
`shell uiautomator dump /sdcard/cmw_ui.xml` (pulled into `$CAP`, never committed); PROVENANCE says so (§5).

What the run writes (`CaseExplorerScreen.js:534-564`):

| Line | When | Read by |
|---|---|---|
| `CMW_RUN_START {"run":"A9","pass":"warm"\|"measured","steps":31,"sequence":[…],"nz":88,…,"gt_overlay","dev","mode"}` | start of each pass (`:543-549`) | both reports (pass label), T2 |
| `CMW_SLICE {"slice","ms_to_data","ms_to_image","ms_to_frame",…,"dev","mode"}` | each switch, first frame after the image decoded (`:467-489`) | T1 (`ms_to_frame`) |
| `CMW_GESTURE {…,"requests":[…],"cache_hit","bytes_total",…,"outcome"}` | each switch, when on screen | T3, T4 |
| `CMW_STEP_TIMEOUT {"slice","waited_ms":6000}` | a step not on screen after 6 s | T3 |
| `CMW_RUN_END {"run","pass","steps"}` | end of each pass (`:554`) | both reports |
| `CMW_NET_TOTALS {"run","pass","gestures","requests","bytes","unattributed","late"}` | right after each `CMW_RUN_END` — new in #88 (`:555-559`) | T3 |

**3.5 After "A9 finished"** — window 1, M1 **before** dismissing the dialog (the cache holds every slice of the run):

```powershell
& $adb -s $SERIAL shell dumpsys meminfo com.cardiacmri.workspace | Out-File -Encoding utf8 "$CAP\A9_rep${k}_meminfo_M1.txt"
# now tap OK on the phone and press Ctrl+C in window 2, then:
& $adb -s $SERIAL logcat -d -v threadtime -s ReactNativeJS:V | Out-File -Encoding utf8 "$CAP\A9_rep${k}_logcat_dump.txt"
foreach ($tag in "CMW_SLICE", "CMW_GESTURE", "CMW_RUN_END", "CMW_NET_TOTALS") { "$tag $(@(Select-String -Path "$CAP\A9_rep${k}_logcat.txt" -Pattern $tag).Count)" }
```

Expect `CMW_SLICE 62` (31 + 31), `CMW_GESTURE 63` (opening slice + 62), `CMW_RUN_END 2`, `CMW_NET_TOTALS 2`; if the
streamed file has fewer lines than the dump, judge the dump and note it (S1_L4 §3.1). Next `$k`: back to 3.1.
*Memory only at M0 and M1:* `dumpsys meminfo` runs code in the app's process and would disturb a measured pass (whose
start is not visible from outside). M1 is the run's peak image cache — `management/adr/TECH_STACK_ADR.md:82` measures
it "in V1's TC-PERF-001 runs", adding no requirement. Note `TOTAL PSS`, `Native Heap`, `Graphics` (App Summary).

### 3b · The one rerun

As S1_L4 §2b, "L4" read as "A9": only for a disturbed repetition (touch, call, notification, screen lock) or no
"A9 finished" ~2 min after the long-press — decided **before** any report, never because a number looks bad. Stop
and dump as in 3.5, add `_attempt1` to that attempt's file names (`A9_rep${k}_attempt1_logcat.txt`, …), redo 3.1–3.5
with the same `$k`; commit the attempt files, say why in PROVENANCE. Listed, never pooled. One rerun per session.

## 4 · Judging (on the laptop)

**4.1 Timing — T1, T2.**

```powershell
foreach ($k in 1..3) { node --no-warnings "$MOBILE\scripts\slice-timing-report.mjs" "$CAP\A9_rep${k}_logcat.txt" | Out-File -Encoding utf8 "$CAP\slice_timing_rep${k}.txt" }
Get-Content "$CAP\A9_rep1_logcat.txt", "$CAP\A9_rep2_logcat.txt", "$CAP\A9_rep3_logcat.txt" | Out-File -Encoding utf8 "$CAP\A9_all_reps_logcat.txt"
node --no-warnings "$MOBILE\scripts\slice-timing-report.mjs" "$CAP\A9_all_reps_logcat.txt" | Out-File -Encoding utf8 "$CAP\slice_timing_all_reps.txt"
Get-Content "$CAP\slice_timing_rep1.txt", "$CAP\slice_timing_rep2.txt", "$CAP\slice_timing_rep3.txt", "$CAP\slice_timing_all_reps.txt"
foreach ($k in 1..3) { Select-String -Path "$CAP\A9_rep${k}_logcat.txt" -Pattern "CMW_RUN_START" | ForEach-Object { "rep $k " + ($_.Line -match '"dev":false,"mode":"live"') } }
```

Each repetition prints exactly these two rows; the pooled file the same two with `n  93`:

```
A9:warm                      n  31  min <ms>  p50 <ms>  p95 <ms>  max <ms>  (ms_to_frame)
A9:measured                  n  31  min <ms>  p50 <ms>  p95 <ms>  max <ms>  (ms_to_frame)
```

T1 reads `A9:measured` only (`A9:warm` mixes fetches and revisits: information). `(DEV build)` or `rep k False` fails
T2; a `manual` row is a slice moved outside the run (not TC-PERF-001 samples; note it). Yesterday's capture
(`spikes/spike_a_2d/EVIDENCE_RAW/l4_product_app_20261001T205817+0700/S1_L4_logcat.txt`) gives only `L4:new-15` and
`L4:revisit-15` — **no A9 rows**: the L4 session never started A9.

**4.2 Cached — T3.**

```powershell
foreach ($k in 1..3) {
  $f = "$CAP\A9_rep${k}_logcat.txt"; $in = $false; $n = 0; $miss = 0
  foreach ($l in Get-Content $f) {
    if ($l -match 'CMW_RUN_START \{"run":"A9","pass":"measured"') { $in = $true; continue }
    if ($l -match 'CMW_RUN_END \{"run":"A9","pass":"measured"') { $in = $false; continue }
    if ($in -and $l -match 'CMW_GESTURE ') { $n++; if ($l -notmatch '"cache_hit":true') { $miss++ } }
  }
  "rep $k  measured gestures $n  not cache hits $miss  step timeouts $(@(Select-String -Path $f -Pattern 'CMW_STEP_TIMEOUT').Count)"
  Select-String -Path $f -Pattern "CMW_NET_TOTALS" | ForEach-Object { $_.Line.Substring($_.Line.IndexOf("CMW_NET_TOTALS")) }
}
```

Pass: `measured gestures 31  not cache hits 0  step timeouts 0`; the `"pass":"warm"` and `"pass":"measured"` totals
equal in `requests`, `bytes`, `unattributed`, `late` — they run from app start and include requests no gesture line lists
(`mobile/src/runtime/netLog.mjs:21-26`). A measured-pass step timeout is a FAIL, never an excluded sample; a warm one is noted.

**4.3 No full-volume request — T4.**

```powershell
foreach ($k in 1..3) { node --no-warnings "$MOBILE\scripts\l4-report.mjs" "$CAP\A9_rep${k}_logcat.txt" | Out-File -Encoding utf8 "$CAP\l4_report_rep${k}.txt" }
Select-String -Path "$CAP\l4_report_rep1.txt", "$CAP\l4_report_rep2.txt", "$CAP\l4_report_rep3.txt" -Pattern '"problems": \[\]', '^L4 '
```

The **expected, passing** shape for an A9 capture: `"problems": []`, a `manual: cannot judge - no L4 run markers …`
note, `L4 CANNOT_JUDGE` (exit 2) — checked on this branch on a copy of the L4 capture relabelled A9. The report counts
only L4 markers (`mobile/scripts/l4-report.mjs:123-131`), so A9 reads as a manual capture: R1–R4 (per-slice endpoints
only, ≤ 500 KB per gesture, no response over 2 MB, nothing over 10× its endpoint median) are still checked on every
slice gesture (`:142-169`); R5–R8 and the note's "Rerun with … L4" do not apply. Any R1–R4 line → `L4 FAIL` → T4 fails.

**4.4 Server cross-check** — as S1_L4 §3.2 and §4, copy `requests.jsonl` and `uvicorn.log` from the Mac mini into `$CAP`:

```powershell
python <repo>\backend\scripts\summarize_request_log.py --log "$CAP\requests.jsonl" --since <rep-1 launch, phone time - 7 h, YYYY-MM-DDTHH:MM:SSZ> | Out-File -Encoding utf8 "$CAP\server_summary.txt"
```

No request from the phone inside any measured-pass window (`"pass":"measured"` START → END, phone clock); one switch
per distinct slice per repetition (23). If server and app disagree, the server wins and it is a finding.

**Verdict line:** `TC-PERF-001 PASS — MRI + ground-truth path, CASE_0061, 3/3 repetitions` · `FAIL — <check>,
repetition <k>` · `INCOMPLETE — k of 3` · `NOT MEASURED — <reason>`.

## 5 · Evidence folder and PROVENANCE

Mirror the L4 folder (`spikes/spike_a_2d/EVIDENCE_RAW/l4_product_app_20261001T205817+0700/`). Proposed location, the
leader decides: `management/evidence/TC_PERF_001/a9_product_app_<YYYYMMDDTHHMMSS+0700>/` (rep-1 start, phone clock).

| File | What |
|---|---|
| `A9_rep{1,2,3}_logcat.txt` | each repetition's streamed `ReactNativeJS` log (the app never logs a URL, host or payload) |
| `A9_rep{1,2,3}_meminfo_M0.txt`, `…_M1.txt` | `dumpsys meminfo` before / after each run |
| `slice_timing_rep{1,2,3}.txt`, `slice_timing_all_reps.txt`, `l4_report_rep{1,2,3}.txt`, `server_summary.txt` | §4 output (the server one aggregates only) |
| `apk_build_record.txt`, `preflight.txt` | the APK's `.build.txt` (no backend address since DR-021 rule 3); the lines `preflight:` … `PREFLIGHT PASS` |
| `PROVENANCE.md` | below; plus `A9_rep{k}_attempt1_*` if §3b was used |

Outside git, bytes and SHA-256 (`Get-FileHash`, of the file itself, never a redirected copy) in PROVENANCE:
`requests.jsonl`, `uvicorn.log` (the phone's overlay address), the `_dump.txt` files, `A9_all_reps_logcat.txt`,
`cmw_ui.xml`. Before copying out of `$CAP`, this must print nothing (type the address only in the terminal):

```powershell
Select-String -Path "$CAP\*.txt" -SimpleMatch -Pattern $SERIAL, "<overlay-ip>", $env:USERNAME
```

**PROVENANCE.md** — the L4 file's sections:

| Field | Write |
|---|---|
| Operator | who touched the phone. If the leader's Claude session drove it through `adb` (`input tap`, `input swipe`), say so, as for L4: Phạm Tuấn Anh connected the phone, was present and did not touch it during the runs. Also the V1 owner and the reviewer |
| Device, network | Galaxy A17 5G SM-A176B, Android version, Motion smoothness, battery level and temperature at start; Wi-Fi + ZeroTier `DIRECT`. No serial, no addresses |
| APK | file name, full SHA-256, release (Hermes), full `git_sha` (`main` with #86–#88), `built_at` |
| Backend, preflight | contract version, deployed `main` commit, case count, 0 runs; `PREFLIGHT PASS` (`preflight.txt`) |
| Case and scope | CASE_0061, start slice 45 (z = 44), GT overlay ON, no run → MRI + ground truth; **prediction overlay not covered** |
| Run windows, verdict | per repetition, warm and measured START → END (phone clock, +07); per repetition and pooled: `A9:measured` n / p50 / p95 / max, T3 counts, T4 `problems`; the verdict line |
| Image-cache memory | per repetition M0 → M1: `TOTAL PSS`, `Native Heap`, `Graphics` — recorded only |
| Deviations, files | reruns and why, disturbed attempts, `manual` rows, clocks (phone and server time are the reference; the PC clock ran 66 min slow on 2026-10-01); the file lists above |

## 6 · Troubleshooting

| Symptom | Do |
|---|---|
| Badge **FIXTURE**, **CONFIGURATION ERROR**, or a `(DEV build)` row | wrong APK — not evidence (§0); rebuild live (§2) |
| Long-press does nothing | hold ≥ 1 s on the label text, not the track; the menu needs the slice count and ignores a long-press while a run is in progress (`CaseExplorerScreen.js:535`) |
| No "A9 finished" after ~2 min | §3b — the stale step-timer hang, fixed in `458219d`, which `main` contains |
| `no CMW_SLICE line`, or `A9:measured` n < 31 | wrong file, a cut capture, or a step never on screen: judge the `_dump.txt` if complete, look for `CMW_STEP_TIMEOUT`; n < 31 cannot pass |
| A measured `"cache_hit":false` | the cache lost a slice (image LRU 48, `mobile/src/imaging/imageStore.mjs:49`, > the 23 of a run): T3 FAIL; keep the capture, open an issue |
| p95 > 200 ms | T1 FAIL; do not rerun for it. Note battery temperature and Motion smoothness |
| `dumpsys meminfo`: `No process found` | the app is not running — look for `FATAL` / `RangeError` in the logcat |
| adb loses the device | rerun the S1_L4 setup block in both windows; the repetition in progress is disturbed (§3b) |
