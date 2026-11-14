// State models for SCR-01 Study Overview and SCR-07 Experiment Comparison: factories over the API client whose
// actions return frozen snapshots wrapping a screen state (`view`). On SCR-01 a failed study_get is the screen's
// state; the other sections fail on their own, so a findings outage does not hide the study.

import { STATE, loading, success, RECOVERY, emptyUnavailable, stateForError } from '../../api/states.mjs';
import {
  MATRIX, UNAVAILABLE, matrixEntry, readExperimentRows, readPopulation, readDataset, readCaseCounts, readCapabilities, readExperimentSummary, MATRIX_IDS,
} from './readers.mjs';
import {
  CELL_STATUS, aggregationFor, buildCell, notListedCell, requestCell, requestComparisons, labelsForCell, buildTrend, deltaFor, metricNamesOf,
} from './cohort.mjs';

const pick = (scenarios, endpointId) => (scenarios && scenarios[endpointId]) || 'default';

function overviewSnapshot(view, f) {
  return Object.freeze({
    view,
    source: f.source ?? null,
    studyId: f.studyId ?? null,
    servedStudyId: f.servedStudyId ?? null,
    idConfirmed: f.idConfirmed ?? null,
    dataset: f.dataset ?? null,
    caseCounts: f.caseCounts ?? null,
    capabilities: f.capabilities ?? null,
    experimentSummary: f.experimentSummary ?? null,
    experiments: f.experiments ?? null,
    headline: Object.freeze([...(f.headline ?? [])]),
    // One outlier selection per listed experiment, in matrix order. The rule takes the experiment as an input, so
    // there is no single study-wide outlier list.
    outliers: Object.freeze([...(f.outliers ?? [])]),
    findings: f.findings ?? null,
  });
}

// One matrix cell on the overview: N and status, no metric value. Two values side by side would read as a
// comparison without the server's verdict.
function overviewRow(cell) {
  return Object.freeze({
    id: cell.id,
    family: cell.family,
    fractionPct: cell.fractionPct,
    lane: cell.lane,
    question: cell.question,
    status: cell.status,
    statusReason: cell.statusReason,
    n: cell.n,
    variant: cell.servedVariant?.declared ?? null,
    metricVersion: cell.metricVersion,
  });
}

function readFindings(view) {
  if (view.state !== STATE.SUCCESS) return Object.freeze({ view, returned: null, byStatus: Object.freeze([]), unreadable: 0 });
  const items = Array.isArray(view.data.items) ? view.data.items : [];
  const byStatus = [];
  let unreadable = 0;
  for (const row of items) {
    const status = typeof row?.status === 'string' && row.status ? row.status : null;
    if (!status || typeof row?.finding_id !== 'string') { unreadable += 1; continue; }
    const entry = byStatus.find((e) => e.status === status);
    if (entry) entry.count += 1; else byStatus.push({ status, count: 1 });
  }
  return Object.freeze({
    view,
    returned: items.length,
    byStatus: Object.freeze(byStatus.map((e) => Object.freeze(e))),
    unreadable,
  });
}

