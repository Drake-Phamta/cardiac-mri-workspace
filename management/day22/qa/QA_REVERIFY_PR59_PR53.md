## CHAT E: re-verification of #59 and #53

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

Both are **MERGE**. All blockers are fixed and independently confirmed. Neither PR has anything open that blocks merging.

Checked against origin/main 44350d4, which moved again with PR #67 (management docs only). Both PRs merge cleanly with it. The same rules applied: read-only, blob-exact exports (`git -c core.autocrlf=false archive`), no checkout of the shared tree, and no dataset files opened.

### 1. #59 @ 92dd1a9 (C1 preflight): **MERGE**

**History check.** 10081f2 is a pure auto-merge of b40b44e and f5aa763 (identical tree). The PR still touches only `spikes/spike_c_ml/c1/` and `management/day15/`.

**B1 fixed.** I ran the new `check` (with `--package-root`) against the old roots and some new attacks. Every attack is now refused; both correct roots run.

| Root | Before | Now |
|---|---|---|
| Correct junction root (Day 22) | runnable | RUNNABLE, exit 0, 0 validation / 0 holdout |
| Hardlink root from the new `make-root` default | — | RUNNABLE, exit 0, 0/0 |
| Day 22 attack 1: allowlisted names, one link pointing at a validation case directory | **certified runnable** | REFUSED (target check, validation reachable) |
| Day 22 attack 2: one link pointing at the package parent | **certified runnable** | REFUSED, 20 validation / 54 holdout reachable |
| New: hardlink to a validation case's MRI under a training name | — | REFUSED (target check, same-file check, validation reachable) |
| New: extra hardlink to a holdout mask | — | REFUSED (same-file check, holdout reachable) |
| New: junction pointing at a holdout case directory | — | REFUSED |
| New: root inside the package | — | REFUSED (`ROOT-NOT-PACKAGE`) |
| New: root inside a git work tree | — | REFUSED (`ROOT-OUTSIDE-GIT`) |
| Naive package root (the old negative control) | refused | REFUSED, 20/54 |

With a gate OPEN, `--allow-open-gates` now gives exit 2 (labelled dry run) and leaving it off gives exit 1. That non-blocking item is fixed.

**B2 fixed.** The docs now say the right thing: `*.json text eol=lf` (`.gitattributes` line 48) overrides `data/manifests/** -text` (line 40), so the pin must be re-taken from git blob bytes hashed in Python. §4.4 now explains that the `>` redirect is what produced ff1517d0.

**B3 fixed.** Both mutations I flagged as uncaught are now caught:
- A dev→holdout link on a training case fails LEAKAGE-CHAIN-CLEAN, EXCL-DERIVED-FROM-LINKS, SUBSET-EXCLUSIONS-DERIVED, SCREEN-COUNTS-CONSISTENT and SENSITIVITY-SLOT-MATCHES-LINKS.
- An invented census id fails CENSUS-SET-EQUALS-DATASET and HOLDOUT-EQUALS-RELEASED-TESTING-SET.
- The unmodified manifest passes 26/26.

**Non-blocking items.**
- Wording fixed (74 paths, union-find described accurately, #35 merged).
- Redaction confirmed: no hostname, path or scratchpad strings remain in the evidence JSONs or day15 docs.
- `test_preflight.py`: **43/43**, run inside a scratch git work tree.

**Real-data outputs** (I read only the two JSON files):
- **Positive run:**
  - RUNNABLE, exit 0, 41/41 checks; split pin check present and passing.
  - Hardlink layout, 78/78 entries verified, 0/0 reachable, 0 same-file hits.
  - 234 entries walked, which is exactly 78 directories plus 156 hard links.
  - Split and dataset hashes equal the committed blobs (c5c65a09…, f64d461f…).
  - Ran at 1f6ff5b with the C1 code clean; derived exclusions are CASE_0117 and CASE_0133.
- **Negative control:** REFUSED, exit 1, 20 validation / 54 holdout reachable, 222 same-file hits; the seven failing checks match §11.7.
- The file hashes match the ones quoted in §11.7: aa0c85ba…8f93 and 6810a632…d38f.

**Still open (non-blocking):**
1. `test_preflight.py` uses the repository itself as its "inside a git work tree" example. Run from a `git archive` export it fails 1/43. The test should create its own scratch repo.
2. Run on its own without `--dataset-manifest`, `verify_subsets.py` checks the census by count only, so an invented id still passes. This is documented, and preflight always supplies the manifest. Consider making the flag required, or printing a warning when it's missing.

### 2. #53 @ 4729c34 (V1 SCR-03 model): **MERGE**

**History check.** 2879912 is a pure auto-merge of ea5bf32 and 8a94172.

**Tests on the merge with current main:**
- core 10/10, V1 **73/73**, V4 4/4, API contract PASS.
- CI is green on all 8 checks.

**The new tests catch the old bugs.** I put ea5bf32's `index.mjs` back under the new test file. It fails the checks covering every blocker (V1-2, V1-5, V1-9 to V1-16): 21 failing assertions, then a crash.

**My first-pass test scripts against the new model:**
- **B1:** while switching variant the screen is LOADING with no refs; afterwards the mismatch blocks it.
- **B2:**
  - a missing (null) served variant blocks the view;
  - a substituted one gets PREDICTION_VARIANT_MISMATCH with a clear message;
  - the slow-slice-10 then fast-slice-11 race ends on 11.
- **B3:** no stale refs or metrics survive an error.
- **B4:**
  - a FAILED run becomes ANALYSIS_FAILED with VIEW_FAILURE and its failure reason;
  - IN_PROGRESS, CANCELLED and a run belonging to a different case all block, with no prediction and no 3D.
- **B5:** the reviewed-mask layer is not offered; `canEnter3D` depends on the run having succeeded and having reconstructions.

**Non-blocking items from my first pass are fixed:**
- REVIEWED is refused.
- PROCESSING offers REFRESH, and refresh re-reads the run instead of drawing slices.
- No metrics are requested without declared ground truth (UNAVAILABLE, not NOT_APPLICABLE); ground truth is fetched when declared.
- The guardrails comment is corrected.
- The README gives the check count, and V1-23 fails if it drifts.

**Still open (non-blocking):**
1. **#62 interaction is wider than V1-3.** Merging #53's head with #62 (a1b0b40) fails **6 of 73**: V1-3 (×2), V1-19, V1-20 (×2) and V1-21.
   - All six assert DRAFT v0 fixture facts: a placeholder string for `ground_truth_available`, no `case_capability`, no `content_url`/`media_type`, a placeholder `attempt_no`.
   - The model behaves correctly under v1.0: it requests ground truth and metrics when declared and fills `contentUrl`.
   - Fix after #62 merges by deriving those expectations from the bundle and contract, the way V1-7 does.
2. `canEnter3D` stays true on a FATAL_INVALID variant-mismatch snapshot, because it depends only on the run. Renderers must check the view state first, or the flag should be cleared outside SUCCESS.
3. `canEnterError` is a case-level flag. It stays true when a slice's ground-truth fetch comes back unavailable.
4. The case id that `case_get` returns is not compared with the one requested, and `available_run_ids` is not checked. The generator's placeholder ids would fail both; needs a generator follow-up.
5. There are still no geometry checks (validation status, index convention, MRI vs prediction geometry). This is mostly a core-level gap.

All my scratch outputs are in `<qa-scratch>\`:
- `pr59_drive_v2.py`
- `pr59v2_gitcopy` (a scratch git copy)
- `v2_probe_v1c.mjs`
- `pr53x62` (the merged tree)

Nothing in the repository or the shared checkout was modified.
