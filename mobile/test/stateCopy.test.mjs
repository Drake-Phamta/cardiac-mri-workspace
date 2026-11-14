// node --test mobile/test/  - what the shared StateView says in each of the 7 states (src/ui/stateCopy.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_STATES, RECOVERY, STATE, emptyUnavailable, fatalInvalid, loading, processing, stateForError, success,
} from '../../app/core/index.mjs';
import { describeState, reasonText, TONE } from '../src/ui/stateCopy.mjs';
import { loadContract } from './_helpers.mjs';

const contract = loadContract();

test('S1 every one of the seven app/core states has a rendering, and none falls through', () => {
  assert.equal(ALL_STATES.length, 7);
  const samples = {
    [STATE.LOADING]: loading(),
    [STATE.PROCESSING]: processing(),
    [STATE.SUCCESS]: success({ ok: true }),
    [STATE.EMPTY_UNAVAILABLE]: stateForError(contract, 'GROUND_TRUTH_UNAVAILABLE'),
    [STATE.RECOVERABLE_ERROR]: stateForError(contract, 'TRANSPORT_UNREACHABLE'),
    [STATE.FATAL_INVALID]: stateForError(contract, 'GEOMETRY_MISMATCH'),
    [STATE.STALE_MISMATCH]: stateForError(contract, 'STALE_REVISION'),
  };
  for (const st of ALL_STATES) {
    const d = describeState(samples[st]);
    assert.equal(d.state, st, st);
  }
});

test('S2 absent ground truth is UNAVAILABLE with a reason that says "not zero" (`10` §7)', () => {
  const d = describeState(stateForError(contract, 'GROUND_TRUTH_UNAVAILABLE'));
  assert.equal(d.title, 'Unavailable');
  assert.match(d.body, /not zero/);
  assert.deepEqual(d.details, ['reason GROUND_TRUTH_UNAVAILABLE']);
  assert.equal(d.blocking, false);
});

test('S3 an unreachable backend offers Retry and names the backend it tried', () => {
  const d = describeState(stateForError(contract, 'TRANSPORT_UNREACHABLE'), { apiBaseUrl: 'http://backend.invalid:8000' });
  assert.equal(d.tone, TONE.WARN);
  assert.deepEqual(d.actions.map((a) => a.id), [RECOVERY.RETRY]);
  assert.ok(d.details.includes('backend http://<configured>'), 'the backend is named, never addressed (N-4)');
  assert.ok(!d.details.some((l) => l.includes('backend.invalid')), 'no host in a panel that may be screenshotted');
});

test('S4 FATAL_INVALID blocks, shows the code and problems, and never offers Retry', () => {
  const view = fatalInvalid({ code: 'CONTRACT_DRIFT', safeMessage: 'x', detail: { problems: ['case_get response is missing shape'] } }, [RECOVERY.RETRY, RECOVERY.BACK]);
  const d = describeState(view);
  assert.equal(d.blocking, true);
  assert.equal(d.tone, TONE.DANGER);
  assert.ok(d.details.includes('code CONTRACT_DRIFT'));
  assert.ok(d.details.includes('case_get response is missing shape'));
  assert.deepEqual(d.actions.map((a) => a.id), [RECOVERY.BACK]);
});

test('S5 STALE_MISMATCH offers Refresh only - retrying a stale write is last-write-wins', () => {
  const d = describeState(stateForError(contract, 'STALE_REVISION'));
  assert.deepEqual(d.actions.map((a) => a.id), [RECOVERY.REFRESH]);
  assert.equal(d.blocking, true);
});

test('S6 PROCESSING never fabricates progress; it shows only what the server reported', () => {
  assert.match(describeState(processing()).body, /has not reported progress/);
  assert.match(describeState(processing(0.42)).body, /42 % \(reported by the server\)/);
  assert.equal(describeState(processing()).spinner, true);
});

test('S7 RUN_NOT_SUCCEEDED while the run is RUNNING is PROCESSING, not an error (`10` §8)', () => {
  const view = stateForError(contract, 'RUN_NOT_SUCCEEDED', { runStatus: 'RUNNING' });
  assert.equal(describeState(view).state, STATE.PROCESSING);
});

test('S8 a placeholder screen is EMPTY_UNAVAILABLE with an explicit reason', () => {
  const d = describeState(emptyUnavailable('SCREEN_NOT_BUILT', [RECOVERY.BACK]));
  assert.match(d.body, /not built yet/);
  assert.deepEqual(d.actions.map((a) => a.label), ['Back']);
});

test('S9 an unknown state is treated as invalid, never as success', () => {
  const d = describeState({ state: 'MAYBE', actions: [] });
  assert.equal(d.state, STATE.FATAL_INVALID);
  assert.equal(d.blocking, true);
});

test('S10 reason text exists for the codes a researcher meets, and is null otherwise', () => {
  for (const code of ['GROUND_TRUTH_UNAVAILABLE', 'TRANSPORT_UNREACHABLE', 'FIXTURE_SCENARIO_MISSING', 'STALE_REVISION', 'CONTRACT_DRIFT']) {
    assert.ok(reasonText(code), code);
  }
  assert.equal(reasonText('NOPE'), null);
});
