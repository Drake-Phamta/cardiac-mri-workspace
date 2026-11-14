// SCR-06 Review / Correction: everything the screen does except drawing, as plain JS that Node tests import.
// Steps: choose the variant, read the run, open the review, load slice pixels, brush, save. The screen
// fetches the reads this asks for (getState().wants) and hands them back; writes go through review.mjs.

import { maskRuns } from '../../lib/mask.mjs';
import { STATE, RECOVERY, loading, emptyUnavailable, fatalInvalid, stateForError } from '../../api/states.mjs';
import { fitTransform, clampZoom, zoomAbout, panBy } from '../../lib/viewMath.mjs';
import { createReviewCorrection, REVIEW_STATUS } from './review.mjs';
import { outlinePath } from './outline.mjs';
import { checkNote } from './notes.mjs';
import { timelineLines } from './history.mjs';
import { PREDICTION_VARIANT } from '../../lib/caseMode.mjs';
import {
  createBrushSession, diffRuns, brushRing, brushSizePx, SOURCE_KIND_FOR_VARIANT, TOOL, MASK_STATE, END_RELEASE,
  END_SECOND_FINGER, END_TERMINATED,
} from './brush.mjs';

export { TOOL, MASK_STATE };

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

const unavailable = (reason, extra = {}) => Object.freeze({ kind: PIXELS.UNAVAILABLE, reason, retryable: false, ...extra });
// A failed read can be tried again when its own state offers RETRY (a network failure, not a refusal).
const canRetry = (view) => Boolean(view && Array.isArray(view.actions) && view.actions.includes(RECOVERY.RETRY));

