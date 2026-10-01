/*
 * V3 screen copy and routing - pure, so `node --test` checks exactly what
 * SCR-01 and SCR-07 say. The React files next to this one only draw it.
 *
 * Everything here READS the V3 state models of app/verticals/v3_study_and_compare
 * (PR #61). Nothing here decides a scientific question:
 *   - comparability is the server's verdict, already read by the model;
 *   - an unavailable value is printed as "unavailable" with its reason and
 *     what the server sent - never as 0, never as a dash that could be read
 *     as one;
 *   - a link to SCR-03 exists only when the server named case, run and
 *     variant (the model's caseIntent); otherwise the reason is shown.
 */

import { STATE } from '../../../../app/core/index.mjs';
import {
  CELL_STATUS, FAMILY, MATRIX, OUTLIER_RULE, buildTrend, deltaFor, labelsForCell, summaryStat,
} from '../../../../app/verticals/v3_study_and_compare/index.mjs';
import { TONE } from '../../ui/stateCopy.mjs';

export const FAMILY_LABEL = Object.freeze({ [FAMILY.UNET]: 'UNet', [FAMILY.DINOV2]: 'DINOv2' });

// The statistics a screen may ask the server's summary for. Picked by the
// user; there is no default (the contract names none yet - README TODO 3).
export const STAT_CHOICES = Object.freeze(['median', 'mean']);

const REASON = Object.freeze({
  NOT_LISTED: "not in the server's experiment list",
  NOT_REQUESTED: 'not requested on this screen',
  NOT_RETURNED: 'not returned by the server',
  WRONG_TYPE: 'returned, but not in a readable form',
  NO_READABLE_STATISTIC: 'no readable statistic in the server summary',
  CELL_NOT_LOADED: 'no metrics loaded for this experiment',
  NO_CASE_RESULTS: 'no per-case result yet',
  NO_METRIC_SELECTED: 'pick a metric to plot',
  CASES_NOT_REQUESTED: 'per-case rows not requested',
  CASES_NOT_LOADED: 'per-case rows did not load',
  NO_EXPERIMENTS_LISTED: 'the server lists no experiment yet',
  OUTLIERS_NOT_RETURNED: 'the server returned no DR-010 outlier selection',
  OUTLIERS_UNREADABLE: 'the outlier selection is not in a readable form - not shown',
  OUTLIERS_UNDER_ANOTHER_RULE: 'the selection cites another rule than DR-010 - not shown',
  OUTLIERS_WITHOUT_EXPERIMENT_OR_VARIANT: 'the selection does not name its experiment and variant - not shown',
  OUTLIERS_FOR_ANOTHER_EXPERIMENT: 'the selection belongs to another experiment - not shown',
  OUTLIERS_FOR_ANOTHER_VARIANT: 'the selection was made for another variant - not shown',
  NO_ELIGIBLE_CASES: 'no successfully evaluated case to select from',
  ARTIFACT_NOT_FOUND: 'the server has no such artifact',
  GROUND_TRUTH_UNAVAILABLE: 'ground truth unavailable - metrics cannot exist, not zero',
  RUN_NOT_SUCCEEDED: 'the run has not produced a successful result yet',
  NON_COMPARABLE_EXPERIMENTS: 'the server says these experiments are not comparable',
  TRANSPORT_UNREACHABLE: 'the backend could not be reached',
  FIXTURE_SCENARIO_MISSING: 'the fixture bundle has no scenario for this request',
  CONTRACT_DRIFT: 'the response does not match the API contract',
  UNAUTHORIZED: 'not authorised',
});

