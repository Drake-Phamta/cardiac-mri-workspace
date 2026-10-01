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
| `react-test-renderer` *(devDependency)* | `19.2.3` (exact) | MIT | the render-smoke harness only — deprecated upstream, test-only, not in CI, never bundled |
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
# mobile/.env.local  - not committed
EXPO_PUBLIC_API_BASE_URL=http://<mac-mini-overlay-ip>:8000
CMW_STUDY_ID=STUDY_LA_001        # the backend's study id (its CARDIAC_STUDY_ID); fixture mode uses STUDY_DEMO
```

```powershell
node scripts/prepare.mjs --mode live                                   # URL from the env var or .env.local
node scripts/prepare.mjs --mode live --api-base-url http://<host>:8000 --study-id STUDY_DEMO
```

Precedence: `--api-base-url`, then `EXPO_PUBLIC_API_BASE_URL` in the environment, then `mobile/.env.local`. Other
variables: `CMW_MODE`, `CMW_STUDY_ID`, `PYTHON`. The URL is `scheme://host:port` only; contract paths already start
with `/api/v1`, so a base URL ending in `/api/v1` is refused, and so is the README placeholder left unedited.

**Redaction rule:** no backend address in anything committed — the app shows and logs it as `http://<configured>`,
the `.build.txt` sidecar records only `sha256:` of the URL, fixture builds carry no address at all, and evidence
copied from the server (logs, screenshots) is redacted to `<configured>` before it is committed.

A live build **without** a URL does not guess one: `prepare.mjs` warns, and the app opens on a
**CONFIGURATION ERROR** screen that says what to set (`CONFIG_LIVE_URL_MISSING`) and requests nothing.
`build-release.ps1` refuses to build a live APK without a URL at all. Fixture mode needs nothing configured.

There is **no fallback** from live to fixture: an unreachable backend is `RECOVERABLE_ERROR` with Retry; the panel
says `backend http://<configured>` (the address is never shown or logged). Release builds allow cleartext HTTP (`plugins/withCleartextLocalDemo.js`) because the overlay is the
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

**Shared machine rule (Day 22 onward, while a GPU job runs here):** one Gradle build at a time on the PC, no
emulator. `build-release.ps1` stops the Gradle daemon after every build (`gradlew --stop`, pass or fail) and takes
`-MaxWorkers` (default 4) — lower it if memory is tight; "Gradle build daemon disappeared unexpectedly" is a daemon
the OS killed. Node tests and `expo export` are fine at any time.

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

### Shared pieces a vertical can use (owned by the shell / V1 — import, do not edit)

