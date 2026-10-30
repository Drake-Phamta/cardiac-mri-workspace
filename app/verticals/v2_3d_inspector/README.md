# V2 — 3D Inspector (`SCR-05`)

**Owner: Vũ Hùng Anh.** Branch from the `app/core` branch, not from `main`.

## Endpoints this vertical calls

| Endpoint id | Notes |
|---|---|
| `reconstruction_get` | `ARTIFACT_REFERENCE`, geometry response, `?source_mask_id={mask_id}` — **parameter name ≠ token name** |
| `error_reconstruction_get` | `ARTIFACT_REFERENCE`, geometry response, `?prediction_variant={variant}` |
| `case_get` | geometry response |
| `analysis_run_get` | run status, for the PROCESSING state |

`reconstruction_get` also returns `mesh_to_world_transform` on top of the seven geometry fields. Core
validates the seven; the transform is yours to use.

`error_reconstruction_get` answers `error_mesh_artifact_id` (`ERRMESH_<sha256 of the artifact bytes>`),
`reference_mask_id`, `prediction_mask_id`, `prediction_variant` and the seven geometry fields; the path token is
`{variant}`. The bytes are the one `cardiac-errormesh/2` artifact (the FP and FN surfaces, every face with its source
slice, class and connected error region, plus the region table) on the same content route as the surface meshes - see
`contracts/api/README.md`, "3-D error mesh". The screen draws it only for the masks it shows (`reference_mask_id`,
`prediction_mask_id`).

## UC-09 / FR-3D-007 / FR-3D-008: how "overlap / FP / FN or equivalent" is met

UC-09 asks the 3D error view to "distinguish overlap/FP/FN **or equivalent** error regions", and FR-3D-008 that selecting an
error region "provide navigation to one or more contributing slices". The screen's reading, decided with the leader on
2026-10-30 (DR-005 option 1, FP and FN as separate surfaces with independent visibility):

- **FP and FN are surfaces of their own** (`FP = prediction AND NOT ground truth`, `FN = ground truth AND NOT prediction`),
  each switchable, each with its own legend row, pattern (FP checkered, FN striped) and colour.
- **Agreement (overlap, TP) has no surface of its own.** It is what the *prediction surface* shows where no error face
  covers it (the error faces are drawn on top of the prediction's, and the prediction is part-desaturated while they are
  shown). That is the "equivalent": the three classes are all visible, but only two of them are extra geometry. Reasons: the
  **phone payload** - a third surface would add roughly the size of the prediction mesh again (the error meshes of the Day 39
  data are 1.1-9.8 MB each, the surfaces 0.3-5 MB; four meshes can already reach ~17 MB), on a device whose WebView bridge and
  frame rate are the risk (TC-PERF-002) - and **the leader's option names FP and FN only**. The agreement *count* is in the
  artifact (`agreement_voxels`) and gives the same Dice as the server's metric.
- **An error region is a connected component** of the FP (or FN) voxels (26-connectivity by default, recorded in the artifact),
  labelled by `backend/mesh/error_geometry.py`. Selecting one (a tap on any of its faces) shows its class, voxel count and the
  slices it contributes to, starts on the tapped slice, steps through the region's slices, highlights the region in the scene,
  and opens SCR-03 / SCR-04 at the slice the panel is on.

## Hand-offs to SCR-03 and SCR-04, and the marker (`10` §6)

`Open in 2D` and `Open errors` push the slice the region panel is on (the tapped slice until the user steps). The voxel behind
the tapped face is a pixel of that slice in the very frame the 2D screens draw (x = column, y = row), so the push also carries
`marker: { column, row, sliceIndex }` and SCR-03 / SCR-04 draw a marker on that exact pixel (`mobile/src/verticals/v1/marker.mjs`).
It is carried **only while the slice opened is the slice the voxel was picked in** and is drawn only while that slice is shown:
after a region step to another slice, a slider move, or on a screen opened from the case list (SCR-02) the location is not
known, and `10` §6 forbids inventing a more precise highlight than the slice index, so there is none.

## Meshes reach the WebView in bounded chunks

The remark below about a truncated bridge payload is handled by the transfer protocol (`transferPlan` in
`inspector3d.mjs`, the receiver in `viewerSource.mjs`): a mesh is a start message (length, chunk size, number of chunks,
sha256), chunks of at most 192 KiB (256 KiB of base64), and an end; the page checks the order, the sizes, the length and the
sha256 **before** it decodes, and any problem is that layer's error (`mobile/README.md`, V2 section).

## What core already does

```js
const view = await client.call('reconstruction_get', { run_id, mask_id });
// view.state is one of the 7; view.data carries mesh_artifact_id, source_mask_kind,
// the 7 geometry fields and mesh_to_world_transform.
```

Core checks the geometry contract version on **every** geometry response and fails the call as
`FATAL_INVALID` / `CONTRACT_DRIFT` if it is not `dr008a-dr012/v1.0.0`. You never compare the version yourself.

## Error codes you must handle

`ARTIFACT_NOT_FOUND` · `RUN_NOT_SUCCEEDED` · `GEOMETRY_NOT_VALIDATED` · `GEOMETRY_MISMATCH` ·
`GROUND_TRUTH_UNAVAILABLE` · `ANALYSIS_FAILED` · `UNAUTHORIZED`

`GEOMETRY_MISMATCH` and `GEOMETRY_NOT_VALIDATED` both resolve to `FATAL_INVALID` with **no RETRY**. A mesh
rendered against an unvalidated geometry is a mesh in the wrong place, and it looks fine.

## The one that matters here

**The mesh comes from an artifact reference, not from the response body.** `reconstruction_get` returns
`mesh_artifact_id`; fetching the bytes is a separate concern and is not in the 28 endpoints. If the WebView
route survives `TECH_STACK_ADR`, the bridge message that carries a payload into the WebView is **not** a
contract response — validate it before trusting it:

```js
import { validateResponse, resolveEndpoint } from '../../core/index.mjs';
const problems = validateResponse(contract, resolveEndpoint(contract, 'reconstruction_get', params), msg);
```

That is the same check the client runs, exposed separately for exactly this case. Also remember the logcat
line limit found on Day 9 (~4,095 chars): a long bridge payload arrives **chunked**, and a truncated JSON
parses as garbage rather than failing loudly.
