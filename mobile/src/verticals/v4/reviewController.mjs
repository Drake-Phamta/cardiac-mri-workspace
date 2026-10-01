/*
 * SCR-06 Review / Correction — everything the screen does except drawing.
 * Pure (no React Native), so node --test drives it against the generated
 * fixture bundle; ReviewCorrectionScreen.js renders getState() and forwards
 * taps and touches here.
 *
 * Built on Day 22 under the recovery override for V4's owner Nguyễn Gia Đức
 * Trung, on the framework-neutral V4 models in app/verticals/v4_review_and_
 * findings/ (review state, brush session, mask payload).
 *
 * The flow, and the rule behind each step:
 *   1. variant   RAW or PROCESSED, from the route or chosen by the user - never
 *                defaulted (`11` §6). A review is scoped to it (DR-009).
 *   2. run       analysis_run_get: the run must have SUCCEEDED; it names the
 *                case and the source mask artifact of that variant.
 *   3. review    the V4 model: case geometry, review_create with the scope,
 *                reviewed-mask versions.
 *   4. pixels    LIVE: prediction_slice_get -> bytes at content_url, checked
 *                against the checksum, decoded by the app's one PNG adapter
 *                (injected; pending in this build). FIXTURE: a SYNTHETIC
 *                stand-in, labelled as such - the bundle has no pixels.
 *   5. brush     the V4 brush session at SOURCE resolution; touches arrive in
 *                canvas coordinates and reach it only through screenToSource.
 *   6. save      the model's saveCorrection: PUT + commit = a new immutable
 *                version, and the review is CORRECTED.
 */

import {
  STATE, RECOVERY, loading, emptyUnavailable, fatalInvalid, stateForError, fitTransform, clampZoom, zoomAbout,
} from '../../../../app/core/index.mjs';
import { createReviewCorrection, PREDICTION_VARIANT } from '../../../../app/verticals/v4_review_and_findings/index.mjs';
import { createBrushSession, diffRuns, SOURCE_KIND_FOR_VARIANT, TOOL, MASK_STATE } from '../../../../app/verticals/v4_review_and_findings/brush.mjs';
import { sha256Hex } from '../../../../app/verticals/v4_review_and_findings/sha256.mjs';
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

/*
 * runtime        the shell runtime: { mode, config, contract, client }
 * params         route params: runId (required by the navigator), and
 *                optionally caseId, variant, sliceIndex
 * decodeMaskPng  bytes -> { width, height, data: 0/1 }; the app's shared
 *                adapter. null = not in this build, and live pixels are then
 *                honestly unavailable.
 * fetchBytes     url -> Promise<Uint8Array>, for content_url (live only)
 */
