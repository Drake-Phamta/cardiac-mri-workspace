// node --test mobile/test/  - V2 SCR-05 / V1 SCR-04: the error palette stays clearly separated from the surfaces' colours
//
// The FP and FN colours are SCR-04's ERROR_CLASS (one legend across the app). Round 2 moved them because they sat on top of
// the 3D surfaces' own colours: FP (a red) next to the prediction's orange, FN (an azure) next to the ground truth's cyan.
// This test recomputes the separation - CIEDE2000 between the colours as seen with normal vision and with simulated protan,
// deutan and tritan vision (Machado, Oliveira, Fernandes 2009, severity 1) - so that a later "small tweak" cannot bring the
// problem back unnoticed, and shows that the retired palette fails the same check. The patterns (FP checkered, FN striped,
// glyphs, printed look) stay: colour is never the only cue (`10` §7, §9); this is about the colour that remains.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ERROR_CLASS } from '../src/verticals/v1/errorInspector.mjs';
import { LAYER_COLOR, LAYER_INFO, ROLE_ORDER } from '../src/verticals/v2/inspector3d.mjs';
import { VIEWER_SCRIPT } from '../src/verticals/v2/viewerSource.mjs';

/* ------------------------------------------------------------------ colour maths */

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => { const v = Math.min(1, Math.max(0, c)); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; };
const MACHADO = {
  normal: null,
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

function labOf(hex, vision) {
  let lin = rgbOf(hex).map(toLinear);
  if (MACHADO[vision]) lin = mul(MACHADO[vision], lin).map((c) => Math.min(1, Math.max(0, c)));
  const rgb = lin.map(toSrgb).map(toLinear);   // the simulated colour as the screen would show it, back to linear light
  const xyz = mul([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]], rgb);
  const white = [0.95047, 1.0, 1.08883];
  const f = xyz.map((v, i) => { const t = v / white[i]; return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116; });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// CIEDE2000 (Sharma, Wu, Dalal 2005), kL = kC = kH = 1.
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : (deg(Math.atan2(b1, a1p)) + 360) % 360;
  const h2p = C2p === 0 ? 0 : (deg(Math.atan2(b2, a2p)) + 360) % 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
    else hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos(rad(hpm - 30)) + 0.24 * Math.cos(rad(2 * hpm)) + 0.32 * Math.cos(rad(3 * hpm + 6)) - 0.20 * Math.cos(rad(4 * hpm - 63));
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

const distance = (a, b, vision) => deltaE2000(labOf(a, vision), labOf(b, vision));
const worst = (a, b, visions) => Math.min(...visions.map((v) => distance(a, b, v)));
const MAIN = ['normal', 'protan', 'deutan'];

/* The colours that are not ours to change: the surfaces, the true-positive green and the slice plane. */
const FIXED = Object.freeze({ prediction: '#f0883e', groundTruth: '#39c5cf', tp: '#4fbf7a', plane: '#ffd133' });
const separations = (fp, fn) => ({
  fpPrediction: worst(fp, FIXED.prediction, MAIN), fnGroundTruth: worst(fn, FIXED.groundTruth, MAIN), fpFn: worst(fp, fn, MAIN),
  fpTp: worst(fp, FIXED.tp, MAIN), fnTp: worst(fn, FIXED.tp, MAIN),
  fpGroundTruth: worst(fp, FIXED.groundTruth, MAIN), fnPrediction: worst(fn, FIXED.prediction, MAIN),
  fpPlane: worst(fp, FIXED.plane, MAIN), fnPlane: worst(fn, FIXED.plane, MAIN),
});
const THRESHOLDS = Object.freeze({
  fpPrediction: 30, fnGroundTruth: 20, fpFn: 20, fpTp: 20, fnTp: 20, fpGroundTruth: 20, fnPrediction: 20, fpPlane: 20, fnPlane: 20,
});
const failing = (s) => Object.keys(THRESHOLDS).filter((k) => s[k] < THRESHOLDS[k]);

/* ------------------------------------------------------------------ tests */

test('V2P1 the CIEDE2000 used here reproduces published reference pairs (Sharma et al. 2005)', () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425], [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412], [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492], [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[50, 2.5, 0], [56, -27, -3], 31.903], [[50, 2.5, 0], [58, 24, 15], 19.4535],
  ];
  for (const [a, b, want] of pairs) assert.ok(Math.abs(deltaE2000(a, b) - want) < 1e-3, `${a} vs ${b}: ${deltaE2000(a, b)} != ${want}`);
  assert.equal(deltaE2000([60, 10, 10], [60, 10, 10]), 0, 'a colour is no distance from itself');
  // the simulation leaves a grey alone and turns red and green into near neighbours for protan / deutan vision
  assert.ok(distance('#808080', '#808080', 'deutan') < 1e-6 && distance('#808080', '#9a9a9a', 'normal') > 1);
  assert.ok(distance('#ff0000', '#00aa00', 'normal') > 40 && distance('#ff0000', '#00aa00', 'deutan') < distance('#ff0000', '#00aa00', 'normal'));
});

