// SCR-07 paired view. For two runs the server judged COMPARABLE, every case with a value in both runs becomes one
// dot: its value in the second run minus its value in the first (DINOv2 - UNet for the matrix pairs). The dots
// are ordered from the lowest difference to the highest, and the median difference is drawn as a line.
// Pairs come from each run's plotted points, so a failed, withheld, excluded or duplicated case is never paired.
// This is the only V3 file that orders values: the order is for drawing, and the outliers stay the server's.

import { VERDICT, matrixEntry } from './readers.mjs';
import { FAMILY_LABEL, reasonLabel, routeForIntent } from './view.mjs';

const fmt = (v) => v.toFixed(3);
const signed = (v) => `${v > 0 ? '+' : ''}${v.toFixed(3)}`;

function runName(experimentId) {
  const e = matrixEntry(experimentId);
  return e ? `${FAMILY_LABEL[e.family]} ${e.fractionPct} %` : experimentId;
}

/* Why a comparison gets no paired view, or null when it may have one. Only the server's verdict decides. */
export function whyNoPairs(comparison) {
  if (!comparison.requested) return comparison.notRequestedReason || 'not requested';
  if (comparison.numbersWithheld) return comparison.numbersWithheld.reason;
  const reason = comparison.presentation.reason;
  if (comparison.comparability.verdict === VERDICT.NOT_COMPARABLE) {
    return `the server says these runs are not comparable${reason ? `: ${reason}` : ''}`;
  }
  if (comparison.comparability.verdict !== VERDICT.COMPARABLE) return reason || 'the server did not judge these runs comparable';
  return null;
}

