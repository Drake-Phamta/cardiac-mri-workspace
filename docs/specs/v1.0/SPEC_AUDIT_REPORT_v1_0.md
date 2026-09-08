# SPEC AUDIT REPORT — v0.1 → Frozen v1.0

**Project:** AI-assisted Cardiac MRI Research Workspace  
**Audit role:** Cross-document consistency / implementation-readiness audit  
**Result:** **PASS WITH CONTROLLED DECISION GATES**  
**Core source-of-truth files:** `00`–`17` only. This audit report records why v1.0 was frozen; it does not override those files.

---

## 1. Audit objectives

The audit checked whether the specification set is sufficiently deterministic and traceable for Claude Max to:

1. perform an independent implementation-readiness audit;
2. resolve controlled technical/scientific gates through ADRs/Decision Requests;
3. scaffold a repository without redefining product truth;
4. generate a dependency-aware 30-day plan for four members;
5. generate daily plans from actual project state;
6. review progress against acceptance evidence rather than subjective percentages.

It also checked alignment with the project's four academic lenses and the explicit Mobile App course requirements already provided by the team.

---

## 2. Structural audit result

Automated consistency check on Frozen v1.0:

- **18** core specification files present: `00`–`17`.
- **44** formal product requirements:
  - 33 MUST
  - 6 SHOULD
  - 5 COULD
- **79** functional/non-functional requirements:
  - 75 MUST
  - 4 SHOULD (`FR-AN-*` live analysis)
- **17** use cases.
- **70** defined acceptance-test IDs.
- **79 / 79** FR/NFR IDs have explicit acceptance-test coverage in `13`.
- **44 / 44** product requirements appear in the frozen product trace map in `13`.
- No undefined PR IDs.
- No undefined UC IDs.
- No undefined TC IDs.
- No remaining `Draft v0.1` status markers.

Section labels such as `NFR-PERF` are category names, not orphan requirement IDs.

---

## 3. Major v0.1 issues found and v1.0 resolutions

### AUD-01 — SHOULD/COULD scope had no formal IDs

**Risk:** Claude could either ignore stretch work or schedule it without traceability.  
**Resolution:** `03` now assigns formal IDs to all SHOULD/COULD scope items and enforces the scope firewall.

### AUD-02 — Live analysis FRs existed without a product-level requirement

**Risk:** implementation ambiguity over whether mobile-triggered inference was critical MVP or optional.  
**Resolution:** added `PR-AN-01 — SHOULD`, `UC-17`, `SCR-09`, and `TC-AN-001`. Precomputed experiment artifacts remain the critical-path fallback.

### AUD-03 — Test specification contradicted its own traceability requirement

**Risk:** `NFR-AUDIT-001` required acceptance coverage for all MUST FRs, but v0.1 enumerated only a small critical subset.  
**Resolution:** `13` now contains a full product trace map, 69 acceptance-test IDs, and explicit coverage for **79/79** FR/NFR IDs.

### AUD-04 — Performance NFRs were subjective

**Risk:** terms such as “interactive” and “usable” were not objectively reviewable.  
**Resolution:** `04`/`13` now define measurable target-device criteria for cached slice navigation, 3D interaction, brush feedback, async request behavior, and five consecutive canonical smoke runs.

### AUD-05 — Primary metric semantics were ambiguous

**Risk:** different members could compute/report Dice/IoU at incompatible levels.  
**Resolution:** `07/08` freeze **case-level 3D Dice and 3D IoU** as primary metrics, cohort aggregation from per-case metrics, explicit per-slice empty-mask semantics, relative-volume-error definition, and prediction-variant labeling.

### AUD-06 — Dataset split decision was under-specified

**Risk:** split could be chosen after seeing results or differ between models.  
**Resolution:** `06` freezes a pre-training decision tree with seed `2024`:

- Path A: official 100 development cases → 80 train / 20 validation; verified 54 official test cases remain locked final holdout.
- Path B: if official test labels are unavailable/unverified → verified 100 labeled cases split 70 / 15 / 15; official unlabeled test MRIs may be inference-only.

