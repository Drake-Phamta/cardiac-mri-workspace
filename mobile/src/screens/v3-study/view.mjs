// The text and links of SCR-01 and SCR-07, plus the strip-plot geometry. Plain JS, so the tests check exactly what
// the screens say; the React files only draw it. An unreadable value prints as "unavailable" with its reason and
// what the server sent, never as 0 or a dash.

import { STATE } from '../../api/states.mjs';
import { CELL_STATUS, buildTrend, deltaFor, labelsForCell } from './cohort.mjs';
import { FAMILY, MATRIX, OUTLIER_RULE, summaryStat } from './readers.mjs';
import { TONE } from '../../components/stateCopy.mjs';
import { family } from '../../components/tokens.mjs';

export const FAMILY_LABEL = Object.freeze({ [FAMILY.UNET]: 'UNet', [FAMILY.DINOV2]: 'DINOv2' });

// Each family is drawn with its own colour AND marker shape (UNet blue circle, DINOv2 orange triangle), so a chart
// never depends on colour alone.
export const FAMILY_STYLE = Object.freeze({ [FAMILY.UNET]: family[0], [FAMILY.DINOV2]: family[1] });

// SVG path of a triangle marker centred on (x, y), about as large as a circle of radius r.
export function trianglePath(x, y, r) {
  const t = (v) => Number(v.toFixed(2));
  return `M${t(x)} ${t(y - r * 1.2)} L${t(x + r * 1.1)} ${t(y + r * 0.8)} L${t(x - r * 1.1)} ${t(y + r * 0.8)} Z`;
}

// The outlier rule in the words the screens use. OUTLIER_RULE keeps the contract's rule id for the code.
export const OUTLIER_LABEL = `${OUTLIER_RULE.cardinality} lowest-Dice cases`;

// Statistics the user may pick from the server's summary. No default: the contract names none yet.
export const STAT_CHOICES = Object.freeze(['median', 'mean']);

const REASON = Object.freeze({
  CASE_NOT_FOUND: 'the requested case does not exist',
  SLICE_OUT_OF_RANGE: 'the requested slice is outside the validated volume',
  NOT_LISTED: "not in the server's experiment list",
  NOT_REQUESTED: 'not requested on this screen',
  NOT_RETURNED: 'not returned by the server',
  WRONG_TYPE: 'returned, but not in a readable form',
  NO_READABLE_STATISTIC: 'no readable statistic in the server summary',
  CELL_NOT_LOADED: 'no metrics loaded for this experiment',
  NO_CASE_RESULTS: 'no per-case result yet',
  CASES_FOR_ANOTHER_VARIANT: 'the per-case rows were served for another variant - listed, not drawn',
  NO_METRIC_SELECTED: 'pick a metric to plot',
  CASES_NOT_REQUESTED: 'per-case rows not requested',
  CASES_NOT_LOADED: 'per-case rows did not load',
  NO_EXPERIMENTS_LISTED: 'the server lists no experiment yet',
  OUTLIERS_NOT_RETURNED: 'the server returned no lowest-Dice selection',
  OUTLIERS_UNREADABLE: 'the outlier selection is not in a readable form - not shown',
  OUTLIERS_UNDER_ANOTHER_RULE: 'the selection follows another rule than the lowest-Dice rule - not shown',
  OUTLIERS_UNDER_ANOTHER_VERSION: 'the selection was made under another version of the lowest-Dice rule - not shown',
  OUTLIERS_FOR_ANOTHER_METRIC: 'the selection ranks another metric than Dice - not shown',
  OUTLIERS_OVER_CARDINALITY: `the selection lists more than ${OUTLIER_RULE.cardinality} cases - not shown`,
  OUTLIERS_WITHOUT_EXPERIMENT_OR_VARIANT: 'the selection does not name its experiment and variant - not shown',
  OUTLIERS_FOR_ANOTHER_EXPERIMENT: 'the selection belongs to another experiment - not shown',
  OUTLIERS_FOR_ANOTHER_VARIANT: 'the selection was made for another variant - not shown',
  OUTLIERS_DUPLICATE_CASE_ID: 'the selection repeats a case id - the whole selection is refused',
  OUTLIERS_NAME_INELIGIBLE_CASE: 'the selection names a case that was not successfully evaluated - the whole selection is refused',
  NO_ELIGIBLE_CASES: 'no successfully evaluated case to select from',
  ARTIFACT_NOT_FOUND: 'the server has no such artifact',
  GROUND_TRUTH_UNAVAILABLE: 'ground truth unavailable - metrics cannot exist, not zero',
  INVALID_REVIEW_TRANSITION: 'the requested review state transition is not allowed',
  STALE_REVISION: 'the resource changed; refresh before writing',
  IMMUTABLE_ARTIFACT: 'an immutable artifact version cannot be overwritten',
  GEOMETRY_NOT_VALIDATED: 'the source geometry is not validated for this operation',
  GEOMETRY_MISMATCH: 'the supplied geometry does not match the source contract',
  RUN_NOT_DEPLOYABLE: 'the requested experiment configuration is not deployable',
  RUN_NOT_SUCCEEDED: 'the run has not produced a successful result yet',
  NON_COMPARABLE_EXPERIMENTS: 'the server says these experiments are not comparable',
  ANALYSIS_FAILED: 'the analysis run failed; inspect its recorded failure reason',
  VALIDATION_ERROR: 'the request failed contract validation',
  TRANSPORT_UNREACHABLE: 'the backend could not be reached',
  FIXTURE_SCENARIO_MISSING: 'the fixture bundle has no scenario for this request',
  CONTRACT_DRIFT: 'the response does not match the API contract',
  UNAUTHORIZED: 'not authorised',
});

