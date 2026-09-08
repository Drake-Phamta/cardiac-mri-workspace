# 01 — PRODUCT VISION AND SCOPE

**Status:** Frozen v1.0  
**Depends on:** `00_PROJECT_MASTER_CONTEXT.md`

---

## 1. Problem framing

Medical-image segmentation research commonly produces masks and aggregate metrics, but these outputs are difficult to inspect across multiple scales. A mean Dice score does not tell a researcher where a model failed, whether errors concentrate in specific slices, how different models behave on the same anatomy, or how a 2D segmentation sequence relates to the reconstructed 3D structure.

The project therefore focuses on **making segmentation behavior inspectable and traceable**, rather than merely producing a segmentation mask.

---

## 2. Vision

Build a mobile-first research workspace that lets a researcher move seamlessly between:

`cohort → experiment → case → slice → pixel/region → 3D anatomy`

while preserving evidence and provenance for every analysis, model output, and human correction.

---

## 3. Primary user

**Medical Imaging / AI Researcher or Research Student**

The primary user wants to:

- inspect LA segmentation predictions;
- compare model behavior;
- investigate model failures;
- understand performance under limited labeled data;
- inspect 3D reconstruction derived from 2D predictions;
- review and correct prediction masks;
- preserve reproducible evidence and findings.

Patients and clinicians performing diagnosis/treatment are not primary MVP personas.

---

## 4. Value proposition

> Convert cardiac MRI segmentation from a black-box `input → mask → metric` workflow into an interactive, multi-scale investigation workflow where quantitative results can always be traced back to MRI evidence.

Short form:

> **From MRI slices to understandable AI.**

---

## 5. Product mental model

### Navigation center — Research Study / Workspace
The study organizes dataset, experiments, cases, analysis runs, and findings.

### Interaction center — MRI Case
The case is where the user performs detailed MRI, prediction, 3D, error, and review interactions.

### Evidence model
Every aggregate abstraction should drill down to evidence whenever evidence exists.

---

## 6. Product principles

1. **Workspace-first** — one coherent research workflow.
2. **Case-centered** — the case is the primary investigation object.
3. **Evidence-driven** — metrics/findings trace to MRI/model evidence.
4. **Mobile-first interaction** — gestures and scientific interaction are core functionality.
5. **Scientifically honest** — never display validation metrics without ground truth; never claim clinical diagnosis.
6. **Reproducible** — model/pipeline settings and artifact provenance must be preserved.
7. **Human-in-the-loop, not human-overwrite** — raw model predictions remain immutable; corrections generate new artifacts.

---

## 7. Core user journey

### Journey J1 — Investigate an outlier
1. User opens study overview/cohort analysis.
2. User sees an outlier case with low or unusual performance.
3. User opens the case.
4. User sees case-level and per-slice error behavior.
5. User jumps to a problematic slice.
6. User inspects MRI, prediction, ground truth, and error overlay.
7. User opens the corresponding 3D error region.
8. User creates a finding and, when appropriate, performs brush correction.

### Journey J2 — Compare DINOv2 and UNet
1. User opens experiment comparison.
2. User compares aggregate metrics/distributions.
3. User selects a case where predictions differ.
4. User compares both predictions against the same MRI/ground truth.
5. User drills into slice/pixel evidence.

### Journey J3 — Data-scarcity analysis
1. User selects 25%, 50%, and 100% labeled-data experiments.
2. User sees performance degradation curves/distributions.
3. User selects representative or worst cases.
4. User inspects evidence explaining the aggregate behavior.

### Journey J4 — Inference and human review
1. User opens a case without ground truth.
2. User runs/opens segmentation prediction.
3. User inspects 2D/3D output.
4. User accepts, flags, or corrects the mask.
5. System stores the reviewed artifact without overwriting the prediction.

---

## 8. MVP scope

### MUST

- Study overview.
- Case list and case explorer.
- 3D NRRD MRI volume ingestion/validated access.
- Slice-by-slice 2D viewer.
- Prediction overlay and opacity control.
- Ground-truth overlay when available.
- Error overlay when available.
- UNet baseline inference/results.
- DINOv2-based inference/results.
- Experiment comparison for 25/50/100% labeled-data settings.
- Per-case and cohort metrics.
- Per-slice investigation.
- 3D LA reconstruction.
- 2D → 3D linked navigation.
- 3D → 2D linked navigation.
- 3D error visualization when ground truth exists.
- Human review status: not reviewed / accepted / flagged / corrected.
- 2D brush add/erase correction, undo/redo/reset.
- Reviewed-mask version preservation.
- Finding creation anchored to evidence.
- Privacy-safe/de-identified case identity.
- Error/loading/retry states.
- Requirement traceability and acceptance testing.

### SHOULD

- Initiate a live/new analysis run from mobile for at least one deployed frozen model configuration, with asynchronous state; precomputed results remain the critical-path fallback.
- Side-by-side or synchronized comparison of multiple analysis runs on the same case.
- Surface/boundary distance metric such as HD95.
- Review-burden analytics.
- Rich filtering of cohort cases/findings.
- Offline-friendly caching of already opened slices/artifacts where safe.

### COULD / STRETCH

- Additional model family beyond UNet and DINOv2.
- Multi-user collaboration/comment threads.
- Advanced annotation tools beyond brush add/erase.
- Arbitrary study creation.
- Automatic experiment scheduling from mobile.

### OUT OF SCOPE

- Clinical diagnosis.
- Treatment recommendation.
- Hospital/PACS integration.
- Patient-identifiable workflow.
- Automatic continuous retraining after a correction.
- Full professional medical annotation suite.
- Segmentation of organs/tasks unrelated to the LA MVP.

---

## 8.1 Scope-freeze interpretation

MUST is the protected acceptance floor. SHOULD/COULD work may be scheduled only when critical-path health permits. A SHOULD/COULD item is not allowed to become an undocumented parallel project; if activated, it receives requirement/test/task traceability before implementation.

## 9. Product success criteria

The MVP is considered successful when:

1. A canonical MRI case can be explored end-to-end on mobile from slice viewer to prediction, error, 3D, linked navigation, and review.
2. Aggregate model/case metrics can drill down to case/slice evidence.
3. UNet and DINOv2 experiments can be compared under the documented data-scarcity protocol.
4. Human correction persists as a reviewed artifact without mutating the original prediction.
5. The mobile UX remains usable during zoom/pan/brush and 3D interactions.
6. Every core function is backed by a requirement ID, acceptance test, and implementation evidence.

---

## 10. North-star demo question

The preferred demo narrative is not “here are our features.” It is:

> **Why did the AI fail on this MRI, and what can the researcher do about it?**

This single investigation should expose cohort analytics, case-level metrics, slice/pixel evidence, 3D error localization, model comparison, and human review.

