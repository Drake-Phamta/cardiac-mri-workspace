# SPECIFICATION CLARIFICATION REQUESTS

**Companion to:** `IMPLEMENTATION_READINESS_AUDIT.md`
**Addressed to:** the specification owner
**Status of every entry:** **ANSWERED** by the specification owner, 2026-09-08.
Each answer is recorded inline below under **Specification owner's answer**, and collected in
`READINESS_REVIEW_RESOLUTION.md` §4.

---

> **Reviewed and accepted with corrections by the specification owner, 2026-09-08.**
> Corrections have been applied to this file. For the authoritative post-review state — decision
> statuses, the nine answered clarifications, and condition status C1–C8 — see
> **`READINESS_REVIEW_RESOLUTION.md`**, which governs where it differs from this file.

## 0. What this document is — and is not

These are **narrow questions of interpretation**, not scope changes. Each identifies a place where two
developers could read Frozen Spec v1.0 differently and build incompatible things while both believing
they followed the specification.

**[SPEC]** `00` §12 conflict rule: *"If two frozen files appear contradictory, **stop and raise a
Decision Request**; do not guess which one 'wins' and do not modify code/spec to hide the
contradiction."* This document is that stop.

**Distinction from `OPEN_DECISIONS.md`:**

| Document | Contains |
|---|---|
| `OPEN_DECISIONS.md` | Decisions with genuine options and trade-offs, where the leader chooses a direction (DR-001..014, DR-G01..G06) |
| **This document** | Places where the specification appears to contradict itself or omits a definition it relies on; the spec owner clarifies what was intended |

Several entries here have a clearly-intended reading that this audit could infer — but `00` §12 forbids
inferring, so each is raised rather than resolved. Where an intended reading seems evident, it is
labelled **[LIKELY INTENT]** as a convenience for the reviewer, never as a resolution.

**ID prefix — `SCQ-*`, not `SCR-*`.** Entries here are numbered `SCQ-01`…`SCQ-09` (Specification
Clarification Question) deliberately, to avoid collision with the screen IDs `SCR-01`…`SCR-09` defined in
`10_MOBILE_UX_AND_INTERACTION_SPEC.md`. Any `SCR-nn` appearing in these readiness artifacts always means
a screen.

**No file under `docs/specs/v1.0/` has been modified.** Integrity re-verified: 19/19 checksums OK.

---

## SCQ-01 — `05` §1 hierarchy contradicts `05` §2 and `05` §6

| Field | Content |
|---|---|
| **Source finding** | RA-M05 (MEDIUM) |
| **Affected spec** | `05_DOMAIN_AND_DATA_MODEL.md` §1, §2, §6 |
| **Affected requirements** | PR-REV-01, PR-PROV-01, PR-FIND-01, FR-REV-008/010, FR-FIND-001..004 |

### Question

Is `Review` a child of `Finding`, or are they independent aggregates?

### Conflicting text

**`05` §1 — Domain hierarchy:**

```text
└── Finding
    ├── Review
    └── ReviewedMask (optional)
```

**`05` §2 — Entity definitions:**

- `Review` fields: `review_id`, **`analysis_run_id`**, `status`, `reviewer_id_or_alias`,
  `latest_reviewed_mask_id`, `created_at`, `updated_at`, `state_history` — **no `finding_id`**.
- `ReviewedMask` fields: `reviewed_mask_id`, `source_mask_id`, **`review_id`**, `artifact_uri`,
  `version`, `parent_reviewed_mask_id`, `checksum`, `created_at` — **no `finding_id`**.
- `Finding` fields: `finding_id`, `study_id`, `experiment_id`, `analysis_run_id`, `case_id`,
  `slice_index`, `region_reference`, `finding_type`, `note`, `status`, `created_at` — **no `review_id`**.

**`05` §6 — Review persistence rules:**

> "A finding may be created without correction, and a correction may exist without a finding."

### Candidate readings

