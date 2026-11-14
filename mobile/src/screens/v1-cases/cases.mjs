/*
 * Logic for the case screens (SCR-02/03/04), plain JS that Node tests import: the case explorer state model, the
 * screen helpers (run choice, labels, slider math, case list rows and the worklist's Dice chips), the serial action
 * runner and slice cache keys.
 */

import { PREDICTION_VARIANT, capabilityOf } from '../../lib/caseMode.mjs';
import { STATE, RECOVERY, loading, processing, success, fatalInvalid, stateForError } from '../../api/states.mjs';
import { screenToSource, fitTransform, clampZoom, zoomAbout, panBy } from '../../lib/viewMath.mjs';
import { CoreError } from '../../api/contract.mjs';

// Overlay layers. The MRI itself is always drawn; these are toggles.
export const LAYER = Object.freeze({
  PREDICTION: 'PREDICTION',
  GROUND_TRUTH: 'GROUND_TRUTH',
  ERROR: 'ERROR',
  REVIEWED_MASK: 'REVIEWED_MASK',
});

// Run statuses defined by spec 11 §6. Any other status is treated as contract drift, not guessed.
export const RUN_STATUS = Object.freeze({
  QUEUED: 'QUEUED', RUNNING: 'RUNNING', SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED',
});

const RUN_IN_FLIGHT = new Set([RUN_STATUS.QUEUED, RUN_STATUS.RUNNING]);

// The case opened with no run because none was asked for (e.g. a case before any training).
export const NO_ANALYSIS_RUN = 'NO_ANALYSIS_RUN';
// A run was asked for but the case lists no runs: no run is requested, and requestedRunId keeps the id.
export const RUN_NOT_LISTED = 'RUN_NOT_LISTED';

const isVariant = (v) => Object.values(PREDICTION_VARIANT).includes(v);
const idsIn = (v) => (Array.isArray(v) ? v.filter((id) => typeof id === 'string' && id !== '') : []);

function assertVariant(variant, who) {
  if (isVariant(variant)) return;
  if (variant === 'REVIEWED') {
    throw new Error(`${who}: REVIEWED is not a prediction variant - a reviewed mask is the ${LAYER.REVIEWED_MASK} layer`);
  }
  throw new Error(`${who} needs an explicit prediction variant, one of ${Object.keys(PREDICTION_VARIANT).join('/')}`);
}

// Whether a mode has no ground truth, as the contract's case_capability declares it; null when it does not say.
function inferenceOnlyFor(contract, mode) {
  const modes = contract?.raw?.case_capability?.modes;
  if (!modes || typeof mode !== 'string' || !Object.prototype.hasOwnProperty.call(modes, mode)) return null;
  const declared = modes[mode]?.ground_truth_available;
  return typeof declared === 'boolean' ? !declared : null;
}

// A response the screen cannot show correctly. Same code the transport uses for a contract mismatch, so the UI
// has one path.
const drift = (safeMessage, detail) => fatalInvalid({ code: 'CONTRACT_DRIFT', safeMessage, detail });

/*
 * The server must state the variant it served (spec 11 §6). A different or missing one is never shown as the one
 * asked for. SCR-04 uses the same state for a substituted analysis_run_metrics answer.
 */
export function variantMismatch(requested, served) {
  return fatalInvalid({
    code: 'PREDICTION_VARIANT_MISMATCH',
    safeMessage: served === null
      ? `Asked for ${requested}; the server did not state which variant it served, so it is not shown.`
      : `Asked for ${requested}, served ${served}; a substituted variant is not shown.`,
    detail: { requested, served },
  });
}