Exact case manifests remain package-dependent and must be frozen before training.

### AUD-07 — Dataset package facts could be assumed instead of validated

**Risk:** label availability, foreground coding, geometry/spacing or package provenance could be silently guessed.  
**Resolution:** `06` now blocks training until `DATASET_AUDIT.md` + machine-readable manifest validate source, files, label semantics, geometry, test-label provenance, checksums where practical, and split path.

### AUD-08 — DINOv2 implementation was too open for comparable experiments

**Risk:** 25/50/100 runs could use different variants/heads/training policies.  
**Resolution:** `GATE-ML-01` + `ADR-ML-001` must freeze one DINOv2 configuration before the core experiment matrix; it remains fixed across fractions.

### AUD-09 — Post-processing ablation could introduce confounds/test tuning

**Risk:** morphology might be tuned on holdout or on a different model run.  
**Resolution:** `EXP-D-PP` is explicitly derived from the raw predictions of `EXP-D-100`; configuration is frozen using development/validation evidence only, then applied unchanged to holdout.

### AUD-10 — Run-comparison compatibility was not enforceable

**Risk:** UI could compare metrics from different splits, populations or raw/processed variants as if fair.  
**Resolution:** `03/04/08/11/13` define comparable-run gates and `TC-EXP-007`/`TC-REP-004`.

### AUD-11 — API contract was too logical for parallel frontend/backend work

**Risk:** mobile/backend teams could invent incompatible slice, error, review, or version semantics.  
**Resolution:** `11` now freezes required REST-equivalent operations for study/cases, MRI/GT slices, experiments/comparison, analysis runs, prediction variants, per-slice metrics/error, 3D artifacts, review working-mask edits, immutable reviewed-mask commit, findings, errors, geometry and stale-write behavior.

Serialization/compression can still be selected by ADR without changing semantics.

### AUD-12 — Review persistence/version semantics were incomplete

**Risk:** correction could overwrite reviewed state or raw prediction; `CORRECTED` could exist without a persisted reviewed artifact.  
**Resolution:** `05/10/11/13` freeze immutable reviewed-mask versions, parent/source provenance, review state history, save/commit behavior, stale-write protection and raw/processed source identity.

### AUD-13 — 3D/2D mapping could be independently reimplemented

**Risk:** mobile and backend could each be “internally correct” but disagree spatially.  
**Resolution:** canonical geometry fixtures and conformance tests are mandatory across language implementations; contract changes are integration-sensitive.

### AUD-14 — Privacy/auth scope was ambiguous for a university demo

**Risk:** either over-building full authentication or exposing research data publicly.  
**Resolution:** `09/12` define `LOCAL_DEMO` and `REMOTE_DEMO` profiles. Remote writes require authorization/TLS; local demo may omit auth only on trusted non-public exposure. Metadata allowlisting and cache/version safeguards were added.

### AUD-15 — Team daily planning lacked capacity/task-size constraints

**Risk:** Claude could assign multi-day epics, equalize task counts instead of critical-path throughput, or create review queues.  
**Resolution:** `15` now requires actual member availability, same-day reviewable primary deliverables or daily checkpoints, WIP limits, review windows, explicit upstream contract versions, downstream integration targets and EOD evidence.

### AUD-16 — Git conflict prevention lacked sufficiently explicit merge discipline

**Risk:** “no conflict” could remain an aspiration rather than process.  
**Resolution:** protected `main`, no force push, one branch owner, short-lived branches, latest-main sync before merge, conflict resolution on feature branch, default squash merge, overlap detection on integration-sensitive files, and pause/resequence rule for unexpected collisions.

### AUD-17 — Deadline recovery triggered too late

**Risk:** team could discover Day 30 failure near the deadline.  
**Resolution:** `15` now protects explicit recovery buffer, triggers recovery when buffer/critical blockers/smoke tests/scientific gates deteriorate, and records forecast + buffer in Project State/EOD review.