// runtime: { mode, config, contract, client, content, imageStore }. content.bytes() fetches bytes with a
//   timeout and a required checksum; imageStore.load() gives the MRI as a verified data URI (null in fixture mode).
// params: route params, runId and optionally caseId, variant, sliceIndex.
// decodeMaskPng: (bytes, { width, height }) -> 0/1 mask, throws CONTRACT_DRIFT on a bad PNG; null = no live pixels.
// signal: fires when the screen unmounts, so a stalled byte fetch is abandoned.
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
  const outlineCache = new Map(); // slice -> the source mask's edge as an SVG path
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
  let sourceOnly = false;     // while the Source button is held: the source prediction alone, no edits drawn
  let flagDraft = null;       // the flag reason being typed, or null when the reason box is closed
  let historyOpen = false;    // the timeline panel
  let history = null;         // { revision, view, lines }: the last history read, and the review revision it was for
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

  // Step 2: the run, as the screen fetched it.
  async function provideRun(runView) {
    if (!runPending) return getState();
    runPending = false;
    try {
      return await openScoped(runView);
    } catch (err) {
      // A throw while opening (a malformed shape, a refused source) becomes a blocking state,
      // never an unhandled rejection.
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
    // Live: the run that answered must be the one the route asked for.
    // (Fixture ids are placeholders, so fixture mode takes the run's own id.)
    if (!fixture && run.data.run_id !== params.runId) {
      return block(fatalInvalid({
        code: 'CONTRACT_DRIFT',
        safeMessage: 'The run that answered is not the run this screen was opened for.',
        detail: { endpointId: 'analysis_run_get', problems: [`run_id is ${run.data.run_id}, the route named ${params.runId}`] },
      }, [RECOVERY.BACK]));
    }
    // It must also belong to the route's case: geometry and MRI come from the case, the prediction
    // from the run, so a mismatch would draw one case's mask over another case's image.
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

    // Step 3: the review. review.open() does its own reads: the sequence ends in a POST and
    // each step needs the answer before it.
    const opened = await review.open({
      caseId: target.caseId, runId: fixture ? run.data.run_id : params.runId, sourceMaskId, predictionVariant: variant, signal,
    });
    if (opened.view.state !== STATE.SUCCESS) return block(opened.view);

    shape = opened.geometry.shape;
    session = newSession();
    pixels.clear();
    runsCache.clear();
    outlineCache.clear();
    mriUris.clear();
    inflight.clear();
    sliceWant = null;
    phase = PHASE.READY;
    busy = null;
    if (viewport) fitView();
    const wanted = Number.isInteger(params.sliceIndex) ? params.sliceIndex : Math.floor(shape[2] / 2);
    return setSlice(wanted);
  }

  // Fixture mode has no pixels behind any version, so the stand-in is also the base of a continued review.
  function loadFixtureSlice(z) {
    const [nx, ny, nz] = shape;
    const synthetic = syntheticSourceSlice(nx, ny, z, nz);
    session.loadSlice(z, synthetic, session.baseId ? { base: Uint8Array.from(synthetic) } : {});
    pixels.set(z, Object.freeze({ kind: PIXELS.SYNTHETIC }));
  }

  // Step 4: pixels for one slice. Ask the screen for the reads, or draw the stand-in.
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
        // Only a runtime built without a decoder or content gets here; say so rather than invent a mask.
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

  // The reads for slice z: prediction (required), mri (optional, the masks are drawn without it) and
  // reviewed, the base version's slice (required when continuing a CORRECTED review).
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

  // Fetch one slice's PNG bytes (checksum checked) and decode them.
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
    // The MRI under the masks is optional, but when it is missing the screen says why.
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
    // The server says which variant it served; a different one is never drawn.
    if (d.prediction_variant !== target.variant) {
      pixels.set(z, unavailable('VARIANT_MISMATCH'));
      return;
    }
    // Save names the run's artifact as source_mask_id, so the slice must come from that artifact;
    // otherwise a correction of one mask would be saved as a correction of another.
    // Fixture mode never reads slices and its ids are placeholders, so the check is live-only.
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
      // Continuing a CORRECTED review: the latest version's slice is the working base. Without it the
      // slice is not editable, because starting from the source would drop the earlier correction.
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

  async function setStatus(to, { confirmed = false, reason = null } = {}) {
    if (phase !== PHASE.READY || busy === 'status' || busy === 'saving') return getState();
    busy = 'status';
    emit();
    const r = await review.patchStatus(to, { confirmed, reason });
    busy = null;
    notice = r.rejection
      ? Object.freeze({ kind: 'refused', code: r.rejection.code, text: r.rejection.reason })
      : r.view.state === STATE.SUCCESS ? Object.freeze({ kind: 'status', text: `Review is now ${r.status}.` }) : null;
    // A flag that went through closes the reason box; a refused one keeps the text so nothing typed is lost.
    if (to === REVIEW_STATUS.FLAGGED && !r.rejection && r.view.state === STATE.SUCCESS) flagDraft = null;
    emit();
    return getState();
  }

  // Flag: the screen opens a reason box first (a flag must say why), then sends the reason with the change.
  function flagState() {
    if (flagDraft === null) return null;
    const check = checkNote(flagDraft);
    return Object.freeze({ text: flagDraft, check, canSubmit: !check.empty && check.ok && !busy });
  }

  // The timeline: while its panel is open the screen reads review_history_list, again after every write
  // (each write moves the review revision). Nothing is read while the panel is closed.
  function historyWant() {
    const r = review.current;
    if (!historyOpen || phase !== PHASE.READY || !r.reviewId) return null;
    if (history && history.revision === r.revision) return null;
    return Object.freeze({ reviewId: r.reviewId, revision: r.revision });
  }

  function provideHistory(revision, view) {
    const want = historyWant();
    if (!want || want.revision !== revision) return getState();
    let shown = view;
    // Live: the answer must be the review that was asked for (fixture ids are placeholders).
    if (view.state === STATE.SUCCESS && !fixture && view.data.review_id !== want.reviewId) {
      shown = fatalInvalid({
        code: 'CONTRACT_DRIFT',
        safeMessage: 'The history that answered is not this review\'s.',
        detail: { endpointId: 'review_history_list', problems: [`review_id is ${view.data.review_id}, asked ${want.reviewId}`] },
      });
    }
    history = Object.freeze({
      revision,
      view: shown,
      lines: shown.state === STATE.SUCCESS ? timelineLines(shown.data.items) : Object.freeze([]),
    });
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
        // Name the new version and the prediction it corrects.
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

  // Reload the review (e.g. after STALE_MISMATCH). Unsaved edits stay in the session, to be saved again.
  // If the latest version changed, the session is rebuilt over it, but never while it holds unsaved
  // edits: the user must cancel them first.
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
    outlineCache.clear();
    inflight.clear();
    sliceWant = null;
    const z = slice;
    slice = null;
    if (z !== null) setSlice(z);
  }

  // Step 1: the variant, from the route or chosen by the user; never defaulted.
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
    if (!runsCache.has(z)) runsCache.set(z, maskRuns({ width: nx, height: ny, data: session.sourceSlice(z) }));
    if (!outlineCache.has(z)) outlineCache.set(z, outlinePath(session.sourceSlice(z), nx, ny));
    const saved = session.savedSlice(z);
    return Object.freeze({
      source: runsCache.get(z),
      // The source's edge, drawn as a line under the see-through edits, so where the prediction was stays visible.
      sourceOutline: outlineCache.get(z),
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
      // What the screen must fetch with useCall and hand back (provideRun, provideSlice, provideHistory).
      wants: Object.freeze({
        run: runPending ? Object.freeze({ runId: params.runId, epoch: runEpoch }) : null,
        slice: sliceWant,
        history: historyWant(),
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
      sourceOnly,
      // While a finger paints: the ring around the pixels the next stamp covers, in source pixels.
      ring: brush && gesture.cursor ? brushRing(gesture.cursor, brush.radius) : null,
      brushPx: brush ? brushSizePx(brush.radius) : null,
      transform,
      mode,
      busy,
      notice,
      lastStroke,
      flag: flagState(),
      // The timeline panel: closed, loading (no answer yet for this revision), or the answer with its lines.
      history: Object.freeze({
        open: historyOpen,
        view: history ? history.view : null,
        lines: history ? history.lines : Object.freeze([]),
        current: Boolean(history && history.revision === review.current.revision),
      }),
      canEdit: editable(),
      canSave: phase === PHASE.READY && review.current.canWrite && !busy && Boolean(brush)
        && brush.unsavedSlices.length > 0,
      // The navigator unmounts a covered screen, so the screen sets a leave guard while this is false.
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
    // Press and hold Source: only the source prediction is drawn until the button is released. Nothing is
    // painted meanwhile, and a stroke in progress is rolled back, so comparing never edits.
    holdSource: (on) => act(() => {
      sourceOnly = Boolean(on);
      if (sourceOnly && gesture.active) gesture.terminate();
    }),
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
    // The flag reason box: open it, type, send (with the reason) or close it. Sending checks the reason first.
    startFlag: () => act(() => { if (flagDraft === null) flagDraft = ''; }),
    setFlagReason: (text) => act(() => { if (flagDraft !== null && typeof text === 'string') flagDraft = text; }),
    cancelFlag: () => act(() => { flagDraft = null; }),
    submitFlag({ confirmed = false } = {}) {
      const f = flagState();
      if (!f || !f.canSubmit) return Promise.resolve(getState());
      return setStatus(REVIEW_STATUS.FLAGGED, { confirmed, reason: f.text });
    },
    toggleHistory: () => act(() => { historyOpen = !historyOpen; }),
    provideHistory,
    // Read the history again (its Retry / Refresh).
    retryHistory: () => act(() => { history = null; }),
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
      grant(points) { if ((editable() && !sourceOnly) || mode === MODE.PAN) { gesture.grant(points); emit(); } },
      fingers(points) { gesture.fingers(points); emit(); },
      move(points) { gesture.move(points); emit(); },
      release() { gesture.release(); emit(); },
      terminate() { gesture.terminate(); emit(); },
    }),
  });
}

