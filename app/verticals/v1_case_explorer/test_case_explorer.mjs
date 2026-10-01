// node app/verticals/v1_case_explorer/test_case_explorer.mjs
//
// Runs against the GENERATED fixture bundle, so it exercises the same
// handshake every other vertical does. Generate it first:
//
//   python contracts/api/generate_fixture.py --contract contracts/api/contract.json \
//          --output app/core/fixtures/.generated/api_bundle.json
//
// Same harness shape as V4's test: a local check(), ids V1-n, exit 1 on any
// failure, no dependency to install. What the generator cannot produce - a
// foreign run, a null variant, a slow slice - comes from small inline stubs
// that edit ONE field of a generated response, never a handwritten one.

import { readFileSync } from 'node:fs';
import {
  createContract, createBundle, createClient, createFixtureTransport, getScenario,
  STATE, RECOVERY, screenToSource, sliceCacheKey,
} from '../../core/index.mjs';
import { createCaseExplorer, LAYER } from './index.mjs';

const ROOT = new URL('../../../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));

const contractJson = readJson('contracts/api/contract.json');
const contract = createContract(contractJson);
const bundle = createBundle(contract, readJson('app/core/fixtures/.generated/api_bundle.json'));
const newClient = () => createClient(contract, createFixtureTransport(bundle));

/*
 * The generated bundle, with some responses edited, delayed or counted.
 * `edits[endpointId](response, resolved)` receives the generated response for
 * the scenario asked for and returns the one to serve, or a promise of it.
 * Every request's endpoint id is appended to `log`.
 */
function stubbedClient(edits = {}, { log = [], c = contract } = {}) {
  return createClient(c, {
    kind: 'test',
    async send(resolved, options) {
      log.push(resolved.endpointId);
      const scenario = getScenario(bundle, resolved.endpointId, options.scenario || 'default');
      if (!scenario) return { status: 0, missingScenario: true };
      const edit = edits[resolved.endpointId];
      return edit ? edit(scenario.response, resolved) : scenario.response;
    },
  });
}
const withData = (patch) => (r) => ({ ...r, data: { ...r.data, ...patch } });
const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

// The generator's own parameter values, so the test drives real scenarios.
const CASE = 'CASE_0043';
const RUN = 'RUN_0043';

let failures = 0;
let checks = 0;
const check = (id, ok, detail) => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(5)} ${detail}`);
};

// V1-1 — open reaches SUCCESS and carries `n / total`, the one thing `10` §3
// names first for this screen.
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  const s = await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  check('V1-1', s.view.state === STATE.SUCCESS, `open -> ${s.view.state}`);
  check('V1-1', s.sliceIndex === 44 && s.sliceTotal === 88,
    `slice ${s.sliceIndex} / ${s.sliceTotal} (z of shape ${JSON.stringify(s.shape)})`);
  check('V1-1', s.imageRef?.cacheKey?.includes('MRI'), `image identity keyed: ${s.imageRef?.checksum}`);
}

// V1-2 — the prediction variant is never defaulted. `11` §6 forbids a silent
// substitution, so an omitted variant is a constructor error, not a guess.
// REVIEWED is not a prediction variant at all: a reviewed mask is its own
// layer, and prediction_slice_get?variant=REVIEWED asks for nothing real.
{
  let threw = false;
  try { createCaseExplorer(newClient(), {}); } catch { threw = true; }
  check('V1-2', threw, 'a missing variant is refused at construction');
  let threw2 = false;
  try { createCaseExplorer(newClient(), { variant: 'BEST' }); } catch { threw2 = true; }
  check('V1-2', threw2, 'an unknown variant is refused');
  let threw3 = false;
  try { createCaseExplorer(newClient(), { variant: 'REVIEWED' }); } catch { threw3 = true; }
  check('V1-2', threw3, 'REVIEWED is refused at construction');

  const log = [];
  const m = createCaseExplorer(stubbedClient({}, { log }), { variant: 'RAW' });
  await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  const sent = log.length;
  const refused = await m.setVariant('REVIEWED').then(() => false, () => true);
  check('V1-2', refused && m.current.variant === 'RAW' && log.length === sent,
    'setVariant(REVIEWED) is refused, sends nothing and leaves the variant alone');
}

// V1-3 — absent ground truth is an unavailable state with no RETRY, never an
// empty chart and never a zero mask (`10` §7).
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44, scenarios: { case_get: 'inference_review' } });
  const gt = await newClient().call('ground_truth_slice_get',
    { case_id: CASE, slice_index: 44 }, { scenario: 'ground_truth_unavailable' });
  check('V1-3', gt.state === STATE.EMPTY_UNAVAILABLE, `GT unavailable -> ${gt.state}`);
  check('V1-3', !gt.actions.includes(RECOVERY.RETRY), `offers ${gt.actions.join('/') || 'nothing'}, not RETRY`);

  // And the screen does not offer a layer whose data is not there: contract
  // v1.0's inference_review case declares ground_truth_available false.
  const s = m.current;
  check('V1-3', s.groundTruthAvailable === false && s.layersAvailable[LAYER.GROUND_TRUTH] === false,
    'an INFERENCE_REVIEW case does not enable the ground-truth layer');
  const after = m.setOverlay(LAYER.GROUND_TRUTH, true);
  check('V1-3', after.overlays[LAYER.GROUND_TRUTH] === false, 'and the layer cannot be switched on');
}

// V1-4 — an out-of-range slice blocks the view and offers no RETRY. The model
// refuses before sending, because it already knows `total`.
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  const s = await m.goToSlice(88);
  check('V1-4', s.view.state === STATE.FATAL_INVALID, `slice 88 of 88 -> ${s.view.state}`);
  check('V1-4', !s.view.actions.includes(RECOVERY.RETRY),
    `offers ${s.view.actions.join('/') || 'nothing'}, not RETRY`);
  const neg = await m.goToSlice(-1);
  check('V1-4', neg.view.state === STATE.FATAL_INVALID, 'a negative index is refused too');
  const ok = await m.goToSlice(0);
  check('V1-4', ok.view.state === STATE.SUCCESS && ok.sliceIndex === 0,
    'slice 0 is a real slice and still loads');
}

// V1-5 — a run still in flight is PROCESSING: `10` §8 requires the screen to
// stay interactive, not to show an error and not to show empty.
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  // Scenarios are per endpoint: `run_running` exists only on analysis_run_get.
  const s = await m.open({
    caseId: CASE, runId: RUN, scenarios: { analysis_run_get: 'run_running' },
  });
  check('V1-5', s.view.state === STATE.PROCESSING, `run RUNNING -> ${s.view.state}`);
  check('V1-5', s.runStatus === 'RUNNING' && s.view.data === null,
    `runStatus ${s.runStatus}, and PROCESSING carries no data`);
  check('V1-5', s.view.actions.includes(RECOVERY.REFRESH) && s.imageRef === null && s.canEnter3D === false,
    `offers ${s.view.actions.join('/')}, draws nothing, offers no 3D`);
}

// V1-6 — zoom and pan change ONLY the display transform, and a touch outside
// the image maps to null. Invariant 2 of `07` §8, and `10` §5.
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  await m.open({ caseId: CASE, runId: RUN, sliceIndex: 10 });
  const before = m.current;
  const t0 = before.transform;

  const zoomed = m.zoom(2, 540, 720);
  const src0 = screenToSource(540, 720, t0, before.shape[0], before.shape[1]);
  const src1 = screenToSource(540, 720, zoomed.transform, before.shape[0], before.shape[1]);
  const held = (src0 === null && src1 === null)
    || (src0 && src1 && Math.abs(src0[0] - src1[0]) <= 1 && Math.abs(src0[1] - src1[1]) <= 1);
  check('V1-6', held, `focal pixel stays put: ${JSON.stringify(src0)} -> ${JSON.stringify(src1)}`);

  const panned = m.pan(-40, 25);
  check('V1-6', panned.transform.zoom === zoomed.transform.zoom
    && panned.transform.panX === zoomed.transform.panX - 40,
    'pan translates and leaves zoom alone');
  check('V1-6', panned.imageRef === before.imageRef && panned.sliceIndex === before.sliceIndex,
    'no transform touched the slice identity or the mask');
  // "Outside the image" is a property of the CURRENT transform, not of a
  // screen coordinate. After a 2x zoom and a pan, screen (-5,-5) maps to a
  // real source pixel - the first version of this check asserted otherwise
  // and was simply wrong. Reset to fit, then probe the four edges.
  const fitted = m.fit();
  const t = fitted.transform;
  const [nx, ny] = fitted.shape;
  const at = (x, y) => [t.panX + x * t.zoom, t.panY + y * t.zoom];
  const outside = [at(-0.01, 0.5), at(0.5, -0.01), at(nx, 0.5), at(0.5, ny)];
  check('V1-6', outside.every(([u, v]) => m.pickPixel(u, v) === null),
    `${outside.length} touches past the edge map to null, and null must never paint`);
  check('V1-6', m.pickPixel(...at(0, 0)) !== null && m.pickPixel(...at(nx - 0.5, ny - 0.5)) !== null,
    'the first and last pixels are still reachable');
}

// V1-7 — the cache key follows the variant. Sharing a key between RAW and
// PROCESSED would serve one mask for the other, which `11` §6 forbids.
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  await m.open({ caseId: CASE, runId: RUN, sliceIndex: 5 });
  const rawKey = m.current.predictionRef?.cacheKey;
  check('V1-7', typeof rawKey === 'string' && rawKey.includes('RAW'),
    `the prediction overlay was fetched and keyed: ${rawKey}`);

  // The key property, checked directly rather than through the fixture: the
  // variant is part of a prediction's identity. Sharing a key between RAW and
  // PROCESSED would serve one mask for the other, which `11` §6 forbids.
  const keyArgs = {
    kind: 'PREDICTION', runId: RUN, sliceIndex: 5,
    sourceVersion: 'v1', geometryContractVersion: 'dr008a-dr012/v1.0.0',
  };
  check('V1-7', sliceCacheKey({ ...keyArgs, variant: 'RAW' })
    !== sliceCacheKey({ ...keyArgs, variant: 'PROCESSED' }),
    'RAW and PROCESSED never share a cache key');
  check('V1-7', m.current.imageRef.cacheKey !== m.current.predictionRef.cacheKey,
    'the MRI and its prediction overlay are keyed separately');

  const m3 = createCaseExplorer(newClient(), { variant: 'RAW' });
  await m3.open({ caseId: CASE, runId: RUN, sliceIndex: 6 });
  check('V1-7', m3.current.imageRef.cacheKey !== m.current.imageRef.cacheKey,
    'a different slice gets a different key');

  /*
   * Switching to PROCESSED cannot be demonstrated against today's bundle:
   * generate_fixture.py hardcodes prediction_variant = "RAW" for every
   * endpoint, so a PROCESSED request comes back labelled RAW and V1-9's guard
   * correctly blocks it. Reported as a note, not a failure - and when the
   * generator grows a processed scenario this branch starts exercising it
   * instead of noting it. V1-13 runs the switch against a stub that answers
   * with the variant it was asked for.
   */
  const served = bundle.scenarios.prediction_slice_get.default.response.data.prediction_variant;
  if (served !== 'PROCESSED' && !bundle.scenarios.prediction_slice_get.variant_processed) {
    check('V1-7', true,
      `fixture serves only prediction_variant=${served}; PROCESSED end-to-end is NOT MEASURED here`);
  } else {
    const sw = await m.setVariant('PROCESSED');
    check('V1-7', sw.view.state === STATE.SUCCESS && sw.predictionRef.cacheKey !== rawKey,
      'switching to PROCESSED re-fetches and re-keys');
  }
}

// V1-9 — the screen refuses a silently substituted variant. `11` §6 forbids
// the server swapping one for another, and a viewer that relabels it is how a
// processed mask gets read as raw. Reported with a client code, not
// VALIDATION_ERROR: prediction_slice_get does not list that one.
{
  const swapping = stubbedClient({ prediction_slice_get: withData({ prediction_variant: 'PROCESSED' }) });
  const m = createCaseExplorer(swapping, { variant: 'RAW' });
  const s = await m.open({ caseId: CASE, runId: RUN, sliceIndex: 5 });
  check('V1-9', s.view.state === STATE.FATAL_INVALID && s.view.error?.code === 'PREDICTION_VARIANT_MISMATCH',
    `a substituted variant blocks the view -> ${s.view.state} ${s.view.error?.code}`);
  check('V1-9', String(s.view.error?.safeMessage).includes('served PROCESSED') && s.predictionRef === null,
    `and says what happened: ${s.view.error?.safeMessage}`);
}

// V1-8 — an unreachable backend is the one recoverable state, with RETRY.
// That is `10` §8's "offline/unreachable backend behavior".
{
  const dead = createClient(contract, { kind: 'test', async send() { throw new Error('econnrefused'); } });
  const m = createCaseExplorer(dead, { variant: 'RAW' });
  const s = await m.open({ caseId: CASE, runId: RUN });
  check('V1-8', s.view.state === STATE.RECOVERABLE_ERROR, `transport down -> ${s.view.state}`);
  check('V1-8', s.view.actions.includes(RECOVERY.RETRY), `offers ${s.view.actions.join('/')}`);
}

// V1-10 — the run status is whitelisted to `11` §6's QUEUED|RUNNING|
// SUCCEEDED|FAILED. A FAILED run is ANALYSIS_FAILED with its reason shown;
// anything else - review vocabulary, a status nobody froze - is drift, and
// none of them may open as SUCCESS with a prediction drawn.
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  const s = await m.open({ caseId: CASE, runId: RUN, scenarios: { analysis_run_get: 'run_failed' } });
  const failed = bundle.scenarios.analysis_run_get.run_failed.response.data;
  check('V1-10', s.view.state === STATE.FATAL_INVALID && s.view.error?.code === 'ANALYSIS_FAILED',
    `run FAILED -> ${s.view.state} ${s.view.error?.code}`);
  check('V1-10', s.view.actions.includes(RECOVERY.VIEW_FAILURE) && !s.view.actions.includes(RECOVERY.RETRY),
    `offers ${s.view.actions.join('/')}, not RETRY`);
  check('V1-10', s.runStatus === 'FAILED' && s.runFailure?.code === failed.failure_code
    && s.runFailure?.reason === failed.failure_reason,
    `failure surfaced: ${s.runFailure?.code} / ${s.runFailure?.reason}`);
  check('V1-10', s.imageRef === null && s.predictionRef === null
    && s.layersAvailable[LAYER.PREDICTION] === false && s.canEnter3D === false,
    'no slice, no overlay, no 3D');

  for (const status of ['IN_PROGRESS', 'CANCELLED']) {
    const mx = createCaseExplorer(stubbedClient({ analysis_run_get: withData({ status }) }), { variant: 'RAW' });
    const sx = await mx.open({ caseId: CASE, runId: RUN });
    check('V1-10', sx.view.state === STATE.FATAL_INVALID && sx.view.error?.code === 'CONTRACT_DRIFT'
      && sx.predictionRef === null && sx.canEnter3D === false,
      `run ${status} -> ${sx.view.state} ${sx.view.error?.code}, nothing drawn`);
  }

  const mq = createCaseExplorer(stubbedClient({ analysis_run_get: withData({ status: 'QUEUED' }) }), { variant: 'RAW' });
  const sq = await mq.open({ caseId: CASE, runId: RUN });
  check('V1-10', sq.view.state === STATE.PROCESSING && sq.runStatus === 'QUEUED',
    `run QUEUED -> ${sq.view.state}, like RUNNING`);
}

// V1-11 — a run that belongs to another case is refused. Its masks would be
// drawn over the wrong MRI.
{
  const foreign = stubbedClient({ analysis_run_get: withData({ case_id: 'CASE_9999' }) });
  const m = createCaseExplorer(foreign, { variant: 'RAW' });
  const s = await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  check('V1-11', s.view.state === STATE.FATAL_INVALID && s.view.error?.code === 'CONTRACT_DRIFT',
    `run of CASE_9999 on the open case -> ${s.view.state} ${s.view.error?.code}`);
  check('V1-11', s.imageRef === null && s.predictionRef === null && s.runStatus === null && s.canEnter3D === false,
    'nothing from the foreign run is kept');
}

// V1-12 — a prediction whose served variant is missing is refused, not filled
// in from the request (`11` §11 rule 6), and nothing is keyed under the
// requested variant. A switch the server answers with the old variant leaves
// no old-variant ref under the new label.
{
  const unlabelled = stubbedClient({ prediction_slice_get: withData({ prediction_variant: null }) });
  const m = createCaseExplorer(unlabelled, { variant: 'PROCESSED' });
  const s = await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  check('V1-12', s.view.state === STATE.FATAL_INVALID && s.view.error?.code === 'PREDICTION_VARIANT_MISMATCH',
    `served variant null -> ${s.view.state} ${s.view.error?.code}`);
  check('V1-12', s.predictionRef === null && s.view.error?.detail?.served === null,
    'no prediction is kept, and none is keyed under the requested PROCESSED');

  const stuckOnRaw = stubbedClient({ prediction_slice_get: withData({ prediction_variant: 'RAW' }) });
  const m2 = createCaseExplorer(stuckOnRaw, { variant: 'RAW' });
  await m2.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  const sw = await m2.setVariant('PROCESSED');
  check('V1-12', sw.view.state === STATE.FATAL_INVALID && sw.variant === 'PROCESSED' && sw.predictionRef === null,
    `asked PROCESSED, served RAW -> ${sw.view.state}; no RAW ref left under PROCESSED`);
}

// V1-13 — mid-switch, the snapshot already says PROCESSED, so it must carry
// nothing fetched under RAW. Against a stub that answers with the variant it
// was asked for, the switch then completes and re-keys.
{
  const honest = stubbedClient({
    prediction_slice_get: (r, q) => withData({
      prediction_variant: q.url.includes('variant=PROCESSED') ? 'PROCESSED' : 'RAW',
    })(r),
  });
  const m = createCaseExplorer(honest, { variant: 'RAW' });
  await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  const rawKey = m.current.predictionRef.cacheKey;
  const pending = m.setVariant('PROCESSED');
  const mid = m.current;
  check('V1-13', mid.view.state === STATE.LOADING && mid.variant === 'PROCESSED'
    && mid.predictionRef === null && mid.imageRef === null && mid.metrics === null,
    `mid-switch: ${mid.view.state}, variant ${mid.variant}, no RAW ref`);
  const done = await pending;
  check('V1-13', done.view.state === STATE.SUCCESS && done.predictionRef.cacheKey.includes('|PROCESSED|')
    && done.predictionRef.cacheKey !== rawKey,
    `the PROCESSED answer is keyed by what was served: ${done.predictionRef.cacheKey}`);
}

// V1-14 — an error after a success carries none of the success's identities:
// a FATAL_INVALID at slice 45 must not hold slice 44's image or mask.
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  const ok = await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  check('V1-14', ok.imageRef !== null && ok.predictionRef !== null, 'slice 44 loaded with its refs');
  const s = await m.goToSlice(45, { scenarios: { mri_slice_get: 'error_case' } });
  check('V1-14', s.view.state === STATE.FATAL_INVALID && s.sliceIndex === 45,
    `MRI of slice 45 fails -> ${s.view.state} at slice ${s.sliceIndex}`);
  check('V1-14', s.imageRef === null && s.predictionRef === null && s.metrics === null
    && s.layersAvailable[LAYER.PREDICTION] === false,
    'and no ref, metric or layer of slice 44 survives under it');
}

// V1-15 — a superseded answer is dropped: slow slice 10, then fast slice 11,
// ends on 11 whatever order the network answers in.
{
  const slow = stubbedClient({
    mri_slice_get: async (r, q) => { if (q.url.includes('/slices/10/')) await sleep(40); return r; },
  });
  const m = createCaseExplorer(slow, { variant: 'RAW' });
  await m.open({ caseId: CASE, runId: RUN, sliceIndex: 0 });
  const first = m.goToSlice(10);
  const second = m.goToSlice(11);
  const [a, b] = await Promise.all([first, second]);
  check('V1-15', m.current.view.state === STATE.SUCCESS && m.current.sliceIndex === 11,
    `slow 10 then fast 11 -> ends on slice ${m.current.sliceIndex}`);
  check('V1-15', m.current.imageRef.cacheKey.includes('|11|') && a === m.current && b === m.current,
    'the late answer for slice 10 was dropped, not applied');
}

// V1-16 — a layer or an entry is offered only with its own data. Nothing
// fetches a reviewed mask or error data yet, so neither layer is offered; 3D
// needs a SUCCEEDED run that names its reconstructions.
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  const s = await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  check('V1-16', s.layersAvailable[LAYER.REVIEWED_MASK] === false
    && m.setOverlay(LAYER.REVIEWED_MASK, true).overlays[LAYER.REVIEWED_MASK] === false,
    'no reviewed mask fetched -> the layer is not offered and cannot be switched on');
  check('V1-16', s.layersAvailable[LAYER.ERROR] === false, 'no error data fetched -> the error layer is not offered');
  check('V1-16', s.canEnter3D === true && s.reconstructionIds.length > 0,
    `a SUCCEEDED run naming ${s.reconstructionIds.length} reconstruction(s) -> 3D offered`);

  const noMesh = stubbedClient({ analysis_run_get: withData({ reconstruction_ids: [] }) });
  const s2 = await createCaseExplorer(noMesh, { variant: 'RAW' }).open({ caseId: CASE, runId: RUN });
  check('V1-16', s2.view.state === STATE.SUCCESS && s2.canEnter3D === false,
    'SUCCEEDED with no reconstruction_ids -> no entry to 3D');

  // The prediction is fetched with its switch off too, so it can be turned
  // back on after navigating - setOverlay never fetches.
  m.setOverlay(LAYER.PREDICTION, false);
  await m.goToSlice(45);
  const back = m.setOverlay(LAYER.PREDICTION, true);
  check('V1-16', back.overlays[LAYER.PREDICTION] === true && back.predictionRef !== null,
    'the prediction overlay comes back on after navigating with it off');
}

// V1-17 — the generated run_not_succeeded scenarios. A prediction the server
// will not give leaves the slice drawn and its layer not offered; metrics it
// will not give say why, and never read as a zero.
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  const s = await m.open({
    caseId: CASE, runId: RUN, sliceIndex: 44, scenarios: { prediction_slice_get: 'run_not_succeeded' },
  });
  check('V1-17', s.view.state === STATE.SUCCESS && s.imageRef !== null
    && s.predictionRef === null && s.layersAvailable[LAYER.PREDICTION] === false,
    'prediction RUN_NOT_SUCCEEDED -> the slice renders, the prediction layer is not offered');

  const withGt = stubbedClient({ case_get: withData({ ground_truth_available: true }) });
  const s2 = await createCaseExplorer(withGt, { variant: 'RAW' }).open({
    caseId: CASE, runId: RUN, sliceIndex: 44, scenarios: { analysis_slice_metrics: 'run_not_succeeded' },
  });
  check('V1-17', s2.view.state === STATE.SUCCESS && s2.metrics?.state === 'UNAVAILABLE'
    && s2.metrics.value === null && s2.metrics.reason === 'RUN_NOT_SUCCEEDED',
    `metrics RUN_NOT_SUCCEEDED -> ${s2.metrics?.state} (${s2.metrics?.reason}), value ${s2.metrics?.value}`);
}

// V1-18 — REFRESH on a PROCESSING screen re-reads the run. It never turns a
// RUNNING run into SUCCESS by fetching its slices.
{
  const log = [];
  const m = createCaseExplorer(stubbedClient({}, { log }), { variant: 'RAW' });
  await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44, scenarios: { analysis_run_get: 'run_running' } });
  const still = await m.refresh({ scenarios: { analysis_run_get: 'run_running' } });
  check('V1-18', still.view.state === STATE.PROCESSING && still.runStatus === 'RUNNING' && still.imageRef === null,
    `refresh while RUNNING -> ${still.view.state}, no slice drawn`);
  check('V1-18', log.filter((id) => id === 'analysis_run_get').length === 2 && !log.includes('mri_slice_get'),
    'the run was read again, and no slice of it was requested');
  const done = await m.refresh();
  check('V1-18', done.view.state === STATE.SUCCESS && done.runStatus === 'SUCCEEDED' && done.sliceIndex === 44,
    `once the run SUCCEEDED, refresh loads slice ${done.sliceIndex}`);
}

// V1-19 — the run / model / mode line: experiment, attempt, case mode,
// inference-only and the case's runs come from the server, and what it did
// not state stays null rather than becoming a guess.
{
  const runData = bundle.scenarios.analysis_run_get.default.response.data;
  const caseData = bundle.scenarios.case_get.default.response.data;
  const s = await createCaseExplorer(newClient(), { variant: 'RAW' }).open({ caseId: CASE, runId: RUN });
  check('V1-19', s.experimentId === runData.experiment_id && s.caseMode === caseData.mode
    && s.availableRunIds.join(',') === caseData.available_run_ids.join(','),
    `experiment ${s.experimentId}, mode ${s.caseMode}, runs ${s.availableRunIds.join(',')}`);
  check('V1-19', s.attemptNo === runData.attempt_no && s.inferenceOnly === (caseData.mode === 'INFERENCE_REVIEW'),
    `attempt ${s.attemptNo} and inference-only ${s.inferenceOnly} read from the typed v1.0 response`);

  // A contract that declares case_capability (as v1.0 does) defines
  // inference-only, and the screen reads it from there.
  const declaring = createContract({
    ...contractJson,
    case_capability: { modes: {
      EVALUATION: { ground_truth_available: true }, INFERENCE_REVIEW: { ground_truth_available: false },
    } },
  });
  const inference = stubbedClient({
    case_get: withData({ mode: 'INFERENCE_REVIEW' }), analysis_run_get: withData({ attempt_no: 2 }),
  }, { c: declaring });
  const s2 = await createCaseExplorer(inference, { variant: 'RAW' }).open({ caseId: CASE, runId: RUN });
  check('V1-19', s2.inferenceOnly === true && s2.caseMode === 'INFERENCE_REVIEW' && s2.attemptNo === 2,
    `mode ${s2.caseMode} -> inferenceOnly ${s2.inferenceOnly}, attempt ${s2.attemptNo}`);
}

// V1-20 — ground truth is fetched only for a case that declares it, and a
// case without it gets no metric request either: its panel says unavailable,
// never NOT_APPLICABLE, which would read as "measured, and empty".
{
  const log = [];
  const s = await createCaseExplorer(stubbedClient({}, { log }), { variant: 'RAW' })
    .open({ caseId: CASE, runId: RUN, sliceIndex: 44, scenarios: { case_get: 'inference_review' } });
  check('V1-20', !log.includes('ground_truth_slice_get') && !log.includes('analysis_slice_metrics'),
    'no ground truth declared -> neither ground truth nor metrics is requested');
  check('V1-20', s.groundTruthRef === null && s.metrics?.state === 'UNAVAILABLE'
    && s.metrics.reason === 'GROUND_TRUTH_UNAVAILABLE',
    `metrics -> ${s.metrics?.state} (${s.metrics?.reason})`);

  const withGt = stubbedClient({ case_get: withData({ ground_truth_available: true }) });
  const s2 = await createCaseExplorer(withGt, { variant: 'RAW' }).open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  check('V1-20', s2.groundTruthRef?.kind === 'GROUND_TRUTH' && s2.groundTruthRef.cacheKey.includes('GROUND_TRUTH')
    && s2.layersAvailable[LAYER.GROUND_TRUTH] === true,
    `ground truth declared -> fetched and keyed: ${s2.groundTruthRef?.cacheKey}`);
  check('V1-20', s2.metrics?.state === 'NOT_APPLICABLE' && s2.canEnterError === true,
    `and the metric is asked for: ${s2.metrics?.state}`);

  const s3 = await createCaseExplorer(withGt, { variant: 'RAW' }).open({
    caseId: CASE, runId: RUN, sliceIndex: 44, scenarios: { ground_truth_slice_get: 'ground_truth_unavailable' },
  });
  check('V1-20', s3.view.state === STATE.SUCCESS && s3.groundTruthRef === null
    && s3.layersAvailable[LAYER.GROUND_TRUTH] === false,
    'declared but not served for this slice -> the slice renders, the layer is not offered');
}

// V1-21 — where the bytes are. content_url and media_type ride on each ref
// when the response carries them; DRAFT v0 does not, and no URL is invented.
{
  const s = await createCaseExplorer(newClient(), { variant: 'RAW' }).open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  const served = bundle.scenarios.mri_slice_get.default.response.data;
  check('V1-21', s.imageRef.contentUrl === served.content_url && s.imageRef.mediaType === served.media_type
    && typeof s.predictionRef.contentUrl === 'string',
    'v1.0 binary delivery: contentUrl and mediaType come from the response, never invented');

  const delivered = (name) => withData({ content_url: `/api/v1/artifacts/${name}`, media_type: 'image/png' });
  const c = stubbedClient({
    case_get: withData({ ground_truth_available: true }),
    mri_slice_get: delivered('mri'), prediction_slice_get: delivered('pred'), ground_truth_slice_get: delivered('gt'),
  });
  const s2 = await createCaseExplorer(c, { variant: 'RAW' }).open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  check('V1-21', s2.imageRef.contentUrl === '/api/v1/artifacts/mri'
    && s2.predictionRef.contentUrl === '/api/v1/artifacts/pred'
    && s2.groundTruthRef.contentUrl === '/api/v1/artifacts/gt'
    && [s2.imageRef, s2.predictionRef, s2.groundTruthRef].every((ref) => ref.mediaType === 'image/png'),
    'each ref carries its own content_url and media_type');
}

// V1-22 — the per-slice requests go out together, not one after another.
{
  let inFlight = 0;
  let peak = 0;
  const track = async (r) => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    await sleep(10);
    inFlight -= 1;
    return r;
  };
  const c = stubbedClient({
    case_get: withData({ ground_truth_available: true }),
    mri_slice_get: track, prediction_slice_get: track, ground_truth_slice_get: track, analysis_slice_metrics: track,
  });
  const s = await createCaseExplorer(c, { variant: 'RAW' }).open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  check('V1-22', s.view.state === STATE.SUCCESS && peak === 4,
    `MRI, prediction, ground truth and metrics were in flight together (peak ${peak})`);
}

// V1-23 — the README states how many checks this file makes. A count that
// drifts is a claim nobody re-checked, so it is checked here.
{
  const readme = readFileSync(new URL('README.md', import.meta.url), 'utf8');
  const stated = Number((readme.match(/(\d+) checks, groups V1-1/) || [])[1]);
  check('V1-23', stated === checks + 1, `README says ${stated} checks; this file makes ${checks + 1}`);
}

console.log(failures === 0
  ? `PASS V1 case explorer — ${checks}/${checks}`
  : `FAIL V1 case explorer — ${failures} of ${checks} failing`);
process.exit(failures === 0 ? 0 : 1);
