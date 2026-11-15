// node --test mobile/test/  - how V4 writes things for people (src/screens/v4-review/format.mjs) and the lines a finding
// shows in its row and in the Details sheet (findings.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { detailLines, evidenceLine, whereLine } from '../src/screens/v4-review/findings.mjs';
import { formatSlice, sliceDetail } from '../src/lib/sliceNumber.mjs';
import { statusHint } from '../src/screens/v4-review/review.mjs';
import { experimentLabel, placeLine, sliceNumber, statusWord, variantWord } from '../src/screens/v4-review/format.mjs';

test('RV1 slices are counted from 1 for people: z = 44 is slice 45, and the shared formatter reads 45 / 88', () => {
  assert.equal(sliceNumber(44), 45);
  assert.equal(sliceNumber(null), null);
  assert.equal(formatSlice(44, 88), '45 / 88');
  assert.equal(sliceDetail(44, 88), 'Slice 45 / 88 · z 44');
  assert.equal(statusWord('NOT_REVIEWED'), 'Not reviewed');
  assert.equal(statusWord('CORRECTED'), 'Corrected');
  assert.equal(statusWord('SOMETHING_NEW'), 'SOMETHING_NEW', 'an unknown status is shown as it is');
});

test('RV2 a finding reads "CASE · Slice n · experiment label · prediction" in its row; every id is in the Details lines, the PDF keeps its evidence column', () => {
  const f = {
    findingId: 'FINDING_7', studyId: 'STUDY_LA_001', experimentId: 'EXP-D-100', runId: 'RUN_EXP-D-100_CASE_0029', variant: 'RAW',
    caseId: 'CASE_0029', sliceIndex: 44, region: { kind: 'POINT', x: 310, y: 262 }, revision: 3,
  };
  assert.equal(whereLine(f), 'CASE_0029 · Slice 45 · DINOv2 100 % · Raw');
  assert.equal(whereLine({ caseId: 'CASE_0029', sliceIndex: null }), 'CASE_0029');
  assert.equal(whereLine({ caseId: null, sliceIndex: null }), 'No case recorded');
  // the slice is counted from 1 everywhere; the index (z) is nowhere, not even in the Details lines
  assert.deepEqual([...detailLines(f)], [
    'Finding FINDING_7', 'Case CASE_0029', 'Slice 45', 'Run RUN_EXP-D-100_CASE_0029', 'Prediction RAW', 'Experiment EXP-D-100',
    'Region: point at x 310, y 262', 'Study STUDY_LA_001', 'Revision 3',
  ]);
  // the PDF keeps its ids in the evidence column, and no z
  assert.equal(evidenceLine(f), 'CASE_0029 · slice 45 · run RUN_EXP-D-100_CASE_0029 · RAW · exp EXP-D-100 · point (310, 262)');
  for (const text of [whereLine(f), ...detailLines(f), evidenceLine(f)]) assert.doesNotMatch(text, /\bz\b/, text);
  assert.ok(!whereLine(f).includes('RUN_') && !whereLine(f).includes('EXP-') && !whereLine(f).includes('FINDING_'),
    'no run, no experiment and no finding id in the row');
});

test('RV3 an experiment is named by its label; the id never stands in for it on a main surface', () => {
  assert.equal(experimentLabel('EXP-D-100'), 'DINOv2 100 %');
  assert.equal(experimentLabel('EXP-U-025'), 'UNet 25 %');
  assert.equal(experimentLabel('EXP-D-PP'), 'DINOv2 100 % post-processed');
  // V4 keeps its own table (a screen folder never imports another one), so the test lists the study's seven experiments
  // (spec 08 section 2) with the words a person reads for each, and no label holds an id
  const labels = {
    'EXP-U-025': 'UNet 25 %', 'EXP-U-050': 'UNet 50 %', 'EXP-U-100': 'UNet 100 %',
    'EXP-D-025': 'DINOv2 25 %', 'EXP-D-050': 'DINOv2 50 %', 'EXP-D-100': 'DINOv2 100 %',
    'EXP-D-PP': 'DINOv2 100 % post-processed',
  };
  assert.equal(Object.keys(labels).length, 7);
  for (const [id, label] of Object.entries(labels)) {
    assert.equal(experimentLabel(id), label, id);
    assert.match(label, /^(UNet|DINOv2) \d+ %( post-processed)?$/, id);
    assert.equal(placeLine({ caseId: 'CASE_0029', experimentId: id }), `CASE_0029 · ${label}`, `${id} in a place line`);
  }
  // an id outside the matrix has no label (and so none is shown), a missing one neither
  assert.equal(experimentLabel('EXP_DEMO'), null);
  assert.equal(experimentLabel(null), null);
  assert.equal(variantWord('RAW'), 'Raw');
  assert.equal(variantWord('PROCESSED'), 'Processed');
  assert.equal(variantWord('constructor'), null);
  assert.equal(variantWord(null), null);
});

test('RV4 the line that says where, for a new finding: case, slice, experiment label, prediction', () => {
  const where = { caseId: 'CASE_0029', sliceIndex: 44, experimentId: 'EXP-D-100', variant: 'RAW' };
  assert.equal(placeLine(where), 'CASE_0029 · Slice 45 · DINOv2 100 % · Raw');
  assert.equal(placeLine({ ...where, variant: null }), 'CASE_0029 · Slice 45 · DINOv2 100 %', 'the prediction is asked for first');
  assert.equal(placeLine({ ...where, experimentId: null }), 'CASE_0029 · Slice 45 · Raw');
  assert.equal(placeLine({ ...where, experimentId: 'EXP_DEMO' }), 'CASE_0029 · Slice 45 · Raw', 'an id with no label is left out');
  // "post-processed" already says Processed, so the prediction is not repeated
  assert.equal(placeLine({ ...where, experimentId: 'EXP-D-PP', variant: 'PROCESSED' }), 'CASE_0029 · Slice 45 · DINOv2 100 % post-processed');
  assert.equal(placeLine({}), '');
});

test('RV5 why a status button is off: one quiet line, in plain words, for every status', () => {
  for (const status of ['NOT_REVIEWED', 'ACCEPTED', 'FLAGGED', 'CORRECTED']) {
    const hint = statusHint(status);
    assert.match(hint, /^[A-Z][^_]*\.$/, hint);
  }
  assert.match(statusHint('CORRECTED'), /final/);
  assert.match(statusHint('FLAGGED'), /only when a correction is saved/);
  assert.match(statusHint('ACCEPTED'), /cannot go back to Not reviewed/);
  assert.match(statusHint('NOT_REVIEWED', false), /until the review is refreshed/, 'a stale review says so first, whatever its status');
  assert.equal(statusHint('SOMETHING_NEW'), null);
});
