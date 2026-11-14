// node --test mobile/test/  - the shared shell: design tokens and their contrast, the header lines, the session
// cover clock and the cache clear (src/components/tokens.mjs, session.mjs, src/navigation/header.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  color, contrastRatio, errorClass, family, flatten, font, overlay, radius, space, status, type,
} from '../src/components/tokens.mjs';
import {
  clearCachedData, COVER_REASON, coverText, createSessionClock, SESSION_LIMITS,
} from '../src/components/session.mjs';
import { aboutLines, headerLines, sameContext } from '../src/navigation/header.mjs';
import { bindNav, initialNavState } from '../src/navigation/navigator.mjs';
import { screenMeta } from '../src/navigation/routes.mjs';
import { createImageStore, createSliceCache } from '../src/api/cache.mjs';

const SURFACES = { bg: color.bg, surface: color.surface, field: color.field, raised: color.raised };
// Glass over the brightest tissue (white) is the worst case for text on a floating chip, toolbar or panel.
const GLASS_WORST = flatten(color.glass, '#ffffff');

test('SH1 contrastRatio matches WCAG: black on white is 21, a colour on itself is 1; flatten mixes an rgba token onto a surface', () => {
  assert.equal(Number(contrastRatio('#000000', '#ffffff').toFixed(2)), 21);
  assert.equal(contrastRatio('#58a6ff', '#58a6ff'), 1);
  assert.equal(contrastRatio('#0e1116', '#e8eaed'), contrastRatio('#e8eaed', '#0e1116'));
  assert.equal(GLASS_WORST, '#2e3032', 'design/TOKENS.md: glass over white tissue');
  assert.equal(flatten('rgba(255,255,255,0)', '#0a0b0d'), '#0a0b0d');
  assert.equal(flatten('#123456', '#000000'), '#123456', 'a solid colour stays as it is');
});

test('SH2 text is at least 4.5:1 on every solid surface and on the selected tint; textFaint was the one below it (3.73:1 on surface)', () => {
  for (const [name, bg] of Object.entries({ ...SURFACES, accentBg: color.accentBg })) {
    for (const key of ['t1', 't2', 't3']) {
      const r = contrastRatio(color[key], bg);
      assert.ok(r >= 4.5, `${key} ${color[key]} on ${name} ${bg}: ${r.toFixed(2)}:1`);
    }
  }
  assert.ok(contrastRatio('#6d757d', '#161a20') < 4.5, 'the old textFaint really failed on the old surface');
  // The older names still used by screens are the same colours.
  assert.deepEqual([color.text, color.textDim, color.textFaint, color.surfaceHi, color.border],
    [color.t1, color.t2, color.t3, color.raised, color.hair]);
});

test('SH3 a control edge is at least 3:1 on every solid surface (WCAG 1.4.11); the hairline stays decorative', () => {
  for (const [name, bg] of Object.entries(SURFACES)) {
    const r = contrastRatio(color.control, bg);
    assert.ok(r >= 3, `control ${color.control} on ${name}: ${r.toFixed(2)}:1`);
  }
  assert.ok(contrastRatio(color.hair, color.surface) < 3, 'hair is decoration, so an outlined control must use color.control');
});

