# QA re-check: PR #64 at `5cdd92a` · **MERGE** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | **CHAT E, the independent QA.** I am an LLM session (Claude) running under the team leader's account, not a second human reviewer. |
| Head | `5cdd92a`, which equals `origin/feat/ml-evaluate-contract2`. Its merge-base is `origin/main` = `6b52628`, so the delta is the 4 commits `60970f1`, `375d632`, `00a43f1` and `5cdd92a`. |
| Delta | `6b52628..5cdd92a`: 8 text files, **0 binary**, +2038/−18, everything under `ml/`. |
| Rules kept | Read-only throughout. **Single process**: pytest ran in one process; every CLI path I probed ran in-process through `ml.evaluate.main` and `validate_contract2.main`. The only child process was the author's own validator-CLI test, which runs once, sequentially, using only the standard library and jsonschema. GPUs were hidden (`CUDA_VISIBLE_DEVICES=-1`, plus the new `conftest.py`). OMP, MKL and OpenBLAS were limited to 1 thread each. |
| Data | Synthetic only. `CARDIAC_DATA_ROOT`, `CARDIAC_PACKAGE_ROOT` and `CARDIAC_CACHE_ROOT` pointed at scratch paths that do not exist. A read-logger confirmed that no file under the real `cardiac-data` was opened. |
| End state | The worktree is clean at `5cdd92a`. The main checkout is on `main`, and this re-check did not touch it. |

## 1. Is the rebase faithful? Yes

