# QA-ADR — `TECH_STACK_ADR.md` (ADR-MOB-001), reviewed before the GATE-MOB-01 decision · **NOT READY AS WRITTEN · READY UNDER OUTCOME (a) AFTER B-1 TO B-4** · 2026-10-01

| | |
|---|---|
| **Reviewer** | CHAT E, an LLM red-team session (Claude Code, Claude Opus 5.5) run under the leader's account. **This is not a second human reviewer.** It is the independent QA pass of `RECOVERY_OVERRIDE_DAY22.md` §2 item 2. |
| **Target** | Branch `docs/tech-stack-adr` @ `9a233862f4a8bcc390baf892c5442f9f43234680`. Compared with `main` (three-dot diff), it adds exactly two files:<br>• `management/adr/TECH_STACK_ADR.md`: blob `ab35b343…`, 7,368 bytes<br>• `management/day22/QA_REVIEW_004_SPIKE_A.md`: blob `55bd1b2a…`, 11,766 bytes |
| **Baseline** | `origin/main` moved from `d6441bc` (the branch's merge base) to `be86cb1` (#74) while this review ran; all evidence was read at `be86cb1`.<br>• #74 touches only `backend/mesh/**`, so there is no conflict with the branch.<br>• Spike A/B evidence has not changed since QA-004's subject `8a94172`. The only change since then is the SPIKE_C1 entry of `SPIKE_PHASE_STATE.yaml`. |
| **Other refs read** | • PR #77, `origin/feat/day22-v1-case-explorer-screens` @ `4f46b37` (not merged)<br>• Draft PR #46, `origin/spike-a/s7-webview-container` @ `fba88b3`, plus its PR body (`gh pr view 46`, read only) |
| **Rules applied** | • `RECOVERY_OVERRIDE_DAY22.md` §3 (last bullet) and §4: the gate delegation, and the rows "Spike A ACCEPTED", "GATE-MOB-01 (closed early, ~12:00)" and "Spike B ACCEPTED + DR-008c"<br>• `SPIKE_PHASE_STATE.yaml`: `gates_that_must_not_close_early` and `SPIKE_B.negative_result_rule`<br>• Spec `09` §1.1 and §7; `00` §11 and §11.1 (read only)<br>• QA-004 |
| **Method** | • Read-only git commands on committed refs: `git show`, `git grep`, `git diff`, `git log`, `git merge-base`.<br>• Python read blobs through `git show` for three things: the lockfile's versions and licences, the publication scan, and the split-manifest lookup.<br>• No checkout, worktree, fetch, commit, push, comment or label.<br>• At the end, `git status` shows only the pre-existing `?? .claude/`, and the shared checkout is still on `main` @ `c7a37e0`.<br>• CPU only, one process at a time. |
| **Not run** | • No device measurement: L4 is measured tonight.<br>• The raw-log re-derivations of Spike A and B10/B11 were not repeated. QA-004 and the #44 QA already did them, and the bytes have not changed since.<br>• CI was not inspected. |

> **VERDICT.**
> - **As written: NOT READY.** It has four blocking findings (B-1 to B-4).
> - **Under outcome (a): READY to close GATE-MOB-01**, once three things are done:
>   - B-1 to B-4 are applied;
>   - the outcome-(a) edits E1–E10 of §3 are filled in with tonight's measured values;
>   - the L4 evidence is in a commit and the leader's decision is recorded before 23:59.
> - **Under (b):** the ADR must stay PROPOSED.
> - **Under (c):** it stays PROPOSED unless the leader explicitly takes the L1–L5 decision.

---

## 1 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Every factual claim is backed by evidence on `main` | **FAIL** | 30 of the ADR's claims were traced (§1.1). Every number in the Spike A and B10/B11 tables matches `main`. The failures:<br>• PR #66 is never cited, so the B5/B9/B12 claims are stale and the "~60 FPS" claim has no scope (B-3).<br>• "Brush math via `app/core/viewMath.mjs`" is wrong (N-3).<br>• "The cache policy is part of V1 acceptance" has no source (N-1).<br>• "The Spike B viewer runs in Chrome" is not on `main` (N-6).<br>• S7 is used without its draft caveat in four places (N-2). |
| 2 | Each `09` §7 criterion is addressed honestly, including any that are unmet or conditional | **FAIL** | §4 is titled "how each is met" and presents all three criteria as met.<br>• **Criterion 1 is met.** Basis: A3–A7, with A5 at a 0-pixel offset, on the 64×64×16 fixture.<br>• **Criterion 2 is CONDITIONAL.** On the real mask, only level 0 (61,424 triangles) holds ±1 slice (#66). The 59.88 FPS was measured on a 5,648-triangle synthetic mesh. B6 and B7 are NOT MEASURED. See B-3.<br>• **Criterion 3 is PARTIAL.** Only one candidate was built (A12 partial = L2), and B15 is still due. See B-4. |
| 3 | The early-close deviation (§8) matches override §4 | **FAIL** | The three scoping statements **PASS** against the override:<br>• Spike B is `ACTIVE` (`SPIKE_PHASE_STATE.yaml`, SPIKE_B `status: ACTIVE`).<br>• The 3D module is conditional.<br>• A B5 failure at every level reopens only the 3D module (the override's own wording).<br>Three things are claimed beyond the evidence:<br>• The close is described as pre-authorised, which QA-004 rules out (B-1).<br>• On #66's evidence the reopen trigger can no longer fire through B5; the live risk is B10/B11 at level 0 (B-3).<br>• "Final now: … the backend stack" lies outside GATE-MOB-01's rule (N-5). |
| 4 | Consistency with QA-004 | **FAIL** | The ADR states the pre-declared path three times:<br>• Status: "ACCEPTED … under the leader's pre-authorised rule"<br>• Decided by: "(pre-authorised; …)"<br>• §8: "once Spike A is ACCEPTED under the pre-declared rule"<br>QA-004, on the same branch, says that rule does not hold as written. In addition:<br>• the Limitations row lists L1–L3 only, with no L4 or L5;<br>• the A9 row omits limb 2;<br>• QA-004 is not among the Inputs.<br>See B-1 and B-2; the per-outcome edits are in §3. |
| 5 | Versions and licences match `mobile/package.json` on PR #77 | **FAIL (non-blocking; one sub-claim)** | **Versions match exactly:** `expo ~57.0.21`, `react 19.2.3`, `react-native 0.86.3`, `react-native-webview 13.16.1`.<br>**Licences match:** all 7 runtime dependencies, the devDependency and the 2 transitive packages are MIT in both the lockfile and `mobile/README.md`.<br>**Two problems:**<br>• "Each one is pinned" is false for `expo` (`~57.0.21`) and `react-native-safe-area-context` (`~5.7.0`).<br>• The lockfile resolves `expo` **57.0.26**, while Spike A's lockfile on `main` resolves the measured **57.0.21**.<br>See N-4. |
| 6 | Publication hygiene | **PASS** | A scan of both blobs found 0 hits for:<br>• Windows or Unix absolute paths, IPv4 addresses, emails, URLs, `localhost`;<br>• overlay host suffixes, a device-serial pattern, 16-hex network ids.<br>Both files are LF with no BOM and end in a newline. "Mac mini M2" and "ZeroTier overlay" are product names; no address or id appears. |

### 1.1 Claim ledger (check 1)

| ADR claim | Source on `main` | Result |
|---|---|---|
| §1: SM-A176B; Android 16; `s5e8535`; Mali-G68 with OpenGL ES 3.2; 7.29 GiB; 256 MB heap; 60/90 Hz with automatic switching; each measurement records or pins the refresh rate | `DR006_DEVICE_PROFILE.md` lines 46, 52, 67, 94–105 | ✔ |
| §1: "release build whose timestamp post-dates the last code change" | `DAY20_REBASELINE.md` lines 454 and 703, not DR-006 | ✔ but cited to the wrong source (N-7) |
| A2: 16/16; 13 scripted steps; 44.9 ms | `RESULT.md` §A2 | ✔ |
| A3/A4: 8/8 and 6/6. A5: 60/60 at r = 0 and r = 2, offset (0, 0), tolerance 0. A6/A7: 15/15 each | `RESULT.md` §A3–A7 | ✔ |
| A8: 2 cold reloads, 16/16 each | `RESULT.md` §A8 | ✔ |
| A9: 65.31 / 50.23 / 98.72 / 50.84 ms | `RESULT.md` §A9 and §S6 | ✔, but **50.84 ms is the in-window p95 only**. The same run's all-step p95 is 100.74 ms and its miss p95 is 102.73 ms (B-2). |
| A10: 30.48 ms over 123 strokes, 0 lost. A11: 12/12 | `RESULT.md` §A10/A11 | ✔. Strictly, it is 0 *committed* samples lost, and the 30.48 ms is a JS-side lower-bound proxy (N-7). |
| Limitations row (L1–L3) | QA-004 §5 | ✘: L4 and L5 are missing (B-2) |
| B1–B4, B8, B14: DIAGNOSTIC PASS | `SPIKE_B_3D/RESULT.md` | ✔ |
| "Linked MPR proof of concept" | `spikes/spike_b_3d/clinical_poc/` | ✔ It exists, but it is a local-only diagnostic and not one of the B criteria (N-7). |
| B10/B11: 59.88 FPS; longest stall ≤ 16.9 ms; synthetic level 0; #44 | Spike B `RESULT.md` (stalls 16.80 / 16.80 / 16.90 ms) | ✔ |
| S7: `webgl2: true`; Mali-G68; 964 ms; 5,648 triangles; orbit and pick worked | Draft #46 only: evidence JSON @ `fba88b3`, and "964 ms after the button" in the PR body | ✔ and labelled as off-main in §3. Used without that caveat in the Inputs, §2, §4 and §5 (N-2). |
| B5/B6/B7/B9/B12/B13 are "measured … tonight" | #66, `EVIDENCE_RAW/20261001_real_mesh/README.md` | ✘ Stale: B5, B9 and B12 were measured offline today (B-3). |
| §4: "~60 FPS" | #44 for the synthetic mesh; #66 says that figure "does **not** carry over to 61,424 real triangles" | ✘ No scope given (B-3) |
| Expo `~57.0.21`; React 19.2.3; RN 0.86.3; `react-native-webview` 13.16.1 | PR #77 `package.json` | ✔ The lockfile resolves `expo` 57.0.26 (N-4). |
| `app/core` modules (contract, transport, errors, 7 screen states, view math, selection/comparability) and the CI job `app-framework-neutral` | `app/core/*.mjs`, `screenState.mjs` ("seven screen states"), `guardrails.yml:328` | ✔ |
| "Zoom/pan/**brush** math … via `app/core/viewMath.mjs`" | `viewMath.mjs` exports only `screenToSource`, `fitTransform`, `clampZoom`, `zoomAbout` and `panBy`. The brush math is in `app/verticals/v4_review_and_findings/brush.mjs`. | ✘ (N-3) |
| "Chunked WebView→RN messages (S7)" | The fix is commit `fba88b3`, on draft #46 only. Spike B `RESULT.md` says it "was not remeasured" | ✘ Not on `main` (N-2) |
| Per-slice transport (DR-015 limb 2; NFR-PERF-001) | `OPEN_DECISIONS.md` DR-015 "Limb 2" | ✔ But DR-015 calls this direction "Provisional, not frozen" (N-5). |
| FastAPI + SQLite on the Mac mini M2 over ZeroTier | #68 `backend/README.md`; DR-003; **DR-003a** (ZeroTier) | ✔ ZeroTier comes from DR-003a, not DR-003 (N-5). |
| PyTorch on separate hosts (DR-016); Contract 2 | Override §4; `contracts/ingestion/contract2_experiment_artifact/` | ✔ |
| "`10` §1 requires a primary interactive mobile client" | `10` §1: "The mobile application is the primary interactive research client" | ~ It does not by itself exclude a PWA (N-6). |
| "The Spike B viewer runs in Chrome" | Only a desktop viewer exists (B1). `MEASUREMENT_B10_B11.md` limits Chrome to URL, interaction and WebGL error checks. | ✘ (N-6) |
| Flutter: "no team experience" | `RESULT.md` §A12 says only that Flutter is not installed | ✘ No source (N-7) |
| §7: "the cache policy is part of V1 acceptance" | No record on `main` | ✘ It conflicts with DR-015 and the S6 record (N-1). |
| §7: dependencies "pinned and listed with licence in `mobile/README.md`" | PR #77, not merged | Listed ✔; licences ✔; pinned ✘ for 2 (N-4) |
| §8: the phase state requires A and B ACCEPTED; Spike B is ACTIVE | `SPIKE_PHASE_STATE.yaml` lines 360 and 908–911 | ✔ |
| "8 calendar days remain"; DR-G05 = GATE-MOB-01 | Override §1; `OPEN_DECISIONS.md` line 58 | ✔ |

---

## 2 · Findings

### BLOCKING

**B-1 · The Status, "Decided by" and §8 claim the pre-authorised path, which QA-004 (on the same branch) rules out.**
- **Why this is wrong.**
  - Override §4 pre-authorises a transition only "when an independent QA pass is PASS **and the stated rule holds** … If a rule does not hold, the gate stays open and the leader is asked."
  - The Spike A rule lists L1–L3 only. QA-004's verdict is "NOT ACCEPTED under the rule exactly as pre-declared".
  - The GATE-MOB-01 rule requires "Spike A ACCEPTED".
  - On `main`, SPIKE_A is `status: ACTIVE` and GATE-MOB-01 is `OPEN` (`PROJECT_STATE.yaml:376`).
  - L5 is outside the pre-declared list whatever happens tonight. So **in no outcome is the close "pre-authorised"**; it is always the leader's explicit decision.
- **Fix now, before the measurement:**
  - **Status** → `PROPOSED — 2026-10-01 (Day 22). Not pre-authorised: QA-004 found that the Spike A rule of RECOVERY_OVERRIDE_DAY22.md §4 does not hold as written (L4, L5). The leader decides after the S-1 L4 measurement; see §8.`
  - **Decided by** → `Phạm Tuấn Anh — Team Leader, by explicit decision (pending). QA: CHAT E, an LLM red-team session, not a human reviewer (QA-004; QA-ADR).`
  - **Inputs**: append `, QA-004 (management/day22/QA_REVIEW_004_SPIKE_A.md)`.
  - **§8, first sentence** → `` `GATE-MOB-01` stays **OPEN** until the leader decides on Spike A (QA-004 L4, L5) after tonight's L4 measurement. `` Tonight's replacement text is in §3.

**B-2 · The Spike A table omits A9 limb 2, L4 and L5, and shows an in-window p95 without saying so.**
- **A9 row** → `| **A9 cached slice switch p95 ≤ 200 ms; no full-volume transfer per gesture** | Limb 1 PASS: 65.31 ms (64×64×16), 50.23 ms (576×576×16), 98.72 ms (576×576×88, whole cache), 100.74 ms all steps / 50.84 ms in-window / 102.73 ms on a miss (576×576×88, ±3 window, cold start). Limb 2: not measured in Spike A (local fixture, no network path) — L4, see §8 |`
- **Limitations row** → `| Limitations (QA-004 §5) | L1 A1 partial (no per-pixel fixture match); L2 A12 partial (one candidate built); L3 A8/A10/A11 on the 64×64×16 fixture; **L4 A9 limb 2 not measured in Spike A**; **L5 A2–A7 also on the 64×64×16 fixture** (exactness bounds, not re-run at cohort size). L4 and L5 are outside the limitations pre-declared in RECOVERY_OVERRIDE_DAY22.md §4 |`

**B-3 · PR #66 (on `main` since 12:49) is never cited. The ADR overstates the 3D evidence and keeps a reopen trigger that #66 has made inoperative.**
- **What #66 found**, on the real mask of CASE_0059:
  - "only level 0 — the undecimated voxel-face surface (61,424 triangles) — keeps every pick within ±1 source slice";
  - every vertex-clustering level fails, with errors of up to 29–40 slices;
  - the #44 B10/B11 PASS, measured on 5,648 synthetic triangles, "does **not** carry over";
  - "If level 0 fails B10 or B11, no level satisfies both bounds and the result is a `NEGATIVE_RESULT`".
- **Consequence.** B5 can no longer fail at every level, so the ADR's only stated trigger cannot fire. The deciding test tonight is B10/B11 at level 0, which has about 11× the measured triangle count.
- **Fixes:**
  - **Inputs**: append `, real-mesh frontier PR #66 (spikes/spike_b_3d/EVIDENCE_RAW/20261001_real_mesh/)`.
  - **§3, B10/B11 row**: append `. Does not carry over to the real level-0 mesh (61,424 triangles, about 11× more): #66`.
  - **§3, row "B5/B6/B7/B9/B12/B13"**: replace it with two rows:
    - `| B5/B9/B12 offline on a real mask (#66) | Only level 0, the undecimated surface (61,424 triangles), keeps every pick within ±1 slice (0 no-hits, 0 background navigations); every vertex-clustering level fails (errors up to 29–40 slices). FPS and stall per level: NOT MEASURED |`
    - `| B6, B7, device B9, B10/B11 at the real level, B13 | Measured tonight (S-1) as V2 acceptance conditions — see Residuals |`
  - **§4, criterion 2** → `| Stable interactive 3D and 3D→slice mapping | **CONDITIONAL — not met yet.** WebGL2 renders in the RN WebView on the A17 at 59.88 FPS median on a synthetic 5,648-triangle mesh (#44); canonical picking is exact on fixtures (desktop). On a real mask only level 0 (61,424 triangles) holds ±1 slice (#66); its A17 FPS/stall, B6 and B7 are not measured. The 3D module is therefore conditional (§8) |`
  - **Reopen trigger.** Apply this text in three places: the second sentence of Residuals, the second sentence of §7 bullet 3, and the last bullet of §8.
    > `If Spike B ends NEGATIVE_RESULT — no decimation level meets both B5 ≤ ±1 slice and B10/B11 on the A17 (SPIKE_PHASE_STATE.yaml negative_result_rule) — only the 3D-module part of this ADR is reopened; the React Native choice for 2D stands. Override §4 names the case "B5 fails at every level"; on #66's evidence B5 holds only at level 0, so tonight's deciding test is B10/B11 for level 0 (61,424 triangles).`
    - The leader should confirm this wording. It reopens in more cases than the override's literal trigger and never in fewer.

**B-4 · §4 says "how each is met", but criterion 3 rests on a single candidate.**
- **Heading** → `## 4 · Decision criteria (09 §7): status of each`
- **Criterion 1 row**: prefix it with `**MET** (64×64×16 fixture, L5).`
- **Criterion 3 row** → `| Development velocity within the 30-day window | **PARTIAL — single-candidate evidence.** Only React Native / Expo was built (A12 partial, L2; Spike B's B15 note is still due). The team built release RN/Expo APKs on the A17 (Spike A; S7 on draft #46); one JavaScript codebase shares app/core and the Spike B viewer; 8 calendar days remain. This is a measured feasibility record plus a schedule argument, not a comparison between candidates |`

### NON-BLOCKING

**N-1 · (medium) §7's cache sentence has no source and contradicts recorded constraints.**
- **The contradiction.**
  - The S6 record (`RESULT.md` §S6 item 3; `SPIKE_PHASE_STATE` `stage_s6`) and DR-015 ("What this decision explicitly does NOT do", item 1) both say nothing there raises PR-CACHE-01 to MUST.
  - "Part of V1 acceptance" would do that by implication. Once this ADR is accepted it becomes project truth (`00` §11.1), so the contradiction would be recorded as decided.
- **A second inaccuracy.** S6 shows the decoded bitmaps live **off** the Java heap: 507 MB PSS with the whole volume resident. So the 256 MB heap does not by itself "force bounded caches".
- **Fix** (recommended in the same edit as B-1 to B-4):
  > `The 256 MB Java heap rules out holding a volume in JS/Java memory; decoded bitmaps are off-heap (S6: 507 MB PSS with the whole volume resident) and a component-level window does not bound them. Image-cache memory is therefore measured on the A17 in V1's TC-PERF-001 runs (dumpsys meminfo). This adds no requirement: PR-CACHE-01 stays SHOULD (DR-015).`

**N-2 · (low) S7 is used without its draft caveat, and the chunking fix is not on `main`.**
- **Fix, part 1.** Append `(PR #46, draft — not on main)` in four places:
  - the Inputs;
  - §2 row 1;
  - §4 criterion 3;
  - §5's "(S7)".
- **Fix, part 2.** The §5 3D row becomes:
  > `react-native-webview 13.16.1 (the version in the #44 B10/B11 build, bfbf2fe on draft #46) hosting the WebGL2 viewer. WebView→RN messages must be chunked (logcat cuts lines at 4,095 characters — #44 PROVENANCE); the fix is on draft #46 and has not been re-measured.`

**N-3 · (low) The §5 2D row points to the wrong file.**
- **Fix:** `Native RN views; zoom/pan math via app/core/viewMath.mjs (provenance copy of spikes/spike_a_2d/app/viewerMath.js @ 1b362e8); brush math via app/verticals/v4_review_and_findings/brush.mjs (provenance copy of brushMath.js @ e41e78b)`.

**N-4 · (low) Two sub-claims about versions are inaccurate.**
- **Option (i):** the shell owner pins `"expo": "57.0.21"` in #77, which matches what Spike A measured.
- **Option (ii):** change the text instead:
  - §5 → `Expo SDK 57 (expo ~57.0.21; the lockfile resolves 57.0.26 — Spike A measured 57.0.21)`.
  - §7 → `Each one is listed with its version range, its lockfile-resolved version and its licence in mobile/README.md (PR #77, not yet merged).`

**N-5 · (low) The backend and transport scope reach beyond GATE-MOB-01.**
- **The issue.**
  - `09` §1.1 names a separate `ADR-BE-001`, which does not exist anywhere on `main`.
  - It also names `ADR-ART-001`, whose direction DR-015 limb 2 calls "Provisional, not frozen" until E8/E10.
  - The backend is not part of the override's GATE-MOB-01 rule.
- **Fix, §8 "Final now"** → `**Final now:** the framework (React Native / Expo), the 2D viewer and brush, and the shared app/core. The backend stack (Python + FastAPI + SQLite on the Mac mini M2, #68) is recorded here as the ADR-BE-001 choice by the leader's decision, outside GATE-MOB-01's rule; the transport row is ADR-ART-001's direction from DR-015 limb 2 and stays provisional until E8/E10.`
- **Fix, §5 Backend row**: `(DR-003 host)` → `(DR-003 host; ZeroTier per DR-003a)`.

**N-6 · (low) The case against the PWA overreaches.**
- **§2, candidate 3** → `Partly — the Spike B viewer runs in a desktop browser (B1, diagnostic); no measurement in a mobile browser and no brush evidence in a browser`.
- **§6** → `**Pure web client (PWA)**: no brush or on-device evidence in a browser. 10 §1 makes the mobile application the primary interactive client; a PWA would have to meet that with no measurement behind it. WebGL is still used, inside the RN WebView.`

**N-7 · (info) Wording and citations.**
- §1: "(restated from DR-006 …)" → `(restated from DR-006; the release-build rule is DAY20_REBASELINE's)`.
- A10 → `0 committed samples lost; feedback is a JS-side next-frame proxy (lower bound)`.
- "Linked MPR proof of concept" → `linked MPR proof of concept (spikes/spike_b_3d/clinical_poc/, a local-only diagnostic, not a B criterion)`.
- §6 Flutter → `no evidence; Flutter is not installed on the build machine (Spike A RESULT §A12)`.
- §4: "ships RN/Expo builds" → `has built release RN/Expo APKs`.

**N-8 · (process)**
- **Merge order.** §7 and the (a) evidence point to PR #77, which is not merged. Either merge the L4 evidence and #77 before or together with the ADR, or cite them as "PR #77 @ `<sha>`, not on main yet".
- **Override expiry.** The override expires at 23:59 tonight, with no renewal by silence. A decision taken after that falls under the normal Day 23 workflow.
- **Branch base.** The branch is one merge (#74) behind `main`. There is no conflict, so no rebase is needed.
- **QA-004's own housekeeping** is not the ADR's job and stays open:
  - the `RESULT.md` header;
  - the `run_qa004.py` docstring;
  - SPIKE_A `latest_tested_commit: 6ca1e21`.

---

## 3 · Per-outcome edit list (check 4)

Apply B-1 to B-4 first. They do not depend on the outcome. After that, only the sentences below change tonight. The `<…>` placeholders are the measured values, which come from `l4-report.mjs`, the APK's `.build.txt` (with the URL redacted) and the commit that holds the evidence.

**The sentences that change:**
- **E1**: the Status cell
- **E2**: the "Decided by" cell
- **E3**: the Inputs cell
- **E4**: the limb-2 clause of the A9 row
- **E5**: the last sentence of the Limitations row
- **E6**: the §5 Transport row
- **E7**: §8, sentence 1
- **E8**: §8, sentence 2 ("Production mobile modules may now be created under `mobile/`.")
- **E9**: §8, "The leader authorised the deviation in advance (`RECOVERY_OVERRIDE_DAY22.md` §4), and it is scoped as follows:"
- **E10**: the §8 "Final now" bullet

### (a) L4 measured PASS, and the leader accepts L1–L3 + L5

**Resulting states:**
- **Gate: CLOSED.** It closes early, as a documented deviation from `gates_that_must_not_close_early`, by the leader's explicit decision.
- **ADR: ACCEPTED,** with the 3D module CONDITIONAL on Spike B.
- **Spike A: ACCEPTED-WITH-LIMITATIONS L1–L3, L5.**

**Sentences:**
- **E1** → `ACCEPTED — 2026-10-01 <HH:MM> (Day 22), by the leader's explicit decision after the S-1 L4 measurement. Spike A ACCEPTED-WITH-LIMITATIONS L1–L3, L5 (QA-004); L4 measured PASS in the product app (§3). The early close before Spike B is ACCEPTED is the deviation pre-authorised in RECOVERY_OVERRIDE_DAY22.md §4; the 3D module is conditional (§8).`
- **E2** → `Phạm Tuấn Anh — Team Leader, explicit decision (the §4 pre-authorisation did not apply as written: QA-004, L5). QA: CHAT E, an LLM red-team session, not a human reviewer (QA-004; QA-ADR).`
- **E3** → append `, L4 product-app measurement (<evidence path> @ <commit>, PR #<n>)`.
- **E4** → `Limb 2: not measurable in Spike A (L4); **measured PASS in the product app** on the A17 against the real backend, 2026-10-01 <HH:MM>: l4-report.mjs → L4 PASS (R1–R8), 15 new + 15 revisit gestures, bytes per switch p95 <x> KB / max <y> KB, 15/15 revisits at 0 bytes; scope MRI + ground truth on CASE_0061 (no analysis run ingested, so prediction transfers are not covered); release APK from <sha>, built after the last code change; evidence <path>`
- **E5** → `L1, L2, L3 and L5 accepted by the leader on 2026-10-01 <HH:MM>; L4 closed by the product-app measurement in the A9 row (MRI + ground-truth path only).`
- **E6** → `Per-slice requests, never a full volume per gesture (DR-015 limb 2; NFR-PERF-001 limb 2 measured PASS in the product app, A9 row). ADR-ART-001 stays provisional per DR-015.`
- **E7** → `` `GATE-MOB-01` → **CLOSED** on 2026-10-01 at <HH:MM> by the leader's explicit decision: Spike A ACCEPTED-WITH-LIMITATIONS (L1–L3, L5) with L4 measured PASS, and the Spike B framework evidence named in override §4 on record (#44; B1–B4, B8, B14 diagnostic PASS). ``
- **E8** → `Production mobile modules may now be created under mobile/; the V2 3D module stays a skeleton until Spike B is ACCEPTED.`
- **E9** → `The leader authorised the Spike B part of this deviation in advance (RECOVERY_OVERRIDE_DAY22.md §4) and took the Spike A decision explicitly at <HH:MM> (QA-004). The deviation is scoped as follows:`
- **E10**: keep, using N-5's wording.

**Also record:**
- a "Disposition" section in QA-004 holding the leader's decision text;
- an override §6 row;
- SPIKE_A → ACCEPTED (with limitations) in `SPIKE_PHASE_STATE.yaml`;
- GATE-MOB-01 → CLOSED in `PROJECT_STATE.yaml`;
- the Day 23 revalidation rows: Vũ Hùng Anh for Spike A, Nguyễn Gia Đức Trung for the ADR.

### (b) L4 measured FAIL

**Resulting states:**
- **Gate: OPEN.**
- **ADR: PROPOSED.**
- **Spike A: NOT ACCEPTED.** A measured failure is not a limitation.

**Sentences:**
- **E1** → `PROPOSED — not accepted. NFR-PERF-001 limb 2 measured **FAIL** in the product app on 2026-10-01 (<rule(s)>; <evidence>); Spike A is not ACCEPTED and GATE-MOB-01 stays OPEN (RECOVERY_OVERRIDE_DAY22.md §4: "the gate stays open and the leader is asked").`
- **E2** → `Proposed by Phạm Tuấn Anh — Team Leader; no decision taken. QA: CHAT E, an LLM red-team session, not a human reviewer.`
- **E3**: as in (a), marked `(FAIL)`.
- **E4** → `Limb 2: not measurable in Spike A (L4); **measured FAIL in the product app**, 2026-10-01 <HH:MM>: l4-report.mjs → L4 FAIL on <Rn: …>, largest switch <y> KB against one volume ≈ <z> KB; release APK <sha>; evidence <path>`
- **E5** → `L4 is no longer a limitation: it is a measured failure in the product app (A9 row), to be fixed in the V1 transport and re-measured.`
- **E6** → `Per-slice requests (DR-015 limb 2). **Not yet met:** the product app at <sha> failed NFR-PERF-001 limb 2 (A9 row); fix and re-measure before this ADR is accepted.`
- **E7** → `` `GATE-MOB-01` stays **OPEN**: the product app failed NFR-PERF-001 limb 2 on 2026-10-01, so Spike A is not ACCEPTED. This ADR is the proposed decision; it is accepted only after a fix and a passing re-run of mobile/S1_L4_SCRIPT.md. ``
- **E8** → `While the gate is open this ADR locks no production mobile architecture (09 §1.1); mobile/ work continues as override skeletons (RECOVERY_OVERRIDE_DAY22.md §2).`
- **E9** → `The leader pre-authorised the Spike B part of this deviation (RECOVERY_OVERRIDE_DAY22.md §4); it applies only once Spike A is ACCEPTED. The proposed scope is:`
- **E10**: prefix it with `Proposed, final once the gate closes:`.

**QA note.** A volume-shaped response from the V1 transport (for example, R4) is a V1 defect and not evidence against React Native. Even so, override §3 requires a passing measurement, not an argument. Do not close the gate in (b).

### (c) L4 NOT MEASURED

This covers three cases: no session, `L4 CANNOT_JUDGE` (exit 2), or a capture that fails R5–R8 with no valid rerun.

**Default:**
- **Gate: OPEN.** The rule does not hold, so the leader is asked.
- **ADR: PROPOSED.**
- **Spike A: not ACCEPTED.**

**Default sentences:**
- **E1** → `PROPOSED — 2026-10-01. NFR-PERF-001 limb 2 was not measured in the product app (<session not run / L4 CANNOT_JUDGE / incomplete capture>). Spike A awaits the leader's decision on QA-004 L4 and L5; GATE-MOB-01 stays OPEN.`
- **E2**: as in (b).
- **E3**: unchanged.
- **E4** → `Limb 2: NOT MEASURED — not measurable in Spike A (L4); the product-app session of 2026-10-01 <did not run / returned L4 CANNOT_JUDGE> (<evidence or "no capture">)`
- **E5**: B-2's text, unchanged (L1–L5 open).
- **E6** → `Per-slice requests, never a full volume per gesture (DR-015 limb 2, NFR-PERF-001). Limb 2 is not yet measured in the product app; it is a V1 acceptance condition.`
- **E7** → `` `GATE-MOB-01` stays **OPEN** pending the leader's decision on Spike A (QA-004 L4, L5); L4 was not measured on 2026-10-01. ``
- **E8 to E10**: as in (b).

**Alternative: the leader explicitly adopts QA-004's suggested text (L1–L5).**

*Resulting states:*
- **Gate: CLOSED by the leader's explicit decision, with L4 open.**
- **ADR: ACCEPTED.**

*Sentences:*
- **E1** → `ACCEPTED — 2026-10-01 <HH:MM>, by the leader's explicit decision (not pre-authorised: QA-004). Spike A ACCEPTED-WITH-LIMITATIONS L1–L5; L4 (NFR-PERF-001 limb 2) is carried at design level by Spike E's rejection of whole-volume transfer and by DR-015 limb 2, and stays an open V1 acceptance condition (mobile/S1_L4_SCRIPT.md, Day 23).`
- **E7** → `` `GATE-MOB-01` → **CLOSED** on 2026-10-01 at <HH:MM> by the leader's explicit decision, with L4 open as a V1 acceptance condition. ``
- **E4 to E6**: as in the default (c), with `accepted as a limitation by the leader at <HH:MM>` added.
- **E8 to E10**: as in (a).
- The record should also say what happens if a later L4 run FAILS. **QA recommends** reopening the 2D/transport part.

**Neither branch of (c) may be recorded as "pre-authorised" or as "the rule holds".**

---

## 4 · Verdict

**As written: NOT READY.** B-1 to B-4 are blocking.

**Under outcome (a): READY to close GATE-MOB-01** once all of the following hold:
1. B-1 to B-4 are applied;
2. E1–E10 of §3(a) are filled in with tonight's measured values;
3. the L4 evidence is in a commit: the logcat, the `l4-report.mjs` output, the backend log, and the APK `.build.txt` with the URL redacted. It should be on `main` before the ADR merge, or cited by commit as "not on main yet";
4. the leader's decision text is recorded before 23:59.

**Non-blocking items.** N-1 to N-8 can follow on Day 23. N-1 is recommended in the same edit, because the accepted ADR becomes project truth and would otherwise contradict DR-015.

**Re-check.** A delta check of the edited ADR diff is enough. No evidence needs re-review unless Spike A/B evidence on `main` changes.

**VERDICT: NOT READY AS WRITTEN · READY UNDER OUTCOME (a) AFTER B-1 TO B-4 AND THE (a) EDITS**
