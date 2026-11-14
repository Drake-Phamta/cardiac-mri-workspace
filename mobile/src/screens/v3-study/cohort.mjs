// Builds one cell of the experiment matrix from the experiment_get, experiment_metrics and experiment_cases states,
// and asks the server to judge each comparison. Used by SCR-01 and SCR-07. Only requestCell and requestComparisons
// call the client; the rest is plain logic the tests check without a network.

import { STATE } from '../../api/states.mjs';
import { getEndpoint } from '../../api/contract.mjs';
import {
  readComparability, presentation, VERDICT, COMPARISONS, OUTLIER_RULE, ROW_STATUS, UNAVAILABLE, matrixEntry, readExperimentIdentity, readCohortN, readMetricSummary, readVariant, readCaseRows, readOutlierSelection, readPopulation, summaryStat,
} from './readers.mjs';

export const CELL_STATUS = Object.freeze({
  NOT_LISTED: 'NOT_LISTED',             // the server's experiment list does not contain it
  NOT_REQUESTED: 'NOT_REQUESTED',       // listed, but this screen did not ask for it
  LOADING: 'LOADING',
  LOADED: 'LOADED',                     // metrics served, for the variant `08` section 2 defines
  PROCESSING: 'PROCESSING',
  UNAVAILABLE: 'UNAVAILABLE',           // legitimately absent: a reason, never a zero
  ERROR: 'ERROR',                       // recoverable: retry
  STALE: 'STALE',
  INVALID: 'INVALID',                   // blocked: drift, bad request
  VARIANT_MISMATCH: 'VARIANT_MISMATCH', // served for another variant: refused, not relabelled
});

export const CELL_UNAVAILABLE = Object.freeze({
  CELL_NOT_LOADED: 'CELL_NOT_LOADED',
  // No per-case result yet. Said in words, because an empty strip alone would read as "no cases failed".
  NO_CASE_RESULTS: 'NO_CASE_RESULTS',
  // The case rows are for another variant than the metrics: they stay listed, but nothing is drawn or linked.
  CASES_FOR_ANOTHER_VARIANT: 'CASES_FOR_ANOTHER_VARIANT',
});

function statusFromView(view) {
  switch (view.state) {
    case STATE.SUCCESS: return CELL_STATUS.LOADED;
    case STATE.LOADING: return CELL_STATUS.LOADING;
    case STATE.PROCESSING: return CELL_STATUS.PROCESSING;
    case STATE.EMPTY_UNAVAILABLE: return CELL_STATUS.UNAVAILABLE;
    case STATE.RECOVERABLE_ERROR: return CELL_STATUS.ERROR;
    case STATE.STALE_MISMATCH: return CELL_STATUS.STALE;
    default: return CELL_STATUS.INVALID;
  }
}

// The aggregation level is read from the contract, not typed here, so the level shown on screen traces to it.
export function aggregationFor(contract) {
  return Object.freeze({
    cohort: Object.freeze({ level: 'COHORT', source: `contract: experiment_metrics - ${getEndpoint(contract, 'experiment_metrics').semantic}` }),
    case: Object.freeze({ level: 'CASE', source: `contract: experiment_cases - ${getEndpoint(contract, 'experiment_cases').semantic}` }),
  });
}

export function notListedCell(expected, status = CELL_STATUS.NOT_LISTED) {
  return Object.freeze({
    ...expected,
    status,
    statusReason: status === CELL_STATUS.NOT_LISTED
      ? `${expected.id} is not in the server's experiment list`
      : `${expected.id} was not requested by this screen`,
    identityConfirmed: null, identity: null, identityView: null, metricsView: null, casesView: null,
    confirmedLane: null, servedVariant: null, n: null, summary: null, metricVersion: null,
    cases: null, points: Object.freeze([]), pointsWithheld: status,
    outliers: readOutlierSelection(undefined),
    population: null,
    context: null,
  });
}

