// SPIKE_A harness — Metro config.
// The fixtures live one level up in spikes/spike_a_2d/fixtures/ so that the
// harness scripts and the app read the SAME files and cannot drift apart.
// Metro only watches the project root by default, so the parent is added
// explicitly rather than duplicating the fixtures into the app.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const spikeRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [spikeRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
