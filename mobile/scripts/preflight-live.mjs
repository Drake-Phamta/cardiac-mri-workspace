#!/usr/bin/env node
/*
 * Live preflight - run on the LAPTOP before the phone session (S-1, T-10 min).
 * Drives the backend exactly the way the app does - the same createRuntime,
 * V1 model, runtime.content (checksum + ETag) and maskPng.js - and says
 * whether the APK built from this checkout can work against it.
 *
 *   node mobile/scripts/preflight-live.mjs [--case CASE_0061] [--variant RAW]
 *
 * The backend URL comes from EXPO_PUBLIC_API_BASE_URL or the untracked
 * mobile/.env.local (the same place build-release.ps1 reads it) and is NEVER
 * printed: output names it http://<configured>. The study comes from
 * CMW_STUDY_ID (env or .env.local).
 *
 * It checks, in order (stopping at the first failure that makes the rest
 * meaningless):
 *   P1  /health answers, and the backend's contract_version equals the
 *       contract this checkout bundles (a mismatch = CONTRACT_DRIFT in the app)
 *   P2  study_get and case_list answer, and the rows carry a known mode
 *   P3  the case exists with usable ground truth and at least one run
 *   P4  the V1 model opens the case at its middle slice
 *   P5  the MRI, prediction and ground-truth bytes arrive and hash to their
 *       checksums; both masks decode under maskPng.js's contract rules
 *   P6  the next slice costs per-slice requests only; going back costs none
 * Exit 0 = PASS, 1 = FAIL, 2 = not configured (no URL, or one that is not a
 * usable http(s) base URL). Nothing is written anywhere.
 *
 * Mask decoding (P5) needs fast-png: run it from a checkout with `npm ci` done
 * in mobile/ (the build's staging copy has one); without it P5 says so and
 * checks the MRI bytes only. Tested in test/preflight.test.mjs (no backend
 * needed: P1 paths, argument handling, and that the address is never printed).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { STATE } from '../../app/core/index.mjs';
import { createCaseExplorer } from '../../app/verticals/v1_case_explorer/index.mjs';
import { API_BASE_URL_ENV, maskBaseUrl, parseEnvFile, resolveConfig } from '../src/config.mjs';
import { disagreementRuns } from '../src/imaging/maskPaths.mjs';
import { createRuntime } from '../src/runtime/createRuntime.mjs';
import { capabilityOf, readCaseRows } from '../src/verticals/v1/capability.mjs';
import { PER_SLICE_ENDPOINTS } from './l4-report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(here, '..');
const repoRoot = resolve(mobileRoot, '..');

function args(argv) {
  const out = { caseId: 'CASE_0061', variant: 'RAW' };
  const value = (i) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${argv[i]} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--case') { out.caseId = value(i); i += 1; }
    else if (argv[i] === '--variant') { out.variant = value(i); i += 1; }
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

async function main() {
  const opts = args(process.argv.slice(2));
  const envFile = existsSync(join(mobileRoot, '.env.local')) ? parseEnvFile(readFileSync(join(mobileRoot, '.env.local'), 'utf8')) : {};
  const url = process.env[API_BASE_URL_ENV] || envFile[API_BASE_URL_ENV];
  const studyId = process.env.CMW_STUDY_ID || envFile.CMW_STUDY_ID || undefined;
  if (!url) {
    console.error(`preflight: no backend URL - set ${API_BASE_URL_ENV} in mobile/.env.local (untracked) or the environment`);
    return 2;
  }
  let config;
  try {
    config = resolveConfig({ mode: 'live', apiBaseUrl: url, studyId });
  } catch (err) {
    // ConfigError messages quote the value; a malformed address is still an
    // address, so it is cut out before printing.
    console.error(`preflight: the configured backend URL is not usable - ${String(err.message).split(url).join('<the configured value>')}`);
    return 2;
  }
  const contractJson = JSON.parse(readFileSync(join(repoRoot, 'contracts', 'api', 'contract.json'), 'utf8'));
  let decodeMask = null;
  try {
    ({ decodeMaskPng: decodeMask } = await import(pathToFileURL(join(mobileRoot, 'src', 'imaging', 'maskPng.js')).href));
  } catch (_err) {
    console.log('preflight: fast-png is not installed (run `npm ci` in mobile/) - mask decoding (P5) is skipped');
  }
  const lines = [];
  const runtime = createRuntime({ config, contractJson, decodeMask, log: (l) => lines.push(l) });
  const c = runtime.client;
  let failures = 0;
  const check = (id, ok, detail) => { if (!ok) failures += 1; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id} ${detail}`); return ok; };
  console.log(`preflight: backend ${maskBaseUrl(config.apiBaseUrl)} · study ${config.studyId} · case ${opts.caseId} · ${opts.variant}`);

  // P1 - reachable, same contract
  let res;
  let health;
  try {
    res = await fetch(`${config.apiBaseUrl}/health`, { signal: AbortSignal.timeout(config.timeoutMs) });
  } catch (err) {
    check('P1', false, `/health did not answer (${err.name}) - overlay down, backend stopped, or wrong URL`);
    return 1;
  }
  try {
    health = await res.json();
  } catch (_err) {
    check('P1', false, `/health answered HTTP ${res.status} but not with JSON - is the configured URL the backend?`);
    return 1;
  }
  const same = health.contract_version === contractJson.contract_version;
  if (!check('P1', health.status === 'ok' && same,
    `/health ${health.status}; backend contract ${health.contract_version}, this checkout ${contractJson.contract_version}${same ? '' : ' - REBUILD from a checkout with the backend\'s contract'}`)) return 1;

  // P2 - study and list
  const study = await c.call('study_get', { study_id: config.studyId });
  check('P2', study.state === STATE.SUCCESS, `study_get -> ${study.state} ${study.reason || ''}`);
  const list = await c.call('case_list', { study_id: config.studyId });
  const rows = list.state === STATE.SUCCESS ? readCaseRows(list.data) : null;
  check('P2', rows && rows.rows.length > 0 && rows.counts.UNKNOWN === 0,
    `case_list -> ${list.state} ${list.reason || ''}${rows ? ` · ${rows.counts.total} rows · ${rows.counts.EVALUATION} evaluation · ${rows.counts.INFERENCE_REVIEW} inference & review` : ''}`);

  // P3 - the case
  const kase = await c.call('case_get', { case_id: opts.caseId });
  if (!check('P3', kase.state === STATE.SUCCESS, `case_get ${opts.caseId} -> ${kase.state} ${kase.reason || ''}`)) return 1;
  const cap = capabilityOf(kase.data.mode, kase.data.ground_truth_available);
  const runId = Array.isArray(kase.data.available_run_ids) ? kase.data.available_run_ids[0] : null;
  const gtNote = cap.groundTruthUsable ? '' : ' · no ground truth: ground-truth checks skipped';
  check('P3', cap.consistent && runId,
    `${cap.label}${cap.consistent ? '' : ` (${cap.problem})`} · run ${runId || 'none'} · shape ${JSON.stringify(kase.data.shape)}${gtNote}`);
  if (!runId) return 1;

  // P4 - open like SCR-03
  const total = kase.data.shape[2];
  const z0 = Math.floor(total / 2);
  const size = { width: kase.data.shape[0], height: kase.data.shape[1] };
  const model = createCaseExplorer(runtime.sliceClient, { variant: opts.variant });
  runtime.netLog.begin({ caseId: opts.caseId, to: z0, kind: 'open' });
  const s = await model.open({ caseId: opts.caseId, runId, sliceIndex: z0 });
  if (!check('P4', s.view.state === STATE.SUCCESS,
    `V1 model open at slice ${z0 + 1}/${total} -> ${s.view.state} ${s.view.reason || ''} ${JSON.stringify(s.view.error?.detail?.problems || '')}`)) return 1;

  // P5 - bytes and masks
  const mri = await runtime.imageStore.load(s.imageRef.contentUrl, { checksum: s.imageRef.checksum }).catch((e) => ({ error: e.message }));
  check('P5', !mri.error, `MRI ${mri.error || `${mri.bytes} bytes, checksum verified`}`);
  if (decodeMask) {
    const load = (ref) => (ref && ref.contentUrl
      ? runtime.maskStore.load(ref.contentUrl, size, { checksum: ref.checksum }).catch((e) => ({ error: e.message }))
      : Promise.resolve({ error: 'no ref' }));
    const [pred, gt] = await Promise.all([
      load(s.predictionRef), cap.groundTruthUsable ? load(s.groundTruthRef) : Promise.resolve({ skipped: true }),
    ]);
    const gtText = gt.skipped ? 'not served (no ground truth)' : (gt.error || `${gt.pixels} px`);
    check('P5', !pred.error && !gt.error, `masks: prediction ${pred.error || `${pred.pixels} px`} · ground truth ${gtText}`);
    if (!pred.error && !gt.error && !gt.skipped) {
      const d = disagreementRuns(gt.mask, pred.mask).counts;
      console.log(`       slice ${z0}: TP ${d.tp} · FP ${d.fp} · FN ${d.fn} px (drawn by SCR-04)`);
    }
  }
  runtime.netLog.end();

  // P6 - one new slice, then back
  runtime.netLog.begin({ caseId: opts.caseId, from: z0, to: z0 + 1 });
  const s1 = await model.goToSlice(z0 + 1);
  if (s1.view.state === STATE.SUCCESS && s1.imageRef && s1.imageRef.contentUrl) {
    await runtime.imageStore.load(s1.imageRef.contentUrl, { checksum: s1.imageRef.checksum }).catch(() => null);
  }
  const g1 = runtime.netLog.end();
  const notPerSlice = g1.requests.filter((q) => !PER_SLICE_ENDPOINTS.includes(q.endpoint));
  check('P6', s1.view.state === STATE.SUCCESS && notPerSlice.length === 0 && g1.bytes_total < 500 * 1024,
    `new slice: ${g1.requests.length} requests, ${Math.round(g1.bytes_total / 1024)} KB${notPerSlice.length ? `, NOT per-slice: ${notPerSlice.map((q) => q.endpoint).join(', ')}` : ', all per-slice'}`);
  runtime.netLog.begin({ caseId: opts.caseId, from: z0 + 1, to: z0 });
  await model.goToSlice(z0);
  await runtime.imageStore.load(s.imageRef.contentUrl, { checksum: s.imageRef.checksum }).catch(() => null);
  const g2 = runtime.netLog.end();
  check('P6', g2.cache_hit && g2.bytes_total === 0, `back to slice ${z0 + 1}: ${g2.requests.length} requests, ${g2.bytes_total} bytes (must be 0)`);

  console.log(failures === 0 ? 'PREFLIGHT PASS' : `PREFLIGHT FAIL - ${failures}`);
  return failures === 0 ? 0 : 1;
}

// exitCode, not exit(): on Windows a process.exit() while fetch's sockets are
// closing trips a libuv assertion after the verdict is printed.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (err) => { console.error(`preflight: ${err.message}`); process.exitCode = 1; });
}