test('SH4 overlay, error-class and family colours are at least 3:1 on the viewer and a dark slice', () => {
  const colours = {
    prediction: overlay.prediction, groundTruth: overlay.groundTruth, ...errorClass,
    unet: family.UNET.color, dinov2: family.DINOV2.color,
  };
  for (const [name, c] of Object.entries(colours)) {
    for (const bg of [color.viewer, '#262626', color.bg]) {
      const r = contrastRatio(c, bg);
      assert.ok(r >= 3, `${name} ${c} on ${bg}: ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual([overlay.groundTruth, overlay.prediction, family.UNET.color, family.DINOV2.color],
    ['#39c5cf', '#f0883e', '#3987e5', '#d95926'], 'the data colours of design/TOKENS.md');
  assert.notEqual(family.UNET.marker, family.DINOV2.marker, 'families differ by marker shape, not colour alone');
  assert.deepEqual(Object.keys(status).sort(), ['danger', 'info', 'ok', 'warn']);
});

test('SH12 state colours and glass: accent, warn, danger and live text pass 4.5:1 where they are drawn; t3 never goes on glass', () => {
  const pairs = [
    ['accent', color.accent, 'bg', color.bg],
    ['accent', color.accent, 'surface', color.surface],
    ['accent', color.accent, 'accentSoft on field (selected segment)', flatten(color.accentSoft, color.field)],
    ['accent', color.accent, 'glass over white', GLASS_WORST],
    ['warn', color.warn, 'warnSoft on bg (outlier tag)', flatten(color.warnSoft, color.bg)],
    ['danger', color.danger, 'bg', color.bg],
    ['danger', color.danger, 'dangerSoft on bg', flatten(color.dangerSoft, color.bg)],
    ['t1', color.t1, 'glass over white', GLASS_WORST],
    ['t2', color.t2, 'glass over white', GLASS_WORST],
    ['t2', color.t2, 'the bottom panel over white', flatten(color.glassPanel, '#ffffff')],
    ['live', color.live, 'bg', color.bg],
  ];
  for (const [fg, c, where, bg] of pairs) {
    const r = contrastRatio(c, bg);
    assert.ok(r >= 4.5, `${fg} ${c} on ${where} ${bg}: ${r.toFixed(2)}:1`);
  }
  assert.ok(contrastRatio(color.t3, GLASS_WORST) < 4.5, 't3 fails on glass, which is why glass text uses t1 or t2');
  // The solid tints are the soft tokens flattened onto bg, so the two never drift apart.
  assert.equal(color.accentBg, flatten(color.accentSoft, color.bg));
  assert.equal(color.warnBg, flatten(color.warnSoft, color.bg));
  assert.equal(color.dangerBg, flatten(color.dangerSoft, color.bg));
  assert.equal(color.okBg, flatten(color.liveRing, color.bg));
});

test('SH13 spacing sits on the 4 dp grid, radii come from the design scale, and the type scale is the one of design/TOKENS.md', () => {
  for (const [k, v] of Object.entries(space)) assert.equal(v % 4, 0, `space.${k} = ${v}`);
  assert.deepEqual(Object.values(radius), [4, 6, 8, 10, 999]);
  const scale = Object.fromEntries(Object.entries(type).map(([k, t]) => [k, `${t.fontSize}/${t.lineHeight}/${t.fontWeight}`]));
  assert.deepEqual(scale, {
    screenTitle: '18/24/600', viewerTitle: '17/22/600', metric: '32/40/500', readout: '17/20/600', title: '16/24/500',
    rowId: '15/20/500', body: '14/20/400', secondary: '13/16/400', caption: '12/16/400', overline: '11/16/600', micro: '11/14/500',
  });
  assert.equal(type.overline.textTransform, 'uppercase');
  assert.deepEqual([...type.rowId.fontVariant], ['tabular-nums'], 'ids and values line up in a column');
  assert.deepEqual([...type.metric.fontVariant], ['proportional-nums'], 'a large standalone number is proportional');
  assert.ok(Object.values(type).every((t) => !('fontFamily' in t)), 'one family: the system Roboto');
  assert.equal(font.body, type.body.fontSize);
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

test('SH6 the Details sheet: the screen id, mode, contract and build', () => {
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

test('SH8 session clock: 10 minutes without a touch covers the screen; a touch restarts the count', () => {
  let t = 0;
  const c = createSessionClock({ now: () => t });
  t = SESSION_LIMITS.idleMs - 1;
  assert.equal(c.tick().covered, false);
  c.touch();
  t += SESSION_LIMITS.idleMs - 1;
  assert.equal(c.tick().covered, false, 'the touch restarted the count');
  t += 1;
  assert.deepEqual({ ...c.tick() }, { covered: true, reason: COVER_REASON.IDLE });
  t += 10;
  c.touch();
  assert.equal(c.covered, true, 'a covered session ignores touches until uncover()');
  assert.equal(c.uncover().covered, false);
  assert.equal(c.tick().covered, false, 'uncover restarts the idle count');
});

test('SH9 session clock: 5 minutes in the background covers on return; a shorter trip does not', () => {
  let t = 0;
  const c = createSessionClock({ now: () => t });
  c.toBackground();
  t += SESSION_LIMITS.backgroundMs - 1;
  assert.equal(c.toForeground().covered, false);
  c.toBackground();
  t += 1000;
  c.toBackground(); // a second "background" event keeps the first time
  t += SESSION_LIMITS.backgroundMs - 1000;
  assert.deepEqual({ ...c.toForeground() }, { covered: true, reason: COVER_REASON.BACKGROUND });
  // While in the background the idle timer does not fire (the cover is decided on return).
  const d = createSessionClock({ now: () => t });
  d.toBackground();
  t += SESSION_LIMITS.idleMs * 2;
  assert.equal(d.tick().covered, false);
  assert.equal(d.toForeground().reason, COVER_REASON.BACKGROUND);
});

test('SH10 cover text names the reason and the limit in words', () => {
  assert.match(coverText(COVER_REASON.IDLE).body, /^Nobody touched the screen for 10 minutes\. The MRI and case data are hidden/);
  assert.match(coverText(COVER_REASON.BACKGROUND).body, /^The app was in the background for 5 minutes or more\./);
  assert.match(coverText(COVER_REASON.IDLE, { idleMs: 60000, backgroundMs: 1 }).body, /for 1 minute\./);
  assert.equal(coverText(COVER_REASON.IDLE).title, 'Screen hidden');
});

test('SH11 clear cached data empties the image store and the slice cache and counts them; fixture mode has none', async () => {
  const images = createImageStore({ fetchBytes: async () => Uint8Array.from([1, 2, 3]) });
  await images.load('/api/v1/artifacts/a.png');
  await images.load('/api/v1/artifacts/b.png');
  const base = { resolve: (id, p) => ({ url: `/x/${p.slice_index}` }), call: async () => ({ state: 'SUCCESS', data: {} }) };
  const slices = createSliceCache(base);
  await slices.call('mri_slice_get', { case_id: 'C', slice_index: 1 });
  const result = clearCachedData({ imageStore: images, maskStore: null, sliceClient: slices });
  assert.deepEqual({ images: result.images, masks: result.masks, answers: result.answers, cleared: result.cleared },
    { images: 2, masks: 0, answers: 1, cleared: true });
  assert.equal(images.stats().cached, 0);
  assert.equal(slices.size, 0);
  assert.match(result.text, /^Cleared 2 images, 0 masks and 1 cached answer from the app's memory/);
  const fixture = clearCachedData({ imageStore: null, maskStore: null, sliceClient: { call: () => {} } });
  assert.equal(fixture.cleared, false);
  assert.match(fixture.text, /^Nothing to clear/);
});