export function reasonLabel(code) {
  if (code === null || code === undefined || code === '') return null;
  if (REASON[code]) return REASON[code];
  const text = String(code);
  // A code from a newer contract must still be readable: CODE_LIKE_THIS becomes words, server sentences stay as
  // they are.
  return /^[A-Z][A-Z0-9_]*$/.test(text) ? text.toLowerCase().replaceAll('_', ' ') : text;
}

const fmt = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : null);
const served = (s) => (s ? ` (server sent "${s}")` : '');

/* A link a screen can follow, or the reason it cannot. Never both. */
export function routeForIntent(intent) {
  if (!intent) return Object.freeze({ ok: false, reason: 'no case link' });
  if (!intent.enabled) return Object.freeze({ ok: false, reason: intent.reason || 'no case link' });
  return Object.freeze({
    ok: true,
    screenId: intent.screen,
    params: Object.freeze({
      caseId: intent.caseId, runId: intent.runId, variant: intent.variant, experimentId: intent.experimentId,
    }),
    text: intent.text,
  });
}

const route = (screenId, params = {}) => Object.freeze({ ok: true, screenId, params: Object.freeze({ ...params }) });

export function cellStatusText(cell) {
  switch (cell.status) {
    case CELL_STATUS.NOT_LISTED: return 'not listed by the server';
    case CELL_STATUS.NOT_REQUESTED: return 'not requested';
    case CELL_STATUS.LOADING: return 'loading';
    case CELL_STATUS.LOADED: return cell.identityConfirmed === false ? 'loaded - identity unconfirmed' : 'loaded';
    case CELL_STATUS.PROCESSING: return 'still processing';
    case CELL_STATUS.UNAVAILABLE: return `unavailable: ${reasonLabel(cell.statusReason) || 'no reason given'}`;
    case CELL_STATUS.ERROR: return `failed: ${reasonLabel(cell.statusReason) || 'no reason given'} - retry`;
    case CELL_STATUS.STALE: return 'stale - refresh';
    case CELL_STATUS.VARIANT_MISMATCH: return 'variant mismatch - refused';
    case CELL_STATUS.INVALID:
    default: return `blocked: ${reasonLabel(cell.statusReason) || 'invalid data'}`;
  }
}