export function createStudyOverview(client) {
  const aggregation = aggregationFor(client.contract);
  let current = overviewSnapshot(loading(), { source: client.transportKind });
  let lastOpen = null;
  let seq = 0;

  const set = (view, patch = {}) => { current = overviewSnapshot(view, { ...current, ...patch }); return current; };

  // `studyId` has no default: which study to show is the caller's decision.
  async function open({ studyId, scenarios } = {}) {
    if (!studyId) throw new Error('createStudyOverview.open needs an explicit studyId');
    // Only the latest open() may write the snapshot, so a slow earlier answer never covers a newer one.
    seq += 1;
    const mine = seq;
    const stale = () => mine !== seq;
    lastOpen = { studyId, scenarios };
    current = overviewSnapshot(loading(), { studyId, source: client.transportKind });

    const study = await client.call('study_get', { study_id: studyId }, { scenario: pick(scenarios, 'study_get') });
    if (stale()) return current;
    if (study.state !== STATE.SUCCESS) return set(study, { studyId });

    const [listView, findingsView] = await Promise.all([
      client.call('experiment_list', {}, { scenario: pick(scenarios, 'experiment_list') }),
      client.call('findings_list', {}, { scenario: pick(scenarios, 'findings_list') }),
    ]);
    if (stale()) return current;

    const rows = listView.state === STATE.SUCCESS ? readExperimentRows(listView.data) : null;
    const listed = new Set(rows ? rows.ids : []);
    const population = listView.state === STATE.SUCCESS ? readPopulation(listView.data.evaluation_population) : null;
    const listedMatrix = MATRIX.filter((e) => listed.has(e.id));

    // Metrics and cases of each listed experiment. No identity call: this screen shows no provenance.
    const fetched = new Map();
    await Promise.all(listedMatrix.map(async (e) => {
      fetched.set(e.id, await requestCell(client, e, { scenarios, withIdentity: false, withCases: true }));
    }));
    if (stale()) return current;
    const cells = MATRIX.map((e) => (listed.has(e.id)
      ? buildCell(e, { ...fetched.get(e.id), population, aggregation })
      : notListedCell(e, listView.state === STATE.SUCCESS ? CELL_STATUS.NOT_LISTED : CELL_STATUS.NOT_REQUESTED)));

    const comparisons = await requestComparisons(client, listed, { scenarios });
    if (stale()) return current;
    const headline = comparisons.map((c) => Object.freeze({
      id: c.id,
      label: c.label,
      question: c.question,
      experimentIds: c.experimentIds,
      requested: c.requested,
      notRequestedReason: c.notRequestedReason,
      verdict: c.comparability.verdict,
      fair: c.presentation.mayLabelFair,
      reason: c.presentation.reason,
      population: c.population ?? null,
      // Summaries only under the server's COMPARABLE verdict and only when they are about these runs; otherwise
      // the screen shows a label and a reason.
      summaries: c.presentation.mayLabelFair && !c.numbersWithheld ? c.summaries : null,
      numbersWithheld: c.numbersWithheld ?? null,
      view: c.view,
    }));

    const servedStudyId = study.data.study_id ?? null;
    return set(success(Object.freeze({ studyId })), {
      studyId,
      servedStudyId,
      idConfirmed: servedStudyId === studyId,
      dataset: readDataset(study.data.dataset),
      caseCounts: readCaseCounts(study.data.case_counts),
      capabilities: readCapabilities(study.data.capabilities),
      experimentSummary: readExperimentSummary(study.data.experiment_summary),
      experiments: Object.freeze({
        view: listView,
        // No rows means "no experiment listed yet", not experiments with N 0.
        reason: rows && rows.total === 0 ? UNAVAILABLE.NO_EXPERIMENTS_LISTED : null,
        listedIds: rows ? rows.ids : Object.freeze([]),
        totalRows: rows ? rows.total : null,
        unreadableRows: rows ? rows.unreadable : null,
        outsideMatrix: Object.freeze((rows ? rows.ids : []).filter((id) => matrixEntry(id) === null)),
        variantProblems: rows ? rows.problems : Object.freeze([]),
        population,
        matrix: Object.freeze(cells.map(overviewRow)),
      }),
      headline,
      outliers: cells
        .filter((c) => listed.has(c.id))
        .map((c) => Object.freeze({ experimentId: c.id, selection: c.outliers })),
      findings: readFindings(findingsView),
    });
  }

  return Object.freeze({
    get current() { return current; },
    open,
    refresh: () => (lastOpen ? open(lastOpen) : Promise.resolve(current)),

    // SCR-01 actions, as navigation intents that the screen routes.
    openCases: () => Object.freeze({ screen: 'SCR-02', studyId: current.studyId, enabled: current.studyId !== null }),
    openExperiments: () => Object.freeze({ screen: 'SCR-07', experimentIds: null, enabled: true }),
    openComparison(comparisonId) {
      const h = current.headline.find((x) => x.id === comparisonId);
      return Object.freeze({
        screen: 'SCR-07',
        experimentIds: h ? [...h.experimentIds] : null,
        enabled: Boolean(h && h.requested),
        reason: h ? h.notRequestedReason : `unknown comparison ${comparisonId}`,
      });
    },
    // The experiment is an explicit input of the outlier rule, and the rank is the server's.
    openOutlier(experimentId, rank) {
      const entry = current.outliers.find((o) => o.experimentId === experimentId);
      const o = entry ? entry.selection : null;
      if (!o || !o.available) {
        return Object.freeze({
          screen: 'SCR-03', enabled: false,
          reason: o ? o.reason : `no outlier selection for ${experimentId}`,
        });
      }
      return o.cases[rank]?.intent ?? Object.freeze({ screen: 'SCR-03', enabled: false, reason: `no outlier at rank ${rank}` });
    },
    openFindings: () => Object.freeze({ screen: 'SCR-08', enabled: true }),
  });
}

