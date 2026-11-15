/*
 * Render-smoke harness, part 2: the checks.  npm run test:render  (from mobile/)
 *
 * TEST-ONLY. It needs node_modules (react-test-renderer is a devDependency,
 * deprecated upstream), so CI runs it in its own job, mobile-render-bundle,
 * after `npm ci --ignore-scripts` from the lockfile (DR-021 rule 4); the
 * other CI jobs have no node_modules. It renders the real shell, V1, V3 and V4
 * screens in Node with host-string React Native stand-ins (hooks.mjs), a real
 * app runtime, and either the generated fixture bundle or a fake live
 * backend whose PNGs are encoded here with node:zlib.
 *
 * What a PASS means: the screens' LOGIC renders and reacts as described - the
 * navigator, the states, the variant rule, the slice cache, the byte counts.
 * What it does NOT mean: anything about a device. No frame, gesture, decode
 * time or network on a phone is measured here; that evidence is logcat from
 * the A17 (tools/device/S1_L4_SCRIPT.md).
 */

import { createHash } from 'node:crypto';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { MOBILE } from './hooks.mjs';
import { startWatchdog, timeoutFromEnv } from './watchdog.mjs';

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
// Icons (src/components/icons.js) are react-native-svg drawings too; each icon's Svg has testID "icon-<Name>". A check
// that counts drawn marks (overlay paths, chart dots, mask rects, a chart's Svg) counts only the marks outside an icon.
const isIcon = (n) => n.type === 'Svg' && typeof n.props.testID === 'string' && n.props.testID.startsWith('icon-');
const inIcon = (n) => { for (let p = n; p; p = p.parent) if (isIcon(p)) return true; return false; };
const marks = (r, type) => r.root.findAll((n) => n.type === type && !inIcon(n));
const nodeMock = { createNodeMock: () => ({ measure: (cb) => cb(0, 0, 400, 400, 0, 0) }) };
async function layout(r) {
  const views = r.root.findAll((n) => typeof n.type === 'string' && typeof n.props.onLayout === 'function');
  await act(async () => { for (const v of views) v.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } } }); });
}
// The header's controls (Back, the Live / Fixture indicator, Info) have testIDs "header-..."; a check that presses a
// label means the screen's own button, so they are skipped. onScreen reads the screen from the header's testID.
const isHeaderControl = (n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('header-');
const onScreen = (r, screenId) => r.root.findAll((n) => n.props && n.props.testID === `screen-${screenId}`).length > 0;
async function press(r, label) {
  const hits = r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).includes(label) && !isHeaderControl(n));
  if (!hits.length) throw new Error(`no button "${label}"; texts: ${texts(r).slice(0, 40).join(' | ')}`);
  await act(async () => { hits[0].props.onPress(); });
}
// The header's Back is an arrow icon, found by its testID; it pops the stack as Android back does.
async function pressBack(r) {
  const hit = r.root.findAll((n) => n.type === 'TouchableOpacity' && n.props.testID === 'header-back')[0];
  if (!hit) throw new Error(`no header Back; texts: ${texts(r).slice(0, 40).join(' | ')}`);
  await act(async () => { hit.props.onPress(); });
}
const byTestId = (r, id) => r.root.findAll((n) => n.props && n.props.testID === id && typeof n.type === 'string')[0];
// V1 in Direction A: the transport buttons are icons, found by what a screen reader says.
const STEP = Object.freeze({
  next: 'Next slice, hold to repeat', prev: 'Previous slice, hold to repeat', fwd10: 'Forward 10 slices', back10: 'Back 10 slices',
  play: 'Play: sweep through the slices', pause: 'Pause the slice sweep',
});
const byLabel = (r, label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label && !isHeaderControl(n));
async function pressLabel(r, label) {
  const hit = byLabel(r, label)[0];
  if (!hit) throw new Error(`no button labelled "${label}"; texts: ${texts(r).slice(0, 40).join(' | ')}`);
  await act(async () => { hit.props.onPress(); });
}
async function pressId(r, id) {
  const hit = byTestId(r, id);
  if (!hit) throw new Error(`no node "${id}"; texts: ${texts(r).slice(0, 40).join(' | ')}`);
  await act(async () => { hit.props.onPress(); });
}
// The slice readout of the viewer's bottom panel: "Slice 45 / 88" (1-based; the z is in the Details sheet).
const readout = (r) => { const n = byTestId(r, 'slice-readout'); return n ? n.findAll((x) => x.type === 'Text').map(textOf)[0] : '-'; };
const onSlice = (r, n, total = 88) => readout(r) === `Slice ${n} / ${total}`;
// A screen rendered on its own gets a nav that keeps what it reports to the header (nav.setContext): its title,
// actions, "more" button and Details sections. ctxLines() flattens the Details sections.
function ctxNav(extra = {}) {
  const nav = { push: () => true, pop: () => true, replace: () => true, reset: () => true, canGoBack: true, ctx: null, ...extra };
  nav.setContext = (c) => { nav.ctx = c; };
  return nav;
}
const ctxLines = (nav) => (nav.ctx && Array.isArray(nav.ctx.details) ? nav.ctx.details.flatMap((sec) => sec.lines) : []);
const ctxHas = (nav, re) => ctxLines(nav).some((l) => re.test(l));
const ctxAction = (nav, key) => (nav.ctx && Array.isArray(nav.ctx.actions) ? nav.ctx.actions.find((a) => a.key === key) : null);
async function openTools(nav) { await act(async () => { nav.ctx.overflow.onPress(); }); }
async function closeSheet(r, id) { await pressId(r, `${id}-close`); }
// Outlines and their halos: a solid outline has a black halo under it (tokens: overlay.halo).
const isHalo = (n) => n.props.fill === 'none' && n.props.stroke === '#000000';
const tabBar = (r) => r.root.findAll((n) => n.type === 'TouchableOpacity' && n.props.accessibilityRole === 'tab');
const selectedTab = (r) => tabBar(r).filter((t) => t.props.accessibilityState.selected).map(textOf).join();
const gestures = () => logs.filter((l) => l.startsWith('CMW_GESTURE ')).map((l) => JSON.parse(l.slice(12)));
let failures = 0;
let count = 0;
// QA_PR88_D39 N-2: a regression that never settles (a request not aborted, a guard never released) must read as a red
// check, not as a hang. The whole run has 8 minutes (it takes about one); RENDER_SMOKE_TIMEOUT_MS overrides it.
const watchdog = startWatchdog({
  ms: timeoutFromEnv(process.env, 8 * 60 * 1000),
  onTimeout: ({ ms, last }) => {
    origLog(`  FAIL WATCHDOG the render smoke did not finish within ${Math.round(ms / 1000)} s (a request that is never aborted, a guard that is never released or a promise that never settles); the last check that ran was ${last}`);
    origLog(`RENDER SMOKE FAIL - did not finish (${count} checks ran)`);
    process.exit(1);
  },
});
const check = (id, ok, detail) => { count += 1; if (!ok) failures += 1; watchdog.note(id); origLog(`  ${ok ? 'ok  ' : 'FAIL'} ${id} ${detail}`); };

const imp = (p) => import(new URL(p, `file:///${MOBILE.replace(/\\/g, '/')}/`).href);
const { resolveConfig } = await imp('src/config.mjs');
const { createRuntime } = await imp('src/api/runtime.mjs');
const { RuntimeProvider } = await imp('src/api/RuntimeContext.js');
const NavigatorView = (await imp('src/navigation/Navigator.js')).default;
const CaseExplorerScreen = (await imp('src/screens/v1-cases/CaseExplorerScreen.js')).default;
const ExperimentComparisonScreen = (await imp('src/screens/v3-study/ExperimentComparisonScreen.js')).default;
const FindingsScreen = (await imp('src/screens/v4-review/FindingsScreen.js')).default;
const { decodeMaskPng } = await imp('src/lib/maskPng.js');
const { encodePng, ellipseMask } = await imp('test/_png.mjs');
const { generatedBundleJson, readContractJson } = await imp('test/_helpers.mjs');
const { judge, parseLog, PER_SLICE_ENDPOINTS } = await imp('scripts/l4-report.mjs');
const { shortTouchables } = await imp('test/render/touch_measure.mjs');

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
  check('S1', onScreen(r, 'SCR-01') && has(r, /Study Overview/), 'root is SCR-01 Study Overview');
  check('S1', textOf(byTestId(r, 'header-status')) === 'Fixture', 'the header says Fixture next to its grey dot');

  await press(r, 'Cases');
  await tick(60);
  check('S2', onScreen(r, 'SCR-02') && has(r, /Case List/), 'Cases tab opens SCR-02');
  check('S2', has(r, /Study STUDY_DEMO/), 'study id shown');

  const input = r.root.findAll((n) => n.type === 'TextInput')[0];
  await act(async () => { input.props.onChangeText('CASE_0043'); });
  await tick();
  await press(r, 'Open CASE_0043 directly');
  await tick(60);
  check('S3', onScreen(r, 'SCR-03') && has(r, /Case Explorer/), 'SCR-03 opened from the list');
  check('S3', has(r, /Prediction variant/) && has(r, /No default/), 'variant chooser asks (no default)');
  await press(r, 'RAW');
  await tick(150);
  await layout(r);
  await tick(60);
  check('S4', onSlice(r, 45) && !has(r, /\(z = \d+\)|^z \d+$/), `opens on the middle slice, numbered 1-based with no z on screen: ${readout(r)}`);
  await act(async () => { byTestId(r, 'header-info').props.onPress(); });
  check('S4', has(r, /^Slice 45 \/ 88 · z 44$/) && has(r, /^Prediction \(RAW\): /), 'the Details sheet has the z and the prediction layer with its variant');
  await closeSheet(r, 'details-sheet');
  check('S4', has(r, /Fixture mode: no pixels/), 'fixture mode says there are no pixels');
  check('S4', gestures().length === 0, 'fixture mode writes no CMW_GESTURE line (no network to account for)');
  await pressLabel(r, STEP.next);
  await tick(150);
  check('S5', onSlice(r, 46), 'step button moves one slice');
  await pressLabel(r, STEP.fwd10);
  await tick(150);
  check('S5', onSlice(r, 56), 'forward 10 moves ten slices');
  await press(r, 'Processed');
  await tick(200);
  check('S6', has(r, /Cannot show this safely/), 'fixture serves RAW for a PROCESSED request -> blocked, not relabelled');
  await press(r, 'Raw');
  await tick(200);
  check('S6', onSlice(r, 56) && !has(r, /Cannot show this safely/), 'back on Raw the viewer returns');
  const slices = logs.filter((l) => l.startsWith('CMW_SLICE '));
  check('S7', slices.length >= 2, `CMW_SLICE timing lines logged: ${slices.length}`);

  await pressBack(r);
  await tick(60);
  check('S8', onScreen(r, 'SCR-02'), 'Back returns to the list');
  await press(r, 'Findings');
  await tick();
  check('S8', onScreen(r, 'SCR-08'), 'Findings tab -> SCR-08 Findings');
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
    const path = url.replace('https://backend.invalid', '');
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
  config: resolveConfig({ mode: 'live', apiBaseUrl: 'https://backend.invalid' }),
  contractJson, fetchImpl, decodeMask: decodeMaskPng, log: (line) => logs.push(line),
});

