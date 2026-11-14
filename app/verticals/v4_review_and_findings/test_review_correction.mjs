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
// (run, source mask) are read from the generated scenarios, never typed; the
// case id is only a route value (case_get does not echo it back).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContract, createBundle, createClient, createFixtureTransport, getScenario, RECOVERY, STATE } from '../../core/index.mjs';
import {
  createReviewCorrection, checkTransition, latestVersion, REVIEW_STATUS, REVIEW_TRANSITIONS, REVIEW_RULES, PREDICTION_VARIANT,
} from './index.mjs';
import { createBrushSession, SOURCE_KIND, SOURCE_KIND_FOR_VARIANT, MASK_STATE, TOOL } from './brush.mjs';

const ROOT = new URL('../../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const contract = createContract(readJson('contracts/api/contract.json'));
const bundle = createBundle(contract, readJson('app/core/fixtures/.generated/api_bundle.json'));

const RUN = getScenario(bundle, 'analysis_run_get', 'default').response.data;
const CASE = getScenario(bundle, 'case_get', 'default').response.data;
const [NX, NY] = CASE.shape;
// review_create must answer the run it was opened for (QA-063 N-2), so the run
// id is the one the generated review_create answers - not a typed literal.
const REVIEW = getScenario(bundle, 'review_create', 'default').response.data;
const OPEN = { caseId: 'CASE_0043', runId: REVIEW.run_id, sourceMaskId: RUN.raw_prediction_artifact_id, predictionVariant: 'RAW' };

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
  const ref = contract.raw.domain_enums;
  const r = contract.raw.review_rules;
  const statusOk = sameList(sorted(Object.keys(REVIEW_STATUS)), sorted(ref.review_status))
    && Object.entries(REVIEW_STATUS).every(([k, v]) => k === v);
  const keysOk = Object.keys(ref.review_status_transitions).every((k) => ref.review_status.includes(k));
  const transOk = ref.review_status.every((s) => sameList(sorted(REVIEW_TRANSITIONS[s] ?? []), sorted(ref.review_status_transitions[s] ?? [])));
  const rulesOk = REVIEW_RULES.initialState === r.initial_state && REVIEW_RULES.commitResultState === r.commit_result_state
    && sameList(sorted(REVIEW_RULES.terminalStates), sorted(r.terminal_states))
    && REVIEW_RULES.correctedOnlyVia === r.corrected_only_via;
  const variantOk = sameList(sorted(Object.keys(PREDICTION_VARIANT)), sorted(ref.prediction_variant));
  // QA-063 N-4: a review's source is a prediction (review_source_mask_kind), never GROUND_TRUTH or REVIEWED.
  const kindsOk = sameList(sorted(Object.keys(SOURCE_KIND)), sorted(ref.review_source_mask_kind))
    && ref.review_source_mask_kind.every((k) => ref.source_mask_kind.includes(k) && k !== 'GROUND_TRUTH')
    && sameList(sorted(Object.values(SOURCE_KIND_FOR_VARIANT)), sorted(ref.review_source_mask_kind))
    && contract.raw.enum_bindings.review_source_mask_kind.includes('review_commit.source_mask_kind');
  check('V4-0', statusOk && keysOk && transOk && rulesOk && variantOk && kindsOk,
    `4 states, ${Object.values(REVIEW_TRANSITIONS).flat().length} transitions, review_rules (initial / commit result / ` +
    `terminal / corrected only via ${r.corrected_only_via}), prediction variants and editable source kinds equal ` +
    `contract.json ${contract.contractVersion}`);
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

// V4-2: the transition table is `05` §6, pair by pair (TC-REV-001), and the
// edges into CORRECTED belong to the commit alone (corrected_only_via).
{
  const S = Object.keys(REVIEW_STATUS);
  const patchable = new Set(['NOT_REVIEWED>ACCEPTED', 'NOT_REVIEWED>FLAGGED', 'ACCEPTED>FLAGGED']);
  const byCommit = new Set(['NOT_REVIEWED>CORRECTED', 'FLAGGED>CORRECTED', 'ACCEPTED>CORRECTED']);
  const wrong = [];
  for (const from of S) {
    for (const to of S) {
      const got = checkTransition(from, to);
      const key = `${from}>${to}`;
      if (got.ok !== patchable.has(key)) wrong.push(key);
      if (byCommit.has(key) && got.code !== 'CORRECTED_BY_COMMIT_ONLY') wrong.push(`${key} code ${got.code}`);
      if (!got.ok && !byCommit.has(key) && got.code !== 'INVALID_REVIEW_TRANSITION') wrong.push(`${key} code ${got.code}`);
      if (got.ok && got.confirm !== (from === 'ACCEPTED')) wrong.push(`${key} confirm`);
    }
  }
  const unknown = checkTransition('NOT_REVIEWED', 'APPROVED').code === 'REVIEW_STATUS_UNKNOWN'
    && checkTransition('IN_PROGRESS', 'FLAGGED').code === 'REVIEW_STATUS_UNKNOWN'
    && checkTransition('NOT_REVIEWED', 'toString').code === 'REVIEW_STATUS_UNKNOWN';
  check('V4-2', wrong.length === 0 && unknown,
    `16/16 pairs: 3 can be PATCHed (leaving ACCEPTED needs confirmation), the 3 edges into CORRECTED are the ` +
    `commit's alone, a repeat is not a transition; APPROVED / IN_PROGRESS are not states` +
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
  const corrected = await model.patchStatus(REVIEW_STATUS.CORRECTED);
  check('V4-3', back.rejection?.code === 'INVALID_REVIEW_TRANSITION' && corrected.rejection?.code === 'CORRECTED_BY_COMMIT_ONLY'
    && corrected.status === 'FLAGGED' && corrected.revision === flagged.revision && sent.length === n1,
  'FLAGGED -> ACCEPTED and a PATCH to CORRECTED are refused before sending; status and revision unchanged');
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
  // QA-063 N-2: a review answered for another run, or for no run, is drift too.
  const c = await fresh(inject('run_id', 'RUN_9999')).model.open(OPEN);
  const d = await fresh(inject('run_id', undefined)).model.open(OPEN);
  const e = await fresh(inject('prediction_variant', 'PROCESSED')).model.open(OPEN);
  check('V4-7', [a, b, c, d, e].every((s) => s.view.state === STATE.FATAL_INVALID && s.view.error.code === 'CONTRACT_DRIFT'
    && !s.view.actions.includes(RECOVERY.RETRY) && s.canWrite === false),
  'review_create answering IN_PROGRESS, another source mask, another run (N-2), no run, or another variant -> FATAL_INVALID CONTRACT_DRIFT');
  check('V4-7', c.view.error.detail.problems.some((p) => p.startsWith('run_id is RUN_9999')),
    'the drift names the run that came back, not the one that was opened');
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
  const commitAnswer = getScenario(bundle, 'review_commit', 'default').response.data;
  check('V4-8', saved.status === commitAnswer.status && saved.lastCommit.reviewed_mask_id === commitAnswer.reviewed_mask_id
    && !before.some((v) => v.reviewed_mask_id === commitAnswer.reviewed_mask_id),
  `the status is read from the commit answer (${commitAnswer.status}), and the version id ${commitAnswer.reviewed_mask_id} is new`);
  // The fixture answers every commit with the same id, so a second save in
  // the same session gets back an id that is already a version: that would
  // be an overwrite, and it is refused - nothing appended, nothing marked saved.
  s.setTool(TOOL.ERASE);
  s.beginStroke(45);
  s.sample(305.5, 282.5, { zoom: 1, panX: 0, panY: 0 });
  s.endStroke();
  const m = sent.length;
  const second = await model.saveCorrection(s);
  check('V4-8', second.view.state === STATE.FATAL_INVALID && second.view.error.code === 'CONTRACT_DRIFT'
    && second.view.actions.includes(RECOVERY.REFRESH) && second.reviewedMasks.length === before.length + 1
    && s.state().maskState === MASK_STATE.UNSAVED && !sent.slice(m).some((c) => c.endpointId === 'review_patch'),
  'a commit that answers an existing version id is refused as drift: nothing appended, the edit stays UNSAVED, REFRESH offered');
  // The generated fixture answers review_create NOT_REVIEWED with one version
  // listed, whatever was committed. After REFRESH the server therefore does not
  // list this session's base (the version it just committed), and saving over a
  // base the server does not hold is refused (QA-063 N-4) - nothing is sent.
  await model.refresh();
  const k = sent.length;
  const stale = await model.saveCorrection(s);
  check('V4-8', stale.rejection?.code === 'BASE_VERSION_MISMATCH' && sent.length === k && s.state().maskState === MASK_STATE.UNSAVED,
    'after REFRESH the server no longer lists the base this session continues from: refused, nothing sent, the edit stays');
  const fresh2 = editedSession();
  const third = await model.saveCorrection(fresh2);
  check('V4-8', third.view.state === STATE.SUCCESS && third.status === 'CORRECTED' && fresh2.state().maskState === MASK_STATE.SAVED,
    'a session over the reloaded review saves as a new version, the review is CORRECTED, no PATCH');
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

// V4-13: a fresh review has no reviewed mask - an empty list is a list, not
// drift (contract v1.0 row_fields, the generated `empty` scenario).
{
  const { model } = fresh();
  const opened = await model.open({ ...OPEN, scenarios: { reviewed_masks_list: 'empty' } });
  const corrected = opened.transitions.find((t) => t.to === 'CORRECTED');
  check('V4-13', opened.view.state === STATE.SUCCESS && opened.reviewedMasks.length === 0 && opened.canWrite
    && corrected && !corrected.ok && corrected.code === 'CORRECTED_BY_COMMIT_ONLY',
  `a review with no reviewed mask opens (${opened.reviewedMasks.length} versions); CORRECTED is offered only through a save`);
  const saved = await model.saveCorrection(editedSession());
  check('V4-13', saved.view.state === STATE.SUCCESS && saved.status === 'CORRECTED' && saved.reviewedMasks.length === 1,
    'its first save creates the first version, and the review is CORRECTED');
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

// V4-14 (QA-063 N-1): the commit's answer is validated - status, source mask id
// and source kind - and a refused answer leaves the session UNSAVED and the
// version list as it was. Fault injection over the GENERATED response.
{
  const injectCommit = (field, value) => (resolved, response) => (resolved.endpointId === 'review_commit' && response.data
    ? { ...response, data: { ...response.data, [field]: value } } : response);
  const rows = [
    ['status FLAGGED', 'status', 'FLAGGED'], ['status ACCEPTED', 'status', 'ACCEPTED'], ['no status', 'status', undefined],
    ['a foreign source mask', 'source_mask_id', 'SOMEONE_ELSES_MASK'], ['no source mask', 'source_mask_id', undefined],
    ['GROUND_TRUTH kind', 'source_mask_kind', 'GROUND_TRUTH'], ['the other prediction kind', 'source_mask_kind', 'PROCESSED_PREDICTION'],
    ['no kind', 'source_mask_kind', undefined],
    ['no version id', 'reviewed_mask_id', undefined], ['an empty version id', 'reviewed_mask_id', ''],
    ['no checksum', 'checksum', undefined], ['a malformed checksum', 'checksum', 'md5:abc'],
  ];
  const wrong = [];
  for (const [label, field, value] of rows) {
    const { model } = fresh(injectCommit(field, value));
    const opened = await model.open(OPEN);
    const s = editedSession();
    const r = await model.saveCorrection(s);
    const ok = r.view.state === STATE.FATAL_INVALID && r.view.error.code === 'CONTRACT_DRIFT'
      && r.view.actions.includes(RECOVERY.REFRESH) && r.reviewedMasks.length === opened.reviewedMasks.length
      && r.status === opened.status && s.state().maskState === MASK_STATE.UNSAVED && r.lastCommit === null;
    if (!ok) wrong.push(label);
  }
  check('V4-14', wrong.length === 0,
    `${rows.length}/${rows.length} wrong review_commit answers are CONTRACT_DRIFT: nothing appended, the status kept, the edit stays UNSAVED, REFRESH offered` +
    (wrong.length ? ` — accepted: ${wrong.join(', ')}` : ''));
  const good = fresh();
  await good.model.open(OPEN);
  const saved = await good.model.saveCorrection(editedSession());
  check('V4-14', saved.view.state === STATE.SUCCESS && saved.status === 'CORRECTED'
    && saved.lastCommit.source_mask_id === OPEN.sourceMaskId && saved.lastCommit.source_mask_kind === 'RAW_PREDICTION',
  'the generated answer passes: CORRECTED, the review source mask, RAW_PREDICTION for a RAW review');
}

// V4-15 (QA-063 N-3): a save with nothing changed since the last commit is
// NOTHING_TO_SAVE and sends nothing - no duplicate version.
{
  let n = 0;
  const uniqueCommits = (resolved, response) => {
    if (resolved.endpointId !== 'review_commit' || !response.data) return response;
    n += 1;
    return { ...response, data: { ...response.data, reviewed_mask_id: `REVIEWED_MASK_TEST_${n}`,
      provenance: { ...response.data.provenance, version: 10 + n } } };
  };
  const { model, sent } = fresh(uniqueCommits);
  await model.open(OPEN);
  const s = editedSession();
  const first = await model.saveCorrection(s);
  const k = sent.length;
  const again = await model.saveCorrection(s);
  check('V4-15', first.view.state === STATE.SUCCESS && again.rejection?.code === 'NOTHING_TO_SAVE' && sent.length === k
    && again.reviewedMasks.length === first.reviewedMasks.length && again.canWrite,
  'a second save right after a save: NOTHING_TO_SAVE, nothing sent, no duplicate version');
  s.setTool(TOOL.ERASE);
  s.beginStroke(45);
  s.sample(305.5, 282.5, { zoom: 1, panX: 0, panY: 0 });
  s.endStroke();
  const j = sent.length;
  const next = await model.saveCorrection(s);
  const calls = sent.slice(j);
  check('V4-15', next.view.state === STATE.SUCCESS && calls.map((c) => `${c.endpointId}${c.body?.slice_index ?? ''}`).join(',') === 'working_mask_put45,review_commit'
    && next.reviewedMasks.length === first.reviewedMasks.length + 1 && next.lastCommit.reviewed_mask_id === 'REVIEWED_MASK_TEST_2',
  'a real edit after a save sends ONLY the changed slice (45), and commits the next version');
  // Undoing that edit again differs from the commit, so it is a real change to save; once saved, nothing is left.
  s.undo();
  const u = sent.length;
  const undone = await model.saveCorrection(s);
  const again2 = await model.saveCorrection(s);
  check('V4-15', s.state().maskState === MASK_STATE.SAVED && undone.view.state === STATE.SUCCESS
    && again2.rejection?.code === 'NOTHING_TO_SAVE' && sent.slice(u).filter((c) => c.endpointId === 'review_commit').length === 1,
  'undoing a committed edit is a change (one more version); saving again straight after is NOTHING_TO_SAVE');
}

// V4-16 (QA-063 N-4): continuing a review that is already CORRECTED.
{
  const corrected = (resolved, response) => (resolved.endpointId === 'review_create' && response.data
    ? { ...response, data: { ...response.data, status: 'CORRECTED' } } : response);
  const baseOf = getScenario(bundle, 'reviewed_masks_list', 'default').response.data.items[0].reviewed_mask_id;
  const { model, sent } = fresh(corrected);
  const opened = await model.open(OPEN);
  check('V4-16', opened.status === 'CORRECTED' && opened.baseVersion?.reviewed_mask_id === baseOf
    && opened.latestVersion?.reviewed_mask_id === baseOf && opened.sourceMaskId === OPEN.sourceMaskId,
  `a CORRECTED review opens with the latest version (${baseOf}) as its base, and the original prediction as its source`);
  const fresh1 = await fresh().model.open(OPEN);
  check('V4-16', fresh1.baseVersion === null, 'a review with no commit (NOT_REVIEWED) has no base version');

  const cont = (baseId, over = {}) => {
    const sess = createBrushSession({
      nx: NX, ny: NY, source: { maskId: OPEN.sourceMaskId, kind: SOURCE_KIND.RAW_PREDICTION, variant: 'RAW', ...over },
      base: baseId === null ? null : { reviewedMaskId: baseId },
    });
    // Slice 44 was corrected before (base != source); slice 45 never was (base == source).
    sess.loadSlice(44, blob(300, 280, 60), baseId === null ? {} : { base: blob(300, 280, 70) });
    sess.loadSlice(45, blob(305, 282, 58), baseId === null ? {} : { base: blob(305, 282, 58) });
    return sess;
  };
  const refuse = async (label, session, code) => {
    const n = sent.length;
    const r = await model.saveCorrection(session);
    return [label, r.rejection?.code === code && sent.length === n && r.canWrite];
  };
  const edit = (sess, z, x, y, tool = TOOL.ADD) => {
    sess.setTool(tool);
    sess.setRadius(3);
    sess.beginStroke(z);
    sess.sample(x + 0.5, y + 0.5, { zoom: 1, panX: 0, panY: 0 });
    sess.endStroke();
  };
  const noBase = cont(null);
  edit(noBase, 45, 400, 282);
  const otherBase = cont('SOME_OTHER_VERSION');
  edit(otherBase, 45, 400, 282);
  const processed = cont(baseOf, { kind: SOURCE_KIND.PROCESSED_PREDICTION });
  edit(processed, 45, 400, 282);
  const results = [
    await refuse('a session that starts from the source, not the latest version', noBase, 'BASE_VERSION_MISMATCH'),
    await refuse('a session over another version', otherBase, 'BASE_VERSION_MISMATCH'),
    await refuse('the other prediction kind', processed, 'SOURCE_KIND_MISMATCH'),
  ];
  const untouched = cont(baseOf);
  results.push(await refuse('an untouched continued session (base != source is not an edit)', untouched, 'NOTHING_TO_SAVE'));
  check('V4-16', results.every((r) => r[1]), `${results.length}/${results.length} refused locally, nothing sent: ` +
    results.map((r) => `${r[0]}${r[1] ? '' : ' (WRONG)'}`).join('; '));

  const s = cont(baseOf);
  check('V4-16', s.state().maskState === MASK_STATE.SAVED && s.maskState(44) === MASK_STATE.SAVED
    && s.state().baseId === baseOf && s.savedSlice(44).some((v, i) => v !== s.sourceSlice(44)[i]),
  'the continued session reads SAVED, and its saved layer holds the earlier correction (differs from the source)');
  edit(s, 45, 400, 282);
  const n = sent.length;
  const saved = await model.saveCorrection(s);
  const calls = sent.slice(n);
  check('V4-16', saved.view.state === STATE.SUCCESS && calls.map((c) => `${c.endpointId}${c.body?.slice_index ?? ''}`).join(',') === 'working_mask_put45,review_commit'
    && saved.status === 'CORRECTED' && saved.reviewedMasks.length === opened.reviewedMasks.length + 1
    && s.state().baseId === saved.lastCommit.reviewed_mask_id && s.maskState(45) === MASK_STATE.SAVED,
  'saving a continued review PUTs only the edited slice (the earlier correction on 44 is not re-sent), commits a new version on the CORRECTED review, and moves the session base to it');

  // Reset goes to the ORIGINAL prediction (FR-REV-007), not to the last version; saving it commits the source.
  const r = cont(baseOf);
  r.reset();
  check('V4-16', r.maskState(44) === MASK_STATE.UNSAVED && r.maskState(45) === MASK_STATE.SAVED
    && r.workingSlice(44).every((v, i) => v === r.sourceSlice(44)[i]) && r.state().unsavedSlices.join() === '44',
  'reset returns to the original prediction: slice 44 now differs from the committed version (UNSAVED), slice 45 did not change');
  const again = fresh(corrected);
  await again.model.open(OPEN);
  const done = await again.model.saveCorrection(r);
  const puts = again.sent.filter((c) => c.endpointId === 'working_mask_put');
  check('V4-16', done.view.state === STATE.SUCCESS && puts.length === 1 && puts[0].body.slice_index === 44
    && sha(unpack(puts[0].body.mask_payload)) === sha(r.sourceSlice(44)),
  'saving after a reset commits the source prediction for slice 44 only');
  // cancel returns to the last committed version, not to the source.
  const c = cont(baseOf);
  edit(c, 44, 420, 282);
  c.cancel();
  check('V4-16', c.maskState(44) === MASK_STATE.SAVED && c.savedSlice(44).every((v, i) => v === c.workingSlice(44)[i]),
    'cancel returns to the latest committed version');

  // A session needs the base slice for every slice it loads, and declares it up front.
  const onlySource = createBrushSession({ nx: NX, ny: NY, source: { maskId: OPEN.sourceMaskId, kind: SOURCE_KIND.RAW_PREDICTION }, base: { reviewedMaskId: baseOf } });
  let missing = null;
  try { onlySource.loadSlice(44, blob(300, 280, 60)); } catch (err) { missing = err.code; }
  let undeclared = null;
  try {
    createBrushSession({ nx: NX, ny: NY, source: { maskId: OPEN.sourceMaskId, kind: SOURCE_KIND.RAW_PREDICTION } })
      .loadSlice(44, blob(300, 280, 60), { base: blob(300, 280, 70) });
  } catch (err) { undeclared = err.code; }
  let kindErr = null;
  try { createBrushSession({ nx: NX, ny: NY, source: { maskId: OPEN.sourceMaskId, kind: 'REVIEWED' } }); } catch (err) { kindErr = err.code; }
  check('V4-16', missing === 'BASE_SLICE_MISSING' && undeclared === 'BASE_NOT_DECLARED' && kindErr === 'SOURCE_NOT_EDITABLE',
    `a continued session refuses a slice without its base (${missing}), a base it was not built for (${undeclared}), and REVIEWED as a source (${kindErr})`);

  // CORRECTED with no version listed is not a state the server can be in.
  const emptyList = await fresh(corrected).model.open({ ...OPEN, scenarios: { reviewed_masks_list: 'empty' } });
  check('V4-16', emptyList.view.state === STATE.FATAL_INVALID && emptyList.view.error.code === 'CONTRACT_DRIFT',
    'a review that is CORRECTED but lists no version is CONTRACT_DRIFT');
}

// V4-17 (QA_PR99_D39 NB-7): which row is the latest version. The server builds each new version from it, so
// a wrong pick would continue a review from an older correction.
{
  const row = (id, version, revision) => ({ reviewed_mask_id: id, revision, provenance: version === undefined ? null : { version } });
  const idOf = (rows) => latestVersion(rows)?.reviewed_mask_id ?? null;
  const results = [
    ['the highest provenance.version wins whatever the order', idOf([row('b', 2, 1), row('c', 3, 1), row('a', 1, 9)]) === 'c'],
    ['a tie on provenance.version goes to the later row', idOf([row('a', 2, 1), row('b', 2, 1)]) === 'b'],
    ['... in either order', idOf([row('b', 2, 1), row('a', 2, 1)]) === 'a'],
    ['without a version the highest revision wins', idOf([row('a', undefined, 3), row('b', undefined, 5), row('c', undefined, 4)]) === 'b'],
    ['a tie on revision goes to the later row', idOf([row('a', undefined, 4), row('b', undefined, 4)]) === 'b'],
    ['a version that is not an integer is no rank: the revision decides', idOf([
      { ...row('a', 1, 2), provenance: { version: '9' } }, { ...row('b', 1, 5), provenance: { version: '9' } }, { ...row('c', 1, 3), provenance: { version: '9' } },
    ]) === 'b'],
    ['rows with neither: the last row', idOf([{ reviewed_mask_id: 'a' }, { reviewed_mask_id: 'b' }, { reviewed_mask_id: 'c' }]) === 'c'],
    ['no rows, or not a list: nothing', latestVersion([]) === null && latestVersion(undefined) === null && latestVersion('x') === null],
  ];
  check('V4-17', results.every((r) => r[1]), `${results.length}/${results.length} cases: ` +
    results.map((r) => `${r[0]}${r[1] ? '' : ' (WRONG)'}`).join('; '));
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'} V4 review/correction — ${count - failures}/${count}`);
process.exit(failures === 0 ? 0 : 1);
