/*
 * Render-smoke harness, part 2: the checks.  npm run test:render  (from mobile/)
 *
 * TEST-ONLY and NOT IN CI (it needs node_modules: react-test-renderer is a
 * devDependency, deprecated upstream). It renders the real shell and V1
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
  const views = r.root.findAll((n) => n.type === 'View' && typeof n.props.onLayout === 'function');
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
const { decodeMaskPng } = await imp('src/imaging/maskPng.js');
const { encodePng, ellipseMask } = await imp('test/_png.mjs');
const { generatedBundleJson, readContractJson } = await imp('test/_helpers.mjs');

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

// ---- 2. live runtime with a fake backend: bytes, overlays, gesture log ------
{
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
    if (/\/cases\/[^/]+$/.test(path)) return json(200, { ...gen('case_get'), case_id: 'CASE_0061', mode: 'EVALUATION', ground_truth_available: true, available_run_ids: ['RUN_A'] });
    if (/\/analysis-runs\/[^/]+$/.test(path)) return json(200, { ...gen('analysis_run_get'), run_id: 'RUN_A', case_id: 'CASE_0061', status: 'SUCCEEDED', precomputed: true, reconstruction_ids: ['REC_1'] });
    if (/\/experiments\/[^/]+$/.test(path)) return json(200, { ...gen('experiment_get'), model_family: 'UNet2D' });
    const z = (path.match(/slices\/(\d+)/) || [])[1];
    if (path.endsWith('/mri')) return json(200, { ...gen('mri_slice_get'), content_url: `/api/v1/artifacts/mri-${z}.png`, media_type: 'image/png', checksum: sum(mriPng) });
    if (path.includes('/prediction?')) return json(200, { ...gen('prediction_slice_get'), prediction_variant: 'RAW', content_url: `/api/v1/artifacts/pred-${z}.png`, media_type: 'image/png', checksum: sum(predPng) });
    if (path.endsWith('/ground-truth')) return json(200, { ...gen('ground_truth_slice_get'), content_url: `/api/v1/artifacts/gt-${z}.png`, media_type: 'image/png', checksum: sum(gtPng) });
    if (path.includes('/metrics?')) return json(200, { ...gen('analysis_slice_metrics'), metric_state: 'COMPUTED', metric_value: 0.8731, metric_version: 'm1' });
    return json(404, { error: { code: 'ARTIFACT_NOT_FOUND' } });
  };
  const runtime = createRuntime({
    config: resolveConfig({ mode: 'live', apiBaseUrl: 'http://backend.invalid:8000' }),
    contractJson, fetchImpl, decodeMask: decodeMaskPng, log: (line) => logs.push(line),
  });
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
  failSlice = 43;
  await press(r, '◀');
  await tick(350);
  check('L8', has(r, /could not be reached/) && has(r, /^Slice Dice: -$/) && !has(r, /0\.873/),
    'slice 44 fails: the state panel shows and the metric reads "-", not the previous slice\'s Dice');
  check('L8', has(r, /^MRI - · -$/) && has(r, /^Prediction - - · -$/) && has(r, /^Ground truth - · -$/),
    'provenance reads "-" for every layer');
  const off = ['Error inspector (SCR-04)', '3D (SCR-05)', 'Review / correct (SCR-06)'].map((l) => entry(l));
  check('L8', off.every((e) => e && e.props.disabled === true && textOf(e).includes('this slice did not load')),
    'SCR-04/05/06 entries disabled with the reason');
  failSlice = null;
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
  await act(async () => { r.unmount(); });
}

console.log = origLog;
console.error = origError;
const appErrors = errors.filter((e) => !/act\(/.test(e) && !/react-test-renderer is deprecated/.test(e));
check('E1', appErrors.length === 0, `console.error from app code: ${appErrors.length}${appErrors.length ? ` - ${appErrors[0].slice(0, 300)}` : ''}`);
origLog(failures === 0 ? `RENDER SMOKE PASS - ${count} checks (logic only, not device evidence)` : `RENDER SMOKE FAIL - ${failures} of ${count}`);
process.exit(failures === 0 ? 0 : 1);
