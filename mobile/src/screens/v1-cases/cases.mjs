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
 *   active run, precomputed  analysis_run_get - or none: a case that lists no
 *                            run still opens, as MRI (+ ground truth), with
 *                            noRunReason NO_ANALYSIS_RUN (RUN_NOT_LISTED when
 *                            a run was asked for; requestedRunId keeps it)
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
 *
 * Three rules the QA pass of 2026-10-01 made explicit, and every path below
 * keeps:
 *   - only a SUCCESS snapshot carries a slice, prediction, ground-truth or
 *     metrics identity. Any other state - LOADING included - carries none, so
 *     nothing from an earlier slice or variant can sit under a new label;
 *   - a response that lands after a newer action started is dropped, whatever
 *     order the network returns them in;
 *   - a layer or an entry is offered only when its own data came back.
 */

import { PREDICTION_VARIANT, capabilityOf } from '../../lib/caseMode.mjs';
import { STATE, RECOVERY, loading, processing, success, fatalInvalid, stateForError } from '../../api/states.mjs';
import { screenToSource, fitTransform, clampZoom, zoomAbout, panBy } from '../../lib/viewMath.mjs';
import { CoreError } from '../../api/contract.mjs';

// `10` section 4. MRI is always on; the rest are toggles.
export const LAYER = Object.freeze({
  PREDICTION: 'PREDICTION',
  GROUND_TRUTH: 'GROUND_TRUTH',
  ERROR: 'ERROR',
  REVIEWED_MASK: 'REVIEWED_MASK',
});

// `11` section 6 freezes the run vocabulary. A status outside it is not a
// state this screen can render honestly, so it is drift, not a guess.
export const RUN_STATUS = Object.freeze({
  QUEUED: 'QUEUED', RUNNING: 'RUNNING', SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED',
});

const RUN_IN_FLIGHT = new Set([RUN_STATUS.QUEUED, RUN_STATUS.RUNNING]);

// Why a case opens with no run: none was asked for (a real case before any
// training lists none to ask for). The reason the screen shows for the
// missing run and for every layer that needs one.
export const NO_ANALYSIS_RUN = 'NO_ANALYSIS_RUN';
// A run WAS asked for, but the case lists none: still no run is requested,
// and the reason says so instead of dropping the request silently. The id
// asked for stays in the snapshot as requestedRunId (#80 QA N3).
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

/*
 * Inference-only is the contract's to define, not this screen's. A contract
 * that declares case_capability (v1.0) says which modes have no ground truth;
 * one that does not (DRAFT v0) says nothing, and nothing is filled in.
 */
function inferenceOnlyFor(contract, mode) {
  const modes = contract?.raw?.case_capability?.modes;
  if (!modes || typeof mode !== 'string' || !Object.prototype.hasOwnProperty.call(modes, mode)) return null;
  const declared = modes[mode]?.ground_truth_available;
  return typeof declared === 'boolean' ? !declared : null;
}

// A response this screen cannot render honestly. Same code the transport uses
// for a response that does not match the contract, so the UI has one path.
const drift = (safeMessage, detail) => fatalInvalid({ code: 'CONTRACT_DRIFT', safeMessage, detail });

