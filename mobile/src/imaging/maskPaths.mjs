/*
 * Decoded mask -> what the screen draws.
 *
 * A mask slice is Ny x Nx values as maskPng.js returns them - 0 = background,
 * 1 = foreground (the contract's 0 / 255, validated and mapped there). Any
 * nonzero value counts as foreground here. It is drawn as ONE vector path
 * of row runs in SOURCE pixel units:
 *
 *     M x y h len v 1 h -len z      one rectangle per run of foreground pixels
 *
 * placed with the same display transform as the MRI image (an SVG whose
 * viewBox is the source grid). Zoom and pan therefore move the overlay and the
 * image together by construction - the overlay is never re-sampled, so it
 * cannot drift off the anatomy (TC-MASK-001), and pixel (x, y) of the mask is
 * exactly pixel (x, y) of the slice (DR-008a: x = column, y = row).
 *
 * Pure functions on typed arrays: tested in node, run unchanged on Hermes.
 */


function check(mask) {
  if (!mask || !(mask.data instanceof Uint8Array) || !(mask.width > 0) || !(mask.height > 0)
    || mask.data.length !== mask.width * mask.height) {
    throw new Error('mask must be { width, height, data: Uint8Array(width * height) }');
  }
}

export function foregroundCount(mask) {
  check(mask);
  let n = 0;
  for (let i = 0; i < mask.data.length; i += 1) if (mask.data[i] !== 0) n += 1;
  return n;
}

/*
 * Row runs of pixels where `pick(i)` is true. Returned as a flat Int32Array of
 * (y, x, len) triples - compact enough to cache per slice.
 */
function runsWhere(width, height, pick) {
  const out = [];
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let x = 0;
    while (x < width) {
      if (!pick(row + x)) { x += 1; continue; }
      const start = x;
      while (x < width && pick(row + x)) x += 1;
      out.push(y, start, x - start);
    }
  }
  return Int32Array.from(out);
}

export function maskRuns(mask) {
  check(mask);
  const d = mask.data;
  return runsWhere(mask.width, mask.height, (i) => d[i] !== 0);
}

export function runsToPath(runs) {
  const parts = [];
  for (let i = 0; i < runs.length; i += 3) {
    const y = runs[i];
    const x = runs[i + 1];
    const len = runs[i + 2];
    parts.push(`M${x} ${y}h${len}v1h-${len}z`);
  }
  return parts.join('');
}

export function runPixelCount(runs) {
  let n = 0;
  for (let i = 2; i < runs.length; i += 3) n += runs[i];
  return n;
}

/*
 * SCR-04's disagreement classes, pixel by pixel, from the two masks the server
 * served (ground truth and the prediction of the ACTIVE variant):
 *
 *   TP  in both              FP  prediction only            FN  ground truth only
 *
 * This is a drawing of two served artifacts, not a metric: the per-slice
 * numbers on screen come from the server (analysis_slice_metrics and the
 * worst_slice_selection block), and nothing here ranks slices (DR-010).
 * Both masks must share the slice geometry; a mismatch is refused, never
 * cropped or stretched to fit.
 */
export function disagreementRuns(groundTruth, prediction) {
  check(groundTruth);
  check(prediction);
  if (groundTruth.width !== prediction.width || groundTruth.height !== prediction.height) {
    throw new Error(`mask sizes differ: ground truth ${groundTruth.width}x${groundTruth.height}, `
      + `prediction ${prediction.width}x${prediction.height}`);
  }
  const g = groundTruth.data;
  const p = prediction.data;
  const { width, height } = groundTruth;
  const tp = runsWhere(width, height, (i) => g[i] !== 0 && p[i] !== 0);
  const fp = runsWhere(width, height, (i) => g[i] === 0 && p[i] !== 0);
  const fn = runsWhere(width, height, (i) => g[i] !== 0 && p[i] === 0);
  return Object.freeze({
    tp, fp, fn,
    counts: Object.freeze({ tp: runPixelCount(tp), fp: runPixelCount(fp), fn: runPixelCount(fn) }),
  });
}
