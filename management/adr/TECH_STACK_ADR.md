# TECH_STACK_ADR — mobile framework and runtime stack (ADR-MOB-001)

| Field | Value |
|---|---|
| **Status** | ACCEPTED — 2026-10-01 (Day 22), under the leader's pre-authorised rule in `management/day22/RECOVERY_OVERRIDE_DAY22.md` §4 |
| **Resolves** | `GATE-MOB-01` (DR-G05) — spec `00` §11, `09` §7 |
| **Decided by** | Phạm Tuấn Anh — Team Leader (pre-authorised; QA by CHAT E, an LLM red-team session) |
| **Inputs** | Spike A (`management/spikes/SPIKE_A_2D/RESULT.md`), Spike B (`management/spikes/SPIKE_B_3D/RESULT.md`, PR #44), S7 WebView container (PR #46), DR-006 device profile, DR-003 deployment profile, DR-015 transport direction |
| **Residuals** | Spike B B5/B6/B7/B9/B12/B13 are **V2 acceptance conditions**, measured on the device on 2026-10-01 evening (slot S-1). If B5 fails at every decimation level (`NEGATIVE_RESULT`), **only the 3D-module part** of this ADR is reopened |

## 1 · Target demo device (restated from DR-006; this ADR does not originate it)

Samsung Galaxy A17 5G, model `SM-A176B`, Android 16, SoC `s5e8535`, GPU ARM Mali-G68 (OpenGL ES 3.2, WebGL2
available in the system WebView), 7.29 GiB RAM with a **256 MB per-app Java heap limit**, display refresh 60/90 Hz
switching automatically (every performance measurement records or pins the active refresh rate). Measurements count
only on a **release** build whose timestamp post-dates the last code change.

## 2 · Candidates

| # | Candidate | Prototyped? |
|---|---|---|
| 1 | **React Native / Expo** (JavaScript), native views for 2D, WebGL2 inside `react-native-webview` for 3D | Yes — Spike A (2D + brush) and S7 (WebView container with the Spike B viewer), both on the A17 |
| 2 | Native Android / Kotlin (Canvas/OpenGL ES or Filament for 3D) | No |
| 3 | Pure web client (PWA in the mobile browser) | Partly — the Spike B viewer runs in Chrome; no brush evidence in a browser |

## 3 · Spike evidence

**Spike A — React Native / Expo SDK 57, RN 0.86.3, release builds on the A17**

| Criterion | Result |
|---|---|
| A2 zoom/pan leaves source-mask geometry unchanged | 16/16 source-mask checksums match after real pinch + pan and 13 scripted steps; worst frame gap 44.9 ms |
| A3/A4 brush add/erase touches only intended pixels | 8/8 add and 6/6 erase strokes match an independent oracle |
| **A5 brush mapping after zoom/pan** | **60/60 cases at r = 0 and 60/60 at r = 2, offset (0, 0)** — proposed tolerance 0 source pixels |
| A6/A7 undo/redo | 15/15 and 15/15 hashes match |
| A8 save/reload | 2 cold reloads after force-stop, 16/16 slice checksums each (64×64×16 fixture) |
| **A9 cached slice switch, p95 ≤ 200 ms** | 65.31 ms (64×64×16), 50.23 ms (576×576×16), **98.72 ms (576×576×88 whole cache), 50.84 ms (±3 window)** |
| A10 brush feedback ≤ 100 ms, no lost samples | worst per-stroke 30.48 ms over 123 committed strokes, 0 samples lost (64×64×16 fixture) |
| A11 edit vs navigation gesture separation | 12/12 second-finger interruptions rolled back, 0 strokes committed in multi-touch |
| Limitations | A1 partial (no pixel-level fixture match check); A12 partial (only one candidate built); A8/A10/A11 on the 64×64×16 fixture |

**Spike B — WebGL2 viewer**

| Criterion | Result |
|---|---|
| B1–B4, B8, B14 | Diagnostic PASS on desktop: orbiting viewer with pan; canonical picking 13/13 rays to the exact slice; linked MPR proof of concept |
| **B10/B11 inside the React Native WebView on the A17** | **median 59.88 FPS, longest stall ≤ 16.9 ms**, synthetic level-0 mesh (PR #44) |
| S7 smoke test on the A17 (2026-09-18) | `webgl2: true`, renderer Mali-G68, viewer loaded in 964 ms, 5,648-triangle mesh rendered, orbit and pick responded |
| B5/B6/B7/B9/B12/B13 | Measured on the real mesh tonight (S-1) as V2 acceptance conditions — see Residuals |

## 4 · Decision criteria (`09` §7) and how each is met

| Criterion | Evidence for candidate 1 |
|---|---|
| Pixel-accurate brush correction under zoom/pan | A3–A7 on the device, A5 at 0-pixel offset |
| Stable interactive 3D and 3D→slice mapping | WebGL2 renders inside the RN WebView on the A17 at ~60 FPS; canonical picking exact on fixtures; real-mesh picking measured tonight |
| Development velocity within the 30-day window | The team already ships RN/Expo builds (Spike A, S7); one JavaScript codebase shares `app/core` (framework-neutral `.mjs`) and the Spike B viewer; 8 calendar days remain, so a stack without on-device evidence is not affordable |

## 5 · Decision — the selected stack

| Layer | Choice |
|---|---|
| Mobile app | **Expo SDK ~57.0.21, React 19.2.3, React Native 0.86.3**, JavaScript; top-level `mobile/` (spec `09` §8) |
| Shared client layer | `app/core` — framework-neutral `.mjs` (contract, transport, errors, 7 screen states, view math, selection/comparability readers); stays free of framework imports (CI job `app-framework-neutral`) |
| 2D viewer and brush | Native RN views; zoom/pan/brush math from Spike A via `app/core/viewMath.mjs` (provenance copy) |
| 3D | **react-native-webview 13.16.1** hosting the WebGL2 viewer; chunked WebView→RN messages (S7) |
| Transport | Per-slice requests, never a full volume per gesture (DR-015 limb 2, NFR-PERF-001) |
| Backend | Python + **FastAPI + SQLite** on the Mac mini M2 (DR-003 host) over the ZeroTier overlay; artifacts on disk |
| ML | PyTorch on separate compute hosts (DR-016); results reach the app only through Contract 2 artifacts |

## 6 · Rejected alternatives

- **Native Android / Kotlin**: no spike evidence. It would mean rebuilding the measured 2D/brush work and the 3D viewer in eight days.
- **Pure web client (PWA)**: `10` §1 requires a primary interactive mobile client. The brush evidence exists only on React Native. WebGL is still used, inside the RN WebView.
- **Flutter or other frameworks**: no evidence and no team experience.

## 7 · Consequences and risks

- The 256 MB heap forces per-slice loading and bounded caches. S6 found that a component-level window does not bound image-cache memory, so the cache policy is part of V1 acceptance.
- 3D runs in a WebView. Memory, first-load time and message latency are measured on release builds, with the refresh rate recorded.
- Residual Spike B criteria are V2 acceptance conditions. A `NEGATIVE_RESULT` on B5 reopens only the 3D module choice.
- Dependencies under `mobile/` are added only by the integration owner (one `package.json`, one lockfile).

## 8 · Gate effect

`GATE-MOB-01` → **CLOSED** on 2026-10-01, once Spike A is ACCEPTED under the pre-declared rule. Production mobile modules may now be created under `mobile/`.
