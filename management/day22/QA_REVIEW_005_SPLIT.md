# QA-005 — PR #35 Path A split (`GATE-SPLIT-01`) · **PASS** · 2026-10-01

> **Editorial note (leader's session, at commit time).** This is the QA agent's report as returned. The only
> edit is that the local scratch directory is written as `<qa-scratch>`, a directory outside the repository,
> because this repository is public. Nothing else was changed.

| | |
|---|---|
| **Reviewer** | CHAT E — LLM red-team session under the leader's account, not an independent human (Claude Code, Claude Opus 5.5). This is the independent QA pass named in `RECOVERY_OVERRIDE_DAY22.md` §2 item 2. |
| **Target** | PR #35, `origin/codex/path-a-split`, head `7b72ce83fe09520aefad4eb6f746ed665b9179f1` |
| **Artifact** | `data/manifests/split_manifest_path_a_seed2024.json`, blob `d7f09e08…`, **sha256 `c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d`**, 23,393 bytes, LF line endings, no BOM |
| **Baseline** | `origin/main` was `896c11a` at the start and `771ddb3` at the end (the leader merged eight PRs between 10:46 and 10:52). `dataset_manifest.json` is blob `8886eb5a…`, sha256 `f64d461fe8eaceaa5d867d7223f2db23b8cf30fd6c1841ce8336f99823cd5ea9`, at both |
| **Last approved commit** | `dc26b35` (Trung, 2026-09-17), the pre-rebase twin of `5fd9a85` |
| **Rules applied** | DR-002, DR-002a, DR-002b (`OPEN_DECISIONS.md`) · QA-002 §9 and §9.1 (F5) · QA-003 PRELIM §9.4 and QA-003 FINAL · the GATE-SPLIT-01 row of `RECOVERY_OVERRIDE_DAY22.md` |
| **Method** | Read-only git commands only. Every blob was extracted with Python (`subprocess.run(["git","show",ref+":"+path]).stdout`), then written and hashed as exact bytes; no PowerShell redirect was involved. Scripts ran on the extracted copies in `<qa-scratch>`. Nothing in the repository was modified and nothing was posted to GitHub. |
| **Data handling** | To answer the open QA-003 question with evidence rather than prose, QA read the official ZIP (the leader's INC-001 copy, sha256 `bee5ee5b…`). Only MRIs were read; no label file was opened. This included the 54 holdout MRIs, read for integrity and leakage QA only, as QA-002 and QA-003 did. Nothing from it feeds any model, threshold, checkpoint or preprocessing decision. **This file contains no per-pair score.** Scores and derived features remain in `<qa-scratch>/restricted_out/`, outside the repository; the leader should move them to the restricted channel or delete them. |

> **VERDICT: PASS.** Every GATE-SPLIT-01 criterion holds on the committed blob, and there is no blocking finding. Eight non-blocking findings (N-1 to N-8) follow in §3, each with a fix and an owner.

---

## 1 · Commands and scripts run

| # | Command (scripts are in `<qa-scratch>`) | Purpose |
|---|---|---|
| R1 | `git rev-parse HEAD origin/main origin/codex/path-a-split` · `git log --oneline --graph origin/main..7b72ce8` · `git range-diff ff6431e..dc26b35 41e5154..7b72ce8` · `git diff dc26b35 7b72ce8 -- tools/dataset_split data/manifests/split_manifest_path_a_seed2024.json management/spikes/SPIKE_D_DATASET/` | Resolve the refs, establish rebase identity, and isolate the PR-scoped diff |
| R2 | `git log --all -S "SIMILARITY_THRESHOLD = 0.75" -- tools/dataset_split/split.py` · `git log origin/main -S "0.75" -- management/readiness/OPEN_DECISIONS.md management/day06/QA_REVIEW_002_SPIKE_D.md management/day08/QA_REVIEW_003_SPIKE_D_PRELIM.md` · `git log -p origin/main..7b72ce8`, scanned for `0\.\d{4,}` | Establish when the threshold was declared; look for scores in the PR history |
| R3 | `git ls-tree origin/main -- <each PR path>` · `git check-attr text eol -- data/manifests/split_manifest_path_a_seed2024.json` · `git reflog -8` · `git status --short` | Merge cleanliness, line-ending behaviour, and proof that the working tree was untouched |
| R4 | `python extract.py` | Exact blobs from `7b72ce8`, `dc26b35`, `origin/main` and `8501906`, with their sha256 |
| R5 | `python qa005_verify.py` | **42 checks recomputed from the committed blob** using set algebra and union-find. The manifest's own `invariants` booleans are never read. |
| R6 | `python head_7b72ce8/tools/dataset_split/split.py --selftest` · `python head_7b72ce8/tools/dataset_split/linkage_screen.py --selftest` | The owner's self-tests, run on extracted copies |
| R7 | `python schema_and_regen.py` | Draft 2020-12 validation, 9 mutation probes, and a byte-level regeneration of the manifest with the extracted `split.py` |
| R8 | `python c1_8501906/spikes/spike_c_ml/c1/verify_subsets.py --manifest head_7b72ce8/data/manifests/split_manifest_path_a_seed2024.json --label QA-005/PR35@7b72ce8 --json-out verify_subsets_result.json` | The independent C1 checker from `8501906` |
| R9 | `python rerun_screens.py` | ZIP identity; the owner's screen rerun with the **extracted, committed** `linkage_screen.feature()`; QA-003's method; an attempt to reproduce the restricted-screen hash |
| R10 | `python fp_sensitivity.py` · `python near_threshold.py` · `python break_check.py` | Numerical reproducibility, placement of near-threshold pairs, and the "break after rank 5" claim. These print booleans and counts only. |

## 2 · Checks

### 2.1 Structural invariants (committed blob `c5c65a09…`)

| Check | Result | Evidence |
|---|---|---|
| Partitions are train 80 / validation 20 / final_holdout 54 | **PASS** | Recomputed 80/20/54, matching the stated counts |
| The partitions are pairwise disjoint | **PASS** | \|T∩V\| = \|T∩H\| = \|V∩H\| = 0 |
| They cover exactly the 154 ids of `main`'s `dataset_manifest.json`, each once | **PASS** | Union is 154; every id has multiplicity 1; nothing missing and nothing extra |
| `final_holdout` equals the released `Testing Set` (`partition_as_released`) | **PASS** | 54 = 54 with an empty symmetric difference. Train ∪ validation is exactly the 100 released `Training Set` cases. |
| Effective subsets 25/50/100% have 20/38/78 ids | **PASS** | Recomputed 20/38/78, matching the stated counts |
| The effective subsets are nested by **set containment** | **PASS** | 20 ⊂ 38 ⊂ 78 (strict). The nominal subsets are 20 ⊂ 40 ⊂ 80, and nominal 100% equals train. |
| Every effective-subset id is in train | **PASS** | 0 ids outside train |
| No subset, nominal or effective, holds a validation or holdout id | **PASS** | 0 validation hits and 0 holdout hits |
| CASE_0133 and CASE_0117 are absent from every effective subset | **PASS** | 0 leaks. Both sit in the nominal 50% and 100% subsets and are removed from each; each subset's `excluded_case_ids` equals its nominal set ∩ exclusions. |
| Effective train equals train minus exclusions | **PASS** | 78 = 80 − 2. Effective 100% equals effective train, and `remaining_effective_train_count` is 78. |
| Correlation groups equal the transitive components (union-find over the declared groups and links) | **PASS** | The 4 declared groups equal the union-find components of the declared same-side edges. The full closure, including the single holdout link, has 4 components. The only component that crosses a boundary is {CASE_0027, CASE_0117, CASE_0133}: both of its development members are excluded, neither is in validation, and neither is in any effective subset. **The ZIP rerun (§2.4) gives exactly these 5 pairs.** |
| No group is split across partitions or nested subsets | **PASS** | 0 violations, in both nominal and effective subsets |
| The DR-002a pair CASE_0056/CASE_0097 is one group pinned to train | **PASS** | Both are in train, and nominal/effective membership in the 25/50/100% subsets is 0/2/2. The code pins the pair by removing its group from validation eligibility. |
| Seed 2024 is recorded | **PASS** | `randomization.seed = 2024` |
| Threshold r ≥ 0.75 is declared, with a date before any training | **PASS** | The manifest fields read `0.75`, `>=` and `2026-09-17`. The earliest record on `main` is leader commit `7cde4eb` (2026-09-17 06:24 +07). On the branch the threshold appears in `5fd9a85`, authored 2026-09-17 00:21; its pre-rebase twin `dc26b35` was committed at the same time. There has been no real-data training: C0 used synthetic data only; `8501906` C1_BRINGUP says "No training run was started"; and `RECOVERY_OVERRIDE_DAY22` (10-01) records "Real ML training runs ever executed: 0". |
| The sensitivity analysis names CASE_0027 | **PASS** | `suspected_holdout_case_ids = [CASE_0027]`, with status `PENDING_SPIKE_C1` |
| Exclusion follows the rule (direct link plus group propagation) | **PASS** | Direct: [CASE_0133], linked to CASE_0027. Propagated: [CASE_0117]. |
| Counts are consistent | **PASS** | 9 affected cases recomputed, as stated. 5 pairs = 4 two-case groups + 1 link. 150 groups (76/20/54), 4 of them multi-scan. `patient_group_ids` lists are reproduced exactly; see N-5. |

### 2.2 Provenance

| Check | Result | Evidence |
|---|---|---|
| The source sha256 equals the sha256 of `main`'s committed `dataset_manifest.json` | **PASS** | `f64d461fe8eaceaa…5ea9` at both `896c11a` and `771ddb3`; the PR head's copy is byte-identical. `dataset_generated_at` and the package sha (`bee5ee5b…`) match. The ZIP itself hashes to `bee5ee5b…`. |
| The restricted screen hash and the regeneration command are recorded | **PASS (recorded)** | `restricted_screen_sha256 = bf8d99f2…8022`, and `regenerate` is present. **The hash cannot be reproduced with that command; see N-1.** |
| No per-pair scores are published (F5) | **PASS for the PR's final tree** | The manifest contains exactly one non-integer number, 0.75. Every `exact_score` and `exact_pair_scores` value is `RESTRICTED_BY_F5`. Scanning the PR's text and code for decimals with 2 or more digits finds 9 literals, all explained: the threshold, synthetic self-test values, and the 0.625 mm voxel size. The PR's history and `main` do carry exact scores; see N-2. |

### 2.3 Decisions

| Check | Result | Evidence |
|---|---|---|
| DR-002: Path A, 80/20 by group, seed 2024, 54-case locked holdout | **PASS** | `selected_path: Path A`. The policy reads "80 development-train / 20 validation / 54 locked official holdout". The holdout's usage is "locked final evaluation only…". |
| DR-002a | **PASS** | One group, pinned to train, kept together in every subset; "79 known distinct acquisitions" appears in `patient_grouping` and in `partitions.train` |
| DR-002b (c)+(d), including the 17/09 F5 amendment (i)–(iv) | **PASS** | (i) Threshold fields present. (ii) The id of every excluded case and every group is listed in the manifest and in the `SPLIT_RESULT.md` table. (iii) Counts are 20/38/78 with 78 effective. (iv) The restricted hash and command are present. (d) The sensitivity placeholder is present. N-1 applies to (iv)'s hash comparison. |
| The documented-exception wording is present | **PASS** | "Patient-level separation is NOT VERIFIABLE for this release; …" appears in `patient_grouping.statement`, `invariants.patient_linkage_limitation` and `gate_split_01.documented_exception`. `patient_level_no_overlap = "NOT VERIFIABLE"`. The gate status is `EVIDENCE_READY_FOR_REVIEW` with `closed_by_this_script: false`. |

### 2.4 Tooling

| Check | Result | Evidence |
|---|---|---|
| `split.py --selftest` | **PASS** | 17/17 |
| `linkage_screen.py --selftest` | **PASS** | 5/5, synthetic only |
| Validation against `split_manifest.schema.json` | **PASS** | The schema is valid Draft 2020-12, and the manifest has 0 errors. **The schema is weak, however: it accepts 7 of the 9 mutation probes; see N-3.** |
| `verify_subsets.py` from `8501906` | **PASS** | 18/18, "ALL CHECKS PASS"; the manifest sha256 it reports is `c5c65a09…` |
| Determinism: regenerate the manifest with the extracted `split.py`, the ZIP-reproduced screen, and `main`'s dataset manifest | **PASS** | The only field that differs is `restricted_screen_sha256`. With the recorded value restored, the output is **byte-identical** to the committed blob (`c5c65a09…`). No hand edits; the membership follows from seed 2024 and the declared pairs. |
| Independent rerun of the owner's screen from the official ZIP | **PASS** | The ZIP is 2,200,962,438 bytes with sha256 `bee5ee5b…`; 154 MRIs read. The pairs at or above 0.75 are **exactly the 5 declared**, and the known duplicate ranks first. The set is identical under float32 and float64 accumulation. |

### 2.5 Diff from the approved commit `dc26b35` to the head `7b72ce8`

| Check | Result | Evidence |
|---|---|---|
| The approved commits survived the rebase unchanged | **PASS** | `range-diff` shows all 4 as patch-identical (`33b0c7c=0efc69b`, `735de6d=a0b9246`, `da579e6=44ddbd6`, `dc26b35=5fd9a85`) plus two new commits, `a3e3cfb` and `7b72ce8`. The 148-file whole-tree diff comes from the rebase (base `ff6431e` → `41e5154`), not from PR content. |
| Membership is unchanged | **PASS** | Train, validation, holdout, all subsets and the exclusions are identical at `dc26b35`, `5fd9a85`, `a3e3cfb` and `7b72ce8` |
| What changed | **PASS: consistent with the decisions, no leak, no change in meaning** | In the manifest (8 lines): `generated_at`; the source sha changed from `91bd6171…` (the pre-F5 manifest) to `f64d461f…` (the F5-narrowed manifest merged by #34), along with `dataset_generated_at`; and two new descriptive fields, `screen_method` and `group_semantics`. `split.py` gains 18 lines (the same two fields plus a transitivity self-test). The schema gains 2 property definitions. `SPLIT_RESULT.md` changes text only. |
| Merge readiness | **PASS** | The PR adds 7 new paths, none of which exists on `main@771ddb3`. `dataset_manifest.json` has not changed on `main` since the PR's base. |

### 2.6 The QA-003 transitivity question (PRELIM §9.4: "4 groups vs 3 components")

**Status: RESOLVED.** The evidence:

- **One definition.** Groups are the transitive connected components of same-released-partition pairs, and pairs that cross the boundary are holdout links. This is now stated in the manifest's `group_semantics` field, implemented with union-find in the code, and covered by a new self-test.
- **The owner's method, rerun from the ZIP.** 5 pairs, giving 4 same-side groups and 1 link, with 4 components in the full closure. That is exactly what the manifest declares.
- **QA-003's method, reimplemented.** It reproduces QA-003's recorded 4 pairs and 3 components, and that pair set is a strict subset of the owner's. The single difference is CASE_0081/CASE_0095, both in train.
- **No effect on the split.** Using QA-003's 4-pair set, `split.py` produces the **identical** 80/20/54 membership. Neither grouping leaks in either direction.

## 3 · Findings

### BLOCKING
**None.**

### NON-BLOCKING

**N-1 · NON-BLOCKING (medium, provenance). The recorded restricted-screen hash cannot be reproduced by the recorded regeneration command.**
- **What I tried.** I reran the committed `linkage_screen.py` (its blob has never changed since it was introduced) on the ZIP. I tried four distinct inputs: no `--split-manifest`, plus each of the three distinct memberships across the eight committed split-manifest revisions. Each was serialized with both LF and CRLF line endings. None of the outputs hashed to `bf8d99f2…`.
- **Causes.**
  - The `regenerate` command passes the *current* split manifest, but the screen file embeds per-pair flags for the proposed partition. The screen was actually produced on 2026-09-16 against an earlier draft (DR-002b's "proposed train↔validation crossing" is consistent with the `44ddbd6` draft). The command is therefore circular (screen → split → screen) and cannot regenerate the recorded bytes.
  - The file stores 60 scores rounded to 6 decimal places from float32 BLAS products. Switching to float64 accumulation changes 40 of the top-200 rounded values, so a hash over the bytes depends on the environment.
- **What does reproduce.** Every score that drives a decision: the ≥ 0.75 set equals the 5 declared pairs.
- **Why it matters.** The F5×DR-002b ruling (QA-002 §9.1) describes the reviewer's check as "rebuild every score from the ZIP, then compare the hash". The second half of that check does not work today.
- **Fix (owner Khánh, Day 23, text in `SPLIT_RESULT.md` only, so blob `c5c65a09` stays frozen):**
  - Record the exact inputs that produced `bf8d99f2`: the split-manifest commit passed to `--split-manifest`, the archive basename, and the Python, numpy and pynrrd versions and OS.
  - State that the reproducibility criterion is the set of pairs at or above the threshold, not byte equality.
  - For any future screen, drop `--split-manifest` from `regenerate`, or hash a canonical sorted list of the above-threshold case-id pairs.

**N-2 · NON-BLOCKING (medium, F5 consistency; outside the PR's final tree). Exact per-pair scores are public elsewhere, and #35's case ids make them attributable.**
- `main`'s `OPEN_DECISIONS.md` (DR-002b, "What is established", item 4) publishes three exact 6-decimal scores.
- The PR's own history carries the same three: commit `44ddbd6`, in `PATIENT_LINKAGE_EVIDENCE.md`; `5fd9a85` removed them.
- Combined with #35's public case ids (the single development↔holdout link) and the public history of the draft split, each value can be tied to a named case pair. QA reproduced all three to 6 decimal places and confirmed the attribution privately.
- F5 ("stay narrow until the release/DDA terms are read") is therefore already breached for three pairs. #35's final tree adds no new score.
- **Fix (leader):** decide whether F5 still covers these three values.
  - If it does, redact DR-002b item 4 to "≥ 0.75 (exact value restricted by F5)" and squash-merge #35 so that `44ddbd6`'s patch stays out of `main`'s history. The evidence of when the threshold was declared survives through `7cde4eb`.
  - If it does not, record that these three values are deliberately public.

**N-3 · NON-BLOCKING (low/medium, tooling). The JSON Schema only checks shape; it does not guard what the gate depends on.**
- It accepted 7 of the 9 probes:
  - dropping `threshold`;
  - dropping `restricted_screen_sha256` and `regenerate`;
  - dropping the groups and links;
  - adding a numeric `exact_score` to a link;
  - putting holdout case CASE_0027 into the train ids;
  - putting excluded case CASE_0133 into the effective 25% subset;
  - setting an invariant to false.
- It rejected only the values pinned by `const` (threshold 0.80, seed 2025).
- The self-tests are not in CI either.
- **Fix (Khánh / CI):**
  - Make the DR-002b fields `required`.
  - Pin link items to `exact_score: const RESTRICTED_BY_F5` with `additionalProperties: false`.
  - Add both self-tests, `verify_subsets.py`, and a check that "the split's source sha equals sha256 of `dataset_manifest.json`" to CI.

**N-4 · NON-BLOCKING (low, documentation). `SPLIT_RESULT.md` gives the wrong cause for the QA-003 discrepancy.**
- It says QA-003 "screens same-shape pairs only". That is true but irrelevant: all five declared pairs are same-shape (from the public dataset manifest).
- The only pair QA-003's method misses, CASE_0081/CASE_0095, is 576×576×88 on both sides. The real cause is the sampling method (thumbnail stride versus a normalized grid).
- **Fix:** replace that paragraph with the §2.6 facts.

**N-5 · NON-BLOCKING (low, hazard for consumers).**
- **(a) Group ids are hard to read.** `patient_group_ids` are sequential numbers, not anchored to case ids, and the manifest has no case→group map. For example, `PATIENT_GROUP_0115` = {CASE_0117, CASE_0133}, while CASE_0115 belongs to `PATIENT_GROUP_0113`.
- **(b) The obvious field is the wrong one.** The plainly named `case_ids` fields (`partitions.train` and `training_subsets.*`) include the two excluded cases; only the `effective_*` fields are trainable. The C1 tools at `8501906` and `294519e` correctly read `effective_case_ids`.
- **Fix:** add a public case→proxy-group map in a future version. Every training loader should assert that it reads `effective_*` and that the excluded ids are absent.

**N-6 · NON-BLOCKING (low; a latent defect, not triggered here).**
- `split.py` removes only the DR-002a group from validation eligibility.
- A group linked to the holdout could therefore be drawn into validation. It would not be excluded, and the only guard is the requirement that at least one exclusion exists.
- Edges that cross the boundary are not used for grouping either, so two development cases linked through the same holdout case (A~H~B) are not grouped.
- Not triggered here: validation contains no affected case, which was verified.
- **Fix before any regeneration:** make holdout-linked groups ineligible for validation, or refuse the split; build exclusion components over all edges.

**N-7 · INFO, NON-BLOCKING (disclosure of residual risk).**
- Under the owner's method, one declared pair clears 0.75 by less than 0.01, and three undeclared pairs fall within 0.02 below it. Two of those three cross partitions: one train↔validation, and one effective-train↔final_holdout.
- The gap from rank 5 to rank 6 is the largest successive gap from rank 5 through rank 50, and the second largest over ranks 2–20. "Break after rank 5" is therefore supported, but the margin is thin.
- This is the residual risk DR-002b (b) accepted, and the rule was applied uniformly. Case ids are recorded only in the restricted output.
- **Leader's option:** a second sensitivity list covering near-threshold holdout cases is allowed only if it is declared **now**, before any C1 or holdout metric exists (`06` §6).

**N-8 · INFO, NON-BLOCKING (process).**
- **(a) Review and CI.** The only human approval (Trung, at `dc26b35`) is stale. Under the Day 22 override, this QA plus CI replaces it. QA did not inspect GitHub CI (by instruction). `DAY20_REBASELINE` records guardrails as green on `7b72ce8`. The leader must confirm CI is green before merging.
- **(b) The provenance pin.** It holds only while `dataset_manifest.json` stays at `f64d461f`. The override holds #54 through Day 30. Close the A19 "split and manifest IDs" deferral in an audit addendum, not by regenerating `dataset_manifest.json`.
- **(c) The gate record.** It must say `06` §6 was **deviated with the documented exception of DR-002b**, not "satisfied". Report and slide authors should use DR-002b item 5's sentence, or the manifest's equivalent wording.
- **(d) Concurrent activity.**
  - Another session switched this shared working tree during the review: `main` → `spike-c1/run` (commit `294519e`, unpushed) → `docs/board-daily` (`e81125a`).
  - QA ran no checkout; `git status` shows only the pre-existing `?? .claude/`.
  - The `294519e` C1 runner reads `training_subsets.25_percent.effective_case_ids` and refuses validation and holdout ids, which is consistent with this split.
  - Its preflight pin must be the blob hash `c5c65a09…`, not the CRLF+BOM `ff1517d0…` (DAY20 CP-06).
  - `.gitattributes` resolves the manifest to `text`, `eol=lf`, so a fresh checkout hashes to the blob value on Windows too. Note that the `data/manifests/** -text` line is shadowed by the later `*.json text eol=lf`.

## 4 · Archiving note

The QA scripts in `<qa-scratch>` can be copied to `management/day22/qa005/`, as was done for qa002 and qa003, but two things need attention first:
- `fp_sensitivity.py` embeds the three values already published on `main` as constants; read them from `OPEN_DECISIONS.md` at runtime instead.
- `extract.py` and `rerun_screens.py` contain local absolute paths; turn them into parameters.

Do not copy anything from `restricted_out/`.

**VERDICT: PASS**

---

## 5 · Disposition (leader's session, 2026-10-01)

- **CI before merge:** 6/6 green on `7b72ce8` (the set of checks that ran on that head); main's 8 checks green after
  the merge.
- **Merged** with a merge commit at the QA'd head (`--match-head-commit 7b72ce8`) as `f5aa763`, 11:16. The merged
  blob was re-hashed from git bytes: 23,393 bytes, sha256 `c5c65a09…396d`, no BOM, no CRLF.
- **GATE-SPLIT-01 CLOSED** at 11:16 under the pre-declared rule of `RECOVERY_OVERRIDE_DAY22.md` §4, with 06 §6
  recorded as deviated with the documented exception of DR-002b (N-8c).
- **N-2** (merge commit or squash). Merged with a merge commit, as planned. The three values are already in
  `main`'s tree through `OPEN_DECISIONS.md`, and `main` cannot be rewritten, so squashing would not have reduced the
  exposure. Whether F5 still covers them is a leader decision for Day 23.
- **N-7** is a leader decision. If a second sensitivity list is wanted, it must be declared before any holdout metric
  exists, so before GATE-IMG-01 freezes.
- **N-1, N-3, N-4, N-5, N-6** go to Bế Quốc Khánh's Day 23 packet; **N-8b** stays a standing rule (#54 held).
- **Restricted output** in `<qa-scratch>/restricted_out/`: left in place outside the repository. Deleting or moving it
  is the leader's call.