// ---- 2. live runtime with a fake backend: bytes, overlays, gesture log ------
{
  // z 45's slice metrics are not ingested: its cached "unavailable" answer must
  // outlive a Retry and a refresh of other slices (L9, #78 QA N-4).
  const { fetchImpl, requests, mriPng, setFailSlice } = fakeBackend({ metricsMissingAt: [45] });
  const runtime = liveRuntime(fetchImpl);
  const nav = ctxNav();
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(CaseExplorerScreen, { runtime, nav, params: { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW' } })), nodeMock);
  });
  await tick(300);
  await layout(r);
  await tick(200);
  check('L1', onSlice(r, 45), `live: opens on the middle slice (${readout(r)})`);
  check('L1', ctxHas(nav, /^Run RUN_A · UNet2D · .* · precomputed$/) && !has(r, /RUN_A/),
    `the run line is in the Details sheet, not on the screen: ${ctxLines(nav).find((t) => t.startsWith('Run ')) || '-'}`);
  check('L1', ctxHas(nav, /^Slice Dice \(RAW\): 0\.873 · metric m1$/) && textOf(byTestId(r, 'slice-dice')) === '0.873',
    'server metric: the value in the corner, with variant and version in Details');
  // V1 in Direction A: what the floating app bar shows comes from the screen's report.
  check('A1', nav.ctx.title === 'CASE_0061' && /^UNet2D · /.test(nav.ctx.subtitle) && nav.ctx.onSubtitlePress === null
    && ctxAction(nav, 'privacy') && typeof nav.ctx.overflow.onPress === 'function',
  `app bar: ${nav.ctx.title} / ${nav.ctx.subtitle}; privacy shield; more (one run: no run picker)`);
  const panel = byTestId(r, 'viewer-panel');
  const inPanel = (fn) => (panel ? panel.findAll(fn).length : 0);
  check('A2', inPanel((n) => n.type === 'TouchableOpacity' && ['Raw', 'Processed'].includes(textOf(n))) === 2
    && inPanel((n) => n.props && n.props.accessibilityRole === 'adjustable') === 1
    && Object.values(STEP).filter((l) => l !== STEP.pause).every((l) => inPanel((n) => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === l) === 1),
  'B3: the bottom panel holds the variant, the slider and the five transport buttons at once');
  check('A2', ['Ground truth', 'Prediction'].every((l) => byTestId(r, `layer-${l}`)) && ['Fill', 'Outline', 'Both'].every((l) => byLabel(r, l).length === 1)
    && has(r, /^MRI$/) && has(r, /^Evaluation$/) && has(r, /^Slice Dice$/) && Boolean(byTestId(r, 'viewer-scrim')),
  'layer chips, the draw-mode toolbar and the corner annotations over the image; the screen draws the top scrim under them');
  const viewerShort = shortTouchables(r.root);
  check('T5', viewerShort.length === 0, `SCR-03: every touchable (layer chips, draw modes, variant, transport) reaches 48 dp${viewerShort.length ? ` - not: ${viewerShort.join(', ')}` : ''}`);
  const img = () => r.root.findAll((n) => n.type === 'Image')[0];
  check('L2', img() && img().props.source.uri.startsWith('data:image/png;base64,'), 'MRI drawn from fetched bytes (data URI)');
  check('L2', requests.some((u) => u.endsWith('/api/v1/artifacts/mri-44.png')), 'the bytes came from base URL + content_url');
  let paths = marks(r, 'Path').map((n) => n.props.d.length);
  check('L3', paths.length === 2 && paths.every((n) => n > 100), `prediction and ground truth both drawn from the start, one path each (${paths.join(',')} chars)`);
  await pressId(r, 'layer-Ground truth');
  await tick(250);
  paths = marks(r, 'Path').map((n) => n.props.d.length);
  check('L3', paths.length === 1, `the ground-truth chip hides it: the prediction alone (${paths.length} path)`);
  await pressId(r, 'layer-Ground truth');
  await tick(250);
  paths = marks(r, 'Path').map((n) => n.props.d.length);
  check('L3', paths.length === 2, `and shows it again (${paths.length} paths)`);
  // Fill / Outline / Both (V1 item 1): the outline is a second path with no fill, traced from the boundary pixels,
  // drawn over a black halo so it shows on bright tissue.
  const svgPaths = () => marks(r, 'Path');
  const outlinePaths = () => svgPaths().filter((n) => n.props.fill === 'none' && !isHalo(n));
  const halos = () => svgPaths().filter(isHalo);
  await press(r, 'Outline');
  check('O1', svgPaths().length === 4 && outlinePaths().length === 2 && halos().length === 2
    && outlinePaths().every((n) => n.props.strokeWidth > 0 && /^M\d+ \d+[hv]/.test(n.props.d) && n.props.d.endsWith('z')),
  `Outline: ${outlinePaths().length} outline paths over ${halos().length} halos, no fill (stroke ${outlinePaths()[0] ? outlinePaths()[0].props.strokeWidth.toFixed(3) : '-'} source px)`);
  const w2 = outlinePaths()[0].props.strokeWidth;
  await openTools(nav);
  check('A3', has(r, /^Tools$/) && ['Error inspector', '3D view', 'Review and correct'].every((l) => has(r, new RegExp(`^${l}$`)))
    && has(r, /^Outline width/) && has(r, /^Fill opacity/), 'the Tools sheet behind "more": the three views to open and the display settings');
  await press(r, '3 px');
  check('O1', Math.abs(outlinePaths()[0].props.strokeWidth / w2 - 1.5) < 1e-9, 'the 3 px setting widens the outline 1.5 times (it is set in screen pixels)');
  await press(r, 'Both');
  check('O1', svgPaths().length === 6 && outlinePaths().length === 2, `Both: fill, halo and outline for each layer (${svgPaths().length} paths)`);
  await press(r, '2 px');
  await closeSheet(r, 'tools-sheet');
  check('A3', !has(r, /^Tools$/), 'the Tools sheet closes');
  await press(r, 'Fill');
  check('O1', svgPaths().length === 2 && outlinePaths().length === 0, 'back to Fill: the two filled layers only');
  await act(async () => { img().props.onLoad({ nativeEvent: { source: { width: 576, height: 576 } } }); });
  await tick(30);

  const open = gestures().find((g) => g.kind === 'open');
  check('L4', open && open.requests.length >= 5 && open.requests.every((q) => q.bytes > 0),
    `open gesture: ${open ? open.requests.length : 0} requests, every one with a byte count`);

  await pressLabel(r, STEP.next);
  await tick(350);
  check('L5', img().props.source.uri.startsWith('data:') && onSlice(r, 46), 'next slice displayed');
  const fresh = gestures().filter((g) => g.kind === 'slice').pop();
  const endpoints = fresh ? fresh.requests.map((q) => q.endpoint).sort().join(',') : '';
  check('L5', fresh && fresh.from === 44 && fresh.to === 45 && !fresh.cache_hit, `new slice gesture z 44->45: ${endpoints}`);
  check('L5', fresh && fresh.requests.some((q) => q.endpoint === 'artifact:mri' && q.bytes === mriPng.length),
    `MRI bytes counted exactly (${mriPng.length})`);
  check('L5', fresh && fresh.requests.every((q) => q.endpoint !== 'case_get'), 'no case-level or volume request per slice gesture');

  const before = requests.length;
  await pressLabel(r, STEP.prev);
  await tick(350);
  const sent = requests.slice(before);
  const revisit = gestures().filter((g) => g.kind === 'slice').pop();
  check('L6', sent.length === 0, `back to z 44: ${sent.length} requests of any kind`);
  check('L6', revisit && revisit.cache_hit === true && revisit.bytes_total === 0 && revisit.from === 45 && revisit.to === 44,
    `revisit gesture is a cache hit with 0 bytes: ${revisit ? JSON.stringify({ cache_hit: revisit.cache_hit, bytes: revisit.bytes_total }) : '-'}`);
  await act(async () => { img().props.onLoad({ nativeEvent: { source: { width: 575, height: 576 } } }); });
  await tick(30);
  check('L7', has(r, /575x576 but the case geometry says 576x576/), 'an MRI of the wrong size blocks the overlays and says why');
  check('L7', marks(r, 'Path').length === 0, 'and no overlay is drawn over it');

  // #77 QA B-3: a slice that fails shows nothing of the slice displayed before.
  const entry = (label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label))[0];
  check('L8', !has(r, /^MRI .+ · .+/) && ctxHas(nav, /^MRI \S+ · sha256:\S+$/) && !has(r, /sha256/),
    'B2: the artifact ids and checksums are in the Details sheet, not on the screen');
  await openTools(nav);
  check('L8', ctxHas(nav, /^MRI \S+ · \S+$/) && !ctxHas(nav, /^MRI - · -$/) && entry('Error inspector').props.disabled === false,
    'before: provenance and the SCR-04 entry belong to the displayed slice');
  setFailSlice(43);
  await pressLabel(r, STEP.prev);
  await tick(350);
  check('L8', has(r, /could not be reached/) && ctxHas(nav, /^Slice Dice: -$/) && textOf(byTestId(r, 'slice-dice')) === '—' && !has(r, /0\.873/),
    'slice 44 fails: the state panel shows and the metric reads "—", not the previous slice\'s Dice');
  check('L8', ctxHas(nav, /^MRI - · -$/) && ctxHas(nav, /^Prediction - - · -$/) && ctxHas(nav, /^Ground truth - · -$/),
    'provenance reads "-" for every layer');
  const off = ['Error inspector', '3D view', 'Review and correct'].map((l) => entry(l));
  check('L8', off.every((e) => e && e.props.disabled === true && textOf(e).includes('this slice did not load')),
    'SCR-04/05/06 entries disabled with the reason');
  setFailSlice(null);
  let mark = requests.length;
  await press(r, 'Retry');
  await tick(400);
  const retried = requests.slice(mark).map((u) => u.replace('https://backend.invalid', ''));
  check('L9', onSlice(r, 44) && ctxHas(nav, /^Slice Dice \(RAW\): 0\.873/) && entry('Error inspector').props.disabled === false,
    'Retry brings slice 44 back with its own metric and entries');
  check('L9', retried.length > 0 && retried.every((u) => u.includes('/slices/43/') || u.startsWith('/api/v1/artifacts/')),
    `Retry asked only for that slice: ${retried.length} requests`);
  await closeSheet(r, 'tools-sheet');
  mark = requests.length;
  await pressLabel(r, STEP.next);
  await tick(350);
  check('L9', requests.length === mark && onSlice(r, 45), 'and the slice next to it is still cached (N-2: no clear-all)');
  mark = requests.length;
  await openTools(nav);
  await press(r, 'Refresh this slice');
  await tick(400);
  const refreshed = requests.slice(mark).map((u) => u.replace('https://backend.invalid', ''));
  const rg = gestures().filter((g) => g.kind === 'refresh').pop();
  check('L9', refreshed.length > 0 && refreshed.every((u) => u.includes('/slices/44/') || u.startsWith('/api/v1/artifacts/'))
    && rg && rg.to === 44 && rg.outcome === 'shown' && !has(r, /^Tools$/),
    `"Refresh this slice" (Tools) re-asks for z 44 only, logged as a refresh gesture (${refreshed.length} requests)`);
  // #78 QA N-4: Retry (z 43) and Refresh (z 44) forgot only their own slice - z 45's
  // cached "unavailable" metrics answer is still there, so going back asks nothing.
  mark = requests.length;
  await pressLabel(r, STEP.next);
  await tick(350);
  check('L9', requests.length === mark && onSlice(r, 46) && ctxHas(nav, /^Slice Dice: unavailable \(ARTIFACT_NOT_FOUND\)$/)
    && textOf(byTestId(r, 'slice-dice')) === 'Unavailable',
    `back to z 45 after Retry and Refresh of other slices: ${requests.length - mark} requests; its "unavailable" answer survived`);

  // Play (V1 item 3): one slice at a time, each on screen before the next is asked for, so no gesture is ever
  // superseded by the next one.
  const playMark = gestures().length;
  await pressLabel(r, STEP.play);
  for (let i = 0; i < 60 && gestures().slice(playMark).length < 4; i += 1) await tick(100);
  await pressLabel(r, STEP.pause);
  await tick(500);
  const played = gestures().slice(playMark);
  check('P1', played.length >= 4 && played.every((g) => g.kind === 'slice' && g.to === g.from + 1 && g.outcome === 'shown')
    && played.every((g, i) => i === 0 || g.from === played[i - 1].to),
  `Play: ${played.map((g) => `${g.from}->${g.to} ${g.outcome}`).join(', ')}`);
  const afterPause = gestures().length;
  await tick(600);
  check('P1', gestures().length === afterPause && byLabel(r, STEP.play).length === 1, 'Pause stops the sweep: no slice asked for after it');

  // Hold "next": one step at once, then one every 120 ms until the finger lifts; the newest slice wins.
  const sliceNo = () => Number((readout(r).match(/^Slice (\d+) /) || [])[1]);
  const from = sliceNo();
  const next = byLabel(r, STEP.next)[0];
  await act(async () => { next.props.onLongPress(); });
  await tick(400);
  await act(async () => { next.props.onPressOut(); });
  await tick(800);
  const after = sliceNo();
  check('P2', after - from >= 3, `holding "next" for 400 ms stepped from slice ${from} to ${after}, then stopped`);

  // Double tap: the viewer opens at 1.6x fit (no zoom readout there); a double tap fits the whole slice, the next
  // one zooms 2x about the finger, the next fits again. (The viewport was re-mounted after the L8 error, so it lays
  // out again first.)
  await layout(r);
  const viewport = () => r.root.findAll((n) => n.type === 'View' && n.props.__pan)[0].props.__pan;
  const tapAt = async (x, y) => {
    await act(async () => {
      viewport().onPanResponderGrant({ nativeEvent: { touches: [{ pageX: x, pageY: y }] } });
      viewport().onPanResponderRelease();
    });
  };
  check('P3', !has(r, /^×\d/), 'the opening view (1.6x fit) shows no zoom readout');
  await tapAt(200, 200);
  await tapAt(204, 203);
  check('P3', !has(r, /^×\d/), 'a double tap from the opening view fits the whole slice');
  await tick(400);
  await tapAt(200, 200);
  await tapAt(204, 203);
  check('P3', has(r, /^×2\.0$/), `the next double tap zooms to 2x (${texts(r).find((t) => t.startsWith('×')) || 'no zoom label'})`);
  await tick(400);
  await tapAt(150, 150);
  await tapAt(150, 152);
  check('P3', !has(r, /^×\d/), 'and the next returns to fit');

  // Pinch-in stops at fit (device P9: it stopped at x0.9, below fit). Zoom to 2x, then pinch in far past fit.
  await tick(400);
  await tapAt(200, 200);
  await tapAt(204, 203);
  check('P3', has(r, /^×2\.0$/), 'zoomed to 2x again');
  const pinch = async (from, to) => {
    const two = (d) => ({ nativeEvent: { touches: [{ pageX: 200 - d / 2, pageY: 300 }, { pageX: 200 + d / 2, pageY: 300 }] } });
    await act(async () => {
      viewport().onPanResponderGrant(two(from));
      viewport().onPanResponderMove(two(to));
      viewport().onPanResponderRelease();
    });
  };
  await pinch(300, 200);
  check('P3', has(r, /^×1\.3$/), `a pinch-in to two thirds of the distance from 2x reads x1.3 (${texts(r).find((t) => t.startsWith('×')) || 'fit'})`);
  await pinch(300, 20);
  check('P3', !texts(r).some((t) => /^×0\./.test(t)) && !has(r, /^×\d/), 'a pinch-in far past fit ends on fit: no readout below 1.0x');

  // Play ends on the last slice (device P15: it went round to slice 1), and Play there starts over from slice 1.
  const gotoSlice = async (n) => {
    for (let i = 0; i < 30 && sliceNo() !== n; i += 1) {
      const d = n - sliceNo();
      await pressLabel(r, d > 0 ? (d >= 10 ? STEP.fwd10 : STEP.next) : (d <= -10 ? STEP.back10 : STEP.prev));
      await tick(120);
    }
  };
  await gotoSlice(86);
  await pressLabel(r, STEP.play);
  for (let i = 0; i < 80 && byLabel(r, STEP.pause).length === 1; i += 1) await tick(100);
  check('P4', onSlice(r, 88) && byLabel(r, STEP.play).length === 1 && byLabel(r, STEP.pause).length === 0,
    `Play from slice 86 ended by itself on ${readout(r)}; the button reads Play again`);
  const atEnd = gestures().length;
  await tick(700);
  check('P4', gestures().length === atEnd && onSlice(r, 88), 'and it did not go round to slice 1');
  await pressLabel(r, STEP.play);
  for (let i = 0; i < 40 && !onSlice(r, 3); i += 1) await tick(100);
  await pressLabel(r, STEP.pause);
  const restart = gestures().slice(atEnd);
  check('P4', restart.length >= 3 && restart[0].from === 87 && restart[0].to === 0 && restart.every((g, i) => i === 0 || g.to === g.from + 1),
    `Play on slice 88 starts again from slice 1, then one slice at a time: ${restart.map((g) => `${g.from}->${g.to}`).join(', ')}`);

  // Privacy mode (V1 item 5): on by default. This test build has no expo-screen-capture, so it says it cannot block
  // screenshots yet instead of claiming protection; the shield in the app bar still records the user's choice and is
  // accent only while the screen is really protected.
  const shield = () => ctxAction(nav, 'privacy');
  check('V5', shield().label === 'Privacy mode: not available in this build' && shield().active === false
    && ctxHas(nav, /so screenshots are not blocked\.$/), 'privacy mode on by default; without the module the shield is not lit and Details says screenshots are not blocked');
  await act(async () => { shield().onPress(); });
  await tick(30);
  check('V5', shield().label === 'Privacy mode: OFF (not available in this build)' && ctxHas(nav, /^Privacy mode: OFF/),
    'switched off, it reads OFF');
  await act(async () => { shield().onPress(); });
  await tick(30);
  await act(async () => { r.unmount(); });
}

