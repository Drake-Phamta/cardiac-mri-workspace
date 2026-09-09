# INITIAL RISK REGISTER

**Companion to:** `IMPLEMENTATION_READINESS_AUDIT.md`
**Status:** initial seed — to be promoted into `management/RISK_REGISTER.md` per `17` §13
**Basis:** `SPEC_AUDIT_REPORT_v1_0.md` §5 (seven seeded risks, retained and re-scored) plus risks
arising from this audit

---

> **Reviewed and accepted with corrections by the specification owner, 2026-09-08.**
> Corrections have been applied to this file. For the authoritative post-review state — decision
> statuses, the nine answered clarifications, and condition status C1–C8 — see
> **`READINESS_REVIEW_RESOLUTION.md`**, which governs where it differs from this file.

## 0. Scoring model

| Likelihood | Meaning |
|---|---|
| **H** | More likely than not on current evidence |
| **M** | Plausible; depends on an unresolved decision or an unrun spike |
| **L** | Possible but not indicated by current evidence |

| Impact | Meaning |
|---|---|
| **H** | Threatens a MUST requirement, scientific validity, or the Day-30 deadline |
| **M** | Threatens a SHOULD, a milestone, or forces significant rework |
| **L** | Absorbed within normal execution |

**Severity** = combined judgement, aligned with `13` §12's P0–P3 quality-gate severity where applicable.

**A risk is not a finding.** Findings (`RA-*`) are defects or gaps in the specification. Risks are
things that may go wrong during execution. Where a risk originates in a finding, it is cross-referenced.

---

## 1. Register

### RISK-DATA-01 — Dataset acquisition or validation does not complete early

| Field | Content |
|---|---|
| **Category** | External dependency / schedule |
| **Likelihood** | **M** | **Impact** | **H** | **Severity** | **HIGH** |
| **Affected requirements** | GATE-DATA-01, GATE-SPLIT-01, PR-EXP-01/02/03/04, NFR-REP-001/002 |
| **Linked** | RA-H01, DR-001, Spike D |

**Description.** `06` §9.1 blocks all training until `DATASET_AUDIT.md` and the manifest are ACCEPTED.
**[VERIFIED]** The package has not been downloaded. **No access failure has been observed** — the
official source exposes a public download link, so the realistic risk is *schedule slippage from late
start*, not *access denial*.

**Early-warning signal.** Spike D has not produced a manifest within the first days of execution; or
validation reveals corrupted, missing, or ambiguous files.

**Mitigation.** Run Spike D as **P0** on day one. It has **no prerequisite decisions** and it blocks more
downstream work than any other spike.

**Contingency — DR-001 ✅ APPROVED, trigger now explicit.** If, **by the end of the first execution day of
Spike D**, there is no usable official package **locally**, **or** validation reveals a **blocking defect**
preventing GATE-DATA-01 acceptance — **RA-H01 escalates to BLOCKER** and the dataset contingency process
opens. **No silent dataset substitution**; substitution requires the full `00` §13 process.

**Residual risk after decision.** The trigger removes the *unmanaged stall*, not the dependency itself.
Severity stays **HIGH** until the package is validated.

**Owner.** ML/Imaging owner.

---

### RISK-SPLIT-01 — Label provenance ambiguity forces late split decisions

| Field | Content |
|---|---|
| **Category** | Scientific protocol |
| **Likelihood** | **M** | **Impact** | **M** | **Severity** | **MEDIUM** |
| **Affected requirements** | GATE-SPLIT-01, PR-EXP-03, NFR-REP-002, TC-EXP-008 |
| **Linked** | RA-H02, DR-002, Spike D |

**Description.** **[UNRESOLVED]** The official source is internally inconsistent about whether the
54-case Test Set includes LA cavity labels. `06` §6 branches the entire split protocol on this and
forbids changing the split after results are observed. Path A yields a 54-case holdout; Path B yields
15 — a 3.6× difference in evaluation population.

**Early-warning signal.** Spike D reports test-partition file contents that are ambiguous rather than
clearly labelled or clearly unlabelled.

