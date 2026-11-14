// node --test mobile/test/  - V1 overlay colours: the error classes and the explorer layers stay apart for the three
// common colour-vision deficiencies, and stand out on the slice (src/screens/v1-cases/errorInspector.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { CLASS_ORDER, ERROR_CLASS } from '../src/screens/v1-cases/errorInspector.mjs';
import { color, contrastRatio, errorClass, overlay } from '../src/components/tokens.mjs';

// Machado, Oliveira & Fernandes 2009, severity 1.0, applied in linear RGB; distance is CIE76 delta E in Lab.
const VISION = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const linear = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
};
const lab = (rgb) => {
  const [r, g, b] = rgb.map((v) => Math.max(0, Math.min(1, v)));
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
const seenAs = (m, hex) => { const v = linear(hex); return lab(m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])); };
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function smallestDistance(colours) {
  let worst = { d: Infinity };
  for (const [vision, m] of Object.entries(VISION)) {
    for (let i = 0; i < colours.length; i += 1) {
      for (let j = i + 1; j < colours.length; j += 1) {
        const d = deltaE(seenAs(m, colours[i][1]), seenAs(m, colours[j][1]));
        if (d < worst.d) worst = { d, vision, pair: `${colours[i][0]}-${colours[j][0]}` };
      }
    }
  }
  return worst;
}

test('VC1 the error classes are the token colours, and only FP is dashed', () => {
  assert.deepEqual(CLASS_ORDER.map((k) => ERROR_CLASS[k].color), [errorClass.TP, errorClass.FP, errorClass.FN]);
  assert.deepEqual(CLASS_ORDER.map((k) => ERROR_CLASS[k].dashed), [false, true, false]);
});

test('VC2 TP / FP / FN stay apart for protan, deutan and tritan vision; the old red-green pair did not', () => {
  const now = smallestDistance(CLASS_ORDER.map((k) => [k, ERROR_CLASS[k].color]));
  assert.ok(now.d >= 20, `closest pair ${now.pair} under ${now.vision}: delta E ${now.d.toFixed(1)}`);
  const before = smallestDistance([['TP', '#4fbf7a'], ['FP', '#e8635a'], ['FN', '#4d9de0']]);
  assert.ok(before.d < 16, `the old palette's closest pair was ${before.pair} under ${before.vision}: ${before.d.toFixed(1)}`);
  const layers = smallestDistance([['prediction', overlay.prediction], ['ground truth', overlay.groundTruth]]);
  assert.ok(layers.d >= 20, `explorer layers under ${layers.vision}: delta E ${layers.d.toFixed(1)}`);
});

test('VC3 every overlay colour is at least 3:1 on the black viewer and on dark tissue', () => {
  for (const c of [...CLASS_ORDER.map((k) => ERROR_CLASS[k].color), overlay.prediction, overlay.groundTruth]) {
    assert.ok(contrastRatio(c, color.viewer) >= 6, `${c} on black: ${contrastRatio(c, color.viewer).toFixed(2)}:1`);
    assert.ok(contrastRatio(c, '#262626') >= 3, `${c} on #262626: ${contrastRatio(c, '#262626').toFixed(2)}:1`);
  }
});
