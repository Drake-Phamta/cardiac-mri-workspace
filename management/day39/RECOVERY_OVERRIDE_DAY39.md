# RECOVERY OVERRIDE — DAY 39 (2026-10-18)

**Status:** ACTIVE
**Effective:** 2026-10-18 06:45 +07:00
**Expires:** automatically at 23:59 +07:00 on 2026-10-18. No renewal by silence.
**Authorised by:** Phạm Tuấn Anh — Team Leader (decisions taken in session, 2026-10-18 06:40, recorded below)
**Recorded by:** Project Control (the leader's Claude session)
**Scope:** 2026-10-18 only. This is the single exception record for the day.

---

## 1 · Why

Day 1 was 2026-09-10. The original Day 30 (2026-10-09) has passed. Today is calendar day 39.

| Fact (verified 2026-10-18 06:35 against the repository) | Value |
|---|---|
| Last change on `main` before today | 2026-10-01 22:04 (`6eecb5e`, #84) |
| Team activity on the repository, 2026-10-02 → 2026-10-17 | #90 (Bế Quốc Khánh, 2026-10-04, owner revalidation); approvals on #85, #86, #89 (Vũ Hùng Anh, 2026-10-02). Nothing else |
| Gates | GATE-DATA-01, GATE-SPLIT-01, GATE-ML-01, GATE-MOB-01 closed; **GATE-IMG-01 open** |
| ML runs | DINOv2 family complete: EXP-D-025, EXP-D-050, EXP-D-100 (50 epochs each, 2026-10-02 05:44). UNet family not started |
| Holdout | never predicted, never scored |
| Real numbers in the app | none: the backend has 0 analysis runs |

The leader set a **new acceptance date: 2026-10-31**, for the course acceptance and the presentations. The leader
asked that today everything that fell behind is completed and brought up to date, so that the team can resume
normal work tomorrow (2026-10-19), with one exception: **training stays with Bế Quốc Khánh** (the UNet family).

## 2 · Rules waived, for 2026-10-18 only

The same four waivers as `management/day22/RECOVERY_OVERRIDE_DAY22.md` §2:

1. The leader's session (with Claude agents under the leader's account) may implement, fix, rebase, resolve
   conflicts, run measurements and write evidence inside **any** technical block, **except training**.
2. The human secondary review before merge is replaced by an **independent QA pass**: an LLM QA agent, recorded as
   such and never as a human reviewer, plus green CI.
3. Review serialization and the normal WIP limits.
4. The rule that the leader may not execute another member's implementation work.

**This is recovery support, not a transfer of ownership.** `DR-013` ownership returns in full on 2026-10-19.
Every item done in someone else's block is listed in the revalidation file for that owner to review, adopt or
reject. Work on V2 and V4 screens is limited to **working skeletons**; each owner completes, measures and defends
their own function (PR-MOBILE-03, TC-TEAM-001).

## 3 · Rules NOT waived

- No fabricated measurement: what is not measured is `NOT MEASURED`.
- Owner-authored items stay owner-authored: **B15** (Vũ Hùng Anh), each member's TC-TEAM-001 text, the Spike C1
  reviewer verdict. Nothing is written in their name.
- `RawPrediction` and ground truth are immutable. No dataset, checkpoint or per-case value in git.
- `docs/specs/v1.0/**` stays frozen. CI is not bypassed.
- A null or negative result is valid (`PR-SCI-03`). Nothing is tuned to favour DINOv2 or the post-processing.
- **The holdout is touched only under §4 below, after the GATE-IMG-01 record is on `main`.**
- No destructive operation: no branch deletion, no force-push to `main`.

## 4 · Decisions taken by the leader on 2026-10-18

| ID | Decision |
|---|---|
| **Override** | This record (§2, §3) |
| **Acceptance date** | 2026-10-31. The plan from 2026-10-19 is rebuilt on it |
| **GATE-IMG-01** | Opened today under the pre-declared rule below. The leader authorises holdout inference and evaluation, **once**, for the three trained DINOv2 runs and for EXP-D-PP derived from EXP-D-100 |
| **UNet family** | Stays with Bế Quốc Khánh (DR-016a still applies). Nothing in this record trains a model |

### Pre-declared rule for GATE-IMG-01 (written before any candidate was evaluated)

**Source evidence:** the RAW validation predictions of **EXP-D-100** (20 validation cases, `best.pt`), already on
disk since 2026-10-02. No other run, no training case and no holdout case is used.

**Candidate set (closed):** every candidate takes the raw binary mask volume (z = slice axis) and is deterministic.

| ID | Operations, in order |
|---|---|
| PP-0 | identity (the raw mask). Reference only, **not eligible** |
| PP-1 | keep the largest 3D connected component (26-connectivity) |
| PP-2 | per-slice 2D hole filling, then PP-1 |
| PP-3 | 3D binary closing, 3×3×3 cube, 1 iteration, then PP-1 |
| PP-4 | 3D binary opening, 3×3×3 cube, 1 iteration, then PP-1 |
| PP-5 | 3D binary closing (as PP-3), then per-slice 2D hole filling, then PP-1 |

An empty mask stays empty under every candidate.

**Selection:** the candidate with the highest **mean 3D Dice over the 20 validation cases**, computed with the
same metric code and semantics as `ml/evaluate.py` (`ml-eval-1.0.0`). A tie within 0.001 goes to the lower ID
(fewer operations). The winner is frozen **whether or not it beats PP-0**; the report states the change against
PP-0 (improves, worsens or unchanged — `07` §5).

**Freeze:** the winner is written as a JSON config (operations, order, structuring element, connectivity, code
version). Its sha256 is the `postprocessing_config_sha256` of the authorization record.

**Order of events, each a commit on `main`:**
1. the post-processing code and its tests;
2. the selection table on validation, the frozen config and its sha256, and the GATE-IMG-01 decision record;
3. the `ml-holdout-authorization/1` record: runs EXP-D-025, EXP-D-050, EXP-D-100 with their `best.pt` sha256,
   and the frozen config sha256;
4. only then: holdout inference (`best.pt`), EXP-D-PP derived from EXP-D-100's raw holdout predictions with the
   frozen config, evaluation, Contract 2 export, backend ingest.

**Once:** each run's holdout is predicted and scored once. A crash may be rerun with the identical command; that
rerun is recorded. No number seen on the holdout changes a config, a threshold, a checkpoint or a rule.

## 5 · Lanes today

Sequential, at most two agents at a time (the leader asked to protect the session quota). Agents run on Sonnet.

1. Merge the approved PRs (#85, #86); LLM QA, then merge #87 → #88 → #89 and #90.
2. Post-processing + GATE-IMG-01 selection (owner Bế Quốc Khánh) ‖ DR-017 and DR-018 in contracts, backend and the
   exporter (owners Nguyễn Gia Đức Trung, Bế Quốc Khánh).
3. Holdout pipeline, Contract 2 packages, backend deploy, end-to-end check through the API and the app.
4. Working skeletons for V2 SCR-05 (owner Vũ Hùng Anh) and V4 SCR-06/08 (#72, owner Nguyễn Gia Đức Trung), if the
   day allows.
5. The plan to 2026-10-31, the 2026-10-19 package and the board.

## 6 · Actions taken under this override

| Time | Item | Action | Evidence | Normal step waived | Owner to revalidate |
|---|---|---|---|---|---|
| 06:40 | — | Leader's decisions (§4) | this file | — | — |
| 06:43 | #85 Day 23 decisions | **Normal merge**: APPROVED by Vũ Hùng Anh on head `e8de065`, CI green | `ed7ea15` | none | — |
| 06:43 | #86 V1 fixes | **Normal merge**: APPROVED by Vũ Hùng Anh on head `6d98d72`, CI green | `e3417ba` | none | — |
| 06:51 | #91 this record | **Override merge** of the leader's own record | `c7608c5` | secondary review | Nguyễn Gia Đức Trung |
| 07:00 | #87 mobile CI job, IPv4 scan | **Override merge**: LLM QA `QA_PR87_D39` MERGE at `9bf8038`, CI 11/11 | `2156d24` | secondary review | Vũ Hùng Anh, Nguyễn Gia Đức Trung |
| 07:01 | #88 mobile navigation and data fixes | **Override merge**: LLM QA `QA_PR88_D39` MERGE at `404a805`, CI 11/11 | `b719cb1` | secondary review | Vũ Hùng Anh, Nguyễn Gia Đức Trung |
| 07:01 | #89 A9 / TC-PERF-001 script | **Normal merge**: APPROVED by Vũ Hùng Anh on head `eabcf26` | `7acc260` | none | — |
| 07:01 | #90 Khánh revalidation, V3 fixes | **Override merge**: LLM QA `QA_PR90_D39` MERGE at `b1529dc`, CI 10/10 | `66a428c` | secondary review | Bế Quốc Khánh (author) |
| 07:05 | GATE-IMG-01 selection | Rule of §4 run on EXP-D-100 validation: **PP-4** wins, +0.0218 mean Dice over raw; config frozen. LLM QA `QA_PR92_D39` recomputed the table independently, bit for bit | #92, `management/day39/gate_img_01/SELECTION.md` | secondary review | Bế Quốc Khánh |
| 07:15 | **GATE-IMG-01 CLOSED** | Decision record and the `ml-holdout-authorization/1` record (EXP-D-025, -050, -100, EXP-D-PP), validated with `ml.holdout` | `management/day39/GATE_IMG_01_DECISION.md` | not pre-authorised: leader decision in session | Bế Quốc Khánh |
| 07:22–07:36 | Holdout, once | RAW inference EXP-D-100/050/025 (54/54 each), EXP-D-PP derived with PP-4, four evaluations, four paired comparisons, four Contract 2 exports (`validate_contract2: PASS`) | logs `cardiac-runs/_holdout_d39/` (outside git) | — | Bế Quốc Khánh |
| 07:46 | #94 DR-017, DR-018 validator, N-7, DR-022 | **Override merge**: LLM QA `QA_PR94_D39` MERGE, validator PASS on the four real packages | `01bed7b` | secondary review | Nguyễn Gia Đức Trung; DR-022: Phạm Tuấn Anh confirms |
| 07:52 | #95 API hero-flow E2E | **Override merge**: LLM QA `QA_PR95_D39` MERGE; real run 20 PASS / 0 FAIL / 3 SKIP | `17b07e5` | secondary review | Nguyễn Gia Đức Trung |
| 07:54 | #96 holdout results | **Override merge**: LLM QA `QA_PR96_D39` MERGE, every number verified; wording notes applied | `e3e06d9` | secondary review | Bế Quốc Khánh |
| 08:46 | #98 V2 SCR-05 skeleton, L0 meshes, deploy packs backend/mesh | **Override merge**: LLM QA `QA_PR98_D39` MERGE AFTER FIXES; B-1 fixed in `f64fc7b`; E2E 22 PASS / 0 FAIL / 1 SKIP | `a3bc595` | secondary review; owner-built skeleton | Vũ Hùng Anh |
| 08:56 | Mac mini deploy | From `main` `a3bc595`: data cache 74 cases (DR-022, record `dea2327f…`), the four packages and 289 derived meshes copied to the host data dir; `/health` 74 cases, 4 experiments, 216 runs, 0 rejected. E2E `--no-writes` from the PC over the overlay: 20 PASS / 0 FAIL / 3 SKIP | deploy log and E2E output outside git | owner-run deploy | Nguyễn Gia Đức Trung |
| 09:22 | #99 V4 SCR-06/SCR-08 on the current shell, QA-063 N-1..N-4 | **Override merge**: ported from draft #72 (pre-#77 shell); LLM QA `QA_PR99_D39` MERGE, 24/27 mutations killed; NB-1 fixed in `f086cd1` | `fe74e06` | secondary review; owner-built skeleton | Nguyễn Gia Đức Trung |