// ---- 2c. F1 (device bug B1): no black frame between slices (the viewport on its own) -----------
// The fake backend serves the same MRI bytes for every slice, so this drives the viewport with two pictures: the
// next slice loads under the one on screen, which keeps its own overlays until the next one has loaded.
{
  const SliceViewport = (await imp('src/screens/v1-cases/SliceView.js')).default;
  const layer = (key, d) => ({ key, path: d, outline: null, color: '#f0883e', opacity: 0.5, visible: true });
  const at = (uri, d) => React.createElement(SliceViewport, {
    shape: [576, 576, 88], imageUri: uri, layers: [layer('pred', d)], resetKey: 'C', fill: true, insets: { top: 56, bottom: 168 }, initialZoom: 1.6,
  });
  let r;
  await act(async () => { r = TestRenderer.create(at('data:image/png;base64,AAAA', 'M1 1h4v4h-4z'), nodeMock); });
  await layout(r);
  const imgs = () => r.root.findAll((n) => n.type === 'Image');
  const drawn = () => marks(r, 'Path').map((n) => n.props.d).join('|');
  check('F1', imgs().length === 1 && drawn() === 'M1 1h4v4h-4z', 'first slice: one picture loading, its overlay drawn');
  await act(async () => { imgs()[0].props.onLoad({ nativeEvent: { source: { width: 576, height: 576 } } }); });
  await act(async () => { r.update(at('data:image/png;base64,BBBB', 'M9 9h4v4h-4z')); });
  check('F1', imgs().length === 2 && imgs()[0].props.source.uri.endsWith('BBBB') && imgs()[1].props.source.uri.endsWith('AAAA')
    && drawn() === 'M1 1h4v4h-4z',
  `next slice asked: it loads under the picture on screen, which keeps its overlay (${imgs().map((n) => n.props.source.uri.slice(-4)).join(' under ')}, overlay ${drawn()})`);
  await act(async () => { imgs()[0].props.onLoad({ nativeEvent: { source: { width: 576, height: 576 } } }); });
  check('F1', imgs().length === 1 && imgs()[0].props.source.uri.endsWith('BBBB') && drawn() === 'M9 9h4v4h-4z',
    'once it has loaded: one picture, the new slice, with its own overlay - never a black frame in between');
  await act(async () => { r.update(at('data:image/png;base64,CCCC', 'M2 2h4v4h-4z')); });
  await act(async () => { imgs()[0].props.onError({ nativeEvent: { error: 'bad png' } }); });
  check('F1', imgs().every((n) => !n.props.source.uri.endsWith('BBBB')), 'a slice that cannot be decoded does not leave the previous picture under its number');
  await act(async () => { r.unmount(); });
}
// ---- 2b. an INFERENCE_REVIEW case on SCR-03 (#77 QA N-11) ------------------
// No ground truth: no ground-truth toggle, the SCR-04 entry disabled with that
// reason, and not one request for ground truth or metrics during the session.
{
  const { fetchImpl, requests } = fakeBackend({ caseMode: 'INFERENCE_REVIEW' });
  const runtime = liveRuntime(fetchImpl);
  const nav = ctxNav();
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(CaseExplorerScreen, { runtime, nav, params: { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW' } })), nodeMock);
  });
  await tick(300);
  await layout(r);
  await tick(200);
  await pressLabel(r, STEP.next);
  await tick(350);
  const gtToggles = r.root.findAll((n) => n.type === 'TouchableOpacity' && /^Ground truth/.test(textOf(n)));
  check('L10', onSlice(r, 46) && has(r, /^Inference & review$/) && gtToggles.length === 0
    && ctxHas(nav, /^Ground truth: none for this case \(Inference & review\) - no ground-truth layer, metric or error view is offered\.$/),
    `INFERENCE_REVIEW: no ground-truth chip (${gtToggles.length}); the corner names the mode and Details says why`);
  await openTools(nav);
  const scr04 = r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith('Error inspector'))[0];
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
    const path = url.replace('https://backend.invalid', '');
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
    config: resolveConfig({ mode: 'live', apiBaseUrl: 'https://backend.invalid' }),
    contractJson, fetchImpl, decodeMask: decodeMaskPng, log: (line) => logs.push(line),
  });
  const nav = ctxNav();
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
  check('N1', onSlice(r, 45) && ctxHas(nav, /^No analysis run for this case - MRI and ground truth only/) && nav.ctx.subtitle === 'No analysis run'
    && !has(r, /No default/), 'no run: opens straight into the viewer on the middle slice; the app bar and Details say there is no run');
  const img = () => r.root.findAll((n) => n.type === 'Image')[0];
  check('N2', img() && img().props.source.uri.startsWith('data:image/png;base64,') && runData().length === 0,
    `MRI drawn from its bytes; run requests: ${runData().length}`);
  const entry = (label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label))[0];
  await openTools(nav);
  check('N3', has(r, /^No analysis run$/) && !byTestId(r, 'layer-Prediction') && !has(r, /^(Raw|Processed)$/)
    && ['Error inspector', '3D view', 'Review and correct'].every((l) => entry(l) && entry(l).props.disabled === true && textOf(entry(l)).includes('needs an analysis run')),
    'no variant control or prediction chip; SCR-04/05/06 disabled with "needs an analysis run"');
  await closeSheet(r, 'tools-sheet');
  check('N4', ctxHas(nav, /^Slice Dice: - \(no analysis run for this case\)$/) && textOf(byTestId(r, 'slice-dice')) === '—', 'the slice metric says why it is empty');
  await tick(300);
  check('N5', marks(r, 'Path').length === 1, 'ground-truth overlay drawn from the start (the only mask)');

  // The L4 15 + 15 run, started the way the leader starts it: long-press the slice number.
  const label = byTestId(r, 'slice-readout');
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
  const nav = ctxNav();
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
  await openTools(nav);
  const scr04 = entry('Error inspector');
  check('N7', onSlice(r, 45) && ctxHas(nav, /^Requested run RUN_GONE is not listed for this case - MRI and ground truth only/)
    && nav.ctx.subtitle === 'Run RUN_GONE not listed'
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
    config: resolveConfig({ mode: 'live', apiBaseUrl: 'https://backend.invalid' }),
    contractJson, fetchImpl, decodeMask: decodeMaskPng, log: (line) => logs.push(line),
  });
  const nav = ctxNav();
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(CaseExplorerScreen, { runtime, nav, params: { caseId: 'CASE_0061' } })), nodeMock);
  });
  await tick(300);
  await layout(r);
  await tick(200);
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
    const label = byTestId(r, 'slice-readout');
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
// Both screens through the real navigator, under the Fixture indicator, each
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
  check('V3R1', onScreen(r, 'SCR-01') && has(r, /^Fixture$/), 'SCR-01 renders under the Fixture indicator');
  check('V3R1', has(r, /^Study STUDY_DEMO$/) && has(r, /^1 of 7 matrix experiments listed by the server$/)
    && has(r, /^Outliers \(DR-010\)$/) && has(r, /^1 finding returned$/), 'SCR-01 draws its model: study, matrix, outliers, findings');
  await press(r, 'Open the comparison (SCR-07)');
  await tick(60);
  check('V3R2', onScreen(r, 'SCR-07') && has(r, /^Fixture$/), 'SCR-07 opened from SCR-01, under the Fixture indicator');
  check('V3R2', has(r, /filled from the server's experiment list$/) && has(r, /^Comparisons \(server verdicts\)$/),
    'SCR-07 draws its model: the matrix and the server verdicts');
  // The generated list names one matrix experiment (EXP-D-PP, refused), so no
  // summary names a metric: no chip is offered, and the screen says why.
  check('V3R2', has(r, /^The server's summaries name no metric yet - nothing to plot\.$/), 'no metric to pick, and it says so');
  await layout(r);
  await tick(30);
  check('V3R2', marks(r, 'Svg').length === 1, 'the strip plot is drawn, empty');
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
  const dots = marks(r, 'Circle');
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
  const ErrorInspectorScreen = (await imp('src/screens/v1-cases/ErrorInspectorScreen.js')).default;
  const pushes = [];
  const nav = ctxNav({ push: (id, p) => { pushes.push([id, p]); return true; } });
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
  // The legend's heading names the slice on screen ("Slice 45 / 88"), or "-" while there is none.
  const legendFor = (r) => {
    const i = texts(r).indexOf('Legend');
    return i >= 0 ? texts(r)[i + 1] : null;
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
  // SCR-04 draws each class as fill and outline (Both) by default; `paths` counts the fills, one per class. A solid
  // outline has a black halo under it; FP's dashed edge has none (the halo would fill its gaps).
  const paths = () => marks(r, 'Path').filter((n) => n.props.fill !== 'none');
  const outlines = () => marks(r, 'Path').filter((n) => n.props.fill === 'none' && !isHalo(n));
  check('E4c', paths().length === 3, `TP / FP / FN drawn as three filled paths (${paths().length})`);
  check('O2', outlines().length === 3 && outlines().map((n) => n.props.stroke).join() === paths().map((n) => n.props.fill).join()
    && marks(r, 'Path').filter(isHalo).length === 2,
  'Both by default: each class also has its outline, in the class colour; the two solid ones over a halo');
  const dashedEdges = outlines().filter((n) => Array.isArray(n.props.strokeDasharray));
  check('C1', dashedEdges.length === 1 && dashedEdges[0].props.stroke === '#f778ba' && paths().map((n) => n.props.fill).join() === '#56d364,#f778ba,#4c8dff'
    && has(r, /^predicted, not in the ground truth · dashed edge$/),
  `TP green, FP magenta with the only dashed edge, FN blue (${paths().map((n) => n.props.fill).join(', ')}); the legend says "dashed edge"`);
  const chip = (k) => byTestId(r, `class-${k}`);
  const swatchOf = (k) => chip(k).findAll((n) => n.type === 'View' && n.props.style && [].concat(n.props.style).some((st) => st && st.borderStyle === 'dashed'));
  check('C2', ['TP', 'FP', 'FN'].every((k) => chip(k) && /^[A-Z]{2} \d+ px$/.test(textOf(chip(k))) && chip(k).props.accessibilityState.checked === true)
    && swatchOf('FP').length === 1 && swatchOf('TP').length === 0 && swatchOf('FN').length === 0,
  `the legend as chips over the image, with counts; only FP's swatch is dashed (${['TP', 'FP', 'FN'].map((k) => textOf(chip(k))).join(', ')})`);
  await press(r, 'Outline');
  check('O2', paths().length === 0 && outlines().length === 3, 'Outline: the three class edges only, the MRI shows through');
  await press(r, 'Both');
  check('V5', ctxAction(nav, 'privacy') && ctxAction(nav, 'privacy').label === 'Privacy mode: not available in this build',
    'SCR-04 has the same privacy shield, on by default');
  check('E4c', has(r, /TP - agree · \d+ px/) && has(r, /FP - over-segmentation · \d+ px/) && has(r, /FN - missed · \d+ px/),
    'legend: every class named in words with its pixel count');
  check('E4d', has(r, /Differs from the server for this slice|Matches the server for this slice/),
    'masks on screen compared with the server\'s FP / FN for the slice');
  const jump = () => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n) === 'Jump to the worst slice')[0];
  check('E4e', jump() && has(r, /^Slice 53 \/ 88 · Dice 0\.620 · FP 120 · FN 340$/) && !has(r, /\(z = \d+\)|· z \d+ /),
    'worst slice = the server\'s first entry (a button), though DR-010 would rank z 44 (Dice 0.310) first (N-1); numbered 1-based, no z');
  const listed = texts(r).filter((t) => /^Slice \d+ \/ 88 · Dice /.test(t)).map((t) => Number(t.match(/^Slice (\d+) /)[1]));
  check('E4e', has(r, /^#2$/) && has(r, /^#3$/) && listed.join(',') === '53,45,31',
    `the list in the server's order, never re-ranked: slices ${listed.join(', ')}`);
  check('E4f', has(r, /^0\.810$/) && has(r, /^0\.680$/) && has(r, /^-4\.2 %$/) && has(r, /^FP 1200 · FN 900 voxels$/), 'case metrics as the server sent them');
  const bars = () => marks(r, 'Rect').filter((n) => n.props.fill !== 'none').length;
  check('E4g', bars() === 3, `profile: one bar per eligible slice, none for the rest (${bars()})`);
  // P3: no decision-record id and no "server ·" label on the main surface; the source is said once, in Details.
  check('E4g', !texts(r).some((t) => /DR-0\d\d|^server ·|^server$/.test(t)) && has(r, /^Worst slices$/) && has(r, /^FP \+ FN per slice$/)
    && has(r, /^Pixels in error on each slice\. Tap a bar to open that slice\.$/) && has(r, /^Raw$/)
    && ctxHas(nav, /^Case metrics, worst slices and the error profile are the server's, shown as served\./)
    && ctxHas(nav, /^Worst slices: DR-010 · /),
  'SCR-04: no "server ·" prefix and no DR-010 on the main surface; one plain line under the profile; the source and the rule are in Details');
  const slice4 = shortTouchables(r.root);
  check('T5', slice4.length === 0, `SCR-04: every touchable (chips, settings, worst slices, jump, 3D) reaches 48 dp${slice4.length ? ` - not: ${slice4.join(', ')}` : ''}`);
  const reqMark = evalBackend.requests.length;
  const gestureMark = gestures().length;
  await press(r, 'Jump to the worst slice');
  await tick(400);
  check('E4h', onSlice(r, 53) && legendFor(r) === 'Slice 53 / 88', 'jump lands on the server\'s worst slice');

  // #78 QA N-3 (L4, NFR-PERF-001 limb 2): the jump and a previous / next step ask for those slices and nothing else.
  await pressLabel(r, STEP.prev);
  await tick(400);
  await pressLabel(r, STEP.next);
  await tick(400);
  const sinceJump = evalBackend.requests.slice(reqMark).map((u) => u.replace('https://backend.invalid', ''));
  const outOfScope = sinceJump.filter((u) => !(/\/slices\/(51|52)\//.test(u) || u.startsWith('/api/v1/artifacts/')));
  check('E4m', onSlice(r, 53) && sinceJump.length > 0 && outOfScope.length === 0,
    `jump, previous, next: ${sinceJump.length} requests, each /slices/<z>/ of z 52 or 51 or an artifact${outOfScope.length ? `; other: ${outOfScope.join(' ')}` : ''}`);
  const lines = gestures().slice(gestureMark);
  const seen = [...new Set(lines.flatMap((g) => g.requests.map((q) => q.endpoint)))].sort();
  check('E4m', lines.length === 3 && lines.every((g) => g.kind === 'slice' && g.requests.every((q) => PER_SLICE_ENDPOINTS.includes(q.endpoint))),
    `${lines.length} CMW_GESTURE lines, only per-slice endpoints: ${seen.join(', ')}`);
  await pressId(r, 'class-FP');
  await tick(30);
  check('E4i', paths().length === 2 && has(r, /FP - over-segmentation .*\(hidden\)/) && chip('FP').props.accessibilityState.checked === false,
    'a class can be isolated: FP hidden by its chip, named as hidden');
  await press(r, '3D error view');
  check('E4j', pushes.length === 1 && pushes[0][0] === 'SCR-05' && pushes[0][1].sliceIndex === 52 && pushes[0][1].view === 'error',
    `entry to the 3D error view with the slice: ${JSON.stringify(pushes[0] || null)}`);

  // #77 QA B-3, applied to SCR-04: a slice that fails shows nothing of the slice displayed before.
  const refLine = () => ctxLines(nav).find((x) => x.startsWith('reference ')) || '';
  check('E4k', /^reference \S+ · prediction \S+$/.test(refLine()) && !/^reference - · prediction -$/.test(refLine()) && !has(r, /^reference /),
    `before: the mask ids are in the Details sheet and belong to the displayed slice (${refLine() || '-'})`);
  evalBackend.setFailSlice(53);
  await pressLabel(r, STEP.next);
  await tick(400);
  const entry3d = () => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n) === '3D error view')[0];
  check('E4k', has(r, /could not be reached/) && legendFor(r) === '-' && refLine() === 'reference - · prediction -'
    && ctxHas(nav, /^Slice Dice: -$/) && paths().length === 0 && !has(r, /· \d+ px/) && !has(r, /^[A-Z]{2} \d+ px$/),
    'slice 54 fails: no classes, counts, ids or Dice from slice 53 stay on screen');
  check('E4k', entry3d() && entry3d().props.disabled === true && has(r, /^this slice did not load$/),
    'and the SCR-05 entry is disabled with the reason');
  evalBackend.setFailSlice(null);
  const before = evalBackend.requests.length;
  await press(r, 'Retry');
  await tick(400);
  await layout(r); // the viewport was unmounted while the state panel showed; a new one lays out
  await tick(100);
  const retried = evalBackend.requests.slice(before).map((u) => u.replace('https://backend.invalid', ''));
  check('E4l', legendFor(r) === 'Slice 54 / 88' && paths().length >= 1
    && retried.length > 0 && retried.every((u) => u.includes('/slices/53/') || u.startsWith('/api/v1/artifacts/')),
    `Retry brings slice 54 back and asks only for it (${retried.length} requests; legend ${legendFor(r)}; paths ${paths().length}${retried.some((u) => !(u.includes('/slices/53/') || u.startsWith('/api/v1/artifacts/'))) ? `; other: ${retried.filter((u) => !(u.includes('/slices/53/') || u.startsWith('/api/v1/artifacts/'))).join(' ')}` : ''})`);

  // #78 QA N-2, as SCR-03's L9: Retry forgot only the slice it retried, so the slice before it is still cached.
  const afterRetry = evalBackend.requests.length;
  await pressLabel(r, STEP.prev);
  await tick(400);
  const stepBack = gestures().filter((g) => g.kind === 'slice').pop();
  check('E4n', evalBackend.requests.length === afterRetry && onSlice(r, 53)
    && stepBack && stepBack.to === 52 && stepBack.cache_hit === true,
    `back to z 52 after Retry: ${evalBackend.requests.length - afterRetry} requests of any kind, cache hit ${stepBack ? stepBack.cache_hit : '-'} (no clear-all)`);
  // #78 QA N-4: nor did it forget another slice's cached "unavailable" answer (z 51's metrics).
  await pressLabel(r, STEP.prev);
  await tick(400);
  check('E4n', evalBackend.requests.length === afterRetry && onSlice(r, 52)
    && ctxHas(nav, /^Slice Dice: unavailable \(ARTIFACT_NOT_FOUND\)$/) && ctxHas(nav, /^Slice 52 \/ 88 · z 51$/),
    `on to z 51: ${evalBackend.requests.length - afterRetry} requests; its "unavailable" answer survived the Retry of z 53`);
  await act(async () => { r.unmount(); });

  // #78 QA N-7: a server entry outside the volume (z 90 of 88) is listed and named, never opened
  // as the edge slice a clamp would give.
  const outside = fakeBackend({ selection: { ...SERVED_WORST, slices: [{ slice_index: 90, dice: 0.05, false_positives: 500, false_negatives: 600 }, ...SERVED_WORST.slices] } });
  r = await mount(liveRuntime(outside.fetchImpl), { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 });
  const row = (label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label))[0];
  const z90 = row('WorstSlice 91 (not in this volume)');
  check('E4r', z90 && z90.props.disabled === true && textOf(z90).includes('outside this volume (z 0..87) - not opened')
    && !jump() && has(r, /selection names slice 90, outside 0\.\.87/),
    `z 90 listed, disabled and named: ${z90 ? textOf(z90) : '-'}`);
  const outMark = outside.requests.length;
  await act(async () => { z90.props.onPress(); });
  await tick(400);
  check('E4r', outside.requests.length === outMark && onSlice(r, 45) && !onSlice(r, 88),
    `a tap on it opens nothing: ${outside.requests.length - outMark} requests, still on slice 45 (no clamp to the last slice)`);
  await press(r, 'Slice 53 / 88 · Dice');
  await tick(400);
  check('E4r', onSlice(r, 53), 'the entries inside the volume still open their own slice');
  await act(async () => { r.unmount(); });

  // #78 QA B-2: a block of another selection version is not shown as DR-010's.
  const v2 = fakeBackend({ selection: { ...SERVED_WORST, selection_version: 'dr010-worst-slice/v2' } });
  r = await mount(liveRuntime(v2.fetchImpl), { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 });
  check('E4o', has(r, /^SELECTION_VERSION_UNSUPPORTED: the server sent selection_version "dr010-worst-slice\/v2"; this build shows only "dr010-worst-slice\/v1"\./)
    && !jump() && !has(r, /^#\d$/) && bars() === 0 && has(r, /^No profile: .*not one this build shows/),
    'selection_version v2: unavailable, the reason and the served version named; nothing listed, jumpable or profiled');
  check('E4o', legendFor(r) === 'Slice 45 / 88' && paths().length === 3 && !has(r, /(Matches|Differs from) the server for this slice/),
    'the slice is drawn, and not compared with a selection that is not shown');
  await act(async () => { r.unmount(); });

  // #78 QA B-3: SCR-04 asks for PROCESSED; the run metrics answer RAW. The slices answer PROCESSED,
  // so the viewer draws the slice and only the run-level gate can hide the RAW numbers.
  const swapped = fakeBackend({ metricsVariant: 'RAW' });
  r = await mount(liveRuntime(swapped.fetchImpl), { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'PROCESSED', sliceIndex: 44 });
  check('E4p', has(r, /Asked for PROCESSED, served RAW; a substituted variant is not shown\./) && has(r, /Cannot show this safely/),
    'run metrics for RAW under a PROCESSED request: the V1 model\'s variant-mismatch state, in its words');
  check('E4p', !jump() && !has(r, /^#\d$/) && bars() === 0 && !has(r, /^Case metrics$|^0\.810$|^0\.680$/)
    && has(r, /^No profile without the run metrics/),
    'no worst-slice list, no profile, no case metrics');
  check('E4p', legendFor(r) === 'Slice 45 / 88' && paths().length === 3 && !has(r, /(Matches|Differs from) the server for this slice/)
    && swapped.requests.some((u) => u.includes('/prediction?variant=PROCESSED')),
    'the PROCESSED slice is drawn, with no comparison against the RAW numbers');
  await act(async () => { r.unmount(); });

  // #78 QA B-3 in fixture mode: the generated bundle answers RAW to every run-metrics request.
  const fixtureAt = (variant) => mount(createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson }),
    { caseId: 'CASE_0043', runId: 'RUN_0043', variant, sliceIndex: 44 });
  r = await fixtureAt('PROCESSED');
  const refusals = texts(r).filter((t) => /Asked for PROCESSED, served RAW; a substituted variant is not shown\./.test(t)).length;
  check('E4q', refusals === 2 && !jump() && !has(r, /^#\d$/) && !has(r, /^Case metrics$/) && has(r, /^No profile without the run metrics/),
    `fixture, PROCESSED: the slice AND the run metrics refuse RAW (${refusals} refusals); no list, case metrics or profile`);
  await act(async () => { r.unmount(); });
  r = await fixtureAt('RAW');
  check('E4q', jump() && has(r, /^Slice 45 \/ 88 · Dice /) && has(r, /^0\.500$/) && has(r, /^0\.250$/) && !has(r, /Asked for/),
    'fixture, RAW: the generated DR-010 v1 block and the case metrics are shown');
  await act(async () => { r.unmount(); });

  // #78 QA N-6, DR-013a addendum: the run metrics name another prediction mask than the one drawn.
  // The slice is drawn (both masks verified), the mismatch is said, and the drawn classes are not
  // compared with the server's FP / FN for a mask they were not counted from.
  const otherMask = fakeBackend({ runMetricsPatch: { prediction_mask_id: 'PREDICTION_MASK_ID_OTHER' } });
  r = await mount(liveRuntime(otherMask.fetchImpl), { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 });
  const drawnPred = refLine() || '-';
  check('E4s', has(r, /^The masks drawn are not the ones the server's numbers refer to: prediction drawn PREDICTION_MASK_ID_0043, run metrics name PREDICTION_MASK_ID_OTHER\. The drawn classes are not compared with the server's FP \/ FN\.$/)
    && !has(r, /reference drawn/),
    `the prediction mask id differs from the run metrics' and the screen says so (${drawnPred})`);
  check('E4s', paths().length === 3 && legendFor(r) === 'Slice 45 / 88' && !has(r, /(Matches|Differs from) the server for this slice/)
    && has(r, /^#2$/) && has(r, /^Slice 45 \/ 88 · Dice 0\.310/),
    'the classes are drawn and the worst slices listed, but no FP / FN comparison against the other mask\'s numbers');
  await act(async () => { r.unmount(); });
}
// ---- 7. useCall aborts when it is disabled (DR-021 rule 2, #77 QA N-8) ------
// A call started while enabled is aborted the moment `enabled` turns false, and
// its late answer never reaches the screen.
{
  const { useCall } = await imp('src/api/RuntimeContext.js');
  const { STATE, success } = await imp('src/api/states.mjs');
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
  check('B1', BackHandler.__listeners === 1 && handled === false && onScreen(r, 'SCR-02'),
    `one hardware-back listener (${BackHandler.__listeners}); at the root with no guard the press goes to the system`);

  // Two quick presses on a guarded screen: one prompt, the second press refused while it is open.
  await openCase();
  let asked = 0;
  let answer = null;
  await act(async () => { screenNav().setLeaveGuard(() => { asked += 1; return new Promise((res) => { answer = res; }); }); });
  let presses;
  await act(async () => { presses = [BackHandler.__press(), BackHandler.__press()]; });
  await tick();
  check('B2', presses.every((x) => x === true) && asked === 1 && onScreen(r, 'SCR-03'),
    `two quick back presses on SCR-03: both consumed, the guard asked ${asked} time(s), still on SCR-03`);
  await act(async () => { answer(true); });
  await tick(60);
  check('B2', onScreen(r, 'SCR-02') && asked === 1, 'the one prompt answered "leave": back on SCR-02, once');

  // A covered screen leaves no guard behind: SCR-03 lets a push through and unmounts under SCR-08;
  // back on SCR-03 (the same entry, mounted afresh, nothing to lose), Back asks no stale guard.
  await openCase();
  let coveredAsked = 0;
  await act(async () => { screenNav().setLeaveGuard(() => { coveredAsked += 1; return true; }); });
  await act(async () => { await screenNav().push('SCR-08', {}); });
  await tick(60);
  check('B3', onScreen(r, 'SCR-08') && coveredAsked === 1, 'SCR-03\'s guard let the push through: SCR-08 on top');
  await act(async () => { BackHandler.__press(); });
  await tick(60);
  await act(async () => { BackHandler.__press(); });
  await tick(60);
  check('B3', onScreen(r, 'SCR-02') && coveredAsked === 1,
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
  const { forgetSession } = await imp('src/lib/caseMode.mjs');
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
  check('R1', onScreen(r, 'SCR-03') && has(r, /^RUN_A$/) && has(r, /^RUN_B$/) && has(r, /No default/),
    'two runs: SCR-03 asks for the run and the variant');
  await press(r, 'RUN_B');
  await press(r, 'PROCESSED');
  await tick(300);
  await layout(r);
  await tick(200);
  await pressLabel(r, STEP.fwd10);
  await tick(350);
  // What SCR-03 told the shell is read in the Details sheet behind Info (the run line, the layer and the z).
  const info = async () => {
    await act(async () => { byTestId(r, 'header-info').props.onPress(); });
    const all = texts(r);
    await closeSheet(r, 'details-sheet');
    return all;
  };
  let sheet = await info();
  const runLine = () => sheet.find((t) => t.startsWith('Run ')) || '-';
  check('R1', onSlice(r, 55) && /^Run RUN_B · UNet2D · /.test(runLine()) && sheet.some((t) => /^Prediction \(PROCESSED\): /.test(t))
    && sheet.includes('Slice 55 / 88 · z 54') && has(r, /^CASE_0061$/) && Boolean(byTestId(r, 'header-subtitle')),
    `SCR-03 before: ${runLine()} · PROCESSED · z 54; two runs, so the subtitle is a run picker`);
  forgetSession();
  await pressId(r, 'header-more');
  await press(r, 'Error inspector');
  await tick(300);
  await layout(r);
  await tick(250);
  check('R2', onScreen(r, 'SCR-04') && has(r, /^CASE_0061 · Processed$/) && has(r, /^Processed vs ground truth$/) && onSlice(r, 55) && !has(r, /RUN_B/),
    'SCR-04 opened on the same variant and slice; the run id is not on the screen');
  sheet = await info();
  check('R2', sheet.includes('Run RUN_B · prediction PROCESSED vs ground truth') && sheet.includes('Slice 55 / 88 · z 54'),
    'its Details name the run and the z');
  const mark = backend.requests.length;
  await pressBack(r);
  await tick(300);
  await layout(r);
  await tick(250);
  const sent = backend.requests.slice(mark);
  sheet = await info();
  check('R3', onScreen(r, 'SCR-03') && !has(r, /No default/) && /^Run RUN_B · UNet2D · /.test(runLine())
    && sent.every((u) => !u.includes('RUN_A')),
    `back on SCR-03: run RUN_B again, not asked for (${runLine()})`);
  check('R3', sheet.some((t) => /^Prediction \(PROCESSED\): /.test(t)) && onSlice(r, 55),
    `variant PROCESSED and slice z 54 restored: ${readout(r)}`);

  // #88 QA N-1: SCR-03's other entries carry the same returnParams. SCR-05's is held by V2R14 (the recorded push);
  // here the real navigator opens SCR-06 and Back must reopen what was on screen when it was pressed. The slice is
  // moved first: SCR-03's entry still holds the returnParams the SCR-04 trip above left in it (z 54), so a push that
  // forgot its own returnParams would bring back the OLD slice and only a moved slice can tell.
  await pressLabel(r, STEP.fwd10);
  await tick(350);
  check('R4', onSlice(r, 65), `SCR-03 moved on to z 64 before the SCR-06 entry is pressed: ${readout(r)}`);
  forgetSession();
  await pressId(r, 'header-more');
  await press(r, 'Review and correct');
  await tick(300);
  check('R4', onScreen(r, 'SCR-06'), 'SCR-03 -> SCR-06 through the real navigator, from RUN_B / PROCESSED / z 64');
  await pressBack(r);
  await tick(300);
  await layout(r);
  await tick(250);
  sheet = await info();
  check('R5', onScreen(r, 'SCR-03') && !has(r, /No default/) && /^Run RUN_B · UNet2D · /.test(runLine())
    && sheet.some((t) => /^Prediction \(PROCESSED\): /.test(t)) && onSlice(r, 65),
  `back on SCR-03 from SCR-06: run RUN_B, variant PROCESSED, slice z 64, not the earlier z 54 (${runLine()} / ${readout(r)})`);
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
    const path = url.replace('https://backend.invalid', '');
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
  const { fitTransform } = await imp('src/lib/viewMath.mjs');
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
  check('V4a', onScreen(r, 'SCR-08') && has(r, /seed finding/) && has(r, /CASE_0061 · slice 44 · run RUN_A · RAW/),
    'SCR-08 lists the finding with its evidence (case, slice, run, variant)');
  await toReview(r);
  check('V4b', onScreen(r, 'SCR-06') && !has(r, /Which prediction do you want to review/) && has(r, /^RAW · /) && has(r, /^Review: NOT_REVIEWED · rev 1$/),
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
  const rectsBefore = marks(r, 'Rect').length;
  await stroke(r, [500, 300]);
  check('V4c', textOf(byId(r, 'mask-state')[0]) === 'UNSAVED edits' && marks(r, 'Rect').length > rectsBefore,
    'a one-finger stroke paints (radius 2 by default) and the slice reads UNSAVED');
  await pressBack(r);
  await tick(60);
  const guard1 = alertNow('Unsaved edits');
  check('V4d', guard1 && /Slice 44 has unsaved edits/.test(guard1[1]) && onScreen(r, 'SCR-06'),
    'LEAVE GUARD: Back with unsaved edits asks first, and nothing has moved yet');
  await answerAlert('Unsaved edits', 'Stay');
  check('V4d', onScreen(r, 'SCR-06') && textOf(byId(r, 'mask-state')[0]) === 'UNSAVED edits', '"Stay" keeps the screen and the edit');
  let handled;
  globalThis.__alerts = [];
  await act(async () => { handled = BackHandler.__press(); });
  await tick(60);
  check('V4d', handled === true && alertNow('Unsaved edits'), 'the Android back button asks too');
  await answerAlert('Unsaved edits', 'Stay');

  // #88 QA N-3: a guard must settle on EVERY path. Dismissing the prompt without pressing a button (Android: a tap
  // outside it) is an answer too - onDismiss says "stay". A guard that never settled would keep the shell's
  // one-prompt latch closed and refuse every later Back, tab and push on this screen.
  globalThis.__alerts = [];
  await pressBack(r);
  await tick(60);
  const dismissable = alertNow('Unsaved edits');
  check('V4q', dismissable && dismissable[3] && dismissable[3].cancelable === true && typeof dismissable[3].onDismiss === 'function',
    'the leave prompt can be dismissed without a button, and says what dismissing means (onDismiss)');
  await act(async () => { dismissable[3].onDismiss(); });
  await tick(60);
  globalThis.__alerts = [];
  await pressBack(r);
  await tick(60);
  check('V4q', Boolean(alertNow('Unsaved edits')) && onScreen(r, 'SCR-06') && textOf(byId(r, 'mask-state')[0]) === 'UNSAVED edits',
    'after a dismissed prompt the next Back asks again (the latch was released) and nothing moved or was lost');
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
  await pressBack(r);
  await tick(60);
  check('V4g', onScreen(r, 'SCR-08'), 'saved: Back leaves without asking');

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
  check('V4k', onScreen(r, 'SCR-08') && has(r, /^CASE_0061 · slice 44 · run RUN_A · RAW$/) && has(r, /New finding/),
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
  await pressBack(r);
  await tick(250);
  await layout(r);
  await tick(150);
  check('V4k', onScreen(r, 'SCR-06') && !has(r, /Which prediction do you want to review/) && has(r, /slice 44 \/ 88/) && has(r, /^RAW · /),
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

  // --- the server names another mask than the run's artifact for the slice: not drawn, not editable, never fetched (QA_PR99_D39 NB-3) ---
  const bm = reviewBackend();
  const otherMask = async (url, init) => {
    const res = await bm.fetchImpl(url, init);
    if (!/\/slices\/\d+\/prediction\?variant=/.test(url)) return res;
    const body = { ...(await res.json()), prediction_mask_id: 'PREDICTION_MASK_ID_OTHER' };
    const text = JSON.stringify(body);
    return { status: res.status, headers: res.headers, text: async () => text, json: async () => body };
  };
  const rm = await mount({ ...bm, fetchImpl: otherMask });
  await toReview(rm);
  check('V4o', has(rm, /served a slice of another mask than this review.s source prediction/) && !byId(rm, 'mask-state')[0]
    && !btn(rm, 'Retry slice') && btn(rm, 'Save').props.disabled === true
    && bm.requests.some((q) => /\/slices\/44\/prediction/.test(q.path)) && !bm.requests.some((q) => q.path.startsWith('/api/v1/artifacts/pred-')),
  "a slice that names another mask than the run's artifact is not drawn as editable, the reason is said, and its bytes were never fetched");
  await act(async () => { rm.unmount(); });

  // --- another reviewer commits a newer version while this one has an unsaved edit (QA_PR99_D39 NB-2) ---
  const bx = reviewBackend({ seedVersion: true });
  const rx = await mount(bx);
  await toReview(rx);
  check('V4p', byId(rx, 'continuing')[0] && /Continuing from version REVMASK_0/.test(textOf(byId(rx, 'continuing')[0])),
    'the review starts on its latest version, REVMASK_0');
  await pressExact(rx, '3');
  await stroke(rx, [100, 100]);
  const theirs = bx.SOURCE.slice();
  for (let y = 250; y < 270; y += 1) for (let x = 380; x < 400; x += 1) theirs[y * 576 + x] = 1;
  bx.db.versions.push({ id: 'REVMASK_1', version: 2, revision: 3, parent: bx.db.versions[0], slices: new Map([[44, theirs]]) });
  bx.db.review.revision += 1; // their commit moved the review: our expected_revision is stale
  await pressExact(rx, 'Save');
  await answerAlert('Save correction?', 'OK');
  await tick(150);
  check('V4p', has(rx, /STALE MISMATCH/) && textOf(byId(rx, 'mask-state')[0]) === 'UNSAVED edits', 'the save is stale: somebody else committed, the edit is still UNSAVED');
  await pressExact(rx, 'Refresh');
  await tick(200);
  const sentAfterRefresh = bx.writes().length; // Refresh re-opens the review (an idempotent POST); nothing after it may write
  const refused = byId(rx, 'notice')[0];
  check('V4p', refused && /latest version is REVMASK_1; your edits continue from REVMASK_0\. Cancel the edits/.test(textOf(refused))
    && textOf(byId(rx, 'mask-state')[0]) === 'UNSAVED edits' && /Continuing from version REVMASK_0/.test(textOf(byId(rx, 'continuing')[0]))
    && byId(rx, 'latest-version')[0] && /Latest version REVMASK_1/.test(textOf(byId(rx, 'latest-version')[0])),
  'Refresh found REVMASK_1 but does not drop the unsaved edit: it says so, and the edit still continues from REVMASK_0');
  await pressExact(rx, 'Save');
  await answerAlert('Save correction?', 'OK');
  await tick(100);
  check('V4p', /latest version is REVMASK_1; this session continues from REVMASK_0/.test(textOf(byId(rx, 'notice')[0])) && bx.writes().length === sentAfterRefresh,
    'saving over the older base is refused on the device: nothing is sent');
  await pressExact(rx, 'Cancel edits');
  await answerAlert('Discard unsaved edits?', 'OK');
  await pressBack(rx);
  await tick(60);
  check('V4p', onScreen(rx, 'SCR-08'), 'with the edit cancelled, Back leaves without asking');
  await toReview(rx);
  check('V4p', /Continuing from version REVMASK_1/.test(textOf(byId(rx, 'continuing')[0])) && textOf(byId(rx, 'mask-state')[0]) === 'SAVED'
    && bx.requests.some((q) => q.path.includes('/reviewed-masks/REVMASK_1/slices/44')) && bx.db.versions.length === 2,
  "reopened, the review continues from REVMASK_1 (read from the server), and the other reviewer's version is untouched");
  await act(async () => { rx.unmount(); });
}

// ---- 11. SCR-05 3D Inspector (viewer chrome): H6 and H7 on the live runtime, WebView mocked (V2) ----------------
// What a PASS means: the screen asks for the mesh and error references and bytes the way the contract says, verifies
// the bytes against the id (DR-021 rule 1), hands the viewer only verified, grid-matching artifacts and markers of the
// surface on screen, shows loading / unavailable (with the API's reason) / error / success, and turns a pick or a
// marker message into "slice n / total" or "FN, slices a-b" and an "Open in 2D" push to SCR-03 with returnParams.
// It does NOT mean the surface is drawn or that a tap lands on a face or a marker: the viewer script is exercised in
// test/v2_viewer.test.mjs, the pixels and the frame rate are the owner's device tests.
{
  const Inspector3DScreen = (await imp('src/screens/v2-3d/Inspector3DScreen.js')).default;
  const { VIEWER_HTML } = await imp('src/screens/v2-3d/viewerHtml.mjs');
  const { sent } = await imp('test/render/mocks/webview.mjs');
  const { boxMesh, encodeErrors, encodeMesh, ERROR_COMPONENTS } = await imp('test/_v2mesh.mjs');
  const sum = (b) => createHash('sha256').update(b).digest('hex');
  const SHAPE = [576, 576, 88];
  const predBytes = encodeMesh(boxMesh(SHAPE, [100, 100, 10], [300, 300, 12]));
  const gtBytes = encodeMesh(boxMesh(SHAPE, [110, 110, 10], [290, 290, 12]));
  const procBytes = encodeMesh(boxMesh(SHAPE, [105, 105, 10], [295, 295, 12]));
  const IDS = { ART_RAW: predBytes, MASK_CASE_0061: gtBytes, ART_PROC: procBytes };
  const MESH_ID = (b) => `MESH_${sum(b)}`;
  const errBytes = encodeErrors({ shape: SHAPE, surface: MESH_ID(predBytes), components: ERROR_COMPONENTS });
  const otherSurfaceErrBytes = encodeErrors({ shape: SHAPE, surface: MESH_ID(gtBytes), components: ERROR_COMPONENTS });
  // Six regions with three of them small (0.5 % of the largest, 6,000 voxels, is 30: 31 stays, 29, 5 and 2 do not).
  const region = (id, voxels, at) => ({ id, class: id.slice(0, 2), voxel_count: voxels, slice_range: [at[2], at[2]], marker_voxel: at });
  const MANY_COMPONENTS = [
    region('FN_0001', 6000, [150, 150, 11]), region('FN_0002', 2, [280, 280, 15]),
    region('FP_0001', 800, [200, 120, 10]), region('FP_0002', 31, [250, 250, 12]), region('FP_0003', 29, [260, 260, 13]), region('FP_0004', 5, [270, 270, 14]),
  ];
  const manyErrBytes = encodeErrors({ shape: SHAPE, surface: MESH_ID(predBytes), components: MANY_COMPONENTS });

  // The base fake already serves case_get, the JSON of the MRI / GT / prediction slices and their PNGs. This one adds
  // what SCR-05 asks for: run ids, reconstruction_get, the ground-truth mask id and the mesh bytes.
  function meshBackend({ caseMode = 'EVALUATION', processed = false, missing = [], tamper = [], reconstructionStatus = null, listFail = false, errors = 'ok', experimentId = null } = {}) {
    const base = fakeBackend({ caseMode });
    const requests = [];
    const gen = (id) => ({ ...bundleJson.scenarios[id].default.response.data });
    const json = (status, body) => {
      const text = JSON.stringify(body);
      return { status, headers: { get: (k) => ({ 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })[k.toLowerCase()] ?? null }, text: async () => text, json: async () => body };
    };
    const fetchImpl = async (url, init) => {
      requests.push(url);
      const path = url.replace('https://backend.invalid', '');
      let m;
      if ((m = /^\/api\/v1\/analysis-runs\/([^/?]+)$/.exec(path))) {
        return json(200, { ...gen('analysis_run_get'), run_id: m[1], case_id: 'CASE_0061', status: 'SUCCEEDED', raw_prediction_artifact_id: 'ART_RAW',
          processed_prediction_artifact_id: processed ? 'ART_PROC' : null, reconstruction_ids: [MESH_ID(predBytes)],
          ...(experimentId ? { experiment_id: experimentId } : {}) });
      }
      if ((m = /^\/api\/v1\/analysis-runs\/([^/?]+)\/reconstruction\?source_mask_id=([^&]+)$/.exec(path))) {
        const mask = decodeURIComponent(m[2]);
        if (reconstructionStatus) return json(reconstructionStatus, { error: { code: reconstructionStatus === 409 ? 'RUN_NOT_SUCCEEDED' : 'ARTIFACT_NOT_FOUND', message: 'x' } });
        if (!IDS[mask] || missing.includes(mask)) return json(404, { error: { code: 'ARTIFACT_NOT_FOUND', message: 'no reconstruction of this source mask' } });
        const kind = mask === 'ART_RAW' ? 'RAW_PREDICTION' : mask === 'ART_PROC' ? 'PROCESSED_PREDICTION' : 'GROUND_TRUTH';
        return json(200, { ...gen('reconstruction_get'), mesh_artifact_id: MESH_ID(IDS[mask]), source_mask_id: mask, source_mask_kind: kind,
          reconstruction_version: `dr008c-L0/v1 sha256:${'0'.repeat(64)}` });
      }
      if ((m = /^\/api\/v1\/analysis-runs\/([^/?]+)\/error-reconstruction\?prediction_variant=(RAW|PROCESSED)$/.exec(path))) {
        if (errors === 'missing') return json(404, { error: { code: 'ARTIFACT_NOT_FOUND', message: 'no error geometry for this prediction' } });
        const bytes = errors === 'other-surface' ? otherSurfaceErrBytes : errors === 'many' ? manyErrBytes : errBytes;
        return json(200, { ...gen('error_reconstruction_get'), error_mesh_artifact_id: `ERRGEOM_${sum(bytes)}`, reference_mask_id: 'MASK_CASE_0061',
          prediction_mask_id: m[2] === 'RAW' ? 'ART_RAW' : 'ART_PROC', prediction_variant: m[2] });
      }
      if ((m = /^\/api\/v1\/artifacts\/([0-9a-f]{64})\.json$/.exec(path))) {
        const bytes = [errBytes, otherSurfaceErrBytes, manyErrBytes].find((b) => sum(b) === m[1]);
        if (!bytes) return json(404, { error: { code: 'ARTIFACT_NOT_FOUND', message: 'x' } });
        const served = errors === 'tamper' ? Uint8Array.from(bytes, (v, i) => (i === 3 ? v ^ 1 : v)) : bytes;
        return { status: 200, headers: { get: (k) => ({ 'content-type': 'application/json', etag: `"sha256:${m[1]}"` })[k.toLowerCase()] ?? null },
          arrayBuffer: async () => served.buffer.slice(served.byteOffset, served.byteOffset + served.byteLength) };
      }
      if ((m = /^\/api\/v1\/artifacts\/([0-9a-f]{64})\.cmesh$/.exec(path))) {
        const mask = Object.keys(IDS).find((k) => sum(IDS[k]) === m[1]);
        if (!mask) return json(404, { error: { code: 'ARTIFACT_NOT_FOUND', message: 'x' } });
        const bytes = tamper.includes(mask) ? Uint8Array.from(IDS[mask], (v, i) => (i === IDS[mask].length - 1 ? v ^ 1 : v)) : IDS[mask];
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
    return { fetchImpl, requests };
  }

  const nodeMocks = { createNodeMock: () => ({ postMessage() {} }) };
  let lastMounted = null;
  const mount = async (backend, params, { nav = null } = {}) => {
    const runtime = liveRuntime(backend.fetchImpl);
    const recorded = { pushes: [], pops: 0, contexts: [] };
    lastMounted = recorded;
    const nv = nav || {
      push: (...a) => { recorded.pushes.push(a); return true; }, pop: () => { recorded.pops += 1; return true; }, replace: () => true, reset: () => true, canGoBack: true,
      // what the shell's app bar and Details sheet would show: the screen reports it with nav.setContext
      setContext: (c) => { recorded.contexts.push(c); },
    };
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
  const entry = (r, label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label))[0];
  const byA11y = (r, label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label)[0];
  const tap = async (node) => { await act(async () => { node.props.onPress(); }); await tick(20); };
  const lastSent = (type) => sentJson().filter((m) => m.type === type).pop();
  const P = { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 };

  // What the screen last reported to the shell: the app bar's title and subtitle, and the Details sections.
  const reported = (rec = lastMounted) => rec.contexts.filter(Boolean).pop() || {};
  const detailLines = (rec = lastMounted) => (reported(rec).details || []).flatMap((sec) => sec.lines);
  const hasDetail = (re, rec = lastMounted) => detailLines(rec).some((l) => re.test(l));
  const isOpen2D = (r) => entry(r, 'Open in 2D');
  // A control's touch target in dp: its own size plus the hitSlop around it (the minimum is 48, spec 10 / MIN_TOUCH).
  const hitSize = (n) => {
    const st = Object.assign({}, ...[n.props.style].flat(3).filter(Boolean));
    const slop = n.props.hitSlop || {};
    return [(st.width || st.minWidth || ((st.paddingHorizontal || 0) * 2 + 16)) + (slop.left || 0) + (slop.right || 0),
      (st.height || st.minHeight || 0) + (slop.top || 0) + (slop.bottom || 0)];
  };

  // 10a. success: references, verified bytes, the viewer's handshake, the bottom panel, the Details sheet
  {
    const backend = meshBackend();
    const { r } = await mount(backend, P);
    const paths = backend.requests.map((u) => u.replace('https://backend.invalid', ''));
    check('V2R1', paths.some((p) => p === '/api/v1/analysis-runs/RUN_A/reconstruction?source_mask_id=ART_RAW'), 'the prediction mesh is asked for by the RUN\'s own RAW mask id');
    check('V2R1', paths.some((p) => p === '/api/v1/analysis-runs/RUN_A/reconstruction?source_mask_id=MASK_CASE_0061'), 'the ground-truth mesh by the id the server stated on a ground-truth slice');
    check('V2R1', paths.includes(`/api/v1/artifacts/${sum(predBytes)}.cmesh`) && paths.includes(`/api/v1/artifacts/${sum(gtBytes)}.cmesh`), 'both meshes come from the content route named by their ids');
    check('V2R1', paths.includes('/api/v1/analysis-runs/RUN_A/error-reconstruction?prediction_variant=RAW') && paths.includes(`/api/v1/artifacts/${sum(errBytes)}.json`),
      'the error geometry is asked for by run and variant, and its bytes come from the content route named by its id');
    check('V2R1', web(r) && has(r, /^Prediction · Raw$/) && has(r, /^Evaluation$/) && has(r, /^Slice 45 \/ 88$/),
      `WebView mounted; the panel says which prediction and the slice as "n / total": ${texts(r).filter((t) => /^(Prediction|Slice|Evaluation)/.test(t)).join(' | ')}`);
    check('V2R1', !has(r, /RUN_A|CASE_0061|MESH_|ERRGEOM_|sha256|L0 surface|undecimated|triangles|vertices|SCR-0|z = /),
      'no id, checksum, mesh size, screen id or z index on the main surface');
    check('V2R2', sent.length === 0, 'nothing is sent before the viewer says it is ready');
    check('V2R3', has(r, /^LOADING$/) && has(r, /Loading the 3D surface/), 'before the viewer reports the surface the screen says it is loading');
    await fromViewer(r, { type: 'ready' });
    const out = sentJson();
    const meshMsgs = out.filter((m) => m.type === 'mesh');
    check('V2R2', meshMsgs.length === 2 && meshMsgs.find((m) => m.role === 'prediction').b64 === Buffer.from(predBytes).toString('base64')
      && meshMsgs.find((m) => m.role === 'groundTruth').b64 === Buffer.from(gtBytes).toString('base64'), 'after ready: the verified prediction and ground-truth artifacts, byte for byte');
    check('V2R2', out.some((m) => m.type === 'slice' && m.index === 44), 'and the band at the 2D slice the screen was opened from');
    const markerMsg = out.find((m) => m.type === 'markers');
    check('V2R2', markerMsg && JSON.stringify(markerMsg.items.map(({ size, small, ...m }) => m)) === JSON.stringify(ERROR_COMPONENTS.map((c) => ({ id: c.id, cls: c.class, at: c.marker_voxel, voxels: c.voxel_count })))
      && markerMsg.items.every((m) => m.size >= 6 && m.size <= 28 && m.small === false) && markerMsg.items[0].size === 28,
    `the three verified markers, largest first, each with its drawn size and none of them small: ${markerMsg ? markerMsg.items.map((m) => `${m.id} ${m.size}`).join(',') : '-'}`);
    await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    await fromViewer(r, { type: 'loaded', role: 'groundTruth', triangles: 12, vertices: 8 });
    check('V2R3', !has(r, /^LOADING$/) && web(r) !== null, 'once the surface is drawn the loading state is gone');
    check('V2R3', has(r, /^1 FN region \(523 voxels\) · 2 FP regions \(43 voxels\)$/), 'nothing selected: the panel counts the error regions');
    check('V2R4', has(r, /^Tap the surface to pick a slice, or an error marker to see its region\.$/) && isOpen2D(r).props.disabled === true,
      'no selection: Open in 2D is disabled and the hint says what to do');
    check('V2R4', !has(r, /Voxel-index frame|no millimetres/), 'the frame note is not on the main surface');
    // Responsive (device session r5): the WebView page's text follows the system font size up to the label cap (the page's tools are laid out
    // for that: viewerTools.mjs), instead of the 17 px that broke "Ground truth" into two lines at font scale 1.3.
    {
      const zooms = [];
      for (const fs of [1, 1.3, 2]) {
        globalThis.__fontScale = fs;
        await act(async () => { await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 }); });
        zooms.push(web(r).props.textZoom);
      }
      globalThis.__fontScale = 1;
      check('RP-V2d', zooms.join() === '100,115,115', `the WebView's textZoom follows the system font size and stops at the label cap: scale 1, 1.3, 2 give ${zooms.join(', ')} %`);
    }
    const hex = sum(predBytes);
    check('V2R3', hasDetail(new RegExp(`^Prediction MESH_${hex}$`)) && hasDetail(/^Prediction: 12 triangles · 8 vertices$/) && hasDetail(new RegExp(`^Prediction checksum sha256:${hex}$`))
      && hasDetail(/^Case CASE_0061$/) && hasDetail(/^Run RUN_A$/) && hasDetail(/^Prediction RAW · Evaluation$/), 'the Details sheet (the shell\'s, from nav.setContext) has the ids, checksums and mesh sizes');
    check('V2R4', hasDetail(/Voxel-index frame\. Geometry is not validated: no millimetres are shown\./), 'and the frame note');
    check('V2R4', hasDetail(/voxel axes, not anatomical directions: x = column, y = row, z = slice/), 'and what the x, y, z of the corner gizmo mean: voxel axes, column, row, slice');
    check('V2R4', !has(r, /voxel axes|x = column/), 'which the main surface does not say');
    check('V2R3', hasDetail(/^Error geometry ERRGEOM_/) && hasDetail(/^1 FN region/), 'and the error geometry');
    await act(async () => { r.unmount(); });
  }

  // 10b. H7: pick -> "Slice n / total" -> Open in 2D (push to SCR-03, same run and variant, returnParams)
  {
    const backend = meshBackend();
    const { r, recorded } = await mount(backend, P);
    await fromViewer(r, { type: 'ready' });
    await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    await fromViewer(r, { type: 'pick', role: 'prediction', triangle: 5, slice: 52 });
    check('V2R5', has(r, /^Picked on the prediction$/) && has(r, /^Slice 53 \/ 88$/) && !has(r, /z = /), `the pick shows slice n / total, 1-based: ${texts(r).find((t) => t.startsWith('Slice ')) || '-'}`);
    check('V2R5', sentJson().filter((m) => m.type === 'slice').pop().index === 52, 'the band follows the pick');
    check('V2R5', isOpen2D(r).props.disabled === false && byA11y(r, 'Open in 2D at slice 53'), 'Open in 2D is enabled by a valid pick and names the slice it opens');
    await press(r, 'Open in 2D');
    check('V2R5', recorded.pushes.length === 1 && recorded.pushes[0][0] === 'SCR-03'
      && JSON.stringify(recorded.pushes[0][1]) === JSON.stringify({ caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 52 })
      && JSON.stringify(recorded.pushes[0][2]) === JSON.stringify({ runId: 'RUN_A', variant: 'RAW', sliceIndex: 52 }),
    `push SCR-03 at the picked slice for the same run and variant, with returnParams: ${JSON.stringify(recorded.pushes[0] || null)}`);
    check('V2R5', hasDetail(/^Slice 53 \/ 88 · z 52$/), 'the 0-based z index is in the Details sheet, next to the 1-based slice');
    // a background tap clears the selection - nothing can navigate
    await fromViewer(r, { type: 'pick', role: null, triangle: null, slice: null });
    check('V2R6', has(r, /No surface at that point: nothing selected/) && isOpen2D(r).props.disabled === true, 'a background tap clears the selection and disables Open in 2D');
    check('V2R6', has(r, /^Slice 45 \/ 88$/), 'and the band returns to the 2D slice (not the old pick)');
    await act(async () => { isOpen2D(r).props.onPress && isOpen2D(r).props.onPress(); });
    check('V2R6', recorded.pushes.length === 1, 'a disabled button pushes nothing');
    // a pick outside the volume, a malformed pick, a pick before any mesh: never selected
    await fromViewer(r, { type: 'pick', role: 'prediction', triangle: 1, slice: 88 });
    check('V2R6', has(r, /outside this volume \(88 slices\): ignored/) && isOpen2D(r).props.disabled === true, 'a slice outside the volume is refused, not clamped');
    await fromViewer(r, { type: 'pick', role: 'prediction', slice: '7' });
    check('V2R6', has(r, /outside this volume/) && isOpen2D(r).props.disabled === true, 'a malformed pick changes nothing');
    await fromViewer(r, { type: 'pick', role: 'groundTruth', triangle: 2, slice: 0 });
    check('V2R6', has(r, /^Picked on the ground truth$/) && has(r, /^Slice 1 \/ 88$/) && isOpen2D(r).props.disabled === false, 'slice 0 is a slice, picked on the ground-truth surface');
    await act(async () => { r.unmount(); });
  }

  // 10j. error markers (PR-3D-05, PR-ERR-03): a marker tap says what the region is, its size and slices, and opens SCR-03 there
  {
    const backend = meshBackend();
    const { r, recorded } = await mount(backend, P);
    await fromViewer(r, { type: 'ready' });
    await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    await fromViewer(r, { type: 'marker', id: 'FN_0001' });
    check('V2R15', has(r, /^Missed region \(FN\)$/) && has(r, /^Ground truth that the prediction left out\.$/) && has(r, /^523 voxels · Slices 11\u201313 · Region 1 of 3$/),
      `the tapped marker reads what it is, its size, its slices and its place: ${texts(r).find((t) => /voxels/.test(t)) || '-'}`);
    check('V2R15', lastSent('select').id === 'FN_0001' && lastSent('slice').index === 11 && has(r, /^Slice 12 \/ 88$/),
      'the viewer highlights it and the band moves to the slice of its marker voxel (inside the region)');
    check('V2R15', !has(r, /FN_0001|z = 10/), 'no region id or z index on the main surface');
    check('V2R15', byA11y(r, 'Open in 2D at slice 12') && isOpen2D(r).props.disabled === false, 'Open in 2D names the slice it will open');
    await press(r, 'Open in 2D');
    check('V2R15', recorded.pushes.length === 1 && recorded.pushes[0][0] === 'SCR-03'
      && JSON.stringify(recorded.pushes[0][1]) === JSON.stringify({ caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 11 })
      && JSON.stringify(recorded.pushes[0][2]) === JSON.stringify({ runId: 'RUN_A', variant: 'RAW', sliceIndex: 11 }),
    `Open in 2D: SCR-03 of the same case, run and variant at the region's slice: ${JSON.stringify(recorded.pushes[0] || null)}`);
    await fromViewer(r, { type: 'marker', id: 'FP_0001' });
    check('V2R15', has(r, /^Extra region \(FP\)$/) && has(r, /^Predicted where the ground truth has none\.$/) && has(r, /^40 voxels · Slice 11 · Region 2 of 3$/) && lastSent('select').id === 'FP_0001',
      'a false positive reads as an extra region, in the singular for one slice');
    check('V2R15', hasDetail(/^FP_0001$/) && hasDetail(/^FP, slice 11 \(z 10\), 40 voxels$/), 'the Details sheet has the region id and the z index');
    await fromViewer(r, { type: 'marker', id: 'FN_9999' });
    check('V2R15', has(r, /not in this error geometry: ignored/) && isOpen2D(r).props.disabled === true && lastSent('select').id === null,
      'a marker id the screen does not hold selects nothing');
    await fromViewer(r, { type: 'marker', id: 'FP_0002' });
    await fromViewer(r, { type: 'pick', role: 'prediction', triangle: 3, slice: 40 });
    check('V2R15', lastSent('select').id === null && has(r, /^Slice 41 \/ 88$/) && has(r, /^Picked on the prediction$/), 'a surface pick replaces the marker selection');
    await act(async () => { r.unmount(); });
  }

  // 10k. the tools (layers, opacity, cut, views, Previous / Next) are the page's own: the app sends data, the selection
  // and the insets, never a tool message, and draws no tool of its own (v2_viewer.test.mjs presses them in the page)
  {
    const backend = meshBackend();
    const { r } = await mount(backend, P);
    await fromViewer(r, { type: 'ready' });
    await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    await fromViewer(r, { type: 'loaded', role: 'groundTruth', triangles: 12, vertices: 8 });
    await fromViewer(r, { type: 'marker', id: 'FP_0001' });
    await fromViewer(r, { type: 'pick', role: 'groundTruth', triangle: 2, slice: 7 });
    const types = [...new Set(sentJson().map((m) => m.type))].sort().join();
    check('V2R16', types === 'insets,markers,mesh,select,slice', `the app sends only mesh, markers, slice, select and the insets: ${types}`);
    check('V2R16', !byA11y(r, 'Next error region') && !byA11y(r, 'Previous error region') && !has(r, /^(Cut|Fit|\+X|\u2212Z)$/) && !has(r, /opacity|Opacity/),
      'and draws no layer, opacity, cut, view or Previous / Next control: they are the page\'s');
    const sizes = r.root.findAll((n) => n.type === 'TouchableOpacity').map(hitSize);
    check('V2R16', sizes.length >= 1 && sizes.every(([w, h]) => w >= 48 && h >= 48), `every control of the screen has a touch target of at least 48 dp: ${JSON.stringify(sizes)}`);
    await act(async () => { r.unmount(); });
  }

  // 10k2. many regions: the small ones are left out by default and the panel says how many; the page's Small regions
  // switch (a message to the app) changes the count of "Region k of N" and the words about what is hidden
  {
    const backend = meshBackend({ errors: 'many' });
    const { r } = await mount(backend, P);
    await fromViewer(r, { type: 'ready' });
    await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    const items = lastSent('markers').items;
    check('V2R21', items.map((m) => m.id).join() === 'FN_0001,FP_0001,FP_0002,FP_0003,FP_0004,FN_0002' && items.map((m) => m.small).join() === 'false,false,false,true,true,true',
      `the viewer gets all six regions, largest first, the last three marked small: ${items.map((m) => `${m.id}${m.small ? '*' : ''}`).join(',')}`);
    check('V2R21', items[0].size === 28 && items[5].size < 8 && items.every((m, i) => i === 0 || m.size <= items[i - 1].size), `marker sizes fall with the region size: ${items.map((m) => m.size).join(',')}`);
    check('V2R21', has(r, /^2 FN regions \(6,002 voxels\) · 4 FP regions \(865 voxels\)$/), 'the totals count every region, hidden or not');
    check('V2R21', has(r, /^3 small regions hidden \(under 30 voxels\)$/), `the panel says how many are hidden: ${texts(r).find((t) => /hidden/.test(t)) || '-'}`);
    await fromViewer(r, { type: 'marker', id: 'FP_0002' });
    check('V2R21', has(r, /^31 voxels · Slice 13 · Region 3 of 3$/) && has(r, /^3 small regions hidden \(under 30 voxels\)$/),
      `a region is a place among the regions shown (3 of 3, not of 6) and the hidden count stays: ${texts(r).find((t) => /Region/.test(t)) || '-'}`);
    await fromViewer(r, { type: 'small', on: true });
    check('V2R21', !has(r, /hidden/) && has(r, /^31 voxels · Slice 13 · Region 3 of 6$/), 'with the small regions on nothing is hidden and the walk has six regions');
    await fromViewer(r, { type: 'marker', id: 'FP_0004' });
    check('V2R21', has(r, /^5 voxels · Slice 15 · Region 5 of 6$/) && lastSent('select').id === 'FP_0004', 'a small region can be selected once it is shown');
    check('V2R21', hasDetail(/^Small regions: 3 of 6, under 30 voxels \(0\.5 % of the largest region, 6,000\)$/), 'Details has the rule, in numbers');
    await fromViewer(r, { type: 'small', on: false });
    check('V2R21', has(r, /^Tap the surface to pick a slice, or an error marker to see its region\.$/) && lastSent('select').id === null && isOpen2D(r).props.disabled === true,
      'switching them off with a small region selected leaves nothing selected');
    check('V2R21', has(r, /^3 small regions hidden \(under 30 voxels\)$/) && has(r, /^2 FN regions \(6,002 voxels\) · 4 FP regions \(865 voxels\)$/), 'the count is back and the totals have not moved');
    await fromViewer(r, { type: 'small', on: true });
    await fromViewer(r, { type: 'ready' });
    check('V2R21', has(r, /^3 small regions hidden \(under 30 voxels\)$/), 'a page that starts again starts with the small regions off, and the panel follows');
    check('V2R21', Boolean(byTestId(r, 'hidden-regions')), 'the hidden count is its own line of the panel');
    await act(async () => { r.unmount(); });
  }

  // 10l. the error layer alone fails: the surfaces stay, a sentence says the markers are missing, nothing is drawn for them
  {
    for (const [errors, expect] of [['missing', /^Errors: unavailable \(ARTIFACT_NOT_FOUND\)$/], ['other-surface', /^Errors: error \(ERRORS_OTHER_SURFACE\)/], ['tamper', /^Errors: error \(CONTRACT_DRIFT\)/]]) {
      const backend = meshBackend({ errors });
      const { r } = await mount(backend, P);
      await fromViewer(r, { type: 'ready' });
      await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
      check('V2R18', web(r) !== null && has(r, /^The error markers are not available for this prediction\.$/) && !sentJson().some((m) => m.type === 'markers'),
        `${errors}: the surface stays, the panel says the markers are not available, no marker reaches the viewer`);
      check('V2R18', hasDetail(expect), `${errors}: the Details sheet names why: ${detailLines().find((t) => expect.test(t)) || '-'}`);
      await act(async () => { r.unmount(); });
    }
    const m2 = await mount(meshBackend(), P);
    await fromViewer(m2.r, { type: 'ready' });
    await fromViewer(m2.r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    await fromViewer(m2.r, { type: 'error', role: 'errors', code: 'VIEWER_ERROR', message: 'MARKERS_INVALID: a marker is malformed' });
    check('V2R18', web(m2.r) !== null && has(m2.r, /^The error markers are not available for this prediction\.$/), 'markers the viewer refused read as not available, the surface stays');
    check('V2R18', hasDetail(/^Errors: error \(VIEWER_ERROR\): MARKERS_INVALID/), 'and the viewer\'s code is in Details');
    await act(async () => { m2.r.unmount(); });
  }

  // 10m. privacy: no cache, no storage; only voxel geometry crosses into the WebView; GPU memory is freed on leave
  {
    const backend = meshBackend();
    const { r, recorded } = await mount(backend, P);
    const w = web(r).props;
    check('V2R19', w.incognito === true && w.cacheEnabled === false && w.cacheMode === 'LOAD_NO_CACHE' && w.domStorageEnabled === false
      && w.thirdPartyCookiesEnabled === false && w.allowFileAccess === false && w.source.html === VIEWER_HTML && !w.injectedJavaScript,
    'WebView: incognito, cache off, no DOM storage or cookies, no file access, the static page only');
    await fromViewer(r, { type: 'ready' });
    await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    await fromViewer(r, { type: 'loaded', role: 'groundTruth', triangles: 12, vertices: 8 });
    await fromViewer(r, { type: 'marker', id: 'FN_0001' });
    await fromViewer(r, { type: 'pick', role: 'prediction', triangle: 3, slice: 20 });
    const allowed = ['mesh', 'markers', 'slice', 'select', 'insets', 'dispose'];
    const words = ['CASE_0061', 'RUN_A', 'ART_RAW', 'MASK_CASE_0061', 'http', 'backend.invalid', 'sha256', 'MESH_', 'ERRGEOM_', sum(predBytes), sum(errBytes)];
    const leaks = sentJson().flatMap((m) => {
      const text = JSON.stringify({ ...m, b64: undefined });
      return [...(allowed.includes(m.type) ? [] : [`type ${m.type}`]), ...words.filter((x) => text.includes(x))];
    });
    // (The page's own error codes start with MESH_, so the static page is checked for the identifiers only.)
    const inPage = ['CASE_', 'RUN_', 'ART_RAW', 'http', 'backend.invalid', 'sha256:', 'ERRGEOM_'].filter((x) => VIEWER_HTML.includes(x));
    check('V2R19', sentJson().length >= 6 && leaks.length === 0 && inPage.length === 0,
      `${sentJson().length} messages: no case, run, mask, server or checksum crosses into the WebView (${[...leaks, ...inPage].join(', ') || 'none'})`);
    const meshHeader = Buffer.from(predBytes).toString('latin1');
    check('V2R19', !/CASE_|RUN_|MASK_/.test(meshHeader), 'the mesh bytes themselves carry no case identifier');
    sent.length = 0;
    await act(async () => { r.unmount(); });
    check('V2R19', sent.length === 1 && JSON.parse(sent[0]).type === 'dispose' && recorded.pushes.length === 0, 'leaving the screen tells the page to free its GPU buffers');
  }
  // 10n. viewer chrome: the screen opts in, the WebView fills the screen under the floating app bar, the app bar and the
  // Details sheet say what the screen reports (nav.setContext), and the page is told how much room the bar and the panel take
  {
    const { chromeOf, CHROME, screenMeta } = await imp('src/navigation/routes.mjs');
    const { contextDetails, headerLines } = await imp('src/navigation/header.mjs');
    check('V2R20', Inspector3DScreen.chrome === CHROME.VIEWER && chromeOf(Inspector3DScreen) === CHROME.VIEWER, 'SCR-05 opts in to the viewer chrome: the app bar floats over it and the tab bar is hidden');
    const backend = meshBackend();
    const { r, recorded } = await mount(backend, P);
    const style = Object.assign({}, ...[web(r).props.style].flat(3).filter(Boolean));
    check('V2R20', style.position === 'absolute' && style.left === 0 && style.right === 0 && style.top === 0 && style.bottom === 0, 'the WebView fills the whole screen, behind the app bar and the bottom panel');
    check('V2R20', Boolean(byTestId(r, 'viewer-scrim')), 'the top scrim is drawn over the page, under the app bar');
    await fromViewer(r, { type: 'ready' });
    await fromViewer(r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    await fromViewer(r, { type: 'loaded', role: 'groundTruth', triangles: 12, vertices: 8 });
    const ctx = reported(recorded);
    const head = headerLines(screenMeta('SCR-05'), P, ctx, { studyId: null });
    check('V2R20', head.title === 'CASE_0061' && /^.+ · Raw$/.test(head.subtitle) && !/RUN_|run /.test(head.subtitle),
      `the app bar names the case, then the experiment and the prediction, not the run id: "${head.title}" / "${head.subtitle}"`);
    check('V2R20', contextDetails(ctx).map((sec) => sec.title).join() === 'This view,Surfaces,Error regions,Frame',
      `the shell takes the screen's Details sections: ${contextDetails(ctx).map((sec) => sec.title).join(', ')}`);
    check('V2R20', !ctx.actions && !ctx.overflow, 'no icon button and no "more" menu: nothing in this screen needs one');
    check('V2R20', lastSent('insets').top === 56 && lastSent('insets').bottom === 168, `the page is told the app bar is 56 dp and (until measured) the panel 168 dp: ${JSON.stringify(lastSent('insets'))}`);
    await act(async () => { byTestId(r, 'selection-dock').props.onLayout({ nativeEvent: { layout: { height: 214 } } }); });
    await tick(20);
    check('V2R20', lastSent('insets').bottom === 214, `the measured panel height reaches the page: ${JSON.stringify(lastSent('insets'))}`);
    check('V2R20', lastSent('slice').index === 44 && lastSent('slice').label === '45', 'the slice number the page shows is the one the app wrote with the shared formatter');
    await fromViewer(r, { type: 'marker', id: 'FN_0001' });
    check('V2R20', lastSent('slice').label === '12' && hasDetail(/^FN, slices 11-13 \(z 10-12\), 523 voxels$/, recorded), 'and it follows the selection');
    check('V2R20', !has(r, /^Details$/), 'the panel has no Details button: the app bar\'s Info opens the sheet');
    await act(async () => { r.unmount(); });
    check('V2R20', recorded.contexts[recorded.contexts.length - 1] === null, 'leaving the screen clears what it reported');
    // Responsive (device session r4): the app bar names the experiment as people do and writes no experiment id; the id
    // is the Details sheet's "Experiment" line.
    const named = await mount(meshBackend({ experimentId: 'EXP-D-100' }), P);
    await fromViewer(named.r, { type: 'ready' });
    await fromViewer(named.r, { type: 'loaded', role: 'prediction', triangles: 12, vertices: 8 });
    const namedHead = headerLines(screenMeta('SCR-05'), P, reported(named.recorded), { studyId: null });
    check('RP-V2a', namedHead.title === 'CASE_0061' && namedHead.subtitle === 'DINOv2 100 % · Raw' && !/EXP-/.test(namedHead.subtitle)
      && hasDetail(/^Experiment EXP-D-100$/, named.recorded),
    `SCR-05 app bar: "${namedHead.title}" / "${namedHead.subtitle}"; the id is in Details`);
    await act(async () => { named.r.unmount(); });
    // the states before there is a viewer: the app bar names the case, content starts below it
    const loadingBackend = meshBackend({ missing: ['ART_RAW'] });
    const m2 = await mount(loadingBackend, P);
    const belowBar = m2.r.root.findAll((n) => n.props && n.props.style && [n.props.style].flat(3).some((st) => st && st.paddingTop === 56)).length > 0;
    check('V2R20', belowBar && reported(m2.recorded).title === 'CASE_0061' && /^.+ · Raw$/.test(reported(m2.recorded).subtitle), 'an unavailable surface: the state panel starts below the app bar, which still names the case');
    await act(async () => { m2.r.unmount(); });
    const { forgetSession } = await imp('src/lib/caseMode.mjs');
    forgetSession();
    const m3 = await mount(meshBackend(), { caseId: 'CASE_0061', runId: 'RUN_A' });
    check('V2R20', has(m3.r, /^Which prediction\?$/) && reported(m3.recorded).title === 'CASE_0061' && reported(m3.recorded).subtitle === '3D view', 'the variant question: the app bar names the case and says nothing of the run');
    await act(async () => { m3.r.unmount(); });
    forgetSession();
  }
  // 10c. INFERENCE_REVIEW (INT-12): prediction mesh yes, ground truth never asked for
  {
    const backend = meshBackend({ caseMode: 'INFERENCE_REVIEW' });
    const { r } = await mount(backend, P);
    const paths = backend.requests.map((u) => u.replace('https://backend.invalid', ''));
    check('V2R7', !paths.some((p) => p.includes('/ground-truth')) && !paths.some((p) => p.includes('MASK_CASE_0061')) && !paths.includes(`/api/v1/artifacts/${sum(gtBytes)}.cmesh`),
      'no request for ground truth, nor for its mesh');
    check('V2R7', paths.some((p) => p.endsWith('source_mask_id=ART_RAW')) && has(r, /^This case has no ground truth, so only the prediction is shown\.$/), 'the prediction mesh is requested; one sentence says there is no ground truth');
    check('V2R7', !paths.some((p) => p.includes('error-reconstruction')) && !has(r, /^The (error markers|ground-truth surface)/), 'no error geometry is asked for either, and no second sentence about it');
    await fromViewer(r, { type: 'ready' });
    check('V2R7', sentJson().filter((m) => m.type === 'mesh').map((m) => m.role).join() === 'prediction', 'only the prediction artifact reaches the viewer');
    check('V2R7', hasDetail(/^Ground truth: unavailable \(GROUND_TRUTH_UNAVAILABLE\)$/) && hasDetail(/^Errors: unavailable \(GROUND_TRUTH_UNAVAILABLE\)$/), 'Details names the reason for each layer');
    await act(async () => { r.unmount(); });
  }

  // 10d. the prediction mesh is unavailable: the API's own reason, nothing drawn, nothing substituted
  {
    const backend = meshBackend({ missing: ['ART_RAW'] });
    const { r, recorded } = await mount(backend, P);
    check('V2R8', has(r, /EMPTY UNAVAILABLE/) && has(r, /(code|reason) ARTIFACT_NOT_FOUND/) && has(r, /does not exist on the server/), `unavailable with the API reason: ${texts(r).filter((t) => /ARTIFACT_NOT_FOUND|UNAVAILABLE/.test(t)).join(' | ')}`);
    check('V2R8', web(r) === null && has(r, /No 3D surface is shown\./), 'no viewer is mounted, and the screen says so');
    const asked = backend.requests.filter((u) => u.includes('/reconstruction?')).length;
    await press(r, 'Refresh');
    await tick(250);
    check('V2R8', backend.requests.filter((u) => u.includes('/reconstruction?')).length > asked && web(r) === null, 'Refresh asks again (and the answer is still unavailable)');
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
    const paths = backend.requests.map((u) => u.replace('https://backend.invalid', ''));
    check('V2R9', !paths.some((p) => p.includes('/reconstruction')) && has(r, /(code|reason) NO_PREDICTION_FOR_VARIANT/) && web(r) === null,
      'a PROCESSED request on a RAW-only run is unavailable (NO_PREDICTION_FOR_VARIANT): never the RAW mesh relabelled');
    await act(async () => { r.unmount(); });
    const withProc = meshBackend({ processed: true });
    const m2 = await mount(withProc, { ...P, variant: 'PROCESSED' });
    const p2 = withProc.requests.map((u) => u.replace('https://backend.invalid', ''));
    check('V2R9', p2.some((p) => p.endsWith('source_mask_id=ART_PROC')) && has(m2.r, /^Prediction · Processed$/) && web(m2.r) !== null, 'a run with a PROCESSED prediction shows it, labelled Processed');
    await act(async () => { m2.r.unmount(); });
  }

  // 10e. bytes that do not hash to the id are CONTRACT_DRIFT, never drawn (DR-021 rule 1)
  {
    const backend = meshBackend({ tamper: ['ART_RAW'] });
    const { r } = await mount(backend, P);
    check('V2R10', has(r, /FATAL INVALID/) && has(r, /(code|reason) CONTRACT_DRIFT/) && web(r) === null && !has(r, /Retry/), 'tampered prediction bytes: blocked with CONTRACT_DRIFT, no viewer, no Retry');
    await act(async () => { r.unmount(); });
    const gtTamper = meshBackend({ tamper: ['MASK_CASE_0061'] });
    const m2 = await mount(gtTamper, P);
    await fromViewer(m2.r, { type: 'ready' });
    check('V2R10', web(m2.r) !== null && has(m2.r, /^The ground-truth surface is not available\.$/) && hasDetail(/^Ground truth: error \(CONTRACT_DRIFT\)/)
      && sentJson().filter((m) => m.type === 'mesh').map((m) => m.role).join() === 'prediction',
    'tampered ground-truth bytes: a sentence says the surface is not available (the code is in Details), the prediction still draws, the bad bytes never reach the viewer');
    await act(async () => { m2.r.unmount(); });
  }

  // 10f. a mesh for another grid, and the viewer's own errors
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
    check('V2R11', web(m3.r) !== null && has(m3.r, /^The ground-truth surface is not available\.$/) && hasDetail(/^Ground truth: error \(VIEWER_ERROR\): MESH_GRID/), 'a ground-truth layer the viewer refused is reported; the prediction stays');
    await act(async () => { m3.r.unmount(); });
  }

  // 10g. no variant given: the screen asks, there is no default (same rule as SCR-03)
  {
    const { forgetSession } = await imp('src/lib/caseMode.mjs');
    forgetSession();
    const backend = meshBackend();
    const { r } = await mount(backend, { caseId: 'CASE_0061', runId: 'RUN_A' });
    check('V2R12', has(r, /^Which prediction\?$/) && has(r, /Choose the prediction the 3D surface is built from\./) && web(r) === null
      && !backend.requests.some((u) => u.includes('/reconstruction')), 'no variant: the screen asks and requests no mesh');
    await tap(byA11y(r, 'RAW'));
    await tick(250);
    check('V2R12', web(r) !== null && has(r, /^Prediction · Raw$/), 'after the choice the mesh is requested and shown');
    forgetSession();
    await act(async () => { r.unmount(); });
  }

  // 10h. fixture mode has no bytes behind any reference: an honest unavailable state
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

  // 10i. SCR-03's 3D entry opens SCR-05 with the run, the variant and the slice on screen, and Back returns
  {
    const backend = fakeBackend();
    const runtime = liveRuntime(backend.fetchImpl);
    const recorded = [];
    const nav = ctxNav({ push: (...a) => { recorded.push(a); return true; } });
    let r;
    await act(async () => {
      r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
        React.createElement(CaseExplorerScreen, { runtime, nav, params: { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'PROCESSED' } })), nodeMock);
    });
    await tick(300);
    await layout(r);
    await tick(200);
    await openTools(nav);
    const three = r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith('3D view'))[0];
    check('V2R14', three && three.props.disabled === false, 'SCR-03: the 3D entry is enabled by a succeeded run that lists a reconstruction');
    await act(async () => { three.props.onPress(); });
    check('V2R14', recorded.length === 1 && recorded[0][0] === 'SCR-05'
      && JSON.stringify(recorded[0][1]) === JSON.stringify({ caseId: 'CASE_0061', runId: 'RUN_A', variant: 'PROCESSED', sliceIndex: 44 })
      && JSON.stringify(recorded[0][2]) === JSON.stringify({ runId: 'RUN_A', variant: 'PROCESSED', sliceIndex: 44 }),
    `SCR-03 -> SCR-05 carries case, run, variant and slice: ${JSON.stringify(recorded[0] ? [recorded[0][0], recorded[0][1]] : null)}`);
    await act(async () => { r.unmount(); });
  }
}

// ---- 12. Shell: header, tab bar, Details sheet, state panels, session cover, cache clear ----
{
  const { AppState, BackHandler } = await import('react-native');
  const { default: StateView } = await imp('src/components/StateView.js');
  const { loading, recoverableError } = await imp('src/api/states.mjs');
  const headerTexts = (r) => {
    const h = r.root.findAll((n) => n.props && typeof n.props.testID === 'string' && n.props.testID.startsWith('screen-'))[0];
    return h ? h.findAll((n) => n.type === 'Text').map(textOf) : [];
  };

  // Header: a name for people and the study; no screen id in the header or the tab bar.
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson });
  let t = 0;
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(NavigatorView, {
        runtime, initialScreenId: 'SCR-01', session: { idleMs: 600, backgroundMs: 300, checkEveryMs: 20, now: () => t },
      })), nodeMock);
  });
  await tick(60);
  check('H1', onScreen(r, 'SCR-01') && headerTexts(r).join(' | ') === 'Study Overview | Study STUDY_DEMO | Fixture'
    && !byTestId(r, 'header-back'), `header on a tab root, no Back: ${headerTexts(r).join(' | ')}`);
  check('H1', !has(r, /SCR-0\d · V\d/) && !has(r, /^SCR-0\d$/), 'no screen id in the header or the tab bar');
  check('H8', tabBar(r).map(textOf).join() === 'Study,Cases,Experiments,Findings'
    && tabBar(r).every((tab) => tab.findAll((n) => isIcon(n)).length === 1) && selectedTab(r) === 'Study',
  `tab bar: four tabs, each an icon and its name; selected: ${selectedTab(r)}`);
  const infoButton = () => byTestId(r, 'header-info');
  await act(async () => { infoButton().props.onPress(); });
  check('H2', has(r, /^Details$/) && has(r, /^This screen$/) && has(r, /^Screen SCR-01 \(V3\)$/) && has(r, /^Mode FIXTURE · study STUDY_DEMO$/) && has(r, /^Contract 1\.1\.0$/),
    `Info opens the Details sheet: ${texts(r).filter((x) => /^(Screen|Mode|Contract|Build) /.test(x)).join(' | ')}`);
  await press(r, 'Clear cached images');
  check('H2', has(r, /^Nothing to clear: this build keeps no images \(fixture mode\)\.$/), 'fixture mode: nothing to clear, and it says so');

  // Session cover: idle, then the back button is held, then "Show the screen".
  const root = r.root.findAll((n) => typeof n.props.onStartShouldSetResponderCapture === 'function')[0];
  t = 500;
  await act(async () => { root.props.onStartShouldSetResponderCapture(); });
  await tick(60);
  check('H3', !has(r, /^Screen hidden$/), 'a touch at 500 ms keeps the screen (idle limit 600 ms)');
  t = 1200;
  await tick(80);
  const cover = () => r.root.findAll((n) => n.props && n.props.testID === 'session-cover')[0];
  check('H3', Boolean(cover()) && has(r, /^Screen hidden$/) && has(r, /^Nobody touched the screen for 0\.6 seconds\./),
    `700 ms without a touch: the cover is up (${texts(r).find((x) => x.startsWith('Nobody')) || '-'})`);
  check('H7', !has(r, /^This screen$/) && !has(r, /^Screen SCR-01 \(V3\)$/), 'the open Details sheet hides under the cover (a Modal would draw over it)');
  let handled;
  await act(async () => { handled = BackHandler.__press(); });
  check('H3', handled === true && onScreen(r, 'SCR-01'), 'while covered the back button changes nothing');
  await press(r, 'Show the screen');
  check('H3', !cover() && BackHandler.__listeners === 1, 'Show the screen removes the cover and its back-button hold');
  check('H7', has(r, /^This screen$/), 'the Details sheet is back once the screen shows again');
  await act(async () => { byTestId(r, 'details-sheet-close').props.onPress(); });
  check('H7', !has(r, /^This screen$/) && !has(r, /^Details$/), 'Close shuts the Details sheet');

  // Background for longer than the limit covers the screen on return; a short trip does not.
  await act(async () => { AppState.__set('background'); });
  t += 100;
  await act(async () => { AppState.__set('active'); });
  check('H4', !cover(), 'back after 100 ms in the background: no cover');
  await act(async () => { AppState.__set('background'); });
  t += 400;
  await act(async () => { AppState.__set('active'); });
  check('H4', Boolean(cover()) && has(r, /in the background for/), `back after 400 ms (limit 300): ${texts(r).find((x) => x.startsWith('The app was')) || '-'}`);
  await press(r, 'Show the screen');
  await act(async () => { r.unmount(); });
  check('H4', AppState.__listeners === 0, 'the AppState listener is removed with the navigator');

  // State panel: a placeholder while loading; an error shows its cause, its code, one action, details folded.
  await act(async () => { r = TestRenderer.create(React.createElement(StateView, { view: loading(), what: 'the case list' })); });
  check('H5', r.root.findAll((n) => n.props && n.props.testID === 'placeholder').length === 1 && has(r, /^Loading the case list…$/),
    'loading: a placeholder where the content will be, and what is loading');
  const err = recoverableError({ code: 'TRANSPORT_UNREACHABLE', httpStatus: 503, requestId: 'req_7' }, ['RETRY']);
  const acted = [];
  await act(async () => { r.update(React.createElement(StateView, { view: err, what: 'the case list', onAction: (id) => acted.push(id) })); });
  const buttons = () => r.root.findAll((n) => n.type === 'TouchableOpacity').map(textOf);
  check('H5', r.root.findAll((n) => n.props && n.props.testID === 'placeholder').length === 0 && has(r, /could not be reached/)
    && has(r, /^code TRANSPORT_UNREACHABLE$/) && !has(r, /^request req_7$/) && buttons().join(',') === 'Details (2),Retry',
  `error: cause, code, one action, details folded (${buttons().join(', ')})`);
  await press(r, 'Details');
  await press(r, 'Retry');
  check('H5', has(r, /^HTTP 503$/) && has(r, /^request req_7$/) && acted.join() === 'RETRY', 'Details shows the HTTP status and request id; Retry answers RETRY');
  await act(async () => { r.unmount(); });

  // Live: the header names the run SCR-03 picked; "Clear cached images" empties the stores and reloads the slice.
  (await imp('src/lib/caseMode.mjs')).forgetSession();
  const backend = fakeBackend();
  const live = liveRuntime(backend.fetchImpl);
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime: live },
      React.createElement(NavigatorView, { runtime: live, initialScreenId: 'SCR-02' })), nodeMock);
  });
  await tick(150);
  await press(r, 'CASE_0061');
  await tick(150);
  if (has(r, /No default/)) await press(r, 'RAW');
  await tick(300);
  await layout(r);
  await tick(250);
  check('H6', onScreen(r, 'SCR-03') && headerTexts(r).join(' | ') === 'CASE_0061 | UNet2D · EXPERIMENT_ID_0043'
    && Boolean(byTestId(r, 'header-back')) && Boolean(byTestId(r, 'header-action-privacy')) && Boolean(byTestId(r, 'header-more')),
  `SCR-03 in the viewer chrome: the case and its model and experiment, Back, the privacy shield, Info and more: ${headerTexts(r).join(' | ')}`);
  check('H8', tabBar(r).length === 0 && Boolean(byTestId(r, 'viewer-chrome')), 'the case viewer hides the tab bar (viewer chrome)');
  const cachedBefore = live.imageStore.stats().cached;
  const mark = backend.requests.length;
  await act(async () => { infoButton().props.onPress(); });
  check('A4', ['This slice', 'Run', 'Case and layers', 'Privacy', 'This screen'].every((t) => has(r, new RegExp(`^${t}$`)))
    && has(r, /^Slice 45 \/ 88 · z 44$/) && has(r, /^MRI \S+ · sha256:[0-9a-f]{64}$/) && has(r, /^Run RUN_A · UNet2D · /)
    && has(r, /^Screen SCR-03 \(V1\)$/),
  'Info on the viewer: the slice (z, ids, checksums), the run, the layers and privacy, then the shell\'s own lines');
  await press(r, 'Clear cached images');
  await tick(300);
  await layout(r);
  await tick(250);
  check('H6', cachedBefore > 0 && has(r, /^Cleared \d+ images?, \d+ masks? and \d+ cached answers? from the app's memory/)
    && backend.requests.slice(mark).some((u) => u.endsWith('/api/v1/artifacts/mri-44.png')) && onSlice(r, 45),
  `cleared ${cachedBefore} image(s); the slice on screen was fetched again (${backend.requests.length - mark} requests)`);
  await act(async () => { r.unmount(); });

  // Viewer chrome (routes.mjs CHROME.VIEWER), opted into by the screen component itself: the app bar floats over the
  // screen (which draws its own scrim, TopScrim), the tab bar is hidden, and Back brings both back. SCR-03 is made to opt in here, so the check
  // holds whichever screen uses it; its own setting is restored afterwards.
  const chromeBefore = CaseExplorerScreen.chrome;
  CaseExplorerScreen.chrome = 'viewer';
  try {
    (await imp('src/lib/caseMode.mjs')).forgetSession();
    const viewerBackend = fakeBackend();
    const viewerRuntime = liveRuntime(viewerBackend.fetchImpl);
    await act(async () => {
      r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime: viewerRuntime },
        React.createElement(NavigatorView, { runtime: viewerRuntime, initialScreenId: 'SCR-02' })), nodeMock);
    });
    await tick(150);
    check('H9', tabBar(r).length === 4 && !byTestId(r, 'viewer-chrome'), 'a screen that does not opt in: the app bar above it and the tab bar below');
    await press(r, 'CASE_0061');
    await tick(150);
    if (has(r, /No default/)) await press(r, 'RAW');
    await tick(300);
    const chromeView = byTestId(r, 'viewer-chrome');
    const floats = chromeView && chromeView.props.style && chromeView.props.style.position === 'absolute';
    const headerInside = chromeView && chromeView.findAll((n) => n.props && n.props.testID === 'screen-SCR-03').length > 0;
    check('H9', onScreen(r, 'SCR-03') && floats && headerInside && tabBar(r).length === 0
      && Boolean(byTestId(r, 'header-back')) && !byTestId(r, 'header-status'),
    'viewer chrome: the app bar (Back, title, Info) floats over the screen; no tab bar; no Live word while live');
    await pressBack(r);
    await tick(150);
    check('H9', onScreen(r, 'SCR-02') && tabBar(r).length === 4 && selectedTab(r) === 'Cases' && !byTestId(r, 'viewer-chrome'),
      'Back: the list again, with the app bar in place and the tab bar back');
    await act(async () => { r.unmount(); });
  } finally {
    CaseExplorerScreen.chrome = chromeBefore;
  }
}

