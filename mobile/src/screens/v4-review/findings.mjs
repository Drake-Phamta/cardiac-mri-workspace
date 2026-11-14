// Findings for SCR-08: the model and the screen logic. A finding is an observation anchored to evidence
// (case, slice, optional run and region); opening it goes to the strongest evidence it holds. A finding
// only references evidence and never writes an MRI, prediction or metric. Plain JS that Node tests import.

import { PREDICTION_VARIANT } from '../../lib/caseMode.mjs';
import { STATE, loading, fatalInvalid } from '../../api/states.mjs';
import { checkNote } from './notes.mjs';
import { formatUtc } from './history.mjs';

export const FINDING_TYPE = Object.freeze({
  UNDER_SEGMENTATION: 'UNDER_SEGMENTATION',
  OVER_SEGMENTATION: 'OVER_SEGMENTATION',
  BOUNDARY_DISAGREEMENT: 'BOUNDARY_DISAGREEMENT',
  DISCONNECTED_ARTIFACT: 'DISCONNECTED_ARTIFACT',
  OTHER: 'OTHER',
});

// Mirrors finding_status in the API contract; a test keeps them equal.
export const FINDING_STATUS = Object.freeze({ OPEN: 'OPEN', RESOLVED: 'RESOLVED' });

// An optional region in source pixels of the anchored slice (x = column, y = row), so it means the same
// at any zoom. The contract leaves region_reference free-form; this POINT / BOX shape is ours.
export const REGION_KIND = Object.freeze({ POINT: 'POINT', BOX: 'BOX' });

// Where opening a finding goes.
export const EVIDENCE_SCREEN = Object.freeze({
  CASE_EXPLORER: 'SCR-03',
  EXPERIMENT_COMPARISON: 'SCR-07',
});

const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
const isIndex = (v) => Number.isInteger(v) && v >= 0;
const isId = (v) => typeof v === 'string' && v.length > 0;
const isOptionalId = (v) => v === null || v === undefined || isId(v);

function regionProblems(region, shape) {
  if (region === null || region === undefined) return [];
  if (typeof region !== 'object') return ['region must be an object or null'];
  const nx = Array.isArray(shape) ? shape[0] : undefined;
  const ny = Array.isArray(shape) ? shape[1] : undefined;
  const inX = (x) => isIndex(x) && (nx === undefined || x < nx);
  const inY = (y) => isIndex(y) && (ny === undefined || y < ny);
  if (region.kind === REGION_KIND.POINT) {
    return inX(region.x) && inY(region.y) ? [] : [`region POINT (${region.x}, ${region.y}) is not a source pixel`];
  }
  if (region.kind === REGION_KIND.BOX) {
    const { x0, y0, x1, y1 } = region;
    if (!(inX(x0) && inX(x1) && inY(y0) && inY(y1))) return [`region BOX (${x0}, ${y0})-(${x1}, ${y1}) is not inside the slice`];
    return x0 <= x1 && y0 <= y1 ? [] : ['region BOX corners are not ordered (x0 <= x1, y0 <= y1)'];
  }
  return [`region kind ${region.kind} is not POINT or BOX`];
}