// One matrix cell from up to three screen states. It is LOADED only when the metrics were served for the variant
// the spec defines the experiment by; otherwise it is VARIANT_MISMATCH with no number (spec 11 §6: no silent
// substitution). Points and outliers exist only for a LOADED cell. Case rows are kept whenever experiment_cases
// succeeded, so failed and excluded cases stay visible. An identity mismatch is reported but moves nothing.
export function buildCell(expected, {
  identityView = null, metricsView = null, casesView = null,
  population = null, metricName = null, aggregation = null,
} = {}) {
  if (!metricsView) return notListedCell(expected, CELL_STATUS.NOT_REQUESTED);

  const identity = identityView && identityView.state === STATE.SUCCESS
    ? readExperimentIdentity(identityView.data, expected) : null;

  let status = statusFromView(metricsView);
  let statusReason = metricsView.state === STATE.SUCCESS ? null : (metricsView.reason ?? null);
  let servedVariant = null;
  let n = null;
  let summary = null;
  let metricVersion = null;

  if (metricsView.state === STATE.SUCCESS) {
    servedVariant = readVariant(metricsView.data.prediction_variant);
    metricVersion = metricsView.data.metric_version ?? null;
    if (servedVariant.lane !== expected.lane) {
      status = CELL_STATUS.VARIANT_MISMATCH;
      statusReason = `08 section 2 defines ${expected.id} on ${expected.lane}; the metrics were served for `
        + `${servedVariant.declared ?? 'no declared variant'} - refused, not relabelled (11 section 6)`;
    } else {
      n = readCohortN(metricsView.data);
      summary = readMetricSummary(metricsView.data.metric_summary);
    }
  }

  // `lane` is the variant the spec defines; `confirmedLane` is the one the server served. Only confirmedLane is ever
  // passed to SCR-03.
  const confirmedLane = status === CELL_STATUS.LOADED ? servedVariant.lane : null;
  const loaded = status === CELL_STATUS.LOADED;
  const casesOk = Boolean(casesView && casesView.state === STATE.SUCCESS);
  // Rows count as this cell's only if experiment_cases states the same variant.
  const casesVariant = casesOk ? readVariant(casesView.data.prediction_variant) : null;
  const casesMatch = loaded && casesOk && casesVariant.lane === confirmedLane;
  const disabledIntentReason = casesMatch ? null : (!loaded
    ? (statusReason || 'this experiment is not loaded, so its case links are disabled')
    : casesVariant?.lane
      ? `the per-case rows were served for ${casesVariant.declared}, not the experiment's ${confirmedLane} variant - listed, not drawn, not linked`
      : `the server did not confirm the per-case prediction variant (served ${casesVariant?.declared ?? 'no variant'}) - listed, not drawn, not linked`);
  const cases = casesOk
    ? readCaseRows(casesView.data, {
      metricName,
      variant: casesMatch ? confirmedLane : null,
      experimentId: expected.id,
      disabledIntentReason,
    })
    : null;
  const points = casesMatch ? Object.freeze(cases.rows.filter((r) => r.plotted)) : Object.freeze([]);
  let pointsWithheld = null;
  if (!loaded) pointsWithheld = CELL_UNAVAILABLE.CELL_NOT_LOADED;
  else if (!cases) pointsWithheld = casesView ? (casesView.reason ?? 'CASES_NOT_LOADED') : 'CASES_NOT_REQUESTED';
  else if (!casesMatch) pointsWithheld = CELL_UNAVAILABLE.CASES_FOR_ANOTHER_VARIANT;
  else if (cases.rows.length === 0) pointsWithheld = CELL_UNAVAILABLE.NO_CASE_RESULTS;
  else if (!metricName) pointsWithheld = 'NO_METRIC_SELECTED';

  let outliers;
  if (casesMatch) {
    outliers = readOutlierSelection(casesView.data.outlier_selection, { experimentId: expected.id, variant: confirmedLane });
    // Every case the selection names must be a SUCCEEDED row of this same answer. If not, the whole selection is
    // refused: dropping one entry would re-derive the selection on the client. This check is exact only while
    // experiment_cases is not paged; with paging it must test for a non-SUCCEEDED row instead, or move to the server.
    if (outliers.available) {
      const succeeded = new Set(cases.rows.filter((r) => r.status === ROW_STATUS.SUCCEEDED && r.caseId).map((r) => r.caseId));
      const ineligible = outliers.cases.filter((c) => !succeeded.has(c.caseId)).map((c) => c.caseId ?? '?');
      if (ineligible.length) {
        outliers = Object.freeze({
          available: false,
          reason: UNAVAILABLE.OUTLIERS_NAME_INELIGIBLE_CASE,
          ruleId: OUTLIER_RULE.id,
          cases: Object.freeze([]),
          served: ineligible.join(', '),
        });
      }
    }
  } else {
    outliers = Object.freeze({
      available: false,
      reason: loaded && casesOk ? CELL_UNAVAILABLE.CASES_FOR_ANOTHER_VARIANT : CELL_UNAVAILABLE.CELL_NOT_LOADED,
      ruleId: OUTLIER_RULE.id,
      cases: Object.freeze([]),
    });
  }

  const cell = {
    ...expected,
    status,
    statusReason,
    // null when experiment_get was not asked (SCR-01 does not ask it).
    identityConfirmed: identity ? identity.consistent : null,
    identity,
    identityView,
    metricsView,
    casesView,
    confirmedLane,
    servedVariant,
    n,
    summary,
    metricVersion,
    cases,
    points,
    pointsWithheld,
    outliers,
    population,
  };
  cell.context = loaded ? metricContext(cell, aggregation) : null;
  return Object.freeze(cell);
}

