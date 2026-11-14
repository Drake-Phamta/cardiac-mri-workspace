# Contract 2 — experiment artifacts (DRAFT v0)

## Status: frozen as v1.0 on 2026-10-01 (INT-11)

This contract is **frozen at v1.0** together with API Contract 11 v1.0.0 and
Contract 1 (Day 22 recovery override). After the freeze, changes are additive
only, by a PR from the contract owner reviewed by the leader, with the exporter
(`ml/export_contract2.py`) updated in the same change.

- The manifest wire literal `contract_version: "DRAFT v0"` is **kept unchanged**
  as the identifier of this frozen revision, so exporters written against it
  today stay valid; changing the literal is itself a breaking change.
- **The inference-only case (INT-12) requires no change here.** The evaluation
  population stays the 54-case `FINAL_HOLDOUT`, including the inference-only
  case (`CASE_0001` under split `path_a_seed2024_dr002b_v1`), and its metrics are
  computed against its ground truth like every other case. Withholding is a
  product configuration applied by the API (API Contract 11
  `case_capability`): cohort summaries keep the case (so its values can be
  derived from them: INT-12 is hidden, not blinded, DR-017), while its per-case
  and per-slice ground-truth-derived values, worst-slice selection and error
  data are never served.
- **Failed cases and completeness (DR-018)** need no schema change. A case whose
  inference fails has **no run** in `analysis_runs`; it is listed, with its
  reason, in the PER_CASE_METRICS artifact's `failures`. The validator now
  checks completeness (see "Completeness checks").

This directory contains an offline contract for precomputed experiment outputs.
It is a review artifact, not a production ingestion module or API implementation.
No clinical images, masks, weights, or other generated data are committed here.

## Acceptance boundary

An experiment artifact manifest is accepted only when both upstream gates are
`ACCEPTED`: `GATE-SPLIT-01` (the deterministic Path A split) and `GATE-ML-01`
(the model/training gate). The manifest must set `precomputed: true`, identify
the code, preprocessing, postprocessing, metric, split, and subset versions,
and point to the immutable checkpoint and manifests by SHA-256 checksum.

Path A evaluation is the exact `FINAL_HOLDOUT` population of 54 test cases.
The `split_manifest`, `training_subset_manifest`, and holdout manifest are
separate references so that a later consumer cannot silently substitute a
different split or subset.

The gates and the holdout count are explicit manifest assertions in this DRAFT
v0. The validator does not query an external gate registry or parse the
holdout file to recount cases; a future production ingestion service must
cross-check those claims before acceptance.

## Required experiment record

The `experiment` object records model family/variant, decoder, training
fraction (0.25, 0.50, or 1.00), seed, preprocessing and postprocessing
versions, prediction variant (raw or processed), evaluation metric/code
versions, training code version, checkpoint, and the three metric artifacts:
summary, per-case, and per-slice. `num_test_cases` is fixed at 54 for this
draft.

## Artifact and provenance rules

Every artifact has a stable `ART_...` id, an `artifact://` URI, a relative
source path, media type, SHA-256 checksum, and `immutable: true`. Raw masks are
never overwritten. A processed prediction must cite its raw prediction; a 3-D
reconstruction must cite the raw or processed mask it used. A metric set must
declare its reference mask kind (`GROUND_TRUTH` or `REVIEWED`), prediction mask
id/kind, and evaluation version. Analysis runs tie masks, metrics, and meshes
to one case and one run id.

The validator also enforces idempotent re-ingestion: the same URI and checksum
is `NO_OP`; the same URI with a changed checksum is a hard
`CHECKSUM_CONFLICT`. Relative paths cannot escape the package root.

## Completeness checks (DR-018)

Given the package root, `validate_manifest` reads the PER_CASE_METRICS artifact
(the file `ml/evaluate.py` writes: `population.case_ids`, `prediction_variant`,
`failures: [{case_id, reason_code, reason}]`) and the evaluation population
manifest (`case_ids`), and refuses (`EVALUATION_POPULATION_INVALID`,
`DUPLICATE_ANALYSIS_RUN` or `PROVENANCE_INVALID`) unless:

- the number of analysis runs plus the number of listed failures equals
  `experiment.num_test_cases` (54), and an analysis run is never `FAILED`;
- every case of the evaluation population appears exactly once, as a run or as a
  failure, no case is both, none twice, none outside the population, and the
  population of the metrics artifact equals the population manifest;
- every run's `case_id` matches its artifacts: each artifact a run uses (raw and
  processed mask, metric sets, reconstructions) is used by that run alone, reads
  its own file, carries the run's `case_id` and `analysis_run_id`, lives under
  `artifact://.../runs/<run id>/`, and names no other case in its id or path;
- the mask kind matches the prediction variant: a RAW_PREDICTION experiment
  scores RAW_PREDICTION_MASK artifacts, a PROCESSED_PREDICTION experiment
  scores PROCESSED_PREDICTION_MASK artifacts and every run has its processed
  mask; a metric set's `prediction_mask_kind` equals the experiment's variant and
  the mask it points at; the metrics artifact's `prediction_variant` agrees.

The result also reports `listed_failures`. `ml/export_contract2.py` follows the same
rules (DR-018 rule 1): a case whose inference failed is exported with no analysis run
and stays listed, with its reason, in the PER_CASE_METRICS `failures`; its output
passes these checks.

## Local checks

Run the synthetic, data-free checks from this directory:

```powershell
python test_contract2.py
```

The test builds a valid 54-case holdout package (and one with a listed failure,
and a PROCESSED one) and exercises both gate failures, precomputed enforcement,
checksum conflicts, missing metric references, provenance failures, path
traversal rejection, idempotent re-ingestion, and each DR-018 refusal as a
mutation: a dropped case, two runs on one case, one mask shared by two runs (and
by every run), a swapped `case_id`, an artifact under another run or naming
another case, a PROCESSED label on a RAW mask (and the reverse), a case listed
and also run, a failure outside the population, a different population manifest.
The Python validator applies `schema.json` with a Draft 2020-12 JSON Schema
validator before its semantic checks, then verifies checksums and provenance.
It requires the repository's `jsonschema` package:

```powershell
python validate_contract2.py --manifest <manifest.json> --root <artifact-root>
```
