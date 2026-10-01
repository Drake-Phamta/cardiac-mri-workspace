// node --test mobile/test/  - SCR-04 Error Inspector logic (src/verticals/v1/errorInspector.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readSelection } from '../../app/core/index.mjs';
import { disagreementRuns } from '../src/imaging/maskPaths.mjs';
import {
  CLASS_ORDER, ERROR_CLASS, compareWithServer, fmt, profileFromSelection, profileIndexAt, readRunMetrics,
  topEntries, worstLabel,
} from '../src/verticals/v1/errorInspector.mjs';
import { MOBILE_ROOT } from './_helpers.mjs';

// The block exactly as contract v1.0 shapes it (selection_rules.worst_slice_selection),
// already ranked by the SERVER - deliberately not in slice order.
const block = {
  worst_slice_selection: {
    rule_id: 'DR-010',
    selection_version: 'dr010-worst-slice/v1',
    slices: [
      { slice_index: 44, dice: 0.25, false_positives: 30, false_negatives: 10 },
      { slice_index: 12, dice: 0.25, false_positives: 5, false_negatives: 5 },
      { slice_index: 60, dice: 0.5, false_positives: 1, false_negatives: 2 },
    ],
  },
  metric_version: 'm1',
};

test('V4a the worst slice is the SERVER\'s first entry, read through app/core - never re-ranked', () => {
  const sel = readSelection(block);
  assert.equal(sel.available, true);
  assert.deepEqual(topEntries(sel, 2).map((e) => e.sliceIndex), [44, 12], 'server order kept');
  assert.equal(topEntries(sel, 10).length, 3);
  assert.match(worstLabel(topEntries(sel, 1)[0]), /^z 44 \(slice 45\) · Dice 0\.250 · FP 30 · FN 10$/);
  assert.deepEqual(topEntries(readSelection({}), 5), [], 'no block -> nothing to jump to');
});

test('V4b the profile places entries by slice index; ineligible slices are absent, not zero', () => {
  const p = profileFromSelection(readSelection(block), 88);
  assert.equal(p.cells.length, 88);
  assert.equal(p.cells[44].errorPixels, 40);
  assert.equal(p.cells[44].rank, 0);
  assert.equal(p.cells[12].errorPixels, 10);
  assert.equal(p.cells[0], null, 'a slice the server did not list is not drawn as 0');
  assert.equal(p.cells.filter(Boolean).length, 3);
  assert.equal(p.maxError, 40);
  assert.deepEqual([...p.problems], []);
});

test('V4c selection entries outside the volume or repeated are reported, never silently used', () => {
  const bad = readSelection({ worst_slice_selection: { slices: [
    { slice_index: 90, dice: 0.1, false_positives: 1, false_negatives: 1 },
    { slice_index: 3, dice: 0.2, false_positives: 1, false_negatives: 1 },
    { slice_index: 3, dice: 0.3, false_positives: 1, false_negatives: 1 },
  ] } });
  const p = profileFromSelection(bad, 88);
  assert.equal(p.problems.length, 2);
  assert.match(p.problems[0], /outside/);
  assert.match(p.problems[1], /twice/);
});

test('V4d run metrics: missing values stay "not stated", never 0', () => {
  const m = readRunMetrics({ metric_values: { dice: 0.5, iou: 0.25, false_positives: 100 }, metric_version: 'm1', prediction_variant: 'RAW' });
  assert.equal(m.dice, 0.5);
  assert.equal(m.falseNegatives, null);
  assert.equal(fmt(m.falseNegatives), 'not stated');
  assert.equal(fmt(0.5), '0.500');
  assert.equal(fmt(100), '100');
  assert.equal(readRunMetrics(null).dice, null);
});

test('V4e masks on screen are compared with the server for the same slice', () => {
  const p = profileFromSelection(readSelection(block), 88);
  assert.deepEqual({ ...compareWithServer(p.cells[44], { tp: 400, fp: 30, fn: 10 }) }, {
    checked: true, consistent: true, text: 'Matches the server for this slice (FP 30, FN 10).',
  });
  const off = compareWithServer(p.cells[44], { tp: 400, fp: 29, fn: 10 });
  assert.equal(off.consistent, false);
  assert.match(off.text, /FP server 30 vs masks 29/);
  assert.equal(compareWithServer(null, { fp: 1, fn: 1 }).checked, false, 'no server entry -> no claim either way');
});

test('V4f TC-ERR-001: on a known mask pair the classes are the boolean operations', () => {
  const W = 4; const H = 2;
  const gt = { width: W, height: H, data: Uint8Array.from([1, 1, 0, 0, 1, 1, 0, 0]) };
  const pred = { width: W, height: H, data: Uint8Array.from([0, 1, 1, 0, 0, 1, 1, 0]) };
  const d = disagreementRuns(gt, pred);
  assert.deepEqual({ ...d.counts }, { tp: 2, fp: 2, fn: 2 });
  assert.deepEqual([...d.tp], [0, 1, 1, 1, 1, 1]);
  assert.deepEqual([...d.fp], [0, 2, 1, 1, 2, 1]);
  assert.deepEqual([...d.fn], [0, 0, 1, 1, 0, 1]);
});

test('V4g the legend names every class in words, not colour alone (`10` §7, §9)', () => {
  assert.deepEqual([...CLASS_ORDER], ['TP', 'FP', 'FN']);
  for (const k of CLASS_ORDER) {
    assert.ok(ERROR_CLASS[k].label.startsWith(`${k} - `));
    assert.ok(ERROR_CLASS[k].detail.length > 10);
  }
  assert.equal(new Set(CLASS_ORDER.map((k) => ERROR_CLASS[k].color)).size, 3);
});

test('V4h the profile chart maps a touch to a slice deterministically, ends included', () => {
  assert.equal(profileIndexAt(0, 300, 88), 0);
  assert.equal(profileIndexAt(299.9, 300, 88), 87);
  assert.equal(profileIndexAt(500, 300, 88), 87);
  assert.equal(profileIndexAt(10, 0, 88), null);
});

test('V4x DR-010: no ordering of slices anywhere in the SCR-04 logic or screen', () => {
  for (const f of ['src/verticals/v1/errorInspector.mjs', 'src/verticals/v1/ErrorInspectorScreen.js']) {
    const code = readFileSync(join(MOBILE_ROOT, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\.sort\(|\.toSorted\(/, `${f} must not rank slices`);
  }
});