// Rule D2 (the "missing for D2" line on SCR-07): a metric on screen names its model, variant, aggregation level,
// population and N. Each missing item is named, and `complete` stays false until the server supplied all of them.
export function metricContext(cell, aggregation) {
  const fields = {
    experiment: cell.id,
    model: cell.identity?.family.declared ?? null,
    trainingFraction: cell.identity?.fraction.declared ?? null,
    variant: cell.servedVariant?.declared ?? null,
    aggregation: aggregation?.cohort?.level ?? null,
    population: cell.population?.available ? cell.population.label : null,
    nIntended: cell.n?.intended.available ? cell.n.intended.value : null,
    nSuccessful: cell.n?.successful.available ? cell.n.successful.value : null,
    metricVersion: cell.metricVersion,
  };
  const missing = Object.keys(fields).filter((k) => fields[k] === null || fields[k] === undefined);
  const show = (v) => (v === null || v === undefined ? 'unavailable' : String(v));
  return Object.freeze({
    ...fields,
    identityConfirmed: cell.identity?.consistent === true,
    complete: missing.length === 0,
    missing: Object.freeze(missing),
    aggregationSource: aggregation?.cohort?.source ?? null,
    text: `${fields.experiment} · model ${show(fields.model)} · variant ${show(fields.variant)} · `
      + `${show(fields.aggregation)} level · population ${show(fields.population)} · `
      + `N intended ${show(fields.nIntended)} · N successful ${show(fields.nSuccessful)} · `
      + `metric ${show(fields.metricVersion)}`,
  });
}

const pick = (scenarios, endpointId) => (scenarios && scenarios[endpointId]) || 'default';

// Fetches one cell's three endpoints in parallel. The fixture transport ignores the id and a real server does not,
// so readExperimentIdentity checks the experiment_id that comes back.
export async function requestCell(client, expected, {
  scenarios, withIdentity = true, withCases = true,
} = {}) {
  const params = { experiment_id: expected.id };
  const [identityView, metricsView, casesView] = await Promise.all([
    withIdentity ? client.call('experiment_get', params, { scenario: pick(scenarios, 'experiment_get') }) : null,
    client.call('experiment_metrics', params, { scenario: pick(scenarios, 'experiment_metrics') }),
    withCases ? client.call('experiment_cases', params, { scenario: pick(scenarios, 'experiment_cases') }) : null,
  ]);
  return { identityView, metricsView, casesView };
}