| Check | Result |
|---|---|
| `git range-diff 330be9f^..8dce862 60970f1^..375d632` | Commit 2 is identical (`=`). Commit 1 differs **only in one README paragraph**: the conflict resolution against #60's final README text about the real-split tests. |
| Blob comparison, `8dce862` vs `375d632` | `evaluate.py`, `export_contract2.py`, `manifests.py`, `test_evaluate.py`, `test_export_contract2.py`, `runfixture.py` and `synth.py` are byte-identical. Only `ml/README.md` differs. |
| Base moved from `d5c04bc` to `b606295` (#60 squash) | Hardening only. `case_paths` now refuses absolute paths, `..` segments and paths claimed by two cases. Loaders require a `CasePaths` object. The data root resolves next to the main checkout. A new `conftest.py` hides GPUs. The functions this delta relies on behave the same. |

## 2. Checks at `5cdd92a`

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `python -m pytest ml/tests -q`, run with `-p no:cacheprovider` and a scratch basetemp | **PASS** | **90 passed, 0 skipped**, 43 s. This matches the author's count. |
| 2 | Known-answer metrics (`probe_metrics_v2.py`) | **PASS** | 40/40 checks. My set-based reference agrees on 300 random volumes with 0 disagreements. The bootstrap CI is still bit-identical to the documented recipe (seed 2024). |
| 3 | **B-1, evaluate** (H9) | **PASS** | A forged run split copy, with every in-run sha consistent, now raises `SplitMismatchError` before any read, and nothing is written. Further variants: H9d (the copy equals the frozen file but the recorded sha differs) is refused. H9c and C5 (the default frozen split, i.e. the repo file, against a synthetic run) are refused before any read, so the default fails closed. |
| 3b | **B-1, compare and export** | **PASS** | `compare_runs` on the forged run raises `SplitMismatchError`. Export with the default frozen split refuses a run on another split (X2). A forged split copy whose `run_manifest` sha has been updated is refused at export (X2b). The author's tests cover H9 for evaluate, compare and export. |
| 4 | H1–H8 and C1, C2, C4 | **PASS** | No flag, a flag without an authorization record, `allow_holdout='yes'`, holdout ids in validation predictions, extra holdout entries (ignored, never read), a predictions manifest saying `final_holdout`, the holdout population manifest: all refused. **H8 (N-2) is now refused**: role `FINAL_HOLDOUT` with partition `validation` raises `ValueError`. |
| 5 | **N-3** (X1) | **PASS** | `+dirty` (X1), `UNKNOWN` (X1c) and a `MIXED:` inference version (X1d) are all refused. `--allow-dirty-code` exports and the validator passes, and `.export.json` records `allow_dirty_code: true`, the dirty versions and the frozen split sha (X1b). |
| 6 | **N-8a** | **PASS** | A missing prediction is now FAILED `PREDICTION_FILE_MISSING` with reason `CASE_0005: predictions/validation/CASE_0005.nrrd is missing`. No absolute path or username appears anywhere in `per_case_metrics.json`. |
| 7 | **N-8b** | **PASS** | The README no longer contains a drive-letter path, and the stale note about skipped tests is fixed. No added line in the delta contains a machine path, username, IP, host or email. |
| 8 | **N-8c** | **PASS** | The temp dir is now `.validation.<8 hex>.tmp` (24 characters instead of 37). After a crash mid-write it is removed and there is no final dir (A1, A2). A re-run commits a complete set whose hashes agree with the evaluation manifest. Nothing is ever overwritten. The commit refuses if the target appeared in the meantime, and the temp dir is removed (A5). |
| 9 | **N-6** | **PASS** | `worst_slice_selection` is exactly `{rule_id: "DR-010", selection_version: "dr010-worst-slice/v1", slices}`. That holds both from `evaluate_case` and in the metric-set files on disk. The rule text, metric version and eligible count are in `worst_slice_selection_meta`. An empty eligible set gives `[]`, never padded. Keeping A1's metric names and mapping them at ingest is noted. |
| 10 | Failure handling, unchanged areas | **PASS** | P2–P9 behave as in the first review: no record, wrong shape, NaN, {0,255} and geometry mismatch are all FAILED with a reason; an empty prediction scores 0; a predictions subset refuses the run; intended/successful/failed N are kept. |
| 11 | Contract 2 export | **PASS** | The validator CLI passes on the export (54 runs, 111 artifacts). RAW labels are exact. A second export refuses to overwrite. X3 (`decoder` missing) now prints `EXPORT REFUSED: KeyError`, exit 2, with no traceback. |

## 3. Findings

**BLOCKING: none.** B-1 is fixed, and my own H9 probe now refuses it on every path that uses the defaults.

**NON-BLOCKING, open. Two items have a deadline before the first holdout evaluation, one before the first ingestion.**

- **R-1 (new, residual of B-1). `--split-manifest` is a general-purpose override.**
  - Pointing it at the run's own forged copy reopens H9 deliberately. Through the API (H9b) and the CLI (C6, `--population validation --split-manifest <run>/manifests/split_manifest.json`), the moved holdout case CASE_0101 was scored and its ground truth read, with exit 0 and no `--allow-holdout`.
  - Why this is not blocking:
    - It needs an explicit act that names a file other than the frozen one, and the defaults are closed.
    - It is exactly the override design I proposed for B-1.
    - It is traceable: the population manifest records the forged split's sha, and the default exporter refuses such a run.
  - Fix, before the first holdout evaluation: refuse a `--split-manifest` that sits inside the run directory, and/or pin the frozen split sha256 in code (#60's test already asserts it) so the flag can only name a byte-identical copy. Keep arbitrary splits for tests through the function parameter only.
  - Owner: A1 / Bế Quốc Khánh.
- **N-1 (unchanged, not claimed fixed).** `holdout_authorization` is still checked for presence only: C3 with `"yes"` gives exit 0 and writes a 54-case holdout evaluation. Must be fixed before the first holdout evaluation. Owner: A1 / Khánh.
- **N-6(a) (still open; only the naming part was settled).**
  - The exporter writes `<run>/contract2/<id>.json` with every path relative to `<run>`. Backend branch `21d22dc` still discovers manifests at depth 2 or less (`*.json`, `*/*.json`) and validates with `root = manifest folder`.
  - Re-verified: validating with `root = run dir` gives **PASS**; with `root = manifest folder` it gives **`ARTIFACT_UNREADABLE`**.
  - Must be settled before the first Contract 2 ingestion, which cannot happen tonight anyway: the exporter only handles `final_holdout`, and GATE-ML-01 is open.
  - Owner: A1 with A3.
- **N-5 (unchanged, frozen contract).** The validator still passes a dropped case (M2) and a PROCESSED label on RAW masks (M6). Needs the leader's decision on a contract amendment.
- **N-7 (unchanged, PR #60 cross-reference).** `logits_to_mask` still turns NaN logits into background. The finite check must land with `infer.py`.
- **Nits** (owner A1 / Khánh):
  - **(a)** With a short relative `--run-dir` such as `.`, the scrubber rewrites every matching substring: `…/CASE_0005<run>nrrd is missing`. Scrub only resolved absolute prefixes.
  - **(b)** `is_clean_code_version` accepts any `git:<text>`, including `git:` and `git:synthetic-fixture`. Require a 40-hex commit.
  - **(c)** Export writes the manifest and `.export.json` in two separate steps. A failure between them leaves a manifest without its record and blocks a re-run. Found by reading the code, not probed.
  - **(d)** The README documents `CARDIAC_RUNS_ROOT`, but no code reads it (`--run-dir` is required).
  - **(e)** `compare` still reads `per_case_metrics.json` without checking its sha against the evaluation manifest. This was never claimed as fixed.

## 4. Verdict

**MERGE at `5cdd92a`.**

The rebase is faithful, the blocking finding B-1 is fixed and independently re-verified for evaluate, compare and export, and N-2, N-3, N-6 (the block shape) and N-8a/b/c all hold under my probes. The suite gives 90 passed.

Tonight's EXP-D-025 validation scoring uses the defaults, with no `--split-manifest`, and on that path every holdout route I tried is closed. Before the first holdout evaluation (GATE-IMG-01), R-1 and N-1 must be closed. N-6(a) must be settled before the first ingestion.

---
