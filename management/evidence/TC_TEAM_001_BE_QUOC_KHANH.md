# TC-TEAM-001 evidence package — Bế Quốc Khánh / V3

| Field | Value |
|---|---|
| Member | Bế Quốc Khánh |
| Owned vertical | V3 — Experiment / Cohort Analysis |
| Technical block | Dataset audit, split/subset, ML training/evaluation |
| Secondary reviewer | Vũ Hùng Anh |
| Prepared | 2026-09-17 (Day 8); evidence index refreshed 2026-10-29 |
| Package status | **IN PROGRESS — not yet a TC-TEAM-001 PASS** |

This is the durable evidence index required by `10` §10, `14` §4 and `TC-TEAM-001`. This refresh corrects old
statements that V3 and the dataset/split work were still unimplemented. Project evidence does not by itself
prove which steps Khánh personally executed; Khánh must verify personal attribution and provide the missing
owner/device evidence before this package can pass.

## 1. Requirement and use-case ownership

The owned mobile function is cohort and experiment comparison: show dataset/experiment population, compare
UNet and DINOv2 across data fractions, expose distributions rather than only means, identify outliers, and
drill from an outlier to case-level evidence.

Primary trace:

- `PR-COHORT-01`, `PR-COHORT-02`, `PR-EXP-01`…`PR-EXP-04`;
- `FR-EXP-001`…`FR-EXP-006`;
- `UC-10`…`UC-12`;
- `SCR-01` Study Overview and `SCR-07` Experiment Comparison;
- `TC-EXP-001`…`TC-EXP-009`, `TC-REP-001`…`TC-REP-004`, `TC-SCI-001`…`003`.

Scientific rule: every aggregate carries the intended and successful N and drills down to persisted per-case
evidence. Missing ground truth is unavailable, not zero. Non-comparable runs are blocked or visibly labeled.

## 2. UI design artifact

The V3 baseline has two connected screens. This is a design artifact, not an implementation screenshot.

```text
SCR-01 · STUDY OVERVIEW
┌──────────────────────────────────────────┐
│ LASC 2018 implementation cohort          │
│ Cases: N=154 · split/gate status         │
│ [Experiments] [Data] [Risks/limits]      │
│                                          │
│ Model × fraction summary                 │
│ UNet   25%  50%  100%   N / status      │
│ DINO   25%  50%  100%   N / status      │
│ [Open comparison]                        │
└──────────────────────────────────────────┘

SCR-07 · EXPERIMENT COMPARISON
┌──────────────────────────────────────────┐
│ Comparable set: [metric] [population]    │
│ Distribution / CI, not mean alone        │
│  UNet  ──●────  DINOv2 ───●──            │
│ Data-scarcity trend: 25 → 50 → 100%      │
│ Intended N / successful N / failures     │
│ Outliers                                 │
│ CASE_xxxx  value  [Open case evidence]   │
│ ⚠ patient split limitation / versions    │
└──────────────────────────────────────────┘
```

Design rationale:

- population and N appear before performance to prevent context-free model claims;
- model ordering is preserved from frozen artifacts; the UI cannot reorder to imply a preferred winner;
- distribution, CI and outliers expose cohort behavior hidden by a mean;
- outlier drill-down links to the shared case explorer instead of duplicating image inspection;
- status text accompanies color, and unavailable/invalid states cannot look like a score of zero;
- compact cards serve portrait; charts and the evidence table may use landscape.

The state matrix below is the acceptance target. The model and screen logic implement several of these states;
target-device verification and the full owner acceptance record remain open.

Design-state matrix (requirements for the future UI, **not** observed app behavior):

