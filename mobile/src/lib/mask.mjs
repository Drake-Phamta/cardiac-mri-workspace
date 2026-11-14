/*
 * Turns a decoded mask (0 = background, nonzero = foreground) into one SVG path of row runs in source pixels.
 * The path uses the same transform as the MRI image, so zoom and pan move both together and mask
 * pixel (x, y) stays on slice pixel (x, y), with x = column and y = row.
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

// Row runs where pick(i) is true, as a flat Int32Array of (y, x, len) triples, small enough to cache.
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
 * Pixel classes for the error view: TP in both masks, FP prediction only, FN ground truth only.
 * This is only a drawing; the numbers on screen come from the server. Masks of different sizes are
 * refused, never cropped or stretched.
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
