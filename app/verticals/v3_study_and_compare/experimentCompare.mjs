/*
 * V3 - SCR-07 Experiment Comparison, as a state model.
 *
 * Framework-neutral, in the shape V1 and V4 use: a factory over a core
 * client, every action returning the same frozen snapshot the getter returns,
 * and the snapshot WRAPPING a core screen state (`view`) with the screen's own
 * fields next to it.
 *
 * What `10` SCR-07 requires and where each comes from:
 *   UNet vs DINOv2               cells of the `08` section 2 matrix, family rows
 *   25 / 50 / 100 %              cell columns; EXP-D-PP is the raw-vs-processed
 *                                ablation next to EXP-D-100 (PR-EXP-04, PR-IMG-01)
 *   aggregate                    experiment_metrics: N intended + N successful,
 *                                the served summary, as served
 *   distribution                 experiment_cases rows -> strip points (strip.mjs)
 *   trend                        buildTrend: joined only where the server says
 *                                the family's runs are comparable
 *   case evidence links          every point and every DR-010 outlier carries a
 *                                caseIntent for SCR-03
 *   comparability                experiment_compare verdicts, read by core
 *
 * Two ways in:
 *   open({ metricName })                      MATRIX - the cells the server lists
 *   open({ experimentIds: [...], metricName }) EXPLICIT - e.g. one pair from SCR-01
 * `metricName` picks the per-case metric the strip plots. It has no default:
 * the contract does not name the metrics yet, so the screen offers the names
 * the server's summaries use (snapshot.metricNames) and the user picks one.
 */

import { STATE, loading, success, stateForError } from '../../core/index.mjs';
import { MATRIX, MATRIX_IDS, matrixEntry, readIdRows, readPopulation, readVariant } from './readers.mjs';
import {
  CELL_STATUS, aggregationFor, buildCell, notListedCell, requestCell, requestComparisons,
  labelsForCell, buildTrend, deltaFor, metricNamesOf,
} from './cohort.mjs';

export const MODE = Object.freeze({ MATRIX: 'MATRIX', EXPLICIT: 'EXPLICIT' });

const pick = (scenarios, endpointId) => (scenarios && scenarios[endpointId]) || 'default';

function snapshot(view, f) {
  return Object.freeze({
    view,
    // 'fixture' means generated contract placeholders, not results. A screen
    // shows that, always - `13` TC-REP-003 is about not passing one off as
    // the other.
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
  let current = snapshot(loading(), { source: client.transportKind });
  let lastOpen = null;
  let fetched = null; // the core states behind the cells, so selectMetric never re-fetches

  const set = (view, patch = {}) => { current = snapshot(view, { ...current, ...patch }); return current; };

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
    lastOpen = { experimentIds, metricName, scenarios };
    // Forget the previous fetch first: selectMetric after a failed re-open
    // must not rebuild cells from the run before it.
    fetched = null;
    const mode = Array.isArray(experimentIds) ? MODE.EXPLICIT : MODE.MATRIX;
    current = snapshot(loading(), { mode, metricName, source: client.transportKind });

    const listView = await client.call('experiment_list', {}, { scenario: pick(scenarios, 'experiment_list') });
    // Without the list, MATRIX mode has nothing to show; EXPLICIT mode still
    // has its ids, and only loses the evaluation population the list carries.
    if (mode === MODE.MATRIX && listView.state !== STATE.SUCCESS) {
      return set(listView, { mode, cells: MATRIX.map((e) => notListedCell(e, CELL_STATUS.NOT_REQUESTED)) });
    }

    const rows = listView.state === STATE.SUCCESS ? readIdRows(listView.data, 'experiment_id') : null;
    const listed = new Set(rows ? rows.ids : []);
    const list = Object.freeze({
      view: listView,
      listedIds: rows ? rows.ids : Object.freeze([]),
      totalRows: rows ? rows.total : 0,
      unreadableRows: rows ? rows.unreadable : 0,
      population: listView.state === STATE.SUCCESS ? readPopulation(listView.data.evaluation_population) : null,
      variant: listView.state === STATE.SUCCESS ? readVariant(listView.data.prediction_variant) : null,
    });

    const wanted = mode === MODE.EXPLICIT ? experimentIds : rows.ids;
    const requestedIds = wanted.filter((id) => matrixEntry(id) !== null);
    // Listed (or asked for) but outside `08` section 2: shown by id, never dropped.
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
    fetched = { mode, requestedIds, listed, list, raw };

    const present = new Set(requestedIds);
    const comparisons = await requestComparisons(client, present, { scenarios });

    const { cells, metricNames } = assemble(metricName);
    return set(success(Object.freeze({ mode, requested: requestedIds })), {
      mode, list, outsideMatrix, requested: requestedIds, cells, comparisons, metricName, metricNames, aggregation,
    });
  }

  return Object.freeze({
    get current() { return current; },
    open,

    /* Re-runs the last open() - the RETRY / REFRESH action of a failed state. */
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
