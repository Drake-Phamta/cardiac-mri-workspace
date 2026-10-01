# QA review: PR #77, V1 SCR-02 / SCR-03 and L4 tooling · **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | **CHAT E. This is an LLM session (Claude) running under the team leader's account, not a second human reviewer.** This review is not a human approval. |
| PR | #77 "feat(v1): SCR-02 Case List and SCR-03 Case Explorer", branch `feat/day22-v1-case-explorer-screens` |
| Final head reviewed | **`36a8731`** on main **`440dab1`**. The PR was re-pushed during the review; the first pass was at `d553162` on `6b52628`. |
| Scope | `07405f4` (= `a4e5246`), `b25f25b` (= `d553162`) and `36a8731` (new). #65's commit `2ee67bd` (= `f42e9bd`) is out of scope. |
| Run at | 12:25–12:46 (+07) |
| Where | My own worktree, detached at `d553162`, plus `git archive` exports of both heads in session scratch. The main checkout was not touched: its HEAD reflog has no entry after 11:32. |
| Resources | Everything ran single-process. `node --test --test-concurrency=1`. `npm ci --ignore-scripts` ran **once** (484 packages, 38 s). `expo export --max-workers 1` ran **once**, with a 1.5 GB heap cap. No Gradle, emulator or device. |

## 1. The head is what was reviewed

| Check | Result |
|---|---|
| `git range-diff 6b52628..d553162 440dab1..36a8731` | `f42e9bd = 2ee67bd`, `a4e5246 = 07405f4`, `d553162 = b25f25b`: **identical patches**. Only `36a8731` is new. |
| What main `440dab1` changed | 8 files under `ml/` only |
| `mobile/package.json` and lock, `d553162` → `36a8731` | unchanged, so the `npm ci` tree was reused for the second run |

