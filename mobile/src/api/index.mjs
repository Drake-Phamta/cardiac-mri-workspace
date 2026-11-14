/*
 * The surface the four verticals import. Everything a screen needs is here,
 * and nothing here knows what framework is rendering it.
 *
 * `app/core/node/loadFromDisk.mjs` is deliberately NOT re-exported: it is the
 * one module that touches the filesystem, and importing this barrel must stay
 * safe inside a bundle that has no `node:fs`.
 */

export { EXPECTED, CoreError, createContract, getEndpoint, listEndpoints } from './contract.mjs';
export { parseEndpointPath, tokensOf, resolveEndpoint, assertWritePreconditions } from './endpoints.mjs';
export { STATE, RECOVERY, CLIENT_CODES, classifyError, parseErrorEnvelope, errorDefinition } from './errors.mjs';
export {
  ALL_STATES, loading, processing, success, emptyUnavailable,
  recoverableError, fatalInvalid, staleMismatch, stateForError, isTerminal, canRetry,
} from './states.mjs';
export { BUNDLE_PATH, createBundle, getScenario, listScenarios } from './fixtures.mjs';
export { validateResponse, createFixtureTransport, createClient, classify } from './client.mjs';
export { screenToSource, fitTransform, clampZoom, zoomAbout, panBy } from '../lib/viewMath.mjs';
export { sliceCacheKey, cacheKeyFromResponse } from '../screens/v1-cases/cacheKey.mjs';
export {
  RULE_ID as SELECTION_RULE_ID, RULE_TEXT as SELECTION_RULE_TEXT,
  UNAVAILABLE_REASON as SELECTION_UNAVAILABLE_REASON, readSelection, worstSlice,
} from '../screens/v1-cases/selection.mjs';
export { VERDICT, readComparability, presentation } from '../screens/v3-study/comparability.mjs';
