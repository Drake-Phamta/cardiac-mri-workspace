# OPEN DECISIONS — Decision Requests arising from the Readiness Audit

**Companion to:** `IMPLEMENTATION_READINESS_AUDIT.md`
**Format:** `17_LEADER_CLAUDE_ORCHESTRATION_PROTOCOL.md` §11 required DR fields
**Status:** after **three** decision rounds (2026-09-08), **twelve** audit-raised decisions are
**✅ APPROVED** — DR-001, **DR-003**, DR-004, DR-006, DR-007, DR-008a, DR-009, DR-010, DR-011, DR-012,
**DR-013**, DR-014. **DR-008b** is FROZEN by SCQ-06. **No decision is PENDING and none is ⚠ NOT RULED ON.**

**Only three decisions remain OPEN, and every one is now evidence-driven rather than a free choice:**
**DR-002** (needs Spike D), **DR-005** (needs Spike F), **DR-008c** (needs Spike B).
**Authoritative status table:** `READINESS_REVIEW_RESOLUTION.md` §10.

---

> **Reviewed and accepted with corrections by the specification owner, 2026-09-08.**
> Corrections have been applied to this file. For the authoritative post-review state — decision
> statuses, the nine answered clarifications, and condition status C1–C8 — see
> **`READINESS_REVIEW_RESOLUTION.md`**, which governs where it differs from this file.

## 0. How to read this document

Per `00` §13 and `17` §11, no agent or team member may silently resolve any item below. Each entry is a
Decision Request skeleton: the leader (or spec owner, where noted) decides, the outcome is recorded in
the Decision Log, and only then does it become project truth.

**Each DR records a *latest-safe-resolution dependency* — what it blocks — not a date.** Dates belong to
the 30-day baseline, which is not authorised yet.

### Two categories

- **Controlled gates** (DR-G01..G06) — already declared open by `00` §11.1. These are not audit
  findings; they are scheduled decisions. Listed here so the leader has one view of everything pending.
- **Audit-raised decisions** (**DR-001..DR-014**) — new decisions this audit surfaced.

### Status markers used below

| Marker | Meaning |
|---|---|
| **✅ APPROVED** | Decided by the specification owner's readiness review. The recorded outcome is project truth. |
| **⏸ PENDING LEADER CONFIRMATION** | A direction is proposed but **not** approved. Do not act on it as decided. |
| **⚠ NOT RULED ON** | *(no longer applies to any decision)* Was used after Round 1 for decisions the review neither approved nor explicitly deferred. Round 2 decided all four — DR-001, DR-008a, DR-009, DR-010. Retained here only so the marker is understood if it reappears. |
| **OPEN** | Explicitly kept open pending dataset, spike, device or team evidence. |

---

## Part 1 — Controlled gates from `00` §11.1

| DR | Gate | Decision required before | Required artifact | Owner | Blocked by |
|---|---|---|---|---|---|
| **DR-G01** | `GATE-DATA-01` — **OPEN** | any training / final evaluation | validated package: label availability, geometry, checksums, case counts → `DATASET_AUDIT.md` + manifest | Leader + ML/Imaging review | Spike D |
| **DR-G02** | `GATE-SPLIT-01` — **OPEN** | training starts | Path A or Path B from `06` §6; frozen patient manifest + seed `2024` | Leader / spec owner | DR-G01, RA-H02 |
| **DR-G03** | `GATE-ML-01` — **OPEN** | final matrix training | one frozen DINOv2 variant, decoder, threshold, loss, training policy → `ADR-ML-001` | Leader after research/compute spike | **Spike C1** (C0 evidence is insufficient), DR-011 ✅ |
| **DR-G04** | `GATE-IMG-01` — **OPEN** | holdout post-processing evaluation | frozen morphology config from dev/validation evidence only | Leader after ablation setup | DR-G03 |
| **DR-G05** | `GATE-MOB-01` — **OPEN** | production mobile architecture | framework selected on Spike A/B evidence → `TECH_STACK_ADR.md` | Leader | Spikes A/B, DR-006 |
| **DR-G06** | `GATE-DEPLOY-01` — **✅ RESOLVED** | — | **`LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS** (DR-003 ✅). Artifact-transport strategy remains an `ADR-ART-001` matter informed by Spike E. | Leader / Architect | — |

**[SPEC]** `00` §11.1: "A gate resolution becomes part of project truth only when recorded in an
approved ADR/Decision Log and linked from the relevant specification."

---

## Part 2 — Audit-raised Decision Requests

---

### DR-001 — Dataset acquisition contingency protocol

> **✅ APPROVED — Option 2 (define a trigger and a fallback now).**
>
> **Spike D is P0.** The escalation trigger is: **if, by the end of the first execution day of Spike D,**
> the team does **not** have a usable official package **locally**, **or** package/provenance validation
> reveals a **blocking defect** preventing GATE-DATA-01 acceptance, then **RA-H01 escalates to BLOCKER**
> and the **dataset contingency process opens**.
>
> **Do not silently substitute a dataset.** Substitution is a protocol change requiring the full `00` §13
> Decision Request → impact analysis → approval → spec update sequence.

| Field | Content |
|---|---|
| **Source finding** | RA-H01 (HIGH) |
| **Affected specs** | `00` §11.1, `06` §3, `06` §9.1, `08` §2 |
| **Affected requirements** | GATE-DATA-01, PR-EXP-01/02/03/04, NFR-REP-001/002 |
| **Decision owner** | Leader |

**Problem / evidence.** `06` §9.1 states "Training tasks remain BLOCKED until this gate is ACCEPTED."
The package has not been downloaded. **No access failure has been observed** and the official source
exposes a public download link — the only verified state is *not yet obtained*. `06` sets no
latest-safe date and defines no behaviour if acquisition or validation fails.

**Options.**

1. **No contingency; treat acquisition as a normal P0 task.** Simplest. Correct if the download
   succeeds, which is the expected case. Leaves the project with no defined response to failure.
2. **Define a trigger and a fallback now.** Set a point at which failure to obtain a usable package
   escalates RA-H01 to BLOCKER and opens a scope DR. Costs one paragraph today.
3. **Pre-approve a substitute dataset.** Rejected as premature — `00` §13 makes dataset substitution a
   protocol change requiring spec update, and there is no evidence it will be needed.

**Recommendation.** **Option 2.** Execute Spike D immediately; simultaneously record the escalation
trigger. This costs nothing and removes the only unbounded external dependency from the risk surface.

**Schedule impact.** None if acquisition succeeds. Prevents an unmanaged multi-day stall if it does not.

**Product / quality / scientific impact.** None. Protective only.

**Requested decision.** Approve Spike D as P0 and record the escalation trigger.

**Latest-safe resolution:** before the 30-day baseline is authored.

---

### DR-002 — Split path selection (Path A vs Path B)

> **OPEN** — explicitly kept open; requires dataset evidence from Spike D.

| Field | Content |
|---|---|
| **Source finding** | RA-H02 (HIGH) |
| **Affected specs** | `06` §6, `08` §3, `00` §11.1 |
| **Affected requirements** | GATE-SPLIT-01, PR-EXP-03, NFR-REP-002, TC-EXP-004, TC-EXP-008 |
| **Decision owner** | Leader / spec owner |

**Problem / evidence.** `06` §6 selects between Path A (80/20 development split, 54-case locked
holdout) and Path B (70/15/15 from the 100 development cases) based on whether official 54-case test
labels are present **and provenance-verified** in the obtained package.

**[UNRESOLVED]** The official source is internally inconsistent on this point: its historical challenge
description indicates test labels were withheld, while its current file-description section indicates
the Test Set contains 54 MRIs together with LA cavity labels. **This audit asserts neither reading.**
`06` §3 already requires the answer be established by auditing the obtained package.

**Options.**

1. **Resolve empirically from the downloaded package** (the procedure `06` §3 already mandates):
   inventory files per case in the test partition, check value distributions, verify the annotation is
   plausibly the LA cavity target, and record provenance evidence.
2. **Assume Path B pre-emptively** and treat any test labels found as a bonus. Safe but discards
   evaluation population if labels do exist.
3. **Assume Path A.** Rejected — would require unwinding the split if labels are absent or unverifiable,
   and `06` §6 forbids changing the split after results are observed.

**Recommendation.** **Option 1.** This is what the frozen spec already requires; the decision here is
only to schedule it as Spike D's first deliverable and to plan both branches until it resolves.

**Schedule impact.** Path A implies a 54-case holdout; Path B implies 15. This changes evaluation
wall-clock, precomputed-artifact volume, and the number of Inference & Review Mode demo cases.

**Scientific impact.** Directly determines the evaluation population size and therefore the
interpretability of the RQ-A comparison (see DR-014).

**Requested decision.** Approve resolving via Spike D; plan both branches until then.

**Latest-safe resolution:** **before training starts.** `06` §6: "may not change after test results are
observed."

---

### DR-003 — Re-sequence GATE-DEPLOY-01 to before API freeze

> **✅ APPROVED.** Deployment profile: **`LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS**.
>
> **`LOCAL_DEMO` here denotes the TRUST / EXPOSURE profile, not physical co-location.** The backend is
> **physically remote** from the demo venue; the trust boundary is **authorised private-overlay device
> membership**, not physical network membership. **This closes readiness condition C3** and resolves
> `GATE-DEPLOY-01` (DR-G06). **RA-H04** and **RA-H17** are **CLOSED / NOT APPLICABLE** under this profile.

