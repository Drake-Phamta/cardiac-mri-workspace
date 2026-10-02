/*
 * Render-smoke harness, part 1: Node module hooks (node --import).
 *
 * TEST-ONLY. Runs the real screens in Node under react-test-renderer
 * (devDependency, deprecated upstream; in CI only in the mobile-render-bundle
 * job, which runs `npm ci --ignore-scripts` first - DR-021 rule 4).
 * Its output is evidence that the screen LOGIC renders and reacts - never
 * device evidence: nothing here measures a frame, a gesture or a network.
 *
 *   - react-native, react-native-svg and react-native-safe-area-context are
 *     mapped to host-string stand-ins in ./mocks (enough to render a tree and
 *     press a button, not a behavioural emulation);
 *   - every `react` import resolves to mobile/node_modules/react, so the
 *     renderer and the screens share ONE React;
 *   - mobile/*.js files are compiled with the @babel/core and
 *     @babel/plugin-transform-react-jsx that Expo already installs.
 */

import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MOBILE = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '');
const mreq = createRequire(`${MOBILE}/package.json`);
const babel = mreq('@babel/core');
const jsxPlugin = mreq.resolve('@babel/plugin-transform-react-jsx');
const MOCKS = new URL('./mocks/', import.meta.url);
const SRC_PREFIX = pathToFileURL(MOBILE).href.toLowerCase();
// `react` is resolved by the default resolver (`next`) as if imported from
// mobile/package.json. Calling require.resolve inside the hook instead
// re-enters these hooks on newer Node 24 releases (24.21: unbounded recursion).
const MOBILE_PARENT = pathToFileURL(`${MOBILE}/package.json`).href;

const isMobileSource = (url) => typeof url === 'string' && url.toLowerCase().startsWith(SRC_PREFIX)
  && !url.includes('/node_modules/');

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react-native') return { url: new URL('react-native.mjs', MOCKS).href, shortCircuit: true };
    if (specifier === 'react-native-svg') return { url: new URL('svg.mjs', MOCKS).href, shortCircuit: true };
    if (specifier === 'react-native-safe-area-context') return { url: new URL('safe-area.mjs', MOCKS).href, shortCircuit: true };
    if (specifier === 'react' || specifier.startsWith('react/')) {
      const r = next(specifier, { ...context, parentURL: MOBILE_PARENT });
      return { ...r, shortCircuit: true, format: 'commonjs' };
    }
    // Metro resolves extensionless relative imports; Node does not.
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.(c|m)?js$|\.json$/.test(specifier)
      && isMobileSource(context.parentURL)) {
      for (const ext of ['.js', '.mjs']) {
        const u = new URL(specifier + ext, context.parentURL);
        if (existsSync(fileURLToPath(u))) return { url: u.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (isMobileSource(url) && url.endsWith('.js')) {
      const filename = fileURLToPath(url);
      const out = babel.transformSync(readFileSync(filename, 'utf8'), {
        filename, babelrc: false, configFile: false, sourceType: 'module',
        plugins: [[jsxPlugin, { runtime: 'automatic' }]],
      });
      return { format: 'module', source: out.code, shortCircuit: true };
    }
    return next(url, context);
  },
});