**(A) §1 is a containment hierarchy.** Review and ReviewedMask belong to a Finding. Implies a
`finding_id` foreign key on Review, and that a correction requires a finding.

**(B) §1 is an illustrative grouping; §2 and §6 govern.** Review is keyed to the analysis run;
ReviewedMask to its review and source mask; Finding is independent and joins only through
`analysis_run_id` / `case_id`.

### What breaks under each

- **Under (A):** §6's explicit statement that "a correction may exist without a finding" becomes
  unsatisfiable, and Review needs a foreign key §2 does not list. UC-14 (brush correct) would require
  UC-15 (create finding), which `02` §4's relationship map does not assert.
- **Under (B):** the §1 diagram is misleading but harmless, and everything else is consistent.

**[LIKELY INTENT]** Reading (B). §2 and §6 are mutually consistent and specific; §1 appears to be a
grouping of human-derived artifacts rather than a containment relationship. But `00` §12 forbids
choosing.

### Minimum answer needed

Confirm that §2 and §6 govern and that §1 groups rather than contains — or, if (A) is intended, state
the `finding_id` relationship and reconcile §6.

### Specification owner's answer — **ANSWERED (2026-09-08)**

**Reading (B) is confirmed.** `Review`, `ReviewedMask` and `Finding` are **independent aggregates**.
A `Finding` is **not required** for a correction. `05` §1's diagram groups human-derived artifacts; it is
not a containment relationship. `05` §2 and §6 govern.

**Consequence.** No `finding_id` foreign key on `Review` or `ReviewedMask`. UC-14 does not depend on
UC-15. **RA-M05 is resolved.** Note this does **not** resolve DR-009's revision field, variant scope, or
session-lifetime questions — those remain OPEN.

**Previously blocked:** the review/finding database schema and `11` §8/§9 resource nesting — now unblocked.

---

## SCQ-02 — MetricSet cannot represent a cohort summary or a per-slice metric

| Field | Content |
|---|---|
| **Source finding** | RA-M06 (MEDIUM) |
| **Affected specs** | `05` §2 (MetricSet), `08` §5, `11` §5, `11` §6 |
| **Affected requirements** | PR-COHORT-01, FR-EXP-002, FR-EXP-003, NFR-REP-003, TC-EXP-003 |

### Question

`05` MetricSet is keyed to a single `analysis_run_id` but declares
`aggregation_level = CASE_3D / SLICE_2D / COHORT_SUMMARY`. How are the latter two represented?

### Conflicting text

**`05` §2 — MetricSet** is keyed to `analysis_run_id`, with `aggregation_level = CASE_3D / SLICE_2D /
COHORT_SUMMARY`, scalar `dice`/`iou`, and a `per_slice_metrics_uri`.

**`05` §2 — AnalysisRun:** "Represents one experiment/model analysis on **one case**."

**`11` §5:** `GET /api/v1/experiments/{experiment_id}/metrics` — "Returns cohort summary computed from
saved per-case results, including intended evaluation N, successful N, primary metric summary, and
prediction variant." *Experiment-scoped; no analysis run in the path.*

**`08` §5:** "Cohort mean/median/std are calculated from per-case primary metrics."

### The two problems

**(a) COHORT_SUMMARY.** A cohort summary spans many runs across many cases. It cannot belong to one
`analysis_run_id`. `11` §5 returns exactly such a summary at experiment scope.

**(b) SLICE_2D.** A per-slice MetricSet has **no `slice_index` field**, so it cannot identify its own
slice. `05` provides only `per_slice_metrics_uri` pointing at an external artifact — which conflicts
with `SLICE_2D` being an enumerated aggregation level of the entity itself. `11` §6's
`GET /analysis-runs/{run_id}/slices/{slice_index}/metrics` has no defined backing entity.

### Candidate readings

**(A)** MetricSet is case-scoped only (`CASE_3D`); cohort summaries are a distinct derived entity at
experiment scope; per-slice metrics live entirely in the `per_slice_metrics_uri` artifact. The
enumeration is then over-broad.

