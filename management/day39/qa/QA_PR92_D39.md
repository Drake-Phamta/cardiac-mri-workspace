# QA PR #92 (GATE-IMG-01 post-processing, PP-4 selection, EXP-D-PP derive, exporter DR-018)

> **Record note.** LLM QA report (CHAT E role, an agent under the leader's account, not a human reviewer), returned on 2026-10-18 under the Day 39 override. Local paths are redacted (`<scratch>`, `<repo>`, `<data>`, `<runs>`); nothing else is edited.

**LLM QA (CHAT E role), not a human review.**

- PR head SHA reviewed: `c925f26098c5ba770e5dd8572a86add3ffd5cb6d` (3 commits on `e3417ba`; `origin/main` is `66a428c`, mergeable, clean merge-tree)
- Rule checked against: `management/day39/RECOVERY_OVERRIDE_DAY39.md` section 4 (on main) and `management/readiness/OPEN_DECISIONS.md` DR-018
- Holdout: no holdout case was read, predicted or scored by this review. All reads were EXP-D-100 validation predictions and validation references (allowlist `CaseAllowlist.for_validation`).
- Nothing was written inside the repository or the run directories. The scratch scripts and outputs are under `scratchpad/d39/qa/`.

## VERDICT: MERGE AFTER FIXES

The science and the code are correct and I found no defect in them. One item is BLOCKING and it is procedural: required CI check "no dataset / checkpoint / secret bytes" is red because the branch is stale. It is not caused by anything in the PR.

BLOCKING count: 1 (CI red, stale base; fix needs no code change).

## Checks

| # | Check | Result |
|---|---|---|
| 1a | Candidates PP-0..PP-5 equal the rule (ops, order) | PASS. `ml/postprocess.py:99-106` table is PP-0 identity; PP-1 largest; PP-2 fill, largest; PP-3 close, largest; PP-4 open, largest; PP-5 close, fill, largest. A test pins the table to the override text. |
| 1b | Op parameters | PASS. Cube 3x3x3 (`:109`), `iterations=1`, 26-connectivity `generate_binary_structure(3,3)` (`:110`). Hole fill is `binary_fill_holes` per `[y,x]` slice on axis 0 (`:128-133`). `read_nrrd_zyx` gives `[z,y,x]` and the volumes are (88,576,576) or (88,640,640), so axis 0 is the 88-slice axis. Empty in gives empty out (`:190`). |
| 1c | Border handling | PASS, documented in the module docstring and in `ml/README.md`. Closing is zero-padded by 1 and cropped, so it is extensive and the volume edge does not erode. Opening uses `border_value=0` with no padding, so a structure thinner than 3 voxels on a border slice is removed. Sensitivity, my own check: with an erosion that ignores the outside (`border_value=1`) the opening-then-largest mean is 0.59278 against 0.59300. The winner and its margin are unchanged. |
| 1d | dtype preserved, deterministic, input untouched | PASS. `astype(src.dtype)` at `:194`, and non-binary or non-3D input is refused (`:153-163`). Covered by tests for uint8, bool and int types, and for determinism. |
| 2a | `ml/gate_img_01.py` uses `ml/evaluate.py`'s own scoring | PASS. It calls `E.make_pair_loader`, then `E.evaluate_population` and `E.cohort_summary`. The only addition is the `transform` hook, which a normal evaluation leaves as None. |
| 2b | Validation only | PASS. A population other than `validation` raises `GateRefused` before anything is read (`:128`). The predictions manifest must be EXP-D-100, RAW, with no `derived_from`, and the partition must be validation. Only the validation allowlist is built, and `D.case_paths` is bound to it. A test asserts the module never builds a holdout allowlist. |
| 2c | Tie rule | PASS. `select_winner` (`:79-90`) excludes PP-0, takes the best mean, collects every eligible candidate within 0.001 of the best (plus 1e-12 float slack), and picks the lowest numeric ID. This is the natural reading of the rule. It was not triggered here, because PP-4 leads the next candidate by 0.0071. |
| 2d | Independent recompute | PASS. My own morphology (manual erode/dilate, `np.ones((3,3,3))` label structure) and my own Dice, run read-only on the 20 validation cases, matched `gate_run.json` bit for bit for all six means. The count columns also match. Means: PP-0 0.571209; PP-1 0.585498; PP-2 0.585805; PP-3 0.585857; PP-4 0.592997; PP-5 0.585836. Winner PP-4 (strict argmax and the tie rule agree). |
| 2e | SELECTION.md table | PASS. Every mean, IoU and RVE row and the winner agree with the recompute at the printed 4 decimals. The "improves, +0.0218" wording follows the rule. |
| 2f | PP-0 equals the recorded raw evaluation | PASS. `metrics_summary.json` cohort dice_3d mean is 0.571208631762457, identical to PP-0's. The gate also asserts case-for-case equality with `per_case_metrics.json` and aborts on any difference. |
| 3a | Frozen config hash on disk | PASS. `sha256sum` of `management/day39/gate_img_01/postprocess_config.frozen.json` is `c0a68cc76b598e742c474a845580dba8b8afb9eb073b2588404f11845014961e`. |
| 3b | Frozen config hash as git blob | PASS. `git cat-file -p HEAD:<path> \| sha256sum` gives the same value. |
| 3c | Line endings protected | PASS. `.gitattributes` has `*.json text eol=lf` and `*.md text eol=lf` (`git check-attr`: text set, eol lf). The blob and the work-tree bytes are both LF. |
| 3d | Config provenance | PASS. `code_version` is `git:4c0e7aa...`, which is the last commit touching `ml/postprocess.py`. `ml/` is unchanged between `2959114` (the commit the gate ran on) and HEAD. |
| 4a | Holdout derive refuses without a valid record | PASS. `derive_run` (`:319-326`): a missing record raises, a malformed one is refused by `H.load_record`, and the unfrozen-split switch is refused. The CLI also refuses before any work (`:536-538`). |
| 4b | Record's `postprocessing_config_sha256` equals the config file's sha | PASS. `H.verified_block(..., experiment_id="EXP-D-PP", prediction_variant="PROCESSED_PREDICTION", postprocessing_config_sha256=config_sha)` (`:363`), and `verify_record` refuses null or a mismatch. |
| 4c | The record lists EXP-D-PP and EXP-D-100 with the same best.pt sha, and the raw holdout predictions carry that same record | PASS. A second `verify_record` runs for EXP-D-100 (`:366`) and `require_same_record(pm["holdout_authorization"], ...)` (`:368`). A missing, presence-only or other record is refused. All of this runs before any prediction file is read. The best.pt sha is recomputed from the file and compared with the manifest and the run manifest (`:357-359`). |
| 4d | Can a normal run abuse `derived_from` to skip the checkpoint check? | PASS. `MF.derived_from` only accepts a block when `experiment_id == "EXP-D-PP"`, the variant is `PROCESSED_PREDICTION`, the source is `EXP-D-100`, both shas are lowercase 64-hex, and `postprocessing_config_sha256` is present. I probed 10 synthetic manifests. Refused: a RAW EXP-D-100 with the block, EXP-D-PP with a RAW variant, EXP-D-025 processed, EXP-D-PP derived from EXP-D-050, EXP-D-PP without a config sha, `{}`, `False`, `0`, and uppercase hex. Accepted: only the legitimate one. A run that has no block takes the unchanged best.pt-file path. See NB-1 for the remaining trust boundary. |
| 5a | DR-018 rule 1: failed case gives no run, kept in failures | PASS. `ml/export_contract2.py:236-253`. A case without a metric set is skipped (`:270`). The PER_CASE_METRICS file is checksum-verified before it is read. `failed_pred <= listed` is enforced and `failed_n` and `successful_n` must match. |
| 5b | Refuse if a case is neither a run nor a failure | PASS. `scored \| listed != set(intended)` raises. Overlap, duplicate failure rows, and "no case scored" also raise. `num_test_cases = len(intended)` (`:345`), so runs plus failures equal 54. |
| 5c | PROCESSED export with the correct mask kind | PASS. `mask_kind = PROCESSED_PREDICTION_MASK` for the derived run. Per case there is one RAW artifact (the byte copy, sha-checked against `raw_source_sha256`), one PROCESSED artifact citing it via `source_artifact_id`, and a METRIC_SET whose `prediction_mask_id` is the processed mask. `processed_prediction_mask_id` is filled in each run. A PROCESSED run without `derived_from` is refused, and so is a RAW run carrying a config sha. |
| 5d | Sidecar fields | PASS. The `.export.json` now carries `prediction_variant`, `postprocessing_config_sha256`, `derived_from`, `failed_case_ids`, `analysis_run_count`, and `postprocessing_code_version` (under `code_versions`). |
| 6a | `pytest ml/tests -q`, `CUDA_VISIBLE_DEVICES=-1`, `PYTHONIOENCODING=utf-8` | PASS: **263 passed**, 0 failed, 149 s (4816 DeprecationWarnings from `nrrd` `utcnow`). Claim confirmed. |
| 6b | `gh pr checks 92` | **FAIL** on 1 of 11: "no dataset / checkpoint / secret bytes" (4 s). The other 10 pass, including mobile render smoke. There is no CI job that runs `ml/tests`, so the 263 are local evidence only. |
| 7 | Public-repo hygiene | PASS. The added lines hold no absolute path, IP or drive letter. The only regex hits were the `artifact://experiments/...` URIs. They hold no CASE_#### id and no per-case value. SELECTION.md carries aggregate means and above/equal/below counts, the manifest, checkpoint and split checksums, and placeholders like `<CARDIAC_RUNS_ROOT>`. |

## BLOCKING

**B-1. Required CI check is red: "no dataset / checkpoint / secret bytes".**

- Log: `IPv4 scan: ... 1 private address(es)`, `mobile/test/config.test.mjs:100: <private IPv4> in 10/8 (DR-019 rule 2)`.
- Cause: the scan diffs `BASE=66a428c` (current main) against the PR head with a two-dot diff. The branch forked at `e3417ba`, before #87/#88, so every file main changed since then appears as "added" with its OLD content. The PR head still has the pre-#88 line `maskBaseUrl('http://<private-ip>:8000')`, and main already has `<private-ip>`. The PR does not touch `mobile/` or `.github/`. The repository's own bytes and secrets scan finds no forbidden bytes: I ran the same extension filters over `BASE..HEAD` and got none.
- Override section 2 requires "an independent QA pass plus green CI".
- Smallest fix: merge `origin/main` into `ml/gate-img-01-postprocess` with a **merge commit** (there is no conflict) and re-run CI.
- Do NOT rebase and do NOT squash-merge. The frozen config's `code_version` is `git:4c0e7aa1672f20ad57f1ea3c487ddede6d1bf1f8`, and SELECTION.md names `git:2959114...`. A rebase or squash would orphan those hashes, and they are part of the recorded provenance. Merging main in leaves them reachable. The project's "Merge PR #N" style on main keeps them too.
- After the merge commit `ml/` should be byte-identical to this review (`git diff c925f26 HEAD -- ml management/day39` empty). If so, this QA stands for the new head.

## NON-BLOCKING

- **NB-1. A derived run's evaluation and export trust its own manifest.** `ml.evaluate._authorize_holdout` and the exporter accept `derived_from.checkpoint_sha256` as asserted. They do not re-check that the processed masks equal `apply(config, raw_source)`. They also cannot check `derived_from.predictions_manifest_sha256`, because the source manifest is not in the derived run. A hand-made EXP-D-PP directory that claims EXP-D-100's best.pt sha would therefore pass evaluation. The exporter's `--source-run` proves the checkpoint file exists, not that the predictions came from it. Nothing in this PR is wrong, since `derive_run` is the producer. A cheap hardening would be to have the exporter, or `evaluate_run` for a derived run, re-hash `raw_source/*.nrrd` against `raw_source_sha256`, re-apply the frozen config copy in the run, and compare with the processed masks (a few minutes on 54 volumes).
- **NB-2. The exporter places the checkpoint before it verifies the authorization.** `materialize_derived_checkpoint` (`ml/export_contract2.py:222`) hard-links or copies best.pt into the derived run before `H.verify_embedded` (`:224`). The sha is verified and a refused export leaves a harmless but unexpected file. Moving the call after the authorization check would be tidier.
- **NB-3. Selection-bias caveat for the report.** The +0.0218 mean Dice gain for PP-4 over raw (0.5930 against 0.5712) is measured on the same 20 validation cases that picked `best.pt` (epoch 6 of 50). 18 of 20 cases improve and 2 worsen. PP-1 alone gives +0.0143, and the opening adds +0.0075 on top. No interval or paired test is given. The rule was pre-declared and the null is stated honestly, so this is fine for the gate. The holdout comparison, not this table, is the evidence (`PR-SCI-03`).
- **NB-4. Border effect worth a sentence in the report.** In my read-only check all 20 raw validation masks have foreground on the first or last z slice, which suggests border-slice false-positive islands. Opening with `border_value=0` removes thin structure there. The conclusion is robust, because the ignore-outside erosion variant gives 0.59278 against 0.59300.
- **NB-5. Tie rule wording.** The tie set is anchored on the best mean, and it is not transitive. This is the natural reading of the rule and was not triggered. One line in `management/day39/gate_img_01/SELECTION.md` or the README could state it.
- **NB-6. No CI job runs the ML tests.** The 263-test result is local only (and passes). Worth a follow-up, but outside this PR.
- **NB-7. Minor.** The config sha reader accepts a UTF-8 BOM (`utf-8-sig`). The sha binds the actual bytes, so this is harmless.

## What I did not do

I did not run `ml.gate_img_01` itself again, so as not to write into `_gate_img_01/`. The independent recompute stands in for it. I did not run holdout inference, evaluation or derivation, and I did not read any holdout case. I have not seen the authorization record (the next commit in the sequence), so its contents are not reviewed here.

Scratch files (outside git): `scratchpad/d39/qa/recompute.py`, `scratchpad/d39/qa/sens.py`, `scratchpad/d39/qa/recompute_means.json`, `scratchpad/d39/qa/pytest_pr92.txt`.