### AUD-18 — Claude orchestration could treat the post-freeze audit as permission to rewrite specs

**Risk:** Claude could “fix” v1.0 independently before planning.  
**Resolution:** `17` now defines Claude's first audit as an **implementation-readiness audit**. Any suspected spec gap becomes a Decision Request; `docs/00`–`17` are not directly editable by Claude.

### AUD-19 — Mobile-course rubric coverage was implicit

**Risk:** product could be technically strong but final report/individual defense miss course scoring evidence.  
**Resolution:** `14/16` now add shared-core readiness, primary/secondary ownership, individual evidence chain, and explicit CLO1/CLO2/CLO3 mapping.

---

### AUD-20 — Scientific success could be misread as “DINOv2 must win”

**Risk:** the team/agent could over-tune, cherry-pick, or hide negative results to imitate the reference paper direction.  
**Resolution:** added `PR-SCI-03` + `TC-SCI-003`: a valid negative/null result is acceptable; final ordering must follow frozen evaluation evidence.

## 4. Controlled open gates — not audit failures

Frozen v1.0 intentionally leaves these values unresolved until evidence exists:

| Gate | What remains unknown | Why it is safe to freeze now |
|---|---|---|
| GATE-DATA-01 | exact downloaded package manifest, label/test availability, checksums, geometry | source is fixed; validation procedure and stop condition are fixed |
| GATE-SPLIT-01 | Path A vs Path B + exact case IDs | decision tree/seed/count policy is frozen before training |
| GATE-ML-01 | exact DINOv2 variant/head/training recipe | ADR contents/fairness constraints are frozen; one config must be selected before matrix training |
| GATE-IMG-01 | exact morphology kernel/order | validation-only selection procedure and `EXP-D-100` source are fixed |
| GATE-MOB-01 | React Native/Kotlin/other | Spike A/B acceptance and performance criteria are frozen |
| GATE-DEPLOY-01 | local vs remote demo profile/artifact strategy | both permitted profiles and security obligations are frozen |

Claude must plan **resolution dates/dependencies** for these gates; it may not treat them as unspecified freedom.

---

## 5. Remaining project risks to seed into Claude's risk register

These are not contradictions; they are execution risks:

1. **RISK-3D-GEOMETRY:** 2D↔3D mapping/brush coordinate transforms are high-risk and must be spiked early.
2. **RISK-MOBILE-RENDER:** framework/library may fail 3D + editing performance on the actual demo device.
3. **RISK-DATA-PACKAGE:** obtained official package may differ in labels/geometry from expectations; dataset audit must precede training.
4. **RISK-COMPUTE:** DINOv2 variant/training budget may exceed available compute; `ADR-ML-001` must optimize feasibility without changing research question.
5. **RISK-INTEGRATION:** mobile/backend/geometry/artifact contracts can drift; mocks must be generated from accepted contracts.
6. **RISK-SCOPE:** brush + linked 3D + six training configs are ambitious for 30 days; MUST/SHOULD firewall and recovery buffer must be enforced.
7. **RISK-REPORT:** experimental results may not show DINOv2 outperforming UNet; success is scientifically honest evaluation/product investigation, not forcing a predetermined result.

---

## 6. Freeze decision

**Frozen Spec v1.0 is ready to hand to Claude Max for implementation-readiness audit and controlled gate resolution.**

Claude should **not code product features immediately**. The required next sequence is:

1. leader opens Claude `CHAT A — PROJECT CONTROL` with the prompt in `17`;
2. Claude independently audits implementation readiness and creates initial risk/gate/dependency inventory;
3. leader reviews that output;
4. dataset audit + mobile technical spikes + required ADRs begin;
5. repository architecture is frozen from accepted ADRs/contracts;
6. Claude generates the 30-day baseline plan;
7. leader reviews the baseline plan before Day 1 execution;
8. daily closed loop follows `15` + `17`.