/*
 * `11` section 6 and section 11 rule 6: the server states the variant it
 * served. A different one is not relabelled, and a missing one is not filled
 * in from what was asked for. Not VALIDATION_ERROR - prediction_slice_get
 * does not list it, and no server sent this; the client noticed. Exported so
 * SCR-04 gives a substituted analysis_run_metrics answer this same state.
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
    // The run the caller asked open() for, kept when it is not opened: with
    // RUN_NOT_LISTED, runId is null and this still names it.
    requestedRunId: f.requestedRunId ?? null,
    // The always-visible run / model / variant / mode line. Whatever the
    // server did not state stays null; nothing here is defaulted.
    caseMode: f.caseMode ?? null,
    inferenceOnly: f.inferenceOnly ?? null,
    availableRunIds: Object.freeze([...(f.availableRunIds ?? [])]),
    experimentId: f.experimentId ?? null,
    attemptNo: f.attemptNo ?? null,
    // NO_ANALYSIS_RUN when the case opened without a run, RUN_NOT_LISTED when
    // the run asked for is not one the case lists (runId is null either way);
    // null whenever a run was asked for and read.
    noRunReason: f.noRunReason ?? null,
    // `n / total`. z is the slice axis under index_convention x=column,y=row,z=slice.
    sliceIndex: f.sliceIndex ?? null,
    sliceTotal: Array.isArray(shape) ? shape[2] : null,
    shape: shape ? Object.freeze([...shape]) : null,
    variant: f.variant ?? null,
    overlays: Object.freeze({ ...(f.overlays ?? {}) }),
    // Which overlays the user may even turn on. A layer whose data came back
    // unavailable is not offered, rather than offered and then empty.
    layersAvailable: Object.freeze({ ...(f.layersAvailable ?? {}) }),
    // Why a layer is not offered, where the reason is known for the whole
    // case rather than per slice - today only the no-run reasons.
    layerReasons: Object.freeze({ ...(f.layerReasons ?? {}) }),
    transform: f.transform ? Object.freeze({ ...f.transform }) : null,
    // `10` section 7: absent ground truth is an unavailable state, never an
    // empty chart and never a zero mask. Compared === true because the
    // generated fixture puts a placeholder STRING here, which is truthy.
    groundTruthAvailable: f.groundTruthAvailable === true,
    runStatus: f.runStatus ?? null,
    precomputed: f.precomputed ?? null,
    // `11` section 6: "safe failure code/reason when failed". Set only for a
    // FAILED run, next to the ANALYSIS_FAILED view rather than inside it.
    runFailure: f.runFailure ?? null,
    reconstructionIds: Object.freeze([...reconstructionIds]),
    metrics: f.metrics ?? null,
    imageRef: f.imageRef ?? null,
    // The prediction overlay's identity, carrying the SERVED variant in its
    // cache key so RAW and PROCESSED can never share one.
    predictionRef: f.predictionRef ?? null,
    groundTruthRef: f.groundTruthRef ?? null,
    // Both entries are derived here, from the fields above, so neither can
    // outlive its data - and neither is offered from a snapshot that is not
    // SUCCESS. 3D needs a mesh, and only a run that SUCCEEDED and names its
    // reconstructions has one. SCR-04 compares a run's prediction with ground
    // truth (`10` section 3, "available only with ground truth"): it needs a
    // run, and THIS slice's ground truth back - not merely the case's
    // declaration of it.
    canEnter3D: view.state === STATE.SUCCESS
      && f.runStatus === RUN_STATUS.SUCCEEDED && reconstructionIds.length > 0,
    canEnterError: view.state === STATE.SUCCESS
      && (f.noRunReason ?? null) === null && (f.groundTruthRef ?? null) !== null,
    // An action the model declined without sending anything, e.g.
    // { action: 'setVariant', reason: NO_ANALYSIS_RUN }. Kept until the next
    // transition, so it describes the snapshot it arrived with.
    refused: f.refused ?? null,
  });
}

/*
 * `variant` has no default anywhere. It may be null at construction - a case
 * with no run needs none, and the model ignores it there - but opening a run
 * without one is a programming error, caught in open() before any request
 * rather than becoming one that silently shows the wrong mask. A variant that
 * IS given must be a real one.
 */
