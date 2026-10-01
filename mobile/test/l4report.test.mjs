// node --test mobile/test/  - the laptop-side L4 judge (scripts/l4-report.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { createNetLog } from '../src/runtime/netLog.mjs';
import { byteStats, judge, parseLog } from '../scripts/l4-report.mjs';
import { nearestRank, parseSlices, summarize } from '../scripts/slice-timing-report.mjs';

// Build a logcat capture the way the app writes it: netLog lines and run
// markers, prefixed like `adb logcat -s ReactNativeJS:V` prints them.
function capture({
  freshRequests, revisitRequests = () => [], freshCount = 15, markers = true,
  freshOutcome = () => 'shown', supersedeAt = null, timeoutAt = null,
}) {
  const lines = [];
  const prefix = '10-01 19:03:11.123  4321  4400 I ReactNativeJS: ';
  const log = createNetLog({ log: (l) => lines.push(prefix + l) });
  const mark = (l) => { if (markers) lines.push(prefix + l); };
  mark('CMW_RUN_START {"run":"L4","pass":"new-15","steps":15,"nz":88}');
  for (let i = 0; i < freshCount; i += 1) {
    log.begin({ caseId: 'CASE_0061', from: 44 + i, to: 45 + i });
    for (const q of freshRequests(i)) log.record(q);
    if (i === timeoutAt) lines.push(`${prefix}CMW_STEP_TIMEOUT {"slice":${45 + i},"waited_ms":6000}`);
    if (i !== supersedeAt) log.end({ outcome: freshOutcome(i) }); // else the next begin closes it "superseded"
  }
  mark('CMW_RUN_END {"run":"L4","pass":"new-15","steps":15}');
  mark('CMW_RUN_START {"run":"L4","pass":"revisit-15","steps":15,"nz":88}');
  for (let i = 0; i < 15; i += 1) {
    log.begin({ caseId: 'CASE_0061', from: 59 - i, to: 58 - i });
    for (const q of revisitRequests(i)) log.record(q);
    log.end();
  }
  mark('CMW_RUN_END {"run":"L4","pass":"revisit-15","steps":15}');
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
    gestures: 30, slice_gestures: 30, l4_new: 15, l4_revisit: 15, superseded: 0, step_timeouts_in_l4: 0, revisit_cache_hits: 15,
  });
  assert.deepEqual(r.bytes_per_switch_kb.new_15, { n: 15, p50: 181.2, p95: 181.2, max: 181.2 });
  assert.deepEqual(r.bytes_per_switch_kb.revisit_15, { n: 15, p50: 0, p95: 0, max: 0 });
  assert.equal(r.full_volume_reference.slices, 88);
  assert.equal(r.full_volume_reference.full_volume_kb, 15945.6);
  assert.equal(r.note, null);
});

test('L4h (QA) a new-15 pass in which nothing was fetched cannot pass', () => {
  const r = judge(parseLog(capture({ freshRequests: () => [] })));
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.problems.filter((p) => /^R5 .*asked the network nothing/.test(p)).length, 15);
  assert.ok(r.problems.some((p) => /^R5 .*no mri_slice_get \/ artifact:mri with bytes/.test(p)));
});

test('L4i (QA) an MRI that never arrives fails: no artifact bytes, or a gesture that did not end "shown"', () => {
  const noMri = judge(parseLog(capture({
    freshRequests: (i) => (i === 4 ? sliceRequests().filter((q) => q.endpoint !== 'artifact:mri') : sliceRequests()),
  })));
  assert.equal(noMri.verdict, 'FAIL');
  assert.ok(noMri.problems.some((p) => /^R5 gesture \d+ \(48->49\) has no artifact:mri with bytes/.test(p.replace('new-15 ', ''))), noMri.problems.join('\n'));
  const zero = judge(parseLog(capture({
    freshRequests: (i) => sliceRequests().map((q) => (i === 6 && q.endpoint === 'artifact:mri' ? { ...q, bytes: 0 } : q)),
  })));
  assert.ok(zero.problems.some((p) => /has no artifact:mri with bytes/.test(p)), 'a 0-byte MRI is not an MRI');
  const imageError = judge(parseLog(capture({ freshRequests: sliceRequests, freshOutcome: (i) => (i === 2 ? 'image-error' : 'shown') })));
  assert.equal(imageError.verdict, 'FAIL');
  assert.ok(imageError.problems.some((p) => /^R6 .* ended "image-error", not "shown"/.test(p)));
});

test('L4j (QA) an 88 x 2 KB mask "volume" inside one gesture fails on the relative rule', () => {
  const r = judge(parseLog(capture({
    freshRequests: (i) => (i === 9 ? [...sliceRequests(), { endpoint: 'artifact:mask', bytes: 88 * 2500, ms: 300, status: 200 }] : sliceRequests()),
  })));
  assert.equal(r.verdict, 'FAIL');
  assert.ok(!r.problems.some((p) => /^R2|^R3/.test(p)), 'it fits under the absolute bounds - only R4 catches it');
  assert.ok(r.problems.some((p) => /^R4 gesture \d+: artifact:mask answered 220000 bytes = 88\.0x its median 2500/.test(p)), r.problems.join('\n'));
  assert.equal(r.endpoint_median_bytes['artifact:mask'], 2500);
});

test('L4k a superseded gesture or a step timeout inside the L4 pass fails', () => {
  const sup = judge(parseLog(capture({ freshRequests: sliceRequests, supersedeAt: 3 })));
  assert.equal(sup.verdict, 'FAIL');
  assert.ok(sup.problems.some((p) => /^R6 .* ended "superseded"/.test(p)));
  assert.equal(sup.counts.superseded, 1);
  const tmo = judge(parseLog(capture({ freshRequests: sliceRequests, timeoutAt: 7 })));
  assert.equal(tmo.verdict, 'FAIL');
  assert.ok(tmo.problems.some((p) => /^R6 CMW_STEP_TIMEOUT in the L4 new-15 pass at slice 52/.test(p)));
  assert.equal(tmo.counts.step_timeouts_in_l4, 1);
});

test('L4l a manual capture (no run markers) is CANNOT_JUDGE, never PASS; a volume request still fails it', () => {
  const r = judge(parseLog(capture({ freshRequests: sliceRequests, markers: false })));
  assert.equal(r.verdict, 'CANNOT_JUDGE');
  assert.match(r.note, /^manual: cannot judge/);
  const bad = judge(parseLog(capture({
    freshRequests: (i) => (i === 1 ? [...sliceRequests(), { endpoint: 'case_get', bytes: 700, status: 200 }] : sliceRequests()),
    markers: false,
  })));
  assert.equal(bad.verdict, 'FAIL');
});

test('L4m bytes per switch: n / p50 / p95 / max, nearest-rank', () => {
  const kbs = Array.from({ length: 20 }, (_, i) => (i + 1) * 1024);
  assert.deepEqual(byteStats(kbs.slice().reverse()), { n: 20, p50: 10, p95: 19, max: 20 });
  assert.equal(byteStats([]), null);
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
