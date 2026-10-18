/*
 * Render-smoke harness, part 2: the checks.  npm run test:render  (from mobile/)
 *
 * TEST-ONLY. It needs node_modules (react-test-renderer is a devDependency,
 * deprecated upstream), so CI runs it in its own job, mobile-render-bundle,
 * after `npm ci --ignore-scripts` from the lockfile (DR-021 rule 4); the
 * other CI jobs have no node_modules. It renders the real shell, V1 and V3
 * screens in Node with host-string React Native stand-ins (hooks.mjs), a real
 * app/core runtime, and either the generated fixture bundle or a fake live
 * backend whose PNGs are encoded here with node:zlib.
 *
 * What a PASS means: the screens' LOGIC renders and reacts as described - the
 * navigator, the states, the variant rule, the slice cache, the byte counts.
 * What it does NOT mean: anything about a device. No frame, gesture, decode
 * time or network on a phone is measured here; that evidence is logcat from
 * the A17 (mobile/S1_L4_SCRIPT.md).
 */

import { createHash } from 'node:crypto';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { MOBILE } from './hooks.mjs';

globalThis.__DEV__ = false;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
const logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.join(' ')); };
const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (ms = 30) => { await act(async () => { await sleep(ms); }); };
const textOf = (node) => (node.children || []).map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const texts = (r) => r.root.findAll((n) => n.type === 'Text').map(textOf);
const has = (r, re) => texts(r).some((t) => re.test(t));
const nodeMock = { createNodeMock: () => ({ measure: (cb) => cb(0, 0, 400, 400, 0, 0) }) };
async function layout(r) {
  const views = r.root.findAll((n) => typeof n.type === 'string' && typeof n.props.onLayout === 'function');
  await act(async () => { for (const v of views) v.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } } }); });
}
async function press(r, label) {
  const hits = r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).includes(label));
  if (!hits.length) throw new Error(`no button "${label}"; texts: ${texts(r).slice(0, 40).join(' | ')}`);
  await act(async () => { hits[0].props.onPress(); });
}
const gestures = () => logs.filter((l) => l.startsWith('CMW_GESTURE ')).map((l) => JSON.parse(l.slice(12)));
let failures = 0;
let count = 0;
const check = (id, ok, detail) => { count += 1; if (!ok) failures += 1; origLog(`  ${ok ? 'ok  ' : 'FAIL'} ${id} ${detail}`); };

const imp = (p) => import(new URL(p, `file:///${MOBILE.replace(/\\/g, '/')}/`).href);
const { resolveConfig } = await imp('src/config.mjs');
const { createRuntime } = await imp('src/runtime/createRuntime.mjs');
const { RuntimeProvider } = await imp('src/runtime/RuntimeContext.js');
const NavigatorView = (await imp('src/nav/NavigatorView.js')).default;
const CaseExplorerScreen = (await imp('src/verticals/v1/CaseExplorerScreen.js')).default;
const ExperimentComparisonScreen = (await imp('src/verticals/v3/ExperimentComparisonScreen.js')).default;
const { decodeMaskPng } = await imp('src/imaging/maskPng.js');
const { encodePng, ellipseMask } = await imp('test/_png.mjs');
const { generatedBundleJson, readContractJson } = await imp('test/_helpers.mjs');
const { judge, parseLog, PER_SLICE_ENDPOINTS } = await imp('scripts/l4-report.mjs');

const contractJson = readContractJson();
const bundleJson = generatedBundleJson();

// ---- 1. fixture runtime through the real navigator -------------------------
{
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson });
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(NavigatorView, { runtime, initialScreenId: 'SCR-01' })), nodeMock);
  });
  await tick();
  check('S1', has(r, /SCR-01 · V3/) && has(r, /Study Overview/), 'root is SCR-01 Study Overview');
  check('S1', has(r, /FIXTURE/), 'fixture badge visible');

  await press(r, 'Cases');
  await tick(60);
  check('S2', has(r, /SCR-02 · V1/) && has(r, /Case List/), 'Cases tab opens SCR-02');
  check('S2', has(r, /Study STUDY_DEMO/), 'study id shown');

  const input = r.root.findAll((n) => n.type === 'TextInput')[0];
  await act(async () => { input.props.onChangeText('CASE_0043'); });
  await tick();
  await press(r, 'Open CASE_0043 directly');
  await tick(60);
  check('S3', has(r, /SCR-03 · V1/) && has(r, /Case Explorer/), 'SCR-03 opened from the list');
  check('S3', has(r, /Prediction variant/) && has(r, /No default/), 'variant chooser asks (no default)');
  await press(r, 'RAW');
  await tick(150);
  await layout(r);
  await tick(60);
  check('S4', has(r, /slice 45 \/ 88 {2}\(z = 44\)/), `opens on the middle slice: ${texts(r).find((t) => t.startsWith('slice')) || '-'}`);
  check('S4', has(r, /Prediction \(RAW\)/), 'prediction layer labelled with the variant');
  check('S4', has(r, /Fixture mode: no pixels/), 'fixture mode says there are no pixels');
  check('S4', gestures().length === 0, 'fixture mode writes no CMW_GESTURE line (no network to account for)');
  await press(r, '▶');
  await tick(150);
  check('S5', has(r, /slice 46 \/ 88/), 'step button moves one slice');
  await press(r, '+10');
  await tick(150);
  check('S5', has(r, /slice 56 \/ 88/), '+10 moves ten slices');
  await press(r, 'PROCESSED');
  await tick(200);
  check('S6', has(r, /Cannot show this safely/), 'fixture serves RAW for a PROCESSED request -> blocked, not relabelled');
  await press(r, 'RAW');
  await tick(200);
  check('S6', has(r, /slice 56 \/ 88/) && !has(r, /Cannot show this safely/), 'back on RAW the viewer returns');
  const slices = logs.filter((l) => l.startsWith('CMW_SLICE '));
  check('S7', slices.length >= 2, `CMW_SLICE timing lines logged: ${slices.length}`);

  await press(r, '‹ Back');
  await tick(60);
  check('S8', has(r, /SCR-02 · V1/), 'Back returns to the list');
  await press(r, 'Findings');
  await tick();
  check('S8', has(r, /SCR-08 · V4/), 'Findings tab -> SCR-08 placeholder');
  await act(async () => { r.unmount(); });
}