// Build a frozen finding from loose fields and list what is wrong with it.
// `requireAnchor` is true when the user creates a finding: it needs a full case/slice context and a type.
// It is false for a record read back from the API, where case and slice may be null; such a record is
// still shown, it just cannot be opened at a slice. A value that is present must always be valid.
// `shape` ([nx, ny, nz], from case_get) bounds the slice and the region when it is known.
export function normalizeFinding(input = {}, { requireAnchor = true, shape = null } = {}) {
  const problems = [];
  const f = {
    findingId: input.findingId ?? null,
    studyId: input.studyId ?? null,
    experimentId: input.experimentId ?? null,
    runId: input.runId ?? null,
    variant: input.variant ?? null,
    caseId: input.caseId ?? null,
    sliceIndex: input.sliceIndex ?? null,
    region: input.region ?? null,
    type: input.type ?? null,
    status: input.status ?? (requireAnchor ? FINDING_STATUS.OPEN : null),
    note: input.note ?? '',
    evidence: input.evidence ?? null,
    // Every finding row carries a revision (a new one is 1); finding_patch sends it as expected_revision.
    revision: input.revision ?? null,
  };
  if (!(f.revision === null || (Number.isInteger(f.revision) && f.revision >= 1))) {
    problems.push(`revision ${f.revision} is not a positive integer`);
  }

  for (const key of ['findingId', 'studyId', 'experimentId', 'runId']) {
    if (!isOptionalId(f[key])) problems.push(`${key} must be a non-empty string or null`);
  }

  if (f.variant !== null && !own(PREDICTION_VARIANT, f.variant)) {
    problems.push(`variant ${f.variant} is not RAW or PROCESSED`);
  } else if (requireAnchor && f.runId !== null && f.variant === null) {
    problems.push('variant is required with a run: which prediction was seen (RAW or PROCESSED)?');
  } else if (requireAnchor && f.runId === null && f.variant !== null) {
    problems.push('variant is only recorded together with a run');
  }

  if (f.caseId === null) {
    if (requireAnchor) problems.push('caseId is required: a finding is created from a case/slice context');
  } else if (!isId(f.caseId)) problems.push('caseId must be a non-empty string');

  const nz = Array.isArray(shape) ? shape[2] : undefined;
  if (f.sliceIndex === null) {
    if (requireAnchor) problems.push('sliceIndex is required: a finding is created from a case/slice context');
  } else if (!isIndex(f.sliceIndex) || (nz !== undefined && f.sliceIndex >= nz)) {
    problems.push(`sliceIndex ${f.sliceIndex} is not a slice of this case${nz !== undefined ? ` (0..${nz - 1})` : ''}`);
  }

  problems.push(...regionProblems(f.region, shape));

  if (f.type === null) {
    if (requireAnchor) problems.push('type is required');
  } else if (!own(FINDING_TYPE, f.type)) {
    problems.push(`type ${f.type} is not one of ${Object.keys(FINDING_TYPE).join('/')}`);
  }

  if (f.status === null) problems.push('status is missing');
  else if (!own(FINDING_STATUS, f.status)) {
    problems.push(`status ${f.status} is not one of ${Object.keys(FINDING_STATUS).join('/')}`);
  }

  if (typeof f.note !== 'string') problems.push('note must be text');

  if (f.region) f.region = Object.freeze({ ...f.region });
  return Object.freeze({ ok: problems.length === 0, finding: Object.freeze(f), problems: Object.freeze(problems) });
}

// Where opening this finding goes: the strongest evidence it holds, never more. A region is passed on
// only when one was recorded, so the Case Explorer never highlights a pixel nobody chose. With no
// identifiers it returns `available: false` and a reason instead of a guess.
export function evidenceLocation(finding) {
  if (finding && isId(finding.caseId) && isIndex(finding.sliceIndex)) {
    return Object.freeze({
      available: true,
      screen: EVIDENCE_SCREEN.CASE_EXPLORER,
      precision: finding.region ? 'REGION' : 'SLICE',
      caseId: finding.caseId,
      sliceIndex: finding.sliceIndex,
      runId: finding.runId ?? null,
      // The variant that was on screen, so SCR-03 shows the same overlay instead of guessing.
      variant: finding.variant ?? null,
      experimentId: finding.experimentId ?? null,
      region: finding.region ?? null,
      reason: null,
    });
  }
  if (finding && isId(finding.experimentId)) {
    return Object.freeze({
      available: true,
      screen: EVIDENCE_SCREEN.EXPERIMENT_COMPARISON,
      precision: 'EXPERIMENT',
      caseId: null,
      sliceIndex: null,
      runId: null,
      variant: null,
      experimentId: finding.experimentId,
      region: null,
      reason: null,
    });
  }
  return Object.freeze({
    available: false,
    screen: null,
    precision: null,
    caseId: null,
    sliceIndex: null,
    runId: null,
    variant: null,
    experimentId: null,
    region: null,
    reason: 'NO_EVIDENCE_IDENTIFIERS',
  });
}