export function reasonLabel(code) {
  if (code === null || code === undefined || code === '') return null;
  return REASON[code] || String(code);
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

/*
 * One matrix cell as a card. `withValues: false` is SCR-01: N and status
 * only, because a value there would sit next to another with no
 * comparability label.
 */
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

/* Cards grouped into the two family rows of `08` section 2, in matrix order. */
export function familyRows(cards) {
  return Object.freeze([FAMILY.UNET, FAMILY.DINOV2].map((family) => Object.freeze({
    family,
    label: FAMILY_LABEL[family],
    cells: Object.freeze(cards.filter((c) => c.family === family)),
  })));
}

export function verdictText(c) {
  if (!c.requested) return 'not requested';
  switch (c.comparability.verdict) {
    case 'COMPARABLE': return 'comparable (server verdict)';
    case 'NOT_COMPARABLE': return 'NOT comparable (server verdict)';
    default: return 'undecided - treated as not comparable';
  }
}

export function comparisonRow(c) {
  const fair = c.requested && c.presentation.mayLabelFair;
  let tone = TONE.NEUTRAL;
  if (c.requested && c.comparability.verdict === 'NOT_COMPARABLE') tone = TONE.WARN;
  else if (c.requested && !fair) tone = TONE.WARN;
  return Object.freeze({
    id: c.id,
    label: c.label,
    question: c.question,
    verdictText: verdictText(c),
    fair,
    tone,
    reason: c.requested ? c.presentation.reason : c.notRequestedReason,
    populationText: c.population && c.population.available ? `common population ${c.population.label}` : null,
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
    text: `${OUTLIER_RULE.id} outliers for ${o.experimentId} (${o.variant.declared}), in the order the server sent`
      + `${o.ruleCited ? '' : ' - the server did not cite the rule'}`,
    rule: OUTLIER_RULE.text,
    rows: Object.freeze(o.cases.map((c) => Object.freeze({
      key: `${c.rank}:${c.caseId}`,
      caseId: c.caseId || 'case id not returned',
      valueText: c.value.available ? `${o.metricName || 'metric'} ${fmt(c.value.value)}` : 'value unavailable',
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
  if (exp && exp.outsideMatrix.length) notes.push(`also listed, outside the 08 §2 matrix: ${exp.outsideMatrix.join(', ')}`);
  if (exp && exp.population) {
    notes.push(exp.population.available ? `evaluation population: ${exp.population.label}` : 'evaluation population unavailable');
  }

  const counts = snap.caseCounts ? snap.caseCounts.counts.map(({ key, count }) => Object.freeze({
    key, text: count.available ? String(count.value) : `unavailable${served(count.served)}`,
  })) : [];

  return Object.freeze({
    study: Object.freeze({
      idText: `Study ${snap.studyId}`,
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
    outliers: outlierView(snap.outliers),
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
    case 'VALUE_NOT_RETURNED': return 'succeeded, value not returned';
    case 'NO_METRIC_SELECTED': return row.status === 'SUCCEEDED' ? 'succeeded - pick a metric' : String(row.status);
    case 'NO_CASE_ID': return 'no case id';
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
  return Object.freeze({
    id: cell.id,
    title: cellTitle(cell),
    text: c.total === 0 ? reasonLabel('NO_CASE_RESULTS') : `${c.total} row(s) returned, ${c.plotted} plotted`,
    rows: Object.freeze(cell.cases.rows.map((r) => Object.freeze({
      key: `${r.index}`,
      caseId: r.caseId || 'case id not returned',
      statusText: rowStatusText(r),
      reason: r.reason,
      valueText: r.value !== null ? fmt(r.value) : null,
      route: routeForIntent(r.intent),
    }))),
  });
}

function deltaText(c, metricName, stat) {
  if (c.kind === 'TREND' || !c.requested) return null;
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
      : `The 08 §2 matrix, filled from the server's experiment list`,
    listText,
    outsideMatrixText: snap.outsideMatrix.length ? `outside the 08 §2 matrix, not drawn: ${snap.outsideMatrix.join(', ')}` : null,
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
    trendText: snap.metricName && stat ? null : 'pick a metric and a statistic to see the 25 -> 50 -> 100 % trend',
    selected: caseTable(selected),
    selectedOutliers: selected ? outlierView(selected.outliers) : null,
  });
}

/* What a tapped strip point says, and where it leads. */
export function pointDetail(point, metricName) {
  if (!point) return null;
  return Object.freeze({
    text: `${point.caseId} · ${metricName || 'metric'} ${fmt(point.value)} · ${point.column}`
      + `${point.outlier ? ' · DR-010 outlier (server)' : ''}`,
    route: routeForIntent(point.intent),
  });
}

export { summaryStat };
