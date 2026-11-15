// node --test mobile/test/  - SCR-02's filter tabs have a 16 dp gap on a screen narrower than 360 dp, so at rest the third tab ends inside the
// screen with a margin and not at its edge (device session 2026-11-15, r6; src/screens/v1-cases/cases.mjs tabGap).
// The numbers are the ones measured on the phone (the tab row's scroll distance), so what is checked is arithmetic on a measurement.
import test from 'node:test';
import assert from 'node:assert/strict';

import { TAB_GAP, TAB_NARROW_BELOW, tabGap } from '../src/screens/v1-cases/cases.mjs';

test('BT2 the filter tab gap is 16 dp below 360 dp and 24 dp from there on, and a width that is not known gives the wide gap', () => {
  assert.deepEqual({ ...TAB_GAP }, { wide: 24, narrow: 16 });
  assert.equal(TAB_NARROW_BELOW, 360);
  assert.equal(tabGap(320), 16);
  assert.equal(tabGap(359.9), 16);
  assert.equal(tabGap(360), 24);
  assert.equal(tabGap(384), 24);
  assert.equal(tabGap(480), 24);
  for (const unknown of [null, undefined, 0, -1, NaN, '320']) assert.equal(tabGap(unknown), 24, `${String(unknown)}: before the row has a width`);
});

test('BT3 at 320 dp and font scale 1.0 the three tabs fit with a margin at rest, which a 24 dp gap did not give', () => {
  // On the phone the row scrolled 63 px at 320 dp (3.375 px per dp) with the 24 dp gap and 16 dp at each end of the content.
  const screen = 320;
  const margin = 16;
  const scrolled = 63 / 3.375;
  const tabs = screen + scrolled - 2 * margin - 2 * TAB_GAP.wide; // the three tabs themselves
  const lastEnds = (gap) => margin + tabs + 2 * gap; // where the third tab ends at rest, from the left edge
  assert.ok(lastEnds(TAB_GAP.wide) > screen, `with the 24 dp gap the last tab ends at ${lastEnds(TAB_GAP.wide).toFixed(1)}, past the edge (${screen}): its last digit touched it`);
  assert.ok(screen - lastEnds(tabGap(screen)) >= 12, `with the narrow gap it ends at ${lastEnds(tabGap(screen)).toFixed(1)}, ${(screen - lastEnds(tabGap(screen))).toFixed(1)} dp from the edge`);
  // and from 360 dp the wide gap still fits at font scale 1.0, so the mockup's gap is kept where it fits
  assert.ok(screen < TAB_NARROW_BELOW && lastEnds(TAB_GAP.wide) + margin <= TAB_NARROW_BELOW, 'at 360 dp the three tabs fit with the wide gap and the margin at both ends');
});
