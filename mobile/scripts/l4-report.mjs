#!/usr/bin/env node
/*
 * L4 report - reads a logcat capture from the S-1 session and judges
 * NFR-PERF-001 limb 2, "a slice gesture never triggers a full-volume
 * transfer", from the CMW_GESTURE lines the app wrote. Runs on the LAPTOP:
 * the phone computes nothing.
 *
 *   node mobile/scripts/l4-report.mjs <logcat.txt> [--max-gesture-kb 500] [--max-request-kb 2048]
 *
 * PASS needs every rule below (mobile/S1_L4_SCRIPT.md has the same table):
 *   R1 per-slice only - every request of a slice gesture is one of the
 *      per-slice endpoints or a per-slice artifact; nothing case- or
 *      volume-level;
 *   R2 bounded - no slice gesture received more than --max-gesture-kb;
 *   R3 no volume, absolute - no single response exceeded --max-request-kb (a
 *      576 x 576 x 88 volume is ~29 MB raw; one slice PNG is ~0.1-0.3 MB);
 *   R4 no volume, relative - no response is more than 10x the median of the
 *      same endpoint in this capture (and above 32 KB): a mask "volume" of
 *      88 x 2 KB fits under R2/R3 but not under this;
 *   R5 measured - every new-15 gesture went to the network (cache_hit false),
 *      ended "shown", and carries mri_slice_get and artifact:mri with more than
 *      0 bytes: a pass in which nothing was fetched or the MRI never arrived
 *      measured nothing and cannot pass;
 *   R6 undisturbed - inside the L4 passes: no superseded gesture, no
 *      CMW_STEP_TIMEOUT, only slice gestures, each ending "shown";
 *   R7 revisits free - every revisit-15 gesture is a cache hit with 0 bytes;
 *   R8 complete - exactly 15 + 15 gestures, so a short capture cannot pass by
 *      having nothing in it.
 * A capture without L4 run markers (the manual fallback) cannot tell new
 * slices from revisits: unless R1-R4 already fail it, the verdict is
 * CANNOT_JUDGE (manual), never PASS and never a silent FAIL.
 * Bytes per switch are reported as n / p50 / p95 / max (nearest-rank, Spike A's
 * definition), with the full-volume reference: slices x median new slice.
 *
 * Exit status: 0 PASS, 1 FAIL, 2 unusable input or CANNOT_JUDGE.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nearestRank } from './slice-timing-report.mjs';

export const PER_SLICE_ENDPOINTS = Object.freeze([
  'mri_slice_get', 'prediction_slice_get', 'ground_truth_slice_get', 'analysis_slice_metrics',
  'analysis_slice_error', 'reviewed_mask_slice_get', 'artifact:mri', 'artifact:mask',
]);

function jsonAfter(line, tag) {
  const i = line.indexOf(`${tag} `);
  if (i === -1) return null;
  try { return JSON.parse(line.slice(i + tag.length + 1).trim()); } catch (_err) { return { unparsable: true, raw: line }; }
}

// Logcat text -> the events in order: gestures, run markers, step timeouts.
export const LOG_TAGS = Object.freeze(['CMW_GESTURE', 'CMW_RUN_START', 'CMW_RUN_END', 'CMW_STEP_TIMEOUT']);

export function parseLog(text) {
  const events = [];
  for (const line of String(text).split(/\r?\n/)) {
    for (const tag of LOG_TAGS) {
      const v = jsonAfter(line, tag);
      if (v) { events.push({ tag, ...v }); break; }
    }
  }
  return events;
}

const kb = (n) => (n === null ? null : Math.round((n / 1024) * 10) / 10);

// n / p50 / p95 / max of a list of byte counts, in KB, nearest-rank.
export function byteStats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); // nearestRank wants it sorted
  if (!v.length) return null;
  return { n: v.length, p50: kb(nearestRank(v, 50)), p95: kb(nearestRank(v, 95)), max: kb(Math.max(...v)) };
}

export function judge(events, {
  maxGestureKb = 500, maxRequestKb = 2048, relativeLimit = 10, relativeFloorKb = 32,
} = {}) {
  const problems = [];
  const gestures = [];
  const timeouts = [];
  let pass = null;
  let markers = 0;
  let nz = null;
  for (const e of events) {
    if (e.unparsable) { problems.push(`unparsable line: ${String(e.raw).slice(0, 120)}`); continue; }
    if (e.tag === 'CMW_RUN_START') {
      pass = e.run === 'L4' ? e.pass : null;
      if (e.run === 'L4') { markers += 1; if (Number.isInteger(e.nz)) nz = e.nz; }
      continue;
    }
    if (e.tag === 'CMW_RUN_END') { pass = null; continue; }
    if (e.tag === 'CMW_STEP_TIMEOUT') { if (pass) timeouts.push({ ...e, l4pass: pass }); continue; }
    gestures.push({ ...e, l4pass: pass });
  }
  const slice = gestures.filter((g) => g.kind === 'slice');
  const inL4 = gestures.filter((g) => g.l4pass);
  const fresh = slice.filter((g) => g.l4pass === 'new-15');
  const revisit = slice.filter((g) => g.l4pass === 'revisit-15');
  const tag = (g) => `gesture ${g.seq} (${g.from}->${g.to})`;

  // R1, R2 - per-slice only, bounded
  for (const g of slice) {
    const bad = (g.requests || []).filter((q) => !PER_SLICE_ENDPOINTS.includes(q.endpoint));
    if (bad.length) problems.push(`R1 ${tag(g)} asked ${bad.map((q) => q.endpoint).join(', ')} - not per-slice`);
    if (g.bytes_total > maxGestureKb * 1024) problems.push(`R2 ${tag(g)} received ${g.bytes_total} bytes > ${maxGestureKb} KB`);
  }
  // R3, R4 - no volume-sized response, absolute and relative to the endpoint's median
  const byEndpoint = new Map();
  for (const g of gestures) {
    for (const q of g.requests || []) {
      if (q.bytes > maxRequestKb * 1024) problems.push(`R3 gesture ${g.seq}: ${q.endpoint} answered ${q.bytes} bytes > ${maxRequestKb} KB (volume-sized)`);
      if (q.bytes === null && q.status === 200) problems.push(`R3 gesture ${g.seq}: ${q.endpoint} size unknown (no Content-Length, no body count)`);
      if (Number.isFinite(q.bytes) && q.bytes > 0) {
        if (!byEndpoint.has(q.endpoint)) byEndpoint.set(q.endpoint, []);
        byEndpoint.get(q.endpoint).push(q.bytes);
      }
    }
  }
  const medians = {};
  for (const [endpoint, sizes] of byEndpoint) medians[endpoint] = nearestRank([...sizes].sort((a, b) => a - b), 50);
  for (const g of gestures) {
    for (const q of g.requests || []) {
      const m = medians[q.endpoint];
      if (Number.isFinite(q.bytes) && m && q.bytes > relativeLimit * m && q.bytes > relativeFloorKb * 1024) {
        problems.push(`R4 gesture ${g.seq}: ${q.endpoint} answered ${q.bytes} bytes = ${(q.bytes / m).toFixed(1)}x its median ${m} - volume-like`);
      }
    }
  }

  const manual = markers === 0;
  if (!manual) {
    // R5 - the new-15 pass measured something real
    for (const g of fresh) {
      const reqs = g.requests || [];
      const got = (endpoint) => reqs.some((q) => q.endpoint === endpoint && q.bytes > 0);
      const missing = ['mri_slice_get', 'artifact:mri'].filter((endpoint) => !got(endpoint));
      if (g.cache_hit !== false) problems.push(`R5 new-15 ${tag(g)} asked the network nothing - a new slice cannot be a cache hit`);
      if (missing.length) problems.push(`R5 new-15 ${tag(g)} has no ${missing.join(' / ')} with bytes - the MRI never arrived`);
    }
    // R6 - undisturbed
    for (const g of inL4) {
      if (g.kind !== 'slice') problems.push(`R6 ${tag(g)} is a "${g.kind}" gesture inside the L4 ${g.l4pass} pass - the run was disturbed`);
      if (g.outcome !== 'shown') problems.push(`R6 ${tag(g)} in the L4 ${g.l4pass} pass ended "${g.outcome}", not "shown"`);
    }
    for (const t of timeouts) problems.push(`R6 CMW_STEP_TIMEOUT in the L4 ${t.l4pass} pass at slice ${t.slice} (waited ${t.waited_ms} ms)`);
    // R7 - revisits free
    for (const g of revisit) {
      if (!g.cache_hit || g.bytes_total !== 0) problems.push(`R7 revisit ${tag(g)} was not free: ${g.bytes_total} bytes in ${(g.requests || []).length} requests`);
    }
    // R8 - complete
    if (fresh.length !== 15) problems.push(`R8 L4 new-15 pass has ${fresh.length} gestures, expected 15`);
    if (revisit.length !== 15) problems.push(`R8 L4 revisit-15 pass has ${revisit.length} gestures, expected 15`);
  }

  let verdict = problems.length === 0 ? 'PASS' : 'FAIL';
  if (manual && verdict === 'PASS') verdict = 'CANNOT_JUDGE';
  const newStats = byteStats(fresh.map((g) => g.bytes_total));
  return Object.freeze({
    verdict,
    note: manual
      ? 'manual: cannot judge - no L4 run markers, so new slices and revisits cannot be told apart (R5-R8 not judged). Rerun with the long-press "L4 15 + 15".'
      : null,
    problems,
    counts: {
      gestures: gestures.length,
      slice_gestures: slice.length,
      l4_new: fresh.length,
      l4_revisit: revisit.length,
      superseded: gestures.filter((g) => g.outcome === 'superseded').length,
      step_timeouts_in_l4: timeouts.length,
      revisit_cache_hits: revisit.filter((g) => g.cache_hit && g.bytes_total === 0).length,
    },
    bytes_per_switch_kb: {
      new_15: newStats,
      revisit_15: byteStats(revisit.map((g) => g.bytes_total)),
      all_slice_gestures: byteStats(slice.map((g) => g.bytes_total)),
    },
    endpoint_median_bytes: medians,
    max_request_kb: kb(Math.max(0, ...gestures.flatMap((g) => (g.requests || []).map((q) => q.bytes || 0)))),
    // How far one switch is from a whole volume at this capture's per-slice size.
    full_volume_reference: nz && newStats ? {
      slices: nz,
      median_new_slice_kb: newStats.p50,
      full_volume_kb: Math.round(nz * newStats.p50 * 10) / 10,
      largest_switch_share: Math.round((newStats.max / (nz * newStats.p50)) * 1000) / 1000,
    } : null,
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
  const s = r.bytes_per_switch_kb.new_15;
  if (s) console.log(`bytes per new slice switch (KB, nearest-rank): n ${s.n} | p50 ${s.p50} | p95 ${s.p95} | max ${s.max}`);
  const ref = r.full_volume_reference;
  if (ref) {
    console.log(`reference: one full volume ~ ${ref.slices} x ${ref.median_new_slice_kb} KB = ${ref.full_volume_kb} KB; `
      + `the largest new-slice switch moved ${s.max} KB (${(ref.largest_switch_share * 100).toFixed(1)} % of it)`);
  }
  if (r.note) console.log(r.note);
  console.log(`L4 ${r.verdict}`);
  if (r.verdict === 'PASS') return 0;
  return r.verdict === 'CANNOT_JUDGE' ? 2 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
