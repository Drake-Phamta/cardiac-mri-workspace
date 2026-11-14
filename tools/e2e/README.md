# tools/e2e - API-level hero-flow proof (DEMO_STANDARD rule D6)

`hero_flow_api.py` walks the demo hero flow H1-H10 (`management/DEMO_STANDARD.md` section 3) through the **same HTTP
endpoints the mobile app calls** (API Contract 11 v1.1.0, `contracts/api/contract.json`), on the data the target backend
really serves, and prints a readable PASS / FAIL / SKIP report. It is the first end-to-end proof that does not need a
phone. Standard library only (the mesh is parsed with `struct` / `array`), Python 3.9-compatible syntax (it also runs on the Mac mini host with `/usr/bin/python3`).

## One command

```powershell
python tools/e2e/hero_flow_api.py --base-url http://127.0.0.1:8000 [--case CASE_0029] [--json-out <file outside git>] [--no-writes]
```

Exit code 0 only when no step FAILED. SKIP (with its reason) is not a failure. The console report and `--json-out`
contain per-case metric values: keep them **outside git** (the team stores run outputs next to the run folders).

Options: `--no-writes` skips H8/H9; `--allow-remote-writes` lets H8/H9 write to a non-local host (default: writes only
when the host is `127.0.0.1` / `localhost`); `--expect-cases` (74), `--expect-n` (54), `--experiments`, `--int12`
(`CASE_0001`) pin what the backend must serve; `--study-id`.

## Hero step -> screen -> endpoints

The demo case defaults to the first `EXP-D-100` outlier that is an EVALUATION case (`--case` overrides it).