function snapshot(view, f) {
  const shape = f.shape ?? null;
  const reconstructionIds = f.reconstructionIds ?? [];
  return Object.freeze({
    view,
    caseId: f.caseId ?? null,
    runId: f.runId ?? null,
    // The run asked for, kept even when it is not opened (RUN_NOT_LISTED).
    requestedRunId: f.requestedRunId ?? null,
    // Fields the server did not state stay null; nothing is defaulted.
    caseMode: f.caseMode ?? null,
    inferenceOnly: f.inferenceOnly ?? null,
    availableRunIds: Object.freeze([...(f.availableRunIds ?? [])]),
    experimentId: f.experimentId ?? null,
    attemptNo: f.attemptNo ?? null,
    // NO_ANALYSIS_RUN or RUN_NOT_LISTED when there is no run (runId is null); null when a run was read.
    noRunReason: f.noRunReason ?? null,
    // Index convention: x = column, y = row, z = slice.
    sliceIndex: f.sliceIndex ?? null,
    sliceTotal: Array.isArray(shape) ? shape[2] : null,
    shape: shape ? Object.freeze([...shape]) : null,
    variant: f.variant ?? null,
    overlays: Object.freeze({ ...(f.overlays ?? {}) }),
    // A layer whose data came back unavailable is not offered at all.
    layersAvailable: Object.freeze({ ...(f.layersAvailable ?? {}) }),
    // Why a layer is off for the whole case, not per slice (the no-run reasons).
    layerReasons: Object.freeze({ ...(f.layerReasons ?? {}) }),
    transform: f.transform ? Object.freeze({ ...f.transform }) : null,
    // Compared with === true: the generated fixture puts a placeholder string here, which is truthy.
    groundTruthAvailable: f.groundTruthAvailable === true,
    runStatus: f.runStatus ?? null,
    precomputed: f.precomputed ?? null,
    // Safe failure code and reason, set only for a FAILED run.
    runFailure: f.runFailure ?? null,
    reconstructionIds: Object.freeze([...reconstructionIds]),
    metrics: f.metrics ?? null,
    imageRef: f.imageRef ?? null,
    // Its cache key holds the variant the server served, so RAW and PROCESSED never share one.
    predictionRef: f.predictionRef ?? null,
    groundTruthRef: f.groundTruthRef ?? null,
    // Derived here so neither entry outlives its data. 3D needs a SUCCEEDED run with reconstructions; SCR-04
    // needs a run and this slice's ground truth, not just the case's claim that it has some.
    canEnter3D: view.state === STATE.SUCCESS
      && f.runStatus === RUN_STATUS.SUCCEEDED && reconstructionIds.length > 0,
    canEnterError: view.state === STATE.SUCCESS
      && (f.noRunReason ?? null) === null && (f.groundTruthRef ?? null) !== null,
    // An action the model declined without sending anything, e.g. { action: 'setVariant', reason }. Cleared by
    // the next transition.
    refused: f.refused ?? null,
  });
}

/*
 * The case explorer model. Every action returns the frozen snapshot that `current` also returns; it wraps a screen
 * state (`view`) and keeps the screen's own fields next to it. Rules every path keeps:
 *   - only a SUCCESS snapshot carries slice, prediction, ground-truth or metric refs;
 *   - a response that lands after a newer action started is dropped;
 *   - a layer or entry is offered only when its own data came back.
 * `variant` has no default. It may be null for a case with no run, but open() with a run and no variant throws
 * before any request, instead of showing the wrong mask.
 */
