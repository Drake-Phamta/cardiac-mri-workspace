/*
 * Allow plain-HTTP requests in a RELEASE build, for the LOCAL_DEMO profile.
 *
 * Why: live mode talks to the FastAPI backend over the private overlay
 * network of DR-003 / DR-003a (the URL is set at build time, never in git).
 * The overlay is the encrypted, private transport; the HTTP inside it has no
 * TLS certificate. Android 9+ refuses cleartext by default, and Expo's
 * template only re-enables it for DEBUG builds - so without this a release
 * APK in live mode fails every request as TRANSPORT_UNREACHABLE.
 *
 * Scope: `09` §10 LOCAL_DEMO - "no public internet exposure", private trusted
 * network. A REMOTE_DEMO deployment must remove this plugin and serve HTTPS.
 *
 * Uses expo/config-plugins (shipped inside `expo`), so it adds no dependency.
 */

const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartextLocalDemo(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application && cfg.modResults.manifest.application[0];
    if (app) {
      app.$ = app.$ || {};
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
};
