// node --test mobile/test/  - the laptop-side L4 judge (scripts/l4-report.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { createNetLog } from '../src/runtime/netLog.mjs';
import { judge, parseLog } from '../scripts/l4-report.mjs';
import { nearestRank, parseSlices, summarize } from '../scripts/slice-timing-report.mjs';

// Build a logcat capture the way the app writes it: netLog lines and run
// markers, prefixed like `adb logcat -s ReactNativeJS:V` prints them.
function capture({ freshRequests, revisitRequests = () => [], freshCount = 15 }) {
  const lines = [];
  const prefix = '10-01 19:03:11.123  4321  4400 I ReactNativeJS: ';
  const log = createNetLog({ log: (l) => lines.push(prefix + l) });
  lines.push(`${prefix}CMW_RUN_START {"run":"L4","pass":"new-15","steps":15}`);
  for (let i = 0; i < freshCount; i += 1) {
    log.begin({ caseId: 'CASE_0061', from: 44 + i, to: 45 + i });
    for (const q of freshRequests(i)) log.record(q);
    log.end();
  }
  lines.push(`${prefix}CMW_RUN_END {"run":"L4","pass":"new-15","steps":15}`);
  lines.push(`${prefix}CMW_RUN_START {"run":"L4","pass":"revisit-15","steps":15}`);
  for (let i = 0; i < 15; i += 1) {
    log.begin({ caseId: 'CASE_0061', from: 59 - i, to: 58 - i });
    for (const q of revisitRequests(i)) log.record(q);
    log.end();
  }
  lines.push(`${prefix}CMW_RUN_END {"run":"L4","pass":"revisit-15","steps":15}`);
  lines.push(`${prefix}some unrelated line`);
  return lines.join('\n');
}

const sliceRequests = () => [
  { endpoint: 'mri_slice_get', bytes: 900, ms: 40, status: 200 },
  { endpoint: 'prediction_slice_get', bytes: 950, ms: 41, status: 200 },
  { endpoint: 'ground_truth_slice_get', bytes: 900, ms: 39, status: 200 },
  { endpoint: 'analysis_slice_metrics', bytes: 300, ms: 30, status: 200 },
  { endpoint: 'artifact:mri', bytes: 180000, ms: 120, status: 200 },
  { endpoint: 'artifact:mask', bytes: 2500, ms: 20, status: 200 },
];

test('L4a a clean session passes: per-slice requests, bounded bytes, free revisits', () => {
  const r = judge(parseLog(capture({ freshRequests: sliceRequests })));
  assert.equal(r.verdict, 'PASS', r.problems.join('\n'));
  assert.deepEqual({ ...r.counts }, {
    gestures: 30, slice_gestures: 30, l4_new: 15, l4_revisit: 15, superseded: 0, revisit_cache_hits: 15,
  });
  assert.equal(r.new_slice_kb.max, 181.2);
});

test('L4b a case- or volume-level request in a slice gesture fails, naming it', () => {
  const r = judge(parseLog(capture({
    freshRequests: (i) => (i === 3 ? [...sliceRequests(), { endpoint: 'case_get', bytes: 700, status: 200 }] : sliceRequests()),
  })));
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.problems.some((p) => /asked case_get - not per-slice/.test(p)));
});

test('L4c a volume-sized response fails even inside an allowed endpoint', () => {
  const r = judge(parseLog(capture({
    freshRequests: (i) => (i === 0 ? [{ endpoint: 'artifact:mri', bytes: 29 * 1024 * 1024, status: 200 }] : sliceRequests()),
  })));
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.problems.some((p) => /volume-sized/.test(p)));
  assert.ok(r.problems.some((p) => /> 500 KB/.test(p)));
});

test('L4d a revisit that touched the network fails', () => {
  const r = judge(parseLog(capture({
    freshRequests: sliceRequests,
    revisitRequests: (i) => (i === 7 ? [{ endpoint: 'artifact:mri', bytes: 180000, status: 200 }] : []),
  })));
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.problems.some((p) => /revisit gesture .* was not free/.test(p)));
});

test('L4e an incomplete run cannot pass by having nothing in it', () => {
  const r = judge(parseLog(capture({ freshRequests: sliceRequests, freshCount: 9 })));
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.problems.some((p) => /new-15 pass has 9 gestures/.test(p)));
  assert.deepEqual(parseLog('nothing here\nat all'), []);
});

test('L4g slice timing: nearest-rank percentiles per run pass, dev builds kept apart', () => {
  const lines = [
    'x CMW_RUN_START {"run":"A9","pass":"measured","steps":3}',
    ...[30, 10, 20].map((ms) => `x CMW_SLICE {"slice":1,"ms_to_frame":${ms},"dev":false}`),
    'x CMW_RUN_END {"run":"A9","pass":"measured","steps":3}',
    'x CMW_SLICE {"slice":2,"ms_to_frame":400,"dev":true}',
  ].join('\n');
  const rows = summarize(parseSlices(lines));
  const a9 = rows.find((r) => r.pass === 'A9:measured');
  assert.deepEqual({ ...a9 }, { pass: 'A9:measured', n: 3, min: 10, p50: 20, p95: 30, max: 30 });
  assert.ok(rows.some((r) => r.pass === 'manual (DEV build)' && r.n === 1), 'a DEV-build sample is never mixed in');
  assert.equal(nearestRank([], 95), null);
});

test('L4f an unknown response size on a 200 is a problem, not a silent zero', () => {
  const r = judge(parseLog(capture({
    freshRequests: (i) => (i === 2 ? [{ endpoint: 'mri_slice_get', bytes: null, status: 200 }] : sliceRequests()),
  })));
  assert.ok(r.problems.some((p) => /size unknown/.test(p)));
});
