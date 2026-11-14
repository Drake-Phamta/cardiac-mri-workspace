/*
 * Touch targets of the shared components.  npm run test:render  (from mobile/) runs it after smoke.mjs.
 *
 * TEST-ONLY. Renders every shared interactive component in Node (hooks.mjs: react-test-renderer and host-string
 * React Native stand-ins) and measures each touchable the way React Native would size its hit area: the height its
 * style gives it (height, else minHeight, else the height of the row or column that stretches it) plus its hitSlop.
 * Every one must reach MIN_TOUCH (48 dp). A control that can be narrower than 48 dp (a short label) must say so with
 * a minWidth. There is no layout engine here: this measures what the styles ask for, not a frame on a phone; the
 * phone's own check is the uiautomator dump of the device session.
 */

import React from 'react';
import { readdirSync, readFileSync } from 'node:fs';
import TestRenderer, { act } from 'react-test-renderer';

import { MOBILE } from './hooks.mjs';

globalThis.__DEV__ = false;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const origLog = console.log;
const origError = console.error;
console.error = () => {};

const imp = (p) => import(new URL(p, `file:///${MOBILE.replace(/\\/g, '/')}/`).href);
const { MIN_TOUCH, size, hitSlopFor } = await imp('src/components/tokens.mjs');
const Controls = await imp('src/components/Controls.js');
const ListRowModule = await imp('src/components/ListRow.js');
const Floating = await imp('src/components/Floating.js');
const MetricStrip = (await imp('src/components/MetricStrip.js')).default;
const Provenance = (await imp('src/components/Provenance.js')).default;
const AppHeaderModule = await imp('src/components/AppHeader.js');
const { StatePanel } = await imp('src/components/StateView.js');
const { Sheet } = await imp('src/components/DetailsSheet.js');
const icons = await imp('src/components/icons.js');
const { resolveConfig } = await imp('src/config.mjs');
const { createRuntime } = await imp('src/api/runtime.mjs');
const { RuntimeProvider } = await imp('src/api/RuntimeContext.js');
const NavigatorView = (await imp('src/navigation/Navigator.js')).default;
const { generatedBundleJson, readContractJson } = await imp('test/_helpers.mjs');
const { RECOVERY, recoverableError } = await imp('src/api/states.mjs');

const { IconButton, Button, SegmentedControl, Chip } = Controls;
const ListRow = ListRowModule.default;
const { ToolButton, FloatingToolbar } = Floating;
const AppHeader = AppHeaderModule.default;
const { StatusIndicator } = AppHeaderModule;

let failures = 0;
let count = 0;
const check = (id, ok, detail) => { count += 1; if (!ok) failures += 1; origLog(`  ${ok ? 'ok  ' : 'FAIL'} ${id} ${detail}`); };

// ---- measuring ---------------------------------------------------------------------------------------------------

const flat = (st) => (Array.isArray(st) ? Object.assign({}, ...st.map(flat)) : (st && typeof st === 'object' ? st : {}));
const num = (v) => (typeof v === 'number' ? v : 0);
const hostParent = (n) => { let p = n.parent; while (p && typeof p.type !== 'string') p = p.parent; return p; };
const slopOf = (node) => {
  const h = node.props.hitSlop;
  if (!h) return { top: 0, bottom: 0, left: 0, right: 0 };
  if (typeof h === 'number') return { top: h, bottom: h, left: h, right: h };
  return { top: num(h.top), bottom: num(h.bottom), left: num(h.left), right: num(h.right) };
};
// A style that fills its parent (StyleSheet.absoluteFill): the backdrop behind a sheet, not a sized control.
const fillsParent = (st) => st.position === 'absolute' && st.left === 0 && st.right === 0 && st.top === 0 && st.bottom === 0;
const innerHeight = (st, h) => h - (num(st.paddingTop ?? st.paddingVertical ?? st.padding) + num(st.paddingBottom ?? st.paddingVertical ?? st.padding))
  - (num(st.borderTopWidth ?? st.borderWidth) + num(st.borderBottomWidth ?? st.borderWidth));