// finding_create's request_fields, in the contract's own names.
export function createRequestBody(finding) {
  return {
    study_id: finding.studyId,
    experiment_id: finding.experimentId,
    case_id: finding.caseId,
    analysis_run_id: finding.runId,
    prediction_variant: finding.variant,
    slice_index: finding.sliceIndex,
    finding_type: finding.type,
    note: finding.note,
    region_reference: finding.region,
  };
}

// A findings_list row -> loose fields for normalizeFinding. The anchor may sit inside `evidence` or beside
// it, under finding_create's field names, so both places are read, evidence first.
export function fieldsFromRecord(row) {
  const ev = row && row.evidence && typeof row.evidence === 'object' ? row.evidence : {};
  const read = (name) => (ev[name] !== undefined ? ev[name] : row[name]);
  return {
    findingId: row.finding_id ?? null,
    studyId: read('study_id') ?? null,
    experimentId: read('experiment_id') ?? null,
    runId: read('analysis_run_id') ?? null,
    variant: read('prediction_variant') ?? null,
    caseId: read('case_id') ?? null,
    sliceIndex: read('slice_index') ?? null,
    region: read('region_reference') ?? null,
    type: row.finding_type ?? null,
    status: row.status ?? null,
    note: row.note ?? '',
    evidence: row.evidence ?? null,
    revision: row.revision ?? null,
  };
}

function entryFor(result) {
  return Object.freeze({
    finding: result.finding,
    ok: result.ok,
    problems: result.problems,
    location: evidenceLocation(result.finding),
  });
}

function snapshot(view, fields) {
  return Object.freeze({
    view,
    items: Object.freeze([...(fields.items ?? [])]),
    lastCreated: fields.lastCreated ?? null,
    rejection: fields.rejection ?? null,
  });
}

