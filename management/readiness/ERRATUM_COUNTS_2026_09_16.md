# ERRATUM — verified counts of the frozen specification

| Field | Value |
|---|---|
| **Date** | 2026-09-16 (Day 7) |
| **Status** | **APPROVED by the leader** — Phạm Tuấn Anh, 2026-09-16 |
| **Scope** | Management documents only. **The frozen specification under `docs/specs/v1.0/` is unchanged and was never wrong** (checksums 19/19 OK). |
| **Re-verified by** | `python tools/spec_counts/count_spec_ids.py`, run on 2026-09-16 from the repository root |
| **Raised by** | `management/DEMO_STANDARD.md` §11, drafted 2026-09-15 |

---

## 1 · What was wrong

| Item | Published in management documents since 2026-09-08 | Verified 2026-09-16 | Difference |
|---|---:|---:|---|
| Product requirements (`03`) | 39 | **44** | **+5** |
| — of which **MUST** | 28 | **33** | **+5** |
| — of which SHOULD | 6 | 6 | — |
| — of which COULD | 5 | 5 | — |
| Acceptance tests (`13`) | 69 | **70** | **+1** |
| FR + NFR (`04`) | 79 | 79 | — |
| Use cases (`02`) | 17 | 17 | — |
| Screens (`10`) | 9 | 9 | — |

---

## 2 · Why it happened

1. **A too-narrow requirement-id pattern.** The 2026-09-08 extraction assumed a letters-only prefix, so it
   never saw `PR-3D-01` … `PR-3D-05` — a digit inside the prefix. All five are **MUST**, which is exactly why
   the acceptance floor appeared to be 28 instead of 33.
2. **A too-narrow test-id pattern.** The same extraction assumed one prefix segment, so it skipped
   `TC-MOBILE-STATE-001` (two segments) and reported 69 tests instead of 70.
3. **The audit report was right and a later note called it wrong.** `SPEC_AUDIT_REPORT_v1_0.md` had published
   44 / 33 / 70. A management comment added afterwards — carried in `PROJECT_STATE.yaml` until today — declared
   those figures wrong and instructed that they "must not propagate". **That comment was the error**, and it is
   the reason the wrong numbers survived a readiness review, a risk register and five daily reports.
4. **The same bug recurred during this very re-verification.** The first version of the counting script used
   `PR-[A-Z0-9]{2,}-\d{2}` and printed **40** product requirements, silently dropping the four multi-segment
   COULD ids (`PR-MODEL-EXTRA-01`, `PR-ANN-ADV-01`, `PR-STUDY-CREATE-01`, `PR-EXP-SCHED-01`). It is recorded
   here because the lesson is the pattern, not the number: **an id prefix may contain digits and may have
   several segments**, and any count that forbids either will quietly under-report.

The committed script now allows both forms and cross-checks that every requirement id referenced anywhere in
`03` is also defined there: **44 referenced, 44 defined, 0 orphans**.

---

## 3 · What it changes

- **The MVP acceptance floor is 33 MUST product requirements, not 28.** Nothing is added to the project and
  nothing is de-scoped: the five requirements were always in the frozen spec and always binding. They are the
  3D ones, and they were already owned and planned — Spike B, Spike F, `GATE-MOB-01`, vertical V2:

  | Id | Requirement (abridged from `03`) | Where it already lives |
  |---|---|---|
  | `PR-3D-01` | reconstruct a 3D LA representation from validated masks | Spike B `B1`–`B2` |
  | `PR-3D-02` | rotate, **zoom and pan** the 3D representation on mobile | Spike B `B1`, `B10`/`B11` |
  | `PR-3D-03` | changing the active slice updates the 3D plane | Spike B `B3`–`B6` · `DR-008a` |
  | `PR-3D-04` | selecting a 3D location navigates to the corresponding slice | Spike B picking `B3`/`B4` |
  | `PR-3D-05` | error visualisation linked to contributing slices, when ground truth exists | Spike F · `DR-005` · `C4` / RA-B01 |

  `PR-3D-02` is worth noting on its own: the reviewer's finding on PR #30 on 2026-09-15 — the viewer rotates and
  zooms but does not pan — is a **MUST** gap, not a nice-to-have. The corrected count and the review agree.
- Progress is reported as **`0 / 44`** and **MUST `0 / 33`** from Day 7 onward.
- **Day records are not rewritten.** `DAY02`…`DAY06_EOD_REVIEW.md` and the daily packets keep the numbers they
  were written with; this erratum names them instead of editing history. Day-6's EOD review already reports
  `0 / 44` and MUST `0/33` with a footnote, because it was written after the recount.

---

## 4 · Documents corrected

| Document | Change |
|---|---|
| `management/PROJECT_STATE.yaml` | `requirements.inventory` → 44 / 33 / 6 / 5 / 70; the incorrect header comment about `SPEC_AUDIT_REPORT_v1_0.md` replaced |
| `management/DEMO_STANDARD.md` | approved as **v1**; §11 records this erratum as decided |
| `management/onboarding/PROJECT_ONE_PAGE_MAP.md` · `onboarding/README.md` · `onboarding/TEAM_SHARED_CORE.md` | the verified-count lines updated — these are what a member reads first |
| `management/readiness/IMPLEMENTATION_READINESS_AUDIT.md` · `IMPLEMENTATION_READINESS_STATUS.md` · `READINESS_REVIEW_RESOLUTION.md` · `RISK_REGISTER_INITIAL.md` | pointer note at each place that carries the old figures; the original text is left intact as the record of what was believed then |

---

## 5 · How to re-verify

```powershell
python tools/spec_counts/count_spec_ids.py
```

It prints each count with the expected value and exits non-zero on any mismatch or orphan id. It reads the
frozen files only.

---

**Related:** `management/DEMO_STANDARD.md` §11 · `management/readiness/READINESS_REVIEW_RESOLUTION.md` ·
`docs/specs/v1.0/SPEC_AUDIT_REPORT_v1_0.md` · `management/day06/DAY06_EOD_REVIEW.md` §10
