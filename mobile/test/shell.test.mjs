// node --test mobile/test/  - the shared shell: design tokens and their contrast (src/components/tokens.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  color, contrastRatio, errorClass, family, overlay, status,
} from '../src/components/tokens.mjs';

const SURFACES = { bg: color.bg, surface: color.surface, surfaceHi: color.surfaceHi };

test('SH1 contrastRatio matches WCAG: black on white is 21, a colour on itself is 1', () => {
  assert.equal(Number(contrastRatio('#000000', '#ffffff').toFixed(2)), 21);
  assert.equal(contrastRatio('#58a6ff', '#58a6ff'), 1);
  assert.equal(contrastRatio('#0e1116', '#e8eaed'), contrastRatio('#e8eaed', '#0e1116'));
});

test('SH2 text is at least 4.5:1 on every surface; textFaint was the one below it (3.73:1 on surface)', () => {
  for (const [name, bg] of Object.entries({ ...SURFACES, accentBg: color.accentBg })) {
    for (const key of ['text', 'textDim', 'textFaint']) {
      const r = contrastRatio(color[key], bg);
      assert.ok(r >= 4.5, `${key} ${color[key]} on ${name} ${bg}: ${r.toFixed(2)}:1`);
    }
  }
  assert.ok(contrastRatio('#6d757d', color.surface) < 4.5, 'the old textFaint really failed');
});

test('SH3 a control edge is at least 3:1 on bg, surface and surfaceHi (WCAG 1.4.11); the old border was 1.28:1', () => {
  for (const [name, bg] of Object.entries(SURFACES)) {
    const r = contrastRatio(color.control, bg);
    assert.ok(r >= 3, `control ${color.control} on ${name}: ${r.toFixed(2)}:1`);
  }
  assert.ok(contrastRatio(color.border, color.surface) < 3, 'border stays decorative, so controls must use color.control');
});

test('SH4 overlay, error-class and family colours are at least 3:1 on the viewer and a dark slice', () => {
  const colours = { ...overlay, ...errorClass, family0: family[0].color, family1: family[1].color };
  for (const [name, c] of Object.entries(colours)) {
    for (const bg of [color.viewer, '#262626', color.bg]) {
      const r = contrastRatio(c, bg);
      assert.ok(r >= 3, `${name} ${c} on ${bg}: ${r.toFixed(2)}:1`);
    }
  }
  assert.notEqual(family[0].marker, family[1].marker, 'families differ by marker shape, not colour alone');
  assert.deepEqual(Object.keys(status).sort(), ['danger', 'info', 'ok', 'warn']);
});