// The worst-slice block the fake backend serves. Deliberately NOT in DR-010
// order (#78 QA N-1): DR-010 would rank z 44 (Dice 0.31) before z 52 (Dice
// 0.62), so a phone that re-ranked would show z 44 first.
const SERVED_WORST = Object.freeze({
  rule_id: 'DR-010', selection_version: 'dr010-worst-slice/v1',
  slices: [
    { slice_index: 52, dice: 0.62, false_positives: 120, false_negatives: 340 },
    { slice_index: 44, dice: 0.31, false_positives: 7, false_negatives: 9 },
    { slice_index: 30, dice: 0.7, false_positives: 3, false_negatives: 4 },
  ],
});

// A fake live backend: every JSON body is the GENERATED scenario's, with only
// the fields a check is about overridden; every PNG is encoded here by
// node:zlib and served with its real sha256 checksum and ETag. Predictions and
// run metrics answer the variant asked for, unless `metricsVariant` names the
// one the run metrics should answer instead (#78 QA B-3). The per-slice metrics
// of the slices in `metricsMissingAt` answer ARTIFACT_NOT_FOUND - a legitimately
// unavailable answer the slice cache keeps (#78 QA N-4).
function fakeBackend({ caseMode = 'EVALUATION', metricsVariant = null, selection = SERVED_WORST, metricsMissingAt = [] } = {}) {
  const W = 576; const H = 576;
  const gen = (id) => ({ ...bundleJson.scenarios[id].default.response.data });
  const gtPng = encodePng(W, H, 0, ellipseMask(W, H, 300, 260, 70, 55));
  const predPng = encodePng(W, H, 0, ellipseMask(W, H, 310, 262, 66, 58));
  const mriPng = encodePng(W, H, 0, Uint8Array.from({ length: W * H }, (_, i) => (i * 7) & 0xff), { zopts: { level: 9 } });
  const sum = (b) => `sha256:${createHash('sha256').update(b).digest('hex')}`;
  const json = (status, body) => {
    const text = JSON.stringify(body);
    return {
      status,
      headers: { get: (k) => ({ 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })[k.toLowerCase()] ?? null },
      text: async () => text,
      json: async () => body,
    };
  };
  const gtAvailable = caseMode === 'EVALUATION';
  const requests = [];
  let failSlice = null; // a slice whose every request fails like a dropped network
  const fetchImpl = async (url) => {
    requests.push(url);
    const path = url.replace('http://backend.invalid:8000', '');
    if (failSlice !== null && path.includes(`/slices/${failSlice}/`)) throw new TypeError('fetch failed');
    if (path.startsWith('/api/v1/artifacts/')) {
      const bytes = path.includes('gt-') ? gtPng : (path.includes('pred-') ? predPng : mriPng);
      return { status: 200, headers: { get: (k) => ({ 'content-type': 'image/png', etag: `"${sum(bytes)}"` })[k.toLowerCase()] ?? null }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }
    if (/\/cases\/[^/]+$/.test(path)) return json(200, { ...gen('case_get'), case_id: 'CASE_0061', mode: caseMode, ground_truth_available: gtAvailable, available_run_ids: ['RUN_A'] });
    if (/\/analysis-runs\/[^/]+$/.test(path)) return json(200, { ...gen('analysis_run_get'), run_id: 'RUN_A', case_id: 'CASE_0061', status: 'SUCCEEDED', precomputed: true, reconstruction_ids: ['REC_1'] });
    if (/\/experiments\/[^/]+$/.test(path)) return json(200, { ...gen('experiment_get'), model_family: 'UNet2D' });
    if (/\/analysis-runs\/[^/]+\/metrics\?/.test(path)) {
      if (!gtAvailable) return json(404, { error: { code: 'GROUND_TRUTH_UNAVAILABLE', message: 'no GT' } });
      const asked = (path.match(/[?&]prediction_variant=([A-Z_]+)/) || [])[1] || null;
      return json(200, {
        ...gen('analysis_run_metrics'), prediction_variant: metricsVariant ?? asked, metric_state: 'COMPUTED', metric_version: 'm1',
        metric_values: { dice: 0.81, iou: 0.68, false_positives: 1200, false_negatives: 900, relative_volume_error: -4.2 },
        worst_slice_selection: selection,
      });
    }
    const z = (path.match(/slices\/(\d+)/) || [])[1];
    if (path.endsWith('/mri')) return json(200, { ...gen('mri_slice_get'), content_url: `/api/v1/artifacts/mri-${z}.png`, media_type: 'image/png', checksum: sum(mriPng) });
    if (path.includes('/prediction?')) return json(200, { ...gen('prediction_slice_get'), prediction_variant: (path.match(/[?&]variant=([A-Z_]+)/) || [])[1] || null, content_url: `/api/v1/artifacts/pred-${z}.png`, media_type: 'image/png', checksum: sum(predPng) });
    if (path.endsWith('/ground-truth')) {
      if (!gtAvailable) return json(404, { error: { code: 'GROUND_TRUTH_UNAVAILABLE', message: 'no GT' } });
      return json(200, { ...gen('ground_truth_slice_get'), content_url: `/api/v1/artifacts/gt-${z}.png`, media_type: 'image/png', checksum: sum(gtPng) });
    }
    if (path.includes('/metrics?') && metricsMissingAt.includes(Number(z))) {
      return json(404, { error: { code: 'ARTIFACT_NOT_FOUND', message: 'slice metrics not ingested' } });
    }
    if (path.includes('/metrics?')) return json(200, { ...gen('analysis_slice_metrics'), metric_state: 'COMPUTED', metric_value: 0.8731, metric_version: 'm1' });
    return json(404, { error: { code: 'ARTIFACT_NOT_FOUND' } });
  };
  return { fetchImpl, requests, mriPng, predPng, gtPng, setFailSlice: (z) => { failSlice = z; } };
}

const liveRuntime = (fetchImpl) => createRuntime({
  config: resolveConfig({ mode: 'live', apiBaseUrl: 'http://backend.invalid:8000' }),
  contractJson, fetchImpl, decodeMask: decodeMaskPng, log: (line) => logs.push(line),
});

// ---- 2. live runtime with a fake backend: bytes, overlays, gesture log ------
{
  // z 45's slice metrics are not ingested: its cached "unavailable" answer must
  // outlive a Retry and a refresh of other slices (L9, #78 QA N-4).
  const { fetchImpl, requests, mriPng, setFailSlice } = fakeBackend({ metricsMissingAt: [45] });
  const runtime = liveRuntime(fetchImpl);
  const nav = { push: () => true, pop: () => true, replace: () => true, reset: () => true, canGoBack: true };
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(CaseExplorerScreen, { runtime, nav, params: { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW' } })), nodeMock);
  });
  await tick(300);
  await layout(r);
  await tick(200);
  check('L1', has(r, /slice 45 \/ 88/), 'live: opens on the middle slice');
  check('L1', has(r, /Run RUN_A · UNet2D · .* · precomputed/), `run line: ${texts(r).find((t) => t.startsWith('Run ')) || '-'}`);
  check('L1', has(r, /Slice Dice \(RAW\): 0\.873 · metric m1/), 'server metric shown with variant and version');
  const img = () => r.root.findAll((n) => n.type === 'Image')[0];
  check('L2', img() && img().props.source.uri.startsWith('data:image/png;base64,'), 'MRI drawn from fetched bytes (data URI)');
  check('L2', requests.some((u) => u.endsWith('/api/v1/artifacts/mri-44.png')), 'the bytes came from base URL + content_url');
  let paths = r.root.findAll((n) => n.type === 'Path').map((n) => n.props.d.length);
  check('L3', paths.length === 1 && paths[0] > 100, `prediction overlay drawn as one path (${paths.join(',')} chars)`);
  await press(r, 'Ground truth: OFF');
  await tick(250);
  paths = r.root.findAll((n) => n.type === 'Path').map((n) => n.props.d.length);
  check('L3', paths.length === 2, `ground-truth overlay added (${paths.length} paths)`);
  await act(async () => { img().props.onLoad({ nativeEvent: { source: { width: 576, height: 576 } } }); });
  await tick(30);

  const open = gestures().find((g) => g.kind === 'open');
  check('L4', open && open.requests.length >= 5 && open.requests.every((q) => q.bytes > 0),
    `open gesture: ${open ? open.requests.length : 0} requests, every one with a byte count`);

  await press(r, '▶');
  await tick(350);
  check('L5', img().props.source.uri.startsWith('data:') && has(r, /slice 46 \/ 88/), 'next slice displayed');
  const fresh = gestures().filter((g) => g.kind === 'slice').pop();
  const endpoints = fresh ? fresh.requests.map((q) => q.endpoint).sort().join(',') : '';
  check('L5', fresh && fresh.from === 44 && fresh.to === 45 && !fresh.cache_hit, `new slice gesture z 44->45: ${endpoints}`);
  check('L5', fresh && fresh.requests.some((q) => q.endpoint === 'artifact:mri' && q.bytes === mriPng.length),
    `MRI bytes counted exactly (${mriPng.length})`);
  check('L5', fresh && fresh.requests.every((q) => q.endpoint !== 'case_get'), 'no case-level or volume request per slice gesture');

  const before = requests.length;
  await press(r, '◀');
  await tick(350);
  const sent = requests.slice(before);
  const revisit = gestures().filter((g) => g.kind === 'slice').pop();
  check('L6', sent.length === 0, `back to z 44: ${sent.length} requests of any kind`);
  check('L6', revisit && revisit.cache_hit === true && revisit.bytes_total === 0 && revisit.from === 45 && revisit.to === 44,
    `revisit gesture is a cache hit with 0 bytes: ${revisit ? JSON.stringify({ cache_hit: revisit.cache_hit, bytes: revisit.bytes_total }) : '-'}`);
  await act(async () => { img().props.onLoad({ nativeEvent: { source: { width: 575, height: 576 } } }); });
  await tick(30);
  check('L7', has(r, /575x576 but the case geometry says 576x576/), 'an MRI of the wrong size blocks the overlays and says why');
  check('L7', r.root.findAll((n) => n.type === 'Path').length === 0, 'and no overlay is drawn over it');

  // #77 QA B-3: a slice that fails shows nothing of the slice displayed before.
  const entry = (label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label))[0];
  check('L8', has(r, /^MRI .+ · .+/) && !has(r, /^MRI - · -$/) && entry('Error inspector').props.disabled === false,
    'before: provenance and the SCR-04 entry belong to the displayed slice');
  setFailSlice(43);
  await press(r, '◀');
  await tick(350);
  check('L8', has(r, /could not be reached/) && has(r, /^Slice Dice: -$/) && !has(r, /0\.873/),
    'slice 44 fails: the state panel shows and the metric reads "-", not the previous slice\'s Dice');
  check('L8', has(r, /^MRI - · -$/) && has(r, /^Prediction - - · -$/) && has(r, /^Ground truth - · -$/),
    'provenance reads "-" for every layer');
  const off = ['Error inspector (SCR-04)', '3D (SCR-05)', 'Review / correct (SCR-06)'].map((l) => entry(l));
  check('L8', off.every((e) => e && e.props.disabled === true && textOf(e).includes('this slice did not load')),
    'SCR-04/05/06 entries disabled with the reason');
  setFailSlice(null);
  let mark = requests.length;
  await press(r, 'Retry');
  await tick(400);
  const retried = requests.slice(mark).map((u) => u.replace('http://backend.invalid:8000', ''));
  check('L9', has(r, /slice 44 \/ 88/) && has(r, /Slice Dice \(RAW\): 0\.873/) && entry('Error inspector').props.disabled === false,
    'Retry brings slice 44 back with its own metric and entries');
  check('L9', retried.length > 0 && retried.every((u) => u.includes('/slices/43/') || u.startsWith('/api/v1/artifacts/')),
    `Retry asked only for that slice: ${retried.length} requests`);
  mark = requests.length;
  await press(r, '▶');
  await tick(350);
  check('L9', requests.length === mark && has(r, /slice 45 \/ 88/), 'and the slice next to it is still cached (N-2: no clear-all)');
  mark = requests.length;
  await press(r, 'Refresh this slice');
  await tick(400);
  const refreshed = requests.slice(mark).map((u) => u.replace('http://backend.invalid:8000', ''));
  const rg = gestures().filter((g) => g.kind === 'refresh').pop();
  check('L9', refreshed.length > 0 && refreshed.every((u) => u.includes('/slices/44/') || u.startsWith('/api/v1/artifacts/'))
    && rg && rg.to === 44 && rg.outcome === 'shown',
    `"Refresh this slice" re-asks for z 44 only, logged as a refresh gesture (${refreshed.length} requests)`);
  // #78 QA N-4: Retry (z 43) and Refresh (z 44) forgot only their own slice - z 45's
  // cached "unavailable" metrics answer is still there, so going back asks nothing.
  mark = requests.length;
  await press(r, '▶');
  await tick(350);
  check('L9', requests.length === mark && has(r, /slice 46 \/ 88/) && has(r, /^Slice Dice: unavailable \(ARTIFACT_NOT_FOUND\)$/),
    `back to z 45 after Retry and Refresh of other slices: ${requests.length - mark} requests; its "unavailable" answer survived`);
  await act(async () => { r.unmount(); });
}

// A fake live backend with one case before its first run: MRI + ground truth per
// slice, no analysis run. Used by sections 3 and 4.
function noRunBackend() {
  const W = 576; const H = 576;
  const gen = (id) => ({ ...bundleJson.scenarios[id].default.response.data });
  const gtPng = encodePng(W, H, 0, ellipseMask(W, H, 300, 260, 70, 55));
  const mriPng = encodePng(W, H, 0, Uint8Array.from({ length: W * H }, (_, i) => (i * 5) & 0xff), { zopts: { level: 9 } });
  const sum = (b) => `sha256:${createHash('sha256').update(b).digest('hex')}`;
  const json = (status, body) => {
    const text = JSON.stringify(body);
    return {
      status,
      headers: { get: (k) => ({ 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })[k.toLowerCase()] ?? null },
      text: async () => text,
      json: async () => body,
    };
  };
  const requests = [];
  const fetchImpl = async (url) => {
    const path = url.replace('http://backend.invalid:8000', '');
    requests.push(path);
    if (path.startsWith('/api/v1/artifacts/')) {
      const bytes = path.includes('gt-') ? gtPng : mriPng;
      return { status: 200, headers: { get: (k) => ({ 'content-type': 'image/png', etag: `"${sum(bytes)}"` })[k.toLowerCase()] ?? null }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }
    if (/\/cases\/[^/]+$/.test(path)) return json(200, { ...gen('case_get'), case_id: 'CASE_0061', mode: 'EVALUATION', ground_truth_available: true, available_run_ids: [] });
    const z = (path.match(/slices\/(\d+)/) || [])[1];
    if (path.endsWith('/mri')) return json(200, { ...gen('mri_slice_get'), content_url: `/api/v1/artifacts/mri-${z}.png`, media_type: 'image/png', checksum: sum(mriPng) });
    if (path.endsWith('/ground-truth')) return json(200, { ...gen('ground_truth_slice_get'), content_url: `/api/v1/artifacts/gt-${z}.png`, media_type: 'image/png', checksum: sum(gtPng) });
    return json(404, { error: { code: 'ARTIFACT_NOT_FOUND' } });
  };
  return { requests, fetchImpl };
}

// ---- 3. a case with no analysis run: MRI + ground truth only, and L4 on it ---
// Decision (b), Day 22: tonight's backend has no run, so SCR-03 opens a case
// before its first run straight into the viewer; the L4 15 + 15 run then
// measures the real MRI + GT per-slice transfers, judged by l4-report.mjs.
{
  const { requests, fetchImpl } = noRunBackend();
  const runtime = createRuntime({
    config: resolveConfig({ mode: 'live', apiBaseUrl: 'http://backend.invalid:8000' }),
    contractJson, fetchImpl, decodeMask: decodeMaskPng, log: (line) => logs.push(line),
  });
  const nav = { push: () => true, pop: () => true, replace: () => true, reset: () => true, canGoBack: true };
  const logStart = logs.length;
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(CaseExplorerScreen, { runtime, nav, params: { caseId: 'CASE_0061' } })), nodeMock);
  });
  await tick(300);
  await layout(r);
  await tick(200);
  const runData = () => requests.filter((p) => p.includes('/analysis-runs') || p.includes('/experiments'));
  check('N1', has(r, /slice 45 \/ 88/) && has(r, /^No analysis run for this case - MRI and ground truth only/) && !has(r, /No default/),
    'no run: opens straight into the viewer on the middle slice, run line says there is no run');
  const img = () => r.root.findAll((n) => n.type === 'Image')[0];
  check('N2', img() && img().props.source.uri.startsWith('data:image/png;base64,') && runData().length === 0,
    `MRI drawn from its bytes; run requests: ${runData().length}`);
  const entry = (label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label))[0];
  check('N3', has(r, /^none - no analysis run for this case$/) && !has(r, /^Prediction \((RAW|PROCESSED)\)/)
    && ['Error inspector (SCR-04)', '3D (SCR-05)', 'Review / correct (SCR-06)'].every((l) => entry(l) && entry(l).props.disabled === true && textOf(entry(l)).includes('needs an analysis run')),
    'no prediction chips or toggle; SCR-04/05/06 disabled with "needs an analysis run"');
  check('N4', has(r, /^Slice Dice: - \(no analysis run for this case\)$/), 'the slice metric says why it is empty');
  await press(r, 'Ground truth: OFF');
  await tick(300);
  check('N5', r.root.findAll((n) => n.type === 'Path').length === 1, 'ground-truth overlay drawn (the only mask)');

  // The L4 15 + 15 run, started the way the leader starts it: long-press the slice label.
  const label = r.root.findAll((n) => n.type === 'TouchableOpacity' && typeof n.props.onLongPress === 'function')[0];
  globalThis.__alerts = [];
  await act(async () => { label.props.onLongPress(); });
  const menu = globalThis.__alerts.find((a) => a[0] === 'Scripted slice navigation');
  const l4 = menu && menu[2].find((b) => b.text === 'L4 15 + 15');
  if (l4) await act(async () => { l4.onPress(); });
  for (let i = 0; i < 120 && !globalThis.__alerts.some((a) => a[0] === 'L4 finished'); i += 1) await tick(250);
  const verdict = judge(parseLog(logs.slice(logStart).join('\n')));
  check('N6', globalThis.__alerts.some((a) => a[0] === 'L4 finished') && verdict.verdict === 'PASS',
    `L4 15 + 15 on a no-run case: l4-report ${verdict.verdict}${verdict.problems.length ? ` - ${verdict.problems[0]}` : ''}`);
  check('N6', verdict.scope && verdict.scope.has_run === false && verdict.scope.required.includes('ground_truth_slice_get')
    && verdict.scope.required.includes('artifact:mask') && /predictions are not part of this L4/.test(verdict.scope.text),
    `scope: ${verdict.scope ? verdict.scope.text : '-'}`);
  check('N6', runData().length === 0, `no run data asked during the whole session (${runData().length})`);
  await act(async () => { r.unmount(); });
}

