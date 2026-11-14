/*
 * V4 — SCR-08 Findings, as a model. Framework-neutral, like index.mjs.
 *
 * A finding is an evidence-linked observation (`05` §2). SCR-08's one hard
 * rule (`10` §3) is that opening a finding takes the user back to "the
 * strongest available evidence location", so the anchor is the point of the
 * object:
 *
 *   { experimentId?, runId?, caseId, sliceIndex, region?, type, status }
 *
 * Requirements: PR-FIND-01, FR-FIND-001..004, TC-FIND-001/002. A finding only
 * REFERENCES evidence; nothing in this file writes an MRI, a prediction or a
 * metric artifact (FR-FIND-004).
 *
 * Built on Day 22 under the recovery override for Nguyễn Gia Đức Trung, who
 * owns it. Status and note changes go through finding_patch with the
 * finding's own revision as expected_revision (contract v1.0+ gives every
 * finding row one); STALE_REVISION changes nothing and offers REFRESH.
 */

import { PREDICTION_VARIANT } from '../../lib/caseMode.mjs';
import { STATE, loading, fatalInvalid } from '../../api/states.mjs';

// `05` §2 Finding.finding_type, FR-FIND-003.
export const FINDING_TYPE = Object.freeze({
  UNDER_SEGMENTATION: 'UNDER_SEGMENTATION',
  OVER_SEGMENTATION: 'OVER_SEGMENTATION',
  BOUNDARY_DISAGREEMENT: 'BOUNDARY_DISAGREEMENT',
  DISCONNECTED_ARTIFACT: 'DISCONNECTED_ARTIFACT',
  OTHER: 'OTHER',
});

// `05` §2 Finding.status and `11` §9 (OPEN|RESOLVED). Mirrors contract.json
// `domain_enums.finding_status`; test F0 holds them equal.
export const FINDING_STATUS = Object.freeze({ OPEN: 'OPEN', RESOLVED: 'RESOLVED' });

/*
 * FR-FIND-002 "an optional region/spatial coordinate". In SOURCE pixels of
 * the anchored slice (DR-008a: x = column, y = row), so it means the same
 * thing at any zoom. The contract's region_reference is free-form; this shape
 * is V4's proposal until the API says otherwise.
 */
export const REGION_KIND = Object.freeze({ POINT: 'POINT', BOX: 'BOX' });

// Where opening a finding goes. `10` §2 navigation structure.
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

/*
 * Build a frozen finding from loose fields and say what is wrong with it.
 *
 * `requireAnchor` is true for a finding the user is creating: it is created
 * from a case/slice context, so that context must be complete (PR-FIND-01),
 * and it needs a type. It is false for a record read back from the API, where
 * `05` lets case and slice be null (contract 1.1.0 rows carry finding_type, note
 * and revision, but an older or partial record may not). Such
 * a record is still shown - "filtering ... cannot hide evidence identifiers"
 * - it just cannot be opened at a slice. A value that IS present must always
 * be valid: an unknown type or status is rejected either way (TC-FIND-002).
 *
 * `shape` ([nx, ny, nz], from case_get) bounds the slice and the region when
 * it is known.
 */
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
    // Contract v1.0: every finding row carries its revision (a new one is 1);
    // finding_patch needs it as expected_revision.
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

/*
 * Where opening this finding goes - the strongest evidence it actually holds,
 * and never more: a region is passed on only when one was recorded, so the
 * Case Explorer cannot be asked to highlight a pixel nobody chose (`10` §6
 * makes the same rule for 3D -> 2D). Returns `available: false` with a reason
 * rather than a guess when the record holds no identifiers.
 */
