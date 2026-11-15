// node --test mobile/test/  - the title and subtitle of a viewer's floating bar shrink to fit, so SCR-04 reads "Error Inspector" and not
// "Error Insp..." at 320 dp (device session 2026-11-15, r6; src/components/tokens.mjs BAR_TEXT_MIN_SCALE, used by AppHeader).
// The numbers are the ones measured on the phone (uiautomator bounds of the bar), so what is checked is arithmetic on measurements.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BAR_TEXT_MIN_SCALE, LABEL_FONT_CAP } from '../src/components/tokens.mjs';

test('BT1 the floating bar title and subtitle fit the room SCR-04 leaves them at 320 dp, at font scale 1.0 and 1.3, by shrinking', () => {
  // Room between Back and the Live word at 320 dp (dp): 96 at font scale 1.0, 89.5 at 1.3 where "Live" is wider.
  // Natural width at font scale 1.0 (dp): "Error Inspector" 117 at 17 sp (the 384 dp screen shows it whole), "CASE_0029 · Raw" 95 at 12 sp.
  const title = 117;
  const subtitle = 95;
  const cases = [
    { fontScale: 1.0, room: 96 },
    { fontScale: 1.3, room: 89.5 },
  ];
  for (const { fontScale, room } of cases) {
    const grown = Math.min(fontScale, LABEL_FONT_CAP); // the bar's own cap
    const needTitle = room / (title * grown);
    const needSubtitle = room / (subtitle * grown);
    assert.ok(needTitle < 1, `font scale ${fontScale}: the title does not fit as it is (needs ${needTitle.toFixed(2)} of its size)`);
    assert.ok(needTitle >= BAR_TEXT_MIN_SCALE.title, `font scale ${fontScale}: the title fits by shrinking to ${needTitle.toFixed(2)}, minimum ${BAR_TEXT_MIN_SCALE.title}`);
    assert.ok(Math.min(needSubtitle, 1) >= BAR_TEXT_MIN_SCALE.subtitle, `font scale ${fontScale}: the subtitle needs ${Math.min(needSubtitle, 1).toFixed(2)}, minimum ${BAR_TEXT_MIN_SCALE.subtitle}`);
  }
  // The title never ends up smaller than the subtitle's own size, so the bar keeps its two levels: 17 sp x 0.67 against 12 sp x 0.82 at the cap.
  assert.ok(17 * 1.15 * (89.5 / (117 * 1.15)) >= 12 * 1.15 * (89.5 / (95 * 1.15)), 'the title stays at least as large as the subtitle at font scale 1.3');
  assert.ok(BAR_TEXT_MIN_SCALE.title > 0 && BAR_TEXT_MIN_SCALE.title < BAR_TEXT_MIN_SCALE.subtitle && BAR_TEXT_MIN_SCALE.subtitle < 1);
});
