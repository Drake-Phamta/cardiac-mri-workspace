// node --test mobile/test/  - the title and subtitle of the app bar shrink to fit, so SCR-04 reads "Error Inspector" and not
// "Error Insp..." at 320 dp (device sessions 2026-11-15, r6 and r7; src/components/tokens.mjs BAR_TEXT_MIN_SCALE, fitFontSize.mjs, used by AppHeader).
// The numbers are the ones measured on the phone (uiautomator bounds of the bar, and the width of the text at its own size), so what is checked is
// the decision of fitFontSize on measurements: the sizes it picks stay inside the minimum scales of tokens.mjs and the lines fit the room.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BAR_TEXT_MIN_SCALE, LABEL_FONT_CAP } from '../src/components/tokens.mjs';
import { FIT_SLACK, fitFontSize, sizeKey } from '../src/components/fitFontSize.mjs';

// The size fitFontSize settles on when a line is `natural` dp wide at `base` sp (grown by the bar's cap) and nearly proportional to the size.
function settled(base, minScale, natural, fontScale, room) {
  const widths = {};
  for (let i = 0; i < 30; i += 1) {
    const d = fitFontSize({ base, minScale, available: room, widths });
    if (d.settled) return d;
    widths[sizeKey(d.probe)] = natural * Math.min(fontScale, LABEL_FONT_CAP) * (d.probe / base);
  }
  return assert.fail('never settled');
}

test('BT1 the app bar title and subtitle fit the room SCR-04 leaves them at 320 dp, at font scale 1.0 and 1.3, by shrinking', () => {
  // Room between Back and the Live word at 320 dp (dp): 96 at font scale 1.0, 89.5 at 1.3 where "Live" is wider.
  // Natural width at font scale 1.0 (dp): "Error Inspector" 117 at 17 sp (the 384 dp screen shows it whole), "CASE_0029 · Raw" 95 at 12 sp.
  const cases = [
    { fontScale: 1.0, room: 96 },
    { fontScale: 1.3, room: 89.5 },
  ];
  for (const { fontScale, room } of cases) {
    const grown = Math.min(fontScale, LABEL_FONT_CAP); // the bar's own cap
    assert.ok(117 * grown > room, `font scale ${fontScale}: the title does not fit as it is`);
    const title = settled(17, BAR_TEXT_MIN_SCALE.title, 117, fontScale, room);
    const subtitle = settled(12, BAR_TEXT_MIN_SCALE.subtitle, 95, fontScale, room);
    assert.ok(title.fits && title.size < 17, `font scale ${fontScale}: the title fits by shrinking to ${title.size} sp`);
    assert.ok(title.size / 17 >= BAR_TEXT_MIN_SCALE.title, `font scale ${fontScale}: the title is ${(title.size / 17).toFixed(2)} of its size, minimum ${BAR_TEXT_MIN_SCALE.title}`);
    assert.ok(subtitle.fits && subtitle.size / 12 >= BAR_TEXT_MIN_SCALE.subtitle, `font scale ${fontScale}: the subtitle is ${(subtitle.size / 12).toFixed(2)} of its size, minimum ${BAR_TEXT_MIN_SCALE.subtitle}`);
    assert.ok(117 * grown * (title.size / 17) <= room - FIT_SLACK, `font scale ${fontScale}: the title is ${(117 * grown * (title.size / 17)).toFixed(1)} dp in ${room}`);
    // The title never ends up smaller than the subtitle, so the bar keeps its two levels.
    assert.ok(title.size >= subtitle.size, `font scale ${fontScale}: the title (${title.size} sp) stays at least as large as the subtitle (${subtitle.size} sp)`);
  }
  assert.ok(BAR_TEXT_MIN_SCALE.title > 0 && BAR_TEXT_MIN_SCALE.title < BAR_TEXT_MIN_SCALE.subtitle && BAR_TEXT_MIN_SCALE.subtitle < 1);
});
