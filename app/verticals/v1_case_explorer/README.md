# V1 — Case Explorer (`SCR-03`) and Error Inspector (`SCR-04`)

**Owner: Phạm Tuấn Anh.** Branch from the `app/core` branch, not from `main`.

## Endpoints this vertical calls

| Screen | Endpoint id | Notes |
|---|---|---|
| `SCR-03` | `case_get` | geometry response — all 7 fields, exact version |
| `SCR-03` | `geometry_get` | geometry response |
| `SCR-03` | `mri_slice_get` | `BINARY`; tokens `case_id`, `slice_index` |
| `SCR-03` | `ground_truth_slice_get` | `ERROR_OR_JSON` — **absent GT is an error, not an empty mask** |
| `SCR-03` | `prediction_slice_get` | `?variant={variant}` — the token is `variant`, the parameter is `variant` |
| `SCR-03` | `analysis_run_get` | drives the PROCESSING state while a run is `QUEUED`/`RUNNING` |
| `SCR-04` | `analysis_slice_metrics` | `?prediction_variant={variant}` — parameter name ≠ token name |
| `SCR-04` | `analysis_run_metrics` | `?prediction_variant={variant}` — case metrics and the server's `worst_slice_selection` |

`SCR-04` never calls `analysis_slice_error`: it draws TP / FP / FN on the device from the two masks the server
served for the slice, and takes every number from the server (`analysis_run_metrics`, `analysis_slice_metrics`).

`analysis_run_create` is a **SHOULD** (`PR-AN-01`) and belongs to `SCR-09`; it is not in scope today.

## What core already does, so you do not

```js
import { createClient, createFixtureTransport, createBundle, createContract } from '../../core/index.mjs';

const view = await client.call('prediction_slice_get',
  { run_id, slice_index, variant: 'RAW' });   // URL, validation and error mapping are done
switch (view.state) { /* one of the 7 — see core/screenState.mjs */ }
```

- **Never build a URL.** `resolveEndpoint` knows that the query string is baked into `path` and that
  `?prediction_variant={variant}` has a parameter name that is not the token name.
- **Never branch on an HTTP status.** `view.state` is already the answer.
- **Never default a variant.** `11` §6 forbids a silent substitution; core throws `MISSING_PARAM` instead.
- **Zoom / pan / screen→source** are in `core/viewMath.mjs`, copied from the Spike A build that was measured
  on an A17 (A2: 16/16 checksums). Do not rewrite them; that would discard the evidence.

## Error codes you must handle

`CASE_NOT_FOUND` · `SLICE_OUT_OF_RANGE` · `ARTIFACT_NOT_FOUND` · `GROUND_TRUTH_UNAVAILABLE` ·
`GEOMETRY_NOT_VALIDATED` · `GEOMETRY_MISMATCH` · `RUN_NOT_SUCCEEDED` · `ANALYSIS_FAILED` · `UNAUTHORIZED`

You do not map them. `core/errors.mjs` does, and `test_errors.mjs` walks all 15.

## Two things that will bite

1. **Absent ≠ empty** (`10` §7). A case with no ground truth shows "unavailable", never a zero mask and never
   an empty Dice chart. `GROUND_TRUTH_UNAVAILABLE` already resolves to `EMPTY_UNAVAILABLE` — just render it.
2. **The worst slice is the server's, never the phone's.** DR-010 froze the ranking *and* froze who applies it:
   the API returns the selection, the client never re-derives it. DR-010a option (b) settled where it comes
   from: `analysis_run_metrics` carries a `worst_slice_selection` block, ranked by the server, worst first, and
   app/core's `readSelection()` reads it in the order served. A block that is missing or malformed reads as
   `available: false` with its reason, and the screen shows unavailable. **Do not rank `analysis_slice_metrics`
   client-side** — that is exactly what DR-010 forbids, and it would make the phone disagree with the server
   about a clinical question.

## No analysis run

A real case is served before any training, so a case with no run opens as an MRI slice view instead of failing
(#80). What the model does then:

- **`variant` may be `null` at construction.** A case with no run needs none, and the model ignores it there.
  There is still no default: `open()` with a `runId` and no variant throws before any request, and once a no-run
  case is open `setVariant` is a no-op that sends nothing and records `refused: { action: 'setVariant', reason }`.
  So **construct with an explicit variant if the explorer will ever open a run** — SCR-03 builds a new explorer,
  with the chosen variant, whenever the run changes.
- **`noRunReason`** says why there is no run, and `runId` is then `null`:

  | Reason | When |
  |---|---|
  | `NO_ANALYSIS_RUN` | `open()` was given no `runId` |
  | `RUN_NOT_LISTED` | a `runId` was given, but `case_get` lists no run (`available_run_ids` empty); `requestedRunId` keeps the id that was asked for, so it is not dropped silently |

  Outside these two, `noRunReason` is `null` and `requestedRunId` equals `runId`. A `runId` missing from a
  non-empty list is still asked for, and `analysis_run_get` must name the open case; the generator's ids never
  match a request (`AVAILABLE_RUN_IDS_0043` for `RUN_0043`), so a list check there would block every generated
  scenario. SCR-03 does not get that far: it sends the user to its run chooser.
- **What opens:** the MRI slice, plus ground truth where the case declares it. No `analysis_run_get`,
  prediction or metric request is made. `layerReasons.PREDICTION`, `layerReasons.ERROR` and `metrics.reason`
  carry the same reason, and `canEnter3D` / `canEnterError` are `false` — SCR-04 compares a run's prediction
  with ground truth, so it needs a run even where the ground truth came back.
- Navigation, refresh, the ground-truth overlay and the per-slice cache work as they do with a run.

## Tests

```bash
node app/verticals/v1_case_explorer/test_case_explorer.mjs   # 91 checks, groups V1-1 … V1-27
```

Against the generated bundle, plus small inline stubs that edit one field of a generated response. `V1-23`
fails if the count on the line above stops matching the checks the file makes.
