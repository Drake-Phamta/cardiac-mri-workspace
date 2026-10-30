// node --test mobile/test/  - the state-based navigator (src/nav/navigator.mjs, src/nav/screens.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DEPTH, NAV, NavError, bindNav, canGoBack, createGuards, initialNavState, navReducer, top, validateRoute,
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

test('N4b #78 QA N-8: a push carries returnParams into the entry it covers, keeping its key; Back shows them', () => {
  let s = initialNavState('SCR-02');
  s = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'CASE_0061' } });
  const explorer = top(s);
  const root = s.stack[0];
  s = navReducer(s, {
    type: NAV.PUSH, screenId: 'SCR-04', params: { caseId: 'CASE_0061', runId: 'RUN_B', variant: 'PROCESSED', sliceIndex: 54 },
    returnParams: { runId: 'RUN_B', variant: 'PROCESSED', sliceIndex: 54 },
  });
  const covered = s.stack[1];
  assert.equal(covered.key, explorer.key, 'the same entry: same key, so the same React key and guard slot');
  assert.deepEqual({ ...covered.params }, { caseId: 'CASE_0061', runId: 'RUN_B', variant: 'PROCESSED', sliceIndex: 54 });
  assert.ok(Object.isFrozen(covered) && Object.isFrozen(covered.params));
  assert.equal(s.stack[0], root, 'entries below are untouched');
  assert.deepEqual({ ...explorer.params }, { caseId: 'CASE_0061' }, 'the old state is not mutated');
  s = navReducer(s, { type: NAV.POP });
  assert.equal(top(s).key, explorer.key);
  assert.deepEqual({ ...top(s).params }, { caseId: 'CASE_0061', runId: 'RUN_B', variant: 'PROCESSED', sliceIndex: 54 });
  // A later push without returnParams leaves the entry as it is; a new one overwrites per key.
  s = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-05', params: { caseId: 'CASE_0061', runId: 'RUN_B' } });
  assert.equal(s.stack[1].params.sliceIndex, 54);
  s = navReducer(navReducer(s, { type: NAV.POP }), {
    type: NAV.PUSH, screenId: 'SCR-05', params: { caseId: 'CASE_0061', runId: 'RUN_B' }, returnParams: { sliceIndex: 12 },
  });
  assert.deepEqual({ ...s.stack[1].params }, { caseId: 'CASE_0061', runId: 'RUN_B', variant: 'PROCESSED', sliceIndex: 12 });
});

test('N4c bindNav.push sends returnParams in the one PUSH action, and a refused leave changes nothing', async () => {
  const dispatched = [];
  const s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'C' } });
  const back = { runId: 'R', variant: 'RAW', sliceIndex: 3 };
  assert.equal(bindNav((a) => dispatched.push(a), s).push('SCR-04', { caseId: 'C', runId: 'R', variant: 'RAW' }, back), true);
  assert.deepEqual(dispatched, [{ type: NAV.PUSH, screenId: 'SCR-04', params: { caseId: 'C', runId: 'R', variant: 'RAW' }, returnParams: back }]);
  const guards = createGuards();
  const nav = bindNav((a) => dispatched.push(a), s, null, guards);
  nav.setLeaveGuard(() => false);
  assert.equal(await nav.push('SCR-04', { caseId: 'C', runId: 'R', variant: 'RAW' }, back), false);
  assert.equal(dispatched.length, 1, 'no action at all - the covered entry keeps its params');
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

test('N11 a leave guard is asked before every way off the screen, and false stays', async () => {
  const dispatched = [];
  const guards = createGuards();
  let s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-06', params: { runId: 'R' } });
  const nav = bindNav((a) => dispatched.push(a.type), s, null, guards);
  const asked = [];
  // Set AFTER the nav object exists, as a screen's effect would.
  nav.setLeaveGuard((intent) => { asked.push(intent.type); return false; });
  assert.equal(nav.hasLeaveGuard(), true);
  assert.equal(await nav.pop(), false);
  assert.equal(await nav.push('SCR-03', { caseId: 'C' }), false);
  assert.equal(await nav.replace('SCR-08', {}), false);
  assert.equal(await nav.reset('SCR-01', {}), false);
  assert.deepEqual(asked, [NAV.POP, NAV.PUSH, NAV.REPLACE, NAV.RESET]);
  assert.deepEqual(dispatched, [], 'nothing moved');
});

