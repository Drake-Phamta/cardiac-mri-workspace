// node app/core/tests/test_screen_state.mjs
//
// The four invariants in screenState.mjs, checked against all 15 codes rather
// than against the three a reviewer would think of.

import { createContract } from '../contract.mjs';
import { STATE, RECOVERY } from '../errors.mjs';
import * as screen from '../screenState.mjs';
import { createChecker, loadContractJson, throwsCode } from './_harness.mjs';

const { check, done } = createChecker();
const contract = createContract(loadContractJson());
const codes = [...contract.errorsByCode.keys()];
const views = codes.map((c) => [c, screen.stateForError(contract, c)]);

// S1 — data is non-null ONLY in SUCCESS. An error state holding half a payload
// is how a stale mask gets drawn under an error banner.
{
  const leaks = views.filter(([, v]) => v.data !== null);
  check('S1', leaks.length === 0, 'no error state carries data' +
    (leaks.length ? ` — ${leaks.map(([c]) => c).join(', ')}` : ''));
  check('S1', screen.success({ n: 1 }).data.n === 1, 'SUCCESS carries its data');
  check('S1', throwsCode(() => screen.success(null)) === 'SUCCESS_WITHOUT_DATA',
    'SUCCESS with no data is refused');
}

// S2 — FATAL_INVALID never offers RETRY, even if a caller asks for it.
{
  const bad = views.filter(([, v]) => v.state === STATE.FATAL_INVALID && v.actions.includes(RECOVERY.RETRY));
  check('S2', bad.length === 0, 'no FATAL_INVALID offers RETRY');
  const forced = screen.fatalInvalid({ code: 'X' }, [RECOVERY.RETRY, RECOVERY.BACK]);
  check('S2', !forced.actions.includes(RECOVERY.RETRY) && forced.actions.includes(RECOVERY.BACK),
    'an explicit RETRY is stripped rather than honoured');
}

// S3 — STALE_MISMATCH never offers RETRY either, for the revision_rules reason.
{
  const forced = screen.staleMismatch({ code: 'STALE_REVISION' }, [RECOVERY.RETRY]);
  check('S3', !forced.actions.includes(RECOVERY.RETRY), 'RETRY is stripped from STALE_MISMATCH');
  const stale = screen.stateForError(contract, 'STALE_REVISION');
  check('S3', stale.state === STATE.STALE_MISMATCH && stale.actions.includes(RECOVERY.REFRESH),
    `STALE_REVISION -> ${stale.state} offering ${stale.actions.join('/')}`);
}

// S4 — every EMPTY_UNAVAILABLE states a reason. "No data" with no reason is
// indistinguishable from a bug.
{
  const silent = views.filter(([, v]) => v.state === STATE.EMPTY_UNAVAILABLE && !v.reason);
  check('S4', silent.length === 0, 'every unavailable state names its reason');
  check('S4', throwsCode(() => screen.emptyUnavailable(null)) === 'EMPTY_WITHOUT_REASON',
    'an unavailable state with no reason is refused');
}

// S5 — every state object is frozen, so a render pass cannot mutate the state
// it was handed.
{
  const all = [screen.loading(), screen.processing(), screen.success({}), ...views.map(([, v]) => v)];
  check('S5', all.every((v) => Object.isFrozen(v)), `all ${all.length} state objects are frozen`);
}

// S6 — states are exactly the seven declared. A typo'd state string would
// render as nothing at all in a switch.
{
  const declared = new Set(screen.ALL_STATES);
  check('S6', declared.size === 7, `${declared.size} declared states`);
  check('S6', views.every(([, v]) => declared.has(v.state)), 'every produced state is declared');
}

// S7 — the loading/processing pair is the only non-terminal one, because that
// is what a spinner keys off.
{
  check('S7', !screen.isTerminal(screen.loading()) && !screen.isTerminal(screen.processing()),
    'LOADING and PROCESSING are non-terminal');
  check('S7', views.every(([, v]) => (v.state === STATE.PROCESSING) || screen.isTerminal(v)),
    'every other error state is terminal');
}

done('app/core screen state');
