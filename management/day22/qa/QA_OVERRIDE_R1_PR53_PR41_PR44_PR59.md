# CHAT E: independent QA, Day 22 (2026-10-01), recovery override

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

**Verdict: all four PRs are DO NOT MERGE as they stand.** #41 and #44 each need a one-file text fix and are otherwise clean. #53 and #59 have real defects that I reproduced.

I am CHAT E, an LLM QA session (Claude), not a human reviewer. I did no fetch, checkout, commit, push, merge, approve or GitHub comment. Every test ran on trees built with `git merge-tree --write-tree` → `git archive -o` → `tar -x` under `<qa-scratch>\`. All hashes were computed on git blob bytes (`git cat-file blob` / `git show` read in Python), never on PowerShell-redirected copies.

**Main moved twice while I worked.** The main session fetched and also switched the shared checkout to `main`. Sequence: 665b5b0 → 771ddb3 (PR #33) → **f5aa763 (PR #35, the Path A split)**.
- My tests ran on merges with 771ddb3.
- Against f5aa763 all four PRs still merge cleanly. Each merged tree differs from the one I tested only in #35's 7 files (split manifest, `tools/dataset_split/*`, two SPIKE_D docs), and none of the #53/#41/#44 tests read those files.
- PR heads were unchanged throughout: #53 ea5bf32, #41 f853b59, #44 62d39de, #59 b40b44e.

---

## PR #53: V1 SCR-03 Case Explorer (ea5bf32, no review)

**Checks run (merge with main is clean, no conflicts):**
- Bundle per the `app/README.md` one-liner: as written it fails on a fresh checkout (`FileNotFoundError`, because `.generated/` does not exist). This is already on main; CI does `mkdir -p` first. After `mkdir` it generated fine.
- `node app/core/tests/run_all.mjs` → ALL PASS 10/10.
- `node app/verticals/v1_case_explorer/test_case_explorer.mjs` → PASS, 29 ok lines (the PR body says 25).
- V4 test → 4/4.
- `python contracts/api/test_api_contract.py` → PASS, 12 cases, 0 schema errors.
- Framework-neutral rules: OK. The model imports only `../../core/index.mjs`.
- The guardrails step is correctly placed in `app-core`, after the bundle-generation step.
- I probed the model with `qa_override\probe_v1.mjs` and `probe_v1b.mjs`.

**BLOCKING (each one reproduced by a probe):**
1. **Silent variant relabel** (`index.mjs` 252-256).
   - While `setVariant('PROCESSED')` is fetching, the snapshot says `variant=PROCESSED`, but `view` is still the old SUCCESS whose `data.prediction` / `predictionRef` is the RAW mask (cacheKey `…|RAW|…`).
   - After the switch fails, the RAW `predictionRef` stays next to `variant=PROCESSED`.
   - Fix: call `set(loading(), {variant: next, predictionRef: null, metrics: null})` before `loadSlice`.
2. **A missing served variant is filled in from the request** (212, 112).
   - Core validation only checks that the key exists, so a response with `prediction_variant: null` passes it and skips the guard.
   - Result: SUCCESS, with the bytes cached under a `…|PROCESSED|…` key. `11` §11 rule 6 forbids exactly this inference.
   - Related race: `goToSlice(10)` (slow) followed by `goToSlice(11)` (fast) ends with the snapshot on slice 10.
   - Fix: capture `requested = current.variant` at the start of `loadSlice`. Block whenever `served !== requested`, including null. Build the cache key from the served variant. Drop superseded responses using a request counter.
3. **Stale image/prediction/metrics refs survive into error snapshots** (every non-SUCCESS `set()`).
   - Probe: `goToSlice(45)` with the MRI request failing gives FATAL_INVALID with `sliceIndex` 45, but `imageRef`, `predictionRef` and `metrics` are still slice 44's.
   - That is the "stale mask under an error banner" that `screenState.mjs` exists to prevent.
   - Fix: null those three fields on every non-SUCCESS transition.
4. **Run status is not whitelisted** (160-166).
   - The generated `run_failed` scenario, and also `IN_PROGRESS` and `CANCELLED`, all open as SUCCESS with the prediction overlay shown and `canEnter3D=true`.
   - A run whose `case_id` differs from the opened case is accepted.
   - Fix: SUCCEEDED → continue; QUEUED/RUNNING → PROCESSING; FAILED → `stateForError(contract,'ANALYSIS_FAILED')` showing `failure_code`/`failure_reason`; anything else → `fatalInvalid` with CONTRACT_DRIFT. Add a test that uses `run_failed`.
5. **Layers and flags are offered without data** (143-148, 240).
   - `REVIEWED_MASK` is always available and can be switched on with no reviewed-mask data.
   - `canEnter3D` is always true; `reconstruction_ids` is ignored.
   - This contradicts the PR's "each layer only when its own data exists" and README rule 5.
   - Fix: keep REVIEWED_MASK unavailable until a reviewed mask is actually fetched; derive `canEnter3D` from a SUCCEEDED run with non-empty `reconstruction_ids`.

**NON-BLOCKING:**
- The V1-9 guard reuses VALIDATION_ERROR, which is not in `prediction_slice_get`'s error list. The UI would say "The request failed contract validation.", and the real explanation is stored in `metrics.reason`. Use `fatalInvalid` with a client code and a clear message.
- `REVIEWED` is accepted and sent as `prediction_slice_get?variant=REVIEWED`, but the contract offers only raw or processed there. It fails safe, but should be rejected or routed to `reviewed_mask_slice_get`. The variant vocabulary is not frozen in `contract.json` (spec 11 uses RAW_PREDICTION and raw|processed), so this needs a Decision Request.
- Ground truth:
  - The model never calls `ground_truth_slice_get`.
  - V1-3's EMPTY_UNAVAILABLE checks call core directly, not the model.
  - On the default fixture the screen shows metric NOT_APPLICABLE (an empty-slice claim about ground truth) while `groundTruthAvailable` is false.
- PROCESSING can only be left by re-opening: `refresh()` and `goToSlice()` never re-read `analysis_run_get`, and they turn the screen into SUCCESS while `runStatus` is still RUNNING.
- There are no checks on geometry validation status, index convention, or MRI-vs-prediction geometry (partly a core gap).
- The run-to-case check can't be tested until the generator emits consistent ids. Today it gives `case_id: "CASE_ID_0043"` and `available_run_ids: ["AVAILABLE_RUN_IDS_0043"]`; a follow-up on #50.
- Housekeeping:
  - The tests don't use the `run_not_succeeded` / `run_failed` scenarios that 22876b0 added.
  - The guardrails comment says "#51 adds V4's next to this one", but V4 runs inside the core step.
  - The PR body's first generator finding is already fixed on main by 22876b0.

**Verdict: DO NOT MERGE.** Fix B1–B5 (about 30 lines in `index.mjs`) and add tests for `run_failed`, a null served variant, an error after a success, and the mid-switch snapshot; then merge.

---

## PR #41: SPIKE_A S6 (f853b59)

**Checks run:**
- Topology: f853b59 is a merge of 741f826 (the approved head) and 21b3e87 (main at the time). `git log --no-merges 741f826..f853b59 ^f853b59^2` is empty, so there are no other branch changes.
- `git merge-tree --write-tree 741f826 21b3e87` gives c2abe0e with one conflict, RESULT.md. `git diff c2abe0e f853b59` touches only RESULT.md. SPIKE_PHASE_STATE.yaml, README.md and App.js equal git's automatic merge.
- Table rows compared on blob bytes (`check_pr41_rows.py`):
  - A3–A8, A10 and A11 are byte-identical to main.
  - A9 is byte-identical to the branch.
  - A1, A2 and A12 are identical on both sides.
  - The file is LF with no BOM.
- I recomputed nearest-rank p95 from the three raw S6 JSON files: 98.72, 51.05 (in-window), 50.84 (in-window) and 102.73 ms (miss). All match the stored values and the A9 row.
- The merge with current main is clean. In the merged App.js, `POLICY_NONE` only gates the hidden warm-cache mounts and the A9 button; the S5/S8 viewport still renders `SLICES[z]`, so there is no functional clash.
- `node spikes/spike_a_2d/harness/test_brush.mjs`, `test_viewer_math.mjs` and `test_persist.mjs` all pass.
- `management/PROJECT_STATE.yaml` and `management/spikes/SPIKE_PHASE_STATE.yaml` both parse (PyYAML 6.0.3), with no duplicate keys.

**BLOCKING:**
1. The `stage_s6_2026_09_17` entry this PR adds to `management/spikes/SPIKE_PHASE_STATE.yaml` (lines 312-337) still makes the claims the reviewer asked to withdraw:
   - line 313-314: "one build, three runs, the cache policy the only variable";
   - line 328: "-38% bitmaps and -19% PSS" presented as a policy effect;
   - line 333: the confound was "removed by a rebuild".

   741f826 corrected only RESULT.md and README.md. scalliontor's request #2 was to revise *every* such claim, and both approvals missed this one. Fix: reword it to match RESULT.md §S6. Three runs on two release builds; run 3 came after a rebuild to POLICY_NONE; the all-vs-window comparison is an observation across builds, not a cache-policy effect; build commits were not recorded (a gap).

**NON-BLOCKING:** Some prose auto-merged from main is now stale.
- Header lines 10-11 say #41 and #49 are still waiting for APPROVE; #49 is merged.
- The failure-condition row (473) and next-steps item 3 (485) cite A9 = 50.23 ms (the 16-slice run) instead of the S6 figures of 98.72 / 102.73 ms.
- The App.js comment near line 1177 still says "One build, two policies…".

**Verdict: DO NOT MERGE until that YAML entry is corrected (text only; the table resolution itself is faithful), then MERGE.**

---

## PR #44: Spike B B10/B11 (62d39de)

**Trung's requested changes are all addressed.** His review on c34d753 asked to merge or rebase current main, then rerun or reconfirm the evidence, then request review again. There were no inline comments.
- **Rebase:** done onto 41e5154. It merges cleanly with current main and does not touch `app/`, `contracts/` or `docs/specs`.
- **Reconfirm, checked independently:**
  - The original local merge a74d6f2 still exists in this repo.
  - Its tree 1affb617 equals `merge-tree(49227e4, c34d753)`, and its parents match `repository_commit.txt`.
  - `git diff 1affb617 <PR head / merged tree> -- spikes/spike_b_3d tests/fixtures/geometry` shows only the 9 new evidence files.
  - The canonical fixture blob 0d2f4d2a is identical everywhere.
  - `serve_viewer.py` serves only `spikes/spike_b_3d`.
- **Review re-requested:** yes, in a comment on 09-21.

**Evidence and re-derivation:**
- All 8 blob SHA-256 values match PROVENANCE.
- The JSONL (125417809c…508e) matches its `.sha256` file.
- The evidence directory is identical to `origin/spike-b/evidence-20260918`.
- I re-derived every number with the committed extractor (`summarizeFrameIntervals` in `performance.js`) over all 5,400 intervals:
  - all 7 stored summary fields match for every run;
  - median 59.88 FPS in all three runs, p05 59.52;
  - longest stall 16.80 / 16.80 / 16.90 ms, with 0 intervals over 500 ms;
  - so B10 PASS and B11 PASS.
- The independent RN-bridge logcat copy (truncated) has exactly 3 probes, with the same timestamps and identical summaries. So no fourth result was lost or held back.
- The conditions files match RESULT.md: 90 Hz, battery 71/72 %, 35.0/34.6 °C, PSS 87.05/219.26 MB.
- Tests on the merged tree:
  - `build_mesh.py` OK; `test_obj` 5,648 triangles; `test_picking` 13/13; `test_performance` 17; `test_webview_probe` 14;
  - `conformance.py`: 33 points, 13 rays, 0 findings;
  - `py_compile` OK and `git diff --check` clean.

**BLOCKING:**
1. **The self-contradiction: change `management/evidence/TC_TEAM_001_VU_HUNG_ANH.md`, not RESULT.md.** The package was written in ba492ae (09-18 15:12, hours before that evening's session) and never updated, while RESULT.md's numbers re-derive exactly. Edit:
   - line 125 (B10/B11 row) → OBSERVED PASS. Scope: owner interpretation, one A17 session, synthetic level 0, raw JSONL sha 1254178…, not reviewer-approved; levels 1–3 and real mesh NOT MEASURED;
   - line 120 ("TC-PERF-002 NOT MEASURED") → partial: observed on the spike viewer, the SCR-05 product screen not measured;
   - line 144: drop "there is no B10/B11 number";
   - line 158: annotate the checklist item;
   - add an "Updated" date.

**NON-BLOCKING:**
- RESULT.md's scope should state:
  - the viewport was 360×225 CSS px (1012×632 backing px, DPR 2.8125), an embedded panel rather than full screen;
  - requestAnimationFrame ran at 60 Hz on a 90 Hz display, so 59.88 FPS is the frame-rate ceiling.
- Gestures are not instrumented. The continuous render loop makes FPS a valid render-cost measure, but the "interaction" part of B11 rests on operator testimony; RESULT.md should say so.
- `fetch(…, {keepalive: true})` has a 64 KiB limit in Chromium. Payloads were about 36 KB here, but at 90/120 Hz they would approach or exceed it.
- The committed `mesh/out/mesh_levels.json` lacks the `geometry_contract_version` that `build_mesh.py` now writes; regenerate it.
- After merge, Project Control needs to update the state YAML files.

**Verdict: DO NOT MERGE as-is. After the one-file TC-TEAM-001 fix → MERGE.** No re-measurement is needed.

---

## PR #59: Spike C1 prep harness (b40b44e, no review)

**Checks run:**
- The branch is cut from current main and merges cleanly.
- `--help` exits 0 for all three scripts and both subcommands. The PR contains no self-test.
- `verify_subsets.py` on the exact candidate manifest bytes → 18/18 PASS, sha c5c65a09….
- I built a synthetic package of 154 empty directories (0 files, no dataset bytes). `make-root` linked 78 training cases.
- Driver script: `qa_override\pr59_drive.py`.

| Run | Result |
|---|---|
| Allowlisted root, gates CLOSED, pin c5c65a09 | exit 0, runnable=True ✔ |
| Same root, pin ff1517d0 | exit 1, SPLIT-MANIFEST-HASH FAIL ✔ (confirms the false "manifest changed" the correction describes) |
| Naive package root (the negative control) | exit 1, 20 validation and 54 holdout paths resolved, refused ✔ |
| All names allowlisted, one link pointing at a validation case directory | **exit 0, runnable=True, is_spike_c1_evidence=True ✗** |
| All names allowlisted, one link pointing at the package parent (holdout reachable at `root/CASE_0055/Testing Set/…`) | **exit 0, runnable=True ✗** |

- Mutation tests on `verify_subsets.py`:
  - a count-preserving swap in the 25% subset is caught (NEST-EFF-25-IN-50), so nesting really is proven by set containment, not counts ✔;
  - overlapping groups are caught (GROUPS-TRANSITIVE) ✔;
  - a dev→holdout link on a case still in training is **not caught** ✗;
  - an invented id in the census is **not caught** ✗.
- All 8 committed forecasts reproduce exactly from the committed C0 probe and blob-exact manifests.
- No dataset bytes: the PR adds 16 small text files (largest 42 KB), and `*.nrrd`/`*.nii`/`*.dcm` are gitignored ✔.
- The correction's facts:
  - c5c65a09…396d is the blob hash (`git show` and `cat-file` bytes are identical) ✔;
  - ff1517d0 is exactly the UTF-8 BOM + CRLF form of the blob ✔;
  - the branch tip is still 7b72ce8 ✔;
  - #35 was marked ready for review at 2026-09-21T01:35:57Z ✔;
  - the dataset manifest f64d461f…5ea9 matches main ✔;
  - main's split manifest after #35 also hashes to c5c65a09, so the re-pin step now passes.

**BLOCKING:**
1. **`preflight check` verifies entry names, never link targets** (`preflight.py` 195-245). The two adversarial rows above are certified as runnable C1 evidence while validation or holdout data is reachable.
   - Fix: make `--package-root` required in `check`.
   - For every root entry, assert that `(root/e).resolve()` equals `(package_root/dirs[e]).resolve()`.
   - Also assert that no resolved target equals, or is a parent of, any validation or holdout source directory.
   - Keep both adversarial roots as permanent negative controls.
2. **The correction states the wrong mechanism.** `C1_BRINGUP.md` line 608 and the evidence `README.md` line 20 say "`data/manifests/**` is `-text`".
   - In fact main's `.gitattributes` line 48 (`*.json text eol=lf`) overrides line 40, and `git check-attr` reports `text: set, eol: lf`.
   - A fresh checkout is still LF. But in a scratch repo a CRLF re-save hashed differently while `git diff` stayed empty.
   - Fix: tell the reader to re-pin by hashing blob bytes (`git cat-file blob main:data/manifests/split_manifest_path_a_seed2024.json` read in Python), not the working-tree file.
   - Annotate §4.4 lines 281-282: that `> split_candidate.json` redirect is what produced ff1517d0.
3. **The leakage chain is never recomputed** (`verify_subsets.py` 227-263; `preflight.py` 186-188 hard-codes CASE_0133 and CASE_0117).
   - Components are built only from the declared same-partition groups; `development_to_holdout_links` is ignored; the exclusion set is trusted rather than derived.
   - A new dev→holdout link on a training case still passes 18/18.
   - Fix: run union-find over groups plus links, then assert that no effective-training case shares a component with a validation or holdout case.
   - Recompute exclusions as the group closure of the linked dev cases.
   - Check that `affected_case_ids` and `pair_count_above_threshold` are consistent with that.
   - The current manifest is clean: the component {0117, 0133, 0027} is fully excluded from training.

**NON-BLOCKING:**
- CENSUS-EXACTLY-ONCE checks counts only; add a set-equality check against the dataset manifest in preflight.
- `--allow-open-gates` does nothing. With a gate OPEN, GATE-STATE fails and the exit code is 1 either way; exit code 2 can never happen.
- `forecast_matrix.py` still reports totals and `fits_window` when a variant is NOT MEASURED.
- Wording in `C1_BRINGUP.md`:
  - line 413 says the JSON holds "all 74 resolved paths", but only 10+10 are stored;
  - lines 249 and 377 call the union-find "independent", but it runs over the declared groups. The real independent support is the counts: 5 pairs = 4 + 1, and 9 affected cases = 8 + 1.
- `make-root` has no guard requiring the output root to be outside the repo.
- The text "#35 not on main" is now stale; #35 merged at f5aa763.
- The evidence files record the hostname and local paths.

**Verdict: DO NOT MERGE.** Fix B1–B3 (B2 is text only), then merge for Bế Quốc Khánh to adopt on D23.

---

All my scripts and outputs are in `<qa-scratch>\`, left in place. `pr59_work` contains directory junctions pointing at empty temp folders, and `attr_demo` is a scratch git repo. I deleted nothing.
