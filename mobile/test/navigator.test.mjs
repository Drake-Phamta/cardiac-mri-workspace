// node --test mobile/test/  - the state-based navigator (src/nav/navigator.mjs, src/nav/screens.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DEPTH, NAV, NavError, bindNav, canGoBack, initialNavState, navReducer, top, validateRoute,
} from '../src/nav/navigator.mjs';
import { ROOT_SCREEN_ID, SCREEN_IDS, TABS, missingParams, screenMeta } from '../src/nav/screens.mjs';

test('N1 the table registers exactly SCR-01..SCR-08, and the root is Study Overview (`10` §2)', () => {
  assert.deepEqual([...SCREEN_IDS], ['SCR-01', 'SCR-02', 'SCR-03', 'SCR-04', 'SCR-05', 'SCR-06', 'SCR-07', 'SCR-08']);
  assert.equal(ROOT_SCREEN_ID, 'SCR-01');
  assert.equal(top(initialNavState()).screenId, 'SCR-01');
});

test('N2 ownership follows `14` §3 and DR-013a (SCR-04 is V1)', () => {
  const v = (id) => screenMeta(id).vertical;
  assert.deepEqual(['SCR-02', 'SCR-03', 'SCR-04'].map(v), ['V1', 'V1', 'V1']);
  assert.equal(v('SCR-05'), 'V2');
  assert.deepEqual(['SCR-01', 'SCR-07'].map(v), ['V3', 'V3']);
  assert.deepEqual(['SCR-06', 'SCR-08'].map(v), ['V4', 'V4']);
});

test('N3 the tab bar is the first level of the `10` §2 tree', () => {
  assert.deepEqual(TABS.map((t) => t.screenId), ['SCR-01', 'SCR-02', 'SCR-07', 'SCR-08']);
});

test('N4 push / pop / replace / reset', () => {
  let s = initialNavState('SCR-02');
  assert.equal(canGoBack(s), false);
  s = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'CASE_0043' } });
  assert.equal(top(s).screenId, 'SCR-03');
  assert.equal(top(s).params.caseId, 'CASE_0043');
  assert.equal(canGoBack(s), true);
  s = navReducer(s, { type: NAV.REPLACE, screenId: 'SCR-03', params: { caseId: 'CASE_0044' } });
  assert.equal(s.stack.length, 2);
  assert.equal(top(s).params.caseId, 'CASE_0044');
  s = navReducer(s, { type: NAV.POP });
  assert.equal(top(s).screenId, 'SCR-02');
  s = navReducer(s, { type: NAV.RESET, screenId: 'SCR-08', params: {} });
  assert.deepEqual(s.stack.map((e) => e.screenId), ['SCR-08']);
});

test('N5 pop at the root is a no-op that returns the same state (Android back then exits)', () => {
  const s = initialNavState();
  assert.equal(navReducer(s, { type: NAV.POP }), s);
});

test('N6 every entry gets a unique key, so a re-pushed screen re-mounts and re-fetches', () => {
  let s = initialNavState('SCR-02');
  s = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'A' } });
  const first = top(s).key;
  s = navReducer(s, { type: NAV.POP });
  s = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'A' } });
  assert.notEqual(top(s).key, first);
});

test('N7 a screen cannot open without its required params - no screen invents its subject', () => {
  assert.deepEqual(missingParams('SCR-03', {}), ['caseId']);
  assert.deepEqual(missingParams('SCR-04', { caseId: 'C' }), ['runId', 'variant']);
  assert.throws(() => validateRoute('SCR-03', {}), (e) => e instanceof NavError && e.code === 'MISSING_PARAMS');
  assert.throws(() => validateRoute('SCR-99', {}), (e) => e instanceof NavError && e.code === 'UNKNOWN_SCREEN');
  assert.throws(() => navReducer(initialNavState(), { type: 'JUMP' }), /unknown navigation action/);
});

test('N8 bindNav validates before dispatch and reports instead of throwing out of a tap handler', () => {
  const dispatched = [];
  const errors = [];
  const nav = bindNav((a) => dispatched.push(a), initialNavState('SCR-02'), (e) => errors.push(e.code));
  assert.equal(nav.push('SCR-03', {}), false);
  assert.deepEqual(errors, ['MISSING_PARAMS']);
  assert.equal(dispatched.length, 0);
  assert.equal(nav.push('SCR-03', { caseId: 'CASE_0043' }), true);
  assert.deepEqual(dispatched, [{ type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'CASE_0043' } }]);
  assert.equal(nav.pop(), false, 'nothing to pop at the root');
  assert.equal(nav.canGoBack, false);
});

test('N9 the stack is bounded', () => {
  let s = initialNavState('SCR-02');
  for (let i = 0; i < MAX_DEPTH + 7; i += 1) {
    s = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: `C${i}` } });
  }
  assert.equal(s.stack.length, MAX_DEPTH);
  assert.equal(top(s).params.caseId, `C${MAX_DEPTH + 6}`);
});

test('N10 states and params are frozen - a screen cannot mutate the route it was given', () => {
  const s = navReducer(initialNavState(), { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'C' } });
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.stack) && Object.isFrozen(top(s).params));
});
