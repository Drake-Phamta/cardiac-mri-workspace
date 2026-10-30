/*
 * Render-smoke harness, part 2: the checks.  npm run test:render  (from mobile/)
 *
 * TEST-ONLY. It needs node_modules (react-test-renderer is a devDependency,
 * deprecated upstream), so CI runs it in its own job, mobile-render-bundle,
 * after `npm ci --ignore-scripts` from the lockfile (DR-021 rule 4); the
 * other CI jobs have no node_modules. It renders the real shell, V1, V3 and V4
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
const FindingsScreen = (await imp('src/verticals/v4/FindingsScreen.js')).default;
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
  check('S8', has(r, /SCR-08 · V4/), 'Findings tab -> SCR-08 Findings');
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
// unavailable answer the slice cache keeps (#78 QA N-4). `runIds` lists the
// case's runs (each answered as itself), `runMetricsPatch` overrides fields of
// the run metrics (#78 QA N-6), and the study's case list holds the one case.
function fakeBackend({
  caseMode = 'EVALUATION', metricsVariant = null, selection = SERVED_WORST, metricsMissingAt = [], runIds = ['RUN_A'],
  runMetricsPatch = {},
} = {}) {
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
    if (/\/studies\/[^/]+\/cases$/.test(path)) {
      return json(200, { ...gen('case_list'), items: [{ case_id: 'CASE_0061', mode_capability: caseMode, ground_truth_available: gtAvailable }] });
    }
    if (/\/cases\/[^/]+$/.test(path)) return json(200, { ...gen('case_get'), case_id: 'CASE_0061', mode: caseMode, ground_truth_available: gtAvailable, available_run_ids: runIds });
    if (/\/analysis-runs\/[^/]+$/.test(path)) return json(200, { ...gen('analysis_run_get'), run_id: path.split('/').pop(), case_id: 'CASE_0061', status: 'SUCCEEDED', precomputed: true, reconstruction_ids: ['REC_1'] });
    if (/\/experiments\/[^/]+$/.test(path)) return json(200, { ...gen('experiment_get'), model_family: 'UNet2D' });
    if (/\/analysis-runs\/[^/]+\/metrics\?/.test(path)) {
      if (!gtAvailable) return json(404, { error: { code: 'GROUND_TRUTH_UNAVAILABLE', message: 'no GT' } });
      const asked = (path.match(/[?&]prediction_variant=([A-Z_]+)/) || [])[1] || null;
      return json(200, {
        ...gen('analysis_run_metrics'), prediction_variant: metricsVariant ?? asked, metric_state: 'COMPUTED', metric_version: 'm1',
        metric_values: { dice: 0.81, iou: 0.68, false_positives: 1200, false_negatives: 900, relative_volume_error: -4.2 },
        worst_slice_selection: selection,
        ...runMetricsPatch,
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

// ---- 2b. an INFERENCE_REVIEW case on SCR-03 (#77 QA N-11) ------------------
// No ground truth: no ground-truth toggle, the SCR-04 entry disabled with that
// reason, and not one request for ground truth or metrics during the session.
{
  const { fetchImpl, requests } = fakeBackend({ caseMode: 'INFERENCE_REVIEW' });
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
  await press(r, '▶');
  await tick(350);
  const gtToggles = r.root.findAll((n) => n.type === 'TouchableOpacity' && /^Ground truth/.test(textOf(n)));
  check('L10', has(r, /slice 46 \/ 88/) && has(r, /Inference & review/) && gtToggles.length === 0
    && has(r, /^Ground truth: none for this case \(Inference & review\) - no ground-truth layer, metric or error view is offered\.$/),
    `INFERENCE_REVIEW: no ground-truth toggle (${gtToggles.length}), and the overlays card says why`);
  const scr04 = r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith('Error inspector (SCR-04)'))[0];
  check('L10', scr04 && scr04.props.disabled === true && textOf(scr04).includes('no ground truth for this case (Inference & review)'),
    `SCR-04 entry disabled with the no-ground-truth reason: ${scr04 ? textOf(scr04) : '-'}`);
  const gtOrMetrics = requests.filter((u) => /\/ground-truth|\/metrics/.test(u));
  check('L10', requests.some((u) => u.includes('/prediction?')) && gtOrMetrics.length === 0,
    `${requests.length} requests over open and one step, ${gtOrMetrics.length} to ground-truth or metrics endpoints`);
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
  // #77 QA N-3: each pass ends with the session's totals on a line of its own, right after CMW_RUN_END.
  const mine = logs.slice(logStart);
  const totals = mine.filter((l) => l.startsWith('CMW_NET_TOTALS ')).map((l) => JSON.parse(l.slice(15)));
  const afterEnd = mine.every((l, i) => !l.startsWith('CMW_NET_TOTALS ') || mine[i - 1].startsWith('CMW_RUN_END '));
  check('N6', totals.length === 2 && afterEnd && totals.map((t) => t.pass).join(',') === 'new-15,revisit-15'
    && totals.every((t) => ['gestures', 'requests', 'bytes', 'unattributed', 'late'].every((k) => Number.isInteger(t[k])))
    && totals[1].requests === totals[0].requests,
    `CMW_NET_TOTALS after each CMW_RUN_END: ${totals.map((t) => `${t.pass} requests ${t.requests} unattributed ${t.unattributed} late ${t.late}`).join('; ')}`);
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

  // #78 QA N-6, DR-013a addendum: the run metrics name another prediction mask than the one drawn.
  // The slice is drawn (both masks verified), the mismatch is said, and the drawn classes are not
  // compared with the server's FP / FN for a mask they were not counted from.
  const otherMask = fakeBackend({ runMetricsPatch: { prediction_mask_id: 'PREDICTION_MASK_ID_OTHER' } });
  r = await mount(liveRuntime(otherMask.fetchImpl), { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 });
  const drawnPred = texts(r).find((t) => t.startsWith('reference ')) || '-';
  check('E4s', has(r, /^The masks drawn are not the ones the server's numbers refer to: prediction drawn PREDICTION_MASK_ID_0043, run metrics name PREDICTION_MASK_ID_OTHER\. The drawn classes are not compared with the server's FP \/ FN\.$/)
    && !has(r, /reference drawn/),
    `the prediction mask id differs from the run metrics' and the screen says so (${drawnPred})`);
  check('E4s', paths().length === 3 && has(r, /^Legend - this slice \(z 44\)$/) && !has(r, /(Matches|Differs from) the server for this slice/)
    && has(r, /#2 · z 44/),
    'the classes are drawn and the worst slices listed, but no FP / FN comparison against the other mask\'s numbers');
  await act(async () => { r.unmount(); });
}

// ---- 7. useCall aborts when it is disabled (DR-021 rule 2, #77 QA N-8) ------
// A call started while enabled is aborted the moment `enabled` turns false, and
// its late answer never reaches the screen.
{
  const useCall = (await imp('src/runtime/useCall.js')).default;
  const { STATE, success } = await imp('../app/core/index.mjs');
  const calls = [];
  const client = { call: (_endpointId, _params, options) => new Promise((resolve) => { calls.push({ signal: options.signal, resolve }); }) };
  function Probe({ enabled }) {
    const { view } = useCall(client, 'case_get', { case_id: 'CASE_0061' }, { enabled });
    return React.createElement('Text', null, `state ${view.state}`);
  }
  const loadingNow = (r) => has(r, new RegExp(`^state ${STATE.LOADING}$`));
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(Probe, { enabled: true })); });
  check('U1', calls.length === 1 && calls[0].signal && !calls[0].signal.aborted && loadingNow(r), 'enabled: one call in flight, LOADING');
  await act(async () => { r.update(React.createElement(Probe, { enabled: false })); });
  check('U1', calls[0].signal.aborted === true, 'disabled: the call in flight is aborted (its signal fired)');
  await act(async () => { calls[0].resolve(success({ case_id: 'CASE_0061' })); });
  await tick();
  check('U1', loadingNow(r) && !has(r, new RegExp(STATE.SUCCESS)) && calls.length === 1,
    `its late answer never lands, and nothing new is asked: ${texts(r).join(' | ')}`);
  await act(async () => { r.unmount(); });
}

// ---- 8. the hardware back button and leave guards, real navigator (#77 QA N-7) ----
// The BackHandler stand-in keeps its listeners, so the press below is the one
// Android sends: NavigatorView's listener, the guard, the reducer.
{
  const { BackHandler } = await import('react-native');
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson });
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(NavigatorView, { runtime, initialScreenId: 'SCR-02' })), nodeMock);
  });
  await tick(60);
  const screenNav = () => r.root.findAll((n) => n.props && n.props.nav && typeof n.props.nav.setLeaveGuard === 'function')[0].props.nav;
  const openCase = async () => {
    const input = r.root.findAll((n) => n.type === 'TextInput')[0];
    await act(async () => { input.props.onChangeText('CASE_0043'); });
    await tick();
    await press(r, 'Open CASE_0043 directly');
    await tick(60);
  };
  let handled;
  await act(async () => { handled = BackHandler.__press(); });
  check('B1', BackHandler.__listeners === 1 && handled === false && has(r, /SCR-02 · V1/),
    `one hardware-back listener (${BackHandler.__listeners}); at the root with no guard the press goes to the system`);

  // Two quick presses on a guarded screen: one prompt, the second press refused while it is open.
  await openCase();
  let asked = 0;
  let answer = null;
  await act(async () => { screenNav().setLeaveGuard(() => { asked += 1; return new Promise((res) => { answer = res; }); }); });
  let presses;
  await act(async () => { presses = [BackHandler.__press(), BackHandler.__press()]; });
  await tick();
  check('B2', presses.every((x) => x === true) && asked === 1 && has(r, /SCR-03 · V1/),
    `two quick back presses on SCR-03: both consumed, the guard asked ${asked} time(s), still on SCR-03`);
  await act(async () => { answer(true); });
  await tick(60);
  check('B2', has(r, /SCR-02 · V1/) && asked === 1, 'the one prompt answered "leave": back on SCR-02, once');

  // A covered screen leaves no guard behind: SCR-03 lets a push through and unmounts under SCR-08;
  // back on SCR-03 (the same entry, mounted afresh, nothing to lose), Back asks no stale guard.
  await openCase();
  let coveredAsked = 0;
  await act(async () => { screenNav().setLeaveGuard(() => { coveredAsked += 1; return true; }); });
  await act(async () => { await screenNav().push('SCR-08', {}); });
  await tick(60);
  check('B3', has(r, /SCR-08 · V4/) && coveredAsked === 1, 'SCR-03\'s guard let the push through: SCR-08 on top');
  await act(async () => { BackHandler.__press(); });
  await tick(60);
  await act(async () => { BackHandler.__press(); });
  await tick(60);
  check('B3', has(r, /SCR-02 · V1/) && coveredAsked === 1,
    `back, back: SCR-08 -> SCR-03 -> SCR-02, and the covered screen's guard was not asked again (${coveredAsked})`);

  // At the root, a guard decides the exit - asked once for two quick presses too.
  let exitAsked = 0;
  let exitAnswer = null;
  await act(async () => { screenNav().setLeaveGuard(() => { exitAsked += 1; return new Promise((res) => { exitAnswer = res; }); }); });
  const exitsBefore = BackHandler.exits;
  await act(async () => { presses = [BackHandler.__press(), BackHandler.__press()]; });
  await act(async () => { exitAnswer(true); });
  await tick();
  check('B4', presses.every((x) => x === true) && exitAsked === 1 && BackHandler.exits === exitsBefore + 1,
    `root with a guard: two presses, one prompt (${exitAsked}), one exit`);
  await act(async () => { r.unmount(); });
  check('B4', BackHandler.__listeners === 0, 'the listener is removed with the navigator');
}

// ---- 9. Back from SCR-04 reopens SCR-03's run, variant and slice (#78 QA N-8) ----
// The real navigator on a case with two runs: SCR-02 -> SCR-03 (RUN_B, PROCESSED,
// a slice that is not the middle one) -> SCR-04 -> Back. The session's remembered
// variant is forgotten on the way, so only SCR-03's stack entry can bring it back.
{
  const { forgetSession } = await imp('src/verticals/v1/session.mjs');
  forgetSession();
  const backend = fakeBackend({ runIds: ['RUN_A', 'RUN_B'] });
  const runtime = liveRuntime(backend.fetchImpl);
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(NavigatorView, { runtime, initialScreenId: 'SCR-02' })), nodeMock);
  });
  await tick(150);
  await press(r, 'CASE_0061');
  await tick(150);
  check('R1', has(r, /SCR-03 · V1/) && has(r, /^RUN_A$/) && has(r, /^RUN_B$/) && has(r, /No default/),
    'two runs: SCR-03 asks for the run and the variant');
  await press(r, 'RUN_B');
  await press(r, 'PROCESSED');
  await tick(300);
  await layout(r);
  await tick(200);
  await press(r, '+10');
  await tick(350);
  const runLine = () => texts(r).find((t) => t.startsWith('Run ')) || '-';
  check('R1', has(r, /slice 55 \/ 88 {2}\(z = 54\)/) && /^Run RUN_B · UNet2D · /.test(runLine()) && has(r, /^Prediction \(PROCESSED\)/),
    `SCR-03 before: ${runLine()} · PROCESSED · z 54`);
  forgetSession();
  await press(r, 'Error inspector (SCR-04)');
  await tick(300);
  await layout(r);
  await tick(250);
  check('R2', has(r, /SCR-04 · V1/) && has(r, /^Prediction PROCESSED vs ground truth · run RUN_B$/) && has(r, /slice 55 \/ 88 {2}\(z = 54\)/),
    'SCR-04 opened on the same run, variant and slice');
  const mark = backend.requests.length;
  await press(r, '‹ Back');
  await tick(300);
  await layout(r);
  await tick(250);
  const sent = backend.requests.slice(mark);
  check('R3', has(r, /SCR-03 · V1/) && !has(r, /No default/) && /^Run RUN_B · UNet2D · /.test(runLine())
    && sent.every((u) => !u.includes('RUN_A')),
    `back on SCR-03: run RUN_B again, not asked for (${runLine()})`);
  check('R3', has(r, /^Prediction \(PROCESSED\)/) && has(r, /slice 55 \/ 88 {2}\(z = 54\)/),
    `variant PROCESSED and slice z 54 restored: ${texts(r).find((t) => t.startsWith('slice ')) || '-'}`);
  await act(async () => { r.unmount(); });
}

// ---- 10. V4: SCR-06 Review / Correction and SCR-08 Findings (H8 / H9 at the screen) ----
// A STATEFUL fake backend that answers like the real one does for the hero flow
// (tools/e2e/hero_flow_api.py H8 / H9): review_create returns the existing review of
// the same scope, a write carries expected_revision and a stale one is 409
// STALE_REVISION, a commit makes version N+1 from the latest version plus the working
// slices and answers 201 CORRECTED, a second commit with nothing new is 422. Masks are
// PNGs encoded here; working slices arrive as BITPACK_BASE64 and are unpacked here, so
// the checks compare what the SCREEN sent with what it should have sent.
function reviewBackend({ seedVersion = false } = {}) {
  const W = 576; const H = 576;
  const gen = (id) => ({ ...bundleJson.scenarios[id].default.response.data });
  const sum = (b) => `sha256:${createHash('sha256').update(b).digest('hex')}`;
  const bits = (m) => Uint8Array.from(m, (v) => (v ? 1 : 0));
  const asPng = (b01) => encodePng(W, H, 0, Uint8Array.from(b01, (v) => (v ? 255 : 0)));
  const SOURCE = bits(ellipseMask(W, H, 310, 262, 66, 58));
  const mriPng = encodePng(W, H, 0, Uint8Array.from({ length: W * H }, (_, i) => (i * 3) & 0xff), { zopts: { level: 9 } });
  const json = (status, body) => {
    const text = JSON.stringify(body);
    return {
      status,
      headers: { get: (k) => ({ 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })[k.toLowerCase()] ?? null },
      text: async () => text,
      json: async () => body,
    };
  };
  const err = (status, code) => json(status, { error: { code, message: code } });
  const requests = [];
  const db = {
    review: null,
    working: new Map(),
    versions: [],
    findings: [{
      finding_id: 'FINDING_1', status: 'OPEN', finding_type: 'UNDER_SEGMENTATION', note: 'seed finding', revision: 1,
      evidence: { study_id: 'STUDY_DEMO', experiment_id: 'EXP_DEMO', case_id: 'CASE_0061', analysis_run_id: 'RUN_A', prediction_variant: 'RAW', slice_index: 44, region_reference: null },
    }],
    nextFinding: 2,
  };
  const geometry = () => {
    const g = gen('case_get');
    return { geometry_contract_version: g.geometry_contract_version, geometry_validation_status: g.geometry_validation_status,
      shape: g.shape, index_convention: g.index_convention, spacing: g.spacing, origin: g.origin, direction: g.direction };
  };
  const RAW_ID = gen('analysis_run_get').raw_prediction_artifact_id;
  const versionSlice = (v, z) => (v.slices.get(z) ? v.slices.get(z) : (v.parent ? versionSlice(v.parent, z) : SOURCE));
  const provenance = (v) => ({
    review_id: db.review.review_id, case_id: 'CASE_0061', run_id: db.review.run_id, source_mask_id: RAW_ID, source_mask_kind: 'RAW_PREDICTION',
    prediction_variant: 'RAW', version: v.version, parent_reviewed_mask_id: v.parent ? v.parent.id : null,
    created_at: '2026-10-01T00:00:00Z', reviewer_id: null,
  });
  const row = (v) => ({ reviewed_mask_id: v.id, source_mask_id: RAW_ID, revision: v.revision, checksum: `sha256:${'0'.repeat(63)}${v.version}`, provenance: provenance(v) });
  const unpack = (payload) => {
    const packed = Buffer.from(payload.data, 'base64');
    const out = new Uint8Array(W * H);
    for (let k = 0; k < out.length; k += 1) out[k] = (packed[Math.floor(k / 8)] >> (7 - (k % 8))) & 1;
    return out;
  };
  const ensureReview = (runId, body) => {
    if (db.review) return { review: db.review, created: false };
    db.review = { review_id: 'REVIEW_1', run_id: runId, status: 'NOT_REVIEWED', revision: 1, source_mask_id: body.source_mask_id, prediction_variant: body.prediction_variant };
    if (seedVersion) {
      // an earlier session already corrected slice 44: its version differs from the source there
      const earlier = SOURCE.slice();
      for (let y = 262; y < 282; y += 1) for (let x = 400; x < 420; x += 1) earlier[y * W + x] = 1;
      db.versions.push({ id: 'REVMASK_0', version: 1, revision: 1, parent: null, slices: new Map([[44, earlier]]), earlier });
      db.review.status = 'CORRECTED';
      db.review.revision = 2;
    }
    return { review: db.review, created: true };
  };
  const reviewBody = (r) => ({ review_id: r.review_id, run_id: r.run_id, status: r.status, revision: r.revision, etag: `W/"revision-${r.revision}"`,
    source_mask_id: r.source_mask_id, prediction_variant: r.prediction_variant });

  const fetchImpl = async (url, init = {}) => {
    const path = url.replace('http://backend.invalid:8000', '');
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ method, path, body });
    let m;
    if (path.startsWith('/api/v1/artifacts/')) {
      const name = path.split('/').pop().replace('.png', '');
      let bytes = mriPng;
      if (name.startsWith('pred-')) bytes = asPng(SOURCE);
      else if (name.startsWith('rev-')) {
        const [, vid, z] = name.split('-');
        const v = db.versions.find((x) => x.id === vid);
        bytes = asPng(versionSlice(v, Number(z)));
      }
      return { status: 200, headers: { get: (k) => ({ 'content-type': 'image/png', etag: `"${sum(bytes)}"` })[k.toLowerCase()] ?? null }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }
    if ((m = /^\/api\/v1\/analysis-runs\/([^/]+)$/.exec(path)) && method === 'GET') {
      return json(200, { ...gen('analysis_run_get'), run_id: m[1], case_id: 'CASE_0061', status: 'SUCCEEDED' });
    }
    if ((m = /^\/api\/v1\/cases\/([^/]+)$/.exec(path)) && method === 'GET') return json(200, { ...gen('case_get'), case_id: m[1] });
    if ((m = /^\/api\/v1\/cases\/[^/]+\/slices\/(\d+)\/mri$/.exec(path))) {
      return json(200, { ...gen('mri_slice_get'), content_url: `/api/v1/artifacts/mri-${m[1]}.png`, media_type: 'image/png', checksum: sum(mriPng) });
    }
    if ((m = /^\/api\/v1\/analysis-runs\/[^/]+\/slices\/(\d+)\/prediction\?variant=([A-Z]+)$/.exec(path))) {
      return json(200, { ...gen('prediction_slice_get'), prediction_variant: m[2], prediction_mask_id: RAW_ID,
        content_url: `/api/v1/artifacts/pred-${m[1]}.png`, media_type: 'image/png', checksum: sum(asPng(SOURCE)) });
    }
    if ((m = /^\/api\/v1\/analysis-runs\/([^/]+)\/reviews$/.exec(path)) && method === 'POST') {
      const { review, created } = ensureReview(m[1], body);
      return json(created ? 201 : 200, reviewBody(review));
    }
    if ((m = /^\/api\/v1\/reviews\/([^/]+)\/reviewed-masks$/.exec(path)) && method === 'GET') {
      return json(200, { items: db.versions.map(row) });
    }
    if ((m = /^\/api\/v1\/reviews\/([^/]+)\/working-mask\/slices\/(\d+)$/.exec(path)) && method === 'PUT') {
      if (body.expected_revision !== db.review.revision) return err(409, 'STALE_REVISION');
      if (body.source_mask_id !== db.review.source_mask_id) return err(422, 'VALIDATION_ERROR');
      if (body.mask_payload.encoding !== 'BITPACK_BASE64') return err(422, 'VALIDATION_ERROR');
      db.working.set(Number(m[2]), unpack(body.mask_payload));
      db.review.revision += 1;
      return json(200, { review_id: db.review.review_id, working_revision: db.review.revision, source_mask_id: db.review.source_mask_id,
        slice_index: Number(m[2]), ...geometry() });
    }
    if ((m = /^\/api\/v1\/reviews\/([^/]+)\/commit$/.exec(path)) && method === 'POST') {
      if (body.expected_revision !== db.review.revision) return err(409, 'STALE_REVISION');
      if (db.working.size === 0) return err(422, 'VALIDATION_ERROR');
      const parent = db.versions.length ? db.versions[db.versions.length - 1] : null;
      const v = { id: `REVMASK_${db.versions.length + 1}`, version: db.versions.length + 1, revision: db.review.revision + 1, parent, slices: new Map(db.working) };
      db.versions.push(v);
      db.working.clear();
      db.review.revision += 1;
      db.review.status = 'CORRECTED';
      return json(201, { ...row(v), status: 'CORRECTED', source_mask_kind: 'RAW_PREDICTION', revision: db.review.revision, ...geometry() });
    }
    if ((m = /^\/api\/v1\/reviews\/([^/]+)$/.exec(path)) && method === 'PATCH') {
      if (body.expected_revision !== db.review.revision) return err(409, 'STALE_REVISION');
      if (body.status === 'CORRECTED') return err(409, 'INVALID_REVIEW_TRANSITION');
      db.review.status = body.status;
      db.review.revision += 1;
      return json(200, reviewBody(db.review));
    }
    if ((m = /^\/api\/v1\/reviewed-masks\/([^/]+)\/slices\/(\d+)$/.exec(path)) && method === 'GET') {
      const v = db.versions.find((x) => x.id === m[1]);
      if (!v) return err(404, 'ARTIFACT_NOT_FOUND');
      const bytes = asPng(versionSlice(v, Number(m[2])));
      return json(200, { ...gen('reviewed_mask_slice_get'), reviewed_mask_id: v.id, slice_index: Number(m[2]),
        content_url: `/api/v1/artifacts/rev-${v.id}-${m[2]}.png`, media_type: 'image/png', checksum: sum(bytes) });
    }
    if (path === '/api/v1/findings' && method === 'GET') return json(200, { items: db.findings });
    if (path === '/api/v1/findings' && method === 'POST') {
      const f = {
        finding_id: `FINDING_${db.nextFinding}`, status: 'OPEN', finding_type: body.finding_type, note: body.note, revision: 1,
        evidence: { study_id: body.study_id, experiment_id: body.experiment_id, case_id: body.case_id, analysis_run_id: body.analysis_run_id,
          prediction_variant: body.prediction_variant, slice_index: body.slice_index, region_reference: body.region_reference },
      };
      db.nextFinding += 1;
      db.findings.push(f);
      return json(201, { finding_id: f.finding_id, case_id: f.evidence.case_id, analysis_run_id: f.evidence.analysis_run_id, slice_index: f.evidence.slice_index,
        finding_type: f.finding_type, status: f.status, evidence: f.evidence, revision: 1 });
    }
    if ((m = /^\/api\/v1\/findings\/([^/]+)$/.exec(path)) && method === 'PATCH') {
      const f = db.findings.find((x) => x.finding_id === m[1]);
      if (!f) return err(404, 'ARTIFACT_NOT_FOUND');
      if (body.expected_revision !== f.revision) return err(409, 'STALE_REVISION');
      f.status = body.status;
      f.note = body.note;
      f.revision += 1;
      return json(200, { finding_id: f.finding_id, status: f.status, note: f.note, evidence: f.evidence, revision: f.revision, etag: `W/"revision-${f.revision}"` });
    }
    return err(404, 'ARTIFACT_NOT_FOUND');
  };
  return { fetchImpl, requests, db, SOURCE, bits, asPng, W, H, RAW_ID,
    writes: () => requests.filter((q) => q.method !== 'GET') };
}

{
  const { BackHandler } = await import('react-native');
  const { fitTransform } = await imp('../app/core/index.mjs');
  const pressExact = async (r, label) => {
    const hits = r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n) === label);
    if (!hits.length) throw new Error(`no button "${label}" exactly; texts: ${texts(r).slice(0, 50).join(' | ')}`);
    await act(async () => { hits[0].props.onPress(); });
  };
  const btn = (r, label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n) === label)[0];
  const byId = (r, id) => r.root.findAll((n) => n.props && n.props.testID === id);
  const alertNow = (title) => (globalThis.__alerts || []).filter((a) => a[0] === title).pop();
  const answerAlert = async (title, label) => {
    const a = alertNow(title);
    if (!a) throw new Error(`no alert "${title}"; alerts: ${(globalThis.__alerts || []).map((x) => x[0]).join(' | ')}`);
    const b = a[2].find((x) => x.text === label);
    await act(async () => { b.onPress(); });
    await tick(80);
  };
  const canvasOf = (r) => r.root.findAll((n) => n.type === 'View' && n.props.__pan)[0].props.__pan;
  const evt = (...pts) => ({ nativeEvent: { touches: pts.map((p) => ({ pageX: p.x, pageY: p.y })) } });
  const fit = fitTransform(400, 400, 576, 576);
  const pointOf = (x, y) => ({ x: fit.panX + (x + 0.5) * fit.zoom, y: fit.panY + (y + 0.5) * fit.zoom });
  const stroke = async (r, ...pixels) => {
    const c = canvasOf(r);
    await act(async () => { c.onPanResponderGrant(evt(pointOf(...pixels[0]))); });
    for (const px of pixels.slice(1)) await act(async () => { c.onPanResponderMove(evt(pointOf(...px))); });
    await act(async () => { c.onPanResponderRelease(evt()); });
  };
  const unpackBody = (body) => {
    const packed = Buffer.from(body.mask_payload.data, 'base64');
    const out = new Uint8Array(576 * 576);
    for (let k = 0; k < out.length; k += 1) out[k] = (packed[Math.floor(k / 8)] >> (7 - (k % 8))) & 1;
    return out;
  };
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const mount = async (backend, initial = 'SCR-08') => {
    const runtime = liveRuntime(backend.fetchImpl);
    let r;
    await act(async () => {
      r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
        React.createElement(NavigatorView, { runtime, initialScreenId: initial })), nodeMock);
    });
    await tick(120);
    return r;
  };
  const toReview = async (r) => {
    await pressExact(r, 'Review / correct');
    await tick(250);
    await layout(r);
    await tick(150);
  };

  // --- H8: Findings tab -> Review / correct -> SCR-06 on RAW (the finding recorded it) ---
  const be = reviewBackend();
  const r = await mount(be);
  check('V4a', has(r, /SCR-08 · V4/) && has(r, /seed finding/) && has(r, /CASE_0061 · slice 44 · run RUN_A · RAW/),
    'SCR-08 lists the finding with its evidence (case, slice, run, variant)');
  await toReview(r);
  check('V4b', has(r, /SCR-06 · V4/) && !has(r, /Which prediction do you want to review/) && has(r, /^RAW · /) && has(r, /^Review: NOT_REVIEWED · rev 1$/),
    'SCR-06 opens on RAW (the finding\'s own variant: no question, no default) with the review NOT_REVIEWED');
  const reqs = be.requests.map((q) => `${q.method} ${q.path.replace(/\?.*/, '')}`);
  check('V4b', reqs.includes('GET /api/v1/analysis-runs/RUN_A') && reqs.some((q) => q === 'POST /api/v1/analysis-runs/RUN_A/reviews')
    && reqs.some((q) => /GET .*\/slices\/44\/prediction/.test(q)) && reqs.some((q) => /GET .*\/slices\/44\/mri/.test(q))
    && reqs.some((q) => q.startsWith('GET /api/v1/artifacts/pred-44')),
  `reads: the run, the scoped review, the slice's prediction and MRI, and the prediction bytes (${reqs.length} requests)`);
  const create = be.requests.find((q) => q.method === 'POST' && q.path.endsWith('/reviews'));
  check('V4b', create.body.status === 'NOT_REVIEWED' && create.body.source_mask_id === be.RAW_ID && create.body.prediction_variant === 'RAW',
    'review_create sends status NOT_REVIEWED with the run\'s RAW artifact as the source and the variant');
  check('V4b', byId(r, 'mask-state')[0] && textOf(byId(r, 'mask-state')[0]) === 'SOURCE — no edits'
    && r.root.findAll((n) => n.type === 'Image').some((n) => /^data:image\/png;base64,/.test(n.props.source.uri)),
  'the real mask is decoded (no stand-in, no "decoder pending") and the MRI is drawn from its verified bytes');
  check('V4b', !has(r, /SYNTHETIC/) && !has(r, /decoder is pending/i), 'nothing is labelled SYNTHETIC or pending in live mode');

  // --- one brush stroke at SOURCE resolution ---
  const rectsBefore = r.root.findAll((n) => n.type === 'Rect').length;
  await stroke(r, [500, 300]);
  check('V4c', textOf(byId(r, 'mask-state')[0]) === 'UNSAVED edits' && r.root.findAll((n) => n.type === 'Rect').length > rectsBefore,
    'a one-finger stroke paints (radius 2 by default) and the slice reads UNSAVED');
  await pressExact(r, '‹ Back');
  await tick(60);
  const guard1 = alertNow('Unsaved edits');
  check('V4d', guard1 && /Slice 44 has unsaved edits/.test(guard1[1]) && has(r, /SCR-06 · V4/),
    'LEAVE GUARD: Back with unsaved edits asks first, and nothing has moved yet');
  await answerAlert('Unsaved edits', 'Stay');
  check('V4d', has(r, /SCR-06 · V4/) && textOf(byId(r, 'mask-state')[0]) === 'UNSAVED edits', '"Stay" keeps the screen and the edit');
  let handled;
  globalThis.__alerts = [];
  await act(async () => { handled = BackHandler.__press(); });
  await tick(60);
  check('V4d', handled === true && alertNow('Unsaved edits'), 'the Android back button asks too');
  await answerAlert('Unsaved edits', 'Stay');

  // --- undo / redo, then exactly one pixel at radius 0 ---
  await pressExact(r, 'Undo');
  check('V4e', textOf(byId(r, 'mask-state')[0]) === 'SOURCE — no edits' && btn(r, 'Undo').props.disabled === true && btn(r, 'Redo').props.disabled === false,
    'Undo: back to the source (nothing to undo, Redo available)');
  await pressExact(r, 'Redo');
  check('V4e', textOf(byId(r, 'mask-state')[0]) === 'UNSAVED edits', 'Redo: the stroke is back');
  await pressExact(r, 'Undo');
  await pressExact(r, '0');
  await stroke(r, [500, 300], [505, 300]);
  check('V4e', textOf(byId(r, 'mask-state')[0]) === 'UNSAVED edits', 'two samples at radius 0 painted');

  // --- flag with the review status (H8), then save (H9) ---
  await pressExact(r, 'Flag');
  await tick(80);
  check('V4f', has(r, /^Review: FLAGGED · rev 2$/) && be.writes().some((q) => q.method === 'PATCH' && q.body.status === 'FLAGGED' && q.body.expected_revision === 1),
    'Flag sends review_patch with expected_revision and the review reads FLAGGED');
  check('V4f', btn(r, 'Mark corrected').props.disabled === true && has(r, /CORRECTED is reached only by saving a correction/),
    'CORRECTED is not offered as a status: only Save reaches it');
  await pressExact(r, 'Save');
  const ask = alertNow('Save correction?');
  check('V4g', ask && ask[1].includes(`Source: RAW prediction ${be.RAW_ID}`) && /FLAGGED -> CORRECTED/.test(ask[1]) && !be.writes().some((q) => q.method === 'PUT'),
    'Save names the source mask first, and nothing is sent until it is confirmed');
  await answerAlert('Save correction?', 'OK');
  await tick(150);
  const puts = be.writes().filter((q) => q.method === 'PUT');
  const commits = be.writes().filter((q) => q.method === 'POST' && q.path.endsWith('/commit'));
  const expected = be.SOURCE.slice();
  // the stroke's two samples are joined by a line: pixels 500..505 of row 300
  for (let x = 500; x <= 505; x += 1) expected[300 * 576 + x] = 1;
  check('V4g', puts.length === 1 && puts[0].path.endsWith('/working-mask/slices/44') && puts[0].body.mask_payload.encoding === 'BITPACK_BASE64'
    && Object.keys(puts[0].body.mask_payload).sort().join() === 'data,encoding' && same(unpackBody(puts[0].body), expected),
  'the PUT is slice 44 as BITPACK_BASE64 and decodes to the source plus exactly the six SOURCE pixels the radius-0 stroke covered (500..505, row 300)');
  check('V4g', puts[0].body.source_mask_id === be.RAW_ID && puts[0].body.expected_revision === 2 && commits.length === 1 && commits[0].body.expected_revision === 3,
    'the PUT names the review\'s source and carries expected_revision 2; the commit carries 3 (revision moves with every write)');
  const notice = byId(r, 'notice')[0];
  check('V4g', notice && /Saved as a new version REVMASK_1 \(revision 4\) of the RAW prediction .* \(RAW_PREDICTION\)\. Review is CORRECTED\./.test(textOf(notice)),
    `the new version is shown with its source identity: ${notice ? textOf(notice) : '-'}`);
  check('V4g', has(r, /^Review: CORRECTED · rev 4$/) && byId(r, 'latest-version')[0] && /Latest version REVMASK_1 · source .* \(RAW_PREDICTION\) · 1 version/.test(textOf(byId(r, 'latest-version')[0]))
    && textOf(byId(r, 'mask-state')[0]) === 'SAVED', 'the header reads CORRECTED, the latest version and its source, and the slice SAVED');
  check('V4g', !be.writes().some((q) => q.method === 'PATCH' && q.body.status === 'CORRECTED'), 'no PATCH to CORRECTED ever: the commit alone made it');
  check('V4g', btn(r, 'Save').props.disabled === true, 'Save is disabled again: nothing changed since the commit');
  await pressExact(r, '‹ Back');
  await tick(60);
  check('V4g', has(r, /SCR-08 · V4/), 'saved: Back leaves without asking');

  // --- H9: the raw prediction and the earlier version are untouched ---
  check('V4h', same(be.db.versions[0].slices.get(44), expected) && same(be.SOURCE, be.bits(ellipseMask(576, 576, 310, 262, 66, 58))),
    'the committed slice is the edit, and the source prediction bytes are unchanged');
  check('V4h', !be.writes().some((q) => /prediction|artifacts/.test(q.path) && q.method !== 'GET'), 'nothing was ever written to a prediction or an artifact route');

  // --- STALE_REVISION keeps the edit and offers Refresh (not Retry) ---
  await toReview(r);
  check('V4i', has(r, /^Review: CORRECTED · rev 4$/) && byId(r, 'continuing')[0] && /Continuing from version REVMASK_1; Reset returns to the original RAW prediction\./.test(textOf(byId(r, 'continuing')[0]))
    && textOf(byId(r, 'mask-state')[0]) === 'SAVED',
  'reopening the CORRECTED review continues from its latest version (N-4): SAVED, and Reset is said to go to the original prediction');
  check('V4i', be.requests.some((q) => q.path.includes('/reviewed-masks/REVMASK_1/slices/44')) && be.requests.some((q) => q.path.includes('/artifacts/rev-REVMASK_1-44')),
    'the working base slice was read from the latest version (reviewed_mask_slice_get + its bytes)');
  await pressExact(r, '3');
  await stroke(r, [100, 100]);
  be.db.review.revision += 1; // somebody else wrote: our expected_revision is stale
  await pressExact(r, 'Save');
  await answerAlert('Save correction?', 'OK');
  await tick(150);
  check('V4j', has(r, /STALE MISMATCH/), 'the stale save is the STALE_MISMATCH state');
  check('V4j', r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n) === 'Refresh').length >= 1
    && r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n) === 'Retry').length === 0
    && textOf(byId(r, 'mask-state')[0]) === 'UNSAVED edits' && btn(r, 'Save').props.disabled === true,
  'STALE_REVISION: Refresh is offered, Retry is not, the edit is still UNSAVED, and Save cannot resend the stale write');
  const stalePuts = be.requests.filter((q) => q.method === 'PUT').length;
  await pressExact(r, 'Refresh');
  await tick(200);
  check('V4j', btn(r, 'Save').props.disabled === false && textOf(byId(r, 'mask-state')[0]) === 'UNSAVED edits' && has(r, /^Review: CORRECTED · rev 5$/),
    'after Refresh the review is reloaded at the server\'s revision and the edit is still there');
  await pressExact(r, 'Save');
  await answerAlert('Save correction?', 'OK');
  await tick(150);
  const secondPut = be.requests.filter((q) => q.method === 'PUT').slice(stalePuts)[0];
  check('V4j', secondPut && secondPut.body.expected_revision === 5 && be.db.versions.length === 2
    && textOf(byId(r, 'mask-state')[0]) === 'SAVED' && has(r, /^Review: CORRECTED · rev 7$/),
  'saving again sends the reloaded revision and makes version 2 (the server\'s own revision, not a retry of the stale write)');

  // --- New finding here: SCR-08 with the context, create, and Back restores the review ---
  await pressExact(r, 'New finding here');
  await tick(150);
  check('V4k', has(r, /SCR-08 · V4/) && has(r, /^CASE_0061 · slice 44 · run RUN_A · RAW$/) && has(r, /New finding/),
    'New finding here opens SCR-08 with the case, slice, run and variant of the review');
  await pressExact(r, 'Over-segmentation');
  const note = r.root.findAll((n) => n.type === 'TextInput')[0];
  await act(async () => { note.props.onChangeText('Leaks into the right ventricle.'); });
  await pressExact(r, 'Create finding');
  await tick(150);
  const posted = be.requests.find((q) => q.method === 'POST' && q.path === '/api/v1/findings');
  check('V4k', posted && posted.body.case_id === 'CASE_0061' && posted.body.analysis_run_id === 'RUN_A' && posted.body.prediction_variant === 'RAW'
    && posted.body.slice_index === 44 && posted.body.finding_type === 'OVER_SEGMENTATION' && posted.body.study_id === 'STUDY_DEMO'
    && 'region_reference' in posted.body && 'experiment_id' in posted.body,
  'finding_create sends the contract\'s fields: case, run, variant, slice, type, note, study');
  check('V4k', has(r, /Finding FINDING_2 created \(OPEN\)/) && has(r, /Leaks into the right ventricle\./), 'the new finding is listed with its note');
  await pressExact(r, '‹ Back');
  await tick(250);
  await layout(r);
  await tick(150);
  check('V4k', has(r, /SCR-06 · V4/) && !has(r, /Which prediction do you want to review/) && has(r, /slice 44 \/ 88/) && has(r, /^RAW · /),
    'Back from SCR-08 reopens SCR-06 on the same variant and slice (returnParams), without asking again');
  await act(async () => { r.unmount(); });

  // --- SCR-08: create / list / open evidence / resolve, with a recording nav ---
  const be8 = reviewBackend();
  const runtime8 = liveRuntime(be8.fetchImpl);
  const pushes = [];
  const nav8 = { push: (...a) => { pushes.push(a); return true; }, pop: () => true, replace: () => true, reset: () => true, canGoBack: true };
  let f;
  await act(async () => {
    f = TestRenderer.create(React.createElement(RuntimeProvider, { runtime: runtime8 },
      React.createElement(FindingsScreen, { runtime: runtime8, nav: nav8, params: {} })), nodeMock);
  });
  await tick(150);
  check('V4l', has(f, /seed finding/) && has(f, /Under-segmentation/) && has(f, /^OPEN$/) && !has(f, /^New finding$/),
    'SCR-08 opened bare lists the finding (type, status, note) and offers no create form');
  await pressExact(f, 'Open evidence');
  check('V4l', pushes.length === 1 && pushes[0][0] === 'SCR-03' && pushes[0][1].caseId === 'CASE_0061' && pushes[0][1].sliceIndex === 44
    && pushes[0][1].runId === 'RUN_A' && pushes[0][1].variant === 'RAW',
  'Open evidence pushes SCR-03 at the finding\'s case, slice, run and variant');
  await pressExact(f, 'Review / correct');
  check('V4l', pushes[1][0] === 'SCR-06' && pushes[1][1].runId === 'RUN_A' && pushes[1][1].variant === 'RAW' && pushes[1][1].sliceIndex === 44,
    'Review / correct pushes SCR-06 with the run, variant and slice');
  await pressExact(f, 'Resolve');
  await tick(100);
  const patchReq = be8.requests.find((q) => q.method === 'PATCH' && q.path.includes('/findings/'));
  check('V4l', patchReq && patchReq.body.status === 'RESOLVED' && patchReq.body.expected_revision === 1 && has(f, /^RESOLVED$/) && btn(f, 'Reopen'),
    'Resolve sends finding_patch with the finding\'s own revision; the list shows RESOLVED and offers Reopen');
  be8.db.findings[0].revision += 1; // somebody else changed it
  await pressExact(f, 'Reopen');
  await tick(100);
  check('V4l', has(f, /STALE MISMATCH/) && f.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n) === 'Refresh').length >= 1
    && has(f, /^RESOLVED$/), 'a stale Reopen shows Refresh, and the list keeps what it had');
  await pressExact(f, 'Refresh');
  await tick(150);
  check('V4l', !has(f, /STALE MISMATCH/) && has(f, /^RESOLVED$/) === (be8.db.findings[0].status === 'RESOLVED'),
    'Refresh reads the list again (useCall refetch) and the stale banner goes');
  await act(async () => { f.unmount(); });

  // --- an already CORRECTED review (seeded) continues from its latest version; Reset returns to the original ---
  const bs = reviewBackend({ seedVersion: true });
  const rs = await mount(bs);
  await toReview(rs);
  check('V4m', has(rs, /^Review: CORRECTED · rev 2$/) && byId(rs, 'continuing')[0] && /Continuing from version REVMASK_0/.test(textOf(byId(rs, 'continuing')[0]))
    && textOf(byId(rs, 'mask-state')[0]) === 'SAVED' && btn(rs, 'Save').props.disabled === true,
  'a CORRECTED review opens SAVED on its latest version, with nothing to save');
  const sentBefore = bs.writes().length;
  await pressExact(rs, 'Reset');
  await answerAlert('Reset to the source?', 'OK');
  check('V4m', textOf(byId(rs, 'mask-state')[0]) === 'UNSAVED edits' && btn(rs, 'Save').props.disabled === false && bs.writes().length === sentBefore,
    'Reset goes back to the ORIGINAL prediction (not the last version): UNSAVED against the version, and nothing is sent by it');
  await pressExact(rs, 'Save');
  await answerAlert('Save correction?', 'OK');
  await tick(150);
  const putReset = bs.writes().find((q) => q.method === 'PUT');
  check('V4m', putReset && same(unpackBody(putReset.body), bs.SOURCE) && bs.db.versions.length === 2
    && bs.db.versions[1].parent && bs.db.versions[1].parent.id === 'REVMASK_0',
  'saving after a reset commits the original prediction as version 2 on top of version 1 (the earlier version is its parent, untouched)');
  check('V4m', same(bs.db.versions[0].slices.get(44), bs.db.versions[0].earlier), 'version 1 is unchanged');
  await act(async () => { rs.unmount(); });

  // --- the base version cannot be read: the slice is not editable (never edited from the source) ---
  const bd = reviewBackend({ seedVersion: true });
  const downFetch = async (url, init) => (/\/reviewed-masks\/[^/]+\/slices\//.test(url)
    ? { status: 500, headers: { get: () => null }, text: async () => '', json: async () => null } : bd.fetchImpl(url, init));
  const rd = await mount({ ...bd, fetchImpl: downFetch });
  await toReview(rd);
  check('V4n', has(rd, /continues from its latest version, but that version.s slice could not be read/) && !byId(rd, 'mask-state')[0]
    && btn(rd, 'Retry slice'),
  'the base slice cannot be fetched: the slice is not drawn as editable, the reason is said and Retry slice is offered');
  await act(async () => { rd.unmount(); });
}