// Touch handling. In BRUSH mode one finger paints from the moment it lands. A second finger, or the
// system taking the gesture away, rolls the stroke back, so navigation never edits; only a clean lift
// commits. Two fingers pinch-zoom and pan. Points are canvas coordinates (page minus canvas origin).

export const MODE = Object.freeze({ BRUSH: 'brush', PAN: 'pan' });

export function createGestureController({
  getSession, getSlice, getTransform, setTransform, getFitZoom, getMode, onStrokeEnd = null,
}) {
  let gest = null; // { prev: points, stroke: boolean, at: the source pixel under the painting finger, or null }

  function endStroke(how) {
    gest.stroke = false;
    gest.at = null;
    const r = getSession().endStroke(how);
    if (r && onStrokeEnd) onStrokeEnd(r);
    return r;
  }

  function grant(points) {
    // Never inherit a stroke whose end was not delivered.
    if (gest && gest.stroke) endStroke(END_TERMINATED);
    gest = { prev: points, stroke: false, at: null };
    const session = getSession();
    const t = getTransform();
    if (getMode() === MODE.BRUSH && points.length === 1 && session && t) {
      session.beginStroke(getSlice());
      gest.stroke = true;
      gest.at = session.sample(points[0].x, points[0].y, t);
    }
  }

  // A finger landed while the gesture is live (the first one also arrives here).
  function fingers(points) {
    if (!gest) return;
    if (gest.stroke && points.length >= 2) endStroke(END_SECOND_FINGER);
    gest.prev = points;
  }

  function move(points) {
    if (!gest) return;
    const t = getTransform();
    if (!t) return;
    if (gest.stroke) {
      if (points.length === 1) {
        gest.at = getSession().sample(points[0].x, points[0].y, t);
        gest.prev = points;
        return;
      }
      endStroke(END_SECOND_FINGER); // the second finger showed up on a move first
    }
    if (points.length !== gest.prev.length) { gest.prev = points; return; } // a finger added or lifted
    if (points.length >= 2) {
      const dist = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const mid = (p) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const d0 = dist(gest.prev);
      const m0 = mid(gest.prev);
      const m1 = mid(points);
      let next = t;
      if (d0 > 0) next = zoomAbout(next, clampZoom(t.zoom * (dist(points) / d0), getFitZoom()), m0.x, m0.y);
      setTransform(panBy(next, m1.x - m0.x, m1.y - m0.y));
    } else {
      setTransform(panBy(t, points[0].x - gest.prev[0].x, points[0].y - gest.prev[0].y));
    }
    gest.prev = points;
  }

  function release() {
    if (gest && gest.stroke) endStroke(END_RELEASE);
    gest = null;
  }

  function terminate() {
    if (gest && gest.stroke) endStroke(END_TERMINATED);
    gest = null;
  }

  return Object.freeze({
    grant, fingers, move, release, terminate,
    get active() { return gest !== null; },
    get stroking() { return Boolean(gest && gest.stroke); },
    // The source pixel [x, y] under the painting finger, for the brush ring; null when not painting.
    get cursor() { return gest && gest.stroke ? gest.at : null; },
  });
}

