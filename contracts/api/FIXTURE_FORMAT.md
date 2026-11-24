# Fixture bundle format — what the app's fixture mode reads

Anything a screen needs from a fixture, it gets from a bundle in this shape (`createBundle` in
`mobile/src/api/client.mjs` checks it).

The bundle is **generated**, never hand-written. `contracts/api/contract.json` says so itself:

```json
"fixture_rules": { "generated_from_schema": true, "handwritten_fixtures_allowed": false,
                   "generator": "generate_fixture.py" }
```

## The shape

`contract`, `contract_version`, `base_path`, `endpoints`, `errors` and `geometry` are **exactly what
`generate_fixture(schema)` on `main` already returns** — do not change them. What this format adds is:

- **`scenarios`** — the real work, below;
- four provenance keys (`bundle`, `bundle_version`, `generated_by`, `generated_command`). The loader treats all
  four as **optional**, so adding them is a convenience for whoever debugs a bundle at 22:00, not a gate.

Every value in `scenarios` is derivable from `contract["endpoints"][*]`, so the generator stays a generator.

`generate_fixture.py` exposes the function and a `--contract/--output` command line; keep the function signature:
the app only ever sees the JSON.

```json
{
  "bundle": "api_contract_11_fixture_bundle",
  "bundle_version": "v0",
  "contract": "api_contract_11",
  "contract_version": "1.1.0",
  "base_path": "/api/v1",
  "geometry": { "geometry_contract_version": "dr008a-dr012/v1.0.0",
                "geometry_validation_status": "GEOMETRY_NOT_VALIDATED" },
  "generated_by": "contracts/api/generate_fixture.py",
  "generated_command": "python contracts/api/generate_fixture.py --contract contracts/api/contract.json --output <path>",
  "endpoints": [ { "id": "...", "method": "...", "path": "...", "response_kind": "..." } ],
  "errors":    [ { "code": "...", "http_status": 404 } ],

  "scenarios": {
    "<endpoint_id>": {
      "default": {
        "request":  { "params": { "case_id": "CASE_0043", "slice_index": 44 }, "body": null },
        "response": { "status": 200, "data": { "<every name in response_fields>": "<value>" } }
      },
      "<scenario_name>": {
        "request":  { "params": { "...": "..." }, "body": null },
        "response": { "status": 404,
                      "error": { "code": "GROUND_TRUTH_UNAVAILABLE",
                                 "message": "...", "request_id": "req_0001", "details": null } }
      }
    }
  }
}
```

## Rules the loader enforces, so a drift fails in one second instead of at 20:00

1. `contract`, `contract_version`, `base_path` and the geometry version must equal the contract's.
2. Every `scenarios` key must be a real endpoint id.
3. A `200` response must carry **every** name in that endpoint's `response_fields`. The five list endpoints
   (`case_list`, `experiment_list`, `experiment_cases`, `reviewed_masks_list`, `findings_list`) declare
   `row_fields` in contract v1.0.0: those names must be on **every** element of `items`, and every other name
   (minus `items`) must be on the top-level object. An empty page, `items: []`, is therefore valid — the row
   fields are vacuously present — while an empty page that drops a top-level field (`next_page`, say) is not.
   For a contract without `row_fields` the pre-v1.0 rule applies: a name counts as present if it is at the top
   level or on every element of a non-empty `items`.
4. An error response's `code` must appear in **that endpoint's** `errors` list, and its `status` must equal the
   `http_status` the contract gives that code. A fixture cannot invent `STALE_REVISION` on `mri_slice_get`.
5. An endpoint with `geometry_response: true` must carry all seven geometry fields with the exact version string.
6. `request.params` must supply every `{token}` in the endpoint's path and query.

## Scenario names the four verticals need today

| Endpoint | Scenarios |
|---|---|
| every endpoint a vertical calls | `default` |
| the five list endpoints | `empty` (`items: []`, top-level fields present) |
| `case_get` | `inference_review` (INT-12: `mode: INFERENCE_REVIEW`, `ground_truth_available: false`) |
| `ground_truth_slice_get`, `analysis_slice_metrics`, `analysis_run_metrics` | `ground_truth_unavailable` |
| `analysis_run_metrics` | `no_eligible_slices` (an empty `worst_slice_selection.slices`) |
| `review_patch`, `working_mask_put`, `review_commit` | `stale_revision` |
| `review_patch` | `invalid_transition` |
| `analysis_run_get` | `run_running`, `run_failed` |
| `reconstruction_get` | `geometry_mismatch` |
| `experiment_compare` | `not_comparable`; `comparable` (summary for every RAW matrix experiment) |
| `experiment_list` | `full_matrix` (the seven experiments of 08 §2) |

## Where it goes

`mobile/src/generated/api_bundle.json` — **gitignored**, written by `mobile/scripts/prepare.mjs`; the tests generate
their own copy in memory. Nobody commits a bundle. Without `scenarios` the app still loads the bundle and every screen renders the
`EMPTY_UNAVAILABLE` state with reason `FIXTURE_SCENARIO_MISSING`. That is a working screen, and it lights up with
no code change the moment the scenarios land.

## How to check your generator output

```bash
node -e "Promise.all([import('./mobile/src/api/contract.mjs'), import('./mobile/src/api/client.mjs')]).then(async ([c, client]) => {
  const fs = await import('node:fs/promises');
  const contract = c.createContract(JSON.parse(await fs.readFile('contracts/api/contract.json','utf8')));
  const bundle = client.createBundle(contract, JSON.parse(await fs.readFile(process.argv[1],'utf8')));
  console.log('bundle ok, scenarios for', Object.keys(bundle.scenarios).length, 'endpoints');
})" path/to/api_bundle.json
```