// The findings model over an API client. `studyId` is required: every finding belongs to a study,
// and a default would be a guess.
export function createFindings(client, { studyId } = {}) {
  if (!isId(studyId)) throw new Error('createFindings needs the study id the findings belong to');
  let current = snapshot(loading(), {});

  const set = (view, patch = {}) => {
    current = snapshot(view, { ...current, rejection: null, ...patch });
    return current;
  };

  // Take a findings_list answer the screen fetched. A LOADING view keeps the items already held, but the
  // view says LOADING, so nothing is shown as current. The server lists oldest first (contract 1.2.0); the
  // list is kept newest first, the order a new finding is added in.
  function adopt(view) {
    if (view.state !== STATE.SUCCESS) return set(view);
    const items = (view.data.items ?? [])
      .map((row) => entryFor(normalizeFinding(fieldsFromRecord(row), { requireAnchor: false })))
      .reverse();
    return set(view, { items });
  }

  async function list({ scenario = 'default' } = {}) {
    set(loading());
    return adopt(await client.call('findings_list', {}, { scenario }));
  }

  // Create from a case/slice context; nothing is sent when the draft is invalid. The anchor kept is the one
  // the user created from (the fixture echoes placeholder ids); finding_id, status and evidence come from
  // the server.
  async function create(draft = {}, { scenario = 'default', shape = null } = {}) {
    const checked = normalizeFinding({ ...draft, studyId, findingId: null, status: FINDING_STATUS.OPEN },
      { requireAnchor: true, shape });
    const note = checkNote(checked.finding.note);
    if (note.tooLong) {
      return set(current.view, {
        rejection: Object.freeze({
          code: 'VALIDATION_ERROR', reason: `The note is ${note.length} characters; at most ${note.max} are kept.`, problems: [],
        }),
      });
    }
    if (!checked.ok) {
      return set(current.view, {
        rejection: Object.freeze({ code: 'VALIDATION_ERROR', reason: checked.problems.join('; '), problems: checked.problems }),
      });
    }
    const view = await client.call('finding_create', {}, { body: createRequestBody(checked.finding), scenario });
    if (view.state !== STATE.SUCCESS) return set(view);
    const status = view.data.status;
    if (!own(FINDING_STATUS, status)) {
      return set(fatalInvalid({
        code: 'CONTRACT_DRIFT',
        safeMessage: `The finding status ${status} is not one of ${Object.keys(FINDING_STATUS).join(', ')}.`,
        detail: { endpointId: 'finding_create', field: 'status', value: status },
      }));
    }
    const entry = entryFor(normalizeFinding({
      ...checked.finding, findingId: view.data.finding_id, status, evidence: view.data.evidence ?? null,
      revision: view.data.revision ?? null,
    }, { requireAnchor: true, shape }));
    return set(view, { items: [entry, ...current.items], lastCreated: entry });
  }

  // Where a tap on a listed finding goes.
  function open(findingId) {
    const entry = current.items.find((e) => e.finding.findingId === findingId);
    return entry ? entry.location : evidenceLocation(null);
  }

  const reject = (code, reason) => set(current.view, { rejection: Object.freeze({ code, reason }) });

  // Only status and note may change; the evidence and anchor never do. The finding's own revision goes as
  // expected_revision, so no revision means no write. On STALE_REVISION nothing changes and REFRESH is offered.
  async function patch(findingId, { status, note } = {}, { scenario = 'default' } = {}) {
    const index = current.items.findIndex((e) => e.finding.findingId === findingId);
    if (index === -1) return reject('FINDING_NOT_LISTED', `${findingId} is not in this list`);
    const f = current.items[index].finding;
    if (status === undefined && note === undefined) return reject('NOTHING_TO_CHANGE', 'Give a status or a note.');
    if (status !== undefined && !own(FINDING_STATUS, status)) {
      return reject('VALIDATION_ERROR', `status ${status} is not one of ${Object.keys(FINDING_STATUS).join('/')}`);
    }
    if (note !== undefined && typeof note !== 'string') return reject('VALIDATION_ERROR', 'note must be text');
    if (!(Number.isInteger(f.revision) && f.revision >= 1)) {
      return reject('FINDING_REVISION_UNKNOWN', 'This finding carries no revision, so it cannot be changed safely.');
    }
    const view = await client.call('finding_patch', { finding_id: findingId }, {
      body: { note: note ?? f.note, status: status ?? f.status, expected_revision: f.revision }, scenario,
    });
    if (view.state !== STATE.SUCCESS) return set(view);
    const d = view.data;
    if (!own(FINDING_STATUS, d.status)) {
      return set(fatalInvalid({
        code: 'CONTRACT_DRIFT',
        safeMessage: `The finding status ${d.status} is not one of ${Object.keys(FINDING_STATUS).join(', ')}.`,
        detail: { endpointId: 'finding_patch', field: 'status', value: d.status },
      }));
    }
    const updated = entryFor(normalizeFinding({
      ...f, status: d.status, note: d.note ?? f.note, revision: d.revision ?? f.revision,
    }, { requireAnchor: false }));
    const items = current.items.slice();
    items[index] = updated;
    return set(view, { items });
  }

  return Object.freeze({
    get current() { return current; },
    adopt,
    list,
    create,
    open,
    patch,
  });
}

// How a finding reads, on the screen and in the PDF.

export const TYPE_LABEL = Object.freeze({
  UNDER_SEGMENTATION: 'Under-segmentation',
  OVER_SEGMENTATION: 'Over-segmentation',
  BOUNDARY_DISAGREEMENT: 'Boundary disagreement',
  DISCONNECTED_ARTIFACT: 'Disconnected artifact',
  OTHER: 'Other',
});