| Module | What |
|---|---|
| `runtime.content` (`src/runtime/content.mjs`) | **the app's one binary path**: `content.uri(content_url)` → absolute URL for an `<Image>` (null in fixture mode); `content.bytes(content_url, {checksum, signal, kind})` → an app/core state: SUCCESS `{bytes, size, checksum, verified}`, or `EMPTY_UNAVAILABLE` (`FIXTURE_NO_BYTES`, `NO_CONTENT_URL`, `REQUEST_ABORTED`), `TRANSPORT_UNREACHABLE` (network, timeout, 5xx), `CONTRACT_DRIFT` (not an artifact path of this backend, bytes that do not hash to `checksum`, an ETag that disagrees). Every response is counted in the gesture log. **No vertical fetches bytes any other way.** |
| `useCall` (`src/runtime/useCall.js`) | `const { view, refetch } = useCall(runtime.client, endpointId, params)` — latest wins, LOADING on every refetch, the previous request aborted (its `signal` reaches the transport), aborted on unmount |
| `nav.setLeaveGuard(fn)` | a screen with unsaved work registers `fn({type, screenId, params}) → true / false / Promise`; Back, the Android back button, tabs, push, replace and reset all ask it first. **Only the top screen is mounted**: a covered screen unmounts and must re-read what it needs |
| `src/imaging/maskPng.js` | **the app's one mask PNG decoder** (fast-png): `decodeMaskPng(bytes, {width, height})` → `{width, height, data: Uint8Array of 0/1}`. Strict: 8-bit single-channel, values exactly 0/255, the expected slice size — anything else throws `MaskPngError` with code `CONTRACT_DRIFT` |
| `src/imaging/maskPaths.mjs` | a decoded mask → row runs → one SVG path in source-pixel units; `disagreementRuns(gt, pred)` → TP / FP / FN |
| `src/imaging/maskStore.mjs` | fetch → decode → path, cached per content-addressed URL (`runtime.maskStore` in live mode) |
| `src/runtime/sliceCache.mjs` | per-slice response cache (`runtime.sliceClient` in live mode; the plain client in fixture mode). Keeps SUCCESS; keeps `EMPTY_UNAVAILABLE` only for `ARTIFACT_NOT_FOUND` / `GROUND_TRUTH_UNAVAILABLE`, 5 min; never errors. `clearNegative()` (SCR-03 calls it on open and on Retry) and `clearWhere(fn)` (one slice's keys, for **Refresh this slice**) — never a clear-all mid-session, so a Retry cannot turn cached revisits into traffic |
| `src/verticals/v1/SliceViewport.js` | the slice viewport: image + overlays + pinch/pan (provenance: Spike A S4 gestures) |

## V1 screens (SCR-02, SCR-03)

- **SCR-02 Case List** — `case_list` for the configured study; de-identified ids; the mode badge (*Evaluation* /
  *Inference & review*) is the same component and derivation SCR-03 uses (TC-CASE-002); search by id and mode
  filter; a typed id that is not on the page can be opened directly (the case screen checks it with the server).
- **SCR-03 Case Explorer** — built on the V1 model (`app/verticals/v1_case_explorer`). Asks for the prediction
  variant on first use (no default), then keeps it on screen; opens on the middle slice; slider + step buttons;
  pinch-zoom and pan; prediction (orange) and ground-truth (cyan) overlays with an opacity control, each toggle
  labelled in words; the per-slice Dice exactly as the server sent it; a run line with run, model family,
  experiment and precomputed flag; entries to SCR-04 / SCR-05 / SCR-06, each disabled with its reason. While the
  viewer shows a state instead of a slice, the metric and provenance read "-" and the entries are disabled ("this
  slice did not load") — nothing of the previously displayed slice stays on screen. **Refresh this slice** re-asks
  the server for the current slice only.
- **Network evidence (L4, NFR-PERF-001 limb 2)** — the MRI bytes are fetched in JS and shown as a data URI (the
  path Spike A measured), so every byte is counted: each slice switch writes one
  `CMW_GESTURE {"seq","kind","case","from","to","requests":[{"endpoint","bytes","ms","status"}],"cache_hit","bytes_total",…}`
  line when the slice is on screen. No URL, host or payload is logged. Judge a capture on the laptop with
  `node mobile/scripts/l4-report.mjs <logcat.txt>` (rules R1–R8, `PASS` / `FAIL` / `CANNOT_JUDGE`; bytes per
  switch as n / p50 / p95 / max); the step-by-step session, with the rule table at the top, is
  **`mobile/S1_L4_SCRIPT.md`**.
  Before the session, `node mobile/scripts/preflight-live.mjs --case CASE_0061` checks the live backend from the
  laptop with the app's own code: same `contract_version` as this checkout, the case, checksum-verified bytes,
  masks through `maskPng.js`, and a one-slice rehearsal of the L4 rules. The address is never printed.
- **Timing evidence (TC-PERF-001)** — every slice switch also logs
  `CMW_SLICE {"slice","ms_to_data","ms_to_image","ms_to_frame","meta_cached","image_seen_before","how","pass","dev","mode"}`.
  **Long-press the slice label** for the scripted runs: **L4 15 + 15** (15 new slices, then the same 15 revisited)
  and **A9 30-step** (Spike A's TC-PERF-001 sequence, a warm pass then a measured pass). The phone computes
  nothing: `node mobile/scripts/slice-timing-report.mjs <logcat.txt>` prints n / p50 / p95 per pass
  (nearest-rank, Spike A's definition), and keeps DEV-build samples apart.

## Render-smoke harness (test-only)

```powershell
cd mobile
npm ci
npm run test:render        # node --import ./test/render/hooks.mjs test/render/smoke.mjs
```

Renders the real shell and V1 screens in Node with **`react-test-renderer` 19.2.3** (exact-pinned
**devDependency**, MIT, **deprecated upstream**) and host-string stand-ins for React Native, react-native-svg and
safe-area-context (`test/render/mocks/`); screens get a real app/core runtime — the generated fixture bundle, or a
fake live backend whose PNGs are encoded with `node:zlib`. It checks navigation, the state panels, the variant rule,
the slice cache, the overlay paths and the `CMW_GESTURE` byte counts.

- **Not in CI** — CI runs without `node_modules`; run it locally before pushing screen changes. V2/V3/V4 may use it
  for their own screens (add checks next to the V1 ones).
- **Evidence of logic only, never device evidence.** No frame, gesture, decode time or network on a phone is
  measured by it; that evidence is logcat from the A17.

## Layout

```text
mobile/
  App.js  index.js  app.json  metro.config.js  package.json  package-lock.json
  plugins/withCleartextLocalDemo.js    release cleartext for LOCAL_DEMO (overlay HTTP)
  scripts/prepare.mjs                  generated inputs: fixture bundle + build config
  scripts/build-release.ps1            release APK + timestamp file
  scripts/l4-report.mjs                laptop-side L4 verdict from a logcat capture (CMW_GESTURE)
  scripts/slice-timing-report.mjs      laptop-side TC-PERF-001 percentiles from a logcat capture (CMW_SLICE)
  scripts/preflight-live.mjs           laptop-side check of the live backend before a phone session (P1-P6)
  S1_L4_SCRIPT.md                      the S-1 phone session for L4, step by step
  src/config.mjs                       mode / base URL / study id  (pure, tested)
  src/runtime/                         createRuntime.mjs + httpTransport.mjs (pure, tested), loadRuntime.js, RuntimeContext.js
  src/nav/                             screens.mjs + navigator.mjs (pure, tested), NavigatorView.js
  src/registry.js                      SCR-01..SCR-08 -> component
  src/ui/                              StateView.js + stateCopy.mjs (7 states), NotBuiltYet.js, FixtureScenarioPanel.js, theme.js
  src/verticals/v1 v2 v3 v4/           the screens
  test/*.test.mjs                      node --test (CI)
  test/render/                         render-smoke harness (local only, devDependency)
```

Rules carried over from `app/README.md`: product code never imports `spikes/**` (copy with a provenance header —
`test/registry.test.mjs` G3 checks it), never imports `app/core/node/` (Metro blocks it; G4 checks it), and never
invents a contract value — if the contract does not say it, the screen says it is unavailable.
