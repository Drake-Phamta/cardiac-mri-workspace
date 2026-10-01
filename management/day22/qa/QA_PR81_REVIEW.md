# QA review: PR #81 `ml: holdout guardrails` (#64 QA R-1, N-1) · **MERGE** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| **Reviewer** | **CHAT E, the independent QA.** I am an LLM session (Claude) running under the team leader's account, **not a second human reviewer** (RECOVERY_OVERRIDE_DAY22 §2.2). |
| **Target** | PR #81, branch `ml/holdout-guardrails`. Head **`2da86006b3424b79e9040b9f762488675bbf2fd6`** is a single commit on `origin/main` `be86cb1`, which is also the merge-base. `ls-remote` confirmed both refs were unchanged at the end. |
| **Scope** | The delta `be86cb1..2da8600`: 10 text files, 0 binary, +1172/−157. That is the new `ml/holdout.py`; changes to `ml/evaluate.py`, `ml/infer.py`, `ml/export_contract2.py` and `ml/README.md`; and the tests `runfixture`, `test_evaluate`, `test_export_contract2`, `test_holdout` (new) and `test_train_infer`. |
| **Authorities read** | QA_PR64_REVIEW (B-1, N-1, N-2; probes H1–H9, C1–C4) · QA_PR64_RECHECK (R-1, H9b, C6) · DR-016a · RECOVERY_OVERRIDE_DAY22 |
| **Environment** | Windows 11, Python 3.12.6, numpy 2.2.6, pytest 8.3.4. torch 2.5.1+cu121 ran on **CPU only**: `CUDA_VISIBLE_DEVICES=-1`, and `torch.cuda.is_available()` was False in every process. OMP, MKL and OpenBLAS were limited to 1 thread. **One process at a time**: the only child processes were the suite's own and the queue's own `ml.train` children, which run sequentially. Peak working set was **≤ 574 MB** per process. |
| **Data** | **Synthetic only** (`ml.tests.synth`). `CARDIAC_DATA_ROOT`, `CARDIAC_PACKAGE_ROOT`, `CARDIAC_CACHE_ROOT` and `CARDIAC_RUNS_ROOT` pointed at paths under `<scratch>` that do not exist. A `sitecustomize` audit hook ran in **every** Python process: the suite and its 4 children, the probes, the end-to-end run, and the queue with its `ml.train` child. It logged **0 file accesses** under `cardiac-data` or `cardiac-runs`. |
| **Repository** | Read-only. I used a detached worktree `<scratch>/qa81_wt` at `2da8600`. It is clean at the end: the mutants were restored and `git status --porcelain` is empty. No commit, push, merge, comment or label. The main checkout `<repo>` was not touched: it is still on `main` at `c7a37e0`, with only the pre-existing `?? .claude/`. `git fetch` updated remote-tracking refs only. |
| **Time** | About 25 of the 45 minutes |

> **VERDICT: MERGE at `2da8600`.** R-1 and N-1 are closed in code and independently re-verified for infer, evaluate, compare and export, and N-2 holds as well. 207/207 tests pass on CPU, CI is 9/9 green on this head, and the four DR-016a files are byte-identical to `c7a37e0`. There is **no blocking finding**. Six non-blocking items follow. Of these, NB-1, NB-3 and NB-4 should land before the Day 24 holdout evaluation, and NB-2(a) is a check for tomorrow's queue.

