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
| `index.mjs` | review model: `open` / `refresh`, `patchStatus` with the `05` §6 transitions enforced **before** sending, `saveCorrection` (PUT the edited slices, then commit a new version) | PR-REV-01, PR-PROV-01, FR-REV-001/008/009/010 |
| `brush.mjs` | brush session: add / erase, radius ∈ {0, 1, 2, 3, 5}, strokes at **source** resolution through core `screenToSource`, undo / redo / reset / cancel, mask state SOURCE / UNSAVED / SAVED, save export (run-length + SHA-256) | PR-REV-02, FR-REV-002…007/011 |
| `findings.mjs` | finding anchored to `{experiment?, run?, case, slice, region?, type, status}`, validation, `evidenceLocation()`, list / create over core | PR-FIND-01, FR-FIND-001…004 |
| `sha256.mjs` | SHA-256 for the device bundle (no `node:crypto` there) | TC-REV-006 |

### Review states (`05` §6, FR-REV-001)

`NOT_REVIEWED → ACCEPTED | FLAGGED | CORRECTED` · `FLAGGED → CORRECTED` · `ACCEPTED → FLAGGED | CORRECTED` ·
`CORRECTED` has no way out. These equal `contract.json` `domain_enums` (test `V4-0`).

- `CORRECTED` needs at least one saved reviewed mask (`CORRECTION_NOT_SAVED` otherwise).
- Leaving `ACCEPTED` is allowed only with the audit history kept: the server keeps it, the client makes it a
  confirmed action — `patchStatus(to, { confirmed: true })`, else `CONFIRMATION_REQUIRED`.
- A refused transition is a `rejection` on the snapshot: **nothing is sent** and the view, status and revision
  are unchanged. A server-side `STALE_REVISION` is `STALE_MISMATCH` → `REFRESH` → `refresh()`.
- `snapshot.transitions` lists every other state with `ok` / `reason` / `confirm`, so the toolbar greys out a
  button with the same rule the model enforces.

### Brush (`brush.mjs`)

The stroke, footprint and history functions are a **copy** of Spike A's `brushMath.js` and the run-length coder
of `persist.js` — the code A3–A8, A10 and A11 measured on the A17 — with a provenance header. `test_brush.mjs`
`B0` fails if a copied body drifts from the spike, and `B1` replays the spike's Python oracle through the session.

```js
const s = createBrushSession({ nx, ny, source: { maskId, kind: SOURCE_KIND.RAW_PREDICTION_MASK } });
s.loadSlice(z, bytes);                 // private copy + SHA-256; ground truth is refused as a source
s.setTool(TOOL.ERASE); s.setRadius(3);
s.beginStroke(z); s.sample(u, v, transform); s.endStroke();   // END_SECOND_FINGER / END_TERMINATED roll back
s.undo(); s.redo(); s.reset(); s.cancel(); s.maskState(z); s.diffRuns(z); s.sourceIntact();
await review.saveCorrection(s);        // PUT + commit; the session turns SAVED only after the commit succeeds
```

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

1. **Saving does not change the status.** `CORRECTED` is chosen by the user once a reviewed mask exists. The
   contract does not say whether `review_commit` itself moves the review (it lists `INVALID_REVIEW_TRANSITION`);
   settle it with the backend.
2. **After a 2xx `review_patch` the status is the one requested.** The generated fixture answers a fixed status,
   so the echo is not read back. With a real backend, compare it and treat a mismatch as `CONTRACT_DRIFT`.
3. **`open()` initialises with `NOT_REVIEWED` through `review_create`** — the contract has no review GET.
4. **`mask_payload` is `v4_binary_slice_rle/v1`** (persist.js run-length + SHA-256), a proposal until the ADR
   picks the binary encoding (`11` §8).
5. **A save re-sends every slice the server already holds**, so an edit undone after a failed save cannot ride
   into the commit (test `V4-10`).
6. **A finding's region is `POINT` / `BOX` in source pixels**, a proposal for the free-form `region_reference`.
7. **A created finding keeps the anchor it was created from**; the fixture echoes placeholder ids.

### Known limits (owned outside V4 today)

- **An empty list is `CONTRACT_DRIFT` in core** (`transport.mjs` / `loader.mjs` rule 3): a fresh review with no
  reviewed mask cannot open against a real backend, and SCR-08 cannot show "no findings". A3 fixes it in the
  contract v1.0 PR; then add a V4 test on the generated `empty` scenario.
- **`finding_patch` is not implemented**: it requires `expected_revision`, but neither `findings_list` nor
  `finding_create` returns a revision. Contract gap — raise a decision request.
- **A finding records no prediction variant**, while SCR-03 refuses to default one (`11` §6), so opening a finding
  cannot restore the variant. Contract gap.
- **The fixture's `review_commit` returns the reviewed-mask id already listed.** With a real backend, refuse a
  commit that returns an existing version id (it would be an overwrite, PR-PROV-01).

### TODO for Trung (from Day 23)

- **Device measurements on the product screen, not the spike:** `TC-PERF-003` (brush feedback ≤ 100 ms, zero
  lost committed samples; Spike A's A10 had worst 30.48 ms) and `TC-REV-003` (brush lands on the right source
  pixel after zoom/pan, on the phone). Also time `loadSlice` on the A17: it hashes each 576×576 source slice
  once, which a slice switch in SCR-06 pays.
- **State polish:** loading / unavailable / error / stale for SCR-06 and SCR-08 (`TC-MOBILE-STATE-001`), the
  `ACCEPTED` confirmation dialog, and the source / unsaved / saved visuals.
- **`TC-TEAM-001` evidence:** extend `management/evidence/TC_TEAM_001_NGUYEN_GIA_DUC_TRUNG.md` with this code, its
  tests and your own defense notes.
- **After A3's contract PR merges:** delete the `TEMPORARY` `domain_enums` fallback in `V4-0` / `F0`, and add the
  empty-list test above.
