# 09 — SYSTEM ARCHITECTURE SPECIFICATION

**Status:** Frozen v1.0 logical architecture — technology selection remains gated by ADR  
**Depends on:** `00`–`08`

---

## 1. Architectural goals

- support mobile-first scientific interaction;
- isolate heavy ML/inference from mobile UI;
- preserve artifact provenance;
- support asynchronous expensive work;
- minimize parallel-development conflicts;
- make geometry mapping a shared tested contract;
- enable continuous integration and testability within a 30-day student project.

---

## 1.1 Architecture freeze gates

The logical architecture in this file is frozen. Concrete technology choices are resolved through approved ADRs:

- `ADR-MOB-001` / `TECH_STACK_ADR.md`: mobile framework after Spike A/B; resolves `GATE-MOB-01`.
- `ADR-BE-001`: backend/runtime/storage choice.
- `ADR-ART-001`: large-artifact transport/serialization/cache strategy.
- `ADR-DEPLOY-001`: LOCAL_DEMO vs REMOTE_DEMO deployment/security profile; resolves `GATE-DEPLOY-01`.

Repository scaffolding may begin before all ADRs are final only for technology-neutral docs/contracts/spikes. Production feature implementation must not lock a conflicting architecture before its dependent ADR is accepted.

## 2. Logical architecture

```text
Mobile App
  │
  ├── Study / Cases / Experiments UI
  ├── 2D MRI + mask editor
  ├── 3D viewer + linked navigation
  └── Review / Findings
  │ HTTPS/API
  ▼
Backend API
  ├── Study/Case service
  ├── Analysis/Artifact service
  ├── Review/Finding service
  └── Experiment/Metric service
  │
  ├────────► Data / Metadata Store
  │
  └────────► ML / Imaging Worker
              ├── inference
              ├── post-processing
              ├── metrics
              └── 3D reconstruction / geometry artifacts
```

The actual deployment may combine services into fewer processes for MVP simplicity, but logical boundaries should remain clear.

---

## 3. Client/server responsibility split

### Mobile responsibilities

- presentation and navigation;
- touch gestures;
- 2D display transforms;
- brush interaction UI;
- 3D rendering/selection;
- local working edit buffer;
- request/response state and retry;
- limited cache appropriate to privacy/performance.

### Backend responsibilities

- authoritative metadata/domain state;
- analysis-run lifecycle;
- reviewed-mask persistence;
- finding persistence;
- experiment metrics/query;
- artifact authorization/path resolution;
- orchestration of heavy worker tasks.

### Worker responsibilities

- model inference;
- deterministic post-processing;
- evaluation metrics;
- reconstruction artifact generation if implemented server-side;
- geometry-validation utilities.

---

## 4. Artifact strategy

Do not store large MRI/mask/mesh payloads as arbitrary database blobs unless the chosen architecture has a clear reason.

Prefer:

- metadata/relationships in a database or structured store;
- large immutable/derived artifacts in an artifact/file/object store;
- checksums and URIs referenced from metadata.

The exact store is an implementation ADR.

---

## 5. Asynchronous analysis

Long-running analysis operations should use a stateful job/run model:

`QUEUED → RUNNING → SUCCEEDED / FAILED`

Mobile should poll, subscribe, or otherwise refresh state according to the chosen architecture without blocking the UI.

---

## 6. Geometry contract boundary

One versioned geometry contract must be shared between processing and mobile. Recommended implementation approaches include:

- explicit volume geometry payload (`shape`, `spacing`, `origin`, `direction`, transform matrices);
- deterministic helper library/module with conformance tests;
- test fixtures with known voxel↔world↔slice mappings.

Do not independently hand-write incompatible transforms in backend and mobile.
The project must maintain canonical geometry fixtures with known voxel↔slice↔world values. Backend/mobile implementations may be language-specific, but both must pass the same fixture conformance tests.

---

## 7. Mobile framework decision ADR

The framework shall be selected **after** technical spikes prove:

1. pixel-accurate brush correction under zoom/pan;
2. stable interactive 3D mesh rendering and 3D→slice mapping;
3. acceptable development velocity within the 30-day constraint.

Candidates may include native Android/Kotlin or React Native/TypeScript (or another framework proposed by Claude), but the selected stack must be justified by spike evidence rather than familiarity alone.

Claude must generate `TECH_STACK_ADR.md` documenting:

- candidates;
- spike implementation/evidence;
- decision criteria;
- selected stack;
- rejected alternatives;
- consequences/risks.

---

## 8. Repository modularity goals

Suggested top-level boundaries (exact structure decided after ADR):

```text
mobile/
backend/
ml/
data/
shared-contracts/
tests/
docs/
management/
```

Within each, feature-oriented boundaries should minimize overlapping edits.

---

## 9. Shared contracts

At minimum, version and test:

- API schemas;
- domain enums/states;
- geometry payload/transform rules;
- experiment-result schema;
- artifact metadata schema.

Generated types are preferred where feasible to reduce client/server drift.

---

## 10. Deployment profiles and expectation

The MVP supports two approved profiles. The selected profile is recorded in `ADR-DEPLOY-001`.

### `LOCAL_DEMO`

Use when the backend runs on the leader/team machine or a trusted private LAN during development/demo.

- no public internet exposure;
- authentication may be omitted if the service is bound to localhost/private trusted network and write access is not publicly reachable;
- secrets still stay out of source control;
- dataset/artifacts remain on controlled project storage.

### `REMOTE_DEMO`

Use if backend is reachable over the public internet.

- HTTPS/TLS required;
- project-level authorization required for all write operations;
- read access must comply with dataset terms;
- long-lived privileged secrets must not be embedded in mobile binary.

### Functional demo expectation

Whichever profile is selected, the MVP must support a demo scenario in which:

- mobile app connects to a reachable backend;
- backend accesses validated sample/full dataset artifacts as configured;
- completed analysis results are available; live inference is supported if `PR-AN-01` is implemented;
- failure/retry states can be shown safely;
- the canonical vertical slice runs end-to-end from the current `main`.

The specification does not require public clinical deployment.

## 11. Observability

Minimum:

- structured backend error logs;
- analysis-run status/failure reason;
- client-visible recoverable error codes;
- no secrets/PII/raw image dumps in ordinary logs;
- enough run identifiers to trace failures across client/backend/worker.

---


## 12. Integration contract freeze rule

Before two members work in parallel across an interface, the relevant contract (API schema, geometry fixture, artifact schema, or DB migration) must be versioned and accepted. A downstream member may use a mock/fixture generated from that accepted contract; they must not invent a private incompatible shape.