// ---- 3b. a run asked for that a no-run case does not list (#80 QA N3) -------
// Another screen hands SCR-03 a run id, but the case lists no run: the same
// no-run view, which names the requested run as not listed and never asks for it.
{
  const { requests, fetchImpl } = noRunBackend();
  const runtime = liveRuntime(fetchImpl);
  const nav = { push: () => true, pop: () => true, replace: () => true, reset: () => true, canGoBack: true };
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(CaseExplorerScreen, { runtime, nav, params: { caseId: 'CASE_0061', runId: 'RUN_GONE', variant: 'RAW' } })), nodeMock);
  });
  await tick(300);
  await layout(r);
  await tick(200);
  const runData = requests.filter((p) => p.includes('/analysis-runs') || p.includes('/experiments'));
  const entry = (label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label))[0];
  const scr04 = entry('Error inspector (SCR-04)');
  check('N7', has(r, /slice 45 \/ 88/) && has(r, /^Requested run RUN_GONE is not listed for this case - MRI and ground truth only/)
    && !has(r, /No default/) && runData.length === 0,
    `requested run not listed: the no-run viewer, the run named as not listed; run requests: ${runData.length}`);
  check('N7', scr04 && scr04.props.disabled === true
    && textOf(scr04).includes('needs an analysis run - requested run RUN_GONE is not listed for this case'),
    `SCR-04 entry disabled: ${scr04 ? textOf(scr04) : '-'}`);
  await act(async () => { r.unmount(); });
}

