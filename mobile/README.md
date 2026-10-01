# `mobile/` — the Cardiac MRI Workspace app

React Native / Expo SDK 57 (`expo ~57.0.21`, `react 19.2.3`, `react-native 0.86.3` — the versions Spike A measured
on the Galaxy A17 5G), `react-native-webview 13.16.1` for the 3D module, `react-native-svg` for overlays, and
`react-native-safe-area-context` because Android 16 draws edge-to-edge. The stack is `TECH_STACK_ADR`'s
(GATE-MOB-01); this directory is where the product screens live.

The app does not re-implement anything `app/core` already owns. Every screen calls
`runtime.client.call(endpointId, params)` — app/core resolves the URL from `contracts/api/contract.json`,
validates the response against it, and returns one of the seven screen states. Metro bundles `../app/core/*.mjs`
and `../contracts/api/contract.json` **directly** (see `metro.config.js`), so the APK carries exactly what is in
git and what CI tests.

## Dependencies

Runtime dependencies are exactly these; anything else is a request to the shell owner, not an edit.

| Package | Version | License | Why |
|---|---|---|---|
| `expo` | `~57.0.21` | MIT | SDK 57, the stack TECH_STACK_ADR records (Spike A measured it on the A17) |
| `react` / `react-native` | `19.2.3` / `0.86.3` | MIT | same versions as `spikes/spike_a_2d/app` |
| `react-native-webview` | `13.16.1` | MIT | the 3D module (WebGL2 inside a WebView, measured on the A17) — V2 |
| `react-native-svg` | `15.15.4` | MIT | vector mask overlays in source-pixel coordinates |
| `react-native-safe-area-context` | `~5.7.0` | MIT | Android 16 draws edge-to-edge; header and tab bar need the insets |
| `fast-png` | `8.0.0` (exact) | MIT | decodes the contract's 8-bit mask PNGs (`content_url`) to pixels — **V4 SCR-06 owns the adapter in `src/verticals/v4/`**. Pulls in `fflate` 0.8.3 (MIT) and `iobuffer` 6.0.1 (MIT). Checked: `npm view fast-png version license dependencies` → 8.0.0, MIT, `{fflate ^0.8.2, iobuffer ^6.0.1}`; `test/deps.test.mjs` decodes a 2×2 grey PNG; Metro bundled it to Hermes bytecode (`expo export:embed --bytecode`, 17 modules) |

## Run it

```powershell
cd mobile
npm ci                       # once
npm start                    # fixture mode, Metro dev server; open in a dev build
npm test                     # 60+ logic tests, no device, no emulator
```

`npm start`, `npm run android` and `npm run export:android` all run `scripts/prepare.mjs` first. It writes two
**generated, gitignored** files into `src/generated/`:

| File | What | From |
|---|---|---|
| `api_bundle.json` | the fixture bundle | `contracts/api/generate_fixture.py`, checked by app/core `createBundle` (FORMAT.md rules 1–6) |
| `buildConfig.json` | mode, backend URL, study id, git sha, build time, contract version | the flags below |

Nothing in `src/generated/` is ever hand-written or committed (`fixture_rules.handwritten_fixtures_allowed = false`).

### Fixture mode (default)

```powershell
node scripts/prepare.mjs                      # = --mode fixture
```

Every call is answered from the generated bundle. The header shows an amber **FIXTURE** badge and a banner saying
the data is generated contract fixtures, not patient data and not a backend. **Tap FIXTURE** to choose, per
endpoint, which generated scenario answers (`default`, `ground_truth_unavailable`, `run_running`,
`stale_revision`, …) — that is how every `10` §8 state is shown on a phone without editing code. Before the
generator emits scenarios, every call is `EMPTY_UNAVAILABLE / FIXTURE_SCENARIO_MISSING`, which is a working screen.

### Live mode

**The backend address is never committed** — the repository is public. Put it in the untracked file
`mobile/.env.local` (gitignored by `.env*.local`), or in the environment variable of the same name:

```powershell
# mobile/.env.local  - one line, not committed
EXPO_PUBLIC_API_BASE_URL=http://<mac-mini-overlay-ip>:8000
```

```powershell
node scripts/prepare.mjs --mode live                                   # URL from the env var or .env.local
node scripts/prepare.mjs --mode live --api-base-url http://<host>:8000 --study-id STUDY_DEMO
```

Precedence: `--api-base-url`, then `EXPO_PUBLIC_API_BASE_URL` in the environment, then `mobile/.env.local`. Other
variables: `CMW_MODE`, `CMW_STUDY_ID`, `PYTHON`. The URL is `scheme://host:port` only; contract paths already start
with `/api/v1`, so a base URL ending in `/api/v1` is refused, and so is the README placeholder left unedited.

A live build **without** a URL does not guess one: `prepare.mjs` warns, and the app opens on a
**CONFIGURATION ERROR** screen that says what to set (`CONFIG_LIVE_URL_MISSING`) and requests nothing.
`build-release.ps1` refuses to build a live APK without a URL at all. Fixture mode needs nothing configured.

