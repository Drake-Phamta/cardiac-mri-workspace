# 15 — TEAM EXECUTION AND PROJECT CONTROL

**Status:** Frozen v1.0  
**Applies to:** all 4 team members  
**Depends on:** `00`–`14`

---

## 1. Purpose

Define the repeatable 30-day operating system for planning, execution, Git collaboration, review, quality control, project-state tracking, dynamic replanning, and deadline protection.

The 30-day master plan is a **baseline trajectory**, not a rigid calendar. Daily plans are generated from the **actual project state**.

---

## 2. Core operating principles

1. **Plan follows reality.** Never mark reality as complete just to match the schedule.
2. **Accepted evidence, not percentages.** “80% done” does not count as progress; ACCEPTED requirements/tasks do.
3. **Integrate continuously.** No “integration week” at the end.
4. **Critical path before equal workload.** Optimize system progress, not identical task counts.
5. **Start less, finish more.** WIP limits apply.
6. **No silent specification changes.** Use Decision Requests.
7. **No unresolved conflict on protected integration/main branch.** Prevent parallel code collisions through task/module planning.
8. **Every task has an owner and reviewer before work starts.**
9. **MUST before SHOULD before COULD when deadline risk exists.**
10. **Main is the best accepted integrated state of the product.**

---

## 3. 30-day master plan rules

Claude will generate `MASTER_PLAN_30_DAYS.md` after reading the frozen specifications.

The master plan must include:

- milestones;
- critical-path dependency graph;
- required technical spikes;
- shared-core onboarding period;
- vertical development periods;
- integration gates;
- scientific experiment gates;
- mobile MVP gates;
- stabilization/demo/report period;
- buffer/recovery capacity.

The plan must not assume every day proceeds exactly as forecast.

Each milestone must have an **exit criterion**, not only a target date. Claude must preserve at least **2 calendar days of explicit stabilization/recovery buffer** before the final presentation deadline unless the leader documents why the real deadline differs. Buffer is not pre-spent on COULD work.

---

## 4. Project state snapshot

Maintain `management/PROJECT_STATE.yaml` as the machine-readable current truth.

Minimum fields:

```yaml
day: 1
requirements:
  accepted: 0
  in_progress: 0
  blocked: 0
  not_started: 0
critical_path: []
members: {}
integration: {}
tests:
  passed: 0
  failed: 0
risks: []
forecast:
  target_day: 30
  current_completion_day: 30
  confidence: null
  remaining_buffer_days: null
milestones: {}
open_prs: []
technical_debt: []
decisions_pending: []
last_canonical_smoke:
  status: NOT_RUN
  commit: null
```

The next daily plan must be based on the latest accepted state, not on the nominal calendar day alone.

---

## 5. Daily planning contract

Every `DAY_N_PLAN.md` must contain:

1. Day objective.
2. Current critical path.
3. Carry-over blockers/needs-fix items.
4. Per-member task package.
5. Reviewer assignment.
6. Dependencies.
7. Integration target for end of day.
8. Risks and fallback.
9. Expected project-state delta.
10. Explicit SHOULD/COULD work allowed or frozen.
11. Member availability/capacity for the day.
12. Planned review window so PRs are not opened too late for EOD acceptance.
13. Canonical smoke/integration checks that must be rerun after merges.

### Daily capacity rule

- Planning is based on **actual available hours**, not an assumption that all four members have equal full-day capacity.
- A normal primary task should target a reviewable deliverable within the same day (typically a few focused hours, not a multi-day epic).
- If work is inherently multi-day (e.g., training), split it into daily checkpoints with observable artifacts: config frozen, run launched, checkpoint produced, evaluation completed, etc.
- No member receives a new primary task that depends on an unaccepted upstream artifact unless an accepted mock/fixture contract exists.

---

## 6. Task schema

Every implementation task must contain:

- Task ID (`Dxx-Tyy` or equivalent).
- Requirement IDs.
- Owner.
- Reviewer.
- Objective.
- Inputs.
- Expected outputs/artifacts.
- Dependencies.
- Allowed module/file boundary.
- Integration-sensitive files it may touch.
- Acceptance criteria.
- Automated test expectation.
- Manual verification expectation.
- Definition of Done reference.
- Effort estimate.
- Risk/fallback.
- Target PR timing.
- Estimated focused hours / capacity fit.
- Upstream contract/fixture version.
- Downstream consumer/integration target.
- Evidence required at EOD.

No vague task such as “work on backend” or “finish ML” is valid.

---

## 7. WIP limit

Per member:

- maximum **1 primary implementation task IN_PROGRESS**;
- optionally 1 review task;
- optionally 1 small auxiliary/non-blocking task.

Do not start a new primary task while the previous one is awaiting a small fix that the same owner can reasonably close.