| Step | Hero flow (`16` section 2) | Screen | Endpoints exercised (contract ids) | What is checked |
|---|---|---|---|---|
| H0 | service up | - | `GET /health` | contract version pinned, data ready, case total, 4 packages accepted and none rejected |
| H1 | cohort / experiment summary | SCR-01 | `study_get`, `experiment_list`, `experiment_get`, `experiment_metrics`, `experiment_cases` | dataset identity, case counts by mode, 4 experiments (3 RAW + EXP-D-PP PROCESSED) on one FINAL_HOLDOUT population, Dice mean/median/CI95 with N intended and successful, 3 outlier entry points per experiment |
| H2 | identify an outlier | SCR-01 / 07 | `experiment_cases` (EXP-D-100) | 54 rows, DR-010 `outlier_selection` of 3 `SUCCEEDED` cases ranked worst first and equal to their rows; INT-12 case is `WITHHELD` with no values and never an outlier |
| H3 | MRI Case Explorer | SCR-02 -> 03 | `case_list`, `case_get`, `geometry_get`, `mri_slice_get`, `analysis_run_get` | 74 rows, mode capability vs ground truth, pagination and mode filter, geometry identical in `case_get` and `geometry_get`, slice `n / total`, out-of-range slice refused, MRI bytes hash to the stated checksum, the case's runs for EXP-D-100 (RAW) and EXP-D-PP (PROCESSED) |
| H4 | worst slice | SCR-03 / 04 | `analysis_run_metrics`, `ground_truth_slice_get`, `prediction_slice_get`, `content_url` fetch | `worst_slice_selection` (rule `DR-010`, `dr010-worst-slice/v1`, served order), case metrics equal the `experiment_cases` row, MRI + ground truth + prediction bytes: SHA-256 of the fetched bytes equals the API checksum and the ETag (DR-021 rule 1); RAW-only run asked for PROCESSED is `ARTIFACT_NOT_FOUND` (no silent substitution) |
| H5 | prediction vs ground truth vs error | SCR-03 / 04 | `analysis_slice_metrics`, `analysis_slice_error` | slice Dice equals the selection's; FP, FN and Dice **recomputed from the two PNG masks** equal the API. `analysis_slice_error` answers the documented honest `ARTIFACT_NOT_FOUND` / `NO_ERROR_ARTIFACT` (no error artifact is exported; the overlay is derived from the two masks, as done here) |
| H6 | 3D reconstruction | SCR-05 | `reconstruction_get`, `error_reconstruction_get`, `GET /artifacts/<sha256>.cmesh` | the run lists `reconstruction_ids`; for the RAW prediction, the ground truth and (EXP-D-PP) the PROCESSED prediction: source id and kind, `reconstruction_version` `dr008c-L0/v1 sha256:...`, identity transform, geometry equal to the case's, `mesh_artifact_id` = `MESH_<sha256>` whose bytes hash to it (and to the ETag), header shape = case shape, counts sane (even triangle count, <= 12 triangles and 8 vertices per foreground voxel), every vertex inside `[0, shape]`, every source slice < Nz; an unknown or another run's mask is `ARTIFACT_NOT_FOUND`; `error_reconstruction_get` stays the honest `ARTIFACT_NOT_FOUND` (DR-005 open) |
| H6.i | INT-12 3D | SCR-05 | `reconstruction_get`, `error_reconstruction_get` | `CASE_0001`: its prediction mesh is served; its ground-truth mesh is refused (`ARTIFACT_NOT_FOUND`, `details.reason` `GROUND_TRUTH_UNAVAILABLE`: the contract has no such code on that endpoint) and its error mesh answers `GROUND_TRUTH_UNAVAILABLE` |
| H7 | pick -> 2D | SCR-05 -> SCR-03 | `reconstruction_get`, `prediction_slice_get`, `ground_truth_slice_get`, `content_url` fetch | five faces per layer (prediction and ground truth), spread over the slices: a ray aimed at the face centre (a tap) is cast through every triangle; the first hit's `face_source_slice` is in `[0, Nz)`, equals the slice of the voxel behind the face, and that slice's served PNG is 255 at the face's (column, row) - rows = y, columns = x; a ray down the empty corner hits nothing (no navigation) |
| H8 | flag / correct | SCR-06 / 08 | `review_create`, `working_mask_put`, `finding_create`, `findings_list` | review scoped to run + source mask + RAW; a 1-pixel correction of the worst slice sent as `BITPACK_BASE64` like V4; stale write -> `STALE_REVISION`; claimed validated geometry -> `GEOMETRY_MISMATCH`; finding with evidence read back identical |
| H9 | save, raw preserved | SCR-06 | `review_commit`, `reviewed_masks_list`, `reviewed_mask_slice_get`, `review_patch` | stale commit refused; new immutable version (`RM_<review>_V<n>`, parent link, source mask id + kind `RAW_PREDICTION`, provenance case/run/time/reviewer); earlier versions unchanged; reviewed slice differs from the prediction at exactly the edited pixel, untouched slice identical; **raw prediction checksum and artifact id unchanged**; `review_patch` to CORRECTED -> `INVALID_REVIEW_TRANSITION`; a second commit with no new edits is refused |
| H10 | model / data-scarcity comparison | SCR-07 | `experiment_compare` | 025 vs 100 and 050 vs 100: `comparable` true, common population 54, dice summaries and deltas; 100 (RAW) vs PP (PROCESSED): `comparable` false with the reason (the contract's `compatibility_reason`; the app draws no delta); UNet vs DINOv2 **SKIP** (UNet runs are not trained yet) |
| INT-12 | inference-only case | SCR-02 / 04 | `case_get`, `ground_truth_slice_get`, `analysis_run_metrics`, `analysis_slice_metrics`, `analysis_slice_error`, `prediction_slice_get` | `CASE_0001` is `INFERENCE_REVIEW`; every ground-truth-dependent endpoint answers `GROUND_TRUTH_UNAVAILABLE` (never a zero mask); its prediction is still served; it is in no outlier list |

## Build the backend data directory (real data, outside git)

Run from the repository root; `<root>` is a directory outside any git work tree.

```powershell
# 1. Contract 1 cache: 20 validation + INT-12 + 53 holdout cases = 74 (DR-022; needs the closed GATE-IMG-01 record)
python -m backend.app.ingest --package-root <LASC extracted root> --out <root>\data_cache `
    --include-holdout --holdout-authorization management/day39/gate_img_01/holdout_authorization.json

# 2. Contract 2 packages: copy each run directory as a whole (never move). The manifest lives at
#    <run>\contract2\<manifest>.json with the run directory as artifact root. The validation predictions/evaluation
#    and last.pt are not referenced by the manifest, so they can be left out (~90 MB per run instead of ~430 MB):
foreach ($e in 'EXP-D-025','EXP-D-050','EXP-D-100','EXP-D-PP') {
  robocopy "<runs>\$e" "<root>\experiments\$e" /E /XD "<runs>\$e\predictions\validation" "<runs>\$e\evaluation\validation" /XF last.pt
}   # robocopy exit codes 0-7 are success
# 3. The 3-D meshes (SCR-05, H6/H7): derived, patient-derived, write-once, keyed by the source mask's sha256
python -m backend.mesh.build_cache --data <root>
```

On the Day 39 data this is 289 masks (216 predictions, 73 ground truths) and about 0.65 GB, built in about a minute; a
re-run is a NO_OP. Without it H6 and H7 FAIL ("the run lists no reconstruction_ids"), by design.

`/health` must then show 74 cases, 4 experiments, 216 runs (54 per experiment) and an empty
`rejected_experiment_packages`; a rejected package is listed there by validator code.

## Run it locally

```powershell
$env:CARDIAC_BACKEND_DATA = "<root>"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000     # or backend\scripts\run_local.ps1 -DataRoot <root> -Port 8000
python tools/e2e/hero_flow_api.py --base-url http://127.0.0.1:8000 --json-out <outside git>\hero_flow.json
```

H8/H9 write one review, one reviewed-mask version and one finding into `<root>\var\backend.sqlite3`. Re-running is safe:
the review of the same scope is returned unchanged and the commit adds the next version. To get a clean demo database
afterwards, stop the backend and rename `<root>\var` (do not deploy it; the deploy script copies `data_cache` and, with `-ShipPackages`, `experiments` and `derived_meshes`, never `var`).

## Run it against the Mac mini (read-only)

```powershell
python tools/e2e/hero_flow_api.py --base-url http://<overlay-address>:8000 --no-writes --json-out <outside git>\hero_flow_macmini.json
```

`--no-writes` skips H8/H9 (they are also skipped automatically for any non-local host unless `--allow-remote-writes`).
Run from the PC over the overlay, or on the host itself with `/usr/bin/python3 hero_flow_api.py --base-url http://127.0.0.1:8000 --no-writes`.
The expected counts are those of the Day 39 data (74 cases, 4 experiments, N = 54); pass `--expect-cases`, `--expect-n`
and `--experiments` for a different deployment.

## Out of scope

- **The device**: gestures, rendering, zoom/pan alignment, brush latency, slice-switch p95 (TC-PERF-001..003), the release
  build, the overlay network. Those stay device tests (D1, D5).
- **3D on the device** (H6, H7): the mesh data path and the pick -> slice -> mask link are proven here; rotating, zooming, the
  frame rate (TC-PERF-002) and the tap on a real finger are device tests (TC-3D-001..005).
- **UNet vs DINOv2** (H10 model comparison): SKIP until the UNet runs are exported.
- Pixel-level checks that need the app's own renderer (overlay alignment after zoom).