export function createCaseExplorer(client, { variant = null, viewport } = {}) {
  if (variant !== null) assertVariant(variant, 'createCaseExplorer');
  const view0 = viewport ?? { width: 1080, height: 1440 };

  let current = snapshot(loading(), {
    variant,
    overlays: { [LAYER.PREDICTION]: true, [LAYER.GROUND_TRUTH]: false, [LAYER.ERROR]: false, [LAYER.REVIEWED_MASK]: false },
  });

  // Bumped by every action that fetches. A response is applied only while its action is still the latest, so a
  // slow slice 10 never lands on top of slice 11.
  let seq = 0;

  // Every transition goes through here. Outside SUCCESS the per-slice refs and their layers are cleared, so an
  // error on slice 45 never carries slice 44's mask.
  const set = (v, patch = {}) => {
    const next = { ...current, refused: null, ...patch };
    if (v.state !== STATE.SUCCESS) {
      Object.assign(next, {
        imageRef: null, predictionRef: null, groundTruthRef: null, metrics: null,
        layersAvailable: { ...next.layersAvailable, [LAYER.PREDICTION]: false, [LAYER.GROUND_TRUTH]: false },
      });
    }
    current = snapshot(v, next);
    return current;
  };

  function refFor(data, { kind, caseId, runId = null, sliceIndex, variant: served = null }) {
    return Object.freeze({
      kind,
      artifactId: data.source_volume_id ?? data.prediction_mask_id ?? data.reference_mask_id ?? null,
      checksum: data.checksum ?? null,
      // Null when the response has no content_url; the screen then says "no pixels" instead of guessing a URL.
      contentUrl: data.content_url ?? null,
      mediaType: data.media_type ?? null,
      // Built from the screen's own ids: cacheKeyFromResponse would throw, because these responses lack run_id or
      // case_id. The variant is the one the server served.
      cacheKey: sliceCacheKey({
        kind, caseId, runId, sliceIndex,
        variant: served,
        sourceVersion: data.source_version ?? null,
        checksum: data.checksum ?? null,
        geometryContractVersion: data.geometry_contract_version,
      }),
      note: data.content_url ? null : 'metadata identity only - no pixels exist in the fixture bundle',
    });
  }

  // Fixture scenarios are per endpoint, not per screen: one name for the whole screen would ask endpoints for
  // scenarios they do not have. Callers pass a map; anything unnamed is `default`.
  const pick = (scenarios, endpointId) => (scenarios && scenarios[endpointId]) || 'default';

  // Open a case at a slice: case, then run, then slice, and the first failure wins. Only the user's choices
  // (variant and overlay switches) carry over from a previous case.
  async function open({ caseId, runId, sliceIndex = 0, scenarios }) {
    if (runId) assertVariant(current.variant, 'open() with a run');
    const mine = ++seq;
    current = snapshot(loading(), {
      caseId, runId, requestedRunId: runId || null, sliceIndex, variant: current.variant, overlays: current.overlays,
    });

    const kase = await client.call('case_get', { case_id: caseId },
      { scenario: pick(scenarios, 'case_get') });
    if (mine !== seq) return current;
    if (kase.state !== STATE.SUCCESS) return set(kase);

    const shape = kase.data.shape;
    const groundTruthAvailable = kase.data.ground_truth_available === true;
    set(loading(), {
      shape,
      groundTruthAvailable,
      caseMode: kase.data.mode ?? null,
      inferenceOnly: inferenceOnlyFor(client.contract, kase.data.mode),
      availableRunIds: idsIn(kase.data.available_run_ids),
      // PREDICTION and GROUND_TRUTH turn on per slice when their data arrives. Nothing here fetches ERROR or
      // REVIEWED_MASK data, so those are never offered.
      layersAvailable: {
        [LAYER.PREDICTION]: false,
        [LAYER.GROUND_TRUTH]: false,
        [LAYER.ERROR]: false,
        [LAYER.REVIEWED_MASK]: false,
      },
      transform: fitTransform(view0.width, view0.height, shape[0], shape[1]),
    });

    // No run to show: none was asked for, or the case lists none. The MRI (and ground truth, if declared) is still
    // worth inspecting, so the slice view opens with one reason for the missing layers, and no run data is requested.
    if (!runId || idsIn(kase.data.available_run_ids).length === 0) {
      const reason = runId ? RUN_NOT_LISTED : NO_ANALYSIS_RUN;
      set(loading(), {
        runId: null,
        noRunReason: reason,
        layerReasons: { [LAYER.PREDICTION]: reason, [LAYER.ERROR]: reason },
      });
      return loadSlice(sliceIndex, { scenarios });
    }

    const run = await client.call('analysis_run_get', { run_id: runId },
      { scenario: pick(scenarios, 'analysis_run_get') });
    if (mine !== seq) return current;
    if (run.state !== STATE.SUCCESS) return set(run);
    const r = run.data;

    // The run must belong to the open case, or its masks are drawn over another case's MRI. Compared with the
    // case_id that case_get served, not the requested one: the fixture generator fills ids from the field name.
    const servedCase = kase.data.case_id;
    if (typeof r.case_id !== 'string' || r.case_id === '' || r.case_id !== servedCase) {
      return set(drift(`Run ${runId} belongs to case ${r.case_id}, not to the open case ${servedCase}.`,
        { runCaseId: r.case_id ?? null, caseId: servedCase ?? null }));
    }

    const runFields = {
      experimentId: r.experiment_id ?? null,
      attemptNo: Number.isInteger(r.attempt_no) ? r.attempt_no : null,
      precomputed: r.precomputed,
    };
    // A run still in flight is PROCESSING, not an error. REFRESH re-reads the run (see reload), never its slices.
    if (RUN_IN_FLIGHT.has(r.status)) {
      return set(processing(null, [RECOVERY.REFRESH]), { ...runFields, runStatus: r.status });
    }
    if (r.status === RUN_STATUS.FAILED) {
      return set(stateForError(client.contract, 'ANALYSIS_FAILED'), {
        ...runFields,
        runStatus: r.status,
        runFailure: Object.freeze({ code: r.failure_code ?? null, reason: r.failure_reason ?? null }),
      });
    }
    if (r.status !== RUN_STATUS.SUCCEEDED) {
      return set(drift(`Run ${runId} has status ${r.status}, which is not one of `
        + `${Object.values(RUN_STATUS).join('|')}.`, { status: r.status ?? null }));
    }
    set(loading(), {
      ...runFields, runStatus: r.status, reconstructionIds: idsIn(r.reconstruction_ids),
    });

    return loadSlice(sliceIndex, { scenarios });
  }

  /*
   * Fetch one slice. An out-of-range index is refused before sending, with the contract's own SLICE_OUT_OF_RANGE,
   * so the UI has one path whether the client or the server noticed. The requests go out together and the
   * "still latest?" check runs once after all of them, so a stale answer is dropped whole.
   */
  async function loadSlice(sliceIndex, { scenarios } = {}) {
    const mine = ++seq;
    const { caseId, runId, groundTruthAvailable, noRunReason } = current;
    const hasRun = noRunReason === null;
    // Read now, so a variant switch during the request cannot change what the answer is checked against.
    const requested = current.variant;

    const total = current.sliceTotal;
    if (total !== null && (!Number.isInteger(sliceIndex) || sliceIndex < 0 || sliceIndex >= total)) {
      return set(stateForError(client.contract, 'SLICE_OUT_OF_RANGE'), { sliceIndex });
    }
    set(loading(), { sliceIndex });

    // The prediction is fetched even when its overlay is off, so turning it on needs no fetch and the variant check
    // always runs. Ground truth and metrics are asked for only when the case declares ground truth; with no run
    // there is no prediction or metric to ask for.
    const [mri, pred, gt, metrics] = await Promise.all([
      client.call('mri_slice_get', { case_id: caseId, slice_index: sliceIndex },
        { scenario: pick(scenarios, 'mri_slice_get') }),
      hasRun
        ? client.call('prediction_slice_get', { run_id: runId, slice_index: sliceIndex, variant: requested },
          { scenario: pick(scenarios, 'prediction_slice_get') })
        : null,
      groundTruthAvailable
        ? client.call('ground_truth_slice_get', { case_id: caseId, slice_index: sliceIndex },
          { scenario: pick(scenarios, 'ground_truth_slice_get') })
        : null,
      hasRun && groundTruthAvailable
        ? client.call('analysis_slice_metrics', { run_id: runId, slice_index: sliceIndex, variant: requested },
          { scenario: pick(scenarios, 'analysis_slice_metrics'), context: { runStatus: current.runStatus } })
        : null,
    ]);
    if (mine !== seq) return current;

    // No MRI, no screen.
    if (mri.state !== STATE.SUCCESS) return set(mri, { sliceIndex });
    const imageRef = refFor(mri.data, { kind: 'MRI', caseId, runId, sliceIndex });

    // A missing prediction disables its layer instead of drawing nothing under a switch that says "on".
    let predictionRef = null;
    if (pred && pred.state === STATE.SUCCESS) {
      const served = pred.data.prediction_variant ?? null;
      if (served !== requested) return set(variantMismatch(requested, served), { sliceIndex });
      predictionRef = refFor(pred.data, { kind: 'PREDICTION', caseId, runId, sliceIndex, variant: served });
    }

    const groundTruthRef = gt && gt.state === STATE.SUCCESS
      ? refFor(gt.data, { kind: 'GROUND_TRUTH', caseId, sliceIndex })
      : null;

    // Missing metrics do not block the slice; the metric line says unavailable and why.
    let metricsValue;
    if (!hasRun) {
      metricsValue = Object.freeze({ state: 'UNAVAILABLE', value: null, reason: noRunReason });
    } else if (!groundTruthAvailable) {
      metricsValue = Object.freeze({ state: 'UNAVAILABLE', value: null, reason: 'GROUND_TRUTH_UNAVAILABLE' });
    } else if (metrics.state === STATE.SUCCESS) {
      metricsValue = Object.freeze({
        state: metrics.data.metric_state, value: metrics.data.metric_value,
        version: metrics.data.metric_version,
      });
    } else {
      metricsValue = Object.freeze({ state: 'UNAVAILABLE', value: null, reason: metrics.reason ?? null });
    }

    return set(success({
      slice: imageRef, prediction: predictionRef, groundTruth: groundTruthRef, metrics: metricsValue,
    }), {
      sliceIndex, imageRef, predictionRef, groundTruthRef, metrics: metricsValue,
      layersAvailable: {
        ...current.layersAvailable,
        [LAYER.PREDICTION]: predictionRef !== null,
        [LAYER.GROUND_TRUTH]: groundTruthRef !== null,
      },
    });
  }

  // Every action after open() comes through here. A slice is fetched only when the case loaded and the run
  // SUCCEEDED or there is no run. Otherwise the case and run are read again, so REFRESH on a running analysis
  // checks whether it finished.
  async function reload(sliceIndex, opts = {}) {
    if (current.caseId === null) return current;
    const ready = current.runStatus === RUN_STATUS.SUCCEEDED || current.noRunReason !== null;
    if (ready && current.shape) return loadSlice(sliceIndex, opts);
    return open({ caseId: current.caseId, runId: current.runId, sliceIndex, scenarios: opts.scenarios });
  }

  return Object.freeze({
    get current() { return current; },
    open,
    goToSlice: (n, opts) => reload(n, opts),
    refresh: (opts) => reload(current.sliceIndex, opts),

    /* Switching variant re-fetches; it never relabels what is already drawn. */
    async setVariant(next, opts) {
      // No run, nothing to switch: record the refusal in the snapshot and send nothing.
      if (current.noRunReason !== null) {
        return set(current.view, { refused: Object.freeze({ action: 'setVariant', reason: current.noRunReason }) });
      }
      assertVariant(next, 'setVariant');
      // LOADING carries no refs (see set), so nothing from the old variant is shown under the new one.
      set(loading(), { variant: next });
      return reload(current.sliceIndex, opts);
    },

    /* Pure display state. Never re-fetches, never touches mask data. */
    setOverlay(layer, on) {
      if (!LAYER[layer]) throw new Error(`unknown overlay layer ${layer}`);
      if (on && current.layersAvailable[layer] !== true) return current;
      return set(current.view, { overlays: { ...current.overlays, [layer]: on === true } });
    },

    zoom(factor, fx, fy) {
      const t = current.transform;
      if (!t) return current;
      const fit = fitTransform(view0.width, view0.height, current.shape[0], current.shape[1]);
      return set(current.view, { transform: zoomAbout(t, clampZoom(t.zoom * factor, fit.zoom), fx, fy) });
    },

    pan(dx, dy) {
      const t = current.transform;
      return t ? set(current.view, { transform: panBy(t, dx, dy) }) : current;
    },

    fit() {
      if (!current.shape) return current;
      return set(current.view, {
        transform: fitTransform(view0.width, view0.height, current.shape[0], current.shape[1]),
      });
    },

    /* Touch -> source pixel, through the inverse display transform.
       null outside the image, and null must never paint. */
    pickPixel(u, v) {
      const t = current.transform;
      if (!t || !current.shape) return null;
      return screenToSource(u, v, t, current.shape[0], current.shape[1]);
    },
  });
}