// SCR-07 Experiment Comparison. open() without experimentIds shows every listed matrix experiment (MATRIX); with
// them, only those (EXPLICIT, for example a pair from SCR-01). metricName has no default: the contract does not name
// the metrics, so the user picks from the names the server's summaries use.

export const MODE = Object.freeze({ MATRIX: 'MATRIX', EXPLICIT: 'EXPLICIT' });

function comparisonSnapshot(view, f) {
  return Object.freeze({
    view,
    // 'fixture' means generated placeholders, not results, and the screen always says so.
    source: f.source ?? null,
    mode: f.mode ?? null,
    requested: Object.freeze([...(f.requested ?? [])]),
    outsideMatrix: Object.freeze([...(f.outsideMatrix ?? [])]),
    metricName: f.metricName ?? null,
    metricNames: f.metricNames ?? Object.freeze([]),
    list: f.list ?? null,
    cells: Object.freeze([...(f.cells ?? [])]),
    comparisons: Object.freeze([...(f.comparisons ?? [])]),
    aggregation: f.aggregation ?? null,
  });
}

export function createExperimentComparison(client) {
  const aggregation = aggregationFor(client.contract);
  let current = comparisonSnapshot(loading(), { source: client.transportKind });
  let lastOpen = null;
  let fetched = null; // the core states behind the cells, so selectMetric never re-fetches
  // Only the latest open() may write the snapshot, so a slow earlier answer never covers a newer one.
  let seq = 0;

  const set = (view, patch = {}) => { current = comparisonSnapshot(view, { ...current, ...patch }); return current; };

  function assemble(metricName) {
    const { mode, requestedIds, listed, list, raw } = fetched;
    const cells = MATRIX.map((expected) => {
      if (!requestedIds.includes(expected.id)) {
        return notListedCell(expected, mode === MODE.MATRIX && !listed.has(expected.id)
          ? CELL_STATUS.NOT_LISTED : CELL_STATUS.NOT_REQUESTED);
      }
      return buildCell(expected, {
        ...raw.get(expected.id),
        population: list.population,
        metricName,
        aggregation,
      });
    });
    return { cells, metricNames: metricNamesOf(cells) };
  }

  async function open({ experimentIds, metricName = null, scenarios } = {}) {
    seq += 1;
    const mine = seq;
    const stale = () => mine !== seq;
    lastOpen = { experimentIds, metricName, scenarios };
    // Forget the previous fetch first, so selectMetric after a failed re-open cannot rebuild old cells.
    fetched = null;
    const mode = Array.isArray(experimentIds) ? MODE.EXPLICIT : MODE.MATRIX;
    current = comparisonSnapshot(loading(), { mode, metricName, source: client.transportKind });

    const listView = await client.call('experiment_list', {}, { scenario: pick(scenarios, 'experiment_list') });
    if (stale()) return current;
    // Without the list, MATRIX mode has nothing to show; EXPLICIT mode only loses the population the list carries.
    if (mode === MODE.MATRIX && listView.state !== STATE.SUCCESS) {
      return set(listView, { mode, cells: MATRIX.map((e) => notListedCell(e, CELL_STATUS.NOT_REQUESTED)) });
    }

    const rows = listView.state === STATE.SUCCESS ? readExperimentRows(listView.data) : null;
    const listed = new Set(rows ? rows.ids : []);
    const list = Object.freeze({
      view: listView,
      listedIds: rows ? rows.ids : Object.freeze([]),
      // null when the list call failed: an unknown count is not 0.
      totalRows: rows ? rows.total : null,
      unreadableRows: rows ? rows.unreadable : null,
      // One population shared by every listed experiment, or null: shown as unavailable, never guessed.
      population: listView.state === STATE.SUCCESS ? readPopulation(listView.data.evaluation_population) : null,
      variants: rows ? rows.variants : Object.freeze({}),
      variantProblems: rows ? rows.problems : Object.freeze([]),
    });

    // No experiment listed yet (no run has finished) is an empty state with REFRESH, not blank cells or an N of 0.
    if (mode === MODE.MATRIX && rows.total === 0) {
      return set(emptyUnavailable(UNAVAILABLE.NO_EXPERIMENTS_LISTED, [RECOVERY.REFRESH]), {
        mode, list, requested: [],
        cells: MATRIX.map((e) => notListedCell(e, CELL_STATUS.NOT_LISTED)),
      });
    }

    const wanted = mode === MODE.EXPLICIT ? experimentIds : rows.ids;
    const requestedIds = wanted.filter((id) => matrixEntry(id) !== null);
    // Ids outside the matrix are shown by id, never dropped.
    const outsideMatrix = wanted.filter((id) => matrixEntry(id) === null);
    if (mode === MODE.EXPLICIT && requestedIds.length === 0) {
      return set(stateForError(client.contract, 'VALIDATION_ERROR'), {
        mode, list, outsideMatrix, requested: [],
        cells: MATRIX.map((e) => notListedCell(e, CELL_STATUS.NOT_REQUESTED)),
      });
    }

    const raw = new Map();
    await Promise.all(requestedIds.map(async (id) => {
      raw.set(id, await requestCell(client, matrixEntry(id), { scenarios }));
    }));
    if (stale()) return current;

    const present = new Set(requestedIds);
    const comparisons = await requestComparisons(client, present, { scenarios });
    if (stale()) return current;

    fetched = { mode, requestedIds, listed, list, raw };
    const { cells, metricNames } = assemble(metricName);
    return set(success(Object.freeze({ mode, requested: requestedIds })), {
      mode, list, outsideMatrix, requested: requestedIds, cells, comparisons, metricName, metricNames, aggregation,
    });
  }

  return Object.freeze({
    get current() { return current; },
    open,

    /* Re-runs the last open(): the RETRY and REFRESH action of a failed state. */
    refresh: () => open(lastOpen ?? {}),

    /* Picks the per-case metric the strip plots. Never re-fetches. */
    selectMetric(metricName) {
      if (!fetched) return current;
      const { cells, metricNames } = assemble(metricName);
      return set(current.view, { metricName, cells, metricNames });
    },

    cell: (id) => current.cells.find((c) => c.id === id) ?? null,
    labelsFor: (id) => labelsForCell(id, current.comparisons),
    comparison: (id) => current.comparisons.find((c) => c.id === id) ?? null,
    delta: (comparisonId, { stat }) => deltaFor(
      current.comparisons.find((c) => c.id === comparisonId) ?? null,
      { metricName: current.metricName, stat },
    ),
    trend: ({ stat }) => buildTrend(current.cells, current.comparisons, { metricName: current.metricName, stat }),

    /* Strip columns in matrix order, grouped by family: input for stripLayout. */
    stripColumns() {
      return current.cells.map((cell) => Object.freeze({
        key: cell.id,
        label: `${cell.fractionPct} %${cell.lane === 'PROCESSED' ? ' PP' : ''}`,
        group: cell.family,
        status: cell.status,
        withheld: cell.pointsWithheld,
        points: cell.points,
        highlight: cell.outliers.available ? cell.outliers.cases.map((c) => c.caseId) : [],
      }));
    },
  });
}

export { CELL_STATUS, MATRIX_IDS };