export const STATUS_LABEL = Object.freeze({ OPEN: 'Open', RESOLVED: 'Resolved' });

export const typeLabel = (type) => (type ? TYPE_LABEL[type] || type : 'type not recorded');

export function evidenceLine(f) {
  const parts = [];
  if (f.caseId) parts.push(f.caseId);
  if (Number.isInteger(f.sliceIndex)) parts.push(`slice ${f.sliceIndex}`);
  if (f.runId) parts.push(`run ${f.runId}`);
  if (f.variant) parts.push(f.variant);
  if (f.experimentId) parts.push(`exp ${f.experimentId}`);
  if (f.region && f.region.kind === 'POINT') parts.push(`point (${f.region.x}, ${f.region.y})`);
  if (f.region && f.region.kind === 'BOX') parts.push(`box (${f.region.x0}, ${f.region.y0})-(${f.region.x1}, ${f.region.y1})`);
  return parts.length ? parts.join(' · ') : 'no evidence identifiers recorded';
}

// Filter chips: one status and one type at a time; ALL keeps every finding.
export const ALL = 'ALL';

export function filterFindings(items, { status = ALL, type = ALL } = {}) {
  return items.filter((e) => (status === ALL || e.finding.status === status) && (type === ALL || e.finding.type === type));
}

// The number on each chip, counted over the whole list.
export function countFindings(items) {
  const status = Object.fromEntries(Object.keys(FINDING_STATUS).map((k) => [k, 0]));
  const type = Object.fromEntries(Object.keys(FINDING_TYPE).map((k) => [k, 0]));
  for (const { finding } of items) {
    if (finding.status in status) status[finding.status] += 1;
    if (finding.type in type) type[finding.type] += 1;
  }
  return Object.freeze({ all: items.length, status: Object.freeze(status), type: Object.freeze(type) });
}

export function filterLabel({ status = ALL, type = ALL } = {}) {
  const s = status === ALL ? 'every status' : STATUS_LABEL[status] || status;
  const t = type === ALL ? 'every type' : typeLabel(type);
  return `${s}, ${t}`;
}

// The PDF is built from HTML. A note is the user's own text, so every value is escaped and can never become markup.
export function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, (c) => map[c]);
}