A reviewer should acknowledge a ready-for-review PR within the team's agreed same-day review window. If review capacity is unavailable, Project Control must treat that as a planning constraint rather than allowing a large queue of unreviewed “done” work.

---

## 8. Git branching strategy

### Protected branch

`main` is protected.

Rules:

- no direct push;
- pull request required;
- CI required;
- at least one assigned reviewer approval for merge;
- acceptance evidence required for critical work;
- force-push to `main` prohibited;
- default merge method is **Squash Merge** unless `DEVELOPMENT_WORKFLOW.md` documents a stronger project-wide alternative;
- merged PR title/description must retain task + requirement IDs for auditability.

### Short-lived branches

Naming examples:

- `feat/FR-3D-005`
- `fix/FR-REV-011`
- `exp/EXP-D-050`
- `chore/...`

One task should normally map to one short-lived branch/PR.
A branch has one accountable owner. Pair work may share a branch only when explicitly planned; otherwise parallel members do not commit into each other's feature branches.

---

## 9. Conflict prevention rules

The project cannot guarantee that Git will never detect a textual conflict, but the workflow must prevent conflict from becoming normal.

### Parallel task rule

Claude/leader SHALL NOT assign two parallel tasks that modify overlapping feature/module boundaries unless they are explicitly pair-programming tasks.

### Integration-sensitive files

Mark files such as:

- dependency manifests;
- shared API schemas/types;
- routing/root navigation;
- database migrations;
- central config;
- geometry contract;
- shared build files.

Only one active owner should modify an integration-sensitive area at a time unless changes are coordinated.

### Small PR rule

Prefer mergeable daily/short-lived PRs. Avoid multi-day giant PRs that touch unrelated modules.

### Sync rule

Before starting a branch, branch from latest accepted `main`. Before merge, the branch must be synchronized with latest `main`, conflict-free, CI-green, and retested. The exact sync command (rebase vs merge-from-main) is frozen once in `DEVELOPMENT_WORKFLOW.md` and used consistently. Resolve any textual/semantic conflict on the feature branch; never leave unresolved conflict on `main`.

If two tasks unexpectedly begin touching the same integration-sensitive file, the second task is paused/resequenced unless the leader explicitly converts them to coordinated pair work.

---

## 10. Code ownership boundary

Repository architecture shall define clear feature/service boundaries so daily planning can detect likely file collision.

Parallel work should target different boundaries when possible.

If a task requires a cross-cutting refactor, schedule it explicitly and temporarily freeze conflicting work.

---

## 11. Review protocol

Every task has owner + reviewer before implementation.

Reviewer checks:

- requirement match;
- architecture boundary;
- readability/maintainability;
- error handling;
- tests;
- privacy/security;
- integration impact;
- technical debt introduced.

Critical/architecture/spec-impact changes may require leader review in addition to primary reviewer.

Review result is one of: `APPROVE`, `NEEDS_FIX`, or `BLOCKED/DECISION_REQUIRED`; silence is not approval. Review comments that affect a contract/spec must reference the relevant ID.

---

## 12. Accepted versus implemented

State flow:

`READY → IN_PROGRESS → PR_OPEN → IN_REVIEW → ACCEPTED`

Exception states:

- `NEEDS_FIX`
- `BLOCKED`

“Implementation complete” is not a final project state. Only ACCEPTED work counts in project progress.

---

## 13. Daily execution cycle

### Start of day

1. Read latest Project State and previous EOD review.
2. Identify blockers/P0/P1/critical-path work.
3. Generate daily plan.
4. Leader approves/adjusts plan.
5. Members begin only READY tasks.

### During day

- maintain task state;
- open PR early enough for review;
- escalate blockers rather than hiding them until EOD;
- keep main green/integrated.

### End of day

Each member submits evidence:

- assigned tasks;
- accepted/needs-fix/blocked status;
- PR links;
- test results;
- demo evidence;
- known issues;
- newly discovered risks;
- dependency needs for tomorrow;
- actual focused effort vs estimate (rough, for planning calibration rather than surveillance);
- exact commit/PR tested;
- whether canonical smoke/integration was rerun after merge.

---

## 14. End-of-day quality gates

### Gate 1 — Requirement
Does behavior satisfy the specification/acceptance criteria?

### Gate 2 — Code quality
Is implementation maintainable, appropriately tested, and within architecture boundaries?

### Gate 3 — Functional verification
Does it work under realistic interaction, not only compile?

### Gate 4 — Integration
Does it work with upstream/downstream contracts and main branch?

### Gate 5 — Product quality
Would the leader accept demonstrating this function to the lecturer today?

A failure at a required gate prevents ACCEPTED status.

---

## 15. EOD review artifact