**Mitigation.** Resolve empirically as Spike D's first deliverable, with file-level evidence recorded in
`DATASET_AUDIT.md`. Plan both branches until it resolves.

**Contingency.** Default to Path B if provenance cannot be verified — `06` §6 already specifies this as
the branch for unverifiable provenance, so no decision is needed beyond recording the evidence.

**Owner.** ML owner; decision by Leader/spec owner.

---

### RISK-3D-GEOMETRY — 2D↔3D mapping and brush coordinate transforms fail or diverge

| Field | Content |
|---|---|
| **Category** | Technical / integration |
| **Likelihood** | **M** | **Impact** | **H** | **Severity** | **HIGH** (P0-class per `13` §12) |
| **Affected requirements** | FR-MRI-005, FR-3D-003..006, FR-REV-011, NFR-MAINT-002, NFR-REL-003, TC-3D-003/004, TC-REV-003 |
| **Linked** | RA-H07, RA-H11, RA-H14, DR-008, Spikes A/B |

**Description.** Carried forward from `SPEC_AUDIT_REPORT_v1_0.md` §5.1 and **elevated** by this audit.
`13` §12 lists "2D/3D mapping wrong in accepted build" as **P0/Critical**. Three compounding gaps: the
axis and index-order convention is not fixed (RA-H07), so backend and mobile can each be internally
correct and disagree at integration; the `TC-3D-004` tolerance has no value anywhere in the spec
(RA-H11), so the defect class has no determinate acceptance test; and mesh decimation moves vertices,
degrading the accuracy the absent tolerance was meant to bound (RA-H14).

**Early-warning signal.** Backend and mobile geometry implementations diverge on the shared fixture; or
Spike B reports slice-resolution errors larger than expected for interior test points.

**Mitigation — partly executed.** **DR-008a ✅ APPROVED**: the canonical convention is frozen — voxel
`(x, y, z)` with x = column, y = row, z = slice index; `slice_index` = z over `0..Nz-1`; slice shape
`[Ny, Nx]`; top-left origin, +x right, +y down; library memory order explicitly outside the contract, with
adapters conforming at boundaries. **DR-008b ✅ FROZEN by SCQ-06**: exact on fixtures, ≤ ±1 source slice on
decimated real meshes. Remaining: build the `09` §6 canonical fixture set with a worked example in these
terms **before** parallel work; settle **DR-008c** (mesh budget) from Spike B **within** the ±1-slice
ceiling; enforce `TC-MAINT-002` in CI from the first geometry commit.

**Residual risk after decision.** Likelihood drops — the two implementations now have one written
convention to conform to — but the risk stays **HIGH** until fixture conformance is demonstrated in CI,
because a shared convention on paper is not the same as two implementations provably agreeing.

**Contingency.** If divergence appears, freeze one side, make the fixture authoritative, and treat it as
a P0 per `15` §17 priority 1.

**Owner.** Still requires a **named geometry owner and reviewer** — see RISK-OWNER-01 and DR-013 (C7 OPEN).

---

### RISK-3DERR-01 — The 3D error feature proves infeasible as specified

| Field | Content |
|---|---|
| **Category** | Technical / scope |
| **Likelihood** | **M** | **Impact** | **H** | **Severity** | **HIGH** |
| **Affected requirements** | PR-ERR-03, PR-3D-05, FR-3D-007, FR-3D-008, TC-3D-005 |
| **Linked** | **RA-B01**, DR-005, Spike F |

**Description.** The only BLOCKER in the audit. `07` §7 specifies reconstruction of a single LA surface
and nothing else; FR-3D-007/008 require an error representation with addressable regions that navigate
to contributing slices. **[ASSUMPTION]** FN regions are thin shells that may fragment badly under
isosurface extraction, potentially making region picking unreliable.

**Early-warning signal.** Spike F reports that no candidate representation supports deterministic
region-to-slice resolution at an acceptable mesh cost.

**Mitigation.** Run Spike F early on synthetic mask pairs — it does not need real data to start.

