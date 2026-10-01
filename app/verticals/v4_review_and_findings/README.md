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
- **Only a commit enters `CORRECTED`** (contract 1.1.0 `review_rules.corrected_only_via`): it leaves the review
  `CORRECTED` atomically with a new reviewed mask, and on a review already `CORRECTED` it adds a version without a
  transition. A PATCH to `CORRECTED` is refused before sending (`CORRECTED_BY_COMMIT_ONLY`) — the server would answer
  `INVALID_REVIEW_TRANSITION` — and no PATCH ever follows a commit.
- The review's status after a commit is **read from the commit answer**, and that answer must name a **new**
  `reviewed_mask_id`: one already in the version list would be an overwrite of an immutable version (PR-PROV-01),
  so it is refused as `CONTRACT_DRIFT` with Refresh, nothing appended and the session left UNSAVED.
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

`normalizeFinding()` refuses an unknown type or status always, and a missing case / slice when creating. A finding
that names a run also records the prediction variant that was on screen (`RAW` / `PROCESSED`; contract 1.1.0 sends
it as `finding_create.prediction_variant`, null without a run), so opening it can restore the same overlay.
`patch(findingId, { status, note })` is `finding_patch` with the finding's own revision as `expected_revision`;
`STALE_REVISION` changes nothing and offers Refresh.
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

Settled by contract v1.0 / 1.1.0 on Day 22 (no longer decisions): only a commit makes the review `CORRECTED`, and
it answers a new version id and the status; `review_create` carries the scope; the PUT echoes the case geometry;
masks travel as `{ encoding, data }`; a finding with a run records its prediction variant; findings carry a revision.

### Known limits (owned outside V4 today)

- **This branch is stacked on #71 (contract 1.1.0, over #62 and #68).** The fixture bundle needs that contract for
  the FR-REV-001 statuses, the scope and geometry fields, finding revisions and variants, and the `empty` scenarios.
- **The fixture answers every commit with the same new id** (`..._R2`). A second save in one session therefore gets
  an id that is already a version and is refused as drift (test `V4-8`); Refresh reloads the server's list and the
  save goes through. A real backend answers a new id per commit.
- **The generator has no `stale_revision` scenario for `finding_patch`**, so the FIXTURE panel cannot show a stale
  finding edit; test `F10` injects the generator's own STALE_REVISION envelope instead.

### The screens (`mobile/src/verticals/v4/`)

| File | What |
|---|---|
| `ReviewCorrectionScreen.js` | SCR-06: renders `reviewController.mjs` — header (source variant + id, review status, slice n/total), canvas (source / saved / unsaved layers + a text badge), toolbar, review transitions, Save / Cancel / New finding here |
| `reviewController.mjs` | variant (route or an explicit RAW / PROCESSED choice) → `analysis_run_get` (must be SUCCEEDED) → the scoped review → pixels → brush → save; node-tested in `mobile/test/v4_review_screen.test.mjs` |
| `gesture.mjs` | Spike A's A11 rules as a pure controller: one finger paints, a second finger or a system termination rolls the stroke back, two fingers pinch/pan, Pan mode |
| `syntheticSource.mjs` | **fixture mode only**: the labelled SYNTHETIC stand-in the brush edits, because the bundle carries no pixels |
| `FindingsScreen.js` + `findingsController.mjs` | SCR-08: list with evidence, Open evidence (SCR-03 / SCR-07), Review / correct (SCR-06), create only from a case/slice context; node-tested in `mobile/test/v4_findings_screen.test.mjs` |

Demo path while SCR-03 is still a placeholder: **Findings** tab → a finding → **Review / correct** → SCR-06 asks
RAW or PROCESSED → brush → **Save** (names the source first) → the review is CORRECTED → **New finding here**.
In the FIXTURE panel, `working_mask_put` / `review_commit` → `stale_revision` shows the Refresh-only path.

### TODO for Trung (from Day 23)

- **Device measurements on the product screen, not the spike:** `TC-PERF-003` (brush feedback ≤ 100 ms, zero
  lost committed samples; Spike A's A10 had worst 30.48 ms) and `TC-REV-003` (brush lands on the right source
  pixel after zoom/pan, on the phone). Also time `loadSlice` on the A17: it hashes each 576×576 source slice
  once, which a slice switch in SCR-06 pays. Every render re-scans the slice for the diff layers and the mask
  states — if the stroke feedback misses 100 ms on the A17, start there (track dirty rows instead).
- **Live pixels:** wire the shell's PNG adapter (`mobile/src/imaging/maskPng.js`, `decodeMaskPng`) into
  `ReviewCorrectionScreen.js` (it passes `decodeMaskPng: null` today, so live mode says "PNG decoder pending"), and
  draw the MRI slice (`mri_slice_get` → `content_url`) under the masks. Ask the backend whether a slice's
  `prediction_mask_id` is the run's `raw/processed_prediction_artifact_id`; the screen shows both and checks neither.
- **State polish:** loading / unavailable / error / stale for SCR-06 and SCR-08 (`TC-MOBILE-STATE-001`), the
  `ACCEPTED` confirmation dialog, and the source / unsaved / saved visuals; SCR-08 OPEN ↔ RESOLVED once
  `finding_patch` exists.
- **`TC-TEAM-001` evidence:** extend `management/evidence/TC_TEAM_001_NGUYEN_GIA_DUC_TRUNG.md` with this code, its
  tests and your own defense notes.