**(B)** MetricSet's key is relaxed so it can attach to an experiment as well as a run; `slice_index` is
added for `SLICE_2D`.

### What breaks under each

Under (A) the enumerated values `COHORT_SUMMARY` and `SLICE_2D` are unusable and should be dropped.
Under (B) the domain model needs two field changes. Either way `TC-EXP-003` — which requires cohort
summaries be recomputed from persisted per-case values and report intended and successful N — needs a
defined persistence target.

### Minimum answer needed

State which entity holds a cohort summary and which holds a per-slice metric, and whether
`aggregation_level` should be narrowed.

### Specification owner's answer — **ANSWERED (2026-09-08)**

**Use three distinct entities**, replacing the single overloaded `MetricSet`:

| Entity | Key | Holds |
|---|---|---|
| **`CaseMetricSet`** | `analysis_run_id` (one run = one case) | case-level 3D primary metrics — the `07` §6 Dice/IoU |
| **`SliceMetric`** | **`run_id` + `slice_index`** | per-slice secondary metrics under the `07` §6 empty-slice rule |
| **`CohortMetricSummary`** | **Experiment-scoped** | mean / median / std / distribution / N, **derived from persisted case metrics** — never pooled across patients |

**Consequence.** `aggregation_level` as an enumerated field on one entity is retired. `SliceMetric` now
carries the `slice_index` it previously lacked, giving `11` §6's per-slice endpoint a backing entity.
`CohortMetricSummary` is experiment-scoped, matching `11` §5, and `08` §5's derived-from-per-case rule
becomes structural rather than procedural. **RA-M06 is resolved.**

**Previously blocked:** metrics persistence schema; `11` §5/§6 response models — now unblocked.

---

## SCQ-03 — `05` Experiment omits fields `08` §10 and `11` §5 require

| Field | Content |
|---|---|
| **Source finding** | RA-M07 (MEDIUM) |
| **Affected specs** | `05` §2 (Experiment), `08` §10, `11` §5 |
| **Affected requirements** | PR-EXP-01, FR-EXP-001, NFR-REP-001, NFR-REP-004, TC-EXP-001, TC-REP-001 |

### Question

Should `05` Experiment carry `evaluation_population_manifest`, `evaluation_code_version` /
`evaluation_metric_version`, and a subset manifest identifier distinct from `split_protocol_id`?

### Conflicting text

**`08` §10 — experiment result manifest** requires, among others:

```yaml
split_manifest: <id/path>
evaluation_population_manifest: <id/path>
evaluation_metric_version: <value>
training_code_version: <commit>
evaluation_code_version: <commit>
```

**`11` §5 — Experiment detail must include:** "split/subset manifest IDs" (**plural**);
"checkpoint/evaluation version".

**`05` §2 — Experiment fields:** `experiment_id`, `name`, `model_family`, `model_config`,
`training_data_fraction`, `split_protocol_id`, `seed`, `preprocessing_version`,
`postprocessing_version`, `training_code_version`, `checkpoint_id`, `status`,
`prediction_variant_policy`.

**Missing from `05`:** `evaluation_population_manifest`, `evaluation_code_version`,
`evaluation_metric_version`, and any subset manifest identifier separate from `split_protocol_id`.

### Why it matters

`TC-EXP-001` asserts the experiment manifest contains everything `08` requires. `NFR-REP-004`'s
comparable-run gate must verify "same evaluation-code/metric semantics version" — which cannot be
checked against a field the domain model does not carry. `05` is the schema the backend will be built
from, and `08` §10 is what the ML pipeline will emit; they must agree or ingestion (DR-004) will drop
fields silently.

**[LIKELY INTENT]** `05`'s field lists are described as minimums elsewhere in the file ("Suggested
fields", "Minimum metadata"), so the intent may be that `08` §10 extends rather than contradicts. If so,
saying it explicitly prevents the fields being dropped at ingest.

### Minimum answer needed

Confirm whether `05` Experiment should be extended to match `08` §10, or whether `08` §10's manifest is
a separate artifact whose extra fields need not persist in the domain model — and if the latter, how
`NFR-REP-004`'s check is satisfied.

