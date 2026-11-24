// SCR-07 trend chart over 25 / 50 / 100 % training data, one series per family. Each run shows every case as a
// marker, and the server's median and the middle half of its cases (q1 to q3) as a tick and a bar. A line through
// the medians and a band through q1-q3 join the three runs only when the server judged them comparable
// (buildTrend), because runs over different cases would show a trend the data does not support.

import { buildTrend, CELL_STATUS } from './cohort.mjs';
import { summaryStat } from './readers.mjs';
import { FAMILY_LABEL } from './view.mjs';

export const FRACTIONS = Object.freeze([25, 50, 100]);

/* One series per family: its 25 / 50 / 100 % runs, and whether they may be joined. Empty until a metric is picked. */
export function trendSeries(cells, comparisons, metricName) {
  if (!metricName) return Object.freeze([]);
  return Object.freeze(buildTrend(cells, comparisons, { metricName, stat: 'median' }).map((t) => {
    const runs = cells.filter((c) => c.family === t.family && c.question === 'RQ-A').map((cell) => {
      const stat = (name) => (cell.status === CELL_STATUS.LOADED ? summaryStat(cell.summary, metricName, name) : null);
      return Object.freeze({
        experimentId: cell.id,
        fractionPct: cell.fractionPct,
        values: Object.freeze(cell.points.map((p) => p.value)),
        median: stat('median'),
        q1: stat('q1'),
        q3: stat('q3'),
      });
    });
    return Object.freeze({
      family: t.family,
      joined: t.connected,
      band: t.connected && runs.every((r) => r.q1 !== null && r.q3 !== null),
      reason: t.reason,
      runs: Object.freeze(runs),
    });
  }));
}

// The value range the chart draws; it fits Dice and IoU. A value outside it is counted, never clipped to the edge
// where it would read as a 0 or a 1.
export const TREND_AXIS = Object.freeze([0, 1]);

/* Under the chart: whether each family's runs are joined and why not, and what the axis leaves out. */
export function trendNotes(series) {
  const notes = series.map((s) => (s.joined
    ? `${FAMILY_LABEL[s.family]}: joined - the server judged the three runs comparable`
    : `${FAMILY_LABEL[s.family]}: not joined - ${s.reason}`));
  const [min, max] = TREND_AXIS;
  const outside = series.flatMap((s) => s.runs.flatMap((r) => r.values)).filter((v) => v < min || v > max).length;
  if (outside) notes.push(`${outside} value(s) outside ${min} to ${max} are not drawn: this chart fits Dice and IoU`);
  return Object.freeze(notes);
}

const GOLDEN = 0.6180339887498949;

// Geometry of the trend chart; values outside `axis` are counted in `offAxis`.
export function trendLayout(series, { width, height, padding = 36, axis = TREND_AXIS, pointRadius = 3.5 } = {}) {
  if (!(width > 0) || !(height > 0)) throw new Error('trendLayout needs a positive width and height');
  const [min, max] = axis;
  const plot = { x0: padding, y0: 10, x1: width - 10, y1: height - 24 };
  const slot = (plot.x1 - plot.x0) / FRACTIONS.length;
  const yOf = (v) => plot.y1 - ((v - min) / (max - min)) * (plot.y1 - plot.y0);
  const onAxis = (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  // UNet sits left of each fraction, DINOv2 right, so the two never cover each other.
  const shift = { UNET: -slot / 5, DINOV2: slot / 5 };
  let offAxis = 0;

  const families = series.map((s) => {
    const runs = s.runs.map((run) => {
      const x = plot.x0 + slot * (FRACTIONS.indexOf(run.fractionPct) + 0.5) + (shift[s.family] ?? 0);
      const shown = run.values.filter(onAxis);
      offAxis += run.values.length - shown.length;
      return Object.freeze({
        experimentId: run.experimentId,
        x,
        dots: Object.freeze(shown.map((v, i) => Object.freeze({ x: x + (((i * GOLDEN) % 1) - 0.5) * (slot / 6), y: yOf(v), r: pointRadius }))),
        medianY: onAxis(run.median) ? yOf(run.median) : null,
        // The bar runs from q3 (top) down to q1.
        iqr: onAxis(run.q1) && onAxis(run.q3) ? Object.freeze({ y: yOf(run.q3), height: yOf(run.q1) - yOf(run.q3) }) : null,
      });
    });
    const line = s.joined && runs.every((r) => r.medianY !== null)
      ? `M${runs.map((r) => `${r.x} ${r.medianY}`).join(' L')}` : null;
    const band = s.band && runs.every((r) => r.iqr)
      ? `M${[...runs.map((r) => `${r.x} ${r.iqr.y}`), ...runs.map((r) => `${r.x} ${r.iqr.y + r.iqr.height}`).reverse()].join(' L')} Z`
      : null;
    return Object.freeze({ family: s.family, runs: Object.freeze(runs), line, band });
  });

  const ticks = [];
  for (let t = 0; t <= 4; t += 1) {
    const value = min + ((max - min) * t) / 4;
    ticks.push(Object.freeze({ value, y: yOf(value) }));
  }
  return Object.freeze({
    width, height,
    plot: Object.freeze(plot),
    ticks: Object.freeze(ticks),
    labels: Object.freeze(FRACTIONS.map((f, i) => Object.freeze({ text: `${f} %`, x: plot.x0 + slot * (i + 0.5) }))),
    families: Object.freeze(families),
    offAxis,
  });
}
