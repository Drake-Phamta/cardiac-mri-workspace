# Contract 2 — experiment artifacts (DRAFT v0)

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

## Local checks

Run the synthetic, data-free checks from this directory:

```powershell
python test_contract2.py
```

The test exercises a valid 54-case holdout manifest, both gate failures,
precomputed enforcement, checksum conflicts, missing metric references,
provenance failures, path traversal rejection, and idempotent re-ingestion.
The Python validator applies `schema.json` with a Draft 2020-12 JSON Schema
validator before its semantic checks, then verifies checksums and provenance.
It requires the repository's `jsonschema` package:

```powershell
python validate_contract2.py --manifest <manifest.json> --root <artifact-root>
```
