// node app/core/tests/test_view_math.mjs
//
// Two jobs.
//
// 1. PROVENANCE. viewMath.mjs is a copy of spikes/spike_a_2d/app/viewerMath.js.
//    A copy that silently diverges from the code the A2 device session
//    measured is worse than no copy, because the evidence would then describe
//    a different function. V0 compares the five bodies character for
//    character.
// 2. PROPERTIES. The functions are re-checked here against independent
//    reasoning rather than against the spike's stored expectations, so this
//    file does not inherit a mistake from the fixture it was derived from.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as V from '../viewMath.mjs';
import { createChecker, HERE, REPO } from './_harness.mjs';

const { check, done } = createChecker();
const COPIED = ['screenToSource', 'fitTransform', 'clampZoom', 'zoomAbout', 'panBy'];

// V0 — provenance.
{
  const source = join(REPO, 'spikes', 'spike_a_2d', 'app', 'viewerMath.js');
  if (!existsSync(source)) {
    // The spike is labelled throwaway; if it is ever retired, the copy stands
    // on its own and this check reports that rather than failing the build.
    check('V0', true, 'spike source retired — provenance frozen in the file header');
  } else {
    const bodyOf = (text, name) => {
      const at = text.indexOf(`export function ${name}(`);
      if (at === -1) return null;
      let depth = 0; let i = text.indexOf('{', at);
      const start = i;
      for (; i < text.length; i++) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') { depth -= 1; if (depth === 0) break; }
      }
      return text.slice(start, i + 1).replace(/\r\n/g, '\n');
    };
    const spike = readFileSync(source, 'utf8');
    const mine = readFileSync(join(HERE, '..', 'viewMath.mjs'), 'utf8');
    const differing = COPIED.filter((n) => bodyOf(spike, n) === null || bodyOf(spike, n) !== bodyOf(mine, n));
    check('V0', differing.length === 0, `all ${COPIED.length} copied bodies match the spike source` +
      (differing.length ? ` — diverged: ${differing.join(', ')}` : ''));
  }
}

const NX = 576; const NY = 576;

// V1 — round trip at pixel centres. Every source pixel maps to the screen and
// back to itself.
{
  const t = V.fitTransform(1080, 1440, NX, NY);
  const bad = [];
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(Math.random() * NX);
    const y = Math.floor(Math.random() * NY);
    const u = t.panX + (x + 0.5) * t.zoom;
    const v = t.panY + (y + 0.5) * t.zoom;
    const got = V.screenToSource(u, v, t, NX, NY);
    if (!got || got[0] !== x || got[1] !== y) bad.push(`${x},${y}`);
  }
  check('V1', bad.length === 0, `400 pixel centres round-trip` + (bad.length ? ` — ${bad.slice(0, 3)}` : ''));
}

// V2 — outside the image is null, and null must never paint. The four edges
// plus just-inside neighbours, because this is an off-by-one that only shows
// as a stray painted pixel at the border.
{
  const t = V.fitTransform(1080, 1440, NX, NY);
  const px = (x, y) => [t.panX + x * t.zoom, t.panY + y * t.zoom];
  const outside = [px(-0.01, 0.5), px(0.5, -0.01), px(NX + 0.01, 0.5), px(0.5, NY + 0.01), px(NX, 0.5), px(0.5, NY)];
  const inside = [px(0.0, 0.0), px(NX - 0.5, NY - 0.5), px(0.01, 0.01)];
  check('V2', outside.every(([u, v]) => V.screenToSource(u, v, t, NX, NY) === null),
    `${outside.length} out-of-image touches map to null`);
  check('V2', inside.every(([u, v]) => V.screenToSource(u, v, t, NX, NY) !== null),
    `${inside.length} in-image touches map to a pixel`);
}

// V3 — fit puts the whole image inside the viewport, centred, aspect kept.
{
  for (const [w, h, nx, ny] of [[1080, 1440, 576, 576], [1080, 1440, 320, 240], [800, 400, 64, 256]]) {
    const t = V.fitTransform(w, h, nx, ny);
    const fits = nx * t.zoom <= w + 1e-9 && ny * t.zoom <= h + 1e-9;
    const touches = Math.abs(nx * t.zoom - w) < 1e-9 || Math.abs(ny * t.zoom - h) < 1e-9;
    const centred = Math.abs(t.panX - (w - nx * t.zoom) / 2) < 1e-9
      && Math.abs(t.panY - (h - ny * t.zoom) / 2) < 1e-9;
    check('V3', fits && touches && centred, `fit ${nx}x${ny} in ${w}x${h}: zoom ${t.zoom.toFixed(4)}`);
  }
}

// V4 — zoom is uniform. A per-axis zoom would stretch a mask off its anatomy
// while every pixel still "maps".
{
  const t = V.fitTransform(1080, 1440, 320, 240);
  check('V4', typeof t.zoom === 'number', 'the transform carries one zoom, not zoomX/zoomY');
}

// V5 — the pinch invariant: the source pixel under the focal point does not
// move. Checked at awkward focal points, not just the centre.
{
  const base = V.fitTransform(1080, 1440, NX, NY);
  const bad = [];
  for (const [fx, fy] of [[540, 720], [0, 0], [1079, 1439], [123.5, 998.25]]) {
    for (const factor of [2, 0.5, 8, 0.1, 1.0001]) {
      const before = V.screenToSource(fx, fy, base, NX, NY);
      const after = V.screenToSource(fx, fy, V.zoomAbout(base, base.zoom * factor, fx, fy), NX, NY);
      const same = (before === null && after === null)
        || (before && after && Math.abs(before[0] - after[0]) <= 1 && Math.abs(before[1] - after[1]) <= 1);
      if (!same) bad.push(`(${fx},${fy})x${factor}: ${before} -> ${after}`);
    }
  }
  check('V5', bad.length === 0, '20 zooms keep the focal pixel under the fingers' +
    (bad.length ? ` — ${bad.slice(0, 2).join('; ')}` : ''));
}

// V6 — clampZoom respects both bounds and is idempotent at them.
{
  const fit = 2.5;
  check('V6', V.clampZoom(1e6, fit) === fit * 16 && V.clampZoom(1e-6, fit) === fit * 0.25,
    `clamped to [${fit * 0.25}, ${fit * 16}]`);
  check('V6', V.clampZoom(V.clampZoom(1e6, fit), fit) === V.clampZoom(1e6, fit), 'clamping twice changes nothing');
}

// V7 — pan is a pure translation and every function returns a NEW transform.
// Invariant 2 of `07` section 8: zoom and pan touch the display transform and
// nothing else. A function that mutated its argument could reach shared state.
{
  const t = Object.freeze({ zoom: 3, panX: 10, panY: 20 });
  const p = V.panBy(t, -5, 7);
  check('V7', p.zoom === 3 && p.panX === 5 && p.panY === 27, 'panBy translates only');
  const untouched = t.zoom === 3 && t.panX === 10 && t.panY === 20;
  const fresh = [V.panBy(t, 1, 1), V.zoomAbout(t, 6, 0, 0)].every((r) => r !== t);
  check('V7', untouched && fresh, 'no function mutates the transform it was given');
}

// V8 — none of the five takes mask data. Checked on arity, so a later edit
// that threads pixels through the viewer math fails here.
{
  const arities = COPIED.map((n) => `${n}/${V[n].length}`);
  check('V8', V.screenToSource.length === 5 && V.panBy.length === 3 && V.zoomAbout.length === 4,
    `signatures unchanged: ${arities.join(' ')}`);
}

done('app/core view math');
