# TC-TEAM-001 evidence package — Nguyễn Gia Đức Trung / V4

| Field | Value |
|---|---|
| Member | Nguyễn Gia Đức Trung |
| Owned vertical | V4 — Review / Correction and Findings |
| Technical block | Backend, persistence, ingestion and artifact provenance |
| Use cases | UC-13 review prediction · UC-14 correct mask · UC-15 create finding |
| Screens | SCR-06 Review / Correction · SCR-08 Findings |
| Prepared | 2026-09-18; updated 2026-09-19 (Day 10) |
| Package status | **IN PROGRESS — contract-derived fixture and framework-neutral SCR-06 model exist; no mobile/backend production implementation** |

This package records the boundary between the mobile brush UI and the backend
that persists review state, immutable mask versions and findings. It does not
claim that a production server or V4 mobile implementation already exists.

## 1. Requirements and use-case ownership

| Layer | Identifiers owned or consumed |
|---|---|
| Product | `PR-REV-01`, `PR-REV-02`, `PR-PROV-01`, `PR-FIND-01` |
| Functional | `FR-REV-001`…`FR-REV-011`, `FR-FIND-001`…`FR-FIND-004` |
| Screens | `SCR-06`, `SCR-08` |
| Use cases | `UC-13`, `UC-14`, `UC-15` |
| Acceptance tests | `TC-REV-001`…`TC-REV-006`, `TC-REL-001`, `TC-REL-002`, `TC-FIND-001`, `TC-FIND-002`, `TC-MOBILE-STATE-001` |

Non-negotiable rules:

1. `RAW_PREDICTION_MASK` and `PROCESSED_PREDICTION_MASK` are immutable. A
   brush edit is a working mask and commit creates a new immutable
   `REVIEWED_MASK`; no source or previous version is overwritten.
2. Every existing-resource write carries `expected_revision` and uses ETag
   semantics. A stale write returns `STALE_REVISION`; last-write-wins is not
   allowed.
3. Geometry is consumed exactly as `dr008a-dr012/v1.0.0`. Geometry-bearing
   responses include validation status and the full transform fields.
4. Missing ground truth is `GROUND_TRUTH_UNAVAILABLE`, never an all-zero mask
   or fabricated metric. Findings retain their evidence identifiers.

## 2. UI design artifacts

### SCR-06 — Review / Correction

```text
← review · CASE_0043 · run unet_base16 · variant processed
source: PROCESSED_PREDICTION_MASK  id=...  geometry: VALIDATED
[ MRI slice ] [source overlay] [working brush overlay]
slice 44 / 88     brush: add | erase | size | undo | redo | reset
review: OPEN · unsaved changes                 [Cancel] [Save new version]
```

The source mask id and geometry version are visible before editing. Save is
disabled while geometry is invalid or a revision is stale. Cancel discards
only unsaved working edits; it never deletes an immutable artifact.

### SCR-08 — Findings

```text
Findings · CASE_0043 · run unet_base16
[slice 61] false-positive · OPEN · note ...       [Open evidence]
[slice 18] brush correction · RESOLVED              [Open evidence]
```

Opening a finding navigates to its case, run, slice, mask variant and region
reference. Status and note are mutable with a revision; evidence identifiers
are preserved.

### Shared state matrix

| State | SCR-06 | SCR-08 | Backend signal |
|---|---|---|---|
| Loading | skeleton, no editable mask | skeleton list | request in flight |
| Ground truth unavailable | prediction review may continue; GT controls unavailable | no GT-derived finding metrics | `GROUND_TRUTH_UNAVAILABLE` |
| Processing | read-only banner | list remains visible | `RUN_NOT_SUCCEEDED` |
| Geometry invalid/mismatch | editing blocked with diagnostic code | finding navigation blocked for that artifact | `GEOMETRY_NOT_VALIDATED`, `GEOMETRY_MISMATCH` |
| Stale revision | reload banner, unsaved edits retained locally | refresh before save | `STALE_REVISION` |
| Recoverable transport error | retry, last good slice retained | retry list request | `ANALYSIS_FAILED` / transport error |

## 3. Architecture, API and data interaction

The data flow is:

```text
Khánh: validated ingestion/artifact manifest
        ↓
Backend persistence (this block)
        ↓ source mask + geometry + revision
Tuấn Anh: brush working slice ──PUT working_mask──► working state
        ↓ POST commit
immutable ReviewedMask version ──► findings and later review sessions
```