**Contingency.** DR-005 option 4: a formal MUST scope change through `00` §13. **[SPEC]** `03` §4 lists
"3D is decorative only and cannot link back to MRI slices" as an MVP rejection condition, so this must
be an explicit leader decision, never a silent simplification.

**Owner.** Imaging owner.

---

### RISK-MOBILE-RENDER — The chosen framework fails 3D and editing performance on the demo device

| Field | Content |
|---|---|
| **Category** | Technical |
| **Likelihood** | **M** | **Impact** | **H** | **Severity** | **HIGH** |
| **Affected requirements** | NFR-PERF-002, NFR-PERF-003, FR-3D-002/005, FR-REV-011, TC-PERF-002/003 |
| **Linked** | RA-H05, RA-H14, DR-006, Spikes A/B |

**Description.** Carried forward from `SPEC_AUDIT_REPORT_v1_0.md` §5.2. **[ASSUMPTION]** The
discriminating capability is not mesh *rendering* but mesh *picking* — FR-3D-005/006 require resolving a
touch to a slice index, which is a harder capability than displaying a mesh. Compounded by RA-H05: the
spikes currently have no declared device to measure against, so a framework could be selected on
impressions.

**Early-warning signal.** Spike B demonstrates rendering but not reliable picking; or FPS falls short of
NFR-PERF-002 at any decimation level that preserves acceptable accuracy.

**Mitigation — partly executed.** **DR-006 ✅ APPROVED**: the target demo device is the **Samsung Galaxy
A17 5G**, a physical device, declared **before** the spikes — which closes the RA-H05 circularity. The
hardware profile must be captured **from the device** before measurement; **no hardware detail may be
inferred**. Picking, not rendering, is the Spike B pass criterion, and **SCQ-06 fixes the bar at ≤ ±1
source slice** so a fast-but-inaccurate mesh cannot pass.

**Residual risk after decision.** Unchanged in severity: declaring a mid-range device makes the target
*measurable*, not necessarily *achievable*. Spike B may still find no decimation level satisfying both
NFR-PERF-002 and the ±1-slice ceiling — a valid negative result that must be escalated, not absorbed by
relaxing the ceiling.

**Contingency.** `15` §18 Level 4 — preserve the requirement, simplify the technical path (e.g. coarser
mesh with a wider documented tolerance, agreed through DR-008b).

**Owner.** Mobile/Architect owner.

---

### RISK-INGEST-01 — No path exists to load precomputed results into the backend

| Field | Content |
|---|---|
| **Category** | Architecture / critical path |
| **Likelihood** | **H** | **Impact** | **H** | **Severity** | **HIGH** |
| **Affected requirements** | PR-EXP-01/02/03/04, PR-COHORT-01/02, FR-EXP-001..006 |
| **Linked** | RA-H03, DR-004 |

**Description.** PR-AN-01 (live analysis) is SHOULD, so precomputed artifacts are the declared
critical-path fallback — yet ingestion has no requirement, no API operation, and no acceptance test.
**[VERIFIED]** "Precomputed" appears in the spec only as a UI labelling concern. Likelihood is **H**
because the gap is present today, not contingent on anything.

**Early-warning signal.** Backend work begins with cases and experiments hand-seeded ad hoc rather than
through a defined, provenance-preserving mechanism.

**Mitigation.** Resolve DR-004 before architecture freeze. **[RECOMMENDATION]** An offline CLI plus
manifest adds no API surface and therefore does not delay API freeze.

**Contingency.** None acceptable — without ingestion the demo has no data. This must be resolved, not
worked around.

**Owner.** Architect + backend owner.

---

### RISK-COMPUTE — DINOv2 training exceeds available compute or calendar

| Field | Content |
|---|---|
| **Category** | Technical / schedule |
| **Likelihood** | **M** | **Impact** | **H** | **Severity** | **HIGH** |
| **Affected requirements** | GATE-ML-01, PR-EXP-01/03, `08` §2 matrix |
| **Linked** | RA-H06, DR-007, Spike C |