There is **no fallback** from live to fixture: an unreachable backend is `RECOVERABLE_ERROR` with Retry and the URL
it tried. Release builds allow cleartext HTTP (`plugins/withCleartextLocalDemo.js`) because the overlay is the
encrypted transport in the `09` §10 `LOCAL_DEMO` profile; a `REMOTE_DEMO` deployment removes the plugin and serves
HTTPS. Live HTTP timings go to logcat as `CMW_HTTP {"endpointId", "status", "ms"}` — never a payload (TC-SEC-003).

## Build a release APK

```powershell
powershell -ExecutionPolicy Bypass -File mobile\scripts\build-release.ps1 -Mode fixture
powershell -ExecutionPolicy Bypass -File mobile\scripts\build-release.ps1 -Mode live      # URL from .env.local
```

It sets `JAVA_HOME` (JDK 17 — the default `java` on this machine is 1.8) and `ANDROID_HOME`, then builds a
**staging copy of the committed HEAD** at `<drive>:\cmw-build` (`-StagingDir` to change): `git archive` of `mobile/`,
`app/`, `contracts/`, then `npm install`, `prepare.mjs --strict`, `expo prebuild` and `gradlew assembleRelease` for
`arm64-v8a` (the A17; `-Abis` to change). Why staging: React Native's C++ build (CMake + ninja) fails on Windows past
~250-character paths, which a deep checkout or agent worktree reaches; and the APK is then exactly a commit —
**commit before you build**, uncommitted edits are not in it (the script warns). Everything the build writes, prunes
or regenerates (`-Clean`) stays inside the staging directory; the script never deletes anything outside it. The
APK is copied to `mobile/release/cardiac-mri-workspace-<mode>-<yyyyMMdd-HHmmss>.apk` with `<apk>.build.txt` next to
it: build time, mode, backend URL, git sha, APK sha256 and the `adb install -r` line. `release/`, `android/` and every
`*.apk` are gitignored. The APK is signed with the template debug keystore — installable for device tests,
not a store build.

To check the JS bundle only (no Gradle): `npm run export:android`.

## Where each vertical's files go

| | Owner | Screens | Folder | Replace |
|---|---|---|---|---|
| **V1** | Phạm Tuấn Anh | SCR-02 Case List · SCR-03 Case Explorer · SCR-04 Error Inspector | `src/verticals/v1/` | `CaseListScreen.js` · `CaseExplorerScreen.js` · `ErrorInspectorScreen.js` |
| **V2** | Vũ Hùng Anh | SCR-05 3D Inspector | `src/verticals/v2/` | `Inspector3DScreen.js` |
| **V3** | Bế Quốc Khánh | SCR-01 Study Overview · SCR-07 Experiment Comparison | `src/verticals/v3/` | `StudyOverviewScreen.js` · `ExperimentComparisonScreen.js` |
| **V4** | Nguyễn Gia Đức Trung | SCR-06 Review / Correction · SCR-08 Findings | `src/verticals/v4/` | `ReviewCorrectionScreen.js` · `FindingsScreen.js` |

**A vertical edits only its own folder.** Replace the placeholder file (same name, default export) and add whatever
else it needs next to it. The shell files — `package.json`, the lockfile, `app.json`, `metro.config.js`,
`src/registry.js`, `src/nav/**` — belong to the shell owner; a new dependency or a new screen id is a request to
them, not an edit. `test/registry.test.mjs` fails if a registered file goes missing.

The screen contract the navigator relies on:

```js
export default function CaseExplorerScreen({ runtime, nav, params }) { ... }
//   runtime.client.call(endpointId, params, options)  -> an app/core screen state
//   runtime.contract / runtime.config / runtime.mode   ('fixture' | 'live')
//   nav.push('SCR-04', { caseId, runId, variant }) · nav.pop() · nav.replace(...) · nav.reset(...)
//   params  the route params; src/nav/screens.mjs lists what each screen REQUIRES
```

Render every non-success state with `src/ui/StateView.js` (`<StateView view={view} onAction={...}>{(data) => …}</StateView>`)
so the `10` §8 state model looks and behaves the same in V1–V4. Put pure logic in `.mjs` next to the screen and test
it with `node --test`; keep React Native imports in `.js` files.

## Layout

```text
mobile/
  App.js  index.js  app.json  metro.config.js  package.json  package-lock.json
  plugins/withCleartextLocalDemo.js    release cleartext for LOCAL_DEMO (overlay HTTP)
  scripts/prepare.mjs                  generated inputs: fixture bundle + build config
  scripts/build-release.ps1            release APK + timestamp file
  src/config.mjs                       mode / base URL / study id  (pure, tested)
  src/runtime/                         createRuntime.mjs + httpTransport.mjs (pure, tested), loadRuntime.js, RuntimeContext.js
  src/nav/                             screens.mjs + navigator.mjs (pure, tested), NavigatorView.js
  src/registry.js                      SCR-01..SCR-08 -> component
  src/ui/                              StateView.js + stateCopy.mjs (7 states), NotBuiltYet.js, FixtureScenarioPanel.js, theme.js
  src/verticals/v1 v2 v3 v4/           the screens
  test/*.test.mjs                      node --test
```

Rules carried over from `app/README.md`: product code never imports `spikes/**` (copy with a provenance header —
`test/registry.test.mjs` G3 checks it), never imports `app/core/node/` (Metro blocks it; G4 checks it), and never
invents a contract value — if the contract does not say it, the screen says it is unavailable.