export function createCaseExplorer(client, { variant = null, viewport } = {}) {
  if (variant !== null) assertVariant(variant, 'createCaseExplorer');
  const view0 = viewport ?? { width: 1080, height: 1440 };

  let current = snapshot(loading(), {
    variant,
    overlays: { [LAYER.PREDICTION]: true, [LAYER.GROUND_TRUTH]: false, [LAYER.ERROR]: false, [LAYER.REVIEWED_MASK]: false },
  });

  // Bumped by every action that fetches. A response is applied only while its
  // action is still the latest one - slow slice 10 never lands on top of
  // fast slice 11.
  let seq = 0;

  /*
   * Every transition goes through here. Outside SUCCESS the per-slice
   * identities and the layers they enable are cleared: a FATAL_INVALID at
   * slice 45 must not carry slice 44's mask, and a LOADING for PROCESSED must
   * not carry the RAW one (`10` section 8, "block misleading visualization").
   */
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
      // Where the bytes are, when the contract has binary delivery fields
      // (content_url, media_type). DRAFT v0 has none, so these are null and a
      // renderer says "no pixels" rather than guessing a URL.
      contentUrl: data.content_url ?? null,
      mediaType: data.media_type ?? null,
      // Built from the screen's own identity: cacheKeyFromResponse would throw
      // here, because prediction_slice_get's response has no run_id and
      // mri_slice_get's has no case_id. The variant is the one the server
      // SERVED, never the one requested.
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
   * Open a case at a slice. Case, then run, then the slice, and the first
   * failure wins: a screen that renders partial truth is worse than one that
   * says it cannot. Nothing from a previous case survives into this one; only
   * the variant and the overlay switches - the user's choices - carry over.
   */
  async function open({ caseId, runId, sliceIndex = 0, scenarios }) {
    // A run's masks are shown in one explicit variant (`11` section 6): asked
    // for a run with none, refuse before anything is sent.
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
      // PREDICTION and GROUND_TRUTH turn on per slice, when their data comes
      // back. Nothing fetches error data or a reviewed mask yet, so those two
      // are not offered - a switch for a layer that cannot draw is a lie.
      layersAvailable: {
        [LAYER.PREDICTION]: false,
        [LAYER.GROUND_TRUTH]: false,
        [LAYER.ERROR]: false,
        [LAYER.REVIEWED_MASK]: false,
      },
      transform: fitTransform(view0.width, view0.height, shape[0], shape[1]),
    });

    /*
     * No run to show - the case lists none, or none was asked for. A real
     * case is served before any training (Day 22: 21 cases, no run), and its
     * MRI, with ground truth where the case declares it, is still worth
     * inspecting. So the slice view opens, and says plainly what it lacks:
     * prediction, metrics and error are unavailable for one reason, and no
     * run is ever requested - not analysis_run_get, not a prediction. A run
     * that was asked for is not dropped silently: the reason is RUN_NOT_LISTED
     * and requestedRunId still names it (#80 QA N3).
     */
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

    /*
     * The run must belong to the case on screen, or its masks are drawn over
     * another case's MRI. Compared with the case_id that case_get SERVED, not
     * the id requested: the generator fills every *_id from the field name
     * (CASE_ID_0043), not from the request (CASE_0043), so a request-side
     * check would block every generated scenario.
     */
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
    // `10` section 8: a run still in flight is PROCESSING and the screen stays
    // interactive. It is not an error and it is not empty. REFRESH re-reads
    // the run (see reload), it never fetches slices of an unfinished one.
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
   * Fetch one slice. Refuses an out-of-range index BEFORE sending, because
   * this screen already knows `total` - and it reports it with the contract's
   * own SLICE_OUT_OF_RANGE so the UI has one code path whether the client or
   * the server noticed. core maps it to FATAL_INVALID with no RETRY.
   *
   * The per-slice requests go out together; the supersede check runs once,
   * after all of them, so a stale answer is dropped whole and never mixed
   * with a fresh one.
   */
  async function loadSlice(sliceIndex, { scenarios } = {}) {
    const mine = ++seq;
    const { caseId, runId, groundTruthAvailable, noRunReason } = current;
    const hasRun = noRunReason === null;
    // Captured now: what this request is checked against cannot move if the
    // variant is switched while it is in flight.
    const requested = current.variant;

    const total = current.sliceTotal;
    if (total !== null && (!Number.isInteger(sliceIndex) || sliceIndex < 0 || sliceIndex >= total)) {
      return set(stateForError(client.contract, 'SLICE_OUT_OF_RANGE'), { sliceIndex });
    }
    set(loading(), { sliceIndex });

    /*
     * The prediction overlay is the point of this screen, and it is the one
     * request that carries the variant. Fetched whatever the switch says, so
     * that turning the overlay back on never needs a fetch (setOverlay is
     * display only) and the variant check always runs.
     *
     * Ground truth, and the metrics derived from it, are asked for only when
     * the case declares ground truth (`10` section 7). A case without it gets
     * neither request, and no NOT_APPLICABLE that would read as "measured,
     * and empty". With no run there is no prediction and no metric to ask
     * for: the MRI and the ground truth are the whole slice.
     */
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

    // A prediction that did not come back disables its layer rather than
    // drawing nothing under a switch that says "on" (`10` section 7).
    let predictionRef = null;
    if (pred && pred.state === STATE.SUCCESS) {
      const served = pred.data.prediction_variant ?? null;
      if (served !== requested) return set(variantMismatch(requested, served), { sliceIndex });
      predictionRef = refFor(pred.data, { kind: 'PREDICTION', caseId, runId, sliceIndex, variant: served });
    }

    const groundTruthRef = gt && gt.state === STATE.SUCCESS
      ? refFor(gt.data, { kind: 'GROUND_TRUTH', caseId, sliceIndex })
      : null;

    // Metrics being unavailable does not break the viewer: the slice still
    // renders, the metrics panel says unavailable and why. `10` section 7.
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

  /*
   * Every action after open() comes through here. A slice is fetched only for
   * a case that loaded and either a run that SUCCEEDED or no run at all.
   * Otherwise - PROCESSING, or a case or run that failed - the case and run
   * are read again, so REFRESH on a running analysis asks whether it finished
   * instead of drawing slices of a run that has not. With no run, navigation
   * asks for slice data only, so a per-slice cache answers every revisit.
   */
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
      // No run, no prediction to switch: a no-op the snapshot records, not a
      // throw, and nothing is sent.
      if (current.noRunReason !== null) {
        return set(current.view, { refused: Object.freeze({ action: 'setVariant', reason: current.noRunReason }) });
      }
      assertVariant(next, 'setVariant');
      // LOADING carries no refs (see set), so between the switch and the
      // answer nothing fetched under the old variant sits under the new one.
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

/*
 * SCR-03 helpers - everything the Case Explorer screen decides that is not
 * drawing. Pure, so `node --test` checks the same code Hermes runs.
 *
 * The state itself (case, run, slice, refs, overlays, metrics) lives in the
 * V1 model, app/verticals/v1_case_explorer/index.mjs. This file only turns
 * that state, the contract and the build config into labels, choices and
 * numbers the screen shows.
 */

/*
 * Which run the explorer opens. An explicit request wins and must be one the
 * case lists - also when the case lists none (#80 QA N3): a run that is not
 * listed is never reported as 'requested', so the screen opens no run for it
 * and says why instead of asking the server about it. A case with exactly one
 * run opens it (and the screen shows it); several runs mean the user chooses -
 * nothing is picked for them.
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

// `10` §3: slice `n / total`. 1-based for people, with the 0-based index the
// API and the evidence files use, so neither has to be converted in a head.
export function sliceLabel(sliceIndex, total) {
  if (!Number.isInteger(sliceIndex) || !Number.isInteger(total)) return 'slice - / -';
  return `slice ${sliceIndex + 1} / ${total}  (z = ${sliceIndex})`;
}

export function clampSlice(index, total) {
  if (!Number.isInteger(total) || total <= 0) return null;
  return Math.max(0, Math.min(total - 1, Math.round(index)));
}

/*
 * Slider position -> slice index, deterministically (TC-MRI-002): the track
 * is cut into `total` equal cells and x picks one. The same x always gives
 * the same slice; the ends are reachable; outside the track clamps.
 */
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

/*
 * The per-slice metric line. NOT_APPLICABLE is said in words and never as 0
 * or 1 (contract metric_rules.empty_slice_rule); unavailable says why. The
 * variant is part of the label because a Dice without its variant is a
 * number nobody can trace (DEMO_STANDARD D2).
 */
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

// The run line `10` §3 requires: run, experiment / model, precomputed or new.
// Until analysis_run_get has answered, or when it failed, nothing about the
// experiment or the precomputed flag is known - the line says that, with the
// reason, instead of "not stated" (#77 QA N-9).
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
 * The 30-step navigation sequence of TC-PERF-001 / NFR-PERF-001.
 *
 * PROVENANCE - a COPY, not an import (product code never imports spikes/**).
 *   source : spikes/spike_a_2d/app/App.js - NAV_SEQUENCE_16 and buildNavSequence
 *   commit : 0e3e54f "SPIKE_A S8: save/reload for A8, and the two scripts that conclude A10/A11"
 *   blob   : a8fb8a512c8a1ace2e3dbf487d11d1ee1218dc08
 *   copied : 2026-10-01, list and function unchanged except formatting.
 * Copied so the product's A9-style run is the SAME sequence Spike A measured
 * (A9 cached p95 65.31 ms at 576x576x88, release build), and the two numbers
 * stay comparable: moves of +/-1 stay +/-1 at any depth, jumps are scaled by
 * (Nz - 1) / 15.
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

/*
 * case_list `data` -> rows the screen can draw. Rows without a case_id are
 * listed separately as invalid: they cannot be opened, and inventing an id
 * would be a screen choosing its subject.
 */
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
      // Contract 1.1.0 names the row field `mode_capability` (the top-level
      // `mode` echoes the list filter); 1.0.0 called it `mode`. Read the
      // newer name first - neither is ever inferred from the other field.
      capability: capabilityOf(item.mode_capability ?? item.mode, item.ground_truth_available),
    }));
  });
  const counts = { total: rows.length, EVALUATION: 0, INFERENCE_REVIEW: 0, UNKNOWN: 0 };
  for (const r of rows) counts[r.capability.key] += 1;
  return Object.freeze({
    rows: Object.freeze(rows),
    invalid: Object.freeze(invalid),
    counts: Object.freeze(counts),
    // A next page exists on the server. The contract's case_list path has no
    // page parameter app/core can fill, so this build says so instead of
    // pretending the first page is the whole study.
    hasMore: data ? (data.next_page !== null && data.next_page !== undefined) : false,
  });
}