## 2. Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | `node --test mobile/test/*.test.mjs` | **PASS** | 130/130 at `d553162`, **132/132 at `36a8731`**, 0 skipped. node_modules was present, so the fast-png adapter checks ran too. |
| 1b | Render harness, no device | **PASS** | 34/34 at both heads. It proves logic only, not device behaviour. |
| 1c | `app/core/tests/run_all.mjs` | **PASS** | 10/10 at both heads |
| 1d | V1 model test | **PASS** | 73/73 at both heads. The fixture bundle was generated with `contracts/api/generate_fixture.py`, the same way CI does it. |
| 1e | `expo export --platform android` | **PASS** | 771 modules, one 2 MB `.hbc`, exit 0. Run once, at `d553162`. `36a8731` changes no imports and no package files, so the module graph is the same. |
| 1f | `gh pr checks 77` | **PASS** | 9/9 at `36a8731`; MERGEABLE / CLEAN. CI runs neither the render harness nor expo export. |
| 2a | Every non-SUCCESS state renders through StateView, with no stale image or mask | **PASS** for image and mask | `CaseExplorerScreen.js:409` (`blocking`) and `:590`: the StatePanel replaces the whole SliceViewport. The case level (`:88`) and SCR-02 also go through StateView. **But the metric and provenance cards still show the previous slice: see B-3.** |
| 2b | Run, model and variant line always visible | **PASS** | The header line (`runText`) and the variant chips sit outside the viewer box, in every state. Metrics carry the variant. Wording issue in N-9. |
| 2c | GT only when the case declares it; the inference-only case never shows GT | **PASS** (by code) | The GT toggle and the SCR-04 entry are gated on `groundTruthUsable` (`:635`, `:549`). The model sends no GT or metrics request when `ground_truth_available` is not true (`index.mjs:357-364, 388`). GT is off by default (`index.mjs:172`). No render test opens an inference-only case (N-11). |
| 2d | Overlays decoded only through `maskPng.js`, strictly | **PASS** | `fast-png` is imported only in `maskPng.js`. `loadRuntime.js` injects `decodeMaskPng`. Palette, depth ≠ 8, channels ≠ 1, wrong size, or any value other than 0/255 is rejected as CONTRACT_DRIFT (test I4). |
| 2e | Zoom and pan go through `app/core` viewMath | **PASS** | `SliceViewport.js:31` imports `clampZoom`, `fitTransform`, `panBy`, `screenToSource` and `zoomAbout` from app/core. The image and the overlays share one transform; the SVG viewBox is the source grid. |
| 2f | Slice cache key includes the variant | **PASS** | The key is `endpoint\|resolved URL\|scenario`, and `?variant=` / `?prediction_variant=` are part of the URL. The cache can only know the requested variant. The model re-checks the served variant on every read (`index.mjs:376-377`), so a mismatched answer is never relabelled. |
| 3a | Bytes counted from received bytes or Content-Length | **PASS** | JSON: Content-Length, otherwise the counted UTF-8 body (`httpTransport.readJsonBody`). Artifacts: exact `buf.length` (`content.mjs:135`). Every live request goes through one of these two. |
| 3b | Every request in a gesture is attributed to it | **PASS, with limits** | Requests are attributed when they complete. That is clean in the scripted run, because each step waits until its slice is on screen. Limits in N-3. |
| 3c | A revisit from cache logs 0 bytes and `cache_hit: true` | **PASS** | Render checks L6 and netLog test G2. `36a8731` extends this to EMPTY_UNAVAILABLE answers. |
| 3d | `l4-report.mjs`: p50/p95/max per switch, and flags volume-sized requests | **FAIL** | It reports min/median/max only (no p95). Its limits are absolute (500 KB per gesture, 2 MB per response), not relative to a slice. **It can return PASS without having measured anything (demonstrated).** See B-2. |
| 3e | `S1_L4_SCRIPT.md`: PowerShell 5.1, full adb path, `$SERIAL`, PASS stated before measuring | **FAIL** | PS 5.1 syntax is fine and adb is called by full path through `$env:LOCALAPPDATA`. But `$SERIAL` is used **0 times** across the 5 adb calls (B-1). The PASS table exists but comes after the procedure (N-4). |
| 3f | Phone time ≤ 20 min | **PASS** (estimate) | §0.4 to §3.1 is about 10–15 min, of which the run itself is 30–60 s. The script states no time budget (N-4). |
| 4a | `runtime.content` | **PASS** | Timeout (test B7), abort (B9), checksum (B5), ETag (B6), FIXTURE_NO_BYTES (B2), and no fetch outside the artifact route (B3). Caveats in N-5 and N-10. |
| 4b | The leave guard pre-empts Android back | **PASS** (by code) | The guard is not a separate BackHandler listener. NavigatorView's single listener calls `nav.pop()` → `leave()` → the guard, and returns `true` synchronously (`NavigatorView.js:80-91`, `navigator.mjs:121`). At the root it asks the guard with `EXIT`. The listener re-registers on every navigation, after any child's mount effect, so it is the last-registered one. No other BackHandler listener exists in `mobile/src`. This path is untested (N-7). |
| 4c | `useCall` is latest-wins and aborts on unmount and param change | **PASS** | Tests Q1–Q4. A key change re-runs `start()`, which aborts the previous request; unmount calls `abort()`. The signal reaches both the transport and `content`. SCR-02 uses it. Gaps in N-8. |
| 4d | Redaction (build script and sidecar writer) | **PASS** | The banner, state panel and prepare output go through `maskBaseUrl`. Fixture mode drops the URL (test C12). The sidecar records `api_base_url sha256:…`; `built_in` is removed; the install path is relative. TransportError messages contain the URL, but app/core keeps them as `cause`, which `classifyError` drops, so they never reach the screen. Caveats in N-6. |
| 5 | Publication hygiene | **PASS** (one nit) | I scanned 4,603 added lines, plus 96 in `36a8731`. No hostnames, serials, usernames or absolute paths; `127.0.0.1` appears only in a commit message. One synthetic IP, `10.1.2.3`, at `config.test.mjs:100` (N-6). `.env*.local`, `/src/generated/` and `/release/` are gitignored. `process.env` is read only by `scripts/prepare.mjs`, at build time. |
| 6 | Dependencies | **PASS** | The only new package is `react-test-renderer` **19.2.3**: exact pin, devDependency, MIT, documented in README lines 25 and 189. No `hasInstallScript` in the lock. It pulls a nested `react-is@19.3.0` (N-12). |
| — | Device, Gradle, emulator | **NOT RUN** | Excluded by the resource rule |

## 3. Findings: BLOCKING

**B-1. The L4 script never pins the device.**
- All 5 adb calls are unpinned, including the logcat capture. With two entries in `adb devices` (for example USB plus a wireless-debugging entry for the same phone), every command fails with "more than one device".
- **Fix:** after `& $adb devices -l`, set `$SERIAL = "<serial of the A17 line>"`, then run `& $adb -s $SERIAL get-state`, which must print `device`. Use `& $adb -s $SERIAL …` everywhere, and set `$SERIAL` again in the second (capture) window.
- **Owner:** A2 / Phạm Tuấn Anh, before 19:00.

