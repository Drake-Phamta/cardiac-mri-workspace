# TC-TEAM-001 evidence package — Vũ Hùng Anh / V2

| Field | Value |
|---|---|
| Member | Vũ Hùng Anh |
| Owned vertical | V2 — 3D Inspector / Spatial Error |
| Technical block | Imaging, reconstruction and canonical 2D↔3D geometry |
| Secondary reviewer | Phạm Tuấn Anh for V2; Nguyễn Gia Đức Trung reviews Spike B |
| Prepared | 2026-09-18 (Day 9) |
| Updated | 2026-10-03: owner-delegated Day 23 revalidation; S-1's real-mesh result is added separately from the 2026-09-18 synthetic-mesh B10/B11 session |
| Package status | **IN PROGRESS — not a TC-TEAM-001 PASS** |

This package indexes the six evidence items required by `10` §10 for V2. It
distinguishes the product source-image workbench from the still-unavailable
3D artifact renderer, and target-device observations from desktop or fixture
diagnostics.

## 1. Requirement and use-case ownership

V2 owns `SCR-05` 3D Inspector and the spatial flow
`UC-06 ↔ UC-07 ↔ UC-08 ↔ UC-09`.

| Product requirement | Functional requirements | Use case | Acceptance test |
|---|---|---|---|
| `PR-3D-01` | `FR-3D-001` reconstruction with provenance | UC-06 | `TC-3D-001` |
| `PR-3D-02` | `FR-3D-002` rotate, zoom, pan | UC-06 | `TC-3D-002`, `TC-PERF-002` |
| `PR-3D-03` | `FR-3D-003/004`: 2D slice → 3D plane | UC-07 | `TC-3D-003` |
| `PR-3D-04` | `FR-3D-005/006`: 3D selection → 2D slice | UC-08 | `TC-3D-004` |
| `PR-3D-05`, `PR-ERR-03` | `FR-3D-007/008`: 3D error → source slice(s) | UC-09 | `TC-3D-005` |

The spatial rule is `geometry_contract_version` `dr008a-dr012/v1.0.0`: a 3D
point returns to a source slice by declared geometry, never by camera pose or
screen-coordinate heuristics. Canonical fixtures require an **exact** slice;
real decimated mesh has the separately frozen `±1`-slice ceiling.

## 2. SCR-05 design artifact

```text
SCR-05 · 3D INSPECTOR
┌─────────────────────────────────────────────┐
│ Case / run / mask variant · geometry version │
│ [Prediction] [Ground truth] [Error]          │
│                                             │
│              segmented LA mesh               │
│       touch: orbit · pinch: zoom             │
│       two fingers: pan                       │
│ ───── linked axial slice plane / marker ─── │
│                                             │
│ Selected: voxel x,y,z · slice k              │
│ [Open slice k in SCR-03]                     │
│ source mask · reconstruction method/version  │
└─────────────────────────────────────────────┘
```

The active 2D slice is a physical plane/marker from the source transform. A
pick shows only the slice index that resolves; an invalid/background pick does
not navigate. Error mode appears only with ground truth and labels its
prediction/reference IDs and FP/FN/overlap semantics.

| State | Required V2 behavior |
|---|---|
| Loading | Disable interaction while mesh and provenance load |
| No reconstruction | State that the artifact is absent; render no placeholder surface |
| Processing | Show reconstruction progress without freezing the app |
| Invalid geometry/version | Block rendering and expose a safe diagnostic/reference ID |
| No ground truth | Allow prediction 3D; make error mode unavailable with an explanation |
| Recoverable failure | Offer retry; do not retain stale spatial mapping |
| Ready | Show source identity, variant, geometry version and linked selection |

Portrait prioritizes the mesh and compact controls. Landscape may widen the
metadata/pick panel. Labels and state text carry meaning independently of
surface color.

## 3. Architecture, API and data interaction

```text
validated prediction / ground-truth mask + geometry
                         │
                         ▼
      reconstruction method → mesh + source-mask provenance
                         │
                         ├────► V2 SCR-05 / Spike B viewer
                         │          ├── 3D pick → slice k → SCR-03
geometry contract ───────┘          └── active slice k → 3D plane
                                     ▼
                          optional error reconstruction
                          (only with compatible ground truth)
```

The API direction is `GET /analysis-runs/{run_id}/reconstruction` with explicit
`source_mask_id`, returning mesh reference, exact source mask, geometry
version, reconstruction method/version and mesh-to-world transform. Optional
error data comes from `GET /analysis-runs/{run_id}/error-reconstruction` with
explicit prediction variant and is unavailable without compatible ground truth.
A client-side or API resolver must pass the same geometry fixtures.

`ADR-ART-001` and the final mobile stack remain open. PR #46 is a WebView
measurement transport for `GATE-MOB-01`, not the V2 technology decision.

## 4. Implementation PR and commit evidence

| Artifact | Contribution | State |
|---|---|---|
| PR #30, `e0a9d61` | WebGL2 diagnostic viewer; rotate/zoom/pan and canonical pick display | merged |
| PR #38, `54347ba` | linked MPR POC; 2D slice message drives 3D plane | merged |
| PR #43, `9a85a1c` | geometry contract checker recomputes points and 13 picking rays | open, CI green, reviewer disposition pending |
| PR #44 | 30-second frame probe, WebView bridge/HTTP fallback and operator protocol | open, reviewer disposition pending |
| PR #46, `30e560e` | RN WebView container that runs the viewer on A17 | draft; hardware-WebGL smoke evidence exists |
| `mesh/build_mesh.py` | deterministic synthetic mask, voxel-face mesh, four decimation levels | diagnostic only |
| `harness/picking_error.py` | independent DDA source-mask ground truth for decimation error | diagnostic only |

