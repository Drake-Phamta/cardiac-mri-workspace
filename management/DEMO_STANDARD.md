# DEMO STANDARD — v0

| Field | Value |
|---|---|
| **Status** | **APPROVED v1** — drafted by Project Control on 2026-09-15 (Day 6), **approved by the leader on 2026-09-16** as the planning reference from Day 7. Changes follow §11 |
| **Owner** | Phạm Tuấn Anh — Team Leader |
| **Why it exists** | The leader, 2026-09-15: the finished product must be impressive at the demo — the interface and everything the lecturer can see, try, test and evaluate — and every day's plan must build toward that |
| **Scope** | Raises the **quality of execution inside frozen Spec v1.0**. It adds **no requirement**: anything new goes through `00` §13. Where this document and the spec disagree, the spec wins |
| **Used by** | Every daily task packet from Day 7. Each 🎯 line cites a rule (D1–D7), a hero-flow step (H1–H10) or a screen (SCR-01…09) of this document |
| **Grounded in** | `16` §2–§7 · `10` §1–§9.1 · `13` §7–§13 · `14` §3 · `04` NFR-PERF / USAB / REL / REP · DR-003 as amended by DR-003a and DR-003b |

> **Counts used here, re-verified mechanically on 2026-09-15:** 44 product requirements (33 MUST · 6 SHOULD ·
> 5 COULD), 79 FR/NFR, 17 use cases, **9 screens**, **70 acceptance tests**. Earlier management documents say
> 39 product requirements, 28 MUST and 69 tests: the ID patterns used on 2026-09-08 missed `PR-3D-01`…`PR-3D-05`
> (a digit in the prefix) and `TC-MOBILE-STATE-001` (two hyphens). The frozen spec is unchanged and correct.
> **The leader approved the erratum on 2026-09-16**: `PROJECT_STATE.yaml` now carries 44 / 33 / 70, and
> `management/readiness/ERRATUM_COUNTS_2026_09_16.md` records what was wrong, why, and how to re-verify it.

---

## 1. What "impressive" means in this project

A lecturer is convinced by four things, in this order:

1. **It is live.** The hero flow runs on the real phone, on real data, in one take. `10` §1: the app "must
   demonstrate actual scientific interaction, not merely display pre-rendered dashboard screenshots".
2. **It is true.** Every number on screen traces to the artifact that produced it, and what is unavailable is
   shown as unavailable — never as zero (`13` TC-REP-003, TC-USAB-003).
3. **It holds up when poked.** The lecturer may pick another case, try a gesture, or cut the network; the app
   keeps its state honest (`10` §8, TC-MOBILE-STATE-001, TC-REL-002).
4. **It is checkable.** Automated acceptance tests run from one command per layer; device measurements come
   with their raw evidence.

"Impressive" is **not** more features, a better number than the evidence gives, a hidden limitation, or a
screen that only works in rehearsal. `16` §5.1: the team targets the top rubric band "by implementing the large
majority of designed core interfaces/functions faithfully, not by designing a large feature set that is mostly
unfinished".

---

## 2. Seven rules for anything the lecturer will see