// ---- 13. V1 SCR-02 as a worklist: Dice chips, worst first, "no GT" (V1 item 4) ----
// A fake live backend whose case list holds the fixture's experiment rows: CASE_0001 has no ground truth,
// CASE_0006 failed, CASE_0007 is not in the experiment. EXP-D-PP states PROCESSED but is answered with RAW values.
{
  const { forgetWorklist } = await imp('src/screens/v1-cases/cases.mjs');
  forgetWorklist();
  const CaseListScreen = (await imp('src/screens/v1-cases/CaseListScreen.js')).default;
  const gen = (id, name = 'default') => JSON.parse(JSON.stringify(bundleJson.scenarios[id][name].response.data));
  const json = (status, body) => {
    const text = JSON.stringify(body);
    return {
      status,
      headers: { get: (k) => ({ 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })[k.toLowerCase()] ?? null },
      text: async () => text,
      json: async () => body,
    };
  };
  const ids = ['CASE_0001', 'CASE_0002', 'CASE_0003', 'CASE_0004', 'CASE_0005', 'CASE_0006', 'CASE_0007'];
  const requests = [];
  const fetchImpl = async (url) => {
    const path = url.replace('https://backend.invalid', '');
    requests.push(path);
    if (/\/studies\/[^/]+\/cases$/.test(path)) {
      return json(200, { ...gen('case_list'), items: ids.map((id) => ({ case_id: id, mode_capability: id === 'CASE_0001' ? 'INFERENCE_REVIEW' : 'EVALUATION', ground_truth_available: id !== 'CASE_0001' })) });
    }
    if (path === '/api/v1/experiments') return json(200, gen('experiment_list'));
    if (path === '/api/v1/experiments/EXP_DEMO/cases') {
      return json(200, { ...gen('experiment_cases', 'with_failure'), outlier_selection: gen('experiment_cases').outlier_selection });
    }
    if (path === '/api/v1/experiments/EXP-D-PP/cases') return json(200, gen('experiment_cases'));
    return json(404, { error: { code: 'ARTIFACT_NOT_FOUND', message: 'not here' } });
  };
  const runtime = liveRuntime(fetchImpl);
  const pushed = [];
  const nav = ctxNav({ push: (id, p) => { pushed.push([id, p]); return true; }, canGoBack: false });
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(CaseListScreen, { runtime, nav, params: {} })), nodeMock);
  });
  await tick(200);
  const rowOrder = () => r.root.findAll((n) => n.type === 'TouchableOpacity' && /^CASE_\d+, /.test(n.props.accessibilityLabel || ''))
    .map((n) => n.props.accessibilityLabel.split(',')[0]);
  const values = () => texts(r).filter((t) => /^\d\.\d{3}$/.test(t));
  const tabText = (label) => r.root.findAll((n) => n.type === 'TouchableOpacity' && textOf(n).startsWith(label) && n.props.accessibilityState
    && 'selected' in n.props.accessibilityState).map(textOf)[0];
  check('W0', tabText('All') === 'All7' && tabText('Evaluation') === 'Evaluation6' && tabText('Inference & review') === 'Inference & review1'
    && has(r, /^CASE$|^Case$/) && r.root.findAll((n) => n.type === 'TextInput')[0].props.placeholder === 'Search case ID'
    && !has(r, /cases? on this page/) && ctxHas(nav, /^7 cases on this page · 6 evaluation · 1 inference & review$/),
  'SCR-02 in Direction A: search, filter tabs with counts, the column heading; the page summary is in Details');
  // Nothing chosen: the default. EXP-D-PP is the only DINOv2 this list names, but the server answers it with no Dice
  // of its own, so the screen moves on to the first experiment that has values, EXP_DEMO.
  await tick(300);
  check('W1', has(r, /^EXP_DEMO · Raw$/) && values().includes('0.900') && !has(r, /^Choose an experiment/)
    && requests.some((u) => u === '/api/v1/experiments/EXP-D-PP/cases') && requests.some((u) => u === '/api/v1/experiments/EXP_DEMO/cases')
    && ctxHas(nav, /^Chosen for you: DINOv2 at the largest data fraction the server lists, raw before post-processed\./),
  'nothing chosen: opens on the default (DINOv2 first; an answer with no Dice is skipped), server order; Details says it was chosen for you');
  const listShort = shortTouchables(r.root);
  check('T5', listShort.length === 0, `SCR-02: every touchable (search, filter tabs, experiment, order, rows) reaches 48 dp${listShort.length ? ` - not: ${listShort.join(', ')}` : ''}`);
  const pick = async (id) => {
    await pressId(r, 'dice-of');
    const label = (n) => String(n.props.accessibilityLabel || '');
    const row = r.root.findAll((n) => n.type === 'TouchableOpacity' && (id === null ? label(n) === 'Show no Dice' : label(n).endsWith(`experiment ${id}`)))[0];
    if (!row) throw new Error(`no picker row for ${id}`);
    await act(async () => { row.props.onPress(); });
    await tick(200);
  };
  // The picker names each experiment as people do; the id is the second line, only where the name replaced it.
  await pressId(r, 'dice-of');
  check('W1', has(r, /^DINOv2 100 % · Processed$/) && has(r, /^EXP-D-PP$/) && has(r, /^EXP_DEMO · Raw$/) && !has(r, /^EXP_DEMO$/)
    && has(r, /^None \(no Dice\)$/), 'the picker: "DINOv2 100 % · Processed" with EXP-D-PP under it; an id outside the matrix once; None');
  await closeSheet(r, 'experiment-sheet');
  await pick('EXP_DEMO');
  check('W2', values().includes('0.900') && values().includes('0.400') && has(r, /^No GT$/) && has(r, /^Run failed$/) && has(r, /^Not in this experiment$/)
    && !has(r, /^0(\.0+)?$/) && has(r, /^Dice of$/), 'EXP_DEMO: the server\'s Dice per case; No GT, Run failed and Not in the experiment in words, never 0');
  check('W2', has(r, /^Outlier 1\/3$/) && has(r, /^Outlier 3\/3$/) && ctxHas(nav, /from the server, metric metric_version_fixture/)
    && has(r, /^EXP_DEMO · Raw$/) && marks(r, 'Path').length === 0,
  'the server\'s own outlier pick is tagged; the picker names the experiment; how the Dice is read is in Details');
  await press(r, 'Worst first');
  await tick(60);
  check('W3', rowOrder().join() === 'CASE_0005,CASE_0003,CASE_0004,CASE_0002,CASE_0001,CASE_0006,CASE_0007'
    && ctxHas(nav, /Worst first is sorted on this phone: lowest Dice first/) && has(r, /^No Dice for this experiment$/),
  `worst first: ${rowOrder().join(', ')} - the first three are the server's outliers 1, 2, 3; no-value rows follow under their own heading`);
  await press(r, 'CASE_0005');
  check('W3', pushed.length === 1 && JSON.stringify(pushed[0]) === JSON.stringify(['SCR-03', { caseId: 'CASE_0005', runId: 'RUN_0005', variant: 'RAW' }]),
    `a row opens SCR-03 on the experiment's run and variant: ${JSON.stringify(pushed[0] || null)}`);
  await pick('EXP-D-PP');
  check('W4', has(r, /^Asked for DINOv2 100 % · Processed; the server answered with Raw values, so no Dice is shown\.$/) && values().length === 0
    && rowOrder().join() === ids.join() && !has(r, /^No Dice for this experiment$/), 'EXP-D-PP answered with RAW values: no Dice shown, and nothing sorted by them');
  // "None" is the person's own choice: no Dice, and the default does not come back on its own.
  await pick(null);
  const perCase = requests.filter((u) => /\/experiments\/[^/]+\/cases$/.test(u)).length;
  await tick(300);
  check('W5', has(r, /^Choose an experiment to see each case's Dice\.$/) && values().length === 0 && rowOrder().join() === ids.join()
    && requests.filter((u) => /\/experiments\/[^/]+\/cases$/.test(u)).length === perCase,
  'None: server order, no Dice, and no new per-case request');
  await act(async () => { r.unmount(); });
  forgetWorklist();
}
console.log = origLog;
console.error = origError;
const appErrors = errors.filter((e) => !/act\(/.test(e) && !/react-test-renderer is deprecated/.test(e));
check('E1', appErrors.length === 0, `console.error from app code: ${appErrors.length}${appErrors.length ? ` - ${appErrors[0].slice(0, 300)}` : ''}`);
watchdog.stop();
origLog(failures === 0 ? `RENDER SMOKE PASS - ${count} checks (logic only, not device evidence)` : `RENDER SMOKE FAIL - ${failures} of ${count}`);
process.exit(failures === 0 ? 0 : 1);