export function cellTone(cell) {
  switch (cell.status) {
    case CELL_STATUS.LOADED: return cell.identityConfirmed === false ? TONE.WARN : TONE.NEUTRAL;
    case CELL_STATUS.PROCESSING: return TONE.INFO;
    case CELL_STATUS.ERROR:
    case CELL_STATUS.STALE: return TONE.WARN;
    case CELL_STATUS.VARIANT_MISMATCH:
    case CELL_STATUS.INVALID: return TONE.DANGER;
    default: return TONE.NEUTRAL;
  }
}

function cellTitle(cell) {
  return `${FAMILY_LABEL[cell.family]} ${cell.fractionPct} %${cell.lane === 'PROCESSED' ? ' post-processed' : ''}`;
}

function summaryLine(summary, metricName) {
  if (!summary) return null;
  if (!summary.available) return `summary unavailable: ${reasonLabel(summary.reason)}${served(summary.served)}`;
  if (!metricName) return `summary has ${summary.metrics.map((m) => m.name).join(', ')} - pick one`;
  const m = summary.metrics.find((x) => x.name === metricName);
  if (!m || !m.available) return `no ${metricName} statistic in the server summary`;
  const parts = ['median', 'mean', 'std', 'q1', 'q3']
    .filter((s) => m.stats[s] !== null)
    .map((s) => `${s} ${fmt(m.stats[s])}`);
  return `${metricName}: ${parts.join(' · ')} (server summary)`;
}

/* Every server verdict involving this cell, as words (never colour alone). */
function labelTexts(cell, comparisons) {
  return labelsForCell(cell.id, comparisons).map((l) => {
    const verdict = l.verdict === 'COMPARABLE' ? 'comparable' : (l.verdict === 'NOT_COMPARABLE' ? 'NOT comparable' : 'undecided');
    return `${verdict} with ${l.with.join(', ')} (server)`;
  });
}

// One matrix cell as a card. SCR-01 passes `withValues: false` (N and status only), because a value there would sit
// next to another with no comparability label.
export function cellCard(cell, { metricName = null, comparisons = [], withValues = true } = {}) {
  const warnings = [];
  if (cell.identity && cell.identity.problems.length) warnings.push(...cell.identity.problems);
  if (cell.status === CELL_STATUS.VARIANT_MISMATCH && cell.statusReason) warnings.push(cell.statusReason);
  return Object.freeze({
    id: cell.id,
    family: cell.family,
    title: cellTitle(cell),
    statusText: cellStatusText(cell),
    tone: cellTone(cell),
    nText: cell.n ? cell.n.text : null,
    warnings: Object.freeze(warnings),
    summaryText: withValues ? summaryLine(cell.summary, metricName) : null,
    contextText: withValues && cell.context ? cell.context.text : null,
    contextMissing: Object.freeze(withValues && cell.context && !cell.context.complete ? [...cell.context.missing] : []),
    labels: Object.freeze(withValues ? labelTexts(cell, comparisons) : []),
    pointsText: cell.points.length ? `${cell.points.length} case${cell.points.length === 1 ? '' : 's'} plotted` : null,
    withheldText: cell.points.length === 0 ? reasonLabel(cell.pointsWithheld) : null,
  });
}

/* Cards grouped into the two family rows, in matrix order. */
export function familyRows(cards) {
  return Object.freeze([FAMILY.UNET, FAMILY.DINOV2].map((family) => Object.freeze({
    family,
    label: FAMILY_LABEL[family],
    cells: Object.freeze(cards.filter((c) => c.family === family)),
  })));
}

// SCR-07 passes the model's comparison and SCR-01 its flattened headline row; these read both the same way.
const verdictOf = (c) => (c.comparability ? c.comparability.verdict : c.verdict);
const fairOf = (c) => Boolean(c.presentation ? c.presentation.mayLabelFair : c.fair);
const reasonOf = (c) => (c.presentation ? c.presentation.reason : c.reason) || null;
// A verdict can come with its numbers withheld, for example RQ-B, which mixes RAW and PROCESSED.
const withheldOf = (c) => (c.numbersWithheld ? c.numbersWithheld.reason : null);

