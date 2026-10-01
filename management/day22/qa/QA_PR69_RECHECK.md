# QA-069 delta · PR #69 at `1272dd1` · **MERGE AFTER #77 AND GATE-MOB-01**

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

CHAT E is an LLM session (Claude Code, Claude Opus 5.5) run under the leader's account. **It is not a second human reviewer.**

**Target and scope**
- Target: `origin/feat/day22-v3-screens` = `1272dd13accdbdb90c4cd91b81834d7123ed293a`, one commit on `57acfee`.
- The delta touches 2 files, +54/−3: `mobile/src/verticals/v3/v3View.mjs` and `mobile/test/v3_screens.test.mjs`.
- `origin/main` is still `be86cb1`.

**How it was run**
- Read-only, in `<scratch>/qa69_wt` (detached).
- The fixture bundle was regenerated first. Processes ran one at a time.
- Each mutation was reverted with `git checkout --`. The worktree ended clean at `1272dd1`.
- Nothing was committed, pushed, commented or deleted. The main checkout is untouched: still `main` at `c7a37e0`, with only `?? .claude/`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | **B-1 fixed** | **PASS** | **Logic probe:** the generated EXP-D-PP, after `dice` is picked, reads `6 row(s) returned - the metrics were served for another variant - listed, not drawn, not linked`. Its rows read `CASE_0002 · succeeded - not drawn`, and so on, with no value and every link `ok:false`. The typed cell (RAW metrics, PROCESSED cases) reads `2 row(s) returned - the per-case rows were served for another variant - listed, not drawn`, again with no value. **Rendered EXP-D-PP tap:** the card says "variant mismatch - refused", and the case table shows the same refusal text with no number anywhere. **Sweep of every reachable case table:** 4 openings × 4 fixture scenarios × every metric × every cell gives 427 tables and 1,344 rows. 560 rows carry a value, and every one is a drawn row of a LOADED, variant-confirmed cell. **0 violations**, against **270** for the same sweep at `57acfee`. **Control:** the matching-variant EXP-U-100 still shows `6 row(s) returned, 4 plotted` with values and links. |
| 2 | **M2 now killed** | **PASS** | `routeForIntent` defaulting the variant to RAW makes V3S12 fail: `no row of a refused cell opens SCR-03` (158 pass / 1 fail). An extra mutation, **M4** (restoring the old `valueText` line), also fails V3S12: `no value under a refused variant: 0.900,0.600,0.600,0.400,,`. Both were reverted. |
| 3 | **Suites** | **PASS** | Mobile `node --test`: 159/159, with V3S12 ok. Render smoke: PASS, 59 checks, including V3R1–V3R3, and E1 has 0 `console.error`. `app/core`: 10/10. V3 model: 155/155. |
| 4 | **CI** | **PASS** | `gh pr checks 69` shows 10/10 SUCCESS in run `36839842392` (`pull_request`, `headSha 1272dd1…`, completed/success). The PR is OPEN and MERGEABLE/CLEAN. |
| 5 | **No regression** | **PASS** | All re-checked at `1272dd1` with results identical to `57acfee`. **Crash:** SCR-01 with all seven experiments listed does not crash, and the render shows 0 `CMW_SCREEN_CRASH`. **INT-12 sweep:** 687 strings name CASE_0001 and none carries a digit. **States:** loading, empty list, list/study error with Refresh, empty case rows and the findings error all render as before. **Merges:** `merge-tree` is clean with `be86cb1` (tree `8a3692e`) and with `4f46b37` (tree `780f5ed`). **Hygiene:** the 50 added lines and the commit message are clean. The fix changes nothing for matching-variant cells: the plotted count equals the drawn count. |

**Still open, all NON-BLOCKING and unchanged from QA-069**
- **N-1, SCR-01 numbers:** SCR-01 never shows its comparable-metric numbers.
- **N-2, empty-state copy:** "No the experiment comparison is available."
- **N-3, misleading link reason:** refused rows still give the per-link reason "the server did not return prediction_variant for this case". The table text now states the real reason, so this is mitigated. The model fix belongs to Bế Quốc Khánh.
- **N-4, error codes:** some contract error codes have no words.
- **N-5, device evidence:** not measured.
- **N-6, render evidence:** local only.
- **N-7, merge order:** merge #77 with a merge commit at `4f46b37` first. If #77 is squashed instead, rebase #69 onto the new main before merging.

**VERDICT: MERGE AFTER #77 AND GATE-MOB-01**: merge at exactly `1272dd1`.
