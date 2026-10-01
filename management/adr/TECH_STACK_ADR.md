# TECH_STACK_ADR — mobile framework and runtime stack (ADR-MOB-001)

| Field | Value |
|---|---|
| **Status** | PROPOSED — 2026-10-01 (Day 22). **Not pre-authorised:** QA-004 found that the Spike A rule of `management/day22/RECOVERY_OVERRIDE_DAY22.md` §4 does not hold as written (L4, L5). The leader decides after the S-1 L4 measurement; see §8 |
| **Resolves** | `GATE-MOB-01` (DR-G05) — spec `00` §11, `09` §7 |
| **Decided by** | Phạm Tuấn Anh — Team Leader, by explicit decision (pending). QA: CHAT E, an LLM red-team session, not a human reviewer (QA-004; QA-ADR) |
| **Inputs** | Spike A (`management/spikes/SPIKE_A_2D/RESULT.md`); Spike B (`management/spikes/SPIKE_B_3D/RESULT.md`, PR #44); real-mesh frontier PR #66 (`spikes/spike_b_3d/EVIDENCE_RAW/20261001_real_mesh/`); S7 WebView container (PR #46, draft, not on `main`); DR-006 device profile; DR-003 / DR-003a deployment profile; DR-015 transport direction; QA-004 (`management/day22/QA_REVIEW_004_SPIKE_A.md`); L4 product-app measurement (`spikes/spike_a_2d/EVIDENCE_RAW/l4_product_app_20261001T205817+0700/`, release APK from PR #77 @ `ffbf763`); Spike B S-1 device session (PR #73, `spikes/spike_b_3d/EVIDENCE_RAW/20261001_s1_device/`) |
| **Residuals** | Spike B B5/B6/B7/B9/B12/B13 are **V2 acceptance conditions** (override §4). #66 measured B5, B9 and the B12 geometry columns offline on a real mask. Still to come on the device on 2026-10-01 evening (slot S-1):<br>• B6, B7 and device B9;<br>• FPS and stall per level, for B10/B11 and B12 (≥ 3 levels);<br>• the on-device check of B5's picks;<br>• B13.<br>The reopen trigger for the 3D module is in §8 |

## 1 · Target demo device (restated from DR-006; the release-build rule is DAY20_REBASELINE's; this ADR originates neither)

- **Device:** Samsung Galaxy A17 5G, model `SM-A176B`, Android 16.
- **SoC and GPU:** `s5e8535`, ARM Mali-G68 (OpenGL ES 3.2; WebGL2 available in the system WebView).
- **Memory:** 7.29 GiB RAM, with a **256 MB per-app Java heap limit**.
- **Display:** 60/90 Hz, switching automatically. Every performance measurement records or pins the active refresh rate.

Measurements count only on a **release** build whose timestamp post-dates the last code change.

## 2 · Candidates

| # | Candidate | Prototyped? |
|---|---|---|
| 1 | **React Native / Expo** (JavaScript): native views for 2D, WebGL2 inside `react-native-webview` for 3D | Yes. Spike A (2D + brush) and S7 (the WebView container with the Spike B viewer; PR #46, draft, not on `main`), both on the A17 |
| 2 | Native Android / Kotlin (Canvas/OpenGL ES, or Filament for 3D) | No |
| 3 | Pure web client (PWA in the mobile browser) | Partly. The Spike B viewer runs in a desktop browser (B1, diagnostic). There is no measurement in a mobile browser and no brush evidence in a browser |

## 3 · Spike evidence

**Spike A — React Native / Expo SDK 57, RN 0.86.3, release builds on the A17**

| Criterion | Result |
|---|---|
| A2 zoom/pan leaves source-mask geometry unchanged | 16/16 source-mask checksums match after a real pinch + pan and 13 scripted steps; worst frame gap 44.9 ms |
| A3/A4 brush add/erase touches only intended pixels | 8/8 add and 6/6 erase strokes match an independent oracle |
| **A5 brush mapping after zoom/pan** | **60/60 cases at r = 0 and 60/60 at r = 2, offset (0, 0)**. Proposed tolerance: 0 source pixels |
| A6/A7 undo/redo | 15/15 and 15/15 hashes match |
| A8 save/reload | 2 cold reloads after force-stop, 16/16 slice checksums each (64×64×16 fixture) |
| **A9 cached slice switch p95 ≤ 200 ms; no full-volume transfer per gesture** | **Limb 1 PASS.**<br>• 65.31 ms (64×64×16)<br>• 50.23 ms (576×576×16)<br>• 98.72 ms (576×576×88, whole cache)<br>• 576×576×88, ±3 window, cold start: 100.74 ms all steps, 50.84 ms in-window, 102.73 ms on a miss<br>**Limb 2:** not measurable in Spike A (L4). **Measured PASS in the product app** on the A17 against the real backend, 2026-10-01 20:58 (phone and server clock):<br>• `l4-report.mjs`: L4 PASS (R1–R8); 15 new + 15 revisit gestures; bytes per switch p50 153.5 KB, p95 155.1 KB, max 155.1 KB; 15/15 revisits at 0 bytes<br>• the server request log agrees: 16 switches, max 158,797 B, which is 0.54 % of one raw volume<br>• scope `MRI + ground truth (+ mask bytes) - no analysis run for this case: predictions are not part of this L4`, on CASE_0061<br>• release APK from `ffbf763`, built after the last code change. The first APK, from `0bfaba3`, crashed at start on Hermes (latin1 `TextDecoder`) and was fixed and rebuilt<br>• evidence: `spikes/spike_a_2d/EVIDENCE_RAW/l4_product_app_20261001T205817+0700/` |
| A10 brush feedback ≤ 100 ms, no lost samples | Worst per-stroke 30.48 ms over 123 committed strokes; 0 committed samples lost. Feedback is a JS-side next-frame proxy, so it is a lower bound (64×64×16 fixture) |
| A11 edit vs navigation gesture separation | 12/12 second-finger interruptions rolled back; 0 strokes committed in multi-touch |
| Limitations (QA-004 §5) | **L1** A1 partial (no per-pixel fixture match).<br>**L2** A12 partial (one candidate built).<br>**L3** A8/A10/A11 on the 64×64×16 fixture.<br>**L4** A9 limb 2 not measured in Spike A.<br>**L5** A2–A7 also on the 64×64×16 fixture: exactness bounds, not re-run at cohort size.<br>L4 and L5 are outside the limitations pre-declared in `RECOVERY_OVERRIDE_DAY22.md` §4 |

**Spike B — WebGL2 viewer**

| Criterion | Result |
|---|---|
| B1–B4, B8, B14 | Diagnostic PASS on desktop: an orbiting viewer with pan; canonical picking, 13/13 rays to the exact slice. Also a linked MPR proof of concept (`spikes/spike_b_3d/clinical_poc/`, a local-only diagnostic, not a B criterion) |
| **B10/B11 inside the React Native WebView on the A17** | **Median 59.88 FPS, longest stall ≤ 16.9 ms**, on a synthetic level-0 mesh (PR #44). This does not carry over to the real level-0 mesh, which has 61,424 triangles, about 11× more (#66) |
| S7 smoke test on the A17 (2026-09-18) | `webgl2: true`, renderer Mali-G68, viewer loaded in 964 ms, 5,648-triangle mesh rendered, orbit and pick responded. Recorded on PR #46, still a draft; this evidence is not on `main` yet |
| B5/B9/B12 offline on a real mask (#66) | Only level 0, the undecimated surface (61,424 triangles), keeps every pick within ±1 slice, with 0 no-hits and 0 background navigations. Every vertex-clustering level fails, with errors up to 29–40 slices. FPS and stall per level: NOT MEASURED. Computed offline under the override; the Spike B owner confirms or rejects on Day 23 |
| B6, B7 and device B9; FPS and stall per level for B10/B11 and B12 (≥ 3 levels); the on-device check of B5's picks; B13 | Measured on the device on 2026-10-01 evening (S-1) as V2 acceptance conditions; see Residuals |

## 4 · Decision criteria (`09` §7): status of each

| Criterion | Evidence for candidate 1 |
|---|---|
| Pixel-accurate brush correction under zoom/pan | **MET** (64×64×16 fixture, L5): A3–A7 on the device, A5 at a 0-pixel offset |
| Stable interactive 3D and 3D→slice mapping | **CONDITIONAL — not met yet.**<br>• WebGL2 renders in the RN WebView on the A17 at a 59.88 FPS median on a synthetic 5,648-triangle mesh (#44).<br>• Canonical picking is exact on fixtures (desktop).<br>• On a real mask, only level 0 (61,424 triangles) holds ±1 slice (#66). Its A17 FPS and stall, B6 and B7 are not measured.<br>The 3D module is therefore conditional (§8) |
| Development velocity within the 30-day window | **PARTIAL — single-candidate evidence.** Only React Native / Expo was built (A12 partial, L2; Spike B's B15 note is still due).<br>• The team has built release RN/Expo APKs on the A17 (Spike A; S7 on draft #46).<br>• One JavaScript codebase shares `app/core` and the Spike B viewer.<br>• 8 calendar days remain.<br>This is a measured feasibility record plus a schedule argument, not a comparison between candidates |

## 5 · Decision — the selected stack

| Layer | Choice |
|---|---|
| Mobile app | **Expo SDK 57** (`expo ~57.0.21`; the lockfile resolves 57.0.26, while Spike A measured 57.0.21), **React 19.2.3, React Native 0.86.3**, JavaScript; top-level `mobile/` (spec `09` §8) |
| Shared client layer | `app/core`: framework-neutral `.mjs` (contract, transport, errors, 7 screen states, view math, selection/comparability readers). It stays free of framework imports (CI job `app-framework-neutral`) |
| 2D viewer and brush | Native RN views.<br>• Zoom/pan math: `app/core/viewMath.mjs`, a provenance copy of `spikes/spike_a_2d/app/viewerMath.js` @ `1b362e8`.<br>• Brush math: `app/verticals/v4_review_and_findings/brush.mjs`, a provenance copy of `brushMath.js` @ `e41e78b` |
| 3D | **react-native-webview 13.16.1** (the version in the #44 B10/B11 build, `bfbf2fe` on draft #46), hosting the WebGL2 viewer. WebView→RN messages must be chunked, because logcat cuts lines at 4,095 characters (#44 PROVENANCE). The fix is on draft #46 and has not been re-measured |
| Transport | Per-slice requests, never a full volume per gesture (DR-015 limb 2; `NFR-PERF-001` limb 2 measured PASS in the product app on 2026-10-01, MRI + ground-truth path; see §3 A9). This is ADR-ART-001's direction, provisional per DR-015 until E8/E10 |
| Backend | Python + **FastAPI + SQLite** on the Mac mini M2 (DR-003 host; ZeroTier per DR-003a); artifacts on disk |
| ML | PyTorch on separate compute hosts (DR-016). Results reach the app only through Contract 2 artifacts |

## 6 · Rejected alternatives

- **Native Android / Kotlin:** no spike evidence. It would mean rebuilding the measured 2D/brush work and the 3D viewer in eight days.
- **Pure web client (PWA):** no brush or on-device evidence in a browser. `10` §1 makes the mobile application the primary interactive client, and a PWA would have to meet that with no measurement behind it. WebGL is still used, inside the RN WebView.
- **Flutter or other frameworks:** no evidence. Flutter is not installed on the build machine (Spike A RESULT §A12).

## 7 · Consequences and risks

- **Heap and image cache.** The 256 MB Java heap rules out holding a volume in JS/Java memory. Decoded bitmaps live off-heap (S6: 507 MB PSS with the whole volume resident), and a component-level window does not bound them. Image-cache memory is therefore measured on the A17 in V1's TC-PERF-001 runs (`dumpsys meminfo`). This adds no requirement: PR-CACHE-01 stays SHOULD (DR-015).
- **3D in a WebView.** Memory, first-load time and message latency are measured on release builds, with the refresh rate recorded.
- **Residual Spike B criteria** are V2 acceptance conditions. The reopen trigger for the 3D module is in §8.
- **Dependencies.** Under `mobile/` they are added only by the integration owner (one `package.json`, one lockfile). Each is listed in `mobile/README.md` with its version or version range and its licence; `package-lock.json` pins the resolved versions (PR #77, not yet merged).

## 8 · Gate effect

`GATE-MOB-01` stays **OPEN** until the leader decides on Spike A (QA-004 L4, L5) after tonight's L4 measurement. While the gate is open, this ADR locks no production mobile architecture (`09` §1.1). `mobile/` work (PR #77) continues under the override and is listed for Day 23 revalidation; V2/V3/V4 stay working skeletons (`RECOVERY_OVERRIDE_DAY22.md` §2).

If the gate closes, it is an **early close, and a documented deviation.** `SPIKE_PHASE_STATE.yaml` (`gates_that_must_not_close_early`) requires both Spike A and Spike B to be ACCEPTED, and Spike B is still ACTIVE. The leader pre-authorised the Spike B part of this deviation (`RECOVERY_OVERRIDE_DAY22.md` §4). It applies only once Spike A is ACCEPTED, and the Spike A decision is the leader's explicit one (QA-004). The proposed scope:
- **Final once the gate closes:**
  - the framework (React Native / Expo);
  - the 2D viewer and brush;
  - the shared `app/core`.

  The backend stack (Python + FastAPI + SQLite on the Mac mini M2, #68) is recorded here as the ADR-BE-001 choice by the leader's decision, outside GATE-MOB-01's rule. The transport row is ADR-ART-001's direction from DR-015 limb 2 and stays provisional until E8/E10.
- **Conditional on Spike B:** the 3D module (WebGL2 in `react-native-webview`), until Spike B is ACCEPTED.
- **Reopen trigger:** if Spike B ends `NEGATIVE_RESULT`, only the 3D-module part of this ADR is reopened; the React Native choice for 2D stands. `NEGATIVE_RESULT` means no decimation level meets both B5 ≤ ±1 slice and B10/B11 on the A17 (`SPIKE_PHASE_STATE.yaml` `negative_result_rule`).
  - Override §4 names the case "B5 fails at every level". On #66's evidence B5 holds only at level 0, so the deciding test (S-1, 2026-10-01 evening) is B10/B11 for level 0 (61,424 triangles).
  - This trigger reopens in more cases than the override's literal wording, and never in fewer.