test('V2P2 the shipped FP and FN colours are clearly apart from the prediction orange, the ground-truth cyan and each other', () => {
  const fp = ERROR_CLASS.FP.color;
  const fn = ERROR_CLASS.FN.color;
  const s = separations(fp, fn);
  assert.deepEqual(failing(s), [], JSON.stringify(s));
  // the brief's two pairs, with the numbers the README quotes
  assert.ok(s.fpPrediction >= 30, `FP vs the prediction's orange: ${s.fpPrediction.toFixed(1)}`);
  assert.ok(s.fnGroundTruth >= 20, `FN vs the ground truth's cyan: ${s.fnGroundTruth.toFixed(1)}`);
  // and for the rare tritan vision nothing collapses either
  assert.ok(worst(fp, FIXED.prediction, ['tritan']) >= 15 && worst(fn, FIXED.groundTruth, ['tritan']) >= 15, 'tritan floor');
  assert.equal(ERROR_CLASS.TP.color, FIXED.tp, 'TP did not move');
  assert.equal(LAYER_INFO.prediction.color, FIXED.prediction);
  assert.equal(LAYER_INFO.groundTruth.color, FIXED.groundTruth);
});

test('V2P3 negative control: the retired FP / FN colours fail the same check - the test has teeth', () => {
  const retired = separations('#e8635a', '#4d9de0');
  assert.ok(failing(retired).includes('fpPrediction') && failing(retired).includes('fnGroundTruth'), JSON.stringify(retired));
  assert.ok(retired.fpPrediction < 12 && retired.fnGroundTruth < 15, 'under deuteranopia the old pairs were almost one colour');
});

test('V2P4 the four layers keep four colours, four glyphs and four printed looks; the viewer draws the colours the legend shows', () => {
  const colors = ROLE_ORDER.map((r) => LAYER_COLOR[r]);
  assert.equal(new Set(colors).size, 4);
  assert.equal(new Set(ROLE_ORDER.map((r) => LAYER_INFO[r].glyph)).size, 4, 'never colour alone: a glyph each');
  assert.equal(new Set(ROLE_ORDER.map((r) => LAYER_INFO[r].look)).size, 4, 'and a printed look each');
  for (const a of ROLE_ORDER) for (const b of ROLE_ORDER) {
    if (a < b) assert.ok(distance(LAYER_COLOR[a], LAYER_COLOR[b], 'normal') >= 15, `${a} vs ${b} under normal vision`);
  }
  assert.equal(LAYER_COLOR.falsePositive, ERROR_CLASS.FP.color, 'one legend across the app');
  assert.equal(LAYER_COLOR.falseNegative, ERROR_CLASS.FN.color);
  // the viewer's own copy, read from its source, is the legend's colours as floats
  const text = /var COLORS = (\{[^;]*\});/.exec(VIEWER_SCRIPT);
  assert.ok(text, 'the viewer declares its colours in one object');
  const drawn = JSON.parse(text[1].replace(/([a-zA-Z]+):/g, '"$1":'));
  for (const role of ROLE_ORDER) {
    rgbOf(LAYER_COLOR[role]).forEach((v, i) => assert.ok(Math.abs(drawn[role][i] - v) < 1e-9, `${role}[${i}] ${drawn[role][i]} != ${v}`));
  }
});
