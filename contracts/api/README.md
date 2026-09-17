# API Contract 11 — DRAFT v0

This directory is the reviewable, schema-first draft of the backend/mobile API
contract from `docs/specs/v1.0/11_API_CONTRACT.md`. It defines resource
semantics, endpoint shapes, stable errors, geometry provenance, review
revision rules, and fixture-generation policy. It does **not** implement a
web server, database, authentication service, or production API.

## Scope

The draft covers the complete frozen operation surface:

- studies and cases;
- MRI, ground-truth, geometry, and prediction slices;
- experiment lists/details/metrics/per-case results and fair comparison;
- analysis-run creation/state/metrics/per-slice error data;
- reconstruction and 3-D error artifacts;
- review creation/state, working brush slices, immutable reviewed-mask commit
  and access;
- finding creation/list/update.

Every endpoint is listed in `schema.json`. A client may use a signed or
versioned artifact URL for large binary responses, but it must still receive
the same source IDs, variant, geometry, and availability semantics.

## Scientific and safety invariants

1. A missing ground truth is `GROUND_TRUTH_UNAVAILABLE`; the API never returns
   an all-zero mask or a fabricated zero metric as a substitute.
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

## Stable errors

The schema contains exactly the 15 error codes from §10 for this frozen DRAFT v0.
Adding or changing a code requires a new contract version/ADR. Each error has a machine code,
safe message template, and HTTP status. The standard envelope is:

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

The validator rejects a draft that drops an error code, removes the geometry
fields, weakens stale-write protection, permits overwrite, or introduces a
zero placeholder for unavailable ground truth.

## Schema and generated fixture checks

Run the data-free checks:

```powershell
python test_api_contract.py
```

The test loads `schema.json`, validates the contract rules, and creates a
temporary mock fixture through `generate_fixture.py`. Endpoint and error
records in that fixture are read from the schema; no handwritten mock endpoint
catalog is accepted. No clinical image, mask, mesh, or patient-derived byte is
committed.

The validator applies the formal Draft 2020-12 schema before semantic checks and
requires the `jsonschema` package (the same dependency used by repository QA):

```powershell
python validate_api_contract.py --contract contract.json
```

This is intentionally `DRAFT v0`. A production freeze requires an ADR,
implementation integration tests, authentication decisions, and leader/API
review; this PR does not make those decisions.
