# QA review: PR #65, mobile app shell. Verdict: **MERGE AFTER FIXES**. 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E, an LLM red-team session (Claude Code, Claude Opus 5.5) running under the leader's account. **Not a second human and not an independent human reviewer.** This is the independent QA pass of `RECOVERY_OVERRIDE_DAY22.md` §2 item 2. |
| **Target** | PR #65, `feat/day22-mobile-shell`, head `81701839c13bbc38e0c0c2a43e0f17ff9dfa5754`. It is a single commit on `origin/main` `44350d4`, which had not moved by the end of the run. 43 files, +9,295 / −0: 42 new files under `mobile/`, plus `.github/workflows/guardrails.yml` (new `mobile-shell` job and one comment). |
| **Stack reference** | `TECH_STACK_ADR.md` at `origin/docs/tech-stack-adr` `205401e` |
| **Run** | 11:41–12:06 (+07), inside the 45-minute timebox |
| **Environment** | Windows 11, PowerShell 5.1.26100, Node v24.14.0, npm 11.9.0, Python 3.12.6. CI ran on ubuntu-latest with Node v22.23.3. |
| **Method** | Own worktree, detached at the head (`git fetch origin; git checkout --detach 8170183`). All npm and Expo work ran in `<qa-scratch>`, on a `git archive` copy of the head's `mobile/`, `app/` and `contracts/`. That is the same thing `build-release.ps1` stages. **No Gradle build and no device.** Nothing was committed, pushed, merged, approved or posted. Only read-only `gh` calls were used. |

> **VERDICT: MERGE AFTER FIXES.** There is one blocking item, **B-1**: GATE-MOB-01 is still OPEN on `main`, and the PR's own banner says not to merge before it closes. No code change is required before the merge; the code at this head passed every check that could be run here. There are 12 non-blocking findings. Two of them have deadlines today:
> - **N-1** (binary delivery): before the 17:30 release build.
> - **N-2** (leave guard): before V4's SCR-06 merges.

---

## 1 · Commands run

| # | Command | Purpose |
|---|---|---|
| R1 | `git fetch origin` · `git checkout --detach 8170183` · `git diff --stat/--name-status 44350d4 8170183` · `git diff --name-only 44350d4 8170183 -- app contracts` | Establish the scope of the change |
| R2 | `node --test "mobile/test/*.test.mjs"`, run in the worktree (no `node_modules`) and again in `<qa-scratch>` after `npm ci` | Shell tests |
| R3 | `node app/core/tests/run_all.mjs` | app/core suite |
| R4 | `gh pr view 65` · `gh pr checks 65` · `gh run view 36816103432` · `gh run view --job 110221382087 --log` · fetch `refs/pull/65/merge` and compare trees | CI status and what CI actually ran |
| R5 | Lockfile scan (Node, read-only), compared with Spike A's lock · `npm ci --ignore-scripts` · `npm audit --omit=dev [--json]` · scan of `node_modules` for lifecycle scripts and native modules · `expo/bundledNativeModules.json` | Stack and supply chain |
| R6 | `node scripts/prepare.mjs --mode fixture --strict` · `npx expo export --platform android --output-dir dist` · a second export with `--source-maps --no-bytecode --no-minify` to list the bundled modules | JS bundle |
| R7 | `git grep` on the head for IPv4, `.local`, `ssh`, URLs, absolute paths and usernames · the PR body · the PR timeline · `gh api …/commits/<sha>` (every address redacted in the output) | Publication hygiene |
| R8 | `build-release.ps1 -Mode live` with no URL configured (child PowerShell, variable removed, dummy `-JavaHome`) · guard lines 136–146 evaluated **verbatim** in a harness with no side effects, on 15 inputs · PS 5.1 parser | Release-script safety |
| R9 | The head's `mobile/` laid over the `app/` and `contracts/` of #62 (`a1b0b40`, contract 1.0.0) and of `origin/feat/day22-contract-v1.1` (`f540f8b`), then the shell tests · a probe calling `mri_slice_get` and `prediction_slice_get` under 1.0.0 | Forward compatibility |
| R10 | #69 (`fb52c10`) diffed against the head · `origin/feat/day22-v4-screens` and A2's local V1 WIP branch read with `git grep` · RN `BackHandler.android.js` | How the verticals will consume the shell |

