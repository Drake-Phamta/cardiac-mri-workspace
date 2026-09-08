# 17 — LEADER–CLAUDE ORCHESTRATION PROTOCOL

**Status:** Frozen v1.0  
**Audience:** **Team leader only**  
**Depends on:** `00`–`16`

---

## 1. Purpose

Define how the team leader uses Claude Max as a controlled project-execution cockpit without allowing Claude to become the uncontrolled source of product truth.

**Team members do not need to use or maintain these Claude chat contexts.** They receive tasks, Git workflow, review rules, and daily expectations from the leader according to `14` and `15`.

---

## 2. Authority model

### ChatGPT role

- specification owner/co-author;
- independent auditor;
- adversarial review of Claude plans/status;
- support for scope/requirement/quality decisions.

### Team leader role

- final project-control authority;
- operates Claude chats;
- distributes daily tasks to members;
- approves project-state changes, priorities, scope decisions, and recovery actions;
- relays EOD artifacts between Claude and ChatGPT for independent critique.

### Claude Max role

- implementation planner;
- repository/code execution agent;
- technical researcher/architect under specification constraints;
- daily planning and state-analysis assistant;
- QA/red-team assistant when placed in that role.

Claude does **not** have authority to silently redefine product scope, dataset protocol, scientific meaning, or acceptance criteria.

---

## 3. Recommended persistent Claude chats

All chats below are operated by the leader only. They are separated to keep context clean.

### CHAT A — PROJECT CONTROL

**Purpose:** 30-day planning, project state, dependencies, critical path, risks, daily plans/reviews, workload allocation, forecast/recovery.

**Must read:** all frozen specs `00`–`17` plus current management artifacts.

**Must not:** spend long sessions debugging implementation details; silently modify specs.

**Core outputs:**

- `MASTER_PLAN_30_DAYS.md`
- `PROJECT_STATE.yaml`
- `REQUIREMENT_BACKLOG.md`
- `RISK_REGISTER.md`
- `DAY_N_PLAN.md`
- `DAY_N_REVIEW.md`
- `DECISION_REQUESTS.md`

### CHAT B — TECHNICAL ARCHITECT

**Purpose:** architecture, repository boundaries, API/data flow, integration design, ADRs, cross-cutting technical decisions.

**Primary sources:** `05`, `09`, `11`, `12`, `13`, `15`.

**Outputs:**

- `TECH_STACK_ADR.md`
- `REPOSITORY_STRUCTURE.md`
- architecture Decision Requests;
- interface/contract proposals.

### CHAT C — ML / IMAGING RESEARCH

**Purpose:** dataset validation, UNet/DINOv2, preprocessing, post-processing, experiment protocol, metrics, 3D/geometry scientific validity.

**Primary sources:** `06`, `07`, `08`, `13`.

**Outputs:**

- dataset audit/manifest;
- experiment configs;
- reproducibility checks;
- scientific/geometry Decision Requests;
- result interpretation that remains within the documented protocol.

### CHAT D — IMPLEMENTATION / CLAUDE CODE

**Purpose:** work directly against repository to implement leader-approved tasks.

**Input must include:** task ID, requirement IDs, objective, acceptance criteria, allowed boundary, tests, dependencies.

**Outputs:** code/PR/commit, tests, implementation evidence, limitations/blockers.

**Must not:** broaden scope or “improve” requirements without Decision Request.

### CHAT E — QA / RED TEAM

**Purpose:** attempt to reject implementation/plan claims by finding requirement gaps, hidden integration failures, scientific invalidity, privacy risk, weak tests, or optimistic status.

**Mindset:** ask “What evidence proves this is **not yet ACCEPTED**?” rather than “Can I find reasons to call it done?”

**Inputs:** requirement, PR/code diff, test output, screenshots/video, integration state, experiment manifest.

**Outputs:** reject/accept recommendation, missing tests, regression risks, severity.

---

## 4. Chat-routing rules

Use **Project Control** for:

- tomorrow's task allocation;
- schedule/forecast;
- risk/blocker prioritization;
- project status.

Use **Technical Architect** for:

- “How should modules/interfaces be designed?”
- “Which stack/framework passes the spike criteria?”
- cross-cutting integration decisions.

Use **ML / Imaging Research** for:

- “Is this split/metric/preprocessing scientifically valid?”
- training/inference/geometry questions.

Use **Implementation** for:

- concrete repository changes against an approved task.

Use **QA / Red Team** for:

- independent technical acceptance challenge.

Do not use one chat as a dumping ground for all five roles.

---

## 5. Initial Claude boot sequence

After specs are frozen:

### Step 1 — Project Control implementation-readiness audit
The ChatGPT/spec-owner cross-document audit is already represented by Frozen v1.0. Claude now performs a **second independent implementation-readiness audit**, not an authority rewrite.