// ---- 4. a stale step timer cannot hang the scripted run (#77 QA R-3) -------
// Every scripted step arms a 6 s timeout, and the revisit pass steps back over
// the slices the new pass showed. Here no step timer is ever scheduled; instead,
// each time a step arms its own, every earlier step's timer fires at once, the
// worst timing a phone can produce. Each must find its own waiter gone and do
// nothing: the run ends with "L4 finished", no CMW_STEP_TIMEOUT and an
// l4-report PASS.
{
  const { fetchImpl } = noRunBackend();
  const runtime = createRuntime({
    config: resolveConfig({ mode: 'live', apiBaseUrl: 'http://backend.invalid:8000' }),
    contractJson, fetchImpl, decodeMask: decodeMaskPng, log: (line) => logs.push(line),
  });
  const nav = { push: () => true, pop: () => true, replace: () => true, reset: () => true, canGoBack: true };
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(CaseExplorerScreen, { runtime, nav, params: { caseId: 'CASE_0061' } })), nodeMock);
  });
  await tick(300);
  await layout(r);
  await tick(200);
  await press(r, 'Ground truth: OFF');
  await tick(300);
  const logStart = logs.length;
  const realSetTimeout = globalThis.setTimeout;
  const stepTimers = [];
  globalThis.setTimeout = (cb, ms, ...rest) => {
    if (ms !== 6000) return realSetTimeout(cb, ms, ...rest);
    for (const fire of stepTimers) fire();
    stepTimers.push(cb);
    return 0;
  };
  try {
    const label = r.root.findAll((n) => n.type === 'TouchableOpacity' && typeof n.props.onLongPress === 'function')[0];
    globalThis.__alerts = [];
    await act(async () => { label.props.onLongPress(); });
    const menu = globalThis.__alerts.find((a) => a[0] === 'Scripted slice navigation');
    const l4 = menu && menu[2].find((b) => b.text === 'L4 15 + 15');
    if (l4) await act(async () => { l4.onPress(); });
    for (let i = 0; i < 120 && !globalThis.__alerts.some((a) => a[0] === 'L4 finished'); i += 1) await tick(250);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  const mine = logs.slice(logStart);
  const verdict = judge(parseLog(mine.join('\n')));
  const timeouts = mine.filter((l) => l.startsWith('CMW_STEP_TIMEOUT')).length;
  check('T1', stepTimers.length === 30 && globalThis.__alerts.some((a) => a[0] === 'L4 finished') && timeouts === 0
    && verdict.verdict === 'PASS',
    `stale step timers fired during L4 15 + 15: ${stepTimers.length} steps armed, CMW_STEP_TIMEOUT ${timeouts}, l4-report ${verdict.verdict}`);
  await act(async () => { r.unmount(); });
}