| # | Rule | Grounded in | Checked by |
|---|---|---|---|
| **D1** | **Live on the declared device.** Demo-visible behaviour is shown on the Galaxy A17 5G with a release build. An emulator, a screenshot or a video never stands in for it. | `10` §1, §9.1 · DR-006 | TC-USAB-001 · TC-USAB-005 · TC-E2E-001 |
| **D2** | **Every number is traceable.** A metric on screen names its run/model, prediction variant, aggregation level, evaluation population and N (intended and successful). Nothing is typed by hand into a screen, chart or slide. | `04` NFR-REP-001, NFR-REP-003 · `10` SCR-03 | TC-REP-001 · TC-REP-003 · TC-EXP-003 · the reviewer re-derives one number per PR |
| **D3** | **Honest states.** Every core screen has loading, legitimately unavailable, processing, recoverable error with retry, and invalid-data blocking. No invented progress. Absent ground truth is never drawn as zero error. | `10` §7, §8, SCR-09 | TC-MOBILE-STATE-001 · TC-MODE-001 · TC-USAB-003 |
| **D4** | **Correctness is demonstrable.** Mapping, overlay alignment and 2D↔3D links are proven on the shared fixtures, and the proof can be repeated live with product features: a brush stroke after zoom lands on the same source pixels; a 3D pick opens the expected slice. | `10` §5, §6 · `13` §11 | TC-MASK-001 · TC-REV-003 · TC-3D-003 · TC-3D-004 · TC-MAINT-002 |
| **D5** | **Speed is measured, not claimed.** A performance statement is an NFR measurement on the device from committed raw evidence: the statistic the NFR defines (p95, median, worst case) plus p50, over the defined test, on a release build, over every run — never the best one. | `04` NFR-PERF-001…004 | TC-PERF-001…004 |
| **D6** | **One-command proof.** Each automatable acceptance test runs from one documented command per layer (unit, integration, end-to-end) and prints a readable pass/fail report. Each manual device test has a written script and an evidence file. | `13` §7 · NFR-MAINT-003 | TC-MAINT-003 · §5 |
| **D7** | **Presentable evidence with every PR.** A PR that changes something demo-visible attaches a short screen recording or screenshots, names the TC IDs it advances, and gives the command that checks it. | `16` §7 | PR review |

---

## 3. The hero flow — demo script

`16` §2 fixes the narrative. Target **60–90 s**, one continuous take, on `DEMO_CASE_001`, chosen by the `13` §11
rule: representative, never picked because the model looks best on it. The narration answers the north-star
question: *"Why did the AI fail on this MRI, and what can the researcher do about it?"*

| Step | `16` §2 action | What the lecturer sees | Screen | Vertical | Proven by |
|---|---|---|---|---|---|
| **H1** | Open cohort/experiment summary | dataset identity, case count, comparable metrics with N, outlier entry points | SCR-01 | V3 | TC-STUDY-001 · TC-EXP-003 · TC-REP-003 |
| **H2** | Identify an outlier case | the outlier comes from persisted per-case values; one tap opens its evidence | SCR-01 / SCR-07 | V3 | TC-EXP-006 · TC-ERR-003 |
| **H3** | Open MRI Case Explorer | de-identified ID, evaluation vs inference-only capability, slice `n / total`, active run and prediction variant | SCR-02 → SCR-03 | V1 | TC-CASE-001 · TC-CASE-002 · TC-MRI-001 · TC-MRI-003 |
| **H4** | Navigate to the problematic slice | instant slice switching; jump to the worst slice | SCR-03 / SCR-04 | V1 · V2 | TC-MRI-002 · TC-ERR-003 · TC-PERF-001 |
| **H5** | Compare prediction / ground truth / error | overlays stay aligned through zoom and pan; the legend explains every error class | SCR-03 / SCR-04 | V1 · V2 | TC-MASK-001 · TC-MASK-003 · TC-MASK-004 · TC-ERR-001 · TC-ERR-002 · TC-MODE-001 |
| **H6** | Open 3D reconstruction / error map | fluid rotate, zoom and pan; the error representation | SCR-05 | V2 | TC-3D-001 · TC-3D-002 · TC-PERF-002 |
| **H7** | Select an error region and jump back to 2D | the selection resolves to the contributing slice; the 3D plane follows the 2D slice | SCR-05 → SCR-03 | V2 | TC-3D-003 · TC-3D-004 · TC-3D-005 |
| **H8** | Flag / correct the prediction with the brush | a finding keeps its evidence; the brush lands on the right source pixels after zoom; undo and redo | SCR-06 · SCR-08 | V4 | TC-REV-001…004 · TC-FIND-001 · TC-USAB-002 · TC-PERF-003 |
| **H9** | Save the reviewed mask, raw prediction preserved | a new immutable version with its source identity shown; source checksums unchanged | SCR-06 | V4 | TC-REV-005 · TC-REV-006 · TC-REL-001 · TC-REL-002 |
| **H10** | Return to the model / data-scarcity comparison | UNet vs DINOv2 × 25/50/100 % as distributions; non-comparable runs labelled | SCR-07 | V3 | TC-EXP-004 · TC-EXP-005 · TC-EXP-007 · TC-SCI-003 |

