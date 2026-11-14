# FULL PROJECT REBASELINE — DAY 20 / 30 (2026-09-29)

Team board: https://drake-phamta.github.io/cardiac-mri-workspace/rebaseline/day-20.html

## Context

The leader asked for a read-only reconstruction of reality after several more missed execution days, and a four-person parallel recovery plan from now to Day 30. The reconstruction itself was read-only: nothing was implemented, merged or edited while it was produced. Evidence comes from `git` (all refs, `ls-remote`, worktrees, local-only commits), the GitHub API (PRs, reviews with `commit_id`, events, CI runs), `management/**`, `docs/specs/v1.0/**`, `contracts/**`, `spikes/**`, and the leader PC's GPU and dataset. Where repo evidence and management text disagree, the repo wins, and the disagreement is flagged.

**How to re-verify any fact here** (all read-only):
- `git ls-remote origin`
- `gh pr list --state all --json number,state,isDraft,headRefOid,mergeable,reviewDecision`
- `gh api repos/Drake-Phamta/cardiac-mri-workspace/pulls/<n>/reviews` (compare `commit_id` with the head SHA)
- `gh api repos/Drake-Phamta/cardiac-mri-workspace/events`
- `git log --branches --not --remotes` (finds unpushed work, e.g. `8501906`)
- `git merge-tree` (conflicts)

Re-run them at the start of each day before planning: approvals decay on every push.

---

## 1 · DAY20 AUTHORITATIVE SNAPSHOT