// The height a style gives a node: height, else minHeight, else (in a row whose items stretch, or alignSelf stretch)
// the inner height of its parent. null = the styles say nothing about it.
function boxHeight(node) {
  const st = flat(node.props.style);
  if (typeof st.height === 'number') return st.height;
  if (typeof st.minHeight === 'number') return st.minHeight;
  const parent = hostParent(node);
  if (!parent) return null;
  const ps = flat(parent.props.style);
  const stretched = st.alignSelf === 'stretch'
    || (st.alignSelf === undefined && ps.flexDirection === 'row' && (ps.alignItems === undefined || ps.alignItems === 'stretch'));
  if (!stretched) return null;
  const outer = boxHeight(parent);
  return outer === null ? null : innerHeight(ps, outer);
}

// { height, width } of the area that answers a touch: the box plus its hitSlop. width is null for a content-sized control.
function hitArea(node) {
  const st = flat(node.props.style);
  const slop = slopOf(node);
  const h = boxHeight(node);
  const w = typeof st.width === 'number' ? st.width : (typeof st.minWidth === 'number' ? st.minWidth : null);
  return {
    height: h === null ? null : h + slop.top + slop.bottom,
    width: w === null ? null : w + slop.left + slop.right,
    fills: fillsParent(st),
  };
}

const isTouchable = (n) => (n.type === 'TouchableOpacity' || n.type === 'Pressable') && typeof n.props.onPress === 'function';
const named = (n) => n.props.testID || n.props.accessibilityLabel || n.props.accessibilityRole || 'touchable';

async function render(element) {
  let r;
  await act(async () => { r = TestRenderer.create(element, { createNodeMock: () => ({}) }); });
  return r;
}

// Renders one component and checks every touchable in it. `expect` is how many touchables it must have, so a
// component that stopped rendering its control cannot pass by having nothing to measure.
async function checkComponent(id, label, element, expect, { wide = [] } = {}) {
  const r = await render(element);
  const touchables = r.root.findAll(isTouchable);
  const short = [];
  const unsized = [];
  const narrow = [];
  for (const t of touchables) {
    const a = hitArea(t);
    if (a.fills) continue;
    if (a.height === null) unsized.push(named(t));
    else if (a.height < MIN_TOUCH) short.push(`${named(t)} ${a.height} dp`);
    if (wide.includes(named(t)) && !(a.width >= MIN_TOUCH)) narrow.push(`${named(t)} width ${a.width}`);
  }
  check(id, touchables.length === expect && short.length === 0 && unsized.length === 0 && narrow.length === 0,
    `${label}: ${touchables.length} touchable(s) (expected ${expect}), each at least ${MIN_TOUCH} dp high with its hitSlop`
    + `${short.length ? ` - too short: ${short.join(', ')}` : ''}${unsized.length ? ` - no height from the styles: ${unsized.join(', ')}` : ''}`
    + `${narrow.length ? ` - too narrow: ${narrow.join(', ')}` : ''}`);
  await act(async () => { r.unmount(); });
}

// ---- 0. the helper itself: the visible sizes measured on the phone each reach 48 dp ---------------------------------------

{
  // Visible heights from the device session (SESSION.md 4.4): segment 28, chip 36, button 40, tab 44, kind chip 32.
  const measured = { segment: 28, chip: 36, button: 40, tab: 44, kindChip: 32 };
  const bad = Object.entries(measured).filter(([, v]) => {
    const s = hitSlopFor(v);
    return v + s.top + s.bottom < MIN_TOUCH || s.left !== 0 || s.right !== 0;
  }).map(([k]) => k);
  check('T0', bad.length === 0 && hitSlopFor(MIN_TOUCH).top === 0 && hitSlopFor(56).bottom === 0,
    `hitSlopFor lifts every visible height measured on the phone to ${MIN_TOUCH} dp and leaves a 48 dp or taller control alone${bad.length ? ` - not: ${bad.join(', ')}` : ''}`);
}

// ---- 1. the controls ---------------------------------------------------------------------------------------------------

const noop = () => {};
const SEG = [{ value: 'a', label: 'IoU' }, { value: 'b', label: 'Raw' }, { value: 'c', label: 'Worst first', icon: icons.IconSort }];

await checkComponent('T1', 'IconButton', React.createElement(IconButton, { icon: icons.IconInfo, label: 'Details', onPress: noop }), 1);
await checkComponent('T1', 'Button primary, secondary, quiet, with icon, block', React.createElement(React.Fragment, null,
  React.createElement(Button, { label: 'Reset', onPress: noop }),
  React.createElement(Button, { label: 'Save', variant: 'secondary', onPress: noop, icon: icons.IconCheck }),
  React.createElement(Button, { label: 'Go', variant: 'quiet', onPress: noop }),
  React.createElement(Button, { label: 'Export PDF', onPress: noop, block: true })), 4, { wide: ['Reset', 'Save', 'Go', 'Export PDF'] });
