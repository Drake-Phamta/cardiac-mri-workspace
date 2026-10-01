/*
 * V3 - SCR-01 Study Overview, as a state model.
 *
 * What `10` SCR-01 requires and where each comes from:
 *   study name / dataset       study_get: study_id, dataset
 *   case count                 study_get: case_counts, every key as served
 *   available experiments      experiment_list against the `08` section 2
 *                              matrix: listed or not, plus N intended /
 *                              N successful per listed cell (experiment_metrics)
 *   high-level comparable      experiment_compare: the server's verdict per
 *   metrics                    comparison, and its common-population summary
 *                              ONLY where the server said COMPARABLE
 *   outlier entry points       experiment_cases.outlier_selection of each
 *                              listed matrix experiment - the server's DR-010
 *                              selection for THAT experiment and variant
 *                              (contract 1.1.0 selection_rules), never computed
 *   experiment summary         study_get.experiment_summary: AVAILABLE or
 *                              UNAVAILABLE with a reason
 *   findings summary           findings_list, counted as returned
 *
 * Per-experiment metric VALUES are deliberately not on this screen. Two
 * numbers side by side read as a comparison, and here they would have no
 * comparability label; SCR-07 carries both. This screen shows, per cell, what
 * Khánh's design artifact shows: N and status.
 *
 * study_get is the screen: if it fails, its state is the screen's state. The
 * other sections fail on their own, each with its own core state, so a
 * findings outage does not hide the study.
 */

import { STATE, loading, success } from '../../core/index.mjs';
import {
  MATRIX, UNAVAILABLE, matrixEntry, readExperimentRows, readPopulation, readDataset, readCaseCounts, readCapabilities,
  readExperimentSummary,
} from './readers.mjs';
import {
  CELL_STATUS, aggregationFor, buildCell, notListedCell, requestCell, requestComparisons,
} from './cohort.mjs';

const pick = (scenarios, endpointId) => (scenarios && scenarios[endpointId]) || 'default';

function snapshot(view, f) {
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
    // One DR-010 selection per listed matrix experiment, in matrix order:
    // [{ experimentId, selection }]. DR-010 makes the experiment an explicit
    // input, so there is no single "study outlier list" to show.
    outliers: Object.freeze([...(f.outliers ?? [])]),
    findings: f.findings ?? null,
  });
}

/* What one matrix cell shows on the overview: N and status, no value. */
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
  let current = snapshot(loading(), { source: client.transportKind });
  let lastOpen = null;
  let seq = 0;

  const set = (view, patch = {}) => { current = snapshot(view, { ...current, ...patch }); return current; };

  /*
   * `studyId` has no default: SCR-01 is about one study, and which one is
   * the caller's decision.
   */
  async function open({ studyId, scenarios } = {}) {
    if (!studyId) throw new Error('createStudyOverview.open needs an explicit studyId');
    // Only the latest open() may write the snapshot (see experimentCompare.mjs).
    seq += 1;
    const mine = seq;
    const stale = () => mine !== seq;
    lastOpen = { studyId, scenarios };
    current = snapshot(loading(), { studyId, source: client.transportKind });

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

    // Metrics (N and status) and cases (only for the server's DR-010
    // selection) of each listed matrix experiment. No identity call: this
    // screen shows no provenance.
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
      // The server's common-population summaries, shown only under its own
      // COMPARABLE verdict and only when they are about these runs (variant,
      // coverage - readComparison). Anything else is a label and a reason.
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
        // A list that answered with no rows is a legitimate absence ("no
        // experiment listed yet"), not a list of experiments with N 0.
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

    /* `10` SCR-01 actions, as navigation intents. The shell routes them. */
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
    /* DR-010: the experiment is an explicit input; the rank is the server's. */
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