**Verticals** are those of `14` §3: V1 Case Explorer / 2D MRI (slice navigation, overlay, zoom/pan), V2 3D /
spatial error (reconstruction, 2D↔3D linkage, error map), V3 Experiment / cohort (comparison, data scarcity,
outlier drill-down), V4 Review / findings (review states, brush correction, reviewed-mask persistence, findings).
`PROJECT_STATE.yaml` assigns V1 to Phạm Tuấn Anh, V2 to Vũ Hùng Anh, V3 to Bế Quốc Khánh and V4 to Nguyễn Gia Đức
Trung. SCR-04 sits between V1 (overlay) and V2 (error); its owner is fixed in planning, not here.

**Per-lens follow-ups.** After the hero flow, each course lens of `16` §3 has a prepared follow-up that answers
its core question with the evidence listed there: Machine Learning (experiment matrix, Dice/IoU distributions,
paired comparison, reproducibility), Image Processing (normalization and resize, raw vs processed ablation,
reconstruction, voxel/pixel/world mapping, error map), Data Science (distributions, outliers, per-slice
profiles, data-scarcity trend), Mobile (architecture and API, gestures, brush, 3D touch, 2D↔3D linkage,
state and error handling, privacy, each member's function).

---

## 4. Screen bar — the nine screens of `10` §3

"Must show" is the spec. "Bar" is how well it has to be done, without adding scope.

| Screen | Must show (`10` §3) | Bar | Acceptance |
|---|---|---|---|
| **SCR-01** Study Overview | study/dataset, case count, experiments, comparable metrics, outlier entry points, findings summary | real values from persisted artifacts, with N; never a placeholder metric; one tap from an outlier to its case | TC-STUDY-001 · TC-EXP-003 |
| **SCR-02** Case List | de-identified case IDs, mode capability | evaluation vs inference-only readable at a glance and consistent with the case screens | TC-CASE-001 · TC-CASE-002 · TC-SEC-001 |
| **SCR-03** Case Explorer / 2D | slice, `n / total`, active run and precomputed/new flag, active variant, overlay controls, metrics when valid, entries to 3D/error/review | slice switch p95 ≤ 200 ms measured; no stall over 500 ms during pinch/pan; run and variant always visible and never switched silently | TC-MRI-001…003 · TC-MASK-001 · TC-MASK-003 · TC-MASK-004 · TC-PERF-001 |
| **SCR-04** Error Inspector | prediction vs ground-truth disagreement, per-slice error, jump to the worst slice, entry to 3D error | the legend explains the categories and does not rely on colour alone; no ground truth → a clear unavailable state | TC-ERR-001…003 · TC-MODE-001 · TC-USAB-003 |
| **SCR-05** 3D Inspector | reconstructed LA, optional error representation; rotate, zoom, pan, select | ≥ 20 FPS median, no stall over 500 ms; 2D↔3D links stay deterministic after rotation; background picks never navigate misleadingly | TC-3D-001…005 · TC-PERF-002 |
| **SCR-06** Review / Correction | source mask, working mask, brush toolbar (add, erase, size, undo, redo, reset), review state, save/cancel | source, unsaved and saved masks told apart at a glance; feedback ≤ 100 ms with zero lost samples; undo, redo and reset exact; the source identity is shown before save | TC-REV-001…006 · TC-PERF-003 · TC-USAB-002 · TC-REL-001 · TC-REL-002 |
| **SCR-07** Experiment Comparison | UNet vs DINOv2, 25/50/100 %, aggregate/distribution/trend, case evidence links | distributions, not only means; the comparability gate labels non-comparable runs; any point opens its case | TC-EXP-001…007 · TC-REP-001…004 · TC-SCI-003 |
| **SCR-08** Findings | findings with evidence context and status | opening a finding returns to its exact evidence location | TC-FIND-001 · TC-FIND-002 |
| **SCR-09** Analysis Run Status | *SHOULD — only if `PR-AN-01` is activated* | truthful status and retry; no fabricated progress | TC-AN-001 |

**On every screen:** the `10` §8 state model (TC-MOBILE-STATE-001); touch targets that meet platform guidance
(TC-USAB-004); confirmation before destructive actions (`10` §9); portrait/landscape defined wherever the
interaction depends on orientation (`10` §9.1); no raw image or mask payloads in logs (TC-SEC-003).

---

## 5. What the lecturer can test

`13` defines **70** acceptance tests: **37** functional in §8 (TC-AN-001 among them, SHOULD) and **33**
non-functional and course gates in §9 (TC-METRIC-001 among them, SHOULD). The minimum final acceptance of `13` §13
requires TC-USAB-005, TC-E2E-001, TC-TEAM-001, TC-SCI-001, TC-SCI-002 and TC-SCI-003 to pass.

Each test is shown in one of three ways. The complete per-test mapping belongs in the execution RTM of `13` §3;
the examples below are a first cut.

| Kind | Examples | How the lecturer checks it |
|---|---|---|
| **Automated** — logic, geometry, metrics, contracts | TC-ERR-001 · TC-EXP-008 · TC-EXP-009 · TC-REV-003 (transform) · TC-REP-004 · TC-MAINT-002 | one command per layer with a readable report; green in CI on `main` |
| **Device, scripted** — gestures, performance, end to end | TC-MRI-002 · TC-PERF-001…003 · TC-USAB-002 · TC-USAB-005 · TC-E2E-001 | a written script, then a live run or the recorded evidence file with device profile and build type |
| **Inspection** — documents and evidence packages | TC-SCI-001…003 · TC-TEAM-001 · TC-AUDIT-001 · TC-AUDIT-002 | the evidence index of §7 points to the exact file |

**Proposed entry point for D6:** one runner, for example `python tools/acceptance/run.py --layer unit`, printing TC
ID → `PASS` / `FAIL` / `NOT RUN` with the evidence path. Its name and location are settled when the first product
module lands. The spike harnesses already follow the pattern (`check_conformance.py`, `probe.py --selftest`,
`aggregate.py`).

---

## 6. Performance — visible and honest

| NFR | Target | Test | Shown at the demo as |
|---|---|---|---|
| NFR-PERF-001 | cached slice switch p95 ≤ 200 ms over 30 steps; no full-volume transfer per gesture | TC-PERF-001 | live scrolling, plus the measured p50/p95 from the evidence file |
| NFR-PERF-002 | 3D interaction ≥ 20 FPS median; no stall over 500 ms | TC-PERF-002 | live rotation, plus the measured FPS distribution |
| NFR-PERF-003 | brush feedback ≤ 100 ms; zero lost committed stroke samples | TC-PERF-003 | a live stroke, plus the measured latency and sample count |
| NFR-PERF-004 | accepted/queued or recoverable error within 2 s; the UI never freezes | TC-PERF-004 | only if live analysis is activated |

- Numbers shown come from committed evidence carrying device profile, build type and date. A debug-build number
  is labelled as such or not shown.
- `10` defines no on-screen performance panel. If the team wants one in the final build, that is a Decision
  Request under `00` §13, not a silent addition. Until then, measured numbers appear in the report and on the
  defense slides, each with its evidence path.

---

## 7. Evidence kept for the demo and the report (`16` §7)

- One continuous screen recording of the hero flow per release candidate, with date, build and device.
- An evidence index: hero step → TC IDs → PR/commit → artifact or evidence file.
- Experiment result manifests, the architecture diagram, key use-case/UML diagrams, the traceability matrix and
  the decision log.
- Approved UI design artifacts next to screenshots of the implemented screens, for the rubric comparison
  (`16` §5.1).
- A package per member (TC-TEAM-001): requirement → UI design → architecture/API/data → PRs → tests → integrated
  demo → privacy → known limitation (`16` §6).

---

## 8. Demo-day resilience

- **Network.** The canonical path is fixed by DR-003 as amended by DR-003a and DR-003b: ZeroTier overlay, Wi-Fi
  uplink as the acceptance path, E12 reading `DIRECT`. Known hazards from Spike E: the cellular overlay fell back
  to `RELAY`, and ZeroTier on Android does not recover by itself after a network change (RISK-DEMO-NET-01).
- **Minimal fallback (DR-003).** Preloaded canonical demo artifacts or cached results sufficient for the hero
  flow. It is a demo-resilience measure only — never an offline product mode or a second architecture.
- **Pre-demo checklist, T−60 min.** Device charged; release build installed; overlay `DIRECT`; backend health OK;
  `DEMO_CASE_001` cached; fallback tried once; one full rehearsal; screen recording ready.
- **How to check "backend health OK" — from the phone, not from the server.** On 2026-09-16 the Mac mini
  silently left the overlay network: the stub process was still alive and still showed `LISTEN` on an address
  that no longer existed on any interface, so a process check said healthy while nothing could reach it. The
  check is therefore: the overlay address is present on an interface **and** an HTTP request from the demo
  device returns 200 **and** `zerotier-cli peers` shows the device path as `DIRECT`. A live PID is not health.
- **Before final acceptance.** Five consecutive successful runs of the canonical flow on the target device and
  build (TC-USAB-005), each logged with a timestamp.

---

## 9. Never

- A number that is not in an artifact; a best-run-only statistic; a `NOT MEASURED` cell hidden or filled in.
- Screenshots or a video presented as live interaction.
- A mask variant substituted silently (TC-MASK-004); ground truth edited as if it were a correction (`10` §5).
- Metrics described as a LAScarQS reproduction (TC-SCI-001); mL or physical-distance metrics before geometry
  validation permits them (TC-SCI-002); cases removed or tuning done to make DINOv2 look better (TC-SCI-003).
- A COULD feature built while a MUST is failing (`03`); any feature added for effect outside `00` §13.
- Spike code promoted into the product to look finished. Spikes stay throwaway; their outputs should already be
  presentable.

---

## 10. How daily planning uses this document

- Every packet's 🎯 line cites a row here: a rule (D1–D7), a hero step (H1–H10) or a screen (SCR-01…09).
- Rehearsals follow the milestones instead of adding dates: the hero flow on whatever exists at the M5 exit (each
  of V1–V4 passes its acceptance tests), stable at M7 (TC-E2E-001 green, canonical smoke stable), zero open P0/P1
  at M8, final at M9.
- Spike work applies the bar already: tables and charts generated from raw data, readable errors, one-command
  reproducible checks, short recordings with PRs.

---

## 11. Decisions on this document

**Decided 2026-09-16 by Phạm Tuấn Anh, Team Leader:**

1. ✅ **v0 approved as v1** — the planning reference from Day 7. Every daily packet's 🎯 line cites a rule (D1–D7), a
   hero step (H1–H10) or a screen (SCR-01…09) here. Later changes take the usual route: Project Control drafts, the
   leader approves; this document never overrides the frozen spec.
2. ✅ **Count erratum approved** — 39 product requirements / 28 MUST / 69 tests → **44 / 33 / 70**. Recorded in
   `management/readiness/ERRATUM_COUNTS_2026_09_16.md` and corrected in `PROJECT_STATE.yaml`. Day records keep the
   numbers they were written with; the erratum names them instead of rewriting history.

**Still open:**

3. **On-screen performance panel** — not decided, and nothing is being built toward it. `10` defines no such screen, so
   it would need a Decision Request under `00` §13. Until then, measured numbers live in the report and on the defense
   slides, each with its evidence path (§6).
4. **Defense format** — total demo length and per-lens follow-ups; settled when the course schedule is known.
