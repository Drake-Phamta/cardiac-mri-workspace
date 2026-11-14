# QA-078 delta: PR #78 at `969d946` · **MERGE AFTER #77 AND GATE-MOB-01** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

This review was done by CHAT E, an LLM session (Claude Code, Claude Opus 5.5) under the leader's account. **It is not a second human reviewer.**

Everything was read-only:
- no commit, push, comment or label;
- the main checkout was not touched, and nothing was deleted;
- one node process at a time;
- my scratch worktree `<scratch>/qa78_wt` was moved (detached) to `969d946`, reusing the same `node_modules` junction;
- every mutation and probe was reverted, and `git diff --quiet` was clean after each.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | The rebase changed nothing beyond the conflict | **PASS** | See the note under the table. |
| 2a | B-1 (conflict with #77) | **FIXED** | `969d946` sits directly on `4f46b37`: a merge-tree with `4f46b37` gives `969d946`'s own tree (`eb943ae`). #77's T1 and SCR-04's E4a–E4q run together, 77/77. |
| 2b | B-2 (selection version and rule gate) | **FIXED** | See the note under the table. |
| 2c | B-3 (served variant) | **FIXED** | See the note under the table. |
| 3 | Re-run of M1a, M3, M4 | **PASS: all killed** | M1a, a client-side DR-010 re-rank without `.sort(`: V4i, plus E4e ×2, E4h, E4m, E4j and E4k ×2. M3, clear-all on Retry: E4n (4 requests, no cache hit). M4, a run-metrics refetch on every slice gesture: E4m ×2 (names `analysis_run_metrics`) and E4n. |
| 3+ | Extra: the new gates switched off | **PASS: killed** | B-2 gate off: V4j, V4l–V4n and E4o ×2 fail. B-3 gate off: V4o, E4p ×3 and E4q fail. |
| 4 | `variantMismatch` export, the only change outside `mobile/` | **PASS** | `app/verticals/v1_case_explorer/index.mjs`, +3/−2: the keyword `export` plus a two-line comment. The function body and the model's own call site are unchanged. V1 model 88/88, and the CI check "app/core stays framework-neutral" is green. |
| 5 | Suites and CI | **PASS** | Unit 163/163 · render smoke 77/77 · app/core 10/10 · V1 model 88/88, matching A2b's numbers. `gh pr checks 78`: 10/10 green, run 36839704803 on headSha `969d946`. |
| 6 | Merge mechanics | **PASS** | `969d946` with `origin/main`: clean. Main is now `be86cb1` (#74 merged since QA-078); the merge base is `3647f2e` and only `guardrails.yml` auto-merges. Main has not touched `mobile/`, `app/core`, the V1 vertical or `contracts/api` since the base. `969d946` with `4f46b37`: clean, as a direct descendant. `4f46b37` with main: clean. |
| 7 | Hygiene of the fix commit's 388 added lines | **PASS** | The only URL is `http://backend.invalid:8000`. No IP, email, absolute path or serial-like token. |
| 8 | #65 superseded by #77 | **Confirmed** | `range-diff 44350d4..8170183 3647f2e..ee33f96` reports `8170183 = ee33f96`: patch-identical, and the trees differ only because the parents differ. Closing #65 unmerged loses nothing. |

**Check 1, the rebase.**
- The range-diff shows `a6b98d0`→`7f0dd83` and `0f394dc`→`aa7b967` differing only in hunk-context lines and in one header, `// ---- 4. SCR-04` → `// ---- 5. SCR-04`.
- At `aa7b967`, four files are byte-identical to the reviewed `0f394dc` (README, `ErrorInspectorScreen.js`, `errorInspector.mjs`, `v1_error.test.mjs`).
- `smoke.mjs` holds exactly #78's 135 delta lines, one of them renumbered, plus all 70 of #77's delta lines.

**B-2, the selection gate.**
- **Logic probe** (`qa78d_probe_gate.mjs`, contract loaded with app/core's `createContract`):
  - the pin is read from the contract: `DR-010` / `dr010-worst-slice/v1`;
  - a v1 block is accepted, in the served order;
  - v2, a missing version, rule `DR-999`, a missing rule, and an alias-only v2 block are each refused as `SELECTION_VERSION_UNSUPPORTED` or `SELECTION_RULE_UNSUPPORTED`, with the served value named, no worst list and 0 profile cells.
- **Render probe (live):**
  - the v2, DR-999 and no-version blocks show the reason text, with no list, no jump and 0 bars;
  - the case metrics for the requested variant are still shown.

**B-3, the variant check.** A render probe under the original QA-078 conditions, where every answer is RAW for a PROCESSED request:
- "Asked for PROCESSED, served RAW; a substituted variant is not shown." appears twice, once for the slice and once for the run metrics;
- no worst list, no case metrics, 0 bars;
- fixture mode with PROCESSED looks the same;
- a missing served variant is also refused (logic probe).

**Still open, non-blocking.** These carry over unchanged from QA-078:
- N-4: Retry clears every slice's cached "unavailable" answers, as SCR-03 does. This is a rule decision for Phạm Tuấn Anh.
- N-5: the README still says a run whose metrics answer `GROUND_TRUTH_UNAVAILABLE` gets the unavailable state. Only the case capability gates; the slice view still requests ground truth.
- N-6: SCR-04 does not use `analysis_slice_error`, and the run's mask ids are not compared with the ids of the masks drawn.
- N-7: an out-of-range worst entry is clamped to the edge slice.
- N-8: back to SCR-03 loses a hand-picked run on a multi-run case.
- N-9: the render smoke, now 77 checks, still runs only locally, not in CI.
- N-10: app/core still reads the `slice_selection` alias. The alias is now subject to the same rule and version gate.

N-1, N-2, N-3 and N-11 are fixed.

**VERDICT: MERGE AFTER #77 AND GATE-MOB-01.**
- Close #65 unmerged.
- Merge #77 first.
- Then merge #78 at exactly `969d946` (for example with `--match-head-commit`), with CI green.
- No further QA is needed unless the head moves.

**Scratch.**
- Logs and probes are in `<scratch>/qa78d_*`.
- The worktree `<scratch>/qa78_wt` is at `969d946`, detached and clean.
- Before `git worktree remove`, remove the `qa78_wt/mobile/node_modules` junction with `cmd /c rmdir`. A recursive delete would empty the shared folder.
