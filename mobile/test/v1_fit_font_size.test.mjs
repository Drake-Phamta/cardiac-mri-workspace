// node --test mobile/test/  - the pure part of the floating bar's fit: from the widths measured so far, which size to measure next and which
// size to draw (src/components/fitFontSize.mjs, used by FitText.js and AppHeader). The widths here are the ones measured on the phone
// (device sessions 2026-11-15, r6 and r7: "Error Inspector" 117 dp at 17 sp, room 96 dp at 320 dp and 89 dp at font scale 1.3), or
// proportional to the size, as the text engine lays a line out.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BAR_TEXT_MIN_SCALE, LABEL_FONT_CAP } from '../src/components/tokens.mjs';
import { FIT_PROBE_WIDTH, FIT_SLACK, FIT_STEP, fitFontSize, lineWidth, sizeKey } from '../src/components/fitFontSize.mjs';

// Plays the measuring: asks fitFontSize what to measure, answers with widthAt(size), until it settles. Returns the sizes measured and the answer.
function run({ base, minScale, available, widthAt, preset = {} }) {
  const widths = { ...preset };
  const measured = [];
  for (let i = 0; i < 100; i += 1) {
    const d = fitFontSize({ base, minScale, available, widths });
    if (d.settled || d.probe === null) return { measured, answer: d };
    assert.ok(!(sizeKey(d.probe) in widths), `size ${d.probe} asked for twice`);
    widths[sizeKey(d.probe)] = widthAt(d.probe);
    measured.push(d.probe);
  }
  assert.fail('never settled');
  return null;
}
const proportional = (naturalAtBase, base, fontScale = 1) => (size) => naturalAtBase * (size / base) * Math.min(fontScale, LABEL_FONT_CAP);

test('FF1 sizeKey names a size with two decimals, so equal sizes are one key', () => {
  assert.equal(sizeKey(13.5), '13.50');
  assert.equal(sizeKey(13.500000001), '13.50');
  assert.equal(sizeKey(17 * 0.6), '10.20');
  assert.notEqual(sizeKey(13.5), sizeKey(13));
});

test('FF2 lineWidth reads the width of the one line; more lines mean the box was too narrow; nothing readable is null', () => {
  assert.equal(lineWidth([{ text: 'Error Inspector', width: 117.25 }]), 117.25);
  assert.ok(lineWidth([{ text: 'a', width: 600 }, { text: 'b', width: 500 }]) >= FIT_PROBE_WIDTH);
  for (const bad of [null, undefined, [], 'x', [{}], [{ width: NaN }], [{ width: -1 }], [{ width: '117' }], [null]]) assert.equal(lineWidth(bad), null, JSON.stringify(bad));
});

test('FF3 nothing is decided before the base size is measured; the copy is asked for at the base size, even before the room is known', () => {
  assert.deepEqual(fitFontSize({ base: 17, minScale: 0.6, available: 96, widths: {} }), { settled: false, size: null, fits: null, probe: 17 });
  assert.deepEqual(fitFontSize({ base: 17, minScale: 0.6, available: null, widths: {} }), { settled: false, size: null, fits: null, probe: 17 });
  // measured, but the room is not known yet: nothing more to measure, nothing to draw
  assert.deepEqual(fitFontSize({ base: 17, minScale: 0.6, available: null, widths: { '17.00': 117 } }), { settled: false, size: null, fits: null, probe: null });
  for (const room of [undefined, NaN, 0, -5, Infinity, '96']) {
    assert.equal(fitFontSize({ base: 17, minScale: 0.6, available: room, widths: { '17.00': 117 } }).settled, false, `room ${String(room)} is not a room`);
  }
  // a width that is not a number is not a measurement
  assert.equal(fitFontSize({ base: 17, minScale: 0.6, available: 96, widths: { '17.00': NaN } }).probe, 17);
  assert.equal(fitFontSize({ base: 17, minScale: 0.6, available: 96 }).probe, 17);
});

test('FF4 a line that fits at its own size is settled at that size with one measurement', () => {
  const { measured, answer } = run({ base: 17, minScale: 0.6, available: 200, widthAt: proportional(117, 17) });
  assert.deepEqual(measured, [17]);
  assert.deepEqual(answer, { settled: true, size: 17, fits: true, probe: null });
  // a line exactly as wide as the room less the slack still fits; a hair wider does not
  assert.equal(fitFontSize({ base: 12, minScale: 0.75, available: 96, widths: { '12.00': 96 - FIT_SLACK } }).size, 12);
  assert.ok(fitFontSize({ base: 12, minScale: 0.75, available: 96, widths: { '12.00': 96 - FIT_SLACK + 0.01 } }).probe < 12);
});

