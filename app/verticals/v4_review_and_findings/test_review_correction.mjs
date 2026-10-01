// node app/verticals/v4_review_and_findings/test_review_correction.mjs
//
// The SCR-06 review/correction model against the GENERATED fixture bundle.
// Generate it first:
//
//   python contracts/api/generate_fixture.py --contract contracts/api/contract.json \
//          --output app/core/fixtures/.generated/api_bundle.json
//
// Requests are observed through a recording wrapper around the fixture
// transport, so "nothing was sent" is checked, not assumed.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContract, createBundle, createClient, createFixtureTransport, getScenario, RECOVERY, STATE } from '../../core/index.mjs';
import { createReviewCorrection, checkTransition, REVIEW_STATUS, REVIEW_TRANSITIONS } from './index.mjs';
import { createBrushSession, SOURCE_KIND, MASK_STATE, TOOL } from './brush.mjs';

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
      sent.push({ endpointId: resolved.endpointId, body: options.body ?? null, scenario: options.scenario || 'default' });
      const response = await inner.send(resolved, options);
      return transform ? transform(resolved, response) : response;
    },
  };
  return { sent, client: createClient(contract, transport) };
}
const fresh = (transform) => {
  const rec = recorder(transform);
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
const OPEN = { caseId: 'CASE_0043', runId: 'RUN_0043' };

// V4-0: the model's states and transitions ARE the contract's domain_enums.
{
  const enums = contract.raw.domain_enums;
  // TEMPORARY, until A3's contract PR adds domain_enums to contract.json: the
  // values the leader fixed on Day 22 for that key (`05` §6). Delete this
  // fallback once the key is on main, so the contract is the only reference.
  const DECIDED = {
    review_status: ['NOT_REVIEWED', 'ACCEPTED', 'FLAGGED', 'CORRECTED'],
    review_status_transitions: { NOT_REVIEWED: ['ACCEPTED', 'FLAGGED', 'CORRECTED'], FLAGGED: ['CORRECTED'], ACCEPTED: ['FLAGGED', 'CORRECTED'] },
  };
  const ref = enums ?? DECIDED;
  const statusOk = sameList(sorted(Object.keys(REVIEW_STATUS)), sorted(ref.review_status))
    && Object.entries(REVIEW_STATUS).every(([k, v]) => k === v);
  const keysOk = Object.keys(ref.review_status_transitions).every((k) => ref.review_status.includes(k));
  const transOk = ref.review_status.every((s) => sameList(sorted(REVIEW_TRANSITIONS[s] ?? []), sorted(ref.review_status_transitions[s] ?? [])));
  check('V4-0', statusOk && keysOk && transOk,
    `4 states and ${Object.values(REVIEW_TRANSITIONS).flat().length} transitions equal ` +
    `${enums ? 'contract.json domain_enums' : 'the Day-22 domain_enums decision (contract PR not merged yet)'}`);
}

// V4-1: SCR-06 opens by case + run, NOT_REVIEWED, revision visible.
{
  const { model, sent } = fresh();
  const screen = await model.open(OPEN);
  check('V4-1', screen.view.state === STATE.SUCCESS && screen.caseId === 'CASE_0043' && screen.runId === 'RUN_0043',
    `open -> ${screen.view.state} for ${screen.caseId}/${screen.runId}`);
  check('V4-1', screen.status === REVIEW_STATUS.NOT_REVIEWED && sent[0].body.status === REVIEW_STATUS.NOT_REVIEWED,
    `review_create initialises ${sent[0].body.status}; the review reads ${screen.status}`);
  check('V4-1', screen.revision === 1 && screen.reviewId && screen.reviewedMasks.length === 1,
    `revision ${screen.revision}, ${screen.reviewedMasks.length} immutable reviewed-mask version`);
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
    `16/16 pairs as in 05 §6 (6 allowed, leaving ACCEPTED needs confirmation); CORRECTED refused without a saved ` +
    `reviewed mask; APPROVED / IN_PROGRESS are not states` + (wrong.length ? ` — wrong: ${wrong.join(', ')}` : ''));
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

  const corrected = await model.patchStatus(REVIEW_STATUS.CORRECTED);
  const after = await model.patchStatus(REVIEW_STATUS.FLAGGED);
  check('V4-3', corrected.status === 'CORRECTED' && after.rejection?.code === 'INVALID_REVIEW_TRANSITION'
    && corrected.transitions.every((t) => !t.ok),
  'FLAGGED -> CORRECTED with a reviewed mask on record; CORRECTED has no way out');
}

