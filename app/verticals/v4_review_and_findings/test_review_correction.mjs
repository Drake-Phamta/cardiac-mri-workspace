// node app/verticals/v4_review_and_findings/test_review_correction.mjs
//
// The SCR-06 review/correction model against the GENERATED fixture bundle
// (contract v1.0). Generate it first:
//
//   python contracts/api/generate_fixture.py --contract contracts/api/contract.json \
//          --output app/core/fixtures/.generated/api_bundle.json
//
// Requests are observed through a recording wrapper around the fixture
// transport, so "nothing was sent" is checked, not assumed. The scope ids
// (run, case, source mask) are read from the generated scenarios, never typed.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContract, createBundle, createClient, createFixtureTransport, getScenario, RECOVERY, STATE } from '../../core/index.mjs';
import {
  createReviewCorrection, checkTransition, REVIEW_STATUS, REVIEW_TRANSITIONS, REVIEW_RULES, PREDICTION_VARIANT,
} from './index.mjs';
import { createBrushSession, SOURCE_KIND, MASK_STATE, TOOL } from './brush.mjs';

const ROOT = new URL('../../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const contract = createContract(readJson('contracts/api/contract.json'));
const bundle = createBundle(contract, readJson('app/core/fixtures/.generated/api_bundle.json'));

const RUN = getScenario(bundle, 'analysis_run_get', 'default').response.data;
const CASE = getScenario(bundle, 'case_get', 'default').response.data;
const [NX, NY] = CASE.shape;
const OPEN = { caseId: 'CASE_0043', runId: 'RUN_0043', sourceMaskId: RUN.raw_prediction_artifact_id, predictionVariant: 'RAW' };

function recorder(transform = null, kind = 'fixture') {
  const inner = createFixtureTransport(bundle);
  const sent = [];
  const transport = {
    kind,
    async send(resolved, options) {
      sent.push({ endpointId: resolved.endpointId, body: options.body ?? null, scenario: options.scenario || 'default' });
      const response = await inner.send(resolved, options);
      return transform ? transform(resolved, response) : response;
    },
  };
  return { sent, client: createClient(contract, transport) };
}
const fresh = (transform, kind) => {
  const rec = recorder(transform, kind);
  return { ...rec, model: createReviewCorrection(rec.client) };
};

let failures = 0;
let count = 0;
function check(id, ok, detail) {
  count += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(5)} ${detail}`);
}
const sorted = (xs) => [...xs].sort();
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Independent of maskPayload.mjs: Buffer for base64, a loop for MSB-first bits.
const unpack = (payload) => {
  const packed = Buffer.from(payload.data, 'base64');
  const out = new Uint8Array(NX * NY);
  for (let k = 0; k < out.length; k++) out[k] = (packed[Math.floor(k / 8)] >> (7 - (k % 8))) & 1;
  return out;
};

// V4-0: the model's states, transitions and rules ARE the contract's.
{
  const enums = contract.raw.domain_enums;
  const rules = contract.raw.review_rules;
  // TEMPORARY, until contract v1.0 (#62) is on main: the values the leader
  // fixed on Day 22 for these keys. Delete once the keys are on main, so the
  // contract is the only reference.
  const DECIDED = {
    review_status: ['NOT_REVIEWED', 'ACCEPTED', 'FLAGGED', 'CORRECTED'],
    review_status_transitions: { NOT_REVIEWED: ['ACCEPTED', 'FLAGGED', 'CORRECTED'], FLAGGED: ['CORRECTED'], ACCEPTED: ['FLAGGED', 'CORRECTED'] },
    prediction_variant: ['RAW', 'PROCESSED'],
    source_mask_kind: ['RAW_PREDICTION', 'PROCESSED_PREDICTION', 'GROUND_TRUTH', 'REVIEWED'],
  };
  const DECIDED_RULES = { initial_state: 'NOT_REVIEWED', commit_result_state: 'CORRECTED', terminal_states: ['CORRECTED'] };
  const ref = enums ?? DECIDED;
  const r = rules ?? DECIDED_RULES;
  const statusOk = sameList(sorted(Object.keys(REVIEW_STATUS)), sorted(ref.review_status))
    && Object.entries(REVIEW_STATUS).every(([k, v]) => k === v);
  const keysOk = Object.keys(ref.review_status_transitions).every((k) => ref.review_status.includes(k));
  const transOk = ref.review_status.every((s) => sameList(sorted(REVIEW_TRANSITIONS[s] ?? []), sorted(ref.review_status_transitions[s] ?? [])));
  const rulesOk = REVIEW_RULES.initialState === r.initial_state && REVIEW_RULES.commitResultState === r.commit_result_state
    && sameList(sorted(REVIEW_RULES.terminalStates), sorted(r.terminal_states));
  const variantOk = sameList(sorted(Object.keys(PREDICTION_VARIANT)), sorted(ref.prediction_variant));
  const kindsOk = sameList(sorted(Object.keys(SOURCE_KIND)), sorted(ref.source_mask_kind.filter((k) => k !== 'GROUND_TRUTH')));
  check('V4-0', statusOk && keysOk && transOk && rulesOk && variantOk && kindsOk,
    `4 states, ${Object.values(REVIEW_TRANSITIONS).flat().length} transitions, review_rules (initial / commit result / ` +
    `terminal), prediction variants and editable source kinds equal ` +
    `${enums ? 'contract.json domain_enums + review_rules' : 'the Day-22 decision (contract v1.0 not merged yet)'}`);
}

// V4-1: SCR-06 opens by scope, NOT_REVIEWED, with the case geometry and the revision.
{
  const { model, sent } = fresh();
  const screen = await model.open(OPEN);
  const create = sent.find((c) => c.endpointId === 'review_create');
  check('V4-1', screen.view.state === STATE.SUCCESS && sent.map((c) => c.endpointId).join(',') === 'case_get,review_create,reviewed_masks_list',
    `open -> ${screen.view.state}: ${sent.map((c) => c.endpointId).join(' + ')}`);
  check('V4-1', create.body.status === 'NOT_REVIEWED' && create.body.source_mask_id === OPEN.sourceMaskId
    && create.body.prediction_variant === 'RAW' && screen.status === 'NOT_REVIEWED',
  `review_create sends status NOT_REVIEWED + the scope (${create.body.source_mask_id}, ${create.body.prediction_variant}); the review reads ${screen.status}`);
  check('V4-1', screen.geometry.validationStatus === CASE.geometry_validation_status
    && screen.geometry.contractVersion === CASE.geometry_contract_version && screen.geometry.shape[0] === NX
    && screen.revision === 1 && screen.reviewId && screen.reviewedMasks.length >= 1,
  `case geometry ${screen.geometry.validationStatus} ${screen.geometry.shape.join('x')}, revision ${screen.revision}, ` +
    `${screen.reviewedMasks.length} immutable reviewed-mask version`);
}

// V4-2: the transition table is `05` §6, pair by pair (TC-REV-001).
{
  const S = Object.keys(REVIEW_STATUS);
  const allowed = new Set(['NOT_REVIEWED>ACCEPTED', 'NOT_REVIEWED>FLAGGED', 'NOT_REVIEWED>CORRECTED',
    'FLAGGED>CORRECTED', 'ACCEPTED>FLAGGED', 'ACCEPTED>CORRECTED']);
  const wrong = [];
  for (const from of S) {
    for (const to of S) {
      const got = checkTransition(from, to, { hasReviewedMask: true });
      if (got.ok !== allowed.has(`${from}>${to}`)) wrong.push(`${from}>${to}`);
      if (got.ok && got.confirm !== (from === 'ACCEPTED')) wrong.push(`${from}>${to} confirm`);
    }
  }
  const needsMask = ['NOT_REVIEWED', 'FLAGGED', 'ACCEPTED'].every((from) => checkTransition(from, 'CORRECTED').code === 'CORRECTION_NOT_SAVED');
  const unknown = checkTransition('NOT_REVIEWED', 'APPROVED').code === 'REVIEW_STATUS_UNKNOWN'
    && checkTransition('IN_PROGRESS', 'FLAGGED').code === 'REVIEW_STATUS_UNKNOWN'
    && checkTransition('NOT_REVIEWED', 'toString').code === 'REVIEW_STATUS_UNKNOWN';
  check('V4-2', wrong.length === 0 && needsMask && unknown,
    `16/16 pairs as in 05 §6 (6 allowed, a repeat is not one, leaving ACCEPTED needs confirmation); PATCH to ` +
    `CORRECTED refused without a saved reviewed mask; APPROVED / IN_PROGRESS are not states` +
    (wrong.length ? ` — wrong: ${wrong.join(', ')}` : ''));
}

// V4-3: the model enforces the table before sending, and a refusal loses nothing.
{
  const { model, sent } = fresh();
  await model.open(OPEN);
  const n0 = sent.length;
  const r1 = await model.patchStatus('APPROVED');
  const r2 = await model.patchStatus(REVIEW_STATUS.NOT_REVIEWED);
  check('V4-3', r1.rejection?.code === 'REVIEW_STATUS_UNKNOWN' && r2.rejection?.code === 'INVALID_REVIEW_TRANSITION'
    && sent.length === n0 && r2.view.state === STATE.SUCCESS && r2.canWrite && r2.status === 'NOT_REVIEWED',
  'APPROVED and NOT_REVIEWED -> NOT_REVIEWED refused locally: nothing sent, still writable, status kept');

  const flagged = await model.patchStatus(REVIEW_STATUS.FLAGGED);
  const patch = sent[sent.length - 1];
  check('V4-3', flagged.status === 'FLAGGED' && flagged.rejection === null && patch.endpointId === 'review_patch'
    && patch.body.status === 'FLAGGED' && patch.body.expected_revision === 1,
  `NOT_REVIEWED -> FLAGGED sent with expected_revision ${patch.body.expected_revision}; status ${flagged.status}`);

  const n1 = sent.length;
  const back = await model.patchStatus(REVIEW_STATUS.ACCEPTED);
  check('V4-3', back.rejection?.code === 'INVALID_REVIEW_TRANSITION' && back.status === 'FLAGGED'
    && back.revision === flagged.revision && sent.length === n1,
  'FLAGGED -> ACCEPTED refused before sending; status and revision unchanged');
}

// V4-4: leaving ACCEPTED is a confirmed action, for a PATCH and for a save.
{
  const { model, sent } = fresh();
  await model.open(OPEN);
  await model.patchStatus(REVIEW_STATUS.ACCEPTED);
  const n = sent.length;
  const unconfirmed = await model.patchStatus(REVIEW_STATUS.FLAGGED);
  const confirmed = await model.patchStatus(REVIEW_STATUS.FLAGGED, { confirmed: true });
  check('V4-4', unconfirmed.rejection?.code === 'CONFIRMATION_REQUIRED' && unconfirmed.status === 'ACCEPTED'
    && sent.length === n + 1 && confirmed.status === 'FLAGGED',
  'ACCEPTED -> FLAGGED: refused unconfirmed (nothing sent), sent once confirmed');
}

// V4-5: STALE_REVISION locks writes, offers REFRESH never RETRY, and keeps state.
{
  const { model, sent } = fresh();
  await model.open(OPEN);
  const stale = await model.patchStatus(REVIEW_STATUS.FLAGGED, { scenario: 'stale_revision' });
  check('V4-5', stale.view.state === STATE.STALE_MISMATCH && stale.canWrite === false
    && stale.view.actions.includes(RECOVERY.REFRESH) && !stale.view.actions.includes(RECOVERY.RETRY),
  `stale response -> ${stale.view.state}, canWrite=${stale.canWrite}, actions ${stale.view.actions.join('/')}`);
  check('V4-5', stale.status === 'NOT_REVIEWED' && stale.revision === 1,
    'the failed transition changed neither status nor revision');
  const n = sent.length;
  const blocked = await model.commit();
  check('V4-5', blocked === stale && sent.length === n, 'a stale correction is not resubmitted (nothing sent)');
  const refreshed = await model.refresh();
  const again = sent.slice(n).map((c) => c.endpointId).join(',');
  check('V4-5', refreshed.view.state === STATE.SUCCESS && refreshed.canWrite && again === 'case_get,review_create,reviewed_masks_list'
    && refreshed.sourceMaskId === OPEN.sourceMaskId,
  'REFRESH reloads the same scoped review and writing is possible again');
}

// V4-6: before open there is nothing to write to; an open without its scope is refused.
{
  const { model, sent } = fresh();
  const screen = await model.commit();
  const patch = await model.patchStatus(REVIEW_STATUS.FLAGGED);
  const noScope = await model.open({ caseId: 'CASE_0043', runId: 'RUN_0043' });
  const badVariant = await model.open({ ...OPEN, predictionVariant: 'REVIEWED' });
  check('V4-6', screen.view.error.code === 'REVIEW_NOT_OPEN' && patch.view.error.code === 'REVIEW_NOT_OPEN'
    && noScope.view.error.code === 'REVIEW_SCOPE_MISSING' && badVariant.view.error.code === 'REVIEW_SCOPE_MISSING'
    && sent.length === 0,
  'commit/patch before open -> REVIEW_NOT_OPEN; open without source mask / with a variant outside RAW|PROCESSED -> ' +
    'REVIEW_SCOPE_MISSING; nothing sent');
}

// V4-7: a status outside the four, or a review of another scope, is drift.
// Fault injection over the GENERATED response (one field changed), not a fixture.
{
  const inject = (field, value) => (resolved, response) => (resolved.endpointId === 'review_create' && response.data
    ? { ...response, data: { ...response.data, [field]: value } } : response);
  const a = await fresh(inject('status', 'IN_PROGRESS')).model.open(OPEN);
  const b = await fresh(inject('source_mask_id', 'SOMEONE_ELSES_MASK')).model.open(OPEN);
  check('V4-7', [a, b].every((s) => s.view.state === STATE.FATAL_INVALID && s.view.error.code === 'CONTRACT_DRIFT'
    && !s.view.actions.includes(RECOVERY.RETRY) && s.canWrite === false),
  `review_create answering IN_PROGRESS, or a review of another source mask -> FATAL_INVALID CONTRACT_DRIFT`);
}

// A brush session over the review's own source, at the case's slice size.
function blob(cx, cy, r) {
  const b = new Uint8Array(NX * NY);
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) b[y * NX + x] = 1;
  return b;
}
function editedSession(source = { maskId: OPEN.sourceMaskId, kind: SOURCE_KIND.RAW_PREDICTION, variant: 'RAW' }, nx = NX, ny = NY) {
  const s = createBrushSession({ nx, ny, source });
  const z = (b) => (nx === NX && ny === NY ? b : new Uint8Array(nx * ny));
  s.loadSlice(44, z(blob(300, 280, 60)));
  s.loadSlice(45, z(blob(305, 282, 58)));
  s.setTool(TOOL.ADD);
  s.setRadius(3);
  s.beginStroke(44);
  const t = { zoom: 1, panX: 0, panY: 0 };
  for (const [x, y] of [[360, 280], [370, 300], [372, 320]]) s.sample(x + 0.5, y + 0.5, t);
  s.endStroke();
  return s;
}
const WRITES = new Set(['review_patch', 'working_mask_put', 'review_commit']);

// V4-8: save = PUT the edited slice + commit a NEW version, and the commit
// alone makes the review CORRECTED (FR-REV-008/009/010, commit_result_state).
{
  const { model, sent } = fresh();
  const opened = await model.open(OPEN);
  const s = editedSession();
  const before = opened.reviewedMasks;
  const n = sent.length;
  const saved = await model.saveCorrection(s);
  const calls = sent.slice(n);
  const put = calls[0];
  check('V4-8', saved.view.state === STATE.SUCCESS && calls.map((c) => c.endpointId).join(',') === 'working_mask_put,review_commit'
    && saved.status === 'CORRECTED',
  `save -> ${saved.view.state}: ${calls.map((c) => c.endpointId).join(' + ')}, no PATCH; the review is ${saved.status}`);
  check('V4-8', put?.body?.slice_index === 44 && put.body.source_mask_id === OPEN.sourceMaskId && put.body.expected_revision === 1
    && put.body.geometry_validation_status === CASE.geometry_validation_status
    && put.body.geometry_contract_version === CASE.geometry_contract_version,
  `the PUT names the review's source mask, carries expected_revision and echoes the case geometry (${put?.body?.geometry_validation_status})`);
  check('V4-8', put && Object.keys(put.body.mask_payload).sort().join(',') === 'data,encoding'
    && put.body.mask_payload.encoding === 'BITPACK_BASE64' && sha(unpack(put.body.mask_payload)) === sha(s.workingSlice(44)),
  'mask_payload is exactly {encoding: BITPACK_BASE64, data}, and decodes (independently) to the working slice');
  check('V4-8', saved.reviewedMasks.length === before.length + 1 && saved.reviewedMasks[0] === before[0]
    && saved.lastCommit?.reviewed_mask_id && Object.isFrozen(saved.reviewedMasks[saved.reviewedMasks.length - 1]),
  `a new frozen version appended (${before.length} -> ${saved.reviewedMasks.length}); the earlier one is the same object, untouched`);
  check('V4-8', s.state().maskState === MASK_STATE.SAVED && s.sourceIntact().ok && calls.every((c) => WRITES.has(c.endpointId)),
    'the session reads SAVED; source copies intact; no request other than review writes was made');
  // A second save on a CORRECTED review adds a version without a transition.
  s.setTool(TOOL.ERASE);
  s.beginStroke(45);
  s.sample(305.5, 282.5, { zoom: 1, panX: 0, panY: 0 });
  s.endStroke();
  const m = sent.length;
  const second = await model.saveCorrection(s);
  check('V4-8', second.status === 'CORRECTED' && second.reviewedMasks.length === before.length + 2
    && !sent.slice(m).some((c) => c.endpointId === 'review_patch'),
  'saving again on a CORRECTED review adds another version and stays CORRECTED, no PATCH');
}

