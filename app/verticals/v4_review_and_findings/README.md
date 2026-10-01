# V4 — Review / Correction (`SCR-06`) and Findings (`SCR-08`)

**Owner: Nguyễn Gia Đức Trung.** Branch from `main` (`app/core` merged there as #48).

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
  { body: { status: 'FLAGGED', expected_revision: current.revision } });
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

## What is here (Day 22)

Day 10 gave this vertical its revision-safe review model. On Day 22 a working skeleton was built on top of it
under the one-day recovery override, **for its owner Nguyễn Gia Đức Trung**, who completes, measures and defends
it from Day 23 (PR-MOBILE-03). Every file is framework-neutral: no React / React Native import, no npm dependency.

| File | What it owns | Requirements |
|---|---|---|
| `index.mjs` | review model: `open` (case geometry + review scoped to run / source mask / variant) / `refresh`, `patchStatus` with the `05` §6 transitions enforced **before** sending, `commit`, `saveCorrection` (PUT the edited slices, then commit a new version — which makes the review CORRECTED) | PR-REV-01, PR-PROV-01, FR-REV-001/008/009/010 |
| `brush.mjs` | brush session: add / erase, radius ∈ {0, 1, 2, 3, 5}, strokes at **source** resolution through core `screenToSource`, undo / redo / reset / cancel, mask state SOURCE / UNSAVED / SAVED, save export | PR-REV-02, FR-REV-002…007/011 |
| `maskPayload.mjs` | the contract v1.0 `mask_payload` — `{ encoding: 'BITPACK_BASE64', data }` — and its inverse | FR-REV-008, TC-REV-005 |
| `findings.mjs` | finding anchored to `{experiment?, run?, case, slice, region?, type, status}` (+ its `revision`), validation, `evidenceLocation()`, list / create over core | PR-FIND-01, FR-FIND-001…004 |
| `sha256.mjs` | SHA-256 for the device bundle (no `node:crypto` there) | TC-REV-006 |

### Review states (`05` §6, FR-REV-001, contract v1.0 `review_rules`)

`NOT_REVIEWED → ACCEPTED | FLAGGED | CORRECTED` · `FLAGGED → CORRECTED` · `ACCEPTED → FLAGGED | CORRECTED` ·
`CORRECTED` has no way out. These, and `review_rules`, equal `contract.json` (test `V4-0`).

- A review is **scoped** to one run, one source mask and one prediction variant (DR-009):
  `open({ caseId, runId, sourceMaskId, predictionVariant })`. `open` reads `case_get` first, because every
  working-mask PUT must echo the **case's** `geometry_contract_version` and `geometry_validation_status`
  (`GEOMETRY_NOT_VALIDATED` on the real data) — never an assumed `VALIDATED`.
- **A successful commit leaves the review `CORRECTED` by itself** (`review_rules.commit_result_state`); on a review
  already `CORRECTED` it adds a version without a transition. No PATCH follows a commit (`CORRECTED → CORRECTED` is
  not a transition).
- A PATCH to `CORRECTED` needs at least one saved reviewed mask (`CORRECTION_NOT_SAVED` otherwise).
- Leaving `ACCEPTED` — by a PATCH or by saving a correction — is a confirmed action in the client
  (`{ confirmed: true }`, else `CONFIRMATION_REQUIRED`); the server allows it because it keeps the history.
- A refused action is a `rejection` on the snapshot: **nothing is sent** and the view, status and revision are
  unchanged. A server-side `STALE_REVISION` is `STALE_MISMATCH` → `REFRESH` → `refresh()`.
- `snapshot.transitions` lists every other state with `ok` / `reason` / `confirm`, so the toolbar greys out a
  button with the same rule the model enforces.

### Brush (`brush.mjs`)

The stroke, footprint and history functions are a **copy** of Spike A's `brushMath.js` — the code A3–A7, A10 and
A11 measured on the A17 — with a provenance header. `test_brush.mjs` `B0` fails if a copied body drifts from the
spike, and `B1` replays the spike's Python oracle through the session.

```js
const s = createBrushSession({ nx, ny, source: { maskId, kind: SOURCE_KIND.RAW_PREDICTION, variant: 'RAW' } });
s.loadSlice(z, bytes);                 // 0/1 bytes; private copy + SHA-256; ground truth is refused as a source
s.setTool(TOOL.ERASE); s.setRadius(3);
s.beginStroke(z); s.sample(u, v, transform); s.endStroke();   // END_SECOND_FINGER / END_TERMINATED roll back
s.undo(); s.redo(); s.reset(); s.cancel(); s.maskState(z); s.diffRuns(z); s.sourceIntact();
await review.saveCorrection(s);        // PUT + commit; the session turns SAVED only after the commit succeeds
```