// V4-4: leaving ACCEPTED is a confirmed action (`05` §6 "only if audit history is preserved").
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
  check('V4-5', stale.view.state === STATE.STALE_MISMATCH && stale.canWrite === false,
    `stale response -> ${stale.view.state}, canWrite=${stale.canWrite}`);
  check('V4-5', stale.view.actions.includes(RECOVERY.REFRESH) && !stale.view.actions.includes(RECOVERY.RETRY),
    `actions ${stale.view.actions.join('/')}`);
  check('V4-5', stale.status === 'NOT_REVIEWED' && stale.revision === 1,
    'the failed transition changed neither status nor revision');
  const n = sent.length;
  const blocked = await model.commit();
  check('V4-5', blocked === stale && sent.length === n, 'a stale correction is not resubmitted (nothing sent)');
  const refreshed = await model.refresh();
  check('V4-5', refreshed.view.state === STATE.SUCCESS && refreshed.canWrite && sent[n].endpointId === 'review_create',
    'REFRESH reloads the review and writing is possible again');
}

// V4-6: before open there is nothing to write to - a readable fatal state.
{
  const { model, sent } = fresh();
  const screen = await model.commit();
  const patch = await model.patchStatus(REVIEW_STATUS.FLAGGED);
  check('V4-6', screen.view.state === STATE.FATAL_INVALID && screen.view.error.code === 'REVIEW_NOT_OPEN'
    && patch.view.error.code === 'REVIEW_NOT_OPEN' && sent.length === 0,
  `commit/patch before open -> ${screen.view.error.code}, nothing sent`);
}

// V4-7: a status outside the four is contract drift, not a state to render.
// Fault injection over the GENERATED response (one field changed), not a fixture.
{
  const drift = (resolved, response) => (resolved.endpointId === 'review_create' && response.data
    ? { ...response, data: { ...response.data, status: 'IN_PROGRESS' } } : response);
  const { model } = fresh(drift);
  const screen = await model.open(OPEN);
  check('V4-7', screen.view.state === STATE.FATAL_INVALID && screen.view.error.code === 'CONTRACT_DRIFT'
    && !screen.view.actions.includes(RECOVERY.RETRY) && screen.canWrite === false,
  `review_create answering IN_PROGRESS -> ${screen.view.state} ${screen.view.error.code}`);
}

// A brush session over a declared source, as SCR-06 holds it.
const NX = 64; const NY = 64;
function sourceSlice(cx, cy) {
  const b = new Uint8Array(NX * NY);
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= 100) b[y * NX + x] = 1;
  return b;
}
function editedSession() {
  const s = createBrushSession({ nx: NX, ny: NY, source: { maskId: 'MASK_PROCESSED_0043', kind: SOURCE_KIND.PROCESSED_PREDICTION_MASK } });
  s.loadSlice(44, sourceSlice(30, 30));
  s.loadSlice(45, sourceSlice(34, 28));
  s.setTool(TOOL.ADD);
  s.beginStroke(44);
  const t = { zoom: 8, panX: 0, panY: 0 };
  for (const [x, y] of [[45, 30], [50, 34], [52, 40]]) s.sample(x * 8 + 4, y * 8 + 4, t);
  s.endStroke();
  return s;
}
const WRITES = new Set(['review_patch', 'working_mask_put', 'review_commit']);