**Description.** Carried forward from `SPEC_AUDIT_REPORT_v1_0.md` §5.4 and **elevated**: `07` §2
requires `ADR-ML-001` to record compute/memory feasibility evidence, but **[VERIFIED]** no spike or
procedure in the specification produces it. `08` §2 requires the recipe be identical across
`EXP-D-025/050/100`, so infeasibility discovered mid-matrix invalidates completed runs.

**Early-warning signal.** Spike C's calendar arithmetic does not fit; or peak memory forces a batch size
that changes the training dynamics.

**Mitigation.** Run Spike C before GATE-ML-01. Reduce input resolution or model size **before** freezing
the recipe, never during the matrix.

**Contingency.** A smaller-but-honest experiment is explicitly permitted — `00` §9 and PR-SCI-03 protect
scientific honesty, not experiment size. What is forbidden is changing protocol after seeing results.

**Owner.** ML owner.

---

### RISK-CONFOUND-01 — RQ-A is confounded by an unspecified preprocessing choice

| Field | Content |
|---|---|
| **Category** | Scientific validity |
| **Likelihood** | **M** | **Impact** | **M** | **Severity** | **MEDIUM** |
| **Affected requirements** | RQ-A, PR-EXP-03, NFR-REP-001, GATE-ML-01 |
| **Linked** | RA-H16, DR-011 |

**Description.** `07` §3 requires normalization statistics be fit on the training partition only, but
`06` §7 makes the training partition differ by data fraction. Refitting per fraction means part of any
measured degradation is normalization drift rather than label scarcity; freezing once means the scarcity
condition is partly idealised. Both readings are spec-compliant and they can produce different answers
to the project's primary research question.

**Early-warning signal.** The experiment configuration is written without an explicit, recorded
normalization policy.

**Mitigation.** Resolve DR-011 before GATE-ML-01; apply the chosen policy identically to both model
families; record it in `preprocessing_version` so it appears in every `08` §10 manifest.

**Contingency.** If discovered after runs complete, report the confound explicitly rather than
re-running — PR-SCI-03 and `08` §12 make honest reporting of a limitation acceptable.

**Owner.** ML owner + Data Science owner.

---

### RISK-STATS-01 — Results are inconclusive and reported as if conclusive

| Field | Content |
|---|---|
| **Category** | Scientific validity / reporting |
| **Likelihood** | **M** | **Impact** | **M** | **Severity** | **MEDIUM** |
| **Affected requirements** | RQ-A, PR-SCI-03, TC-SCI-003, `08` §7 |
| **Linked** | RA-M01, DR-014 |

**Description.** **[ASSUMPTION]** Under either split path the evaluation population is small relative to
an interaction effect. `08` §7 requires mean, std, median and paired comparison but **[VERIFIED]** not
confidence intervals. PR-SCI-03 protects against forcing a positive result; nothing protects against
presenting a null result as evidence of equivalence.

**Early-warning signal.** Draft result tables show per-case metric spread comparable to the between-model
difference, with no uncertainty reported.

**Mitigation.** DR-014 — require uncertainty on the primary comparison, **preferably confidence
intervals**, plus a limitations section. The per-case metrics are already persisted by `08` §11.1, so
the cost is small. **A formal power analysis is explicitly not required.**

**Contingency.** Report the observed ordering with its uncertainty and state the limitation. This is
already the spec's intent under PR-SCI-03.

**Owner.** Data Science owner.

---

### RISK-SCOPE-01 — MUST scope does not fit the 30-day window

| Field | Content |
|---|---|
| **Category** | Schedule |
| **Likelihood** | **M** | **Impact** | **H** | **Severity** | **HIGH** |
| **Affected requirements** | all 28 MUST product requirements; `03` §5 scope firewall; `13` §13 |
| **Linked** | RA-H10, RA-M03 |

**Description.** Carried forward from `SPEC_AUDIT_REPORT_v1_0.md` §5.6 and **quantified** by this audit:
**28 MUST product requirements, 75 MUST FR/NFR, 69 acceptance tests**, several manual and device-bound,
for four students in 30 days, with `15` §3 requiring at least two days of stabilisation buffer and
`13` §13 requiring `TC-USAB-005` (five consecutive canonical smoke runs). `03` §5 declares the MUST
floor protected, so the only legal responses are `15` §18 Level 4 (simplify) or Level 5 (formal DR).