**B-2. `l4-report.mjs` can report L4 PASS without measuring anything.**
- My probe (`scratchpad\qa77\probe_l4.mjs`) gave three results:
  - 15 `new-15` gestures with **zero requests** → `L4 PASS`, `new_slice_kb {min 0, median 0, max 0}`.
  - The same happens if the MRI never loads: a content_url outside the artifact route makes no request, and the `outcome:"image-error"` is never read.
  - An 88 × 2 KB mask-volume response inside a slice gesture → `PASS`.
- This report decides L4, and so GATE-MOB-01.
- **Fix:**
  - Every `new-15` gesture must have `cache_hit:false` and `outcome:"shown"`, and must include `mri_slice_get` and `artifact:mri` with more than 0 bytes.
  - FAIL on any `superseded` gesture or `CMW_STEP_TIMEOUT` inside an L4 pass.
  - Report p50/p95/max of bytes per switch, nearest-rank as in `slice-timing-report`.
  - Add a relative volume flag: any response more than about 10× the median of the same endpoint (print the 88× line for reference).
  - Add a test for each.
- **Owner:** A2 / Phạm Tuấn Anh, before 19:00.

**B-3. An error state shows the previous slice's Dice and provenance under the new slice's label.**
- Metrics come from `displayed` whenever `ok && !switching` (`CaseExplorerScreen.js:540`). The "Provenance (this slice)" card (`:671`) and the SCR-04/05/06 entries (`:679-691`) also stay on the old slice. Meanwhile the scrubber (`:542`) and the StatePanel (`:590`) show the new slice.
- Reproduced in the render harness, with the network down on z = 46: scrubber "slice 47 / 88 (z = 46)", panel "The backend could not be reached… TRANSPORT_UNREACHABLE", and the metric card still reads **"Slice Dice (RAW): 0.873 · metric m1"**, plus the previous MRI's provenance.
- This breaks the file's own rule that image, label and metrics switch together, and the "metrics when valid" bar.
- **Fix:** when `blocking`, show "Slice Dice: -" and provenance "-", and disable the entries. Add a render check for this case.
- **Owner:** A2 / Phạm Tuấn Anh.

## 4. Findings: NON-BLOCKING (owner A2 / Phạm Tuấn Anh unless stated)

- **N-1. `36a8731`: no way to refresh a cached "unavailable" layer or metric.**
  - Prediction, GT and metrics answers are folded into a SUCCESS slice view (`index.mjs:372-409`). So there is no StatePanel, no Retry/Refresh button, and `clear()` is never called.
  - The cache lives in the runtime, so leaving SCR-03 and coming back does not help either. Only an app restart clears it.
  - Reproduced: metrics ingested after the first visit, back on z = 44 → still "Slice Dice: unavailable (ARTIFACT_NOT_FOUND)", with no refresh control anywhere on the screen.
  - The commit's claim that "Refresh / Retry … is seen at once" holds only for MRI-level states.
  - **Fix:** drop negative entries when the Explorer mounts, and add a visible "refresh this slice" action that clears only that slice's keys.
- **N-2. Negative-cache scope.**
  - In `errors.mjs:48-49`, app/core also classifies `RUN_NOT_SUCCEEDED` (when no QUEUED/RUNNING context is passed) and `RUN_NOT_DEPLOYABLE` as EMPTY_UNAVAILABLE. `prediction_slice_get` is called without that context. This is latent today, because slices are fetched only for runs that succeeded.
  - **Fix:** cache negative answers only for `ARTIFACT_NOT_FOUND` and `GROUND_TRUTH_UNAVAILABLE`, by `view.reason`.
  - Retry and Refresh wipe every SUCCESS entry too, so a Retry during the L4 window turns the revisit pass into network traffic. Clear only negative entries and the current slice.
- **N-3. Gesture attribution.**
  - Responses are attributed when they complete. Late responses of a superseded gesture land in the next gesture, which contradicts the header's "never merged" claim.
  - Requests outside any gesture are counted in `totals()`, which is never logged.
  - **Fix:** tag each request with the gesture open when it starts, and log `CMW_NET_TOTALS` at the end of a run.
- **N-4. `S1_L4_SCRIPT.md`.**
  - Move the PASS table above §1.
  - Pin the working directory, or use an absolute capture path, in both windows. Today the logcat file lands wherever each window happens to be. Write it to a gitignored folder.
  - State the ≤ 20 min phone budget and when to abort.
  - §2.3 still says "the screen names the URL it tried"; after N-4 it shows `<configured>`.
  - In §0.1, hash the *normalised* URL (trimmed, no trailing `/`, lowercase scheme), as `build-release.ps1` does.
  - The manual fallback always FAILs the report, because it has no run markers. Say so, or add `--manual`.
  - Add a `logcat -d` dump at the end as a backup.
