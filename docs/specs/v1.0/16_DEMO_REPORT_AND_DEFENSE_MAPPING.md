# 16 — DEMO, REPORT, AND DEFENSE MAPPING

**Status:** Frozen v1.0  
**Depends on:** `00`–`15`

---

## 1. Goal

Ensure one integrated product can be presented through four academic lenses without fragmenting into four separate projects.

---

## 2. Core demo narrative

Preferred 60–90 second hero flow:

1. Open cohort/experiment summary.
2. Identify an outlier case.
3. Open MRI Case Explorer.
4. Navigate to problematic slice.
5. Compare prediction/ground truth/error.
6. Open 3D reconstruction/error map.
7. Select error region and jump back to 2D slice.
8. Flag/correct prediction with brush.
9. Save reviewed mask while preserving raw prediction.
10. Return to model/data-scarcity comparison.

North-star question:

> **Why did the AI fail on this MRI, and what can the researcher do about it?**

---

## 3. Subject-specific pitch angles

### Machine Learning

Core question:

> Why/how does DINOv2-based transfer compare with UNet, especially when labeled data is reduced?

Evidence:

- 25/50/100 experiment matrix;
- Dice/IoU distributions;
- paired case comparison;
- reproducibility protocol.

### Image Processing

Core question:

> How does the system transform MRI voxels and segmentation masks into inspectable 2D/3D representations, and does deterministic post-processing help?

Evidence:

- normalization/resize policy;
- raw vs processed mask ablation;
- morphology;
- contour/surface reconstruction;
- voxel/pixel/world mapping;
- error map.

### Data Science

Core question:

> How does the model behave over the cohort, and what can outliers/per-slice patterns reveal beyond a mean metric?

Evidence:

- distributions;
- mean/median/std;
- outlier drill-down;
- per-slice profiles;
- data-scarcity trend;
- paired experiment results.

### Mobile Application Development

Core question:

> How is a complex imaging/AI workflow transformed into a usable mobile research interaction?

Evidence:

- architecture and API integration;
- 2D gestures;
- brush correction;
- 3D touch interaction;
- 2D↔3D linkage;
- state/error handling;
- privacy handling;
- each member's owned function.

---

## 4. “One product, four lenses” mapping

| Demo capability | ML | Image Processing | Data Science | Mobile |
|---|---:|---:|---:|---:|
| UNet vs DINOv2 | ✓ |  | ✓ |  |
| 25/50/100% comparison | ✓ |  | ✓ | ✓ (interaction) |
| Raw → refined mask | ✓ (ablation) | ✓ | ✓ | ✓ |
| MRI overlay/error | ✓ | ✓ | ✓ | ✓ |
| 2D↔3D navigation |  | ✓ |  | ✓ |
| 3D error map | ✓ | ✓ | ✓ | ✓ |
| Outlier → slice evidence | ✓ | ✓ | ✓ | ✓ |
| Brush correction |  | ✓ |  | ✓ |
| Review provenance | ✓ (artifact integrity) |  | ✓ | ✓ |

---

## 5. Mobile-course report evidence

The final mobile report/defense should explicitly cover:

- functional/non-functional analysis;
- architecture/technology selection and ADR reasoning;
- UI design vs implemented UI;
- shared application structure;
- integration among team functions;
- data/privacy protection;
- per-member owned function: analysis, UI design, implementation, technology application, tests, defense.

---

## 5.1 Mobile-course rubric trace

The mobile course project guidance is treated as a delivery constraint, not an afterthought. Preserve evidence for:

| Course evaluation area | Required project evidence |
|---|---|
| CLO1 — analyze/design architecture and functions | `02` use cases, `03/04` requirements, `09` architecture/ADRs, member function design package |
| CLO1 — mobile UI design | `10` interaction spec + actual UI mock/design artifact + design rationale for each member-owned function |
| CLO2 — implement UI according to design | implemented mobile screens/gestures + comparison to approved design + PR/test evidence |
| CLO2 — implement functions according to architecture | integrated feature PRs, API/geometry contracts, CI/integration tests, runnable demo build |
| CLO3 — individual report | per-member evidence package: function analysis, design, implementation, privacy, tests, limitations |
| CLO3 — presentation/defense | shared-core readiness + personal-depth defense notes + live code/demo evidence |

The team should target the rubric's highest band by implementing the large majority of designed core interfaces/functions faithfully, not by designing a large feature set that is mostly unfinished. This reinforces the MUST scope firewall in `03`/`15`.

## 6. Defense readiness per member

Every member must be able to explain:

### Shared core

- product problem;
- MRI/segmentation basics;
- DINOv2 vs UNet purpose;
- experiment protocol;
- 2D/3D mapping concept;
- data flow from app to backend/model;
- why ground-truth metrics are conditional;
- Git/review workflow.

### Personal depth

For the specific mobile function personally owned by the member, defense evidence must trace:

`Requirement/UC → UI design → architecture/API/data → commits/PR → tests → integrated demo → privacy consideration → known limitation/trade-off`.


- owned function requirement/use case;
- UI design rationale;
- architecture/API/data interactions;
- implementation details;
- tests/edge cases;
- privacy concerns;
- trade-offs and known limitations.

---

## 7. Evidence preservation

For final presentation/report, retain:

- experiment result manifests;
- screenshots/video of canonical demo flow;
- architecture diagram;
- key use-case/UML diagrams;
- representative PRs/tests;
- traceability matrix;
- per-member contribution evidence;
- approved UI design artifacts and corresponding implemented-screen evidence for rubric comparison;
- Decision Log showing important trade-offs.

