/*
 * Strip-plot geometry for SCR-07 - pure numbers, no rendering.
 *
 * WHY A STRIP AND NOT A BOX. A box plot's whiskers flag "outliers" by Tukey's
 * 1.5 x IQR rule. This project froze a different definition (DR-010: the three
 * lowest successfully evaluated cases, chosen by the server). Two outlier
 * definitions on one screen are two answers to the same question, so this
 * draws every successfully evaluated case as its own point, marks the
 * server's DR-010 cases, and draws no whisker. With 54 holdout cases per run
 * a strip is still readable, and every point is a case a tap can open
 * (DEMO_STANDARD SCR-07: "any point opens its case").
 *
 * Horizontal jitter is deterministic (a golden-ratio sequence over the row
 * index), so the same data draws the same picture on every build - nothing
 * random, nothing sorted.
 */

const GOLDEN = 0.6180339887498949;

/*
 * columns: [{ key, label, group, points: [{ caseId, value, intent, ... }],
 *             highlight: [caseId, ...] }]
 * axis:    the value range drawn. [0, 1] fits Dice and IoU; a value outside it
 *          is listed in `offAxis` rather than clipped onto the edge, where it
 *          would read as a 0 or a 1 it is not.
 */
export function stripLayout(columns, {
  width, height, padding = 32, axis = [0, 1], pointRadius = 5, jitter = 0.6, ticks = 5,
} = {}) {
  if (!(width > 0) || !(height > 0)) throw new Error('stripLayout needs a positive width and height');
  const [min, max] = axis;
  const plot = { x0: padding, y0: padding / 2, x1: width - padding / 2, y1: height - padding };
  const colWidth = columns.length > 0 ? (plot.x1 - plot.x0) / columns.length : 0;
  const yOf = (v) => plot.y1 - ((v - min) / (max - min)) * (plot.y1 - plot.y0);

  const laidOut = columns.map((col, i) => {
    const x0 = plot.x0 + i * colWidth;
    const xCenter = x0 + colWidth / 2;
    const highlight = new Set(col.highlight ?? []);
    const points = [];
    const offAxis = [];
    (col.points ?? []).forEach((p, index) => {
      if (typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value < min || p.value > max) {
        offAxis.push(p);
        return;
      }
      const offset = (((index * GOLDEN) % 1) - 0.5) * colWidth * jitter;
      points.push(Object.freeze({
        x: xCenter + offset,
        y: yOf(p.value),
        r: pointRadius,
        caseId: p.caseId,
        value: p.value,
        outlier: highlight.has(p.caseId),
        intent: p.intent ?? null,
        column: col.key,
      }));
    });
    return Object.freeze({
      key: col.key, label: col.label ?? col.key, group: col.group ?? null,
      x0, x1: x0 + colWidth, xCenter,
      points: Object.freeze(points), offAxis: Object.freeze(offAxis),
    });
  });

  const groups = [];
  for (const col of laidOut) {
    const last = groups[groups.length - 1];
    if (last && last.group === col.group) last.x1 = col.x1;
    else groups.push({ group: col.group, x0: col.x0, x1: col.x1 });
  }

  const tickList = [];
  for (let t = 0; t <= ticks; t += 1) {
    const value = min + ((max - min) * t) / ticks;
    tickList.push(Object.freeze({ value, y: yOf(value) }));
  }

  return Object.freeze({
    width, height,
    plot: Object.freeze(plot),
    axis: Object.freeze({ min, max, ticks: Object.freeze(tickList) }),
    columns: Object.freeze(laidOut),
    groups: Object.freeze(groups.map((g) => Object.freeze(g))),
  });
}

/*
 * The point a tap lands on: the nearest point within its radius plus `slop`
 * (touch targets are larger than dots - `10` section 9), or null. A linear
 * scan for the minimum; equal distances keep the first point drawn.
 */
export function pointAt(layout, x, y, slop = 12) {
  let best = null;
  let bestD = Infinity;
  for (const col of layout.columns) {
    for (const p of col.points) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      const reach = (p.r + slop) ** 2;
      if (d <= reach && d < bestD) { best = p; bestD = d; }
    }
  }
  return best;
}
