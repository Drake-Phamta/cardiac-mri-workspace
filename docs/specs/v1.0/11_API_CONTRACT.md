# 11 — API CONTRACT

**Status:** Frozen v1.0 logical/API contract — serialization/transport details may be refined only by ADR without changing semantics  
**Depends on:** `05`, `09`, `10`

---

## 1. Purpose and contract level

This file freezes the **resource semantics, required operations, state/error behavior, provenance fields, and geometry contract** between mobile, backend, and analysis artifacts.

Implementation ADRs may choose exact framework, binary encoding, object-store URLs, compression, or generated client approach, but they may not silently remove required operations or change scientific meaning.

Default examples use REST under `/api/v1`.

---

## 2. General rules

- Version the API (`/api/v1`).
- JSON is used for metadata/control payloads unless a binary/artifact representation is more appropriate.
- Large MRI/mask/mesh payloads may be returned directly, by chunk/slice endpoint, or by versioned artifact URL according to `ADR-ART-001`.
- All resources use de-identified internal case IDs.
- Errors use stable machine-readable codes plus safe human-readable messages.
- Every artifact response/reference that participates in geometry must identify `geometry_contract_version` and source artifact/version.
- Stale client writes must be rejected through a version/ETag/revision mechanism chosen by implementation; silent last-write-wins on reviewed masks is prohibited.

---

## 3. Study and cases

### Study

`GET /api/v1/studies/{study_id}`

Required semantic response:

- study identity/name;
- dataset identity/version/acquisition tag;
- case counts by mode capability;
- available experiment summary;
- capability flags (ground-truth evaluation, 3D, review, live analysis if implemented);
- high-level comparable metric summary/outlier entry points when available.

### Case list

`GET /api/v1/studies/{study_id}/cases`

Supported minimum query semantics:

- pagination or bounded list;
- optional case search by internal ID;
- optional `mode=EVALUATION|INFERENCE_REVIEW`.

Richer filtering is `PR-FILTER-01` (SHOULD).

### Case detail

`GET /api/v1/cases/{case_id}`

Required semantic response example:

```json
{
  "case_id": "CASE_0001",
  "mode": "EVALUATION",
  "ground_truth_available": true,
  "volume": {
    "shape": [640, 640, 88],
    "spacing": [1.0, 1.0, 1.0],
    "origin": null,
    "direction": null,
    "geometry_status": "VALIDATED",
    "geometry_contract_version": "..."
  },
  "available_run_ids": ["RUN_001"]
}
```

Numbers above are illustrative. Runtime values come from the validated package.

---

## 4. MRI and slice/artifact access

The implementation must provide operations equivalent to the following, even if binary delivery is implemented through signed/versioned artifact URLs.

### MRI slice

`GET /api/v1/cases/{case_id}/slices/{slice_index}/mri`

Must validate slice range and identify source volume version/checksum or cache version.

### Ground-truth slice

`GET /api/v1/cases/{case_id}/slices/{slice_index}/ground-truth`

If ground truth does not exist, return `GROUND_TRUTH_UNAVAILABLE`; never return an all-zero placeholder as if it were a reference mask.

### Geometry

`GET /api/v1/cases/{case_id}/geometry`

Must expose enough of the validated contract for mobile 2D↔3D conformance:

- shape/index convention;
- spacing;
- origin/direction or equivalent transform representation when present;
- axis/slice convention;
- `geometry_contract_version`;
- validation status.

---

## 5. Experiments and cohort analytics

### Experiment list/detail

`GET /api/v1/experiments`

`GET /api/v1/experiments/{experiment_id}`

Experiment detail must include:

- model family/config identity;
- training fraction;
- split/subset manifest IDs;
- preprocessing/post-processing versions;
- checkpoint/evaluation version;
- prediction variant policy;
- comparability metadata/status.

### Experiment metrics

`GET /api/v1/experiments/{experiment_id}/metrics`

Returns cohort summary computed from saved per-case results, including intended evaluation N, successful N, primary metric summary, and prediction variant.

### Experiment cases

`GET /api/v1/experiments/{experiment_id}/cases`

Returns per-case metrics/status suitable for outlier drill-down. Failed/excluded cases remain visible with status/reason.

### Compare experiments

`GET /api/v1/experiments/compare?ids=EXP-U-100,EXP-D-100`

Equivalent implementation is allowed, but response must state:

- `comparable: true|false`;
- compatibility checks/reason when false;
- common paired evaluation population;
- metric/evaluation version;
- raw/processed prediction variant.

The client must not label a comparison as fair/comparable when this contract says false.

---

## 6. Analysis runs

### Create run — SHOULD (`PR-AN-01`)

`POST /api/v1/cases/{case_id}/analysis-runs`

Example:

```json
{
  "experiment_id": "EXP-D-100"
}
```

Only frozen/deployable compatible configurations may be requested.

### Run detail/state

`GET /api/v1/analysis-runs/{run_id}`

Required fields:

- run ID/case/experiment;
- `QUEUED|RUNNING|SUCCEEDED|FAILED`;
- attempt/retry identity;
- precomputed vs newly executed provenance;
- raw prediction artifact ID when available;
- processed prediction artifact ID when available;
- reconstruction IDs;
- safe failure code/reason when failed.

### Run metrics