await checkComponent('T1', 'SegmentedControl: a 28 dp segment, short labels', React.createElement(SegmentedControl,
  { options: SEG, value: 'a', onChange: noop, label: 'Metric' }), 3, { wide: ['button'] });
await checkComponent('T1', 'Chip (layer chip over the image), on and off', React.createElement(React.Fragment, null,
  React.createElement(Chip, { label: 'GT', swatch: '#39c5cf', on: true, onPress: noop }),
  React.createElement(Chip, { label: 'Prediction', swatch: '#f0883e', on: false, onPress: noop })), 2);

// The widths: a quiet one-word Button and the shortest segment are content-sized, so they carry a minWidth.
{
  const r = await render(React.createElement(React.Fragment, null,
    React.createElement(Button, { label: 'Go', variant: 'quiet', onPress: noop }),
    React.createElement(SegmentedControl, { options: [{ value: 'a', label: 'IoU' }], value: 'a', onChange: noop })));
  const [quiet, segment] = r.root.findAll(isTouchable);
  check('T1', hitArea(quiet).width >= MIN_TOUCH && hitArea(segment).width >= MIN_TOUCH,
    `a one-word quiet Button and a segment labelled "IoU" are at least ${MIN_TOUCH} dp wide (minWidth)`);
  await act(async () => { r.unmount(); });
}

// ---- 2. rows, tools, header, strip, folded ids, state panel, sheet ---------------------------------------------------------

await checkComponent('T2', 'ListRow nav, meter and case', React.createElement(React.Fragment, null,
  React.createElement(ListRow, { variant: 'nav', title: 'About this data', onPress: noop }),
  React.createElement(ListRow, { variant: 'meter', title: 'CASE_0029', bar: 0.1, value: '0.048', onPress: noop }),
  React.createElement(ListRow, { variant: 'case', title: 'CASE_0029', bar: 0.1, value: '0.048', onPress: noop })), 3);
await checkComponent('T2', 'ListRow without onPress draws no touchable', React.createElement(ListRow, { variant: 'meter', title: 'x', bar: 0.5, value: '1' }), 0);
await checkComponent('T2', 'ToolButton in the floating toolbar', React.createElement(FloatingToolbar, { label: 'Draw masks as' },
  React.createElement(ToolButton, { icon: icons.IconFill, label: 'Fill', selected: true, onPress: noop }),
  React.createElement(ToolButton, { icon: icons.IconOutline, label: 'Outline', onPress: noop })), 2);
await checkComponent('T2', 'AppHeader: Back, run picker, Live, Info, More', React.createElement(AppHeader, {
  title: 'Error Inspector', subtitle: 'CASE_0029 · Raw', onBack: noop, status: 'live', onStatusPress: noop, onInfo: noop,
  onSubtitlePress: noop, overflow: { label: 'More', onPress: noop }, floating: true,
}), 5);
await checkComponent('T2', 'AppHeader without actions', React.createElement(AppHeader, { title: 'Cases', status: 'live', onInfo: noop }), 1);
await checkComponent('T2', 'StatusIndicator as a button', React.createElement(StatusIndicator, { mode: 'fixture', onPress: noop }), 1);
await checkComponent('T2', 'MetricStrip: three tappable cells', React.createElement(MetricStrip, {
  cells: [
    { label: 'Cases', value: 74, caption: 'in this study', onPress: noop },
    { label: 'Findings', value: 0, caption: 'open', onPress: noop },
    { label: 'Resolved', value: 0, caption: 'findings', onPress: noop },
  ],
}), 3);
await checkComponent('T2', 'Provenance head', React.createElement(Provenance, { title: 'Provenance', summary: 'ids' }, null), 1);
{
  const contract = readContractJson();
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson: contract, bundleJson: generatedBundleJson() });
  const failed = recoverableError({ code: 'ARTIFACT_NOT_FOUND', httpStatus: 404, requestId: 'req-1' }, [RECOVERY.RETRY, RECOVERY.BACK]);
  await checkComponent('T2', 'StatePanel: the Details link and its action buttons', React.createElement(RuntimeProvider, { runtime },
    React.createElement(StatePanel, { view: failed, what: 'the case list', onAction: noop })), 3);
}
await checkComponent('T2', 'Sheet: the close button (the full-screen backdrop is not measured)', React.createElement(Sheet,
  { visible: true, onClose: noop, title: 'Details', testID: 'sheet' }, null), 2);

