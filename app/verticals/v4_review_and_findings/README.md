# V4 — Review / Correction (`SCR-06`) and Findings (`SCR-08`)

**Owner: Nguyễn Gia Đức Trung.** Branch from the `app/core` branch, not from `main`.

This is the only vertical that **writes**. Every rule below exists because a lost or overwritten correction is
not a UI bug — it is a clinical record that quietly changed.

## Endpoints this vertical calls

| Screen | Endpoint id | Method | Notes |
|---|---|---|---|
| `SCR-06` | `review_create` | `POST` | returns `revision` and `etag` |
| `SCR-06` | `review_patch` | `PATCH` | **revision required** |
| `SCR-06` | `working_mask_put` | `PUT` | **revision required**, artifact write, geometry response |
| `SCR-06` | `review_commit` | `POST` | **revision required**, artifact write, geometry response |
| `SCR-06` | `reviewed_masks_list` | `GET` | list endpoint |
| `SCR-06` | `reviewed_mask_slice_get` | `GET` | `BINARY`, geometry response |
| `SCR-08` | `finding_create` | `POST` | |
| `SCR-08` | `findings_list` | `GET` | list endpoint |
| `SCR-08` | `finding_patch` | `PATCH` | **revision required** |

## Writes: `expected_revision` is not optional

`revision_rules.last_write_wins_allowed` is `false`. Core refuses a write whose body has no
`expected_revision` — before it reaches the transport, so the request is never sent:

```js
const view = await client.call('review_patch', { review_id },
  { body: { status: 'APPROVED', expected_revision: current.revision } });
```

Forget it and you get `MISSING_EXPECTED_REVISION` as a `FATAL_INVALID`, not a silent overwrite. All four
revision-required endpoints are covered by test `E7`.

## `STALE_REVISION` never offers a retry

This is the rule most likely to be got wrong, because retrying is the reflex:

```
STALE_REVISION → state STALE_MISMATCH → action REFRESH   (never RETRY)
```

Re-sending the same write with the same stale revision *is* last-write-wins, which the contract forbids. The
user must reload and re-apply on top of what is now there. `core/screenState.mjs` strips a `RETRY` action from
this state even if a caller passes one, and tests `R4` and `S3` hold that.

`IMMUTABLE_ARTIFACT` is a different failure and resolves to `FATAL_INVALID`: an immutable artifact version
cannot be overwritten at all, so there is nothing to refresh into.

## Error codes you must handle

`ARTIFACT_NOT_FOUND` · `SLICE_OUT_OF_RANGE` · `INVALID_REVIEW_TRANSITION` · `STALE_REVISION` ·
`IMMUTABLE_ARTIFACT` · `GEOMETRY_NOT_VALIDATED` · `GEOMETRY_MISMATCH` · `VALIDATION_ERROR` ·
`RUN_NOT_SUCCEEDED` · `CASE_NOT_FOUND` · `UNAUTHORIZED`

## You also own the fixture generator

`app/core/fixtures/FORMAT.md` is the shape `app/core` reads, and the loader enforces its six rules. Two notes
for the generator:

- everything outside `scenarios` is what `generate_fixture(schema)` already returns — do not change it;
- the scenarios this vertical needs first are `stale_revision` on `review_patch`, `working_mask_put` and
  `review_commit`. Those three are the states you cannot demo without.

Check your output before pushing:

```bash
node app/core/tests/run_all.mjs
```

Test `D2` runs your generator in-process and loads its output, so a change that breaks the handshake fails in
your own CI run rather than in three other people's screens.
