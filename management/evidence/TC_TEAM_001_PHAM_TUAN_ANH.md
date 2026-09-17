# TC-TEAM-001 evidence package — Phạm Tuấn Anh / V1

| Field | Value |
|---|---|
| Member | Phạm Tuấn Anh (team leader, Project Control operator) |
| Owned vertical | V1 — Case Explorer / 2D MRI Inspector **and** Error Inspector |
| Technical block | Mobile 2D viewer, overlay and error investigation; device measurement |
| Secondary reviewer | Vũ Hùng Anh |
| Prepared | 2026-09-18 (Day 9) |
| Package status | **IN PROGRESS — not yet a TC-TEAM-001 PASS** |

`SCR-04` joined this vertical on 2026-09-18 by decision `DR-013a`; before that it had no owner. The package therefore
covers two screens, and it says plainly which parts are measured on a device, which are designed only, and which are
not started. Spike A is a **feasibility spike, not the product**: its numbers bound what the mobile implementation may
promise, they are not an implementation of it.

---

## 1. Requirement and use-case ownership

The owned mobile function is *inspect one case slice by slice, then understand where the prediction is wrong*.

| Layer | Identifiers |
|---|---|
| Product requirements | `PR-MRI-01` (MUST), `PR-PRED-01` (MUST), `PR-ERR-01` (MUST), `PR-ERR-02` (MUST), `PR-MOBILE-01`, `PR-MOBILE-03` |
| Functional | `FR-MRI-001`…`FR-MRI-007`, `FR-MASK-001`, `FR-MASK-003`, `FR-MASK-005`, `FR-ERR-001`, `FR-ERR-002`, `FR-ERR-003` |
| Non-functional | `NFR-PERF-001` (cached slice switching, 200 ms p95 over 30 steps) |
| Use cases | `UC-03` inspect volume slice by slice · `UC-04` inspect prediction overlay · `UC-05` investigate segmentation error |
| Screens | `SCR-03` Case Explorer / 2D MRI Inspector · `SCR-04` Error Inspector |
| Tests | `TC-MRI-001`…`003`, `TC-MASK-001`, `TC-MASK-003`, `TC-ERR-001`…`003`, `TC-PERF-001`; `TC-MOBILE-STATE-001` for the state matrix in §2.3 |

Two rules govern the whole vertical and appear again in every section below:

1. **The overlay may never be stretched independently of the MRI geometry** (`FR-MASK-005`). Alignment comes from the
   geometry contract, not from view code.
2. **An absent artifact is unavailable, never zero.** `SCR-04` exists only where ground truth exists, and the UI must
   say so rather than render an empty error chart (`10` §7).

---

## 2. UI design artifact

Technology-neutral: `GATE-MOB-01` is still open, so nothing here assumes React Native, Flutter or native Kotlin.

### 2.1 SCR-03 — Case Explorer / 2D MRI Inspector

```text
┌────────────────────────────────────────────────┐
│ ← CASE_0043 · de-identified                    │
│ run: unet_base16 · 100% · prediction: raw ▾    │  active run and variant, never silent
│────────────────────────────────────────────────│
│                                                │
│              [ MRI slice image ]               │  pinch zoom · pan
│              [ overlay layers   ]              │  prediction / ground truth / reviewed
│                                                │
│────────────────────────────────────────────────│
│ ◀  slice 44 / 88  ▶      [────────●────────]   │  slider + swipe, both deterministic
│ overlay  [pred ■] [GT ■] [reviewed ■]  α ─●──  │  toggles + opacity (FR-MASK-001/003)
│ dice 0.82 · N=88 slices · geometry ✔ validated │  metrics only when valid
│ [ 3D ]   [ error inspector ]   [ review ]      │  entries; error greyed without GT
└────────────────────────────────────────────────┘
```

### 2.2 SCR-04 — Error Inspector

```text
┌────────────────────────────────────────────────┐
│ ← error · CASE_0043 · run unet_base16 · raw    │
│────────────────────────────────────────────────│
│              [ slice with error classes ]      │
│                                                │
│ legend: ▨ agreement   ▤ false positive         │  hatch + label, not colour alone
│         ▩ false negative   (prediction vs GT)  │
│────────────────────────────────────────────────│
│ per-slice error                                │
│  ▁▂▅█▆▃▂▁▁▂▃▇█▅▂▁   worst: slice 61           │  tap a bar → that slice
│ [ jump to worst ]  [ next problematic ]        │
│ FP 1 284 px · FN 902 px · dice 0.78 (slice)    │
│ ⚠ patient-level separation not verifiable;     │  the DR-002b limitation travels
│   case-level disjointness + r ≥ 0.75 screen    │  with every error number
└────────────────────────────────────────────────┘
```