// ---- 11. SCR-05 3D Inspector: H6 and H7 on the live runtime, WebView mocked (V2) --------------------------
// What a PASS means: the screen asks for the mesh references and bytes the way the contract says (the surfaces AND the error
// mesh), verifies the bytes against the id (DR-021 rule 1), hands the viewer only verified, grid-matching artifacts, shows
// every one of its four layers (prediction, ground truth, FP, FN) as loading / unavailable (with the API's reason) / error /
// success on its own - a missing error mesh never takes the surfaces down - and turns a pick message into "slice n / total",
// the class of the face, "Open in 2D" (SCR-03) and, for an FP / FN face, "Open errors" (SCR-04), with returnParams that put
// the screen back on its layers, camera and plane (and, through the real navigator, on the slice the 2D screen ended on).
// It does NOT mean the surface is drawn or that a tap lands on a face: the viewer script is exercised in
// test/v2_viewer.test.mjs, the pixels and the frame rate are the owner's device tests.
{
  const Inspector3DScreen = (await imp('src/verticals/v2/Inspector3DScreen.js')).default;
  const { sent } = await imp('test/render/mocks/webview.mjs');
  const { boxClass, boxMesh, encodeErrorMesh, encodeMesh } = await imp('test/_v2mesh.mjs');
  const sum = (b) => createHash('sha256').update(b).digest('hex');
  const SHAPE = [576, 576, 88];
  const predBytes = encodeMesh(boxMesh(SHAPE, [100, 100, 10], [300, 300, 12]));
  const gtBytes = encodeMesh(boxMesh(SHAPE, [110, 110, 10], [290, 290, 12]));
  const procBytes = encodeMesh(boxMesh(SHAPE, [105, 105, 10], [295, 295, 12]));
  // the error meshes: FP = a 10 x 10 x 1 slab in slice 52 (100 voxels), FN = a 10 x 10 x 2 slab in slices 10-11 (200 voxels)
  const errBytes = encodeErrorMesh({ shape: SHAPE, fp: boxClass([300, 150, 52], [310, 160, 53]), fn: boxClass([120, 120, 10], [130, 130, 12]) });
  const errOnlyFn = encodeErrorMesh({ shape: SHAPE, fn: boxClass([120, 120, 10], [130, 130, 12]) });
  const errNone = encodeErrorMesh({ shape: SHAPE });
  const errWrongGrid = encodeErrorMesh({ shape: [100, 100, 88], fp: boxClass([10, 10, 10], [20, 20, 11]) });
  const IDS = { ART_RAW: predBytes, MASK_CASE_0061: gtBytes, ART_PROC: procBytes };
  const ERRORS = [errBytes, errOnlyFn, errNone, errWrongGrid];
  const MESH_ID = (b) => `MESH_${sum(b)}`;
  const ERRMESH_ID = (b) => `ERRMESH_${sum(b)}`;
  const asPath = (u) => u.replace('http://backend.invalid:8000', '');
  const noBody = (status) => ({ status, headers: { get: () => null }, text: async () => '', json: async () => null });

  // The base fake already serves case_get, the JSON of the MRI / GT / prediction slices and their PNGs. This one adds
  // what SCR-05 asks for: run ids, reconstruction_get, the ground-truth mask id, error_reconstruction_get and the mesh bytes.
  // `error` shapes the answer of error_reconstruction_get: { status, code } is an error envelope, { throws } a dropped network
  // (until `healed`), { gate } a promise the test resolves (a pending call), { bytes } the artifact, { badId } an id that is not
  // ERRMESH_<sha>, { reference, prediction } the masks it claims to be made from, { tamper } flips a byte of the file.
  function meshBackend({ caseMode = 'EVALUATION', processed = false, missing = [], tamper = [], reconstructionStatus = null, error = {} } = {}) {
    const base = fakeBackend({ caseMode });
    const requests = [];
    const err = { bytes: errBytes, ...error };
    const gen = (id) => ({ ...bundleJson.scenarios[id].default.response.data });
    const json = (status, body) => {
      const text = JSON.stringify(body);
      return { status, headers: { get: (k) => ({ 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })[k.toLowerCase()] ?? null }, text: async () => text, json: async () => body };
    };
    const fetchImpl = async (url, init) => {
      requests.push(url);
      const path = asPath(url);
      let m;
      if ((m = /^\/api\/v1\/analysis-runs\/([^/?]+)$/.exec(path))) {
        return json(200, { ...gen('analysis_run_get'), run_id: m[1], case_id: 'CASE_0061', status: 'SUCCEEDED', raw_prediction_artifact_id: 'ART_RAW',
          processed_prediction_artifact_id: processed ? 'ART_PROC' : null, reconstruction_ids: [MESH_ID(predBytes)] });
      }
      if ((m = /^\/api\/v1\/analysis-runs\/([^/?]+)\/reconstruction\?source_mask_id=([^&]+)$/.exec(path))) {
        const mask = decodeURIComponent(m[2]);
        if (reconstructionStatus) return json(reconstructionStatus, { error: { code: reconstructionStatus === 409 ? 'RUN_NOT_SUCCEEDED' : 'ARTIFACT_NOT_FOUND', message: 'x' } });
        if (!IDS[mask] || missing.includes(mask)) return json(404, { error: { code: 'ARTIFACT_NOT_FOUND', message: 'no reconstruction of this source mask' } });
        const kind = mask === 'ART_RAW' ? 'RAW_PREDICTION' : mask === 'ART_PROC' ? 'PROCESSED_PREDICTION' : 'GROUND_TRUTH';
        return json(200, { ...gen('reconstruction_get'), mesh_artifact_id: MESH_ID(IDS[mask]), source_mask_id: mask, source_mask_kind: kind,
          reconstruction_version: `dr008c-L0/v1 sha256:${'0'.repeat(64)}` });
      }
      if ((m = /^\/api\/v1\/analysis-runs\/([^/?]+)\/error-reconstruction\?prediction_variant=([A-Z]+)$/.exec(path))) {
        if (err.throws && !err.healed) throw new TypeError('fetch failed');
        if (err.gate) await err.gate;
        if (err.status) return json(err.status, { error: { code: err.code, message: 'x' } });
        const variant = m[2];
        return json(200, { ...gen('error_reconstruction_get'), error_mesh_artifact_id: err.badId || ERRMESH_ID(err.bytes),
          reference_mask_id: err.reference || 'MASK_CASE_0061', prediction_mask_id: err.prediction || (variant === 'PROCESSED' ? 'ART_PROC' : 'ART_RAW'),
          prediction_variant: variant });
      }
      if ((m = /^\/api\/v1\/artifacts\/([0-9a-f]{64})\.cmesh$/.exec(path))) {
        const mask = Object.keys(IDS).find((k) => sum(IDS[k]) === m[1]);
        const errorFile = ERRORS.find((b) => sum(b) === m[1]);
        const file = mask ? IDS[mask] : errorFile;
        if (!file) return json(404, { error: { code: 'ARTIFACT_NOT_FOUND', message: 'x' } });
        const bad = (mask && tamper.includes(mask)) || (errorFile && err.tamper);
        const bytes = bad ? Uint8Array.from(file, (v, i) => (i === file.length - 1 ? v ^ 1 : v)) : file;
        return { status: 200, headers: { get: (k) => ({ 'content-type': 'application/octet-stream', etag: `"sha256:${m[1]}"` })[k.toLowerCase()] ?? null },
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
      }
      if (path.endsWith('/ground-truth') || /\/slices\/\d+\/ground-truth$/.test(path)) {
        const r = await base.fetchImpl(url, init);
        if (r.status !== 200) return r;
        const body = await r.json();
        return json(200, { ...body, reference_mask_id: 'MASK_CASE_0061' });
      }
      return base.fetchImpl(url, init);
    };
    return { fetchImpl, requests, error: err, paths: () => requests.map(asPath), count: (needle) => requests.filter((u) => u.includes(needle)).length };
  }

  const nodeMocks = { createNodeMock: () => ({ postMessage() {} }) };
  const mount = async (backend, params, { nav = null } = {}) => {
    const runtime = liveRuntime(backend.fetchImpl);
    const recorded = { pushes: [], pops: 0 };
    const nv = nav || { push: (...a) => { recorded.pushes.push(a); return true; }, pop: () => { recorded.pops += 1; return true; }, replace: () => true, reset: () => true, canGoBack: true };
    sent.length = 0;
    let r;
    await act(async () => {
      r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
        React.createElement(Inspector3DScreen, { runtime, nav: nv, params })), nodeMocks);
    });
    await tick(250);
    return { r, runtime, recorded };
  };
  const web = (r) => r.root.findAll((n) => n.type === 'WebView')[0] || null;
  const fromViewer = async (r, message) => { await act(async () => { web(r).props.onMessage({ nativeEvent: { data: JSON.stringify(message) } }); }); await tick(20); };
  const sentJson = () => sent.map((m) => JSON.parse(m));
  const lastOf = (type) => sentJson().filter((m) => m.type === type).pop();
  const entry = (r, label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label))[0];
  const P = { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 };
  const FOUR = (n = 12, v = 8) => [['prediction', n, v], ['groundTruth', n, v], ['falsePositive', n, v], ['falseNegative', n, v]];
  const loadedAll = async (r, roles = FOUR()) => {
    await fromViewer(r, { type: 'ready' });
    for (const [role, triangles, vertices] of roles) await fromViewer(r, { type: 'loaded', role, triangles, vertices });
  };
  const pick = (slice, role, cls, triangle = 5) => ({ type: 'pick', role, triangle, slice, cls });
  const layerMsg = () => { const m = lastOf('layers'); return m ? { prediction: m.prediction, groundTruth: m.groundTruth, falsePositive: m.falsePositive, falseNegative: m.falseNegative } : null; };

  // 11a. success: references, verified bytes, the viewer's handshake, the four layers, the legend, the plane
  {
    const backend = meshBackend();
    const { r } = await mount(backend, P);
    const paths = backend.paths();
    check('V2R1', paths.some((p) => p === '/api/v1/analysis-runs/RUN_A/reconstruction?source_mask_id=ART_RAW'), 'the prediction mesh is asked for by the RUN\'s own RAW mask id');
    check('V2R1', paths.some((p) => p === '/api/v1/analysis-runs/RUN_A/reconstruction?source_mask_id=MASK_CASE_0061'), 'the ground-truth mesh by the id the server stated on a ground-truth slice');
    check('V2R1', paths.some((p) => p === '/api/v1/analysis-runs/RUN_A/error-reconstruction?prediction_variant=RAW'), 'the error mesh is asked for with the variant shown');
    check('V2R1', [predBytes, gtBytes, errBytes].every((b) => paths.includes(`/api/v1/artifacts/${sum(b)}.cmesh`)), 'all three meshes come from the content route named by their ids');
    check('V2R1', web(r) && has(r, /Run RUN_A · prediction RAW · L0 surface \(undecimated\)/) && has(r, /CASE_0061/), 'WebView mounted; run and variant always visible');
    check('V2R2', sent.length === 0, 'nothing is sent before the viewer says it is ready');
    await fromViewer(r, { type: 'ready' });
    const out = sentJson();
    const meshMsgs = out.filter((m) => m.type === 'mesh');
    const b64 = (b) => Buffer.from(b).toString('base64');
    check('V2R2', meshMsgs.map((m) => m.role).join() === 'prediction,groundTruth,error'
      && meshMsgs.find((m) => m.role === 'prediction').b64 === b64(predBytes) && meshMsgs.find((m) => m.role === 'groundTruth').b64 === b64(gtBytes)
      && meshMsgs.find((m) => m.role === 'error').b64 === b64(errBytes), 'after ready: the verified prediction, ground-truth and error artifacts, byte for byte');
    check('V2R2', JSON.stringify(layerMsg()) === JSON.stringify({ prediction: true, groundTruth: false, falsePositive: true, falseNegative: true })
      && out.some((m) => m.type === 'slice' && m.index === 44) && !out.some((m) => m.type === 'camera'),
    `the four switches (ground truth off while an error map is expected) and the plane at the 2D slice they came from; no camera to restore: ${JSON.stringify(layerMsg())}`);
    check('V2R3', has(r, /Prediction \(RAW\)/) && has(r, /FP - over-segmentation/) && has(r, /FN - missed/) && texts(r).filter((t) => t === 'loading…').length === 4,
      `before the viewer reports the meshes every layer reads loading: ${texts(r).filter((t) => t === 'loading…').length}`);
    for (const [role, n, v] of FOUR()) await fromViewer(r, { type: 'loaded', role, triangles: n, vertices: v });
    check('V2R3', has(r, /^12 triangles$/) && has(r, /^100 voxels · 12 triangles$/) && has(r, /^200 voxels · 12 triangles$/),
      `prediction and ground truth report their triangles, FP and FN their voxels (from the server's artifact): ${texts(r).filter((t) => /triangles/.test(t)).join(' | ')}`);
    // never colour alone: every layer's name, meaning, glyph and look (how the scene draws it) are printed
    check('V2R3', has(r, /^FP - over-segmentation$/) && has(r, /^predicted, not in the ground truth · drawn checkered$/) && has(r, /^FN - missed$/) && has(r, /^in the ground truth, not predicted · drawn striped$/)
      && has(r, /^the segmentation the model produced · drawn solid$/) && has(r, /^the reference segmentation · drawn see-through$/),
    'the legend prints each layer\'s name, meaning and how the scene draws it (checkered, striped, solid, see-through)');
    check('V2R3', ['■', '□', '▲', '▼'].every((g) => has(r, new RegExp(`^${g}$`))), 'and a glyph of its own');
    check('V2R3', has(r, /^Prediction: ON$/) && has(r, /^Ground truth: OFF$/) && has(r, /^FP: ON$/) && has(r, /^FN: ON$/), 'each layer has its switch, printed ON / OFF');
    await press(r, 'FP: ON');
    check('V2R3', layerMsg().falsePositive === false && layerMsg().falseNegative === true && has(r, /^FP: OFF$/), 'the FP switch tells the viewer, and only FP');
    await press(r, 'FP: OFF');
    await press(r, 'Ground truth: OFF');
    await press(r, 'Prediction: ON');
    check('V2R3', JSON.stringify(layerMsg()) === JSON.stringify({ prediction: false, groundTruth: true, falsePositive: true, falseNegative: true })
      && has(r, /^Ground truth: ON$/) && has(r, /^Prediction: OFF$/), `the other switches too: ${JSON.stringify(layerMsg())}`);
    await press(r, 'Prediction: OFF');
    await press(r, 'Ground truth: ON');
    check('V2R4', has(r, /Nothing selected/) && entry(r, 'Open in 2D').props.disabled === true && entry(r, 'Open errors').props.disabled === true
      && has(r, /Open in 2D needs a selected slice/), 'no selection: both pushes are disabled and say why');
    check('V2R4', has(r, /Amber plane and band on the surface: slice 45 of 88 \(the 2D slice you came from\)\./) && has(r, /^slice 45 \/ 88 {2}\(z = 44\)$/),
      'the plane is the 2D slice the user came from, and the slider shows it');
    check('V2R4', has(r, /Voxel-index frame .* no millimetres/) && has(r, /Error map: false-positive faces/), 'the frame is stated, and so is what the error map means');
    // the slider moves the plane (and only the plane)
    await press(r, '▶');
    check('V2R4', lastOf('slice').index === 45 && has(r, /^slice 46 \/ 88 {2}\(z = 45\)$/) && has(r, /slice 46 of 88 \(set with the slider\)/), 'the slider moves the plane: one slice on');
    await press(r, '+10');
    check('V2R4', lastOf('slice').index === 55 && entry(r, 'Open in 2D').props.disabled === true, 'ten slices on; moving the plane selects nothing and opens nothing');
    const L = entry(r, 'Fit camera');
    await act(async () => { L.props.onPress(); });
    check('V2R4', sentJson().pop().type === 'fit', 'Fit camera tells the viewer');
    await act(async () => { r.unmount(); });
  }

  // 11b. H7: pick -> "slice n / total" and the class -> Open in 2D (SCR-03) / Open errors (SCR-04), returnParams
  {
    const backend = meshBackend();
    const { r, recorded } = await mount(backend, P);
    await loadedAll(r);
    const camera = { type: 'camera', yaw: -0.2, pitch: 0.4, zoom: 2, panX: 0.1, panY: -0.2 };
    await fromViewer(r, camera);
    await fromViewer(r, pick(52, 'falsePositive', 'FP'));
    check('V2R5', has(r, /^slice 53 \/ 88 {2}\(z = 52\) · picked on a false-positive \(FP\) face - predicted, not in the ground truth$/),
      `the pick shows slice n / total and what was hit: ${texts(r).find((t) => t.startsWith('slice ') && /picked/.test(t)) || '-'}`);
    check('V2R5', has(r, /slice 53 of 88 \(the picked slice\)/) && lastOf('slice').index === 52 && has(r, /^slice 53 \/ 88 {2}\(z = 52\)$/), 'the plane follows the pick, and the slider with it');
    check('V2R5', entry(r, 'Open in 2D').props.disabled === false && entry(r, 'Open errors').props.disabled === false, 'both pushes are enabled by an FP face');
    const layers = { prediction: true, groundTruth: false, falsePositive: true, falseNegative: true };
    await press(r, 'Open in 2D');
    check('V2R5', recorded.pushes.length === 1 && recorded.pushes[0][0] === 'SCR-03'
      && JSON.stringify(recorded.pushes[0][1]) === JSON.stringify({ caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 52 })
      && JSON.stringify(recorded.pushes[0][2]) === JSON.stringify({ runId: 'RUN_A', variant: 'RAW', sliceIndex: 52, layers, camera: { yaw: -0.2, pitch: 0.4, zoom: 2, pan: [0.1, -0.2] } }),
    `push SCR-03 at the picked slice for the same run and variant, with returnParams that restore the layers and the camera: ${JSON.stringify(recorded.pushes[0] || null)}`);
    await press(r, 'Open errors');
    check('V2R5', recorded.pushes.length === 2 && recorded.pushes[1][0] === 'SCR-04'
      && JSON.stringify(recorded.pushes[1][1]) === JSON.stringify({ caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 52 })
      && recorded.pushes[1][2].sliceIndex === 52 && JSON.stringify(recorded.pushes[1][2].layers) === JSON.stringify(layers),
    `an FP face also opens SCR-04 at its slice: ${JSON.stringify(recorded.pushes[1] ? [recorded.pushes[1][0], recorded.pushes[1][1]] : null)}`);
    // an FN face
    await fromViewer(r, pick(11, 'falseNegative', 'FN'));
    check('V2R5', has(r, /^slice 12 \/ 88 {2}\(z = 11\) · picked on a false-negative \(FN\) face - in the ground truth, not predicted$/) && entry(r, 'Open errors').props.disabled === false,
      'an FN face is named as such and opens SCR-04 too');
    // the prediction surface carries no error: Open in 2D yes, Open errors no (and it says why)
    await fromViewer(r, pick(40, 'prediction', null));
    check('V2R5', has(r, /^slice 41 \/ 88 {2}\(z = 40\) · picked on the prediction surface$/) && entry(r, 'Open in 2D').props.disabled === false
      && entry(r, 'Open errors').props.disabled === true && has(r, /Open errors needs a false-positive or false-negative face/),
    'a prediction face opens the 2D screen but there is no error to open');
    await fromViewer(r, pick(40, 'groundTruth', null));
    check('V2R5', has(r, /picked on the ground-truth surface$/) && entry(r, 'Open errors').props.disabled === true, 'nor does a ground-truth face');
    // a background tap clears the selection - nothing can navigate; the plane stays where the user last put it
    await fromViewer(r, pick(null, null, null, null));
    check('V2R6', has(r, /No surface at that point: nothing selected/) && entry(r, 'Open in 2D').props.disabled === true && entry(r, 'Open errors').props.disabled === true,
      'a background tap clears the selection and disables both pushes');
    check('V2R6', has(r, /slice 41 of 88 \(the picked slice\)/), 'and the plane stays on the last picked slice');
    const pushes = recorded.pushes.length;
    await act(async () => { entry(r, 'Open in 2D').props.onPress && entry(r, 'Open in 2D').props.onPress(); });
    check('V2R6', recorded.pushes.length === pushes, 'a disabled button pushes nothing');
    // a pick outside the volume, a malformed pick, a pick whose class disagrees with its layer: never selected
    await fromViewer(r, pick(88, 'falsePositive', 'FP'));
    check('V2R6', has(r, /outside this volume \(88 slices\): ignored/) && entry(r, 'Open in 2D').props.disabled === true, 'a slice outside the volume is refused, not clamped');
    await fromViewer(r, { type: 'pick', role: 'prediction', slice: '7' });
    check('V2R6', has(r, /outside this volume/) && entry(r, 'Open in 2D').props.disabled === true, 'a malformed pick changes nothing');
    await fromViewer(r, pick(3, 'falsePositive', 'FN'));
    check('V2R6', has(r, /outside this volume/) && entry(r, 'Open in 2D').props.disabled === true, 'a pick whose class is not its layer\'s is ignored');
    await fromViewer(r, pick(0, 'groundTruth', null, 2));
    check('V2R6', has(r, /^slice 1 \/ 88 {2}\(z = 0\) · picked on the ground-truth surface$/) && entry(r, 'Open in 2D').props.disabled === false, 'slice 0 is a slice');
    await act(async () => { r.unmount(); });
  }

  // 11c. INT-12 (INFERENCE_REVIEW), end to end at the screen: the prediction yes; ground truth, error mesh and every layer made from them never
  {
    const backend = meshBackend({ caseMode: 'INFERENCE_REVIEW' });
    const { r, recorded } = await mount(backend, P);
    const paths = backend.paths();
    check('V2R7', !paths.some((p) => p.includes('/ground-truth')) && !paths.some((p) => p.includes('MASK_CASE_0061')) && !paths.some((p) => p.includes('error-reconstruction'))
      && !paths.includes(`/api/v1/artifacts/${sum(gtBytes)}.cmesh`) && !paths.includes(`/api/v1/artifacts/${sum(errBytes)}.cmesh`),
    'no request for ground truth, for its mesh, or for an error mesh');
    check('V2R7', paths.some((p) => p.endsWith('source_mask_id=ART_RAW')) && texts(r).filter((t) => t === 'unavailable (GROUND_TRUTH_UNAVAILABLE)').length === 3,
      `the prediction mesh is requested; the ground-truth, FP and FN layers each say why they are unavailable: ${texts(r).filter((t) => /unavailable/.test(t)).join(' | ')}`);
    check('V2R7', ['Ground truth: n/a', 'FP: n/a', 'FN: n/a'].every((label) => { const b = entry(r, label); return b && b.props.disabled === true; }), 'their switches are disabled');
    check('V2R7', has(r, /no ground truth, so there is no 3D error map and no ground-truth surface - that is not zero error/), 'and the screen says an absent error map is not zero error');
    await fromViewer(r, { type: 'ready' });
    check('V2R7', sentJson().filter((m) => m.type === 'mesh').map((m) => m.role).join() === 'prediction', 'only the prediction artifact reaches the viewer');
    await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    await fromViewer(r, pick(52, 'prediction', null));
    check('V2R7', entry(r, 'Open in 2D').props.disabled === false && entry(r, 'Open errors').props.disabled === true, 'the prediction can still be opened in 2D; there is no error view to open');
    await press(r, 'Open in 2D');
    check('V2R7', recorded.pushes.length === 1 && recorded.pushes[0][0] === 'SCR-03', 'and it opens SCR-03');
    await act(async () => { r.unmount(); });
  }

  // 11d. the prediction mesh is unavailable: the API's own reason, nothing drawn, nothing substituted
  {
    const backend = meshBackend({ missing: ['ART_RAW'] });
    const { r, recorded } = await mount(backend, P);
    check('V2R8', has(r, /EMPTY UNAVAILABLE/) && has(r, /(code|reason) ARTIFACT_NOT_FOUND/) && has(r, /does not exist on the server/), `unavailable with the API reason: ${texts(r).filter((t) => /ARTIFACT_NOT_FOUND|UNAVAILABLE/.test(t)).join(' | ')}`);
    check('V2R8', web(r) === null && has(r, /No mesh is drawn and nothing is substituted/), 'no viewer is mounted');
    const asked = backend.count('/reconstruction?');
    await press(r, 'Refresh');
    await tick(250);
    check('V2R8', backend.count('/reconstruction?') > asked && web(r) === null, 'Refresh asks again (and the answer is still unavailable)');
    check('V2R8', recorded.pops === 0, 'nothing navigated');
    await act(async () => { r.unmount(); });
  }
  {
    const backend = meshBackend({ reconstructionStatus: 409 });
    const { r } = await mount(backend, P);
    check('V2R8', has(r, /(code|reason) RUN_NOT_SUCCEEDED/) && web(r) === null, 'a run that did not succeed has no 3D: its code is shown');
    await act(async () => { r.unmount(); });
  }
  {
    // RAW-only run asked for PROCESSED: no mask id exists, so no reconstruction is requested at all
    const backend = meshBackend({ processed: false });
    const { r } = await mount(backend, { ...P, variant: 'PROCESSED' });
    const paths = backend.paths();
    check('V2R9', !paths.some((p) => p.includes('/reconstruction') || p.includes('error-reconstruction')) && has(r, /(code|reason) NO_PREDICTION_FOR_VARIANT/) && web(r) === null,
      'a PROCESSED request on a RAW-only run is unavailable (NO_PREDICTION_FOR_VARIANT): never the RAW mesh relabelled, and no error mesh asked for');
    await act(async () => { r.unmount(); });
    const withProc = meshBackend({ processed: true });
    const m2 = await mount(withProc, { ...P, variant: 'PROCESSED' });
    const p2 = withProc.paths();
    check('V2R9', p2.some((p) => p.endsWith('source_mask_id=ART_PROC')) && p2.some((p) => p.endsWith('error-reconstruction?prediction_variant=PROCESSED')) && has(m2.r, /Prediction \(PROCESSED\)/) && web(m2.r) !== null,
      'a run with a PROCESSED prediction shows it, labelled PROCESSED, and asks for the error mesh of that variant');
    await act(async () => { m2.r.unmount(); });
  }

  // 11e. bytes that do not hash to the id are CONTRACT_DRIFT, never drawn (DR-021 rule 1) - for each of the three files
  {
    const backend = meshBackend({ tamper: ['ART_RAW'] });
    const { r } = await mount(backend, P);
    check('V2R10', has(r, /FATAL INVALID/) && has(r, /(code|reason) CONTRACT_DRIFT/) && web(r) === null && !has(r, /Retry/), 'tampered prediction bytes: blocked with CONTRACT_DRIFT, no viewer, no Retry');
    await act(async () => { r.unmount(); });
    const gtTamper = meshBackend({ tamper: ['MASK_CASE_0061'] });
    const m2 = await mount(gtTamper, P);
    await fromViewer(m2.r, { type: 'ready' });
    check('V2R10', web(m2.r) !== null && has(m2.r, /error \(CONTRACT_DRIFT\)/) && sentJson().filter((m) => m.type === 'mesh').map((m) => m.role).join() === 'prediction,error',
      'tampered ground-truth bytes: that layer reads error, the prediction and the error map still draw, the bad bytes never reach the viewer');
    await act(async () => { m2.r.unmount(); });
    const errTamper = meshBackend({ error: { tamper: true } });
    const m3 = await mount(errTamper, P);
    await loadedAll(m3.r, [['prediction', 12, 8], ['groundTruth', 12, 8]]);
    check('V2R10', web(m3.r) !== null && texts(m3.r).filter((t) => /^error \(CONTRACT_DRIFT\): the artifact bytes do not hash to the checksum the server stated$/.test(t)).length === 2
      && sentJson().filter((m) => m.type === 'mesh').map((m) => m.role).join() === 'prediction,groundTruth',
    `tampered error bytes: FP and FN read error (${texts(m3.r).filter((t) => /^error/.test(t)).join(' | ')}), the surfaces still draw, the bad bytes never reach the viewer`);
    check('V2R10', JSON.stringify(layerMsg()) === JSON.stringify({ prediction: true, groundTruth: true, falsePositive: true, falseNegative: true })
      && ['FP: n/a', 'FN: n/a'].every((label) => { const b = entry(m3.r, label); return b && b.props.disabled === true; }),
    `with no usable error map the ground truth is on by default, so the disagreement still shows; the error switches are n/a: ${JSON.stringify(layerMsg())}`);
    check('V2R10', entry(m3.r, 'Retry failed layers') !== undefined && has(m3.r, /The 3D error map is not drawn \(see its layers above\)/), 'a retry is offered for a failed layer');
    await act(async () => { m3.r.unmount(); });
  }

  // 11f. a mesh for another grid, and the viewer's own errors
  {
    const wrongGrid = encodeMesh(boxMesh([100, 100, 88], [10, 10, 10], [20, 20, 12]));
    IDS.ART_RAW = wrongGrid;
    const backend = meshBackend();
    const { r } = await mount(backend, P);
    check('V2R11', has(r, /(code|reason) GEOMETRY_MISMATCH/) && web(r) === null, 'a mesh built for another grid than the case is refused');
    await act(async () => { r.unmount(); });
    IDS.ART_RAW = predBytes;
    const m2 = await mount(meshBackend(), P);
    await fromViewer(m2.r, { type: 'ready' });
    await fromViewer(m2.r, { type: 'error', role: null, code: 'WEBGL2_UNAVAILABLE', message: 'this WebView has no WebGL2' });
    check('V2R11', has(m2.r, /(code|reason) WEBGL2_UNAVAILABLE/) && web(m2.r) === null, 'a viewer that cannot draw is an error state with its code, not a blank box');
    await act(async () => { m2.r.unmount(); });
    const m3 = await mount(meshBackend(), P);
    await fromViewer(m3.r, { type: 'ready' });
    await fromViewer(m3.r, { type: 'error', role: 'groundTruth', code: 'VIEWER_ERROR', message: 'MESH_GRID: the two meshes do not share one grid' });
    check('V2R11', web(m3.r) !== null && has(m3.r, /error \(VIEWER_ERROR\): MESH_GRID/), 'a ground-truth layer the viewer refused reads error; the prediction stays');
    await act(async () => { m3.r.unmount(); });
    const m4 = await mount(meshBackend(), P);
    await loadedAll(m4.r, [['prediction', 12, 8], ['groundTruth', 12, 8]]);
    await fromViewer(m4.r, { type: 'error', role: 'error', code: 'VIEWER_ERROR', message: 'MESH_CLASSES: the class table must list FP then FN' });
    check('V2R11', web(m4.r) !== null && texts(m4.r).filter((t) => /^error \(VIEWER_ERROR\): MESH_CLASSES/.test(t)).length === 2 && has(m4.r, /^Prediction: ON$/) && has(m4.r, /^Ground truth: /),
    'an error container the viewer refused makes FP and FN read error with its message; the surfaces stay');
    await act(async () => { m4.r.unmount(); });
  }

  // 11g. no variant given: the screen asks, there is no default (same rule as SCR-03)
  {
    const { forgetSession } = await imp('src/verticals/v1/session.mjs');
    forgetSession();
    const backend = meshBackend();
    const { r } = await mount(backend, { caseId: 'CASE_0061', runId: 'RUN_A' });
    check('V2R12', has(r, /Prediction variant/) && has(r, /There is no default/) && web(r) === null
      && !backend.requests.some((u) => u.includes('/reconstruction') || u.includes('error-reconstruction')), 'no variant: the screen asks and requests no mesh');
    await press(r, 'RAW');
    await tick(250);
    check('V2R12', web(r) !== null && has(r, /Prediction \(RAW\)/) && backend.count('error-reconstruction?prediction_variant=RAW') === 1, 'after the choice the meshes are requested and shown');
    forgetSession();
    await act(async () => { r.unmount(); });
  }

  // 11h. fixture mode has no bytes behind any reference: an honest unavailable state, on every layer
  {
    const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson });
    const nav = { push: () => true, pop: () => true, replace: () => true, reset: () => true, canGoBack: true };
    let r;
    await act(async () => {
      r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
        React.createElement(Inspector3DScreen, { runtime, nav, params: { caseId: 'CASE_ID_0043', runId: 'RUN_ID_0043', variant: 'RAW', sliceIndex: 3 } })), nodeMocks);
    });
    await tick(120);
    check('V2R13', has(r, /(code|reason) FIXTURE_NO_BYTES/) && web(r) === null, `fixture mode: unavailable (FIXTURE_NO_BYTES), no mesh invented: ${texts(r).filter((t) => /(code|reason) /.test(t)).join(' | ')}`);
    await act(async () => { r.unmount(); });
  }

  // 11i. SCR-03's 3D entry opens SCR-05 with the run, the variant and the slice on screen
  {
    const backend = fakeBackend();
    const runtime = liveRuntime(backend.fetchImpl);
    const recorded = [];
    const nav = { push: (...a) => { recorded.push(a); return true; }, pop: () => true, replace: () => true, reset: () => true, canGoBack: true };
    let r;
    await act(async () => {
      r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
        React.createElement(CaseExplorerScreen, { runtime, nav, params: { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'PROCESSED' } })), nodeMock);
    });
    await tick(300);
    await layout(r);
    await tick(200);
    const three = r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith('3D (SCR-05)'))[0];
    check('V2R14', three && three.props.disabled === false, 'SCR-03: the 3D entry is enabled by a succeeded run that lists a reconstruction');
    await act(async () => { three.props.onPress(); });
    check('V2R14', recorded.length === 1 && recorded[0][0] === 'SCR-05'
      && JSON.stringify(recorded[0][1]) === JSON.stringify({ caseId: 'CASE_0061', runId: 'RUN_A', variant: 'PROCESSED', sliceIndex: 44 })
      && JSON.stringify(recorded[0][2]) === JSON.stringify({ runId: 'RUN_A', variant: 'PROCESSED', sliceIndex: 44 }),
    `SCR-03 -> SCR-05 carries case, run, variant and slice: ${JSON.stringify(recorded[0] ? [recorded[0][0], recorded[0][1]] : null)}`);
    await act(async () => { r.unmount(); });
  }

  // 11j. the error layers on their own, state by state: loading, unavailable (the API's reason), error, success - and the surfaces never lose
  {
    // loading: the error call is pending; the prediction and ground truth are drawn and read ready
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const backend = meshBackend({ error: { gate } });
    const { r } = await mount(backend, P);
    await loadedAll(r, [['prediction', 12, 8], ['groundTruth', 12, 8]]);
    check('V2S10', texts(r).filter((t) => t === 'loading…').length === 2 && has(r, /^12 triangles$/) && has(r, /^Prediction: ON$/),
      `LOADING: the error call is pending - FP and FN read loading, the prediction and ground truth read ready: ${texts(r).filter((t) => /loading|triangles/.test(t)).join(' | ')}`);
    check('V2S10', ['FP: n/a', 'FN: n/a'].every((label) => { const b = entry(r, label); return b && b.props.disabled === true; }) && web(r) !== null, 'and the error switches are n/a until the layers are ready; the viewer is up');
    check('V2S10', JSON.stringify(layerMsg()) === JSON.stringify({ prediction: true, groundTruth: false, falsePositive: true, falseNegative: true }),
      `a ground truth that is off by default does not flicker on while the error map loads: ${JSON.stringify(layerMsg())}`);
    release();
    await tick(250);
    await fromViewer(r, { type: 'loaded', role: 'falsePositive', triangles: 12, vertices: 8 });
    await fromViewer(r, { type: 'loaded', role: 'falseNegative', triangles: 12, vertices: 8 });
    check('V2S10', has(r, /^100 voxels · 12 triangles$/) && has(r, /^FP: ON$/) && has(r, /^FN: ON$/) && sentJson().filter((m) => m.type === 'mesh').map((m) => m.role).includes('error'),
      'SUCCESS: when it answers, the error bytes are verified and sent and both layers become ready');
    await act(async () => { r.unmount(); });
  }
  {
    // unavailable with the API's reason: not built; or the server says there is no ground truth (even though the case says it has one)
    for (const [status, code] of [[404, 'ARTIFACT_NOT_FOUND'], [404, 'GROUND_TRUTH_UNAVAILABLE']]) {
      const backend = meshBackend({ error: { status, code } });
      const { r } = await mount(backend, P);
      await loadedAll(r, [['prediction', 12, 8], ['groundTruth', 12, 8]]);
      check('V2S11', texts(r).filter((t) => t === `unavailable (${code})`).length === 2 && has(r, /^12 triangles$/) && web(r) !== null,
        `UNAVAILABLE: ${code} is the reason shown on FP and FN: ${texts(r).filter((t) => /unavailable/.test(t)).join(' | ')}`);
      check('V2S11', backend.count('.cmesh') === 2 && ['FP: n/a', 'FN: n/a'].every((label) => { const b = entry(r, label); return b && b.props.disabled === true; })
        && has(r, new RegExp(`The 3D error map is unavailable \\(${code}\\)\\. The prediction and ground-truth surfaces still show where they differ`)),
      'no error bytes were asked for; the screen says the surfaces still show the disagreement');
      check('V2S11', JSON.stringify(layerMsg()) === JSON.stringify({ prediction: true, groundTruth: true, falsePositive: true, falseNegative: true }),
        `and the ground truth is on by default (the fallback disagreement view): ${JSON.stringify(layerMsg())}`);
      await act(async () => { r.unmount(); });
    }
    // an id that is not an error-mesh id is not addressable
    const odd = meshBackend({ error: { badId: 'ERROR_MESH_ARTIFACT_ID_0043' } });
    const m2 = await mount(odd, P);
    check('V2S11', texts(m2.r).filter((t) => t === 'unavailable (MESH_NOT_ADDRESSABLE)').length === 2 && odd.count('.cmesh') === 2, 'an id that is not ERRMESH_<sha256> is unavailable (MESH_NOT_ADDRESSABLE): nothing is fetched for it');
    await act(async () => { m2.r.unmount(); });
  }
  {
    // error: the network drops, the layers read error with the code, a retry asks again and heals
    const backend = meshBackend({ error: { throws: true } });
    const { r } = await mount(backend, P);
    await loadedAll(r, [['prediction', 12, 8], ['groundTruth', 12, 8]]);
    check('V2S12', texts(r).filter((t) => /^error \(TRANSPORT_UNREACHABLE\)/.test(t)).length === 2 && has(r, /^Prediction: ON$/) && has(r, /^12 triangles$/),
      `ERROR: a dropped network reads error (TRANSPORT_UNREACHABLE) on FP and FN, the surfaces stay: ${texts(r).filter((t) => /^error/.test(t)).join(' | ')}`);
    const asked = backend.count('error-reconstruction');
    backend.error.healed = true;
    await press(r, 'Retry failed layers');
    await tick(300);
    await loadedAll(r, [['prediction', 12, 8], ['groundTruth', 12, 8], ['falsePositive', 12, 8], ['falseNegative', 12, 8]]);
    check('V2S12', backend.count('error-reconstruction') > asked && has(r, /^100 voxels · 12 triangles$/) && has(r, /^200 voxels · 12 triangles$/) && entry(r, 'Retry failed layers') === undefined,
      'Retry failed layers asks again, and the error map is there');
    await act(async () => { r.unmount(); });
  }
  {
    // error: the error mesh was made from other masks than the ones shown - never drawn, its bytes never fetched
    for (const [label, error] of [['the prediction mask', { prediction: 'ART_OTHER' }], ['the reference mask', { reference: 'MASK_CASE_0001' }]]) {
      const backend = meshBackend({ error });
      const { r } = await mount(backend, P);
      check('V2S13', texts(r).filter((t) => /^error \(MASK_MISMATCH\): the error mesh was made from other masks than the ones shown/.test(t)).length === 2
        && backend.count(`${sum(errBytes)}.cmesh`) === 0 && has(r, /^Prediction \(RAW\)$/) && web(r) !== null,
      `ERROR: ${label} differs - FP and FN read error (MASK_MISMATCH), the error bytes are not even fetched, the surfaces stay`);
      await act(async () => { r.unmount(); });
    }
    // a PROCESSED screen handed a RAW answer is never relabelled
    const raw = meshBackend({ processed: true, error: { prediction: 'ART_RAW' } });
    const m2 = await mount(raw, { ...P, variant: 'PROCESSED' });
    check('V2S13', texts(m2.r).filter((t) => /^error \(MASK_MISMATCH\)/.test(t)).length === 2, 'the RAW error mesh on a PROCESSED screen is a mismatch');
    await act(async () => { m2.r.unmount(); });
    // error: a mesh for another grid
    const grid = meshBackend({ error: { bytes: errWrongGrid } });
    const m3 = await mount(grid, P);
    check('V2S13', texts(m3.r).filter((t) => /^error \(GEOMETRY_MISMATCH\)/.test(t)).length === 2 && web(m3.r) !== null, 'an error mesh for another grid than the case: FP and FN read error (GEOMETRY_MISMATCH)');
    await act(async () => { m3.r.unmount(); });
  }
  {
    // success with zero error: a fact, not a missing layer
    const onlyFn = meshBackend({ error: { bytes: errOnlyFn } });
    const { r } = await mount(onlyFn, P);
    await loadedAll(r, [['prediction', 12, 8], ['groundTruth', 12, 8], ['falsePositive', 0, 0], ['falseNegative', 12, 8]]);
    check('V2S14', has(r, /^none: no false-positive voxels$/) && has(r, /^200 voxels · 12 triangles$/) && entry(r, 'FP: n/a').props.disabled === true && has(r, /^FN: ON$/),
      `SUCCESS with no false positives: "none: no false-positive voxels" (not a missing layer, not an error), FN as usual: ${texts(r).filter((t) => /none|voxels/.test(t)).join(' | ')}`);
    await act(async () => { r.unmount(); });
    const none = meshBackend({ error: { bytes: errNone } });
    const m2 = await mount(none, P);
    await loadedAll(m2.r, [['prediction', 12, 8], ['groundTruth', 12, 8], ['falsePositive', 0, 0], ['falseNegative', 0, 0]]);
    check('V2S14', has(m2.r, /^none: no false-positive voxels$/) && has(m2.r, /^none: no false-negative voxels$/) && !has(m2.r, /unavailable/) && !has(m2.r, /^error/),
      'no error at all: both layers say so in words, and neither reads unavailable or error');
    await act(async () => { m2.r.unmount(); });
  }

  // 11k. Back restores what the screen had: the layers, the camera and the slice
  {
    const layers = { prediction: false, groundTruth: true, falsePositive: false, falseNegative: true };
    const camera = { yaw: 1.5, pitch: -0.4, zoom: 3, pan: [0.2, -0.1] };
    const backend = meshBackend();
    const { r } = await mount(backend, { ...P, sliceIndex: 60, layers, camera });
    await loadedAll(r);
    check('V2R15', JSON.stringify(layerMsg()) === JSON.stringify(layers) && has(r, /^Prediction: OFF$/) && has(r, /^Ground truth: ON$/) && has(r, /^FP: OFF$/) && has(r, /^FN: ON$/),
      `the layers it had: ${JSON.stringify(layerMsg())}`);
    const cam = lastOf('camera');
    check('V2R15', cam && cam.yaw === 1.5 && cam.pitch === -0.4 && cam.zoom === 3 && cam.panX === 0.2 && cam.panY === -0.1, `the camera it had: ${JSON.stringify(cam)}`);
    check('V2R15', lastOf('slice').index === 60 && has(r, /slice 61 of 88 \(the 2D slice you came from\)/), 'and the plane on the slice it came back with');
    await act(async () => { r.unmount(); });
    // damaged or out-of-range params are dropped, not repaired
    const odd = await mount(meshBackend(), { ...P, sliceIndex: 200, layers: { prediction: 'no', other: true }, camera: { yaw: 0, pitch: 3, zoom: 1, pan: [0, 0] } });
    await loadedAll(odd.r);
    check('V2R15', !sentJson().some((m) => m.type === 'camera') && !sentJson().some((m) => m.type === 'slice' && m.index === 200) && lastOf('slice').index === null
      && has(odd.r, /The slice handed in \(200\) is outside this volume \(88 slices\)/) && has(odd.r, /No slice plane: no 2D slice is selected/),
    'a camera outside the gesture limits and a slice outside the volume are not used (and the slice is said to be refused)');
    await act(async () => { odd.r.unmount(); });
  }

  // 11l. QA #98 N-6 through the REAL navigator: SCR-03 -> 3D -> pick -> Open in 2D -> scrub -> Back reopens the 3D plane on the slice 2D ended on;
  //      and 3D -> Open errors -> SCR-04 -> move -> Back does the same
  {
    const { forgetSession } = await imp('src/verticals/v1/session.mjs');
    forgetSession();
    const backend = meshBackend();
    const runtime = liveRuntime(backend.fetchImpl);
    sent.length = 0;
    let r;
    await act(async () => {
      r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
        React.createElement(NavigatorView, { runtime, initialScreenId: 'SCR-02' })), nodeMock);
    });
    await tick(150);
    await press(r, 'CASE_0061');
    await tick(150);
    await press(r, 'RAW');
    await tick(300);
    await layout(r);
    await tick(200);
    check('V2N1', has(r, /SCR-03 · V1/) && has(r, /slice 45 \/ 88 {2}\(z = 44\)/), `SCR-03 opened on the middle slice: ${texts(r).find((t) => t.startsWith('slice ')) || '-'}`);
    await press(r, '3D (SCR-05)');
    await tick(300);
    check('V2N1', has(r, /SCR-05 · V2/) && web(r) !== null, 'the 3D screen opened');
    await loadedAll(r);
    check('V2N1', lastOf('slice').index === 44, 'its plane is at the 2D slice it came from (44)');
    await fromViewer(r, { type: 'camera', yaw: -0.2, pitch: 0.4, zoom: 2, panX: 0.1, panY: -0.2 });
    await press(r, 'FP: ON');                                // the user hides the FP layer before leaving
    await fromViewer(r, pick(52, 'falseNegative', 'FN'));
    await press(r, 'Open in 2D');
    await tick(300);
    await layout(r);
    await tick(200);
    check('V2N2', has(r, /SCR-03 · V1/) && has(r, /slice 53 \/ 88 {2}\(z = 52\)/), `Open in 2D: SCR-03 shows the picked slice: ${texts(r).find((t) => t.startsWith('slice ')) || '-'}`);
    await press(r, '+10');
    await tick(350);
    check('V2N2', has(r, /slice 63 \/ 88 {2}\(z = 62\)/), `the user moves on in 2D: ${texts(r).find((t) => t.startsWith('slice ')) || '-'}`);
    await press(r, '‹ Back');
    await tick(300);
    check('V2N3', has(r, /SCR-05 · V2/) && web(r) !== null, 'Back: the 3D screen is there again');
    await loadedAll(r);
    check('V2N3', lastOf('slice').index === 62 && has(r, /slice 63 of 88 \(the 2D slice you came from\)/) && has(r, /^slice 63 \/ 88 {2}\(z = 62\)$/),
      `N-6: the plane follows the 2D slice the user ended on (z = 62), not the one that was opened (52) or the first one (44): ${lastOf('slice').index}`);
    check('V2N3', JSON.stringify(layerMsg()) === JSON.stringify({ prediction: true, groundTruth: false, falsePositive: false, falseNegative: true }) && has(r, /^FP: OFF$/),
      `with the layers it had (FP hidden): ${JSON.stringify(layerMsg())}`);
    const cam = lastOf('camera');
    check('V2N3', cam && cam.yaw === -0.2 && cam.zoom === 2 && cam.panX === 0.1, `and the camera it had: ${JSON.stringify(cam)}`);
    // 3D -> SCR-04 at the FN face's slice, move there, Back
    await fromViewer(r, pick(11, 'falseNegative', 'FN'));
    await press(r, 'Open errors');
    await tick(400);
    await layout(r);
    await tick(250);
    check('V2N4', has(r, /SCR-04 · V1/) && has(r, /slice 12 \/ 88 {2}\(z = 11\)/), `Open errors: SCR-04 shows the FN face's slice: ${texts(r).find((t) => t.startsWith('slice ')) || '-'}`);
    await press(r, '+10');
    await tick(350);
    check('V2N4', has(r, /slice 22 \/ 88 {2}\(z = 21\)/), `the user moves on in SCR-04: ${texts(r).find((t) => t.startsWith('slice ')) || '-'}`);
    await press(r, '‹ Back');
    await tick(300);
    await loadedAll(r);
    check('V2N4', has(r, /SCR-05 · V2/) && lastOf('slice').index === 21 && has(r, /slice 22 of 88 \(the 2D slice you came from\)/),
      `Back from SCR-04 follows the slice it ended on (z = 21): ${lastOf('slice').index}`);
    // Back once more: SCR-03 reopens on the slice it was opened at (the 3D screen set nothing for it)
    await press(r, '‹ Back');
    await tick(300);
    await layout(r);
    await tick(250);
    check('V2N5', has(r, /SCR-03 · V1/) && has(r, /slice 45 \/ 88 {2}\(z = 44\)/) && has(r, /^Prediction \(RAW\)/),
      `Back from the 3D screen reopens SCR-03 on its own slice (44): ${texts(r).find((t) => t.startsWith('slice ')) || '-'}`);
    forgetSession();
    await act(async () => { r.unmount(); });
  }
}

console.log = origLog;
console.error = origError;
const appErrors = errors.filter((e) => !/act\(/.test(e) && !/react-test-renderer is deprecated/.test(e));
check('E1', appErrors.length === 0, `console.error from app code: ${appErrors.length}${appErrors.length ? ` - ${appErrors[0].slice(0, 300)}` : ''}`);
origLog(failures === 0 ? `RENDER SMOKE PASS - ${count} checks (logic only, not device evidence)` : `RENDER SMOKE FAIL - ${failures} of ${count}`);
process.exit(failures === 0 ? 0 : 1);