export { STATE, RECOVERY };

// ----- Screen helpers: pure functions that turn state into the labels, choices and numbers the screens show -----

/*
 * Which run the explorer opens. A requested run must be one the case lists; otherwise no run is opened and the
 * screen says why. A case with exactly one run opens it; with several, the user chooses.
 */
export function chooseRun(availableRunIds, requested = null) {
  const ids = Array.isArray(availableRunIds) ? availableRunIds.filter((x) => typeof x === 'string' && x) : [];
  if (requested) {
    return ids.includes(requested)
      ? Object.freeze({ runId: requested, reason: 'requested', choices: Object.freeze(ids) })
      : Object.freeze({ runId: null, reason: 'requested-run-not-listed', choices: Object.freeze(ids) });
  }
  if (ids.length === 1) return Object.freeze({ runId: ids[0], reason: 'only-run', choices: Object.freeze(ids) });
  if (ids.length === 0) return Object.freeze({ runId: null, reason: 'no-runs', choices: Object.freeze(ids) });
  return Object.freeze({ runId: null, reason: 'choose', choices: Object.freeze(ids) });
}

// 1-based "n / total" for people, plus the 0-based z the API uses.
export function sliceLabel(sliceIndex, total) {
  if (!Number.isInteger(sliceIndex) || !Number.isInteger(total)) return 'slice - / -';
  return `slice ${sliceIndex + 1} / ${total}  (z = ${sliceIndex})`;
}