export function createReviewScreen({ runtime, params = {}, decodeMaskPng = null, fetchBytes = null }) {
  const client = runtime.client;
  const fixture = runtime.mode === 'fixture';
  const review = createReviewCorrection(client);
  const listeners = new Set();

  let phase = PHASE.LOADING;
  let blockedView = loading();
  let target = null;          // { runId, caseId, variant, sourceMaskId }
  let session = null;
  let shape = null;           // [nx, ny, nz]
  let slice = null;
  const pixels = new Map();   // slice -> { kind, reason?, servedMaskId?, checksum? }
  const runsCache = new Map(); // slice -> source mask runs
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
    busy = null;
    emit();
    return getState();
  }

  // A throw anywhere in opening (a malformed shape, a refused source) becomes a
  // blocking state with its message, never an unhandled rejection.
  async function open(variant) {
    try {
      return await openScoped(variant);
    } catch (err) {
      return block(fatalInvalid({
        code: (err && err.code) || 'SCREEN_ERROR',
        safeMessage: 'SCR-06 could not open this review.',
        detail: { problems: [String(err && err.message)] },
      }));
    }
  }

  async function openScoped(variant) {
    phase = PHASE.LOADING;
    blockedView = loading();
    busy = 'opening';
    notice = null;
    emit();

    // 2. the run: SUCCEEDED, and the source artifact of this variant.
    const run = await client.call('analysis_run_get', { run_id: params.runId });
    if (run.state !== STATE.SUCCESS) return block(run);
    const status = run.data.status;
    if (status !== 'SUCCEEDED') {
      // QUEUED / RUNNING -> PROCESSING (stays interactive); FAILED -> unavailable.
      return block(stateForError(runtime.contract, 'RUN_NOT_SUCCEEDED', { runStatus: status }));
    }
    const sourceMaskId = variant === PREDICTION_VARIANT.RAW
      ? run.data.raw_prediction_artifact_id : run.data.processed_prediction_artifact_id;
    if (!sourceMaskId) return block(emptyUnavailable('ARTIFACT_NOT_FOUND', [RECOVERY.BACK]));
    target = Object.freeze({ runId: params.runId, caseId: params.caseId || run.data.case_id, variant, sourceMaskId });

    // 3. the review, scoped.
    const opened = await review.open({
      caseId: target.caseId, runId: target.runId, sourceMaskId, predictionVariant: variant,
    });
    if (opened.view.state !== STATE.SUCCESS) return block(opened.view);

    shape = opened.geometry.shape;
    session = createBrushSession({
      nx: shape[0], ny: shape[1],
      source: { maskId: sourceMaskId, kind: SOURCE_KIND_FOR_VARIANT[variant], variant, synthetic: fixture },
    });
    pixels.clear();
    runsCache.clear();
    phase = PHASE.READY;
    busy = null;
    if (viewport) fitView();
    const wanted = Number.isInteger(params.sliceIndex) ? params.sliceIndex : Math.floor(shape[2] / 2);
    return setSlice(wanted);
  }

  // 4. pixels for one slice.
  async function loadPixels(z) {
    const [nx, ny, nz] = shape;
    if (fixture) {
      session.loadSlice(z, syntheticSourceSlice(nx, ny, z, nz));
      pixels.set(z, Object.freeze({ kind: PIXELS.SYNTHETIC }));
      return;
    }
    if (!decodeMaskPng || !fetchBytes) {
      pixels.set(z, Object.freeze({ kind: PIXELS.UNAVAILABLE, reason: 'PNG_DECODER_PENDING' }));
      return;
    }
    const meta = await client.call('prediction_slice_get', { run_id: target.runId, slice_index: z, variant: target.variant });
    if (meta.state !== STATE.SUCCESS) {
      pixels.set(z, Object.freeze({ kind: PIXELS.UNAVAILABLE, reason: meta.reason || meta.state, view: meta }));
      return;
    }
    const d = meta.data;
    // `11` §6: the server says which variant it served; a substitution is drift.
    if (d.prediction_variant !== target.variant) {
      pixels.set(z, Object.freeze({ kind: PIXELS.UNAVAILABLE, reason: 'VARIANT_MISMATCH' }));
      return;
    }
    // Whether the slice's prediction_mask_id must equal the run's artifact id
    // is not stated by the contract (the fixture has them differ), so it is
    // shown beside the source identity rather than refused - see the README.
    let bytes;
    try {
      bytes = await fetchBytes(`${runtime.config.apiBaseUrl}${d.content_url}`);
    } catch (err) {
      pixels.set(z, Object.freeze({ kind: PIXELS.UNAVAILABLE, reason: 'TRANSPORT_UNREACHABLE' }));
      return;
    }
    // binary_delivery.content_url_rule: the bytes hash to the response checksum.
    if (`sha256:${sha256Hex(bytes)}` !== d.checksum) {
      pixels.set(z, Object.freeze({ kind: PIXELS.UNAVAILABLE, reason: 'CHECKSUM_MISMATCH' }));
      return;
    }
    try {
      const png = decodeMaskPng(bytes);
      if (png.width !== nx || png.height !== ny) throw new Error(`PNG is ${png.width}x${png.height}, the slice is ${nx}x${ny}`);
      session.loadSlice(z, png.data);
    } catch (err) {
      pixels.set(z, Object.freeze({ kind: PIXELS.UNAVAILABLE, reason: 'CONTRACT_DRIFT', detail: String(err && err.message) }));
      return;
    }
    pixels.set(z, Object.freeze({ kind: PIXELS.SERVED, checksum: d.checksum, servedMaskId: d.prediction_mask_id ?? null }));
  }

  async function setSlice(z) {
    if (phase !== PHASE.READY) return getState();
    const nz = shape[2];
    if (!(Number.isInteger(z) && z >= 0 && z < nz)) return getState();
    if (gesture.active) gesture.terminate();
    slice = z;
    if (!pixels.has(z)) {
      pixels.set(z, Object.freeze({ kind: PIXELS.LOADING }));
      busy = 'slice';
      emit();
      await loadPixels(z);
      busy = null;
    }
    emit();
    return getState();
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
    if (phase !== PHASE.READY || busy) return getState();
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
    if (phase !== PHASE.READY || busy) return getState();
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
        text: `Saved as a new version ${c.reviewed_mask_id} (revision ${c.revision}). Review is ${r.status}.`,
        reviewedMaskId: c.reviewed_mask_id, checksum: c.checksum,
      });
    } else {
      notice = null; // the review view itself carries the failure (STALE_MISMATCH -> Refresh)
    }
    emit();
    return getState();
  }

  // REFRESH after STALE_MISMATCH: reload the review; the user's edits stay in
  // the session, to be re-applied consciously by saving again.
  async function refresh() {
    if (phase === PHASE.BLOCKED || !session) return target ? open(target.variant) : start();
    busy = 'opening';
    emit();
    await review.refresh();
    busy = null;
    notice = null;
    emit();
    return getState();
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
    return Object.freeze({
      version,
      phase,
      fixture,
      blockedView,
      target,
      review: review.current,
      brush,
      shape,
      slice: slice === null ? null : Object.freeze({
        index: slice,
        total: shape ? shape[2] : null,
        pixels: pixels.get(slice) ?? null,
        maskState: ready ? session.maskState(slice) : null,
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
      // slices would drop them silently. Until the shell has a leave guard,
      // SCR-06 never navigates away by itself while any slice is UNSAVED.
      canLeave: !(brush && brush.unsavedSlices.length > 0),
      leaveBlockedReason: brush && brush.unsavedSlices.length > 0
        ? `Save or cancel the unsaved edits on slice ${brush.unsavedSlices.join(', ')} first - leaving would lose them.`
        : null,
    });
  }

  return Object.freeze({
    getState,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start,
    chooseVariant: (v) => (isVariant(v) ? open(v) : Promise.resolve(getState())),
    refresh,
    setSlice,
    nextSlice: () => setSlice(slice + 1),
    prevSlice: () => setSlice(slice - 1),
    setTool: (tool) => act(() => session.setTool(tool)),
    setRadius: (r) => act(() => session.setRadius(r)),
    setMode: (m) => act(() => { if (m === MODE.BRUSH || m === MODE.PAN) mode = m; }),
    undo: () => act(() => { session.undo(); }),
    redo: () => act(() => { session.redo(); }),
    reset: () => act(() => { session.reset(); notice = Object.freeze({ kind: 'info', text: 'Back to the source mask; history cleared.' }); }),
    cancel: () => act(() => { session.cancel(); notice = Object.freeze({ kind: 'info', text: 'Unsaved changes discarded.' }); }),
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
