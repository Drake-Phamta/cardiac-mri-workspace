// node --test mobile/test/  - SCR-08 list upgrades (src/screens/v4-review/findings.mjs): newest first, filter chips,
// the PDF report and its export. Fixture runtime over the GENERATED bundle; the list answer is rewritten to hold
// three findings, oldest first, as the backend serves them (contract 1.2.0).
import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE } from '../src/api/states.mjs';
import { resolveConfig } from '../src/config.mjs';
import { createRuntime } from '../src/api/runtime.mjs';
import {
  ALL, countFindings, createFindingsScreen, escapeHtml, filterFindings, filterLabel, findingsReportHtml,
} from '../src/screens/v4-review/findings.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';
import { loadList, patchedClient } from './_v4_drive.mjs';

const contractJson = readContractJson();
const ROW = generatedBundleJson().scenarios.findings_list.default.response.data.items[0];
const ROWS = [
  { ...ROW, finding_id: 'F_1', status: 'OPEN', finding_type: 'UNDER_SEGMENTATION', note: 'first' },
  { ...ROW, finding_id: 'F_2', status: 'RESOLVED', finding_type: 'OVER_SEGMENTATION', note: 'second <b>&</b>' },
  { ...ROW, finding_id: 'F_3', status: 'OPEN', finding_type: 'OVER_SEGMENTATION', note: 'third' },
];

function screen({ printer = null } = {}) {
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: generatedBundleJson() });
  const client = patchedClient(runtime.client, {
    findings_list: (v) => (v.state === STATE.SUCCESS ? { ...v, data: { ...v.data, items: ROWS } } : v),
  });
  const ctl = createFindingsScreen({ runtime: { ...runtime, client }, params: {}, printer });
  return { ctl, client };
}

const ids = (entries) => entries.map((e) => e.finding.findingId);

test('FL1 the list is newest first: the reverse of the server\'s creation order', async () => {
  const { ctl, client } = screen();
  const s = await loadList(ctl, client);
  assert.deepEqual(ids(s.items), ['F_3', 'F_2', 'F_1']);
  assert.deepEqual(ids(s.shown), ['F_3', 'F_2', 'F_1'], 'no filter: everything is shown');
});

test('FL2 status and type chips narrow the list together; counts are over the whole list', async () => {
  const { ctl, client } = screen();
  let s = await loadList(ctl, client);
  assert.deepEqual(s.counts, { all: 3, status: { OPEN: 2, RESOLVED: 1 },
    type: { UNDER_SEGMENTATION: 1, OVER_SEGMENTATION: 2, BOUNDARY_DISAGREEMENT: 0, DISCONNECTED_ARTIFACT: 0, OTHER: 0 } });
  ctl.setFilter({ status: 'OPEN' });
  assert.deepEqual(ids(ctl.getState().shown), ['F_3', 'F_1']);
  ctl.setFilter({ type: 'OVER_SEGMENTATION' });
  s = ctl.getState();
  assert.deepEqual(ids(s.shown), ['F_3'], 'both filters apply');
  assert.equal(s.counts.all, 3, 'the counts do not change with the filter');
  ctl.setFilter({ status: 'CLOSED' });
  ctl.setFilter({ type: 'NOT_A_TYPE' });
  assert.deepEqual({ ...ctl.getState().filter }, { status: 'OPEN', type: 'OVER_SEGMENTATION' }, 'an unknown value is ignored');
  ctl.setFilter({ status: ALL, type: ALL });
  assert.equal(ctl.getState().shown.length, 3);
  assert.deepEqual(ids(filterFindings(s.items, { status: 'RESOLVED', type: 'UNDER_SEGMENTATION' })), []);
  assert.deepEqual(countFindings([]), { all: 0, status: { OPEN: 0, RESOLVED: 0 },
    type: { UNDER_SEGMENTATION: 0, OVER_SEGMENTATION: 0, BOUNDARY_DISAGREEMENT: 0, DISCONNECTED_ARTIFACT: 0, OTHER: 0 } });
});

test('FL3 the report lists the findings shown, escapes every note, and says it is research use with no image', async () => {
  const { ctl, client } = screen();
  const s = await loadList(ctl, client);
  const html = findingsReportHtml({ entries: s.items, studyId: 'STUDY_DEMO', filter: { status: ALL, type: ALL }, generatedAt: '2026-11-15 09:00 UTC' });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Study STUDY_DEMO · every status, every type · 3 finding\(s\) · made 2026-11-15 09:00 UTC/);
  assert.match(html, /Research use only, not for diagnosis\. Case IDs are pseudonymous; this report holds no image/);
  assert.ok(html.includes('second &lt;b&gt;&amp;&lt;/b&gt;') && !html.includes('<b>&</b>'), 'a note never becomes markup');
  assert.ok(html.indexOf('third') < html.indexOf('first'), 'newest first, as on screen');
  assert.equal((html.match(/<tr><td>/g) || []).length, 3);
  assert.ok(!/<img|data:image/.test(html), 'no image in the report');
  const none = findingsReportHtml({ entries: [], studyId: 'S', filter: { status: 'RESOLVED', type: 'OTHER' }, generatedAt: 't' });
  assert.match(none, /Resolved, Other · 0 finding\(s\)/);
  assert.match(none, /No finding matches these filters\./);
  assert.equal(escapeHtml('<a href="x">\'&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(filterLabel({ status: 'OPEN', type: ALL }), 'Open, every type');
});

test('FL4 Export PDF prints the findings shown; without expo-print in the build it says so and prints nothing', async () => {
  const off = screen();
  await loadList(off.ctl, off.client);
  assert.equal(off.ctl.getState().pdfAvailable, false);
  let s = await off.ctl.exportPdf();
  assert.equal(s.notice.kind, 'refused');
  assert.match(s.notice.text, /not in this app build yet/);

  const printed = [];
  const printer = { available: true, print: async (html) => { printed.push(html); return { ok: true }; } };
  const on = screen({ printer });
  await loadList(on.ctl, on.client);
  on.ctl.setFilter({ status: 'OPEN' });
  s = await on.ctl.exportPdf('2026-11-15T09:30:00Z');
  assert.equal(printed.length, 1);
  assert.match(printed[0], /Open, every type · 2 finding\(s\) · made 2026-11-15 09:30 UTC/);
  assert.ok(!printed[0].includes('second'), 'only what the filters show');
  assert.equal(s.notice.kind, 'exported');
  assert.match(s.notice.text, /^2 finding\(s\) sent to the print dialog: choose "Save as PDF"/);
  assert.equal(s.busy, null);

  const failing = screen({ printer: { available: true, print: async () => ({ ok: false, message: 'Printing did not complete' }) } });
  await loadList(failing.ctl, failing.client);
  s = await failing.ctl.exportPdf();
  assert.equal(s.notice.kind, 'refused');
  assert.equal(s.notice.text, 'PDF export did not finish: Printing did not complete.');
});
