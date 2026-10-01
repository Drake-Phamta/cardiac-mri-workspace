/*
 * Metro config for mobile/.
 *
 * The product screens import the framework-neutral layer and the API
 * contract DIRECTLY from where they live - ../app/core/*.mjs and
 * ../contracts/api/contract.json - instead of copying them in. A copy would
 * drift; this way the APK carries exactly the app/core and the contract that
 * are in git (and that CI tests).
 *
 * Metro only watches the project root by default, so the two folders are
 * added explicitly, and `.mjs` is made a source extension because every
 * app/core module is `.mjs`. spikes/** is deliberately NOT watched: product
 * code never imports a spike (copy with a provenance header instead).
 */

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.join(repoRoot, 'app'),
  path.join(repoRoot, 'contracts'),
];

// app/ and contracts/ have no node_modules of their own (app/ may not even
// have a package.json while it stays framework-neutral), so every bare
// import resolves from mobile/node_modules.
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];

if (!config.resolver.sourceExts.includes('mjs')) {
  config.resolver.sourceExts.push('mjs');
}

// app/core/node/ is the one place app/core touches node:fs - for tests and CI
// only. Blocking it here turns an accidental import into a bundle error
// instead of a crash on the phone.
const escape = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nodeOnly = new RegExp(`^${escape(path.join(repoRoot, 'app', 'core', 'node'))}[\\\\/].*`);
const blockList = config.resolver.blockList;
config.resolver.blockList = blockList
  ? [].concat(blockList, nodeOnly)
  : nodeOnly;

module.exports = config;
