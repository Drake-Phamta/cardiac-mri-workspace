/*
 * SCR-06 Review / Correction — everything the screen does except drawing.
 * Pure (no React Native), so node --test drives it against the generated
 * fixture bundle; ReviewCorrectionScreen.js renders getState() and forwards
 * taps and touches here.
 *
 * Built on Day 22 under the recovery override for V4's owner Nguyễn Gia Đức
 * Trung, on the framework-neutral V4 models in app/verticals/v4_review_and_
 * findings/ (review state, brush session, mask payload). Landed on the shell
 * of main (DR-021) as a working skeleton.
 *
 * READS go through the shell's useCall, WRITES through the V4 model (DR-021
 * rule 2). The controller never calls a read endpoint itself: it says what it
 * WANTS (`getState().wants`), the screen fetches that with useCall - latest
 * wins, aborted on unmount, aborted when it is no longer wanted - and hands the
 * answer back (`provideRun`, `provideSlice`). The writes and the review's own
 * open (review_create is a POST, review_patch / working_mask_put /
 * review_commit change the review) are explicit actions of the model, which
 * carries expected_revision on every one of them.
 *
 * The one exception to "reads go through useCall" is the review's open
 * sequence: the model runs case_get -> review_create -> reviewed_masks_list
 * itself (open(), and again on refresh()), because it ends in a POST and every
 * step needs the answer of the one before. Its two reads take this controller's
 * `signal`, so an unmounted screen stops them; review_create and the other
 * writes do not (a write that was sent is finished, not torn).
 *
 * The flow, and the rule behind each step:
 *   1. variant   RAW or PROCESSED, from the route or chosen by the user - never
 *                defaulted (`11` §6). A review is scoped to it (DR-009).
 *   2. run       analysis_run_get (read): the run must have SUCCEEDED; it names
 *                the case and the source artifact of the variant. In live mode
 *                it must be the run - and belong to the case - the route named.
 *   3. review    the V4 model: case geometry, review_create with the scope,
 *                reviewed-mask versions.
 *   4. pixels    LIVE, per slice: prediction_slice_get (+ mri_slice_get, and
 *                reviewed_mask_slice_get when continuing a CORRECTED review);
 *                the slice must be of the run's artifact for the variant
 *                (prediction_mask_id = the source) -> bytes through
 *                runtime.content (timeout, mandatory checksum, abandoned on
 *                unmount) -> the shell's one PNG adapter. FIXTURE: a SYNTHETIC
 *                stand-in, labelled as such - the bundle has no pixels.
 *   5. brush     the V4 brush session at SOURCE resolution; touches arrive in
 *                canvas coordinates and reach it only through screenToSource.
 *   6. save      the model's saveCorrection: PUT + commit = a new immutable
 *                version, and the review is CORRECTED.
 *
 * Continuing a review that is already CORRECTED (QA-063 N-4): the working base
 * is the LATEST committed version (its slice is read with
 * reviewed_mask_slice_get), the source - what Save names and what Reset returns
 * to - stays the original prediction. Editing from the source pixels would
 * make the server build the next version without the earlier correction.
 */

import {
  STATE, RECOVERY, loading, emptyUnavailable, fatalInvalid, stateForError, fitTransform, clampZoom, zoomAbout,
} from '../../../../app/core/index.mjs';
import { createReviewCorrection, PREDICTION_VARIANT } from '../../../../app/verticals/v4_review_and_findings/index.mjs';
import { createBrushSession, diffRuns, SOURCE_KIND_FOR_VARIANT, TOOL, MASK_STATE } from '../../../../app/verticals/v4_review_and_findings/brush.mjs';
import { syntheticSourceSlice } from './syntheticSource.mjs';
import { createGestureController, MODE } from './gesture.mjs';

export { MODE, TOOL, MASK_STATE };

export const PHASE = Object.freeze({
  CHOOSE_VARIANT: 'CHOOSE_VARIANT', // the route named no variant; the user picks one
  LOADING: 'LOADING',
  BLOCKED: 'BLOCKED',               // run / case / review could not be opened - show the state
  READY: 'READY',
});

