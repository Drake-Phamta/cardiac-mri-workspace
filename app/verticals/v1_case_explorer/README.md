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
| `SCR-04` | `analysis_slice_error` | `ARTIFACT_REFERENCE` |
| `SCR-04` | `analysis_run_metrics` | `?prediction_variant={variant}` |

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
2. **`SCR-04` has no worst-slice endpoint yet.** DR-010 froze the ranking *and* froze who applies it: the API
   returns the selection, the client never re-derives it. No endpoint in the contract returns one today; a
   Decision Request is open. Until it resolves `readSelection()` returns `available: false` and the screen
   shows unavailable. **Do not rank `analysis_slice_metrics` client-side** — that is exactly what DR-010
   forbids, and it would make the phone disagree with the server about a clinical question.