export function clampSlice(index, total) {
  if (!Number.isInteger(total) || total <= 0) return null;
  return Math.max(0, Math.min(total - 1, Math.round(index)));
}

// Slider x -> slice index: the track is cut into `total` equal cells. The same x always gives the same slice,
// both ends are reachable, and x outside the track clamps.
export function scrubIndex(x, width, total) {
  if (!(width > 0) || !Number.isInteger(total) || total <= 0) return null;
  const cell = Math.floor((x / width) * total);
  return Math.max(0, Math.min(total - 1, cell));
}

// Centre of a slice's cell on the track, for drawing the thumb.
export function scrubPosition(index, width, total) {
  if (!(width > 0) || !Number.isInteger(total) || total <= 0 || !Number.isInteger(index)) return 0;
  return ((index + 0.5) / total) * width;
}

// The per-slice metric line. NOT_APPLICABLE is said in words, never as 0 or 1 (the contract's empty_slice_rule).
// The variant is in the label so every Dice can be traced to its prediction.
export function metricsText(metrics, variant) {
  if (!metrics) return { text: 'Slice Dice: loading…', tone: 'neutral' };
  if (metrics.state === 'COMPUTED' && typeof metrics.value === 'number' && Number.isFinite(metrics.value)) {
    return {
      text: `Slice Dice (${variant}): ${metrics.value.toFixed(3)}${metrics.version ? ` · metric ${metrics.version}` : ''}`,
      tone: 'ok',
    };
  }
  if (metrics.state === 'NOT_APPLICABLE') {
    return { text: `Slice Dice (${variant}): not applicable - ground truth and prediction are both empty here`, tone: 'neutral' };
  }
  if (metrics.state === 'UNAVAILABLE') {
    return { text: `Slice Dice: unavailable${metrics.reason ? ` (${metrics.reason})` : ''}`, tone: 'neutral' };
  }
  return { text: `Slice Dice: state ${metrics.state} is not one this build knows - not shown`, tone: 'warn' };
}

