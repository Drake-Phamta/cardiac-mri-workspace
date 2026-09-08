# 10 — MOBILE UX AND INTERACTION SPECIFICATION

**Status:** Frozen v1.0  
**Depends on:** `00`–`09`

---

## 1. Mobile role

The mobile application is the primary interactive research client. It must demonstrate actual scientific interaction, not merely display pre-rendered dashboard screenshots.

---

## 2. Core navigation structure

Proposed information architecture:

```text
Study Overview
├── Cases
│   └── Case Explorer
│       ├── 2D MRI Inspector
│       ├── Error Inspector
│       ├── 3D Inspector
│       └── Review / Correction
├── Experiments
│   └── Experiment Comparison
└── Findings
```

Exact navigation components depend on the selected framework but must preserve this mental model.

---

## 3. Screen specifications

### SCR-01 — Study Overview
Displays:

- study name/dataset;
- case count;
- available experiments;
- high-level comparable metrics;
- outlier entry points;
- findings summary.

Actions:

- open cases;
- open experiments;
- open outlier case;
- open findings.

### SCR-02 — Case List
Displays de-identified case IDs and mode capability.

Minimum actions:

- select case;
- simple search/filter or sorted list as feasible;
- identify evaluation vs inference-only cases.

### SCR-03 — Case Explorer / 2D MRI Inspector
Displays:

- current slice image;
- slice `n / total`;
- active analysis run/model and whether the run is precomputed or newly executed when applicable;
- active prediction variant (`raw`, `processed`, or `reviewed`) with no silent switching;
- overlay controls;
- metrics summary when valid;
- entry to 3D/error/review.

Gestures:

- swipe/slider slice navigation;
- pinch zoom;
- pan;
- gesture-mode separation during brush editing.

### SCR-04 — Error Inspector
Available only with ground truth.

Displays:

- prediction vs ground truth disagreement;
- per-slice metrics/error amounts;
- jump-to-worst/problematic slice;
- entry to 3D error view.

### SCR-05 — 3D Inspector
Displays reconstructed LA and optional error representation.

Gestures:

- rotate;
- zoom;
- pan;
- select valid point/region.

Linked behaviors:

- active 2D slice updates 3D plane/position;
- 3D selection navigates to 2D slice;
- error region links to contributing slice(s).

### SCR-06 — Review / Correction
Displays:

- source prediction mask;
- current working reviewed mask;
- brush toolbar;
- review state;
- save/cancel.

Tools:

- add;
- erase;
- brush size;
- undo;
- redo;
- reset.

Critical UI rule: user must be able to distinguish raw prediction from unsaved/saved reviewed mask.

### SCR-07 — Experiment Comparison
Displays:

- UNet vs DINOv2 comparison;
- 25/50/100% data settings;
- aggregate metrics/distribution/trend;
- case evidence links.

### SCR-08 — Findings
Displays findings with evidence context and status. Opening a finding navigates to the strongest available evidence location.

---

### SCR-09 — Analysis Run Status (SHOULD; only if `PR-AN-01` is implemented)

Displays:

- selected frozen model/experiment configuration;
- run status (`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`);
- retry action for recoverable failure;
- explicit distinction between a live/new run and previously computed experiment artifacts.

The screen/state must not fabricate progress percentages if the backend does not provide meaningful progress.

## 4. Overlay controls

Minimum selectable layers when available:

- MRI only;
- prediction;
- ground truth;
- error view;
- reviewed mask.

Avoid showing every layer simultaneously if it harms interpretability. The UI may use mutually exclusive modes for error/ground-truth/prediction combinations.

---

## 5. Brush interaction specification

### Gesture-mode rule
When correction mode is active, one-finger drag edits the mask; navigation/pan must use an explicit mode or multi-touch gesture so accidental edits do not occur.

### Coordinate rule
Touch coordinates must pass through the inverse display transform to source mask pixels. Zoom/pan cannot alter the semantic pixel location of an edit.

### Save rule
Saving creates a new immutable reviewed-mask version. Cancel discards unsaved session changes. Reset restores the working buffer from the exact declared source mask. **Ground truth is never a default editable source and must not be copied into a reviewed mask as if it were a user correction.** The UI must show the source mask identity/variant before save.

---

## 6. 2D↔3D linked navigation UX

### 2D → 3D

- Changing slice updates a visible plane/marker in 3D.
- The link must be deterministic and stable after 3D rotation/zoom.

### 3D → 2D

- Selecting a valid surface/error point resolves to a slice.
- App navigates to that slice and highlights the corresponding projected location/context when the transform can resolve it reliably; if only the slice index is reliable, the UI must not invent a more precise pixel highlight.
- Invalid/background selections produce no misleading navigation.

---

## 7. Error visualization UX

The UI should explain the semantic meaning of error categories with a compact legend. The final visual color palette is a UI decision, but categories must remain unambiguous.

When no ground truth exists, the UI must show a clear unavailable state rather than empty charts that imply zero error.

---

## 8. Mobile state model

Every core screen/operation must define:

- loading;
- empty/no artifact;
- processing;
- success;
- recoverable error;
- retry;
- offline/unreachable backend behavior where relevant.

Long-running analysis must not freeze the UI.

Core state acceptance:

- `loading`: initial metadata/artifact request is pending;
- `empty/unavailable`: artifact is legitimately absent (e.g., no ground truth);
- `processing`: asynchronous analysis/reconstruction is running;
- `recoverable error`: safe reason + retry;
- `fatal/invalid data`: block misleading visualization and expose diagnostic/reference ID;
- stale cached content must show version mismatch and refresh rather than silently mixing runs.

---

## 9. Accessibility/usability considerations

- controls large enough for touch;
- avoid precision-only tiny targets for critical editing;
- landscape mode may be supported for detailed inspection;
- legends/metrics should not depend on color alone where practical;
- destructive actions require clear confirmation where data loss could occur.

---

## 9.1 Target demo device and UX acceptance

`TECH_STACK_ADR.md` must declare at least one target demo device/emulator profile (OS/version, screen class, relevant GPU/CPU class). NFR performance and the 5-run canonical smoke test are evaluated against this declared target. UI designs must include portrait/landscape behavior where the implemented scientific interaction depends on orientation.

## 10. Mobile-course evidence mapping

For each member-owned mobile function, retain:

- requirement/use-case ID;
- UI design artifact;
- architecture/data interaction explanation;
- implementation PRs/commits;
- test evidence;
- demo/defense notes.

This supports the course requirement that every member analyze, design, implement, and defend at least one function.