**Early-warning signal.** `15` §16 AMBER conditions — accepted-throughput below baseline for two
consecutive days, or recovery buffer trending toward zero.

**Mitigation.** Before the baseline: pre-document a Level-4 simplification for each MUST requirement
where one exists; prepare (but do not file) a Level-5 DR identifying which MUST requirements would be
least damaging to the four academic lenses in `16` §4; size the manual/device test load explicitly in
the calendar. Enforce `03` §5's scope firewall against SHOULD/COULD work.

**Contingency.** `15` §18 recovery ladder, triggered early per `15` §18's "before Day 30 is impossible"
rule.

**Owner.** Leader.

---

### RISK-CAP-01 — Reduced leader capacity

| Field | Content |
|---|---|
| **Category** | Team / capacity |
| **Likelihood** | **H** | **Impact** | **M** | **Severity** | **MEDIUM** |
| **Affected requirements** | PR-MOBILE-03, TC-TEAM-001, `15` §5 capacity rule, `17` §16 |
| **Linked** | RA-M04, DR-013 |

**Description.** **[VERIFIED — leader-confirmed]** The leader is **1 of the 4 implementing students** and
simultaneously carries the full `17` orchestration load (five Claude chats, EOD packet assembly,
ChatGPT round-trips, `17` §6 daily workflow), a vertical capability block, and a mandatory individual
mobile function for the course. `17` §16 makes the leader the sole operator of the Claude cockpit, so
this work cannot be distributed.

**Important:** this audit makes **no numeric claim** about effective team capacity. **[SPEC]** `15` §5
requires planning from "actual available hours, not an assumption that all four members have equal
full-day capacity" — so the reduction must be **computed from declared availability**, not estimated
here.

**Early-warning signal.** `15` §22 leader-dashboard questions go unanswered at EOD; review latency grows
because the leader is the review bottleneck; daily plans arrive late.

**Mitigation — partly executed. Condition C8 is CLOSED:** all four members declare **8 hours/day**.

**Round 3 sharpened this.** Phạm Tuấn Anh is simultaneously **Team Leader**, **V1 Primary Owner**,
**Integration/CI Primary Owner**, and **Secondary Reviewer on three other blocks** (V2, V4, Backend). The
baseline must reserve explicit capacity for **Project Control, integration coordination, code/review work,
EOD processing, Claude orchestration, blocker handling, and cross-contract coordination** — subtracted from
his 8 hours **before** any implementation task is assigned.

**This is gross availability, not guaranteed coding capacity.** The distinction is the whole point of the
finding. The future baseline **must explicitly reserve leader time** for Project Control, reviews, EOD
processing, Claude orchestration, and integration coordination — that reserved time is subtracted from the
leader's 8 hours before any implementation task is assigned. Also apply `14` §8: the leader is not the sole
code reviewer.

**Residual risk after decision.** Severity stays **MEDIUM**. A declared 8 h/day × 4 does **not** mean
32 h/day of implementation throughput, and treating it that way in the baseline would reproduce exactly the
over-optimism `15` §5 forbids. This audit still makes **no numeric claim** about effective capacity; the
reserved-time figure must be set by the leader and recorded.

**Contingency.** `15` §18 Level 1 — reallocate reviewer/secondary owners to the critical path.

**Owner.** Leader.

---

### RISK-OWNER-01 — Non-mobile technical blocks have no named owner

| Field | Content |
|---|---|
| **Category** | Team / knowledge |
| **Status** | **✅ CLOSED** — DR-013 ✅ assigned both ownership axes (Round 3) |
| **Likelihood** | — | **Impact** | — | **Severity** | **CLOSED** |
| **Affected requirements** | NFR-MAINT-001, TC-MAINT-001, `14` §5, `14` §6 |
| **Linked** | RA-M04 (resolved), DR-013 ✅ |

**Description.** `14` §3's V1–V4 verticals are all mobile-facing. Backend API, ML training, imaging
pipeline and integration have no named owner or reviewer, while `14` §5–§6 forbid a block only one
person can run or debug. These unowned blocks carry RA-B01, RA-H07 and RA-H16 — most of the P0-class
risk. Likelihood **H** because the gap exists today.

