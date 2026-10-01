/*
 * Latest-wins request tracking, the pure core of useCall (N-6).
 *
 * Every start() aborts the request before it (its AbortSignal fires, which
 * httpTransport and content.bytes both honour) and hands out a ticket; only
 * the newest ticket may write a result. abort() cancels whatever is in
 * flight (unmount). A screen that uses this cannot draw a stale answer over
 * a newer one, and does not leave requests running for a screen that is gone.
 */

export function createLatest({ AbortControllerImpl = globalThis.AbortController } = {}) {
  let seq = 0;
  let controller = null;

  function abort() {
    if (controller) controller.abort();
    controller = null;
  }

  return Object.freeze({
    start() {
      abort();
      seq += 1;
      const mine = seq;
      controller = AbortControllerImpl ? new AbortControllerImpl() : null;
      const signal = controller ? controller.signal : null;
      return Object.freeze({
        seq: mine,
        signal,
        isLatest: () => mine === seq && !(signal && signal.aborted),
      });
    },
    abort() { abort(); seq += 1; },
    get seq() { return seq; },
  });
}

/*
 * Runs `call(signal)` as the latest request and resolves to
 * { view, stale } - `stale` true when a newer start() or an abort() happened
 * while it was in flight, in which case `view` must be dropped.
 */
export async function runLatest(latest, call) {
  const ticket = latest.start();
  const view = await call(ticket.signal);
  return { view, stale: !ticket.isLatest() };
}
