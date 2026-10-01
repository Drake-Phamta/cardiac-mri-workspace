/*
 * V3 - Study Overview (SCR-01) and Experiment Comparison (SCR-07).
 *
 * The surface a screen imports. Framework-neutral like app/core: plain .mjs,
 * relative imports only, no node: builtin outside the test. GATE-MOB-01 picks
 * the renderer; this decides nothing a renderer should.
 *
 *   createStudyOverview(client)        SCR-01 state model
 *   createExperimentComparison(client) SCR-07 state model
 *   stripLayout / pointAt              distribution geometry and tap -> case
 *   readers                            pure, for anything else a screen needs
 */

export { createStudyOverview } from './studyOverview.mjs';
export { createExperimentComparison, MODE } from './experimentCompare.mjs';
export {
  CELL_STATUS, CELL_UNAVAILABLE, buildCell, notListedCell, metricContext, labelsForCell,
  deltaFor, buildTrend, metricNamesOf, aggregationFor,
} from './cohort.mjs';
export { stripLayout, pointAt } from './strip.mjs';
export {
  PROPOSED_SHAPES, FAMILY, LANE, MATRIX, MATRIX_IDS, COMPARISONS, OUTLIER_RULE, ROW_STATUS, UNAVAILABLE,
  matrixEntry, readCount, readNumber, readCohortN, readVariant, readFamily, readFraction, readPopulation,
  readExperimentIdentity, readMetricSummary, summaryStat, caseIntent, readCaseRows, readOutlierSelection,
  readDataset, readCaseCounts, readCapabilities, readIdRows,
} from './readers.mjs';