function headlineSummaryRows(c) {
  if (!c.requested || !fairOf(c) || withheldOf(c) || !c.summaries) return Object.freeze([]);
  return Object.freeze(c.experimentIds.map((experimentId) => {
    const summary = c.summaries[experimentId];
    if (!summary || !summary.available) {
      return Object.freeze({
        experimentId,
        text: `${experimentId}: summary unavailable${summary?.reason ? ` (${reasonLabel(summary.reason)})` : ''}`,
      });
    }
    const metrics = summary.metrics.filter((m) => m.available).map((m) => {
      // SCR-01 has no metric or statistic picker, so it shows the median, or the mean when the median is missing.
      // The detailed statistics stay on SCR-07.
      const stat = m.stats.median !== null ? 'median' : (m.stats.mean !== null ? 'mean' : null);
      return stat ? `${m.name} ${stat} ${fmt(m.stats[stat])}` : null;
    }).filter(Boolean);
    return Object.freeze({
      experimentId,
      text: `${experimentId}: ${metrics.length ? metrics.join(' · ') : 'summary unavailable'}`,
    });
  }));
}

export function verdictText(c) {
  if (!c.requested) return 'not requested';
  switch (verdictOf(c)) {
    case 'COMPARABLE': return 'comparable (server verdict)';
    case 'NOT_COMPARABLE': return 'NOT comparable (server verdict)';
    default: return 'undecided - treated as not comparable';
  }
}

export function comparisonRow(c) {
  const fair = c.requested && fairOf(c);
  let tone = TONE.NEUTRAL;
  if (c.requested && verdictOf(c) === 'NOT_COMPARABLE') tone = TONE.WARN;
  else if (c.requested && !fair) tone = TONE.WARN;
  return Object.freeze({
    id: c.id,
    label: c.label,
    question: c.question,
    verdictText: verdictText(c),
    fair,
    tone,
    reason: c.requested ? (reasonOf(c) || withheldOf(c)) : c.notRequestedReason,
    populationText: c.population && c.population.available ? `common population ${c.population.label}` : null,
    summaryRows: headlineSummaryRows(c),
    route: c.requested
      ? route('SCR-07', { experimentIds: [...c.experimentIds] })
      : Object.freeze({ ok: false, reason: c.notRequestedReason }),
  });
}

export function outlierView(o) {
  if (!o) return Object.freeze({ available: false, text: 'not loaded', rule: OUTLIER_RULE.text, rows: Object.freeze([]) });
  if (!o.available) {
    return Object.freeze({
      available: false, text: `${reasonLabel(o.reason)}${served(o.served)}`, rule: OUTLIER_RULE.text, rows: Object.freeze([]),
    });
  }
  return Object.freeze({
    available: true,
    text: `the ${OUTLIER_LABEL} of ${o.experimentId} (${o.variant.declared}), in the order the server sent`
      + `${o.ruleCited ? '' : ' - the server did not cite the rule'}`,
    rule: OUTLIER_RULE.text,
    rows: Object.freeze(o.cases.map((c) => Object.freeze({
      key: `${c.rank}:${c.caseId}`,
      caseId: c.caseId || 'case id not returned',
      valueText: c.value.available ? `${o.metricName || 'metric'} ${fmt(c.value.value)}` : 'value unavailable',
      // The length of the small bar on SCR-01: the Dice itself, 0 to 1. No bar for a value off that scale.
      bar: c.value.available && c.value.value >= 0 && c.value.value <= 1 ? c.value.value : null,
      route: routeForIntent(c.intent),
    }))),
  });
}

function findingsView(f) {
  if (!f) return Object.freeze({ text: 'not loaded', byStatus: Object.freeze([]) });
  if (f.view.state !== STATE.SUCCESS) {
    return Object.freeze({ text: `findings ${reasonLabel(f.view.reason) || f.view.state}`, byStatus: Object.freeze([]) });
  }
  return Object.freeze({
    text: `${f.returned} finding${f.returned === 1 ? '' : 's'} returned${f.unreadable ? `, ${f.unreadable} unreadable` : ''}`,
    byStatus: Object.freeze(f.byStatus.map((e) => `${e.status} ${e.count}`)),
  });
}

