# backend/ — API Contract 11 v1.0.0 service (FastAPI + SQLite)

**Block owner: Nguyễn Gia Đức Trung** (backend / persistence / ingestion). The first version was written on
2026-10-01 under the Day 22 recovery override as recovery support; the owner reviews and adopts it on Day 23.

The product backend of `DEP-04`: Python + FastAPI + SQLite on the Mac mini M2 (DR-003 host, `TECH_STACK_ADR`),
reached by the phone over the ZeroTier overlay. It serves **exactly** `contracts/api/contract.json` v1.0.0 and
refuses to start on any other contract version.

**Derived patient data never lives in the repository.** Slice PNGs, masks, the review database, rendered
predictions and Contract 2 packages all live under `CARDIAC_BACKEND_DATA` (a directory outside any git work
tree); the service and the ingest CLI refuse a path inside a work tree, ignored or not (the rule of
`ml/data.py`'s `inside_git_worktree`). Host names and addresses are parameters, never committed.

## What it serves

All 28 contract endpoints are routed; the 23 marked `hero_flow` are implemented against real data first.

| Area | Endpoints | Source |
|---|---|---|
| Study, cases, geometry | `study_get`, `case_list`, `case_get`, `geometry_get` | derived data cache (Contract 1 ingest) |
| Slices | `mri_slice_get`, `ground_truth_slice_get` | 8-bit PNG per slice at native resolution, content-addressed |
| Runs, predictions per variant | `analysis_run_get`, `prediction_slice_get` | Contract 2 packages under `backend/experiments/` |
| Reviews, reviewed masks | `review_create`, `review_patch`, `working_mask_put`, `review_commit`, `reviewed_masks_list`, `reviewed_mask_slice_get` | SQLite |
| Findings | `finding_create`, `findings_list`, `finding_patch` | SQLite |
| Metrics, worst slice, cohort | `analysis_run_metrics`, `analysis_slice_metrics`, `experiment_metrics`, `experiment_cases`, … | **unavailable state** (`ARTIFACT_NOT_FOUND`, reason `METRICS_NOT_INGESTED`) until saved Contract 2 metric artifacts are ingested — never an invented number |
| Mesh | `reconstruction_get`, `error_reconstruction_get` | Contract 2 `RECONSTRUCTION_3D` references; error mesh unavailable (DR-005 open) |
| Not deployable | `analysis_run_create` | `RUN_NOT_DEPLOYABLE` — precomputed runs only (PR-AN-01 is SHOULD) |

Plus `GET /health` and `GET /api/v1/artifacts/<sha256>.png` (the immutable `content_url` of every slice; its
bytes hash to the response `checksum`, `ETag` = that checksum).

### Rules the service enforces

- **Error codes**: every route answers only the codes its contract endpoint lists, in the standard envelope
  `{error: {code, message, request_id, details}}` at the contract's HTTP status.
- **Ground truth / inference-only (INT-12, PR-MODE-01)**: the INT-12 case is ingested in `INFERENCE_REVIEW`
  mode and its ground-truth file is **never opened**; every ground-truth-dependent endpoint answers
  `GROUND_TRUTH_UNAVAILABLE` for it. Predictions, reviews and findings stay available.
- **Physical units**: LASC headers are the default affine (QA-002 F2), so every geometry response says
  `GEOMETRY_NOT_VALIDATED`, spacing/origin/direction are the header's voxel-index affine, and **no response
  carries an mm or mL value**.
- **Review states (FR-REV-001)**: `NOT_REVIEWED → ACCEPTED | FLAGGED | CORRECTED`, `FLAGGED → CORRECTED`,
  `ACCEPTED → FLAGGED | CORRECTED`; anything else is `INVALID_REVIEW_TRANSITION`. `CORRECTED` needs a persisted
  reviewed mask; a **commit leaves the review `CORRECTED`** (do not PATCH it afterwards). One review per
  run + source mask + variant (DR-009); `review_create` must send `source_mask_id` and `prediction_variant`.
- **Revisions**: every write carries `expected_revision`; a stale one is `STALE_REVISION`. The review revision is a
  single counter advanced by every status change, working-slice upload and commit.
- **Immutability**: a commit writes a new `ReviewedMask` version (`RM_<review>_V<n>`, parent = previous version,
  checksum = sha256 of the uint8 `(z, y, x)` {0, 255} volume bytes) with FR-REV-010 provenance (source mask, case,
  run, time, reviewer from the optional `X-Reviewer-Id` header). SQLite **triggers refuse UPDATE/DELETE** on
  reviewed masks, their slices and both history tables; finding evidence columns cannot be updated. The source
  prediction file is never written (its checksum is re-verified when loaded).
- **Working-mask payload**: `{encoding, data}` with `BITPACK_BASE64` (Ny·Nx bits, row-major, MSB first) or
  `PNG_BASE64` (8-bit Ny×Nx PNG, values {0, 255}); `geometry_contract_version` and `geometry_validation_status`
  must equal the case's (`GEOMETRY_NOT_VALIDATED` for the real data) or the answer is `GEOMETRY_MISMATCH`.

## Data: Contract 1 ingestion of the rule-selected cases

```powershell
$env:CARDIAC_BACKEND_DATA = "D:\02_Research\cardiac-data\backend_cache"   # outside the repository
python -m backend.app.ingest --package-root D:\02_Research\cardiac-data\lasc2018\extracted
```

Selection is by rule from `data/manifests/split_manifest_path_a_seed2024.json` (pass `--split-manifest` while
PR #35 is unmerged): **INTEGRATION_CASE_001 = CASE_0061** (lowest validation id), all **20 validation cases**
(EVALUATION), and the **INT-12 case = CASE_0001** (lowest `final_holdout` id other than CASE_0027,
INFERENCE_REVIEW, ground truth withheld). The split's pinned dataset-manifest sha256 is checked.

Output goes to `$CARDIAC_BACKEND_DATA/data_cache/` (or `--out`); a path inside a git work tree is refused. Re-running is idempotent: identical bytes are a NO_OP, changed
source bytes are `CHECKSUM_CONFLICT`, never an overwrite. ~21 cases × 88 slices; MRI intensities are uint8 in the
package and are copied unchanged (`png8-identity/1`), masks are {0, 255}.

Contract 2 packages (experiment manifests + prediction NRRDs, as `ml/` exports them) go under
`$CARDIAC_BACKEND_DATA/experiments/<package>/`. Each is validated with
`contracts/ingestion/contract2_experiment_artifact/validate_contract2.py` before anything is served; a rejected
package is listed by code in `/health` and never partially served.

## Run locally

```powershell
pip install -r backend/requirements-dev.txt          # runtime pins + httpx/pytest
powershell -ExecutionPolicy Bypass -File backend\scripts\run_local.ps1 -DataRoot D:\02_Research\cardiac-data\backend_cache
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/v1/cases/CASE_0061/slices/44/mri
```

Environment: `CARDIAC_BACKEND_DATA` (required; layout `data_cache/`, `experiments/`, `var/backend.sqlite3`,
`var/render_cache/`), per-path overrides `CARDIAC_DATA_CACHE`, `CARDIAC_EXPERIMENTS_ROOT`, `CARDIAC_DB`,
`CARDIAC_RENDER_CACHE`, plus `CARDIAC_STUDY_ID` (default `STUDY_LA_001`) and `CARDIAC_API_CONTRACT`.

## Tests

```powershell
python -m pytest backend/tests -q
```

TestClient on a synthetic package (generated NRRDs with the real package's header, a synthetic split with
CASE_0027 in the holdout, a synthetic Contract 2 package with RAW + PROCESSED predictions and a FAILED run, and a
second package that the validator rejects). **Every JSON response is validated** with
`contracts/api/validate_api_contract.validate_response` — the same function the contract test applies to the
generated fixtures. Covered: routes for all 28 endpoints, the INT-12 selection rule, slice pixels equal to the
source (rows = y, columns = x), ground truth served only in EVALUATION mode and never derived for INT-12, every
transition and refusal of the review state machine, stale revisions, working-mask geometry checks, two committed
versions with parent links, unchanged v1 and source checksums, database-level immutability, finding evidence
immutability, no physical-unit field anywhere, ingest idempotency and `CHECKSUM_CONFLICT`.

## Deploy to the Mac mini (run by the leader)

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\deploy_macmini.ps1 -SshHost <ssh-alias> -BindHost <overlay-address> `
    -DataCache D:\02_Research\cardiac-data\backend_cache\data_cache
```

`-SshHost` / `-BindHost` may instead come from the untracked environment variables `CARDIAC_DEPLOY_SSH_HOST` /
`CARDIAC_DEPLOY_BIND_HOST`; binding `0.0.0.0` needs the explicit `-BindAll`. The script packs code + contract
files + the derived data cache (never raw NRRD) into a fixed stage directory under `%TEMP%`, downloads the pinned
requirements as Python 3.9 macOS-arm64 wheels, copies the code to `~/cardiac-backend` and the data to
`~/cardiac-backend-data` over ssh, creates a venv from `/usr/bin/python3` (3.9.6 on the Mac mini), installs
offline from the wheels, restarts uvicorn on `<overlay-address>:8000` in the background (pid file and log under
`~/cardiac-backend-data/var/`), and curls `/health` on the host and then from the PC. Nothing is deleted on
either side.

Phone base URL: `http://<overlay-address>:8000/api/v1` · health: `http://<overlay-address>:8000/health`.
If the host answers locally but not over the overlay, check ZeroTier and the macOS firewall for python3.

## Known gaps (Day 22)

- Metrics, worst-slice selection and cohort endpoints answer the unavailable state until saved Contract 2 metric
  artifacts exist (no training run has produced one yet).
- No Contract 2 package exists yet, so on real data there are no runs, predictions or reviews; the review flow is
  proven on the synthetic package only.
- The mesh frame of `RECONSTRUCTION_3D` artifacts is not declared by Contract 2; `mesh_to_world_transform` is the
  identity in the source mask's voxel-index frame. To be confirmed with the mesh pipeline (V2 / `backend/mesh/`).
- No authentication (LOCAL_DEMO overlay, DR-003); `UNAUTHORIZED` is never answered. Plain HTTP on the overlay.
- Python 3.9 compatibility is by construction and pinned wheels; the suite itself runs on the development
  Python (3.12).
