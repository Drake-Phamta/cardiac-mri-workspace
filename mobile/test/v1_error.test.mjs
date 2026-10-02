// node --test mobile/test/  - SCR-04 Error Inspector logic (src/verticals/v1/errorInspector.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loading, readSelection, STATE, success } from '../../app/core/index.mjs';
import { variantMismatch } from '../../app/verticals/v1_case_explorer/index.mjs';
import { disagreementRuns } from '../src/imaging/maskPaths.mjs';
import {
  CLASS_ORDER, ERROR_CLASS, SELECTION_GATE, compareWithServer, fmt, inVolume, outsideVolumeNote, pinnedSelection,
  profileFromSelection, profileIndexAt, profileNote, readRunMetrics, readWorstSlices, runLevel, runMetricsView,
  selectionNote, topEntries, worstLabel,
} from '../src/verticals/v1/errorInspector.mjs';
import { loadContract, MOBILE_ROOT } from './_helpers.mjs';

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

test('V4c2 #78 QA N-7: a worst entry outside the volume is listed as such and never opened - no clamping', () => {
  const at = (z) => ({ sliceIndex: z, dice: 0.1, falsePositives: 1, falseNegatives: 1 });
  assert.equal(inVolume(at(0), 88), true);
  assert.equal(inVolume(at(87), 88), true);
  for (const z of [88, 90, -1, 4.5, null, '44']) {
    assert.equal(inVolume(at(z), 88), false, `z ${JSON.stringify(z)} of 88 slices`);
  }
  assert.equal(inVolume(at(44), null), false, 'a case that states no slice count opens nothing');
  assert.equal(inVolume(null, 88), false);
  assert.equal(outsideVolumeNote(at(44), 88), null, 'an entry inside the volume opens: no note');
  assert.equal(outsideVolumeNote(at(90), 88), 'outside this volume (z 0..87) - not opened');
  assert.equal(outsideVolumeNote(at(44), null), 'the case states no slice count - not opened');
  // The row still says which slice the server named - z 90, not the z 87 a clamp would open.
  assert.match(worstLabel(at(90)), /^z 90 \(slice 91\) /);
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

// ----- #78 QA: the two run-level gates (B-2, B-3) and the served order (N-1) ------------

const ws = block.worst_slice_selection;
// An analysis_run_metrics body: the block above plus the case-level fields.
const body = (over = {}) => ({
  reference_mask_id: 'REF_1', prediction_mask_id: 'PRED_1', prediction_variant: 'RAW', aggregation_level: 'CASE_3D',
  metric_state: 'COMPUTED', metric_version: 'm1',
  metric_values: { dice: 0.5, iou: 0.25, false_positives: 100, false_negatives: 200, relative_volume_error: -10 },
  worst_slice_selection: ws,
  ...over,
});
const contract = loadContract();
const PINNED = pinnedSelection(contract);
const level = (data, variant = 'RAW') => runLevel(success(data), { variant, pinned: PINNED, total: 88 });
const onScreen = (lv) => ({
  worst: lv.worst.map((e) => e.sliceIndex),
  bars: lv.profile.cells.filter(Boolean).length,
  compared: compareWithServer(lv.profile.cells[44], { tp: 400, fp: 30, fn: 10 }).checked,
});

test('V4i N-1: a block served in an order DR-010 would never produce keeps that order - list, jump target, profile', () => {
  // DR-010 would rank z 44 and z 12 (Dice 0.25) before z 60 (Dice 0.5). The server put z 60 first.
  const unranked = body({ worst_slice_selection: { ...ws, slices: [ws.slices[2], ws.slices[0], ws.slices[1]] } });
  const lv = level(unranked);
  assert.deepEqual(lv.worst.map((e) => e.sliceIndex), [60, 44, 12], 'served order, not DR-010 order');
  assert.match(worstLabel(lv.worst[0]), /^z 60 \(slice 61\) · Dice 0\.500 · FP 1 · FN 2$/, 'the jump target is the served first entry');
  assert.equal(lv.profile.cells[60].rank, 0, 'the profile marks the served first entry');
  assert.deepEqual(topEntries(readSelection(unranked), 2).map((e) => e.sliceIndex), [60, 44]);
});

test('V4j B-2: the pinned rule and selection version are read from the loaded contract, not written in the code', () => {
  const pin = contract.raw.selection_rules.worst_slice_selection;
  assert.deepEqual({ ...PINNED }, { ruleId: pin.rule_id, selectionVersion: pin.selection_version });
  assert.deepEqual({ ...PINNED }, { ruleId: 'DR-010', selectionVersion: 'dr010-worst-slice/v1' }, 'contract 1.1.0');
  // A contract pinning v2 would let v2 through and stop v1.
  const v2pin = pinnedSelection({ raw: { selection_rules: { worst_slice_selection: { rule_id: 'DR-010', selection_version: 'dr010-worst-slice/v2' } } } });
  assert.equal(readWorstSlices({ worst_slice_selection: { ...ws, selection_version: 'dr010-worst-slice/v2' } }, v2pin).available, true);
  assert.equal(readWorstSlices(block, v2pin).reason, SELECTION_GATE.VERSION_UNSUPPORTED);
  // A contract that pins nothing lets nothing through.
  assert.equal(readWorstSlices(block, pinnedSelection({ raw: {} })).reason, SELECTION_GATE.RULE_UNSUPPORTED);
  assert.equal(readWorstSlices(block, undefined).available, false, 'no pin passed -> closed, not open');
});

test('V4k B-2: the pinned block (DR-010, dr010-worst-slice/v1) is accepted, in the served order', () => {
  const lv = level(body());
  assert.equal(lv.view.state, STATE.SUCCESS);
  assert.equal(lv.selection.available, true);
  assert.deepEqual(onScreen(lv), { worst: [44, 12, 60], bars: 3, compared: true });
  assert.equal(lv.metrics.dice, 0.5);
  assert.equal(selectionNote(lv.selection), null);
  assert.equal(profileNote(lv), null);
});

test('V4l B-2: selection_version v2 -> SELECTION_VERSION_UNSUPPORTED, the served version named; nothing listed, profiled or compared', () => {
  const lv = level(body({ worst_slice_selection: { ...ws, selection_version: 'dr010-worst-slice/v2' } }));
  assert.equal(lv.selection.available, false);
  assert.equal(lv.selection.reason, 'SELECTION_VERSION_UNSUPPORTED');
  assert.deepEqual(onScreen(lv), { worst: [], bars: 0, compared: false });
  assert.equal(selectionNote(lv.selection).text, 'SELECTION_VERSION_UNSUPPORTED: the server sent selection_version '
    + '"dr010-worst-slice/v2"; this build shows only "dr010-worst-slice/v1". Its worst slices are not listed, and none are ranked here instead.');
  assert.match(profileNote(lv), /not one this build shows/);
  assert.equal(lv.metrics.dice, 0.5, 'the case metrics are not the selection: still shown');
  // An empty v2 block is not DR-010's "no eligible slice" either.
  assert.equal(level(body({ worst_slice_selection: { ...ws, selection_version: 'dr010-worst-slice/v2', slices: [] } })).selection.reason,
    'SELECTION_VERSION_UNSUPPORTED');
});

test('V4m B-2: a missing selection_version is unsupported - never read as v1', () => {
  const { selection_version: _v, ...noVersion } = ws;
  const lv = level(body({ worst_slice_selection: noVersion }));
  assert.equal(lv.selection.reason, 'SELECTION_VERSION_UNSUPPORTED');
  assert.deepEqual(onScreen(lv), { worst: [], bars: 0, compared: false });
  assert.match(selectionNote(lv.selection).text, /^SELECTION_VERSION_UNSUPPORTED: the server sent no selection_version; this build shows only "dr010-worst-slice\/v1"\./);
});

test('V4n B-2: another rule_id, or none, is SELECTION_RULE_UNSUPPORTED - app/core\'s DR-010 default is not trusted', () => {
  const other = level(body({ worst_slice_selection: { ...ws, rule_id: 'DR-999' } }));
  assert.equal(other.selection.reason, 'SELECTION_RULE_UNSUPPORTED');
  assert.deepEqual(onScreen(other), { worst: [], bars: 0, compared: false });
  assert.match(selectionNote(other.selection).text, /^SELECTION_RULE_UNSUPPORTED: the server sent rule_id "DR-999"; this build shows only "DR-010"\./);
  const { rule_id: _r, ...noRule } = ws;
  assert.equal(readSelection({ worst_slice_selection: noRule }).ruleId, 'DR-010', 'app/core fills a missing rule_id in...');
  const unstated = level(body({ worst_slice_selection: noRule }));
  assert.equal(unstated.selection.reason, 'SELECTION_RULE_UNSUPPORTED', '...the gate does not');
  assert.match(selectionNote(unstated.selection).text, /the server sent no rule_id/);
});

test('V4o B-3: run metrics for another variant are the V1 model\'s variant mismatch - no case metric, worst slice, profile or comparison', () => {
  const lv = level(body({ prediction_variant: 'RAW' }), 'PROCESSED');
  assert.equal(lv.view.state, STATE.FATAL_INVALID);
  assert.equal(lv.view.error.code, 'PREDICTION_VARIANT_MISMATCH');
  assert.equal(lv.view.error.safeMessage, 'Asked for PROCESSED, served RAW; a substituted variant is not shown.');
  assert.deepEqual(lv.view, variantMismatch('PROCESSED', 'RAW'), 'the same state the V1 model gives a substituted slice');
  assert.equal(lv.metrics, null, 'no case metrics');
  assert.equal(lv.selection.available, false);
  assert.deepEqual(onScreen(lv), { worst: [], bars: 0, compared: false });
  assert.match(profileNote(lv), /without the run metrics/);
  // A variant the server does not state is not filled in from the request.
  assert.equal(runMetricsView(success(body({ prediction_variant: null })), 'RAW').error.safeMessage,
    'Asked for RAW; the server did not state which variant it served, so it is not shown.');
  // The variant asked for passes through untouched; so does any state but SUCCESS.
  const same = success(body());
  assert.equal(runMetricsView(same, 'RAW'), same);
  const wait = loading();
  assert.equal(runMetricsView(wait, 'PROCESSED'), wait);
  assert.equal(runLevel(wait, { variant: 'RAW', pinned: PINNED, total: 88 }).metrics, null);
});

test('V4p #78 QA N-10: only worst_slice_selection is read; a block with no list of slices is SELECTION_MALFORMED, not "no eligible slice"', () => {
  // The pre-1.0 alias is not a selection, even one that would pass the gate.
  const alias = level(body({ worst_slice_selection: undefined, slice_selection: ws }));
  assert.equal(alias.selection.available, false);
  assert.equal(alias.selection.reason, 'SELECTION_NOT_RETURNED');
  assert.deepEqual(onScreen(alias), { worst: [], bars: 0, compared: false });
  assert.equal(selectionNote(alias.selection).text, 'The server did not return a worst-slice selection for this run.');
  // A pinned block whose slices is not a list cannot be read - and says so.
  for (const slices of [undefined, null, 'z44']) {
    const lv = level(body({ worst_slice_selection: { ...ws, slices } }));
    assert.equal(lv.selection.reason, 'SELECTION_MALFORMED', `slices ${JSON.stringify(slices)}`);
    assert.deepEqual(onScreen(lv), { worst: [], bars: 0, compared: false });
    const note = selectionNote(lv.selection);
    assert.equal(note.tone, 'warn');
    assert.match(note.text, /^SELECTION_MALFORMED: .*cannot be read\. .*none are ranked here instead\.$/);
    assert.doesNotMatch(note.text, /non-empty ground truth/, 'not the "no eligible slice" wording');
    assert.equal(profileNote(lv), 'No profile: the server\'s worst-slice selection cannot be read (see above).');
  }
  // The rule and version gate still comes first.
  assert.equal(level(body({ worst_slice_selection: { ...ws, selection_version: 'dr010-worst-slice/v2', slices: 'z44' } })).selection.reason,
    'SELECTION_VERSION_UNSUPPORTED');
  // An empty list is still DR-010's "no eligible slice".
  const empty = level(body({ worst_slice_selection: { ...ws, slices: [] } }));
  assert.equal(empty.selection.reason, 'SELECTION_NO_ELIGIBLE_SLICES');
  assert.equal(profileNote(empty), 'No profile: no slice has non-empty ground truth.');
});

test('V4x DR-010: no ordering of slices anywhere in the SCR-04 logic or screen', () => {
  for (const f of ['src/verticals/v1/errorInspector.mjs', 'src/verticals/v1/ErrorInspectorScreen.js']) {
    const code = readFileSync(join(MOBILE_ROOT, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\.sort\(|\.toSorted\(/, `${f} must not rank slices`);
  }
});
