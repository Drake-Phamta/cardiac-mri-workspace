/*
 * One model action at a time, newest slice wins.
 *
 * The V1 model is a single mutable snapshot. Two loads racing on it can end
 * with the OLDER answer written last - an older slice drawn over the one the
 * user asked for (TC-MRI-003's "cannot leave an overlay from the previous
 * case/run visible as current evidence", at slice granularity). The screen
 * therefore never runs two model actions at once:
 *
 *   - actions run strictly in order, each after the previous one settled;
 *   - a queued action with a coalesce key is REPLACED by a newer one with the
 *     same key: scrubbing across 40 slices costs the slice in flight plus the
 *     last one, never 40 loads;
 *   - an action without a key (a variant switch, a refresh) is never dropped,
 *     because the user asked for exactly it.
 *
 * Pure, and indifferent to what an action does; tested in node.
 */

export function createSerialRunner({ onSettled = () => {}, onError = () => {} } = {}) {
  const queue = [];
  let running = false;
  let disposed = false;

  async function pump() {
    if (running || disposed) return;
    const job = queue.shift();
    if (!job) return;
    running = true;
    try {
      await job.fn();
    } catch (err) {
      onError(err, job);
    } finally {
      running = false;
    }
    if (disposed) return;
    onSettled({ key: job.key, idle: queue.length === 0 });
    pump();
  }

  return Object.freeze({
    run(fn, { key = null } = {}) {
      if (disposed) return;
      if (key !== null) {
        const i = queue.findIndex((j) => j.key === key);
        if (i !== -1) { queue[i] = { fn, key }; return; }
      }
      queue.push({ fn, key });
      pump();
    },
    get busy() { return running || queue.length > 0; },
    get queued() { return queue.length; },
    dispose() { disposed = true; queue.length = 0; },
  });
}
