# QA-078: PR #78 V1 SCR-04 Error Inspector · **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. This is an LLM session (Claude Code, Claude Opus 5.5) running under the leader's account. **It is not a second human reviewer.** It is the independent QA pass that `RECOVERY_OVERRIDE_DAY22.md` requires for Day 22 merges. |
| **Target** | PR #78, branch `origin/feat/day22-v1-error-inspector`, head `0f394dcfa02340e8768b82a0658322060de4994c`. I reviewed only its own two commits: `a6b98d0` "feat(v1): SCR-04 Error Inspector" and `0f394dc` "fix(v1): SCR-04 follows the #77 QA rules…". Together they are `git diff 1332614 0f394dc`: 5 files, +807 / −28 (`ErrorInspectorScreen.js`, `errorInspector.mjs`, `test/v1_error.test.mjs`, `test/render/smoke.mjs`, `mobile/README.md`). |
| **Stack** | #78 sits on #77 at `1332614`, which was already QA'd. #77 is now at `4f46b373ec8a2fe699070767c6c53b71aa1a9555`, three commits later (a `CaseExplorerScreen.js` step-timer fix, a new smoke check T1, and `S1_L4_SCRIPT.md`). `origin/main` is at `d6441bc`; it moved from `c7a37e0` today when #79, #63, #75 and #61 merged. On GitHub the PR's base is `main`. |
| **Rules applied** | Contract **1.1.0**: `selection_rules.worst_slice_selection`, `case_capability`, `metric_rules`, and each endpoint's `response_fields`. DR-010, DR-010a option (b), DR-013a. Frozen specs: `10` §3 SCR-04 and §7, `11` §6, and `13` TC-ERR-001…003, TC-MODE-001, TC-MASK-004. #77 QA rules B-3, N-1, N-2. The L4 rule, `NFR-PERF-001` limb 2. |
| **Method** | A detached worktree `<scratch>/qa78_wt` at `0f394dc`. `mobile/node_modules` is a directory junction to the #77 QA's tree; no `npm ci` was run. The fixture bundle was generated into its gitignored path. CPU only, one node process at a time, and no Gradle, emulator, expo export or device. Mutations and probes were applied only in the worktree and reverted; `git diff --quiet` was clean after each one. Nothing was committed, pushed, commented or labelled, and the main checkout was not touched. |
| **Environment** | Windows 11, node 24.14.0, Python 3.12.6, git 2.51.2 |

> **VERDICT: MERGE AFTER FIXES: B-1, B-2, B-3.** After those fixes, merge only after #77 and the GATE-MOB-01 decision, with CI green on the new head.
> - The screen's core is sound:
>   - the worst slices are served in the server's order;
>   - ground-truth gating works;
>   - no stale slice data stays under an error;
>   - the code only reads, never writes.
> - Three things block:
>   - #78 conflicts with #77's current head;
>   - a worst-slice block of another version or rule is shown as the DR-010 worst slice;
>   - the run metrics and the worst-slice list are not checked against the requested prediction variant.
> - Three of five mutations survive the tests (N-1 to N-3). Each costs a few lines of test, so add them in the same fix pass.

---

## 1 · Commands run

| # | Command | Purpose |
|---|---|---|
| R1 | `git fetch` · `git rev-parse` · `git log --oneline origin/main..<branch>` · `git diff --stat 1332614 0f394dc` | Resolve the refs and isolate the two commits under review |
| R2 | `git merge-tree --write-tree --name-only --messages` for these pairs: `4f46b37 0f394dc`, `origin/main 0f394dc`, `origin/main 4f46b37`. Then `git merge-file -p` on the three conflicting blobs, written to `<scratch>/qa78_conflict/` | Check whether #78 applies on #77's head and on main |
| R3 | `python contracts/api/generate_fixture.py --contract contracts/api/contract.json --output app/core/fixtures/.generated/api_bundle.json` | Generate the fixture bundle (gitignored) |
| R4 | In `mobile/`: `node --no-warnings --test --test-concurrency=1 test/*.test.mjs` | Unit tests |
| R5 | In `mobile/`: `node --no-warnings --import ./test/render/hooks.mjs test/render/smoke.mjs` | Render smoke |
| R6 | `node app/core/tests/run_all.mjs` · `node app/verticals/v1_case_explorer/test_case_explorer.mjs` | app/core suites and the V1 model tests |
| R7 | `gh pr checks 78` · `gh run view 36830025431 --json headSha,...` · `gh pr view 78` | Read CI and PR metadata (read-only) |
| R8 | Five source mutations (§2, check 6), each followed by R4 and/or R5 and then reverted | Test strength |
| R9 | `<scratch>/qa78_probe_version.mjs`: calls `readSelection` + `topEntries` on 8 selection blocks. A temporary render probe appended to `smoke.mjs` and then reverted: SCR-04 asks for PROCESSED and the server answers RAW | Evidence for B-2 and B-3 |
| R10 | Scan of the 807 added lines for URLs, IPs, emails, absolute paths, serial-like tokens and long hex | Publication hygiene |

