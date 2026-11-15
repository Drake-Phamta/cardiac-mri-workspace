// node --test mobile/test/  - SCR-06 stroke timing (NFR-PERF-003): the CMW_STROKE line (src/screens/v4-review/strokeTiming.mjs) and
// the laptop-side report (scripts/stroke-timing-report.mjs). A fake clock and a fake frame queue drive the timer.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStrokeTimer, nearestRank, STROKE_TAG } from '../src/screens/v4-review/strokeTiming.mjs';
import { BUCKETS, SLICE_BUCKETS, parseStrokes, summarize } from '../scripts/stroke-timing-report.mjs';

// A clock the test moves, and a frame queue it runs by hand (one requestAnimationFrame callback batch per `frame(at)`).
function rig(dev = false) {
  let t = 1000;
  const lines = [];
  const frames = [];
  const timer = createStrokeTimer({ now: () => t, raf: (fn) => frames.push(fn), log: (l) => lines.push(l), dev });
  return {
    timer,
    lines,
    at: (ms) => { t = ms; },
    frame: (ms) => { t = ms; const run = frames.splice(0); run.forEach((fn) => fn()); },
    pending: () => frames.length,
    records: () => lines.map((l) => JSON.parse(l.slice(STROKE_TAG.length + 1))),
  };
}
const INFO = { strokeActive: true, slice: 44, tool: 'add', px: 5, strokes: 3, slices: 4, runs: 40, mode: 'live' };

