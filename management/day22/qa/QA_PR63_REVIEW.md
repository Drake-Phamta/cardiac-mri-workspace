# QA-063: PR #63, V4 review states, brush model and findings model · **MERGE** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. This is an LLM session (Claude Code, Claude Opus 5.5) running under the leader's account. **It is not a second human reviewer.** It is the independent QA pass named in `RECOVERY_OVERRIDE_DAY22.md` §2 item 2. |
| **Target** | PR #63, branch `feat/day22-v4-review-brush-findings`, head **`d8016069b80843c340d2e4a44bacc04769c37898`**. 5 commits: `abbba1f`, `d7c95f0`, `602dfb9`, `1a83837`, `d801606`. The diff touches only `app/verticals/v4_review_and_findings/**` and one step of `.github/workflows/guardrails.yml`. |
| **Base** | Merge-base `a7b4950` (#71, contract 1.1.0). `origin/main` was `3c02fd2` at both start and end. `git merge-tree origin/main d801606` is clean. None of main's 10 commits since `a7b4950` touches the PR's paths, `app/core/` or `contracts/`. `contracts/api/contract.json` is byte-identical at the head and on main (`contract_version` 1.1.0). |
| **Run time** | 2026-10-01, 14:47–15:00 +07, inside the 40-minute timebox |
| **Method** | Detached worktree `<scratch>/qa63_wt` at `d801606`. The fixture bundle was regenerated there with the project's own `generate_fixture.py`. node v24.14.0, CPU only, one node process at a time, heap capped at 1 GB or less. Probes and the mutation runner are `<scratch>/qa63_*.mjs`. GitHub was read only, through `gh pr checks`, `gh pr view` and `gh run view --log`. No commit, push, comment or label was made. `<repo>` was not touched: it is still on `main` at `c7a37e0`, with only `?? .claude/`. |

> **VERDICT: MERGE.** All 8 checks PASS and there is no blocking finding. N-1 to N-4 are real gaps in the model's drift checks and save flow. Trung should fix them on Day 23, and N-4 must be settled before #72 (the V4 screens) leaves draft.

---

## 1 · Commands and scripts run

| # | Command (`<wt>` = `<scratch>/qa63_wt`) | Purpose |
|---|---|---|
| R1 | `git rev-parse` · `git log origin/main..d801606` · `git merge-tree --write-tree origin/main d801606` · `git diff --stat a7b4950 origin/main` · `git diff --quiet origin/main d801606 -- contracts/` | Resolve the refs, merge cleanliness, what main changed since the base, contract identity |
| R2 | `python contracts/api/generate_fixture.py --contract contracts/api/contract.json --output app/core/fixtures/.generated/api_bundle.json` (in `<wt>`; the output path is gitignored) | The fixture bundle the tests read |
| R3 | `node app/verticals/v4_review_and_findings/test_review_correction.mjs` · `test_brush.mjs` · `test_findings.mjs` · `node app/core/tests/run_all.mjs`, one after another | Check 1 |
| R4 | `gh pr checks 63` · `gh run view 36822354201 --json headSha,...` · `gh run view ... --job 110240460789 --log` | CI on the head and the step log |
| R5 | `node <scratch>/qa63_probes.mjs` (P1–P10) · `node <scratch>/qa63_probes2.mjs` (save, undo, reset walk) | Behaviour probes and request-body conformance |
| R6 | `node <scratch>/qa63_mutate.mjs` (M1–M8), then `git -C <wt> diff --quiet` (exit 0) | Check 6 |
| R7 | `git rev-parse e41e78b:spikes/spike_a_2d/app/brushMath.js` · `1b362e8:.../viewerMath.js` · a line diff of the copied ranges against the spike file | Port fidelity, independent of the PR's own B0 |
| R8 | A regex scan of the 2,473 added lines (`git diff a7b4950 d801606 --unified=0`) · an import scan of the vertical | Checks 5 and 8 |

## 2 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Tests | **PASS** | **Local, at `d801606`:**<br>• `test_review_correction` 33/33<br>• `test_brush` 22/22<br>• `test_findings` 25/25<br>• `run_all.mjs` ALL PASS 10/10. The bundle has 28 endpoints, generated from contract 1.1.0.<br>**CI:** `gh pr checks 63` shows 9/9 pass. Run `36822354201` is a `pull_request` run on headSha `d8016069…`.<br>**app/core job log:** shell `/usr/bin/bash -e {0}`. `run_all` 10/10, V4 33/33, 22/22 and 25/25, V1 73/73. |
| 2 | Contract 1.1.0 conformance | **PASS** (gaps N-1 and N-2) | **Requests (P9).** 10 requests were recorded across case_get, review_create, reviewed_masks_list, review_patch, working_mask_put, review_commit, findings_list, finding_create and finding_patch.<br>• Every body key is in that endpoint's `request_fields`, and none is left out.<br>• Every enum-bound value is in its enum.<br>• `mask_payload` is exactly `{encoding, data}` with `BITPACK_BASE64`.<br>• `finding_create.prediction_variant` is `PROCESSED` with a run and `null` without one.<br>• `finding_patch` sends `{note, status, expected_revision}`.<br>• `review_create` sends status `NOT_REVIEWED` plus `source_mask_id` and `prediction_variant`.<br>**Reads.** Every field the model reads is a `response_fields` or `row_fields` entry. `case_get.shape` is `[Nx, Ny, Nz]`, which matches the backend.<br>**Two harmless fallbacks.** `revision` is read before `working_revision`, and findings rows are also read for evidence fields sitting beside `evidence`.<br>**Nothing invented.**<br>**Cross-check against the #68 backend handlers:** BITPACK is MSB-first and row-major (`np.packbits` big), and `region_reference` accepts a JSON object.<br>**Missed validations:** N-1 and N-2. |
| 3 | FR-REV-001 behaviour | **PASS** | **States and transitions.** The 4 states and 6 transitions equal `domain_enums` and `05` §6 (V4-0; V4-2 covers 16/16 pairs).<br>**PATCH to CORRECTED.** It is refused locally from every state with `CORRECTED_BY_COMMIT_ONLY`, and nothing is sent. A review that is already CORRECTED refuses every PATCH with `INVALID_REVIEW_TRANSITION` (V4-3, P10).<br>**Commit only.** The commit is the only way into CORRECTED, and no PATCH follows a save (V4-8, V4-13).<br>**Saved vs unsaved** (B11, P11):<br>• Undo after a save makes the slice UNSAVED, and redo makes it SAVED again.<br>• Cancel returns to the save and clears the history.<br>• Reset returns to the source prediction, which reads UNSAVED against the save.<br>• Undo after a reset or a cancel returns `null`.<br>**Inputs are never written.** The caller's buffers and the session's source copies hash unchanged (B3, P4; mutation M8 was killed). Ground truth is refused as a source (B12).<br>**New version, never an overwrite.** A commit that answers an id already in the list becomes `CONTRACT_DRIFT`: nothing is appended and the session stays UNSAVED (V4-8; M3 killed). |
| 4 | Brush model | **PASS** | **Operations:**<br>• add and erase on exactly the disc (B4);<br>• the radius set is {0,1,2,3,5}, and -1, 4, 6, 1.5, `'2'` and `null` are refused (B12, P3);<br>• undo and redo match the oracle hash at every step, 14/14 each way (B1, B7);<br>• reset (B1, B7).<br>**r = 0:** 60/60 (B2) and 300/300 under random zoom and pan (B5). All 4 corners paint exactly 1 px (P3).<br>**Edges (P3):** u = Nx, v = Ny and u < 0 return `null`, and the last pixel is inside. r = 5 at (0,0) paints the clipped quarter disc, 26/26.<br>**History (P1, B8, P2):** undo after reset is `null`, and a new committed stroke empties redo.<br>**Port fidelity:**<br>• The header is correct: `spikes/spike_a_2d/app/brushMath.js`, commit `e41e78b`, blob `abb3ec28…`. This is the same blob at the head and on main, and the only commit that touched the file.<br>• My own line diff shows the copied block identical: 142 lines (RADII … redo) and 21 lines (diffRuns).<br>• The only changes are the imports and an added `Object.freeze(RADII)`.<br>• The `sha256.mjs` and `maskPayload.mjs` copies (commit `1b362e8`, blob `e4275a93…`) are verified too. |
| 5 | Framework neutrality | **PASS** (CI coverage gap N-6) | The non-test modules import only `../../core/index.mjs` and sibling files. The vertical has no react, react-native or expo import, no `require` or `import()`, and no spikes/ import. `node:` appears only in the three test files. |
| 6 | Test strength | **PASS** | 8 of 8 mutations were killed (table below). Every file was restored byte for byte; `git diff --quiet` exits 0 and HEAD is still `d801606`. |
| 7 | CI change (`d801606`, and `abbba1f`'s step) | **PASS** | No step was removed. `run_all.mjs` keeps its own step. The V4 step went from 1 test file to 3. The V1 step is unchanged. Nothing added `continue-on-error` or an `if:`. The step runs under bash `-e` (confirmed in the log), so any failing command fails the step. |
| 8 | Publication hygiene | **PASS** | The scan of 2,473 added lines found no drive or home paths, no AppData or /tmp, no IPs, emails, URLs or hostnames, and no GitHub account names. The provenance headers carry only commit and blob hashes. |

**Mutations (check 6)**

| # | Mutation | Test file | Result |
|---|---|---|---|
| M1 | `checkTransition` allows a PATCH to CORRECTED | test_review_correction | KILLED: V4-2, V4-3, V4-13 (30/33) |
| M2 | Session `undo` is a no-op | test_brush | KILLED: B1, B7 ×2, B11 (18/22) |
| M3 | Commit accepts a `reviewed_mask_id` that is already a version | test_review_correction | KILLED: V4-8 (32/33) |
| M4 | `finding_create` drops `prediction_variant` | test_findings | KILLED: F5 (24/25) |
| M5 | Reset restores the last save instead of the source | test_brush | KILLED: B11 (21/22) |
| M6 | A save stops re-sending slices the server already holds | test_review_correction | KILLED: V4-10 (32/33) |
| M7 | `finding_patch` sends no `expected_revision` | test_findings | KILLED: core refuses with `MISSING_EXPECTED_REVISION`, then F10 aborts on a TypeError (see N-5) |
| M8 | `loadSlice` keeps the caller's buffer instead of a private copy | test_brush | KILLED: B1, B3, B7, B11 ×2 (17/22) |

## 3 · Findings

### BLOCKING
**None.**

### NON-BLOCKING

**N-1 · medium, contract drift check. `review_commit`'s answer is not validated (P5).**
- Fault injection over the generated response gave SUCCESS in each of these cases:
  - a commit answering `status: FLAGGED` leaves the review FLAGGED;
  - a commit answering `status: ACCEPTED` leaves it ACCEPTED;
  - a foreign `source_mask_id` is accepted;
  - `source_mask_kind: GROUND_TRUTH` is accepted.
- In every case the session reads SAVED.
- The contract says a commit "answers a NEW reviewed_mask_id and status CORRECTED". `enum_bindings.review_source_mask_kind` limits `review_commit.source_mask_kind` to RAW_PREDICTION or PROCESSED_PREDICTION. Core does not check enum values in responses.
- The fallback `d.status ?? REVIEW_RULES.commitResultState` is dead code, and its comment is wrong. Core's success data spreads `status: <HTTP status>` before the response data, so `d.status` is never undefined.
- **Fix:** in `commit()`:
  - push a problem when `status !== REVIEW_RULES.commitResultState`;
  - push one when `d.source_mask_id !== current.sourceMaskId`;
  - push one when `d.source_mask_kind !== SOURCE_KIND_FOR_VARIANT[current.predictionVariant]`;
  - remove the `??` fallback;
  - add V4-7-style injection rows for `review_commit`.
- **Owner:** Nguyễn Gia Đức Trung, Day 23.

**N-2 · low, review scope. `review_create`'s `run_id` is not compared with the run that was opened (P6).**
- A review answered for `RUN_9999` opens as SUCCESS on `RUN_0043`.
- `review_rules.scope_fields` includes `run_id`, but the model checks only `source_mask_id` and `prediction_variant`.
- **Fix:** add `['run_id', runId]` to the scope comparison in `open()`, with a V4-7 row.
- **Owner:** Trung, Day 23.

**N-3 · low/medium, version noise. Saving again with no change creates a duplicate version (P7).**
- After a successful save, while the session reads SAVED, `saveCorrection` re-sends every uploaded slice and commits.
- With the #68 backend this creates version N+1 identical to N, and the revision advances.
- `NOTHING_TO_SAVE` fires only before anything has ever been uploaded.
- **Fix:** refuse with `NOTHING_TO_SAVE` when `session.state().unsavedSlices` is empty and `lastSave` is set, and add a test. In #72, enable Save only while the state is UNSAVED.
- **Owner:** Trung, Day 23.

**N-4 · medium, design gap. Settle it before #72 leaves draft. It is about the source kind and about continuing a CORRECTED review.**
- **The kind is never checked.** `saveCorrection` compares only `maskId`. A session declared `REVIEWED` or `PROCESSED_PREDICTION`, with the same mask id, saves into a RAW review (P8).
- **The editable kinds are wider than the contract.** `SOURCE_KIND` includes `REVIEWED`, and V4-0 pins it to `source_mask_kind` minus GROUND_TRUTH. Contract 1.1.0 has `review_source_mask_kind` = RAW_PREDICTION | PROCESSED_PREDICTION.
- **A fresh session can only start from the source.** A `REVIEWED` session can never be saved, because its mask id differs from the review's source. So a new session on a CORRECTED review can only start from the source-prediction pixels.
- **That can drop an earlier correction.** #68's `review_commit` builds version N+1 from the **parent version** plus the working slices. Re-editing an already-corrected slice from the source pixels therefore silently drops that slice's earlier correction from the new version. The old version stays immutable, so this is not an overwrite, but the latest version loses work.
- **Fix:**
  - decide the continuation rule; for example, load the latest reviewed version as the working base, keep `source_mask_id` as the review's source, and keep reset going to the source prediction (FR-REV-007);
  - then check the kind against `SOURCE_KIND_FOR_VARIANT` in `saveCorrection`;
  - align `SOURCE_KIND` and V4-0 with `review_source_mask_kind`.
- **Owner:** Trung, Day 23, together with #72.

**N-5 · low, test robustness.**
- **Missing spike files read as passes.** B0, B1 and B2 print `ok` when the spike files are missing ("retired"). If `spikes/spike_a_2d` is cleaned up, the provenance and oracle checks will pass without checking anything.
- **F10 crashes instead of failing.** It dereferences `body.expected_revision` without `?.`. Under M7 the suite aborted on a TypeError instead of reporting a named FAIL.
- **Fix:**
  - when a spike file is absent, print a counted `SKIP` instead of `ok`, or verify the header's blob id;
  - use optional chaining in F10's detail string.
- **Owner:** Trung.

**N-6 · low, CI coverage. This was already on main before this PR.**
- The GATE-MOB-01 job's framework grep covers `app/core` only. For `app/verticals` it relies on the bare-specifier grep, which sees only single-line `import … from`.
- That grep misses:
  - a multi-line `} from 'react'`;
  - `export … from`;
  - `require()` and `import()`.
- `node:` builtins are allowed anywhere outside `app/core`.
- The V4 vertical is clean today (check 5).
- **Fix:** run the framework grep over `app/`, and extend the `node:` rule to non-test files under `app/verticals/`.
- **Owner:** leader session (CI).

**N-7 · low, docs and stale text.**
- `findings.mjs` (`fieldsFromRecord`, `normalizeFinding`) says a row guarantees only finding_id, status and evidence and carries no type. Contract 1.1.0's `row_fields` also has finding_type, note and revision.
- The header of `test_review_correction.mjs` says the scope ids are "never typed", but `caseId` and `runId` are literals.
- `brush.mjs` and `maskPayload.mjs` point to `mobile/src/verticals/v4` and `mobile/src/imaging/maskPng.js`. Those exist only at #72's head (`56aec8f`), not on main.
- The README lists `reviewed_mask_slice_get`, but the model never calls it. TC-REV-005's reload check needs #72's PNG adapter.
- The PR body's self-check still says contract and backend files are in the diff. Since the rebase, the diff is V4 plus one CI step.
- **Owner:** Trung for the code text; the leader session for the PR body.

**N-8 · info, process.**
- The branch sits on `a7b4950`, not on today's main `3c02fd2`. The trial merge is clean, and none of main's later changes touches app/core, contracts/, guardrails.yml or the vertical.
- Merge with `--match-head-commit d801606`, and let main's CI re-run.
- Trung's Day 23 revalidation should cover N-1 to N-5 and defend the reset-after-save semantics:
  - reset goes to the source prediction;
  - the next save commits a version equal to the source;
  - this is literal `10` §5 and TC-REV-004 behaviour.
- The read-only views (`workingSlice`, `sourceSlice`, `savedSlice`) are live buffers. A caller writing into one is detected by `sourceIntact()` but not prevented (P4).

## 4 · Archiving note

Everything is in `<scratch>/qa63_*`: test outputs, probes, the mutation runner and its outputs, the CI log and the PR body. The scripts use paths relative to their own location.

Two files need attention before anything is copied into the repo:
- `qa63_mutation_m7_out.txt` contains a local absolute path inside a stack trace.
- `qa63_ci_appcore_log.txt` is a raw runner log.

Both must be redacted before copying.

The worktree `<scratch>/qa63_wt` is left in place: detached at `d801606`, clean, with the generated bundle in its gitignored `.generated/`.

**VERDICT: MERGE.** There are no blockers. N-1 to N-5 go to Nguyễn Gia Đức Trung for Day 23, with N-4 settled before #72 leaves draft. N-6 and the PR-body text go to the leader session.