// The run line: run, model / experiment, precomputed or new. While analysis_run_get is loading or after it failed,
// the line says so instead of "not stated".
export function runText(run, modelFamily = null, { loading = false, error = null } = {}) {
  if (!run) return 'Run: -';
  if (loading) return `Run ${run.runId} · loading run details…`;
  if (error) return `Run ${run.runId} · run details unavailable (${error})`;
  const model = modelFamily ? `${modelFamily} · ` : '';
  const pre = run.precomputed === true ? 'precomputed' : run.precomputed === false ? 'newly executed' : 'precomputed: not stated';
  const status = run.status && run.status !== 'SUCCEEDED' ? ` · ${run.status}` : '';
  return `Run ${run.runId} · ${model}${run.experimentId || 'experiment not stated'} · ${pre}${status}`;
}

export const OPACITY_STEPS = Object.freeze([0.25, 0.5, 0.75, 1]);

/*
 * The 30-step A9 navigation sequence, copied unchanged from the 2D viewer prototype so the timings stay comparable.
 * Written for 16 slices: steps of +/-1 stay +/-1 at any depth, and jumps are scaled by (nz - 1) / 15.
 */
const NAV_SEQUENCE_16 = [
  1, 2, 3, 4, 5, 6, 7, 8,           // forward run
  7, 6, 5, 4, 3, 2, 1, 0,           // backward run
  8, 0, 15, 4, 11, 2, 13, 6,        // jumps
  7, 8, 9, 10, 11, 12,              // forward again
];

export function buildNavSequence(nz) {
  const scale = (nz - 1) / 15;
  const out = [];
  let prev16 = 0;
  let pos = 0;
  for (const target16 of NAV_SEQUENCE_16) {
    const delta16 = target16 - prev16;
    const delta = Math.abs(delta16) === 1 ? delta16 : Math.round(delta16 * scale);
    pos = Math.max(0, Math.min(nz - 1, pos + delta));
    out.push(pos);
    prev16 = target16;
  }
  return out;
}

// case_list `data` -> rows the screen can draw. Rows without a case_id are listed apart as invalid: they cannot
// be opened, and the screen never invents an id.
export function readCaseRows(data) {
  const items = data && Array.isArray(data.items) ? data.items : [];
  const rows = [];
  const invalid = [];
  items.forEach((item, i) => {
    const caseId = item && typeof item.case_id === 'string' && item.case_id.trim() !== '' ? item.case_id : null;
    if (!caseId) {
      invalid.push(Object.freeze({ position: i + 1, reason: 'row has no case_id' }));
      return;
    }
    rows.push(Object.freeze({
      caseId,
      // Contract 1.1.0 calls the row field mode_capability; 1.0.0 called it mode. Read the newer name first.
      capability: capabilityOf(item.mode_capability ?? item.mode, item.ground_truth_available),
    }));
  });
  const counts = { total: rows.length, EVALUATION: 0, INFERENCE_REVIEW: 0, UNKNOWN: 0 };
  for (const r of rows) counts[r.capability.key] += 1;
  return Object.freeze({
    rows: Object.freeze(rows),
    invalid: Object.freeze(invalid),
    counts: Object.freeze(counts),
    // The server has another page. case_list has no page parameter the client can fill, so the screen says so.
    hasMore: data ? (data.next_page !== null && data.next_page !== undefined) : false,
  });
}

// Search by id substring and filter by mode. The order it is given is kept.
export function filterRows(rows, { query = '', mode = 'ALL' } = {}) {
  const q = String(query).trim().toLowerCase();
  return rows.filter((r) => (mode === 'ALL' || r.capability.key === mode)
    && (q === '' || r.caseId.toLowerCase().includes(q)));
}

/*
 * SCR-02 as a worklist: each case's Dice for one experiment the user picks (experiment_cases), a "worst first"
 * order, and a "no GT" chip for a case without ground truth. A missing value is a word on the chip, never 0.
 */

export const WORKLIST_SORT = Object.freeze({ SERVER: 'SERVER', WORST_FIRST: 'WORST_FIRST' });

const numberOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// experiment_list data -> the experiments to pick from, each with the variant it states.
export function readExperimentChoices(data) {
  const items = data && Array.isArray(data.items) ? data.items : [];
  return Object.freeze(items
    .filter((it) => it && typeof it.experiment_id === 'string' && it.experiment_id !== '')
    .map((it) => Object.freeze({
      experimentId: it.experiment_id,
      variant: typeof it.prediction_variant === 'string' ? it.prediction_variant : null,
    })));
}

// The rule and version of the server's outlier pick that this build shows (contract selection_rules).
export function pinnedOutlierSelection(contract) {
  const pin = contract && contract.raw && contract.raw.selection_rules ? contract.raw.selection_rules.outlier_selection : null;
  const text = (v) => (typeof v === 'string' && v !== '' ? v : null);
  return Object.freeze({ ruleId: text(pin && pin.rule_id), selectionVersion: text(pin && pin.selection_version) });
}