/* SCR-01, as text and links. */
export function overviewView(snap) {
  const exp = snap.experiments;
  const listOk = exp && exp.view && exp.view.state === STATE.SUCCESS;
  let experimentsText;
  if (!exp) experimentsText = 'not loaded';
  else if (!listOk) experimentsText = `experiment list: ${reasonLabel(exp.view.reason) || exp.view.state}`;
  else if (exp.reason) experimentsText = reasonLabel(exp.reason);
  else experimentsText = `${exp.listedIds.filter((id) => MATRIX.some((e) => e.id === id)).length} of ${MATRIX.length} matrix experiments listed by the server`;

  const notes = [];
  if (exp && exp.unreadableRows) notes.push(`${exp.unreadableRows} listed row(s) carry no experiment_id - not shown`);
  if (exp && exp.outsideMatrix.length) notes.push(`also listed, outside the experiment matrix: ${exp.outsideMatrix.join(', ')}`);
  if (exp && exp.population) {
    notes.push(exp.population.available ? `evaluation population: ${exp.population.label}` : 'evaluation population unavailable');
  }

  const counts = snap.caseCounts ? snap.caseCounts.counts.map(({ key, count }) => Object.freeze({
    key, text: count.available ? String(count.value) : `unavailable${served(count.served)}`,
  })) : [];

  const summary = snap.experimentSummary;
  let summaryText = null;
  if (summary) {
    summaryText = summary.available
      ? `experiment summary: ${summary.experimentIds.length} experiment(s) available`
      : `experiment summary ${summary.status || 'unreadable'}${summary.reason ? `: ${summary.reason}` : ''}`;
  }

  // One outlier group per listed experiment, because the rule takes the experiment as an input.
  const outlierGroups = snap.outliers.map((o) => {
    const expected = MATRIX.find((e) => e.id === o.experimentId);
    return Object.freeze({
      experimentId: o.experimentId,
      family: expected ? expected.family : null,
      title: expected ? `${FAMILY_LABEL[expected.family]} ${expected.fractionPct} %${expected.lane === 'PROCESSED' ? ' post-processed' : ''}` : o.experimentId,
      view: outlierView(o.selection),
    });
  });

  return Object.freeze({
    study: Object.freeze({
      idText: `Study ${snap.studyId}`,
      summaryText,
      idWarning: snap.idConfirmed === false
        ? `the server answered for ${snap.servedStudyId || 'no study_id'} - shown, not relabelled`
        : null,
      datasetText: snap.dataset && snap.dataset.available
        ? snap.dataset.label : `dataset unavailable${served(snap.dataset && snap.dataset.served)}`,
      counts: Object.freeze(counts),
      countsText: snap.caseCounts && !snap.caseCounts.available ? 'case counts unavailable' : null,
      capabilities: Object.freeze(snap.capabilities ? [...snap.capabilities.names] : []),
    }),
    experiments: Object.freeze({
      text: experimentsText,
      notes: Object.freeze(notes),
      rows: familyRows(exp ? exp.matrix.map((row) => cellCard({
        ...row, points: [], identity: null, identityConfirmed: null, summary: null, context: null, pointsWithheld: null,
        servedVariant: null,
      }, { withValues: false })) : []),
    }),
    headline: Object.freeze(snap.headline.map(comparisonRow)),
    outliers: Object.freeze({
      rule: OUTLIER_RULE.text,
      text: outlierGroups.length ? null : 'no listed experiment, so no lowest-Dice selection to show',
      groups: Object.freeze(outlierGroups),
    }),
    findings: findingsView(snap.findings),
    routes: Object.freeze({
      cases: route('SCR-02', { studyId: snap.studyId }),
      experiments: route('SCR-07', {}),
      findings: route('SCR-08', {}),
    }),
  });
}

