#!/usr/bin/env node
/*
 * Slice-switch timing from a logcat capture - the laptop side of TC-PERF-001.
 * Reads the CMW_SLICE lines the app wrote (one per slice switch) and the
 * CMW_RUN_START / CMW_RUN_END markers of the scripted runs, and prints, per
 * run pass, n / min / p50 / p95 / max of ms_to_frame - the time from the
 * user's request to the first frame after the new image decoded.
 *
 *   node mobile/scripts/slice-timing-report.mjs <logcat.txt>
 *
 * Percentiles are nearest-rank on the sorted sample, the definition Spike A's
 * extract_timings.py uses; no smoothing, no outlier removal. NFR-PERF-001
 * bounds switches among CACHED slices (p95 <= 200 ms): the "A9:measured" and
 * "L4:revisit-15" passes are cached by construction, "L4:new-15" is not and
 * is reported for information only. A sample whose build was not a release
 * build (`dev: true`) is counted separately and never mixed in.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseSlices(text) {
  const out = [];
  let pass = null;
  for (const line of String(text).split(/\r?\n/)) {
    const marker = /CMW_RUN_(START|END) (\{.*\})/.exec(line);
    if (marker) {
      try {
        const m = JSON.parse(marker[2]);
        pass = marker[1] === 'START' ? `${m.run}:${m.pass}` : null;
      } catch (_err) { /* a broken marker leaves the pass unknown */ }
      continue;
    }
    const i = line.indexOf('CMW_SLICE ');
    if (i === -1) continue;
    try { out.push({ ...JSON.parse(line.slice(i + 10).trim()), runPass: pass }); } catch (_err) { /* skip */ }
  }
  return out;
}

export function nearestRank(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function summarize(samples) {
  const groups = new Map();
  for (const s of samples) {
    const key = `${s.runPass || 'manual'}${s.dev === true ? ' (DEV build)' : ''}`;
    if (!groups.has(key)) groups.set(key, []);
    if (Number.isFinite(s.ms_to_frame)) groups.get(key).push(s.ms_to_frame);
  }
  const rows = [];
  for (const [key, values] of groups) {
    const v = values.slice().sort((a, b) => a - b);
    rows.push({
      pass: key, n: v.length, min: v[0] ?? null, p50: nearestRank(v, 50), p95: nearestRank(v, 95), max: v[v.length - 1] ?? null,
    });
  }
  return rows;
}

function main(argv) {
  const file = argv[0];
  if (!file) { console.error('usage: node mobile/scripts/slice-timing-report.mjs <logcat.txt>'); return 2; }
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (err) { console.error(`cannot read ${file}: ${err.message}`); return 2; }
  const samples = parseSlices(text);
  if (!samples.length) { console.error(`no CMW_SLICE line in ${file}`); return 2; }
  for (const r of summarize(samples)) {
    console.log(`${r.pass.padEnd(28)} n ${String(r.n).padStart(3)}  min ${r.min}  p50 ${r.p50}  p95 ${r.p95}  max ${r.max}  (ms_to_frame)`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