| State | SCR-01 overview | SCR-07 comparison | Evidence/exit rule |
|---|---|---|---|
| Loading | show cohort/experiment skeleton; no invented counts | reserve chart/table geometry; no zero-value placeholders | exit only after versioned summary validates |
| Legitimately unavailable | show gate or missing-artifact reason and `N unavailable` | disable model comparison; show missing metric/population reason | never substitute zero for a missing metric |
| Processing | retain last validated snapshot marked stale | show run progress without mixing partial and final metrics | replace only with a complete validated result |
| Recoverable failure | explain fetch/timeout and offer retry | keep previous validated result clearly labeled; offer retry | no silently reused stale numbers |
| Invalid data | block affected counts/cards | block aggregate and outlier drill-down | surface validation error and artifact ID |
| Version mismatch | label dataset/split version conflict | forbid cross-version comparison | require matching frozen provenance before rendering |
| Valid | show intended/successful N and gate/source links | show distribution, CI, failures and outlier-to-case link | every number traces to persisted evidence |

Portrait stacks cards and the evidence table; landscape may place chart and table side by side. Both
layouts must preserve state text, N, version and the patient-linkage limitation. Keyboard/screen-reader
labels must not rely on color or chart geometry alone.

## 3. Architecture, API and data interaction

```text
Dataset manifest + split manifest
              │
              ▼
training/evaluation artifacts ──► comparable-run validator
              │                         │
              ▼                         ▼
 CaseMetricSet / SliceMetric / CohortMetricSummary
              │
              ▼
       V3 SCR-01 / SCR-07 ──► shared Case Explorer
```

The UI consumes versioned artifacts; it does not calculate authoritative metrics from display data. The
contract must preserve dataset, split, subset, checkpoint, preprocessing, postprocessing, code and evaluation
versions, plus intended/successful N and failure records. `GATE-DATA-01`, `GATE-SPLIT-01` and `GATE-ML-01`
must be represented as unavailable states rather than bypassed.

Current architecture evidence:

- dataset audit and generated manifest: PR #34 (merged; `management/spikes/SPIKE_D_DATASET/RESULT.md`);
- correlation grouping/exclusion and nested effective subsets: PR #35 (merged; `management/spikes/SPIKE_C_SPLIT/`);
- measured C0 feasibility and generated report: merged PR #36;
- synthetic pipeline/reload skeleton: PR #37 (merged);
- QA-002 validator hardening: PR #40 (merged);
- V3 model and SCR-01/SCR-07: PR #61 and PR #69 (merged);
- DINOv2 holdout aggregates and PP-4 ablation: PR #96 (merged; aggregate results only);
- UNet queue, training kit and authorization/export tooling: PR #100 (merged). This is tooling evidence, not
  evidence that any EXP-U run has completed.
- C1 execution design: `management/spikes/SPIKE_C_ML/C1_MEASUREMENT_PLAN.md`.

## 4. Implementation PR and commit evidence

| Evidence | Contribution | Status |
|---|---|---|
| PR #34 / #35 | Dataset audit and split safeguards, including correlation grouping and nested effective subsets | merged; see each PR's review/evidence record |
| PR #36 / #37 / #40 | C0 measurement, synthetic pipeline/checkpoint reload, validator hardening | merged |
| PR #61 / #69 | Framework-neutral V3 models and SCR-01/SCR-07 screens | merged; target-device/live-data acceptance remains open |
| PR #87 | Mobile render smoke and bundle in CI | merged; logic/render evidence, not phone evidence |
| PR #90 | Khánh owner revalidation of earlier delegated changes | merged |
| PR #92–#96 | PP-4 pipeline, gate, backend holdout support, API E2E and DINOv2 aggregates | merged; no UNet result included |
| PR #100 | UNet queue, CPU tests, authorization builder and holdout pipeline | merged; run artifacts still required separately |
| PR #105 | Day 40 post-recovery revalidation | open; leader review requested, K3/K4 depend on leader-PC evidence |

**Missing for final package:** Khánh's explicit review/attribution of the V3 implementation; real-backend
SCR-01/SCR-07 and outlier-to-case evidence; target-device checks; integrated demo and secondary-reviewer
handoff. The implementation PRs are merged, but those merges alone do not close the acceptance test.

## 5. Test and evidence record

Already reproducible:

- official cohort validation in #34: 154 cases; public/restricted evidence boundary enforced;
- split self-test 17/17, linkage self-test 5/5 and schema validation in #35;
- C0 report regeneration and GPU evidence in merged #36;
- #37 synthetic rerun: pipeline self-test PASS, probe search 8/8, variant paths 10/10, both checkpoint reloads
  exact (`max_abs_output_difference = 0.0`), no real dataset bytes read;