test('N12 a guard that answers true (or a Promise of true) lets the action through', async () => {
  const dispatched = [];
  const guards = createGuards();
  const s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-06', params: { runId: 'R' } });
  const nav = bindNav((a) => dispatched.push(a), s, null, guards);
  nav.setLeaveGuard(() => new Promise((r) => setTimeout(() => r(true), 5)));
  const result = nav.pop();
  assert.ok(result instanceof Promise, 'a guarded action answers later');
  assert.equal(await result, true);
  assert.deepEqual(dispatched, [{ type: NAV.POP }]);
});

test('N13 no guard: actions answer at once; a throwing guard stays and reports', async () => {
  const errors = [];
  const guards = createGuards();
  const s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'C' } });
  const plain = bindNav(() => {}, s, null, guards);
  assert.equal(plain.pop(), true, 'synchronous when nobody guards');
  const nav = bindNav(() => { throw new Error('should not dispatch'); }, s, (e) => errors.push(e.message), guards);
  nav.setLeaveGuard(() => { throw new Error('dialog failed'); });
  assert.equal(await nav.pop(), false);
  assert.deepEqual(errors, ['dialog failed']);
  nav.setLeaveGuard(null);
  assert.equal(nav.hasLeaveGuard(), false, 'a guard can be removed');
});

test('N14 a guard lives while its entry is on top: popped or COVERED, it is pruned (#77 QA N-7)', () => {
  const guards = createGuards();
  const s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-06', params: { runId: 'R' } });
  bindNav(() => {}, s, null, guards).setLeaveGuard(() => false);
  assert.equal(guards.size, 1);
  guards.prune([top(navReducer(s, { type: NAV.POP })).key]); // what NavigatorView does: keep the top key only
  assert.equal(guards.size, 0);
  // Covered: SCR-06 lets the push through, unmounts under SCR-08 and its guard goes.
  let asked = 0;
  bindNav(() => {}, s, null, guards).setLeaveGuard(() => { asked += 1; return true; });
  const covered = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-08', params: {} });
  guards.prune([top(covered).key]);
  assert.equal(guards.size, 0, 'the covered screen leaves no guard behind');
  // Back on SCR-06 (same key, re-mounted, nothing to lose yet): back asks nobody.
  const back = navReducer(covered, { type: NAV.POP });
  assert.equal(top(back).key, top(s).key);
  assert.equal(bindNav(() => {}, back, null, guards).pop(), true, 'decided at once - no stale guard asked');
  assert.equal(asked, 0);
});

test('N15 one leave prompt at a time: a second action while a guard is asking is refused at once (#77 QA N-7)', async () => {
  const dispatched = [];
  const guards = createGuards();
  const s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-06', params: { runId: 'R' } });
  const nav = bindNav((a) => dispatched.push(a.type), s, null, guards);
  let asked = 0;
  let answer = null;
  nav.setLeaveGuard(() => { asked += 1; return new Promise((r) => { answer = r; }); });
  const first = nav.pop();
  await Promise.resolve();
  assert.equal(guards.busy, true, 'the first prompt is open');
  assert.equal(nav.pop(), false, 'a second Back is refused, not a second prompt');
  assert.equal(nav.reset('SCR-01', {}), false, 'so is a tab press');
  assert.equal(asked, 1);
  answer(true);
  assert.equal(await first, true);
  assert.deepEqual(dispatched, [NAV.POP]);
  assert.equal(guards.busy, false, 'released once the guard answered');
  // A guard that throws releases too: the next prompt can open.
  nav.setLeaveGuard(() => { throw new Error('dialog failed'); });
  assert.equal(await nav.pop(), false);
  assert.equal(guards.busy, false);
  nav.setLeaveGuard(() => false);
  assert.equal(await nav.pop(), false);
  assert.equal(asked, 1);
});

// ---- QA #98 N-6: the screen that is left adds to what the screen below comes back with -------------------------------

const threeD = { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 52 };