// ---- 5. V3: SCR-01 and SCR-07 on the fixture runtime (#69) ------------------
// Both screens through the real navigator, under the FIXTURE badge, each
// drawing its model's answer rather than a state panel; then SCR-07 opened for
// one experiment, where a tapped strip dot opens SCR-03 with case, run, variant.
{
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson });
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(NavigatorView, { runtime, initialScreenId: 'SCR-01' })), nodeMock);
  });
  await tick(60);
  check('V3R1', has(r, /SCR-01 · V3/) && has(r, /^FIXTURE$/), 'SCR-01 renders under the FIXTURE badge');
  check('V3R1', has(r, /^Study STUDY_DEMO$/) && has(r, /^1 of 7 matrix experiments listed by the server$/)
    && has(r, /^Outliers \(DR-010\)$/) && has(r, /^1 finding returned$/), 'SCR-01 draws its model: study, matrix, outliers, findings');
  await press(r, 'Open the comparison (SCR-07)');
  await tick(60);
  check('V3R2', has(r, /SCR-07 · V3/) && has(r, /^FIXTURE$/), 'SCR-07 opened from SCR-01, under the FIXTURE badge');
  check('V3R2', has(r, /filled from the server's experiment list$/) && has(r, /^Comparisons \(server verdicts\)$/),
    'SCR-07 draws its model: the matrix and the server verdicts');
  // The generated list names one matrix experiment (EXP-D-PP, refused), so no
  // summary names a metric: no chip is offered, and the screen says why.
  check('V3R2', has(r, /^The server's summaries name no metric yet - nothing to plot\.$/), 'no metric to pick, and it says so');
  await layout(r);
  await tick(30);
  check('V3R2', r.root.findAll((n) => n.type === 'Svg').length === 1, 'the strip plot is drawn, empty');
  await act(async () => { r.unmount(); });
}
{
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson });
  const pushed = [];
  const nav = { push: (id, p) => { pushed.push([id, p]); return true; }, pop: () => true, replace: () => true, reset: () => true, canGoBack: true };
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(ExperimentComparisonScreen, { runtime, nav, params: { experimentIds: ['EXP-U-100'] } })), nodeMock);
  });
  await tick(60);
  await press(r, 'dice');
  await layout(r);
  await tick(30);
  const dots = r.root.findAll((n) => n.type === 'Circle');
  check('V3R3', dots.length === 4, `EXP-U-100 strip: ${dots.length} dots, one per successful case (4)`);
  const strip = r.root.findAll((n) => n.type === 'Pressable')[0];
  if (strip && dots.length) {
    await act(async () => { strip.props.onPress({ nativeEvent: { locationX: dots[0].props.cx, locationY: dots[0].props.cy } }); });
  }
  if (has(r, /^Open this case \(SCR-03\)$/)) await press(r, 'Open this case (SCR-03)');
  const [screenId, p] = pushed[0] || [];
  check('V3R3', pushed.length === 1 && screenId === 'SCR-03' && p.caseId && p.runId && p.variant === 'RAW' && p.experimentId === 'EXP-U-100',
    `a tapped dot opens SCR-03 with case, run and variant: ${JSON.stringify(pushed[0] || null)}`);
  await act(async () => { r.unmount(); });
}