export function evidenceLocation(finding) {
  if (finding && isId(finding.caseId) && isIndex(finding.sliceIndex)) {
    return Object.freeze({
      available: true,
      screen: EVIDENCE_SCREEN.CASE_EXPLORER,
      precision: finding.region ? 'REGION' : 'SLICE',
      caseId: finding.caseId,
      sliceIndex: finding.sliceIndex,
      runId: finding.runId ?? null,
      // The prediction variant that was on screen (contract 1.1.0), so SCR-03
      // can show the same overlay instead of asking - or guessing.
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

/*
 * A findings_list row -> loose fields for normalizeFinding. Contract 1.1.0 rows
 * carry finding_id, status, evidence, finding_type, note and revision. The anchor may sit
 * inside `evidence` or beside it, under finding_create's field names, so both
 * places are read, evidence first.
 */
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

/*
 * The SCR-08 model over a core client. `studyId` is a constructor argument:
 * every finding belongs to a study (`05` §2), and a default would be a guess.
 */
export function createFindings(client, { studyId } = {}) {
  if (!isId(studyId)) throw new Error('createFindings needs the study id the findings belong to');
  let current = snapshot(loading(), {});

  const set = (view, patch = {}) => {
    current = snapshot(view, { ...current, rejection: null, ...patch });
    return current;
  };

  /*
   * Take a findings_list answer that the CALLER fetched - a screen reads the
   * list through the shell's useCall (DR-021 rule 2: latest wins, aborted on
   * unmount) and hands the view here. A LOADING view keeps the items already
   * held, but the view says LOADING, so nothing is shown as current.
   */
  function adopt(view) {
    if (view.state !== STATE.SUCCESS) return set(view);
    const items = (view.data.items ?? [])
      .map((row) => entryFor(normalizeFinding(fieldsFromRecord(row), { requireAnchor: false })));
    return set(view, { items });
  }

  async function list({ scenario = 'default' } = {}) {
    set(loading());
    return adopt(await client.call('findings_list', {}, { scenario }));
  }

  /*
   * Create from a case/slice context. The draft is checked first and nothing
   * is sent when it is incomplete or invalid. The stored anchor is the one the
   * user created from - the generated fixture echoes placeholder ids, so the
   * echo is not read back as the anchor; finding_id, status and evidence come
   * from the server.
   */
  async function create(draft = {}, { scenario = 'default', shape = null } = {}) {
    const checked = normalizeFinding({ ...draft, studyId, findingId: null, status: FINDING_STATUS.OPEN },
      { requireAnchor: true, shape });
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

  /*
   * finding_patch: only status (OPEN | RESOLVED) and note may change; the
   * evidence and the anchor never do (FR-FIND-004). The finding's own revision
   * goes as expected_revision - no revision, no write (last-write-wins is
   * forbidden). On success the entry takes the server's status, note and
   * revision; on STALE_REVISION nothing changes and the view offers REFRESH.
   */
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

/*
 * SCR-08 Findings — everything the screen does except drawing. Pure, so
 * node --test drives it against the generated fixture bundle;
 * FindingsScreen.js renders getState().
 *
 * Built on Day 22 under the recovery override for V4's owner Nguyễn Gia Đức
 * Trung, on app/verticals/v4_review_and_findings/findings.mjs.
 *
 * The LIST is a read, so the screen fetches it with the shell's useCall
 * (DR-021 rule 2: latest wins, aborted on unmount) and hands every view to
 * provideList(); Refresh / Retry are the screen's refetch. The writes
 * (finding_create, finding_patch) are explicit actions of the model, each
 * with the finding's own revision where the contract wants one.
 *
 *   - the list: every finding with its type, status, note and evidence; a
 *     record without evidence identifiers is shown, but cannot be opened;
 *   - open: "navigates to the strongest available evidence location" (`10` §3)
 *     - SCR-03 at the exact case and slice, or SCR-07 for an experiment-only
 *     record - as the route the navigator should push;
 *   - create: only from a case/slice context (FR-FIND-001) - SCR-08 opened
 *     with caseId + sliceIndex (from SCR-06, or another screen) shows the form,
 *     prefilled with that context; the tab alone shows the list.
 */

const isVariant = (v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(PREDICTION_VARIANT, v);

// The create context a route carries, or null when SCR-08 was opened bare.
// SCR-06 passes its own prediction variant; a route that names a run without
// one leaves the variant to the form (contract 1.1.0 needs it with a run).
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

// Correcting the evidence slice needs a run (SCR-06 is scoped to one). The
// variant goes along when the finding recorded it (contract 1.1.0); without
// it SCR-06 asks rather than defaulting.
export function reviewRouteFor(location) {
  if (!location || !location.available || location.screen !== EVIDENCE_SCREEN.CASE_EXPLORER || !location.runId) return null;
  const p = { runId: location.runId, caseId: location.caseId, sliceIndex: location.sliceIndex };
  if (location.variant) p.variant = location.variant;
  return Object.freeze({ screenId: 'SCR-06', params: Object.freeze(p) });
}

export function createFindingsScreen({ runtime, params = {} }) {
  const model = createFindings(runtime.client, { studyId: runtime.config.studyId });
  const context = contextFrom(params);
  const listeners = new Set();
  const blankForm = () => ({ type: null, note: '', variant: context ? context.variant : null });
  let form = context ? blankForm() : null;
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

  // OPEN <-> RESOLVED through finding_patch (expected_revision = the finding's own).
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

  function getState() {
    const m = model.current;
    return Object.freeze({
      version,
      view: listView,
      actionView,
      items: m.items,
      context,
      form: form ? Object.freeze({ ...form }) : null,
      // A form opened with a run but no variant asks which prediction was seen.
      needsVariant: Boolean(context && context.runId && !context.variant),
      canSubmit: Boolean(form && form.type && (!context.runId || form.variant) && !busy),
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
    // Routes for a listed finding, by id: where its evidence is, and where to correct it.
    routeTo: (findingId) => routeFor(model.open(findingId)),
    reviewRouteTo: (findingId) => reviewRouteFor(model.open(findingId)),
  });
}
