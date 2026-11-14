// node --test mobile/test/  - the render smoke's watchdog (test/render/watchdog.mjs), QA_PR88_D39 N-2.
// No React and no node_modules: this is the file that keeps the render smoke from hanging silently, and it has to be
// checked in the job that has no node_modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startWatchdog, timeoutFromEnv } from './render/watchdog.mjs';

const WATCHDOG_URL = new URL('./render/watchdog.mjs', import.meta.url).href;

test('W1 the watchdog arms one unref\'d timer for ms, reports the last check when it fires, and can be stopped', () => {
  const armed = [];
  const cleared = [];
  let unrefs = 0;
  const timers = {
    setTimeout(fn, ms) { const handle = { fn, ms, unref() { unrefs += 1; } }; armed.push(handle); return handle; },
    clearTimeout(handle) { cleared.push(handle); },
  };
  const fired = [];
  const dog = startWatchdog({ ms: 4321, onTimeout: (info) => fired.push(info), timers });
  assert.equal(armed.length, 1);
  assert.equal(armed[0].ms, 4321);
  assert.equal(unrefs, 1, 'unref\'d: a smoke that finishes is never delayed by it');
  dog.note('R3');
  dog.note('V4g');
  armed[0].fn();
  assert.deepEqual(fired, [{ ms: 4321, last: 'V4g' }], 'it names the last check that ran');
  dog.stop();
  assert.deepEqual(cleared, [armed[0]]);

  const fresh = startWatchdog({ ms: 10, onTimeout: (info) => fired.push(info), timers });
  armed[1].fn();
  assert.equal(fired[1].last, 'none yet', 'before the first check it says so');
  fresh.stop();
});

test('W2 RENDER_SMOKE_TIMEOUT_MS: a positive integer overrides the default, anything else is ignored', () => {
  assert.equal(timeoutFromEnv({}, 480000), 480000);
  assert.equal(timeoutFromEnv(undefined, 480000), 480000);
  assert.equal(timeoutFromEnv({ RENDER_SMOKE_TIMEOUT_MS: '1500' }, 480000), 1500);
  assert.equal(timeoutFromEnv({ RENDER_SMOKE_TIMEOUT_MS: ' 2000 ' }, 480000), 2000);
  for (const bad of ['', '0', '-5', '1.5', '1e3', 'abc', '0x10', '12 s']) {
    assert.equal(timeoutFromEnv({ RENDER_SMOKE_TIMEOUT_MS: bad }, 480000), 480000, `"${bad}" is ignored`);
  }
});

// The real thing: a child process that hangs (its event loop is kept alive by an interval) is ended by the
// watchdog with exit code 1 and the FAIL line; one that finishes is not delayed by it.
function runChild(source) {
  const dir = mkdtempSync(join(tmpdir(), 'render-watchdog-'));
  const file = join(dir, 'child.mjs');
  writeFileSync(file, source, 'utf8');
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    // A watchdog that does not fire must fail the test, not hang the suite with a child that never ends.
    const cap = setTimeout(() => { out += '\n[test] the child was still running after 15 s and was killed'; child.kill(); }, 15000);
    child.on('close', (code) => { clearTimeout(cap); resolve({ code, out, ms: Date.now() - started }); });
  });
}

test('W3 a hung process is ended by the watchdog: FAIL line naming the last check, exit code 1', async () => {
  const { code, out, ms } = await runChild(`
    import { startWatchdog } from ${JSON.stringify(WATCHDOG_URL)};
    const dog = startWatchdog({ ms: 300, onTimeout: ({ ms, last }) => {
      console.log('  FAIL WATCHDOG no result within ' + ms + ' ms, last check ' + last);
      process.exit(1);
    } });
    dog.note('B3');
    setInterval(() => {}, 1000);   // something keeps the loop alive, as a screen's pending timers do
  `);
  assert.equal(code, 1, out);
  assert.match(out, /FAIL WATCHDOG no result within 300 ms, last check B3/);
  assert.ok(ms < 8000, `ended in ${ms} ms`);
});

test('W4 a process that finishes is not held up by an armed watchdog', async () => {
  const { code, out, ms } = await runChild(`
    import { startWatchdog } from ${JSON.stringify(WATCHDOG_URL)};
    startWatchdog({ ms: 60000, onTimeout: () => { console.log('FIRED'); process.exit(1); } });
    console.log('done');
  `);
  assert.equal(code, 0, out);
  assert.match(out, /done/);
  assert.doesNotMatch(out, /FIRED/);
  assert.ok(ms < 8000, `a 60 s watchdog delayed the exit: ${ms} ms`);
});
