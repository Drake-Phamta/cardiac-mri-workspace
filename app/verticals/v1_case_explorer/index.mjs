/*
 * V1 — SCR-03 Case Explorer / 2D MRI Inspector, as a state model.
 *
 * Framework-neutral on purpose: GATE-MOB-01 is open, TECH_STACK_ADR does not
 * exist, and nothing here may pre-empt it. A React Native screen, a WebView
 * or a browser can render the frozen snapshot this returns. It writes no URL
 * and interprets no error - app/core owns both.
 *
 * Follows the shape Nguyễn Gia Đức Trung established in
 * app/verticals/v4_review_and_findings/index.mjs: a factory over a core
 * client, every action returning the same frozen snapshot the getter returns,
 * and the snapshot WRAPPING a core screen state rather than replacing it.
 * Screen-specific derived flags sit next to `view`, never inside it.
 *
 * What `10` section 3 requires SCR-03 to display, and where each comes from:
 *   current slice image      mri_slice_get  (metadata + checksum only today -
 *                            see the header note on pixels)
 *   slice n / total          geometry_get / case_get -> shape[2]
 *   active run, precomputed  analysis_run_get
 *   active prediction        the caller's variant, NEVER defaulted
 *   overlay controls         the 5 layers of `10` section 4
 *   metrics when valid       analysis_slice_metrics
 *   entry to 3D / error      derived, and false when its data is unavailable
 *
 * NO PIXELS EXIST YET. mri_slice_get and prediction_slice_get are BINARY in
 * the contract, but the generated fixture bundle carries only metadata and a
 * checksum - there is no backend and nothing in app/core decodes an image. So
 * `slice.imageRef` is an identity (id + checksum + cache key) that a renderer
 * will later resolve, and this model says so rather than pretending.
 */

import {
  STATE, RECOVERY, loading, processing, success, stateForError,
  screenToSource, fitTransform, clampZoom, zoomAbout, panBy,
  sliceCacheKey,
} from '../../core/index.mjs';

// `10` section 4. MRI is always on; the rest are toggles.
export const LAYER = Object.freeze({
  PREDICTION: 'PREDICTION',
  GROUND_TRUTH: 'GROUND_TRUTH',
  ERROR: 'ERROR',
  REVIEWED_MASK: 'REVIEWED_MASK',
});

// `11` section 6 forbids a silent variant substitution, so these are the only
// accepted values and there is no default anywhere in this file.
export const VARIANT = Object.freeze({ RAW: 'RAW', PROCESSED: 'PROCESSED', REVIEWED: 'REVIEWED' });

const RUN_IN_FLIGHT = new Set(['QUEUED', 'RUNNING']);

function snapshot(view, f) {
  const shape = f.shape ?? null;
  return Object.freeze({
    view,
    caseId: f.caseId ?? null,
    runId: f.runId ?? null,
    // `n / total`. z is the slice axis under index_convention x=column,y=row,z=slice.
    sliceIndex: f.sliceIndex ?? null,
    sliceTotal: Array.isArray(shape) ? shape[2] : null,
    shape: shape ? Object.freeze([...shape]) : null,
    variant: f.variant ?? null,
    overlays: Object.freeze({ ...(f.overlays ?? {}) }),
    // Which overlays the user may even turn on. A layer whose data came back
    // unavailable is not offered, rather than offered and then empty.
    layersAvailable: Object.freeze({ ...(f.layersAvailable ?? {}) }),
    transform: f.transform ? Object.freeze({ ...f.transform }) : null,
    // `10` section 7: absent ground truth is an unavailable state, never an
    // empty chart and never a zero mask. Compared === true because the
    // generated fixture puts a placeholder STRING here, which is truthy.
    groundTruthAvailable: f.groundTruthAvailable === true,
    runStatus: f.runStatus ?? null,
    precomputed: f.precomputed ?? null,
    metrics: f.metrics ?? null,
    imageRef: f.imageRef ?? null,
    // The prediction overlay's identity, carrying the variant in its cache
    // key so RAW and PROCESSED can never share one.
    predictionRef: f.predictionRef ?? null,
    canEnter3D: f.canEnter3D === true,
    canEnterError: f.canEnterError === true,
  });
}