/*
 * experiment_cases data -> one entry per case. Values served for another variant than the experiment states are
 * not shown at all. The server's outlier pick is marked only under the pinned rule and version, for this
 * experiment and variant; it is the server's ranking and is never recomputed here.
 */
export function readExperimentCases(data, { experimentId, variant = null, pinned = pinnedOutlierSelection(null) } = {}) {
  const none = (problem) => Object.freeze({
    ok: false, problem, variant: null, metricVersion: null, byCase: new Map(), outliers: new Map(), outlierNote: null,
  });
  if (!data || typeof data !== 'object') return none('The server returned no per-case results.');
  const served = typeof data.prediction_variant === 'string' ? data.prediction_variant : null;
  if (variant !== null && served !== variant) {
    return none(`Asked for ${experimentId} (${variant}); the server answered with ${served === null ? 'no stated variant' : `${served} values`}, so no Dice is shown.`);
  }
  const byCase = new Map();
  for (const row of Array.isArray(data.items) ? data.items : []) {
    const caseId = row && typeof row.case_id === 'string' && row.case_id !== '' ? row.case_id : null;
    if (!caseId || byCase.has(caseId)) continue;
    const v = row.metric_values && typeof row.metric_values === 'object' ? row.metric_values : {};
    byCase.set(caseId, Object.freeze({
      caseId,
      status: typeof row.status === 'string' ? row.status : null,
      reason: typeof row.reason === 'string' ? row.reason : null,
      runId: typeof row.analysis_run_id === 'string' && row.analysis_run_id !== '' ? row.analysis_run_id : null,
      dice: numberOrNull(v.dice),
      falsePositives: numberOrNull(v.false_positives),
      falseNegatives: numberOrNull(v.false_negatives),
    }));
  }
  const outliers = new Map();
  let outlierNote = null;
  const block = data.outlier_selection;
  if (block && typeof block === 'object') {
    const matches = pinned.ruleId !== null && block.rule_id === pinned.ruleId
      && pinned.selectionVersion !== null && block.selection_version === pinned.selectionVersion
      && block.experiment_id === experimentId && block.prediction_variant === served && Array.isArray(block.cases);
    if (matches) {
      block.cases.forEach((c, i) => { if (c && typeof c.case_id === 'string' && !outliers.has(c.case_id)) outliers.set(c.case_id, i + 1); });
    } else {
      outlierNote = 'The server\'s outlier pick is for another rule, version, experiment or variant, so it is not marked.';
    }
  }
  return Object.freeze({
    ok: true, problem: null, variant: served, metricVersion: data.metric_version ?? null, byCase, outliers, outlierNote,
  });
}

// The chip of one case row. A case without usable ground truth says "no GT" whatever the row holds.
export function worklistChip(row, entry, experimentId) {
  if (!row.capability.groundTruthUsable) return Object.freeze({ kind: 'NO_GT', text: 'no GT', value: null });
  if (!entry) return Object.freeze({ kind: 'NOT_IN_EXPERIMENT', text: `not in ${experimentId}`, value: null });
  switch (entry.status) {
    case 'SUCCEEDED':
      return entry.dice !== null
        ? Object.freeze({ kind: 'DICE', text: `Dice ${entry.dice.toFixed(3)}`, value: entry.dice })
        : Object.freeze({ kind: 'NOT_STATED', text: 'Dice not stated', value: null });
    case 'WITHHELD': return Object.freeze({ kind: 'NO_GT', text: 'no GT', value: null });
    case 'FAILED': return Object.freeze({ kind: 'FAILED', text: 'run failed', value: null });
    case 'EXCLUDED': return Object.freeze({ kind: 'EXCLUDED', text: 'excluded', value: null });
    default: return Object.freeze({ kind: 'UNKNOWN', text: `status ${entry.status || 'not stated'}`, value: null });
  }
}

/*
 * The list rows: each case with its chip, the experiment's run to open, and the server's outlier rank (1-3).
 * WORST_FIRST puts the cases with a Dice lowest first, ties by FP + FN (more first) and then case id: the order the
 * server uses for its outlier pick, so the top three agree with it. Cases without a Dice follow, in the order the
 * server listed them. Without per-case results the server order is kept.
 */
export function worklistRows(rows, cases, { experimentId = null, sort = WORKLIST_SORT.SERVER } = {}) {
  const usable = Boolean(cases && cases.ok);
  const out = rows.map((row) => {
    const entry = usable ? (cases.byCase.get(row.caseId) || null) : null;
    const errors = entry && entry.falsePositives !== null && entry.falseNegatives !== null
      ? entry.falsePositives + entry.falseNegatives : null;
    return Object.freeze({
      ...row,
      chip: usable ? worklistChip(row, entry, experimentId) : null,
      runId: entry ? entry.runId : null,
      outlierRank: usable ? (cases.outliers.get(row.caseId) ?? null) : null,
      errorPixels: errors,
    });
  });
  if (!usable || sort !== WORKLIST_SORT.WORST_FIRST) return Object.freeze(out);
  const withDice = out.filter((r) => r.chip.kind === 'DICE');
  const without = out.filter((r) => r.chip.kind !== 'DICE');
  const byCaseId = (a, b) => (a.caseId < b.caseId ? -1 : (a.caseId > b.caseId ? 1 : 0));
  withDice.sort((a, b) => (a.chip.value - b.chip.value)
    || ((b.errorPixels ?? -1) - (a.errorPixels ?? -1))
    || byCaseId(a, b));
  return Object.freeze([...withDice, ...without]);
}

