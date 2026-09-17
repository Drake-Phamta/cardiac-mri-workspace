# Spike C1 measurement plan — design only

| Field | Value |
|---|---|
| Owner | Bế Quốc Khánh |
| Date declared | 2026-09-17 (Day 8) |
| Status | **DESIGN ONLY — EXECUTION BLOCKED** |
| Blocking gates | `GATE-DATA-01`, `GATE-SPLIT-01` |
| Governing decisions | `DR-002b`, `DR-007`, `DR-011` |
| Intended reviewer | Vũ Hùng Anh |

This document prepares the final real-data feasibility spike without starting it. It does not read a real
case, open a holdout label, train a model, freeze a recipe, or claim a measurement. Spike C1 may start only
after Spike D is accepted and the final split manifest is merged.

## 1. Non-negotiable preflight

Every item below must be checked from the merged commit used for the run. A failed or unknown item stops the
run; it is not converted into an assumption.

- [ ] Spike D has status `ACCEPTED`, with `DATASET_AUDIT.md` and its public manifest on `main`.
- [ ] `GATE-DATA-01` is closed by the leader after independent QA.
- [ ] `GATE-SPLIT-01` is closed and the Path A split manifest is on `main`.
- [ ] The manifest records Pearson threshold `r >= 0.75`, all four correlation groups, effective train
      count 78, and effective nested subset counts 20 / 38 / 78.
- [ ] `CASE_0133` and grouped `CASE_0117` are absent from every effective training subset.
- [ ] The selected C1 cases are members of the effective **training** partition only.
- [ ] No validation case and none of the 54 locked holdout cases is mounted or addressable by the C1 job.
- [ ] The public manifest hash, restricted linkage-screen hash, code commit, checkpoint revision and
      preprocessing version are captured before execution.
- [ ] `pipeline_bringup.py` from PR #37 has landed or its exact reviewed commit is pinned.
- [ ] The run directory is outside Git; no dataset or checkpoint bytes can be staged.

The preflight record will be saved as `c1_preflight_<timestamp>.json`. It must contain the gate state, source
commit, split-manifest SHA-256, selected case IDs, partition proof and an explicit `holdout_case_count: 0`.

## 2. Subset rule

The split declared in PR #35 (`dc26b35`) defines nominal nested training subsets of 20 / 40 / 80 and
effective subsets of **20 / 38 / 78** after `DR-002b` exclusions. Spike C1 will use the smallest effective
subset that can represent both released source-shape strata while keeping complete correlation groups.

Selection is deterministic:

1. read only `partitions.training.effective_subsets` from the final merged split manifest;
2. begin with the effective 20-case subset;
3. verify that every selected case is training-only and that correlation groups are not split;
4. verify representation of the measured 576×576×88 and 640×640×88 strata;
5. if either stratum is absent, escalate instead of hand-picking cases or widening the subset silently.

The run record must list every selected case ID and the exact JSON pointer from which it came. It must also
record the excluded training cases (`CASE_0133`, `CASE_0117`) and why they are absent. No case may be selected
after looking at its segmentation quality, loss, Dice, boundary thickness or visual appearance.

## 3. Harness boundary

The reviewed synthetic pipeline in PR #37 is the control-flow skeleton only. The C1 extension may replace
the synthetic loader with a manifest-gated real-data loader, but it must preserve:

- one epoch/sanity-run entrypoint for both `unet_base16_depth4` and
  `dinov2_s14_frozen_progressive` before any longer run;
- checkpoint save/reload verification and output-equivalence check;
- structured JSON evidence, fail-closed errors and explicit device/framework versions;
- DR-011 per-volume percentile normalization plus fixed pretrained-model constants;
- identical resize, channel conversion, loss, threshold and measurement logic across model families;
- no production-pipeline claim and no launch of the six experiment-matrix runs.

New C1 code must reject a selected ID that is not in the effective training subset and reject manifests whose
source hash, threshold declaration or exclusion list does not match the preflight record.

## 4. Criterion-to-evidence matrix