**"Worst slice" is not a UI invention.** The definition was frozen on 2026-09-17 (`OPEN_DECISIONS`, resolving `RA-H09`
and `RA-M13`) and this screen implements exactly it:

| Order | Key | Direction |
|---:|---|---|
| 1 | per-slice Dice | ascending |
| 2 | FP+FN voxel count | descending |
| 3 | `slice_index` | ascending |

Only slices with **non-empty ground truth** are ranked. Both-empty `NOT_APPLICABLE` slices are excluded, and FP-only
background slices — empty ground truth, non-empty prediction — are surfaced in a **separately labelled** list rather
than in the primary ranking, because under `07` §6 they score Dice 0 and would otherwise outrank genuine anatomical
failures and send the demo to an uninformative slice. **The selection comes from the API; the client never re-derives
it**, so two builds cannot disagree about which slice is worst.

Design rationale:

- the active run **and** prediction variant sit in the header of both screens, because `TC-MRI-003` fails the moment a
  previous run's overlay can still be read as current evidence;
- error classes carry a hatch pattern and a word, not colour alone (`10` §9), and the legend names the reference and
  the prediction it was derived from (`TC-ERR-002`);
- the per-slice error strip is the navigation control itself, so "jump to the worst slice" is one gesture (`FR-ERR-003`,
  demo hook `H4`);
- entries to 3D and review live on `SCR-03`, so the investigation flow of `TC-E2E-001` never needs a back-and-forth
  through a menu;
- the `DR-002b` limitation line is part of the screen, not a footnote in a report, because the error numbers are the
  ones a viewer is most likely to over-read.

### 2.3 State matrix for both screens (`10` §8)

