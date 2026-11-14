# CHAT E QA: PR #80, V1 no-run open

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| Reviewer | CHAT E. I am an LLM session (Claude) running under the team leader's account, not a second human reviewer. |
| PR | #80 "feat(v1): a case with no analysis run still opens as an MRI slice view" |
| Head | `3647f2ead5dd44bf77c8a505b883be7436ba9c4d`, one commit on `2f62923`; merge-base = origin/main = `2f62923` |
| Scope | 3 files, all under `app/verticals/v1_case_explorer/` (README, index.mjs, test file), +200 / −23 |
| Mode | Read-only. My own worktree, detached at `3647f2e`. The main clone was not touched and is still on `main`. Nothing committed, pushed or commented. Nothing deleted. |
| Run | Node v24.14.0. Every node/python run was a single process; node ran with `--max-old-space-size` ≤ 512. Used about 22 of the 25 minutes. |

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Generate the bundle | PASS | `generate_fixture.py` exit 0; the output is git-ignored (`.gitignore:133`) |
| 2 | V1 suite | PASS | **88/88**, matching the author's claim |
| 3 | core / V4 | PASS | core **10/10**, V4 **4/4** |
| 4 | Point 5: old tests on the new code | PASS | main's original 73 V1 checks, re-pointed at the PR code: **71/73**. The 2 failures are the intended edits: V1-2 (a missing variant is now allowed at construction) and V1-23 (README count). Every run-path check passes unchanged. |
| 5 | `gh pr checks 80` | PASS | 9/9 green. V1 runs as its own step inside "app/core tests" (`guardrails.yml:317-318`). |
| 6 | Point 1: construction | PASS | `null` and omitted are allowed; `REVIEWED`, `BEST`, `''`, `0` and `false` all throw |
| 7 | Point 2: open with no run | PASS | SUCCESS with every field as specified. Requests are only `case_get`, `mri_slice_get`, and `ground_truth_slice_get` when GT is declared. No metrics `version` and no PREDICTION identity anywhere in the snapshot. |
| 8 | Point 3: goToSlice / refresh / setOverlay | PASS | Supersede holds. Refs are nulled on non-SUCCESS. A revisit through the cache sends 0 requests (V1-26). |
| 9 | Point 4: setVariant with no run | PASS | 0 requests, `refused` recorded, variant and refs unchanged. There is an in-flight window, see N2. |
| 10 | Adversarial probes | PASS | **27/27** checks pass, plus 8 INFO observations (listed below) |
| 11 | Safety | PASS | No prediction or metric value is fabricated on any no-run path. An INFERENCE_REVIEW case sends no GT request. One theoretical gap that predates this PR, see N4. |
| 12 | Hygiene | PASS | 0 hits for URLs, drive paths, hosts, IPs or secrets in the 200 added lines; the delta stays in scope |

**The five requested probes:**
- **Case lists runs, opened with `runId` null (P1).** SUCCESS with `runId` null. `availableRunIds` is kept. Requests are only `case_get`, `mri_slice_get` and `ground_truth_slice_get`. Same result with variant RAW or null, and with `runId: ''`.
- **INFERENCE_REVIEW (P2).** Across open, goToSlice, refresh and `setOverlay(GROUND_TRUTH, on)`, the only requests are `case_get` and `mri_slice_get`. The GT overlay stays off.
- **`mri_slice_get` error after a SUCCESS (P3).** FATAL_INVALID with every ref null and the GT layer off.
  - A slow success on slice 10 racing a fast error on slice 11 ends on 11 with no ref.
  - A GT error on slice 46 carries no ref from slice 45.
  - An out-of-range slice sends 0 requests.
- **A run opened with `variant` null (P4).** Rejected before any request, 0 requests, snapshot untouched. Same after a no-run SUCCESS.
- **`setVariant` with no run (P5).** 0 requests. Also 0 on an error view.

**Two further probes:**
- **P8.** Switching no-run → run and run → no-run carries no stale field. A slow run-open superseded by a no-run open never lands a prediction.
- **P9 (NFR-PERF-001 limb 2).** 6 slice gestures sent only `mri_slice_get` and `ground_truth_slice_get`: no `case_get`, no run request, no volume request.

## Findings

**BLOCKING:** none.

**NON-BLOCKING** (owner for all: A7 / Phạm Tuấn Anh)
1. **N1: an explorer built with `variant: null` can never open a run (P6).**
   - After a no-run open, `setVariant('RAW')` is refused and `open({runId})` throws. The only ways to get a variant are construction, or `setVariant` before any open.
   - `setVariant` with no run also accepts `REVIEWED`, garbage or `undefined` without throwing. Nothing is stored, so nothing leaks.
   - Fix: document "construct with an explicit variant if this explorer will ever open a run". Alternatively, let `open()` take a `variant`, or let a no-run `setVariant` validate and record its argument. The second option changes the agreed "no-op", so it needs the leader's OK.
   - Do this before the first trained run reaches SCR-03.
2. **N2: `setVariant` is a no-op only after `case_get` has answered (P5w/P5f).**
   - While a `runId: null` open is in flight, or after its `case_get` failed, `setVariant` switches the variant and re-opens. That sends 3–4 requests (`case_get` plus slice requests); no data is fabricated and no volume is fetched.
   - Fix: when `!runId`, set `noRunReason` in `open()`'s first LOADING snapshot, or pin this behaviour with a test.
3. **N3: a requested run is dropped silently when `case_get` lists none (P7).**
   - `runId: 'RUN_0043'` with `available_run_ids: []` (or the field absent) gives the no-run view. `runId` becomes null, the requested id is kept nowhere in the snapshot, and the reason is `NO_ANALYSIS_RUN`.
   - It fails closed and the author disclosed it as going beyond the spec. The backend fills the list live (`backend/app/main.py:407`), so it only triggers when the case really has no run.
   - Strictly, this is the one with-a-run path whose behaviour changed.
   - Fix: keep a `requestedRunId` in the snapshot, or use a distinct reason such as `RUN_NOT_LISTED`. This is a leader decision.
4. **N4: GT is gated only on `ground_truth_available === true`, not on mode (P2b; this predates the PR).**
   - A server that contradicts the contract (INFERENCE_REVIEW with GT `true`) gets GT requested and shown, while the same snapshot says `inferenceOnly: true`.
   - The real backend cannot produce this: `ingest.py:151/208` derives GT from mode, and the contract validator rejects the contradiction (`validate_api_contract.py:693`). The run path behaves the same way.
   - Fix: request GT only when `groundTruthAvailable && inferenceOnly !== true`, or treat the contradiction as CONTRACT_DRIFT.
5. **N5: the README does not describe the new interface.** Only the check count changed. Nothing in it covers a null variant, `NO_ANALYSIS_RUN`, `noRunReason`, `layerReasons` or `refused`. Fix: add a short "No analysis run" section.

## VERDICT: **MERGE**

All 5 interface points conform. Tests and CI are green, the no-run path fabricates nothing, and the delta is clean. Track N1 to N5 as follow-ups. N1 and N3 should be settled before trained runs reach SCR-03.

My scratch files are outside git, in the session scratchpad (`...\554b2482-...\scratchpad\`): `qa80_probes.mjs`, `qa80_probes_out.txt`, `qa80_make_old_tests.mjs`, `qa80_old_tests.mjs`, `qa80_old_tests_out.txt`, `qa80_v1_test.txt`, `qa80_core_test.txt`, `qa80_v4_test.txt`, `qa80_bundle_peek.mjs`.
