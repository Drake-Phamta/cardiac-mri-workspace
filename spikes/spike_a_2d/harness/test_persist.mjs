// SPIKE_A — offline check of app/persist.js, the exact code the phone runs.
//
// THROWAWAY SPIKE CODE under spikes/spike_a_2d/.
//
//   node harness/test_persist.mjs
//
// A8 is "save and reload the corrected mask". The measurement on the device
// answers how long that takes; this answers whether it is the same mask, and
// it answers it before the phone session rather than after.
//
// Independent references, so the module is not checked against itself:
//   run-length coding   a naive per-pixel expansion written here, not imported
//   sha256              node:crypto
//   the fixture         fixtures/mask_synthetic.json, decoded from base64 by
//                       node's own Buffer
//
// Exit code 1 on any failure. Nothing here is a device measurement.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as P from '../app/persist.js';

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
const [NX, NY, NZ] = vol.shape_xyz;
const SOURCE = mask.slices_b64.map((b) => new Uint8Array(Buffer.from(b, 'base64')));

// An independent decoder: expand the runs one pixel at a time, without reusing
// persist.js's fill-based loop.
function naiveDecode(runs, length) {
  const out = new Uint8Array(length);
  let at = 0;
  let value = 0;
  for (const n of runs) {
    for (let i = 0; i < n; i++) out[at + i] = value;
    at += n;
    value = value ? 0 : 1;
  }
  return out;
}

// P1 — round trip on every fixture slice, checked against node:crypto rather
// than against persist.js's own hashes.
{
  const bad = [];
  for (let z = 0; z < NZ; z++) {
    const back = P.rleDecodeSlice(P.rleEncodeSlice(SOURCE[z]), NX * NY);
    const a = createHash('sha256').update(SOURCE[z]).digest('hex');
    const b = createHash('sha256').update(back).digest('hex');
    if (a !== b) bad.push(z);
  }
  check('P1', bad.length === 0, `${NZ} fixture slices round-trip` + (bad.length ? ` — bad at ${bad}` : ''));
}

// P2 — the two decoders agree. If persist.js's fill loop had an off-by-one at
// a run boundary, only a second implementation would show it.
{
  const bad = [];
  for (let z = 0; z < NZ; z++) {
    const runs = P.rleEncodeSlice(SOURCE[z]);
    const mine = P.rleDecodeSlice(runs, NX * NY);
    const naive = naiveDecode(runs, NX * NY);
    if (Buffer.compare(Buffer.from(mine), Buffer.from(naive)) !== 0) bad.push(z);
  }
  check('P2', bad.length === 0, 'the fill decoder agrees with a per-pixel decoder');
}

// P3 — the awkward shapes. All-zero, all-one, alternating, a leading one, and
// a single set pixel at each end. A slice that starts with 1 must emit a
// zero-length first run.
{
  const cases = {
    'all zero': new Uint8Array(64),
    'all one': new Uint8Array(64).fill(1),
    alternating: Uint8Array.from({ length: 64 }, (_, i) => i % 2),
    'leading one': Uint8Array.from({ length: 64 }, (_, i) => (i < 3 ? 1 : 0)),
    'first pixel only': Uint8Array.from({ length: 64 }, (_, i) => (i === 0 ? 1 : 0)),
    'last pixel only': Uint8Array.from({ length: 64 }, (_, i) => (i === 63 ? 1 : 0)),
    empty: new Uint8Array(0),
  };
  const bad = Object.entries(cases).filter(([, buf]) => {
    const back = P.rleDecodeSlice(P.rleEncodeSlice(buf), buf.length);
    return Buffer.compare(Buffer.from(buf), Buffer.from(back)) !== 0;
  }).map(([name]) => name);
  check('P3', bad.length === 0, `${Object.keys(cases).length} edge shapes round-trip` +
    (bad.length ? ` — ${bad.join(', ')}` : ''));
  check('P3', P.rleEncodeSlice(cases['leading one'])[0] === 0,
    'a slice starting with 1 emits a zero-length first run');
}

// P4 — a truncated document is refused rather than silently short. A mask
// that reloads 90% of a slice and zero-fills the rest is the failure this
// whole check exists for.
{
  let threw = false;
  try { P.rleDecodeSlice([10, 10], NX * NY); } catch { threw = true; }
  check('P4', threw, 'runs that do not cover the slice are refused');
}

// P5 — a full encode/decode of an EDITED volume, which is what A8 actually
// saves. Edits are made here, not read from a fixture, so the check does not
// depend on the brush.
{
  const working = SOURCE.map((b) => new Uint8Array(b));
  for (const z of [0, 1, NZ - 1]) {
    for (let i = 0; i < 500; i += 7) working[z][i] ^= 1;
  }
  const doc = P.encodeWorking(working, NX, NY);
  const { slices, verified, mismatches } = P.decodeWorking(doc);
  check('P5', verified === NZ && mismatches.length === 0,
    `edited volume: ${verified}/${NZ} slices verify`);
  const same = slices.every((b, z) => Buffer.compare(Buffer.from(b), Buffer.from(working[z])) === 0);
  check('P5', same, 'every decoded slice equals the working slice byte for byte');
  check('P5', doc.volume_sha256 === P.volumeHash(slices), 'the volume hash survives the round trip');
}

// P6 — a corrupted document is REPORTED, not thrown. `decodeWorking` returning
// which slices failed is what lets a device session record "reload changed 2
// slices" instead of "reload failed".
{
  const working = SOURCE.map((b) => new Uint8Array(b));
  const doc = P.encodeWorking(working, NX, NY);
  doc.sha256[2] = '0'.repeat(64);
  const { mismatches } = P.decodeWorking(doc);
  check('P6', mismatches.length === 1 && mismatches[0] === 2,
    `a bad checksum is reported as slice ${mismatches}, not thrown`);
}

// P7 — an unknown format IS thrown. Reading a future file with this build
// would be worse than refusing.
{
  let threw = false;
  try { P.decodeWorking({ format: 'spike_a_working_mask/v2', nx: 1, ny: 1, nz: 0 }); } catch { threw = true; }
  check('P7', threw, 'an unknown format is refused');
}

// P8 — editedSlices finds exactly the slices that were touched, so the A8
// record can say how much correction the timing covers.
{
  const working = SOURCE.map((b) => new Uint8Array(b));
  working[1][0] ^= 1;
  working[4][NX * NY - 1] ^= 1;
  const edited = P.editedSlices(working, SOURCE);
  check('P8', edited.join(',') === '1,4', `edited slices ${edited.join(',')}`);
}

// P9 — the size claim in the header. Report the ratio rather than assert a
// threshold: the fixture is synthetic, and a number nobody can reproduce from
// the fixture would be a number to argue with on the device.
{
  const doc = P.encodeWorking(SOURCE, NX, NY);
  const json = JSON.stringify(doc).length;
  const raw = NX * NY * NZ;
  check('P9', json < raw, `${NX}x${NY}x${NZ}: ${raw} raw bytes -> ${json} JSON bytes ` +
    `(${(json / raw).toFixed(3)}x) — the device session records this at 576x576x88`);
}

console.log(failures === 0 ? '\nPASS test_persist' : `\nFAIL test_persist — ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
