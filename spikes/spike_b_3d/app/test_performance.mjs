import { FrameProbe, nearestRank, summarizeFrameIntervals } from './performance.js';

let passed = 0;
function equal(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
  passed += 1;
}

equal(nearestRank([10, 20, 30, 40], 0.5), 20, 'nearest-rank median');
equal(nearestRank([10, 20, 30, 40], 0.95), 40, 'nearest-rank p95');
equal(nearestRank([], 0.5), null, 'empty percentile');

const summary = summarizeFrameIntervals([16, 17, 501, 18, Number.NaN, -1]);
equal(summary.sample_count, 4, 'finite positive samples only');
equal(summary.median_frame_interval_ms, 17, 'median interval');
equal(summary.p95_frame_interval_ms, 501, 'p95 interval');
equal(summary.longest_stall_ms, 501, 'longest stall');
equal(summary.frames_over_500ms, 1, 'strict stall bound');

const probe = new FrameProbe({ startedAt: 0, warmupMs: 10, measureMs: 50 });
equal(probe.record(0), null, 'first frame starts probe');
equal(probe.record(8), null, 'warmup frame omitted');
equal(probe.record(26), null, 'measurement frame remains active');
equal(probe.record(43), null, 'second measurement frame remains active');
const result = probe.record(61);
equal(result.status, 'complete', 'probe completes at end');
equal(result.sample_count, 2, 'final interval is attributed to its in-window start');
equal(result.median_frame_interval_ms, 17, 'probe stores in-window intervals');

const finalStall = new FrameProbe({ startedAt: 0, warmupMs: 0, measureMs: 50 });
finalStall.record(0);
finalStall.record(16);
const stalledResult = finalStall.record(700);
equal(stalledResult.longest_stall_ms, 684, 'stall crossing the deadline is retained');
equal(stalledResult.frames_over_500ms, 1, 'deadline-crossing stall fails B11');

console.log(`performance tests: ${passed} passed`);