Ask Claude to read all specs and produce:

1. any remaining contradiction/gap it believes still exists;
2. unresolved controlled gates/ADR list from `00`;
3. requirement inventory from `03/04/13`;
4. critical technical spikes;
5. initial risk/dependency list;
6. proposed questions/Decision Requests for anything it cannot implement deterministically.

If Claude finds a spec problem, it creates a DR; it does not edit `docs/00`–`17` itself. Do **not** code product features yet.

### Step 2 — Dataset + architecture/spike gates
In parallel only where boundaries do not conflict:

- ML/Imaging Research validates the downloaded official dataset and prepares `DATASET_AUDIT.md` + split Decision Request/manifest.
- Technical Architect + Implementation perform mobile Spike A/B and generate `TECH_STACK_ADR.md`.
- No final training begins before `GATE-DATA-01`/`GATE-SPLIT-01`; no production mobile architecture is frozen before `GATE-MOB-01`.

### Step 3 — Repository plan
Claude proposes repository structure and development workflow under spec constraints.

### Step 4 — 30-day master plan
Project Control creates dependency-aware plan for 4 team members, shared-core onboarding first, then vertical specialization/integration.

### Step 5 — Day 1 plan
Generate only after leader reviews the master plan and the actual repository/environment state.

---

## 6. Daily leader workflow with Claude

### Morning

1. Ensure repository/management artifacts reflect the latest accepted `main`; do not plan from stale chat memory.
2. Open Project Control.
2. Provide latest `PROJECT_STATE.yaml`, previous `DAY_N-1_REVIEW.md`, unresolved risks/decisions.
3. Ask for proposed Day N plan using rules in `15`.
4. Challenge any task that lacks requirement IDs, owner, reviewer, DoD, dependency, or integration target.
5. Leader approves/edits.
7. Distribute member-specific task packages to the team.
8. Record the approved Day Plan in the repository before major work begins.

### During day

- Use Implementation/Architect/Research chats only as needed.
- Keep blockers visible in Project Control.
- Use QA chat before accepting high-risk/critical tasks.

### End of day

1. Collect team evidence (PRs/tests/demo/blockers).
2. Project Control produces `DAY_N_REVIEW.md`, updated `PROJECT_STATE.yaml`, risks, forecast, and proposed next priorities.
3. QA/Red Team challenges critical acceptance claims if necessary.
4. Leader submits consolidated EOD artifacts to ChatGPT for independent audit.
5. ChatGPT critiques Claude's thesis/status and proposes corrective synthesis.
6. Leader feeds approved corrective directive back to Project Control.
7. Next day is planned from corrected actual state.

### Standardized EOD packet for ChatGPT/spec-owner review

The leader should provide, preferably as files rather than prose memory:

- `DAY_N_PLAN.md`;
- `DAY_N_REVIEW.md`;
- latest `PROJECT_STATE.yaml`;
- changed `RISK_REGISTER.md` / `DECISION_REQUESTS.md`;
- PR/test/CI references for critical claims;
- screenshots/video only where manual UX evidence is needed.

The review question is not “Did we work hard today?” but: **“Given actual accepted evidence, is the current state/forecast truthful, what is the highest-leverage correction, and what should tomorrow change?”**

---

## 7. EOD dialectical review model

The intended loop is deliberately adversarial/biện chứng.

### Claude thesis

Example:

> Overall GREEN; 7/8 tasks accepted; one minor 3D mapping defect remains.

### ChatGPT/leader critique

Check:

- Is the failed task on critical path?
- Does it block multiple MUST requirements?
- Are acceptance tests genuinely passing?
- Is forecast overly optimistic?
- Is technical debt hidden?
- Did experiment validity change?
- Is one member/module becoming a bottleneck?

A high task-completion ratio cannot hide a critical blocker.

### Synthesis

Produce a corrected directive, e.g.:

- status AMBER;
- freeze SHOULD work;
- pair two members on geometry blocker;
- continue unaffected analytics with frozen fixtures;
- add transform regression tests;
- recalculate forecast after next integration gate.

This corrected directive becomes input to the next Project Control planning cycle.

The corrective directive should state:

- corrected status (`GREEN/AMBER/RED`);
- claims accepted/rejected and evidence basis;
- critical path change;
- priorities to freeze/start/stop;
- member reallocation/pairing if required;
- new tests/DRs required;
- schedule/buffer impact;
- explicit instructions Project Control must incorporate into the next plan.

---

## 8. Project Control planning priority algorithm

When producing a daily plan, Claude SHALL prioritize:

1. P0 incidents/blockers.
2. Failing MUST acceptance criteria.
3. Critical-path dependencies.
4. Integration defects.
5. Planned MUST work.
6. SHOULD work.
7. COULD work.

Claude SHALL NOT optimize for equal task counts if that delays critical-path progress.

