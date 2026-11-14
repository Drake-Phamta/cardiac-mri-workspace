# QA of PR #99 (V4 SCR-06 / SCR-08 on the current shell + QA-063 N-1..N-4)

> **Record note.** LLM QA report (CHAT E role, an agent under the leader's account, not a human reviewer), returned on 2026-10-18 under the Day 39 override. Local paths are redacted (`<scratch>`, `<repo>`, `<data>`, `<runs>`); nothing else is edited.

**LLM QA (CHAT E role), not a human review.**

| | |
|---|---|
| Target | PR #99, branch `feat/v4-screens-on-main`, head **`2becbe3ac7db98938ef59145194931e0b36d73e5`** |
| Base | `origin/main` = `a3bc595` = the merge base (no drift; PR is MERGEABLE, not draft) |
| Diff | 16 files, +3194 / -96. Only `app/verticals/v4_review_and_findings/**`, `mobile/src/verticals/v4/**`, `mobile/test/**`. `docs/`, `management/`, `contracts/`, `backend/` and `app/core/` are untouched |
| Method | Read-only worktree. Mutation runs in scratch copies of HEAD and of `origin/main` under `d39/qa/v4mut/` (outside the worktree). Worktree status was clean before and after. No push, comment or approve |

## VERDICT: MERGE

No blocking finding. N-1..N-4 are closed and every one is killed by a test when mutated. Request shapes equal the contract and the E2E H8/H9 shapes. The merge with main lost none of main's render checks. Seven non-blocking items follow; two (NB-1, NB-2) are worth fixing soon because they touch provenance and the unsaved-edit path.

## Checks

| # | Check | Result |
|---|---|---|
| 1 | QA-063 N-1..N-4 closed with non-vacuous tests | PASS. 27 mutations, 24 killed (list below); the 3 survivors are N-4i (tie-break, benign) and the two refresh branches in NB-2 |
| 2 | Request shapes = contract = E2E H8/H9 | PASS (details below) |
| 3 | Shell rules; no V1/V2/V3 regression | PASS. NB-3 and NB-4 are doc/DR-021 wording gaps |
| 4 | Fixture SYNTHETIC mask never reaches a live backend | PASS (two independent guards, both mutation-tested) |
| 5 | Commands | all PASS, see below |
| 6 | Hygiene | PASS |

### Check 5 results (run in the checkout, fixture regenerated with the project generator, `prepare.mjs --mode fixture --strict` OK)

- `npm test` (mobile): **246 / 246** pass (main alone: 220, so +26 new V4 tests).
- `npm run test:render`: **205 checks pass**, logic only. `origin/main` alone gives **159**. 205 - 159 = 46, which equals exactly the new `V4a`..`V4n` checks (1+5+1+3+3+2+8+2+2+4+4+6+4+1). Per-section id counts were diffed: no id of main is missing, nothing else changed. Section 10 (V4) and section 11 (V2: `V2R1`..`V2R14`) both run. The one edited line is the label of `S8` ("placeholder" -> "Findings"); its regex is unchanged.
- `test_review_correction.mjs` 50/50, `test_brush.mjs` 22/22, `test_findings.mjs` 28/28, `app/core/tests/run_all.mjs` ALL PASS 10/10, `test_case_explorer.mjs` 91/91.
- `gh pr checks 99`: all 11 checks pass (including `mobile render smoke + bundle (npm ci)` and `mobile shell logic tests`).

### Check 1: mutation results (scratch copy of HEAD; test = 3 V4 model suites + mobile V4 tests, render smoke when those survive)

Killed (the test that failed is named):
- N-1: status not checked (V4-14), source_mask_id not checked (V4-14), source_mask_kind not checked (V4-14), `?? commitResultState` fallback restored (V4-14 "no status"), existing-version-id check removed (V4-8).
- N-2: `run_id` removed from the scope compare (V4-7), missing scope field tolerated again (V4-7), CORRECTED with no versions not drift (V4-16).
- N-3: `uploaded.clear()` removed (V4-15 x3), `committed()` ignoring `saved` (V4-15, B11, RS16).
- N-4: BASE_VERSION_MISMATCH removed (V4-8, V4-16), `baseVersion` always null (V4-8, V4-15, RS16, RS17), SOURCE_KIND_MISMATCH removed (V4-16), loadSlice ignores base for the working copy / saved copy (V4-16, RS16), `markSaved` not moving `baseId` (V4-8, RS16), BASE_SLICE_MISSING removed (V4-16), `REVIEWED` back in `SOURCE_KIND` (V4-0, V4-16), controller not passing `base` (RS16, RS17), reviewed-slice id mismatch not checked (RS17), base-unavailable falling back to source pixels (render V4n).
- Extra: synthetic guard removed in the model (V4-11), controller `synthetic` flag dropped (RS2), `canLeave` always true (RS14).

Survived: see NB-2 and NB-7.

### Check 2: shapes

- `review_create`: body `{status: NOT_REVIEWED, source_mask_id, prediction_variant}` plus path `run_id`; equals contract `request_fields` and E2E H8. The answer is checked for `run_id`, `source_mask_id` and `prediction_variant` (N-2).
- `working_mask_put`: body `{source_mask_id, expected_revision, slice_index, geometry_contract_version, geometry_validation_status, mask_payload}` with the case's geometry, not an assumed one. Equals E2E H8. `mask_payload = {encoding: BITPACK_BASE64, data}`; I encoded a 13x7 pattern with `encodeMaskPayload` and compared it with `hero_flow_api.py bitpack` (MSB first, row-major): byte-identical. Render check V4g decodes the screen's own PUT and compares it to source + the six painted pixels.
- `review_commit`: body `{expected_revision}` only. The PUT bumps the revision by one and the commit carries the bumped value (V4g: PUT at 2, commit at 3), as in H9.
- CORRECTED is reached only by the commit: a PATCH to CORRECTED is refused before sending (`CORRECTED_BY_COMMIT_ONLY`), the screen offers no such button and shows a hint, and render V4g asserts no PATCH follows a commit. Leaving ACCEPTED needs `confirmed`.
- `finding_create` (case, run, `prediction_variant`, slice, type, note, study) and `finding_patch` (`status`, `note`, own `expected_revision`) match the contract. V4k and V4l assert the bodies.
- STALE_REVISION: STALE_MISMATCH, Refresh only, no Retry; the edit stays UNSAVED; the next save sends the reloaded revision (V4j, RS9). The raw prediction is never written (V4h checks that no prediction or artifact route was written, and that the source bytes are unchanged).
- Reviewed versions are append-only: a commit answering an id that is already a version is CONTRACT_DRIFT and nothing is appended (V4-8). Version rank in `latestVersion` uses `provenance.version`, which the real backend sets on every row (`backend/app/storage.py:350`).

### Check 3: shell rules

- Reads use `useCall`: `<RunReader>` and `<SliceReader>` (prediction, MRI, base version slice) and the findings list. Latest wins, aborted when no longer wanted. The readers are keyed by epoch / ticket so a Retry is a new reader.
- Bytes: `runtime.content.bytes(..., {checksum, signal, kind})`, the checksum is passed from the response; the content module returns CONTRACT_DRIFT when it is missing. Masks are decoded by `src/imaging/maskPng.js` with the case's width and height. The MRI is drawn from `runtime.imageStore`.
- Leave guard: registered only while `canLeave` is false, set to `null` as soon as it is true (`ReviewCorrectionScreen.js:238-247`). It is keyed per stack entry and pruned by the navigator, so a covered or unmounted screen leaves none behind. Tests V4d, RS14.
- `returnParams`: "New finding here" passes `{caseId, variant, sliceIndex}` as the third argument, merged into SCR-06's own entry. Back reopens the same variant and slice with no question (V4k).
- No V1/V2/V3 file changed; their tests are unchanged and pass.

### Check 4

Guard 1: `saveCorrection` refuses `src.synthetic` unless `client.transportKind === 'fixture'` (`index.mjs:431`). Guard 2: the controller sets `synthetic` only when `runtime.mode === 'fixture'`, and a live runtime never calls `syntheticSourceSlice` (live slices come only from verified bytes). Fixture mode: `content.bytes` answers `FIXTURE_NO_BYTES`, so nothing real is drawn. Both guards killed their mutations.

### Check 6

No IPs, serials, absolute paths or per-case metric values were added. Test hosts are `backend.test` and `backend.invalid` (reserved names). Case and run literals are the same placeholders main already uses. `docs/` and `management/` are untouched; the spec checksum job passes.

## BLOCKING

None.

## NON-BLOCKING

**NB-1 (medium, provenance). A commit answer without `reviewed_mask_id` or `checksum` is accepted as success.**
`app/verticals/v4_review_and_findings/index.mjs:357` compares the id only when it is present (`some(v => v.reviewed_mask_id === d.reviewed_mask_id)` is false for `undefined`), and nothing checks that the id or checksum exists. I injected both cases into the V4-14 table in a scratch copy: both were accepted (session reads SAVED, a version with an `undefined` id is appended, `baseId` does not move). The real backend always sends them (E2E H9), but N-1's own rule is "a missing field is as wrong as a different one".
Fix: push a problem when `typeof d.reviewed_mask_id !== 'string' || d.reviewed_mask_id === ''` and when `checksum` is not `sha256:<64 hex>`, and add the two rows to V4-14.

**NB-2 (medium, untested data-loss branch). The controller's Refresh over a changed latest version is not tested.**
`mobile/src/verticals/v4/reviewController.mjs:443-455`. Mutations "never rebuild" and "rebuild even when unsaved edits exist" both survive the whole suite, render included. The second one would silently discard unsaved edits after Refresh when another reviewer has committed. The current code is correct (it refuses and asks to cancel first), but nothing holds it.
Fix: one controller test with a second commit injected between open and Refresh, two cases: no unsaved edits (session rebuilt on the new base) and unsaved edits (refused with `BASE_VERSION_MISMATCH`, edits kept).

**NB-3 (low, doc is wrong). README says the screen shows the served `prediction_mask_id`; it does not.**
`app/verticals/v4_review_and_findings/README.md:241` ("the screen shows both and checks neither"). `servedMaskId` is stored in `reviewController.mjs:373` but no screen reads it. The brush edits the pixels of `prediction_slice_get` while Save names the run's `raw/processed_prediction_artifact_id` as `source_mask_id`; E2E H8 asserts these are equal on the real backend, the app does not. In live mode a mismatch should be treated as drift (the fixture legitimately differs, so only live).
Fix: either refuse the slice in live mode when `d.prediction_mask_id !== sourceMaskId` (reason `SOURCE_MASK_MISMATCH`, with a test), or show the served id in the header and correct the README sentence.

**NB-4 (low, DR-021 rule 2 wording). Some SCR-06 reads run inside the model, not through `useCall`.**
`index.mjs:233` (`case_get`) and `:262` (`reviewed_masks_list`) are called by `open()` and by `refresh()` through `client.call` without an abort signal. They are part of the open sequence that starts with the `review_create` POST, so this is a defensible reading, but README line 221 ("Reads go through `useCall`") overstates it. Say so in the README, or note it as the owner's Day 23 item.

**NB-5 (low). Live route/run consistency.**
`reviewController.mjs:217`: a route `caseId` that differs from `run.data.case_id` is not checked (the geometry then comes from the route's case). Compare them in live mode and report CONTRACT_DRIFT.

**NB-6 (low, docs). `mobile/README.md` still describes the render smoke as V1/V3 and the section list stops short of V4** (lines around 264-270). Add V4 and the new counts (159 -> 205).

**NB-7 (info). `latestVersion` tie-break is not tested** (mutation `>=` to `>` survives). Harmless: versions have distinct `provenance.version` on the real backend. Add a two-row test if it is cheap.
