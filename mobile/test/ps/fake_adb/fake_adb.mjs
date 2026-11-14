#!/usr/bin/env node
/*
 * fake_adb.mjs - a synthetic "phone" for testing mobile/scripts/device_session.ps1 with NO device.
 *
 * It answers the adb commands the script uses (devices, getprop, dumpsys, uiautomator dump, input tap / swipe / text,
 * monkey, logcat, install, screencap, ...) from a small model of the app's screens (SCR-01..SCR-08, the A9 dialogs),
 * built from the texts in mobile/src. It is a test double: it checks that the script's ORCHESTRATION works (waiting,
 * lookups, the order of steps, the judge, the files), not that the real app looks like this.
 *
 * Usage: set FAKE_ADB_DIR to a folder (state lives there), then use  fake_adb.cmd  as the script's -Adb.
 *   FAKE_A9=pass|slow|hang   what the scripted run does (default pass)
 *   FAKE_SPEED=<ms>          simulated step time (default 25)
 *   FAKE_TOUR_RUN=1|0        whether the tour case has an analysis run (default 1)
 *   FAKE_NO_DEVICE=1 | FAKE_UNAUTH=1   what `adb devices` shows
 *   FAKE_DUMP_FAIL=<n>       every n-th uiautomator dump fails with "could not get idle state"
 *   FAKE_INSTALL_FAIL=incompatible   an install over an installed app fails with INSTALL_FAILED_UPDATE_INCOMPATIBLE
 *   FAKE_BREAK=tabcases      the Cases tab is labelled differently (a step the script cannot do by itself)
 * It records what a careful script must not do in <dir>/violations.txt: any touch / dump / screenshot / meminfo while
 * a scripted pass is running, and any tap on a button that writes (Accept, Flag, Save ...). <dir>/backend_writes.txt
 * lists the review_create the app would send when SCR-06 opens.
 * Not a security tool, no network, never touches a real device.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = process.env.FAKE_ADB_DIR;
if (!DIR) { console.error('fake_adb: set FAKE_ADB_DIR'); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });
const F = (n) => path.join(DIR, n);
const SERIAL = 'FAKE0123456789';
const PKG = 'com.cardiacmri.workspace';
const W = 1080;
const H = 2340;
const SPEED = Number(process.env.FAKE_SPEED || 25);
const A9MODE = process.env.FAKE_A9 || 'pass';
const TOUR_RUN = (process.env.FAKE_TOUR_RUN || '1') === '1';

// ---------------------------------------------------------------------------------------------------- state
const fresh = () => ({
  installed: false, app: false, stack: [], dialog: null, a9Running: false, a9Started: 0, scroll: {}, dumps: 0,
  settings: { stay_on_while_plugged_in: '0' }, openGestures: 0, input: '', recorded: false,
});
function load() {
  let s;
  try { s = JSON.parse(fs.readFileSync(F('state.json'), 'utf8')); } catch (_e) { s = fresh(); }
  if (s.a9Running && fs.existsSync(F('a9_done.flag'))) { s.a9Running = false; s.dialog = 'finished'; }
  return s;
}
const save = (s) => fs.writeFileSync(F('state.json'), JSON.stringify(s));
const violation = (msg) => fs.appendFileSync(F('violations.txt'), `${new Date().toISOString()} ${msg}\n`);
const stamp = (d = new Date()) => {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};
const logLine = (msg) => fs.appendFileSync(F('logcat.txt'), `${stamp()} 12345 12400 I ReactNativeJS: ${msg}\n`);

// ---------------------------------------------------------------------------------------------------- UI model
const N = (o) => ({ t: '', d: '', cls: 'android.widget.TextView', clk: false, scr: false, en: true, pkg: PKG, act: null, ...o });
const T = (text, b, o = {}) => N({ t: text, b, ...o });

function chrome(s, top) {
  const n = [N({ cls: 'android.widget.FrameLayout', b: [0, 0, W, H] })];
  if (s.stack.length > 1) {
    n.push(N({ d: 'Back', cls: 'android.view.ViewGroup', b: [10, 130, 220, 250], clk: true, act: 'back' }));
    n.push(T('‹ Back', [40, 160, 190, 220]));
  }
  n.push(T(`${top.id.toUpperCase()} · V1`, [300, 140, 780, 180]));
  n.push(N({ d: 'LIVE · backend http://<configured> · study STUDY_LA_001', cls: 'android.view.ViewGroup', b: [880, 130, 1070, 250], clk: true }));
  n.push(T('LIVE', [920, 170, 1030, 210]));
  let x = 0;
  for (const [label, id] of [['Study', 'SCR-01'], ['Cases', 'SCR-02'], ['Experiments', 'SCR-07'], ['Findings', 'SCR-08']]) {
    n.push(N({ cls: 'android.view.ViewGroup', b: [x, 2150, x + 270, 2340], clk: true, act: `tab:${label}` }));
    n.push(T(process.env.FAKE_BREAK === 'tabcases' && label === 'Cases' ? 'Casez' : label, [x + 60, 2190, x + 210, 2240]));
    n.push(T(id, [x + 90, 2250, x + 180, 2290]));
    x += 270;
  }
  return n;
}

// a scrolling column: items [{h, nodes(y)}] inside a viewport; clipped bounds like uiautomator
function flow(s, key, vp, items) {
  const [x1, y1, x2, y2] = vp;
  const total = items.reduce((a, i) => a + i.h, 0);
  const maxOff = Math.max(0, total - (y2 - y1));
  const off = Math.min(maxOff, s.scroll[key] || 0);
  const nodes = [N({ cls: 'android.widget.ScrollView', b: vp, scr: true, act: `scroll:${key}` })];
  let y = y1 - off;
  for (const it of items) {
    if (y + it.h > y1 && y < y2) {
      for (const nd of it.nodes(y)) {
        const b = [nd.b[0], Math.max(y1, nd.b[1]), nd.b[2], Math.min(y2, nd.b[3])];
        if (b[3] - b[1] > 4) nodes.push({ ...nd, b });
      }
    }
    y += it.h;
  }
  return { nodes, maxOff };
}

const label = (z) => `slice ${z + 1} / 88  (z = ${z})`;

function explorerNodes(s, top) {
  const n = [];
  const run = top.hasRun;
  n.push(T(top.case, [40, 270, 400, 330]));
  n.push(T(run ? `Run ${top.run} · unet · EXP-D-100 · precomputed` : 'No analysis run for this case - MRI and ground truth only', [40, 340, 1040, 400]));
  n.push(T('Prediction', [40, 410, 260, 460]));
  if (!run) n.push(T('none - no analysis run for this case', [280, 410, 1040, 460]));
  else { n.push(N({ cls: 'android.view.ViewGroup', b: [280, 400, 460, 470], clk: true, act: 'noop' })); n.push(T('RAW', [320, 415, 420, 455])); }
  const lab = top.loading ? 'slice - / -' : label(top.slice);
  n.push(N({ cls: 'android.view.ViewGroup', b: [200, 1600, 880, 1670], clk: true, act: 'label', t: '' }));
  n.push(T(lab, [200, 1600, 880, 1670]));
  n.push(N({ d: lab, cls: 'android.view.View', b: [200, 1690, 880, 1800] }));
  const items = [];
  items.push({ h: 400, nodes: (y) => {
    const a = [T('Overlays', [60, y + 10, 400, y + 60])];
    let yy = y + 70;
    if (run) { a.push(N({ t: `Prediction (RAW): ${top.pred ? 'ON' : 'OFF'}`, cls: 'android.view.ViewGroup', b: [60, yy, 1000, yy + 90], clk: true, act: 'pred' })); yy += 100; }
    else { a.push(T('Prediction: none - no analysis run for this case (no prediction, metric or error layer).', [60, yy, 1000, yy + 60])); yy += 70; }
    a.push(N({ t: `Ground truth: ${top.gt ? 'ON' : 'OFF'}`, cls: 'android.view.ViewGroup', b: [60, yy, 1000, yy + 90], clk: true, act: 'gt' }));
    a.push(T('Opacity', [60, yy + 110, 260, yy + 160]));
    return a;
  } });
  items.push({ h: 200, nodes: (y) => [T(run ? 'Slice Dice (RAW): 0.912' : 'Slice Dice: - (no analysis run for this case)', [60, y + 20, 1000, y + 70]), T('Refresh this slice', [60, y + 100, 500, y + 150], { clk: true, act: 'noop' })] });
  items.push({ h: 150, nodes: (y) => [T('Provenance (this slice)', [60, y + 10, 800, y + 50])] });
  const entry = (name, act, enabled, why, y) => [
    N({ cls: 'android.view.ViewGroup', b: [60, y, 1020, y + 120], clk: enabled, en: enabled, act: enabled ? act : 'noop' }),
    T(name, [90, y + 15, 900, y + 60]),
    ...(why ? [T(why, [90, y + 65, 900, y + 105])] : []),
  ];
  const why = 'needs an analysis run - no analysis run for this case';
  items.push({ h: 130, nodes: (y) => entry('Error inspector (SCR-04)', 'sc04', run, run ? '' : why, y) });
  items.push({ h: 130, nodes: (y) => entry('3D (SCR-05)', 'sc05', run, run ? '' : why, y) });
  items.push({ h: 130, nodes: (y) => entry('Review / correct (SCR-06)', 'sc06', run, run ? '' : why, y) });
  items.push({ h: 80, nodes: (y) => [T('Long-press the slice label for the scripted runs (L4, A9) - timings and bytes go to logcat.', [60, y + 10, 1020, y + 60])] });
  const f = flow(s, 'explorer', [0, 1960, W, 2140], items);
  return n.concat(f.nodes);
}

function screenNodes(s) {
  const top = s.stack[s.stack.length - 1];
  const n = chrome(s, top);
  if (top.id === 'study') {
    const f = flow(s, 'study', [0, 270, W, 2140], [
      { h: 380, nodes: (y) => [T('STUDY_LA_001', [40, y + 10, 800, y + 60]), T('Dataset: ACDC-like, 21 cases', [40, y + 70, 900, y + 120]), T('Cases (EVALUATION): 20', [40, y + 130, 900, y + 180]), T('Open cases (SCR-02)', [40, y + 250, 600, y + 300], { clk: true, act: 'tab:Cases' })] },
      { h: 500, nodes: (y) => [T('Experiments', [40, y + 10, 600, y + 60]), T('UNet 25% - SUCCEEDED, N 20', [40, y + 70, 900, y + 120]), T('Open the comparison (SCR-07)', [40, y + 400, 700, y + 450], { clk: true, act: 'tab:Experiments' })] },
      { h: 600, nodes: (y) => [T('Comparable metrics (server verdicts)', [40, y + 10, 900, y + 60]), T('Outliers (DR-010)', [40, y + 300, 600, y + 350])] },
      { h: 300, nodes: (y) => [T('Findings', [40, y + 10, 600, y + 60]), T('Open findings (SCR-08)', [40, y + 100, 600, y + 150], { clk: true, act: 'tab:Findings' })] },
    ]);
    return n.concat(f.nodes);
  }
  if (top.id === 'experiments') {
    const f = flow(s, 'experiments', [0, 270, W, 2140], [
      { h: 300, nodes: (y) => [T('What is compared', [40, y + 10, 700, y + 60]), T('Matrix: UNet vs DINOv2 x 25 / 50 / 100 %', [40, y + 70, 1000, y + 120])] },
      { h: 500, nodes: (y) => [T('Metric and statistic', [40, y + 10, 700, y + 60]), T('Nothing is pre-selected: pick what to plot and how to summarise it.', [40, y + 70, 1000, y + 120])] },
      { h: 800, nodes: (y) => [T('UNet vs DINOv2 · 25 / 50 / 100 %', [40, y + 10, 900, y + 60])] },
      { h: 700, nodes: (y) => [T('Distribution per case', [40, y + 10, 900, y + 60])] },
    ]);
    return n.concat(f.nodes);
  }
  if (top.id === 'cases') {
    n.push(T('Study STUDY_LA_001', [40, 270, 600, 320]));
    n.push(N({ d: 'Search case ID', cls: 'android.widget.EditText', b: [40, 330, 1040, 450], clk: true, act: 'search', t: s.input || '' }));
    const rows = [['CASE_0042', 'Evaluation'], ['CASE_0061', 'Evaluation'], ['CASE_0099', 'Inference & review']];
    const f = flow(s, 'cases', [0, 560, W, 2140], [
      { h: 80, nodes: (y) => [T(`${rows.length} cases on this page · ${rows.length - 1} evaluation · 1 inference & review`, [40, y + 10, 1040, y + 60])] },
      ...rows.filter((r) => !s.input || r[0].includes(s.input)).map((r) => ({ h: 220, nodes: (y) => [
        N({ d: `${r[0]}, ${r[1]}`, cls: 'android.view.ViewGroup', b: [40, y, 1040, y + 200], clk: true, act: `case:${r[0]}` }),
        T(r[0], [70, y + 20, 500, y + 80]), T(r[1], [70, y + 100, 500, y + 150]),
      ] })),
    ]);
    return n.concat(f.nodes);
  }
  if (top.id === 'explorer') {
    if (top.stage === 'chooser') {
      n.push(T(top.case, [40, 270, 400, 330]));
      n.push(T('Analysis run', [40, 450, 600, 500]));
      n.push(N({ cls: 'android.view.ViewGroup', b: [40, 520, 1040, 620], clk: true, act: 'run:RUN_FAKE_01' })); n.push(T('RUN_FAKE_01', [70, 540, 700, 600]));
      n.push(N({ cls: 'android.view.ViewGroup', b: [40, 640, 1040, 740], clk: true, act: 'run:RUN_FAKE_02' })); n.push(T('RUN_FAKE_02', [70, 660, 700, 720]));
      n.push(T('Prediction variant', [40, 800, 700, 850]));
      n.push(N({ cls: 'android.view.ViewGroup', b: [40, 880, 1040, 1020], clk: true, act: 'variant:RAW' })); n.push(T('RAW', [70, 890, 400, 940])); n.push(T('RAW - the network output, before post-processing', [70, 950, 1000, 1000]));
      n.push(N({ cls: 'android.view.ViewGroup', b: [40, 1040, 1040, 1180], clk: true, act: 'variant:PROCESSED' })); n.push(T('PROCESSED', [70, 1050, 500, 1100])); n.push(T('PROCESSED - after the frozen post-processing step', [70, 1110, 1000, 1160]));
      return n;
    }
    return n.concat(explorerNodes(s, top));
  }
  if (top.id === 'scr04') {
    n.push(T(top.case, [40, 270, 400, 330]));
    n.push(T(`Prediction RAW vs ground truth · run ${top.run}`, [40, 340, 1040, 390]));
    n.push(T(label(top.slice), [200, 1600, 880, 1670]));
    const f = flow(s, 'scr04', [0, 1700, W, 2140], [
      { h: 300, nodes: (y) => [T(`Legend - this slice (z ${top.slice})`, [60, y + 10, 900, y + 60]), N({ d: 'True positive, shown', cls: 'android.view.ViewGroup', b: [60, y + 80, 1000, y + 170], clk: true, act: 'noop' })] },
      { h: 340, nodes: (y) => [
        T('Worst slices (server, DR-010a)', [60, y + 10, 900, y + 60]),
        N({ cls: 'android.view.ViewGroup', b: [60, y + 80, 1020, y + 180], clk: true, act: 'worst', d: 'Jump to z 30 (slice 31) · Dice 0.456 · FP 120 · FN 90' }),
        T('Jump to worst · z 30 (slice 31) · Dice 0.456 · FP 120 · FN 90', [90, y + 100, 1000, y + 150]),
      ] },
      { h: 200, nodes: (y) => [T('Error profile across the volume', [60, y + 10, 900, y + 60])] },
      { h: 150, nodes: (y) => [N({ cls: 'android.view.ViewGroup', b: [60, y, 1020, y + 120], clk: true, act: 'sc05err' }), T('3D error view (SCR-05)', [90, y + 30, 900, y + 80])] },
    ]);
    return n.concat(f.nodes);
  }
  if (top.id === 'scr05') {
    const loaded = Date.now() - top.t0 > Number(process.env.FAKE_MESH_MS || 1500);
    n.push(T(top.case, [40, 270, 400, 330]));
    n.push(N({ d: '3D surface of the segmentation', cls: 'android.webkit.WebView', b: [60, 420, 1020, 1200], act: 'web' }));
    n.push(T('Prediction (RAW)', [100, 1250, 600, 1300])); n.push(T(loaded ? '412,336 triangles' : 'loading…', [100, 1300, 600, 1350]));
    n.push(T('Ground truth', [100, 1380, 600, 1430])); n.push(T(loaded ? '398,120 triangles' : 'loading…', [100, 1430, 600, 1480]));
    n.push(T('Selected region (tap the surface)', [60, 1550, 900, 1600]));
    n.push(T(top.picked != null ? `${label(top.picked)} · picked on prediction` : (top.note || 'Nothing selected. Tap the surface to resolve the slice that produced that face.'), [60, 1610, 1020, 1680]));
    n.push(N({ cls: 'android.view.ViewGroup', b: [60, 1750, 560, 1870], clk: top.picked != null, en: top.picked != null, act: top.picked != null ? 'open2d' : 'noop' }));
    n.push(T('Open in 2D (SCR-03)', [90, 1780, 540, 1840]));
    n.push(N({ cls: 'android.view.ViewGroup', b: [600, 1750, 1000, 1870], clk: true, act: 'noop' })); n.push(T('Fit camera', [620, 1780, 980, 1840]));
    return n;
  }
  if (top.id === 'scr06') {
    n.push(T('RAW · MASK_FAKE', [40, 270, 900, 320]));
    n.push(T('Review: NOT_REVIEWED · rev 1', [40, 330, 700, 380]));
    n.push(T('slice 44 / 88', [700, 330, 1040, 380]));
    n.push(T('SOURCE — no edits', [60, 420, 600, 470]));
    let x = 40;
    for (const lbl of ['Brush', 'Pan', 'Add', 'Erase']) { n.push(N({ t: lbl, cls: 'android.widget.Button', b: [x, 1500, x + 220, 1600], clk: true, act: `write:${lbl}` })); x += 240; }
    x = 40;
    for (const lbl of ['Accept', 'Flag', 'Mark corrected']) { n.push(N({ t: lbl, cls: 'android.widget.Button', b: [x, 1700, x + 320, 1800], clk: true, act: `write:${lbl}` })); x += 340; }
    x = 40;
    for (const lbl of ['Cancel edits', 'Save', 'New finding here']) { n.push(N({ t: lbl, cls: 'android.widget.Button', b: [x, 1900, x + 320, 2000], clk: true, act: `write:${lbl}` })); x += 340; }
    return n;
  }
  if (top.id === 'findings') {
    n.push(T('No findings yet. Create one from a case slice — in Review / Correction, tap "New finding here".', [40, 300, 1040, 400]));
    return n;
  }
  return n;
}

function dialogNodes(s) {
  const n = [];
  if (s.dialog === 'menu') {
    n.push(T('Scripted slice navigation', [150, 800, 930, 860], { res: 'android:id/alertTitle' }));
    n.push(T('L4: 15 new slices, then the same 15 revisited. A9: Spike A\'s 30-step TC-PERF-001 sequence, warm then measured.', [150, 870, 930, 1050]));
    n.push(N({ t: 'CANCEL', cls: 'android.widget.Button', b: [200, 1100, 500, 1180], clk: true, act: 'dlg:cancel' }));
    n.push(N({ t: 'A9 30-STEP', cls: 'android.widget.Button', b: [200, 1200, 880, 1280], clk: true, act: 'dlg:a9' }));
    n.push(N({ t: 'L4 15 + 15', cls: 'android.widget.Button', b: [200, 1300, 880, 1380], clk: true, act: 'dlg:l4' }));
  } else if (s.dialog === 'finished') {
    n.push(T('A9 finished', [150, 800, 930, 860], { res: 'android:id/alertTitle' }));
    n.push(T('The steps were logged to logcat. Nothing is computed on the phone.', [150, 870, 930, 1000]));
    n.push(N({ t: 'OK', cls: 'android.widget.Button', b: [700, 1100, 900, 1180], clk: true, act: 'dlg:ok' }));
  }
  return n;
}

function currentNodes(s) {
  if (!s.app) return [N({ cls: 'android.widget.FrameLayout', b: [0, 0, W, H], pkg: 'com.sec.android.app.launcher' }), T('Home', [100, 100, 400, 200], { pkg: 'com.sec.android.app.launcher' })];
  let nodes = screenNodes(s);
  if (s.a9Running) {
    const top = s.stack[s.stack.length - 1];
    if (top.id === 'explorer') nodes.push(T('Scripted run in progress (A9 warm) - controls are locked.', [60, 1960, 1000, 2010]));
  }
  const dlg = dialogNodes(s);
  if (dlg.length) nodes = nodes.map((x) => ({ ...x, under: true })).concat(dlg);
  return nodes;
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[^\x20-\x7e]/g, (c) => `&#${c.codePointAt(0)};`);
function toXml(nodes) {
  const body = nodes.map((x, i) => `<node index="${i}" text="${esc(x.t)}" resource-id="${esc(x.res || '')}" class="${x.cls}" package="${x.pkg}" content-desc="${esc(x.d)}" checkable="false" checked="false" clickable="${x.clk}" enabled="${x.en}" focusable="${x.clk}" focused="false" scrollable="${x.scr}" long-clickable="false" password="false" selected="false" bounds="[${x.b[0]},${x.b[1]}][${x.b[2]},${x.b[3]}]" />`).join('');
  return `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">${body}</hierarchy>`;
}

// ---------------------------------------------------------------------------------------------------- behaviour
function openGesture(s, z) {
  const top = s.stack[s.stack.length - 1];
  top.loading = true;
  top.slice = z;
  // the app shows the slice ~400 ms later; written by a detached emitter so this process can exit
  spawn(process.execPath, [fileURLToPath(import.meta.url), '--open', String(z), top.case], { detached: true, stdio: 'ignore', env: process.env, windowsHide: true }).unref();
  top.loading = false;
}

function hit(nodes, x, y) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const nd = nodes[i];
    if (nd.under) continue;
    if (x >= nd.b[0] && x <= nd.b[2] && y >= nd.b[1] && y <= nd.b[3] && nd.act && nd.act !== 'noop' && nd.en) return nd;
  }
  return null;
}

function pushExplorer(s, caseId, slice, from) {
  s.scroll = {};
  const hasRun = from ? from.hasRun : (caseId === 'CASE_0042' && TOUR_RUN);
  const e = { id: 'explorer', case: caseId, hasRun, run: from ? from.run : 'RUN_FAKE_01', slice, gt: false, pred: true, stage: hasRun && !from ? 'chooser' : 'open', loading: false };
  s.stack.push(e);
  if (e.stage === 'open') openGesture(s, slice);
}

function tap(s, x, y) {
  const nodes = currentNodes(s);
  const nd = hit(nodes, x, y);
  if (s.a9Running && !s.dialog) { violation(`tap (${x},${y}) while a scripted pass is running`); return; }
  if (!nd) return;
  const top = s.stack[s.stack.length - 1];
  const a = nd.act;
  if (a.startsWith('write:')) { violation(`tap on a WRITE button: ${a.slice(6)}`); return; }
  if (a.startsWith('tab:')) { s.scroll = {}; const m = { Study: 'study', Cases: 'cases', Experiments: 'experiments', Findings: 'findings' }; s.stack = [{ id: m[a.slice(4)] }]; s.input = ''; return; }
  if (a === 'back') { s.scroll = {}; if (s.stack.length > 1) s.stack.pop(); return; }
  if (a === 'search') { top.focus = true; return; }
  if (a.startsWith('case:')) { s.input = ''; pushExplorer(s, a.slice(5), 44); return; }
  if (a.startsWith('run:')) { top.run = a.slice(4); return; }
  if (a.startsWith('variant:')) { top.stage = 'open'; openGesture(s, 44); return; }
  if (a === 'gt') { top.gt = !top.gt; return; }
  if (a === 'pred') { top.pred = !top.pred; return; }
  if (a === 'sc04') { s.scroll = {}; s.stack.push({ id: 'scr04', case: top.case, run: top.run, slice: top.slice }); return; }
  if (a === 'worst') { top.slice = 30; return; }
  if (a === 'sc05' || a === 'sc05err') { s.scroll = {}; s.stack.push({ id: 'scr05', case: top.case, run: top.run, slice: top.slice, t0: Date.now(), picked: null, note: null, hasRun: true }); return; }
  if (a === 'web') {
    const loaded = Date.now() - top.t0 > Number(process.env.FAKE_MESH_MS || 1500);
    const cx = 540; const cy = 810;
    const inside = loaded && (((x - cx) / 330) ** 2 + ((y - cy) / 260) ** 2) < 1;
    if (inside) { top.picked = 30; top.note = null; } else { top.picked = null; top.note = 'No surface at that point: nothing selected. Tap the surface to pick a slice.'; }
    return;
  }
  if (a === 'open2d') { pushExplorer(s, top.case, top.picked, top); return; }
  if (a === 'sc06') { s.stack.push({ id: 'scr06' }); fs.appendFileSync(F('backend_writes.txt'), `${new Date().toISOString()} review_create (SCR-06 opened)\n`); return; }
  if (a === 'dlg:cancel') { s.dialog = null; return; }
  if (a === 'dlg:ok') { s.dialog = null; return; }
  if (a === 'dlg:a9' || a === 'dlg:l4') {
    s.dialog = null;
    if (a === 'dlg:l4') return;
    s.a9Running = true; s.a9Started = Date.now();
    try { fs.unlinkSync(F('a9_done.flag')); } catch (_e) { /* none */ }
    spawn(process.execPath, [fileURLToPath(import.meta.url), '--a9', A9MODE], { detached: true, stdio: 'ignore', env: process.env, windowsHide: true }).unref();
  }
}

