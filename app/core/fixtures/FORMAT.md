# Fixture bundle format — what `app/core` reads

**Owner of the generator: Nguyễn Gia Đức Trung** (Day 10, task 6). **Owner of this format: the leader.**
Anything the four verticals need from a fixture, they get from a bundle in this shape.

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

`generate_fixture.py` on `main` is a **function with no CLI** — the `--contract/--output` entry point is still on
an unmerged branch. Whichever of the two you land, keep the function signature: `app/core` only ever sees the
JSON.

```json
{
  "bundle": "api_contract_11_fixture_bundle",
  "bundle_version": "v0",
  "contract": "api_contract_11",
  "contract_version": "DRAFT v0",
  "base_path": "/api/v1",
  "geometry": { "geometry_contract_version": "dr008a-dr012/v1.0.0",
                "geometry_validation_status": "VALIDATED" },
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
3. A `200` response must carry **every** name in that endpoint's `response_fields`. For list endpoints
   (`case_list`, `experiment_cases`, `reviewed_masks_list`, `findings_list`) a name counts as present if it is at
   the top level **or** on every element of `items` — those names are row fields.
4. An error response's `code` must appear in **that endpoint's** `errors` list, and its `status` must equal the
   `http_status` the contract gives that code. A fixture cannot invent `STALE_REVISION` on `mri_slice_get`.
5. An endpoint with `geometry_response: true` must carry all seven geometry fields with the exact version string.
6. `request.params` must supply every `{token}` in the endpoint's path and query.

## Scenario names the four verticals need today

| Endpoint | Scenarios |
|---|---|
| every endpoint a vertical calls | `default` |
| `ground_truth_slice_get`, `analysis_slice_metrics` | `ground_truth_unavailable` |
| `review_patch`, `working_mask_put`, `review_commit` | `stale_revision` |
| `analysis_run_get` | `run_running`, `run_failed` |
| `reconstruction_get` | `geometry_mismatch` |
| `experiment_compare` | `not_comparable` |

## Where it goes

`app/core/fixtures/.generated/api_bundle.json` — **gitignored**. CI regenerates it from the contract on every run;
nobody commits a bundle. Until `scenarios` exists, the core still loads the bundle and every screen renders the
`EMPTY_UNAVAILABLE` state with reason `FIXTURE_SCENARIO_MISSING`. That is a working screen, and it lights up with
no code change the moment the scenarios land.

## How to check your generator output

```bash
node -e "import('./app/core/index.mjs').then(async (core) => {
  const fs = await import('node:fs/promises');
  const contract = core.createContract(JSON.parse(await fs.readFile('contracts/api/contract.json','utf8')));
  const bundle = core.createBundle(contract, JSON.parse(await fs.readFile(process.argv[1],'utf8')));
  console.log('bundle ok, scenarios for', Object.keys(bundle.scenarios).length, 'endpoints');
})" path/to/api_bundle.json
```