| State | SCR-03 shows | SCR-04 shows | Trigger from the API contract (`11`, merged in #45) |
|---|---|---|---|
| loading | skeleton slice frame, index known, no metrics | skeleton strip, no numbers | request in flight |
| empty / unavailable | "no prediction for this run" with the MRI still usable | **"ground truth unavailable — error inspection not possible"**, entry disabled on SCR-03 | `GROUND_TRUTH_UNAVAILABLE`, `ARTIFACT_NOT_FOUND` |
| processing | banner "analysis running", viewer stays interactive | strip greyed, banner repeated | `RUN_NOT_SUCCEEDED` while a run is queued |
| success | slice, overlays, metrics, geometry mark | classes, per-slice strip, metrics | 200 |
| recoverable error | inline reason + **Retry**, last good slice kept | same | `ANALYSIS_FAILED`, network timeout |
| fatal / invalid data | visualization **blocked**, diagnostic ID shown | blocked with the same ID | `GEOMETRY_NOT_VALIDATED`, `GEOMETRY_MISMATCH` |
| out of range | slider clamps, index unchanged | strip ignores the entry | `SLICE_OUT_OF_RANGE` |
| stale cached content | version-mismatch bar + **Refresh**, never a silent mix | same bar | revision changed under a cached artifact |
| offline / unreachable | cached slices stay usable, writes blocked | strip read-only from cache | transport failure |

`TC-MOBILE-STATE-001` is satisfied only when each row above has a test; today none of them does — see §5.

---

## 3. Architecture, API and data interaction

V1 consumes, and never defines, the contracts owned by other blocks.

| Need | Endpoint (API Contract `11`, merged `dd5a569`) | Errors that shape the UI |
|---|---|---|
| slice image | `GET /api/v1/cases/{case_id}/slices/{slice_index}/mri` | `CASE_NOT_FOUND`, `SLICE_OUT_OF_RANGE`, `GEOMETRY_NOT_VALIDATED` |
| ground truth layer | `.../slices/{slice_index}/ground-truth` | `GROUND_TRUTH_UNAVAILABLE`, `GEOMETRY_MISMATCH` |
| prediction layer | `GET /api/v1/analysis-runs/{run_id}/slices/{slice_index}/prediction?variant=` | `RUN_NOT_SUCCEEDED`, `GEOMETRY_MISMATCH` |
| per-slice metrics | `.../slices/{slice_index}/metrics?prediction_variant=` | `ANALYSIS_FAILED`, `GROUND_TRUTH_UNAVAILABLE` |
| error classes | `.../slices/{slice_index}/error?prediction_variant=` | same, plus `ARTIFACT_NOT_FOUND` |
| geometry | `GET /api/v1/cases/{case_id}/geometry` | `GEOMETRY_NOT_VALIDATED` |

Data direction, already decided and binding on this vertical (`DR-015`, decided 2026-09-17, both limbs):

- **Whole-volume transfer is excluded**, measured at p50 338,9 s and 121,4 s, and because per-gesture full-volume
  traffic is precisely what `NFR-PERF-001` forbids.
- **The per-slice endpoint is the V1 direction**, best measured on the acceptance path.
- **The tested prefetch window is rejected** — p95 28 606 ms and 6 181 ms, slower than no prefetch at all — while the
  idea itself is not excluded. V1 ships no prefetch code on that basis.
- **A versioned artifact URL is still open**; `11` §2 permits it and Spike E measured nothing either way.
- **`PERF-FIRSTLOAD-01` will become binding with `TC-PERF-FIRSTLOAD-01`**, and its figure belongs to the Spike E owner,
  not to this package and not to the leader.
- **The worst-slice selection is returned by the API**, per the frozen definition in §2.2.
- **The geometry contract version is `dr008a-dr012/v1.0.0`** (`DR-013`, geometry block). Every overlay request carries
  it, and a mismatch is a fatal state, not a warning.
- The mask variant (`raw` / `processed` / `reviewed`) is part of every request and of the screen header; no endpoint may
  substitute one for another silently.

---

## 4. Implementation PR and commit evidence

| Artifact | Where | State |
|---|---|---|
| Spike A viewer, slice navigation, zoom/pan, `A2` evidence | PR #27 | **merged**, approved; the `A2` raw evidence is on `main` under `spikes/spike_a_2d/EVIDENCE_RAW/` |
| Spike A brush stage `S5` (`A3`–`A7`) | PR #31 | open, re-review pending |
| Spike A `S6`: `A9` at `576×576×88`, two cache policies, memory correction | PR #41 | open, review pending |
| WebView container that hosts the Spike B viewer inside the same app | PR #46 (draft), commit `30e560e` | opened 2026-09-18 01:20, smoke-tested |
| API contract consumed by V1 | `dd5a569` on `main` | merged |
| Ingestion contracts 1 and 2 | `c44ee31`, `7363a6a` on `main` | merged |
| Geometry contract `dr008a-dr012/v1.0.0` | PR #43 | changes requested |
| **V1 mobile implementation** | — | **not started**; M5 opened today, and the vertical is built against synthetic fixtures while `GATE-MOB-01` is open |

This row is the honest centre of the package: **there is no V1 implementation PR yet.** Everything above is either a
feasibility spike on the target handset or a contract this vertical will consume.

---

## 5. Test and evidence record

Measured on the declared demo device: Galaxy A17 5G (`SM-A176B`), Android 16, release builds, screen on, charging.

| Test | State | Evidence | What is still missing |
|---|---|---|---|
| `TC-PERF-001` / `NFR-PERF-001` | **measured, threshold met, half the criterion open** | `A9` at `576×576×88`, three release runs, one variable between them: whole cache p95 **98,72 ms** (30/30 hits); window ±3 from a truly cold start p95 **50,84 ms** in window (22/30) and **102,73 ms** on the 8 misses. Ceiling is 200 ms. Two independent window runs agree to **0,21 ms**. Fields machine-generated, PR #41 | the second half of `A9` — *no full-volume request per gesture* — is `NOT MEASURED`: the spike reads a local fixture and has no transport |
| `TC-MASK-001` overlay alignment | **partial** | `A2` `OBSERVED` 14/09: source-mask checksums **16/16** unchanged before any gesture, after 4 real gestures, and after 13 automated zoom/pan steps, recomputed independently from the fixture; touch→pixel mapping **60/60** fixture cases | this proves the source geometry survives the view transform. Overlay *rendering* alignment against the geometry contract fixtures is untested |
| `TC-MRI-001` slice correctness | **partial** | `n / total` correct, 16 slices navigable | exact pixel match untested: the spike's image widget interpolates bilinearly and exposes no nearest-neighbour option, so the comparison must happen at the data layer |
| `TC-MRI-002` navigation and gestures | **partial** | the 30-step navigation is driven deterministically by the harness; pinch, pan and tap coexist without a gesture library | gesture-mode separation during brush editing (`A11`) is `NOT MEASURED` |
| `TC-MRI-003` run/case synchronization | **not started** | — | the spike has one fixture case and no run concept |
| `TC-MASK-003` overlay controls | **not started** | — | toggle and opacity exist in the spike UI but are not tested against mask geometry |
| `TC-ERR-001` error-class derivation | **not started** | — | needs the synthetic TP/FP/FN fixture set; the geometry block holds `tests/fixtures/**` |
| `TC-ERR-002` visualization semantics | **not started** | — | legend design exists in §2.2 only |
| `TC-ERR-003` error → evidence navigation | **not started** | the ranking it must assert against is frozen (§2.2) | depends on per-slice metrics from a real run, and on the API returning the selection rather than the client deriving it |
| `TC-MOBILE-STATE-001` | **not started** | state matrix designed in §2.3 | every row needs a test |

### The memory finding this vertical must design around

`S6` measured what a bounded cache actually buys on the target device:

| | whole volume (88) | window ±3 | difference |
|---|---:|---:|---:|
| bitmap memory | 135,90 MB | 84,69 MB | **−38 %** |
| TOTAL PSS | 507,32 MB | 411,19 MB | **−19 %** |
| p50 slice switch | 50,45 ms | 49,40 ms | ≈ 0 |

Per slice that is **1,54 MB** at `576×576`, against a theoretical `ARGB_8888` bitmap of 1,27 MB — the two independent
measurements agree, and they replaced an earlier extrapolation of 4,3 MB/slice that was wrong by 2,8×.

**The window does not bound memory.** Run 3 started cold with four slices held (7,39 MB) and still reached 84,69 MB of
bitmaps after 30 steps, about 46 slices' worth, because the image cache keeps every bitmap it has decoded regardless of
what the view unmounts. For V1 this means a component-level window is not a memory design; the **image cache itself**
must be bounded. That is a platform setting on the chosen image pipeline, deliberately **not** a cache subsystem:
`DR-015` keeps `PR-CACHE-01` at `SHOULD` and states that a first-load budget is a budget, not a mandate to build one
in V1.

---

## 6. Privacy and data considerations

- No dataset bytes, no per-file restricted hashes and no per-pair correlation scores enter this repository or this
  vertical's artifacts; `SCR-03` and `SCR-04` display case identifiers that are already de-identified in the source.
- `SCR-04` carries the `DR-002b` limitation on screen: patient-level separation is not verifiable for this release, and
  the safeguard is case-level disjointness plus the `r ≥ 0.75` correlation screen with its declared exclusions.
- Ground truth is gated: the error inspector cannot be entered, and its metrics cannot be requested, when
  `GROUND_TRUTH_UNAVAILABLE` applies (`TC-MODE-001`, `TC-MASK-002`).
- Measurement evidence committed by this vertical (`EVIDENCE_RAW/*.json`, logcat, screenshots) contains device and
  timing data only. The `S7` WebView probe in PR #46 records the WebView's GL capabilities, nothing about a patient.

---

## 7. Demo and defense notes

| Hook | What the viewer will do | What V1 must survive |
|---|---|---|
| `H3` | open the Case Explorer | de-identified ID, capability, `slice n / total`, active run **and** variant visible at a glance |
| `H4` | navigate to the problematic slice | slice switching feels instant — the measured basis is `A9` **50,84 ms** p95 in window, **98,72 ms** whole cache, both against a 200 ms ceiling — and *jump to worst* lands on the right slice |
| `H5` | compare prediction, ground truth and error | overlays stay aligned **through zoom and pan**, and the legend explains every error class without relying on colour |

Defensible answers already earned: the slice-switch numbers come from a release build with a single variable between
runs and every field machine-generated; the memory figure is a measurement that **replaced** an earlier wrong
extrapolation, and the record says so; and the honest gap — no transport, so *no full-volume request per gesture* is
unproven — is written here rather than left for a question.

---

## 8. Shared-core readiness

- Contracts this vertical consumes are on `main`: ingestion 1 (`c44ee31`), ingestion 2 (`7363a6a`), API `11` (`dd5a569`).
  The geometry contract is still in PR #43.
- `GATE-MOB-01` is open. This package names no framework as the decision; PR #46 is a **measurement direction** — the
  Spike B viewer inside a WebView of the Spike A shell — and `TECH_STACK_ADR.md` stays unwritten until both spikes are
  accepted.
- V1 will be built against generated fixtures from the accepted API contract, not hand-written mocks (`11` §11.4).

## 9. Completion checklist

- [x] Requirement, use-case and screen ownership traced to frozen identifiers
- [x] UI design artifact for both owned screens
- [x] State matrix per `10` §8, mapped to real error codes of the merged API contract
- [x] Architecture and data direction recorded with the decisions that bind them
- [x] Device evidence for the performance criterion, with its limits stated
- [x] Privacy considerations, including the `DR-002b` limitation on screen
- [x] Demo and defense mapping for `H3`–`H5`
- [ ] Implementation PR for V1 — **not started**, M5 opens today
- [ ] `TC-MRI-003`, `TC-MASK-003`, `TC-ERR-001`…`003`, `TC-MOBILE-STATE-001` executed
- [ ] `TC-PERF-001` second half: no full-volume request per gesture
- [ ] Reviewer `APPROVE` on this package

**Related:** `management/spikes/SPIKE_A_2D/RESULT.md` (PR #41) · `management/readiness/OPEN_DECISIONS.md` → `DR-013a`,
`DR-015` · `management/DEMO_STANDARD.md` `H3`–`H5` · PR #27 · #31 · #41 · #43 · #46