`saveCorrection` refuses, before sending anything: another source mask than the review's, a slice size other
than the case's, a `synthetic` stand-in session on any transport but the fixture one, and an unconfirmed save of
an `ACCEPTED` review.

### Findings (`findings.mjs`)

`normalizeFinding()` refuses an unknown type or status always, and a missing case / slice when creating.
`evidenceLocation()` opens `SCR-03` at the case and slice (with the region only if one was recorded), `SCR-07` for
an experiment-only record, and otherwise says `NO_EVIDENCE_IDENTIFIERS` instead of guessing.

### Run the tests

```powershell
python contracts/api/generate_fixture.py --contract contracts/api/contract.json --output app/core/fixtures/.generated/api_bundle.json
node app/verticals/v4_review_and_findings/test_review_correction.mjs
node app/verticals/v4_review_and_findings/test_brush.mjs
node app/verticals/v4_review_and_findings/test_findings.mjs
```

CI runs the same three in the `V4 review and findings` step of `guardrails.yml`.

### Decisions taken in the skeleton — keep or change them, and be ready to defend them

1. **After a 2xx `review_patch` the status is the one requested.** The generated fixture answers a fixed status,
   so the echo is not read back. With a real backend, compare it and treat a mismatch as `CONTRACT_DRIFT`.
2. **`open()` initialises with `NOT_REVIEWED` through `review_create`**, which returns an existing review of the
   same scope unchanged (contract v1.0) — there is no review GET.
3. **Uploads are `BITPACK_BASE64`**, one of the two encodings `binary_delivery` allows; it needs no PNG encoder.
4. **A save re-sends every slice the server already holds**, so an edit undone after a failed save cannot ride
   into the commit (test `V4-10`).
5. **Leaving `ACCEPTED` asks for confirmation** in the client, though the contract allows it outright.
6. **A finding's region is `POINT` / `BOX` in source pixels**, a proposal for the free-form `region_reference`.
7. **A created finding keeps the anchor it was created from**; the fixture echoes placeholder ids.

Settled by contract v1.0 on Day 22 (no longer decisions): a commit makes the review `CORRECTED`; `review_create`
carries the scope; the PUT echoes the case geometry; masks travel as `{ encoding, data }`.

### Known limits (owned outside V4 today)

- **Contract v1.0 (#62) must be on main** for the fixture bundle to carry FR-REV-001 statuses, the v1.0 scope and
  geometry fields, finding revisions and the `empty` list scenarios. Until then the review and findings tests fail.
- **`finding_patch` (OPEN ↔ RESOLVED, note) is not implemented yet.** Contract v1.0 gives every finding row its
  `revision`, so it can be — after #62 merges.
- **A finding records no prediction variant**, while SCR-03 refuses to default one (`11` §6), so opening a finding
  cannot restore the variant. Queued for a follow-up contract PR.
- **The fixture's `review_commit` returns the reviewed-mask id already listed.** With a real backend, refuse a
  commit that returns an existing version id (it would be an overwrite, PR-PROV-01). Queued with the above.

### TODO for Trung (from Day 23)

- **Device measurements on the product screen, not the spike:** `TC-PERF-003` (brush feedback ≤ 100 ms, zero
  lost committed samples; Spike A's A10 had worst 30.48 ms) and `TC-REV-003` (brush lands on the right source
  pixel after zoom/pan, on the phone). Also time `loadSlice` on the A17: it hashes each 576×576 source slice
  once, which a slice switch in SCR-06 pays.
- **State polish:** loading / unavailable / error / stale for SCR-06 and SCR-08 (`TC-MOBILE-STATE-001`), the
  `ACCEPTED` confirmation dialog, and the source / unsaved / saved visuals.
- **`TC-TEAM-001` evidence:** extend `management/evidence/TC_TEAM_001_NGUYEN_GIA_DUC_TRUNG.md` with this code, its
  tests and your own defense notes.
- **After contract v1.0 (#62) merges:** delete the `TEMPORARY` fallback in `V4-0` / `F0`, add a test that opens a
  fresh review on the generated `empty` `reviewed_masks_list` and lists an empty `findings_list`, and implement
  `finding_patch` with `expected_revision`.
