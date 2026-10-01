/*
 * V3 cohort assembly - shared by SCR-01 and SCR-07.
 *
 * Turns the core screen states of experiment_get / experiment_metrics /
 * experiment_cases into one CELL of the `08` section 2 matrix, and asks the
 * server for the comparability of the pairs and groups in COMPARISONS.
 *
 * buildCell is pure (core states in, frozen cell out) so the logic is tested
 * without a transport; requestCell / requestComparisons are the only functions
 * here that call the client.
 */

import {
  STATE, getEndpoint, readComparability, presentation, VERDICT,
} from '../../core/index.mjs';
import {
  COMPARISONS, OUTLIER_RULE,
  readExperimentIdentity, readCohortN, readMetricSummary, readVariant, readCaseRows,
  readOutlierSelection, readPopulation, summaryStat,
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
  // experiment_cases answered with no rows: the experiment has no per-case
  // result yet. A legitimate absence (`10` section 8), said as such - an empty
  // strip with no words would read as "no cases failed".
  NO_CASE_RESULTS: 'NO_CASE_RESULTS',
  // experiment_cases says its rows are for another variant than the metrics
  // were served for (or says none): the rows stay listed, nothing is drawn or
  // linked - the same silent-substitution rule as VARIANT_MISMATCH.
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

/*
 * The aggregation level is a fact about the endpoint, and the contract states
 * it. It is read from contract.json rather than typed here, so D2's
 * "aggregation level" on screen traces to the contract.
 */
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

/*
 * One cell, from up to three core states. The rule for what a screen may draw:
 *
 *   - status LOADED needs experiment_metrics SUCCESS *and* a served variant
 *     equal to the one `08` section 2 defines the experiment by. A served
 *     PROCESSED for EXP-D-100 is the silent substitution `11` section 6
 *     forbids, so the cell is VARIANT_MISMATCH and shows no number.
 *   - points (the strip plot) and outliers exist only for a LOADED cell.
 *     Per-case rows are kept whenever experiment_cases succeeded, because
 *     failed and excluded cases stay visible (`08` section 8.1) - but a row
 *     whose variant the server never confirmed has a disabled intent.
 *   - an identity that disagrees with `08` section 2 is reported in
 *     identity.problems and does not move the cell. The numbers stay visible
 *     (they were served for this URL), labelled "identity unconfirmed".
 */
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

  // `lane` (spread from `expected`) is the variant `08` section 2 defines the
  // experiment by; `confirmedLane` is the one the server served. Only the
  // second is ever handed to SCR-03.
  const confirmedLane = status === CELL_STATUS.LOADED ? servedVariant.lane : null;
  const loaded = status === CELL_STATUS.LOADED;
  const casesOk = Boolean(casesView && casesView.state === STATE.SUCCESS);
  // Rows count as this cell's only if experiment_cases states the same variant.
  const casesMatch = loaded && casesOk && readVariant(casesView.data.prediction_variant).lane === confirmedLane;
  const cases = casesOk
    ? readCaseRows(casesView.data, { metricName, variant: casesMatch ? confirmedLane : null, experimentId: expected.id })
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
    // contract selection_rules.outlier_selection: the server's DR-010 block,
    // read as served - never computed here.
    outliers = readOutlierSelection(casesView.data.outlier_selection, { experimentId: expected.id, variant: confirmedLane });
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

/*
 * DEMO_STANDARD rule D2: a metric on screen names its run/model, prediction
 * variant, aggregation level, evaluation population and N (intended and
 * successful). This is that list for one cell, with every missing item named
 * as missing - `complete` is false until the server has supplied all of them.
 */
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

/*
 * Fetch one cell's three endpoints concurrently. The fixture transport ignores
 * the id; a real server does not - which is why readExperimentIdentity checks
 * the experiment_id that comes back against the one asked for.
 */
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

/*
 * The server's verdict on each comparison whose members are all present.
 *
 * NON_COMPARABLE_EXPERIMENTS is an ANSWER, not a failure: the server has
 * decided the runs are not comparable. It is read through core's
 * readComparability like a `comparable: false` body, so both routes produce
 * the same NOT_COMPARABLE label and the same "no delta" presentation. Any
 * other failure leaves the verdict UNDECIDED - which core already treats as
 * not comparable - with the failed state kept for the screen.
 */
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
      });
    }
    const view = await client.call('experiment_compare', { experiment_ids: [...c.experimentIds] },
      { scenario: pick(scenarios, 'experiment_compare') });
    let comparability;
    let summaries = null;
    if (view.state === STATE.SUCCESS) {
      comparability = readComparability(view.data);
      const s = view.data.summary;
      summaries = Object.freeze(Object.fromEntries(c.experimentIds.map((id) => [id,
        readMetricSummary(s && typeof s === 'object' ? s[id] : undefined)])));
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
    });
  }));
}

/* Every server verdict that involves this cell - the label a screen puts on it. */
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

/*
 * A head-to-head difference, only where the server said the pair is
 * comparable - core's presentation().mayShowDelta - and only from the
 * server's summaries over the COMMON population. The per-experiment summaries
 * may cover different cases, so subtracting those would compare populations,
 * not models.
 */
export function deltaFor(comparison, { metricName, stat }) {
  if (!comparison?.requested) return Object.freeze({ allowed: false, reason: comparison?.notRequestedReason ?? 'not requested' });
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

/*
 * The data-scarcity trend (RQ-A): one series per family over 25 / 50 / 100 %,
 * from each LOADED cell's served summary. Points are joined into a line only
 * when the server judged the family's three runs comparable; otherwise they
 * stay separate points with the reason.
 */
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
    // Every run of the group must be present with a value: `every` over an
    // empty list is true, and a line through no points is still a claim.
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
