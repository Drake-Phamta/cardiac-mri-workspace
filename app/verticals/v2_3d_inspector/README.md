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
`{variant}`. The bytes are the one `cardiac-errormesh/1` artifact (the FP and FN surfaces, every face with its source
slice and class) on the same content route as the surface meshes - see `contracts/api/README.md`, "3-D error mesh". The
screen draws it only for the masks it shows (`reference_mask_id`, `prediction_mask_id`).

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