// The findings shown on screen as a printable page: what, status, where, note. Identifiers only, no image, and
// the research-use notice of spec 12 section 1.
export function findingsReportHtml({ entries, studyId, filter, generatedAt }) {
  const rows = entries.map(({ finding: f }) => `<tr><td>${escapeHtml(typeLabel(f.type))}</td>`
    + `<td>${escapeHtml(STATUS_LABEL[f.status] || f.status || '')}</td><td>${escapeHtml(evidenceLine(f))}</td>`
    + `<td>${escapeHtml(f.note || '')}</td></tr>`).join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Findings report</title>
<style>
body { font-family: sans-serif; font-size: 11pt; color: #111; margin: 24px; }
h1 { font-size: 16pt; margin: 0 0 4px; }
.meta, .notice { color: #444; font-size: 9pt; margin: 2px 0; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; }
th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eee; }
</style></head>
<body>
<h1>Findings report</h1>
<p class="meta">Study ${escapeHtml(studyId)} · ${escapeHtml(filterLabel(filter))} · ${entries.length} finding(s) · made ${escapeHtml(generatedAt)}</p>
<p class="notice">Research use only, not for diagnosis. Case IDs are pseudonymous; this report holds no image and no patient identifier.</p>
<table><thead><tr><th>Type</th><th>Status</th><th>Evidence</th><th>Note</th></tr></thead>
<tbody>
${rows || '<tr><td colspan="4">No finding matches these filters.</td></tr>'}
</tbody></table>
</body></html>
`;
}

// Screen logic: everything SCR-08 does except drawing. FindingsScreen.js fetches the list, hands each view
// to provideList() and renders getState(). The create form shows only when the route carries a case and
// slice (for example from SCR-06); the tab alone shows the list.

const isVariant = (v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(PREDICTION_VARIANT, v);

// The create context a route carries, or null when SCR-08 was opened bare. A route with a run but no
// variant leaves the variant to the form, since a finding with a run needs one.
export function contextFrom(params = {}) {
  if (!isId(params.caseId) || !isIndex(params.sliceIndex)) return null;
  const runId = isId(params.runId) ? params.runId : null;
  return Object.freeze({
    caseId: params.caseId,
    sliceIndex: params.sliceIndex,
    runId,
    variant: runId && isVariant(params.variant) ? params.variant : null,
    experimentId: isId(params.experimentId) ? params.experimentId : null,
    region: params.region && typeof params.region === 'object' ? params.region : null,
  });
}

// A location from evidenceLocation() -> the { screenId, params } to push.
// Only what the finding holds is passed on: no default variant, no invented id.
export function routeFor(location) {
  if (!location || !location.available) return null;
  if (location.screen === EVIDENCE_SCREEN.CASE_EXPLORER) {
    const p = { caseId: location.caseId, sliceIndex: location.sliceIndex };
    if (location.runId) p.runId = location.runId;
    if (location.variant) p.variant = location.variant;
    if (location.experimentId) p.experimentId = location.experimentId;
    if (location.region) p.region = location.region;
    return Object.freeze({ screenId: 'SCR-03', params: Object.freeze(p) });
  }
  if (location.screen === EVIDENCE_SCREEN.EXPERIMENT_COMPARISON) {
    return Object.freeze({ screenId: 'SCR-07', params: Object.freeze({ experimentId: location.experimentId }) });
  }
  return null;
}

// Correcting the evidence slice needs a run (SCR-06 is scoped to one). The variant goes along when the
// finding recorded it; without it SCR-06 asks rather than defaulting.
export function reviewRouteFor(location) {
  if (!location || !location.available || location.screen !== EVIDENCE_SCREEN.CASE_EXPLORER || !location.runId) return null;
  const p = { runId: location.runId, caseId: location.caseId, sliceIndex: location.sliceIndex };
  if (location.variant) p.variant = location.variant;
  return Object.freeze({ screenId: 'SCR-06', params: Object.freeze(p) });
}

// printer: { available, print(html) -> { ok, message? } } (pdfExport.js on the phone); null = no PDF export.
export function createFindingsScreen({ runtime, params = {}, printer = null }) {
  const model = createFindings(runtime.client, { studyId: runtime.config.studyId });
  const context = contextFrom(params);
  const listeners = new Set();
  const blankForm = () => ({ type: null, note: '', variant: context ? context.variant : null });
  let form = context ? blankForm() : null;
  let filter = Object.freeze({ status: ALL, type: ALL });
  let busy = null;
  let notice = null;
  let listView = model.current.view; // the list's own state, kept apart from a failed action
  let actionView = null;             // a failed create or status change, shown over a still-valid list
  let version = 0;

  const emit = () => {
    version += 1;
    for (const fn of listeners) fn();
  };

  // The findings_list view the screen's useCall holds (LOADING included).
  function provideList(view) {
    listView = model.adopt(view).view;
    // A freshly read list is the remedy for a stale write: its banner goes.
    if (view.state === STATE.SUCCESS) actionView = null;
    emit();
    return getState();
  }

  async function submit() {
    if (!form || busy) return getState();
    busy = 'create';
    emit();
    const s = await model.create({
      caseId: context.caseId, sliceIndex: context.sliceIndex, runId: context.runId, variant: form.variant,
      experimentId: context.experimentId, region: context.region, type: form.type, note: form.note,
    });
    busy = null;
    actionView = null;
    if (s.rejection) {
      notice = Object.freeze({ kind: 'refused', text: s.rejection.reason, problems: s.rejection.problems });
    } else if (s.view.state === STATE.SUCCESS) {
      notice = Object.freeze({ kind: 'created', text: `Finding ${s.lastCreated.finding.findingId} created (${s.lastCreated.finding.status}).` });
      form = blankForm();
    } else {
      notice = null;
      actionView = s.view; // the failure, with its own actions
    }
    emit();
    return getState();
  }

  // OPEN <-> RESOLVED through finding_patch.
  async function setStatus(findingId, status) {
    if (busy) return getState();
    busy = 'status';
    emit();
    const s = await model.patch(findingId, { status });
    busy = null;
    actionView = null;
    if (s.rejection) notice = Object.freeze({ kind: 'refused', text: s.rejection.reason });
    else if (s.view.state === STATE.SUCCESS) notice = Object.freeze({ kind: 'status', text: `Finding ${findingId} is now ${status}.` });
    else { notice = null; actionView = s.view; } // STALE_MISMATCH -> Refresh reloads the list
    emit();
    return getState();
  }

  // The findings on screen as a PDF, through the system print dialog ("Save as PDF").
  async function exportPdf(generatedAt = new Date().toISOString()) {
    if (busy) return getState();
    if (!(printer && printer.available)) {
      notice = Object.freeze({ kind: 'refused', text: 'PDF export is not in this app build yet (it needs the next APK).' });
      emit();
      return getState();
    }
    const entries = filterFindings(model.current.items, filter);
    busy = 'export';
    emit();
    const html = findingsReportHtml({ entries, studyId: runtime.config.studyId, filter, generatedAt: formatUtc(generatedAt) });
    const r = await printer.print(html);
    busy = null;
    notice = r.ok
      ? Object.freeze({ kind: 'exported', text: `${entries.length} finding(s) sent to the print dialog: choose "Save as PDF" to keep a file.` })
      : Object.freeze({ kind: 'refused', text: `PDF export did not finish: ${r.message || 'the print dialog was closed'}.` });
    emit();
    return getState();
  }

  function getState() {
    const m = model.current;
    // The note is checked as it is typed: too long blocks Create, a possible personal detail is a warning.
    const noteCheck = form ? checkNote(form.note) : null;
    return Object.freeze({
      version,
      view: listView,
      actionView,
      items: m.items,
      // Newest first, narrowed by the chips; counts are over the whole list.
      shown: Object.freeze(filterFindings(m.items, filter)),
      filter,
      counts: countFindings(m.items),
      pdfAvailable: Boolean(printer && printer.available),
      context,
      form: form ? Object.freeze({ ...form }) : null,
      noteCheck,
      // A form opened with a run but no variant asks which prediction was seen.
      needsVariant: Boolean(context && context.runId && !context.variant),
      canSubmit: Boolean(form && form.type && (!context.runId || form.variant) && noteCheck.ok && !busy),
      busy,
      notice,
    });
  }

  return Object.freeze({
    getState,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    provideList,
    setType(type) {
      if (form && Object.prototype.hasOwnProperty.call(FINDING_TYPE, type)) { form = { ...form, type }; emit(); }
    },
    setNote(note) {
      if (form && typeof note === 'string') { form = { ...form, note }; emit(); }
    },
    setVariant(variant) {
      if (form && context.runId && isVariant(variant)) { form = { ...form, variant }; emit(); }
    },
    submit,
    setStatus,
    // { status } or { type }: ALL or one of the contract's values.
    setFilter(patch = {}) {
      const next = { ...filter, ...patch };
      const okStatus = next.status === ALL || Object.prototype.hasOwnProperty.call(FINDING_STATUS, next.status);
      const okType = next.type === ALL || Object.prototype.hasOwnProperty.call(FINDING_TYPE, next.type);
      if (okStatus && okType) { filter = Object.freeze(next); emit(); }
    },
    exportPdf,
    // Routes for a listed finding, by id: where its evidence is, and where to correct it.
    routeTo: (findingId) => routeFor(model.open(findingId)),
    reviewRouteTo: (findingId) => reviewRouteFor(model.open(findingId)),
  });
}
