/*
 * SCR-01..SCR-08 -> the component that renders it.
 *
 * Owned by the shell (V1 / Integration). A vertical does NOT edit this file:
 * it replaces the screen file this table already points at, inside its own
 * folder. The ids, titles, owners and paths are in src/nav/screens.mjs, and
 * mobile/test/registry.test.mjs checks that every entry below matches that
 * table and that every file exists - so a renamed screen fails a test, not a
 * phone.
 *
 * Static `import`s on purpose: Metro bundles what it can see, and a computed
 * require would be a screen that exists in git but not in the APK.
 */

import StudyOverviewScreen from './verticals/v3/StudyOverviewScreen';
import CaseListScreen from './verticals/v1/CaseListScreen';
import CaseExplorerScreen from './verticals/v1/CaseExplorerScreen';
import ErrorInspectorScreen from './verticals/v1/ErrorInspectorScreen';
import Inspector3DScreen from './verticals/v2/Inspector3DScreen';
import ReviewCorrectionScreen from './verticals/v4/ReviewCorrectionScreen';
import ExperimentComparisonScreen from './verticals/v3/ExperimentComparisonScreen';
import FindingsScreen from './verticals/v4/FindingsScreen';

export const REGISTRY = Object.freeze({
  'SCR-01': StudyOverviewScreen,
  'SCR-02': CaseListScreen,
  'SCR-03': CaseExplorerScreen,
  'SCR-04': ErrorInspectorScreen,
  'SCR-05': Inspector3DScreen,
  'SCR-06': ReviewCorrectionScreen,
  'SCR-07': ExperimentComparisonScreen,
  'SCR-08': FindingsScreen,
});

export function componentFor(screenId) {
  return REGISTRY[screenId] || null;
}