/*
 * `variant` is a CONSTRUCTOR argument with no default. Leaving it out is a
 * programming error, caught here rather than becoming a request that silently
 * shows the wrong mask.
 */
export function createCaseExplorer(client, { variant, viewport } = {}) {
  if (!variant || !VARIANT[variant]) {
    throw new Error(`createCaseExplorer needs an explicit variant, one of ${Object.keys(VARIANT).join('/')}`);
  }
  const view0 = viewport ?? { width: 1080, height: 1440 };

  let current = snapshot(loading(), {
    variant,
    overlays: { [LAYER.PREDICTION]: true, [LAYER.GROUND_TRUTH]: false, [LAYER.ERROR]: false, [LAYER.REVIEWED_MASK]: false },
  });

  const set = (v, patch = {}) => { current = snapshot(v, { ...current, ...patch }); return current; };

  function imageRefFor(data, { kind, caseId, runId, sliceIndex }) {
    return Object.freeze({
      kind,
      artifactId: data.source_volume_id ?? data.prediction_mask_id ?? data.reference_mask_id ?? null,
      checksum: data.checksum ?? null,
      // Built from the screen's own identity: cacheKeyFromResponse would throw
      // here, because prediction_slice_get's response has no run_id and
      // mri_slice_get's has no case_id.
      cacheKey: sliceCacheKey({
        kind, caseId, runId, sliceIndex,
        variant: kind === 'PREDICTION' ? current.variant : null,
        sourceVersion: data.source_version ?? null,
        checksum: data.checksum ?? null,
        geometryContractVersion: data.geometry_contract_version,
      }),
      note: 'metadata identity only - no pixels exist in the fixture bundle',
    });
  }

  /*
   * Scenarios are per ENDPOINT, not per screen. Each endpoint carries its own
   * set - `run_running` exists only on analysis_run_get, `ground_truth_
   * unavailable` only on two others - so one name applied to a whole screen
   * would ask three endpoints for a scenario they do not have and get
   * FIXTURE_SCENARIO_MISSING back. Callers pass a map; anything unnamed is
   * `default`.
   */
  const pick = (scenarios, endpointId) => (scenarios && scenarios[endpointId]) || 'default';

  /*
   * Open a case at a slice. Four calls, and the first failure wins: a screen
   * that renders partial truth is worse than one that says it cannot.
   */
  async function open({ caseId, runId, sliceIndex = 0, scenarios }) {
    set(loading(), { caseId, runId, sliceIndex });

    const kase = await client.call('case_get', { case_id: caseId },
      { scenario: pick(scenarios, 'case_get') });
    if (kase.state !== STATE.SUCCESS) return set(kase);

    const shape = kase.data.shape;
    const layersAvailable = {
      [LAYER.PREDICTION]: true,
      [LAYER.GROUND_TRUTH]: kase.data.ground_truth_available === true,
      [LAYER.ERROR]: kase.data.ground_truth_available === true,
      [LAYER.REVIEWED_MASK]: true,
    };
    set(kase, {
      shape,
      groundTruthAvailable: kase.data.ground_truth_available === true,
      layersAvailable,
      transform: fitTransform(view0.width, view0.height, shape[0], shape[1]),
    });

    const run = await client.call('analysis_run_get', { run_id: runId },
      { scenario: pick(scenarios, 'analysis_run_get') });
    if (run.state !== STATE.SUCCESS) return set(run);

    const runStatus = run.data.status;
    // `10` section 8: a run still in flight is PROCESSING and the screen stays
    // interactive. It is not an error and it is not empty.
    if (RUN_IN_FLIGHT.has(runStatus)) {
      return set(processing(null, []), { runStatus, precomputed: run.data.precomputed });
    }
    set(run, { runStatus, precomputed: run.data.precomputed });

    return loadSlice(sliceIndex, { scenarios });
  }

  /*
   * Fetch one slice. Refuses an out-of-range index BEFORE sending, because
   * this screen already knows `total` - and it reports it with the contract's
   * own SLICE_OUT_OF_RANGE so the UI has one code path whether the client or
   * the server noticed. core maps it to FATAL_INVALID with no RETRY.
   */
  async function loadSlice(sliceIndex, { scenarios } = {}) {
    const total = current.sliceTotal;
    if (total !== null && (!Number.isInteger(sliceIndex) || sliceIndex < 0 || sliceIndex >= total)) {
      return set(stateForError(client.contract, 'SLICE_OUT_OF_RANGE'), { sliceIndex });
    }

    const mri = await client.call('mri_slice_get',
      { case_id: current.caseId, slice_index: sliceIndex },
      { scenario: pick(scenarios, 'mri_slice_get') });
    if (mri.state !== STATE.SUCCESS) return set(mri, { sliceIndex });

    const imageRef = imageRefFor(mri.data, {
      kind: 'MRI', caseId: current.caseId, runId: current.runId, sliceIndex,
    });

    /*
     * The prediction overlay is the point of this screen, and it is the one
     * request that carries the variant. Fetched whenever that layer is on,
     * and its absence disables the layer rather than drawing nothing under a
     * switch that says "on" (`10` section 7).
     */
    let predictionRef = null;
    let predictionAvailable = false;
    if (current.overlays[LAYER.PREDICTION]) {
      const pred = await client.call('prediction_slice_get',
        { run_id: current.runId, slice_index: sliceIndex, variant: current.variant },
        { scenario: pick(scenarios, 'prediction_slice_get') });
      if (pred.state === STATE.SUCCESS) {
        predictionAvailable = true;
        predictionRef = imageRefFor(pred.data, {
          kind: 'PREDICTION', caseId: current.caseId, runId: current.runId, sliceIndex,
        });
        // `11` section 6: the server states which variant it served. If that
        // disagrees with what was asked for, something substituted silently
        // and the screen must not relabel it.
        if (pred.data.prediction_variant && pred.data.prediction_variant !== current.variant) {
          return set(stateForError(client.contract, 'VALIDATION_ERROR'), {
            sliceIndex,
            metrics: Object.freeze({
              state: 'UNAVAILABLE', value: null,
              reason: `asked for ${current.variant}, served ${pred.data.prediction_variant}`,
            }),
          });
        }
      }
    }

    const metrics = await client.call('analysis_slice_metrics',
      { run_id: current.runId, slice_index: sliceIndex, variant: current.variant },
      { scenario: pick(scenarios, 'analysis_slice_metrics'), context: { runStatus: current.runStatus } });

    // Metrics being unavailable does not break the viewer: the slice still
    // renders, the metrics panel says unavailable. `10` section 7.
    const metricsValue = metrics.state === STATE.SUCCESS
      ? Object.freeze({
        state: metrics.data.metric_state, value: metrics.data.metric_value,
        version: metrics.data.metric_version,
      })
      : Object.freeze({ state: 'UNAVAILABLE', value: null, reason: metrics.reason ?? null });

    return set(success({ slice: imageRef, prediction: predictionRef, metrics: metricsValue }), {
      sliceIndex, imageRef, predictionRef, metrics: metricsValue,
      layersAvailable: { ...current.layersAvailable, [LAYER.PREDICTION]: predictionAvailable },
      canEnter3D: true,
      canEnterError: current.groundTruthAvailable,
    });
  }

  return Object.freeze({
    get current() { return current; },
    open,
    goToSlice: (n, opts) => loadSlice(n, opts),
    refresh: (opts) => loadSlice(current.sliceIndex, opts),

    /* Switching variant re-fetches; it never relabels what is already drawn. */
    async setVariant(next, opts) {
      if (!VARIANT[next]) throw new Error(`unknown prediction variant ${next}`);
      set(current.view, { variant: next });
      return loadSlice(current.sliceIndex, opts);
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

    /* Touch -> source pixel, through the inverse display transform (`10` §5).
       null outside the image, and null must never paint. */
    pickPixel(u, v) {
      const t = current.transform;
      if (!t || !current.shape) return null;
      return screenToSource(u, v, t, current.shape[0], current.shape[1]);
    },
  });
}

export { STATE, RECOVERY };