// The experiment and order chosen on SCR-02, kept for the session: the list unmounts under SCR-03.
let worklistChoice = Object.freeze({ experimentId: null, sort: WORKLIST_SORT.SERVER });
export const rememberedWorklist = () => worklistChoice;
export function rememberWorklist(choice) { worklistChoice = Object.freeze({ ...worklistChoice, ...choice }); }
export function forgetWorklist() { worklistChoice = Object.freeze({ experimentId: null, sort: WORKLIST_SORT.SERVER }); }

/*
 * Runs one model action at a time, so two loads never race and an older slice is never drawn over a newer one.
 * Actions run in order. A queued action with a key is replaced by a newer one with the same key (scrubbing over 40
 * slices costs the slice in flight plus the last one); an action without a key, such as a refresh, is never dropped.
 */

export function createSerialRunner({ onSettled = () => {}, onError = () => {} } = {}) {
  const queue = [];
  let running = false;
  let disposed = false;

  async function pump() {
    if (running || disposed) return;
    const job = queue.shift();
    if (!job) return;
    running = true;
    try {
      await job.fn();
    } catch (err) {
      onError(err, job);
    } finally {
      running = false;
    }
    if (disposed) return;
    onSettled({ key: job.key, idle: queue.length === 0 });
    pump();
  }

  return Object.freeze({
    run(fn, { key = null } = {}) {
      if (disposed) return;
      if (key !== null) {
        const i = queue.findIndex((j) => j.key === key);
        if (i !== -1) { queue[i] = { fn, key }; return; }
      }
      queue.push({ fn, key });
      pump();
    },
    get busy() { return running || queue.length > 0; },
    get queued() { return queue.length; },
    dispose() { disposed = true; queue.length = 0; },
  });
}

/*
 * Cache keys for per-slice artifacts. A cache shows a wrong image only through a naming mistake, so the key holds
 * the variant (raw and processed masks of one slice differ), source_version or checksum (ids repeat across source
 * versions) and the geometry contract version (a bump invalidates every pixel). Keys are opaque; nothing parses them.
 */

const SEP = '|';

function required(value, field) {
  if (value === undefined || value === null || value === '') {
    throw new CoreError('CACHE_KEY_INCOMPLETE', { field });
  }
  return String(value);
}

export function sliceCacheKey({
  kind, caseId, sliceIndex, variant = null, sourceVersion = null,
  checksum = null, geometryContractVersion, runId = null, reviewedMaskId = null,
}) {
  required(kind, 'kind');
  required(geometryContractVersion, 'geometryContractVersion');
  required(sliceIndex, 'sliceIndex');

  // One of the two must pin the bytes; without either, two different images could share a key.
  if (!sourceVersion && !checksum) {
    throw new CoreError('CACHE_KEY_INCOMPLETE', { field: 'sourceVersion|checksum' });
  }

  switch (kind) {
    case 'MRI':
    case 'GROUND_TRUTH':
      required(caseId, 'caseId');
      break;
    case 'PREDICTION':
      required(runId, 'runId');
      required(variant, 'variant'); // never defaulted - see the header
      break;
    case 'REVIEWED_MASK':
      required(reviewedMaskId, 'reviewedMaskId');
      break;
    default:
      throw new CoreError('CACHE_KEY_UNKNOWN_KIND', { kind });
  }

  return [
    'v1', kind, caseId ?? '-', runId ?? '-', reviewedMaskId ?? '-',
    String(sliceIndex), variant ?? '-', sourceVersion ?? '-', checksum ?? '-',
    geometryContractVersion,
  ].join(SEP);
}

// A key built from a response describes the bytes in hand: the server states the version, checksum and geometry
// it actually served.
export function cacheKeyFromResponse(kind, data, { caseId = null, sliceIndex = null } = {}) {
  return sliceCacheKey({
    kind,
    caseId: caseId ?? data.case_id ?? null,
    runId: data.run_id ?? null,
    reviewedMaskId: data.reviewed_mask_id ?? null,
    sliceIndex: sliceIndex ?? data.slice_index,
    variant: data.prediction_variant ?? null,
    sourceVersion: data.source_version ?? null,
    checksum: data.checksum ?? null,
    geometryContractVersion: data.geometry_contract_version,
  });
}