### Specification owner's answer — **ANSWERED (2026-09-08)**

**Persist all of them.** The `Experiment` entity must carry:

- **split manifest ID**, **subset manifest ID**, and **evaluation-population manifest ID** as three
  distinct identifiers;
- **training code version** and **evaluation code version** as distinct values;
- **metric version** (evaluation metric semantics).

**Consequence.** `05` Experiment is extended to match `08` §10 and `11` §5; `08` §10's manifest is a
superset view, not a separate unpersisted artifact. `NFR-REP-004`'s comparable-run gate can now check
"same evaluation-code/metric semantics version" against real fields. Ingestion **Contract 2** (DR-004)
must require every one of these. **RA-M07 is resolved.**

**Previously blocked:** experiment schema; DR-004 ingestion field mapping — now unblocked.

---

## SCQ-04 — Is `EXP-D-PP` an Experiment or a prediction-variant view?

| Field | Content |
|---|---|
| **Source finding** | RA-M08 (MEDIUM) |
| **Affected specs** | `05` §2, `07` §5, `08` §2, `08` §9, `11` §5 |
| **Affected requirements** | PR-EXP-04, FR-EXP-005, TC-EXP-005 |

### Question

Does `EXP-D-PP` have its own AnalysisRuns, or is it the processed variant of `EXP-D-100`'s existing
runs?

### Conflicting text

**`08` §2 — experiment matrix** lists `EXP-D-PP` as a row with its own experiment ID:

| Experiment ID family | Model | Training fraction | Post-processing |
|---|---|---:|---|
| EXP-D-PP | DINOv2-based | 100% (derived from `EXP-D-100` raw predictions) | documented morphology |

and states it is "derived from the **same raw predictions produced by `EXP-D-100`**, so the
post-processing ablation does not introduce a training-data confound."

**`05` §2 — AnalysisRun** carries **both** `raw_prediction_mask_id` **and**
`processed_prediction_mask_id` on the **same run**, and `ProcessedPredictionMask` references a
`source_prediction_mask_id`.

### Candidate readings

**(A) First-class Experiment.** `EXP-D-PP` has its own AnalysisRun records referencing the same
underlying raw masks. Appears in `GET /experiments`, has its own `/metrics` and `/cases`. Duplicates run
records; the provenance invariant `05` §4.1 is still satisfiable.

**(B) Prediction-variant view.** `EXP-D-PP` is a label for evaluating `EXP-D-100`'s runs at
`prediction_variant = PROCESSED_PREDICTION`. No new runs. Matches `05`'s modelling and `07` §4's
raw/processed distinction — but then `EXP-D-PP` is not really an experiment and `11` §5's experiment
endpoints do not naturally apply to it.

### What breaks under each

- **Under (A):** two AnalysisRun records point at the same raw prediction mask for the same case. Is
  that permitted? `05` §4 does not forbid it but does not contemplate it.
- **Under (B):** `GET /experiments/EXP-D-PP/metrics` has no experiment record to serve, and the `08` §2
  matrix row has no first-class representation.

### Additional question — the comparable-run gate