## 2 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | `node --test "mobile/test/*.test.mjs"` | **PASS** | Without `node_modules`: 65 tests, 64 pass, 1 skipped (D2, which decodes a PNG with fast-png), 0 fail. After `npm ci`: **65/65 pass**. |
| 1b | `node app/core/tests/run_all.mjs` | **PASS** | ALL PASS, 10/10 scripts, 140 checks |
| 1c | `gh pr checks 65` | **PASS** | 9/9 green in run `36816103432`; its `headSha` is `81701839` |
| 1d | The `mobile-shell` job really runs the tests | **PASS** | The job log shows `# tests 65 · # pass 64 · # skipped 1 · # fail 0` on Node v22.23.3. The merge ref `67737b45` has the same tree as the head (`dfe4d7ce`). `prepare.mjs` was exercised in four modes: fixture strict, live with URL, live without URL (warns), and live strict without URL (refused as expected). The boundary greps passed. **Caveat:** CI never parses or bundles the `.js`/JSX files (N-5). |
| 1e | Forward compatibility (extra check) | **PASS** | The shell tests pass unchanged (64 + 1 skipped) against contract 1.0.0 (#62) and against contract 1.1.0 |
| 2a | `package.json` and the lockfile match the ADR versions | **PASS** | The lockfile resolves expo **57.0.26** (SDK 57, inside `~57.0.21`), react 19.2.3, react-native 0.86.3 and react-native-webview 13.16.1, one copy each. webview, svg 15.15.4 and safe-area-context 5.7.0 are exactly Expo 57's `bundledNativeModules.json` versions. Spike A, however, locked expo **57.0.21** (N-9). |
| 2b | Every dependency is pinned, with its licence in the README | **PASS, with a note** | All 7 direct dependencies appear in the README with version, licence and reason. `package.json` still uses two `~` ranges; the lockfile pins exact versions (N-9). |
| 2c | No unjustified dependency; no native module beyond the declared ones | **PASS, with a note** | Every dependency is justified. Beyond the 3 declared native libraries, `expo` brings 9 Android Expo SDK modules implicitly (including `@expo/dom-webview`, a second WebView). Spike A shipped the same set, at older patch levels. None of this is in the README (N-9). |
| 2d | No install or postinstall scripts in the dependency tree | **PASS** | 0 `hasInstallScript` among the 492 lock entries. 0 lifecycle scripts or `binding.gyp` among the 482 installed packages. |
| 2e | `npm ci --ignore-scripts` | **PASS** | 482 packages in 24 s. All 492 lock entries come from registry.npmjs.org with an integrity hash. No devDependencies. |
| 2f | `npm audit --omit=dev` | **PASS** | **0 critical, 0 high.** 10 moderate, all from one advisory, GHSA-w5hq-g745-h8pq (`uuid <11.1.1`). It reaches the tree through `xcode` and then Expo's config, prebuild and CLI tooling, which is build-time only and absent from the bundle. The only "fix" npm offers is a semver-major downgrade to expo 46, so accept it. |
| 3a | `app/core` is unchanged | **PASS** | `git diff 44350d4 8170183 -- app contracts` is empty |
| 3b | Metro reaches `../app` and `../contracts` without copying | **PASS** | The bundle's source map lists `/../app/core/*.mjs` (11 modules) and `/../contracts/api/contract.json`. It contains nothing from `app/core/node`, `app/core/tests`, `app/verticals`, `spikes`, `scripts` or `test`. |
| 3c | The shell imports app/core only through its public entry | **PASS** | Every import (6 product files, `prepare.mjs`, the tests) targets `app/core/index.mjs` |
| 4a | SCR-01..08 are registered | **PASS** | `screens.mjs` and `registry.js`; tests N1, G1, G2. SCR-09 is deliberately left out. |
| 4b | Each vertical has its own folder with placeholders | **PASS** | v1 ×3, v2 ×1, v3 ×2, v4 ×2. Each placeholder renders EMPTY_UNAVAILABLE `SCREEN_NOT_BUILT` and names the owner and the file to replace. |
| 4c | The screen contract is documented | **PASS** | README "The screen contract the navigator relies on", and the header of every placeholder |
| 4d | Navigation does not hard-code vertical internals | **PASS** | The shell holds only ids, titles, file names and *required* params; extra params pass through. #69 (V3) needed **no** shell-file change. V4's WIP branch needs only `runId` plus optional params. |
| 4e | The ownership boundaries are written down | **PASS, with a note** | README: the shell files are `package.json`, the lockfile, `app.json`, `metro.config.js`, `src/registry.js` and `src/nav/**`, and "a vertical edits only its own folder". Gaps in N-11. |
| 5a | `StateView` renders all 7 app/core states | **PASS (logic) / NOT MEASURED (device)** | `describeState` covers all 7 `STATE` values and maps an unknown state to FATAL_INVALID. All 5 `RECOVERY` actions have labels. Tests S1–S10. No device was attached. |
| 5b | No stale data under an error or loading state (shell side) | **PASS** | Children render only in SUCCESS. app/core `make()` sets `data: null` in every other state, and `success()` refuses null. Screens remount on navigation and on a fixture-scenario change. Request ordering is left to each vertical (N-6). |
| 6a | Timeouts | **PASS** | One AbortController per request, 15 s default (1–120 s allowed); test T5. On RN the timeout also covers the body, because whatwg-fetch resolves only after the load. |
| 6b | Abort | **PARTIAL** | Only the internal timeout aborts. A caller's `options.signal` is ignored (N-6). |
| 6c | Network and HTTP errors map onto app/core states | **PASS** | Network error, timeout or 5xx without a code becomes TRANSPORT_UNREACHABLE with RETRY. 4xx without a code becomes CONTRACT_DRIFT (FATAL). A contract envelope becomes its app/core state. A non-JSON 200 becomes CONTRACT_DRIFT. Tests T3–T9 and T11. |
| 6d | Binary delivery (`content_url`) | **FAIL (not implemented)** | The R9 probe under 1.0.0: `mri_slice_get` returns SUCCESS with `content_url` `/api/v1/artifacts/<sha>.png`, but the runtime exposes no byte path. `/api/v1/artifacts/` is not a contract endpoint, so `client.call` cannot reach it, and fixture mode has no bytes at all. See N-1. |
| 6e | No retry storms | **PASS** | `createClient` makes one transport call per `call()`. The shell never retries automatically; RETRY happens only on a tap. |
| 6f | Fixture vs live mode | **PASS** | Tests C1–C11 and R1–R9. There is no fallback from live to fixture. |
| 6g | The live URL comes only from the env var or an untracked `.env.local` | **PASS** | The app reads the URL only from `buildConfig.json`. `prepare.mjs` writes it from `--api-base-url`, `EXPO_PUBLIC_API_BASE_URL` or the untracked `.env.local` (`.env*.local` is gitignored). Product code never reads `process.env`, so Expo's `.env` inlining cannot apply. One leak path remains in fixture mode (N-4). |
| 6h | A missing URL gives a CONFIGURATION ERROR screen, and the build refuses | **PASS** | `App.js` shows "CONFIGURATION ERROR" for `CONFIG_*` codes (test R9). `prepare --strict` refuses, per the CI log. **QA ran `build-release.ps1 -Mode live` with no URL:** it threw at step 0 with "…Nothing was built.", created no directory, and the worktree stayed clean. |
| 6i | No IPs or hostnames in the committed tree | **PASS (head) / FAIL (PR history)** | In the head, the only IPv4-shaped string is the JDK version `17.0.16.8`. `.local` appears only as `.env.local`. There is no `ssh`. Every URL is a placeholder or an RFC 2606 `.invalid` host. The earlier pushed head is still public (N-3). |
| 7a | `build-release.ps1` writes and deletes only inside its staging dir | **PASS (static)** | 0 parse errors under PS 5.1. There is no `Remove-Item`/`rm`/`del`/`rd`. The only deletion is `expo prebuild --clean` of `<staging>\mobile\android`. Writes outside staging are the APK and sidecar in the gitignored `mobile/release/`, plus npm and Gradle caches. |
| 7b | The guards refuse a drive root and a staging dir inside or containing the repo | **PASS** for the three specified cases | Refused: `C:\`, `D:\`, the repo, a dir inside it, its parent, `D:\02_Research`, and a lower-case/forward-slash variant. Edge cases that are accepted are in N-8. |
| 7c | The APK name or sidecar records the commit and the build time | **PASS** | APK name `cardiac-mri-workspace-<mode>-<yyyyMMdd-HHmmss>.apk`. The sidecar has `built_at` with UTC offset, the full `git_sha` and `git_branch`. The bundle also carries `gitSha` and `generatedAt`. |
| 7d | No secrets | **PASS** | No credentials. The APK is signed with the template debug keystore, which is documented. Sidecar hygiene is in N-4. |
| 7e | `build-release.ps1` end to end at this head | **NOT RUN** | Gradle was excluded by the brief. The author's only successful build was at the unpushed `5c778d5` (N-7). |
| 8 | `npx expo export --platform android` | **PASS** | "Android Bundled 7910ms index.js (**623 modules**)", `index-35d5310a…c72a84.hbc` (1.6 MB). The only warning is the environment's NO_COLOR/FORCE_COLOR notice; **nothing about Node built-ins or `.mjs` resolution**. The source-map export lists 26 npm packages (25 MIT, 1 ISC). |
| 9 | Publication hygiene in committed files | **PASS, with notes** | No usernames, no user-profile paths, no IPs. Two machine-specific items remain (N-10). |

## 3 · Findings

### BLOCKING

**B-1 · Merge order: GATE-MOB-01 is OPEN on `main`.**
- **State on `main` at `44350d4`:**
  - `PROJECT_STATE.yaml` records `GATE-MOB-01: {status: OPEN}`.
  - `SPIKE_PHASE_STATE.yaml` shows both SPIKE_A and SPIKE_B as `ACTIVE`.
  - `TECH_STACK_ADR.md` exists only on `docs/tech-stack-adr` (`205401e`), with no PR opened.
- **Why this blocks:**
  - The PR's own banner reads "Do not merge before GATE-MOB-01 closes".
  - Under §4 of the override, the gate closes only once Spike A is ACCEPTED on a QA-004 PASS.
  - Until then, no production mobile module may be created under `mobile/`.
- **Fix:** close the gate on `main` first:
  1. Spike A reaches ACCEPTED (QA-004 PASS).
  2. The ADR is merged and the state is recorded.
  3. Then merge #65 at `8170183`, or at a rebased head whose `mobile/` tree is identical.
- **Owner:** Phạm Tuấn Anh.

### NON-BLOCKING

**N-1 · High; due before the 17:30 build. The shell has no binary delivery path, and the verticals are already building divergent ones.**
- **What the shell does today.** Under contract 1.0.0, the four slice endpoints answer JSON with `content_url`, and the shell passes that JSON through correctly (the R9 probe). The bytes are another matter:
  - The runtime has only `mode, config, contract, bundle, client, fixtureScenarios`; nothing fetches the bytes at `content_url`.
  - In fixture mode, `content_url` points at bytes that do not exist.
- **Divergence already under way:**
  - V4 (`origin/feat/day22-v4-screens`) builds `${runtime.config.apiBaseUrl}${d.content_url}` itself, in `reviewController.mjs:217`. Its `fetchBytes` in `ReviewCorrectionScreen.js` is a bare `fetch` with **no timeout and no abort**, so a stalled overlay connection leaves SCR-06 loading forever.
  - A2's local V1 WIP adds a separate `src/imaging/maskStore.mjs` (which does have a timeout) and `src/runtime/sliceCache.mjs`.
- **Fix:** put one shell-owned path in `src/runtime/` and expose it on `runtime`:
  - `content.uri(content_url)` for `<Image>`;
  - `content.bytes(content_url, { signal })`, with the transport's timeout and TRANSPORT_UNREACHABLE mapping, plus the checksum check of `binary_delivery.content_url_rule`;
  - in fixture mode, an explicit EMPTY_UNAVAILABLE reason.

  V4's controller already takes an injectable `fetchBytes`, so switching it is a one-line wiring change.
- **Owner:** A2; the V4 lane switches over.

**N-2 · High for V4 SCR-06. There is no leave guard, so unsaved brush edits are discarded silently.**
- **How the navigator behaves:**
  - It renders only the top screen. A covered screen unmounts and loses its state, and the README's screen contract does not say so.
  - A tab tap resets the whole stack.
  - The shell owns Android back.
- **Why a screen cannot protect itself.** In RN 0.86.3, `BackHandler.android.js` (line 30) calls listeners last-registered-first. `NavigatorView` re-registers its listener after every navigation, so it pre-empts any guard a screen registers when it mounts.
- **Impact on V4.** V4's SCR-06 holds edits it labels "UNSAVED edits", and it pushes SCR-08. Spec `10` §9 requires that "destructive actions require clear confirmation where data loss could occur", and §5 makes Cancel the way unsaved changes are discarded.
- **Fix:**
  - Add `nav.setLeaveGuard(fn)` (or a `useLeaveGuard` hook), honoured by back, tabs, push, replace and reset.
  - Document unmount-on-cover in the screen contract.
- **Owner:** A2.

**N-3 · Medium; leader decision. The first pushed head is still public and carries the overlay address.**
- **What QA found.** The earlier head `ca3447b` was pushed at 11:19 and force-pushed away at 11:39. GitHub still serves it, through the API and its `/commit/` URL. It contains a private RFC 1918 address in **9 files** (README, plugin, build script, `prepare.mjs`, `config.mjs` and 4 tests) and in the commit message. That is more than the PR body's "config.mjs and its commit message". The head itself is clean, and merging does not change the exposure.
- **Fix:**
  - Treat the address as disclosed: confirm that the ZeroTier network requires member authorisation, and/or re-address the host.
  - Optionally, ask GitHub Support to purge `ca3447b`.
  - Correct the PR body.
  - Add an IPv4/hostname scan to `no-forbidden-bytes`. Allow `.invalid`, the RFC 5737 documentation ranges and version strings.
- **Owner:** Phạm Tuấn Anh; A2 for the CI scan.

**N-4 · Medium. Tonight's evidence is the next leak vector.**
- **Where the URL and paths end up:**
  - The sidecar `<apk>.build.txt` records `api_base_url`, the absolute `built_in` path and an absolute `adb install` path.
  - The RECOVERABLE_ERROR panel prints `backend http://<host>:<port>`.
  - `resolveConfig` keeps a URL from the environment even in **fixture** mode, so fixture APKs can carry it too.
- **Why it matters tonight.** Device sidecars and screenshots will be committed to a public repository.
- **Fix:**
  - The sidecar records a hash of the URL (or the host redacted) and relative paths.
  - The panel masks the host.
  - Fixture mode drops `apiBaseUrl`.
  - Add a one-line redaction rule for evidence to the README.
- **Owner:** A2.

**N-5 · Medium; leader decision (PR body, "Decisions needed 3"). CI never parses or bundles the `.js` files.**
- **The risk.** A vertical PR with a JSX syntax error, a wrong import or a package that is not installed passes CI and fails only at the 17:30 build.
- **Cost of covering it.** `npm ci --ignore-scripts` took 24 s and `expo export` 45 s. The tree has 0 install scripts and every lock entry is integrity-pinned.
- **Fix:** either add a CI job that runs `npm ci --ignore-scripts` and then `npx expo export --platform android`, or require every vertical PR to quote its `npm run export:android` module-count line.
- **Owner:** Phạm Tuấn Anh decides; A2 builds the job.

**N-6 · Medium. There is no shared request hook and no caller abort.**
- `StateView` cannot draw stale data for the view it is given. But latest-wins ordering, unmount safety and LOADING-on-refetch are each vertical's job.
- V3 (#69) had to write its own `useSnapshot.js`.
- `httpTransport.send` ignores `options.signal`, so slice scrubbing (DR-015, per-slice requests) cannot cancel requests already in flight.
- **Fix:**
  - Add a shell `useEndpoint`/`useCall` hook: latest-wins, LOADING on refetch, abort on unmount or param change.
  - Link `options.signal` into the transport's AbortController.
- **Owner:** A2.

**N-7 · Medium/low. `build-release.ps1` has never run end to end at this head.**
- **The gap.** The only successful build was at `5c778d5`, which was never pushed. Since then 16 files have changed (+386 / −124):
  - 136 lines of `build-release.ps1`;
  - `App.js`, `config.mjs`, `createRuntime.mjs` and the cleartext plugin;
  - `fast-png` added to `package.json` and the lock.

  The PR body's "same shell code" therefore understates the delta.
- **What QA could cover.** QA verified only that the script parses, the step-0 refusal and the guard lines.
- **Fix:** run `-Mode fixture` on the merged `main` as soon as the GPU job allows, well before 17:30.
- **Owner:** A2.

**N-8 · Low. Staging-guard edge cases, and stale files in staging.**
- **Inputs the harness accepted:**
  - a directory inside the **main checkout** when the script runs from a worktree, because the guard only knows the worktree root;
  - an existing non-empty directory such as `%USERPROFILE%`. tar would overwrite `mobile\`, `app\` and `contracts\` there, and `-Clean` would delete `<dir>\mobile\android`;
  - the UNC root `\\localhost\D$`;
  - relative paths, which resolve against .NET's process cwd rather than `$PWD`.
- **Stale files.** tar never deletes, so files removed from git persist in staging. The PR body acknowledges this, yet the sidecar still says "staging copy of committed HEAD".
- **Fix:**
  - Accept only an empty directory or one carrying a script-created `.cmw-staging` marker.
  - Resolve paths with `GetUnresolvedProviderPathFromPSPath`.
  - Compare against `git rev-parse --show-toplevel` and the parent of `--git-common-dir`.
  - Refuse UNC roots.
  - Clear `mobile\src`, `app` and `contracts` *inside* staging before extracting.
  - Use `npm ci` instead of `npm install`.
- **Owner:** A2.

**N-9 · Low; leader confirms. Version pinning and documentation.**
- **Version drift from Spike A:**
  - `package.json` keeps `expo ~57.0.21` and `react-native-safe-area-context ~5.7.0` as ranges.
  - The lock resolves expo **57.0.26**, with expo-modules-core 57.0.20. Spike A measured **57.0.21** (57.0.17), so "the versions Spike A measured" holds for react, react-native, metro and hermes-compiler, but not for expo.
- **Documentation gaps:**
  - ADR §5 names only the WebView. svg, safe-area-context and fast-png are justified in the README but not in the ADR (PR body, "Decisions needed 1").
  - The 9 implicit Expo native modules are not listed.
- **Fix:**
  - Pin exact versions.
  - State 57.0.26 and the delta in the README.
  - Add a row for the implicit native modules.
  - The leader confirms the three additions.
- **Owner:** A2 / Phạm Tuấn Anh.

**N-10 · Low. Machine-specific text in committed files.**
- `build-release.ps1:70` defaults `-JavaHome` to `C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot`.
- README:93 says "the default `java` on this machine is 1.8".
- **Fix:** prefer `$env:JAVA_HOME` when it points to a JDK 17, otherwise glob `jdk-17*`; reword the README line.
- **Owner:** A2.

**N-11 · Low. Ownership and test placement.**
- **Gaps:**
  - The README says "the shell owner" without naming who.
  - `src/ui/**`, `src/runtime/**`, `App.js`, `plugins/` and `scripts/` are only implicitly shell-owned.
  - CI runs only `mobile/test/*.test.mjs`, so V3 had to place `v3_screens.test.mjs` outside its own folder.
  - G1 requires the literal text `export default function`.
  - There is no CODEOWNERS file.
- **Fix:**
  - Name the owner: A2 today, Phạm Tuấn Anh (V1 / Integration).
  - Declare `mobile/test/v<N>_*.test.mjs` as owned by that vertical, or widen the CI glob.
  - Relax G1 to "has a default export".
- **Owner:** A2.

**N-12 · Info.**
- **(a) Missing reference id.** app/core's `classifyError` drops the server `request_id`, so FATAL_INVALID cannot show the reference id that `10` §8 asks for, and the `requestId` line in `stateCopy` is dead code. The PR body already records this. Fix it in app/core after Day 22.
- **(b) Cleartext HTTP.** It is enabled for every build, fixture builds included (PR body, "Decisions needed 2"). `app.json` also locks portrait, whereas `10` §9.1 allows landscape for detailed inspection. Both are leader decisions.
- **(c) Concurrent activity.** The main checkout's branch changed during the review: the session snapshot showed `feat/day22-v3-screens`, and it now shows `main`. QA ran no checkout there.

## 4 · QA footprint (left in place; the user's global rule forbids deleting anything without explicit confirmation)

- **Git refs.** `refs/qa65/pr65-merge`, created in the shared repository by the merge-ref fetch. Remove it with `git update-ref -d refs/qa65/pr65-merge`. Remote-tracking refs were also updated by `git fetch origin`.
- **Worktree.** One ignored directory, `contracts/api/__pycache__/`, created when the generator was imported.
- **Scratch.** `<qa-scratch>/qa65` holds 271 MB: the archive copy with `node_modules`, the exported bundles, the CI log, the npm audit output and the probe and harness scripts. It is outside every repository; deleting it is the leader's call.

**VERDICT: MERGE AFTER FIXES**
- **Before merging:** B-1, i.e. GATE-MOB-01 CLOSED on `main`.
- **After merging, in a follow-up shell PR from A2:**
  - N-1 before the 17:30 build;
  - N-2 before V4's SCR-06 merges;
  - N-7, a dry `build-release.ps1` run on the merged `main`, early this afternoon.
- **Leader decision today:** N-3.