`GET /api/v1/analysis-runs/{run_id}/metrics?prediction_variant=RAW_PREDICTION`

Must identify reference/prediction mask IDs and aggregation level.

If a ground-truth-dependent MetricSet cannot exist, return an availability/error response such as `GROUND_TRUTH_UNAVAILABLE`; never synthesize zero accuracy.

### Per-slice metrics/error data

`GET /api/v1/analysis-runs/{run_id}/slices/{slice_index}/metrics?prediction_variant=RAW_PREDICTION`

`GET /api/v1/analysis-runs/{run_id}/slices/{slice_index}/error?prediction_variant=RAW_PREDICTION`

Equivalent batched endpoints are allowed for performance, but the client must be able to obtain:

- per-slice metric state/value under the empty-slice rule;
- FP/FN/overlap data or a versioned error artifact;
- reference/prediction IDs used.

### Prediction slice

`GET /api/v1/analysis-runs/{run_id}/slices/{slice_index}/prediction?variant=raw|processed`

The requested variant must be explicit. Backend must not silently substitute processed for raw.

---

## 7. Reconstruction and 3D error

### Reconstruction

`GET /api/v1/analysis-runs/{run_id}/reconstruction?source_mask_id={mask_id}`

Returns mesh/artifact reference plus:

- exact source mask ID/kind;
- geometry contract version;
- reconstruction method/version;
- any mesh-to-world/source transform required for linkage.

### 3D error representation

`GET /api/v1/analysis-runs/{run_id}/error-reconstruction?prediction_variant=RAW_PREDICTION`

Available only when a compatible ground-truth reference exists. Must identify prediction/reference IDs and error semantics.

A 3D selection may be resolved client-side from shared geometry or through an API helper, but both paths must pass the same geometry fixtures.

---

## 8. Reviews and brush correction

### Review state

`POST /api/v1/analysis-runs/{run_id}/reviews`

Creates/initializes a persisted review when needed.

`PATCH /api/v1/reviews/{review_id}`

Example:

```json
{
  "status": "FLAGGED",
  "expected_revision": 3
}
```

Valid state transitions follow `05`. Invalid/stale updates return explicit conflict/validation errors.

### Working correction upload/update

The MVP must support an operation equivalent to:

`PUT /api/v1/reviews/{review_id}/working-mask/slices/{slice_index}`

The exact binary encoding is selected by ADR. The request must identify:

- exact source mask ID;
- expected review/revision;
- slice index;
- mask geometry/version;
- edited binary slice payload or equivalent deterministic delta.

The backend must reject geometry mismatch and attempts to use ground truth as an implicit source prediction.

### Commit reviewed-mask version

`POST /api/v1/reviews/{review_id}/commit`

Commits the working edits as a new immutable `ReviewedMask` version and returns its ID/checksum/version. It must not overwrite raw/processed source masks or a previous ReviewedMask version.

### Reviewed-mask access

`GET /api/v1/reviews/{review_id}/reviewed-masks`

`GET /api/v1/reviewed-masks/{reviewed_mask_id}/slices/{slice_index}`

Equivalent artifact URL delivery is allowed.

---

## 9. Findings

`POST /api/v1/findings`

Example:

```json
{
  "study_id": "STUDY_LA_001",
  "experiment_id": "EXP-D-100",
  "case_id": "CASE_0001",
  "analysis_run_id": "RUN_001",
  "slice_index": 54,
  "finding_type": "UNDER_SEGMENTATION",
  "note": "Prediction misses this region.",
  "region_reference": null
}
```

`GET /api/v1/findings`

`PATCH /api/v1/findings/{finding_id}` may update only allowed mutable fields such as note/status (`OPEN|RESOLVED`) while preserving evidence references/auditability.

Opening a finding requires enough evidence identifiers for the mobile client to navigate to the strongest available context.

---

## 10. Error model

Standard shape:

```json
{
  "error": {
    "code": "GROUND_TRUTH_UNAVAILABLE",
    "message": "Ground-truth-dependent metrics are not available for this case.",
    "request_id": "...",
    "details": null
  }
}
```

Core codes include:

- `CASE_NOT_FOUND`
- `SLICE_OUT_OF_RANGE`
- `ARTIFACT_NOT_FOUND`
- `GROUND_TRUTH_UNAVAILABLE`
- `INVALID_REVIEW_TRANSITION`
- `STALE_REVISION`
- `IMMUTABLE_ARTIFACT`
- `GEOMETRY_NOT_VALIDATED`
- `GEOMETRY_MISMATCH`
- `RUN_NOT_DEPLOYABLE`
- `RUN_NOT_SUCCEEDED`
- `NON_COMPARABLE_EXPERIMENTS`
- `ANALYSIS_FAILED`
- `VALIDATION_ERROR`
- `UNAUTHORIZED`

---

## 11. Compatibility and generated-contract rules

1. Mobile and backend use generated/validated schemas where feasible.
2. Breaking schema changes require versioned ADR/Decision Request and integration-test updates.
3. Geometry payload changes are integration-sensitive and require conformance regression tests.
4. API contract/schema must be frozen before parallel frontend/backend implementation on that interface.
5. Mock/fixture data used by downstream members must be generated from the accepted schema, not handwritten independently.
6. A client built against API version `v1` must never infer missing scientific fields (ground truth, metric, prediction variant) from UI defaults.