function rowStatusText(row) {
  switch (row.plotState) {
    case 'PLOTTED': return 'plotted';
    case 'FAILED': return 'failed';
    case 'EXCLUDED': return 'excluded';
    case 'WITHHELD': return 'withheld - inference-review case, no value';
    case 'VALUE_NOT_RETURNED': return 'succeeded, value not returned';
    case 'NO_METRIC_SELECTED': return row.status === 'SUCCEEDED' ? 'succeeded - pick a metric' : String(row.status);
    case 'NO_CASE_ID': return 'no case id';
    case 'DUPLICATE_CASE_ID': return 'duplicate case id - not plotted';
    case 'UNKNOWN_STATUS': return `status "${row.status}" not recognised`;
    default: return String(row.plotState);
  }
}

/* The per-case table of one cell: every row the server sent, none dropped. */
export function caseTable(cell) {
  if (!cell) return null;
  if (!cell.cases) {
    return Object.freeze({
      id: cell.id, title: cellTitle(cell),
      text: `per-case rows: ${reasonLabel(cell.casesView ? cell.casesView.reason : 'CASES_NOT_REQUESTED') || 'not loaded'}`,
      rows: Object.freeze([]),
    });
  }
  const c = cell.cases.counts;
  // The model drops a value sent on a row that did not succeed; it is counted here so the drift stays visible.
  const ignored = c.servedValueIgnored ? `; ${c.servedValueIgnored} value(s) served on rows that did not succeed - ignored` : '';
  // A number is shown, and a row called plotted, only when this cell drew it. A refused cell still lists its rows,
  // and printing their values would put RAW numbers under a PROCESSED column.
  const drawn = new Set(cell.points.map((p) => p.index));
  const withheld = rowsWithheldText(cell);
  return Object.freeze({
    id: cell.id,
    title: cellTitle(cell),
    text: c.total === 0 ? reasonLabel('NO_CASE_RESULTS')
      : withheld ? `${c.total} row(s) returned - ${withheld}${ignored}`
        : `${c.total} row(s) returned, ${drawn.size} plotted${ignored}`,
    rows: Object.freeze(cell.cases.rows.map((r) => Object.freeze({
      key: `${r.index}`,
      caseId: r.caseId || 'case id not returned',
      statusText: `${withheld && r.plotState === 'PLOTTED' ? 'succeeded - not drawn' : rowStatusText(r)}`
        + `${r.servedValueIgnored ? ' - its served value is ignored' : ''}`,
      reason: r.reason,
      valueText: drawn.has(r.index) && r.value !== null ? fmt(r.value) : null,
      route: routeForIntent(r.intent),
    }))),
  });
}

// Why a cell's rows carry no number although the server sent rows.
function rowsWithheldText(cell) {
  if (cell.status === CELL_STATUS.VARIANT_MISMATCH) return 'the metrics were served for another variant - listed, not drawn, not linked';
  if (cell.pointsWithheld === 'CASES_FOR_ANOTHER_VARIANT') return reasonLabel('CASES_FOR_ANOTHER_VARIANT');
  if (cell.status !== CELL_STATUS.LOADED) return reasonLabel('CELL_NOT_LOADED');
  return null;
}

function deltaText(c, metricName, stat) {
  if (c.kind === 'TREND' || !c.requested) return null;
  // Never "pick a metric" for numbers the model will not release.
  if (withheldOf(c)) return `no difference shown: ${withheldOf(c)}`;
  if (!c.presentation.mayShowDelta) return `no difference shown: ${c.presentation.reason || 'not comparable'}`;
  if (!metricName || !stat) return 'pick a metric and a statistic to see the difference';
  const d = deltaFor(c, { metricName, stat });
  if (!d.allowed) return `no difference shown: ${d.reason}`;
  const sign = d.delta > 0 ? '+' : '';
  return `${stat} ${metricName}: ${d.to} ${fmt(d.b)} vs ${d.from} ${fmt(d.a)}, difference ${sign}${fmt(d.delta)} `
    + '(server common-population summaries)';
}

