# RECOVERY OVERRIDE — DAY 22

**Status:** ACTIVE
**Effective:** 2026-10-01 10:40 +07:00
**Expires:** automatically at 23:59 +07:00 on 2026-10-01 (end of Day 22). No renewal by silence.
**Authorised by:** Phạm Tuấn Anh — Team Leader (decisions taken 2026-10-01 ~10:30, recorded below)
**Recorded by:** Project Control
**Scope:** Day 22 only. This is the single exception record for the day.

---

## 1 · Why

Day 1 = 2026-09-10, Day 30 = 2026-10-09, fixed. Today is **Day 22 of 30**.

| Fact (verified 2026-10-01 10:05 against the repository) | Value |
|---|---|
| Repository activity since the Day 20 board (2026-09-29 22:00) | **none** — Day 21 was lost entirely |
| MUST requirements accepted | 0 / 33 |
| Product code on `main` before today | none (`app/core` merged this morning, #48) |
| Real ML training runs ever executed | 0 |
| Gates open | GATE-SPLIT-01, GATE-ML-01, GATE-IMG-01, GATE-MOB-01 |
| Team availability | all four members start again on Day 23 |

The leader asked for the whole project — not only the gates — to be pulled back onto the trajectory of
`management/day20/DAY20_REBASELINE.md` §7 today, working across every block, and for a Day 23 plan the team
can pick up in the morning.

---

## 2 · Rules waived, for Day 22 only

1. Owner-only execution boundaries: the leader (with Claude agents operating under his account) may implement,
   fix, rebase, resolve conflicts, run measurements and write evidence inside **any** technical block.
2. Mandatory human secondary review before merge: replaced by an **independent QA pass** (CHAT E — an LLM
   red-team session under the leader's account, recorded as such, not as a human reviewer) plus CI.
3. Review serialization and normal WIP limits.
4. The rule that the leader may not execute another member's implementation work.

**This is RECOVERY SUPPORT. It is not a transfer of ownership.** `DR-013` ownership returns in full on Day 23.
Every item done in someone else's block is listed in `POST_RECOVERY_REVALIDATION_DAY23.md` for that owner to
review, adopt or reject. Work on the verticals V2/V3/V4 is limited to **working skeletons**: each owner completes,
measures and defends their own function (PR-MOBILE-03, TC-TEAM-001), and the evidence package records which
parts were built under this override.

## 3 · Rules NOT waived

- No fabricated measurement; an unmeasured criterion is `NOT MEASURED`, never PASS.
- No data leakage. The 54-case final holdout is not touched today. Spike C1 uses only an internal fold of the
  20-case training subset; the 20-case validation partition is used only for checkpoint selection.
- `RawPrediction` and ground-truth immutability; no dataset or checkpoint bytes in git.
- `docs/specs/v1.0/**` stays frozen. CI and test failures are not bypassed.
- A null or negative result is valid (`PR-SCI-03`); nothing is tuned or filtered to favour DINOv2.
- No destructive operations: no branch deletion, no force-push to `main`; any deletion needs the leader's
  explicit confirmation.
- Every action is auditable: a commit, a PR or a log file, listed in §6.
- **A gate closes only when the evidence supports it** — under the pre-declared rules of §4, never on schedule.

## 4 · Decisions taken by the leader on 2026-10-01

| ID | Decision |
|---|---|
| **DR-016** | ML compute: the leader's PC (RTX 3050 Ti Laptop, 4 GiB) is an approved compute host from today, alongside Bế Quốc Khánh's RTX 4050 Laptop (6 GiB). Each model family trains entirely on one host: the DINOv2 family on the leader's PC from tonight; the UNet family on the RTX 4050 from Day 23 (if the RTX 4050 is not running by Day 23 12:00, the UNet family follows on the leader's PC). Library versions are recorded per host; the cross-machine tolerance pinned in the C1 plan applies. |
| **Gate delegation** | The leader pre-authorises the gate transitions below **when an independent QA pass is PASS and the stated rule holds**. Each transition is recorded as "pre-authorised by the leader on 2026-10-01". If a rule does not hold, the gate stays open and the leader is asked. |
| **DR-010a** | Option (b): `analysis_run_metrics` carries a `worst_slice_selection` block (`rule_id`, `selection_version`, `slices[{slice_index, dice, false_positives, false_negatives}]`). The client never ranks (DR-010). |
| **INT-12** | Inference-only case for PR-CASE-02 / PR-MODE-01: the lowest-numbered `final_holdout` case other than CASE_0027, chosen by this rule before any metric exists. The app withholds its ground truth; the evaluation population is unchanged. |
| **Review states** | FR-REV-001's four states — NOT_REVIEWED, ACCEPTED, FLAGGED, CORRECTED — in the API contract v1.0 and the V4 client model. |
| **#54** | Held. It changes the hash of `data/manifests/dataset_manifest.json` that the split manifest pins; the dataset manifest stays frozen at `f64d461f` through Day 30. |
| **CP-07** (from Day 23) | The author merges a PR once an approval exists on its head SHA from the named reviewer and CI is green. Split, C1, ADR-ML-001 and gate-record PRs are merged by the leader after QA. |
| **Layout** | Product mobile app at top-level `mobile/`, backend at `backend/`, ML pipeline at `ml/` (spec `09` §8). `app/core` stays framework-neutral. |

### Pre-declared gate rules

| Gate | Closes when |
|---|---|
| **GATE-SPLIT-01** | QA PASS on the committed blob of #35 at `7b72ce8`: structural invariants recomputed (partitions, nested effective subsets 20⊂38⊂78 by set containment, exclusions, transitive groups), source dataset-manifest hash equal to `main`, DR-002/002a/002b fields present, no per-pair scores published. `06` §6 recorded as deviated with the documented exception of DR-002b. |
| **Spike A ACCEPTED** | QA-004 PASS on the raw evidence. Limitations recorded: A1 and A12 partial; A8/A10/A11 measured on the 64×64×16 fixture. |
| **GATE-MOB-01** (closed early, ~12:00) | Spike A ACCEPTED **and** the framework evidence of Spike B already on record: B10/B11 PASS inside a WebView of the React Native app on the A17 (#44); B1–B4, B8, B14 diagnostic PASS. `TECH_STACK_ADR.md` records the choice. B5/B6/B7/B9/B12/B13 become **V2 acceptance conditions**, measured tonight (slot S-1). If B5 fails at every decimation level (`NEGATIVE_RESULT`), only the 3D-module part of the ADR is reopened; the React Native choice for 2D stands. |
| **Spike B ACCEPTED + DR-008c** | After S-1: B5 ≤ ±1 source slice; B6, B7, B9 pass; B10 ≥ 20 FPS median and B11 pass at the chosen level; B12 table with ≥ 3 levels. DR-008c = the fastest level whose B5 ≤ ±1 slice. B15 (owner's development-cost note) is added by Vũ Hùng Anh before Day 23 10:00 — recorded exception. |
| **GATE-ML-01 + ADR-ML-001** | C1-1…C1-10 each backed by machine evidence; QA PASS; both families converge (decreasing loss, no NaN/Inf). A family that does not converge is a `NEGATIVE_RESULT`; the gate stays open and the leader is asked. |

### Pre-declared training recipe (ADR-ML-001), fixed before any C1 result

- Families, both fully trainable (`PR-SCI-03` equal treatment): `UNet2D(base=32, depth=4)` from scratch;
  `DinoSeg(facebook/dinov2-small @ ed25f3a, decoder=progressive, mode=full)`.
- 2D slices at 560×560, all 88 slices per case; DR-011 per-volume p0.5/p99.5 normalisation; image bilinear,
  mask nearest resize; predictions resized back to native resolution before thresholding; no augmentation
  (recorded as a limitation).
- Loss 0.5·BCE-with-logits + 0.5·soft Dice; AdamW, lr 1e-4 constant; bf16; seed 2024; threshold 0.5.
- Batch: the largest of {8, 4, 2} at which both families fit on the RTX 3050 Ti (C1-1).
- Epochs: one value E for all six runs, E = min(50, the largest E for which the queue on the two hosts finishes
  by Day 24 12:00 at the C1-2 measured speed). If E < 10 at 560, DR-007 applies before the freeze: both families
  move to 448.
- Checkpoint selection: best mean validation 3D Dice (20 validation cases), evaluated every epoch. The holdout is
  predicted only after GATE-IMG-01 has frozen the morphology configuration.

## 5 · Lanes today

The main session (leader account) runs the records, merges, gates, Spike C1 on the GPU, the training launch and
the device session. Agents under the same account work in separate worktrees and open PRs only:
A1 `ml/` pipeline (owner Khánh) · A2 `mobile/` shell + V1 (owner Tuấn) · A3 contract v1.0 + `backend/` (owner
Trung) · A4 Spike B residuals + `backend/mesh/` (owner Hùng) · A5 V4 skeleton (owner Trung) · A6 V3 skeleton
(owner Khánh) · CHAT E independent QA.

## 6 · Actions taken under this override

Filled in as the day proceeds. Every row is carried into `POST_RECOVERY_REVALIDATION_DAY23.md`.

| Time | Item | Action | Evidence | Normal step waived | Owner to revalidate |
|---|---|---|---|---|---|
| 10:40 | — | Override recorded; agents A1–A6 and QA started | this file | — | — |
| 10:47 | #48 app/core | Normal merge (approval by TrungNGD195 on head `6afe4ab`) | `ad908a4` | none | — |
| 10:47 | #49 Spike A S8 | Normal merge (approval by TrungNGD195 on head `a970167`) | `34f5097` | none | — |
| 10:47 | #26 Spike E | Normal merge (approval by scalliontor on head `373dea1`) | `21b3e87` | none | — |

## 7 · Post-recovery validation

On Day 23 the normal workflow resumes in full; owners receive their blocks back; reviewers retrospectively
validate today's override merges; defects are fixed forward, not reverted by default; no ownership change persists.

## 8 · Authorisation

> I authorise this one-day recovery override for Day 22, 2026-10-01, on the terms above, including the compute
> host (DR-016), the device session tonight, and the pre-declared gate rules. It expires at the end of today.
> Ownership under DR-013 is unchanged and returns in full on Day 23.
>
> — Phạm Tuấn Anh, Team Leader (given in session, 2026-10-01 ~10:30)