| Field | Content |
|---|---|
| **Source findings** | RA-H04, RA-H17 (both HIGH, both conditional) |
| **Affected specs** | `00` §11.1, `09` §10, `11` §11.4, `12` §3, `12` §5, `12` §8.1 |
| **Affected requirements** | GATE-DEPLOY-01, NFR-SEC-002, TC-SEC-002 |
| **Decision owner** | Leader / Architect |

**Problem / evidence.** `11` §11.4 forbids parallel frontend/backend work on an interface until its
contract is frozen. `09` §10 / `12` §5 `REMOTE_DEMO` requires project-level authorization on all write
operations. `11` declares **zero** auth surface — the only trace is the `UNAUTHORIZED` code in `11` §10.
`00` §11.1 currently requires GATE-DEPLOY-01 only "before remote demo deployment", i.e. late. Choosing
`REMOTE_DEMO` after freeze would be a breaking schema change under `11` §11.2.

**Options.**

1. **Declare `LOCAL_DEMO` now.** ✅ **This option was approved** — see the approved outcome below. No public
   auth surface needed; `09` §10 and `12` §5 permit omitting authentication when the backend is bound to
   localhost or a trusted private network. **[APPROVED INTERPRETATION]** The approved profile satisfies
   "trusted private network" through an **authenticated private overlay (tailnet) membership boundary**,
   which is **not** the same as physical LAN co-location — see the approved outcome. Obligations that
   still apply: no public unauthenticated writes, no open directory listings, write actions attributable
   to the configured reviewer alias, secrets out of source control. Also removes RA-H17 entirely.
2. **Declare `REMOTE_DEMO` now**, and resolve both the authorization surface and the
   dataset-redistribution question (`12` §3 vs `09` §10) **before** API freeze.
3. **Leave the gate late** (current spec sequencing). Rejected — risks a breaking change to a frozen
   contract, which is exactly what `11` §11.4 exists to prevent.

**Recommendation.** **Re-sequence the gate to resolve before API freeze, in either direction.** The
audit takes no position on which profile is right — that is the leader's call — only that the choice
must be made while the contract is still open.

**Critical constraint on the outcome:** **`LOCAL_DEMO` must NOT inherit remote-authentication or
public-dataset-transport requirements.** If `LOCAL_DEMO` is chosen, RA-H04 and RA-H17 close with no
work. If `REMOTE_DEMO` is chosen, both must be resolved before freeze.

**Schedule impact.** `LOCAL_DEMO`: none. `REMOTE_DEMO`: adds an auth surface to the API contract plus a
dataset-terms review to the `12` §8.1 gate.

**Requested decision — GRANTED.** Re-sequencing accepted **and** the profile declared.

**Latest-safe resolution:** **RESOLVED — before API freeze, as required.**

### Approved outcome — `LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS

> **Critical interpretation.** `LOCAL_DEMO` describes the **trust / exposure profile**, **not** physical
> co-location. The backend is deliberately **physically remote** from the demo venue.

**Canonical topology.**

```text
Samsung Galaxy A17 5G          (single authorised physical demo device)
        |
        |  4G / 5G cellular Internet
        v
Authenticated private overlay  (Tailscale tailnet)
        |
        v
Remote Mac mini M2, 24 GB RAM
        +-- Backend API
        +-- Database / persistence
        +-- MRI volumes and masks
        +-- Metrics
        +-- Reconstruction / experiment artifacts
```

**Trust boundary.** **Authorised private-overlay (tailnet) device membership — not physical network
membership.** Only explicitly authorised overlay devices may reach the backend.

**The physical school/venue Wi-Fi is explicitly NOT required for the canonical demo, is NOT part of the
trusted boundary, and must NOT be treated as a trusted LAN.**

**Server.** Mac mini M2, 24 GB RAM, physically remote from the school/demo venue. May host the backend
API, persistence, MRI and mask artifacts, experiment metrics, precomputed prediction artifacts, and 3D
reconstruction artifacts. **Training is not required to occur on the Mac mini**; ML training may run on
separate compute hardware (relevant to Spike C0/C1, which measure whatever hardware is actually used).

**Mobile client.** The canonical demo is performed **only on the single authorised physical device**,
the **Samsung Galaxy A17 5G** declared under DR-006. Its exact hardware profile must still be recorded
**from the device** before Spike A/B measurements; **no hardware detail may be inferred**.

#### Public exposure — what the MVP does NOT require

- no public API endpoint;
- no public port forwarding;
- no public domain;
- no public unauthenticated server exposure;
- no public dataset-serving endpoint.

**Public/consumer authentication is therefore outside the MVP critical path.** **Do not introduce a public
authentication system merely because the Mac mini is physically remote** — the private authenticated
overlay *is* the network-access boundary.

#### Obligations explicitly RETAINED

Choosing this profile waives **only** the public-authentication and public-exposure obligations. Every
other `12` requirement still applies and remains acceptance-tested:

| Retained obligation | Source |
|---|---|
| Secrets protection; secrets never in source control | `12` §6, NFR-SEC-004, `TC-SEC-004` |
| No credentials embedded in the mobile binary | `12` §6, `12` §8.1, `TC-SEC-004` |
| Safe logging — no raw image/mask payloads, no credentials | `12` §7, NFR-SEC-003, `TC-SEC-003` |
| Dataset metadata allowlist | `12` §2, NFR-SEC-005, `TC-SEC-005` |
| No open artifact-directory enumeration | `12` §5, `12` §8.1 |
| Write attribution / reviewer identity where review provenance is stored | `12` §5, `05` Review, FR-REV-010 |
| Private-device access restriction — only authorised overlay devices | `12` §5, this decision |
| Exposure check: service not reachable beyond the trusted boundary | `12` §8.1, `TC-SEC-002` |

**[NOTE]** `TC-SEC-002` reads "REMOTE_DEMO uses TLS; LOCAL_DEMO exposure matches its approved
trusted-network profile." Under this profile the second clause is the operative one, and "approved
trusted-network profile" means **overlay membership**. The test must verify the backend is unreachable
from a non-overlay device, including one on the same physical Wi-Fi.

**[NOTE]** `12` §3's dataset-governance duties (preserve license terms, do not redistribute outside
permitted terms, record source/acquisition/checksum) are **unaffected** by this decision — they bind how the
team handles the package regardless of deployment topology.

#### Demo connectivity fallback — required, and bounded

The primary demo path is cellular → overlay → remote Mac mini. The future implementation plan **must
preserve a MINIMAL connectivity-failure fallback for the canonical hero demo**. A valid fallback may use
preloaded canonical demo artifacts, cached canonical case data, or cached/precomputed results sufficient to
demonstrate the critical hero flow.

> **Scope firewall on the fallback.** This is a **demo-resilience measure only**. It **must not** silently
> become a full offline-mode product requirement, a second application architecture, or a requirement to run
> backend functionality on the phone. Any such expansion is a scope change under `00` §13 and `03` §5.

The exact mechanism is decided **later during planning, after the artifact-transport spike (Spike E)** — it
is not a readiness condition. Note that `PR-CACHE-01` (offline-friendly caching) is a **SHOULD**; the
fallback must not be used to promote it into the MUST floor by the back door.

#### Consequences recorded

- **DR-003 = APPROVED**; **DR-G06 / GATE-DEPLOY-01 = RESOLVED**; **C3 = CLOSED**.
- **RA-H04 = CLOSED / NOT APPLICABLE** — no `REMOTE_DEMO` public authentication surface is required, so the
  API contract needs no public auth surface and the RA-H04 sequencing hazard cannot occur.
- **RA-H17 = CLOSED / NOT APPLICABLE** — no public dataset-serving endpoint is part of the MVP.
- **Do not propagate `REMOTE_DEMO` authentication or public dataset-transport requirements into the critical
  path.**
- **Spike E is materially affected:** the transport path is **cellular + overlay**, not a LAN. Latency,
  jitter and variability must be measured on that path, and Spike E now also informs the fallback
  mechanism.

---

### DR-004 — Ingestion contracts (**two** distinct contracts)

> **✅ APPROVED** by the specification owner's readiness review.
> **Outcome:** use an **offline CLI + versioned manifests**, and define **two separate contracts** —
> **(1) raw dataset / case ingestion** and **(2) precomputed experiment-artifact ingestion** — even though
> both use the same offline-CLI + versioned-manifest mechanism. They are not one contract with two modes.

| Field | Content |
|---|---|
| **Source finding** | RA-H03 (HIGH) |
| **Affected specs** | `01` §8, `03` PR-AN-01, `05`, `09` §4, `11` §6, `13` |
| **Affected requirements** | PR-AN-01, PR-EXP-01/02/03/04, PR-COHORT-01/02, FR-EXP-001..006 |
| **Decision owner** | Leader + Architect |

**Problem / evidence.** PR-AN-01 (live analysis) is **SHOULD**; `01` §8, `02` UC-17 and `03` all state
precomputed experiment results are the **critical-path fallback**. Ingestion of precomputed runs,
masks, metrics and reconstructions is therefore on the MUST path — but has no PR, no FR, no API
operation, and no acceptance test. Full-text search confirms "precomputed" appears only as a UI
labelling concern. Corroborating: of 22 MUST scope items in `01` §8, the only one with no PR ID is
*"3D NRRD MRI volume ingestion/validated access"*.

**What the decision must settle.**

1. The artifact layout the ML worker produces (directory structure + manifest schema), aligned with
   `08` §10's experiment manifest.
2. The ingestion mechanism: offline CLI, authenticated admin endpoint, or database migration/seed.
3. How `05` §4 provenance invariants and checksums are enforced **at ingest time**, so an ingested run
   is indistinguishable in provenance from a live one.
