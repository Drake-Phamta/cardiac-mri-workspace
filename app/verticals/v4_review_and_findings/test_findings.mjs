// node app/verticals/v4_review_and_findings/test_findings.mjs
//
// The SCR-08 findings model (findings.mjs): validation and evidenceLocation as
// pure functions, then list/create against the GENERATED fixture bundle
// (generate it as in test_review_correction.mjs). Requests are recorded, so
// "nothing was sent" is checked, not assumed.

import { readFileSync } from 'node:fs';
import { createContract, createBundle, createClient, createFixtureTransport, STATE, RECOVERY } from '../../core/index.mjs';
import {
  FINDING_TYPE, FINDING_STATUS, EVIDENCE_SCREEN, REGION_KIND,
  normalizeFinding, evidenceLocation, fieldsFromRecord, createFindings,
} from './findings.mjs';

const ROOT = new URL('../../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const contract = createContract(readJson('contracts/api/contract.json'));
const bundle = createBundle(contract, readJson('app/core/fixtures/.generated/api_bundle.json'));

function recorder(transform = null) {
  const inner = createFixtureTransport(bundle);
  const sent = [];
  const transport = {
    kind: 'fixture',
    async send(resolved, options) {
      sent.push({ endpointId: resolved.endpointId, body: options.body ?? null });
      const response = await inner.send(resolved, options);
      return transform ? transform(resolved, response) : response;
    },
  };
  return { sent, client: createClient(contract, transport) };
}

let failures = 0;
let count = 0;
function check(id, ok, detail) {
  count += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(4)} ${detail}`);
}
const sorted = (xs) => [...xs].sort();
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const SHAPE = [576, 576, 88];
const DRAFT = {
  experimentId: 'EXP_DEMO', runId: 'RUN_0043', caseId: 'CASE_0043', sliceIndex: 44,
  region: { kind: REGION_KIND.POINT, x: 301, y: 288 }, type: FINDING_TYPE.UNDER_SEGMENTATION,
  note: 'Prediction misses the inferior wall here.',
};

// F0: the closed sets are the domain's own.
{
  const enums = contract.raw.domain_enums;
  // TEMPORARY until contract v1.0 (#62) is on main: the Day-22 decision.
  const status = enums?.finding_status ?? ['OPEN', 'RESOLVED'];
  const types = enums?.finding_type
    ?? ['UNDER_SEGMENTATION', 'OVER_SEGMENTATION', 'BOUNDARY_DISAGREEMENT', 'DISCONNECTED_ARTIFACT', 'OTHER'];
  const where = enums ? 'contract.json domain_enums' : 'the Day-22 decision (contract v1.0 not merged yet)';
  check('F0', sameList(sorted(Object.keys(FINDING_STATUS)), sorted(status)) && Object.entries(FINDING_STATUS).every(([k, v]) => k === v),
    `finding status OPEN/RESOLVED equals ${where}`);
  check('F0', sameList(sorted(Object.keys(FINDING_TYPE)), sorted(types)) && Object.entries(FINDING_TYPE).every(([k, v]) => k === v),
    `the five finding types (05 §2, FR-FIND-003) equal ${where}`);
}

// F1: a complete draft is valid, frozen, and opens at its exact evidence (TC-FIND-001).
{
  const r = normalizeFinding(DRAFT, { shape: SHAPE });
  const loc = evidenceLocation(r.finding);
  check('F1', r.ok && Object.isFrozen(r.finding) && r.finding.status === 'OPEN' && r.problems.length === 0,
    'a case/slice draft with type and region is valid, frozen, and starts OPEN');
  check('F1', loc.available && loc.screen === EVIDENCE_SCREEN.CASE_EXPLORER && loc.caseId === 'CASE_0043'
    && loc.sliceIndex === 44 && loc.runId === 'RUN_0043' && loc.experimentId === 'EXP_DEMO'
    && loc.precision === 'REGION' && loc.region.x === 301 && loc.region.y === 288,
  `opens ${loc.screen} at ${loc.caseId} slice ${loc.sliceIndex}, run ${loc.runId}, region (${loc.region?.x}, ${loc.region?.y})`);
  const noRegion = evidenceLocation(normalizeFinding({ ...DRAFT, region: null }).finding);
  check('F1', noRegion.precision === 'SLICE' && noRegion.region === null,
    'without a recorded region it opens at the slice and asks for no pixel highlight');
}

// F2: what a draft may not be (TC-FIND-002 "invalid type/status is rejected").
{
  const cases = [
    ['no case', { ...DRAFT, caseId: undefined }, 'caseId is required'],
    ['no slice', { ...DRAFT, sliceIndex: undefined }, 'sliceIndex is required'],
    ['negative slice', { ...DRAFT, sliceIndex: -1 }, 'sliceIndex -1'],
    ['slice past the volume', { ...DRAFT, sliceIndex: 88 }, 'sliceIndex 88'],
    ['fractional slice', { ...DRAFT, sliceIndex: 4.5 }, 'sliceIndex 4.5'],
    ['no type', { ...DRAFT, type: undefined }, 'type is required'],
    ['unknown type', { ...DRAFT, type: 'MISSED_SPOT' }, 'type MISSED_SPOT'],
    ['prototype key as type', { ...DRAFT, type: 'constructor' }, 'type constructor'],
    ['unknown status', { ...DRAFT, status: 'IN_PROGRESS' }, 'status IN_PROGRESS'],
    ['empty case id', { ...DRAFT, caseId: '' }, 'caseId must be'],
    ['empty run id', { ...DRAFT, runId: '' }, 'runId must be'],
    ['point off the slice', { ...DRAFT, region: { kind: 'POINT', x: 576, y: 3 } }, 'region POINT'],
    ['box corners unordered', { ...DRAFT, region: { kind: 'BOX', x0: 10, y0: 10, x1: 5, y1: 20 } }, 'not ordered'],
    ['unknown region kind', { ...DRAFT, region: { kind: 'CIRCLE', x: 1, y: 1 } }, 'region kind CIRCLE'],
    ['note not text', { ...DRAFT, note: 42 }, 'note must be text'],
  ];
  const wrong = cases.filter(([, input, needle]) => {
    const r = normalizeFinding(input, { shape: SHAPE });
    return r.ok || !r.problems.some((p) => p.includes(needle));
  });
  check('F2', wrong.length === 0, `${cases.length}/${cases.length} invalid drafts rejected with the reason named` +
    (wrong.length ? ` — accepted or misreported: ${wrong.map((c) => c[0]).join(', ')}` : ''));
  const box = normalizeFinding({ ...DRAFT, region: { kind: 'BOX', x0: 280, y0: 270, x1: 320, y1: 300 } }, { shape: SHAPE });
  check('F2', box.ok, 'an ordered BOX inside the slice is a valid region');
}

// F3: records read back from the API - shown even when not navigable, never guessed.
{
  const bare = normalizeFinding(fieldsFromRecord({ finding_id: 'F1', status: 'OPEN', evidence: { source: 'x' } }), { requireAnchor: false });
  const locBare = evidenceLocation(bare.finding);
  const nested = normalizeFinding(fieldsFromRecord({
    finding_id: 'F2', status: 'RESOLVED', finding_type: 'OTHER',
    evidence: { case_id: 'CASE_0007', analysis_run_id: 'RUN_0007', slice_index: 12 },
  }), { requireAnchor: false });
  const locNested = evidenceLocation(nested.finding);
  const expOnly = evidenceLocation(normalizeFinding(fieldsFromRecord({ finding_id: 'F3', status: 'OPEN', evidence: { experiment_id: 'EXP-D-100' } }),
    { requireAnchor: false }).finding);
  const badStatus = normalizeFinding(fieldsFromRecord({ finding_id: 'F4', status: 'IN_PROGRESS', evidence: {} }), { requireAnchor: false });
  check('F3', bare.ok && !locBare.available && locBare.reason === 'NO_EVIDENCE_IDENTIFIERS' && locBare.screen === null,
    'a record with no evidence identifiers is readable but opens nowhere (reason NO_EVIDENCE_IDENTIFIERS)');
  check('F3', nested.ok && locNested.screen === EVIDENCE_SCREEN.CASE_EXPLORER && locNested.caseId === 'CASE_0007'
    && locNested.sliceIndex === 12 && locNested.runId === 'RUN_0007',
  'an anchor inside `evidence` (finding_create names) opens SCR-03 at that case and slice');
  check('F3', expOnly.available && expOnly.screen === EVIDENCE_SCREEN.EXPERIMENT_COMPARISON && expOnly.experimentId === 'EXP-D-100',
    'an experiment-only record opens SCR-07, its strongest evidence');
  check('F3', !badStatus.ok && badStatus.problems.some((p) => p.includes('IN_PROGRESS')),
    'a record whose status is not OPEN/RESOLVED is flagged, not silently accepted');
}

// F4: SCR-08 lists the generated findings and opens each at its evidence.
{
  const { client, sent } = recorder();
  const model = createFindings(client, { studyId: 'STUDY_DEMO' });
  const s = await model.list();
  const row = s.items[0];
  check('F4', s.view.state === STATE.SUCCESS && s.items.length === 1 && sent[0].endpointId === 'findings_list',
    `findings_list -> ${s.view.state}, ${s.items.length} row`);
  check('F4', row?.ok && row.finding.status === 'OPEN' && row.finding.revision === 1 && row.finding.type !== null
    && row.location.available && row.location.screen === 'SCR-03' && row.location.caseId === row.finding.evidence.case_id
    && row.location.sliceIndex === row.finding.evidence.slice_index,
  `the generated row (evidence ${row?.finding.evidence?.case_id} slice ${row?.finding.evidence?.slice_index}, revision ` +
    `${row?.finding.revision}) opens SCR-03 exactly there`);
}

// F5: create from a case/slice context, then open it back (TC-FIND-001).
{
  const { client, sent } = recorder();
  const model = createFindings(client, { studyId: 'STUDY_DEMO' });
  await model.list();
  const s = await model.create(DRAFT, { shape: SHAPE });
  const body = sent[sent.length - 1].body;
  check('F5', s.view.state === STATE.SUCCESS && sent[sent.length - 1].endpointId === 'finding_create'
    && body.study_id === 'STUDY_DEMO' && body.case_id === 'CASE_0043' && body.analysis_run_id === 'RUN_0043'
    && body.slice_index === 44 && body.experiment_id === 'EXP_DEMO' && body.finding_type === 'UNDER_SEGMENTATION'
    && body.region_reference.x === 301 && body.note === DRAFT.note,
  'finding_create carries study/experiment/case/run/slice/type/note/region in the contract\'s field names');
  const created = s.lastCreated;
  check('F5', Boolean(created?.finding.findingId) && created.finding.status === 'OPEN' && created.finding.caseId === 'CASE_0043'
    && created.finding.revision === 1 && created.finding.evidence !== null && s.items.length === 2 && s.items[0] === created,
  `created ${created?.finding.findingId} (${created?.finding.status}), anchored to the context it was created from, listed first`);
  const loc = model.open(created?.finding.findingId);
  check('F5', loc.available && loc.screen === 'SCR-03' && loc.caseId === 'CASE_0043' && loc.sliceIndex === 44
    && loc.precision === 'REGION',
  `opening it returns to ${loc.screen} ${loc.caseId} slice ${loc.sliceIndex} with its region`);
  check('F5', sent.every((c) => c.endpointId === 'findings_list' || c.endpointId === 'finding_create'),
    'only finding endpoints were called - a finding never writes an MRI, prediction or metric artifact (FR-FIND-004)');
}

// F6: an invalid draft is refused before sending; the list is untouched.
{
  const { client, sent } = recorder();
  const model = createFindings(client, { studyId: 'STUDY_DEMO' });
  const listed = await model.list();
  const n = sent.length;
  const s = await model.create({ ...DRAFT, type: 'MISSED_SPOT', sliceIndex: undefined });
  check('F6', s.rejection?.code === 'VALIDATION_ERROR' && s.rejection.problems.length === 2 && sent.length === n
    && s.view === listed.view && s.items.length === listed.items.length && s.items[0] === listed.items[0],
  `refused locally (${s.rejection?.problems.join('; ')}), nothing sent, view and list unchanged`);
}

// F7: a server refusal is a state, and the list survives it.
{
  const { client } = recorder();
  const model = createFindings(client, { studyId: 'STUDY_DEMO' });
  await model.list();
  const s = await model.create(DRAFT, { scenario: 'error_case' });
  const allowed = contract.endpointsById.get('finding_create').errors;
  check('F7', s.view.state !== STATE.SUCCESS && allowed.includes(s.view.error?.code) && s.lastCreated === null
    && s.items.length === 1 && (s.view.state !== STATE.FATAL_INVALID || !s.view.actions.includes(RECOVERY.RETRY)),
  `finding_create error_case -> ${s.view.state} ${s.view.error?.code}; nothing added, the listed finding is still there`);
}

// F8: guards - a study is required; a status outside OPEN/RESOLVED is drift.
{
  let threw = false;
  try { createFindings(recorder().client, {}); } catch { threw = true; }
  const drift = (resolved, response) => (resolved.endpointId === 'finding_create' && response.data
    ? { ...response, data: { ...response.data, status: 'IN_PROGRESS' } } : response);
  const { client } = recorder(drift);
  const s = await createFindings(client, { studyId: 'STUDY_DEMO' }).create(DRAFT);
  check('F8', threw && s.view.state === STATE.FATAL_INVALID && s.view.error.code === 'CONTRACT_DRIFT',
    'no study id -> refused at construction; a created finding answering IN_PROGRESS -> CONTRACT_DRIFT');
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'} V4 findings — ${count - failures}/${count}`);
process.exit(failures === 0 ? 0 : 1);