## 1 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Frozen files (DR-016a) | **PASS** | `git diff --stat c7a37e0 2da8600 -- ml/train.py ml/data.py ml/models.py` prints nothing, and the same holds for `ml/queue.py`. The blob ids are identical at `c7a37e0`, `be86cb1` and `2da8600`: train `9d148ec8`, data `0683a5df`, models `2cb6f43e`, queue `2cac86b0`. |
| 2a | Test suite | **PASS** | `python -m pytest ml/tests -q -p no:cacheprovider --basetemp <scratch>/qa81_p1`, with `CUDA_VISIBLE_DEVICES=-1`: **207 passed**, 0 failed, 0 skipped, 115 s. `test_holdout.py` has 65 tests (counted from its parametrization), as the author states. The 3,323 warnings are all pynrrd's `datetime.utcnow()` DeprecationWarning. |
| 2b | CI | **PASS (no ML job)** | `gh pr checks 81`: **9/9 pass**, run `36846192298`, `headSha` = `2da8600`. `guardrails.yml` has no ML job, so the 207 tests are local evidence only (NB-6). |
| 3 | **R-1 closed** | **PASS**, with one residual by design (NB-2) | 23 split probes, every refusal with **0 case reads and 0 files changed** in the run directory. **Default frozen sha pinned:** C5 (repo split vs a synthetic run), **H9** (run copy moves CASE_0101 into validation, all in-run shas updated), H9-x (forged split named), **H9b** and H9b+switch (the run's own copy named, through the API), **C6** (CLI `--split-manifest <run>/manifests/split_manifest.json`), C6-x and C6-syn (any `--split-manifest` that is not the frozen sha), compare and infer variants. All refused. **Synthetic split pinned as frozen:** B-H9, B-H9-x, B-H9b and B-C6 are refused. A byte-identical copy *outside* the run is accepted and reads only the 2 validation masks. The run's genuine copy *inside* the run is refused. Upper-case, `..` and relative spellings of the in-run path are all refused. **CLI switches:** `--allow-unfrozen-split` on `evaluate run`, `evaluate compare`, `infer` and `export`, and `--confirm-frozen-morphology` on `infer`, all exit 2 (argparse). **API:** `allow_unfrozen_split=True` on final_holdout is refused by evaluate (`HoldoutSplitError`), by export, and by the author's infer and compare tests. **Residual:** the API on *validation* with the TEST-ONLY switch still accepts a forged split outside the run (B-RESID; NB-2). |
| 4 | **N-1 closed** | **PASS** | **92 refusal probes, each with 0 reads under the synthetic package root and 0 files changed.** They cover evaluate (API and CLI), infer (API and CLI) and export. **Malformed records:** a bare `yes`, `"yes"`, an empty file, truncated JSON, `{}`, `[]`, UTF-16, a duplicate key, `NaN`. **Insufficient records:** missing `authorized_runs` / `split_sha256` / `authorized_by` / `decision_ref`; an unknown field; format `/0`; gate `OPEN`, `closed` and `GATE-ML-01`; a split sha of `f…` or the repo sha while the synthetic split is pinned; another experiment; another checkpoint; a missing, absolute or `..` `decision_ref`; a time with no offset; `authorized_at` before `closed_at`; the old `{confirm_frozen_morphology_sha256}` form, both as a file and as a dict. **Paths:** a directory or a missing path. **Flags:** H1, H2, H3, C1–C4, and C3 with a gate-OPEN record. **Run binding:** a **replaced `best.pt`** is refused, and so is a record re-issued for the replaced `best.pt` ("predictions were made with checkpoint …"). Also refused: predictions that embed `"yes"`; predictions made under a different valid record; infer with `checkpoint=last`. **Export:** 10 probes are refused: embedded gate OPEN, other checkpoint, `"yes"`, missing `decision_ref`, the evaluation naming another record, a replaced `best.pt`, the switch, and an in-run split. |
| 4b | Positive path | **PASS** | **Fixture:** with a valid record, the 54-case holdout evaluation read **exactly 54** reference masks (primary n 54, sensitivity n 53). The evaluation manifest carries the record sha and `frozen_split.is_frozen: true`. Export followed, then `validate_contract2.py` (in-process `main`) gave **exit 0**: "PASS: Contract 2 DRAFT v0 … 54 analysis run(s), 111 artifact(s)". The export record carries the record sha. **Real model** (§6): holdout infer gave 54/0, then evaluate, export and validator **PASS**. A UTF-8 record with `authorized_by` "Bế Quốc Khánh", `Z` offsets and two `authorized_runs` is accepted (F1). |
| 5 | **N-2** | **PASS** | All refused before any read: holdout predictions role relabelled `VALIDATION`; validation predictions relabelled `FINAL_HOLDOUT` (the H8 replay); holdout predictions partition relabelled `validation`; validation, holdout-role and holdout-partition relabels of the population manifest, with the pm sha updated so that only the role check can catch them. At export, refused: evaluation manifest role `VALIDATION`, and population manifest partition `validation`. |
| 6 | Validation path for tomorrow's queue, with **no** record | **PASS** | **(a)** The suite's `test_train_infer_evaluate_export_chain` and `test_queue_runs_trains_evaluates_compares_and_survives_a_failure` pass. **(b) In-process, with the switch off and the synthetic split pinned (tomorrow's code path):** `ml.train.run_experiment` COMPLETED, then post-train validation `ml.infer`, then `ml.evaluate`. Results: 2/2/0, role `VALIDATION`, `holdout_authorization: null`, `is_frozen: true`, and only `validation/` directories. The holdout then follows with a real model (row 4b). **(c) Command line:** `python -m ml.queue --queue <scratch>/qa81_q/queue.json` with a synthetic one-experiment queue and its runs root under `<scratch>`. Result: exit 0 in 8 s; the `ml.train` child exited 0; the run is COMPLETE; validation predictions and evaluation are present (2/2/0) with no record and no holdout directory. Synthetic data cannot be pinned across the child-process boundary, so the queue run used the TEST-ONLY switch; (b) covers the path with the switch off. |
| 7 | Breaking changes and documentation | **PASS, with a documentation miss (NB-1)** | Both flags are gone (argparse refuses them, row 3). `git grep` on `be86cb1`: every use is inside `ml/` files that this PR rewrites. **No** script, doc outside `ml/`, or workflow uses them. `ml/configs/matrix_queue.template.json` sets neither `allow_unfrozen_split` nor a split path. The only head hits outside negative tests are `ml/README.md:21`, which is stale (NB-1), and the README's own description of the old form as refused. The README documents the record well enough to write one: a full example, a field table, the refusal list, and how the record travels. Two practical gaps are covered in NB-4. |
| 8 | Test strength (mutation) | **PASS** | Each mutant was applied in the worktree, the tests run, and the original bytes restored. `git status` was empty afterwards and nothing was pushed. **M1 (record `split_sha256` check off): killed by 2 tests. M2 (`authorized_runs` check off): killed by 5**, across evaluate, export and infer. Also killed: M4 (in-run split check off, 1 test), M5 (`decision_ref` existence off, 1), M6 (same-record check off, 2), M7 (N-2 predictions role check off, 1), M8 (`refuse_unfrozen_split` off, 1). **M3** (the run-split re-check inside `verify_record`) survives; it is an equivalent mutant, because every caller enforces the frozen split first (NB-5d). A first mutation pass gave setup errors because my `--basetemp` parent did not exist. That was a harness error and was discarded; the evidence above is from the re-run. |
| 9 | Publication hygiene | **PASS** | 1,172 added lines: no machine path, username, email, IP, host or secret, and no `cardiac-data` or `cardiac-runs` path. There are no binary files, and `git diff --check` is clean. The only drive-letter and backslash strings are two deliberately invalid `decision_ref` inputs in a negative test. A cosmetic nit is listed in NB-5c. |

## 2 · Findings

### BLOCKING
**None.**

### NON-BLOCKING

**NB-1 · The README module table still documents the removed flag.**
- `ml/README.md` line 21 still says the final holdout runs "only with `--population holdout --confirm-frozen-morphology <sha256>`".
- That flag now exits 2, so following the line fails closed. But it is the first line an operator reads, and it contradicts lines 127 and 240ff.
- **Fix:** replace it with `--population holdout --holdout-authorization <record.json>` (format `ml-holdout-authorization/1`).
- **Owner:** leader session. Due before Day 24, as a follow-up doc commit.

**NB-2 · Residual of R-1: the TEST-ONLY switch can still put a holdout case into validation.**
- **What still works.** With `allow_unfrozen_split=True`, a forged split *outside* the run directory can move a frozen-holdout case into validation, and the case is read and scored. The switch is reachable two ways:
  - through the API;
  - equivalently, through `"allow_unfrozen_split": true` in a config run via `python -m ml.train` or `ml.queue` (`train.py` reads it, and DR-016a freezes that file).
- **Probe B-RESID.** CASE_0101 was scored as `VALIDATION`, and 3 reference masks were read.
- **It is recorded.** The evaluation manifest has `frozen_split.is_frozen: false` and `allow_unfrozen_split: true`, and the run manifest lists a recipe deviation.
- **It is quarantined.** Such a run's split copy is not frozen, so holdout infer, evaluate and export all refuse it (B-H9, HSW, X-switch).
- **Why it is not blocking.**
  - It needs an explicit config key, and the matrix template does not set it.
  - It is recorded.
  - It cannot produce a holdout number.
  - It is the design QA-PR64 accepted: "keep arbitrary splits for tests through the function parameter only".
- **Fix.**
  - **(a) Day 23, operational:** before starting the UNet queue, check that no queue config sets `allow_unfrozen_split`. After each run, check that `run_manifest.json` has `frozen_split.is_frozen: true`.
  - **(b) After DR-016a lifts:** make the switch refuse any package or cache root under the real data root (`ml.data.default_data_root()`), in `train.py`, `infer.py` and `evaluate.py`. The switch can then only ever touch synthetic data.
- **Owner:** Bế Quốc Khánh for (a); leader session for (b).

**NB-3 · `decision_ref` is only checked for existence.**
- **Any file passes.** Probe N1-README-ref: `README.md` is accepted.
- **It need not be committed.** The check is `Path.is_file()` on the working tree. It passed with a checkout root that is not a git repository, although the error message says "commit the GATE-IMG-01 decision first".
- **Fix:** require the path to be tracked at HEAD (`git cat-file -e HEAD:<path>`) and its text to contain `GATE-IMG-01`. Optionally, require it to be under `management/`.
- **Until then:** the leader checks `decision_ref` by eye when signing the record.
- **Owner:** leader session. Due before Day 24.

**NB-4 · Writing the real record on Day 24: two steps the README does not give.**
- **(a) Where `checkpoint_sha256` comes from.**
  - Copy `checkpoint.sha256` from the run's `run_manifest.json`.
  - `Get-FileHash` also works, but it prints **uppercase** hex, and the record requires lowercase, so it would be refused. Use `.Hash.ToLower()`.
- **(b) Save the file as UTF-8.**
  - An ANSI (cp1252) file with a non-ASCII name is refused (F2), and so is UTF-16, which is stock PowerShell 5.1's `>` default.
  - Both fail closed, but they would fail on the day.
  - Accepted: UTF-8 with or without a BOM, `Z` or `+07:00` offsets, and Vietnamese names (F1).
- **Fix:** add two README lines (leader session).
- **Khánh, Day 23:** dry-run writing a record against a synthetic run.

**NB-5 · Nits.** Owner: leader session.
- **(a) The infer CLI does not catch `ValueError`.**
  - A replaced `best.pt` that no longer matches `run_manifest.json` ends in a traceback with exit 1, instead of `REFUSED` with exit 2 (F4).
  - Nothing is written.
  - Fix: add `ValueError` to the except tuple in `ml.infer.main`, as `ml.evaluate` does.
- **(b) No clock sanity.** `closed_at` and `authorized_at` in 2099 are accepted. Refuse times later than now plus a small skew.
- **(c) A stray whitespace edit.** `CONTRACT ="contract2_experiment_artifact"` in `ml/export_contract2.py`. It changes no behaviour.
- **(d) An untested defensive check.**
  - `verify_record`'s own run-split check cannot fire on any current call path (M3).
  - Keep it as defence in depth, and pin it with a direct unit test.

**NB-6 · CI has no ML job.**
- The 207 tests ran only on this machine (CPU, 115 s).
- This is outside the PR's scope. It goes on the leader's CI backlog: an ML CPU job with `CUDA_VISIBLE_DEVICES=-1` and `HF_HUB_OFFLINE=1`.
- **Owner:** leader session.

**What the author claimed, and whether it held:**

| Claim | Held? | Evidence |
|---|---|---|
| Both flags were removed | **Yes** | Row 3 (C7) |
| The run's own split copy is always refused | **Yes**, even when it is byte-identical to the frozen file | B-R1-inside |
| Holdout refuses `allow_unfrozen_split=True` | **Yes** | HSW, X-switch, M8 |
| N-2 relabels are checked | **Yes** | Row 5 |
| 207/207 tests pass | **Yes** | Row 2a |
| `train.py`, `data.py`, `models.py` and `queue.py` are unchanged | **Yes** | Row 1 |

## 3 · Verdict

**MERGE at `2da8600`.** The two guardrails QA-PR64 required before the first holdout evaluation are in place:
- **R-1:** only the pinned frozen split is accepted on every CLI and every holdout path, and a run can never vouch for its own split.
- **N-1:** a structured GATE-IMG-01 record is verified before any holdout case is read or anything is written. It binds the gate, the frozen split, the `decision_ref`, and this run's `experiment_id` with the sha of its `best.pt`.

The validation path that tomorrow's queue uses works with no record, both in-process and through `ml.queue`.

| Step | Who | What |
|---|---|---|
| 1 | Phạm Tuấn Anh | Merge at `2da8600`. CI is 9/9 green on that head (override §4). |
| 2 | Leader session | Before Day 24, in one follow-up commit: NB-1 and NB-4 (README), NB-3 (`decision_ref` hardening), and the NB-5 nits. CHAT E then re-checks that delta. |
| 3 | Bế Quốc Khánh | Day 23: adopt the PR. Do the NB-2(a) check on the UNet queue configs and run manifests. Dry-run writing a record against a synthetic run (NB-4). |
| 4 | Khánh with the leader | Day 24, after GATE-IMG-01: commit the decision record and the authorization record, then run holdout `ml.infer` → `ml.evaluate` → `ml.export_contract2 --validate`. |

---
- **Probe scripts**, in `<scratch>/qa81_probes/`:
  - `qa81_audit.py` and `sitecustomize.py`: the read-logger;
  - `qa81_probe.py`: 98 probes;
  - `qa81_e2e.py`, `qa81_mutate.py`, `qa81_followup.py`.
- **Outputs:** `<scratch>/qa81_*.txt` and `<scratch>/qa81_audit_*.log`.
- **Synthetic work directories:** `qa81_w2`, `qa81_e2e1`, `qa81_q`, `qa81_f1`, `qa81_mt2` and `qa81_p1`. `qa81_w1` is an empty directory left by a failed first start.
- **Worktree:** `<scratch>/qa81_wt` is left in place (detached, clean), under the delete-nothing rule. The leader may remove it with `git worktree remove`.