// Search by id substring and filter by mode. Server order is kept.
export function filterRows(rows, { query = '', mode = 'ALL' } = {}) {
  const q = String(query).trim().toLowerCase();
  return rows.filter((r) => (mode === 'ALL' || r.capability.key === mode)
    && (q === '' || r.caseId.toLowerCase().includes(q)));
}

/*
 * One model action at a time, newest slice wins.
 *
 * The V1 model is a single mutable snapshot. Two loads racing on it can end
 * with the OLDER answer written last - an older slice drawn over the one the
 * user asked for (TC-MRI-003's "cannot leave an overlay from the previous
 * case/run visible as current evidence", at slice granularity). The screen
 * therefore never runs two model actions at once:
 *
 *   - actions run strictly in order, each after the previous one settled;
 *   - a queued action with a coalesce key is REPLACED by a newer one with the
 *     same key: scrubbing across 40 slices costs the slice in flight plus the
 *     last one, never 40 loads;
 *   - an action without a key (a variant switch, a refresh) is never dropped,
 *     because the user asked for exactly it.
 *
 * Pure, and indifferent to what an action does; tested in node.
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
 * Cache keys for slice artifacts.
 *
 * DR-015 bound PERF-FIRSTLOAD-01 to the budget and made caching PER SLICE;
 * whole-volume caching is out, and s4 prefetch was rejected. PR-CACHE-01 stays
 * a SHOULD, so a vertical may cache nothing at all - but if it caches, it
 * keys here, because the ways a cache can lie are all naming mistakes:
 *
 *   - raw and processed predictions of the same slice are DIFFERENT images.
 *     Omit the variant and a processed mask is served for a raw request. `11`
 *     section 6 forbids a silent variant substitution, and a cache that does
 *     it is a silent substitution with a longer lifetime.
 *   - an artifact is immutable but its id is not unique across versions of the
 *     source, so source_version (or the checksum) belongs in the key.
 *   - a geometry contract bump invalidates every cached pixel, so the geometry
 *     version is in the key rather than in a migration nobody will write.
 *
 * Keys are opaque strings. Nothing parses them back; a parser would be a
 * second definition of the format.
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

  // One of the two must pin the bytes. Without either, two different images
  // can share a key, which is the only cache bug that shows a wrong mask.
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

/*
 * A key built from a response is the trustworthy one: the server states the
 * version, the checksum and the geometry it actually served, so the key
 * describes the bytes in hand rather than the bytes that were asked for.
 */
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