Before allowing SHOULD/COULD work, Project Control must check recovery-buffer health and confirm no critical MUST dependency/review queue is being starved.

---

## 9. Parallel-work collision rule

Before assigning daily tasks, Project Control must evaluate module/file collision.

It SHALL NOT assign parallel work that modifies overlapping integration-sensitive boundaries unless explicitly marked as pair work or sequenced.

If collision is unavoidable, Project Control must specify merge/order ownership.

---

## 10. Claude task-generation rules

Claude-generated tasks must follow the task schema in `15` and must include:

- requirement IDs;
- owner;
- reviewer;
- exact output;
- dependencies;
- module boundary;
- acceptance tests;
- DoD;
- integration target;
- risk/fallback.

A task without these fields should be rejected by the leader before distribution.

---

## 11. Decision Request rules

Any Claude chat that concludes a spec/architecture/scientific change is needed must create a Decision Request rather than implementing the change silently.

Required DR fields:

- ID;
- problem/evidence;
- affected specs/requirements;
- options;
- recommendation;
- schedule impact;
- product/quality/scientific impact;
- requested decision.

Leader may escalate the DR to ChatGPT for specification review before approval.

---

## 12. Context hygiene

- Keep Project Control free from long code-debug transcripts.
- Keep ML Research free from unrelated mobile/UI details.
- Keep Implementation task-scoped where practical.
- Start a fresh implementation/debug chat when context becomes polluted, but always provide the relevant specs/task IDs/current repo state.
- Persist decisions/results in repository artifacts; do not rely on chat memory as the only source of truth.

Start a fresh Claude thread/context when any of these occur:

- the chat repeatedly references superseded plan/spec state;
- a debugging thread has accumulated unrelated failed approaches and starts confusing current code state;
- context window pressure prevents reliable reading of required specs/artifacts;
- a major ADR/milestone changes the technical context substantially.

A fresh thread must be bootstrapped from repository source-of-truth files and current task/state, never from a vague summary alone.

---

## 13. Required Claude-generated management artifacts

After spec freeze, Claude should create under `management/`:

```text
TECH_STACK_ADR.md
REPOSITORY_STRUCTURE.md
DEVELOPMENT_WORKFLOW.md
MASTER_PLAN_30_DAYS.md
REQUIREMENT_BACKLOG.md
REQUIREMENTS_TRACEABILITY_MATRIX.md
DATASET_AUDIT.md
RISK_REGISTER.md
DECISION_LOG.md
PROJECT_STATE.yaml
daily/
  DAY_01_PLAN.md
  DAY_01_REVIEW.md
  ...
```

These are execution artifacts and must remain subordinate to the frozen core specs.

---

## 14. Initial handoff prompt skeleton

Recommended first prompt to **CHAT A — PROJECT CONTROL**:

> Read `docs/00_PROJECT_MASTER_CONTEXT.md` through `docs/17_LEADER_CLAUDE_ORCHESTRATION_PROTOCOL.md` in numeric order. These files are **Frozen Spec v1.0** and are the authoritative source of truth. Do not edit or reinterpret product scope, domain semantics, dataset/scientific protocol, priorities, or acceptance criteria. If you find a contradiction/gap, create a Decision Request instead of fixing the spec yourself.
>
> First perform an independent implementation-readiness audit and output: (1) requirement inventory with MUST/SHOULD/COULD counts, (2) controlled gates and latest-safe resolution dependencies, (3) critical-path dependency graph, (4) initial risk register, (5) technical spikes/ADRs required before repository architecture/training, (6) questions/DRs that block deterministic execution.
>
> Do **not** implement product features yet. Do not create the 30-day plan until the readiness audit and gate strategy are reviewed by the leader. Every later task must trace to requirement IDs and follow `13`/`15`.

After leader accepts that audit, route technical work to the appropriate leader-operated Claude chats according to this protocol.

---

## 15. Leader acceptance rule for Claude outputs

Claude output is advisory until the leader accepts it.

The leader should reject/revise any Claude plan/status that:

- hides blockers behind percentages;
- assigns overlapping parallel file/module work;
- skips reviewers/tests;
- changes MUST scope silently;
- weakens scientific validity for schedule convenience;
- treats raw prediction and reviewed mask as the same artifact;
- assumes ground truth where none exists;
- postpones integration to the last week;
- has no recovery path when forecast slips.

---


## 16. Leader-only cockpit invariant

Claude chat routing is exclusively the leader's control system. Team members are **not** expected to maintain Claude contexts or negotiate plans with Claude.

The leader translates accepted Project Control outputs into team task packages. Team members report evidence/status through the agreed Git/task/EOD process. This prevents four separate agent interpretations of the source of truth.

Claude may draft member-specific task packages, but only the leader distributes/changes assignments and only repository management artifacts record the official plan.
