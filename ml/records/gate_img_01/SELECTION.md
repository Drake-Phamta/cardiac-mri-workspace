# GATE-IMG-01 selection record (validation)

**Rule:** `management/day39/RECOVERY_OVERRIDE_DAY39.md §4`, "Pre-declared rule for GATE-IMG-01". This file records its outcome. Nothing
here was tuned: the candidate set is the closed list PP-0 .. PP-5, and the metric is the `ml/evaluate.py`
case scoring (`ml-eval-1.0.0`).

## Evidence

| Item | Value |
|---|---|
| Source | RAW validation predictions of `EXP-D-100` (20 validation cases, `EXP-D-100/best@epoch6`) |
| Predictions manifest sha256 | `5a96d501e7421980a27a4b51a0b2b4cf6b2afad93796ba090d27298d39ca41f3` |
| Checkpoint sha256 | `58152720f14821297d8b209f4a82e159261b0fbc84691f7d0aebde3c935351fc` |
| Split manifest sha256 | `c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d` |
| evaluation_metric_version | `ml-eval-1.0.0` |
| PP-0 reproduces the recorded raw evaluation, case for case | yes |
| Code version (ml/) | `git:2959114185fbc05b840b81e5755ed44dca271e24` |
| Code version of `ml/postprocess.py` (written into the frozen config) | `git:4c0e7aa1672f20ad57f1ea3c487ddede6d1bf1f8` |
| Libraries | python 3.12.6, numpy 2.2.6, scipy 1.17.1 |

## Candidates: means over the 20 validation cases

| ID | Operations, in order | Mean 3D Dice | Mean IoU | Mean abs. RVE (%) | Cases above / equal / below PP-0 (Dice) | Note |
|---|---|---|---|---|---|---|
| PP-0 | identity | 0.5712 | 0.4135 | 38.59 | 0 / 20 / 0 | reference, not eligible |
| PP-1 | largest_component_3d | 0.5855 | 0.4300 | 35.94 | 19 / 0 / 1 |  |
| PP-2 | fill_holes_2d_per_slice → largest_component_3d | 0.5858 | 0.4304 | 36.42 | 19 / 0 / 1 |  |
| PP-3 | closing_3d → largest_component_3d | 0.5859 | 0.4291 | 40.02 | 19 / 0 / 1 |  |
| PP-4 | opening_3d → largest_component_3d | 0.5930 | 0.4385 | 30.25 | 18 / 0 / 2 | **winner** |
| PP-5 | closing_3d → fill_holes_2d_per_slice → largest_component_3d | 0.5858 | 0.4292 | 40.58 | 17 / 0 / 3 |  |

The last-but-one column counts cases only; no per-case value is recorded in this file. Per-case detail is kept
outside git. Relative volume error (RVE) is in voxels (`07` section 6); spacing is an identity placeholder.

## Result

- **Winner: PP-4** (3D opening (3x3x3 cube, 1 iteration), then PP-1). Highest mean 3D Dice among the eligible candidates
  PP-1 .. PP-5; candidates within 0.001 of the best mean tie and the lower ID wins; the tie set
  was PP-4.
- **Against PP-0 (the raw masks): improves.** Mean 3D Dice 0.5930 against 0.5712, a difference of
  +0.0218. (`improves` / `worsens` mean the winner is above / below PP-0 by more than
  0.001, the tolerance of the tie rule; otherwise `unchanged`. `07` section 5: image processing
  is not assumed to improve the model.)
- **The winner is frozen whether or not it beats PP-0.**

## Frozen configuration

| Item | Value |
|---|---|
| File | `management/day39/gate_img_01/postprocess_config.frozen.json` |
| Format | `ml-postprocess-config/1` |
| config_id | `PP-4` |
| **sha256 of the file bytes** (the `postprocessing_config_sha256` of the authorization record) | `c0a68cc76b598e742c474a845580dba8b8afb9eb073b2588404f11845014961e` |

Operation details (kernel, iterations, connectivity, border handling) are in the file and in the
`ml/postprocess.py` docstring.

## Command

```
python -m ml.gate_img_01 --source-run <CARDIAC_RUNS_ROOT>/EXP-D-100 --population validation --selection-dir management/day39/gate_img_01 --detail-dir <CARDIAC_RUNS_ROOT>/_gate_img_01
```

Run from the repository root on a clean commit of `ml/`; the paths named `<CARDIAC_RUNS_ROOT>` are the run
directories of this PC (`ml/README.md`, "Run directory and evaluation").

## Holdout statement

No final-holdout case was read, predicted or scored for this selection. `ml/gate_img_01.py` builds only the
validation allowlist (`CaseAllowlist.for_validation`) and refuses any other population before reading anything;
the evidence is the 20 validation predictions of `EXP-D-100` already on disk.

## What this record does not do

It does not authorize the holdout. The `ml-holdout-authorization/1` record, with this config's sha256, is the next
commit in the order of events of the override record, section 4.
