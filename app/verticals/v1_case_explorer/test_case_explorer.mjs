// node app/verticals/v1_case_explorer/test_case_explorer.mjs
//
// Runs against the GENERATED fixture bundle, so it exercises the same
// handshake every other vertical does. Generate it first:
//
//   python contracts/api/generate_fixture.py --contract contracts/api/contract.json \
//          --output app/core/fixtures/.generated/api_bundle.json
//
// Same harness shape as V4's test: a local check(), ids V1-n, exit 1 on any
// failure, no dependency to install.

import { readFileSync } from 'node:fs';
import {
  createContract, createBundle, createClient, createFixtureTransport,
  STATE, RECOVERY, screenToSource, sliceCacheKey,
} from '../../core/index.mjs';
import { createCaseExplorer, LAYER } from './index.mjs';

const ROOT = new URL('../../../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));

const contract = createContract(readJson('contracts/api/contract.json'));
const bundle = createBundle(contract, readJson('app/core/fixtures/.generated/api_bundle.json'));
const newClient = () => createClient(contract, createFixtureTransport(bundle));

// The generator's own parameter values, so the test drives real scenarios.
const CASE = 'CASE_0043';
const RUN = 'RUN_0043';

let failures = 0;
const check = (id, ok, detail) => {
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
{
  let threw = false;
  try { createCaseExplorer(newClient(), {}); } catch { threw = true; }
  check('V1-2', threw, 'a missing variant is refused at construction');
  let threw2 = false;
  try { createCaseExplorer(newClient(), { variant: 'BEST' }); } catch { threw2 = true; }
  check('V1-2', threw2, 'an unknown variant is refused');
}

// V1-3 — absent ground truth is an unavailable state with no RETRY, never an
// empty chart and never a zero mask (`10` §7).
{
  const m = createCaseExplorer(newClient(), { variant: 'RAW' });
  await m.open({ caseId: CASE, runId: RUN, sliceIndex: 44 });
  const gt = await newClient().call('ground_truth_slice_get',
    { case_id: CASE, slice_index: 44 }, { scenario: 'ground_truth_unavailable' });
  check('V1-3', gt.state === STATE.EMPTY_UNAVAILABLE, `GT unavailable -> ${gt.state}`);
  check('V1-3', !gt.actions.includes(RECOVERY.RETRY), `offers ${gt.actions.join('/') || 'nothing'}, not RETRY`);

  // And the screen does not offer a layer whose data is not there. The fixture
  // gives ground_truth_available as a placeholder STRING, which is truthy -
  // comparing === true is what keeps this honest.
  const s = m.current;
  check('V1-3', s.groundTruthAvailable === false && s.layersAvailable[LAYER.GROUND_TRUTH] === false,
    'a truthy placeholder does not enable the ground-truth layer');
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
   * instead of noting it.
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
// processed mask gets read as raw.
{
  const swapping = createClient(contract, {
    kind: 'test',
    async send(resolved) {
      if (resolved.endpointId !== 'prediction_slice_get') {
        return bundle.scenarios[resolved.endpointId].default.response;
      }
      const d = { ...bundle.scenarios.prediction_slice_get.default.response.data };
      d.prediction_variant = 'PROCESSED';          // asked RAW, served PROCESSED
      return { status: 200, data: d };
    },
  });
  const m = createCaseExplorer(swapping, { variant: 'RAW' });
  const s = await m.open({ caseId: CASE, runId: RUN, sliceIndex: 5 });
  check('V1-9', s.view.state === STATE.FATAL_INVALID,
    `a substituted variant blocks the view -> ${s.view.state}`);
  check('V1-9', String(s.metrics?.reason).includes('served PROCESSED'),
    `and says what happened: ${s.metrics?.reason}`);
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

console.log(failures === 0
  ? `PASS V1 case explorer — all checks`
  : `FAIL V1 case explorer — ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