// V4-9: STALE during the PUT - nothing is committed, the edits survive, REFRESH, save again.
{
  const { model, sent } = fresh();
  await model.open(OPEN);
  const s = editedSession();
  const n = sent.length;
  const stale = await model.saveCorrection(s, { scenarios: { working_mask_put: 'stale_revision' } });
  const noCommit = !sent.slice(n).some((c) => c.endpointId === 'review_commit');
  check('V4-9', stale.view.state === STATE.STALE_MISMATCH && noCommit && stale.status === 'NOT_REVIEWED'
    && s.state().maskState === MASK_STATE.UNSAVED && s.state().unsavedSlices.includes(44),
  'stale PUT -> STALE_MISMATCH, no commit sent, status unchanged, the edit is still there and still UNSAVED');
  const n2 = sent.length;
  const again = await model.saveCorrection(s);
  check('V4-9', again === stale && sent.length === n2, 'a second save while stale is refused without sending');
  await model.refresh();
  const ok = await model.saveCorrection(s);
  check('V4-9', ok.view.state === STATE.SUCCESS && ok.status === 'CORRECTED' && s.state().maskState === MASK_STATE.SAVED,
    'after REFRESH the same edits save as a new version and the review is CORRECTED');
}

// V4-10: STALE at commit - after REFRESH the slice the server already holds is
// sent again, even if the user has reset it to the source meanwhile.
{
  const { model, sent } = fresh();
  await model.open(OPEN);
  const s = editedSession();
  const stale = await model.saveCorrection(s, { scenarios: { review_commit: 'stale_revision' } });
  s.reset();
  await model.refresh();
  const n = sent.length;
  const ok = await model.saveCorrection(s);
  const put = sent.slice(n).find((c) => c.endpointId === 'working_mask_put');
  check('V4-10', stale.view.state === STATE.STALE_MISMATCH && ok.view.state === STATE.SUCCESS
    && put?.body.slice_index === 44 && sha(unpack(put.body.mask_payload)) === sha(s.sourceSlice(44)),
  'stale commit, reset, refresh, save: slice 44 is re-sent with the source bytes, so no stale edit rides into the commit');
}