- #40 validator self-test and adversarial hardening regression 8/8;
- V3 model suite: 160/160 on the refreshed local checkout;
- V3 screen logic suite: 12/12 on the refreshed local checkout;
- mobile render smoke and Android bundle export run in CI since PR #87 (PR #105's recorded CI baseline is green).

Still required for the owned mobile function:

- owner review of the implementation and test evidence, including comparison refusal behavior;
- real-backend SCR-01/SCR-07 and outlier-to-case evidence;
- target-device portrait, touch/accessibility and state checks on A17;
- canonical integrated demo evidence and secondary-reviewer handoff.

## 6. Privacy and data considerations

- No raw dataset, mask or checkpoint bytes enter Git.
- Public evidence omits per-file checksums and exact linkage scores under F5; restricted artifacts stay
  outside the repository and are referenced by hash/regeneration command.
- The mobile path receives de-identified internal case IDs and allowlisted metadata only.
- Unknown headers/sidecars and unexpected package files fail closed until explicitly dispositioned.
- Holdout predictions and labels remain locked until the frozen final evaluation; Spike C1 is training-only.
- Every reported evaluation must state that patient-level separation is not verifiable for this release and
  describe the correlation-grouping/exclusion safeguard.

## 7. Demo and defense notes

Short defense path:

1. V3 answers a cohort question, not merely “which model has the higher mean.”
2. Dataset audit and split provenance come first because downstream metrics are invalid without them.
3. C0 measures hardware plumbing; only C1 on a validated training subset may support `GATE-ML-01`.
4. The 25/50/100% comparison uses nested effective subsets and one frozen recipe.
5. Intended N, successful N, failures, distribution and outliers remain visible.
6. An outlier opens persisted case/slice evidence in the shared explorer.
7. Exact linkage scores stay restricted, while the public threshold, groups, exclusions and counts remain
   auditable.
8. A negative result—OOM, non-convergence, or an infeasible calendar—is preserved rather than optimized
   away after observation.

Known limitations/trade-offs:

- V3 model and mobile screens are implemented and merged; live-data/device acceptance is still pending.
- The current project record says the UNet family has not been trained. PR #100 supplies the queue and
  pipeline only. The approved architecture is the project's plain `UNet2D` implementation
  (`unet_base32_depth4`), trained from scratch under ADR-ML-001; it is not the nnU-Net framework.
- No EXP-U run manifest is present in this checkout's external `D:\cardiac-mri-workspace-data\runs` directory;
  it currently contains queue metadata only. Runs on another machine require checking that machine's logs.
- Patient-level separation cannot be proven from the released package.
- K3/K4 of the owner revalidation still require leader-PC holdout logs and `metrics_summary.json` review.

## 8. Shared-core readiness

The Day 0 practice/sign-off records the shared flow MRI → preprocessing → model → mask → metric → 3D →
mobile, ground-truth/prediction distinctions, leakage risk, Dice/IoU evidence drill-down, geometry linkage and
Git/PR/acceptance workflow. Source: `management/onboarding/practice/PRACTICE_BE_QUOC_KHANH.md` and
`management/onboarding/DAY0_SIGNOFF.md`.

## 9. Completion checklist

- [x] function/use-case analysis
- [x] UI design baseline and rationale
- [x] architecture/API/data explanation
- [x] supporting technical PR/commit evidence
- [x] current test evidence indexed
- [x] privacy/data considerations
- [x] defense notes and limitations
- [x] V3 model and mobile implementation merged (#61/#69)
- [x] V3 model/screen logic tests; render smoke and bundle in CI
- [ ] owner review and personal-contribution confirmation
- [ ] real-backend V3 UI and target-device evidence
- [ ] integrated demo and secondary-reviewer handoff

Package verdict: **IN PROGRESS**. It is ready for review as an evidence index, but not for a
`TC-TEAM-001 PASS` claim.