4. Idempotency and re-ingestion semantics (re-running after a corrected evaluation must not duplicate
   or silently mutate).
5. How `10` SCR-03/SCR-09's "precomputed vs newly executed" labelling is populated.
6. The acceptance test that proves all of the above.

**Options.**

1. **Offline CLI + manifest, run by the ML owner.** Simplest; no API surface change; no auth
   implications; testable in CI against fixtures. Requires filesystem access to the backend's store.
2. **Authenticated admin ingestion endpoint.** Works for a remote backend; adds API surface and
   interacts with DR-003.
3. **Seed/migration at deploy time.** Simple but poor for iterative re-ingestion during a 30-day project
   where evaluation code will change.

**Recommendation.** **Option 1** — **approved.** It adds no API surface, so it does not delay API freeze,
and it fits `09` §4's "large immutable artifacts in an artifact/file/object store" guidance.

### Approved outcome — two distinct contracts

The mechanism is shared (**offline CLI + versioned manifest**); the **contracts are separate** because they
carry different payloads, different provenance obligations, and different validation gates:

| | **Contract 1 — raw dataset / case ingestion** | **Contract 2 — precomputed experiment-artifact ingestion** |
|---|---|---|
| **Ingests** | `MRICase`, `MRIVolume`, `GroundTruthMask` | `Experiment`, `AnalysisRun`, `RawPredictionMask`, `ProcessedPredictionMask`, metric sets, `Reconstruction3D` |
| **Source of truth** | the validated dataset package | the ML worker's evaluation output |
| **Governing spec** | `06` §3 / §9 / §9.1 acquisition + validation gates; `05` immutable source artifacts | `08` §10 experiment manifest; `05` §4 provenance invariants |
| **Gated by** | **GATE-DATA-01** — refuses to ingest an unvalidated package | **GATE-SPLIT-01 + GATE-ML-01** — refuses artifacts whose manifest references an unfrozen split or recipe |
| **Mandatory checks** | NRRD loads; MRI/mask shape + spacing compatibility; foreground label mapping recorded; **axis-aligned geometry only, else `GEOMETRY_NOT_VALIDATED`** (DR-012 ✅); metadata allowlist per NFR-SEC-005 / `12` §2 | every `08` §10 manifest field present, including split/subset/evaluation-population manifest IDs and training/evaluation code + metric versions (SCQ-03); checksums; `05` §4 invariants; `precomputed` provenance flag set for `10` SCR-03/SCR-09 |
| **Idempotency** | re-ingest of an identical package is a no-op; a changed checksum is an error, never a silent overwrite | re-ingest after a corrected evaluation creates a **new** versioned record; never mutates an existing run |
| **Cardinality** | once per validated package | once per experiment evaluation, repeatable across the 7-experiment matrix |

**Why they must stay separate.** Contract 1 runs once, before any training, and its failure mode is an
invalid dataset. Contract 2 runs repeatedly, after each evaluation, and its failure mode is broken
provenance or a fabricated comparability claim. Collapsing them into one contract would either apply
dataset validation to model outputs or let experiment artifacts bypass GATE-SPLIT-01/GATE-ML-01.
Each contract therefore needs its **own manifest schema, its own validator, and its own acceptance test**.

**Schedule impact.** Must be settled before architecture freeze and before API freeze; the work itself
is modest but it is genuinely on the critical path.

**Requested decision — GRANTED.** Offline CLI + versioned manifests approved, with two separate contracts
as tabulated above. Adding the corresponding requirement and acceptance tests still proceeds through the
`00` §13 process so the work becomes traceable — **two** acceptance tests, one per contract.

**Latest-safe resolution:** **before architecture freeze and API freeze.**

---

### DR-005 — 3D error representation pipeline definition

> **OPEN** — explicitly kept open; requires Spike F evidence.

| Field | Content |
|---|---|
| **Source finding** | RA-B01 (**BLOCKER**, feature-scoped) |
| **Affected specs** | `03`, `04`, `07` §7, `10` SCR-05, `11` §7, `13` |
| **Affected requirements** | PR-ERR-03, PR-3D-05, FR-3D-007, FR-3D-008, TC-3D-005 |
| **Decision owner** | Leader + Imaging owner |

**Problem / evidence.** FR-3D-007 requires generating a 3D error representation; FR-3D-008 requires a
selected error region to navigate to contributing slices. `07` §7 specifies reconstruction only for a
single LA surface. Nothing defines error-mesh construction, region addressability, or region→slice
resolution. **[ASSUMPTION]** FN regions are thin shells that fragment badly under isosurface extraction,
so the representation choice determines whether FR-3D-008 is achievable at all.

**Options.**

1. **Three separate meshes (TP / FP / FN)** with independent visibility toggles. Simple mapping to
   `10` §7's error legend. Triples mesh budget and FN meshes may be degenerate.
2. **One LA surface with per-vertex error classification.** Single mesh, cheap to render, natural
   picking. Represents error *on the surface* only — cannot show volumetric FP islands away from the
   surface.
3. **Surface mesh + separate FP/FN connected-component markers.** Renders the LA surface once, then
   places addressable markers for the N largest error components, each carrying its own slice range.
   **[ASSUMPTION]** Best fit for FR-3D-008, since "region → contributing slices" becomes a stored
   property of each component rather than a runtime computation.
4. **Descope to 2D error only** and change PR-ERR-03/PR-3D-05 through formal change control.

**Recommendation.** **Run Spike F to compare options 1–3 empirically on a validated case**, then decide.
Do not decide from first principles — this is exactly what a spike is for. Option 4 is the honest
fallback if Spike F shows none of them work in the window; it is a MUST scope change and requires the
full `00` §13 process.

**Schedule impact.** Blocks only the 3D-error feature. FR-3D-001..006 proceed independently.

**Scientific / product impact.** PR-ERR-03 and PR-3D-05 are MUST; `03` §4 lists "3D is decorative only
and cannot link back to MRI slices" as a rejection condition. Option 4 would need explicit approval.

**Requested decision.** Authorise Spike F; approve a representation on its evidence.

**Latest-safe resolution:** before the 3D-error feature enters the 30-day baseline.

---

### DR-006 — Declare the target demo device before the mobile spikes

> **✅ APPROVED.** Target physical demo device: **Samsung Galaxy A17 5G**.
>
> **Before any Spike A/B measurement**, the declared hardware profile must be recorded **directly from the
> actual device** — see the evidence checklist below. **Do not infer unverified hardware details.**
> This closes the RA-H05 circularity: the device is now declared *before* the spikes, and
> `TECH_STACK_ADR.md` will **restate** the profile rather than originate it.

| Field | Content |
|---|---|
| **Source finding** | RA-H05 (HIGH) |
| **Affected specs** | `00` §11, `07` §12, `09` §7, `10` §9.1 |
| **Affected requirements** | GATE-MOB-01, NFR-PERF-001..004, NFR-USAB-005, TC-PERF-001..004, TC-USAB-005 |
| **Decision owner** | Leader |

**Problem / evidence.** `07` §12 requires the spikes to exercise NFR-PERF-001..004 "on the declared
target demo device". `10` §9.1 declares that device in `TECH_STACK_ADR.md`. `09` §7 and `00` §11.1 make
`TECH_STACK_ADR.md` the *output* of the spikes. The spikes require an input that only their own output
provides.

**Options.**

1. **Declare the device profile first as a standalone leader decision**, recorded in the Decision Log;
   `TECH_STACK_ADR.md` later restates it rather than originating it. Breaks the cycle at zero cost.
2. **Run spikes without a declared device**, then declare afterwards. Rejected: performance numbers
   from different candidate frameworks on different hardware are not comparable, so GATE-MOB-01 would
   be decided on impressions — which `09` §7 explicitly forbids.
3. **Amend `10` §9.1** to move the declaration out of the ADR. Requires a spec change for no added
   benefit over option 1.

