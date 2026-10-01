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
 * owns it. Status changes (finding_patch) are not here yet - see the README:
 * the contract gives a finding no revision before its first patch, and a
 * patch without one would be the last-write-wins the contract forbids.
 */

import { STATE, loading, fatalInvalid } from '../../core/index.mjs';

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
 * `05` lets case and slice be null and findings_list rows carry no type. Such
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
    caseId: input.caseId ?? null,
    sliceIndex: input.sliceIndex ?? null,
    region: input.region ?? null,
    type: input.type ?? null,
    status: input.status ?? (requireAnchor ? FINDING_STATUS.OPEN : null),
    note: input.note ?? '',
    evidence: input.evidence ?? null,
  };

  for (const key of ['findingId', 'studyId', 'experimentId', 'runId']) {
    if (!isOptionalId(f[key])) problems.push(`${key} must be a non-empty string or null`);
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
    slice_index: finding.sliceIndex,
    finding_type: finding.type,
    note: finding.note,
    region_reference: finding.region,
  };
}

/*
 * A findings_list row -> loose fields for normalizeFinding. The contract only
 * guarantees finding_id, status and evidence on a row. The anchor may sit
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
    caseId: read('case_id') ?? null,
    sliceIndex: read('slice_index') ?? null,
    region: read('region_reference') ?? null,
    type: row.finding_type ?? null,
    status: row.status ?? null,
    note: row.note ?? '',
    evidence: row.evidence ?? null,
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

  async function list({ scenario = 'default' } = {}) {
    set(loading());
    const view = await client.call('findings_list', {}, { scenario });
    if (view.state !== STATE.SUCCESS) return set(view);
    const items = (view.data.items ?? [])
      .map((row) => entryFor(normalizeFinding(fieldsFromRecord(row), { requireAnchor: false })));
    return set(view, { items });
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
    }, { requireAnchor: true, shape }));
    return set(view, { items: [entry, ...current.items], lastCreated: entry });
  }

  // Where a tap on a listed finding goes.
  function open(findingId) {
    const entry = current.items.find((e) => e.finding.findingId === findingId);
    return entry ? entry.location : evidenceLocation(null);
  }

  return Object.freeze({
    get current() { return current; },
    list,
    create,
    open,
  });
}
