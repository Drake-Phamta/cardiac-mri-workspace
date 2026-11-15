/*
 * Turns a decoded mask (0 = background, nonzero = foreground) into one SVG path in source pixels: the filled row
 * runs (runsToPath) or the outline (maskOutlinePath). The path uses the same transform as the MRI image, so zoom
 * and pan move both together and mask pixel (x, y) stays on slice pixel (x, y), with x = column and y = row.
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
 * The outline of a mask: the edges between a foreground pixel and a background one (or the slice border), traced
 * into closed loops, one SVG subpath each ("M x y h.. v.. z") on pixel corners. Only boundary edges are drawn, so a
 * filled square gives its perimeter and nothing inside it; a hole gives a second loop. Loops are traced clockwise
 * on screen and turn right at a corner shared by two diagonal pixels, so those stay two loops (4-connected).
 * Continuous loops let a dashed stroke run along the edge instead of restarting at every pixel.
 */
const RIGHT = 0; const DOWN = 1; const LEFT = 2; const UP = 3;
const STEP_X = [1, 0, -1, 0];
const STEP_Y = [0, 1, 0, -1];

export function maskOutlinePath(mask) {
  check(mask);
  const { width: w, height: h, data } = mask;
  // Work inside the foreground's bounding box only: a heart is a small part of the slice.
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      if (data[row + x] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return '';
  const fg = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] !== 0;
  // Corners of the box, in box coordinates: corner (cx, cy) is slice corner (x0 + cx, y0 + cy).
  const cols = x1 - x0 + 2;
  const rows = y1 - y0 + 2;
  // edges[corner * 4 + direction]: 1 = a boundary edge leaves this corner that way, 2 = already traced.
  const edges = new Uint8Array(cols * rows * 4);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (data[y * w + x] === 0) continue;
      const c = (y - y0) * cols + (x - x0);
      if (!fg(x, y - 1)) edges[c * 4 + RIGHT] = 1;
      if (!fg(x + 1, y)) edges[(c + 1) * 4 + DOWN] = 1;
      if (!fg(x, y + 1)) edges[(c + cols + 1) * 4 + LEFT] = 1;
      if (!fg(x - 1, y)) edges[(c + cols) * 4 + UP] = 1;
    }
  }
  const parts = [];
  for (let start = 0; start < cols * rows; start += 1) {
    for (let d0 = 0; d0 < 4; d0 += 1) {
      if (edges[start * 4 + d0] !== 1) continue;
      let x = start % cols;
      let y = (start - x) / cols;
      const out = [`M${x + x0} ${y + y0}`];
      let dir = d0;
      let run = 0;
      for (;;) {
        edges[(y * cols + x) * 4 + dir] = 2;
        x += STEP_X[dir];
        y += STEP_Y[dir];
        run += 1;
        const at = (y * cols + x) * 4;
        // Right turn first, then straight, then left; there is never an edge straight back.
        let next = -1;
        for (const turn of [1, 0, 3]) {
          const d = (dir + turn) % 4;
          if (edges[at + d] === 1) { next = d; break; }
        }
        if (next !== dir) {
          out.push(dir === RIGHT ? `h${run}` : dir === LEFT ? `h-${run}` : dir === DOWN ? `v${run}` : `v-${run}`);
          run = 0;
        }
        if (next === -1) break;
        dir = next;
      }
      parts.push(`${out.join('')}z`);
    }
  }
  return parts.join('');
}

// The three disagreement classes as masks of their own (for their outlines), same rules as disagreementRuns.
export function disagreementMasks(groundTruth, prediction) {
  sameSize(groundTruth, prediction);
  const g = groundTruth.data;
  const p = prediction.data;
  const n = g.length;
  const tp = new Uint8Array(n);
  const fp = new Uint8Array(n);
  const fn = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const gi = g[i] !== 0;
    const pi = p[i] !== 0;
    if (gi && pi) tp[i] = 1; else if (pi) fp[i] = 1; else if (gi) fn[i] = 1;
  }
  const { width, height } = groundTruth;
  return Object.freeze({
    tp: { width, height, data: tp }, fp: { width, height, data: fp }, fn: { width, height, data: fn },
  });
}

function sameSize(groundTruth, prediction) {
  check(groundTruth);
  check(prediction);
  if (groundTruth.width !== prediction.width || groundTruth.height !== prediction.height) {
    throw new Error(`mask sizes differ: ground truth ${groundTruth.width}x${groundTruth.height}, `
      + `prediction ${prediction.width}x${prediction.height}`);
  }
}

/*
 * Pixel classes for the error view: TP in both masks, FP prediction only, FN ground truth only.
 * This is only a drawing; the numbers on screen come from the server. Masks of different sizes are
 * refused, never cropped or stretched.
 */
export function disagreementRuns(groundTruth, prediction) {
  sameSize(groundTruth, prediction);
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