test('FF5 SCR-04 at 320 dp with the numbers of the phone: 96 dp at font scale 1.0, 89 dp at 1.3, "Error Inspector" 117 dp at 17 sp', () => {
  const at10 = run({ base: 17, minScale: BAR_TEXT_MIN_SCALE.title, available: 96, widthAt: proportional(117, 17, 1.0) });
  assert.deepEqual(at10.measured, [17, 13.5], 'measured at 17 sp, then at the size the ratio gives, and it fits');
  assert.deepEqual(at10.answer, { settled: true, size: 13.5, fits: true, probe: null });
  const at13 = run({ base: 17, minScale: BAR_TEXT_MIN_SCALE.title, available: 89, widthAt: proportional(117, 17, 1.3) });
  assert.deepEqual(at13.measured, [17, 11]);
  assert.deepEqual(at13.answer, { settled: true, size: 11, fits: true, probe: null });
  // the subtitle "CASE_0029 · Raw" (95 dp at 12 sp) with no run picker
  const sub10 = run({ base: 12, minScale: BAR_TEXT_MIN_SCALE.subtitle, available: 96, widthAt: proportional(95, 12, 1.0) });
  assert.equal(sub10.answer.size, 12, 'it fits at 12 sp in 96 dp');
  const sub13 = run({ base: 12, minScale: BAR_TEXT_MIN_SCALE.subtitle, available: 89, widthAt: proportional(95, 12, 1.3) });
  assert.deepEqual(sub13.answer, { settled: true, size: 9.5, fits: true, probe: null });
  for (const { answer } of [at10, at13, sub10, sub13]) assert.ok(answer.fits);
  assert.ok(13.5 / 17 >= BAR_TEXT_MIN_SCALE.title && 11 / 17 >= BAR_TEXT_MIN_SCALE.title && 9.5 / 12 >= BAR_TEXT_MIN_SCALE.subtitle);
  // the title keeps its place above the subtitle in size at both font scales
  assert.ok(at10.answer.size > sub10.answer.size && at13.answer.size > sub13.answer.size);
});

test('FF6 a size is the largest step that fits: one step more would not, and the answer never goes below the minimum', () => {
  for (const [base, minScale, natural] of [[17, BAR_TEXT_MIN_SCALE.title, 117], [12, BAR_TEXT_MIN_SCALE.subtitle, 95], [17, 0.6, 134.55], [12, 0.75, 80]]) {
    const widthAt = proportional(natural, base);
    for (let room = 30; room <= 220; room += 1.5) {
      const { answer } = run({ base, minScale, available: room, widthAt });
      const min = base * minScale;
      assert.ok(answer.settled && answer.size >= min - 1e-9 && answer.size <= base, `room ${room}: ${answer.size}`);
      if (answer.fits) {
        assert.ok(widthAt(answer.size) <= room - FIT_SLACK + 1e-9, `room ${room}: ${answer.size} sp is ${widthAt(answer.size)} dp wide`);
        if (answer.size < base) assert.ok(widthAt(answer.size + FIT_STEP) > room - FIT_SLACK, `room ${room}: ${answer.size + FIT_STEP} sp would fit as well`);
      } else {
        assert.ok(Math.abs(answer.size - min) < 1e-9 && widthAt(min) > room - FIT_SLACK, `room ${room}: cut at the minimum`);
      }
    }
  }
});

test('FF7 a line that cannot fit ends at the minimum with fits false (it is then cut with an ellipsis), and a width that does not shrink still terminates', () => {
  const small = run({ base: 17, minScale: 0.6, available: 40, widthAt: proportional(117, 17) });
  assert.deepEqual(small.answer, { settled: true, size: 17 * 0.6, fits: false, probe: null });
  // a text engine that rounds the size up to whole pixels and so does not shrink the line on every step
  const stubborn = run({ base: 17, minScale: 0.6, available: 60, widthAt: () => 117 });
  assert.equal(stubborn.answer.fits, false);
  assert.ok(Math.abs(stubborn.answer.size - 10.2) < 1e-9);
  assert.ok(stubborn.measured.length <= 15, `${stubborn.measured.length} measurements`);
  for (let i = 1; i < stubborn.measured.length; i += 1) assert.ok(stubborn.measured[i] <= stubborn.measured[i - 1] - FIT_STEP + 1e-9 || stubborn.measured[i] === 17 * 0.6, 'each size is smaller than the one before');
  // a line with a part that does not shrink with the size (letter spacing, rounding to whole pixels) is wider than the ratio says: the measurement of
  // the guess shows it, and the next size down is measured until one fits
  const wide = run({ base: 17, minScale: 0.6, available: 96, widthAt: (size) => proportional(117, 17)(size) + 12 });
  assert.equal(wide.answer.fits, true);
  assert.ok(wide.measured.length >= 3 && wide.answer.size < 13.5, `${wide.measured.join(', ')} -> ${wide.answer.size}`);
  assert.ok(wide.measured.every((m, i) => i === 0 || m < wide.measured[i - 1]), 'each size is smaller than the one before');
});

test('FF8 the same widths always give the same answer, and an answer already settled does not change when it is asked again or the room moves by a hair', () => {
  const widths = { '17.00': 117, '13.50': 92.9 };
  const a = fitFontSize({ base: 17, minScale: 0.6, available: 96, widths });
  assert.deepEqual(a, fitFontSize({ base: 17, minScale: 0.6, available: 96, widths }));
  assert.deepEqual(a, fitFontSize({ base: 17, minScale: 0.6, available: 96.2, widths }));
  assert.equal(a.size, 13.5);
  // a wider room is decided from the widths already known, without measuring anything again
  const wider = fitFontSize({ base: 17, minScale: 0.6, available: 150, widths });
  assert.deepEqual(wider, { settled: true, size: 17, fits: true, probe: null });
  // a narrower room continues from them: 13.5 sp does not fit 80 dp, the next size is asked for
  const narrower = fitFontSize({ base: 17, minScale: 0.6, available: 80, widths });
  assert.equal(narrower.settled, false);
  assert.ok(narrower.probe < 13.5 && !(sizeKey(narrower.probe) in widths));
});