**Constraint.** **V1–V4 must be preserved** — they satisfy the course's individual mobile-function
requirement (PR-MOBILE-03, `16` §5.1 CLO3). The fix is an **additional** axis, not a replacement.

**Early-warning signal.** A geometry, ML, or backend question consistently routes to the same single
person; `14` §6's handoff rule cannot be satisfied at a milestone.

**Mitigation.** DR-013 — add a technical-block ownership/reviewer matrix over the same four members.
**[RECOMMENDATION]** Give the geometry/coordinate contract its own named owner and reviewer regardless
of the rest of the allocation.

**Closure (Round 3).** DR-013 ✅ assigned a Primary Owner **and** a named Secondary Reviewer to every mobile
vertical **and** every technical block, including the geometry contract (**Vũ Hùng Anh** primary /
**Phạm Tuấn Anh** secondary). Every member is a Primary Owner on both axes, so no block has a single point
of knowledge failure and `TC-TEAM-001`'s per-member evidence chain is preserved.

**Residual watch item — not a risk entry.** The anti-bottleneck rule is binding: ML ownership must not move
from Bế Quốc Khánh to Vũ Hùng Anh, nor Backend ownership from Nguyễn Gia Đức Trung to Phạm Tuấn Anh,
merely for short-term speed. `15` §18 Level 2 **pairing** preserves ownership; transferring it does not.

**Contingency.** Pair two members on the affected block per `15` §18 Level 2.

**Owner.** Leader.

---

### RISK-INTEGRATION — Contracts drift between mobile, backend and ML

| Field | Content |
|---|---|
| **Category** | Integration |
| **Likelihood** | **M** | **Impact** | **M** | **Severity** | **MEDIUM** |
| **Affected requirements** | NFR-MAINT-002, `09` §12, `11` §11, TC-MAINT-002 |
| **Linked** | RA-H07, RA-M12, RA-M16, RA-M03 |

**Description.** Carried forward from `SPEC_AUDIT_REPORT_v1_0.md` §5.5. `09` §12 and `11` §11.5 require
mocks be generated from accepted contracts rather than handwritten. Residual risk comes from the
contract gaps this audit found: missing API operations (RA-M12), no HTTP status mapping (RA-M16), and
the unfixed geometry convention (RA-H07).

**Early-warning signal.** A downstream member builds against a handwritten fixture; or an integration
test fails on a field that neither side considered part of the contract.

**Mitigation.** Close RA-M12 and RA-M16 before API freeze. Generate fixtures from the accepted schema.
Enforce `09` §12's rule that a contract is versioned and accepted before two members work across it.

**Contingency.** `15` §23 — a task that cannot integrate because its contract was ignored is
`NEEDS_FIX`, not ACCEPTED.

**Owner.** Architect.

---

### RISK-SEQ-01 — The baseline serialises work behind the ADRs

| Field | Content |
|---|---|
| **Category** | Planning |
| **Likelihood** | **M** | **Impact** | **M** | **Severity** | **MEDIUM** |
| **Affected requirements** | `09` §1.1, `09` §12, `11` §11.4, `15` §3 |
| **Linked** | RA-M03 |

**Description.** `09` §12 and `11` §11.4 gate cross-interface parallel work behind `ADR-MOB-001`,
`ADR-ART-001`, `ADR-DEPLOY-001` and the API freeze. A naïve baseline could read this as "nothing starts
until the ADRs land" and waste the first week.

**What is actually true.** **[SPEC]** `09` §1.1 explicitly permits scaffolding for technology-neutral
docs, contracts and spikes before ADRs are final. The spikes are **parallelisable after their
prerequisite decisions are resolved** — DR-006 and DR-008a are free leader decisions that unblock the
device-bound and geometry-bound spikes.

**Early-warning signal.** The draft baseline shows an idle first week for two or more members.