**`08` §7 criterion 4** requires an "explicit raw/processed prediction variant" for runs to be labelled
comparable. `PR-EXP-04` requires exposing the raw-vs-processed ablation, which is *by construction* a
comparison across variants. Does criterion 4 mean **"the variant must be explicitly stated"** (so a
deliberate cross-variant comparison is comparable) or **"the variants must match"** (so the ablation
must be labelled non-comparable and shown descriptively per `08` §7's final paragraph)?

**[LIKELY INTENT]** "Explicitly stated" — otherwise `PR-EXP-04`'s own required comparison could never be
presented as a valid result. But the wording admits both readings.

### Minimum answer needed

State whether `EXP-D-PP` is an Experiment or a variant view, and confirm how the comparable-run gate
treats a deliberate cross-variant ablation.

### Specification owner's answer — **ANSWERED (2026-09-08)**

**Reading (A), made explicit.** `EXP-D-PP` is a **first-class derived Experiment** with **derived
`AnalysisRun`s**. Each derived run must reference **both** its source `EXP-D-100` `AnalysisRun` **and**
that run's raw prediction mask.

**On the comparable-run gate:** raw-vs-processed is an **intentional, valid ablation** — comparable
**when all other comparability fields match** (`08` §7 criteria 1, 2, 3, 5, 6). Criterion 4 means the
variant must be **explicitly stated**, not that variants must be identical.

**Consequence.** `GET /experiments/EXP-D-PP/metrics` and `/cases` are well-defined. The comparable-run
validator must permit a declared cross-variant pair rather than rejecting it, and `TC-EXP-005` asserts
the derived runs trace to the same `EXP-D-100` raw predictions. **RA-M08 is resolved.**

**Previously blocked:** the ablation's representation; `TC-EXP-005`; comparable-run validator logic — now
unblocked.

---

## SCQ-05 — Nested subsets: preference in `06`/`08`, rule in `13`

| Field | Content |
|---|---|
| **Source finding** | RA-M09 (MEDIUM) |
| **Affected specs** | `06` §7, `08` §4, `13` §8 |
| **Affected requirements** | GATE-SPLIT-01, FR-EXP-004, TC-EXP-004, TC-EXP-008 |

### Question

Is nesting (25% ⊂ 50% ⊂ 100%) a MUST, or a documented preference?

### Conflicting text

**`06` §7 — Data-scarcity subset policy:**

> "**preferably** nested subsets (25% ⊂ 50% ⊂ 100%) **unless a different design is explicitly
> documented**"

**`08` §4 — Data-scarcity subset construction:**

> "**Preferred design:** 25% subset nested inside 50%; 50% subset nested inside 100%"

**`13` §8 — TC-EXP-008:**

> "No case appears across train/validation/test partitions; **subset manifests satisfy nested/paired
> rules**."

### The problem

A test cannot assert a preference. As written, `TC-EXP-008` either fails on a legitimately documented
non-nested design — which `06` §7 explicitly permits — or is silently weakened to a no-op. This is the
same defect class as the undefined `TC-3D-004` tolerance (SCQ-06 below): an acceptance criterion whose
pass condition is not determinate.

### Candidate readings

**(A) Nesting is a MUST.** Delete the escape clause in `06` §7; `TC-EXP-008` asserts nesting
unconditionally.

**(B) Nesting is a preference.** `TC-EXP-008` becomes conditional: it asserts nesting **unless** the
split manifest records an alternative design, in which case it asserts that the manifest's declared
design is satisfied.

### What breaks under each

Under (A) the team loses a documented escape hatch that may be needed if patient counts round awkwardly
— **[SPEC]** `08` §4 anticipates this: "If exact percentage rounding is required, record resulting
patient counts." Under (B) the test needs a defined conditional form so it remains meaningful.

**[LIKELY INTENT]** Reading (B), given that both `06` and `08` use the word "preferred". But
`TC-EXP-008` would then need restating.

### Minimum answer needed

Make nesting either a MUST or a documented-design check, and state the corresponding form of
`TC-EXP-008`.

### Specification owner's answer — **ANSWERED (2026-09-08)**

**Reading (A) — nesting is MANDATORY.** `25% ⊂ 50% ⊂ 100%` nesting is **required for RQ-A**, with
**deterministic patient-count rounding**. The `06` §7 escape clause does not apply to the RQ-A matrix.

**Consequence.** `TC-EXP-008` asserts nesting **unconditionally** and becomes determinate. The rounding
rule must be documented and deterministic so the same patient counts reproduce from the same seed, and the
resulting counts are recorded per `08` §4. **RA-M09 is resolved.**

**Previously blocked:** `TC-EXP-008` reaching a determinate pass/fail — now unblocked.

---

## SCQ-06 — `TC-3D-004` has no tolerance value anywhere in the specification

| Field | Content |
|---|---|
| **Source finding** | RA-H11 (HIGH) |
| **Affected specs** | `13` §8, `09` §6, `07` §8 |
| **Affected requirements** | TC-3D-004, FR-3D-005, FR-3D-006, PR-3D-04 |

### Question

What is the tolerance, and where is it defined?

### The text

**`13` §8 — TC-3D-004:**

> "Known mesh/world test points resolve to the expected slice index **within the fixture's defined
> tolerance**, including after camera rotate/zoom."

**[VERIFIED]** The word *tolerance* appears **exactly once** in the entire 18-file specification set —
in that sentence. No fixture defines a value, and no file states how one should be derived.

**`09` §6** requires "test fixtures with known voxel↔world↔slice mappings" and that "Backend/mobile
implementations may be language-specific, but both must pass the same fixture conformance tests" — but
specifies no tolerance.

### Why this is not merely pedantic

`TC-3D-004` is the acceptance test for **PR-3D-04 (MUST)** and FR-3D-005/006. As written it cannot pass
or fail deterministically: any observed result can be declared "within tolerance". **[SPEC]** `13` §12
classifies "2D/3D mapping wrong in accepted build" as **P0/Critical** — so this is the acceptance gate
for a P0-class defect class, and it currently has no gate.

It also interacts with mesh decimation (RA-H14): decimation moves vertices and therefore degrades
3D→slice accuracy. Without a tolerance there is no criterion for how much decimation is acceptable, and
`07` §7's "only if mapping remains valid" has no operational meaning.

**[RECOMMENDATION — not a resolution]** A defensible structure, offered only to make the question
concrete: exact slice index for interior test points; ±1 slice for surface-tangent points where the
picking ray is near-parallel to the slice plane. Spike B is designed to produce the empirical basis
(`TECHNICAL_SPIKES_REQUIRED.md`, Spike B deliverable 7).

### Minimum answer needed

Either state the tolerance, or confirm it is to be derived from Spike B evidence and recorded in the
`09` §6 canonical fixture set — in which case `TC-3D-004`'s reference to "the fixture's defined
tolerance" becomes satisfiable.

### Specification owner's answer — **ANSWERED (2026-09-08)**

**A two-tier tolerance is set:**

| Context | Tolerance |
|---|---|
| **Canonical geometry fixtures** | **exact** slice mapping — zero tolerance |
| **Decimated real-mesh picking** | **at most ±1 source slice** |

**Spike B must validate this, and it must not be silently relaxed.** Any proposal to widen it requires a
Decision Request under `00` §13.

**Consequence.** `TC-3D-004` is now determinate: exact against fixtures, ≤±1 slice against a decimated real
mesh. This also **bounds DR-008c** — a decimation level that pushes picking beyond ±1 slice is not
acceptable regardless of its frame rate, which resolves the RA-H11/RA-H14 circularity in favour of
accuracy. **RA-H11 is bounded; DR-008b/c remain OPEN pending Spike B measurement within this ceiling.**

**Previously blocked:** `FR-3D-005`/`FR-3D-006` acceptance; Spike B's pass criterion — criterion now
defined.

---

## SCQ-07 — Metric semantics have no functional requirement; `TC-EXP-009` is orphaned

| Field | Content |
|---|---|
| **Source finding** | RA-M15 (MEDIUM) |
| **Affected specs** | `04`, `07` §6, `08` §5, `13` §4, `13` §10 |
| **Affected requirements** | TC-EXP-009, NFR-AUDIT-001, NFR-AUDIT-002 |

### Question

Should metric computation semantics have a functional requirement ID, and should `TC-EXP-009` be added
to the `13` §10 coverage map?

### The evidence

**[VERIFIED]** `TC-EXP-009` is defined in `13` §8:

> "**TC-EXP-009 — Empty-slice metric semantics.** Synthetic cases verify the exact empty/non-empty
> per-slice Dice rules from `07` and case-level 3D primary metric behavior."

It appears in **neither** the `13` §4 product trace map **nor** the `13` §10 FR/NFR coverage map. It is
the **only** one of the 69 acceptance tests that maps to no requirement.

**[VERIFIED]** Correspondingly, no functional requirement in `04` states metric semantics. The
case-level-3D-primary rule (`07` §6, `08` §5) and the empty-slice rule (`07` §6) exist only as prose.

### Why it matters

**[SPEC]** `13` §3's execution RTM tracks work by requirement, and `NFR-AUDIT-002` counts only ACCEPTED
requirements as progress. Metric semantics underpin every number in the final report — and
`SPEC_AUDIT_REPORT_v1_0.md` AUD-05 identifies ambiguous metric semantics as a v0.1 defect that v1.0 was
specifically written to close. Yet the resulting rules have no requirement row to be owned, tracked, or
accepted against, and their test hangs off nothing.

This is arguably the mirror image of AUD-03, which the prior audit resolved by ensuring every FR has a
test. Here a test exists with no FR.

### Minimum answer needed

Either add a functional requirement in `04` for metric computation semantics and map `TC-EXP-009` to it
in `13` §10, or confirm that `TC-EXP-009` is intentionally a protocol-level test tracked outside the
FR/NFR coverage map.

### Specification owner's answer — **ANSWERED (2026-09-08)**

**Add a dedicated metric-semantics functional requirement in the next specification revision**, and
**map `TC-EXP-009` to it** in the `13` §10 coverage map.

**Consequence.** The orphan test gains a requirement anchor and metric semantics become trackable to
ACCEPTED in the execution RTM. **[NOTE]** This is a change to a **future spec revision**, not to Frozen
v1.0 — `docs/specs/v1.0/` stays untouched. Until that revision lands, `TC-EXP-009` remains an orphan in
v1.0 and must be tracked explicitly so it is not dropped. **RA-M15 has an accepted resolution path.**

---

## SCQ-08 — `15` §8 "CI required" versus `15` §20 "once infrastructure exists"

| Field | Content |
|---|---|
| **Source finding** | RA-L03 (LOW) |
| **Affected spec** | `15` §8, `15` §20 |
| **Affected requirements** | `13` §6 DoD item 2, NFR-MAINT-003, TC-MAINT-003 |

### Question

From what point is CI a hard merge gate?

### Conflicting text

**`15` §8 — Protected branch rules:**

> "no direct push; pull request required; **CI required**; at least one assigned reviewer approval for
> merge"

**`15` §20 — Continuous integration rule:**

> "**Minimum CI before merge once infrastructure exists**: formatting/lint/static checks selected by
> stack; unit tests for touched critical logic; contract/schema validation; build/package check for
> affected application(s); secrets scan where configured."

### The problem

§8 states CI as an unconditional merge rule; §20 conditions it on infrastructure existing. During the
first days — before a stack is selected (GATE-MOB-01) and therefore before lint/build tooling can be
configured — the two readings differ on whether merges are permitted at all.

**[LIKELY INTENT]** §20 governs the ramp-up and §8 describes the steady state. Saying so removes any
argument about whether early merges are legitimate.

### Minimum answer needed

Confirm that CI becomes a hard gate from a defined point, and that this point is recorded in
`DEVELOPMENT_WORKFLOW.md` (which `15` §8 already designates for freezing workflow specifics such as the
sync command).

### Specification owner's answer — **ANSWERED (2026-09-08)**

**CI becomes a hard merge gate from the first production-code merge after the CI bootstrap is
ACCEPTED.** Governance and documentation work **before** that point may merge after **manual review**.

**Consequence.** `15` §20 governs the ramp-up and `15` §8 the steady state, with an unambiguous switchover
point: the first production-code merge following an ACCEPTED CI bootstrap. Record it in
`DEVELOPMENT_WORKFLOW.md`. These readiness artifacts are governance work and fall before the gate.
**RA-L03 is resolved.**

---

## SCQ-09 — `00` §11 assigns the spikes to Claude; `17` §5 assigns them to the team

| Field | Content |
|---|---|
| **Source finding** | RA-L06 (LOW) |
| **Affected specs** | `00` §11, `07` §12, `17` §5 Step 2 |
| **Affected requirements** | GATE-MOB-01, NFR-PERF-001..004, NFR-USAB-005 |

### Question

Who executes Spikes A and B?

### Conflicting text

**`00` §11:**

> "Before production repository architecture is frozen, **Claude must run two technical spikes** and
> produce an ADR"

**`17` §5 Step 2:**

> "**Technical Architect + Implementation perform mobile Spike A/B** and generate `TECH_STACK_ADR.md`."

### The practical constraint

**[VERIFIED]** Claude cannot install and run a mobile build on a physical handset, measure on-device
frame rate or touch latency, or perform manual touch-accuracy testing. **[SPEC]** `07` §12 requires the
spikes to exercise `NFR-PERF-001`–`004` on the declared target demo device, and `10` §9.1 anchors those
NFRs and the `NFR-USAB-005` five-run smoke test to that device.

So the spikes as specified **cannot** be executed by Claude alone, regardless of which file is
authoritative.

**[LIKELY INTENT]** `17` §5 Step 2 reflects the practical division. Claude builds harnesses, generates
fixtures, writes instrumentation, and analyses results; a human runs them on the device.

### Minimum answer needed

Confirm the division of labour, so each spike can be assigned a named human owner in the 30-day plan
without appearing to contradict `00` §11.

### Specification owner's answer — **ANSWERED (2026-09-08)**

**Claude prepares harnesses, instrumentation and analysis. Named human owners execute
physical-device and hardware measurements and supply the evidence.**

**Consequence.** The `00` §11 / `17` §5 tension is settled operationally without a spec change. Spikes
A, B, E and the interactive half of F require a named human owner on the declared device; Spike C0/C1 and
D require a named human owner for hardware measurement, with Claude supplying harness and analysis.
**RA-L06 is resolved.**

---

## Summary

| ID | Subject | Severity of source finding | Blocks |
|---|---|---|---|
| **SCQ-01** | `05` §1 hierarchy vs §2/§6 | MEDIUM | review/finding schema |
| **SCQ-02** | MetricSet aggregation levels | MEDIUM | metrics persistence schema |
| **SCQ-03** | `05` Experiment vs `08` §10 manifest | MEDIUM | experiment schema, ingestion mapping |
| **SCQ-04** | `EXP-D-PP` entity + comparable-run gate | MEDIUM | ablation representation |
| **SCQ-05** | Nested subsets: preference vs rule | MEDIUM | `TC-EXP-008` determinacy |
| **SCQ-06** | `TC-3D-004` tolerance undefined | **HIGH** | FR-3D-005/006 ACCEPTED; Spike B criterion |
| **SCQ-07** | Metric semantics have no FR; `TC-EXP-009` orphaned | MEDIUM | RTM completeness |
| **SCQ-08** | CI gate timing | LOW | nothing |

**All nine are ANSWERED as of 2026-09-08.** See `READINESS_REVIEW_RESOLUTION.md` §4 for the consolidated record.
| **SCQ-09** | Spike ownership | LOW | spike assignment |

Six of the nine (SCQ-01..05, SCQ-07) are internal inconsistencies within or between frozen files.
Three (SCQ-06, SCQ-08, SCQ-09) are omissions or ambiguities rather than contradictions.

**All nine have since been answered by the specification owner** (2026-09-08), recorded inline above.
`docs/specs/v1.0/` remains **unmodified** — verified 19/19. SCQ-07's answer is scheduled for a **future**
specification revision and has not been applied to v1.0.

---

**Related documents:** `IMPLEMENTATION_READINESS_AUDIT.md` · `OPEN_DECISIONS.md` ·
`TECHNICAL_SPIKES_REQUIRED.md` · `RISK_REGISTER_INITIAL.md` · `IMPLEMENTATION_READINESS_STATUS.md`