## 2 · Checks

### Check 1 · Tests and merge cleanliness

| Check | Result | Evidence |
|---|---|---|
| 1a `node --test` (mobile) | **PASS** | 156/156; `v1_error.test.mjs` 9/9 (V4a–h, V4x) |
| 1b Render smoke | **PASS** | 66/66 in about 25 s. It includes 16 SCR-04 checks, E4a–E4l. These are logic checks, not device evidence. |
| 1c app/core `run_all.mjs` | **PASS** | 10/10 suites: cache key 11, contract 11, endpoints 16, errors 18, fixture loader 18, load from disk 12, readers 18, screen state 14, transport 14, view math 14 |
| 1d V1 model tests | **PASS** | 88/88 |
| 1e `gh pr checks 78` | **PASS** | 10/10 green. Run `36830025431` (`pull_request`) has headSha `0f394dc`. The render smoke is **not** in CI (N-9). |
| 1f #78 on #77's head `4f46b37` | **FAIL → B-1** | `CONFLICT (content)` in `mobile/test/render/smoke.mjs`, one hunk; details in B-1 |
| 1g #78 on `origin/main` `d6441bc` | **PASS** | Clean: merge base `3647f2e`, only `guardrails.yml` auto-merged. #77's head on main is also clean. `main` has no `mobile/` directory and no change to `app/core`, `app/verticals/v1_case_explorer` or `contracts/api` since the merge base. |

### Check 2 · Contract 1.1.0 conformance

| Check | Result | Evidence |
|---|---|---|
| 2a Every request and every field read exists in 1.1.0 | **PASS** | See the lists below the table. |
| 2b Worst slices come from the server's `worst_slice_selection` in the served order; nothing is ranked on the phone (DR-010) | **PASS** (code) | `readSelection` keeps the served order, and `topEntries` is `slices.slice(0, n)`. The profile places each entry at its slice index, which is a position, not a rank. No `analysis_slice_metrics` ranking exists anywhere. Covered by V4a and E4e; M1b is killed. Test-strength caveat in N-1. |
| 2c A missing block → unavailable with its reason, and no client fallback | **PASS** | See the cases below the table. |
| 2d A block of another version or rule → unavailable | **FAIL → B-2** | Probe R9: `selection_version: dr010-worst-slice/v2`, a missing `selection_version`, and `rule_id: DR-999` all read as `available=true, top=[44,12]`. |
| 2e The served `prediction_variant` matches the request | **FAIL → B-3** | Render probe R9 (B-3) |
| 2f Uses `analysis_slice_error` / `error_reconstruction_get` | **Not used → N-6** | SCR-04 calls neither. The classes are drawn on the phone from the two served masks. |

**2a, requests.**
- Made directly by SCR-04: `case_get` and `analysis_run_metrics` (`?prediction_variant={variant}`).
- Made through the V1 model: `case_get`, `analysis_run_get`, `mri_slice_get`, `prediction_slice_get`, `ground_truth_slice_get` and `analysis_slice_metrics`, plus the artifact bytes from each `content_url`.

**2a, fields read.**
- From `case_get`: `mode`, `ground_truth_available`, `shape`.
- From `analysis_run_metrics`:
  - `metric_state`, `metric_version`, `aggregation_level`, `prediction_variant`, `reference_mask_id`, `prediction_mask_id`;
  - `metric_values.{dice, iou, false_positives, false_negatives, relative_volume_error}`, which equals `metric_rules.case_metric_fields`;
  - `worst_slice_selection.{rule_id, selection_version, slices[].{slice_index, dice, false_positives, false_negatives}}`, which equals `block_fields` / `slice_fields`.
