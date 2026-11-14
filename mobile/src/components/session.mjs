/*
 * The session cover (spec 12 §8, idea from the HIPAA automatic logoff rule): after 5 minutes in the background
 * or 10 minutes without a touch, the app hides the screen until the user taps to show it again. It is a cover,
 * not a login: the app has no accounts. Also the "Clear cached images" action. Plain JS for node tests;
 * SessionCover.js draws it.
 */

export const SESSION_LIMITS = Object.freeze({ backgroundMs: 5 * 60 * 1000, idleMs: 10 * 60 * 1000 });

export const COVER_REASON = Object.freeze({ BACKGROUND: 'BACKGROUND', IDLE: 'IDLE' });

// 300000 -> "5 minutes"; under a minute (tests) -> "0.6 seconds".
const duration = (ms) => {
  const [n, unit] = ms >= 60000 ? [ms / 60000, 'minute'] : [ms / 1000, 'second'];
  const shown = Number.isInteger(n) ? n : Number(n.toFixed(1));
  return `${shown} ${unit}${shown === 1 ? '' : 's'}`;
};

/*
 * touch() on every touch, toBackground() / toForeground() from AppState, tick() from a timer. Each returns
 * { covered, reason }. Time in the background counts as idle too; a covered session ignores touches until
 * uncover().
 */
export function createSessionClock({
  now = () => Date.now(), backgroundMs = SESSION_LIMITS.backgroundMs, idleMs = SESSION_LIMITS.idleMs,
} = {}) {
  let lastTouch = now();
  let backgroundAt = null;
  let reason = null;
  const state = () => Object.freeze({ covered: reason !== null, reason });
  const cover = (why) => { if (reason === null) reason = why; };

  return Object.freeze({
    touch() {
      if (reason === null) lastTouch = now();
      return state();
    },
    toBackground() {
      if (backgroundAt === null) backgroundAt = now();
      return state();
    },
    toForeground() {
      if (backgroundAt !== null && now() - backgroundAt >= backgroundMs) cover(COVER_REASON.BACKGROUND);
      backgroundAt = null;
      return this.tick();
    },
    tick() {
      if (backgroundAt === null && now() - lastTouch >= idleMs) cover(COVER_REASON.IDLE);
      return state();
    },
    uncover() {
      reason = null;
      lastTouch = now();
      return state();
    },
    get covered() { return reason !== null; },
    get reason() { return reason; },
  });
}

export function coverText(reason, limits = SESSION_LIMITS) {
  const why = reason === COVER_REASON.BACKGROUND
    ? `The app was in the background for ${duration(limits.backgroundMs)} or more.`
    : `Nobody touched the screen for ${duration(limits.idleMs)}.`;
  return Object.freeze({
    title: 'Screen hidden',
    body: `${why} The MRI and case data are hidden until you show them again.`,
  });
}

/*
 * Empties the in-memory caches of MRI images, decoded masks and per-slice answers (runtime.imageStore,
 * runtime.maskStore, runtime.sliceClient). They live in memory only. Fixture mode keeps no images, so there is
 * nothing to clear.
 */
export function clearCachedData(runtime) {
  const sizeOf = (store) => {
    if (!store || typeof store.stats !== 'function') return 0;
    const st = store.stats();
    return Number.isInteger(st.cached) ? st.cached : (Number.isInteger(st.size) ? st.size : 0);
  };
  const images = runtime && runtime.imageStore ? sizeOf(runtime.imageStore) : 0;
  const masks = runtime && runtime.maskStore ? sizeOf(runtime.maskStore) : 0;
  const answers = runtime && runtime.sliceClient && typeof runtime.sliceClient.clear === 'function'
    ? sizeOf(runtime.sliceClient) : 0;
  let cleared = false;
  for (const store of [runtime && runtime.imageStore, runtime && runtime.maskStore, runtime && runtime.sliceClient]) {
    if (store && typeof store.clear === 'function') { store.clear(); cleared = true; }
  }
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const text = cleared
    ? `Cleared ${plural(images, 'image')}, ${plural(masks, 'mask')} and ${plural(answers, 'cached answer')} from the app's memory (these caches are never written to storage).`
    : 'Nothing to clear: this build keeps no images (fixture mode).';
  return Object.freeze({ images, masks, answers, cleared, text });
}
