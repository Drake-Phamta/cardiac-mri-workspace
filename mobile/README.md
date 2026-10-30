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

Runtime dependencies are exactly these; anything else is a request to the shell owner — Phạm Tuấn Anh (built by
agent A2 under the Day 22 override) — not an edit.

| Package | Version | License | Why |
|---|---|---|---|
| `expo` | `~57.0.21` | MIT | SDK 57, the stack TECH_STACK_ADR records (Spike A measured it on the A17) |
| `react` / `react-native` | `19.2.3` / `0.86.3` | MIT | same versions as `spikes/spike_a_2d/app` |
| `react-native-webview` | `13.16.1` | MIT | the 3D module (WebGL2 inside a WebView, measured on the A17) — V2 |
| `react-native-svg` | `15.15.4` | MIT | vector mask overlays in source-pixel coordinates |
| `react-native-safe-area-context` | `~5.7.0` | MIT | Android 16 draws edge-to-edge; header and tab bar need the insets |
| `react-test-renderer` *(devDependency)* | `19.2.3` (exact) | MIT | the render-smoke harness only — deprecated upstream, test-only, run in CI only by the `mobile-render-bundle` job, never bundled. Pulls in a **nested `react-is` 19.3.0** (MIT; its own caret range `^19.2.3`, locked at `node_modules/react-test-renderer/node_modules/react-is`) next to React 19.2.3 — harmless for a test-only renderer (#77 QA N-12); the top-level `react-is` 18.3.1 belongs to other packages |
| `fast-png` | `8.0.0` (exact) | MIT | decodes the contract's 8-bit mask PNGs (`content_url`) to pixels — **the shell / V1 owns the adapter, `src/imaging/maskPng.js`**, shared by V1 (SCR-03, SCR-04) and V4 (SCR-06). Pulls in `fflate` 0.8.3 (MIT) and `iobuffer` 6.0.1 (MIT). Checked: `npm view fast-png version license dependencies` → 8.0.0, MIT, `{fflate ^0.8.2, iobuffer ^6.0.1}`; `test/deps.test.mjs` decodes a 2×2 grey PNG; Metro bundled it to Hermes bytecode (`expo export:embed --bytecode`, 17 modules) |

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
the `.build.txt` sidecar records only that one was set (`api_base_url     configured (not recorded)`) — never the
URL and no hash of it (DR-021 rule 3: an unsalted SHA-256 of an overlay address can be reversed by hashing every
candidate address, #77 QA N-6) — fixture builds carry no address at all, and evidence copied from the server (logs,
screenshots) is redacted to `<configured>` before it is committed. Sidecars written before this rule (the L4 build
`ffbf763` among them) still carry a `sha256:` value: never publish it — replace it with `<redacted>` before
committing such a sidecar, as the L4 evidence did. Committed files name overlay addresses only by a placeholder such
as `<overlay-ip>`; CI fails a change that adds a private IPv4 literal (DR-019 rule 2).

A live build **without** a URL does not guess one: `prepare.mjs` warns, and the app opens on a
**CONFIGURATION ERROR** screen that says what to set (`CONFIG_LIVE_URL_MISSING`) and requests nothing.
`build-release.ps1` refuses to build a live APK without a URL at all. Fixture mode needs nothing configured.

There is **no fallback** from live to fixture: an unreachable backend is `RECOVERABLE_ERROR` with Retry; the panel
says `backend http://<configured>` (the address is never shown or logged). **Live** release builds allow cleartext
HTTP (`plugins/withCleartextLocalDemo.js`) because the overlay is the encrypted transport in the `09` §10
`LOCAL_DEMO` profile; fixture builds do not (DR-021 rule 5) — the plugin reads the mode `prepare.mjs` wrote to
`src/generated/buildConfig.json`, so run `prepare.mjs` before `expo prebuild` (every build script does). A
`REMOTE_DEMO` deployment removes the plugin and serves HTTPS. Live HTTP timings go to logcat as
`CMW_HTTP {"endpointId", "status", "ms"}` — never a payload (TC-SEC-003).

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
it: build time, mode, contract version, whether a backend URL was configured (never the URL or a hash of it), git
sha, APK sha256 and the `adb install -r` line. `release/`, `android/` and every
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
`src/registry.js`, `src/nav/**` — belong to the shell owner, **Phạm Tuấn Anh** (the shell was built by agent A2
under the Day 22 override); a new dependency or a new screen id is a request to them, not an edit. Each vertical
owns `mobile/src/verticals/v<N>/` and its tests `mobile/test/v<N>_*.test.mjs` (DR-021 rule 6; CI runs every
`mobile/test/*.test.mjs`). `test/registry.test.mjs` fails if a registered file goes missing or has no default export.

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
| `runtime.content` (`src/runtime/content.mjs`) | **the app's one binary path**: `content.uri(content_url)` → absolute URL for an `<Image>` (null in fixture mode); `content.bytes(content_url, {checksum, signal, kind})` → an app/core state: SUCCESS `{bytes, size, checksum, verified}`, or `EMPTY_UNAVAILABLE` (`FIXTURE_NO_BYTES`, `NO_CONTENT_URL`, `REQUEST_ABORTED`), `TRANSPORT_UNREACHABLE` (network, timeout, 5xx), `CONTRACT_DRIFT` (not an artifact path of this backend, no `checksum` stated — nothing is fetched then, DR-021 rule 1 — bytes that do not hash to `checksum`, an ETag that disagrees). Every response is counted in the gesture log, under the gesture open when it was sent. **No vertical fetches bytes any other way.** |
| `useCall` (`src/runtime/useCall.js`) | `const { view, refetch } = useCall(runtime.client, endpointId, params)` — latest wins, LOADING on every refetch, the previous request aborted (its `signal` reaches the transport), aborted on unmount and when `enabled` turns false (DR-021 rule 2) |
| `nav.setLeaveGuard(fn)` | a screen with unsaved work registers `fn({type, screenId, params}) → true / false / Promise`; Back, the Android back button, tabs, push, replace and reset all ask it first, one prompt at a time (an action while a prompt is open is refused). **Only the top screen is mounted**: a covered screen unmounts, its guard is dropped, and it must re-read what it needs — `nav.push(id, params, returnParams)` merges `returnParams` into the covered entry so Back reopens what was on screen (#77 QA N-7, #78 QA N-8) |
| `src/imaging/maskPng.js` | **the app's one mask PNG decoder** (fast-png): `decodeMaskPng(bytes, {width, height})` → `{width, height, data: Uint8Array of 0/1}`. Strict: 8-bit single-channel, values exactly 0/255, the expected slice size — anything else throws `MaskPngError` with code `CONTRACT_DRIFT` |
| `src/imaging/maskPaths.mjs` | a decoded mask → row runs → one SVG path in source-pixel units; `disagreementRuns(gt, pred)` → TP / FP / FN |
| `src/imaging/maskStore.mjs` | fetch → decode → path, cached per content-addressed URL (`runtime.maskStore` in live mode) |
| `src/runtime/sliceCache.mjs` | per-slice response cache (`runtime.sliceClient` in live mode; the plain client in fixture mode). Keeps SUCCESS; keeps `EMPTY_UNAVAILABLE` only for `ARTIFACT_NOT_FOUND` / `GROUND_TRUTH_UNAVAILABLE`, 5 min; never errors. `clearNegative()` (SCR-03 and SCR-04 call it on open only) and `clearWhere(fn)` (one slice's keys, its cached "unavailable" answers included). **Retry forgets only the slice it retries**, in SCR-03 and SCR-04 alike: Retry and **Refresh this slice** call `clearWhere` for that slice and nothing else — never a clear-all mid-session, so a Retry cannot turn cached revisits into traffic |
| `src/verticals/v1/SliceViewport.js` | the slice viewport: image + overlays + pinch/pan (provenance: Spike A S4 gestures) |

## V1 screens (SCR-02, SCR-03, SCR-04)

- **SCR-02 Case List** — `case_list` for the configured study; de-identified ids; the mode badge (*Evaluation* /
  *Inference & review*) is the same component and derivation SCR-03 uses (TC-CASE-002); search by id and mode
  filter; a typed id that is not on the page can be opened directly (the case screen checks it with the server).
- **SCR-03 Case Explorer** — built on the V1 model (`app/verticals/v1_case_explorer`). Asks for the prediction
  variant on first use (no default), then keeps it on screen; opens on the middle slice; slider + step buttons;
  pinch-zoom and pan; prediction (orange) and ground-truth (cyan) overlays with an opacity control, each toggle
  labelled in words; the per-slice Dice exactly as the server sent it; a run line with run, model family,
  experiment and precomputed flag ("loading run details…" until the run answers, "run details unavailable (reason)"
  if it fails); entries to SCR-04 / SCR-05 / SCR-06, each disabled with its reason. Back from any of them reopens
  the run, variant and slice that were on screen (#78 QA N-8). While the viewer shows a state instead of a slice,
  the metric and provenance read "-" and the entries are disabled ("this slice did not load") — nothing of the
  previously displayed slice stays on screen. **Refresh this slice** re-asks the server for the current slice
  only. A case with **no analysis run yet** (`available_run_ids` empty) opens straight into the viewer with MRI +
  ground truth only: the run line says so, no run / prediction / metric / error request is made, and SCR-04/05/06
  are disabled with "needs an analysis run" (V1 model #80, `NO_ANALYSIS_RUN`).
  A run handed in by another screen that such a case does not list gets the same view, and every reason names it
  ("requested run … is not listed for this case"); it is never asked for (#80 QA N3).
- **SCR-04 Error Inspector** — only with ground truth: an *Inference & review* case gets a clear unavailable state,
  never an empty chart. TP / FP / FN are drawn from the two masks the server served for the slice, each class with
  a colour **and** a name, a pixel count and a show/hide switch; the counts are compared with the server's FP / FN
  for that slice — only when the masks drawn are the ones the run metrics name (`reference_mask_id`,
  `prediction_mask_id`); otherwise the screen says they differ and compares nothing (DR-013a addendum, #78 QA
  N-6). The worst slice is the **server's** `worst_slice_selection` (DR-010a option b), first entry first
  — nothing is ranked on the phone (test V4x); an entry outside the volume is listed as such and never opened
  (no clamping, #78 QA N-7). The per-slice profile places the server's entries by slice index; slices the server
  did not list are absent, not 0. Case metrics (Dice, IoU, FP, FN, RVE) exactly as the server sent them; entry to
  the 3D error view (SCR-05).
  Two gates come first (#78 QA B-2, B-3). A block is listed only under the `rule_id` and `selection_version` the
  loaded contract pins; otherwise `SELECTION_RULE_UNSUPPORTED` / `SELECTION_VERSION_UNSUPPORTED` names the served
  value, with nothing listed, jumpable or profiled. A pinned block whose `slices` is not a list is
  `SELECTION_MALFORMED` (app/core `readSelection`, #78 QA N-10), not "no eligible slice". Run metrics for another
  `prediction_variant` than the one asked for get the V1 model's variant-mismatch state, with no case metric, worst
  slice, profile or server comparison.
- **Network evidence (L4, NFR-PERF-001 limb 2)** — the MRI bytes are fetched in JS and shown as a data URI (the
  path Spike A measured), so every byte is counted: each slice switch writes one
  `CMW_GESTURE {"seq","kind","case","from","to","requests":[{"endpoint","bytes","ms","status"}],"cache_hit","bytes_total",…}`
  line when the slice is on screen; a request is listed under the gesture open when it was sent, never under a
  later one (#77 QA N-3). After each scripted pass,
  `CMW_NET_TOTALS {"run","pass","gestures","requests","bytes","unattributed","late"}` records the requests no
  gesture line lists. No URL, host or payload is logged. Judge a capture on the laptop with
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

## V2 screen (SCR-05) - the 3D error map

SCR-05 3D Inspector (`src/verticals/v2/`) was built as a **skeleton** under the Day 39 recovery override so that hero
steps H6 (open the 3D reconstruction, rotate / zoom / pan) and H7 (tap a region, jump to the contributing slice in
SCR-03) run end to end on real data, and extended on 2026-10-30 with the **3D error map** (DR-005, decided by the
leader): the model's false-positive and false-negative regions as surfaces of their own, a tap on one lands on its slice,
and the plane follows the 2D slice. Vũ Hùng Anh completes, measures and defends it (TC-3D-001..005, TC-PERF-002).

- **Data.** `case_get`, `analysis_run_get`, `reconstruction_get` (the path token is `mask_id`; its value is the run's RAW
  or PROCESSED prediction mask id, or the ground-truth id from `ground_truth_slice_get`) and `error_reconstruction_get`
  (the path token is `variant`) through `useCall`; the mesh bytes through `runtime.content`
  (`/api/v1/artifacts/<sha256>.cmesh`, verified against the sha256 inside `mesh_artifact_id = MESH_<sha256>` or
  `error_mesh_artifact_id = ERRMESH_<sha256>`, DR-021 rule 1). The surfaces are the undecimated L0 meshes (DR-008c) in the
  voxel-index frame, format `cardiac-mesh/1` (`backend/mesh/artifact.py`); the error mesh is one `cardiac-errormesh/1`
  artifact (`backend/mesh/error_artifact.py`) that the viewer splits into the FP and FN layers; see
  `contracts/api/README.md`, "3-D mesh content" and "3-D error mesh". The error mesh is drawn only if it names the masks the
  screen shows (`reference_mask_id`, `prediction_mask_id`, variant): otherwise the FP and FN layers read
  `error (MASK_MISMATCH)` and its bytes are not fetched. Fixture mode has no bytes, so it shows the honest unavailable state.
- **Four layers, none by colour alone.** Prediction, ground truth, false positive (FP) and false negative (FN), each with
  its own state (loading / unavailable with the API's reason / error with its code / ready with its counts), its own switch
  and a legend row that prints its name, its meaning and a glyph (FP and FN use SCR-04's words and colours). In the scene FN
  is hatched. The prediction decides the screen; every other layer reads its own state, so a missing error mesh never takes
  the surfaces down (the ground truth is then switched on by default, so the disagreement still shows as two surfaces). A
  class with no voxel is READY with "none: no false-positive voxels" - zero error is a fact, not a missing layer. An
  INFERENCE_REVIEW case (INT-12) is asked for neither ground truth nor error mesh: those layers say
  `unavailable (GROUND_TRUTH_UNAVAILABLE)` and the screen says that is not zero error.
- **State.** One reducer (`inspectorReducer` in `inspector3d.mjs`): the switches, the plane, the selection and the camera.
  What a layer *is* is derived from the calls, never stored.
- **Slice plane.** A translucent plane at the middle of the slice with an outline, a band on the surfaces, a printed
  "slice n / total" and a slider. It starts at the 2D slice SCR-03 / SCR-04 hand in, follows the slider and a pick, and on
  Back it follows the slice the 2D screen ended on (QA #98 N-6: the screen that is left provides it through
  `nav.setReturnParams`).
- **Viewer.** `viewerSource.mjs` is one self-contained WebGL2 page for `react-native-webview` (adapted from Spike B,
  provenance in its header): orbit, pinch zoom, two-finger pan, the four layers, the slice plane. It loads each mesh once
  however often it is delivered (QA #98 N-5), reports the camera when a gesture ends so that Back can restore it, and
  contains nothing that could touch the network (test V2L15, QA #98 N-4). The screen hands it only verified artifacts that
  fit the case's grid.
- **H7.** A tap resolves to `face_source_slice[t]` and the class `face_class[t]` of the first triangle hit (not the floor
  of the hit point); the screen shows "slice n / total" and what was hit; **Open in 2D** pushes SCR-03 at that slice, and
  for an FP / FN face **Open errors** pushes SCR-04 at it, both for the same run and variant with `returnParams`, so Back
  reopens SCR-05 on the same layers, camera and slice. A background tap clears the selection - nothing navigates by
  accident. SCR-03's 3D entry passes the variant it shows.
- **Not done (owner):** on-device FPS / stall / picking measurements with four layers (TC-PERF-002; the error meshes
  are heavier than the surfaces), label toggles beyond the four layers, smoothing, landscape, tapping a face that is hidden
  behind another one (the viewer picks the nearest visible face; hide a layer to reach the one behind).
- **Tests.** `test/v2_inspector3d.test.mjs` (logic: references, both headers against the Python goldens, messages, the
  reducer, pick -> slice and class, the pushes and Back, layer states, the legend), `test/v2_viewer.test.mjs` (the viewer
  script in node against a stubbed canvas: decode, refusal of damaged files, the Python golden pick cases for slice and
  class, tap -> slice, background tap, four layers, idempotent loading, camera, what a frame draws, gestures),
  `test/navigator.test.mjs` N16-N20 (the pop side of `returnParams`) and section 11 of the render smoke (the screen with the
  WebView mocked: references, verified bytes, handshake, H6 / H7, every layer's four states, INT-12, Back through the real
  navigator).

## Render-smoke harness (test-only)

```powershell
cd mobile
npm ci
npm run test:render        # node --import ./test/render/hooks.mjs test/render/smoke.mjs
```

Renders the real shell, V1 and V2 screens in Node with **`react-test-renderer` 19.2.3** (exact-pinned
**devDependency**, MIT, **deprecated upstream**) and host-string stand-ins for React Native, react-native-svg,
safe-area-context and react-native-webview (`test/render/mocks/`; the WebView mock records the messages the screen sends); screens get a real app/core runtime — the generated fixture bundle, or a
fake live backend whose PNGs are encoded with `node:zlib`. It checks navigation, the state panels, the variant rule,
the slice cache, the overlay paths and the `CMW_GESTURE` byte counts.

- **In CI in one job only** — `mobile-render-bundle` runs `npm ci --ignore-scripts` from the lockfile, then
  `npm run test:render`, then a fixture-mode `expo export` (DR-021 rule 4); every other CI job runs without
  `node_modules`. Still run it locally before pushing screen changes. V2/V3/V4 may use it for their own screens (add
  checks next to the V1 ones).
- **Evidence of logic only, never device evidence.** No frame, gesture, decode time or network on a phone is
  measured by it; that evidence is logcat from the A17.

## Layout

```text
mobile/
  App.js  index.js  app.json  metro.config.js  package.json  package-lock.json
  plugins/withCleartextLocalDemo.js    release cleartext for LOCAL_DEMO (overlay HTTP), live builds only
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
  test/render/                         render-smoke harness (devDependency; CI job mobile-render-bundle)
```

Rules carried over from `app/README.md`: product code never imports `spikes/**` (copy with a provenance header —
`test/registry.test.mjs` G3 checks it), never imports `app/core/node/` (Metro blocks it; G4 checks it), and never
invents a contract value — if the contract does not say it, the screen says it is unavailable.
