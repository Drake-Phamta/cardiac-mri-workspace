# QA re-check: PR #77 at `1332614` · L4 tooling **READY once one doc fix lands** · merge: **fixes, then after GATE-MOB-01**

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | **CHAT E. This is an LLM session (Claude) running under the team leader's account, not a second human reviewer.** |
| Head reviewed | **`1332614`**, which is what `origin/feat/day22-v1-case-explorer-screens` resolved to at 14:27. It is one docs-only commit on top of `f8465b6`. |
| Base | Stacked on `3647f2e` (#80), which is already on main as `c7a37e0`. GitHub reports MERGEABLE / CLEAN, CI **10/10 pass**. |
| Run at | 14:27–14:42 (+07) |
| Resources | One process at a time. node_modules from my earlier `npm ci` was reused, because the package files are unchanged since `36a8731`. No new `npm ci`, no expo export, no Gradle, no device. `preflight.test.mjs` itself starts one short-lived node child at a time. |

## 1. Range-diff

| Comparison | Result |
|---|---|
| My reviewed `440dab1..36a8731` vs `a7b4950..12d4dd8` | The 4 commits I reviewed are **identical**. New: `1030598` (preflight) and `12d4dd8` (blocker fixes). |
| `a7b4950..12d4dd8` vs `3647f2e..f8465b6` | 6 commits **identical**. New: `0bfaba3` (no-run code) and `f8465b6` (docs). |
| `f8465b6..1332614` | `1332614`: README and S1 script only |
| `0bfaba3..1332614` | **Docs only**, so tonight's APK (built at `0bfaba3`, 14:19:39) contains exactly the code reviewed here |
| Contract in the repo | Now **1.1.0** and includes `binary_delivery` and `case_capability`. `case_get` uses `mode`; `case_list` rows use `mode_capability`. That matches SCR-02/03. My earlier finding N-5 (contract not in the repo) is resolved. |

## 2. Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| T | Tests | **PASS** | node 147/147; render 50/50 (logic only); V1 model 88/88; app/core 10/10; CI 10/10 |
| 1 | B-1: device pinned | **PASS** | The setup block takes the serial from `adb devices -l`: exactly one `model:SM_A176B` in state `device`, otherwise STOP. It then checks `get-state` and runs in both windows. All 6 later adb calls use `-s $SERIAL`. I dry-ran it in PS 5.1: a USB plus a wireless entry for the same phone gives 2 matches and STOP; a single entry yields the serial. `check-ignore` returns 0 for `release\…`. |
| 2 | B-2: the judge cannot pass without measuring | **PASS** | I re-ran my probe (`probe_l4b.mjs`), results below. |
| 2s | No-run scope rule | **PASS** | Required per new slice: `mri_slice_get`, `artifact:mri`, `ground_truth_slice_get`, plus `artifact:mask` when GT is on. The report prints *"MRI + ground truth (+ mask bytes) - no analysis run for this case: predictions are not part of this L4"*. A missing GT mask → FAIL. A build that does not log the scope is judged on the MRI only, and the report says so. |
| 3 | B-3: no stale data under an error | **PASS** | I re-ran the render probe with the network down at z=46: scrubber "slice 47 / 88", metric **"Slice Dice: -"**, provenance `MRI - · -` / `Prediction - - · -` / `Ground truth - · -`, SCR-04/05/06 **disabled** with "this slice did not load". Render check L8 covers the same. |
| — | N-1 / N-2 follow-up | **PASS** | Cached "unavailable" answers are cleared when the Explorer mounts. Reproduced: metrics ingested after the first visit still read "unavailable"; **"Refresh this slice"** sends 4 requests and then shows "Slice Dice (RAW): 0.873". Negative caching is limited to `ARTIFACT_NOT_FOUND` / `GROUND_TRUTH_UNAVAILABLE`. Retry clears only negative entries and that slice (render check L9). |
| 4 | `0bfaba3`, the no-run side | **PASS** | Run line "No analysis run for this case - MRI and ground truth only". The prediction chips and toggle are replaced by the reason. Metric "Slice Dice: - (no analysis run…)". SCR-04/05/06 disabled with "needs an analysis run". **0 run-data requests** (render N1–N6 and my probe). `CMW_RUN_START` logs `has_run`, `gt_declared`, `gt_overlay` and `prediction_overlay`. Render N6 runs the full long-press L4 15+15 and l4-report gives **PASS** with the no-run scope. |
| 4p | Preflight, no-run path | **PASS** | I ran `preflight-live.mjs` in-process against a local mock of a contract-1.1.0 backend with a no-run case. P1–P6 all ok: P3 `run none - MRI + ground truth only`, P5 `prediction none (no analysis run)`, GT mask decoded (12,083 px), P6 per-slice requests only and 0 bytes going back. `PREFLIGHT PASS`; the address is never printed. See R-2 for one hygiene catch. |
| 5 | L4 script (`f8465b6`, `1332614`) | **PASS, with one gap** | The PASS table comes first. 20-min budget with abort rules. §2.7 turns GT on, and the expected scope line is stated. Capture goes to the gitignored `$CAP`, with a `logcat -d` backup. The URL hash is for local comparison only, redacted to `<redacted>`. I confirmed that PS 5.1 `Out-File` keeps long lines intact (2.5 k chars). **The gap is the rerun procedure (R-1).** |
| H | Publication hygiene | **PASS** | 1,047 added lines checked. The only IP is `127.0.0.1` (loopback in the preflight test). No URL hash, serial or absolute path. |

**B-2 probe results** (`probe_l4b.mjs`):

| Capture | Verdict |
|---|---|
| Zero requests in the new-15 pass | **FAIL** (R5) |
| MRI never loads (outcome `image-error`, and again with outcome `shown`) | **FAIL** (R5) |
| One 88× mask-volume response | **FAIL** (R4: 70.4× its median) |
| A superseded gesture | **FAIL** (R6) |
| A `CMW_STEP_TIMEOUT` | **FAIL** (R6) |
| Manual fallback, no run markers | **CANNOT_JUDGE** |
| Two L4 runs in one capture | **FAIL** (R8) |
| Clean no-run capture | **PASS** |

The clean capture's output includes per-switch bytes as n/p50/p95/max (nearest-rank) and the reference line "88 × median".

## 3. Findings

### Before 19:00 (doc-only, no rebuild)

**R-1 (BLOCKING for "READY"): there is no rerun procedure, yet the budget allows "one rerun".**
- A rerun into the same capture → R8 FAIL (30 new-15 gestures; probe case 12), plus attempt 1's R6 failures.
- A rerun in the same app session → R5 FAIL, because the "new" slices are already cached.
- Either way the report says **L4 FAIL for reasons that have nothing to do with L4**. A rerun is a real possibility (see R-3).
- **Fix in S1 §2.8 / §3.** If the run is disturbed, or "L4 finished" has not appeared within about 2 min and the controls are still locked:
  1. Ctrl+C the capture and rename it `S1_L4_logcat_attempt1.txt`.
  2. Run `& $adb -s $SERIAL shell am force-stop com.cardiacmri.workspace`, then `& $adb -s $SERIAL logcat -c`.
  3. Restart the capture into `S1_L4_logcat_attempt2.txt` and redo §2.1–2.8. The cold start empties the caches.
  4. Judge attempt 2 only, and keep attempt 1 as evidence.
- **Owner:** A2 / Phạm Tuấn Anh.

**R-2 (hygiene): the preflight output leaks an absolute path.**
- On this PC, Node 24 prints a `MODULE_TYPELESS_PACKAGE_JSON` warning to stderr that contains the absolute path of `maskPng.js` (`file:///C:/Users/<user>/…`).
- §0.2 says "paste its output into your session notes".
- **Fix:** run `node --no-warnings "$MOBILE\scripts\preflight-live.mjs" --case CASE_0061`, or paste only the lines from `preflight:` to `PREFLIGHT …`.
- **Owner:** A2 / Phạm Tuấn Anh.

### Before merge (not tonight: the APK is frozen at `0bfaba3`, and a rebuild would put Gradle on the machine running the GPU job)

**R-3: a stale step timer can hang the scripted run.**
- In `CaseExplorerScreen.js` `stepTo`, the 6 s timer matches on slice number, is never cleared, and resolves its own (already resolved) promise.
- When the new-15 timer for slice *s* fires while the revisit waiter for the same *s* is pending, it:
  - logs a spurious `CMW_STEP_TIMEOUT`;
  - drops the live waiter without resolving it;
  - leaves the run **hung**: no `CMW_RUN_END`, no "L4 finished", controls locked.
- **Reproduced deterministically** in the render harness (`qa_probe3.mjs`): it stops at 16/30 steps with 1/15 revisits, and the judge gives FAIL (R6 + R8). The control run gives PASS.
- It fails safe: it can never produce a PASS. My estimate is about 2–5% per run on the phone (the cached-revisit display window divided by the step cycle). R-1 is the mitigation for tonight.
- **Fix:**
  ```js
  const w = { slice: n, resolve };
  stepWaiter.current = w;
  const t = setTimeout(() => { if (stepWaiter.current === w) { /* … */ } }, 6000);
  // and clearTimeout(t) on resolve
  ```
- **Owner:** A2 / Phạm Tuấn Anh.

### NON-BLOCKING (owner A2 / Phạm Tuấn Anh)

- **N-a. No-run wording.** The no-run run line says "MRI and ground truth only" even for an INFERENCE_REVIEW case with no GT (probe on CASE_0031; the overlays card correctly says there is none). Use `MRI${groundTruthUsable ? ' and ground truth' : ''} only`. It does not affect tonight's case.
- **N-b. R4 only compares against the capture's own median.** If a volume is served on *every* gesture, it sets the median and passes (probe case 10: a 176 KB mask on all 15 → PASS). Tonight this is covered by preflight P5 (the GT mask must decode at slice size) and the server-log cross-check. Durable fix: an absolute per-slice ceiling from geometry (nx·ny·bytes-per-pixel + PNG overhead), with the shape logged in `CMW_RUN_START`.
- **N-c. R5 ignores status.** R5 counts a scoped JSON endpoint with bytes > 0 whatever its status, so a 404 GT counts when the GT overlay is off (probe case 13). Require a 2xx. Tonight GT is on, so `artifact:mask` catches it.
- **N-d. No-run cases.** With a no-run scope, prediction or metrics requests inside a slice gesture are not flagged (probe case 11).
- **N-e. Overlay toggles are not locked.** The overlay toggles and opacity stay active during a scripted run. Turning GT off mid-run causes a false R5 FAIL. Lock them, or log the overlay state per gesture.
- **N-f. Preflight GT coverage.** The preflight checks GT only at z0. Checking z 45–59 would confirm before the run that R5's GT requirement can be met.
- **Carried over, still open:**
  - N-3: requests outside any gesture are never logged.
  - N-6: the URL hash is still unsalted; the docs now say "never publish", real fix Day 23.
  - N-7: the leave-guard hardware-back path is untested.
  - N-8: `useCall` does not abort when `enabled` turns false.
  - N-9: run-line wording while loading.
  - N-10: a missing checksum is accepted unverified.
  - N-12: nested `react-is`.

## 4. VERDICT

- **L4 tooling: READY for 19:00 once R-1 is added to `S1_L4_SCRIPT.md`.** It is doc-only and needs no rebuild; R-2 should go in with it.
  - The judge can no longer pass without measuring: all three earlier QA captures now FAIL.
  - The no-run scope is correct and printed; a manual capture is CANNOT_JUDGE.
  - The remaining risks either fail safe (R-3) or are covered by the preflight and the server-log cross-check (N-b).
- **Merge: MERGE AFTER FIXES — R-1 and R-3 — and not before GATE-MOB-01 is closed.** B-1, B-2 and B-3 are all fixed and verified.

Scratch artefacts are under `…\scratchpad\qa77`: `probe_l4b.mjs`, `repo3\mobile\test\render\qa_probe2.mjs`, `qa_probe3.mjs` and `repo3\mobile\qa_probe_preflight.mjs`. Nothing was deleted, per your no-delete rule. The main checkout was not touched.