test('N16 a pop merges its returnParams into the entry that becomes the top, keeping its key; nothing else moves', () => {
  let s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-05', params: threeD });
  const root = s.stack[0];
  const threeDEntry = top(s);
  s = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 52 } });
  const before = s;
  const popped = navReducer(s, { type: NAV.POP, returnParams: { sliceIndex: 60 } });
  assert.equal(top(popped).key, threeDEntry.key, 'the same entry: the same React key and guard slot');
  assert.deepEqual({ ...top(popped).params }, { ...threeD, sliceIndex: 60 });
  assert.ok(Object.isFrozen(top(popped)) && Object.isFrozen(top(popped).params));
  assert.equal(popped.stack[0], root, 'entries below are untouched');
  assert.equal(popped.seq, before.seq);
  assert.equal(before.stack[1].params.sliceIndex, 52, 'the old state is not mutated');
  // no returnParams: the very same entry object, as before
  assert.equal(top(navReducer(s, { type: NAV.POP })), threeDEntry);
  // a pop at the root is still a no-op, with or without params
  const alone = initialNavState('SCR-02');
  assert.equal(navReducer(alone, { type: NAV.POP, returnParams: { x: 1 } }), alone);
});

test('N17 setReturnParams: a pop asks the leaving screen for the params of the screen below, at the moment it pops', async () => {
  const dispatched = [];
  const guards = createGuards();
  let s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-05', params: threeD });
  s = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-03', params: threeD });
  const nav = bindNav((a) => dispatched.push(a), s, null, guards);
  let slice = 52;
  const asked = [];
  nav.setReturnParams((below) => { asked.push(below.screenId); return { sliceIndex: slice }; });
  slice = 61;                                           // the user scrubbed after the screen registered
  assert.equal(nav.pop(), true);
  assert.deepEqual(dispatched, [{ type: NAV.POP, returnParams: { sliceIndex: 61 } }], 'the slice at pop time, not at registration');
  assert.deepEqual(asked, ['SCR-05'], 'it is told which screen is below');
  // a push never asks it
  assert.equal(nav.push('SCR-04', { caseId: 'C', runId: 'R', variant: 'RAW' }), true);
  assert.equal(asked.length, 1);
  // through a leave guard: asked after the guard says yes, so it is the state the user left in
  dispatched.length = 0;
  nav.setLeaveGuard(() => new Promise((r) => setTimeout(() => { slice = 70; r(true); }, 5)));
  assert.equal(await nav.pop(), true);
  assert.deepEqual(dispatched, [{ type: NAV.POP, returnParams: { sliceIndex: 70 } }]);
  // a guard that says no changes nothing and asks nobody
  dispatched.length = 0;
  asked.length = 0;
  nav.setLeaveGuard(() => false);
  assert.equal(await nav.pop(), false);
  assert.deepEqual([dispatched, asked], [[], []]);
});

test('N18 a provider that answers nothing usable, or throws, never blocks leaving; setReturnParams(null) removes it', () => {
  const guards = createGuards();
  const errors = [];
  let s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-05', params: threeD });
  s = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-03', params: threeD });
  const dispatched = [];
  const nav = bindNav((a) => dispatched.push(a), s, (e) => errors.push(e.message), guards);
  for (const answer of [null, undefined, 7, 'x', [1, 2], true]) {
    nav.setReturnParams(() => answer);
    assert.equal(nav.pop(), true);
  }
  nav.setReturnParams(() => { throw new Error('provider failed'); });
  assert.equal(nav.pop(), true);
  assert.deepEqual(errors, ['provider failed']);
  assert.ok(dispatched.every((a) => a.type === NAV.POP && !('returnParams' in a)), 'the pop went through without params');
  nav.setReturnParams(() => ({ sliceIndex: 1 }));
  nav.setReturnParams(null);
  dispatched.length = 0;
  assert.equal(nav.pop(), true);
  assert.deepEqual(dispatched, [{ type: NAV.POP }], 'a removed provider is not asked');
  // without a guards object (a bare nav) the registration is a no-op
  const bare = bindNav((a) => dispatched.push(a), s);
  assert.doesNotThrow(() => bare.setReturnParams(() => ({ sliceIndex: 9 })));
  dispatched.length = 0;
  assert.equal(bare.pop(), true);
  assert.deepEqual(dispatched, [{ type: NAV.POP }]);
});

