#!/usr/bin/env node
/*
 * L4 report - reads a logcat capture from the S-1 session and judges
 * NFR-PERF-001 limb 2, "a slice gesture never triggers a full-volume
 * transfer", from the CMW_GESTURE lines the app wrote. Runs on the LAPTOP:
 * the phone computes nothing.
 *
 *   node mobile/scripts/l4-report.mjs <logcat.txt> [--max-gesture-kb 500] [--max-request-kb 2048]
 *
 * PASS needs all four (mobile/S1_L4_SCRIPT.md states them for the leader):
 *   1. per-slice only - every request of a slice gesture is one of the
 *      per-slice endpoints or a per-slice artifact; nothing case- or
 *      volume-level;
 *   2. bounded - no slice gesture received more than --max-gesture-kb;
 *   3. no volume - no single response exceeded --max-request-kb (a
 *      576 x 576 x 88 volume is ~29 MB raw; one slice PNG is ~0.1-0.3 MB);
 *   4. revisits free - in the L4 run's revisit pass, every gesture is a
 *      cache hit with 0 bytes.
 * It also requires the L4 run to be complete (15 + 15 gestures) so a short
 * capture cannot pass by having nothing in it.
 *
 * Exit status: 0 PASS, 1 FAIL, 2 unusable input.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PER_SLICE_ENDPOINTS = Object.freeze([
  'mri_slice_get', 'prediction_slice_get', 'ground_truth_slice_get', 'analysis_slice_metrics',
  'analysis_slice_error', 'reviewed_mask_slice_get', 'artifact:mri', 'artifact:mask',
]);

function jsonAfter(line, tag) {
  const i = line.indexOf(`${tag} `);
  if (i === -1) return null;
  try { return JSON.parse(line.slice(i + tag.length + 1).trim()); } catch (_err) { return { unparsable: true, raw: line }; }
}

// Logcat text -> the events in order: gestures and run markers.
export function parseLog(text) {
  const events = [];
  for (const line of String(text).split(/\r?\n/)) {
    for (const tag of ['CMW_GESTURE', 'CMW_RUN_START', 'CMW_RUN_END']) {
      const v = jsonAfter(line, tag);
      if (v) { events.push({ tag, ...v }); break; }
    }
  }
  return events;
}

export function judge(events, { maxGestureKb = 500, maxRequestKb = 2048 } = {}) {
  const problems = [];
  const gestures = [];
  let pass = null;
  for (const e of events) {
    if (e.unparsable) { problems.push(`unparsable line: ${String(e.raw).slice(0, 120)}`); continue; }
    if (e.tag === 'CMW_RUN_START') { pass = e.run === 'L4' ? e.pass : null; continue; }
    if (e.tag === 'CMW_RUN_END') { pass = null; continue; }
    gestures.push({ ...e, l4pass: pass });
  }
  const slice = gestures.filter((g) => g.kind === 'slice');
  const fresh = slice.filter((g) => g.l4pass === 'new-15');
  const revisit = slice.filter((g) => g.l4pass === 'revisit-15');

  for (const g of slice) {
    const bad = (g.requests || []).filter((q) => !PER_SLICE_ENDPOINTS.includes(q.endpoint));
    if (bad.length) problems.push(`gesture ${g.seq} (${g.from}->${g.to}) asked ${bad.map((q) => q.endpoint).join(', ')} - not per-slice`);
    if (g.bytes_total > maxGestureKb * 1024) problems.push(`gesture ${g.seq} received ${g.bytes_total} bytes > ${maxGestureKb} KB`);
  }
  for (const g of gestures) {
    for (const q of g.requests || []) {
      if (q.bytes > maxRequestKb * 1024) problems.push(`gesture ${g.seq}: ${q.endpoint} answered ${q.bytes} bytes > ${maxRequestKb} KB (volume-sized)`);
      if (q.bytes === null && q.status === 200) problems.push(`gesture ${g.seq}: ${q.endpoint} size unknown (no Content-Length, no body count)`);
    }
  }
  for (const g of revisit) {
    if (!g.cache_hit || g.bytes_total !== 0) problems.push(`revisit gesture ${g.seq} (${g.from}->${g.to}) was not free: ${g.bytes_total} bytes in ${(g.requests || []).length} requests`);
  }
  if (fresh.length !== 15) problems.push(`L4 new-15 pass has ${fresh.length} gestures, expected 15`);
  if (revisit.length !== 15) problems.push(`L4 revisit-15 pass has ${revisit.length} gestures, expected 15`);
  const superseded = slice.filter((g) => g.outcome === 'superseded').length;

  const kb = (n) => Math.round((n / 1024) * 10) / 10;
  const freshBytes = fresh.map((g) => g.bytes_total).sort((a, b) => a - b);
  return Object.freeze({
    verdict: problems.length === 0 ? 'PASS' : 'FAIL',
    problems,
    counts: {
      gestures: gestures.length,
      slice_gestures: slice.length,
      l4_new: fresh.length,
      l4_revisit: revisit.length,
      superseded,
      revisit_cache_hits: revisit.filter((g) => g.cache_hit && g.bytes_total === 0).length,
    },
    new_slice_kb: freshBytes.length ? {
      min: kb(freshBytes[0]), median: kb(freshBytes[Math.floor((freshBytes.length - 1) / 2)]), max: kb(freshBytes[freshBytes.length - 1]),
    } : null,
    max_request_kb: kb(Math.max(0, ...gestures.flatMap((g) => (g.requests || []).map((q) => q.bytes || 0)))),
  });
}

function main(argv) {
  const args = [...argv];
  const file = args.shift();
  if (!file) { console.error('usage: node mobile/scripts/l4-report.mjs <logcat.txt> [--max-gesture-kb N] [--max-request-kb N]'); return 2; }
  const opts = {};
  while (args.length) {
    const a = args.shift();
    if (a === '--max-gesture-kb') opts.maxGestureKb = Number(args.shift());
    else if (a === '--max-request-kb') opts.maxRequestKb = Number(args.shift());
    else { console.error(`unknown argument ${a}`); return 2; }
  }
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (err) { console.error(`cannot read ${file}: ${err.message}`); return 2; }
  const events = parseLog(text);
  if (!events.length) { console.error(`no CMW_GESTURE or CMW_RUN_* line in ${file} - wrong capture?`); return 2; }
  const r = judge(events, opts);
  console.log(JSON.stringify(r, null, 2));
  console.log(`L4 ${r.verdict}`);
  return r.verdict === 'PASS' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
