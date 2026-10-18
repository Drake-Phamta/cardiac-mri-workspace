# QA review of PR #88 (Day 39 override)

> **Record note.** LLM QA report (CHAT E role, an agent under the leader's account, not a human reviewer), returned on 2026-10-18 under the Day 39 override. Local paths are redacted (`<scratch>`, `<repo>`, `<data>`, `<runs>`); nothing else is edited.

**LLM QA (CHAT E role), not a human review.** It replaces the human second review only under the leader's one-day recovery override, together with green CI.

- PR: #88 `fix(mobile): QA-078 N-6/N-8 and #77 N-3, N-7..N-11 (navigation, netLog, useCall, checksums)`
- Head reviewed: `404a80589b4a9b05e2af4389cb1098f42391b44a`
- Base: `ci/mobile-render-bundle` (PR #87, head `9bf8038`). Diff reviewed: `git diff 9bf8038 404a805` (19 files, +616/-71). `docs/specs/v1.0/**` is not touched.

## VERDICT: MERGE

Blocking findings: 0. Merge order: #87 first, then retarget #88 to `main`.

Environment note: the prepared checkout for this PR had every tracked file deleted from its working tree and no `node_modules` junction. I did not modify it. I exported the exact SHA with `git archive` into a scratch directory and installed only react 19.2.3, react-test-renderer 19.2.3, fast-png 8.0.0 and the two Babel packages the harness needs. All mutation experiments below were made on that scratch copy and every mutated file was restored and byte-compared against `git show 404a805:<path>`.

## Checks run

| Check | Result |
|---|---|
| `gh pr checks 88` | all 11 jobs pass, including `mobile render smoke + bundle (npm ci)` (1m28s) |
| `npm test` in mobile/ (Node 24.14) | `tests 194 / pass 194 / fail 0 / skipped 0`. Matches the body |
| `npm run test:render` (Node 24.14) | `RENDER SMOKE PASS - 113 checks`. Matches the body |
| `npm run test:render` (Node 24.21) | `RENDER SMOKE PASS - 113 checks` (the body's "both Node versions" claim holds) |
| `node app/verticals/v1_case_explorer/test_case_explorer.mjs` | `PASS V1 case explorer - 91/91` |
| `node app/core/tests/run_all.mjs` | `ALL PASS - 10/10` |
| IPv4 scanner from #87 on `9bf8038...404a805` | `0 private address(es)`, 616 added lines |
| Added lines grepped for local absolute paths, drive letters, adb serials, device ids | none |
| Contract 1.1.0: all four content endpoints list `checksum` in `response_fields` (`mri_slice_get`, `ground_truth_slice_get`, `prediction_slice_get`, `reviewed_mask_slice_get`) | confirmed, so the new "no checksum means CONTRACT_DRIFT" rule cannot reject a conforming server |
| Backend: slice `reference_mask_id` is `case.reference_mask_id` and slice `prediction_mask_id` comes from the same artifact as the run metrics (`backend/app/main.py`, `backend/app/metrics.py`) | the new `compareMaskIds` check will agree on a conforming live backend, so no permanent false warning |
| `docs/specs/v1.0/**` in the diff | none |

### Mutation checks (does the new test coverage actually bite?)

| Mutation on the scratch copy | Result |
|---|---|
| `NavigatorView.js`: restore the old prune (`guards.prune(state.stack.map(...))`) | render smoke `FAIL B3 ...` (1 of 113) |
| `ErrorInspectorScreen.js`: compare with the server even when mask ids differ | `FAIL E4s` (1 of 113) |
| `NavigatorView.js`: drop `if (!guards.hold()) return true;` | `FAIL B4 root with a guard: two presses, one prompt` (1 of 113) |
| `useCall.js`: drop `latest.abort()` when disabled | the render smoke did not finish (hang) and I had to kill it. It is caught, but as a hang, not a failure message |
| `CaseExplorerScreen.js`: drop `back()` from the SCR-05 push | **render smoke still passes 113/113** (see N-1) |
| netLog `late` accounting | not mutated; covered by unit tests G3b and G3c, which pass |

## BLOCKING findings

None.

## NON-BLOCKING findings

1. **N-1, returnParams wiring for SCR-05 and SCR-06 is not covered** (`mobile/src/verticals/v1/CaseExplorerScreen.js`, the three `nav.push(..., back())` calls near the end of `Explorer`). The render checks R1 to R3 exercise SCR-04 only. Deleting `back()` from the SCR-05 push leaves every test green. The reducer test N4b covers the mechanism, but the per-entry wiring on the other two entries is unguarded. Smallest fix: one more R-style check that opens SCR-05 (and SCR-06) from a non-default slice and presses Back.
2. **N-2, a regression in `useCall` abort or the guard `hold()` shows up as a hang, not a red check** (`mobile/test/render/smoke.mjs`). The harness has no per-check timeout. Combined with #87 finding N-3 (no `timeout-minutes`), a regression would burn the CI job's default 6 hours. Smallest fix: `timeout-minutes: 15` on the CI job, or a `Promise.race` timeout around the awaited steps in U1.
3. **N-3, a guard that never settles keeps `busy` true forever** (`mobile/src/nav/navigator.mjs`, `createGuards().hold/release`; `mobile/src/nav/NavigatorView.js` back handler). If a future guard opens an `Alert.alert` that the user dismisses without pressing a button, the promise never resolves and every later Back, tab press and push on a guarded screen is refused. No product screen registers a guard yet (V4 SCR-06 will), so this is latent. Smallest fix: document that a guard must always settle (use `onDismiss` to resolve false), and/or add a release on unmount in `NavigatorView`.
4. **N-4, `l4-report` ignores the new `CMW_NET_TOTALS` line** (`mobile/scripts/l4-report.mjs`). Requests counted as `late` or `unattributed` are logged but not judged by the L4 rules. This is a design choice stated in the code comments (old log lines are unchanged), but a reviewer should know that bytes in `late` do not count against the L4 limit.
5. **N-5, disclosed behaviour change.** With a single-run case, returning to SCR-03 no longer shows the "only run" suffix, because the run is now passed as requested. The PR body states this. Accepted.
6. **N-6, disclosed choice.** If the run metrics name no mask id, `compareMaskIds` reports a difference and the FP/FN comparison is skipped. Safe default, tested (V4e2), and consistent with the backend, which always names both ids.
7. **N-7, local render smoke takes about 55 s here.** Fine, noted only because of N-2.

## PR body versus code

| Claim | Verdict |
|---|---|
| N-8 returnParams merged into the covered entry in the same action, key kept; a refused guard changes nothing; tests N4b, N4c, R1-R3 | true for SCR-04 (see N-1 for 05 and 06) |
| N-6 `compareMaskIds`, warning, FP/FN comparison dropped on mismatch; V4e2, E4s | true; E4s fails when the guard is removed |
| #77 N-3 netLog attributes to the gesture open when the request started, later responses count as `late`; `CMW_NET_TOTALS` after `CMW_RUN_END`; G3b, G3c, N6 | true; the old log lines are unchanged |
| #77 N-8 `useCall` aborts when disabled | true; no product caller passes `enabled` today |
| #77 N-9 run line shows loading and unavailable states; V1l | true |
| #77 N-10 missing checksum is `CONTRACT_DRIFT` before any fetch; B6b | true, and `verified` is now always `true` on SUCCESS when `verifyChecksum` is on |
| #77 N-11 SCR-03 INFERENCE_REVIEW render check L10 | present and passing |
| #77 N-7 BackHandler mock keeps listeners; guard only for the top screen; busy flag; N14, N15, B1-B4 | true; B3 and B4 fail when the fixes are removed |
| mobile 194/194, render 113 on Node 24.14 and 24.21, V1 91/91, app/core 10/10 | true (reproduced) |
| "9 new checks fail when the fixes are removed" | partly reproduced (4 mutations, 3 clean failures, 1 hang); one mutation I tried (SCR-05 `back()`) is not caught |
