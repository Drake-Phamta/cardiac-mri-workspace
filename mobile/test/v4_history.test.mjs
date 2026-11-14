// node --test mobile/test/  - the review timeline (src/screens/v4-review/history.mjs) over review_history_list rows
import test from 'node:test';
import assert from 'node:assert/strict';

import { formatUtc, reviewerLabel, timelineLines } from '../src/screens/v4-review/history.mjs';
import { generatedBundleJson } from './_helpers.mjs';

const ROWS = generatedBundleJson().scenarios.review_history_list.default.response.data.items;

const row = (revision, action, extra = {}) => ({
  revision, action, from_status: null, to_status: 'NOT_REVIEWED', reviewer_id: 'project-reviewer', reason: null,
  slice_index: null, reviewed_mask_id: null, at: `2026-11-14T10:0${revision}:00Z`, ...extra,
});

test('HI1 the generated history reads newest first: one save line with its slice, the flag with its reason', () => {
  const lines = timelineLines(ROWS);
  assert.deepEqual(lines.map((l) => l.what), [
    'Saved correction REVIEWED_MASK_0043_R1, slice 44',
    'Flagged (was not reviewed)',
    'Review opened',
  ]);
  assert.equal(lines[1].reason, ROWS[1].reason);
  assert.equal(lines[0].reason, null);
  assert.deepEqual(lines.map((l) => l.who), ['project-reviewer', 'project-reviewer', 'project-reviewer']);
  assert.equal(lines[2].when, '2026-10-01 09:00 UTC');
});

test('HI2 several uploads fold into the save they belong to; uploads after the last save are said to be unsaved', () => {
  const lines = timelineLines([
    row(1, 'CREATE'),
    row(2, 'WORKING_SLICE', { slice_index: 40 }),
    row(3, 'WORKING_SLICE', { slice_index: 44 }),
    row(4, 'WORKING_SLICE', { slice_index: 40 }),
    row(5, 'COMMIT', { from_status: 'NOT_REVIEWED', to_status: 'CORRECTED', reviewed_mask_id: 'RM_R_V1' }),
    row(6, 'WORKING_SLICE', { slice_index: 12 }),
  ]);
  assert.deepEqual(lines.map((l) => l.what), [
    'Uploaded slice 12, not saved yet',
    'Saved correction RM_R_V1, slice 40, 44',
    'Review opened',
  ]);
  assert.equal(lines[0].when, '2026-11-14 10:06 UTC', 'the unsaved line carries the time of the last upload');
});

test('HI3 the reviewer is the recorded alias; a missing one is said, and an address is never shown', () => {
  assert.equal(reviewerLabel('project-reviewer'), 'project-reviewer');
  assert.equal(reviewerLabel(null), 'reviewer not recorded');
  assert.equal(reviewerLabel('someone@hospital.example'), 'reviewer hidden');
  const lines = timelineLines([row(1, 'CREATE', { reviewer_id: null })]);
  assert.equal(lines[0].who, 'reviewer not recorded');
});

test('HI4 times are shown in UTC as served, and an unexpected time or action is shown as it is', () => {
  assert.equal(formatUtc('2026-11-14T23:59:59Z'), '2026-11-14 23:59 UTC');
  assert.equal(formatUtc('yesterday'), 'yesterday');
  assert.equal(formatUtc(null), 'time not recorded');
  assert.equal(timelineLines([row(1, 'ARCHIVE')])[0].what, 'ARCHIVE');
  assert.deepEqual([...timelineLines([])], []);
  assert.deepEqual([...timelineLines(null)], []);
});