export const PIXELS = Object.freeze({
  LOADING: 'LOADING',
  SYNTHETIC: 'SYNTHETIC',     // fixture mode stand-in
  SERVED: 'SERVED',           // decoded from the server's PNG, checksum verified
  UNAVAILABLE: 'UNAVAILABLE', // with a reason; the brush is off on this slice
});

const isVariant = (v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(PREDICTION_VARIANT, v);

// Row runs of 1s - one rectangle per run, so a mask is a few hundred shapes,
// not a View per pixel (the same idea as the spike's diffRuns).
export function maskRuns(buf, nx, ny) {
  const runs = [];
  for (let y = 0; y < ny; y++) {
    const row = y * nx;
    let x = 0;
    while (x < nx) {
      if (!buf[row + x]) { x += 1; continue; }
      const start = x;
      while (x < nx && buf[row + x]) x += 1;
      runs.push({ y, x: start, len: x - start });
    }
  }
  return runs;
}

const unavailable = (reason, extra = {}) => Object.freeze({ kind: PIXELS.UNAVAILABLE, reason, retryable: false, ...extra });
// A failed read can be tried again when its own state offers RETRY (a network failure, not a refusal).
const canRetry = (view) => Boolean(view && Array.isArray(view.actions) && view.actions.includes(RECOVERY.RETRY));

/*
 * runtime        the shell runtime: { mode, config, contract, client, content, imageStore }.
 *                content.bytes(content_url, { checksum, signal, kind }) is the
 *                app's one binary path (timeout, error mapping, mandatory
 *                checksum); imageStore.load(content_url, { checksum }) is the same
 *                path for the MRI <Image> (a verified data URI), null in fixture mode.
 * params         route params: runId (required by the navigator), and
 *                optionally caseId, variant, sliceIndex
 * decodeMaskPng  (bytes, { width, height }) -> { width, height, data: 0/1 };
 *                the app's shared adapter (src/imaging/maskPng.js), throwing
 *                CONTRACT_DRIFT on anything that is not the contract's mask PNG.
 *                null = live pixels are honestly unavailable.
 * signal         an AbortSignal that fires when the screen unmounts, so a
 *                stalled byte fetch is abandoned rather than left loading.
 */
export function createReviewScreen({ runtime, params = {}, decodeMaskPng = null, signal = null }) {
  const client = runtime.client;
  const fixture = runtime.mode === 'fixture';
  const review = createReviewCorrection(client);
  const listeners = new Set();

  let phase = PHASE.LOADING;
  let blockedView = loading();
  let variant = null;         // chosen: from the route, or by the user
  let target = null;          // { runId, caseId, variant, sourceMaskId }
  let session = null;
  let shape = null;           // [nx, ny, nz]
  let slice = null;
  const pixels = new Map();   // slice -> { kind, reason?, servedMaskId? (live: always the run's artifact), checksum? }
  const runsCache = new Map(); // slice -> source mask runs
  const mriUris = new Map();   // slice -> { uri, reason } (live), absent in fixture mode
  const inflight = new Set();  // slices whose provided answers are being turned into pixels
  let runPending = false;     // waiting for provideRun
  let runEpoch = 0;           // bumps on every (re)open, so the screen refetches the run
  let sliceWant = null;       // { z, ... } waiting for provideSlice
  let wantSeq = 0;
  let viewport = null;
  let transform = null;
  let fit = null;
  let mode = MODE.BRUSH;
  let busy = null;            // 'opening' | 'slice' | 'status' | 'saving' | null
  let notice = null;          // the outcome of the last action, for a banner
  let lastStroke = null;
  let version = 0;

  const emit = () => {
    version += 1;
    for (const fn of listeners) fn();
  };

  const gesture = createGestureController({
    getSession: () => session,
    getSlice: () => slice,
    getTransform: () => (pixelsReady(slice) ? transform : null),
    setTransform: (t) => { transform = t; },
    getFitZoom: () => (fit ? fit.zoom : 1),
    getMode: () => mode,
    onStrokeEnd: (r) => { lastStroke = r; },
  });

  function pixelsReady(z) {
    const p = z === null ? null : pixels.get(z);
    return Boolean(p && (p.kind === PIXELS.SYNTHETIC || p.kind === PIXELS.SERVED));
  }

  // Cheap enough for every touch: no mask scan.
  const editable = () => phase === PHASE.READY && pixelsReady(slice) && busy !== 'saving';

  function block(view) {
    phase = PHASE.BLOCKED;
    blockedView = view;
    runPending = false;
    sliceWant = null;
    busy = null;
    emit();
    return getState();
  }

  const newSession = () => {
    const base = review.current.baseVersion;
    return createBrushSession({
      nx: shape[0], ny: shape[1],
      source: { maskId: target.sourceMaskId, kind: SOURCE_KIND_FOR_VARIANT[target.variant], variant: target.variant, synthetic: fixture },
      base: base ? { reviewedMaskId: base.reviewed_mask_id } : null,
    });
  };

  // 2. the run, as the screen's useCall fetched it.
  async function provideRun(runView) {
    if (!runPending) return getState();
    runPending = false;
    try {
      return await openScoped(runView);
    } catch (err) {
      // A throw anywhere in opening (a malformed shape, a refused source)
      // becomes a blocking state with its message, never an unhandled rejection.
      return block(fatalInvalid({
        code: (err && err.code) || 'SCREEN_ERROR',
        safeMessage: 'SCR-06 could not open this review.',
        detail: { problems: [String(err && err.message)] },
      }));
    }
  }

  async function openScoped(run) {
    if (run.state !== STATE.SUCCESS) return block(run);
    const status = run.data.status;
    if (status !== 'SUCCEEDED') {
      // QUEUED / RUNNING -> PROCESSING (stays interactive); FAILED -> unavailable.
      return block(stateForError(runtime.contract, 'RUN_NOT_SUCCEEDED', { runStatus: status }));
    }
    // Live: the run that answered is the run the route asked for. (The generated
    // fixture echoes placeholder ids, so fixture mode takes the run's own id.)
    if (!fixture && run.data.run_id !== params.runId) {
      return block(fatalInvalid({
        code: 'CONTRACT_DRIFT',
        safeMessage: 'The run that answered is not the run this screen was opened for.',
        detail: { endpointId: 'analysis_run_get', problems: [`run_id is ${run.data.run_id}, the route named ${params.runId}`] },
      }, [RECOVERY.BACK]));
    }
    // ... and it belongs to the case the route named (QA_PR99_D39 NB-5). The geometry
    // and the MRI come from the case, the prediction from the run, so a disagreement
    // would draw one case's mask over another case's image.
    if (!fixture && params.caseId && run.data.case_id !== params.caseId) {
      return block(fatalInvalid({
        code: 'CONTRACT_DRIFT',
        safeMessage: 'The run that answered belongs to another case than the one this screen was opened for.',
        detail: { endpointId: 'analysis_run_get', problems: [`case_id is ${run.data.case_id}, the route named ${params.caseId}`] },
      }, [RECOVERY.BACK]));
    }
    const sourceMaskId = variant === PREDICTION_VARIANT.RAW
      ? run.data.raw_prediction_artifact_id : run.data.processed_prediction_artifact_id;
    if (!sourceMaskId) return block(emptyUnavailable('ARTIFACT_NOT_FOUND', [RECOVERY.BACK]));
    target = Object.freeze({ runId: params.runId, caseId: params.caseId || run.data.case_id, variant, sourceMaskId });

    // 3. the review, scoped.
    const opened = await review.open({
      caseId: target.caseId, runId: fixture ? run.data.run_id : params.runId, sourceMaskId, predictionVariant: variant, signal,
    });
    if (opened.view.state !== STATE.SUCCESS) return block(opened.view);

    shape = opened.geometry.shape;
    session = newSession();
    pixels.clear();
    runsCache.clear();
    mriUris.clear();
    inflight.clear();
    sliceWant = null;
    phase = PHASE.READY;
    busy = null;
    if (viewport) fitView();
    const wanted = Number.isInteger(params.sliceIndex) ? params.sliceIndex : Math.floor(shape[2] / 2);
    return setSlice(wanted);
  }

  // The base slice of a continued review, in fixture mode: there is no pixel
  // behind any version, so the stand-in is its own base (and labelled).
  function loadFixtureSlice(z) {
    const [nx, ny, nz] = shape;
    const synthetic = syntheticSourceSlice(nx, ny, z, nz);
    session.loadSlice(z, synthetic, session.baseId ? { base: Uint8Array.from(synthetic) } : {});
    pixels.set(z, Object.freeze({ kind: PIXELS.SYNTHETIC }));
  }

  // 4. pixels for one slice: ask the screen for the reads, or draw the stand-in.
  async function setSlice(z) {
    if (phase !== PHASE.READY) return getState();
    const nz = shape[2];
    if (!(Number.isInteger(z) && z >= 0 && z < nz)) return getState();
    if (gesture.active) gesture.terminate();
    slice = z;
    const have = pixels.get(z);
    if (fixture) {
      if (!have) loadFixtureSlice(z);
    } else if (!have || (have.kind === PIXELS.LOADING && !inflight.has(z))) {
      if (!decodeMaskPng || !runtime.content) {
        // The screen always passes the shell's adapter and runtime.content; this
        // is a runtime built without them, and it says so instead of inventing a mask.
        pixels.set(z, unavailable('NO_DECODER'));
      } else {
        pixels.set(z, Object.freeze({ kind: PIXELS.LOADING }));
        sliceWant = Object.freeze({
          z,
          ticket: (wantSeq += 1), // a new ask for the same slice (Retry) is a new reader
          caseId: target.caseId,
          runId: target.runId,
          variant: target.variant,
          needsMri: Boolean(runtime.imageStore) && !mriUris.has(z),
          baseVersionId: session.baseId,
        });
        busy = 'slice';
      }
    }
    emit();
    return getState();
  }

  /*
   * The reads for slice z, as the screen's useCall fetched them:
   *   prediction  prediction_slice_get  (required)
   *   mri         mri_slice_get         (optional: the masks are drawn without it)
   *   reviewed    reviewed_mask_slice_get of the base version (required when continuing)
   */
  async function provideSlice(z, { prediction = null, mri = null, reviewed = null } = {}) {
    const want = sliceWant;
    if (!want || want.z !== z || phase !== PHASE.READY) return getState();
    sliceWant = null;
    inflight.add(z);
    try {
      await settleSlice(z, want, { prediction, mri, reviewed });
    } catch (err) {
      pixels.set(z, unavailable((err && err.code) || 'CONTRACT_DRIFT', { detail: String(err && err.message) }));
    } finally {
      inflight.delete(z);
    }
    if (busy === 'slice') busy = sliceWant ? 'slice' : null;
    emit();
    return getState();
  }

  // One slice's bytes through the one binary path, then through the one decoder.
  async function fetchMask(url, checksum, kind) {
    const got = await runtime.content.bytes(url, { checksum, signal, kind });
    if (got.state !== STATE.SUCCESS) {
      return { failed: unavailable(got.reason || (got.error && got.error.code) || got.state, { view: got, retryable: canRetry(got) }) };
    }
    const [nx, ny] = shape;
    const png = decodeMaskPng(got.data.bytes, { width: nx, height: ny });
    return { png, verified: got.data.verified === true };
  }

  async function settleSlice(z, want, { prediction, mri, reviewed }) {
    // The MRI under the masks: optional, but its absence is said, not hidden.
    if (want.needsMri) {
      if (mri && mri.state === STATE.SUCCESS) {
        try {
          const img = await runtime.imageStore.load(mri.data.content_url, { checksum: mri.data.checksum });
          mriUris.set(z, Object.freeze({ uri: img.uri, reason: null }));
        } catch (err) {
          mriUris.set(z, Object.freeze({ uri: null, reason: (err && err.code) || 'MRI_UNAVAILABLE' }));
        }
      } else {
        mriUris.set(z, Object.freeze({ uri: null, reason: (mri && (mri.reason || mri.state)) || 'MRI_UNAVAILABLE' }));
      }
    }

    if (!prediction || prediction.state !== STATE.SUCCESS) {
      pixels.set(z, unavailable((prediction && (prediction.reason || prediction.state)) || 'NO_ANSWER',
        { view: prediction, retryable: canRetry(prediction) }));
      return;
    }
    const d = prediction.data;
    // `11` §6: the server says which variant it served; a substitution is drift.
    if (d.prediction_variant !== target.variant) {
      pixels.set(z, unavailable('VARIANT_MISMATCH'));
      return;
    }
    // The brush edits the pixels of THIS slice while Save names the run's artifact
    // as source_mask_id, so on a live backend the slice must be a slice of that
    // artifact. The real backend always answers it (E2E H8 asserts it); another id
    // would turn a correction of one mask into a "correction" of another. The
    // generated fixture's placeholder ids differ and it never reaches this code
    // (fixture mode has no slice reads), so the check is live-only (QA_PR99_D39 NB-3).
    if (!fixture && d.prediction_mask_id !== target.sourceMaskId) {
      pixels.set(z, unavailable('SOURCE_MASK_MISMATCH', {
        detail: `the server served a slice of mask ${d.prediction_mask_id}; this review's ${target.variant} source is ${target.sourceMaskId}`,
      }));
      return;
    }
    const src = await fetchMask(d.content_url, d.checksum, 'mask');
    if (src.failed) { pixels.set(z, src.failed); return; }

    let base = null;
    let baseChecksum = null;
    if (want.baseVersionId) {
      // Continuing a CORRECTED review (N-4): the latest version's slice is the
      // working base. Without it the slice is not editable - falling back to
      // the source pixels would drop the earlier correction from the next version.
      if (!reviewed || reviewed.state !== STATE.SUCCESS) {
        pixels.set(z, unavailable('BASE_UNAVAILABLE', { view: reviewed, retryable: canRetry(reviewed) }));
        return;
      }
      if (reviewed.data.reviewed_mask_id !== want.baseVersionId) {
        pixels.set(z, unavailable('BASE_MISMATCH', {
          detail: `the server answered version ${reviewed.data.reviewed_mask_id}, the review's latest is ${want.baseVersionId}`,
        }));
        return;
      }
      const got = await fetchMask(reviewed.data.content_url, reviewed.data.checksum, 'reviewed');
      if (got.failed) {
        pixels.set(z, unavailable('BASE_UNAVAILABLE', { view: got.failed.view, cause: got.failed.reason, retryable: got.failed.retryable }));
        return;
      }
      base = got.png.data;
      baseChecksum = reviewed.data.checksum;
    }
    session.loadSlice(z, src.png.data, base ? { base } : {});
    pixels.set(z, Object.freeze({
      kind: PIXELS.SERVED, checksum: d.checksum, verified: src.verified, servedMaskId: d.prediction_mask_id ?? null,
      baseChecksum,
    }));
  }

  function fitView() {
    if (!viewport || !shape) return;
    fit = fitTransform(viewport.width, viewport.height, shape[0], shape[1]);
    transform = fit;
  }

  function act(fn) {
    if (phase !== PHASE.READY) return getState();
    fn();
    emit();
    return getState();
  }

  async function setStatus(to, { confirmed = false } = {}) {
    if (phase !== PHASE.READY || busy === 'status' || busy === 'saving') return getState();
    busy = 'status';
    emit();
    const r = await review.patchStatus(to, { confirmed });
    busy = null;
    notice = r.rejection
      ? Object.freeze({ kind: 'refused', code: r.rejection.code, text: r.rejection.reason })
      : r.view.state === STATE.SUCCESS ? Object.freeze({ kind: 'status', text: `Review is now ${r.status}.` }) : null;
    emit();
    return getState();
  }

  async function save({ confirmed = false } = {}) {
    if (phase !== PHASE.READY || busy === 'saving' || busy === 'status') return getState();
    busy = 'saving';
    emit();
    const r = await review.saveCorrection(session, { confirmed });
    busy = null;
    if (r.rejection) {
      notice = Object.freeze({ kind: 'refused', code: r.rejection.code, text: r.rejection.reason });
    } else if (r.view.state === STATE.SUCCESS) {
      const c = r.lastCommit;
      notice = Object.freeze({
        kind: 'saved',
        // The new version, with the identity of what it corrects (PR-PROV-01).
        text: `Saved as a new version ${c.reviewed_mask_id} (revision ${c.revision}) of the ${target.variant} prediction `
          + `${c.source_mask_id} (${c.source_mask_kind}). Review is ${r.status}.`,
        reviewedMaskId: c.reviewed_mask_id, checksum: c.checksum, sourceMaskId: c.source_mask_id, sourceMaskKind: c.source_mask_kind,
      });
    } else {
      notice = null; // the review view itself carries the failure (STALE_MISMATCH -> Refresh)
    }
    emit();
    return getState();
  }

  const unsavedNow = () => Boolean(session && session.state().unsavedSlices.length > 0);

  // REFRESH after STALE_MISMATCH: reload the review; the user's edits stay in
  // the session, to be re-applied consciously by saving again. When the reload
  // shows another latest version than the one the session continues from, the
  // session is rebuilt over the new base - unless that would drop unsaved edits,
  // which are the user's to cancel first (N-4).
  async function refresh() {
    if (phase === PHASE.BLOCKED || !session) return variant ? open(variant) : start();
    busy = 'opening';
    emit();
    await review.refresh({ signal });
    busy = null;
    notice = null;
    const now = review.current;
    if (now.view.state === STATE.SUCCESS) {
      const wantBase = now.baseVersion ? now.baseVersion.reviewed_mask_id : null;
      if ((session.baseId ?? null) !== wantBase) {
        if (unsavedNow()) {
          notice = Object.freeze({
            kind: 'refused', code: 'BASE_VERSION_MISMATCH',
            text: `The review's latest version is ${wantBase ?? 'the original prediction'}; your edits continue from `
              + `${session.baseId ?? 'the original prediction'}. Cancel the edits, then Refresh again to continue from the latest version.`,
          });
        } else {
          rebuild();
        }
      }
    }
    emit();
    return getState();
  }

  // A new session over the reloaded review: every slice is read again.
  function rebuild() {
    session = newSession();
    pixels.clear();
    runsCache.clear();
    inflight.clear();
    sliceWant = null;
    const z = slice;
    slice = null;
    if (z !== null) setSlice(z);
  }

  // 1. the variant: from the route, or asked for.
  function open(chosen) {
    variant = chosen;
    phase = PHASE.LOADING;
    blockedView = loading();
    busy = 'opening';
    notice = null;
    sliceWant = null;
    runPending = true;
    runEpoch += 1;
    emit();
    return Promise.resolve(getState());
  }

  function start() {
    if (isVariant(params.variant)) return open(params.variant);
    phase = PHASE.CHOOSE_VARIANT;
    busy = null;
    emit();
    return Promise.resolve(getState());
  }

  function layersFor(z) {
    if (!session || !pixelsReady(z)) return null;
    const [nx, ny] = shape;
    if (!runsCache.has(z)) runsCache.set(z, maskRuns(session.sourceSlice(z), nx, ny));
    const saved = session.savedSlice(z);
    return Object.freeze({
      source: runsCache.get(z),
      // The saved correction relative to the source, then the unsaved edits
      // relative to what is saved - three layers a reader can tell apart.
      saved: saved ? diffRuns(saved, session.sourceSlice(z), nx, ny) : [],
      unsaved: diffRuns(session.workingSlice(z), saved ?? session.sourceSlice(z), nx, ny),
    });
  }

  function getState() {
    const brush = session ? session.state() : null;
    const ready = slice !== null && pixelsReady(slice);
    const mri = slice === null ? null : mriUris.get(slice) ?? null;
    return Object.freeze({
      version,
      phase,
      fixture,
      blockedView,
      target,
      review: review.current,
      brush,
      shape,
      // What the screen must fetch with useCall (DR-021 rule 2), and hand back.
      wants: Object.freeze({
        run: runPending ? Object.freeze({ runId: params.runId, epoch: runEpoch }) : null,
        slice: sliceWant,
      }),
      slice: slice === null ? null : Object.freeze({
        index: slice,
        total: shape ? shape[2] : null,
        pixels: pixels.get(slice) ?? null,
        maskState: ready ? session.maskState(slice) : null,
        mriUri: mri ? mri.uri : null,
        mriReason: mri ? mri.reason : null,
      }),
      layers: ready ? layersFor(slice) : null,
      transform,
      mode,
      busy,
      notice,
      lastStroke,
      canEdit: editable(),
      canSave: phase === PHASE.READY && review.current.canWrite && !busy && Boolean(brush)
        && brush.unsavedSlices.length > 0,
      // The navigator unmounts a covered screen, so leaving with unsaved
      // slices would drop them silently. The screen registers the shell's
      // leave guard while canLeave is false.
      canLeave: !(brush && brush.unsavedSlices.length > 0),
      leaveBlockedReason: brush && brush.unsavedSlices.length > 0
        ? `Slice ${brush.unsavedSlices.join(', ')} has unsaved edits; leaving this screen discards them.`
        : null,
    });
  }

  return Object.freeze({
    getState,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start,
    chooseVariant: (v) => (isVariant(v) && phase === PHASE.CHOOSE_VARIANT ? open(v) : Promise.resolve(getState())),
    provideRun,
    provideSlice,
    refresh,
    // Another try at a slice whose bytes could not be fetched (RETRY).
    retrySlice() {
      if (phase !== PHASE.READY || slice === null) return Promise.resolve(getState());
      const p = pixels.get(slice);
      if (!p || p.kind !== PIXELS.UNAVAILABLE) return Promise.resolve(getState());
      pixels.delete(slice);
      const z = slice;
      slice = null;
      return setSlice(z);
    },
    setSlice,
    nextSlice: () => setSlice(slice + 1),
    prevSlice: () => setSlice(slice - 1),
    setTool: (tool) => act(() => session.setTool(tool)),
    setRadius: (r) => act(() => session.setRadius(r)),
    setMode: (m) => act(() => { if (m === MODE.BRUSH || m === MODE.PAN) mode = m; }),
    undo: () => act(() => { session.undo(); }),
    redo: () => act(() => { session.redo(); }),
    reset: () => act(() => {
      session.reset();
      notice = Object.freeze({ kind: 'info', text: 'Back to the original prediction; history cleared.' });
    }),
    cancel: () => act(() => {
      session.cancel();
      notice = Object.freeze({ kind: 'info', text: 'Unsaved changes discarded.' });
    }),
    setStatus,
    save,
    setViewport(width, height) {
      if (!(width > 0 && height > 0)) return;
      if (viewport && viewport.width === width && viewport.height === height) return;
      viewport = { width, height };
      fitView();
      emit();
    },
    zoomBy(factor) {
      if (!transform || !viewport) return;
      transform = zoomAbout(transform, clampZoom(transform.zoom * factor, fit.zoom), viewport.width / 2, viewport.height / 2);
      emit();
    },
    fitView() { fitView(); emit(); },
    // Touches, already in canvas coordinates.
    touch: Object.freeze({
      grant(points) { if (editable() || mode === MODE.PAN) { gesture.grant(points); emit(); } },
      fingers(points) { gesture.fingers(points); emit(); },
      move(points) { gesture.move(points); emit(); },
      release() { gesture.release(); emit(); },
      terminate() { gesture.terminate(); emit(); },
    }),
  });
}