**Recommendation.** **Option 1.** Declare OS/version, screen class, and GPU/CPU class for at least one
physical device (**[RECOMMENDATION]** a physical device rather than an emulator, since NFR-PERF-002's
FPS target and NFR-PERF-003's touch latency are not meaningfully measurable on an emulator).

**Schedule impact.** None — removes a blocker from Spike A/B start.

**Requested decision.** Declare the target demo device profile.

**Latest-safe resolution:** **before Spike A/B execution.**

### Approved outcome — declared target demo device

**Device: Samsung Galaxy A17 5G** (physical device, not an emulator — `NFR-PERF-002`'s FPS target and
`NFR-PERF-003`'s touch latency are not meaningfully measurable on an emulator).

**Mandatory evidence checklist — capture from the device itself before Spike A/B measurements.**
**[UNVERIFIED — to be filled from the device]** Every field below is deliberately left blank. This audit
does **not** state RAM, chipset, GPU, resolution or refresh-rate values for this model, because the
decision explicitly forbids inferring unverified hardware details.

| Field | Source | Value |
|---|---|---|
| Model identifier | device settings / `ro.product.model` | *(to record)* |
| Android version + build number | device settings / `ro.build.*` | *(to record)* |
| RAM and device performance profile | device settings / tooling | *(to record)* |
| CPU information available from tooling | tooling only — do not infer | *(to record)* |
| GPU information available from tooling | tooling only — do not infer | *(to record)* |
| Screen resolution and refresh rate | device settings / tooling | *(to record)* |
| Exact test configuration | spike harness | *(to record: build type, thermal state, battery/power mode, background load, screen brightness, and any throttling observed)* |

This profile becomes the reference for `NFR-PERF-001`–`004`, `TC-PERF-001`–`004`, `NFR-USAB-005` and
`TC-USAB-005` (the five consecutive canonical smoke runs), per `10` §9.1. Record it under
`management/spikes/` alongside the spike results.

**Unblocks:** Spike A, Spike B, Spike E.

---

### DR-007 — Add an ML compute feasibility spike as a GATE-ML-01 prerequisite

> **✅ APPROVED.** Spike C is approved, and **split into two stages** by the same review:
> **Spike C0** may use synthetic data for hardware / memory / basic-throughput feasibility;
> **Spike C1** must confirm feasibility on a small representative **validated real subset after Spike D**.
> **GATE-ML-01 may close only after Spike C1.** See `TECHNICAL_SPIKES_REQUIRED.md`.

| Field | Content |
|---|---|
| **Source finding** | RA-H06 (HIGH) |
| **Affected specs** | `00` §11, `07` §2, `07` §12, `08` §2 |
| **Affected requirements** | GATE-ML-01, ADR-ML-001, PR-EXP-01/03 |
| **Decision owner** | Leader + ML owner |

**Problem / evidence.** `07` §2 requires `ADR-ML-001` to record "compute/memory feasibility evidence"
before the six core runs launch. Full-text search across all 18 spec files returns only Spike A and
Spike B, both mobile. **No procedure anywhere produces the evidence GATE-ML-01 requires.**

**Why it cannot be deferred.** `08` §2 requires the DINOv2 recipe be identical across
`EXP-D-025/050/100`. If the frozen recipe does not fit the available hardware or calendar, the discovery
happens after the gate and invalidates completed runs.

**Options.**

1. **Add Spike C as a formal GATE-ML-01 prerequisite.** Produces per-run wall-clock on actual hardware,
   peak memory, effective output resolution versus LA boundary thickness, and an explicit statement of
   whether 6 runs + 1 ablation fit the remaining calendar.
2. **Fold the evidence into the first training run.** Rejected: by then the recipe is already frozen.
3. **Rely on published figures from the reference paper.** Rejected: different dataset, different
   hardware, and `00` §4.1 explicitly says the paper is a hypothesis source, not a protocol to inherit.

**Recommendation.** **Option 1.** Spike C also produces the input for DR-011 (normalization policy) and
sizes the training tasks for the 30-day baseline.

**Schedule impact.** Adds a spike; removes the risk of discovering infeasibility mid-matrix.

**Requested decision.** Authorise Spike C as a GATE-ML-01 prerequisite.

**Latest-safe resolution:** **before GATE-ML-01 / matrix training.**

---

### DR-008 — Freeze the geometry contract: axis convention, index order, and tolerance

> **DR-008a (axis + index convention): ✅ APPROVED** — the canonical indexing convention is **frozen**
> below. **This closes readiness condition C5.**
>
> **DR-008b (3D→slice tolerance): FROZEN by SCQ-06.** Canonical fixtures require **exact** slice mapping;
> decimated real-mesh picking error is **at most ±1 source slice**. Spike B **validates conformance**; it
> does not re-derive the value, and it **must not be silently relaxed**.
>
> **DR-008c (mesh / decimation budget): OPEN.** Spike B must determine the mesh and decimation budget
> **while respecting the fixed maximum real-mesh picking error of ±1 source slice**. A decimation level
> that exceeds ±1 slice is not acceptable regardless of its frame rate.

| Field | Content |
|---|---|
| **Source findings** | RA-H07, RA-H11, RA-H14 (all HIGH) |
| **Affected specs** | `05`, `07` §3, `07` §8, `09` §6, `11` §4, `13` |
| **Affected requirements** | FR-MRI-001, FR-3D-001..006, NFR-MAINT-002, NFR-REL-003, TC-3D-003, TC-3D-004, TC-MAINT-002 |
| **Decision owner** | Leader + Architect + Imaging owner |

**Problem / evidence.** Three linked gaps in the highest-risk module.

- **(a) Axis / index-order convention.** `05` declares `shape_xyz`; `07` §3 requires the slice extraction
  axis be "defined and versioned" without stating it; `11` §4 exposes a flat `{slice_index}` and asks
  the geometry response to expose an "axis/slice convention" that no file fixes. **[ASSUMPTION]** NRRD
  and NumPy conventionally present volumes in an order that does not match a literal `x,y,z` reading, so
  there are at least two defensible readings.
- **(b) 3D→slice tolerance.** The word *tolerance* appears **exactly once** in the entire spec set —
  in `TC-3D-004` — and is never given a value. The acceptance test for a MUST requirement has no
  determinate pass condition.
- **(c) Mesh decimation budget.** `07` §7 permits simplification "only if mapping remains valid" with no
  triangle budget and no bound on how much accuracy may be traded for frame rate.

These are one decision because (c) determines (b): decimation moves vertices, degrading 3D→slice
accuracy.

**What the decision must settle.** Canonical array index order; which axis `slice_index` traverses;
in-plane origin corner and axis directions; whether `shape_xyz` is reported in that order or in file
order; the numeric 3D→slice tolerance with its rationale; and the mesh triangle budget with its measured
accuracy cost.

**Recommendation.** **[RECOMMENDATION]** Fix (a) by declaration now — it costs nothing and prevents the
project's highest-probability P0 defect. Derive (b) and (c) together from Spike B's measured
frame-rate/accuracy frontier on the declared device. Encode all three in the `09` §6 canonical fixture
set with a worked example, so backend and mobile provably agree.

**[RECOMMENDATION]** A defensible starting point for (b): exact slice index for interior test points,
±1 slice for surface-tangent points where the picking ray is near-parallel to the slice plane. The
leader sets the final value.

**Schedule impact.** (a) is immediate and unblocks parallel backend/mobile work. (b)/(c) follow Spike B.

**Requested decision.** Approve the convention; authorise Spike B to produce the tolerance and mesh
budget.

**Latest-safe resolution:** (a) **RESOLVED — approved below**; (b) **FROZEN by SCQ-06**, Spike B validates;
(c) **OPEN** — before Spike B acceptance and before FR-3D-002/005 can reach ACCEPTED.

### Approved outcome (a) — frozen canonical indexing convention

This is the single shared convention required by `07` §8 and `09` §6. Backend, worker and mobile must all
conform to it at their boundaries.

```text
canonical voxel coordinate = (x, y, z)

  x = source image COLUMN
  y = source image ROW
  z = source SLICE INDEX

  shape_xyz    = [Nx, Ny, Nz]
  spacing_xyz  = [Sx, Sy, Sz]

  API slice_index = z,  valid range 0 .. Nz-1

  a logical source slice has shape [Ny, Nx]      (rows × columns)

  source pixel (u, v)  →  voxel (x = u, y = v, z = slice_index)

  origin: top-left source pixel is (0, 0)
          +x points RIGHT
          +y points DOWN
```

**Library memory order is explicitly NOT part of the contract.** Whatever axis order a given NRRD reader,
array library, or rendering API uses internally is an implementation detail. **Adapters must conform to
this canonical representation at every boundary** — API payloads, artifact metadata, geometry fixtures,
and the mobile client's model of a slice.

**Consequences.**

- `05` `shape_xyz` / `spacing_xyz` are read in canonical `(x, y, z)` order, not file order.
- `11` §4's `GET /cases/{case_id}/slices/{slice_index}/mri` traverses **z**; range validation is
  `0 ≤ slice_index ≤ Nz-1`, and out-of-range returns `SLICE_OUT_OF_RANGE`.
- `11` §4's geometry response must state this convention explicitly as its "axis/slice convention".
- The `09` §6 canonical fixture set must encode a worked example in these terms, and
  `TC-MAINT-002` verifies backend and mobile both conform.
- `07` §3's "source slice extraction axis" is now fixed: **z**.
- Brush coordinate mapping (`07` §9, FR-REV-011) inverts the display transform to `(u, v)` and writes
  voxel `(x=u, y=v, z=slice_index)`.

**This resolves RA-H07 and closes readiness condition C5.**

---

### DR-009 — Review semantics: revision field, variant scope, and session lifetime

> **✅ APPROVED.** All three sub-questions are decided — see the approved outcome below.
> Together with SCQ-01 (Review, ReviewedMask and Finding are independent aggregates; a Finding is not
> required for a correction), this resolves **RA-H08** and **RA-M10**.

| Field | Content |
|---|---|
| **Source findings** | RA-H08 (HIGH), RA-M10 (MEDIUM) |
| **Affected specs** | `05`, `09` §3, `10` §5, `11` §2, `11` §8 |
| **Affected requirements** | PR-REV-01/02, PR-PROV-01, FR-REV-001, FR-REV-005/006/007, FR-REV-008..010, NFR-REL-002, TC-REV-001, TC-REV-004, TC-REL-002 |
| **Decision owner** | Leader + Architect |

**Problem / evidence.** Three linked gaps in the review model.

- **(a) Missing revision field.** `11` §2 requires stale-write rejection via a version/ETag/revision
  mechanism; `11` §8 shows `expected_revision`; `11` §10 defines `STALE_REVISION`. `05` Review carries
  **no** such field (verified absent). `TC-REV-001` is unimplementable as specified.
- **(b) No prediction-variant scope.** `05` Review is keyed to `analysis_run_id` with one `status` and
  one `latest_reviewed_mask_id`, while a run may hold both raw and processed prediction masks and
  `10` SCR-03 requires the active variant be shown with "no silent switching". A run whose raw
  prediction is ACCEPTED but whose processed prediction is FLAGGED cannot be represented.
- **(c) Undefined session lifetime.** `04` FR-REV-007 references "the current unsaved edit session"
  without defining it. `09` §3 places the working buffer on mobile; `11` §8 defines a server-side
  working-mask `PUT`. Undefined: restart survival, cancel semantics, variant-switch mid-session, and
  whether undo/redo scope is per-slice or per-session.

**Options for (b).** One Review per run (simple; cannot express divergent variant states) versus one
Review per run+variant (expressive; more rows, and `11` §8's `POST .../reviews` needs a variant
parameter).

**Options for (c).** Client-authoritative buffer with commit-only sync (simplest; loses work on restart)
versus server-authoritative working mask via the `11` §8 `PUT` (survives restart; more traffic;
`NFR-PERF-003`'s 100 ms stroke feedback must remain local either way).

**Recommendation.** **[RECOMMENDATION]** Add the revision field (a) — not really a choice, the API
already requires it. For (b) and (c), the leader decides; whatever is chosen must be propagated to `05`,
`11` §8, and `10` SCR-06 together so the three do not drift.

**Schedule impact.** Blocks V4 (review/correction) schema and API work.

**Requested decision — GRANTED.** Full approved outcome:

### Approved outcome — review scope, concurrency, and edit-session semantics

**Scope and identity**

1. A **Review is scoped to the exact `source_mask_id` and an explicit prediction variant.** A run whose
   raw prediction is ACCEPTED and whose processed prediction is FLAGGED is therefore representable — they
   are distinct Reviews. `11` §8's review-creation operation must carry the source mask identity and
   variant.

**Concurrency**

2. Review carries a **monotonic `revision`**.
3. Stale writes supply **`expected_revision`** and are rejected with **`STALE_REVISION`** (`11` §10).
   Silent last-write-wins remains prohibited (`11` §2).

**Working buffer — client and server responsibilities**

4. **Mobile maintains the immediate local brush working buffer.**
5. The **server may hold the asynchronously synced working draft**.
6. **Interactive brush feedback never waits for the network.** This is what makes `NFR-PERF-003`'s 100 ms
   stroke-feedback target achievable, and it means the `11` §8 working-mask `PUT` is an **async sync**
   channel, not the interaction path.

**Restart and durability — stated honestly**

7. **Restart recovery is guaranteed only to the last successfully synced working draft. Unsynced strokes
   may be lost.** This is an accepted, documented limitation, not a defect. `NFR-REL-002` protects
   *persisted review artifacts* from silent corruption; it does not promise durability for an unsynced
   in-flight stroke. `TC-REL-002` must be written against this boundary, and the UI should make the sync
   state legible so a reviewer is never misled about what is safe.

**Edit-session operations**

8. **Undo/redo is scoped to the current local editing session** (FR-REV-005/006).
9. **Cancel** discards uncommitted draft state and **never deletes prior immutable `ReviewedMask`
   versions**.
10. **Reset-to-source** restores the **exact declared source mask** (FR-REV-007, `10` §5).
11. **Commit** creates a **new immutable `ReviewedMask` version** and **never overwrites the source
    prediction** (FR-REV-008/009, PR-PROV-01, NFR-REL-001).

**Resolves RA-H08 and RA-M10.** Unblocks the V4 review/correction schema and its API surface.

**Latest-safe resolution:** **before V4 implementation and before API freeze.**

---

### DR-010 — Operational definitions: "outlier" and "worst slice"

> **✅ APPROVED.** Both definitions are frozen below. Resolves **RA-H09** and **RA-M13**.

| Field | Content |
|---|---|
| **Source findings** | RA-H09 (HIGH), RA-M13 (MEDIUM) |
| **Affected specs** | `03`, `04`, `07` §6, `08` §5, `10` SCR-01/SCR-04, `11` §3, `16` §2 |
| **Affected requirements** | PR-COHORT-02, PR-ERR-02, FR-EXP-006, FR-ERR-003, UC-12, TC-EXP-006, TC-ERR-003 |
| **Decision owner** | Leader + Data Science owner |

**Problem / evidence.** Both are MUST behaviours on the demo's hero path with no operational definition.

- **"Outlier"** is required by PR-COHORT-02, displayed by SCR-01, returned by `11` §3, exercised by
  UC-12, and is step 2 of the `16` §2 demo narrative. No file defines it.
- **"Worst slice"** is required by FR-ERR-003 and SCR-04. Under `07` §6's empty-slice rule, per-slice
  Dice is `0` when exactly one of GT/prediction is empty and `NOT_APPLICABLE` when both are — so a naïve
  ranking ties genuine anatomical failures with stray background voxels.

**Options for "outlier".** Bottom-N by case-level 3D Dice (simple, always returns results, no
distributional assumption) · below `Q1 − 1.5·IQR` (statistically conventional, may return an empty set)
· below an absolute Dice threshold (interpretable, arbitrary).

**Options for "worst slice".** Rank all slices by per-slice Dice ascending (naïve; dominated by
background-slice noise) · **rank only slices with a non-empty reference**, ascending, with FP-voxel
count as a documented tiebreak (**[RECOMMENDATION]**) · rank by absolute FP+FN voxel count (biases
toward large slices).

**Recommendation.** **[RECOMMENDATION]** Fix one rule for each, state the metric and prediction variant
each uses, **return the selection from the API rather than re-deriving it client-side** (so the demo is
reproducible between builds), and have TC-EXP-006 and TC-ERR-003 assert against the chosen rules.

**Schedule impact.** Blocks SCR-01 outlier entry points, UC-12, and the jump-to-worst action.

**Requested decision — GRANTED.** Both definitions frozen:

### Approved outcome — operational "outlier"

> The **three successfully evaluated cases with the lowest case-level 3D Dice**, for the **explicitly
> selected experiment and prediction variant**.

**Tie-break order:** higher absolute **FP+FN voxel count** first, then **stable `case_id`**.

Notes that follow from this definition:

- **"Successfully evaluated" only.** Failed or excluded cases are not outlier candidates — consistent with
  `08` §8.1, which requires failed cases be reported separately and never silently dropped. The outlier
  list must therefore be read alongside the intended-vs-successful N (`NFR-REP-003`).
- **Experiment and variant are explicit inputs**, never defaults — `11` §6's prohibition on silently
  substituting processed for raw applies here too.
- **Fixed cardinality of three** makes the selection deterministic and always non-empty for any cohort of
  ≥ 3 successfully evaluated cases, which an IQR rule would not guarantee.
- The API returns the selection so the client does not re-derive it; `TC-EXP-006` asserts against it.

### Approved outcome — "worst slice"

Among slices with **non-empty ground truth**, rank by:

| Order | Key | Direction |
|---:|---|---|
| 1 | per-slice Dice | **ascending** |
| 2 | FP+FN voxel count | **descending** |
| 3 | `slice_index` | **ascending** |

**Exclusions and separation of concerns:**

- **Both-empty `NOT_APPLICABLE` slices are excluded** from ranking, consistent with `07` §6's rule that
  they are excluded from the error-profile mean and distribution.
- **FP-only background slices** (empty GT, non-empty prediction) **may be surfaced separately as
  problematic FP slices**, but they **do not define the primary "worst anatomical slice"**. This is the
  key correctness point: under `07` §6 an FP-only slice scores Dice `0` and would otherwise tie with — and
  often outrank — genuine anatomical failures, sending the `16` §2 demo to an uninformative slice.
- The third key (`slice_index` ascending) guarantees a stable, reproducible result across builds.

`FR-ERR-003` and `10` SCR-04 implement the primary ranking; a separate problematic-FP-slice view is
permitted and must be labelled distinctly. `TC-ERR-003` asserts against the primary ranking.

**Resolves RA-H09 and RA-M13.**

**Latest-safe resolution:** before SCR-01 / SCR-04 implementation.

---

### DR-011 — Normalization statistic policy across data fractions

> **✅ APPROVED — Option 3.** **No cohort-fitted normalization statistics** across data-fraction
> experiments. Use documented **per-image / per-volume normalization**, plus **fixed pretrained-model
> constants** where the backbone requires them, applied **identically across model families and across all
> data fractions**. This removes the RQ-A confound at source. Record in `preprocessing_version` so it
> appears in every `08` §10 manifest. Spike C1 must confirm conformance.

| Field | Content |
|---|---|
| **Source finding** | RA-H16 (HIGH) |
| **Affected specs** | `06` §7, `07` §3, `08` §2, `08` §4 |
| **Affected requirements** | RQ-A, PR-EXP-03, FR-EXP-001/004, NFR-REP-001, GATE-ML-01, TC-EXP-004 |
| **Decision owner** | Leader + ML owner |

**Problem / evidence.** `07` §3 requires normalization statistics be "fit on the training partition
only". `06` §7 and `08` §4 make the training partition differ by data fraction. The instruction
therefore has two valid readings that can produce different answers to the project's primary research
question.

**Options.**

1. **Refit per fraction.** Each run computes statistics from its own training subset. Faithful to a real
   scarcity scenario; normalization varies between conditions, so measured degradation partly reflects
   normalization drift rather than label scarcity.
2. **Freeze once from the full training partition**, reused across all fractions. Isolates the
   labelled-data variable cleanly; leaks full-cohort intensity statistics into the 25% condition, so the
   scarcity condition is partly idealised.
3. **Per-image / per-volume normalization** using only the current image. **[SPEC]** Already explicitly
   permitted by `07` §3 ("allowed if documented consistently"). Removes the confound entirely because no
   statistic is learned from any partition.

**Recommendation.** **[RECOMMENDATION]** Option 3 is the cleanest answer to RQ-A and requires no spec
change. If a dataset-level statistic is preferred for model quality, option 2 better isolates the
variable under study. Option 1 should be chosen only deliberately, with the confound stated in the
report.

**Scientific impact.** Direct. RQ-A asks whether DINOv2 degrades *less* than UNet as labels are reduced;
under option 1 part of any measured degradation is attributable to normalization rather than scarcity.

**Requested decision.** Fix one policy, apply it identically to UNet and DINOv2, and record it in
`preprocessing_version` so it appears in every `08` §10 manifest.

**Latest-safe resolution:** **before GATE-ML-01 / matrix training.**

---

### DR-012 — Declare the geometry support boundary (axis-aligned only)

> **✅ APPROVED — Option 1.** The MVP supports **validated axis-aligned geometry only**. Unsupported
> geometry is **rejected with `GEOMETRY_NOT_VALIDATED`** (`11` §10), enforced at the `06` §4 validation
> gate and in ingestion Contract 1 (DR-004). Spike D must confirm the obtained package falls inside this
> boundary; if it does not, RA-M02 escalates and a new DR is required.

| Field | Content |
|---|---|
| **Source finding** | RA-M02 (MEDIUM) |
| **Affected specs** | `05`, `06` §4, `07` §8, `11` §10 |
| **Affected requirements** | GATE-DATA-01, FR-CASE-003, FR-3D-003, NFR-REL-003, PR-SCI-02, TC-REL-003 |
| **Decision owner** | Leader + Imaging owner |

**Problem / evidence.** `05` MRIVolume lists `origin_xyz` and `direction_or_orientation` as "if
available"; `06` §4 requires orientation/direction compatibility be determined during validation;
`11` §3's case-detail example shows both as `null`, marked illustrative. Whether the obtained package
contains a non-identity direction matrix is unknown until Spike D runs.

**Options.**

1. **Declare an axis-aligned-only support boundary** and reject unsupported geometry using the
   `GEOMETRY_NOT_VALIDATED` code `11` §10 already defines, enforced at `06` §4's validation gate.
2. **Implement general oblique support.** **[ASSUMPTION]** Substantially more work across the worker,
   the geometry contract, and the mobile 2D↔3D mapping; justified only if the package requires it.
3. **Resample any oblique volume to axis-aligned at ingest.** Preserves all cases but adds a
   preprocessing step that must itself be versioned and validated, and changes the geometry recorded
   against the artifact.

**Recommendation.** **Option 1**, confirmed against the validated package in Spike D. Treat this as a
declared **scope boundary** rather than an unimplemented feature — the rejection path already exists in
the API contract. Escalate to option 2 or 3 only if Spike D finds unsupported geometry.

**Schedule impact.** None if the package is axis-aligned.

**Requested decision.** Approve the axis-aligned support boundary pending Spike D confirmation.

**Latest-safe resolution:** **before geometry contract freeze.**

---

### DR-013 — Add a technical-block ownership and reviewer matrix

> **✅ APPROVED.** Two parallel ownership axes recorded below — **A: mobile vertical ownership (V1–V4,
> preserved)** and **B: technical-block ownership**. **This closes readiness condition C7** and resolves
> **RA-M04**.

| Field | Content |
|---|---|
| **Source finding** | RA-M04 (MEDIUM) |
| **Affected specs** | `14` §3, `14` §5, `14` §6, `15` §6, `16` §5.1 |
| **Affected requirements** | PR-MOBILE-03, NFR-MAINT-001, TC-TEAM-001, TC-MAINT-001 |
| **Decision owner** | Leader |

**Problem / evidence.** `14` §3's four verticals — V1 (2D MRI interaction), V2 (3D/spatial error),
V3 (experiment/cohort analysis), V4 (review/findings) — are all mobile-facing. Backend API, ML training,
imaging pipeline, and integration have **no named owner or reviewer**, while `14` §5–§6 forbid a block
only one person can run or debug. These unowned blocks carry RA-B01, RA-H07, RA-H16 and most of the
P0-class risk.

**Constraint on any solution.** **V1–V4 must be preserved.** They exist partly to satisfy the mobile
course requirement that every member analyse, design, implement, and defend at least one mobile
function (`00` §3, PR-MOBILE-03, `16` §5.1 CLO3). This DR proposes an **addition**, not a replacement.

**Options.**

1. **Add a second ownership axis** over the same four members: technical blocks (ML training,
   imaging/geometry, backend/persistence, integration/CI), each with a primary owner and a secondary
   reviewer, cross-cutting the V1–V4 mobile-function assignments.
2. **Extend the V1–V4 definitions** to absorb backend/ML work. Rejected — it dilutes the mobile-function
   evidence chain that `TC-TEAM-001` requires.
3. **Leave unowned.** Rejected — violates `14` §5 and leaves the geometry contract, which is the
   project's highest-risk shared module, without a named owner.

**Recommendation.** **Option 1.** **[RECOMMENDATION]** Assign the geometry/coordinate contract its own
named owner and reviewer regardless of how the other blocks are allocated — it spans V1 and V2, is the
subject of three HIGH findings, and `13` §12 classifies its failure mode as P0.

**Schedule impact.** None to technical work. Required before task allocation and the 30-day baseline.

**Requested decision — GRANTED.** Option 1 approved; owners and reviewers assigned.

**Latest-safe resolution:** **RESOLVED — before 30-day task allocation, as required.**

### Approved outcome — two parallel ownership axes

#### Team composition

| # | Member | Role |
|---:|---|---|
| 1 | **Phạm Tuấn Anh** | Team Leader |
| 2 | **Vũ Hùng Anh** | Member |
| 3 | **Bế Quốc Khánh** | Member |
| 4 | **Nguyễn Gia Đức Trung** | Member |

All four have broadly similar exposure to the project domains. Phạm Tuấn Anh and Vũ Hùng Anh have
materially stronger overall experience and capability, and are **deliberately positioned as secondary
reviewers and safety nets rather than as the owners of every critical block** — see the anti-bottleneck rule
below.

#### Axis A — Mobile vertical ownership (`14` §3; PRESERVED)

This axis **must remain**: every member must analyse, design, implement, test, demonstrate and defend at
least one mobile function end-to-end for the university course (`00` §3, PR-MOBILE-03, `16` §5.1 CLO3,
`TC-TEAM-001`).

| Vertical | Scope | Primary Owner | Secondary Reviewer |
|---|---|---|---|
| **V1** | Case Explorer / 2D MRI | **Phạm Tuấn Anh** | Vũ Hùng Anh |
| **V2** | 3D / Spatial Error Investigation | **Vũ Hùng Anh** | Phạm Tuấn Anh |
| **V3** | Experiment / Cohort Analysis | **Bế Quốc Khánh** | Vũ Hùng Anh |
| **V4** | Review / Findings | **Nguyễn Gia Đức Trung** | Phạm Tuấn Anh |

#### Axis B — Technical-block ownership (NEW; additional, not a replacement)

| Block | Primary Owner | Secondary Reviewer |
|---|---|---|
| **Imaging / Geometry / canonical 2D↔3 contract** | **Vũ Hùng Anh** | Phạm Tuấn Anh |
| **ML Training / Evaluation Pipeline** | **Bế Quốc Khánh** | Vũ Hùng Anh |
| **Backend / Persistence / Raw Dataset Ingestion / Experiment Artifact Ingestion** | **Nguyễn Gia Đức Trung** | Phạm Tuấn Anh |
| **Integration / CI / Cross-contract Coordination** | **Phạm Tuấn Anh** | Vũ Hùng Anh |

Every member is a **Primary Owner on both axes**, and every block has a **named Secondary Reviewer** — which
is what `14` §5–§6 require and what RA-M04 flagged as missing.

**Note.** RA-H07 / RISK-3D-GEOMETRY asked for a named owner of the geometry contract, which `13` §12 treats
as a P0-class defect class. That is now **Vũ Hùng Anh (primary) / Phạm Tuấn Anh (secondary)**, and it is
coherent with V2 ownership since both concern the 2D↔3 mapping.

#### Ownership governance

**A Primary Owner is accountable for:** understanding the block; implementation; tests; acceptance
evidence; debugging; technical handoff; block documentation; and being able to explain and defend the work.

**Primary ownership does NOT confer authority to silently change** any of: frozen product requirements,
dataset protocol, split protocol, ML protocol, metric semantics, geometry semantics, domain-model
semantics, API contracts, deployment policy, or acceptance criteria. Every such change remains governed by
the existing gate / Decision Request / specification change-control process (`00` §13, `17` §11).

**A Secondary Reviewer must be able to:** independently explain the block; review its design; review its
PRs and evidence; run or reproduce critical workflows where applicable; and help debug it when the Primary
Owner is blocked. This is the `14` §6 knowledge-handoff rule made concrete.

#### Anti-bottleneck rule — binding

> **Do not move ML ownership from Bế Quốc Khánh to Vũ Hùng Anh merely for short-term speed.**
> **Do not move Backend ownership from Nguyễn Gia Đức Trung to Phạm Tuấn Anh merely for short-term speed.**

Bế Quốc Khánh and Nguyễn Gia Đức Trung are **genuine Primary Owners, not assistants to the stronger
members**. The stronger members are positioned as reviewers and safety nets **specifically to avoid a
two-person implementation bottleneck**, which `14` §5 forbids and which would also break `TC-TEAM-001`.

**[NOTE for the 30-day baseline]** `15` §18 Level 1 (reallocate) and Level 2 (pair) remain available under
genuine recovery conditions — but reallocation is a **leader recovery decision with recorded rationale**,
not a default response to a slow day. Pairing the stronger member onto a struggling block preserves
ownership; transferring ownership does not.

#### Capacity note carried forward

All four members declare **8 hours/day gross availability** (condition C8). **This is gross availability
only.** The future implementation baseline **must not** treat `4 × 8h = 32h/day` as guaranteed
feature-development capacity.

Phạm Tuấn Anh's time must later reserve explicit capacity for: **Project Control; integration
coordination; code/review work; EOD processing; Claude orchestration; blocker handling; cross-contract
coordination.** Note he is simultaneously V1 Primary Owner, Integration/CI Primary Owner, and Secondary
Reviewer on three other blocks — a real load that the baseline must price in.

**No effective-capacity number is invented here.** `15` §5 requires planning from actual available hours;
the reserved-time figure is a leader decision to be recorded during baseline planning. **RISK-CAP-01 stays
MEDIUM.**

---

### DR-014 — Uncertainty reporting on the primary comparison

> **✅ APPROVED — Option 1, with the interval level fixed.** Require **95% confidence intervals** for
> primary cohort metrics and for paired differences, plus an explicit limitations section.
> **No formal power-analysis gate.**

| Field | Content |
|---|---|
| **Source finding** | RA-M01 (MEDIUM) |
| **Affected specs** | `08` §7, `03` PR-SCI-03, `16` §3 |
| **Affected requirements** | RQ-A, PR-SCI-03, TC-SCI-003 |
| **Decision owner** | Leader + Data Science owner |

**Problem / evidence.** `08` §7 requires N, mean, standard deviation, median, distribution
visualisation, paired comparison, and excluded-case identification; significance testing is optional.
Confidence intervals are not required anywhere. **[ASSUMPTION]** Under either split path the holdout is
small relative to an *interaction* effect (does degradation differ between families across three
fractions), which is inherently harder to resolve than a single-condition difference.

**Why it matters.** PR-SCI-03 correctly protects against forcing a positive result. Nothing protects
against the mirror error: reporting a null result as evidence of no difference when the evaluation may
simply not be able to distinguish the two.

**Options.**

1. **Require confidence intervals** on per-case metric means and on paired differences, plus an explicit
   limitations section covering evaluation size. Low cost — the per-case metrics are already persisted
   by `08` §11.1.
2. **Require a limitations paragraph only**, without intervals. Cheaper, weaker.
3. **Require a formal power analysis.** **Explicitly NOT recommended** — disproportionate for a
   university MVP and not a reasonable planning gate.

**Recommendation.** **Option 1.** It strengthens PR-SCI-03 rather than adding scope, and the plotting is
already required by `08` §7's distribution visualisation.

**Requested decision.** Approve requiring uncertainty reporting on the primary comparison.

**Latest-safe resolution:** before the final report is written. Does not gate implementation.

---

## Part 2b — Amendments recorded during execution

Amendments change an already-approved DR. They are recorded here rather than edited silently into the
original text, so the original decision and the reason it changed both remain readable.

---

### DR-001a — The Day-1 trigger is evaluated at the end of **Day 2**

| Field | Value |
|---|---|
| **Amends** | DR-001 ✅ — dataset acquisition contingency protocol |
| **Proposed by** | Project Control |
| **Decided by** | Phạm Tuấn Anh — Team Leader |
| **Date** | 2026-09-11 |
| **Status** | ✅ **APPROVED** |

**What DR-001 says.** *"If, by the end of the first execution day, there is no usable official package
locally, or package/provenance validation exposes a blocking defect preventing `GATE-DATA-01` acceptance —
then `RA-H01` escalates to BLOCKER and the dataset contingency process opens."*

**What actually happened.** Day 1 (2026-09-10) was recorded as the planned execution start in
`MASTER_PLAN_30_DAYS.md` §1, but **the cutover was never declared**: no `DAY01_CUTOVER_RECORD.md`, no
spike `ACTIVE`, `started_at` null on all seven, `dr_001_clock_running: false`. The day was spent closing
Day-0 debt, generating the baseline, and building the Day-01 control package. **Spike D never started, so
the trigger was never evaluated.**

**The amendment.** The trigger is evaluated at the **end of Day 2 (2026-09-11)** instead. **Its content
and thresholds are unchanged** — same two conditions, same `RA-H01` → BLOCKER consequence, same
prohibition on silent dataset substitution.

**Why the trigger is NOT treated as already fired.** By the letter, Day 1 ended with no usable package
locally, which reads as the trigger condition. But the cause was that **execution had not begun**, not
that the dataset is problematic. Recording it as fired would attribute a dataset failure that has not
been demonstrated, and would open a contingency process against a package nobody has yet tried to
acquire. That would damage the trigger's meaning rather than honour it.

**This is a deliberate deviation from the letter of DR-001, decided by the leader, with the reason
recorded.** It is not a reading of what DR-001 already said.

**Binding consequence.** If the trigger is **again** not evaluated at the end of Day 2, it will have
slipped two consecutive days and lost its protective purpose entirely. At that point the failure is a
project-control failure, not a dataset question, and it escalates on its own terms.

---

### DR-003a — Canonical private overlay is **ZeroTier**

| Field | Value |
|---|---|
| **Amends** | DR-003 ✅ — `LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS |
| **Proposed by** | Nguyễn Gia Đức Trung (Spike E owner), 2026-09-10 |
| **Decided by** | Phạm Tuấn Anh — Team Leader |
| **Date** | 2026-09-11 *(approval given 2026-09-10; recorded here)* |
| **Status** | ✅ **APPROVED** |

**Change.** The concrete private-overlay product in the canonical demo topology changes from
**Tailscale** to **ZeroTier**.

```text
Samsung Galaxy A17 5G
        |  real 4G / 5G cellular Internet
        v
Authenticated private overlay  (ZeroTier network)      <-- was: Tailscale tailnet
        v
Remote Mac mini M2, 24 GB RAM
```

**Trust boundary** becomes *authorised **ZeroTier network** device membership* — still **NOT** physical
network membership.

**What does NOT change — every substantive part of DR-003 survives:**

| Unchanged |
|---|
| Profile stays **`LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS** |
| The backend stays **physically remote** from the demo venue |
| The trust boundary is still **overlay membership, not physical network membership** |
| **Venue Wi-Fi remains untrusted and not required**, and must not be the measurement path |
| **`E1` stands: acceptance evidence must be measured over real cellular + overlay. LAN runs are diagnostic only** |
| `E12` stands: direct-vs-relayed recorded for **every** measurement |
| No public endpoint, no public authentication surface, no dataset exposure |

**Why this is not a frozen-spec change.** `docs/specs/v1.0/**` **never names Tailscale**. It is
technology-neutral and requires only an *authenticated private overlay*. Tailscale was the concrete
product named in the DR-003 decision record and in `SPIKE_E_TRANSPORT/TASK.md`, not in the specification.
ZeroTier satisfies the same specified property. **Spec checksums remain 19/19 OK and no spec file is
touched.**

**Note on how this arrived.** The change was first pushed on branch `docs/zerotier-canonical`, which
edited `SPIKE_PHASE_STATE.yaml` and `READINESS_REVIEW_RESOLUTION.md` directly. Those are central-state
and decision-record files that **only Project Control may write** (see the §D.3 override in
`day01/DAY01_RUNBOOK.md` §4.2). **The content was accepted; the route was not.** Project Control applied
the edits, and that branch is closed unmerged. The proposal itself was correct and is credited above.

---

## Part 3 — Decision dependency order

Ordered by what each unblocks, not by calendar.

```
IMMEDIATE (unblock everything else)
  DR-006  target demo device        →  Spike A / Spike B
  DR-008a axis + index convention   →  parallel backend/mobile geometry work
  DR-001  dataset contingency       →  Spike D (P0)
  DR-003  GATE-DEPLOY-01 profile    →  API freeze scope (auth surface yes/no)

BEFORE ARCHITECTURE / API FREEZE
  DR-004  ingestion contract        →  backend/ML integration
  DR-009  review semantics          →  V4 schema + API
  DR-010  outlier / worst slice     →  SCR-01, SCR-04
  DR-012  geometry support boundary →  geometry contract freeze
  DR-013  technical ownership matrix→  30-day task allocation

BEFORE TRAINING
  DR-G01 / DR-002  data + split     →  all experiments        [needs Spike D]
  DR-007 / DR-G03  compute + ML ADR →  experiment matrix      [needs Spike C]
  DR-011  normalization policy      →  experiment matrix

BEFORE FEATURE / ACCEPTANCE
  DR-005  3D error pipeline         →  PR-ERR-03, PR-3D-05    [needs Spike F]
  DR-008b/c tolerance + mesh budget →  FR-3D-002/005 ACCEPTED [needs Spike B]
  DR-G04  GATE-IMG-01 morphology    →  EXP-D-PP
  DR-G05  GATE-MOB-01 framework     →  production mobile architecture

BEFORE REPORT
  DR-014  uncertainty reporting     →  final report
```

### DR-006a — The demo device stays with its owner; measurement access becomes a session, not a handover

| Field | Value |
|---|---|
| **Amends** | DR-006 ✅ — declared target demo device · and the custody model in `WIP-CONFLICT-02` |
| **Proposed by** | Project Control, 2026-09-11 |
| **Decided by** | Phạm Tuấn Anh — Team Leader |
| **Date** | 2026-09-12 |
| **Status** | ✅ **APPROVED** |

**What DR-006 says.** It declares the device — *"Target physical demo device: **Samsung Galaxy A17
5G**"* — and requires the hardware profile to be captured from the actual device. **It says nothing
about who owns, holds, or operates that device.** The custody model lives in `WIP-CONFLICT-02`:
one authorised unit, serialized measurement windows, handed over at each gate.

**What actually happened.** The Galaxy A17 5G is **Phạm Tuấn Anh's personal property**, and on
2026-09-11 he stated it does not leave his possession. The repository had already recorded him as
*"Chủ sở hữu thiết bị"* and noted the device was authorised on *"máy tính của chính anh"*. The
"one holder, handed over at each gate" model cannot be executed against a device the project does
not own, and no governance document anywhere addresses that contingency — the gap is real, not an
oversight being papered over here.

**The amendment.**

1. **The device stays with its owner. There is no handover.** The gate sequence `A → E → B` survives
   unchanged as a serialization of **measurement windows**, not of physical custody.
2. **A new distinction the repository did not previously have — `operator` ≠ `owner`:**
   - **operator** — the person physically holding the device and running the commands
   - **owner** — the person accountable for the criteria, the measurement design, the
     interpretation and the recommendation
3. **For Spike E:** operator = Phạm Tuấn Anh · owner = Nguyễn Gia Đức Trung. This **overrides** three
   sentences that say otherwise, and overrides them in the open rather than by quiet editing:
   - `SPIKE_E_TRANSPORT/TASK.md` — *"All network measurements over the real cellular + overlay path —
     **executed by Nguyễn Gia Đức Trung**."*
   - same file — *"**All network and device measurements are executed by Nguyễn Gia Đức Trung** over
     the real cellular + overlay path."*
   - `SPIKE_A_2D/DR006_DEVICE_PROFILE.md` §10 — *"mọi phép đo hiệu năng — … `E8` phân bố latency —
     **vẫn do chủ sở hữu tự chạy trên máy thật**."* *(recorded 2026-09-11 on the leader's own
     instruction; superseded here by the same authority)*

**Four constraints. Without them this amendment manufactures evidence, and it is void.**

| # | Constraint | Why |
|---|---|---|
| **a** | **The leader withdraws as Spike E Secondary Reviewer.** Proposed replacement: Vũ Hùng Anh | The four-step workflow rests on the person who produced the evidence not being the person who reviews it. Operating the device *and* reviewing the numbers is self-approval with two names on it |
| **b** | **`E10`, `E11` and `E13` are written by Nguyễn Gia Đức Trung** — the proposed budget, the minimum fallback artifact set, and the strategy recommendation | `00` §14 requires every member to defend a function *"they personally analyzed, designed, and implemented"*. These three criteria are that part |
| **c** | **Trung personally reproduces at least one run** before Spike E can reach `ACCEPTED` | `14` §6 — *"A block is not considered healthy if only one person can explain/run/debug it"* |
| **d** | **Ownership does not move.** Trung remains Primary Owner of Spike E | `OPEN_DECISIONS.md` Ownership governance: *"Pairing … preserves ownership; transferring … destroys it"*, and the anti-bottleneck rule names him explicitly |

**What does NOT change.**

| Unchanged |
|---|
| The device is still the **Samsung Galaxy A17 5G**, physical, never an emulator |
| Measurement windows still **do not overlap** · order still **`A → E → B`** |
| **`E1` stands** — acceptance evidence over real cellular + overlay; LAN runs are diagnostic only |
| **`E12` stands** — direct-vs-relayed recorded for every measurement |
| The acceptance topology stays binding: `Galaxy A17 → real cellular → ZeroTier → remote Mac mini M2` |
| Every non-fabrication rule. An operator may press buttons; nobody may invent a number |
| The **evidence record names both people** — see the template change below |

**Recorded cost, stated plainly rather than buried.** This is a weaker arrangement for `00` §14 and
`16` §6 than Trung running his own measurements. The defense chain for a member runs
`… → commits/PR → tests → …`, and an operator's hands on the device is a step that does not appear
in that chain. The amendment is approved with that cost visible, not in spite of it.

**Trung keeps the right to reverse this.** His `TASK.md` was amended while he was absent — the same
routing problem DR-003a refused for a different change. He may propose returning to
self-operation at any time, and that proposal does not need a new decision from the leader; it only
needs him to say so.

---

## DR-006a · REVISION 1 — 2026-09-12

**What I got wrong in the first version.** It named *"a scheduled session in which the owner
operates the device himself, with the leader present"* as the preferred path. **That path does not
exist.** The team is geographically dispersed; no other member can reach the leader's phone, and the
leader is the only person who can test it quickly. I wrote a preferred alternative without checking
whether it was available.

It also scoped the amendment to Spike E alone. If nobody can reach the device, the same problem
applies to **Spike B (`B10`, `B11`, real-mesh picking)** and **Spike F (`F7`)**, both owned by Vũ
Hùng Anh, who is equally remote.

### The model that IS available — the owner operates REMOTELY

```text
owner's machine  --ZeroTier overlay-->  leader's PC  --USB-->  Galaxy A17
                                                                   |
                                            measurement traffic ---+--> real cellular
```

The leader keeps the phone on USB and exposes the adb server on his **ZeroTier overlay address**.
The owner connects from his own machine and **runs the measurement himself** — his keystrokes, his
choice of when to stop, his raw output.

### ⚠ CORRECTION, same day — I confused the control channel with the data path

Revision 1 as first written implied the phone no longer needs ZeroTier because the control channel
runs over USB. **That is wrong, and it was wrong in a way that would have wasted the owner's day.**

USB carries the *control* channel. The *data* path is still
`phone → cellular → ZeroTier overlay → Mac mini`, and the Mac mini has **no public endpoint** —
DR-003 forbids one. So the phone can only reach it **through the overlay**, which means
**ZeroTier on the phone is mandatory**, not optional.

Verified on the device rather than reasoned about:

```text
phone ping 10.134.129.115   3 sent, 0 received, 100% loss
phone interfaces            lo · rmnet1 (cellular 53.102.89.217) · wlan0 — NO ZeroTier
phone route to 10.134.129.0/24   none
```

**What USB actually buys**, and it is still worth having:

| | |
|---|---|
| The owner drives the run from his own machine | so *"executed by the owner"* holds |
| Control traffic does **not** ride the measured link | so it does not pollute what `E1` measures |
| The phone's Wi-Fi can be **off** during the run | so the data path is genuinely cellular |

It does **not** remove the overlay requirement. Corrected in Trung's packet, the leader's packet and
the board on the same day it was written.

**Why this preserves everything the first version had to override:**

| | |
|---|---|
| *"executed by Nguyễn Gia Đức Trung"* | **holds** — he executes it, from his own machine |
| Leader recusal as reviewer | **NOT required** — he did not produce the evidence |
| `00` §14 *"personally analyzed, designed, and implemented"* | **holds** |
| `E1` acceptance path | **holds, and is the reason for the USB control channel:** commands travel over USB, so the phone's Wi-Fi stays **off** and the measured traffic goes over real cellular. Putting the control channel on the overlay instead would contaminate the very link `E1` measures |

**Cost, recorded:** the leader's PC must be powered and reachable during the owner's session, and an
adb server exposed on the overlay is controllable by **anyone on that network**. The overlay is
authenticated and members-only (DR-003a), so the exposure is bounded to the team — but it is real.
**It is opened for a session and closed after**, and the session is recorded.

### What survives from the first version

**The device still does not change hands, and operator is still separated from owner.** Both remain
necessary, because the remote session depends on the leader being available. When he is not, the
fallback is the first version's model — leader operates, owner interprets — **and then, and only
then, the four constraints apply**, including his recusal as reviewer of that spike.

### Consequence: the reviewer change is REVERTED

The first version moved Spike E review from Phạm Tuấn Anh to Vũ Hùng Anh under constraint (a),
because the leader would have produced the evidence. **Under the remote model he does not**, so the
reason is gone and the change goes with it. Spike E returns to Phạm Tuấn Anh, and Vũ Hùng Anh drops
back from five review assignments to four.

**Recorded rather than quietly undone:** the reassignment happened, was committed, and is reversed
here because its premise turned out to be false — not because it was wrong given what was known at
the time. `SPIKE_PHASE_STATE.yaml` keeps both entries in its `reassignments` list.

**If the fallback is ever used for a given spike, the recusal applies to that spike for that
evidence.** It is conditional on who actually operated, and the evidence file records that.

**Why this is not a frozen-spec change.** `docs/specs/v1.0/**` contains no rule about who may operate
a device. `14` §5, §6, `15` §9, §11 and `00` §13 were all checked. **Spec checksums remain 19/19 OK
and no spec file is touched.** What changes is an acceptance-contract sentence inside a `TASK.md`,
which `00` §13 routes through exactly this kind of recorded decision.

**Binding consequence.** Evidence templates for Spike E gain two fields — `Device operator` and
`Owner who designed and interpreted` — and a `RESULT.md` that leaves either blank is incomplete.
An evidence file whose operator field names someone who did not touch the device is a false record,
and this amendment does not authorise one.

---

**Related documents:** `IMPLEMENTATION_READINESS_AUDIT.md` · `TECHNICAL_SPIKES_REQUIRED.md` ·
`RISK_REGISTER_INITIAL.md` · `SPEC_CLARIFICATION_REQUESTS.md` · `IMPLEMENTATION_READINESS_STATUS.md`