// Fixture mode only: the fixture bundle has no pixels, but the brush needs something to edit. This is a
// lobed blob, largest on the middle slice and absent outside the middle third of the volume. It is
// labelled SYNTHETIC, never sent to a backend, and deterministic so the demo and tests see the same mask.

export function syntheticSourceSlice(nx, ny, z, nz) {
  const out = new Uint8Array(nx * ny);
  const centre = (nz - 1) / 2;
  const d = Math.abs(z - centre) / (nz / 3);
  if (!(d < 1)) return out;
  const scale = Math.sqrt(1 - d * d);
  const cx = nx * 0.52;
  const cy = ny * 0.48;
  const rx = nx * 0.11 * scale;
  const ry = ny * 0.085 * scale;
  const x0 = Math.max(0, Math.floor(cx - rx * 1.2));
  const x1 = Math.min(nx - 1, Math.ceil(cx + rx * 1.2));
  const y0 = Math.max(0, Math.floor(cy - ry * 1.2));
  const y1 = Math.min(ny - 1, Math.ceil(cy + ry * 1.2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      // An ellipse with three gentle lobes, so both add and erase have an
      // obvious edge to work on.
      if (dx * dx + dy * dy <= 1 + 0.12 * Math.cos(3 * Math.atan2(dy, dx))) out[y * nx + x] = 1;
    }
  }
  return out;
}