// V4-11: what a save refuses before sending anything.
{
  const cases = [];
  const run = async (label, setup, session, opts, kind) => {
    const { model, sent } = fresh(null, kind);
    await model.open(OPEN);
    if (setup) await setup(model);
    const n = sent.length;
    const r = await model.saveCorrection(session, opts);
    cases.push([label, r.rejection?.code, sent.length === n, r.canWrite]);
    return model;
  };
  const untouched = createBrushSession({ nx: NX, ny: NY, source: { maskId: OPEN.sourceMaskId, kind: SOURCE_KIND.RAW_PREDICTION } });
  untouched.loadSlice(44, blob(300, 280, 60));
  await run('NOTHING_TO_SAVE', null, untouched);
  await run('SOURCE_MISMATCH', null, editedSession({ maskId: 'ANOTHER_MASK', kind: SOURCE_KIND.RAW_PREDICTION }));
  await run('GEOMETRY_MISMATCH', null, editedSession(undefined, 64, 64));
  await run('SYNTHETIC_SOURCE', null,
    editedSession({ maskId: OPEN.sourceMaskId, kind: SOURCE_KIND.RAW_PREDICTION, synthetic: true }), undefined, 'http');
  const accepted = await run('CONFIRMATION_REQUIRED', (m) => m.patchStatus(REVIEW_STATUS.ACCEPTED), editedSession());
  const wrong = cases.filter(([label, code, nothingSent, writable]) => code !== label || !nothingSent || !writable);
  check('V4-11', wrong.length === 0,
    `${cases.length}/${cases.length} refused locally with nothing sent: nothing to save, another source mask, another ` +
    'slice size, a synthetic stand-in on a real backend, an ACCEPTED review unconfirmed' +
    (wrong.length ? ` — wrong: ${wrong.map((c) => `${c[0]}=${c[1]}`).join(', ')}` : ''));
  const confirmed = await accepted.saveCorrection(editedSession(), { confirmed: true });
  check('V4-11', confirmed.view.state === STATE.SUCCESS && confirmed.status === 'CORRECTED',
    'the same ACCEPTED review saves once confirmed, and the commit makes it CORRECTED');
}

// V4-12: every write any test above made carried expected_revision.
{
  const all = [];
  for (const name of ['stale_revision', 'default']) {
    const { model, sent } = fresh();
    await model.open(OPEN);
    await model.patchStatus(REVIEW_STATUS.FLAGGED, { scenario: name });
    if (name === 'default') await model.saveCorrection(editedSession());
    all.push(...sent);
  }
  const writes = all.filter((c) => WRITES.has(c.endpointId));
  check('V4-12', writes.length >= 3 && writes.every((c) => c.body && 'expected_revision' in c.body),
    `${writes.length}/${writes.length} writes carried expected_revision`);
  const generated = getScenario(bundle, 'review_patch', 'stale_revision');
  check('V4-12', generated?.response?.error?.code === 'STALE_REVISION', 'the stale scenario is the generator\'s own');
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'} V4 review/correction — ${count - failures}/${count}`);
process.exit(failures === 0 ? 0 : 1);
