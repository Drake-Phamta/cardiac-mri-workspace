// node --test mobile/test/  - V1 slice controls: Play, hold-to-repeat and double tap
// (src/screens/v1-cases/sliceControls.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlayer, createRepeater, doubleTapTransform, isDoubleTap, nextPlayIndex, PLAY_INTERVAL_MS,
} from '../src/screens/v1-cases/sliceControls.mjs';
import { createSerialRunner } from '../src/screens/v1-cases/cases.mjs';
import { fitTransform } from '../src/lib/viewMath.mjs';

// A hand-driven clock and timer queue.
function fakeTime() {
  let t = 0;
  const timers = [];
  return {
    now: () => t,
    schedule: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h; },
    cancel: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    // Fires every timer due before `ms` from now, each at its own time, then moves the clock to the end.
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = timers.filter((h) => h.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        t = Math.max(t, due.at);
        due.fn();
      }
      t = end;
    },
    get pending() { return timers.length; },
  };
}

test('VP1 the sweep goes one slice up and wraps to the first', () => {
  assert.equal(nextPlayIndex(4, 10), 5);
  assert.equal(nextPlayIndex(9, 10), 0);
  assert.equal(nextPlayIndex(null, 10), null);
  assert.equal(nextPlayIndex(3, 0), null);
  assert.equal(PLAY_INTERVAL_MS, 200, 'about 5 slices per second');
});

test('VP2 play never has two slice loads in flight: the next step waits for the slice on screen', () => {
  const clock = fakeTime();
  const asked = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const player = createPlayer({
    total: 5, now: clock.now, schedule: clock.schedule, cancel: clock.cancel,
    step: (z) => { asked.push(z); inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); },
  });
  player.start(3);
  assert.deepEqual(asked, [4], 'Play asks for the next slice at once');
  clock.advance(1000);
  assert.deepEqual(asked, [4], 'nothing more while slice 4 is loading, however long it takes');
  inFlight -= 1;
  player.settled(4);
  clock.advance(0);
  assert.deepEqual(asked, [4, 0], 'slice 4 took longer than the interval: the next one is asked at once, wrapping to 0');
  clock.advance(50);
  inFlight -= 1;
  player.settled(0);
  clock.advance(100);
  assert.deepEqual(asked, [4, 0], 'slice 0 came after 50 ms: the step waits for the rest of the 200 ms');
  clock.advance(50);
  assert.deepEqual(asked, [4, 0, 1]);
  assert.equal(maxInFlight, 1, 'one load in flight at most');
});

test('VP3 only the slice play asked for moves it on; a failure or stop() ends it', () => {
  const clock = fakeTime();
  const asked = [];
  const changes = [];
  const player = createPlayer({
    total: 10, now: clock.now, schedule: clock.schedule, cancel: clock.cancel,
    step: (z) => asked.push(z), onChange: (on) => changes.push(on),
  });
  player.start(0);
  player.settled(0); // a redraw of the old slice (an overlay switch) is not the slice play waits for
  clock.advance(500);
  assert.deepEqual(asked, [1]);
  assert.equal(player.waitingFor, 1);
  player.failed();
  assert.equal(player.playing, false);
  player.settled(1);
  clock.advance(500);
  assert.deepEqual(asked, [1], 'stopped: the late slice asks for nothing');
  player.start(5);
  player.settled(6);
  player.stop();
  clock.advance(500);
  assert.deepEqual(asked, [1, 6], 'stop() cancels the scheduled step');
  assert.equal(clock.pending, 0);
  assert.deepEqual(changes, [true, false, true, false]);
});

test('VP4 play on top of the serial runner: every step runs, none is dropped as stale', async () => {
  const shown = [];
  let player;
  const runner = createSerialRunner({ onSettled: () => {} });
  const slow = (z) => new Promise((r) => setTimeout(() => { shown.push(z); r(); player.settled(z); }, 5));
  player = createPlayer({ total: 4, intervalMs: 1, step: (z) => runner.run(() => slow(z), { key: 'slice' }) });
  player.start(0);
  for (let i = 0; i < 60 && shown.length < 6; i += 1) await new Promise((r) => setTimeout(r, 5));
  player.stop();
  assert.deepEqual(shown.slice(0, 6), [1, 2, 3, 0, 1, 2], 'each slice in order, the runner never had to replace a queued one');
});

test('VP5 hold to repeat: one step at once, then every interval until released', () => {
  const clock = fakeTime();
  let fired = 0;
  const rep = createRepeater({
    fire: () => { fired += 1; }, everyMs: 120,
    schedule: (fn, ms) => { const h = { tick: () => { fn(); h.next = clock.schedule(h.tick, ms); } }; h.next = clock.schedule(h.tick, ms); return h; },
    cancel: (h) => clock.cancel(h.next),
  });
  rep.start();
  assert.equal(fired, 1);
  clock.advance(360);
  assert.equal(fired, 4);
  rep.start();
  assert.equal(fired, 4, 'a second start while held does nothing');
  rep.stop();
  clock.advance(1000);
  assert.equal(fired, 4);
  assert.equal(rep.running, false);
});

test('VP6 double tap: two taps close in time and place; it toggles fit and 2x about the tapped point', () => {
  assert.equal(isDoubleTap({ t: 0, u: 10, v: 10 }, { t: 250, u: 20, v: 18 }), true);
  assert.equal(isDoubleTap({ t: 0, u: 10, v: 10 }, { t: 400, u: 10, v: 10 }), false, 'too slow');
  assert.equal(isDoubleTap({ t: 0, u: 10, v: 10 }, { t: 100, u: 60, v: 10 }), false, 'too far apart');
  assert.equal(isDoubleTap(null, { t: 0, u: 0, v: 0 }), false);
  const fit = fitTransform(400, 400, 200, 100); // zoom 2, image centred vertically
  const zoomed = doubleTapTransform(fit, fit, 100, 200);
  assert.equal(zoomed.zoom, 4);
  // The source pixel under the finger stays under it: (100 - pan) / zoom is the same before and after.
  assert.equal((100 - fit.panX) / fit.zoom, (100 - zoomed.panX) / zoomed.zoom);
  assert.equal((200 - fit.panY) / fit.zoom, (200 - zoomed.panY) / zoomed.zoom);
  assert.deepEqual(doubleTapTransform(zoomed, fit, 0, 0), fit, 'zoomed in: back to fit');
  assert.deepEqual(doubleTapTransform({ ...fit, zoom: 2.9 }, fit, 0, 0).zoom, 4, 'at 1.45x fit it still zooms to 2x');
});