Day 23 branch `hung-anh/day23-full-followup` implements a product-data SCR-05
source-image workbench: it uses `useCall` for case/run/slice/reconstruction
references, selects the RAW or PROCESSED mask explicitly, loads MRI and mask
bytes through the checksum-verifying runtime stores, and opens the chosen
source slice in SCR-03. The 2D control does not claim to move a 3D plane.

The 3D renderer is intentionally unavailable under Contract 1.1.0: the API
returns a mesh ID but not checksum-addressed mesh bytes or the face-to-slice
map. The screen reports this contract gap rather than drawing a synthetic or
inferred heart. Contract 1.2.0 is proposed in
`management/spikes/SPIKE_B_3D/CONTRACT_1_2_PROPOSAL.md` and awaits architecture
owner approval. The package remains `IN PROGRESS`.

## 5. Test and evidence record

| Test | Current evidence | Status / limit |
|---|---|---|
| `TC-MAINT-002` | `conformance.py` recomputes canonical points and all 13 rays; CI is green on #43 | contract ready; #43 still awaits disposition |
| `TC-3D-001` | `mesh_levels.json` records fixture geometry/version and OBJ level | synthetic only; no validated patient mask |
| `TC-3D-002` | viewer has orbit/pan/zoom; A17 WebView smoke reports hardware WebGL2/Mali-G68 | `TC-PERF-002` **partial**: observed on the spike viewer (B10/B11 below, synthetic level 0); the SCR-05 product screen is **NOT MEASURED** |
| `TC-3D-003` | `set-slice-world-z` changes source-coordinate plane band | POC, no integrated SCR-03 test |
| `TC-3D-004` | canonical point/picking tests resolve fixture slice exactly | viewer displays a slice; product navigation is absent |
| `TC-3D-005` | — | **NOT STARTED**; needs TP/FP/FN fixture, Spike F and DR-005 |
| SCR-05 source review | `mobile/src/verticals/v2/Inspector3DScreen.js`; 95 render-smoke checks cover checksum-verified MRI/mask, mask visibility, correct reconstruction query, slice/variant changes, and navigation to SCR-03 | **IMPLEMENTED, logic smoke only**; no local clinical volume is available, and A17 device test plus MPR/3D linkage remain unmeasured |
| B14 diagnostic | four synthetic levels and DDA-vs-mesh ray checks retain contract groups | desktop/synthetic; cannot decide DR-008c |
| B10/B11 | Three A17 WebView probe runs on 2026-09-18; raw `webview_probe_payloads.jsonl` sha256 `125417809c…508e`; QA re-derived every summary field from all 5,400 frame intervals (median 59.88 FPS, longest stall 16.90 ms) | **OBSERVED PASS** — owner interpretation in `RESULT.md`; one A17 session; synthetic level 0 only; an embedded 360×225 CSS px panel; requestAnimationFrame at 60 Hz on a 90 Hz display, so 59.88 FPS is the ceiling. Not reviewer-approved when written. Levels 1–3 and a real mesh are **NOT MEASURED** |
| S-1 B10/B11 | Three Galaxy A17 runs on the `CASE_0059` L0 mesh (61,424 triangles); 59.88 FPS median, 17 ms longest stall | **PASS for the pre-declared Spike B gate at L0 only**; one case/device/session; raw coordinates/logcat remain outside git. It is separate from the 2026-09-18 synthetic session |

Before V2 acceptance: build a real reconstruction from a validated mask; test
both linkage directions in one mobile build after rotate/zoom; run
`TC-PERF-002` on A17 with raw provenance; and add the error fixture plus
contributing-slice navigation test.

## 6. Demo and defense notes

`H6` opens SCR-05 and demonstrates rotate, zoom and pan on the demo device.
The defense pairs target-device performance evidence with visible source mask,
reconstruction method and geometry version.

`H7` changes a 2D slice to move the exact 3D plane, then selects a known 3D
point/error region and opens the matching source slice. Proof is the declared
transform and canonical test, not visual resemblance. A background pick stays
put; an inference-only case says error data is unavailable.

Open risks remain explicit: a real mask can change decimation/picking results;
the product screen has only render-smoke evidence; the 3D artifact/API integration,
two-way spatial link, and A17 validation remain open; `DR-005`, `ADR-ART-001`
and the final mobile stack stay open. `DR-008c = L0` is adopted for the tested
Spike B case under the Day 22 pre-declared rule.

## Completion checklist

- [x] Requirement and UC trace for `SCR-05`
- [x] UI design artifact and state design
- [x] Architecture/API/data/provenance explanation
- [x] Implementation PR and commit index
- [x] Test evidence with limits stated
- [x] H6/H7 demo and defense mapping
- [x] SCR-05 source-image workbench implemented on Day 23 branch; mesh view remains gated on API 1.2
- [ ] Real-mask provenance and two-way mobile linkage tests
- [ ] `TC-3D-005` 3D error implementation/test
- [ ] A17 `TC-PERF-002` raw evidence and interpretation — partial: spike-viewer B10/B11 at synthetic level 0 observed (PR #44); the product screen and levels 1–3 are not measured
- [ ] Secondary reviewer approval

**Related:** `management/onboarding/member_briefs/VU_HUNG_ANH.md` ·
`spikes/spike_b_3d/README.md` · `spikes/spike_b_3d/MEASUREMENT_B10_B11.md` ·
`management/DEMO_STANDARD.md` H6–H7 · PR #30, #38, #43, #44, #46.