export function median(values) {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/* The per-case differences of one two-run comparison, for the metric the user picked. */
export function pairCases(comparison, cells, metricName) {
  const [firstId, secondId] = comparison.experimentIds;
  const result = (fields) => Object.freeze({
    id: comparison.id, firstId, secondId, metricName, available: false, reason: null,
    pairs: Object.freeze([]), median: null, unpaired: 0, populationChecked: false, ...fields,
  });

  const blocked = whyNoPairs(comparison);
  if (blocked) return result({ reason: blocked });
  if (!metricName) return result({ reason: 'pick a metric above to see the per-case differences' });
  for (const id of [firstId, secondId]) {
    const cell = cells.find((c) => c.id === id);
    if (!cell) return result({ reason: `${id} is not loaded on this screen` });
    if (cell.points.length === 0) {
      return result({ reason: `${id} has no per-case ${metricName} value: ${reasonLabel(cell.pointsWithheld) || 'no row has a value'}` });
    }
  }
  const first = cells.find((c) => c.id === firstId);
  const second = cells.find((c) => c.id === secondId);

  // When the server sends its common population as a list of case ids, only those cases are paired.
  const population = Array.isArray(comparison.comparability.commonPopulation)
    ? new Set(comparison.comparability.commonPopulation) : null;
  const secondByCase = new Map(second.points.map((p) => [p.caseId, p]));
  const pairs = [];
  for (const a of first.points) {
    const b = secondByCase.get(a.caseId);
    if (!b || (population && !population.has(a.caseId))) continue;
    pairs.push(Object.freeze({
      caseId: a.caseId, first: a.value, second: b.value, delta: b.value - a.value,
      firstIntent: a.intent, secondIntent: b.intent,
    }));
  }
  // Equal differences are ordered by case id, so the same data always draws the same picture.
  pairs.sort((x, y) => x.delta - y.delta || (x.caseId < y.caseId ? -1 : 1));

  const allCases = population ?? new Set([...first.points, ...second.points].map((p) => p.caseId));
  if (pairs.length === 0) {
    return result({ reason: `no case has a ${metricName} value in both runs`, unpaired: allCases.size });
  }
  return result({
    available: true,
    pairs: Object.freeze(pairs),
    median: median(pairs.map((p) => p.delta)),
    unpaired: allCases.size - pairs.length,
    populationChecked: population !== null,
  });
}

/* One card per requested UNet vs DINOv2 pair, as text. With no pair requested, `emptyText` says why. */
export function pairedCards(snap) {
  const headToHead = snap.comparisons.filter((c) => c.kind === 'HEAD_TO_HEAD');
  const requested = headToHead.filter((c) => c.requested);
  return Object.freeze({
    emptyText: requested.length ? null : 'No UNet vs DINOv2 pair is loaded here: both runs of a pair must be listed by the server.',
    notRequested: Object.freeze(requested.length ? [] : headToHead.map((c) => `${c.label}: ${c.notRequestedReason}`)),
    cards: Object.freeze(requested.map((c) => pairedCard(c, snap.cells, snap.metricName))),
  });
}

function pairedCard(comparison, cells, metricName) {
  const p = pairCases(comparison, cells, metricName);
  const firstName = runName(p.firstId);
  const secondName = runName(p.secondId);
  const n = p.pairs.length;
  return Object.freeze({
    id: p.id,
    title: comparison.label,
    available: p.available,
    reason: p.reason,
    firstName,
    secondName,
    pairs: p.pairs,
    median: p.median,
    summaryText: p.available
      ? `${metricName}, ${secondName} minus ${firstName}: ${n} case${n === 1 ? '' : 's'}, median difference ${signed(p.median)}`
      : null,
    // The one-line caption of the chart on the page: which run minus which, how many cases, the median difference.
    captionText: p.available ? `${secondName} − ${firstName} · ${n} case${n === 1 ? '' : 's'} · median ${signed(p.median)}` : null,
    directionText: p.available ? `Above 0: ${secondName} higher. Below 0: ${firstName} higher.` : null,
    unpairedShort: p.available && p.unpaired > 0
      ? `${p.unpaired} case${p.unpaired === 1 ? '' : 's'} without a value in both runs ${p.unpaired === 1 ? 'is' : 'are'} not drawn`
      : null,
    unpairedText: p.available && p.unpaired > 0
      ? `${p.unpaired} case${p.unpaired === 1 ? '' : 's'}${p.populationChecked ? ' of the common population' : ''} without a value in both runs - not drawn`
      : null,
  });
}

/* What a tapped dot says, and the two runs it can open. */
export function pairDetail(pair, card) {
  if (!pair || !card) return null;
  return Object.freeze({
    text: `${pair.caseId}: ${card.firstName} ${fmt(pair.first)}, ${card.secondName} ${fmt(pair.second)}, difference ${signed(pair.delta)}`,
    links: Object.freeze([
      Object.freeze({ label: `Open in ${card.firstName}`, route: routeForIntent(pair.firstIntent) }),
      Object.freeze({ label: `Open in ${card.secondName}`, route: routeForIntent(pair.secondIntent) }),
    ]),
  });
}

// A round axis limit just above the largest difference, so the axis is symmetric around 0.
function axisLimit(largest) {
  if (!(largest > 0)) return 0.1;
  const scale = 10 ** Math.floor(Math.log10(largest));
  return [1, 2, 5, 10].map((k) => k * scale).find((v) => v >= largest);
}

// Geometry of the paired chart: one slot per case in the given order, the difference on the y axis.
export function pairedLayout(pairs, medianValue, { width, height, padding = 44, pointRadius = 5 } = {}) {
  if (!(width > 0) || !(height > 0)) throw new Error('pairedLayout needs a positive width and height');
  const limit = axisLimit(Math.max(0, ...pairs.map((p) => Math.abs(p.delta))));
  const plot = { x0: padding, y0: 10, x1: width - 10, y1: height - 10 };
  const yOf = (v) => plot.y0 + ((limit - v) / (2 * limit)) * (plot.y1 - plot.y0);
  const step = pairs.length ? (plot.x1 - plot.x0) / pairs.length : 0;
  const r = Math.max(2, Math.min(pointRadius, step / 2.5));
  return Object.freeze({
    width, height, limit,
    plot: Object.freeze(plot),
    zeroY: yOf(0),
    medianY: medianValue === null ? null : yOf(medianValue),
    ticks: Object.freeze([limit, limit / 2, 0, -limit / 2, -limit].map((value) => Object.freeze({ value, y: yOf(value) }))),
    points: Object.freeze(pairs.map((p, i) => Object.freeze({ ...p, x: plot.x0 + step * (i + 0.5), y: yOf(p.delta), r }))),
  });
}

// The dot a tap lands on: the nearest within its radius plus `slop` (a finger is bigger than a dot), or null.
export function pairAt(layout, x, y, slop = 12) {
  let best = null;
  let bestD = Infinity;
  for (const p of layout.points) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= (p.r + slop) ** 2 && d < bestD) { best = p; bestD = d; }
  }
  return best;
}