test('N19 a provider lives with its entry: popped or covered, it is pruned with the guards', () => {
  const guards = createGuards();
  const s = navReducer(initialNavState('SCR-02'), { type: NAV.PUSH, screenId: 'SCR-03', params: { caseId: 'C' } });
  bindNav(() => {}, s, null, guards).setReturnParams(() => ({ sliceIndex: 4 }));
  assert.equal(guards.returnSize, 1);
  const covered = navReducer(s, { type: NAV.PUSH, screenId: 'SCR-04', params: { caseId: 'C', runId: 'R', variant: 'RAW' } });
  guards.prune([top(covered).key]);                      // what NavigatorView does after every state change
  assert.equal(guards.returnSize, 0, 'the covered screen unmounted, its provider goes with it');
  assert.equal(guards.getReturn(top(s).key), null);
  // Back on SCR-03 (same key, re-mounted): nobody is asked until the new mount registers again
  const dispatched = [];
  const back = navReducer(covered, { type: NAV.POP });
  bindNav((a) => dispatched.push(a), back, null, guards).pop();
  assert.deepEqual(dispatched, [{ type: NAV.POP }]);
});

test('N20 the round trip: SCR-03 -> SCR-05 -> SCR-03, scrub, Back - SCR-05 reopens on the slice SCR-03 ended on, with its layers and camera', () => {
  const guards = createGuards();
  let state = initialNavState('SCR-03', { caseId: 'CASE_0061' });
  const dispatch = (action) => { state = navReducer(state, action); guards.prune([top(state).key]); };
  // SCR-03 (slice 44) opens the 3D screen
  bindNav(dispatch, state, null, guards).push('SCR-05', { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 },
    { runId: 'RUN_A', variant: 'RAW', sliceIndex: 44 });
  assert.equal(top(state).screenId, 'SCR-05');
  // SCR-05 picks a face in slice 52 and opens it in 2D, leaving its layers and camera for Back
  const layers = { prediction: true, groundTruth: false, falsePositive: true, falseNegative: true };
  const camera = { yaw: -0.2, pitch: 0.4, zoom: 2, pan: [0.1, -0.2] };
  bindNav(dispatch, state, null, guards).push('SCR-03', { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW', sliceIndex: 52 },
    { runId: 'RUN_A', variant: 'RAW', sliceIndex: 52, layers, camera });
  assert.equal(top(state).screenId, 'SCR-03');
  // the 2D screen registers what Back should carry (only for the 3D screen), the user scrubs to slice 60, Back
  let shownSlice = 52;
  const nav2d = bindNav(dispatch, state, null, guards);
  nav2d.setReturnParams(({ screenId }) => (screenId === 'SCR-05' ? { sliceIndex: shownSlice } : null));
  shownSlice = 60;
  assert.equal(nav2d.pop(), true);
  assert.equal(top(state).screenId, 'SCR-05');
  assert.equal(top(state).params.sliceIndex, 60, 'the 3D plane follows the 2D slice on the way back');
  assert.deepEqual({ ...top(state).params.layers }, layers, 'with the layers it had');
  assert.deepEqual(top(state).params.camera, camera, 'and the camera it had');
  // Back again: SCR-03 reopens on the slice it was opened at (44), because SCR-05 registered nothing for it
  const nav3d = bindNav(dispatch, state, null, guards);
  assert.equal(nav3d.pop(), true);
  assert.deepEqual([top(state).screenId, top(state).params.sliceIndex], ['SCR-03', 44]);
  // and a 2D screen opened from somewhere else (the case list) asks nobody for the 3D slice: the provider says null
  const list = bindNav(dispatch, state, null, guards);
  list.setReturnParams(({ screenId }) => (screenId === 'SCR-05' ? { sliceIndex: 1 } : null));
  list.push('SCR-04', { caseId: 'CASE_0061', runId: 'RUN_A', variant: 'RAW' });
  assert.equal(top(state).screenId, 'SCR-04');
});