**Status update.** **DR-006 ✅** and **DR-008a ✅** are now approved, so **six of seven spike stages are
unblocked** (all but Spike C1, which waits on Spike D). The original concern — a baseline that serialises
everything behind the ADRs — is now straightforwardly avoidable.

**Mitigation.** Front-load the spikes, parallelised after their prerequisites resolve; schedule the ADRs as their outputs; use
`09` §12's fixture/mock provision for downstream work.

**Owner.** Leader / Project Control.

---

### RISK-DEPLOY-01 — Late deployment-profile choice forces a breaking API change

| Field | Content |
|---|---|
| **Category** | Architecture — *was conditional on `REMOTE_DEMO`* |
| **Status** | **✅ CLOSED / NOT APPLICABLE** — DR-003 ✅ selected `LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS |
| **Likelihood** | — | **Impact** | — | **Severity** | **CLOSED** |
| **Affected requirements** | GATE-DEPLOY-01, NFR-SEC-002, `11` §11.2, `11` §11.4, TC-SEC-002 |
| **Linked** | RA-H04, RA-H17, DR-003 |

**Description.** `11` declares zero authorization surface. `09` §10 / `12` §5 `REMOTE_DEMO` requires
authorization on all writes. `00` §11.1 currently sequences GATE-DEPLOY-01 late. Choosing `REMOTE_DEMO`
after API freeze is a breaking schema change under `11` §11.2. Separately, serving MRI imagery publicly
raises the `12` §3 redistribution question, which the `12` §8.1 acceptance gate does not check.

**Early-warning signal.** API freeze approaches with the deployment profile still undeclared.

**Mitigation.** DR-003 — re-sequence the gate to before API freeze. **`LOCAL_DEMO` must not inherit
remote-authentication or public-dataset-transport requirements**; choosing it closes both RA-H04 and
RA-H17 at zero cost.

**Closure (Round 3).** DR-003 ✅ resolved GATE-DEPLOY-01 **before** API freeze, so the hazard cannot occur.
The selected profile requires **no public authentication surface** and **no public dataset endpoint**, so
**RA-H04** and **RA-H17** are both **CLOSED / NOT APPLICABLE**.

**Do not reintroduce `REMOTE_DEMO` authentication or public dataset-transport requirements into the critical
path.** Should the profile ever change, this risk reopens and `11` §11.2's versioned-contract-change process
applies.

**Owner.** Leader / Architect.

---

### RISK-DEMO-NET-01 — Canonical demo depends on cellular + private-overlay connectivity

| Field | Content |
|---|---|
| **Category** | Demo / operational |
| **Likelihood** | **M** | **Impact** | **M** | **Severity** | **MEDIUM** |
| **Affected requirements** | NFR-PERF-001, NFR-PERF-004, `TC-E2E-001`, `TC-USAB-005`, `16` §2 hero flow |
| **Linked** | DR-003 ✅, RA-H13, Spike E |

**Description.** DR-003 ✅ places the backend **physically remote**, reached over **4G/5G cellular →
authenticated private overlay**. The canonical hero demo and the `NFR-USAB-005` five consecutive smoke runs
therefore depend on cellular connectivity at the venue. **[ASSUMPTION]** A demo venue is exactly the kind of
place where cellular throughput degrades — many devices, indoor attenuation, contended cells — and overlay
relay fallback can add latency beyond a direct path.

**Why this is new.** It is introduced *by* the deployment decision, not by the specification. It did not
exist while a LAN-style profile was assumed, and it interacts directly with **RA-H13** — the missing
first-load/transport budget — because the budget must now be met over a variable mobile link.

**Early-warning signal.** Spike E measures unacceptable or highly variable latency on the cellular + overlay
path; or `NFR-PERF-001`'s 200 ms cached-slice target proves unreachable when the cache misses.

**Mitigation.** DR-003 ✅ **already mandates a minimal connectivity-failure fallback** for the hero demo —
preloaded canonical artifacts, cached case data, or cached/precomputed results sufficient for the critical
flow. **Spike E must measure the real cellular + overlay path**, not a LAN proxy, and its output informs both
`ADR-ART-001` and the fallback mechanism.

**Contingency.** Execute the fallback for the demo. **Scope firewall:** the fallback must **not** grow into a
full offline mode, a second architecture, or backend-on-phone. `PR-CACHE-01` remains a SHOULD and must not be
promoted into the MUST floor through this route.

**Owner.** Phạm Tuấn Anh (Integration / CI / cross-contract coordination).

---

### RISK-REPORT — DINOv2 does not outperform UNet

| Field | Content |
|---|---|
| **Category** | Scientific expectation |
| **Likelihood** | **M** | **Impact** | **L** | **Severity** | **LOW** |
| **Affected requirements** | PR-SCI-03, TC-SCI-003, `00` §14 |
| **Linked** | — (carried forward from `SPEC_AUDIT_REPORT_v1_0.md` §5.7) |

**Description.** The reference paper motivates DINOv2, but this project uses a different dataset and
protocol. The result may be null or negative.

**Why the impact is LOW.** **[SPEC]** `00` §14 and PR-SCI-03 already define success as a valid answer to
the research questions, not a predetermined direction, and `TC-SCI-003` tests that no selective case
removal or tuning was used to force the paper's direction. The specification has already neutralised
this risk correctly.

**Mitigation.** Retain PR-SCI-03 unchanged. Combine with DR-014's uncertainty reporting so a null result
is presented with its precision.

**Owner.** Data Science owner.

---

## 2. Summary

| Severity | Count | IDs |
|---|---:|---|
| **HIGH** | **7** | RISK-DATA-01, RISK-3D-GEOMETRY, RISK-3DERR-01, RISK-MOBILE-RENDER, RISK-INGEST-01, RISK-COMPUTE, RISK-SCOPE-01 |
| **MEDIUM — added Round 3** | 1 | RISK-DEMO-NET-01 |
| **CLOSED — Round 3** | 2 | RISK-DEPLOY-01 *(DR-003)*, RISK-OWNER-01 *(DR-013)* |
| **MEDIUM — active** | 6 | RISK-SPLIT-01, RISK-CONFOUND-01, RISK-STATS-01, RISK-CAP-01, RISK-INTEGRATION, RISK-SEQ-01 |
| **LOW** | 1 | RISK-REPORT |
| **Total entries** | **17** | 7 HIGH + 7 MEDIUM active (incl. RISK-DEMO-NET-01) + 1 LOW + 2 CLOSED |

*Count corrected by the specification owner's readiness review (2026-09-08): HIGH is **7**, not 6.
Total remains 16. See `READINESS_REVIEW_RESOLUTION.md` §2.*

### Highest-leverage mitigations

Three actions retire or reduce the majority of HIGH risk, and all three are available immediately:

1. **Start Spike D (P0).** Retires or bounds RISK-DATA-01 and RISK-SPLIT-01, and feeds RISK-COMPUTE and
   DR-012.
2. **Declare DR-006 (target device) and DR-008a (axis/index convention).** Both are free leader
   decisions. They unblock all four device-bound spikes and directly attack RISK-3D-GEOMETRY —
   the project's only P0-class technical risk class.
3. **Resolve DR-004 (ingestion contract).** Retires RISK-INGEST-01, which is the only HIGH risk with
   likelihood **H** and no acceptable contingency.

### Carried forward from the prior audit

All seven risks seeded by `SPEC_AUDIT_REPORT_v1_0.md` §5 are retained: RISK-3D-GEOMETRY,
RISK-MOBILE-RENDER, RISK-DATA-01 (was RISK-DATA-PACKAGE), RISK-COMPUTE, RISK-INTEGRATION,
RISK-SCOPE-01 (was RISK-SCOPE), RISK-REPORT. Four were re-scored upward on the evidence in this audit;
RISK-REPORT was scored **LOW** because PR-SCI-03 already neutralises it.

---

**Related documents:** `IMPLEMENTATION_READINESS_AUDIT.md` · `OPEN_DECISIONS.md` ·
`TECHNICAL_SPIKES_REQUIRED.md` · `SPEC_CLARIFICATION_REQUESTS.md` ·
`IMPLEMENTATION_READINESS_STATUS.md`
