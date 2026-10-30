/*
 * A watchdog for the render smoke (QA_PR88_D39 N-2).
 *
 * The harness has no per-check timeout, so a regression that never settles (a request that is not aborted when a
 * screen goes away, a leave guard that is never released, a promise nobody resolves) used to show up as a hang that
 * had to be killed - and in CI as a job that runs until the runner's own limit. The watchdog turns that into the
 * same thing every other failure is: a printed FAIL line naming the last check that ran, and exit code 1.
 *
 * The timer is unref'd: a smoke that finishes (it ends with process.exit) is never delayed by it, and a hung one
 * whose event loop is kept alive by something else still gets it fired. Pure of React and of node_modules, so
 * mobile/test/renderWatchdog.test.mjs runs it in the plain `node --test` CI job.
 */

export function startWatchdog({ ms, onTimeout, timers = { setTimeout, clearTimeout } }) {
  let last = 'none yet';
  const handle = timers.setTimeout(() => onTimeout({ ms, last }), ms);
  if (handle && typeof handle.unref === 'function') handle.unref();
  return Object.freeze({
    note(id) { last = String(id); },
    stop() { timers.clearTimeout(handle); },
  });
}

// RENDER_SMOKE_TIMEOUT_MS overrides the default; anything that is not a positive integer is ignored.
export function timeoutFromEnv(env, fallbackMs) {
  const text = String((env && env.RENDER_SMOKE_TIMEOUT_MS) ?? '').trim();
  return /^[1-9]\d*$/.test(text) ? Number(text) : fallbackMs;
}