The accepted API Contract 11 endpoints used by V4 are:

| Operation | Contract endpoint | Required safeguards |
|---|---|---|
| Open review | `POST /api/v1/analysis-runs/{run_id}/reviews` | run must succeed; state is persisted |
| Change review state | `PATCH /api/v1/reviews/{review_id}` | `expected_revision`, `STALE_REVISION` |
| Save brush slice | `PUT /api/v1/reviews/{review_id}/working-mask/slices/{slice_index}` | source mask id, geometry version/status, revision; working-only write |
| Commit review | `POST /api/v1/reviews/{review_id}/commit` | new immutable version, checksum, source identity, revision |
| List/read versions | `GET .../reviewed-masks`, `GET /api/v1/reviewed-masks/{id}/slices/{slice}` | read-only, geometry and checksum visible |
| Create finding | `POST /api/v1/findings` | case/run/slice/evidence identifiers required |
| Update finding | `PATCH /api/v1/findings/{finding_id}` | note/status plus `expected_revision`; evidence immutable |

The exact endpoint definitions are in `contracts/api/contract.json`; the
generated bundle used by V1-V4 is produced by
`contracts/api/generate_fixture.py` at
`app/core/fixtures/.generated/api_bundle.json` and is intentionally not
committed. Contract 1 validates the
raw dataset package and Contract 2 validates precomputed experiment artifacts;
neither contract permits the review layer to rewrite its source artifact.

## 4. Implementation and commit evidence

| Artifact | Evidence | State |
|---|---|---|
| Contract 1 raw ingestion | PR #32, merge `c44ee31` | merged; geometry status consistency regression covered |
| Contract 2 experiment ingestion | PR #39, merge `7363a6a` | merged; gates, 54-case holdout, checksum/provenance rules |
| API Contract 11 | PR #45, merge `dd5a569` | merged; 28 endpoints, 15 errors, revision and immutability rules |
| Schema-generated API fixture | `feat/day10-api-fixtures-trung`, commit `c731ab4` | all 28 endpoint scenario groups, endpoint-bound error cases, and V4 stale-revision cases; generated output remains ignored |
| E9 reconnect procedure | PR #33, commit `bf86a74` | physical-device base now uses the verified reachable stub address; reviewer/merge still pending |
| V4 Review / Correction model | `feat/day10-v4-review-trung`, commit `aa121c9` | fixture-only SCR-06 model; opens by case/run, exposes revision, requires `expected_revision`, and locks stale writes to Refresh |

## 5. Test and evidence record

The following checks are reproducible without clinical data:

| Check | Result |
|---|---|
| Contract 1 synthetic validator | PASS — all regression cases |
| Contract 2 synthetic validator | PASS — 9 cases |
| API Contract 11 validator/schema/fixture | PASS — 12 cases, 28 endpoints, 15 errors |
| App/core fixture handshake | PASS — fresh Python generation loads 28 scenario groups and all three V4 stale-revision scenarios |
| V4 Review / Correction model | PASS — open by case/run, show revision, revision-carrying working-mask write, stale write locks and offers Refresh only |
| CI job | Day 9 contract job and Day 10 app-core job run the contract and fixture checks with `jsonschema` |

The following remain unmeasured and must not be claimed as passing:

- brush latency/zero lost samples (`TC-PERF-003`);
- exact undo/redo/reset behavior and source checksum preservation;
- a rendered/mobile SCR-06 or SCR-08 screen and an end-to-end correction flow;
- production API authorization and persistence integration;
- `TC-FIND-001/002` on a real V4 implementation.

## 6. Demo and defense notes

For H8/H9 the demonstrator must show the source mask id before brushing, make
an unsaved edit, cancel it, then make a new edit and save. The saved result
must have a new `reviewed_mask_id` and checksum while the raw/processed source
checksum remains unchanged. A deliberate stale revision must show a readable
`STALE_REVISION` error rather than a traceback.

For SCR-08, opening a finding must return to the exact case/run/slice and
region reference. If ground truth is unavailable, the UI says so and does not
invent Dice, error classes or a zero mask.

**Current conclusion:** the V4 contract, provenance rules, generated fixture,
and the first framework-neutral SCR-06 state model are ready for a mobile
renderer. This package is not an acceptance claim until the V1 backend/mobile
implementation and the listed tests exist.