// Asks only for comparisons whose members are all present; readComparison decides what a screen may use.
export async function requestComparisons(client, present, { scenarios } = {}) {
  return Promise.all(COMPARISONS.map(async (c) => {
    const missing = c.experimentIds.filter((id) => !present.has(id));
    if (missing.length > 0) {
      const comparability = readComparability({});
      return Object.freeze({
        ...c,
        requested: false,
        notRequestedReason: `${missing.join(', ')} not available to compare`,
        view: null,
        comparability,
        presentation: presentation(comparability),
        summaries: null,
        numbersWithheld: null,
      });
    }
    const view = await client.call('experiment_compare', { experiment_ids: [...c.experimentIds] },
      { scenario: pick(scenarios, 'experiment_compare') });
    return readComparison(c, view);
  }));
}

export const COMPARE_UNAVAILABLE = Object.freeze({
  COMPARE_FOR_ANOTHER_VARIANT: 'COMPARE_FOR_ANOTHER_VARIANT',
  // RQ-B mixes RAW and PROCESSED, but a compare has one prediction_variant, so it cannot describe that pair yet.
  MIXED_VARIANT_COMPARE_UNDEFINED: 'MIXED_VARIANT_COMPARE_UNDEFINED',
  SUMMARY_DOES_NOT_COVER_EVERY_ID: 'SUMMARY_DOES_NOT_COVER_EVERY_ID',
});

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The one variant all members are defined on, or null when they mix variants (RQ-B).
function commonLane(c) {
  const lanes = new Set(c.experimentIds.map((id) => (matrixEntry(id) ? matrixEntry(id).lane : null)));
  return lanes.size === 1 ? [...lanes][0] : null;
}

// One comparison from its experiment_compare state. NON_COMPARABLE_EXPERIMENTS is an answer, not a failure, and reads
// like `comparable: false`; any other failure leaves the verdict UNDECIDED. Numbers are withheld when the body was
// served for another variant, when the pair mixes RAW and PROCESSED (RQ-B), or when a comparable verdict comes
// without a summary for every compared id: a fair label needs the numbers it vouches for.
export function readComparison(c, view) {
  let comparability;
  let summaries = null;
  let numbersWithheld = null;
  if (view.state === STATE.SUCCESS) {
    const lane = commonLane(c);
    const served = readVariant(view.data.prediction_variant);
    const summary = isPlainObject(view.data.summary) ? view.data.summary : null;
    const uncovered = c.experimentIds.filter((id) => !summary || !isPlainObject(summary[id]));
    if (lane === null) {
      comparability = readComparability(view.data);
      numbersWithheld = Object.freeze({
        code: COMPARE_UNAVAILABLE.MIXED_VARIANT_COMPARE_UNDEFINED,
        reason: `${c.label} compares RAW with PROCESSED; the contract does not define a mixed-variant compare `
          + 'yet, so its numbers are withheld',
      });
    } else if (served.lane !== lane) {
      const reason = `the comparison was served for ${served.declared ?? 'no declared variant'}, but ${c.label} `
        + `compares ${lane} runs - not labelled, numbers withheld`;
      comparability = readComparability({ compatibility_reason: reason });
      numbersWithheld = Object.freeze({ code: COMPARE_UNAVAILABLE.COMPARE_FOR_ANOTHER_VARIANT, reason });
    } else if (view.data.comparable === true && uncovered.length > 0) {
      const reason = `the server's comparable verdict came without a summary for ${uncovered.join(', ')} - unconfirmed`;
      comparability = readComparability({ compatibility_reason: reason });
      numbersWithheld = Object.freeze({ code: COMPARE_UNAVAILABLE.SUMMARY_DOES_NOT_COVER_EVERY_ID, reason });
    } else {
      comparability = readComparability(view.data);
      summaries = Object.freeze(Object.fromEntries(c.experimentIds.map((id) => [id,
        readMetricSummary(summary ? summary[id] : undefined)])));
    }
  } else if (view.error?.code === 'NON_COMPARABLE_EXPERIMENTS') {
    comparability = readComparability({ comparable: false, compatibility_reason: view.error.safeMessage });
  } else {
    comparability = readComparability({});
  }
  return Object.freeze({
    ...c,
    requested: true,
    notRequestedReason: null,
    view,
    comparability,
    presentation: presentation(comparability),
    population: view.state === STATE.SUCCESS ? readPopulation(view.data.common_evaluation_population) : null,
    summaries,
    numbersWithheld,
  });
}

