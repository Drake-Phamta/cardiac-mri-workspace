// Metro bundles mobile/ and ../contracts: src/api/loadRuntime.js requires contracts/api/contract.json from there,
// so the APK carries exactly the contract that is in git. The logic files are .mjs, so .mjs is a source extension.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '..', 'contracts')];
if (!config.resolver.sourceExts.includes('mjs')) config.resolver.sourceExts.push('mjs');

module.exports = config;
