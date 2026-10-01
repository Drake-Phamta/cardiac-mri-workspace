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
| 10:50 | #58 this record | **Override merge**: the leader's own docs PR, merged without a second review | `18a9931` | secondary review | Nguyễn Gia Đức Trung (reads §1–§5 on D23) |
| 10:51 | #50 API fixture scenarios | **Override merge**: leader approval on head `22876b0`, but the PR's CI did not re-run after the retarget to `main`; main's CI after the merge was the regression gate (8/8 green) | `8782517` | pre-merge CI on the final base | Nguyễn Gia Đức Trung |
| 10:51 | #51 V4 review model | Normal merge (leader approval on head `8350ab7`; the author is Trung) | `4699467` | none | — |
| 10:51 | #52 V4 TC-TEAM-001 draft | Normal merge (leader approval on head `9c50ff3`, a pure rebase of the approved `f30afd6`) | `665b5b0` | none | — |
| 10:52 | #33 E9 drill | Normal merge (scalliontor and the leader both approved head `bf86a74`) | `771ddb3` | none | — |
| 11:16 | #35 Path A split | **Override merge**: Trung's approval was on `dc26b35`, before the rebase; QA-005 PASS on head `7b72ce8` replaced the re-review | `f5aa763`; `management/day22/QA_REVIEW_005_SPLIT.md` | secondary re-review after the rebase | Nguyễn Gia Đức Trung (re-review), Bế Quốc Khánh (N-1, N-3–N-6) |
| 11:16 | GATE-SPLIT-01 | **CLOSED** under the pre-declared rule of §4: QA-005 PASS, source hash `f64d461f` equals `main`, DR-002/2a/2b fields present, no per-pair score in the PR's tree. 06 §6 is deviated with the documented exception of DR-002b | `PROJECT_STATE.yaml` gates; QA-005 | reviewer-led gate review | Phạm Tuấn Anh (N-2, N-7 decisions) |
| 11:31 | #41 Spike A S6 | **Override merge**: approvals were on `741f826`; the merge with `main` (`f853b59`) and a text fix (`d0225d1`) came after. CHAT E checked the conflict resolution byte for byte and re-verified the fix | `a524b25` | re-review after the merge and the fix | Vũ Hùng Anh |
| 11:31 | #44 Spike B B10/B11 | **Override merge**: Trung's CHANGES_REQUESTED was addressed but never re-reviewed. CHAT E re-derived all 5,400 frame intervals; its one blocker, the owner's stale TC-TEAM-001 rows, was fixed by the leader's session in `b0ae3e5` | `8a94172` | secondary re-review; owner-authored evidence (edited by the leader) | Nguyễn Gia Đức Trung (re-review), Vũ Hùng Anh (confirms the TC-TEAM-001 edit) |
| 11:38 | #67 GATE-SPLIT-01 record | **Override merge**: the leader's own record PR (QA-005 file, state, the morning's rows) | `44350d4` | secondary review | Nguyễn Gia Đức Trung |
| 12:03 | #60 `ml/` data and models | **Override merge, squash**: CHAT E r1 REJECT (B1 autocast, B2 paths), r2 MERGE at `6381475`. Squashed because an early commit carried a machine path | `b606295` | secondary review | Bế Quốc Khánh |
| 12:07 | #59 C1 preflight | **Override merge**: CHAT E r1 DO NOT MERGE, re-verified MERGE at `92dd1a9` | `0c3f847` | secondary review | Bế Quốc Khánh |
| 12:07 | #53 V1 SCR-03 model | **Override merge**: CHAT E r1 DO NOT MERGE, re-verified MERGE at `4729c34` | `6b52628` | secondary review | Phạm Tuấn Anh (owner); Nguyễn Gia Đức Trung (re-review) |
| 12:26 | #64 `ml/evaluate`, Contract 2 export | **Override merge, squash**: CHAT E MERGE AFTER FIXES (B-1 run split copy vs frozen sha), r2 MERGE at `5cdd92a` | `440dab1` | secondary review | Bế Quốc Khánh |
| 12:49 | #66 Spike B real-mesh frontier | **Override merge, squash**: CHAT E MERGE AFTER FIXES (B-1 mechanism and buckets, B-2 per-file hash, F5), fixes at `654e3bc` re-checked | `e5ccd38` | secondary review; owner-authored evidence (built by agent A4) | Vũ Hùng Anh |
| 12:53 | #62 API contract v1.0 | **Override merge**: CHAT E stack verdict MERGE (#62 → #68 → #71) | `dbee96d` | secondary review | Nguyễn Gia Đức Trung |
| 12:54 | #68 backend (FastAPI + SQLite) | **Override merge, squash**: CHAT E r2 DO NOT MERGE (X1 CI, X2 machine paths, X3 L4 summarizer), fixed by the restack and A3's commits; squashed because early commits carried paths and an address | `9ba01e8` | secondary review | Nguyễn Gia Đức Trung |
| 12:56 | #71 API contract 1.1.0 | **Override merge, squash** after the leader's rebase onto `9ba01e8` (range-diff identical): the #62 QA fixes B1/B2 | `a7b4950` | secondary review | Nguyễn Gia Đức Trung |
| 12:57 | #76 | Closed, not merged; the branch is kept. Its two guards are carried to Day 23 | — | — | Phạm Tuấn Anh |
| 12:59 | Backend deploy | Mac mini, from `main` `a7b4950`: `/health` contract 1.1.0, 21 cases (20 EVALUATION + 1 INFERENCE_REVIEW), 0 runs, bound to the overlay address only | deploy log (outside git) | owner-run deploy | Nguyễn Gia Đức Trung |
| 14:05 | #70 `ml/` train, queue, infer | **Override merge, squash**: CHAT E MERGE AFTER FIXES (B-1 squash for a path in `ef691cb`, B-2 pin the frozen split sha in `ml.train`) | `2f62923` | secondary review | Bế Quốc Khánh |
| 14:23 | #80 V1 no-run case | **Override merge**: CHAT E MERGE at `3647f2e`; decision (b) | `c7a37e0` | secondary review | Phạm Tuấn Anh (owner); Nguyễn Gia Đức Trung (re-review) |
| 14:30 | **GATE-ML-01** | **CLOSED** under the pre-declared rule of §4: C1 QA PASS WITH NOTES, C1-1…C1-10 with machine evidence, both families converge. ADR-ML-001 ACCEPTED (560, batch 8, E = 50); SPIKE_C1 ACCEPTED under the override | `PROJECT_STATE.yaml` gates; `QA_REVIEW_C1_GATE_ML_01.md` | reviewer APPROVE (SPIKE_C1) | Vũ Hùng Anh (reviewer of C1), Bế Quốc Khánh (owner) |
| 14:30 | DINOv2 queue | Started on the leader's PC (DR-016) from `main` `c7a37e0`: EXP-D-025 → EXP-D-100 → EXP-D-050, E = 50, batch 8 | run logs (outside git) | owner runs his family | Bế Quốc Khánh |
| 14:45 | #79 Spike C1 result | **Override merge**: CHAT E PASS WITH NOTES on `94eb343`; `25a7f0d` applies the text findings and records the gate (not re-reviewed). DR-016a recorded | `3c02fd2` | secondary review | Bế Quốc Khánh; Vũ Hùng Anh; Phạm Tuấn Anh confirms DR-016a |
| 15:01 | #63 V4 review, brush and findings model | **Override merge**: CHAT E QA-063 MERGE at `d801606` (8/8 checks, 8/8 mutations killed). Built by agent A5 in Trung's block | `254044a`; `management/day22/qa/QA_PR63_V4_MODEL.md` | secondary review | Nguyễn Gia Đức Trung (N-1…N-5, N-7; N-4 before #72) |
| 15:06 | #75 backend metrics (backend PR 3) | **Override merge**: CHAT E QA-075 MERGE · REDEPLOY OK at `6b610bd`. **Data gate N-1:** no real Contract 2 package on the host until the INT-12 cohort arithmetic (N-a) is decided and implemented | `985c9c3`; `management/day22/qa/QA_PR75_BACKEND_METRICS.md` | secondary review | Nguyễn Gia Đức Trung; Phạm Tuấn Anh decides N-a |
| 15:07 | Backend redeploy | Mac mini, `-SkipData`, from a clean worktree at `985c9c3`: `/health` contract 1.1.0, 21 cases, 0 experiments, 0 runs, no rejected package; the new `metrics.py` is on the host | deploy log (outside git) | owner-run deploy | Nguyễn Gia Đức Trung |
| 15:14 | #61 V3 study and comparison models | **Override merge**: CHAT E QA-61 (B-1…B-3) → QA-61b (B-4, new) → QA-61c MERGE at `279d0aa`. The B-4 fix (an outlier naming a non-SUCCEEDED or INT-12 case is refused whole) was written by the leader's session | `d6441bc`; `management/day22/qa/QA_PR61_*` | secondary review | Bế Quốc Khánh |
| 15:25 | #74 backend mesh pipeline for V2 | **Override merge**: CHAT E QA-074 MERGE at `ceb9196` (L0 pick = exact DDA on 34,672 rays). The PR's CI predates the Python 3.9 backend job; main's push run is the gate. No endpoint may use it before N-2, N-4, N-5 | `be86cb1`; `management/day22/qa/QA_PR74_REVIEW.md` | secondary review | Vũ Hùng Anh |
| 17:15 | EXP-D-025 complete | 50 epochs, best epoch 32; validation pipeline (infer, then evaluate, 20/20) ran in the queue; the end-to-end Contract 2 → backend proof passed locally (non-contract validation probe) | run logs, `day22/qa/E2E_PROOF_EXP_D_025.md` | — | Bế Quốc Khánh |
| 17:23 | #81 ML holdout guardrails | **Override merge**: CHAT E QA-081 MERGE at `2da8600` (R-1, N-1, N-2 of the #64 QA closed; 207/207 ML tests; `ml/train.py`, `data.py`, `models.py` untouched per DR-016a). Built by agent A1b in Khánh's block | `d907240`; `management/day22/qa/QA_PR81_REVIEW.md` | secondary review | Bế Quốc Khánh |
| 19:00–19:20 | S-1 Spike B device session | Operator Phạm Tuấn Anh (the only person who touched the phone); PC side by the leader's session. 5 levels × 3 runs. Extractor: only L0 passes B6 on the device; L0 passes B10/B11, B7, B9. Both evidence paths agree 5,678/5,678 | session folder outside git; PR #73 | owner-run measurement (the owner designs and interprets) | Vũ Hùng Anh (B15, DR-008c) |
| 19:26 | L4 attempt 1 | The live APK (`0bfaba3`) crashed at start on Hermes: `RangeError: Unknown encoding: latin1` from fast-png. Not measured | crash log outside git | — | Phạm Tuấn Anh |
| ~20:42 | Workstation restart | The DINOv2 queue stopped during EXP-D-100 epoch 11; resumed from `last.pt` at ~20:46 as a detached process. The workstation clock ran ~66 minutes slow afterwards (time service off); evening evidence uses phone/server time | queue logs outside git | — | Bế Quốc Khánh |
| ~20:50 | #77 `ffbf763` | latin1 TextDecoder shim (first import) + tests; release APK rebuilt from it | `ffbf763` | the leader's own block | Phạm Tuấn Anh |
| 20:58 | **L4 measured PASS** | On the A17 in V1 SCR-03, phone driven via adb by the leader's session at his request: p50 153.5 KB, max 155.1 KB per new slice (1.1 % of a volume), revisits 0 bytes; the server log agrees | `spikes/spike_a_2d/EVIDENCE_RAW/l4_product_app_20261001T205817+0700/` (PR #82) | — | Vũ Hùng Anh (reviewer of Spike A) |
| ~21:15 | #82 opened | GATE-MOB-01 record: TECH_STACK_ADR (QA-ADR fixes, PROPOSED), QA-004, L4 evidence. **Not merged: waits for the leader's explicit decision on L5** | PR #82 | — | Phạm Tuấn Anh |

## 7 · Post-recovery validation

On Day 23 the normal workflow resumes in full; owners receive their blocks back; reviewers retrospectively
validate today's override merges; defects are fixed forward, not reverted by default; no ownership change persists.

## 8 · Authorisation

> I authorise this one-day recovery override for Day 22, 2026-10-01, on the terms above, including the compute
> host (DR-016), the device session tonight, and the pre-declared gate rules. It expires at the end of today.
> Ownership under DR-013 is unchanged and returns in full on Day 23.
>
> — Phạm Tuấn Anh, Team Leader (given in session, 2026-10-01 ~10:30)
