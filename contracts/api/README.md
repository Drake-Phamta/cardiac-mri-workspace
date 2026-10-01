# API Contract 11 — v1.1.0 (v1.0.0 frozen 2026-10-01, v1.1.0 additive the same day)

## v1.1.0 — the V3/V4 freeze follow-ups (additive)

Raised by the V3 (#61) and V4 (#63) lanes while building on v1.0.0; answered here so the v1.0.0 PR under QA did
not move. Every change is additive or a typed placeholder; the version string changes because consumers compare
it whole.

| Question | Answer in v1.1.0 |
|---|---|
| (a) shapes of `metric_summary`, `experiment_compare.summary`, per-case values | **Adopted from V3's `PROPOSED_SHAPES`**, with one rename: `metric_summary` maps every case metric (`dice`, `iou`, `false_positives`, `false_negatives`, `relative_volume_error`) to `{n, mean, std, median, q1, q3, min, max, ci95_low, ci95_high}` (number or `null` = not computed); `experiment_compare.summary` maps each compared `experiment_id` to a `metric_summary` over the common population; `experiment_cases` rows gain `analysis_run_id` and **`metric_values`** (V3 proposed `metrics`; renamed for consistency with `analysis_run_metrics.metric_values`), `null` unless the row is `SUCCEEDED`. Row `status` is `SUCCEEDED / FAILED / EXCLUDED / WITHHELD` — `WITHHELD` is the INT-12 inference-only case, served without values. |
| (b) DR-010 outliers | `experiment_cases.outlier_selection` `{rule_id DR-010, selection_version dr010-outlier/v1, experiment_id, prediction_variant, metric_name dice, cases[{case_id, analysis_run_id, metric_value, false_positives, false_negatives}]}`, three cases, ranked by the server (Dice ascending, FP+FN descending, case_id ascending); only `SUCCEEDED` rows qualify. Not added to `study_get` (one carrier, as for the worst slice). |
| (c) generator | `experiment_get` echoes the requested id; scenario `experiment_get.processed_variant` serves `EXP-D-PP` as `PROCESSED`. |
| (d) findings revision | Already in v1.0.0: `revision` on `finding_create` and `findings_list` rows; `finding_patch` takes `expected_revision` and answers `STALE_REVISION`. |
| (e) variant on findings | Optional `prediction_variant` on `finding_create` and in `evidence`: **required when `analysis_run_id` is given, `null` otherwise**; immutable like the rest of the evidence. |
| (f) commit semantics | **Kept as v1.0.0 decided, now stated on the endpoint:** the commit itself moves the review to `CORRECTED` (`review_rules.commit_result_state`) and answers a **new** `reviewed_mask_id`; a `review_patch` to `CORRECTED` afterwards is `INVALID_REVIEW_TRANSITION`. The fixture's commit now answers `REVIEWED_MASK_0043_R2` with parent `..._R1`, never a listed id. |

### #62 QA fixes, carried in 1.1.0

- **B1** `experiment_list` rows carry their own `prediction_variant` (`row_fields: [experiment_id,
  prediction_variant]`, bound to the variant enum): RAW experiments and EXP-D-PP (PROCESSED) share one list
  (`08` §2). `evaluation_population` stays top-level and means the population every listed experiment shares
  (`null` when they do not share one). A row without its variant is drift.
- **B2** `review_commit` is **atomic**: the new immutable version, the move to `CORRECTED` and exactly one
  revision step persist together or not at all. The `05` §6 edges into `CORRECTED` are performed **only** by
  `review_commit` (`review_rules.corrected_only_via`), so `review_patch` to `CORRECTED` always answers
  `INVALID_REVIEW_TRANSITION`; a commit is valid from every state and never answers that code (removed from its
  error list). The commit response now carries `status` (`CORRECTED`). `review_status_transitions` still equals
  `05` §6.
- **N1** `validate_response` checks `mode` against `ground_truth_available` on `case_get` and on `case_list` rows.
- **N2** a reviewed mask's `source_mask_kind` (commit response and `provenance` on list rows) is
  `RAW_PREDICTION` or `PROCESSED_PREDICTION` — never `GROUND_TRUTH` (`domain_enums.review_source_mask_kind`).

### Deviations from the frozen specs, and where they are translated

| Frozen spec says | Contract 11 / backend says | Translated at |
|---|---|---|
| `RAW_PREDICTION` / `PROCESSED_PREDICTION` (`07` §6, Contract 2) | API `prediction_variant` = `RAW` / `PROCESSED` | the Contract 2 boundary in the backend (`backend/app/metrics.py`, `main.py`); the meaning is identical |
| Contract 2 metric names `dice_3d`, `iou_3d`, `fp_voxels`, `fn_voxels`, `relative_volume_error_percent` (`ml/evaluate.py`) | `dice`, `iou`, `false_positives`, `false_negatives`, `relative_volume_error` (percent of the ground-truth voxel count) | one explicit field map in the backend ingest (`METRIC_SOURCES`), tested |
| Contract 1 rejects a default-affine header as unvalidated geometry | ingested, recorded as `GEOMETRY_NOT_VALIDATED`, served in voxel-index units only | `backend/app/ingest.py` (recorded deviation, Day 23 decision) |
| `11` §3 case detail `"mode"`; `05` `MRICase.mode_capability` | `case_get.mode`; `case_list` rows `mode_capability` (top-level `mode` = the filter echo) | the API itself |

### Known gaps after 1.1.0

- The DR-010 outlier selection is carried on `experiment_cases` only (not repeated on `study_get`).
- `experiment_compare.summary` CIs are `null` (not computed by the API); cohort CIs come from the saved
  `metrics_summary` on `experiment_metrics`.
- Real per-case and per-slice metrics reach the backend only through Contract 2 FINAL_HOLDOUT packages, i.e.
  after GATE-IMG-01 (D24+); until then the metric endpoints answer the unavailable state on real data.

The rest of this file describes v1.0.0, which v1.1.0 keeps unchanged.

# API Contract 11 — v1.0.0 (frozen 2026-10-01)

This directory is the schema-first backend/mobile API contract from
`docs/specs/v1.0/11_API_CONTRACT.md`. It defines resource semantics, endpoint
shapes, stable errors, geometry provenance, review states and revision rules,
case capability, and fixture-generation policy. The server that implements it
lives in `backend/`; this directory stays implementation-free.

## Version and freeze

`contract_version` was **`1.0.0`** (now `1.1.0`, see above), frozen on 2026-10-01 under INT-11 (Day 22
recovery override, `management/day22/RECOVERY_OVERRIDE_DAY22.md`). It replaces
`DRAFT v0`. Every consumer compares the whole string: `app/core/contract.mjs`
refuses any other value, and so does the fixture loader. After the freeze,
changes are additive only, by a PR from the contract owner (Nguyễn Gia Đức
Trung) reviewed by Phạm Tuấn Anh, with regenerated fixtures and a new version
string.

### What v1.0.0 adds to DRAFT v0, and the decision behind each

| Change | Decision | Where |
|---|---|---|
| `analysis_run_metrics` returns `worst_slice_selection`: `rule_id` (`DR-010`), `selection_version` (`dr010-worst-slice/v1`), `slices[{slice_index, dice, false_positives, false_negatives}]`, ranked by the server, worst first | **DR-010a option (b)**, leader 2026-10-01; ranking unchanged from DR-010 | `selection_rules.worst_slice_selection` |
| Review states `NOT_REVIEWED`, `ACCEPTED`, `FLAGGED`, `CORRECTED` with the `05` §6 transitions; `CORRECTED` needs a persisted reviewed mask; a commit leaves the review `CORRECTED` | **FR-REV-001 / V4-06**, leader 2026-10-01 | `domain_enums.review_status`, `domain_enums.review_status_transitions`, `review_rules` |
| Finding statuses `OPEN`, `RESOLVED`; finding types from `05` | `05` Finding, FR-FIND-003 | `domain_enums` |
| Case capability is explicit: `mode` is `EVALUATION` or `INFERENCE_REVIEW`; every ground-truth-dependent endpoint answers `GROUND_TRUTH_UNAVAILABLE` for an `INFERENCE_REVIEW` case; `case_list` rows carry `case_id`, `mode_capability`, `ground_truth_available` | **INT-12 / PR-MODE-01**, leader 2026-10-01 | `case_capability` |
| Every endpoint carries `hero_flow`; 23 of 28 are `true` — the subset the backend implements first | **DEP-04 / INT-11**, leader 2026-10-01 | `hero_flow`, `endpoints[*].hero_flow` |
| `review_create` carries `source_mask_id` and `prediction_variant`: a review is scoped to one source mask and one variant | **DR-009** (approved) | `review_rules.scope_fields` |

Freeze gaps closed in the same version, because the hero flow cannot run
without them (additive fields only):

- `analysis_run_metrics.metric_values` — the case-level 3D metrics
  (`dice`, `iou`, `false_positives`, `false_negatives`,
  `relative_volume_error`); `metric_rules` gives units (voxel counts; relative
  volume error in percent of the ground-truth voxel count, `07` §6).
- `content_url` and `media_type` on the four slice endpoints, so pixels are
  delivered by an immutable content-addressed URL (`binary_delivery`).
- `provenance` on `review_commit` and `reviewed_masks_list` rows (FR-REV-010:
  source mask, case, run, time, reviewer when available, version).
- `revision` on `finding_create` and `findings_list` rows (and `finding_type`,
  `note` on rows), so `finding_patch`'s `expected_revision` is knowable.
- `row_fields` on all five list endpoints (`case_list`, `experiment_list`,
  `experiment_cases`, `reviewed_masks_list`, `findings_list`): the fields on
  each item are named, every other response field is top-level, and an empty
  page (`items: []`) is valid. `case_list` keeps `next_page` and `mode` (the
  echo of the mode filter, `null` when none) at the top level;
  `experiment_list` rows gain `experiment_id`.
- `geometry_contract.index_convention` (`x=column,y=row,z=slice`) and
  `geometry_contract.unvalidated_geometry_rule` (see below).
- `domain_enums` + `enum_bindings`, `field_shapes` + `shape_bindings`: the
  values and object keys a response may carry, checked by
  `validate_response()`.

`experiment_cases` (apart from naming its row fields) and `analysis_run_create`
are deliberately unchanged.

### The inference-only case (INT-12)

The leader's rule: **the lowest-numbered `final_holdout` case other than
`CASE_0027`**, chosen before any metric exists. Under split
`path_a_seed2024_dr002b_v1` that is **`CASE_0001`**. All 154 cases carry ground
truth in the package; this case is served in `INFERENCE_REVIEW` mode with its
ground truth withheld by configuration. The dataset is untouched and the offline
evaluation population (54 holdout cases) is unchanged; the API serves none of
that case's ground truth or per-case/per-slice ground-truth-derived values.

### Physical units

LASC 2018 headers carry unit spacing and zero origin (QA-002 F2), so
`geometry_validation_status` is `GEOMETRY_NOT_VALIDATED` for the real data.
`shape` and `index_convention` are authoritative; `spacing`, `origin` and
`direction` are the header's default affine in voxel-index units. No response
carries a physical length, area, volume, mm or mL value, and
`validate_response()` rejects one. Index-space work (slices, overlays, meshes in
voxel coordinates, slice picking) is unaffected.

## Scientific and safety invariants

1. A missing or withheld ground truth is `GROUND_TRUTH_UNAVAILABLE`; the API
   never returns an all-zero mask or a fabricated zero metric as a substitute.
2. Every geometry-bearing response carries `geometry_contract_version` and
   `geometry_validation_status`, together with the shape/index convention and
   spatial transform fields required by the contract.
3. A raw prediction is immutable. Processed prediction, reconstruction,
   metric, and reviewed-mask artifacts retain explicit source IDs. Committing
   brush edits creates a new immutable `ReviewedMask` version; it never
   overwrites a raw/processed mask or an earlier reviewed version.
4. Writes that mutate an existing review/finding/working mask use both
   `expected_revision` and the ETag/revision mechanism. A stale write returns
   `STALE_REVISION`; silent last-write-wins is forbidden.
5. Comparisons state `comparable: true|false`, the common population and
   metric/prediction versions. A mismatch returns
   `NON_COMPARABLE_EXPERIMENTS`; the client must not label it fair.
6. Failed runs, excluded cases, and unavailable metrics remain visible with a
   status/reason. No client infers scientific fields from UI defaults.
7. The worst-slice ranking is applied by the server only (DR-010); a client
   preserves the served order.

## Stable errors

The contract contains exactly the 15 error codes from §10. Adding or changing a
code requires a new contract version. Each error has a machine code, safe
message template, and HTTP status. The standard envelope is:

```json
{
  "error": {
    "code": "GROUND_TRUTH_UNAVAILABLE",
    "message": "Ground-truth-dependent metrics are not available for this case.",
    "request_id": "req_...",
    "details": null
  }
}
```

## Checks

Run the data-free checks:

```powershell
python test_api_contract.py
python validate_api_contract.py --contract contract.json
```

The test validates the formal Draft 2020-12 schema (requires `jsonschema`), the
semantic rules (including the v1.0 rules above, each with a negative case),
generates the fixture bundle, and passes **every generated scenario** through
`validate_response()` — the same function the backend tests apply to every
live response. No clinical image, mask, mesh, or patient-derived byte is
committed.

Generate the bundle consumed by `app/core` and the verticals with:

```powershell
python generate_fixture.py --contract contract.json --output ../../app/core/fixtures/.generated/api_bundle.json
node ../../app/core/tests/run_all.mjs
```

The output is intentionally ignored by Git. Values in the bundle are synthetic
placeholders (`data_policy`), typed by `domain_enums`/`field_shapes`; they are
never measurements. Notable scenarios: `empty` on every list endpoint, `case_get.inference_review`,
`analysis_run_metrics.{ground_truth_unavailable,no_eligible_slices}`,
`review_patch.{stale_revision,invalid_transition}`.
