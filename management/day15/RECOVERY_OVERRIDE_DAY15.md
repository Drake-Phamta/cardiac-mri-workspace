# RECOVERY OVERRIDE — DAY 15

**Status:** ACTIVE
**Effective:** 2026-09-24 14:00 +07:00
**Expires:** automatically at 23:59 +07:00 on 2026-09-24 (end of Day 15). No renewal by silence.
**Authorised by:** Phạm Tuấn Anh — Team Leader
**Recorded by:** Project Control
**Scope:** Day 15 only. This document is the single exception record for the day. No other exception document is to be created.

---

## 1 · Why

Day 1 = 2026-09-10, Day 30 = 2026-10-09, fixed. Today is **Day 15 of 30**.

The state that triggered this override, verified against the repository on 2026-09-24:

| Fact | Value |
|---|---|
| Last code merge to `main` | 2026-09-20 (`40498e5`, PR #47) — `main` had not moved in four days |
| Files under `app/` on `main` | **0** |
| MUST requirements with production code on `main` | **0 of 33** |
| Open pull requests | 14, of which 7 were waiting on review |
| Day 11 | planned, never closed |
| Day 12, Day 13 | no plan, no record |
| Day 14 (2026-09-23) | **zero commits and zero reviews across every branch** |
| `PROJECT_STATE.yaml` | stale by four days, and internally contradictory: the spike block says `SPIKE_D: NEEDS_FIX` while the gate block says `GATE-DATA-01: CLOSED` |
| `GATE-SPLIT-01` | OPEN — blocking `SPIKE_C1`, `GATE-ML-01`, and every training run |

The critical path was not blocked by a technical problem. It was blocked by review and merge debt. The leader has chosen to spend one day clearing it personally.

---

## 2 · Rules waived, for Day 15 only

1. **Mandatory human secondary review before merge.**
2. **Owner-only execution boundaries** — the leader may implement, fix, rebase, resolve conflicts, and run measurements inside any technical block.
3. **Review serialization** — work does not queue behind a reviewer's availability.
4. **Normal WIP limits.**
5. **The rule that the leader may not execute another member's implementation work.**

Under this waiver the leader may, today: implement · fix · rebase · resolve conflicts · run measurements · review · sign off · merge · execute work belonging to any technical block.

**This is RECOVERY SUPPORT. It is not a transfer of ownership.** `DR-013` ownership returns in full on Day 16. Every block returns to its named owner.

---

## 3 · Rules NOT waived

Speed does not authorise false evidence. The following remain absolute today:

- No fabricated measurements. No invented test results.
- No silent dataset manipulation. No data leakage between train and evaluation.
- `RawPrediction` and ground-truth immutability rules stay intact.
- `docs/specs/v1.0/**` remains frozen.
- CI and test failures cannot be ignored or bypassed.
- A null or negative scientific result remains valid. `PR-SCI-03` stands: success must not require DINOv2 to outperform UNet, and evidence must not be tuned or filtered to force the reference-paper direction.
- Destructive operations remain prohibited.
- **Every action taken under this override must be auditable** — a command that produced it, a commit that records it.
- **An unmeasured criterion is never marked PASS**, whatever the schedule pressure.
- **A gate closes only when the evidence actually supports it.** This override waives review, not evidence.

### QA is not waived

CHAT E QA remains **mandatory** for:
- PR #35 and anything touching the dataset split;
- any gate-critical evidence;
- any recovery merge that changes scientific or data semantics.

For ordinary product-code integration, CI + tests + CHAT E smoke/regression + leader sign-off is sufficient today.

### What CHAT E is, stated honestly

CHAT E is an **LLM red-team session running under the leader's own account**. It is not an independent second human, and it must not be recorded as one. It catches real defects and its verdict is binding today, but the assurance level it provides is lower than a second engineer reading the code. Day 16 revalidation exists because of this gap.

---

## 4 · Merge classification rule

Not everything merged today is an override merge. Misclassifying work to keep this list short would defeat the purpose of the document.

**A merge is a NORMAL MERGE** when an approving review exists whose `commit_id` equals the current head, the reviewer is not the author, and the effective diff against the base at merge time is materially what that reviewer saw.

**A merge is an OVERRIDE MERGE** when any of those fails — no approval, an approval against a different commit, the author approving their own work, or base movement that materially changed what is being integrated.

PR #35 will move `main` before the others. Therefore, for #48, #49 and #26, the four checks — effective diff against current `main`, CI, mergeability, integration-sensitive files — are **recomputed after #35 lands**, and each is classified at that moment, not in advance.

---

## 5 · Spike B: go / no-go gate

The leader's physical time on the Galaxy A17 5G is the scarcest resource of the day. Before any device session, a 15-minute readiness gate runs and its result is recorded here:

- `#46` / WebView APK readiness;
- APK freshness — the build must post-date the last code change, and the build timestamp is recorded next to the log;
- availability of a real decimated mesh;
- the 2D-to-3D wiring that `B7` requires;
- logging and instrumentation readiness;
- the exact list of B criteria measurable in one session.

**GO** only if the session can collect a meaningful block of real evidence. If only a small subset is measurable and substantial setup remains, the verdict is **NO-GO**: the time goes to C1, `GATE-ML-01`, training, product integration and control-plane repair instead, and Spike B returns to Vũ Hùng Anh on Day 16.

`B15` is an **owner-authored development-cost observation**. It is a judgement by the owner, not a measurement. The leader cannot produce it. It remains Day 16 owner work regardless of the go/no-go outcome.

---

## 6 · Actions taken under this override

Filled in as the day proceeds. Every row is also carried into `POST_RECOVERY_REVALIDATION_DAY16.md`.

| Time | Item | Action | Evidence | Normal step waived | Classification |
|---|---|---|---|---|---|
| 14:00 | — | Override recorded | this file | — | — |

---

## 7 · Post-recovery validation requirement

Every item merged or transitioned under this override is recorded in `POST_RECOVERY_REVALIDATION_DAY16.md` with: the leader action, the tests and CI that ran, the CHAT E result, which normal step was waived, the normal owner, the normal reviewer, and the Day 16 revalidation action.

On Day 16:
- the normal workflow resumes in full;
- owners receive their blocks back;
- reviewers retrospectively validate today's override merges;
- defects found are fixed forward, not reverted by default;
- **no ownership change persists.**

The highest-priority revalidation item is **PR #53**, because its author is the leader — merging it is genuine self-approval, which no other item today involves.

---

## 8 · Authorisation

> I authorise this one-day recovery override for Day 15, 2026-09-24, on the terms recorded above. It expires at the end of today. Ownership under `DR-013` is unchanged and returns in full on Day 16.
>
> — Phạm Tuấn Anh, Team Leader