// V4-8: save = PUT the edited slice + commit a NEW version (FR-REV-008/009/010).
{
  const { model, sent } = fresh();
  const opened = await model.open(OPEN);
  const s = editedSession();
  const before = opened.reviewedMasks;
  const n = sent.length;
  const saved = await model.saveCorrection(s);
  const calls = sent.slice(n);
  const put = calls[0];
  check('V4-8', saved.view.state === STATE.SUCCESS && calls.map((c) => c.endpointId).join(',') === 'working_mask_put,review_commit',
    `save -> ${saved.view.state}: ${calls.map((c) => c.endpointId).join(' + ')} (only the edited slice, no status change)`);
  check('V4-8', put?.body?.slice_index === 44 && put.body.source_mask_id === 'MASK_PROCESSED_0043'
    && put.body.expected_revision === 1 && put.body.mask_payload.sha256 === sha(s.workingSlice(44)),
  'the PUT names the declared source mask, carries expected_revision and the SHA-256 of exactly the working slice');
  check('V4-8', saved.reviewedMasks.length === before.length + 1 && saved.reviewedMasks[0] === before[0]
    && saved.lastCommit?.reviewed_mask_id && Object.isFrozen(saved.reviewedMasks[1]),
  `a new frozen version appended (${before.length} -> ${saved.reviewedMasks.length}); the earlier one is the same object, untouched`);
  check('V4-8', s.state().maskState === MASK_STATE.SAVED && s.sourceIntact().ok
    && calls.every((c) => WRITES.has(c.endpointId)),
  'the session reads SAVED; source copies intact; no request other than review writes was made');
  // The fixture always lists one earlier version, so "CORRECTED only after a
  // save" cannot be shown through open() here (an empty list is CONTRACT_DRIFT
  // in core today - README known limits); V4-2 holds that rule directly.
  const corr = saved.transitions.find((t) => t.to === 'CORRECTED');
  check('V4-8', corr?.ok === true && saved.status === 'NOT_REVIEWED',
    'the save left the status alone (NOT_REVIEWED); CORRECTED is offered, as a reviewed mask is on record');
}

// V4-9: STALE during the PUT - nothing is committed, the edits survive, REFRESH, save again.
{
  const { model, sent } = fresh();
  await model.open(OPEN);
  const s = editedSession();
  const n = sent.length;
  const stale = await model.saveCorrection(s, { scenarios: { working_mask_put: 'stale_revision' } });
  const noCommit = !sent.slice(n).some((c) => c.endpointId === 'review_commit');
  check('V4-9', stale.view.state === STATE.STALE_MISMATCH && noCommit && s.state().maskState === MASK_STATE.UNSAVED
    && s.state().unsavedSlices.includes(44),
  'stale PUT -> STALE_MISMATCH, no commit sent, the edit is still there and still UNSAVED');
  const n2 = sent.length;
  const again = await model.saveCorrection(s);
  check('V4-9', again === stale && sent.length === n2, 'a second save while stale is refused without sending');
  await model.refresh();
  const ok = await model.saveCorrection(s);
  check('V4-9', ok.view.state === STATE.SUCCESS && s.state().maskState === MASK_STATE.SAVED,
    'after REFRESH the same edits save as a new version');
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
    && put?.body.slice_index === 44 && put.body.mask_payload.sha256 === sha(s.sourceSlice(44)),
  'stale commit, reset, refresh, save: slice 44 is re-sent with the source bytes, so no stale edit rides into the commit');
}

// V4-11: nothing to save is refused locally.
{
  const { model, sent } = fresh();
  await model.open(OPEN);
  const s = createBrushSession({ nx: NX, ny: NY, source: { maskId: 'MASK_RAW_0043', kind: SOURCE_KIND.RAW_PREDICTION_MASK } });
  s.loadSlice(44, sourceSlice(30, 30));
  const n = sent.length;
  const r = await model.saveCorrection(s);
  check('V4-11', r.rejection?.code === 'NOTHING_TO_SAVE' && sent.length === n && r.canWrite,
    'a session equal to its source is not saved (no empty reviewed-mask version)');
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