| Criterion | Planned measurement | Required evidence | Pass boundary |
|---|---|---|---|
| `C1-1` | CUDA peak allocated/reserved memory for both families at the same practical input and declared batch | per-step JSON samples, `nvidia-smi` snapshot, aggregate table | measured for both families; OOM is recorded, never hidden |
| `C1-2` | warm-up excluded wall-clock per train step and validation step; extrapolate with actual effective-train slice counts | raw timings + machine-generated arithmetic JSON | method and assumptions stated; supersedes C0 estimate |
| `C1-3` | trial only predeclared sizes divisible by 16 and 14 (112-step grid, starting at 560) | configuration list, memory/timing outcome per size | one practical resolution selected or an honest `NO_FIT` result |
| `C1-4` | inspect decoder outputs on training-only validation folds inside the selected C1 subset | fixed case/slice panel, raw logits/masks, reviewer notes | anatomy-specific failure modes reported for both families |
| `C1-5` | measure LA boundary thickness in voxels on selected training masks and compare with effective decoder output resolution | per-case distribution + aggregation code + decoder stride trace | distribution and comparison reported; no claim from synthetic data |
| `C1-6` | short, equal-budget convergence sanity for both families | step-level loss logs and generated curves | decreasing trend without NaN/Inf/divergence, or `NEGATIVE_RESULT` |
| `C1-7` | inspect preprocessing config and runtime record | `preprocessing_version`, percentile parameters, pretrained constants | no cohort-fitted statistic; identical rule across fractions/families |
| `C1-8` | prove subset membership and gate state before loading | preflight JSON, selected IDs, split-manifest hash | all selected IDs training-only; validation/holdout count exactly zero |
| `C1-9` | machine-extrapolate six core runs plus one derived ablation from C1 timing | arithmetic JSON and calendar assumptions for available 4 h/day and 5 h/day windows | explicit YES/NO verdict; no manual optimistic override |
| `C1-10` | map every `07` §2 `ADR-ML-001` field to a measured artifact | coverage table with file/JSON pointers | no field marked supported without an artifact |

## 5. Run order and stop rules

1. Run preflight without loading NRRD voxels.
2. Load exactly one selected training case and verify dtype, geometry, mask mapping and normalization record.
3. Run one forward/backward/reload cycle per family.
4. Run the equal-budget convergence sanity trial per family.
5. Generate memory, timing, boundary and decoder evidence from those trials.
6. Run the extrapolation script and write the final calendar verdict.
7. Render the criterion table from machine-readable evidence; do not type measured values into the report.

Stop immediately on a gate/hash mismatch, non-training case, non-finite input/loss, geometry outside the
accepted boundary, unknown mask mapping, checkpoint reload mismatch, or attempted holdout access. OOM and a
calendar verdict of `NO` are valid negative evidence, not reasons to modify the protocol after seeing results.

## 6. DR-002b sensitivity-analysis reservation

Spike C1 itself does **not** evaluate the locked 54-case holdout. It only prepares the future final-evaluation
schema with two immutable slots:

- `primary_all_holdout`: metric over all 54 locked holdout cases;
- `sensitivity_without_suspected_linkage`: the same frozen predictions and metric code, excluding only
  `CASE_0027`, whose threshold relation is public while its exact pair score remains restricted by F5.

These slots stay `NOT_RUN` during C1. The shared limitation must accompany every later number:

> Patient-level separation is not verifiable for this release. The implemented safeguard is case-level
> disjointness plus correlation-screen grouping and exclusion under the predeclared `r >= 0.75` rule.

No model, threshold, recipe or case list may be changed based on the sensitivity result.

## 7. Planned artifact layout

```text
spikes/spike_c_ml/c1/
  preflight.py                 # manifest/gate/subset checks; no voxel read
  run_feasibility.py           # gated extension of pipeline_bringup.py
  measure_boundary.py          # training-only mask measurement
  extrapolate.py               # C1 timing -> 6 runs + 1 ablation

<external private evidence>/
  c1_preflight_<timestamp>.json
  c1_measurements_<timestamp>.json
  c1_loss_<family>.jsonl
  c1_boundary_<timestamp>.json
  checkpoints/
```

Only code, schemas, aggregate evidence allowed by the data policy and rendered documentation may enter Git.
Raw NRRDs, masks, checkpoints, per-file restricted hashes and restricted linkage scores remain outside it.

## 8. Review checklist

Vũ Hùng Anh should independently verify the selected IDs against the merged split manifest, rerun preflight,
confirm both model families use the same measurement protocol, inspect one checkpoint reload, and challenge
the calendar arithmetic. The leader alone may close `GATE-ML-01`; this plan and C0 evidence cannot do so.