`DAY_N_REVIEW.md` must include:

- planned tasks count;
- accepted count;
- needs-fix count;
- blocked count;
- critical-path status;
- integration status;
- tests passed/failed;
- requirement completion state;
- new/changed risks;
- technical debt introduced;
- actual vs baseline schedule;
- proposed corrective actions;
- preliminary next-day priorities;
- MUST accepted / total, SHOULD accepted / total;
- critical-path blocker age;
- remaining recovery buffer days;
- open PR age/review bottlenecks;
- canonical smoke result and commit hash.

Task-count completion alone cannot determine Green/Amber/Red status.

---

## 16. Daily status colors

### GREEN
Critical path healthy; MUST acceptance progressing; no unresolved P0/P1 threatens near-term milestones; current forecast fits deadline **with non-negative recovery buffer** and canonical smoke is passing for implemented capabilities.

### AMBER
A critical dependency/MUST/P1 is at risk or forecast confidence declines; corrective action required immediately.

### RED
Critical path blocked, major scientific/integration validity failure, or current forecast exceeds deadline without an approved recovery plan.

---

## 17. Dynamic replanning

Claude/leader must replan the next day based on actual state.

Priority order:

1. P0 blockers/incidents.
2. Failing MUST acceptance criteria.
3. Critical-path dependencies.
4. Integration defects/regressions.
5. Planned MUST work.
6. SHOULD work.
7. COULD work.

Do not preserve a nominal Day N task simply because it was in the baseline if dependencies are not ready.

---

## 18. Recovery protocol

Recovery is triggered **before** Day 30 is impossible, not after. Trigger when any is true:

- forecast exceeds Day 30;
- remaining buffer drops below the planned safety threshold;
- a critical-path blocker survives two EOD cycles without credible resolution;
- canonical smoke repeatedly fails after accepted merges;
- a required scientific gate is still unresolved at the latest safe start date.

Then apply the following levels in order as appropriate:

### Level 1 — Reallocate
Move reviewer/secondary owner to critical path.

### Level 2 — Pair
Pair two members on a high-risk blocker; freeze overlapping work.

### Level 3 — Parallelize safely
Split task along non-overlapping contracts.

### Level 4 — Simplify implementation
Preserve requirement/acceptance while choosing a simpler technical path.

### Level 5 — De-scope
Freeze/drop COULD, then SHOULD if necessary through explicit leader decision. MUST scope changes require formal Decision Request and spec update.

---

## 19. Decision Request protocol

If implementation reveals a needed scope/architecture/scientific change, create:

`DR-XXX`

with:

- problem;
- affected requirement/spec sections;
- evidence;
- options;
- recommendation;
- schedule/quality/scientific impact;
- decision owner;
- outcome.

No implementation agent/member may silently redefine a requirement because a different implementation is easier.

---

## 20. Continuous integration rule

There is no final “integration phase” where isolated work is first combined.

At the end of each day, `main` should represent the best accepted runnable state. Incomplete future functionality may use stable mocks/fixtures behind clear boundaries, but broken integration cannot be hidden until the last week.

Minimum CI before merge once infrastructure exists:

- formatting/lint/static checks selected by stack;
- unit tests for touched critical logic;
- contract/schema validation;
- build/package check for affected application(s);
- secrets scan where configured.

High-risk changes additionally run their mapped integration/geometry/scientific tests before ACCEPTED.

---

## 21. Canonical vertical slice

Use `DEMO_CASE_001` as the continuously evolving product health check.

As capabilities arrive, keep proving:

`MRI → slice navigation → prediction → error/metrics → 3D → linked navigation → review/brush → persistence`

---

## 22. Leader dashboard

The leader should be able to answer at any EOD:

- Which MUST requirements are ACCEPTED?
- What is the current critical path?
- What is blocked and why?
- Which PRs are awaiting review?
- Which integration tests fail?
- Is Day 30 still credible?
- What new risk appeared today?
- Which member/block is becoming a bottleneck?
- What must change tomorrow?
- Is accepted-throughput/velocity trending below the baseline for 2+ days?
- Is review latency or one module becoming a systemic bottleneck?
- How many recovery-buffer days remain?

---


## 23. Anti-gaming and planning calibration rules

- Do not split tasks artificially just to inflate completion count. Task boundaries must represent meaningful reviewable outputs.
- Do not defer failing tests by relabeling them as “known limitation” when they violate a MUST acceptance criterion.
- Effort estimates are calibrated using actual prior days; they are not performance scores for individuals.
- Claude may recommend reallocation based on dependencies/skills, but leader must preserve each member's required individual mobile-function evidence.
- A task that is functionally correct but cannot integrate because its upstream/downstream contract was ignored is `NEEDS_FIX`, not ACCEPTED.
