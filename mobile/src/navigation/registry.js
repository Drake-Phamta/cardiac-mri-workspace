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

import StudyOverviewScreen from '../screens/v3-study/StudyOverviewScreen';
import CaseListScreen from '../screens/v1-cases/CaseListScreen';
import CaseExplorerScreen from '../screens/v1-cases/CaseExplorerScreen';
import ErrorInspectorScreen from '../screens/v1-cases/ErrorInspectorScreen';
import Inspector3DScreen from '../screens/v2-3d/Inspector3DScreen';
import ReviewCorrectionScreen from '../screens/v4-review/ReviewCorrectionScreen';
import ExperimentComparisonScreen from '../screens/v3-study/ExperimentComparisonScreen';
import FindingsScreen from '../screens/v4-review/FindingsScreen';

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