function trendRows(snap, stat) {
  if (!snap.metricName || !stat) return Object.freeze([]);
  return Object.freeze(buildTrend(snap.cells, snap.comparisons, { metricName: snap.metricName, stat }).map((t) => Object.freeze({
    family: t.family,
    label: FAMILY_LABEL[t.family],
    pointsText: t.points.map((p) => `${p.fractionPct} % ${p.value !== null ? fmt(p.value) : 'unavailable'}`).join(' · '),
    connected: t.connected,
    text: t.connected ? 'joined: the server judged these runs comparable' : `not joined: ${t.reason}`,
  })));
}

/* SCR-07, as text and links. `stat` and `selectedCellId` are screen choices. */
export function comparisonView(snap, { stat = null, selectedCellId = null } = {}) {
  const cards = snap.cells.map((cell) => cellCard(cell, { metricName: snap.metricName, comparisons: snap.comparisons }));
  const list = snap.list;
  let listText = null;
  if (list && list.view && list.view.state !== STATE.SUCCESS) listText = `experiment list: ${reasonLabel(list.view.reason) || list.view.state}`;
  else if (list) listText = `${list.listedIds.length} experiment(s) listed by the server${list.unreadableRows ? `, ${list.unreadableRows} row(s) without an experiment_id` : ''}`;
  const selected = selectedCellId ? snap.cells.find((c) => c.id === selectedCellId) || null : null;
  return Object.freeze({
    modeText: snap.mode === 'EXPLICIT'
      ? `Comparing ${snap.requested.join(' · ') || 'nothing'} (opened with explicit ids)`
      : `The experiment matrix, filled from the server's experiment list`,
    listText,
    outsideMatrixText: snap.outsideMatrix.length ? `outside the experiment matrix, not drawn: ${snap.outsideMatrix.join(', ')}` : null,
    metric: Object.freeze({
      selected: snap.metricName,
      choices: snap.metricNames,
      emptyText: snap.metricNames.length ? null : "The server's summaries name no metric yet - nothing to plot.",
    }),
    stat: Object.freeze({ selected: stat, choices: STAT_CHOICES }),
    rows: familyRows(cards),
    stripNotes: Object.freeze(cards.filter((c) => c.withheldText).map((c) => `${c.title}: ${c.withheldText}`)),
    comparisons: Object.freeze(snap.comparisons.map((c) => Object.freeze({
      ...comparisonRow(c), deltaText: deltaText(c, snap.metricName, stat),
    }))),
    trend: trendRows(snap, stat),
    trendText: snap.metricName && !stat ? "pick a statistic to list each run's value under the chart" : null,
    selected: caseTable(selected),
    selectedOutliers: selected ? outlierView(selected.outliers) : null,
  });
}

/* What a tapped strip point says, and where it leads. */
export function pointDetail(point, metricName) {
  if (!point) return null;
  return Object.freeze({
    text: `${point.caseId} · ${metricName || 'metric'} ${fmt(point.value)} · ${point.column}`
      + `${point.outlier ? ` · one of the ${OUTLIER_LABEL} (server)` : ''}`,
    route: routeForIntent(point.intent),
  });
}

export { summaryStat };

// Strip-plot geometry for SCR-07: numbers only, no drawing. Not a box plot, because its whiskers would flag
// outliers by Tukey's 1.5 x IQR rule, a second definition next to the server's. Every case is its own point that a
// tap can open. Jitter follows a golden-ratio sequence, so the same data always draws the same picture.

const GOLDEN = 0.6180339887498949;

// columns: [{ key, label, group, points: [{ caseId, value, intent }], highlight: [caseId] }].
// `axis` is the value range drawn; [0, 1] fits Dice and IoU. A value outside it goes to `offAxis` instead of being
// clipped to the edge, where it would read as a 0 or a 1 it is not.
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

// The point a tap lands on: the nearest one within its radius plus `slop` (a finger is bigger than a dot), or null.
// On equal distances the first point drawn wins.
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