/* Every server verdict that involves this cell: the labels a screen puts on it. */
export function labelsForCell(cellId, comparisons) {
  return Object.freeze(comparisons
    .filter((c) => c.requested && c.experimentIds.includes(cellId))
    .map((c) => Object.freeze({
      comparisonId: c.id,
      verdict: c.comparability.verdict,
      fair: c.presentation.mayLabelFair,
      reason: c.presentation.reason,
      with: Object.freeze(c.experimentIds.filter((id) => id !== cellId)),
    })));
}

// A head-to-head difference, only where the server judged the pair comparable, and only from its summaries over the
// common population. Per-experiment summaries may cover different cases, so subtracting them would compare
// populations, not models.
export function deltaFor(comparison, { metricName, stat }) {
  if (!comparison?.requested) return Object.freeze({ allowed: false, reason: comparison?.notRequestedReason ?? 'not requested' });
  if (comparison.kind !== 'HEAD_TO_HEAD' || comparison.experimentIds.length !== 2) {
    return Object.freeze({ allowed: false, reason: 'a delta is defined only for a two-run HEAD_TO_HEAD comparison' });
  }
  if (comparison.numbersWithheld) return Object.freeze({ allowed: false, reason: comparison.numbersWithheld.reason });
  if (!comparison.presentation.mayShowDelta) {
    return Object.freeze({ allowed: false, reason: comparison.presentation.reason ?? comparison.comparability.verdict });
  }
  const [a, b] = comparison.experimentIds;
  const va = summaryStat(comparison.summaries?.[a], metricName, stat);
  const vb = summaryStat(comparison.summaries?.[b], metricName, stat);
  if (va === null || vb === null) {
    return Object.freeze({ allowed: false, reason: `the server's common-population summary has no ${stat} of ${metricName}` });
  }
  return Object.freeze({ allowed: true, reason: null, from: a, to: b, metricName, stat, a: va, b: vb, delta: vb - va });
}

// The data-scarcity trend (RQ-A): one series per family over 25 / 50 / 100 %. Points are joined into a line only
// when the server judged the family's three runs comparable; otherwise they stay separate, with the reason.
export function buildTrend(cells, comparisons, { metricName, stat }) {
  return Object.freeze(['UNET', 'DINOV2'].map((family) => {
    const group = comparisons.find((c) => c.kind === 'TREND' && c.family === family) ?? null;
    const points = cells
      .filter((cell) => cell.family === family && cell.question === 'RQ-A')
      .map((cell) => Object.freeze({
        experimentId: cell.id,
        fractionPct: cell.fractionPct,
        value: cell.status === CELL_STATUS.LOADED ? summaryStat(cell.summary, metricName, stat) : null,
        n: cell.n,
        status: cell.status,
      }));
    // Every run must be present with a value: `every` over an empty list is true, and a line through no points is
    // still a claim.
    const connected = group?.comparability.verdict === VERDICT.COMPARABLE
      && points.length === group.experimentIds.length
      && points.every((p) => p.value !== null);
    return Object.freeze({
      family,
      metricName: metricName ?? null,
      stat: stat ?? null,
      points: Object.freeze(points),
      connected,
      reason: connected ? null
        : (group?.requested ? group.presentation.reason ?? 'not every point has a value' : (group?.notRequestedReason ?? 'not requested')),
    });
  }));
}

/* Metric names the server's summaries use, in matrix order, first seen first. */
export function metricNamesOf(cells) {
  const names = [];
  for (const cell of cells) {
    for (const m of cell.summary?.metrics ?? []) if (!names.includes(m.name)) names.push(m.name);
  }
  return Object.freeze(names);
}
