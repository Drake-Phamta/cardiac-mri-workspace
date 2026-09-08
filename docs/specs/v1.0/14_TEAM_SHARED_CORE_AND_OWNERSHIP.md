# 14 — TEAM SHARED CORE AND OWNERSHIP

**Status:** Frozen v1.0  
**Depends on:** `00`–`13`

---

## 1. Team philosophy

The 4-person team must not be divided into four isolated academic-subject silos.

Required model:

`shared core understanding → vertical/block specialization → cross-review → integrated ownership`

A primary owner is the person most responsible for depth/quality of a block, **not** the only person allowed to understand or modify it.

---

## 2. Shared core curriculum

Before deep specialization, all members must be able to explain at a practical project level:

1. Product problem and research-workspace concept.
2. LGE MRI volume and slice representation.
3. LA cavity segmentation target.
4. Ground truth vs prediction vs reviewed mask.
5. Dice and IoU meaning.
6. Why patient-level splitting matters.
7. UNet baseline concept.
8. DINOv2 transfer/foundation representation concept.
9. Preprocessing and post-processing roles.
10. 2D slice prediction → stacked 3D mask → reconstruction.
11. Voxel/pixel/world/mesh coordinate mapping concept.
12. Cohort vs case vs slice vs pixel evaluation.
13. Evaluation Mode vs Inference & Review Mode.
14. Mobile architecture/data flow at a high level.
15. API/analysis-run/artifact concepts.
16. Git/PR/review/Definition of Done workflow.

Each member should be able to answer cross-domain defense questions without saying “that part belongs only to another member.”

---

## 2.1 Shared-core readiness gate

Deep specialization begins only after each member can pass a short leader-reviewed readiness check covering the shared curriculum. Evidence may be a concise oral walkthrough plus one small end-to-end exercise using `INTEGRATION_CASE_001`/fixtures.

Minimum pass evidence:

- explain MRI → preprocessing → model → mask → metric → 3D → mobile data flow;
- distinguish ground truth, raw prediction, processed prediction, and reviewed mask;
- explain why patient-level split/no leakage matters;
- explain Dice/IoU and why an aggregate score must drill down to evidence;
- explain the shared geometry/2D↔3D concept;
- explain Git/PR/ACCEPTED workflow.

A member who has not passed remains paired on shared-core work rather than being assigned isolated deep ownership.

## 3. Ownership model

After shared-core onboarding, assign **primary ownership** by vertical capability, not by academic subject.

Candidate vertical capability groups:

### V1 — Case Explorer / 2D MRI Interaction
Includes slice navigation, overlay, zoom/pan, related API integration.

### V2 — 3D / Spatial Error Investigation
Includes reconstruction display, 2D↔3D linkage, error map interaction.

### V3 — Experiment / Cohort Analysis
Includes experiment comparison, data-scarcity visualization, outlier drill-down.

### V4 — Review / Findings
Includes review states, brush correction, reviewed-mask persistence, findings.

Final member mapping is produced during 30-day planning based on skills/dependencies, but every member must own at least one mobile function end-to-end to satisfy course requirements.

---

### Ownership assignment rule

The 30-day plan shall assign each vertical capability:

- one **Primary Owner** (depth/implementation accountability);
- one **Secondary Reviewer** (knowledge redundancy and quality challenge);
- explicit interfaces/dependencies to adjacent blocks.

No critical block may have a single point of knowledge failure by the end of the first specialization week.

## 4. Individual responsibility package

For each member-owned mobile function, preserve:

- function/use-case description;
- UI design;
- architecture/technology usage;
- implementation task/PR evidence;
- privacy/data considerations;
- tests;
- defense talking points.

---

## 5. Secondary reviewer model

Every primary block has at least one secondary reviewer who understands:

- input/output contract;
- acceptance criteria;
- critical implementation risks;
- integration dependencies.

Reviewers should rotate where practical to increase knowledge redundancy.

---

## 6. Knowledge handoff rule

A block is not considered healthy if only one person can explain/run/debug it.

Before a milestone closes, the primary owner must provide enough documentation/demo for at least one other member to:

- run it;
- verify it;
- identify obvious failures;
- explain how it integrates.

---

## 7. Shared integration responsibility

All members are responsible for preserving the integrated product. “My module works independently” is insufficient if main/integration is broken.

---

## 8. Leader responsibilities

The leader owns integration outcome and allocation decisions, not every line of code. Primary reviewers handle routine technical review; the leader directly reviews critical-path, architecture, scientific-protocol, scope, and milestone changes.

The leader owns:

- source-of-truth/spec alignment;
- priority/critical path;
- scope decisions;
- architecture-impact decisions;
- final acceptance of critical milestones;
- project-state accuracy;
- recovery decisions when deadline risk increases.

The leader should not become the sole code reviewer for every PR; primary technical review is distributed according to `15_TEAM_EXECUTION_AND_PROJECT_CONTROL.md`.