- **N-5. Contract provenance.**
  - `content.mjs` (artifact route, `sha256:` checksum, ETag) and `capability.mjs` (`mode_capability`) follow contract 1.0/1.1.0 rules.
  - Those rules are not in `contracts/api/contract.json` at this head, which is `DRAFT v0` / `api_contract_11`. The word `binary_delivery` appears only in mobile code.
  - **Fix:** cite the source, and land the contract. Add an S1 §0 pre-flight: from the laptop, fetch one live `mri_slice_get` and its `content_url`, and check the route, checksum and ETag against what `content.mjs` requires. A3 confirms the backend side.
- **N-6. Redaction strength.**
  - An unsalted SHA-256 of a private-range URL can be reversed by enumerating addresses and ports in seconds, so "useless for finding it" is overstated. Use an HMAC with a secret from `.env.local`, or drop the field.
  - Replace `10.1.2.3` in the test with `backend.invalid` or a `192.0.2.x` documentation address.
- **N-7. Leave guard.**
  - The hardware-back path is untested, because the BackHandler mock does nothing. Add a test that captures the listener.
  - The guard of a covered (unmounted) screen survives until its entry is popped. Clear it when the screen is covered, or document `return () => nav.setLeaveGuard(null)`.
  - Two prompts can run at once; serialise them.
- **N-8. `useCall` and SCR-03.**
  - `useCall` does not abort when `enabled` turns false, so the late result still lands.
  - SCR-03's `case_get`, `analysis_run_get` and `experiment_get` use an `alive` flag with no abort.
- **N-9. Run line wording.** While `analysis_run_get` is loading, or after it fails (the reason is dropped), the line reads "experiment not stated · precomputed: not stated". It should say "loading" or "run details unavailable (reason)".
- **N-10. Missing checksum.** `content.bytes` accepts bytes without a checksum, unverified; `verified:false` is never read.
- **N-11. GT test gap.** No render test opens an INFERENCE_REVIEW case on SCR-03.
- **N-12. Nested `react-is`.** `react-is@19.3.0` (caret range) is nested under `react-test-renderer`, next to React 19.2.3. Harmless for a test-only renderer; note it in the README.

## 5. `36a8731`: answers to the coordinator

- **Earlier commits unchanged?** Yes. range-diff shows all three as `=`.
- **Is caching EMPTY_UNAVAILABLE for 5 min safe?**
  - Against masking errors, yes.
  - Against staleness, not fully: a prediction, GT or metric that becomes available can stay hidden for up to 5 min with no user path to refresh it (demonstrated, N-1).
  - Refresh does clear the cache, but only from the slice StatePanel. That panel appears only when the MRI-level answer fails. When Refresh does run, it clears the whole cache.
- **Can a cached "unavailable" mask a real error?** No error state is cached. Only SUCCESS and EMPTY_UNAVAILABLE are ever stored, so RECOVERABLE, FATAL and STALE (including TRANSPORT_UNREACHABLE and CONTRACT_DRIFT) always reach the server; test V1n2 asserts that RECOVERABLE is not cached. Two caveats:
  - Run-state codes are also EMPTY_UNAVAILABLE in app/core (N-2).
  - Within 5 min, a cached "unavailable" stands in for whatever the server would say now, including a network loss. This is the same trade-off as caching SUCCESS.
- **`mode_capability`:** correct for both 1.1.0 and 1.0.0 rows (test V1c2 and the existing tests). Contract caveat in N-5.

## 6. VERDICT

**MERGE AFTER FIXES:** fix **B-1, B-2 and B-3**. As with #65, do not merge before **GATE-MOB-01** is closed.
- **B-1 and B-2 must land before the 19:00 S-1 session.** They decide how L4 is measured and judged. As the tooling stands, an L4 PASS tonight would not be trustworthy evidence.
- **`36a8731` itself is acceptable.** Fixing N-1 and N-2 alongside is recommended.
- Everything else is non-blocking.

Notes:
- Scratch is left in place at `<scratch>\qa77` (about 294 MB including node_modules). I deleted nothing, per your no-delete rule; you can remove it.
- The probes are `probe_l4.mjs` and `repo2\mobile\test\render\qa_probe.mjs`. Both are in scratch only, never in the repo.
- My worktree is still detached at `d553162`.