- The units shown match the contract: voxels and RVE % (`metric_rules`), and pixels of the slice (`count_unit`).

**2c, cases.**

| What the server sends | What SCR-04 shows |
|---|---|
| Block is `null` | "The server did not return a worst-slice selection for this run." |
| Key absent | app/core reports `CONTRACT_DRIFT` FATAL_INVALID, shown in the worst-slice card |
| `slices: []` | "No slice has non-empty ground truth, so there is no worst slice to rank." |

There is no fallback ranking in any of these cases. No SCR-04 test covers them; the fixture already has a `no_eligible_slices` scenario.

### Check 3 · States

| Check | Result | Evidence |
|---|---|---|
| 3a No run → SCR-04 cannot be entered | **PASS** | SCR-03 disables the entry with "needs an analysis run" (#80, smoke N3). The registry declares SCR-04 `required: ['caseId','runId','variant']`, and the navigator throws `NavError` when a required param is missing. |
| 3b INFERENCE_REVIEW (INT-12, no GT) → no error view and no per-case metric | **PASS** | `capabilityOf` requires both EVALUATION and `ground_truth_available === true`. Otherwise only the unavailable panel is mounted ("…not zero"). E4a covers the fixture `inference_review` case. In E4b (live) there is no `/metrics` or `/ground-truth` request. |
| 3c Network error → no stale slice data (#77 QA B-3) | **PASS** | `showing = ok && !blocking` hides the previous slice's classes, counts, server comparison, mask ids, slice Dice and profile highlight, and the SCR-05 entry is disabled with its reason. E4k covers this; M2 is killed. |
| 3d Targeted cache clearing on Retry | **PASS against #77's rule** | `retrySlice` does `clearNegative()` + `clearWhere(slice z of this case/run)`, the same code as SCR-03's QA'd `forgetSlice`. Two caveats: it clears *every* slice's negative entries (N-4), and no SCR-04 test pins "no clear-all" (M3 survives, N-2). |
| 3e Loading, empty, stale and refresh | **PASS** (code) | See the list below the table. Only the stale state and Retry have SCR-04 tests. Empty, run-metrics error and PROCESSING are untested; the fixture has `error_case` and `no_eligible_slices` ready. |

**3e, by state.**
- **Loading:**
  - the case shows a full-screen LOADING state;
  - the run metrics show a compact panel in the worst-slice card;
  - the first slice shows the viewer's state panel;
  - later slices keep the displayed slice, labelled with its own z, while the scrubber shows the pending one.
- **Empty:** the text in 2c; slices with no entry are drawn as absent, never as a 0 bar (V4b, E4g).
- **Stale:** E4k.
- **Refresh:** the slice uses `retrySlice` (E4l); the run metrics card and the case each have their own `refetch`.

### Check 4 · Navigation

| Check | Result | Evidence |
|---|---|---|
| 4a SCR-03 → SCR-04 keeps case, run, variant and slice | **PASS** | SCR-03 pushes `{caseId, runId, variant: displayed.variant, sliceIndex: z}`, and SCR-04 reads exactly those params. |
| 4b SCR-04 → back | **PASS with a note → N-8** | See the note below the table. |
| 4c Opening a worst slice goes to exactly that slice | **PASS for in-range entries** | E4h: "Jump to worst" lands on z 52. An out-of-range server index is clamped to the edge slice (N-7). |
| 4d Entry to SCR-05 | **PASS** | E4j pushes `{caseId, runId, sliceIndex: 52, variant: 'RAW', view: 'error'}`, and the entry is disabled while the slice did not load (E4k). |

**4b, what happens on back.**
- The navigator mounts only the top screen, so SCR-03 remounts with `{caseId}`.
- The variant comes back from the remembered variant.
- The run comes back only when it is the case's only run.
- The slice resets.
- This is SCR-03 and shell code, not #78's, and there is no round-trip test.

### Check 5 · Immutability and safety

| Check | Result | Evidence |
|---|---|---|
| 5a No mutation of prediction or GT | **PASS** | SCR-04 makes GET calls only: `case_get`, `analysis_run_metrics`, and the V1 model's GETs. No write endpoint is referenced. `disagreementRuns` only reads its inputs, and every result object is frozen. |
| 5b No request outside per-slice scope during slice gestures (L4, NFR-PERF-001 limb 2) | **PASS** (code) | See the path below the table. It is untested on SCR-04 (M4 survives, N-3). |

**5b, the request path.**
- A slice gesture runs `goTo` → `model.goToSlice` → `loadSlice`.
- It asks only for MRI, prediction, ground truth and slice metrics for slice z, plus their artifact bytes.
- The run-level calls are `useCall` on mount, and their params are compared by value.

### Check 6 · Test strength

Each mutation was reverted, and the worktree was confirmed clean.

| Mutation | Result | Evidence |
|---|---|---|
| **M1b** `topEntries` re-orders by slice index, without `.sort(` | **PASS (killed)** | Unit 155/156 (V4a fails). Smoke: E4e ×2, E4h, E4j and E4k ×2 fail, then the run aborts. |
| **M2** `showing = ok`, so the previous slice's data shows under an error | **PASS (killed)** | Smoke: E4k fails, 65/66 |
| **M1a** `topEntries` re-derives DR-010 on the phone with a selection-pick loop, no `.sort(` | **FAIL (survived) → N-1** | 156/156 + 66/66 |
| **M3** Retry calls `client.clear()` instead of `clearNegative` + `clearWhere` | **FAIL (survived) → N-2** | 66/66 |
| **M4** Every slice gesture also refetches `analysis_run_metrics` | **FAIL (survived) → N-3** | 66/66 |

### Check 7 · Publication hygiene of the added lines

| Check | Result | Evidence |
|---|---|---|
| No absolute paths, IPs, real URLs, serials or emails | **PASS** | 807 added lines. The only URL is `http://backend.invalid:8000`; `.invalid` is reserved by RFC 2606 as a placeholder. No IP, email, absolute path, serial-like token or long hex. The only person named is the block owner, already public across the repo. |

## 3 · Findings

### BLOCKING

**B-1 · BLOCKING (merge mechanics). #78 conflicts with #77's current head `4f46b37`.**
- **Evidence.** `git merge-tree 4f46b37 0f394dc` reports `CONFLICT (content)` in `mobile/test/render/smoke.mjs`, in one hunk.
- **Cause.** Both branches append a new `// ---- 4.` section just before `console.log = origLog;`:
  - #77's "4. a stale step timer cannot hang the scripted run (#77 QA R-3)" (check T1, which uses #77's new `noRunBackend()`);
  - #78's "4. SCR-04 Error Inspector" (E4a–E4l, which uses #78's new `fakeBackend()` and `liveRuntime()`).
- **What merges cleanly.** The two helper refactors land in separate hunks and auto-merge. No other file overlaps.
- **Status today.** #78 merges cleanly onto main as it stands. Once #77 merges, it will not.
- **Fix (leader session, agent A2).**
  1. Rebase `a6b98d0` and `0f394dc` onto #77's final head.
  2. Resolve the conflict by keeping both sections and renumbering one of them to 5.
  3. Rerun `node --test` (expect 156) and the render smoke (expect 66 + T1 = 67).
  4. Get CI green on the new head.

**B-2 · BLOCKING (contract 1.1.0, DR-010). A worst-slice block of another version or rule is shown as the DR-010 worst slice.**
- **The rule.** Contract 1.1.0 fixes `rule_id: DR-010` and `selection_version: dr010-worst-slice/v1`. The brief requires that "a missing or other-version block → unavailable with its reason".
- **What happens today.** Neither `readSelection` (app/core) nor SCR-04 checks either value. Probe R9 shows that `dr010-worst-slice/v2`, a missing version, and `rule_id: DR-999` all read as `available=true`. SCR-04 then lists those slices under "Worst slices (server, DR-010)" with "Jump to worst".
- **Why it matters.** A ranking under any other rule would be presented as DR-010's answer. That is the "two answers to one clinical question" DR-010 exists to prevent.
- **Fix (leader session, agent A2; Phạm Tuấn Anh confirms the rule).**
  - Add a gate in `errorInspector.mjs`. When `ruleId` or `selectionVersion` differs from `runtime.contract.selection_rules.worst_slice_selection`, return unavailable with a reason such as `SELECTION_VERSION_UNSUPPORTED` or `SELECTION_RULE_UNSUPPORTED`. Read the expected values from the contract; do not hard-code them.
  - The card should say which version was served and that it is not shown. The profile follows the same gate.
  - There is still no fallback ranking.
  - Add unit tests for v2, a missing version and another rule, plus one render check.
  - Moving the gate into app/core `readSelection` can come later.

**B-3 · BLOCKING (`11` §6, TC-MASK-004). The run metrics and the worst-slice list are not checked against the requested prediction variant.**
- **Evidence (render probe R9).** SCR-04 was opened with variant PROCESSED; the fake server answers `analysis_run_metrics?prediction_variant=PROCESSED` with RAW.
  - The viewer correctly refuses the slice: "Asked for PROCESSED, served RAW; a substituted variant is not shown."
  - The same screen still shows RAW's worst slices ("Jump to worst · z 52 …", "#2 · z 44 …").
  - It also shows RAW's case metrics ("Dice 0.810 · IoU 0.680", with "RAW · metric m1" in small text).
  - All of this sits under the header "Prediction PROCESSED vs ground truth".
- **Also in fixture mode.** The fixture bundle's `analysis_run_metrics` answers `prediction_variant: "RAW"` to every request, so SCR-04 shows the same thing in fixture mode with PROCESSED.
- **Root cause.** `readRunMetrics` reads `prediction_variant` but nothing compares it with the request. The V1 model applies exactly this check to predictions (#77 smoke S6).
- **Fix (leader session, agent A2).** When the served variant differs from the requested one, treat the run metrics as a variant mismatch, using the same state the model uses. In that state, show:
  - no case metrics;
  - no worst-slice list;
  - no profile;
  - no comparison with the server.

  Add a unit test and a render check.

### NON-BLOCKING

**N-1 · Test strength: a client-side re-derivation of DR-010 goes undetected (M1a survived).**
- Every block in the tests is served already in DR-010 order: the unit `block`, the smoke's fake backend and the generated fixture.
- So "kept the server's order" and "re-ranked by DR-010 on the phone" give the same output. The only guard is V4x's search for `.sort(` / `.toSorted(`.
- **Fix:** serve one block in an order no DR-010 re-rank would produce, for example z 60 (Dice 0.5) before z 44 (0.25), and assert that `topEntries` and E4e keep it. Owner: leader session.

**N-2 · Test strength: targeted cache clearing is not tested on SCR-04 (M3 survived).**
- E4l only checks that Retry asks for slice 53, and a clear-all does that too.
- **Fix:** after Retry, step back to z 52 and assert 0 requests, as SCR-03's L9 does. Owner: leader session.

**N-3 · Test strength: the L4 scope is not tested on SCR-04 (M4 survived).**
- **Fix:** after E4h's jump and a ◀/▶ step, assert that every request since the gesture is `/slices/<z>/` or `/api/v1/artifacts/`, and that the `CMW_GESTURE` line lists only per-slice endpoints. Owner: leader session.

**N-4 · Retry clears every slice's cached "unavailable" answers, not only the retried slice's.**
- This is the same as SCR-03 at #77 (QA'd N-2), so the two screens agree.
- The brief's wording is stricter: "only that slice's negative cache".
- **If the stricter rule is intended:** remove `clearNegative()` from Retry in both screens and keep it on open. `clearWhere` already drops that slice's negative entries.
- Owners: Phạm Tuấn Anh decides the rule; the leader session changes the code in both screens.

**N-5 · The PR text overclaims the GT-unavailable gate.**
- **The claim** (in `a6b98d0` and the PR body): "a run whose metrics answer GROUND_TRUTH_UNAVAILABLE gets a clear unavailable state … and asks the server for no ground-truth-dependent data".
- **What the code does.** Only the case capability gates.
- **The gap.** If `analysis_run_metrics` answers `GROUND_TRUTH_UNAVAILABLE` for an EVALUATION case, the slice view still requests ground truth and slice metrics and draws the disagreement.
- **Fix:** gate ErrorView on that answer too, or correct the text. Owner: leader session.

**N-6 · SCR-04 uses neither `analysis_slice_error` nor `error_reconstruction_get`.**
- **What it does instead.** TP/FP/FN come from boolean operations on the two checksum-verified masks the server served. They are compared with the server's FP/FN from the worst-slice list.
- **Why this is defensible.** FR-ERR-001 says "the system shall derive". `11` §6 requires that the client *can obtain* error data, not that it must use it. The 3D error view belongs to SCR-05 (V2).
- **Gaps:**
  - Slices outside the worst-slice list (FP-only and ineligible slices) get no server cross-check.
  - The run's `reference_mask_id` / `prediction_mask_id` are read but never compared with the ids of the masks drawn (TC-ERR-002).
- **Fix:**
  - Record the choice ("client-drawn classes, server numbers" versus the versioned error artifact) in the PR or under DR-013a. Owner: Phạm Tuấn Anh.
  - Compare the run's ids with `groundTruthRef` / `predictionRef.artifactId` and flag any mismatch. Owner: leader session.

**N-7 · An out-of-range worst entry opens a different slice.**
- `goTo()` clamps the index to `[0, total−1]`.
- So a server entry for z 90 in an 88-slice volume is listed as "z 90 (slice 91)" but opens z 87. The profile only shows a warning.
- **Fix:** list such entries as invalid and not tappable, and never clamp a slice the server named. Owner: leader session.

**N-8 · Back from SCR-04 loses a hand-picked run and the slice.**
- SCR-03 remounts with `{caseId}`. The case and the remembered variant come back, but the run is asked again on a multi-run case and the slice resets.
- This is SCR-03 (#77) and shell code, and no round-trip test covers it.
- **Fix:** carry `runId`, `variant` and `sliceIndex` in SCR-03's stack entry, and add a round-trip render check. Owner: Phạm Tuấn Anh / leader session.

**N-9 · The render smoke is not in CI.**
- Every SCR-04 screen rule (E4a–E4l: GT gating, no stale data, Retry scope) runs only locally; CI runs only `node --test`.
- M2, the stale-data regression, is caught only by the smoke.
- **Fix:** add the smoke as a guardrails job. It needs `node_modules` in CI. Owner: leader session.

**N-10 · app/core `readSelection` (outside this PR) has three loose ends.**
- It reads a non-contract alias, `slice_selection`.
- It maps a malformed (non-array) `slices` to `SELECTION_NO_ELIGIBLE_SLICES`. SCR-04 would then say "No slice has non-empty ground truth", which is the wrong reason.
- SCR-04's profile text for an empty selection says "the server returned no per-slice selection", which does not match that state.
- **Fix:** drop the alias for 1.1.0, return a distinct reason for a malformed block, and align the text. Owner: leader session (app/core).

**N-11 · Minor.**
- `case_get` is requested twice on open: once by `useCall` and once by `model.open`. This happens on open only, not during slice gestures.
- The header comment says "revalidated by the owner on D23" before that has happened. Reword it to "to be revalidated".

## 4 · Scratch and cleanup note

- Logs are in `<scratch>/qa78_*`:
  - test runs: `unit_run1`, `smoke_run1`, `core_run1`, `v1model_run1`;
  - mutations: `m1a_*`, `m1b_*`, `m2_smoke`, `m3_smoke`, `m4_smoke`;
  - probes: `probe_version.mjs`, `probe_variant.txt`;
  - the conflict blobs: `qa78_conflict/`.
- The worktree is `<scratch>/qa78_wt`. Nothing was deleted.
- **Hazard when removing the worktree.** `qa78_wt/mobile/node_modules` is a **junction** to the shared `node_modules` under `<scratch>/qa77/`.
  1. Remove the link first with `cmd /c rmdir <scratch>\qa78_wt\mobile\node_modules`. This removes only the link.
  2. Then run `git -C <repo> worktree remove`.

  A recursive delete in PowerShell 5.1 can follow the junction and empty the shared tree.

**VERDICT: MERGE AFTER FIXES.**
1. **B-1:** rebase onto #77's final head and resolve the `smoke.mjs` conflict.
2. **B-2:** add the rule and version gate on `worst_slice_selection`, with tests.
3. **B-3:** check the served `prediction_variant` on `analysis_run_metrics`, with tests.
4. Recommended in the same pass: N-1, N-2 and N-3.

Then merge after #77 and the GATE-MOB-01 decision, with CI green on the new head. A re-QA of the fix delta only is enough.
