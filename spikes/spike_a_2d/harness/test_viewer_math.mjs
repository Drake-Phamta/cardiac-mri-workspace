// SPIKE_A — offline check of app/viewerMath.js, the exact code the phone runs.
//
// THROWAWAY SPIKE CODE under spikes/spike_a_2d/.
//
//   node harness/test_viewer_math.mjs
//
// Independent references, so the module is not checked against itself:
//   SHA-256 and base64      Node's own crypto and Buffer
//   screen -> source        the fixture's stored expected_source_pixel (which
//                           check_conformance.py F2 rederives in Python)
//   zoom about a point      the source position under the focal point must not move
//
// Exit code 1 on any failure. Nothing here is a device measurement.

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as M from '../app/viewerMath.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'fixtures');
const load = (f) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));

let failures = 0;
const check = (id, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(4)} ${detail}`);
};

const vol = load('volume_synthetic.json');
const mask = load('mask_synthetic.json');
const brush = load('brush_cases.json');
const [NX, NY, NZ] = vol.shape_xyz;

// T1 — sha256Hex against node:crypto on awkward lengths (padding boundaries)
{
  const lens = [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 1000, NX * NY];
  const bad = lens.filter((n) => {
    const b = randomBytes(n);
    return M.sha256Hex(new Uint8Array(b)) !== createHash('sha256').update(b).digest('hex');
  });
  check('T1', bad.length === 0, `sha256Hex vs node:crypto on ${lens.length} lengths` +
    (bad.length ? ` — wrong at ${bad.join(', ')}` : ''));
}

// T2 — base64ToBytes against Buffer, on every fixture slice
{
  let bad = 0;
  for (const b64 of [...vol.slices_b64, ...mask.slices_b64]) {
    const mine = M.base64ToBytes(b64);
    const ref = Buffer.from(b64, 'base64');
    if (mine.length !== ref.length || !ref.equals(Buffer.from(mine))) bad += 1;
  }
  check('T2', bad === 0, `base64ToBytes vs Buffer on ${vol.slices_b64.length + mask.slices_b64.length} slices` +
    (bad ? ` — ${bad} differ` : ''));
}

// T3 — the app's checksum of each source-mask slice equals the fixture's slice_sha256
{
  let match = 0;
  mask.slices_b64.forEach((b64, z) => {
    if (M.sha256Hex(M.base64ToBytes(b64)) === mask.slice_sha256[z]) match += 1;
  });
  check('T3', match === NZ, `mask slice checksums as the app computes them: ${match}/${NZ} match the fixture`);
}

// T4 — screenToSource on all brush cases, against the stored expectation
{
  const bad = [];
  for (const c of brush.cases) {
    const got = M.screenToSource(c.touch_u, c.touch_v, { zoom: c.zoom, panX: c.pan_x, panY: c.pan_y }, NX, NY);
    const want = c.expected_source_pixel;
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${c.id}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  }
  const outside = brush.cases.filter((c) => c.must_not_paint).length;
  check('T4', bad.length === 0, `screenToSource: ${brush.cases.length - bad.length}/${brush.cases.length} brush cases, ` +
    `${outside} outside the image map to null` + (bad.length ? ` — ${bad.slice(0, 3).join('; ')}` : ''));
}

// T5 — zoomAbout keeps the source point under the focal point fixed
{
  let worst = 0;
  const view = 1000;
  let t = M.fitTransform(view, view, NX, NY);
  const fit = { ...t };
  for (let i = 0; i < 500; i++) {
    const fx = Math.random() * view;
    const fy = Math.random() * view;
    const before = [(fx - t.panX) / t.zoom, (fy - t.panY) / t.zoom];
    const z = M.clampZoom(t.zoom * (0.2 + Math.random() * 4), fit.zoom);
    t = M.zoomAbout(t, z, fx, fy);
    const after = [(fx - t.panX) / t.zoom, (fy - t.panY) / t.zoom];
    worst = Math.max(worst, Math.abs(after[0] - before[0]), Math.abs(after[1] - before[1]));
  }
  check('T5', worst < 1e-6, `zoomAbout: source point under the focal point drifts at most ${worst.toExponential(2)} source px over 500 zooms`);
}

// T6 — the automated A2 sequence only ever produces transforms; the mask bytes are untouched
{
  const before = mask.slices_b64.map((b) => M.sha256Hex(M.base64ToBytes(b)));
  const view = 1080;
  const fit = M.fitTransform(view, view, NX, NY);
  let t = { ...fit };
  let finite = true;
  for (const step of M.A2_SEQUENCE) {
    t = M.applyStep(t, step, view, view, fit);
    finite = finite && [t.zoom, t.panX, t.panY].every(Number.isFinite) && t.zoom > 0;
  }
  const after = mask.slices_b64.map((b) => M.sha256Hex(M.base64ToBytes(b)));
  const same = before.every((h, z) => h === after[z]);
  const backToFit = Math.abs(t.zoom - fit.zoom) < 1e-9 && Math.abs(t.panX - fit.panX) < 1e-9;
  check('T6', finite && same && backToFit,
    `A2_SEQUENCE: ${M.A2_SEQUENCE.length} steps, transforms finite, ends at fit, mask checksums unchanged`);
}

console.log(`\n  ${failures === 0 ? 'all passed' : `${failures} FAILED`} — offline logic only; A2 itself is measured on the device.\n`);
process.exit(failures ? 1 : 0);