// ---- 6. SCR-04 Error Inspector -------------------------------------------------
{
  const ErrorInspectorScreen = (await imp('src/verticals/v1/ErrorInspectorScreen.js')).default;
  const pushes = [];
  const nav = { push: (id, p) => { pushes.push([id, p]); return true; }, pop: () => true, replace: () => true, reset: () => true, canGoBack: true };
  const mount = async (runtime, params) => {
    let r;
    await act(async () => {
      r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
        React.createElement(ErrorInspectorScreen, { runtime, nav, params })), nodeMock);
    });
    await tick(300);
    await layout(r);
    await tick(250);
    return r;
  };

  // Fixture: a case without usable ground truth -> unavailable, never an empty chart. Contract v1.0+
  // generates an explicit `inference_review` case_get scenario; DRAFT v0's placeholder booleans are
  // not usable ground truth either. Either way the screen must say so.
  const fixtureRuntime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson });
  if (fixtureRuntime.fixtureScenarios.scenariosFor('case_get').includes('inference_review')) {
    fixtureRuntime.fixtureScenarios.set('case_get', 'inference_review');
  }
  let r = await mount(fixtureRuntime, { caseId: 'CASE_0043', runId: 'RUN_0043', variant: 'RAW', sliceIndex: 44 });
  check('E4a', has(r, /UNAVAILABLE/) && has(r, /no disagreement, metric or worst slice to show - not zero/),
    'no usable ground truth -> a clear unavailable state (PR-MODE-01)');
  await act(async () => { r.unmount(); });

  // Live, INFERENCE_REVIEW: the same, from the server's capability.
  const inference = fakeBackend({ caseMode: 'INFERENCE_REVIEW' });
  r = await mount(liveRuntime(inference.fetchImpl), { caseId: 'CASE_0001', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 });
  check('E4b', has(r, /Inference & review/) && has(r, /Ground-truth-dependent|no ground-truth mask|not zero/),
    'INFERENCE_REVIEW case -> unavailable, says why');
  check('E4b', !inference.requests.some((u) => /metrics|ground-truth/.test(u)), 'and asks the server for no GT-dependent data');
  await act(async () => { r.unmount(); });

  // Live, EVALUATION: classes, legend, server selection, profile, jump. z 51's
  // slice metrics are not ingested, so its "unavailable" answer is cached (E4n).
  const evalBackend = fakeBackend({ metricsMissingAt: [51] });
  r = await mount(liveRuntime(evalBackend.fetchImpl), { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 });
  const paths = () => r.root.findAll((n) => n.type === 'Path');
  check('E4c', paths().length === 3, `TP / FP / FN drawn as three paths (${paths().length})`);
  check('E4c', has(r, /TP - agree · \d+ px/) && has(r, /FP - over-segmentation · \d+ px/) && has(r, /FN - missed · \d+ px/),
    'legend: every class named in words with its pixel count');
  check('E4d', has(r, /Differs from the server for this slice|Matches the server for this slice/),
    'masks on screen compared with the server\'s FP / FN for the slice');
  check('E4e', has(r, /Jump to worst · z 52 \(slice 53\) · Dice 0\.620 · FP 120 · FN 340/),
    'worst slice = the server\'s first entry, though DR-010 would rank z 44 (Dice 0.310) first (N-1)');
  const listed = texts(r).filter((t) => /^(Jump to worst|#\d) · z \d+ /.test(t)).map((t) => Number(t.match(/· z (\d+) /)[1]));
  check('E4e', has(r, /#2 · z 44/) && has(r, /#3 · z 30/) && listed.join(',') === '52,44,30',
    `the list in the server's order, never re-ranked: z ${listed.join(', ')}`);
  check('E4f', has(r, /Dice 0\.810 · IoU 0\.680/) && has(r, /RVE -4\.2 %/), 'case metrics as the server sent them');
  const bars = () => r.root.findAll((n) => n.type === 'Rect' && n.props.fill !== 'none').length;
  check('E4g', bars() === 3, `profile: one bar per eligible slice, none for the rest (${bars()})`);
  const reqMark = evalBackend.requests.length;
  const gestureMark = gestures().length;
  await press(r, 'Jump to worst');
  await tick(400);
  check('E4h', has(r, /slice 53 \/ 88 {2}\(z = 52\)/), 'jump lands on the server\'s worst slice');

  // #78 QA N-3 (L4, NFR-PERF-001 limb 2): the jump and a ◀ / ▶ step ask for those slices and nothing else.
  await press(r, '◀');
  await tick(400);
  await press(r, '▶');
  await tick(400);
  const sinceJump = evalBackend.requests.slice(reqMark).map((u) => u.replace('http://backend.invalid:8000', ''));
  const outOfScope = sinceJump.filter((u) => !(/\/slices\/(51|52)\//.test(u) || u.startsWith('/api/v1/artifacts/')));
  check('E4m', has(r, /slice 53 \/ 88 {2}\(z = 52\)/) && sinceJump.length > 0 && outOfScope.length === 0,
    `jump, ◀, ▶: ${sinceJump.length} requests, each /slices/<z>/ of z 52 or 51 or an artifact${outOfScope.length ? `; other: ${outOfScope.join(' ')}` : ''}`);
  const lines = gestures().slice(gestureMark);
  const seen = [...new Set(lines.flatMap((g) => g.requests.map((q) => q.endpoint)))].sort();
  check('E4m', lines.length === 3 && lines.every((g) => g.kind === 'slice' && g.requests.every((q) => PER_SLICE_ENDPOINTS.includes(q.endpoint))),
    `${lines.length} CMW_GESTURE lines, only per-slice endpoints: ${seen.join(', ')}`);
  await press(r, 'FP - over-segmentation');
  await tick(30);
  check('E4i', paths().length === 2 && has(r, /FP - over-segmentation .*\(hidden\)/), 'a class can be isolated: FP hidden, named as hidden');
  await press(r, '3D error view');
  check('E4j', pushes.length === 1 && pushes[0][0] === 'SCR-05' && pushes[0][1].sliceIndex === 52 && pushes[0][1].view === 'error',
    `entry to the 3D error view with the slice: ${JSON.stringify(pushes[0] || null)}`);

  // #77 QA B-3, applied to SCR-04: a slice that fails shows nothing of the slice displayed before.
  evalBackend.setFailSlice(53);
  await press(r, '▶');
  await tick(400);
  const entry3d = () => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith('3D error view'))[0];
  check('E4k', has(r, /could not be reached/) && has(r, /^Legend - this slice \(-\)$/) && has(r, /^reference - · prediction -$/)
    && has(r, /^Slice Dice: -$/) && paths().length === 0 && !has(r, /· \d+ px/),
    'slice 54 fails: no classes, counts, ids or Dice from slice 53 stay on screen');
  check('E4k', entry3d() && entry3d().props.disabled === true && textOf(entry3d()).includes('this slice did not load'),
    'and the SCR-05 entry is disabled with the reason');
  evalBackend.setFailSlice(null);
  const before = evalBackend.requests.length;
  await press(r, 'Retry');
  await tick(400);
  await layout(r); // the viewport was unmounted while the state panel showed; a new one lays out
  await tick(100);
  const retried = evalBackend.requests.slice(before).map((u) => u.replace('http://backend.invalid:8000', ''));
  check('E4l', has(r, /^Legend - this slice \(z 53\)$/) && paths().length >= 1
    && retried.length > 0 && retried.every((u) => u.includes('/slices/53/') || u.startsWith('/api/v1/artifacts/')),
    `Retry brings slice 54 back and asks only for it (${retried.length} requests; ${texts(r).find((t) => t.startsWith('Legend')) || '-'}; paths ${paths().length}${retried.some((u) => !(u.includes('/slices/53/') || u.startsWith('/api/v1/artifacts/'))) ? `; other: ${retried.filter((u) => !(u.includes('/slices/53/') || u.startsWith('/api/v1/artifacts/'))).join(' ')}` : ''})`);

  // #78 QA N-2, as SCR-03's L9: Retry forgot only the slice it retried, so the slice before it is still cached.
  const afterRetry = evalBackend.requests.length;
  await press(r, '◀');
  await tick(400);
  const stepBack = gestures().filter((g) => g.kind === 'slice').pop();
  check('E4n', evalBackend.requests.length === afterRetry && has(r, /slice 53 \/ 88 {2}\(z = 52\)/)
    && stepBack && stepBack.to === 52 && stepBack.cache_hit === true,
    `back to z 52 after Retry: ${evalBackend.requests.length - afterRetry} requests of any kind, cache hit ${stepBack ? stepBack.cache_hit : '-'} (no clear-all)`);
  // #78 QA N-4: nor did it forget another slice's cached "unavailable" answer (z 51's metrics).
  await press(r, '◀');
  await tick(400);
  check('E4n', evalBackend.requests.length === afterRetry && has(r, /slice 52 \/ 88 {2}\(z = 51\)/)
    && has(r, /^Slice Dice: unavailable \(ARTIFACT_NOT_FOUND\)$/),
    `on to z 51: ${evalBackend.requests.length - afterRetry} requests; its "unavailable" answer survived the Retry of z 53`);
  await act(async () => { r.unmount(); });

  // #78 QA N-7: a server entry outside the volume (z 90 of 88) is listed and named, never opened
  // as the edge slice a clamp would give.
  const outside = fakeBackend({ selection: { ...SERVED_WORST, slices: [{ slice_index: 90, dice: 0.05, false_positives: 500, false_negatives: 600 }, ...SERVED_WORST.slices] } });
  r = await mount(liveRuntime(outside.fetchImpl), { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 });
  const row = (label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label))[0];
  const z90 = row('Worst · z 90 (slice 91)');
  check('E4r', z90 && z90.props.disabled === true && textOf(z90).includes('outside this volume (z 0..87) - not opened')
    && !has(r, /Jump to worst/) && has(r, /selection names slice 90, outside 0\.\.87/),
    `z 90 listed, disabled and named: ${z90 ? textOf(z90) : '-'}`);
  const outMark = outside.requests.length;
  await press(r, 'Worst · z 90');
  await tick(400);
  check('E4r', outside.requests.length === outMark && has(r, /slice 45 \/ 88 {2}\(z = 44\)/) && !has(r, /\(z = 87\)/),
    `a tap on it opens nothing: ${outside.requests.length - outMark} requests, still on z 44 (no clamp to z 87)`);
  await press(r, '#2 · z 52');
  await tick(400);
  check('E4r', has(r, /slice 53 \/ 88 {2}\(z = 52\)/), 'the entries inside the volume still open their own slice');
  await act(async () => { r.unmount(); });

  // #78 QA B-2: a block of another selection version is not shown as DR-010's.
  const v2 = fakeBackend({ selection: { ...SERVED_WORST, selection_version: 'dr010-worst-slice/v2' } });
  r = await mount(liveRuntime(v2.fetchImpl), { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 });
  check('E4o', has(r, /^SELECTION_VERSION_UNSUPPORTED: the server sent selection_version "dr010-worst-slice\/v2"; this build shows only "dr010-worst-slice\/v1"\./)
    && !has(r, /Jump to worst|^#\d · z/) && bars() === 0 && has(r, /^No profile: .*not one this build shows/),
    'selection_version v2: unavailable, the reason and the served version named; nothing listed, jumpable or profiled');
  check('E4o', has(r, /^Legend - this slice \(z 44\)$/) && paths().length === 3 && !has(r, /(Matches|Differs from) the server for this slice/),
    'the slice is drawn, and not compared with a selection that is not shown');
  await act(async () => { r.unmount(); });

  // #78 QA B-3: SCR-04 asks for PROCESSED; the run metrics answer RAW. The slices answer PROCESSED,
  // so the viewer draws the slice and only the run-level gate can hide the RAW numbers.
  const swapped = fakeBackend({ metricsVariant: 'RAW' });
  r = await mount(liveRuntime(swapped.fetchImpl), { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'PROCESSED', sliceIndex: 44 });
  check('E4p', has(r, /Asked for PROCESSED, served RAW; a substituted variant is not shown\./) && has(r, /Cannot show this safely/),
    'run metrics for RAW under a PROCESSED request: the V1 model\'s variant-mismatch state, in its words');
  check('E4p', !has(r, /Jump to worst|^#\d · z/) && bars() === 0 && !has(r, /Case metrics|Dice 0\.810|IoU 0\.680/)
    && has(r, /^No profile without the run metrics/),
    'no worst-slice list, no profile, no case metrics');
  check('E4p', has(r, /^Legend - this slice \(z 44\)$/) && paths().length === 3 && !has(r, /(Matches|Differs from) the server for this slice/)
    && swapped.requests.some((u) => u.includes('/prediction?variant=PROCESSED')),
    'the PROCESSED slice is drawn, with no comparison against the RAW numbers');
  await act(async () => { r.unmount(); });

  // #78 QA B-3 in fixture mode: the generated bundle answers RAW to every run-metrics request.
  const fixtureAt = (variant) => mount(createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson }),
    { caseId: 'CASE_0043', runId: 'RUN_0043', variant, sliceIndex: 44 });
  r = await fixtureAt('PROCESSED');
  const refusals = texts(r).filter((t) => /Asked for PROCESSED, served RAW; a substituted variant is not shown\./.test(t)).length;
  check('E4q', refusals === 2 && !has(r, /Jump to worst|^#\d · z/) && !has(r, /Case metrics/) && has(r, /^No profile without the run metrics/),
    `fixture, PROCESSED: the slice AND the run metrics refuse RAW (${refusals} refusals); no list, case metrics or profile`);
  await act(async () => { r.unmount(); });
  r = await fixtureAt('RAW');
  check('E4q', has(r, /Jump to worst · z 44 \(slice 45\)/) && has(r, /Dice 0\.500 · IoU 0\.250/) && !has(r, /Asked for/),
    'fixture, RAW: the generated DR-010 v1 block and the case metrics are shown');
  await act(async () => { r.unmount(); });
}

console.log = origLog;
console.error = origError;
const appErrors = errors.filter((e) => !/act\(/.test(e) && !/react-test-renderer is deprecated/.test(e));
check('E1', appErrors.length === 0, `console.error from app code: ${appErrors.length}${appErrors.length ? ` - ${appErrors[0].slice(0, 300)}` : ''}`);
origLog(failures === 0 ? `RENDER SMOKE PASS - ${count} checks (logic only, not device evidence)` : `RENDER SMOKE FAIL - ${failures} of ${count}`);
process.exit(failures === 0 ? 0 : 1);
