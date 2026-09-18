// node app/core/tests/test_errors.mjs
//
// Walks all 15 contract codes through classifyError. The point is coverage:
// if someone adds a 16th code to the contract and not to the table, R1 fails
// here rather than showing a blank screen in a vertical.

import { createContract } from '../contract.mjs';
import { STATE, RECOVERY, CLIENT_CODES, classifyError, parseErrorEnvelope } from '../errors.mjs';
import { createChecker, loadContractJson } from './_harness.mjs';

const { check, done } = createChecker();
const contract = createContract(loadContractJson());
const codes = [...contract.errorsByCode.keys()];

// R1 — every contract code is classified, and none falls through to the
// unknown-code branch.
{
  const unmapped = codes.filter((c) => classifyError(contract, c).code !== c);
  check('R1', unmapped.length === 0,
    `all ${codes.length} contract codes are mapped` + (unmapped.length ? ` — ${unmapped.join(', ')}` : ''));
}

// R2 — every classification names a real state and a real recovery action.
{
  const states = new Set(Object.values(STATE));
  const actions = new Set(Object.values(RECOVERY));
  const bad = codes.filter((c) => {
    const r = classifyError(contract, c);
    return !states.has(r.state) || r.actions.some((a) => !actions.has(a));
  });
  check('R2', bad.length === 0, 'every classification uses a declared state and action');
}

// R3 — the http_status always comes from the contract, never from the table.
{
  const wrong = codes.filter((c) =>
    classifyError(contract, c).httpStatus !== contract.errorsByCode.get(c).httpStatus);
  check('R3', wrong.length === 0, 'http_status is read from the contract for all 15');
}

// R4 — STALE_REVISION never offers RETRY. Retrying a stale write is
// last-write-wins, which revision_rules.last_write_wins_allowed = false bans.
{
  const stale = classifyError(contract, 'STALE_REVISION');
  check('R4', stale.state === STATE.STALE_MISMATCH, `STALE_REVISION -> ${stale.state}`);
  check('R4', !stale.actions.includes(RECOVERY.RETRY) && stale.actions.includes(RECOVERY.REFRESH),
    `offers ${stale.actions.join('/') || 'nothing'}, not RETRY`);
}

// R5 — an absent artifact is UNAVAILABLE, not an empty chart or a zero mask
// (`10` section 7). Both codes that mean "it is not there" agree.
{
  for (const code of ['ARTIFACT_NOT_FOUND', 'GROUND_TRUTH_UNAVAILABLE']) {
    check('R5', classifyError(contract, code).state === STATE.EMPTY_UNAVAILABLE,
      `${code} -> EMPTY_UNAVAILABLE`);
  }
}

// R6 — a wrong reference or an unvalidated geometry blocks the view, and a
// blocked view never invites a retry of the same wrong request.
{
  for (const code of ['CASE_NOT_FOUND', 'SLICE_OUT_OF_RANGE', 'GEOMETRY_NOT_VALIDATED', 'GEOMETRY_MISMATCH']) {
    const r = classifyError(contract, code);
    check('R6', r.state === STATE.FATAL_INVALID && !r.actions.includes(RECOVERY.RETRY),
      `${code} -> ${r.state}, actions ${r.actions.join('/') || 'none'}`);
  }
}

// R7 — the one context-sensitive row. A run that has not succeeded because it
// is still running is PROCESSING, which stays interactive; a run that has
// stopped is unavailable.
{
  const running = classifyError(contract, 'RUN_NOT_SUCCEEDED', { runStatus: 'RUNNING' });
  const queued = classifyError(contract, 'RUN_NOT_SUCCEEDED', { runStatus: 'QUEUED' });
  const done_ = classifyError(contract, 'RUN_NOT_SUCCEEDED', { runStatus: 'FAILED' });
  check('R7', running.state === STATE.PROCESSING && queued.state === STATE.PROCESSING,
    'RUN_NOT_SUCCEEDED while RUNNING/QUEUED -> PROCESSING');
  check('R7', done_.state === STATE.EMPTY_UNAVAILABLE,
    `RUN_NOT_SUCCEEDED while FAILED -> ${done_.state}`);
}

// R8 — an unknown code from a future server is CONTRACT_DRIFT, not a crash
// and not a plausible-looking empty screen.
{
  const r = classifyError(contract, 'SOMETHING_NEW');
  check('R8', r.code === 'CONTRACT_DRIFT' && r.state === STATE.FATAL_INVALID && r.unknownCode === 'SOMETHING_NEW',
    `unknown code -> ${r.code}/${r.state}, remembering ${r.unknownCode}`);
}

// R9 — the client-only codes exist and are not confused with contract codes.
{
  const overlap = Object.keys(CLIENT_CODES).filter((c) => contract.errorsByCode.has(c));
  check('R9', overlap.length === 0, 'no client code shadows a contract code');
  check('R9', classifyError(contract, 'TRANSPORT_UNREACHABLE').retryable === true,
    'TRANSPORT_UNREACHABLE is the one retryable state');
}

// R10 — envelope parsing tolerates both shapes without inventing a code.
{
  const a = parseErrorEnvelope({ error: { code: 'CASE_NOT_FOUND', request_id: 'req_1' } }, 404);
  const b = parseErrorEnvelope({}, 500);
  check('R10', a.code === 'CASE_NOT_FOUND' && a.requestId === 'req_1' && a.httpStatus === 404,
    'wrapped envelope is read');
  check('R10', b.code === null, 'an envelope with no code yields null, not a guess');
}

done('app/core errors');
