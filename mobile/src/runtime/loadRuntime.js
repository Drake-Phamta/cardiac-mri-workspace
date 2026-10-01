/*
 * Device-side loading: the contract and the generated inputs are bundled
 * `require`s here, which is the one thing that differs from `node --test`
 * (where a test reads the same JSON from disk). Everything else is
 * createRuntime.mjs.
 *
 * src/generated/ is written by scripts/prepare.mjs and is gitignored. If it
 * is missing, Metro fails the bundle with "Unable to resolve
 * ./generated/buildConfig.json" - run `npm run prepare-app` in mobile/.
 */

import { resolveConfig, MODE } from '../config.mjs';
import { createRuntime } from './createRuntime.mjs';

const contractJson = require('../../../contracts/api/contract.json');
const buildConfigJson = require('../generated/buildConfig.json');
const bundleJson = require('../generated/api_bundle.json');

/*
 * Returns { runtime } or { error } - never throws, so App.js can render a
 * build that carries a drifted contract as a blocking screen instead of a
 * white crash.
 */
export function loadRuntime() {
  try {
    const config = resolveConfig(buildConfigJson);
    const runtime = createRuntime({
      config,
      contractJson,
      bundleJson: config.mode === MODE.FIXTURE ? bundleJson : null,
      fetchImpl: global.fetch,
      // Live HTTP timings go to logcat under a fixed tag, without payload
      // bytes (TC-SEC-003), so device evidence can be extracted later.
      onTiming: (t) => console.log(`CMW_HTTP ${JSON.stringify({ ...t, ms: Math.round(t.ms) })}`),
    });
    return { runtime, error: null };
  } catch (err) {
    return {
      runtime: null,
      error: {
        name: err && err.name,
        code: err && err.code,
        message: (err && err.message) || String(err),
        problems: err && err.detail && Array.isArray(err.detail.problems) ? err.detail.problems : [],
      },
    };
  }
}
