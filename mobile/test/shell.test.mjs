// node --test mobile/test/  - the shared shell: design tokens and their contrast, the header lines
// (src/components/tokens.mjs, src/navigation/header.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  color, contrastRatio, errorClass, family, overlay, status,
} from '../src/components/tokens.mjs';
import { aboutLines, headerLines, sameContext } from '../src/navigation/header.mjs';
import { bindNav, initialNavState } from '../src/navigation/navigator.mjs';
import { screenMeta } from '../src/navigation/routes.mjs';

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

test('SH5 header: a name for people plus the case, run and variant; the study on a tab root', () => {
  const scr03 = screenMeta('SCR-03');
  assert.deepEqual({ ...headerLines(scr03, { caseId: 'CASE_0061' }) },
    { title: 'Case Explorer', subtitle: 'CASE_0061', screenId: 'SCR-03', vertical: 'V1' });
  assert.equal(headerLines(scr03, { caseId: 'CASE_0061' }, { runId: 'RUN_A', variant: 'RAW' }).subtitle, 'CASE_0061 · run RUN_A · RAW');
  // What the screen reports wins over the route: a run the case does not list is not named.
  assert.equal(headerLines(scr03, { caseId: 'C', runId: 'RUN_GONE', variant: 'RAW' }, { runId: null, variant: null }).subtitle, 'C');
  assert.equal(headerLines(screenMeta('SCR-04'), { caseId: 'C', runId: 'R', variant: 'PROCESSED', sliceIndex: 4 }).subtitle, 'C · run R · PROCESSED');
  assert.equal(headerLines(scr03, { caseId: 'C', variant: 'RAW' }).subtitle, 'C', 'a variant without a run is not shown');
  assert.equal(headerLines(screenMeta('SCR-02'), {}, null, { studyId: 'STUDY_DEMO' }).subtitle, 'Study STUDY_DEMO');
  assert.equal(headerLines(screenMeta('SCR-02'), {}, null).subtitle, null);
});

test('SH6 About this screen: the screen id, mode, contract and build', () => {
  const lines = aboutLines(screenMeta('SCR-04'), {
    mode: 'live', studyId: 'STUDY_LA_001', build: { gitSha: '8e8b8c26d4dc', generatedAt: '2026-11-14T14:52:43Z', contractVersion: '1.1.0' },
  });
  assert.deepEqual([...lines], ['Screen SCR-04 (V1)', 'Mode LIVE · study STUDY_LA_001', 'Contract 1.1.0', 'Build 8e8b8c2 · 2026-11-14T14:52:43Z']);
  assert.deepEqual([...aboutLines(screenMeta('SCR-01'), { mode: 'fixture', build: {} })],
    ['Screen SCR-01 (V3)', 'Mode FIXTURE', 'Contract not stated', 'Build not stated']);
  assert.equal(sameContext({ runId: 'R', variant: 'RAW' }, { variant: 'RAW', runId: 'R' }), true);
  assert.equal(sameContext({ runId: 'R' }, { runId: 'S' }), false);
  assert.equal(sameContext(null, null), true);
});

test('SH7 nav.setContext reports to the shell under the screen\'s own key', () => {
  const got = [];
  const nav = bindNav(() => {}, initialNavState('SCR-02'), null, null, (key, ctx) => got.push([key, ctx]));
  nav.setContext({ runId: 'R' });
  nav.setContext(null);
  assert.deepEqual(got, [['SCR-02#1', { runId: 'R' }], ['SCR-02#1', null]]);
  assert.doesNotThrow(() => bindNav(() => {}, initialNavState('SCR-02')).setContext({ runId: 'R' }), 'no listener: a no-op');
});
