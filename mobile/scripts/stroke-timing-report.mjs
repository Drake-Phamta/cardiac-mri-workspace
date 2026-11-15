#!/usr/bin/env node
/*
 * Stroke timing from a logcat capture - the laptop side of TC-PERF-003 (NFR-PERF-003: a stroke answers within 100 ms).
 * Reads the CMW_STROKE lines SCR-06 wrote (one per stroke; their fields are in src/screens/v4-review/strokeTiming.mjs) and prints,
 * for the strokes grouped by how many strokes were already committed (0, 1-9, 10-19, 20 or more), n / p50 / p95 / max of
 *   first  ms_to_frame: the gesture's start to the first frame that shows the stroke
 *   move   move_p95 of each stroke: the worst usual wait of a later move to its frame
 *   gap    gap_p50 of each stroke: the time between frames while painting (16.7 ms = 60 Hz)
 * and a verdict on a release build: PASS when the p95 of `first` and the p95 of `move` are both 100 ms or less, FAIL when either is
 * over, CANNOT_JUDGE with fewer than 10 strokes or without a release-build sample. A second table groups the same strokes by how many
 * slices were open when they began (1, 2-3, 4-6, 7 or more; the `slices_open` field), because a stroke's time must not rise with it.
 * The times are read in JS, they leave out the touch panel and end at the frame callback (up to one frame before the pixels are
 * lit), so a PASS is "the app answers within 100 ms", and the margin to read it against is one frame.
 *
 *   adb logcat --pid <pid> -v threadtime > logcat.txt          (on the laptop; the phone computes nothing)
 *   node mobile/scripts/stroke-timing-report.mjs logcat.txt
 *
 * Percentiles are nearest-rank on the sorted sample, as slice-timing-report.mjs does; no smoothing, no outlier removal. A sample
 * from a DEV build (`dev: true`) is counted apart and never mixed in. Exit 0 PASS, 1 FAIL, 2 CANNOT_JUDGE or unreadable.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIMIT_MS = 100;
export const MIN_STROKES = 10;
export const BUCKETS = Object.freeze([
  { name: '0 committed', from: 0, to: 0 },
  { name: '1-9', from: 1, to: 9 },
  { name: '10-19', from: 10, to: 19 },
  { name: '20+', from: 20, to: Infinity },
]);

export const SLICE_BUCKETS = Object.freeze([
  { name: '1 open', from: 1, to: 1 },
  { name: '2-3 open', from: 2, to: 3 },
  { name: '4-6 open', from: 4, to: 6 },
  { name: '7+ open', from: 7, to: Infinity },
]);

export function parseStrokes(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const i = line.indexOf('CMW_STROKE ');
    if (i === -1) continue;
    try { out.push(JSON.parse(line.slice(i + 11).trim())); } catch (_err) { /* a broken line is skipped */ }
  }
  return out;
}

export function nearestRank(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function stats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return { n: v.length, p50: nearestRank(v, 50), p95: nearestRank(v, 95), max: v.length ? v[v.length - 1] : null };
}

export function summarize(strokes) {
  const release = strokes.filter((s) => s.dev !== true);
  const dev = strokes.length - release.length;
  const rows = BUCKETS.map((b) => {
    const inBucket = release.filter((s) => Number.isInteger(s.strokes_before) && s.strokes_before >= b.from && s.strokes_before <= b.to);
    return {
      bucket: b.name,
      strokes: inBucket.length,
      first: stats(inBucket.map((s) => s.ms_to_frame)),
      move: stats(inBucket.map((s) => s.move_p95)),
      gap: stats(inBucket.map((s) => s.gap_p50)),
    };
  });
  // A capture from before the field existed has no `slices_open`: its strokes are left out of this table, not counted as 0.
  const sliceRows = SLICE_BUCKETS.map((b) => {
    const inBucket = release.filter((s) => Number.isInteger(s.slices_open) && s.slices_open >= b.from && s.slices_open <= b.to);
    return {
      bucket: b.name,
      strokes: inBucket.length,
      first: stats(inBucket.map((s) => s.ms_to_frame)),
      move: stats(inBucket.map((s) => s.move_p95)),
      gap: stats(inBucket.map((s) => s.gap_p50)),
    };
  });
  const first = stats(release.map((s) => s.ms_to_frame));
  const move = stats(release.map((s) => s.move_p95));
  let verdict = 'CANNOT_JUDGE';
  if (release.length >= MIN_STROKES) verdict = first.p95 <= LIMIT_MS && (move.n === 0 || move.p95 <= LIMIT_MS) ? 'PASS' : 'FAIL';
  return { strokes: release.length, devStrokes: dev, rows, sliceRows, first, move, verdict };
}

const f = (v) => (v === null ? '-' : String(Math.round(v * 100) / 100));

function main(argv) {
  const file = argv[0];
  if (!file) { console.error('usage: node mobile/scripts/stroke-timing-report.mjs <logcat.txt>'); return 2; }
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (err) { console.error(`cannot read ${file}: ${err.message}`); return 2; }
  const strokes = parseStrokes(text);
  if (!strokes.length) { console.error(`no CMW_STROKE line in ${file}`); return 2; }
  const r = summarize(strokes);
  const line = (row) => console.log(`${row.bucket.padEnd(12)} strokes ${String(row.strokes).padStart(3)}  first p50 ${f(row.first.p50)} p95 ${f(row.first.p95)} max ${f(row.first.max)}`
    + `  move p95 ${f(row.move.p95)} max ${f(row.move.max)}  gap p50 ${f(row.gap.p50)} (ms)`);
  for (const row of r.rows) line(row);
  if (r.sliceRows.some((row) => row.strokes > 0)) {
    console.log('by slices open when the stroke began:');
    for (const row of r.sliceRows) if (row.strokes > 0) line(row);
  }
  if (r.devStrokes) console.log(`${r.devStrokes} stroke(s) from a DEV build left out`);
  console.log(`NFR-PERF-003 (p95 <= ${LIMIT_MS} ms, first frame p95 ${f(r.first.p95)}, move p95 ${f(r.move.p95)}, ${r.strokes} strokes): ${r.verdict}`);
  return r.verdict === 'PASS' ? 0 : (r.verdict === 'FAIL' ? 1 : 2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