| Field | Value (evidence) |
|---|---|
| **Current day / date** | **Day 20 of 30, Tuesday 2026-09-29**, reconstructed at 16:49 +07. Source: `MASTER_PLAN_30_DAYS.md` §1 (Day 1 = 2026-09-10, Day 30 = Fri 2026-10-09, fixed). Every calendar day counts; weekends have been execution days (e.g. Day 4 = Sun 09-13, MET). `PROJECT_STATE.yaml` still says `day: 11`, nine days stale. |
| **Time left** | About 7 h of Day 20, plus 10 full days (Day 21–30). Day 24–25 fall on Sat–Sun. |
| **Current `main`** | `454c526` (2026-09-24 14:03): `docs(day15): record the one-day recovery override`. Documentation only. |
| **Latest code merge** | PR #47 `40498e5`, 2026-09-20 17:18 (CI contract-test job). The last spike-code merge was #31 `11000f1` (2026-09-19). **No product code has ever been merged: `app/` has 0 files on `main`.** |
| **Latest project activity** | On GitHub: 2026-09-24 14:03 (+ PR #56). Locally: commit **`8501906` (2026-09-24 14:18), never pushed**. It holds the C1 prep harness plus a dry run, and sits in a local worktree on the leader's PC. |
| **Per-member last activity** | Tuấn 09-24 · Hùng 09-22 17:43 (#55) · Khánh 09-21 08:41 (#35 regenerated, #54) · Trung 09-21 07:56 (reviews), last commit 09-20 19:41. |
| **Zero-activity days** | Day 14 (09-23) and **Days 16–19 (09-25 → 09-28)**: no commit, review or comment on any ref. Day 20 had none up to 16:49. |
| **Working tree** | Clean on `main`; only `.claude/` is untracked. 22 worktrees are registered, 19 of them in an old session scratchpad. The old repo path is a junction to the same repo after the 09-25 drive reorganisation, so there is one repo, not two. |
| **Open PRs** | **15**: 12 ready and 3 drafts (#46, #54, #55). |
| **Merge-ready now** (approval on the head SHA from a non-author, CI green, MERGEABLE, base `main`, clean `merge-tree`) | **#48** app/core (Trung @`6afe4ab`) · **#49** Spike A S8 (Trung @`a970167`) · **#26** Spike E RESULT (Hùng @`373dea1`). All three have waited **8 days for the merge click**. Their CI **predates the contract-tests job**, so CI must be re-run on `main` right after each merge. **Nearly ready:** **#33**. Its head `bf86a74` is exactly the one-line fix the leader asked for ("change line 106 and this is an approve"); only the leader's own approval or dismissal is missing. |
| **Conflicting** | **#41** Spike A S6. Approved at head by Trung and Hùng, but conflicts with `main` in **one file**, `SPIKE_A_2D/RESULT.md`, rows A3–A11. The fix is to keep `main`'s A3–A8/A10/A11 rows and S6's A9 row. Hùng noted that `test_brush.mjs` is absent on the branch. **Latent conflicts** will hit whichever PR lands second: #49×#46 (`App.js`, `package.json`, lockfile), #46×#41 (`App.js`), #55×#44 (`viewer.js`). |
| **Stale or invalid reviews** | **#35 split (P0)**: the only approval is Trung @`dc26b35` (09-17). Since then there were two pushes (+47/−8: `split.py` +18, schema +2, manifest regenerated). GitHub still shows APPROVED because `main` has no protection. **There is no valid approval on the critical-path PR.** · **#50**: leader @`c731ab4`; the required fix `22876b0` (+18 lines) was never reviewed · **#52**: leader @`f30afd6`, head `9c50ff3` is a pure rebase (same patch-id) · **#51**: shows as approved "at head", but the approval pre-dates a force-push rebase (same patch) · **#44**: Trung's CHANGES_REQUESTED @`c34d753`; rebase and reconfirmation were pushed at `62d39de`, and re-review was requested 09-21 · **#33**: stale leader CHANGES_REQUESTED still blocks · **#48 / #49**: valid, but they were Level-1 backup reviews and the requested reviewers never reviewed · **#53**: no review, the author is the leader, and it was **built on the old #50 head** (lacks `22876b0`, so it needs a rebase and a CI re-run) · **#56**: no reviewer. |
| **Stacked** | #48 ← #50 ← #51 ← #52, and #50 ← #53. `delete_branch_on_merge` is false and `main` is unprotected. Merging a base does not close its children, **but deleting a base branch does**: #28 was auto-closed that way on 09-15. **Retarget each child to `main` before any base branch is deleted.** |
| **Abandoned / superseded** | **#46** (draft, idle since 09-18, conflicts with #49 and #41) is the clearest stall. #56 has been overtaken by events. Orphan branches: `spike-e/evidence-20260913/16/18` hold **unique raw evidence that `main` links to**, so keep them. `spike-b/evidence-20260918` is byte-identical inside #44. `ci/day9-contract-tests-trung`, `chore/day9-contract-ci-trung`, `docs/day9-v4-evidence-trung` and `spike-c0/*` are **superseded**. The other `codex/*` and `chore/*` branches are fully merged. |
| **Data-provenance hazard** | **#54 changes the SHA-256 of `dataset_manifest.json` from `f64d461f` to `8174f4d8`, while #35's split manifest pins `f64d461f`.** Merging #54 after #35 would break the split's provenance mid-experiment, and merging it before #35 would invalidate #35. See DS-02. |
| **CI** | `guardrails` has been green on every head. `main` runs 6 jobs: spec integrity, spec-frozen guard, state parse, geometry contract, contract tests 1/2/11, forbidden bytes. #48 adds `app/core tests` and `framework-neutral`. Stacked PRs run their **base branch's** workflow, so **#50's modified `test_api_contract.py` has never run in CI**. Spike and split self-tests (#35, #44, #49, #55) are not in CI. |
| **Buffer** | Recorded as −3 at Day 10 (`DAY_LOG`). Days 11–19 produced #35's regeneration, the B10/B11 interpretation, three backup approvals and a local-only C1 prep. **None of it merged, and no gate moved.** **The planned Days 28–30 buffer no longer exists as slack.** Day 29–30 stabilization survives only if every feature converges by Day 28. |
| **MUST accepted** | **0 / 33**. |

### A · Data / split

| Item | Reality |
|---|---|
| SPIKE_D | **ACCEPTED** 2026-09-18 21:40, after QA-003 PASS. `DATASET_AUDIT.md` and `dataset_manifest.json` are on `main`. A19 is deferred to GATE-SPLIT-01. The owed follow-up is **#54** (F12/F13), a draft, unreviewed, which writes absolute `D:/` paths into its regeneration command. |
| GATE-DATA-01 | **CLOSED** 2026-09-18. |
| GATE-SPLIT-01 | **OPEN**, 15 days since DR-002. **#35** head `7b72ce8` (09-21): `split_id path_a_seed2024_dr002b_v1`, 80 train / 20 validation / 54 locked holdout, effective train 78, nested effective subsets **20/38/78**, exclusions CASE_0133 (linked to holdout CASE_0027) and CASE_0117 (group), 4 groups equal to 4 transitive components, r ≥ 0.75 declared 09-17. A local dry run on 09-24 passed 18/18 structural checks. It is non-authoritative and unpushed, and its pinned `ff1517d0…` hashes a CRLF+BOM copy; the committed blob is `c5c65a09…`. The QA-003 transitivity concern appears resolved. The split's source hash `f64d461f` matches `main`'s `dataset_manifest.json`, and `merge-tree` is clean. **It lacks a valid review, the mandatory CHAT E QA, and the merge.** |
| Current accepted split | **None on `main`.** |
| Leakage / provenance | Patient separation is **not verifiable** (154 scans from 60 patients, no mapping). DR-002b records the documented exception: screen, grouping and exclusion, a sensitivity slot without CASE_0027, and a limitation statement. In the negative control, the naive data root exposes 20 validation and 54 holdout cases, so an allowlisted training-only root is mandatory. |
| Geometry | Every header carries identity spacing and origin. **mm and mL reporting must stay disabled** (PR-SCI-02 / TC-SCI-002). C6 is PARTIALLY_RESOLVED. |

### B · ML / imaging

| Item | Reality |
|---|---|
| SPIKE_C0 | EVIDENCE_READY / PRELIMINARY: 20 **synthetic** measurements over 10 variants, fp32 and bf16, on Khánh's RTX 4050 (09-16). Pipeline bring-up #37 merged. Under DR-007 it **cannot** close GATE-ML-01. No QA step. |
| SPIKE_C1 | **BLOCKED, 0/10 criteria.** The recorded blocker (`blocked_by: SPIKE_D`) is stale; the real blocker is GATE-SPLIT-01. The prep harness (`preflight.py`, `verify_subsets.py`, `forecast_matrix.py`) exists **only in unpushed `8501906`**. It was leader-authored under the override, and the handback H1–H11 to Khánh never happened. Two defects in it: it calls #35 a "draft" (#35 has been ready since 09-21), and **its pinned candidate hash `ff1517d0…3ce0` is the hash of a CRLF + BOM copy produced by a PowerShell 5.1 redirect, not the committed blob (`c5c65a09…396d`)**. Its own re-pin step would therefore raise a false "manifest changed" alarm. It must re-pin from the git blob bytes before use. `run_feasibility.py` and `measure_boundary.py` from the C1 plan have **not been written**. |
| GATE-ML-01 / GATE-IMG-01 | **OPEN / OPEN.** GATE-IMG-01 has not started. |
| Compute | The approved host is **Khánh's RTX 4050 Laptop, 6 GiB**. He self-declared 4–5 unattended GPU-h/day. There is **no remote-access path**; it was unavailable on 09-24, and no availability has been recorded since. The **leader's PC** is an RTX 3050 Ti with 4 GiB. **Re-verified today**: full dataset present (100 + 54 case directories), 132 GB free on D:, pinned DINOv2 revisions cached. It is **not an approved ML host.** |
| UNet / DINOv2 implementation | `UNet2D` and `DinoSeg` (DINOv2-S/14 and B/14 at pinned revisions; frozen/full × linear/progressive) exist only in `spikes/spike_c_ml/harness/probe.py`, plus a synthetic 8-case train loop in `pipeline_bringup.py`. There is **no real-data loader, epoch trainer, 3D inference, evaluation module, morphology or Contract 2 exporter.** |
| 25/50/100 subsets | Defined in the candidate manifest only (20/38/78). |
| Training runs completed | **ZERO.** There are no checkpoints, loss logs or evaluation outputs on any ref, and none on this machine (scanned today). |
| Validation / evaluation / morphology / EXP-D-PP / metrics / CIs | **None exist.** |
| Remaining matrix | All six of EXP-U/D-025/050/100, plus EXP-D-PP, holdout evaluation, the statistics package and the 08 §11.1 evidence package. |

### C · Mobile / 2D / 3D

| Item | Reality |
|---|---|
| SPIKE_A | **11/12 OBSERVED on the device; not ACCEPTED.** On `main`: A2, A3–A7, A9 (65.31 / 50.23 ms p95). On **#41** (CONFLICTING): A9 at 576×576×88, 98.72 ms whole-cache and 50.84 ms in-window, 135.90 MB; also the finding that a component window does not bound image-cache memory. On **#49**: A8/A10/A11, measured on a 64×64×16 fixture only. A1 and A12 are PARTIAL. Neither branch contains the other's RESULT update. **No QA-004 verdict exists.** The A1/A12 step-4 question to the leader is unanswered (`DAY11_PLAN` §4). |
| SPIKE_B | **Not ACCEPTED; `evidence_present: false`.** B1–B4, B8 and B14 are DIAGNOSTIC PASS (desktop). B12 is partial. **B5, B6, B7, B9, B13 and B15 are not measured.** B10/B11 PASS (median 59.88 FPS, stall ≤ 16.9 ms), but only at **synthetic level 0**, only on **#44**, which carries an unaddressed CHANGES_REQUESTED. #55 (Marching Cubes) is a draft that changes no criterion. Raw 09-18 evidence sits on the orphan `spike-b/evidence-20260918`. |
| SPIKE_F / DR-005 | **Never started** (PREPARED, F1–F12 unmeasured). **RA-B01 is the project's single BLOCKER finding**, and it gates PR-ERR-03 and PR-3D-05. |
| DR-008c / TECH_STACK_ADR / GATE-MOB-01 | Undecided / **does not exist on any ref** / **OPEN, M2 overdue since Day 6 (14 days)**. The measurement direction (RN + WebView WebGL2) was decided 09-18. |
| Device measurements | Done: DR-006 profile, the Spike A set, Spike E runs, B10/B11 level 0, S7 WebView smoke (webgl2 true, Mali-G68). **Missing:** B5/B6/B7/B9, levels 1–3 FPS, F7/F8, E7/E9/E10 loop, and every product-build test (TC-PERF-001..003, TC-3D-*, TC-E2E-001, TC-USAB-005). The canonical smoke has **never run**. |
| 2D viewer / brush / cache | Spike code only. `app/core/viewMath.mjs` (a provenance copy of Spike A) and `cacheKey.mjs` are on #48. The V4 correction model is on #51. |
| 3D mesh / picking / 2D↔3D | Spike mesh from fixtures, and a Marching Cubes preview (#55). Picking-ray checker in CI (#43). Linked-MPR POC on desktop (#38). **None of it is in the product.** |
| Device custody | The Galaxy A17 5G is the **leader's personal phone and never leaves him** (DR-006a). The leader is the **only operator**; owners design and compute (rev 2/3). **Every device slot costs leader time.** |

### D · Deployment

| Item | Reality |
|---|---|
| SPIKE_E | Measured over Wi-Fi + ZeroTier DIRECT (171/171 per profile, 09-16), plus a 09-18 afternoon window. E4 s4 prefetch **FAILED its own criterion**. E7 and E9 are not measured; E8 has only 2 windows. The E10 figure is **PROVISIONAL at p95 ≤ 3,500 ms** (leader 09-18; the ≥ 20-sample loop has not run). `RESULT.md` exists only on **#26** (marked DRAFT/NEEDS_FIX, approved at head, QA not run). Raw evidence sits on 3 orphan branches. |
| Topology | DR-003 LOCAL_DEMO, amended by DR-003a (ZeroTier) and DR-003b (Wi-Fi uplink + overlay is the acceptance path; E12 DIRECT). Phone → Wi-Fi → ZeroTier `b103a835d292ddb3` → **Mac mini M2 (10.64.193.115)**, which is the backend/artifact/demo host and **not** the ML host. |
| GATE-DEPLOY-01 | **CLOSED** (DR-003). |
| Backend readiness | **No product backend exists**; only the Spike E stub. SSH to the Mac mini is **leader-only**. Incidents: 09-16 the host silently left the overlay; 09-18 the stub served 404s. |
| Demo fallback | The DR-003 minimal fallback is defined (DEMO_STANDARD §8, T−60 checklist) and **not built**. |

### E · Product verticals

| | V1 Case Explorer / 2D (+SCR-02, SCR-04 per DR-013a) | V2 3D / spatial error | V3 Experiment / cohort | V4 Review / findings |
|---|---|---|---|---|
| Owner / secondary | Tuấn / Hùng | Hùng / Tuấn | Khánh / Hùng | Trung / Tuấn |
| Implementation | Framework-neutral **SCR-03 state model** `createCaseExplorer` (layers, RAW/PROCESSED/REVIEWED variants), 294 lines. **SCR-02 and SCR-04 not implemented** | **README only** | **README only** | **SCR-06 revision-safe review/correction model** `createReviewCorrection`, 121 lines: `expected_revision` on every write; after STALE_REVISION it only offers REFRESH. **SCR-08 Findings: README only** |
| Branch / PR | #53, stacked on the **old** #50 head, so it needs a rebase | none (#55 is spike) | none | #51 (+ #52 evidence), stacked on #50 |
| On `main`? | No | No | No | No |
| Tests | 9 groups / 31 checks (#53, CI) | — | — | 4 groups / 7 checks (#51, CI) |
| Evidence | `TC_TEAM_001_PHAM_TUAN_ANH.md` on `main` (Day 9 draft) | `TC_TEAM_001_VU_HUNG_ANH.md` **on #44 only** | `TC_TEAM_001_BE_QUOC_KHANH.md` on `main` (Day 8 draft) | On #52, self-labelled "IN PROGRESS, no production implementation" |
| Reviewer state | #53: **none** | — | — | #51 valid; #52 and #50 stale |
| Acceptance | none | none | none | none |
| Dependencies | GATE-MOB-01, backend, DR-010a (worst slice) | GATE-MOB-01, Spike B, DR-008c, **DR-005/Spike F** | GATE-ML-01 → runs → Contract 2 artifacts | GATE-MOB-01, backend write API |
| Exact missing work | SCR-02/03/04 screens, device perf | Mesh pipeline, SCR-05, 3D error, device perf | SCR-01/07 screens, real artifacts | SCR-06/08 screens, persistence, device brush perf |

### F · Integration / quality

- **app/core** is on #48: 10 test scripts, 137 checks, not merged. It is framework-neutral by CI rule. Its README misnames the V3 owner ("Nguyễn Duy Khánh") and leaves SCR-02 unassigned.
- **Contracts** on `main`: API Contract 11 DRAFT v0 (28 endpoints, 15 error codes), Contract 1 and Contract 2 DRAFT v0, and geometry `dr008a-dr012/v1.0.0` (frozen, CI checker). The cross-contract pin (API → geometry version const) is in place. **DR-010a (worst-slice endpoint) must be decided before Contract 11 leaves DRAFT.**
- **Fixtures:** the geometry fixture is on `main`. The API scenario generator (#50, 28/28 endpoints) is unmerged; handwritten fixtures are forbidden.
- **Smoke / E2E / acceptance:** canonical smoke **NOT_RUN ever**. No E2E and no acceptance runner exist. QA-004 (Spike A) exists as a script only.
- **Production code on `main`:** none. **MUST implemented on `main`: 0/33.**

### G · Control plane

- **Daily records:** Day 11 was planned but never closed. **Days 12, 13, 14, 16, 17, 18, 19 have no record on any ref.** Day 15 has only the override. The public board (`days.yaml`, `docs/archive`) stops at Day 8.
- **Stale `PROJECT_STATE.yaml` fields:**
  - `day: 11`
  - SPIKE_D shown as NEEDS_FIX while GATE-DATA-01 is CLOSED
  - SPIKE_C1 `blocked_by: SPIKE_D`
  - `open_prs` as of 09-18
  - M0/M1/M2 statuses
  - `remaining_buffer_days: -2` (the log says −3)
  - critical path still lists SPIKE_D and GATE-DATA-01, both done
  - `result_md_count: 0`, `dataset_audit_present: false`, `data_manifests_present: false`, all wrong
  - technical debt still says ".github missing"
  - the recovery block ignores the Day-15 override
  - the E10 figure is listed as pending although it was ruled PROVISIONAL
- **Stale `SPIKE_PHASE_STATE.yaml` fields:**
  - `ml_compute` UNVERIFIED
  - demo network still cellular
  - every device slot NOT_STARTED
  - `master_plan_30_days_created: false`
- **Open decisions:**
  - DR-005, DR-008c, DR-010a
  - DR-015 limb 1 (provisional) and limb 2 (ADR-ART-001 not frozen)
  - the DEMO panel and defense format
  - the Spike F operator
  - Spike A step-4 limits
  - the compute host, which is new and exists only in the unpushed record
  - frozen vs full DINOv2 (PR-SCI-03)
  - TECH_STACK_ADR, ADR-ML-001, ADR-ART-001: **none exists on any ref**
- **Incidents:**
  - INC-001 rules are still in force, but `PROJECT_STATE` claims one of them was replaced, which is a contradiction.
  - INC-002 has no closure.
  - Its Day-12 rules were never applied: #56 has no reviewer, and the backup-review reassignments of 09-21 were **not recorded** in `review_serialization.reassignments`.
  - The Days 16–19 zero-activity gap has **no incident record**.
- **Milestones:** M2 is 14 days overdue, M3 DONE, M4 8 days overdue. M5's window **ends today** with 0/4 verticals accepted. M6's window (12–22) has not started. M7's window (20–25) opens today.
- **Unclosed override:** `RECOVERY_OVERRIDE_DAY15.md` still reads **"Status: ACTIVE"**, although it expired 09-24 23:59. Its action log has 1 row, the Spike B go/no-go was never recorded, and `POST_RECOVERY_REVALIDATION_DAY16.md` was never created.
- **Day 16+ revalidation debt:** **no override merges happened, so there is nothing to revalidate.** The leader-authored C1 prep (`8501906`) still has to pass through the normal owner adoption (Khánh) and review (Hùng).
- **The risk register** has not been updated since 09-16. Its entries for RISK-DATA-01, RISK-INGEST-01 and RISK-DEMO-NET-01 no longer match the evidence.

---

## 2 · WHAT CHANGED SINCE THE LAST VALID SNAPSHOT

The last valid machine state is `PROJECT_STATE.yaml` at Day 11 (2026-09-20 17:54). The last valid narrative is `RECOVERY_OVERRIDE_DAY15.md` (2026-09-24 14:00).

| When (+07) | Who | What changed | Effect today |
|---|---|---|---|
| 09-20 19:38–19:41 | Trung | Pushed fixes to #50/#51/#52 | The leader's approvals on #50 and #52 went **stale** |
| 09-21 07:56 | Trung | APPROVED #48, #41, #49 at head | Backup reviews under Level 1, **not recorded** in `reassignments`. #48 and #49 have been merge-ready ever since |
| 09-21 08:35–08:41 | Khánh | **Regenerated #35** from the merged dataset manifest; opened draft #54 (F12/F13) | #35's approval went **stale**; nobody re-reviewed it |
| 09-21 16:32 | Hùng | Pushed the B10/B11 interpretation to #44; APPROVED #26, #33, #41 | #44 still carries Trung's stale CHANGES_REQUESTED |
| 09-22 | Tuấn | Presentation package pushed directly to `main` for the 09-23 APP consultation | Docs only |
| 09-22 17:43 | Hùng | Draft #55 Marching Cubes preview | The last member code activity |
| 09-23 (Day 14) | — | Nothing; the course consultation day | — |
| 09-24 (Day 15) | Tuấn | Override recorded; #56 opened; C1 bring-up Phase 1 done **locally and never pushed**; **0 merges** | Critical path unchanged |
| 09-25 → 09-28 (Days 16–19) | — | **Zero activity**; drive reorganised (junctions preserved) | 4 more days lost; no record |
| 09-29 (Day 20) | — | This rebaseline | — |

**Net effect since Day 11:**
- No gate moved.
- No PR merged except docs.
- **No training ran.**
- No product code reached `main`.
- Approvals decayed on 4 PRs.

The critical path is exactly where Day 11 left it, and 9 calendar days are gone.

---

## 3 · COMPLETE BACKLOG LEDGER

**Legend.** Est = focused person-hours, excluding the reviewer's time unless it is shown with a "+". Dev = needs the physical Galaxy. GPU = needs ML compute. LD = needs a leader decision. Par = can run in parallel. D30 = required for Day 30.

**Priorities:**
- **P0** blocks the critical path or the final scientific result.
- **P1** is a MUST product capability or integration.
- **P2** is validation, stabilization or demo reliability.
- **P3** is SHOULD/COULD or cleanup.

**DONE** means the item's exit condition is met. Nothing below meets it.

### 3.1 Control plane (CP)

| ID | Task | Req / milestone | Current state | Evidence available | Exact remaining work | Owner | Reviewer | Dependency | Blocks | Est | Dev | GPU | LD | Pri | Par | D30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CP-01 | Close RECOVERY_OVERRIDE_DAY15 | `15` §18 | File says ACTIVE; 1 action row | `454c526` | Set EXPIRED 09-24 23:59; record 0 override merges, the Spike B go/no-go that was never recorded, and that C1 prep stayed local; state that POST_RECOVERY_REVALIDATION is empty by construction | Tuấn | Trung | — | CP-02 | 0.5 | N | N | Y | P2 | Y | Y |
| CP-02 | Rebaseline `PROJECT_STATE.yaml` + `SPIKE_PHASE_STATE.yaml` to Day 20 | `15` §4 | Stale since Day 11 (list in §1 G) | This report | Rewrite the stale fields; set SPIKE_C1 `blocked_by: [GATE-SPLIT-01]`; record the new critical path; buffer = "0 slack, Day 29–30 only" | Tuấn | Hùng | CP-01 | Daily planning | 1.5 | N | N | N | P1 | Y | Y |
| CP-03 | DAY_LOG Days 11–20 | `15` §13 | Missing | GitHub events | Honest entries: Day 11 unclosed; 12–14 thin; 15 override only; 16–19 zero activity | Tuấn | — | — | — | 1 | N | N | N | P2 | Y | Y |
| CP-04 | INC-003: Days 16–19 zero-activity gap | INC-001/002 | No record | Events 09-25..28 empty | **Ask each member first**, then record | Tuấn | — | Member replies | CP-05 | 0.5 | N | N | Y | P1 | Y | Y |
| CP-05 | Formal `15` §18 recovery decision for Day 20–30 | `15` §18 | Triggers fired since Day 10; Level 1 was authorised for reviews only | `PROJECT_STATE` recovery | Record: Level 1 (review turns, recorded) + Level 2 (pair on named blockers) + Level 3 (parallelise along contracts) + Level 4 (simplify implementation); Level 5 only for SHOULD/COULD; **no MUST change** | Tuấn | — | — | All | 0.5 | N | N | **Y** | **P0** | Y | Y |
| CP-06 | Push `8501906` (C1 prep harness + dry-run evidence) as a PR | C1 | **Unpushed**, leader-authored under the expired override. Two defects: it calls #35 a "draft", and the pinned hash `ff1517d0…` is of a CRLF+BOM copy, not the blob `c5c65a09…` | `8501906` | Push the branch and open a PR marked "leader-authored under the expired override, needs owner adoption". **Fix the re-pin so it hashes the git blob bytes** (`git cat-file blob` piped to a hasher, or Python reading the blob, never a PowerShell `>` redirect). Owner Khánh adopts/replaces H1–H3 and re-runs H4; reviewer Hùng | Tuấn → Khánh | Hùng | — | ML-02 | 0.5 + 1.5 | N | N | N | **P0** | Y | Y |
| CP-07 | Delegate merges | `15` §7–8 | Only the leader merges; #48/#49/#26 approved 8 days ago, still unmerged | Events | Decision: **the author merges** once there is an approval on the head SHA from the named reviewer, CI is green and there is no conflict. Exception: gate-critical or scientific PRs (split, C1, ADR-ML-001, gate records), which the leader merges after QA | Tuấn | — | — | Every merge | 0.5 | N | N | **Y** | **P0** | Y | Y |
| CP-08 | Lightweight daily loop | `15` §4 | Heavy daily docs (1–3 h) that stopped entirely on Day 12 | — | One `dayNN/DAY_NN.md` (plan at 08:30 + EOD at 22:30, ≤ 45 min total); `PROJECT_STATE` once a day | Tuấn (Chat A) | — | — | — | 0.75/day | N | N | N | P1 | Y | Y |
| CP-09 | Record the Level-1 backup reviews of 09-21 | INC-002 §5 | Not recorded (#41, #48, #49 by Trung) | Events | Append to `reassignments` | Tuấn | — | — | Audit | 0.25 | N | N | N | P3 | Y | N |
| CP-10 | Resolve the INC-001 vs `PROJECT_STATE` availability-rule contradiction | INC-001 §6 | Contradictory | — | Re-state: **availability declared by 09:00 daily** | Tuấn | — | — | CP-04 | 0.25 | N | N | Y | P1 | Y | Y |
| CP-11 | Orphan branches with no PR | Hygiene | **Keep** (unique raw evidence, linked from `main`): `spike-e/evidence-20260913/16/18`. **Superseded**: `spike-b/evidence-20260918` (byte-identical inside #44), `ci/day9-contract-tests-trung`, `chore/day9-contract-ci-trung`, `docs/day9-v4-evidence-trung`, `spike-c0/*`. The rest are fully merged | PR audit | Record the classification. **No branch deletion** without explicit confirmation, and never delete a branch that is the base of an open PR | Tuấn | — | — | — | 0.25 | N | N | N | P3 | Y | N |
| CP-12 | Worktree clutter (22) + board stale since Day 8 | Hygiene | — | `git worktree list` | Defer; any prune or delete needs explicit user confirmation | Tuấn | — | — | — | 1 | N | N | N | P3 | Y | N |
| CP-13 | Update the risk register (last touched 09-16) | `15` | Stale | §1 | Re-score RISK-DATA-01↓, RISK-INGEST-01↓, RISK-COMPUTE↑, RISK-SCOPE-01↑, RISK-CAP-01↑, RISK-DEMO-NET-01↑ | Tuấn (Chat A) | — | — | — | 0.5 | N | N | N | P2 | Y | N |

### 3.2 Data / split (DS)

| ID | Task | Req / milestone | Current state | Evidence available | Exact remaining work | Owner | Reviewer | Dependency | Blocks | Est | Dev | GPU | LD | Pri | Par | D30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DS-01 | **#35 → GATE-SPLIT-01** | GATE-SPLIT-01, M4 | Head `7b72ce8`; **no valid approval**; QA not run; CI green; MERGEABLE (6 ahead / 4 behind, clean `merge-tree`) | `SPLIT_RESULT.md`, `PATIENT_LINKAGE_EVIDENCE.md`, 18/18 dry run | (1) Khánh confirms the head is final. (2) Trung re-reviews **at head** and re-runs `verify_subsets`/`preflight` from CP-06. (3) CHAT E QA (mandatory). (4) Leader merges and closes the gate. (5) Mirror state | Khánh | **Trung** + CHAT E | CP-06 (tools) | **All ML**, V3 real data | 0.5 + 1.5 + 1 + 0.5 | N | N | **Y** | **P0** | — | Y |
| DS-02 | #54 Spike D follow-up (F12/F13) | Spike D debt | Draft. Writes absolute `D:/` paths. **Changes `dataset_manifest.json` SHA `f64d461f` → `8174f4d8`, which #35 pins** | `f7ccafc` | **Do not merge it into the experiment period in its current form.** Either restructure it so the anomaly counts and the regeneration command go into an audit addendum and the hashed manifest stays untouched, or hold it until after Day 30. If the manifest ever changes, the split source hash and every C1/experiment manifest must be re-pinned under a recorded decision | Khánh | Hùng | DS-01 | Provenance | 1 + 0.5 | N | N | **Y** | P2 | Y | N |
| DS-03 | Re-pin the split SHA after merge | C1-8 | The candidate was pinned as `ff1517d0…` (a CRLF+BOM copy); the committed blob is `c5c65a09…396d` | Preflight | Hash the **blob on `main`** after the merge. If it differs from `c5c65a09…`, the 09-24 dry run is void and must be re-run | Khánh | Hùng | DS-01 | ML-04 | 0.25 | N | N | N | **P0** | — | Y |

### 3.3 ML / imaging (ML)

| ID | Task | Req / milestone | Current state | Evidence available | Exact remaining work | Owner | Reviewer | Dependency | Blocks | Est | Dev | GPU | LD | Pri | Par | D30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ML-01 | **DR-016 compute host(s)** | RISK-COMPUTE, GATE-ML-01 | Approved host unreachable on 09-24; nothing recorded since | C1B §1 | Khánh declares RTX 4050 availability, including overnight. Leader decides: primary = RTX 4050; **second host = leader PC 3050 Ti 4 GiB** (needs a memory re-probe) for C1 duplicate, inference and failover | Tuấn (decides) / Khánh (declares) | — | — | ML-04+ | 0.5 | N | Y | **Y** | **P0** | — | Y |
| ML-02 | Adopt the C1 prep harness | C1 | Leader-authored, unpushed | `8501906` H1–H11 | Review / adopt / replace; re-run on the frozen manifest on his own host | Khánh | Hùng | CP-06, DS-01 | ML-04 | 1.5 | N | N | N | **P0** | Y | Y |
| ML-03 | C1 code: real-data loader (NRRD, DR-011 per-volume p0.5/p99.5, resize to 560, channel handling), `run_feasibility.py` (extends `pipeline_bringup` + `probe` models), `measure_boundary.py` | C1 plan §3, §7 | Not written | `pipeline_bringup.py`, `probe.py` | Write it, plus a fixture test; fail closed on any non-training ID | Khánh | Hùng | ML-02 (can start on the candidate manifest) | ML-04 | 5 | N | N | N | **P0** | Y | Y |
| ML-04 | **C1 execution** (C1-1..10) → `SPIKE_C_ML/RESULT.md` (C1) | GATE-ML-01, M4 | 0/10 | `C1_MEASUREMENT_PLAN.md` | Preflight on `main` → one case → fwd/bwd/reload per family → **equal-budget convergence** → memory/timing/resolution grid/boundary thickness → calendar verdict | Khánh | Hùng + CHAT E | ML-01, ML-03, DS-03 | ML-05 | 4 + GPU 3–4 h | N | **Y** | N | **P0** | — | Y |
| ML-05 | **ADR-ML-001 + GATE-ML-01** | `07` §2, `08` §2, DR-007 | Not started | C0 + C1 | Freeze: variants, **frozen vs full DINOv2 (PR-SCI-03, owner opinion H8)**, epochs from C1-6, resolution, batch, optimiser/LR, checkpoint selection on validation, seeds, precision, and the pre-declared OOM fallback. Apply the DR-007 remedy (size/resolution) **before** the freeze if the calendar is NO | Khánh | Hùng; **leader decides** | ML-04 | ML-06..13 | 2 + 1 + 0.5 | N | N | **Y** | **P0** | — | Y |
| ML-06 | Training script (config-driven, 6 configs, resume, checkpoint SHA, JSONL loss, `08` §10 manifest fields) | PR-EXP-01 | Bring-up only | `pipeline_bringup.py` | Write; dry-run 1 epoch on 2 cases; reload-equivalence check | Khánh | Hùng | ML-03 | ML-07 | 4 | N | N | N | **P0** | Y | Y |
| ML-07 | **Six runs** EXP-U-025/050/100, EXP-D-025/050/100 | PR-EXP-01/03, M6 | **0 runs ever** | Forecast core: pair A 7.3 h · B 18.8 h · C 33.8 h (C0-synthetic, 50 epochs assumed) | Launch, monitor, checkpoint; each family stays on one host | Khánh | Hùng (spot check) | ML-05, ML-06 | ML-08.. | 3 (babysit) + GPU 8–40 h | N | **Y** | N | **P0** | Y (2 hosts) | Y |
| ML-08 | Inference: validation (20) and holdout (54) | PR-PRED-01, PR-PROV-01 | None | — | Validation first (all 6). **Holdout only after GATE-IMG-01 and all checkpoints are frozen.** Checksum the raw predictions (immutable) | Khánh | Hùng | ML-07 | ML-09.. | 2 + GPU 1–2 h | N | **Y** | N | **P0** | Y | Y |
| ML-09 | Evaluation module | `08` §5–8, `07` §6, TC-EXP-*, TC-ERR-001 | None | `13` §11 mask-pair fixture | Case 3D Dice/IoU; per-slice Dice with **both-empty = NOT_APPLICABLE**; FP/FN; relative volume error **in voxels**; failed-case protocol (intended vs successful N); two holdout slots (primary / without CASE_0027); fixture tests | Khánh | **Hùng** | — (can start Day 21 on fixtures) | ML-11..13 | 5 | N | N | N | **P0** | Y | Y |
| ML-10 | **GATE-IMG-01** morphology | PR-IMG-01, PR-EXP-04, M6 | Not started | `07`; DR-G04 | Predeclared candidate grid (hole fill / LCC / closing radius) on **EXP-D-100 validation predictions only** → choose → freeze → record | **Hùng** (imaging) | Khánh; **leader decides** | ML-08 (val) | ML-11 | 4 | N | N (CPU) | **Y** | **P0** | Y | Y |
| ML-11 | EXP-D-PP | PR-EXP-04, RQ-B | None | — | Apply the frozen morphology to the **same** EXP-D-100 raw holdout predictions; evaluate; winners/losers; visuals | Khánh | Hùng | ML-10 | ML-12 | 2 | N | N | N | **P0** | — | Y |
| ML-12 | Statistics / evidence package (`08` §7, §11.1, **DR-014**) | TC-SCI-003, RQ-A/B | None | — | N intended/successful, mean/std/median, distributions, **paired case comparison**, **95 % CIs on primary cohort metrics and on paired differences (DR-014)**, fraction × family interaction, RQ-B delta, sensitivity slot (without CASE_0027), DR-002b limitation text, limitations section. **Figures generated from saved metrics only** | Khánh | Hùng | ML-09, ML-11 | V3, RPT | 5 | N | N | N | **P0** | Y | Y |
| ML-13 | Contract 2 exporter | PR-EXP-01 | Contract DRAFT v0 on `main` | `validate_contract2.py` | One artifact per run (7) that passes the validator | Khánh | **Trung** | ML-09, INT-11 (C2 freeze) | DEP-07, V3 real | 3 | N | N | N | **P0** | Y | Y |
| ML-14 | Reproducibility gate (`08` §11) | `08` §11 | None | Tolerance 5e-4 Dice | A second person re-runs the evaluation of ≥ 1 run from frozen split/config/checkpoint | **Hùng** | Khánh | ML-12 | ML acceptance | 2 | N | light | N | P1 | Y | Y |
| ML-15 | C0 RESULT calendar correction (H5) | Hygiene | Owner action | Forecast JSON | Owner-authored correction | Khánh | Hùng | — | — | 0.5 | N | N | N | P3 | Y | N |

### 3.4 Mobile spikes and gate (MOB)

| ID | Task | Req / milestone | Current state | Evidence available | Exact remaining work | Owner | Reviewer | Dependency | Blocks | Est | Dev | GPU | LD | Pri | Par | D30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MOB-01 | Merge #49 (S8: A8/A10/A11) | GATE-MOB-01 | Valid head approval, CI green | #49 | Merge (the author may, under CP-07) | Tuấn | done | — | MOB-03 | 0.1 | N | N | N | **P0** | — | Y |
| MOB-02 | #41 (S6): resolve conflicts, then re-approve | GATE-MOB-01 | CONFLICTING in `SPIKE_A_2D/RESULT.md` only; approvals will go stale by SHA on push | #41 | Merge `main` into it after #49. Resolve by taking `main`'s A3–A8/A10/A11 rows and S6's A9 row. Add the missing `test_brush.mjs` reference fix Hùng flagged. Re-run CI; Hùng re-approves | Tuấn | Hùng | MOB-01 | MOB-03 | 1 + 0.5 | N | N | N | **P0** | — | Y |
| MOB-03 | Spike A acceptance steps 3–4 | GATE-MOB-01 | No QA-004 verdict; A1/A12 question unanswered | `run_qa004.py` | Trung runs QA-004 (step 3). Leader step 4 decides **ACCEPTED with A1/A12 and the 64×64×16-fixture limitation recorded** | Trung / Tuấn | — | MOB-01/02 | MOB-07 | 1.5 + 0.5 | N | N | **Y** | **P0** | — | Y |
| MOB-04 | #46 S7 WebView container | Single-candidate evidence | Draft, idle since 09-18. **Conflicts with #49 (`App.js`, `package.json`, lockfile) and #41 (`App.js`)** | S7 evidence (react-native-webview 13.16.1) | After #49 and #41 land: rebase, undraft, review, merge. It is the RN↔WebView bridge that V2 reuses **by copy with provenance**, never by import from `spikes/` | Tuấn | Hùng | MOB-01, MOB-02 | V2-02 | 1 + 1 | N | N | N | P1 | Y | Y |
| MOB-05 | #44 B10/B11: re-review | GATE-MOB-01 | Stale CHANGES_REQUESTED; head `62d39de` unreviewed | #44 | Trung re-reviews at head; fix; merge | Hùng | Trung | — | MOB-06 | 1 + 1 | N | N | N | **P0** | Y | Y |
| MOB-06 | **Spike B residuals**: B5 real decimated-mesh picking ≤ ±1 slice, B6 after rotate/zoom, B7 2D navigates to the resolved slice, B9 zero false navigations, B12 ≥ 3-level frontier (triangles / FPS / error), B13 DR-008c recommendation, B15 dev-cost note → RESULT → QA → accept | GATE-MOB-01, DR-008c | Not measured | #30 #38 #43 #55; picking harness | Build the real GT mesh (Marching Cubes from #55) at 3 decimation levels; compute B5/B9 offline; **device slot** for levels 1–3 FPS and B6/B7; write RESULT; `NEGATIVE_RESULT` if B5 fails at every level (**never widen ±1**) | **Hùng** | **Trung** + CHAT E; leader accepts | MOB-05 | MOB-07, DR-008c | 7 + device 1.5 | **Y** | N | **Y** | **P0** | Y | Y |
| MOB-07 | **TECH_STACK_ADR → GATE-MOB-01 CLOSED** | GATE-MOB-01, M2 | Does not exist | A/B evidence; the 09-18 direction | ADR: RN/Expo SDK 57 + react-native-webview WebGL2 module for 3D + framework-neutral app/core + Python backend on the Mac mini; limitations recorded | Tuấn (Chat B drafts) | Hùng + Trung | MOB-03, MOB-06 | **Every mobile UI (INT-02 onward)** | 2 + 1 | N | N | **Y** | **P0** | — | Y |
| MOB-08 | #55 Marching Cubes draft | V2 | Draft | `aad2af4` | Fold into MOB-06 and V2-01 (product mesh pipeline); close the draft | Hùng | Tuấn | — | V2-01 | 0.5 | N | N | N | P2 | Y | N |
| MOB-09 | **DR-005 via a compressed Spike F (Level 4)** | PR-ERR-03, PR-3D-05, C4 / **RA-B01** | Never started | TASK F1–F12 | Formal decision to compress: candidate 3 (surface + FP/FN connected-component markers with precomputed slice ranges) as primary, candidate 1 (TP/FP/FN meshes) as desktop control. Synthetic TP/FP/FN fixture now, then a real prediction pair; F5/F6 determinism and ±1 bound offline; **F7/F8 on device**; `NEGATIVE_RESULT` → escalate | **Hùng** | Trung + CHAT E; **leader decides** | MOB-06 (budget) | V2-03 | 5 + device 0.5 | **Y** | N | **Y** | **P0** | Y | Y |

### 3.5 Deployment / backend (DEP)

| ID | Task | Req / milestone | Current state | Evidence available | Exact remaining work | Owner | Reviewer | Dependency | Blocks | Est | Dev | GPU | LD | Pri | Par | D30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DEP-01 | Merge #26 (Spike E RESULT draft) | ADR-ART-001 | Head approval valid; QA not run | #26 | Merge as EVIDENCE_READY (not ACCEPTED) | Trung | done | — | DEP-03 | 0.1 | N | N | N | P2 | Y | N |
| DEP-02 | #33 E9 drill | Spike E | Hùng approved head; 3 stale leader CRs | Review suite `review033` | The leader re-checks his own objection at head or records it under the 09-17 rule; merge | Trung | Tuấn | — | — | 0.5 | N | N | N | P3 | Y | N |
| DEP-03 | E10 ≥ 20-sample loop, E8 more windows, ADR-ART-001 freeze | DR-015 (PERF-FIRSTLOAD-01 binding) | PROVISIONAL p95 ≤ 3,500 ms | E runs | Measure TC-PERF-FIRSTLOAD-01 **on the product build** in the Day 27 slot; draft ADR-ART-001 from it | Trung | Tuấn | DEP-04 | — | 2 + device 0.5 | Y | N | Y | P2 | Y | Y (binding by DR-015) |
| DEP-04 | **Product backend on the Mac mini (Level 4: read-mostly)** | PR-MOBILE-01, PR-STUDY-01, M5 | Does not exist | Contract 11 + validators; #50 generator | Python service (FastAPI + SQLite, recorded in TECH_STACK_ADR): **hero-flow subset of Contract 11** (study, cases, case detail/mode, per-slice image, masks per variant, runs, metrics cohort/case/slice, worst-slice selection per DR-010a, mesh + error mesh, picking map, reviews, reviewed-mask versions, findings). Every response validated against the contract in tests; `/health`; deploy script | **Trung** | Tuấn (API core) | MOB-07, INT-11 | All live screens | 16 | N | N | N | **P1** | Y | Y |
| DEP-05 | Contract 1 ingestion of the real dataset | PR-CASE-01/02, PR-SCI-02 | Contract DRAFT v0 | `validate_contract1.py` | Ingest cases (mode capability), per-slice images, GT masks, geometry status (identity spacing → mm/mL blocked) | Trung | **Khánh** | DS-01 | V1 real | 4 | N | N | N | **P1** | Y | Y |
| DEP-06 | Mac mini access for Trung | DR-003 | Only the leader has SSH | Day-6 finding | Grant Trung SSH/overlay access, **or** the leader runs Trung's one-command deploy script | Tuấn | — | — | DEP-04 deploy | 0.5 | N | N | **Y** | **P1** | Y | Y |
| DEP-07 | Contract 2 ingestion of the 7 experiment artifacts | PR-EXP-01/02, PR-COHORT-01 | Contract DRAFT v0 | Validator | Ingest; per-case/cohort/per-slice endpoints | Trung | **Khánh** | ML-13 | V3 real | 4 | N | N | N | **P1** | Y | Y |
| DEP-08 | Demo network path + minimal fallback | RISK-DEMO-NET-01, DR-003 | Hazards known | DEMO_STANDARD §8 | Health check **run from the phone**; ZeroTier DIRECT; bundled DEMO_CASE_001 fallback (resilience only) | Trung | Tuấn | DEP-04 | INT-07 | 2 + device 0.5 | **Y** | N | N | P2 | Y | Y |

### 3.6 Verticals (V1–V4)

| ID | Task | Req / milestone | Current state | Evidence available | Exact remaining work | Owner | Reviewer | Dependency | Blocks | Est | Dev | GPU | LD | Pri | Par | D30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V1-01 | #53 V1 state model | SCR-03 | No review. Built on the **old #50 head `c731ab4`**, so it lacks `22876b0` | `ea5bf32`, 31 checks | Rebase onto #50's head (or onto `main` after #50); re-run CI; Hùng reviews (the author is the leader, so no self-approval); retarget; merge | Tuấn | **Hùng** | INT-01, V4-01 | V1-02 | 0.5 + 1 | N | N | N | P1 | Y | Y |
| V1-02 | SCR-02 Case List + SCR-03 Case Explorer | PR-CASE-01/02, PR-MRI-01, PR-PRED-01, PR-MODE-01, PR-MOBILE-02 | Not started (UI) | app/core `viewMath`, `screenState`; Spike A measurements | Slice viewer (zoom/pan, n/total), pred/GT overlays, run + variant always visible, mode badge, the 7 states; tests | Tuấn (Chat D) | Hùng (overlay / geometry) + Trung (API use) | MOB-07, INT-02 | V1-03, INT-05 | 12 | Y | N | N | **P1** | Y | Y |
| V1-03 | SCR-04 Error Inspector | PR-ERR-01, PR-ERR-02, PR-MODE-01 | Not started | `selection.mjs` | Disagreement overlay, per-slice error profile, **worst-slice jump from the API selection (DR-010a)**, legend that does not rely on colour alone, GT-unavailable state | Tuấn (Chat D) | Hùng | V1-02, DEP-04, DR-010a | INT-05 | 6 | Y | N | **Y** | **P1** | Y | Y |
| V1-04 | Device TC-PERF-001, TC-MRI-002 on a product release build | NFR-PERF-001 | Spike numbers only | A9 evidence | Measure (leader operates); Trung QA | Tuấn | Trung | V1-02 | Acceptance | 1 | **Y** | N | N | P1 | — | Y |
| V2-01 | Product mesh pipeline | PR-3D-01, PR-SCI-02 | Spike + #55 | Geometry contract v1.0.0 | Marching Cubes from validated masks (GT / pred / reviewed); decimation at the DR-008c budget; per-face source-slice index; tests against the geometry fixture | **Hùng** | Tuấn | MOB-06 (DR-008c) | V2-02/03 | 5 | N | N | Y | **P1** | Y | Y |
| V2-02 | SCR-05 3D Inspector | PR-3D-02/03/04 | Not started (UI) | #30 #38 #46 | WebGL2 viewer in RN WebView (S7 bridge); rotate/zoom/pan; **slice plane follows the active slice**; **pick → slice**; background pick never navigates | **Hùng** (**paired with Tuấn** on the bridge, Day 23) | Tuấn | MOB-07, V2-01, MOB-04 | INT-05 | 10 | **Y** | N | N | **P1** | Y | Y |
| V2-03 | 3D error representation linked to contributing slices | PR-ERR-03, PR-3D-05 | Not started | — | Implement the DR-005 choice; region → slice set is deterministic and within ±1 | **Hùng** | Tuấn | MOB-09, V2-02 | INT-05 | 6 | **Y** | N | **Y** | **P1** | Y | Y |
| V2-04 | TC-TEAM-001 V2 package | PR-MOBILE-03 | Draft exists **only on #44** (`TC_TEAM_001_VU_HUNG_ANH.md`) | #44 | Lands with #44; update after SCR-05 and the 3D error work (the `16` §6 chain) | Hùng | Tuấn | V2-02, MOB-05 | RPT-01 | 1.5 | N | N | N | **P0** (min acceptance) | Y | Y |
| V3-01 | SCR-01 Study Overview | PR-STUDY-01, PR-COHORT-01/02 | README only | `comparability.mjs`, fixtures | Dataset identity, counts, comparable metrics **with N**, outlier entry points, findings summary; built on the Contract 2 fixture, then swapped to real | **Khánh** | **Trung** | MOB-07, INT-02 | INT-05 | 6 | N | N | N | **P1** | Y | Y |
| V3-02 | SCR-07 Experiment Comparison | PR-EXP-02/03/04, PR-IMG-01 | README only | — | UNet vs DINOv2 × 25/50/100 **as distributions**; raw vs PP; non-comparable runs labelled by contract; any point opens its case | **Khánh** | **Trung** | V3-01, DEP-07 | INT-05 | 8 | N | N | N | **P1** | Y | Y |
| V3-03 | TC-TEAM-001 V3 final | PR-MOBILE-03 | Day-8 draft | On `main` | Update with the real implementation | Khánh | Hùng | V3-02 | RPT-01 | 1 | N | N | N | **P0** | Y | Y |
| V4-01 | Stack #50 → #51 → #52 | M5 | #50 stale (the fix `22876b0` was never reviewed). #51 was approved before a same-patch rebase. #52 is a same-patch rebase. **#50's modified `test_api_contract.py` has never run in CI** | #50–52 | Leader reviews `22876b0`; retarget #50 to `main` so **`main`'s contract-tests job runs**; merge. Then #51; then #52 after re-approval | Trung | Tuấn | INT-01 | V4-02, V1-01 | 1 | N | N | N | **P1** | — | Y |
| V4-02 | SCR-06 Review / Correction | PR-REV-01/02, PR-PROV-01 | Model only (#51) | Spike A3–A8 device evidence | Brush add/erase/size/undo/redo/reset; source / working / saved told apart; review states; **save = a new immutable version**, source checksum unchanged | **Trung** | Tuấn | V4-01, MOB-07, DEP-04 | INT-05 | 12 | **Y** | N | N | **P1** | Y | Y |
| V4-03 | SCR-08 Findings | PR-FIND-01 | Not modelled | — | Create a finding anchored to experiment / case / slice / optional region; opening it returns to that exact evidence | **Trung** | **Khánh** | V4-02 | INT-05 | 6 | N | N | N | **P1** | Y | Y |
| V4-04 | Device TC-PERF-003, TC-REV-003 | NFR-PERF-003 | Spike only | A3–A7 | Measure on a product build | Trung (owner) / Tuấn (operator) | Hùng | V4-02 | Acceptance | 1 | **Y** | N | N | P1 | — | Y |
| V4-05 | TC-TEAM-001 V4 final | PR-MOBILE-03 | On #52 | #52 | Update after SCR-06/08 | Trung | Khánh | V4-03 | RPT-01 | 1 | N | N | N | **P0** | Y | Y |
| V4-06 | **Review-state enum fix** | PR-REV-01, FR-REV-001 | Model/fixture use IN_PROGRESS/APPROVED; the API has no status enum | #51, #50 | Add the enum NOT_REVIEWED/ACCEPTED/FLAGGED/CORRECTED + allowed transitions to contract v1.0 (INT-11); fix the V4 model and generator; add tests | Trung | Tuấn | INT-11 | V4-02 | 1.5 | N | N | N | **P1** | — | Y |

### 3.7 Integration / quality (INT)

| ID | Task | Req / milestone | Current state | Evidence available | Exact remaining work | Owner | Reviewer | Dependency | Blocks | Est | Dev | GPU | LD | Pri | Par | D30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| INT-01 | Merge #48 app/core | M5 | Merge-ready (the CI run pre-dates the contract-tests job) | #48 | Merge; confirm the `main` CI run is green (all 8 jobs); run `node app/core/tests/run_all.mjs` locally | Tuấn | done | — | Every vertical | 0.2 | N | N | N | **P0** | — | Y |
| INT-02 | **RN/Expo product app shell** `app/mobile/` | PR-MOBILE-01 | None | Spike A config (Expo 57 / RN 0.86) | Navigation SCR-01..08; contract bundled as an asset; app/core wiring; fixture vs live mode; release-APK build script; "add your screen" guide. Integration-sensitive, so the owner works alone | Tuấn (Chat D) | Trung | MOB-07 | All UI | 6 | Y (install smoke) | N | N | **P0** | — | Y |
| INT-03 | Fix #48 README (V3 owner name, SCR-02 → V1) | Hygiene | Wrong | — | One-line PR | Tuấn | any | INT-01 | — | 0.1 | N | N | N | P3 | Y | N |
| INT-04 | Acceptance runner (DEMO_STANDARD D6) | `03` §4 "traceable", TC-MAINT-003 | None | Spike harness pattern | `tools/acceptance/run.py --layer unit/integration/e2e` → TC ID → PASS / FAIL / NOT RUN plus evidence path; CI job | **Hùng** (Integration secondary; Chat D drafts) | Tuấn | INT-01 | INT-09 | 3 | N | N | N | P1 | Y | Y |
| INT-05 | Daily canonical smoke (`13` §11 flow) | M7 | **Never run** | — | Fixture mode from Day 21; device from Day 23; rotating operator | Tuấn → rotation | E | INT-01 | INT-06 | 0.5/day | Y (from D23) | N | N | P1 | Y | Y |
| INT-06 | **TC-E2E-001** on current `main` and the device | Min final acceptance | Not run | — | Run, record, fix | Tuấn | Trung + E | Every vertical + DEP-04/07 | INT-07 | 3 | **Y** | N | N | **P0** | — | Y |
| INT-07 | **TC-USAB-005** (5 consecutive runs) | Min final acceptance | — | — | Run and log timestamps | Tuấn (operator) | Trung | INT-06 | RPT | 2 | **Y** | N | N | **P0** | — | Y |
| INT-08 | DEMO_CASE_001 selection | `13` §11 | INTEGRATION_CASE_001 only | — | Median-quality holdout case by a **predeclared rule** after evaluation; never the best-looking case | Khánh | Hùng; leader approves | ML-12 | INT-06/07 | 0.5 | N | N | **Y** | P1 | — | Y |
| INT-09 | Execution RTM (`13` §3) | `03` §4 | None | §4 of this report | 33 MUST → FR/NFR → TC → evidence path | Tuấn (Chat A drafts) | Trung | INT-04 | RPT | 2 | N | N | N | P1 | Y | Y |
| INT-10 | **DR-010a** worst-slice endpoint | SCR-04, TC-ERR-003 | OPEN since 09-19 | OD L1640-1688 | Leader picks option (b), as recommended; the contract gains the selection | Tuấn | — | — | V1-03, INT-11 | 0.25 | N | N | **Y** | **P1** | — | Y |
| INT-11 | **Contract freeze v1.0** (API 11, Contract 1, Contract 2) | M3 → M5 | All DRAFT v0 | Validators in CI | Bump to v1.0 with the DR-010a change, the review-state enum (V4-06), an inference-only mode flag (INT-12) and the hero-flow subset marked; regenerate fixtures; app/core refuses drift | **Trung** | Tuấn + Khánh (C2) | INT-10 | DEP-04, ML-13 | 2 | N | N | Y | **P0** | — | Y |
| INT-12 | **Designate an inference-only case** | PR-CASE-02, PR-MODE-01, TC-MODE-001 | **All 154 cases carry GT** (`DATASET_AUDIT`) | — | Leader decision: one holdout case (not DEMO_CASE_001) is ingested with ground truth **withheld** (mode = inference & review). Documented as product configuration; the dataset is untouched and the evaluation still uses its GT | Trung (ingestion) | Khánh | Leader decision | TC-MODE-001, TC-CASE-002 | 1 | N | N | **Y** | **P1** | Y | Y |
| INT-13 | **TC-MAINT-002 against product code** | `13` §9, PR-3D-03/04 | CI geometry job checks only the spike reference implementation | `geometry_fixture_v0.json` | Run the canonical fixture through the product mesh/picking (V2-01/02) and the backend slice↔world transform | Hùng | Tuấn | V2-01 | PR-3D-03/04 acceptance | 2 | N | N | N | **P1** | Y | Y |

### 3.8 Report / defense (RPT)

| ID | Task | Req / milestone | Current state | Evidence available | Exact remaining work | Owner | Reviewer | Dependency | Blocks | Est | Dev | GPU | LD | Pri | Par | D30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RPT-01 | TC-TEAM-001 × 4 | PR-MOBILE-03 | All four are drafts self-labelled "IN PROGRESS": V1/V3 on `main`, V4 on #52, V2 on #44 | `management/evidence`, #44, #52 | Final packages (V2-04, V3-03, V4-05 + V1), each tracing requirement → UI design → architecture → PRs → tests → demo → privacy → limitation | Each owner | Cross | Verticals | Defense | 2 each | N | N | N | **P0** | Y | Y |
| RPT-02 | TC-SCI-001/002/003 checks | PR-SCI-01/02/03 | Constraints recorded | C1B §7.2 | LASC 2018 wording; no mm/mL; tables generated from frozen artifacts; observed ordering preserved | Khánh | Tuấn | ML-12 | Defense | 1.5 | N | N | N | **P0** | Y | Y |
| RPT-03 | Final report (4 lenses) + architecture diagram + UML + decision log + evidence index | `16` §5–7, M9 | None | Specs, ADRs | Write, lens by lens | All (Khánh ML/DS, Hùng IP, Tuấn + Trung Mobile) | Cross | All | Defense | 4 each | N | N | N | P1 | Y | Y |
| RPT-04 | Defense slides + hero recording + 2 rehearsals | M9 | Consultation deck exists | `presentation/` | Build | Tuấn + all | — | INT-07 | — | 4 + 1 each | Y | N | N | P1 | — | Y |
| RPT-05 | #56 speaker script | — | Open, no reviewer | `2c8399b` | Merge as an archive or close | Tuấn | any | — | — | 0.1 | N | N | N | P3 | Y | N |

**Ledger totals (focused hours, owner side, Day 20–28):**

| Owner | Demand | Main items |
|---|---|---|
| Tuấn | **≈ 50 h** | 22 V1 · 9 integration · 9 control plane · 5 gates/ADR · 5 merges/device |
| Hùng | **≈ 50 h** | 24 V2 · 13 Spike B/F · 6 ML support · 3 runner · 2 TC-MAINT-002 · 2 TC-TEAM |
| Khánh | **≈ 51 h** | 36 ML · 15 V3 |
| Trung | **≈ 52 h** | 26 backend/ingestion · 20 V4 · 2.5 enum + inference-only case · 3 Spike E |

The **total is ≈ 203 h**, against about 175 h of capacity (§8.1).

---

## 4 · MUST REQUIREMENT GAP

The inventory has been re-verified: **44 product requirements (33 MUST · 6 SHOULD · 5 COULD)**, **70 acceptance tests**, **9 screens**.

**Strict classification:**
- ACCEPTED: the mapped TC passed through the DoD and the four-step workflow.
- IMPLEMENTED_NOT_ACCEPTED: merged on `main`, not accepted.
- IN_PROGRESS: product-directed code on an unmerged branch, or product-path artifacts on `main`.
- BLOCKED: the next step needs a named open gate or decision.
- NOT_STARTED: only specs, READMEs, contract endpoints or spike measurements exist.

| Class | Count | Requirements |
|---|---|---|
| ACCEPTED | **0** | — |
| IMPLEMENTED_NOT_ACCEPTED | **0** | — (nothing product-level is on `main`) |
| IN_PROGRESS | **14** | CASE-01, CASE-02, MRI-01, PRED-01, IMG-01, REV-01, REV-02, PROV-01, MODE-01, SCI-02, MOBILE-02, MOBILE-03, PRIV-01, PRIV-02 |
| BLOCKED | **11** | COHORT-01, COHORT-02, ERR-02, ERR-03, 3D-05, EXP-01, EXP-02, EXP-03, EXP-04, SCI-03, MOBILE-01 |
| NOT_STARTED | **8** | STUDY-01, ERR-01, 3D-01, 3D-02, 3D-03, 3D-04, FIND-01, SCI-01 |

| MUST | Vertical · SCR | Class | Best evidence today | Exact remaining task (ledger IDs) | Earliest credible acceptance |
|---|---|---|---|---|---|
| PR-STUDY-01 | V3 · SCR-01 | NOT_STARTED | `study_get` in Contract 11 DRAFT; README | V3-01 + DEP-04 (study endpoint) + TC-STUDY-001 | D25 |
| PR-COHORT-01 | V3 · SCR-01/07 | BLOCKED (GATE-SPLIT-01 → GATE-ML-01) | Contract 2 with `evaluation_n`/`successful_n` | DS-01 → ML-04…ML-13 → DEP-07 → V3-01/02; DR-014 95 % CIs; TC-EXP-002/003 | D26 |
| PR-COHORT-02 | V3 · SCR-01/07 | BLOCKED (runs; DR-010a) | DR-010 outlier rule approved | Server-side DR-010 selection (DEP-04/07), V3 drill-down (V3-01/02), TC-EXP-006 | D26 |
| PR-CASE-01 | V1 · SCR-02 | IN_PROGRESS | 154 de-identified IDs; #53 opens a case | V1-01, V1-02 (SCR-02, owner confirmed V1), DEP-04/05; TC-CASE-001 | D24 |
| PR-CASE-02 | V1 · SCR-02/03 | IN_PROGRESS | #53 `groundTruthAvailable` | V1-02 + **INT-12 (designate an inference-only case: all 154 have GT)**; TC-CASE-002 | D24 |
| PR-MRI-01 | V1 · SCR-03 | IN_PROGRESS | #53 state model; `viewMath`; Spike A A2/A9 | MOB-07 → INT-02 → V1-02; backend per-slice serving; TC-MRI-001..003, TC-PERF-001 (V1-04) | D24 (device S-3/S-7) |
| PR-PRED-01 | V1 · SCR-03 | IN_PROGRESS | #53 variant-keyed prediction layer | V1-02 (**overlay opacity, FR-MASK-003**), real predictions (ML-08); TC-MASK-001/003 | D25 |
| PR-IMG-01 | V1 + ML · SCR-03 | IN_PROGRESS | #53 RAW/PROCESSED/REVIEWED, no silent substitution | ML-10 (GATE-IMG-01) → ML-11 artifacts → DEP-07; TC-MASK-004 | D25 |
| PR-ERR-01 | V1 · SCR-04 | NOT_STARTED | GT-gated error flag only | ML-09 (TP/FP/FN) + `13` §11 mask-pair fixture + V1-03; TC-ERR-001/002 | D25 |
| PR-ERR-02 | V1 + V3 · SCR-04/07 | BLOCKED (**DR-010a**; per-slice metrics need runs) | `selection.mjs` reader | INT-10 → INT-11 → DEP-04 selection → V1-03; TC-ERR-003, TC-EXP-006 | D25 |
| PR-ERR-03 | V2 · SCR-05 | BLOCKED (**DR-005**, Spike F never started, RA-B01) | Endpoint only | MOB-09 → V2-03; TC-3D-005 | D25–26 |
| PR-3D-01 | V2 · SCR-05 | NOT_STARTED | Synthetic-mask meshes only (spike, #55) | MOB-06 (real GT mesh) → V2-01 + DR-008c; TC-3D-001 | D24 |
| PR-3D-02 | V2 · SCR-05 | NOT_STARTED | B10/B11 level-0 on the A17 (#44); desktop B1 | MOB-05/06 → MOB-07 → V2-02; TC-3D-002, TC-PERF-002 (S-4/S-7) | D24–27 |
| PR-3D-03 | V2 + V1 · SCR-05/03 | NOT_STARTED | Geometry contract + fixture; MPR POC (#38) | V2-02 plane sync via the shared transform + **INT-13 (TC-MAINT-002 against product code)**; TC-3D-003 | D25 |
| PR-3D-04 | V2 → V1 · SCR-05→03 | NOT_STARTED | Spike picking 13/13 rays; B5/B6/B7 not measured | MOB-06 (B5–B7) → V2-02 pick → SCR-03; TC-3D-004 | D25 |
| PR-3D-05 | V2 · SCR-05 | BLOCKED (DR-005) | — | MOB-09 → V2-03; TC-3D-005 | D25–26 |
| PR-EXP-01 | V3 + ML · SCR-07 | BLOCKED (GATE-SPLIT-01, C1, GATE-ML-01) | Contract 2 schema/validator | DS-01, ML-04…ML-09, ML-13, ML-14 (reproducibility); TC-EXP-001/002 | D25 |
| PR-EXP-02 | V3 · SCR-07 | BLOCKED (no runs) | `comparability.mjs` reader; `experiment_compare` | Server-side six-condition comparability validator + experiment-compatibility fixture (DEP-04) → V3-02; TC-EXP-003/006/007 | D26 |
| PR-EXP-03 | V3 + ML · SCR-07 | BLOCKED | Candidate nested 20⊂38⊂78 (#35) | DS-01 → ML-07 (six runs) → V3-02; TC-EXP-004/008 | D26 |
| PR-EXP-04 | V3 + ML · SCR-07 | BLOCKED (EXP-D-100 + GATE-IMG-01) | EXP-D-PP defined | ML-10 → ML-11 → V3-02; TC-EXP-005 | D26 |
| PR-REV-01 | V4 · SCR-06 | IN_PROGRESS | #51 revision-safe model. **Enum mismatch:** the model/fixture use IN_PROGRESS/APPROVED; FR-REV-001 needs NOT_REVIEWED/ACCEPTED/FLAGGED/CORRECTED + transitions | **V4-06** (enum in contract v1.0 + model) → V4-02; TC-REV-001 | D24 |
| PR-REV-02 | V4 · SCR-06 | IN_PROGRESS | #51 `putWorkingMask`/`commit` (placeholder payload); Spike A3–A8/A10/A11 | V4-02 brush editor + DEP-04 write API; TC-REV-002..005, TC-PERF-003 (S-4) | D24–25 |
| PR-PROV-01 | V4 + backend · SCR-06 | IN_PROGRESS | Contract `artifact_rules` (immutable kinds) | DEP-04 immutable version store + provenance fields; checksum tests; TC-REV-005/006, TC-REL-001 | D25 |
| PR-FIND-01 | V4 · SCR-08 | NOT_STARTED | Endpoints + design in #52 | V4-03; TC-FIND-001/002 | D25 |
| PR-MODE-01 | All · SCR-03/04/05/07 | IN_PROGRESS | `errors.mjs` GROUND_TRUTH_UNAVAILABLE → EMPTY_UNAVAILABLE; #53 V1-3 | Gating on every screen + server; **INT-12 inference-only case**; TC-MODE-001, TC-USAB-003 | D25 |
| PR-SCI-01 | Report/demo | NOT_STARTED | Wording in the consultation handout only | RPT-02/03 wording; TC-SCI-001 | D29 |
| PR-SCI-02 | Data/imaging + V3 | IN_PROGRESS | Audit: geometry NOT VERIFIED; `GEOMETRY_NOT_VALIDATED` in the contract | ML-09 voxel-only RVE + UI/report block; TC-SCI-002 | D26 |
| PR-SCI-03 | ML/report | BLOCKED (no frozen evaluation) | Rules only (DR-014, DR-002b, PR-SCI-03) | ML-12 (generated tables, 95 % CIs, failed-case report, sensitivity slot) + RPT-02; TC-SCI-003 | D26–29 |
| PR-MOBILE-01 | Integration · all | BLOCKED (**GATE-MOB-01**) | Spike app only; app/core forced framework-neutral | MOB-03/06 → MOB-07 → INT-02 → all verticals → INT-06; TC-E2E-001, TC-USAB-001/002/005 | D27–28 |
| PR-MOBILE-02 | app/core + all | IN_PROGRESS | `screenState` (7 states) + `errors` (15 codes), tested in CI (#48) | INT-01 merge; states rendered on every screen; offline path; TC-MOBILE-STATE-001, TC-REL-002 (S-6) | D26 |
| PR-MOBILE-03 | Team | IN_PROGRESS | 4 draft packages, all "IN PROGRESS" (V1/V3 on `main`, V4 on #52, V2 on #44) | Each member ships their screens; RPT-01; TC-TEAM-001 | D28 |
| PR-PRIV-01 | Data/ingestion | IN_PROGRESS | A16/A17 audit, 0 direct identifiers; `METADATA_NOT_ALLOWED` in Contract 1 CI | DEP-05 on de-identified IDs only; TC-SEC-001/005 on the product path | D26 |
| PR-PRIV-02 | Backend + all | IN_PROGRESS | Ingestion allowlist; CI forbidden-bytes | Product logging policy (DEP-04); TC-SEC-003 log inspection | D27 |

**Is Day-30 success still technically achievable?** Yes, on paper, and only on the §7 schedule.
- Every MUST has a named path.
- **13 of 33 MUST need real predictions or metrics from the ML chain**: COHORT-01/02, EXP-01..04, SCI-03, PRED-01, IMG-01, ERR-01/02/03, 3D-05. Their earliest acceptance is D25–D26.
- **About 25 of 33 need a product mobile screen**, so their UI half waits on GATE-MOB-01 / TECH_STACK_ADR (D22).
- **2 also sit behind DR-005 / RA-B01** (ERR-03, 3D-05).
- **Only 4 do not depend on the app shell or the ML chain**: PRIV-01, PRIV-02, SCI-01, SCI-02.
- **No MUST can be accepted before D24.** From D24, 33 acceptances must fit into roughly D24–D28, which is 5 days of zero float.

**Additional gaps the repository exposes** (added to the ledger as V4-06, INT-12, INT-13):
- The V4 review-state enum does not implement FR-REV-001.
- **No inference-only case exists: all 154 cases carry ground truth.** PR-CASE-02 and PR-MODE-01 need one designated case with ground truth withheld at ingestion. This is a product-configuration decision; the dataset itself is untouched.
- The CI `geometry-contract` job (TC-MAINT-002) exercises only the spike reference implementation, not product code.
- `app/` has no overlay-opacity control.
- SCR-02 has no owner in `app/README.md`.

---

## 5 · CURRENT CRITICAL PATH

The historical path in `PROJECT_STATE` (SPIKE_D → GATE-DATA-01 → …) is stale: its first two nodes are done. The current chain runs as follows.

**PRIMARY: scientific result → product convergence (float = 0 days)**

```text
D20 night  #35 re-review @7b72ce8 (Trung) → CHAT E QA → merge → GATE-SPLIT-01 CLOSED
           ∥ DR-016 compute host decided + Khánh's RTX 4050 declared available (overnight)
D21        C1 code (loader, run_feasibility) → preflight on main (SHA re-pin) → convergence trial (GPU)
           → C1-1..C1-10 measured
D22 12:00  C1 RESULT reviewed (Hùng) → ADR-ML-001 → GATE-ML-01 CLOSED
D22        EXP-U-025 (pipeline-validation run) → overnight EXP-D-100
D23        EXP-D-025/050 by day ∥ EXP-U-050/100 overnight (or on host 2)
           → EXP-D-100 validation inference → GATE-IMG-01 grid (Hùng)
D24        6 checkpoints frozen + morphology frozen → holdout inference ×6 → EXP-D-PP → evaluation
           → 7 Contract-2 artifacts
D25        ingestion (Trung) → V3 on real data; statistics package
D26        DEMO_CASE_001 chosen by rule → hero flow on real predictions      ◄── CONVERGENCE
D27        TC-E2E-001 on device → D28 TC-USAB-005 ×5, code freeze 18:00 → D29–30 stabilization
```

**SECONDARY: mobile platform (float ≈ 0.5 day, because screens are built on generated fixtures)**

```text
D20 night  merge #49 → rebase #41 → Hùng re-approves → merge
D21 AM     QA-004 (Trung) → leader step 4 → SPIKE_A ACCEPTED
D20–21     #44 re-review (Trung) → merge; B5/B6/B7/B9/B12/B13/B15 (Hùng) + device slot D21 18:00
D22 AM     Spike B RESULT → QA → ACCEPTED + DR-008c
D22 12:00  TECH_STACK_ADR → GATE-MOB-01 CLOSED
D22 PM     app shell (Tuấn)
D23–25     V1/V2/V3/V4 screens ∥ backend (Trung, from D21) ∥ compressed Spike F → DR-005 (D24)
           → V2 3D error (D25)
D26        CONVERGENCE with the primary path on DEMO_CASE_001
```

**Convergence point:** Day 26. Real Contract-2 artifacts and DEMO_CASE_001 (primary path) meet V1–V4 screens integrated on the backend (secondary path). The hero flow H1–H10 on that case is the single integration test, and TC-E2E-001 on the device follows on Day 27.

### Bottlenecks

**Merge / review**
1. Only the leader merges: #48, #49 and #26 have been approved and unmerged for **8 days**.
2. Approvals go stale after a push (#35, #50, #52, #44).
3. The stack has to be retargeted in order.
4. #41 has conflicts, including a divergent RESULT.md.
5. Six of the leader's own PRs need another reviewer.
6. Hùng is named reviewer on Spike A, C1, V1 and ML evaluation, which makes him the heaviest reviewer.

**Device**
1. There is one phone and **only the leader operates it** (DR-006a).
2. The APK must be newer than the last code change (the Day-10 S8 session lost 25 strokes to a stale APK).
3. About 10 slots are needed in series: Spike B, Spike F, TC-PERF-001..003, TC-3D, TC-E2E-001, TC-USAB-005, E10.

**Compute**
1. There is one approved host, with no remote path and a self-declared 4–5 GPU-h/day.
2. **Zero** runs so far.
3. The epoch count is an assumption. At 100 epochs, pair B no longer fits a single host inside the window.
4. The fallback host has a 4 GiB card that has not been re-probed.

**Leader — serial steps only the leader can do today, each with its fix**

| Serial step | Fix |
|---|---|
| All merges | **CP-07**: delegate merges |
| All device operation | Pre-scripted, batched slots; optional remote-ADB smoke for owners |
| Mac mini SSH | **DEP-06** |
| Gate closures and acceptance step 4 | Two fixed **decision windows a day (12:00 and 21:30)**; Chat A/B pre-draft every record |
| Control-plane authorship | **CP-08**: at most 45 min/day |
| CHAT E QA runs | Trung runs QA-004 himself; CHAT E is kept for P0 scientific/data items only |
| His own V1 + app shell + integration | Chat D writes; the leader takes **no other primary task** |

---

## 6 · DAY30 OUTCOME FEASIBILITY

The outcomes below come from `MASTER_PLAN` M4–M9, `03` §4 (rejection criteria), `13` §13 (minimum final acceptance) and `16` §2–7.

| # | Required Day-30 outcome | Source | Rating | Why / condition |
|---|---|---|---|---|
| O1 | Frozen patient-grouped split, GATE-SPLIT-01 closed | M4 | **AMBER** | The artifact is ready. It needs one review and QA; slipping past D21 12:00 costs the matrix a day |
| O2 | GATE-ML-01 closed after C1 (never after C0) | M4, DR-007 | **AMBER** | C1 has 0/10 criteria and its code is unwritten. Feasible in ~1.5 days only if the host runs from D21 morning |
| O3 | Six-run matrix complete with metrics | M6, PR-EXP-01/03 | **AMBER** (**RED if DR-016 is unresolved by D21 14:00**) | Arithmetic fits: pair B is 18.8 GPU-h core. Nothing has ever run, and the epochs are unknown |
| O4 | GATE-IMG-01 + EXP-D-PP on the same raw predictions | M6, PR-IMG-01/04 | **AMBER** | Needs EXP-D-100 validation predictions by D23 |
| O5 | RQ-A / RQ-B answerable with honest statistics | M6, `08` §7, TC-SCI-003 | **AMBER** | An inconclusive result is valid (RISK-STATS-01). It still needs O3 and O4 |
| O6 | GATE-MOB-01 + TECH_STACK_ADR | M2 | **AMBER** | Spike B has 6 unmeasured criteria plus a device slot, reviews and QA in 2 days |
| O7 | V1–V4 each pass their acceptance tests | M5 | **AMBER** | **No screen exists.** Four build days (D22 PM–D25) at ~100 % utilisation |
| O8 | 3D error linked to contributing slices | PR-ERR-03, PR-3D-05, RA-B01 | **AMBER** (**RED if DR-005 compression is not decided by D22**) | Spike F never started. A credible path exists only through a formally compressed Spike F (Level 4) |
| O9 | TC-E2E-001 green on current `main` | M7, `13` §13 | **AMBER** | Depends on O3–O8 converging on D26 |
| O10 | TC-USAB-005: 5 consecutive device runs | `13` §13 | **AMBER** | One D28 slot plus a retry. A failure consumes Day 29 |
| O11 | Zero open P0/P1; all MUST tests green | M8, `13` §13 | **AMBER** | 0/33 accepted today; zero float |
| O12 | TC-TEAM-001 ×4 (each member defends a shipped mobile function) | PR-MOBILE-03 | **AMBER** | All four packages are "IN PROGRESS" drafts (V2's is only on #44). Each member must ship a screen; V3 is most at risk because of Khánh's ML load |
| O13 | TC-SCI-001 / 002 | PR-SCI-01/02 | **GREEN** | Wording and gating constraints are known; mm/mL stays disabled |
| O14 | TC-SCI-003 (tables generated from frozen artifacts, observed ordering kept) | PR-SCI-03 | **AMBER** | Depends on O3 |
| O15 | Report + `16` defense mapping + evidence index | M9, `16` §5–7 | **AMBER** | Compressed into D28–D30 |
| O16 | `main` builds and runs from documented setup | `13` §13 | **AMBER** | No app, backend or trainer exists on `main` yet |
| O17 | **≥ 2 calendar days of unspent buffer at M9** | M9, `15` §3 | **RED** | Buffer was −3 at Day 10 and 9 more days passed with no critical-path merge. Day 29–30 exist only as zero-float stabilization. **Formal record required** (leader decision #10): Day 30 stays fixed, no MUST is removed, and the M9 buffer criterion is declared unachievable |
| O18 | None of the `03` §4 rejection conditions (decorative 3D, overwritten raw, GT metrics without GT, untraceable runs, no E2E, static mocks, ambiguous provenance, untraced requirements) | PRD §4 | **AMBER** | Guarded by design in app/core, the V4 model and the contracts; must be proven by the acceptance tests |

**No MUST outcome is rated RED today.** Each has a credible but zero-float path, conditional on the P0 decisions in §18 being taken **tonight and tomorrow morning**. Two outcomes (O3, O8) turn **RED** on a named trigger. If that happens, the formal route is a Decision Request under `00` §13 with a spec deviation record, never a silent cut. §10 and §14 give the options.

---

## 7 · DAY20 → DAY30 RECOVERY PLAN

**Phases**

| Phase | Days | Exit criterion |
|---|---|---|
| **R1 · Critical-path unblock** | D20 17:00 → D22 12:00 | GATE-SPLIT-01, GATE-ML-01 and GATE-MOB-01 CLOSED; SPIKE_A and SPIKE_B ACCEPTED; app/core stack + contracts v1.0 on `main`; backend `/health` reachable from the phone |
| **R2 · Parallel product + ML** | D22 12:00 → D25 | Six runs + EXP-D-PP evaluated on holdout; 7 Contract-2 artifacts ingested; SCR-01..08 functional on the shell against the backend; DR-005 decided; brush saves an immutable version on the device |
| **R3 · Convergence / integration** | D26 → D28 18:00 | DEMO_CASE_001 chosen by rule; TC-E2E-001 PASS on device (D27); TC-USAB-005 5/5 (D28); **code freeze D28 18:00** |
| **R4 · Acceptance / stabilization** | D29 → D30 | All MUST acceptance results recorded; TC-TEAM-001 ×4; TC-SCI-001..003; report; defense |

**Buffer, stated honestly.** The only stabilization left is **Day 29–30, and it exists only if R3 exits by D28 18:00**. There is **no slack inside R1–R3**: any one-day slip there consumes Day 29, and a second one consumes Day 30. That is why §14 fires on hours, not days.

| Day | Primary objective | Device slot (leader operates) | Compute | Merge target | EOD exit | Next-day dependency |
|---|---|---|---|---|---|---|
| **D20 Tue 09-29** (from 17:00) · R1 | Restore the loop; land what is already approved; start the split gate | — | Host readiness check only | #49, #48, #26 · #41 (after re-approval) · #35 (if QA passes by 23:30) · #50→#51→#52 (after re-review) | `app/core` on `main`; GATE-SPLIT-01 CLOSED **or** QA findings with fix ETA ≤ D21 10:00; DR-016 recorded; 4/4 availability declared; override closed | C1 needs split + host; Spike A needs #41 + QA-004 |
| **D21 Wed 09-30** · R1 | C1 executes; Spike A ACCEPTED; Spike B residuals measured; contracts v1.0; backend skeleton | **18:00–19:30 Spike B** (levels 1–3 FPS, B6/B7 on device; Hùng designs, leader operates) | **C1 convergence trial**, both families, equal budget, 20-case subset (RTX 4050); memory re-probe on host 2 if approved | #50–#53, #44, #46, C1-prep PR, contracts v1.0, Spike A RESULT reconciled | SPIKE_A ACCEPTED; C1-1..C1-8 captured; B-numbers computed or `NEGATIVE_RESULT`; backend `/health` answers from the phone | GATE-ML-01 and GATE-MOB-01 need reviewed RESULTs |
| **D22 Thu 10-01** · R1→R2 | **Three gates close by 12:00**; the matrix starts; the app shell exists | 20:00–20:30 shell APK install/launch smoke | Queue (§10): EXP-U-025 14:00 (pipeline validation) → EXP-D-025 → EXP-U-050 → **EXP-D-100 21:00 overnight** → EXP-U-100 queued. With host 2 approved, the UNet family runs there in parallel | C1 RESULT, ADR-ML-001, Spike B RESULT, TECH_STACK_ADR, **app shell**, training script, backend read API | GATE-ML-01 + GATE-MOB-01 CLOSED; EXP-U-025 checkpoint + manifest; shell launches on the A17 | Every vertical starts on the shell; evaluation needs EXP-U-025 predictions |
| **D23 Fri 10-02** · R2 | Four verticals in parallel; evaluation proven end-to-end; GATE-IMG-01 starts | 17:00–18:00 V1 SCR-03 (TC-PERF-001 early, TC-MRI-002) | EXP-D-050 09:00 (last run) · validation inference for all runs · GATE-IMG-01 grid on the EXP-D-100 validation set | V2 mesh pipeline, evaluation module, C2 exporter, first ingestion, V1/V4 increments | **All 6 runs done** if the host ran continuously (T4 watch otherwise); first real artifact ingested and served; SCR-03 shows a real slice + prediction on the device | GATE-IMG-01 needs EXP-D-100 validation predictions |
| **D24 Sat 10-03** · R2 | Matrix done; GATE-IMG-01 frozen; holdout evaluated; DR-005 decided | **17:00–18:30** V2 SCR-05 (TC-PERF-002, TC-3D-003/004) + Spike F F7/F8 + V4 brush (TC-PERF-003, TC-REV-003) | Last runs → **holdout inference ×6** → EXP-D-PP | SCR-04, SCR-06, SCR-08 (part), GATE-IMG-01 record, DR-005 record, 7 artifacts | 6/6 + PP evaluated; 7 artifacts pass the validator; brush saves a new version on the device | V3 needs ingestion; V2 error needs DR-005 |
| **D25 Sun 10-04** · R2 | V3 on real data; 3D error; every screen live on INTEGRATION_CASE_001 | 17:00–18:00 network path (DIRECT, health from the phone, fallback) + **hero dry-run #1** | Spare (reruns only); ML-14 reproducibility | V3-01/02, V2-03, integration PRs, all ingestion | H1–H10 runs end-to-end at least once (defects logged); V3 shows real metrics with N | DEMO_CASE_001 needs the statistics |
| **D26 Mon 10-05** · R3 | Converge on DEMO_CASE_001; automated MUST tests; RQ-A/B drafted | 17:00–18:00 dry-run #2 (release) + TC-MOBILE-STATE-001 / TC-REL-002 network cut | — | Fixes, RTM, acceptance runner, statistics package | **TC-E2E-001 PASS on `main`** (fixture + backend); 0 open P0 | Device E2E needs a fresh RC APK |
| **D27 Tue 10-06** · R3 | TC-E2E-001 on device; final performance numbers | **10:00–12:00** E2E + TC-PERF-001..003 on the product release build · 16:00–16:30 E10 cold-open loop | — | P0/P1 fixes + evidence | TC-E2E-001 PASS on device with a recording; perf measured; 0 P0 | TC-USAB-005 needs E2E stable |
| **D28 Wed 10-07** · R3 gate | TC-USAB-005; **code freeze 18:00** | **10:00–13:00** TC-USAB-005 · 19:00–20:00 retry | — | P1 until 15:00, then P0 only; RC tag | 5 consecutive runs logged, **or** the failing step triaged with a P0 fix ETA ≤ D29 12:00 | Stabilization only |
| **D29 Thu 10-08** · R4 | Stabilization, evidence, report | 10:00–11:00 RC hero recording · 16:00 rehearsal #1 | — | P0 fixes only (re-run USAB-005 if code changed) | Report draft complete, slides complete, RC tagged | — |
| **D30 Fri 10-09** · R4 | Delivery | Morning T−60 checklist + rehearsal #2 | — | — | Delivered | — |

---

## 8 · FOUR-PERSON DAILY ALLOCATION

### 8.1 Capacity model (focused hours, not gross)

| Person | Gross/day | Reserved each day | Focused/day | D20 (evening) | D21–D28 | Total focused | Ledger demand | Gap |
|---|---|---|---|---|---|---|---|---|
| Tuấn | 8 | Coordination 1.5 · reviews/merges 1.5 · device ~1 · decisions 0.5 | **3.5** | 2 | 28 | **30** | ≈ 50 | **−20** |
| Hùng | 8 | Reviews 1.25 · meetings/course 0.5 · testing/evidence 0.75 | **5.5** | 3 | 44 | **47** | ≈ 50 | −3 |
| Khánh | 8 | Reviews 0.5 · meetings/course 0.5 · run babysitting/evidence 1 | **6.0** | 3 | 48 | **51** | ≈ 51 | 0 |
| Trung | 8 | Reviews 1 · meetings/course 0.5 · testing/evidence 1 | **5.5** | 3 | 44 | **47** | ≈ 52 | −5 |
| **Team** | 32 | | | | | **≈ 175** | **≈ 203** | **≈ −28 h (≈ 16 %)** |

Assumptions: all four available ~8 h/day **including Sat–Sun D24–25** (to be confirmed by availability declarations, CP-10); 0.5 h/day of course obligations. D29–D30 are **not** counted as feature capacity.

**Closing the −28 h without touching any MUST**, using Level 4 simplifications and allocation:

| Measure | Hours recovered |
|---|---|
| Backend built read-mostly: precomputed artifacts plus a small write API instead of all 28 endpoints | ≈ 6 |
| Compressed Spike F: 1 primary + 1 control candidate instead of 3 | ≈ 3 |
| Control plane at ≤ 45 min/day, drafted by Chat A | ≈ 4 for Tuấn |
| Acceptance runner and RTM moved off the leader (Hùng / Chat A) | ≈ 4 |
| Tuấn pairs on the V2 WebView bridge, which he built in S7, instead of Hùng re-learning it | ≈ 2 |
| All SHOULD/COULD and P3 hygiene frozen | ≈ 4 |

**The residual is about 5 h, mostly on the leader and Trung.** That is why the plan:
- gives the leader **no other primary task** beyond V1 + shell + integration, and routes his V1 coding through Chat D;
- parks Trung's Spike E extras (E9 document, E8 windows) until after the MUST items.

It is also the evidence behind the verdict: the plan only balances at full four-person availability including the weekend.

### 8.2 Allocation per day

**P** = one main implementation task. **R** = one bounded review or support task. Reviews that block another person are done **first**.

| Day | Tuấn (V1 · integration · decisions) | Hùng (V2 · imaging) | Khánh (ML · V3) | Trung (V4 · backend) |
|---|---|---|---|---|
| **D20** | **P** merges #49 → #48 → #26; push `8501906` as a PR; rebase #41; decisions CP-05, CP-07, DR-016, DEP-06; close the override. **R** re-review #50 and #52 at head | **P** Spike B prep: real GT mesh at 3 decimation levels (from #55 code); B5/B9 offline harness. **R** re-review #41 after the rebase + review the C1-prep PR | **P** confirm #35 final and answer review/QA; declare RTX 4050 availability + overnight; environment + dataset check; start the ML-03 loader on the candidate manifest. **R** — | **P** **re-review #35 at `7b72ce8`** (19:00–20:30), re-running `verify_subsets`/`preflight`. **R** QA-004 if #41 and #49 are merged, otherwise contract v1.0 prep + DR-010a option note |
| **D21** | **P** merges #50→#51→#52, #53, #46; Spike A step 4; DR-010a; TECH_STACK_ADR draft (Chat B); device slot 18:00. **R** backend skeleton PR | **P** Spike B residuals B5/B6/B7/B9/B12 + B13 (DR-008c) + B15; compute B-numbers after the slot. **R** #53 (09:00), ML-03 loader (afternoon) | **P** **C1**: adopt the harness, preflight on `main`, loader + `run_feasibility`, convergence trial, measurements; RESULT draft by 22:00. **R** Contract 1 ingestion PR (≤ 45 min) | **P** QA-004 (08:30), re-review #44 (10:00), then contracts v1.0 + backend skeleton + Contract 1 ingest of INTEGRATION_CASE_001; deploy on the Mac mini. **R** #44 + QA-004 |
| **D22** | **P** decision window 09:00–12:00 (GATE-ML-01, Spike B accept + DR-008c, GATE-MOB-01), then the **app shell** (Chat D) 12:30–20:00. **R** V2 mesh design | **P** answer Spike B QA; V2-01 mesh pipeline; MOB-09 compressed Spike F on a synthetic TP/FP/FN fixture. **R** **C1 RESULT + ADR-ML-001, 08:00–10:00 (P0)** | **P** C1 RESULT final + ADR-ML-001 (frozen vs full) by 10:00; training script + resumable queue; launch EXP-U-025 at 14:00, then EXP-D-025 and EXP-U-050, EXP-D-100 at 21:00, EXP-U-100 queued overnight. **R** Contract 2 v1.0 | **P** backend read API (masks, runs, metrics) + write API (reviews, reviewed-mask versions), responses contract-validated. **R** **app shell PR, same evening (P0, 2 h max)** |
| **D23** | **P** V1-02 SCR-02/03; 14:00–17:00 **pair with Hùng** on the WebView bridge. **R** V2-01, V4-02 | **P** V2-02 SCR-05 (plane sync, pick → slice); GATE-IMG-01 grid in the evening. **R** evaluation module (afternoon), V1-02 (evening) | **P** evaluation module + C2 exporter; first artifact (EXP-U-025) to Trung by 18:00; start EXP-D-050 at 09:00 (last in the queue); validation inference as each run finishes. **R** ingestion PRs | **P** V4-02 SCR-06 brush + save version; ingest the first artifact. **R** C2 exporter, V3-01 skeleton |
| **D24** | **P** V1-03 SCR-04; decisions GATE-IMG-01 (12:00) and DR-005 (18:30). **R** V2-02, V4-02 | **P** freeze morphology by 12:00; F7/F8 in the device slot → DR-005 recommendation; continue V2-02. **R** V1-03 | **P** holdout inference ×6 → EXP-D-PP → evaluation → 7 artifacts by 22:00; start V3-02 on the fixture. **R** morphology (GATE-IMG-01) | **P** finish V4-02; V4-03 SCR-08 + findings persistence. **R** V3 skeleton |
| **D25** | **P** integration links (SCR-03↔04↔05, finding → evidence), 7-state sweep, device smoke. **R** V2-03, backend hardening | **P** V2-03 3D error (DR-005); acceptance runner if time allows. **R** integration PR, statistics (evening) | **P** V3-01 + V3-02 on real artifacts; statistics generator. **R** V4-03 findings | **P** ingest all 7 artifacts; cohort/case endpoints; hardening (error codes, retry); network check from the phone. **R** V3-01/02 |
| **D26** | **P** TC-E2E-001 (fixture + backend) and triage; RTM (Chat A). **R** acceptance runner | **P** ML-14 reproducibility; V2 automated TC-3D; finish the runner. **R** RTM, statistics | **P** statistics package + RQ-A/B; DEMO_CASE_001 by rule; TC-SCI checks. **R** backend metrics vs saved metrics | **P** V4 automated TC-REV/FIND; backend fixes; E10 loop prep. **R** backend-side E2E defects |
| **D27** | **P** device E2E + perf 10:00–12:00, then fixes. **R** TC-TEAM-001 packages | **P** V2 fixes + TC-TEAM-001 V2. **R** V1 fixes | **P** V3 fixes + TC-TEAM-001 V3 + report ML/DS sections. **R** V4 fixes | **P** V4 fixes + TC-TEAM-001 V4 + E10 loop. **R** V3 fixes |
| **D28** | **P** TC-USAB-005 10:00–13:00; freeze at 18:00; RC build. **R** triage | **P** P0/P1 fixes; report IP section. **R** RC checks | **P** P0/P1 fixes; report ML/DS sections. **R** RC checks | **P** P0/P1 fixes; report Mobile/backend section. **R** RC checks |
| **D29** | RC recording, slides, rehearsal | Report + evidence index | Report + statistics appendix | Report + decision log |
| **D30** | Rehearsal + delivery | Defense | Defense | Defense |

**If someone finishes early**, they move to the highest-priority compatible blocker, in this order:
1. Any P0 review waiting.
2. ML-09 fixture tests (Hùng or Trung).
3. Backend endpoint tests (Khánh or Hùng).
4. Acceptance runner (anyone).
5. TC-TEAM-001 drafting.

**Never** cosmetic work while a P0 or P1 is open.

---

## 9 · REVIEW MATRIX

**Rules**
- Reviews run in **two fixed daily windows**, **12:00–13:00** and **20:00–21:00**, plus on demand for P0.
- Nobody holds more than one REVIEWING slot at a time (WIP-CONFLICT-01).
- Past the maximum turnaround, the **backup** takes the review. That is a Level-1 action and is recorded in `review_serialization.reassignments` with the reason "recovery Level 1". Ownership never moves.
- An approval counts only on the **head SHA**. A rebase with the same patch-id needs a one-line re-approval, not a re-review.
- **The author merges** after a valid approval and green CI (CP-07). The leader merges gate-critical and scientific PRs himself.

| Deliverable | Owner | Reviewer (backup) | Target window | Evidence the reviewer must see | Max turnaround |
|---|---|---|---|---|---|
| #35 split → GATE-SPLIT-01 | Khánh | **Trung** (Hùng) + **CHAT E QA** | D20 19:00–22:00 | Re-run `verify_subsets` + `preflight` on the **blob** at `7b72ce8`; DR-002/2a/2b fields; source hash `f64d461f` = `main` | **2 h** |
| C1-prep PR (from `8501906`) | Khánh (adopter) | **Hùng** (Trung) | D20 21:00 → D21 09:00 | Self-tests; blob-hash re-pin fixed | 2 h |
| C1 code (loader, `run_feasibility`, `measure_boundary`) | Khánh | **Hùng** (Chat C assists) | D21 13:00–15:00 | One-case verification JSON; fail-closed tests | 2 h |
| C1 RESULT (C1-1..10) | Khánh | **Hùng** + CHAT E | D22 08:00–10:00 | Raw JSON, loss JSONL, machine-generated tables | **2 h** |
| ADR-ML-001 → GATE-ML-01 | Khánh | **Hùng**; leader decides 12:00 | D22 10:00–12:00 | C1-10 coverage; frozen vs full rationale (PR-SCI-03) | **2 h** |
| Training script + 6 configs | Khánh | **Hùng** (Trung) | D22 13:00–14:00 | 1-epoch dry run on 2 cases; reload equivalence | 1 h (blocks GPU) |
| Evaluation module | Khánh | **Hùng** | D23 14:00–16:00 | Known-answer mask-pair fixture; empty-slice tests | 2 h |
| Contract 2 exporter | Khánh | **Trung** | D23 16:00–18:00 | `validate_contract2` PASS on EXP-U-025 | 2 h |
| GATE-IMG-01 morphology | Hùng | **Khánh**; leader decides 12:00 | D24 09:00–12:00 | Validation-only table; the grid was predeclared | 2 h |
| Statistics / evidence package | Khánh | **Hùng** | D26 windows | Generated from saved metrics; reproducibility rerun | 4 h |
| #41 re-approval | Tuấn | **Hùng** (Trung) | D20 20:00–21:00 | Conflict-resolution diff | 2 h |
| Spike A step 3 (QA-004) | Tuấn (owner) | **Trung** (QA actor) | D21 08:30–10:00 | `run_qa004.py` output from raw files | — |
| #44 B10/B11 | Hùng | **Trung** (CHAT E; the leader withdrew as Spike B reviewer under DR-006a rev 3) | D21 10:00–11:00 | Raw logs, PROVENANCE, re-derived numbers | 2 h |
| Spike B RESULT (B5–B15) + DR-008c | Hùng | **Trung** + CHAT E QA | D22 08:00–10:00 | Raw device logs; frontier table; `NEGATIVE_RESULT` if applicable | **2 h** |
| TECH_STACK_ADR → GATE-MOB-01 | Tuấn | **Hùng + Trung** | D21 20:00 → D22 10:00 | Links to A/B evidence; limitations listed | **2 h** |
| DR-005 (compressed Spike F) | Hùng | **Trung** + CHAT E; leader decides | D24 18:30 | F1/F4/F5/F6 offline, F7/F8 on device | 2 h |
| App shell | Tuấn | **Trung** (Hùng) | D22 20:00–22:00 | APK installs; CI green; navigation smoke | **2 h** |
| V1 PRs (SCR-02/03/04) | Tuấn | **Hùng** for overlay/geometry, **Trung** for API use | D23–D25 windows | TC-MRI/MASK/ERR tests + screenshots (D7) | 4 h |
| V2 PRs (mesh, SCR-05, 3D error) | Hùng | **Tuấn** (Trung) | D23–D25 windows | Geometry fixture; TC-3D; device video | 4 h |
| V3 PRs (SCR-01/07) | Khánh | **Trung** (Hùng) | D24–D26 windows | TC-EXP/REP; N shown; contract comparability labels | 4 h |
| V4 PRs | Trung | **Tuấn** for SCR-06, **Khánh** for SCR-08 | D23–D25 windows | TC-REV/FIND; source checksum unchanged after save | 4 h |
| Backend API core | Trung | **Tuấn** (Hùng) | D21–D23 windows | Every response validated against the contract | 4 h |
| Contract 1 / 2 ingestion | Trung | **Khánh** | D21 / D23–25 | Validator PASS; counts reconcile | 4 h |
| Contracts v1.0 freeze (+ DR-010a) | Trung | **Tuấn + Khánh** | D21 16:00–18:00 | Regenerated fixtures; app/core drift test | 2 h |
| Acceptance runner | Hùng | **Tuấn** | D25–D26 | TC → PASS / FAIL / NOT RUN table | 4 h |
| TC-E2E-001 / TC-USAB-005 | Tuấn | **Trung** + CHAT E | D27 / D28 | Recording + timestamped logs | Same slot |
| TC-TEAM-001 ×4 | Each | Tuấn ↔ Hùng, Khánh ↔ Trung | D27–D28 | The `16` §6 chain | Same day |

**Load, reviews D20–D28:**

| Person | Reviews |
|---|---|
| Hùng | ≈ 10, mostly P0 ML |
| Trung | ≈ 10, split, spike QA, V3 |
| Tuấn | ≈ 8, plus decisions |
| Khánh | ≈ 5 |

To keep Hùng from becoming the next bottleneck, **Khánh takes the SCR-08 and ingestion reviews**, and Trung carries V3. If Hùng is saturated on D22–D23, the backup for the training-script and evaluation reviews is **Trung, with Chat C doing the pre-review**.

---

## 10 · ML / COMPUTE SCHEDULE

| Question | Answer (evidence) |
|---|---|
| **Real training so far** | **None.** Only C0 synthetic probes (09-16) and the synthetic 8-case bring-up (#37). No checkpoint, loss log or evaluation file exists on any ref or on this PC. |
| **Not yet done** | C1 (0/10), all six runs, validation and holdout inference, the evaluation module, GATE-IMG-01, EXP-D-PP, statistics, Contract-2 artifacts. |
| **Compute host** | **Approved:** Khánh's RTX 4050 Laptop 6 GiB (Py 3.11.9, torch 2.11+cu128, bf16), with 4–5 unattended GPU-h/day **self-declared 09-16**. It was unreachable 09-24 and has **no remote path**. **Candidate host 2:** leader PC, RTX 3050 Ti 4 GiB (1 GiB used by the desktop at 16:49 today), torch 2.5.1+cu121, dataset and pinned DINOv2 revisions present. **Not approved: needs DR-016 and a memory re-probe.** |
| **Availability** | **Unknown until Khánh declares tonight**, including whether the laptop can stay on overnight and stay plugged in on D22–D24. |
| **Estimated run time** (C0 synthetic throughput × subset fraction, 50 epochs **assumed**, ×1.35 overhead; C1-2 must replace this) | Per run, pair B (UNet base32 + DINOv2-S/14 full progressive): U-025 1.3 h · U-050 2.4 h · U-100 5.0 h · D-025 1.5 h · D-050 2.8 h · D-100 5.8 h, **18.8 GPU-h core**. Pair A totals 7.3 h; pair C 33.8 h. **At 100 epochs, double it.** EXP-D-PP needs **no training** (inference + morphology, < 1 h); the Day-15 forecast priced it as a full run, which is conservative. |
| **Matrix remaining** | All six, plus PP. |

**Run order and calendar** (single approved host, continuous queue; a resumable queue script runs everything in sequence):

| # | When | Job | Why this order |
|---|---|---|---|
| 0 | D21 13:00–17:00 | **C1 convergence trial**, both families, equal budget, 20-case subset, ~2–3 GPU-h. Also memory/timing, the 560 → 448 grid, boundary thickness | Turns "50 epochs" into a measured basis |
| 1 | D22 14:00 | **EXP-U-025** (~1.3 h) | Cheapest run; proves train → checkpoint → inference → evaluation → Contract 2 end to end before the long runs |
| 2 | D22 ~16:00 | EXP-D-025 (~1.5 h) | Short; early DINOv2 sanity check on the real recipe |
| 3 | D22 ~18:00 | EXP-U-050 (~2.4 h) | — |
| 4 | **D22 21:00 overnight** | **EXP-D-100** (~5.8 h) | Its validation predictions are needed first, for GATE-IMG-01 and EXP-D-PP |
| 5 | Overnight, queued | EXP-U-100 (~5.0 h) | — |
| 6 | D23 09:00 | EXP-D-050 (~2.8 h) | **All six done by about D23 12:00** if the host runs continuously. At 100 epochs, about D24 06:00 |
| 7 | D23 (as runs finish) | Validation inference for each run → GATE-IMG-01 grid on the EXP-D-100 validation set | — |
| 8 | **D24 after 12:00** | Holdout inference ×6 → EXP-D-PP → evaluation → 7 artifacts | Only after all checkpoints **and** the morphology config are frozen, so the holdout is touched **once** |

- **With DR-016 option 2** (two hosts), each family stays on one host. **UNet family on host 2** (base32 peak ≈ 0.9 GiB at batch 2 fits 4 GiB), **DINOv2 family on the 4050**. This halves wall-clock and removes the single-laptop dependency. The hardware difference goes into ADR-ML-001: the cross-machine tolerance is characterised at 5e-5 loss / 5e-4 Dice, and precision and versions are pinned per family.
- **Overnight jobs:** runs 4–5 (and 3 if needed). The laptop must be plugged in, with sleep and hibernate disabled. Run `nvidia-smi --query` logging every 60 s to the run directory.
- **Checkpoints:** save `last` every epoch and `best_on_validation`, both SHA-256'd into the run manifest (`08` §10). They live outside Git, with one copy to the Mac mini artifact store after each run.
- **Failure recovery:**

| Failure | Response |
|---|---|
| Crash | Resume from `last` |
| NaN / Inf | Stop; record `NEGATIVE_RESULT`; one diagnosis; **a second failure fires T3** |
| OOM | Only the fallback batch size pre-declared in ADR-ML-001, otherwise a DR |
| Host lost | The family moves **whole** to host 2 (if approved) with the same code and versions; never half a family per host |

- **When V3 gets artifacts:** the generated Contract-2 fixture now (#50). **The first real artifact (EXP-U-025) arrives D23 18:00. All seven arrive D24 22:00.** Ingestion and serving by D25 12:00.
- **When EXP-D-PP can start:** D24, right after GATE-IMG-01 is frozen (12:00) and holdout inference for EXP-D-100 has run.

**If six full runs cannot finish in time** (trigger T4: not all six raw runs done by **D25 12:00**), these are the formal options, in order. **None of them silently reduces the matrix.**

| Option | What it is | Condition |
|---|---|---|
| **A** | Second host (DR-016 option 2): split by family | — |
| **B** | DR-007 remedy **before GATE-ML-01 only**: smaller resolution (448, on the pre-declared 112-step grid) or smaller variants (pair A), with an **equal-treatment** justification (PR-SCI-03: never frozen DINOv2 against a full UNet by default) | — |
| **C** | Uniform epoch cap via an ADR-ML-001 amendment | **Before any holdout inference**; same cap for all six runs |
| **D** | Last resort, after D26 12:00: a Decision Request under `00` §13 to deliver a documented-incomplete matrix as a **recorded deviation from MUST PR-EXP-03**. Missing runs shown as `NOT RUN` in the UI and report | **Leader signature; never silent** |

---

## 11 · GALAXY DEVICE SCHEDULE

**Rules**
- **Operator:** Phạm Tuấn Anh, always (DR-006a).
- **Owners** design the session script and compute every number.
- Every session logs the **APK build timestamp**, which must be newer than the last code change, and writes a `PROVENANCE.md` naming operator and owner.
- The next owner's script must be committed **before** the slot starts; no setup happens during a slot.
- Everything not on this calendar runs off-device: emulator (diagnostic only), fixture tests, contract tests.

| Slot | When | Length | Owner(s) | Measures | Prerequisite | If missed |
|---|---|---|---|---|---|---|
| S-1 | **D21 18:00–19:30** | 90 min | **Hùng** | Spike B levels 1–3 FPS (B10/B11 per level), B6 picking after rotate/zoom, B7 2D navigation, B9 background picks | Real GT mesh at 3 levels; release APK with the S7 WebView | Moves to D22 07:30; GATE-MOB-01 slips to D22 18:00 (T5) |
| S-2 | D22 20:00–20:30 | 30 min | Tuấn | App-shell release APK install / launch / navigation smoke | Shell on `main` | D23 08:00 |
| S-3 | D23 17:00–18:00 | 60 min | **Tuấn** (QA: Trung) | SCR-03: TC-PERF-001 early (30-step slice switch), TC-MRI-002 zoom/pan, overlay alignment | SCR-02/03 on `main`; backend reachable | Merge into S-4 |
| S-4 | **D24 17:00–18:30** | 90 min | **Hùng**, **Trung** | SCR-05: TC-PERF-002 (≥ 20 FPS), TC-3D-003/004. Spike F: **F7/F8** (DR-005). SCR-06: TC-PERF-003, TC-REV-003 (brush after zoom) | SCR-05 + SCR-06 builds | D25 09:00; DR-005 slips (T5) |
| S-5 | D25 17:00–18:00 | 60 min | **Trung**, Tuấn | Overlay DIRECT; `/health` **from the phone**; fallback cache; **hero dry-run #1** | Backend on the Mac mini | D26 morning |
| S-6 | D26 17:00–18:00 | 60 min | Tuấn | Hero dry-run #2 on DEMO_CASE_001; TC-MOBILE-STATE-001; TC-REL-002 (network cut) | RC-candidate APK | D27 08:00 |
| S-7 | **D27 10:00–12:00** | 120 min | All owners | **TC-E2E-001** (formal); final TC-PERF-001/002/003 on the product release build | Fresh RC APK | D27 16:00 |
| S-8 | D27 16:00–16:30 | 30 min | Trung | TC-PERF-FIRSTLOAD-01 (E10) ≥ 20 cold opens per profile | Loop script | D28 evening, or recorded `NOT MEASURED` under DR-015 |
| S-9 | **D28 10:00–13:00** (retry 19:00–20:00) | 180 min | Tuấn (QA: Trung) | **TC-USAB-005**: 5 consecutive canonical runs, timestamped | E2E stable | D29 10:00, consuming stabilization |
| S-10 | D29 10:00–11:00 | 60 min | Tuấn | RC hero recording (`16` §7); rehearsal #1 at 16:00 | RC tag | — |
| S-11 | D30 morning | T−60 | Tuấn | DEMO_STANDARD §8 checklist + rehearsal #2 | — | — |

**About 12 h of leader time on the device** over 10 days.

**Optional de-bottleneck (leader decision):** re-enable `tools/remote_adb` (`share_on.ps1`) so **owners can run non-acceptance smoke checks remotely**. That was the DR-006a rev 1 model, and the phone never leaves the leader. Acceptance slots stay leader-operated.

---

## 12 · INTEGRATION / MERGE PLAN

**Merge order.** Each step re-runs the named checks after it lands. CI on `main` must be green before the next merge.

| # | PR | Check after merge | Note |
|---|---|---|---|
| 1 | **#49** | `main` CI; Spike A harness tests locally | — |
| 2 | **#48** | CI (8 jobs incl. app-core + framework-neutral); `node app/core/tests/run_all.mjs` | Do **not** delete `feat/day10-app-core` |
| 3 | **#26** | CI | — |
| 4 | **#41** (after conflict fix and re-approval) | CI | — |
| 5 | **#35** (after re-review + QA; leader merges) | CI; `preflight` on `main` (blob hash); **GATE-SPLIT-01 record** | — |
| 6 | **C1-prep PR** (from `8501906`, after Khánh adopts and Hùng reviews; by D21 10:00) | CI; forbidden-bytes job (no data or checkpoint bytes) | Trung's #35 re-review uses its branch **before** it merges |
| 7 | **#50** (retarget to `main`) | **`main`'s contract-tests job runs `test_api_contract.py` for the first time** | — |
| 8 | **#51** → **#52** | CI | Each retargeted before any base branch is deleted |
| 9 | **#53** (rebased) | CI (V1 31 checks) | — |
| 10 | **#44** | CI | Before #55 (`viewer.js` conflict) |
| 11 | **#46** (rebased on #49 + #41) | CI | — |
| 12 | #33 | CI | — |
| 13 | #54 | **Held**; see DS-02 | — |
| 14 | #55 | Folded into V2-01, then closed | — |
| 15 | #56 | Archive or close | — |

**Shared-contract freeze points**

| Contract / artifact | Freeze |
|---|---|
| Geometry `dr008a-dr012/v1.0.0` | **Frozen, no change** |
| **API 11, Contract 1, Contract 2** | **v1.0 on D21 18:00**, including the DR-010a worst-slice selection, the FR-REV-001 review-state enum (V4-06), the inference-only mode flag (INT-12) and a hero-flow subset marker. After that, additive changes only, by a PR from Trung reviewed by Tuấn, with regenerated fixtures |
| `dataset_manifest.json` | **Frozen at `f64d461f` through Day 30** (the #54 hazard) |
| Split manifest | Frozen with GATE-SPLIT-01 |
| ADR-ML-001 | Frozen D22 12:00 |
| Morphology config | Frozen D24 12:00 |

**Integration-sensitive files, one owner at a time**

| Files | Owner |
|---|---|
| `app/mobile/package.json` + lockfile, `app.json`, navigation root | Tuấn |
| `contracts/**` + generators | Trung |
| `tests/fixtures/geometry/**` | Hùng (frozen) |
| `.github/workflows/**` | Tuấn |
| `data/manifests/**` | Khánh (frozen) |
| `app/core/**` | Tuấn, changed by PR with Hùng as reviewer |

**app/core convergence:** verticals import only `app/core` and the shell's screen registry. No cross-vertical imports, and **no imports from `spikes/`** (copy with a provenance header only). Contract drift fails in `contract.mjs`.

**V1–V4 merge windows:** **12:00–13:00 and 20:00–21:00 daily**. A PR ready before a window is reviewed in it. Small daily PRs: one screen state or one endpoint group per PR.

**Backend and artifact ingestion**

| Day | Milestone |
|---|---|
| D21 | Skeleton + `/health` + Contract-1 case |
| D22 | Read API on fixtures; write API for reviews |
| D23 | First real Contract-2 artifact |
| D24–25 | All seven artifacts; per-case/cohort/per-slice endpoints |

The shell switches **fixture → live** by config only.

**Fixtures:** only the generated bundle (`handwritten_fixtures_allowed: false`), plus the `13` §11 synthetic canonical set (geometry, TP/FP/FN mask pair, brush transform, experiment compatibility).

**Daily smoke** (`13` §11 flow: load case → browse → overlay → metrics/error → 3D → linked navigation → review/brush → saved artifact):
- D21–D22 in fixture mode (CI + a local script).
- **From D23 on the device** in slots S-3 onward.
- The result is logged in the day file every evening.

**Canonical E2E case:** **INTEGRATION_CASE_001** is a *validation-partition* case with ground truth, predicted by EXP-U-025, from D23. **DEMO_CASE_001** is a **holdout** case chosen D26 by a rule declared **before** looking at the metrics (e.g. the case whose primary-run Dice is closest to the cohort median), never picked for looking best (`13` §11).

**Regression gate:**
- No merge on red CI.
- After every contract, app/core or backend merge: contract tests + app/core tests + the vertical's tests.
- A P0/P1 defect freezes feature merges **in that area** until it is fixed forward (a non-destructive revert commit is allowed; force-push to `main` never is).
- From D28 15:00: P0 fixes only.

---

## 13 · SCOPE TRIAGE

| KEEP NOW | DEFER UNTIL MUST COMPLETE | FORMAL DECISION REQUIRED |
|---|---|---|
| **All 33 MUST** (§4) | **PR-AN-01** (SHOULD; live analysis run): precomputed runs, labelled "precomputed" (allowed by its own text) | **DR-016** compute host(s) |
| Hero flow H1–H10 on SCR-01..08 | PR-COMP-01 side-by-side comparison beyond run switching (SHOULD) | **GATE-MOB-01 / TECH_STACK_ADR**, and Spike A accepted with the A1/A12 and 64×64×16 limitations recorded |
| Gates SPLIT, ML, IMG, MOB | PR-METRIC-01 HD95 (SHOULD; also blocked by unvalidated spacing) | **DR-005 via a compressed Spike F** (Level 4; RA-B01) |
| Six-run matrix + EXP-D-PP + statistics (`08` §7, §11.1) | PR-REVAN-01 review-burden analytics (SHOULD) | **DR-008c** mesh budget |
| TC-E2E-001, TC-USAB-005, TC-TEAM-001, TC-SCI-001..003 (`13` §13 floor) | PR-FILTER-01 richer filtering (SHOULD) | **ADR-ML-001**: frozen vs full DINOv2, epoch cap, DR-007 remedy |
| TC-PERF-001..003 on the product build | PR-CACHE-01 offline caching (SHOULD) | **DR-010a** worst-slice endpoint |
| DR-003 minimal demo fallback | **All 5 COULD** frozen (MODEL-EXTRA, COLLAB, ANN-ADV, STUDY-CREATE, EXP-SCHED) | **DR-015 limb 1**: measure E10 D27, or record `NOT MEASURED` |
| Report + `16` defense mapping + evidence index | SCR-09 Analysis Run Status (only with PR-AN-01) | **#54 hold or restructure** (dataset-manifest hash) |
| — | On-screen performance panel (never decided; not built) | **CP-07** merge delegation; review SLA and backups |
| — | #56, board rebuild, worktree cleanup, E9 drill doc (#33 content beyond merge), Spike E extra windows, C0 RESULT correction | **Level 5 record for SHOULD/COULD deferral**, plus the M9 "≥ 2 buffer days" declared unachievable |
| — | — | **INT-12: designate an inference-only case** (GT withheld at ingestion for one non-demo holdout case) so PR-CASE-02 / PR-MODE-01 are demonstrable. All 154 cases carry GT |
| — | — | Weekend (D24–25) availability confirmation |

**Firewall:** while any P0/P1 is open, nobody builds SHOULD/COULD or cosmetic work (`03` §5, DEMO_STANDARD §9). The frozen product scope is not redesigned, and nothing is added.

---

## 14 · RECOVERY TRIGGERS

**Each trigger fires on a clock, not a feeling.** Responses follow the `15` §18 ladder. **A MUST is never silently deleted.**

| # | Trigger (fires when) | PAIR | REALLOCATE (review turns only, recorded) | RUN IN PARALLEL | SIMPLIFY (keep the requirement) | DEFER SHOULD/COULD | OPEN DECISION | ESCALATE |
|---|---|---|---|---|---|---|---|---|
| T1 | **GATE-SPLIT-01 not CLOSED by D21 12:00** | Khánh + Trung on QA findings | Re-review goes to Hùng if Trung has not reviewed by D20 22:30 | ML-03 loader + ML-09 evaluation continue on the candidate manifest (non-authoritative) | — (split semantics are fixed) | — | Only if QA finds a DR-002b defect | Leader, 12:00 |
| T2 | **No C1 GPU job running by D21 14:00** (host absent) | Khánh + Hùng | — | C1 duplicate on host 2 **if DR-016 approved** (leader operates, Khánh commands, DR-006a style) | Smaller C1 grid (560 + one smaller size) | — | **DR-016 option 2** | Leader → lecturer if no host by D22 |
| T3 | **An ML run fails twice** (NaN/OOM/crash, same config) | Khánh + Hùng (Chat C) | — | The other family keeps training | **Before GATE-ML-01:** DR-007 remedy. **After:** only by re-opening GATE-ML-01 formally, never mid-matrix | — | ADR-ML-001 amendment | Leader same day |
| T4 | **Six raw runs not done by D25 12:00** | Khánh + Hùng | — | Host 2 takes a whole family | Uniform epoch cap only if no holdout inference has run | — | §10 options A→D (D = MUST deviation DR) | Leader + lecturer if option D |
| T5 | **A device slot is missed or produces no usable evidence** | Owner + Tuấn | Next slot moves up; the owner's emulator diagnostic runs in parallel | Off-device tests continue | Merge adjacent slots | — | Remote-ADB smoke (DR-006a rev 1 model) | Two misses in a row → leader re-plans the device calendar |
| T6 | **A review waits longer than its maximum** (2 h P0 / 4 h P1) | — | **Backup reviewer** per §9; recorded in `reassignments` | Author starts the next small task | — | — | — | Third miss by the same reviewer in 2 days → leader conversation, no ownership change |
| T7 | **A stack or PR cannot merge** (conflict / red CI > 2 h) | Author + Tuấn (integration) | — | Split the PR | Take the smaller slice first | — | — | Leader decision window |
| T8 | **A vertical fails integration** (smoke red after a merge) | Owner + secondary | — | Other verticals keep merging outside the affected area | Fix forward ≤ 4 h, else a revert commit (non-destructive) | That vertical's polish | — | P1 → leader |
| T9 | **R3 exit slips** (TC-E2E-001 not green on device by D27 18:00; stabilization < 2 days) | Whole team on the failing step | — | Report/defense writing continues | Level 4 on the failing feature (e.g. V3 charts → table + strip plot; 3D error → class-colour mesh only) with the requirement intact | Everything still deferred stays deferred | Record the stabilization loss | Day 30 stays fixed; the leader informs the lecturer if a MUST deviation DR is needed |
| T10 | **A member has zero activity by 13:00** (INC-001/002) | — | Their blocking reviews go to backups at 13:00 | Their dependents switch to fixtures | — | — | — | **Ask first**, then record the INC. Ownership unchanged |
| T11 | **GATE-MOB-01 not CLOSED by D22 18:00** | Hùng + Tuấn | — | app/core-level work, backend and ML continue | — | — | Leader decides on the existing evidence with residual B-criteria as V2 acceptance items (formal), **or** a `NEGATIVE_RESULT` escalation | Leader |
| T12 | **Backend not reachable from the phone by D25 12:00** | Trung + Tuấn | — | Development continues in fixture mode | DR-003 minimal fallback for the demo only | — | — | Leader (network) |

---

## 15 · NEXT-24-HOUR WORKBOARD (Tue 2026-09-29 17:00 → Wed 2026-09-30 17:00)

| Time | Person | Task | Input | Output | Dependency | Reviewer | Merge target | EOD condition |
|---|---|---|---|---|---|---|---|---|
| 17:00–17:30 | **Tuấn** | Send the 4 briefs (§16). Ask for **availability declarations for D20–D30, including Sat–Sun**, and ask Khánh about the **RTX 4050 (overnight?)** | §16 | 4 replies | — | — | — | 4/4 replied by 19:00 |
| 17:30–18:15 | **Tuấn** | Merge **#49 → #48 → #26** (valid head approvals). Watch `main` CI after each. Keep `feat/day10-app-core` | PRs | app/core on `main` | — | (existing) | `main` | `main` CI green, 8 jobs |
| 18:15–19:00 | **Tuấn** + Chat D | Push `8501906` as a PR ("leader-authored under the expired override; owner adoption required"; blob-hash re-pin fix). **#41**: merge `main`, resolve RESULT.md (`main` A3–A8/A10/A11 + S6 A9), push | `8501906`, #41 | 2 updated PRs | #49 merged | Hùng | `main` | Both pushed by 19:00 |
| 19:00–19:30 | **Tuấn** | Record decisions **CP-05, CP-07, DR-016, DEP-06, DS-02 (#54 hold)** in `day20/DAY_20.md` | This report, Khánh's reply | Decision records | Khánh's declaration | — | `main` (docs) | Recorded |
| 19:00–20:00 | **Khánh** | Confirm #35 head `7b72ce8` is final and answer Trung. **Declare host availability D21–D24 incl. overnight.** Record Python/torch/transformers/HF-hub/CUDA/cuDNN on the 4050 and the dataset path | — | PR comment | — | — | — | Declared by 20:00 |
| 19:00–20:30 | **Trung** | **Re-review #35 at `7b72ce8`**: run `verify_subsets` + `preflight` (C1-prep branch) on the **blob**; check DR-002/2a/2b fields, source hash `f64d461f`, exclusions, groups | #35, C1-prep PR | APPROVE / CHANGES_REQUESTED at head | Khánh reachable | — | (review) | Posted by 20:30 (else T1 backup → Hùng at 22:30) |
| 19:00–20:00 | **Hùng** | Re-approve **#41** after the rebase | #41 | Approval at the new head | #41 pushed | — | `main` | Approved |
| 20:00–21:00 | **Hùng** | Review the **C1-prep PR** (H1–H3 logic, blob hash) | PR | Review | CP-06 | — | `main` | Posted |
| 20:00–22:00 | **Khánh** | Start the **ML-03 real-data loader** on the candidate manifest: NRRD → tensor, DR-011, resize 560, one-case test that **refuses non-training IDs** | `pipeline_bringup.py`, `probe.py` | Branch `spike-c1/real-loader` | — | Hùng | — | 1 training case loads; validation/holdout unresolvable |
| 20:30–21:30 | **Tuấn** + CHAT E | **Mandatory QA on #35**: independent re-derivation | #35 + Trung's approval | `management/day20/QA_REVIEW_005_SPLIT.md` | Trung APPROVE | — | `main` (docs) | QA verdict |
| 21:00–23:00 | **Trung** | **QA-004** (Spike A step 3) if #41 and #49 are merged; else the contracts v1.0 + **DR-010a option note** | `run_qa004.py` | Verdict file or note | #41 merged | — | `main` | Delivered |
| 21:00–23:30 | **Hùng** | Spike B prep: real GT mesh from one training case with the #55 code; 3 decimation levels; B5/B9 offline harness; draft the **S-1 device script** | #55, picking harness | Script committed; meshes outside Git | — | Trung | — | S-1 script exists |
| 21:30–22:00 | **Tuấn** | If QA PASS: **merge #35**; run `preflight` on `main` (blob hash); record **GATE-SPLIT-01 CLOSED**; SPIKE_C1 `blocked_by` → none (ACTIVE only once `preflight runnable: true`) | — | Gate record | QA PASS | — | `main` | **GATE-SPLIT-01 CLOSED** |
| 22:00–23:30 | **Tuấn** | Review `22876b0` on #50 and #52 at head; retarget #50 → `main`; merge #50 → #51 → #52 in order (each retargeted first) | #50–52 | Stack on `main` | #48 on `main` | (leader is reviewer) | `main` | V4 model on `main` |
| 23:00–23:59 | **Tuấn** + Chat A | Day-20 close: `DAY_20.md`, `PROJECT_STATE` rebaseline, override closure (CP-01), INC-003 draft (pending answers) | — | Commits | — | — | `main` | Pushed by 23:59 |
| **D21** 08:00–09:00 | **All** | Availability post (INC-001 rule) · merge window: #53 (after Hùng), SPIKE_A step 4 (after QA-004) | — | — | — | — | `main` | 4/4 posted |
| 08:00–12:00 | **Khánh** | **C1**: adopt the harness; re-pin the blob hash from `main`; `preflight runnable: true`; `run_feasibility`; one-case verify; fwd/bwd/reload per family | `main` | `c1_preflight_*.json`, partial `c1_measurements` | GATE-SPLIT-01, host | Hùng | `main` (code PR) | `runnable: true` by 10:00 |
| 08:30–10:00 | **Trung** | QA-004 if not done | — | Verdict | — | — | `main` | — |
| 09:00–11:00 | **Hùng** | Review **#53**; compute **B5/B9 offline**; frontier table | — | — | — | — | — | — |
| 09:00–12:00 | **Tuấn** + Chat B | **DR-010a + INT-12 (inference-only case) decisions by 10:00** (Trung needs them for contract v1.0); TECH_STACK_ADR draft; Spike A step 4 (A1/A12 decision) | Chat B note | ADR PR; SPIKE_A ACCEPTED; decision records | QA-004 | Hùng + Trung | `main` | ADR PR open by 12:00 |
| 10:00–11:00 | **Trung** | Re-review **#44** | #44 | Approval / CHANGES_REQUESTED at head | — | — | `main` | Posted |
| 11:00–17:00 | **Trung** | **Contracts v1.0** (DR-010a + FR-REV-001 review-state enum + inference-only flag) + **backend skeleton** (`/health`, study, cases, per-slice image) + Contract-1 ingest of INTEGRATION_CASE_001; deploy on the Mac mini | Contracts | PRs | DR-010a, INT-12 decision, DEP-06 | Tuấn / Khánh | `main` | `/health` 200 **from the phone** by D21 EOD |
| 12:00–13:00 | **All** | Merge window | — | — | — | — | — | — |
| 13:00–17:00 | **Khánh** | **C1 convergence trial (GPU)** + memory/timing + resolution grid + boundary thickness | — | Loss JSONL, measurements | — | Hùng | — | **GPU job running by 14:00** (else T2) |
| 11:00–17:00 | **Hùng** | B12 frontier + B7 wiring; review the C1 loader (13:00–15:00) | — | — | — | — | — | S-1 ready by 17:30 |
| **17:00 checkpoint** | **Tuấn** | 24-hour exit check | — | Posted in the day file | — | — | — | **GATE-SPLIT-01 CLOSED · C1 GPU trial running · SPIKE_A ACCEPTED · #48–#53 on `main` · backend `/health` · S-1 script ready** |

---

## 16 · FOUR VIETNAMESE MEMBER BRIEFS

> Bản gửi thẳng vào nhóm chat. Mốc: **Day 20 = 29/09, Day 30 = 09/10 (không lùi).** Mỗi PR mở phải có người duyệt ngay lúc mở; duyệt chỉ tính trên **đúng SHA head**; PR có duyệt hợp lệ + CI xanh thì **tác giả tự merge** (trừ PR split / C1 / ADR-ML / gate: leader merge sau QA). Khai báo giờ làm trước **09:00** mỗi ngày.

### PHẠM TUẤN ANH — V1 · Tích hợp/CI · Điều phối

- **Tình trạng:**
  - Day 20/30. `main` **chưa có dòng mã sản phẩm nào**, và **0/33 MUST** được nghiệm thu.
  - Có 15 PR mở. Trong đó **#48, #49, #26 đã có duyệt hợp lệ từ 8 ngày trước mà chưa merge.**
  - GATE-SPLIT-01, GATE-ML-01, GATE-MOB-01 đều còn mở. Chưa có lượt train thật nào.
- **Việc chính:** V1 (SCR-02, SCR-03, SCR-04), **app shell RN/Expo** và tích hợp.
  - Tối nay:
    - merge #49 → #48 → #26;
    - rebase #41 (sửa `RESULT.md`);
    - đẩy commit `8501906` thành PR để Khánh nhận;
    - retarget và duyệt lại #50/#52;
    - QA #35 cùng CHAT E, rồi merge và đóng GATE-SPLIT-01.
- **Duyệt / phụ trợ:**
  - Duyệt V2 (Hùng), SCR-06 (Trung) và lõi backend (Trung).
  - Cầm máy Galaxy theo lịch S-1…S-11 (§11).
- **Quyết định tối nay:**
  - DR-016 (máy train);
  - CP-07 (tác giả tự merge);
  - CP-05 (mức recovery);
  - DEP-06 (quyền Mac mini cho Trung);
  - giữ #54 lại;
  - chốt DR-010a trước trưa D21.
- **Đầu ra và hạn:**
  - GATE-SPLIT-01 đóng **tối nay**.
  - TECH_STACK_ADR + GATE-MOB-01 **D22 12:00**.
  - App shell lên `main` **D22 tối**.
  - SCR-03 chạy trên máy **D23 17:00**; SCR-04 **D24**.
  - TC-E2E-001 **D27**; TC-USAB-005 **D28**; đóng băng mã **D28 18:00**.
- **Phụ thuộc:** Trung duyệt #35; Hùng duyệt #41, #53; kết quả Spike B của Hùng.
- **Bằng chứng nghiệm thu:**
  - CI `main` xanh sau mỗi merge;
  - bản ghi gate;
  - giờ build APK trong mỗi phiên đo;
  - video hero flow.
- **KHÔNG làm:**
  - Không nhận thêm việc chính nào ngoài V1 + shell + tích hợp.
  - Không tính số B/E thay người khác, không tự duyệt PR của mình.
  - Không xoá nhánh/worktree khi chưa xác nhận.
  - Không sửa `docs/specs/v1.0/**`.

### VŨ HÙNG ANH — V2 · Hình ảnh / Hình học

- **Tình trạng:**
  - Spike B **chưa ACCEPTED**: B10/B11 mới PASS ở level 0 tổng hợp, nằm trên #44 và đang chờ Trung duyệt lại. **B5, B6, B7, B9, B13, B15 chưa đo.**
  - GATE-MOB-01, đã trễ 14 ngày, đang chờ Spike B.
  - Spike F chưa bắt đầu, nên **DR-005 (biểu diễn lỗi 3D) là blocker duy nhất của dự án (RA-B01).**
  - V2 hiện mới có README.
- **Việc chính:**
  - **Tối nay + D21: hoàn tất Spike B.**
    - Dựng mesh thật từ GT bằng code #55, ở 3 mức decimation.
    - Tính B5/B9 offline; làm B7; lập bảng frontier B12.
    - Viết đề xuất DR-008c (B13) và ghi chú B15.
    - Phiên máy **S-1 D21 18:00**: anh Tuấn cầm máy, bạn thiết kế và tính số.
    - `RESULT.md` **D22 08:00**.
  - **Từ D22: V2.**
    - Pipeline mesh sản phẩm (D23).
    - SCR-05 3D trong WebView, mặt cắt theo lát và pick → lát (D24).
    - Lỗi 3D theo DR-005 (D25).
  - **Spike F rút gọn:** ứng viên 3 (bề mặt + marker FP/FN có dải lát) và ứng viên 1 làm đối chứng. F7/F8 đo ở **S-4 D24**, đề xuất DR-005 lúc 18:30.
- **Duyệt (P0, tối đa 2 giờ):**
  - #41 tối nay; PR C1-prep;
  - **C1 RESULT + ADR-ML-001 (D22 08:00–10:00)**;
  - module đánh giá (D23); #53.
  - **GATE-IMG-01:** chọn morphology **chỉ** trên dự đoán validation của EXP-D-100, đóng băng trước **D24 12:00**.
- **Phụ thuộc:** Trung duyệt #44; slot máy S-1 và S-4; dự đoán validation EXP-D-100 (D23).
- **Bằng chứng:**
  - log thô từ máy + `PROVENANCE.md` (operator + owner);
  - bảng frontier;
  - sai số pick **≤ ±1 lát**.
  - Nếu B5 fail ở mọi mức thì ghi `NEGATIVE_RESULT` và báo ngay.
- **KHÔNG làm:**
  - Không nới ±1 lát, không sửa geometry contract.
  - Không import từ `spikes/` vào `app/` (chỉ copy kèm header nguồn gốc).
  - Không làm hiệu ứng/thẩm mỹ khi còn P0.

### BẾ QUỐC KHÁNH — V3 · Huấn luyện / Đánh giá ML

- **Tình trạng:**
  - **Đường găng khoa học nằm ở bạn.**
  - #35 đã sinh lại hôm 21/09, nhưng lượt duyệt của Trung nằm trên commit cũ, nên **chưa có duyệt hợp lệ.**
  - Spike C1 đạt **0/10**, và **chưa có lượt train thật nào.**
  - RTX 4050 là máy train được duyệt, nhưng hôm 24/09 không truy cập được.
  - Harness C1 (`preflight`, `verify_subsets`, `forecast`) nằm ở commit `8501906` do leader viết, sẽ thành PR để bạn nhận hoặc thay.
  - **Lưu ý:** hash `ff1517d0…` bị sai vì PowerShell ghi CRLF+BOM. Phải băm **đúng blob git** (`c5c65a09…`).
- **Việc chính:**
  - **Tối nay:** trả lời duyệt #35, **khai báo máy**, ghi môi trường.
    - Máy có chạy qua đêm D21–D24 được không? Có cắm điện và tắt sleep được không?
  - **D21:** C1 đầy đủ, `RESULT.md` tối D21.
    - Loader thật, `run_feasibility`, chạy 1 case, fwd/bwd/reload.
    - Thử hội tụ cùng ngân sách cho cả 2 họ.
    - Đo bộ nhớ, thời gian, độ phân giải, độ dày biên.
  - **D22:** **ADR-ML-001 trước 10:00**, gồm quyết định frozen vs full DINOv2 theo PR-SCI-03 và số epoch lấy từ C1-6.
    - Leader đóng GATE-ML-01 lúc 12:00.
    - EXP-U-025 lúc 14:00, EXP-D-100 chạy qua đêm.
  - **D23:** module đánh giá + exporter Contract 2. Artifact thật đầu tiên giao Trung lúc 18:00.
  - **D24:** suy luận holdout ×6 (sau khi morphology đã đóng băng) → EXP-D-PP → 7 artifact trước 22:00.
  - **D25–26:** V3 (SCR-01, SCR-07) trên dữ liệu thật; gói thống kê cho RQ-A/RQ-B; chọn DEMO_CASE_001 theo luật khai trước.
- **Duyệt:** ingestion Contract 1/2 và SCR-08 của Trung.
- **Phụ thuộc:** GATE-SPLIT-01, DR-016, Hùng duyệt C1/ADR.
- **Bằng chứng:**
  - `preflight runnable: true`, `holdout_paths_resolved: 0`;
  - loss JSONL;
  - SHA-256 checkpoint trong manifest `08` §10;
  - bảng/biểu đồ **sinh từ metric đã lưu**;
  - **CI 95 % cho metric chính và cho hiệu cặp (DR-014)**;
  - báo cáo case lỗi với N dự kiến / N thành công.
  - Kết quả âm hoặc không kết luận **vẫn hợp lệ**.
- **KHÔNG làm:**
  - Không chạm holdout trước khi mọi checkpoint + morphology đã đóng băng; không đổi protocol sau khi thấy kết quả.
  - **Không merge #54 ở dạng hiện tại**: nó đổi hash `dataset_manifest.json` mà #35 đang ghim.
  - Không chọn case demo vì "đẹp"; không đưa dữ liệu/checkpoint vào Git.

### NGUYỄN GIA ĐỨC TRUNG — V4 · Backend / Lưu trữ / Nạp dữ liệu

- **Tình trạng:**
  - V4 đã có mô hình review/correction (#51) nhưng **chưa có màn hình**; SCR-08 mới có README.
  - Chồng #50 → #51 → #52 lên `main` tối nay, sau #48.
  - **Chưa có backend sản phẩm**, chỉ có stub Spike E.
  - Bạn là người duyệt then chốt của **#35 (split)**, **QA-004 Spike A** và **#44**.
- **Việc chính:**
  - **Tối nay 19:00–20:30: duyệt lại #35 ở head `7b72ce8`.**
    - Chạy `verify_subsets` + `preflight` trên blob.
    - Kiểm DR-002/2a/2b và hash nguồn `f64d461f`.
    - Sau đó chạy QA-004 nếu #41 và #49 đã merge.
  - **D21:** duyệt lại #44 lúc 10:00.
    - **Contract v1.0**, gồm:
      - DR-010a;
      - enum trạng thái review đúng FR-REV-001: NOT_REVIEWED / ACCEPTED / FLAGGED / CORRECTED + chuyển trạng thái (model #51 hiện dùng IN_PROGRESS/APPROVED, phải sửa);
      - cờ **case chỉ-suy-luận** (INT-12): cả 154 case đều có GT, nên cần 1 case holdout nạp mà **không kèm GT**.
    - **Backend Python (FastAPI + SQLite) trên Mac mini:** `/health`, study, cases, ảnh từng lát.
    - Nạp Contract 1 cho INTEGRATION_CASE_001.
  - **D22:** API đọc (mask, run, metric) và API ghi (review, **phiên bản mask đã sửa — bất biến**).
  - **D23–24:** SCR-06 (brush + lưu phiên bản mới, **checksum nguồn không đổi**) và SCR-08 Findings.
  - **D24–25:** nạp 7 artifact Contract 2; kiểm mạng **từ điện thoại** (S-5).
- **Duyệt:**
  - app shell (D22 tối, tối đa 2 giờ);
  - V3 (SCR-01/07);
  - exporter Contract 2 của Khánh;
  - Spike B `RESULT.md` (D22 08:00).
- **Phụ thuộc:** GATE-MOB-01 (D22) cho UI; quyền SSH Mac mini (DEP-06); artifact từ Khánh (D23+).
- **Bằng chứng:**
  - mọi response backend được kiểm với contract trong test;
  - validator Contract 1/2 PASS;
  - video brush sau zoom;
  - checksum mask gốc không đổi.
- **KHÔNG làm:**
  - Không làm đủ 28 endpoint, chỉ tập cần cho hero flow.
  - Không làm PR-AN-01 (chạy phân tích live): đó là SHOULD, hoãn.
  - Không mở rộng E9/E10 trước khi backend chạy (E10 đo ở S-8 D27).
  - Không viết fixture bằng tay.

---

## 17 · UPDATED PROMPTS FOR CHAT B / C / D / E

**Activation, staggered.** A (Project Control) stays continuous. **E: tonight** (the mandatory #35 QA). **C: tonight** (C1 support for Khánh). **D: tonight** (#41 conflict and merges; the app shell from D22). **B: D21 08:00** (TECH_STACK_ADR, DR-010a/005/008c, backend architecture). Each hands back to A with a short status block: done / evidence paths / decisions needed / risks.

### Chat B — Technical Architect

```text
ROLE: Technical Architect for the cardiac-mri-workspace project (repo D:\02_Research\cardiac-mri-workspace, main @454c526).
Today is Day 21 of 30 (Day 30 = 2026-10-09, fixed).

CURRENT BLOCKER: GATE-MOB-01 is OPEN and M2 is 14 days overdue. TECH_STACK_ADR.md does not exist on any ref.
No production mobile module may be created until it closes (09 §1.1). Three decisions are also open:
- DR-010a (no endpoint returns the worst-slice selection; blocks SCR-04 and the contract v1.0 freeze)
- DR-008c (mesh decimation budget within ±1 source slice)
- DR-005 (3D error representation; Spike F never started; RA-B01 is the only BLOCKER finding)

EXACT TASKS (in this order):
1. Draft management/adr/TECH_STACK_ADR.md. Stack: React Native / Expo SDK 57 (RN 0.86.3) app shell; a
   react-native-webview 13.x WebGL2 module for SCR-05; the framework-neutral app/core (PR #48) as the shared layer;
   a Python backend (FastAPI + SQLite + file artifact store) on the Mac mini M2 over ZeroTier per DR-003/003a/003b.
   Justify every line with Spike A evidence (A2–A11 on the Galaxy A17: A9 65.31/50.23 ms p95, A3–A7, S8 A8/A10/A11)
   and Spike B evidence (B10/B11 inside the RN WebView on the A17, #44; desktop B1–B4, B8, B14).
   List as explicit limitations: Spike A A1/A12 partial and the 64×64×16 fixture for A8/A10/A11; Spike B items still
   open at the time of drafting (B5, B6, B7, B9, B13, B15 — take their final state from Hùng's RESULT on D22 08:00).
   Record rejected alternatives (native Kotlin; a pure-web client) with reasons.
2. Contract v1.0 input note for Trung, with exact contract.json diffs:
   (a) DR-010a: recommend option (b) from OPEN_DECISIONS.md L1640-1688 (endpoint id, path, params, response schema);
   (b) the FR-REV-001 review-state enum NOT_REVIEWED/ACCEPTED/FLAGGED/CORRECTED plus allowed transitions — the #51
       model and the #50 generator currently use IN_PROGRESS/APPROVED;
   (c) an inference-only mode flag. All 154 cases carry ground truth (DATASET_AUDIT), so one non-demo holdout case
       must be ingested with GT withheld for PR-CASE-02/PR-MODE-01. This is a leader decision; give options.
3. A DR-005 Level-4 decision request: compress Spike F to candidate 3 (surface + FP/FN connected-component markers,
   each carrying a precomputed source-slice range) as primary and candidate 1 (TP/FP/FN meshes) as a desktop control.
   Keep F4, F5, F6 (±1 slice, never widened) and F7/F8 (device slot S-4 on D24). State the NEGATIVE_RESULT
   escalation. Name what PR-ERR-03 and PR-3D-05 acceptance still require.
4. Backend architecture note (1 page): the hero-flow subset of API Contract 11 (list endpoint ids), persistence tables,
   an immutable reviewed-mask versioning scheme (PR-PROV-01), artifact layout for Contract 1/2 ingestion, a /health
   check performed from the phone, and the DR-003 minimal fallback.

INPUTS: management/spikes/SPIKE_A_2D/RESULT.md (main plus PR #41/#49 heads), SPIKE_B_3D/TASK.md and PR #44 RESULT,
SPIKE_F_3D_ERROR/TASK.md, docs/specs/v1.0/09, 10, 11, 05; contracts/api/contract.json; app/README.md on PR #48;
management/readiness/OPEN_DECISIONS.md (DR-003*, DR-005, DR-008*, DR-010a, DR-015); management/DEMO_STANDARD.md.

BOUNDARIES: Do not edit docs/specs/v1.0/**. Do not close any gate or write "ACCEPTED". Do not compute any B, E or F
number (the owners' job; DR-006a). Do not write code under app/. Do not choose for the leader — give options,
a recommendation and evidence. No fabricated figures: write NOT MEASURED where the evidence is missing.

EXPECTED ARTIFACTS: one PR "docs(adr): TECH_STACK_ADR + DR-010a/DR-005 options + backend note", owner Phạm Tuấn Anh,
reviewers Vũ Hùng Anh and Nguyễn Gia Đức Trung, ready by D21 12:00.

HANDOFF TO A: a 10-line status (what is drafted, what depends on Hùng's D22 RESULT, the three decisions the leader
must sign at the D22 09:00–12:00 window).
```

### Chat C — ML / Imaging

```text
ROLE: ML / Imaging support for Bế Quốc Khánh (owner of Spike C0/C1, ML training/evaluation and V3) and Vũ Hùng Anh
(Imaging; GATE-IMG-01). Repo D:\02_Research\cardiac-mri-workspace. Day 20→21 of 30.

CURRENT BLOCKER: Zero real training runs have ever executed. SPIKE_C1 is 0/10 and BLOCKED on GATE-SPLIT-01
(PR #35 head 7b72ce8, no valid approval yet). The approved compute host (Khánh's RTX 4050 Laptop 6 GiB) was
unreachable on 09-24. The C1 prep harness exists only as local commit 8501906 (leader-authored), being pushed as a
PR for Khánh to adopt. Its pinned candidate hash ff1517d0…3ce0 is wrong (it hashes a CRLF+BOM PowerShell copy);
the committed blob is c5c65a09…396d.

EXACT TASKS:
1. Review the C1-prep PR (spikes/spike_c_ml/c1/{verify_subsets,preflight,forecast_matrix}.py). Fix the re-pin so it
   hashes git blob bytes. List what Khánh must re-run on his own host (H1–H11 in management/day15/C1_BRINGUP.md).
2. Pair-design (review, not replace) Khánh's C1 code: a real-data NRRD loader with DR-011 per-volume
   p0.5/p99.5 normalisation, resize to 560, fail-closed on non-training IDs; run_feasibility.py extending
   spikes/spike_c_ml/harness/pipeline_bringup.py with the probe.py UNet2D/DinoSeg models; measure_boundary.py.
   Follow C1_MEASUREMENT_PLAN.md §1, §3–§5 exactly.
3. Draft the ADR-ML-001 skeleton with every 07 §2 field mapped to a C1 artifact placeholder. Include a PR-SCI-03
   analysis of frozen vs full-finetune DINOv2 (equal treatment against UNet), the epoch basis from C1-6, the
   pre-declared OOM fallback, and the DR-007 remedy options (448 resolution / pair A) to be decided BEFORE the freeze.
4. A test plan for the evaluation module: case 3D Dice/IoU, per-slice Dice with both-empty = NOT_APPLICABLE (07 §6),
   FP/FN, relative volume error in VOXELS (no mm/mL — identity spacing), the failed-case protocol (intended vs
   successful N), and the primary and sensitivity (without CASE_0027) holdout slots. Plus known-answer fixtures.
5. For Hùng: a GATE-IMG-01 protocol — a pre-declared morphology grid evaluated on EXP-D-100 VALIDATION predictions
   only, a selection rule written before looking, and the freeze record.

INPUTS: management/spikes/SPIKE_C_ML/{TASK,RESULT,C1_MEASUREMENT_PLAN}.md; docs/specs/v1.0/07, 08; PR #35
(data/manifests/split_manifest_path_a_seed2024.json, SPLIT_RESULT.md); 8501906:management/day15/C1_BRINGUP.md;
spikes/spike_c_ml/harness/*.

BOUNDARIES: Ownership stays with Khánh (DR-013). Do not execute training, and do not touch the holdout. Do not run
C1 on an unapproved host unless the leader records DR-016. Do not edit SPIKE_C_ML/RESULT.md. Do not transition any
gate. Never type a measured number: every figure comes from machine output. A NEGATIVE_RESULT or inconclusive outcome
is valid (PR-SCI-03). Never tune or filter to favour DINOv2.

EXPECTED ARTIFACTS: review comments on Khánh's PRs; docs/ml/ADR-ML-001_DRAFT.md and docs/ml/EVAL_TEST_PLAN.md on
Khánh's branch (he commits); GATE-IMG-01 protocol on Hùng's branch.

HANDOFF TO A: C1 readiness (preflight runnable? GPU job started?), which C1 criteria are measured, the calendar
verdict inputs, and the exact decisions for the D22 12:00 GATE-ML-01 window.
```

### Chat D — Implementation (leader's own blocks: V1, integration/CI)

```text
ROLE: Implementation partner for Phạm Tuấn Anh on HIS blocks only: V1 (SCR-02 Case List, SCR-03 Case Explorer,
SCR-04 Error Inspector per DR-013a), the RN/Expo app shell, integration/CI.
Repo D:\02_Research\cardiac-mri-workspace, main @454c526.

CURRENT BLOCKER: No product code on main. app/core (#48) is approved and not merged. The stack #50→#51→#52 and V1 #53
wait behind it, and #53 was built on the old #50 head c731ab4. #41 conflicts in management/spikes/SPIKE_A_2D/RESULT.md.
GATE-MOB-01 closes D22 12:00; no framework code before that.

EXACT TASKS:
Tonight (D20):
 a) Merge support: after #49 lands, merge main into #41 and resolve RESULT.md by keeping main's A3–A8/A10/A11 rows
    and S6's A9 row. Push; do not force-push main.
 b) Rebase #53 onto #50's head (22876b0) and re-run CI. Do not self-approve.
D22 after GATE-MOB-01:
 c) Create app/mobile/ (Expo SDK 57, RN 0.86.3): screen registry and navigation for SCR-01..08; contract.json bundled
    as an asset; app/core wiring via transport.call(); fixture vs live mode switched by config only; a release-APK
    build script that records the build timestamp; a "how to add your screen" README. Integration-sensitive files
    (package.json, lockfile, app.json, navigation root) are owned by Tuấn only.
D23–D25:
 d) SCR-02/03 (slice viewer with zoom/pan via app/core viewMath, n/total, pred/GT overlays, run and variant always
    visible, mode badge, the 7 screen states), then SCR-04 (disagreement overlay, per-slice error, worst-slice jump
    from the API selection per DR-010a, a legend that is not colour-only, a GT-unavailable state).
 e) The daily smoke script for the 13 §11 flow.

INPUTS: app/README.md and app/core/** on PR #48; app/verticals/v1_case_explorer/** on #53; contracts/api/*;
spikes/spike_a_2d/app/* (copy only, with a provenance header — never import); docs/specs/v1.0/10, 11, 13;
management/DEMO_STANDARD.md §3–§4.

BOUNDARIES: Only Tuấn's blocks — never write V2/V3/V4/backend/ML code. No import from spikes/. No framework import
inside app/core. Every PR names its TC IDs and attaches D7 evidence (screenshots or recording) plus the command that
checks it. No handwritten fixtures. Nothing under docs/specs/v1.0/**. No destructive git commands; no branch
deletion without confirmation.

EXPECTED ARTIFACTS: PRs, each small (one screen state or one feature), with tests that run in CI.

HANDOFF TO A: per PR — number, head SHA, CI state, TC IDs advanced, what the device slot must check.
```

### Chat E — QA / Red Team

```text
ROLE: QA / Red Team (CHAT E). You are an LLM red-team session under the leader's account, NOT an independent human
reviewer; record yourself as such. Repo D:\02_Research\cardiac-mri-workspace.

CURRENT BLOCKER: GATE-SPLIT-01 needs mandatory QA on PR #35 (head 7b72ce8) after Trung's re-review, tonight.
Spike A acceptance step 3 is run by Trung (QA-004); you support it adversarially. Spike B and C1 evidence arrive
D22 08:00 and need raw-evidence QA before the leader's 12:00 decision window.

EXACT TASKS:
1. D20 20:30: QA_REVIEW_005 on #35. Re-derive from the committed blob, never from a PowerShell-redirected copy:
   80/20/54 disjoint partitions; effective subsets 20⊂38⊂78 by set containment; correlation groups = transitive
   components (union-find); CASE_0133/CASE_0117 absent from all training subsets; threshold r≥0.75 declared before
   training; source dataset hash f64d461f equals main; no validation/holdout path reachable from a training-only root.
   Attack the DR-002b limitation wording. Verdict PASS/REJECT with findings.
2. D21: an adversarial pass on QA-004 output for Spike A, checked against the raw files (not RESULT.md).
3. D22 08:00: QA on Spike B RESULT (B5–B15), recomputing from raw device logs + PROVENANCE, and on C1 RESULT
   (C1-1..10) from raw JSON/JSONL. Flag any number not traceable to machine output, any widened tolerance, any
   holdout access.
4. D23 onward: the daily regression and smoke check after each contract/app-core/backend merge; D26–D27 a
   TC-E2E-001 red-team (network cut, stale revision, GT-absent case, mask-variant substitution, raw overwrite
   attempt).
5. Hazard watch: PR #54 changes dataset_manifest.json SHA f64d461f→8174f4d8 while #35 pins f64d461f. Block any merge
   that changes a pinned provenance hash without a recorded decision.

INPUTS: PR #35 files, management/day06/QA_REVIEW_002_SPIKE_D.md, management/day09/QA_REVIEW_003_SPIKE_D_FINAL.md,
management/day10/qa004_spike_a/*, the Spike B and C1 raw evidence, docs/specs/v1.0/06, 08, 13.

BOUNDARIES: Read-only against the product code. Findings go into QA_REVIEW files. Do not merge, approve on GitHub,
transition gates or edit specs. Never mark an unmeasured criterion PASS.

EXPECTED ARTIFACTS: management/day20/QA_REVIEW_005_SPLIT.md, then one QA file per gate item, each with a PASS/REJECT
verdict, the commands used and the hashes.

HANDOFF TO A: verdict + blocking findings + what must change before the leader may close the gate.
```

---

## 18 · TOP 10 LEADER DECISIONS / ACTIONS REQUIRED

| # | Decision / action | By | Why it cannot wait |
|---|---|---|---|
| 1 | **DR-016 compute host(s).** Recommended: RTX 4050 primary (Khánh declares overnight availability tonight); **leader PC RTX 3050 Ti as approved host 2** after a memory re-probe, for C1 duplicate, inference and failover, and for a whole-family split if the 4050 is not continuous | **Tonight** | Nothing in M6 can start without a host; zero runs so far (T2) |
| 2 | **Merge the three approved PRs (#49, #48, #26) now, and adopt CP-07**: the author merges with a valid head approval + green CI; the leader merges only gate-critical/scientific PRs | **Tonight** | The merge click has been the bottleneck for 8 days |
| 3 | **Close GATE-SPLIT-01 tonight**: Trung re-reviews #35 at head → CHAT E QA → leader merges and records the gate | **Tonight 22:00** | It blocks C1 → ML → V3 → the result |
| 4 | **Formal §18 recovery record + close the Day-15 override + INC-003**: Levels 1–4; Level 5 for SHOULD/COULD only; **no MUST change**; ask members before recording the Days 16–19 gap | **Tonight** | Governance is currently silent on 9 lost days |
| 5 | **Spike A step 4** (accept with A1/A12 and the 64×64×16-fixture limitations recorded, or keep EVIDENCE_READY). **Contract v1.0 inputs**: DR-010a (option b), the FR-REV-001 review-state enum, and **an inference-only case** (INT-12; all 154 cases have GT). Then **GATE-MOB-01 + TECH_STACK_ADR** at the D22 09:00–12:00 window | D21 / **D22 12:00** | Every mobile screen waits on it; PR-CASE-02 and PR-MODE-01 cannot be shown without an inference-only case |
| 6 | **DR-005 via a compressed Spike F** (Level 4, candidate 3 + control 1, ±1 slice never widened) and **DR-008c** from Spike B B12/B13 | D22 (decide compression) / D24 18:30 (decide DR-005) | RA-B01 is the single BLOCKER; PR-ERR-03 and PR-3D-05 are MUST |
| 7 | **ADR-ML-001 / GATE-ML-01**, including **frozen vs full DINOv2 (PR-SCI-03)**, the epoch cap from C1-6, and any DR-007 remedy **before** the freeze | **D22 12:00** | After the freeze, no protocol change is allowed |
| 8 | **Remove the leader's serial steps**: Mac mini SSH (or a one-command deploy) for Trung (DEP-06); optional remote-ADB smoke for owners; two fixed daily decision windows (12:00, 21:30); control plane ≤ 45 min/day | Tonight / D21 | The leader is ~20 h over capacity (§8.1) |
| 9 | **Hold #54** (it changes the dataset-manifest hash that #35 pins) and **freeze `dataset_manifest.json` at `f64d461f` through Day 30**. **Defer all 6 SHOULD + 5 COULD** formally, and use precomputed runs labelled as such for PR-AN-01 | Tonight | Provenance integrity; scope firewall |
| 10 | **Record the buffer truth**: M9's "≥ 2 unspent buffer days" is **unachievable (RED)**. Day 29–30 are zero-float stabilization; code freeze D28 18:00; Day 30 stays fixed; no MUST removed. Confirm weekend D24–25 availability | Tonight | The plan must not pretend the old buffer exists |

---

## VERDICT: **DAY30 OUTCOME AT RISK**

**Why not RECOVERABLE.**
- **0/33 MUST are accepted**, and **no product code has ever been merged**: `app/` has 0 files on `main`, and the backend and mobile app do not exist.
- **Zero real training runs** have executed. Spike C1 is at 0/10 and its code is partly unwritten. The only approved GPU was unreachable on the last recorded day, with no remote path.
- All three gating decisions are still open: **GATE-SPLIT-01** (15 days, no valid approval on its PR), **GATE-ML-01**, and **GATE-MOB-01** (14 days overdue, with 6 Spike B criteria unmeasured). Spike F / DR-005, the single BLOCKER finding, has never started.
- **Nine calendar days (Day 11–19) produced no merge that moved the critical path**, and four of them (16–19) produced nothing at all.
- The Days 28–30 buffer is gone. What remains is Day 29–30 of zero-float stabilization.
- Team demand (≈ 203 focused hours) exceeds capacity (≈ 175) even at full four-person availability, including the weekend.

**Why not already lost.**
- The blocking artifacts **exist and are nearly mergeable**: the split (#35, 18/18 structural checks), app/core (#48, approved), the V4 model (#51), the V1 model (#53), and the Spike A/B device evidence.
- The C0 arithmetic says the matrix fits in **~19 GPU-hours (pair B, 50 epochs)** once a host runs.
- The dataset and pinned models are present on a second GPU.
- Contracts and CI exist, and app/core already enforces the honesty rules (states, comparability, never-rank).

**What moves it to RECOVERABLE.** All five must hold **by 2026-09-30 17:00** (the §15 checkpoint):
1. GATE-SPLIT-01 CLOSED.
2. A C1 GPU job running on an approved host.
3. SPIKE_A ACCEPTED and #48–#53 on `main`.
4. All four members active, with availability declared through D30.
5. The backend `/health` answering from the phone.

**What moves it to "cannot deliver every MUST".** Any of these:
- No GPU running by **D21 14:00** (T2).
- GATE-MOB-01 not closed by **D22 18:00** (T11).
- The six raw runs not done by **D25 12:00** (T4).

At that point the leader must open a formal MUST-deviation Decision Request (§10 option D / §14). **No MUST is removed silently.**
