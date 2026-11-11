/*
 * Allow plain-HTTP requests in a LIVE release build, for the LOCAL_DEMO
 * profile - and in no other build (DR-021 rule 5, QA #65 N-12b).
 *
 * Why: live mode talks to the FastAPI backend over the private overlay
 * network of DR-003 / DR-003a (the URL is set at build time, never in git).
 * The overlay is the encrypted, private transport; the HTTP inside it has no
 * TLS certificate. Android 9+ refuses cleartext by default, and Expo's
 * template only re-enables it for DEBUG builds - so without this a release
 * APK in live mode fails every request as TRANSPORT_UNREACHABLE. A fixture
 * build makes no network request at all, so it gets no cleartext.
 *
 * How the mode is known: every build runs scripts/prepare.mjs BEFORE the
 * native project is generated (`npm run android`; build-release.ps1 step 3,
 * then `expo prebuild` in step 4), and prepare.mjs writes the mode into
 * src/generated/buildConfig.json - the same file the JS bundle carries, so
 * the manifest and the app cannot disagree. When the manifest is generated:
 *   - mode "live"       -> android:usesCleartextTraffic="true";
 *   - any other mode    -> the attribute is REMOVED, i.e. Android's default
 *     (no cleartext). Removed, not just left out: build-release.ps1 reuses
 *     the staging android/ between builds, so a fixture build after a live
 *     one must take it out again. The debug manifests of Expo's template set
 *     their own value with tools:replace (Metro dev server) and are untouched;
 *   - no buildConfig.json -> treated as not live, with a warning (fails closed).
 *
 * Scope: `09` §10 LOCAL_DEMO - "no public internet exposure", private trusted
 * network. A REMOTE_DEMO deployment must remove this plugin and serve HTTPS.
 *
 * Uses expo/config-plugins (shipped inside `expo`), so it adds no dependency.
 * It is required lazily, so test/cleartextPlugin.test.mjs can load the pure
 * helpers below without node_modules (the mobile-shell CI job has none).
 */

const fs = require('fs');
const path = require('path');

const ATTR = 'android:usesCleartextTraffic';
const BUILD_CONFIG_PATH = path.join(__dirname, '..', 'src', 'generated', 'buildConfig.json');

// The mode prepare.mjs recorded, or null when there is no buildConfig.json.
function readBuildMode(file = BUILD_CONFIG_PATH) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
  let mode;
  try {
    mode = JSON.parse(text).mode;
  } catch (err) {
    throw new Error(`withCleartextLocalDemo: ${file} is not valid JSON - rerun scripts/prepare.mjs (${err.message})`);
  }
  return typeof mode === 'string' ? mode : null;
}

// Mutates and returns the parsed AndroidManifest (cfg.modResults).
function applyCleartextPolicy(androidManifest, mode) {
  const manifest = androidManifest && androidManifest.manifest;
  const app = manifest && manifest.application && manifest.application[0];
  if (!app) return androidManifest;
  app.$ = app.$ || {};
  if (mode === 'live') app.$[ATTR] = 'true';
  else delete app.$[ATTR];
  return androidManifest;
}

function withCleartextLocalDemo(config) {
  const { withAndroidManifest } = require('expo/config-plugins');
  return withAndroidManifest(config, (cfg) => {
    const mode = readBuildMode();
    if (mode === null) {
      console.warn('withCleartextLocalDemo: no src/generated/buildConfig.json - run scripts/prepare.mjs first. '
        + 'Cleartext HTTP stays OFF.');
    }
    applyCleartextPolicy(cfg.modResults, mode);
    return cfg;
  });
}

module.exports = withCleartextLocalDemo;
module.exports.applyCleartextPolicy = applyCleartextPolicy;
module.exports.readBuildMode = readBuildMode;
module.exports.BUILD_CONFIG_PATH = BUILD_CONFIG_PATH;
module.exports.ATTR = ATTR;