// ---- 3. the navigator: tab bar, header controls, Details sheet, fixture scenarios ---------------------------------------------

{
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson: readContractJson(), bundleJson: generatedBundleJson() });
  let r;
  await act(async () => {
    r = TestRenderer.create(React.createElement(RuntimeProvider, { runtime },
      React.createElement(NavigatorView, { runtime, initialScreenId: 'SCR-01' })), { createNodeMock: () => ({ measure: (cb) => cb(0, 0, 400, 400, 0, 0) }) });
  });
  await act(async () => { await new Promise((res) => setTimeout(res, 60)); });
  const shell = (n) => isTouchable(n) && (n.props.accessibilityRole === 'tab' || String(n.props.testID || '').startsWith('header-'));
  const bars = r.root.findAll(shell);
  const bad = bars.filter((t) => { const a = hitArea(t); return a.height === null || a.height < MIN_TOUCH; }).map(named);
  check('T3', bars.length >= 6 && bad.length === 0,
    `the real shell: ${bars.length} tab and header controls (4 tabs, Fixture, Info), each at least ${MIN_TOUCH} dp high${bad.length ? ` - not: ${bad.join(', ')}` : ''}`);
  const tabs = r.root.findAll((n) => isTouchable(n) && n.props.accessibilityRole === 'tab');
  check('T3', tabs.length === 4 && tabs.every((t) => hitArea(t).height === size.tabBar), `the tab bar is ${size.tabBar} dp high, each tab as tall as the bar`);

  // The Details sheet and the fixture scenario panel, opened as a person opens them.
  const press = async (id) => { await act(async () => { r.root.findAll((n) => n.props && n.props.testID === id && typeof n.type === 'string')[0].props.onPress(); }); };
  await press('header-info');
  const modals = r.root.findAll((n) => n.type === 'Modal');
  const inSheet = modals.flatMap((m) => m.findAll(isTouchable));
  const sheetBad = inSheet.filter((t) => { const a = hitArea(t); return !a.fills && (a.height === null || a.height < MIN_TOUCH); }).map(named);
  check('T3', inSheet.length >= 3 && sheetBad.length === 0,
    `the Details sheet: ${inSheet.length} touchables (close, backdrop, Clear cached images), each at least ${MIN_TOUCH} dp high${sheetBad.length ? ` - not: ${sheetBad.join(', ')}` : ''}`);
  await press('details-sheet-close');
  await press('header-status');
  const panel = r.root.findAll((n) => n.type === 'Modal').flatMap((m) => m.findAll(isTouchable));
  const panelBad = panel.filter((t) => { const a = hitArea(t); return !a.fills && (a.height === null || a.height < MIN_TOUCH); }).map(named);
  check('T3', panel.length >= 3 && panelBad.length === 0,
    `the fixture scenario panel: ${panel.length} touchables (endpoint rows, All default, Close), each at least ${MIN_TOUCH} dp high${panelBad.length ? ` - not: ${panelBad.join(', ')}` : ''}`);
  await act(async () => { r.unmount(); });
}

// ---- 4. nothing in src/components is left out -----------------------------------------------------------------------------------

{
  // Every shared component file that draws a touchable is one this file renders; a new one must be added above.
  const covered = ['AppHeader.js', 'Controls.js', 'DetailsSheet.js', 'Floating.js', 'ListRow.js', 'MetricStrip.js', 'Provenance.js', 'StateView.js'];
  const dir = `${MOBILE}/src/components`;
  const withTouch = readdirSync(dir).filter((f) => f.endsWith('.js') && /TouchableOpacity|Pressable/.test(readFileSync(`${dir}/${f}`, 'utf8')));
  const missing = withTouch.filter((f) => !covered.includes(f));
  check('T4', missing.length === 0, `every src/components file with a touchable is measured above${missing.length ? ` - add: ${missing.join(', ')}` : ` (${withTouch.join(', ')})`}`);
}

console.log = origLog;
console.error = origError;
origLog(failures === 0 ? `TOUCH TARGETS PASS - ${count} checks (style arithmetic, not device evidence)` : `TOUCH TARGETS FAIL - ${failures} of ${count}`);
process.exit(failures === 0 ? 0 : 1);