function longPress(s, x, y) {
  if (s.a9Running && !s.dialog) { violation(`long-press (${x},${y}) while a scripted pass is running`); return; }
  const nodes = currentNodes(s);
  const nd = hit(nodes, x, y);
  if (nd && nd.act === 'label') s.dialog = 'menu';
}

function swipe(s, x1, y1, x2, y2) {
  if (s.a9Running && !s.dialog) { violation(`swipe while a scripted pass is running`); return; }
  const nodes = currentNodes(s);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const nd = nodes[i];
    if (nd.scr && x1 >= nd.b[0] && x1 <= nd.b[2] && y1 >= nd.b[1] && y1 <= nd.b[3] && nd.act && nd.act.startsWith('scroll:')) {
      const key = nd.act.slice(7);
      s.scroll[key] = Math.max(0, (s.scroll[key] || 0) + (y1 - y2));
      return;
    }
  }
}

// ---------------------------------------------------------------------------------------------------- A9 emitter
const NAV16 = [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1, 0, 8, 0, 15, 4, 11, 2, 13, 6, 7, 8, 9, 10, 11, 12];
function navSequence(nz) {
  const scale = (nz - 1) / 15; const out = []; let prev = 0; let pos = 0;
  for (const t of NAV16) { const d16 = t - prev; const d = Math.abs(d16) === 1 ? d16 : Math.round(d16 * scale); pos = Math.max(0, Math.min(nz - 1, pos + d)); out.push(pos); prev = t; }
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function emitOpen(z, caseId) {
  await sleep(350);
  const reqs = '[{"endpoint":"case_get","bytes":362,"ms":89,"status":200},{"endpoint":"ground_truth_slice_get","bytes":517,"ms":156,"status":200},{"endpoint":"mri_slice_get","bytes":567,"ms":173,"status":200},{"endpoint":"artifact:mri","bytes":155347,"ms":202,"status":200}]';
  let seqNo = 1;
  try { seqNo = Number(fs.readFileSync(F('seq.txt'), 'utf8')) + 1; } catch (_e) { /* the first one */ }
  fs.writeFileSync(F('seq.txt'), String(seqNo));
  logLine(`CMW_GESTURE {"seq":${seqNo},"kind":"open","case":"${caseId}","from":null,"to":${z},"requests":${reqs},"cache_hit":false,"bytes_total":156793,"max_request_bytes":155347,"ms":557,"outcome":"shown"}`);
}

async function emitA9(mode) {
  const nz = 88; const seq = navSequence(nz); const steps = [0, ...seq];
  const seen = new Set([44]); let requests = 4; let bytes = 156793; let gseq = 2;
  const req = '[{"endpoint":"ground_truth_slice_get","bytes":517,"ms":120,"status":200},{"endpoint":"mri_slice_get","bytes":567,"ms":130,"status":200},{"endpoint":"artifact:mask","bytes":745,"ms":90,"status":200},{"endpoint":"artifact:mri","bytes":155389,"ms":140,"status":200}]';
  requests += 1; bytes += 745;
  for (const pass of ['warm', 'measured']) {
    logLine(`CMW_RUN_START ${JSON.stringify({ run: 'A9', pass, steps: steps.length, sequence: seq, nz, case_id: 'CASE_0061', run_id: null, variant: null, has_run: false, gt_declared: true, gt_overlay: true, prediction_overlay: false, dev: false, mode: 'live' })}`);
    let i = 0; let from = 44;
    for (const z of steps) {
      if (mode === 'hang' && pass === 'warm' && i === 3) return;   // never ends
      const cached = seen.has(z) || pass === 'measured';
      seen.add(z);
      if (!cached) { requests += 4; bytes += 157218; }
      logLine(`CMW_GESTURE ${JSON.stringify({ seq: gseq++, kind: 'slice', case: 'CASE_0061', from, to: z, requests: cached ? [] : JSON.parse(req), cache_hit: cached, bytes_total: cached ? 0 : 157218, max_request_bytes: cached ? 0 : 155389, ms: 80, outcome: 'shown' })}`);
      let frame = cached ? 30 + ((i * 7 + 3) % 40) : 420 + ((i * 13) % 90);
      if (mode === 'slow' && pass === 'measured' && [3, 9, 14, 20, 25, 28].includes(i)) frame = 250 + i;
      logLine(`CMW_SLICE ${JSON.stringify({ slice: z, ms_to_data: frame - 20, ms_to_image: frame - 4, ms_to_frame: frame + 0.5, meta_cached: cached, image_seen_before: cached, how: 'image', pass: `A9:${pass}`, dev: false, mode: 'live' })}`);
      from = z; i++;
      await sleep(SPEED);
    }
    logLine(`CMW_RUN_END ${JSON.stringify({ run: 'A9', pass, steps: steps.length })}`);
    logLine(`CMW_NET_TOTALS ${JSON.stringify({ run: 'A9', pass, gestures: gseq - 1, requests, bytes, unattributed: 1, late: 0 })}`);
    await sleep(SPEED);
  }
  await sleep(300);
  fs.writeFileSync(F('a9_done.flag'), '1');
}

// ---------------------------------------------------------------------------------------------------- adb surface
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const out = (t) => process.stdout.write(t.endsWith('\n') ? t : `${t}\n`);

function meminfo(s) {
  const done = fs.existsSync(F('a9_done.flag'));
  const pss = done ? 240000 : 180000; const gfx = done ? 120000 : 80000;
  return `Applications Memory Usage (in Kilobytes):\nUptime: 5126345 Realtime: 5126345\n\n** MEMINFO in pid 12345 [${PKG}] **\n                   Pss  Private  Private  SwapPss      Rss     Heap     Heap     Heap\n                 Total    Dirty    Clean    Dirty    Total     Size    Alloc     Free\n                ------   ------   ------   ------   ------   ------   ------   ------\n  Native Heap    40000    39000        0        0    50000    90000    60000    30000\n        TOTAL   ${pss}   150000    30000        0   300000   150000    90000    60000\n\n App Summary\n                       Pss(KB)                        Rss(KB)\n                        ------                         ------\n           Java Heap:    30000                          40000\n         Native Heap:    40000                          50000\n            Graphics:    ${gfx}                          80000\n\n           TOTAL PSS:   ${pss}            TOTAL RSS:   300000       TOTAL SWAP PSS:        0\n`;
}

function shell(s, a) {
  const [cmd, ...r] = a;
  const during = s.a9Running && !s.dialog;
  switch (cmd) {
    case 'getprop':
      return out(`[ro.product.model]: [SM-A176B]\n[ro.product.brand]: [samsung]\n[ro.product.device]: [a17x]\n[ro.build.version.release]: [16]\n[ro.build.version.sdk]: [36]\n[ro.product.cpu.abi]: [arm64-v8a]\n[ro.build.version.security_patch]: [2026-09-01]\n[ro.serialno]: [${SERIAL}]\n[dhcp.wlan0.ipaddress]: [${[192, 168, 1, 55].join('.')}]`); // joined at run time: no dotted quad in the committed file (DR-019 CI scan)
    case 'wm': return out('Physical size: 1080x2340');
    case 'date': return out('2026-10-18T10:15:30+0700');
    case 'settings':
      if (r[0] === 'get') {
        const k = r[2];
        if (k === 'stay_on_while_plugged_in') return out(s.settings.stay_on_while_plugged_in);
        if (k === 'window_animation_scale' || k === 'transition_animation_scale' || k === 'animator_duration_scale') return out('1.0');
        if (k === 'low_power') return out('0');
        if (k === 'screen_off_timeout') return out('60000');
        if (k === 'refresh_rate_mode') return out('1');
        return out('null');
      }
      if (r[0] === 'put' && r[2] === 'stay_on_while_plugged_in') { s.settings.stay_on_while_plugged_in = r[3]; save(s); fs.appendFileSync(F('settings.txt'), `stay_on=${r[3]}\n`); }
      return undefined;
    case 'dumpsys': {
      const w = r[0];
      if (w === 'battery') return out('Current Battery Service state:\n  AC powered: false\n  USB powered: true\n  status: 2\n  level: 88\n  temperature: 305\n');
      if (w === 'power') return out('  mWakefulness=Awake\n');
      if (w === 'window') return out('  mDreamingLockscreen=false\n  isKeyguardShowing=false\n');
      if (w === 'input_method') return out(`  mInputShown=${s.stack.length && s.stack[s.stack.length - 1].focus ? 'true' : 'false'}\n`);
      if (w === 'package') return out(s.installed ? `Packages:\n  Package [${PKG}] (abc):\n    versionCode=1 minSdk=24 targetSdk=36\n    versionName=0.1.0\n` : `Unable to find package: ${PKG}\n`);
      if (w === 'meminfo') {
        if (during) violation('dumpsys meminfo while a scripted pass is running');
        return s.app ? out(meminfo(s)) : out(`No process found for: ${PKG}\n`);
      }
      return undefined;
    }
    case 'am': if (r[0] === 'force-stop') { s.app = false; s.stack = []; s.dialog = null; s.a9Running = false; s.scroll = {}; } return undefined;
    case 'monkey':
      s.app = true; s.stack = [{ id: 'study' }]; s.scroll = {}; s.dialog = null;
      logLine('Running "main"');
      return out('Events injected: 1\n## Network stats: elapsed time=12ms (0ms mobile, 0ms wifi, 12ms not connected)');
    case 'uiautomator': {
      if (during) violation('uiautomator dump while a scripted pass is running');
      s.dumps += 1;
      const every = Number(process.env.FAKE_DUMP_FAIL || 0);
      if (every > 0 && s.dumps % every === 0) return out('ERROR: could not get idle state.');
      fs.writeFileSync(F('cmw_ui.xml'), toXml(currentNodes(s)));
      return out('UI hierchary dumped to: /sdcard/cmw_ui.xml');
    }
    case 'input': {
      if (during) violation(`input ${r.join(' ')} while a scripted pass is running`);
      if (r[0] === 'tap') tap(s, Number(r[1]), Number(r[2]));
      else if (r[0] === 'swipe') {
        const [x1, y1, x2, y2, ms] = r.slice(1).map(Number);
        if (x1 === x2 && y1 === y2 && ms >= 800) longPress(s, x1, y1); else swipe(s, x1, y1, x2, y2);
      } else if (r[0] === 'text') { s.input = r[1]; }
      else if (r[0] === 'keyevent' && (r[1] === 'KEYCODE_BACK' || r[1] === '4')) { if (s.stack.length && s.stack[s.stack.length - 1].focus) s.stack[s.stack.length - 1].focus = false; }
      return undefined;
    }
    case 'pm': return out(s.installed ? `package:${PKG}` : '');
    case 'rm': return undefined;
    case 'screencap': return undefined;
    case 'screenrecord': {
      const lim = Number(r[r.indexOf('--time-limit') + 1] || 5);
      const t = Math.min(lim, Number(process.env.FAKE_RECORD_SEC || 4));
      return new Promise((res) => setTimeout(() => { fs.writeFileSync(F('cmw_hero.mp4'), 'fake video'); res(); }, t * 1000));
    }
    default: return undefined;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--a9') { await emitA9(argv[1]); return; }
  if (argv[0] === '--open') { await emitOpen(Number(argv[1]), argv[2]); return; }
  let a = argv;
  if (a[0] === '-s') {
    if (a[1] !== SERIAL) { console.error(`error: device '${a[1]}' not found`); process.exit(1); }
    a = a.slice(2);
  }
  let s = load();
  const cmd = a[0];
  if (fs.existsSync(F('adb_calls.txt')) === false) fs.writeFileSync(F('adb_calls.txt'), '');
  fs.appendFileSync(F('adb_calls.txt'), `${a.join(' ')}\n`);
  switch (cmd) {
    case 'start-server': break;
    case 'version': out('Android Debug Bridge version 1.0.41 (fake)'); break;
    case 'get-state': out('device'); break;
    case 'devices':
      out('List of devices attached');
      if (process.env.FAKE_UNAUTH === '1') out(`${SERIAL}\tunauthorized usb:1-1 transport_id:1`);
      else if (process.env.FAKE_NO_DEVICE !== '1') out(`${SERIAL}            device usb:1-1 product:a17xnsxx model:SM_A176B device:a17x transport_id:1`);
      out('');
      break;
    case 'install': {
      const apk = a[a.length - 1];
      if (!fs.existsSync(apk)) { out('adb: failed to stat ' + apk); process.exit(1); }
      if (process.env.FAKE_INSTALL_FAIL === 'incompatible' && s.installed) { out('Performing Streamed Install\nadb: failed to install ' + apk + ': Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package signatures do not match]'); break; }
      s.installed = true; out('Performing Streamed Install\nSuccess'); break;
    }
    case 'uninstall': s.installed = false; out('Success'); break;
    case 'pull': { const src = path.basename(a[1]); fs.copyFileSync(F(src), a[2]); out(`1 file pulled`); break; }
    case 'logcat': {
      if (a.includes('-c')) { fs.writeFileSync(F('logcat.txt'), ''); break; }
      if (a.includes('-b') && a.includes('crash')) break;
      if (!fs.existsSync(F('logcat.txt'))) fs.writeFileSync(F('logcat.txt'), '');
      if (a.includes('-d')) { process.stdout.write('--------- beginning of main\n' + fs.readFileSync(F('logcat.txt'), 'utf8')); break; }
      // streaming: tail until killed
      process.stdout.write('--------- beginning of main\n');
      let pos = 0;
      const tick = () => {
        const b = fs.readFileSync(F('logcat.txt'));
        if (b.length < pos) pos = 0;
        if (b.length > pos) { process.stdout.write(b.subarray(pos)); pos = b.length; }
      };
      tick();
      setInterval(tick, 50);
      // when whatever started us is killed (the script stops the capture), stop too: no orphan tail
      const parent = process.ppid;
      setInterval(() => { try { process.kill(parent, 0); } catch (_e) { process.exit(0); } }, 400);
      return { keep: true };   // keep the process alive; state not saved
    }
    case 'exec-out':
      if (a[1] === 'screencap') {
        if (s.a9Running && !s.dialog) violation('screencap while a scripted pass is running');
        process.stdout.write(PNG);
      } else if (a[1] === 'cat') {
        const f = path.basename(a[2]);
        process.stdout.write(fs.existsSync(F(f)) ? fs.readFileSync(F(f)) : '');
      }
      break;
    case 'shell': {
      const res = shell(s, a.slice(1));
      if (res && typeof res.then === 'function') await res;
      break;
    }
    default: break;
  }
  // reload before saving: a detached emitter may have set the done flag meanwhile (it only writes files, not state)
  save(s);
}

main().then((r) => { if (!(r && r.keep)) process.exit(0); });