test('ST1 a stroke is one line: touch to the first frame, each move to its frame, the gap between frames', () => {
  const g = rig();
  g.at(1000); g.timer.touchStart();
  g.at(1004); g.timer.rendered(INFO); // the grant drew the first stamp
  g.frame(1030); // first frame: 30 ms after the touch
  g.at(1040); g.timer.touchMove(); g.at(1046); g.timer.rendered({ ...INFO, runs: 52 });
  g.frame(1063); // the move waited 23 ms
  g.at(1070); g.timer.touchMove(); g.at(1075); g.timer.rendered({ ...INFO, runs: 64 });
  g.frame(1113); // 43 ms for this one, and 50 ms since the last frame
  assert.equal(g.lines.length, 0, 'nothing is written while the stroke goes on');
  g.at(1120); g.timer.touchEnd('release'); g.timer.rendered({ ...INFO, strokeActive: false, strokes: 4, runs: 64 });
  g.frame(1130);
  assert.equal(g.lines.length, 1);
  assert.match(g.lines[0], /^CMW_STROKE \{/);
  const [r] = g.records();
  assert.deepEqual(r, {
    stroke: 1, slice: 44, tool: 'add', px: 5, strokes_before: 3, slices_open: 4, runs_start: 40, runs_end: 64,
    ms_to_frame: 30, moves: 2, move_p50: 23, move_p95: 43, move_max: 43, frames: 4, gap_p50: 33, gap_max: 50,
    end: 'release', dev: false, mode: 'live',
  });
});

test('ST2 a gesture that paints nothing (Pan, two fingers) writes no line and leaves nothing behind for the next stroke', () => {
  const g = rig();
  g.timer.touchStart();
  g.timer.rendered({ ...INFO, strokeActive: false });
  g.timer.touchMove(); g.timer.touchMove();
  g.frame(1050);
  g.timer.touchEnd('release');
  g.frame(1060);
  assert.equal(g.lines.length, 0);
  // the next stroke starts clean: its first frame counts from its own touch, and the old moves are not in it
  g.at(2000); g.timer.touchStart(); g.at(2003); g.timer.rendered(INFO); g.frame(2020);
  g.at(2030); g.timer.touchEnd('release'); g.timer.rendered({ ...INFO, strokeActive: false }); g.frame(2040);
  const [r] = g.records();
  assert.equal(r.ms_to_frame, 20);
  assert.equal(r.moves, 0);
  assert.equal(r.move_p95, null);
});

test('ST3 a stroke the system takes away, and one a second finger rolls back, say so', () => {
  const g = rig();
  g.timer.touchStart(); g.timer.rendered(INFO); g.frame(1020);
  g.timer.touchEnd('terminated'); g.frame(1040);
  g.at(3000); g.timer.touchStart(); g.timer.rendered(INFO); g.frame(3020);
  g.timer.rendered({ ...INFO, strokeActive: false }); // the controller ended it: no touchEnd came first
  g.frame(3040);
  assert.deepEqual(g.records().map((r) => r.end), ['terminated', 'rolled_back']);
  assert.deepEqual(g.records().map((r) => r.stroke), [1, 2]);
});

test('ST4 one frame callback serves every render and move since the last one', () => {
  const g = rig();
  g.timer.touchStart(); g.timer.rendered(INFO);
  g.timer.touchMove(); g.timer.rendered(INFO); g.timer.touchMove(); g.timer.rendered(INFO);
  assert.equal(g.pending(), 1, 'one callback is waiting, not one per render');
});

test('ST5 the line has numbers, a tool and a mode and nothing that names a person, a case, a run or a place on the slice', () => {
  const g = rig(true);
  g.timer.touchStart(); g.timer.rendered({ ...INFO, mode: 'fixture' }); g.frame(1016);
  g.timer.touchEnd('release'); g.frame(1032);
  const text = g.lines[0];
  assert.deepEqual(Object.keys(g.records()[0]), [
    'stroke', 'slice', 'tool', 'px', 'strokes_before', 'slices_open', 'runs_start', 'runs_end', 'ms_to_frame', 'moves', 'move_p50', 'move_p95',
    'move_max', 'frames', 'gap_p50', 'gap_max', 'end', 'dev', 'mode',
  ]);
  assert.doesNotMatch(text, /CASE_|RUN_|REVIEW|REVMASK|ART_|sha256|https?:|"x"|"y"|"cx"|"cy"/);
  assert.equal(g.records()[0].dev, true);
  assert.equal(g.records()[0].mode, 'fixture');
});

test('ST6 nearest rank is the definition of slice-timing-report', () => {
  assert.equal(nearestRank([], 95), null);
  assert.equal(nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
});

// A capture the way logcat prints it: a prefix, then the line.
const P = '11-15 14:30:01.123  4321  4400 I ReactNativeJS: ';
const row = (o) => `${P}${STROKE_TAG} ${JSON.stringify({
  stroke: 1, slice: 44, tool: 'add', px: 5, strokes_before: 0, slices_open: 1, runs_start: 10, runs_end: 80, ms_to_frame: 60, moves: 5, move_p50: 20,
  move_p95: 40, move_max: 45, frames: 6, gap_p50: 17, gap_max: 33, end: 'release', dev: false, mode: 'live', ...o,
})}`;

test('ST7 the report groups by committed strokes and judges p95 of the first frame and of the moves against 100 ms', () => {
  const text = [
    `${P}CMW_SLICE {"slice":44}`, 'noise', `${P}CMW_STROKE {broken`,
    ...Array.from({ length: 10 }, (_, i) => row({ stroke: i + 1, strokes_before: i, ms_to_frame: 50 + i })),
    ...Array.from({ length: 4 }, (_, i) => row({ stroke: 11 + i, strokes_before: 25 + i, ms_to_frame: 90, move_p95: 70 })),
  ].join('\n');
  const strokes = parseStrokes(text);
  assert.equal(strokes.length, 14, 'the broken line and the other tags are skipped');
  const r = summarize(strokes);
  assert.deepEqual(r.rows.map((x) => [x.bucket, x.strokes]), [['0 committed', 1], ['1-9', 9], ['10-19', 0], ['20+', 4]]);
  assert.equal(r.rows[3].first.p50, 90);
  assert.equal(r.verdict, 'PASS');
  assert.equal(BUCKETS.length, 4);
  const slow = summarize(parseStrokes(Array.from({ length: 12 }, (_, i) => row({ stroke: i, ms_to_frame: i < 3 ? 140 : 60 })).join('\n')));
  assert.equal(slow.verdict, 'FAIL', 'p95 of the first frame over 100 ms');
  const slowMove = summarize(parseStrokes(Array.from({ length: 12 }, (_, i) => row({ stroke: i, move_p95: i < 3 ? 120 : 40 })).join('\n')));
  assert.equal(slowMove.verdict, 'FAIL', 'p95 of the moves over 100 ms');
});

test('ST8 too few strokes, or only a DEV build, cannot be judged; DEV strokes are kept apart', () => {
  assert.equal(summarize(parseStrokes(row({}))).verdict, 'CANNOT_JUDGE');
  const dev = Array.from({ length: 12 }, (_, i) => row({ stroke: i, dev: true })).join('\n');
  const r = summarize(parseStrokes(dev));
  assert.equal(r.verdict, 'CANNOT_JUDGE');
  assert.equal(r.devStrokes, 12);
  assert.equal(r.strokes, 0);
});

test('ST9 the report also groups by the slices open when the stroke began, and leaves out a capture that has no such field', () => {
  const rows = [
    ...Array.from({ length: 4 }, (_, i) => row({ stroke: i + 1, slices_open: 1, ms_to_frame: 40 })),
    ...Array.from({ length: 3 }, (_, i) => row({ stroke: 5 + i, slices_open: 3, ms_to_frame: 45 })),
    ...Array.from({ length: 5 }, (_, i) => row({ stroke: 8 + i, slices_open: 8, ms_to_frame: 52 })),
  ];
  const r = summarize(parseStrokes(rows.join('\n')));
  assert.equal(SLICE_BUCKETS.length, 4);
  assert.deepEqual(r.sliceRows.map((x) => [x.bucket, x.strokes]), [['1 open', 4], ['2-3 open', 3], ['4-6 open', 0], ['7+ open', 5]]);
  assert.equal(r.sliceRows[3].first.p50, 52);
  assert.equal(r.rows.reduce((n, x) => n + x.strokes, 0), 12, 'the first table is unchanged');
  // an older capture: no slices_open, so none of its strokes is put in a bucket
  const old = summarize(parseStrokes(Array.from({ length: 12 }, (_, i) => row({ stroke: i, slices_open: undefined })).join('\n')));
  assert.deepEqual(old.sliceRows.map((x) => x.strokes), [0, 0, 0, 0]);
  assert.equal(old.verdict, 'PASS', 'the verdict does not depend on the field');
});
