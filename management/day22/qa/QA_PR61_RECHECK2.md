# QA-61c: PR #61 delta re-check of the B-4 fix · **MERGE** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. An LLM QA session (Claude Code, Claude Opus 5.5) under the leader's account; not a second human reviewer. |
| **Target** | Head `279d0aa06b68f67089bf1834bfe6c3801da57cda`: one commit on `478002e` (README, `cohort.mjs`, `readers.mjs`, tests; 99 lines added). |
| **Baseline** | `origin/main` is now `985c9c3`. Since my last report it gained #63 (V4 model, plus a CI comment in `guardrails.yml`) and #75 (backend experiment endpoints). |
| **Method** | Read-only as before. CPU only, one process at a time. `<scratch>/qa61b_wt` was moved, detached, to `279d0aa`; it ends clean and byte-identical to that head. `<repo>` is untouched: still `c7a37e0`, only `?? .claude/`. A `git fetch` refreshed remote-tracking refs only. Nothing was deleted, committed, pushed or posted. |

> **VERDICT: MERGE.** B-4 is closed. Every check below passes, and CI is green on GitHub's merge of this head with the current main. One new low, non-blocking finding (N-15). Two earlier notes are downgraded because #75 has landed.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `qa61b_probes.mjs` on `279d0aa` | **PASS** | **40 of 40 hold.** Q1, Q2 and Q4 changed from broken (at `478002e`) to held: the selection is refused as `OUTLIERS_NAME_INELIGIBLE_CASE`, and CASE_0001 gets no number. The status of the other 37 probes is unchanged. The positive controls still hold: P3i (pinned block accepted), P4i (RAW delta 0.05), Q6a and Q6b (empty lists). |
| 2 | V3 suite and `app/core` | **PASS** | V3 `PASS 155/155` (6 new checks, all ok). `app/core` `ALL PASS — 10/10`. |
| 3 | `gh pr checks 61` | **PASS** | 9 of 9 pass. Run 36834532945 has headSha `279d0aa`. CI tested merge commit `ed7fa80`, whose parents are `985c9c3` (current main) and `279d0aa`. Its tree `4ace236` equals my `git merge-tree` result. The CI log shows: V3 155/155, V1 88/88, V4 33/33 + 22/22 + 25/25, core 10/10. GitHub reports MERGEABLE / CLEAN. `guardrails.yml` merges cleanly: the V3 step appears once, after V1. |
| 4a | The guard catches what it should | **PASS** | **M8**, guard disabled: 5 checks fail, matching the author's claim. **M9**, guard weakened to "a non-SUCCEEDED row here" (the paging fallback): 1 check fails, the absent-case check. Both were reverted and the file hash matches its backup. |
| 4b | Design of the fix | **PASS** | • The guard runs only when the rows match the variant, and only after `readOutlierSelection` has accepted the block. The other refusal reasons still take precedence. <br>• The **whole** selection is refused and the offending ids are listed. Nothing is dropped or re-ranked, which is consistent with DR-010. <br>• An entry with no `case_id` is refused, shown as `?` (E5). <br>• The README rule and the paging caveat are accurate. <br>• Imports are unchanged (relative only); no react, react-native or expo. <br>• Hygiene: 0 hits in the 99 added lines and in the commit message. |
| 4c | No regression on rows or intents | **PASS** | When a selection is refused, the rows, points and row intents are unchanged (E2, E6: the same as the control E1). The strip highlight becomes empty (Q1b). SCR-01 `openOutlier` gives a disabled intent with the reason (suite). An all-SUCCEEDED selection is still accepted in served order (E1, and the V3-9 lit-path control). |
| 4d | Agreement with the real backend now on main | **PASS** | `backend/app/metrics.py` (#75) serves the INT-12 case as WITHHELD and ranks outliers on the server, over SUCCEEDED rows only. It uses the contract's literals (`DR-010`, `dr010-outlier/v1`, `dice`, 3) and the contract case fields, and it names `experiment_id` and `prediction_variant`. Every case it names is therefore a SUCCEEDED row of the same answer, so the new guard does not refuse it. |

## Findings

**BLOCKING: none.** B-4 is closed.

**N-15 · NON-BLOCKING (low; new; present before this fix, not introduced by it). Duplicate case ids are not checked.**
- **E3:** a selection naming the same SUCCEEDED case twice (`C2, C2, C3`) is accepted and shows that case twice.
- **E4:** an answer that lists one case twice, once SUCCEEDED and once WITHHELD, lets a selection naming that case pass. The SUCCEEDED copy of the row is also plotted.
- Both need a malformed answer. The backend on main builds one row per case and ranks distinct rows, so it cannot produce either.
- **Fix (Khánh, D23):**
  - refuse a selection that has duplicate `case_id`s;
  - treat duplicate `case_id` rows as drift;
  - also refuse a selection that names a case with any non-SUCCEEDED row.

**Updates to the earlier non-blocking findings:**
- **N-12, downgraded to info.** The backend half is resolved on main by #75 (4d). `ml/evaluate.py` still uses its own outlier ids (`DR-010-outlier`, `dr010-outlier/1.0.0`), but the backend does not serve that block. Khánh may align it for tidiness.
- **N-10, downgraded to low.** For a RAW-vs-PROCESSED pair, the real compare answers `comparable: false` ("not same prediction variant") with `prediction_variant: null`. V3 therefore shows RQ-B as NOT_COMPARABLE with no fair label. The "fair" path needs a drifted server.
- **N-11, N-13 and N-14 are unchanged.**

## Housekeeping
- `<scratch>/qa61b_wt` is now at `279d0aa`, detached. `<scratch>/qa61b_wt_prev` is still at `34f30bd`. Both are still registered as worktrees of `<repo>`.
- New scratch files: `qa61b_probes_279d0aa_out.txt`, `qa61b_tests_279d0aa.txt`, `qa61b_mutate2.ps1`, `qa61b_mutations2_out.txt`, `qa61b_probe_b4edge.mjs`, `qa61b_probe_b4edge_out.txt` and `qa61b_bak/cohort_279d0aa.mjs`.
- Nothing was deleted.

**VERDICT: MERGE** at head `279d0aa`. N-15 joins Khánh's D23 packet, along with N-10, N-11, N-13 and N-14.
