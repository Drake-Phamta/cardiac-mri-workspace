# API Contract 11 — v1.0.0 (frozen 2026-10-01)

This directory is the schema-first backend/mobile API contract from
`docs/specs/v1.0/11_API_CONTRACT.md`. It defines resource semantics, endpoint
shapes, stable errors, geometry provenance, review states and revision rules,
case capability, and fixture-generation policy. The server that implements it
lives in `backend/`; this directory stays implementation-free.

## Version and freeze

`contract_version` is **`1.0.0`**, frozen on 2026-10-01 under INT-11 (Day 22
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
