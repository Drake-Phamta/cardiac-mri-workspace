# SPIKE D — EVIDENCE TEMPLATE

**Spike:** `SPIKE_D` · **Primary Owner:** Bế Quốc Khánh · **Secondary Reviewer:** Vũ Hùng Anh
**Status when filled:** `EVIDENCE_READY` — then reviewer sign-off → `ACCEPTED`

---

## How to use this template

1. Copy this file to **`RESULT.md`** in the same directory **only when you have real evidence**.
2. Replace every `[RECORD]` and `[UNVERIFIED]` marker with a real value. **Do not delete a marker you did
   not measure — leave it and say why.**
3. A field you could not measure is recorded as **`NOT MEASURED — <reason>`**. That is acceptable and
   honest. Inventing a plausible value is not.
4. When complete, set `evidence_present: true` and `status: EVIDENCE_READY` for this spike in
   `../SPIKE_PHASE_STATE.yaml`, and hand it to the reviewer.

> **Non-fabrication rule.** Every inventory, count, shape, dtype, spacing, direction matrix, mask value set, alignment verdict, checksum and metadata finding below must be **read from the actual downloaded package** by the owner.
>
> Claude may build harnesses, fixtures, scripts and templates, and may analyse values you supply. Claude
> **must not** produce the measurements themselves.

---

## 1. Execution record

| Field | Value |
|---|---|
| Owner who executed | [RECORD] |
| Date(s) executed | [RECORD] |
| Actual start (matches `started_at` in state file) | [RECORD] |
| Repository commit tested | [RECORD] |
| Reviewer | Vũ Hùng Anh |
| Reviewer verdict | [RECORD] `APPROVE` / `NEEDS_FIX` / `BLOCKED_DECISION_REQUIRED` |
| QA / Red-Team challenge (CHAT E) performed | [RECORD] yes/no + outcome |

---
## 2. Acquisition record (A1–A2)

| Field | Value |
|---|---|
| Source URL used | [RECORD] must be the documented official source |
| Download start / end timestamp | [RECORD] |
| Package file name(s) and size(s) | [RECORD] |
| Checksum(s) where practical | [RECORD] |
| Extraction location (outside version control) | [RECORD] |
| License / data-use terms file preserved at | [RECORD] |
| Environment: OS / CPU / RAM / free disk | [UNVERIFIED] |
| NRRD library + exact version | [RECORD] |

### Case counts by released partition

| Partition | Case count |
|---|---|
| Official training / development | [RECORD] |
| Official testing | [RECORD] |
| **Total extracted** | [RECORD] |

---

## 3. Day-one DR-001 trigger evaluation — **fill this first**

| Question | Answer |
|---|---|
| Usable official package present **locally** by end of first execution day? | [RECORD] yes / no |
| Blocking defect preventing GATE-DATA-01 acceptance found? | [RECORD] yes / no + detail |
| **Trigger fired?** | [RECORD] no / **YES — RA-H01 escalates to BLOCKER** |
| Reported to leader at | [RECORD] |

> **No silent dataset substitution.** If the trigger fired, the contingency process opens under `00` §13.

---

## 4. Per-case file inventory (A3–A5)

Attach the machine-generated inventory; summarise here.

| Check | Count / result |
|---|---|
| Cases with `lgemri.nrrd` present | [RECORD] |
| Cases with `laendo.nrrd` present | [RECORD] |
| Cases missing a required file | [RECORD] list |
| Additional files present (e.g. `lawall.nrrd`) | [RECORD] — **not a core target** per `06` §2 |
| All NRRDs load successfully | [RECORD] |
| MRI is 3D / mask is 3D | [RECORD] |
| dtype per file kind | [RECORD] |

---

## 5. Geometry (A6–A9, A14) — closes condition C6

### Cohort shape distribution (A6 / RA-M14b)

| Shape `[Nx, Ny, Nz]` | Case count |
|---|---|
| [RECORD] | [RECORD] |

| Question | Answer |
|---|---|
| **Do in-plane dimensions vary across the cohort?** | [RECORD] yes / no |

### Spacing / origin / direction (A7)

Attach the full per-case table; summarise distinct values here.

| Field | Distinct values observed |
|---|---|
| `spacing_xyz` | [RECORD] |
| `origin_xyz` | [RECORD] or absent |
| `direction` / orientation | [RECORD] or absent |

### Alignment and axis-alignment verdict (A8, A9, A14)

| Question | Answer |
|---|---|
| MRI/mask shapes compatible per case? | [RECORD] |
| MRI/mask spacing compatible per case? | [RECORD] |
| Masks already spatially aligned with MRI? | [RECORD] |
| Resampling required? | [RECORD] |
| **Is EVERY volume axis-aligned?** | [RECORD] yes / no |
| **Compatible with the DR-012 axis-aligned-only MVP boundary?** | [RECORD] yes / no |

> If **no**: **RA-M02 escalates**, a new Decision Request is required, and **condition C6 cannot close**.

---

## 6. Label semantics and provenance (A10–A13) — decides Path A vs Path B

### Mask values (A10)

| Field | Value |
|---|---|
| Unique values found in `laendo.nrrd` | [RECORD] |
| **Exact foreground → background mapping** | [RECORD] — recorded, never assumed |
| Any non-binary / unexpected values | [RECORD] |

### LA cavity verification (A11)

| Question | Answer + evidence |
|---|---|
| **Is `laendo.nrrd` verified as the LA cavity target for THIS package?** | [RECORD] |

### Official test-label provenance (A12) — **RA-H02**

**[UNRESOLVED before this spike.]** The official source is internally inconsistent: its historical
challenge description indicates test labels were withheld, while its current file-description section
indicates the Test Set contains 54 MRIs *and* LA cavity labels. **Settle it from the files.**

| Question | Answer + file-level evidence |
|---|---|
| Do label files exist in the test partition? | [RECORD] |
| How many test cases have a label file? | [RECORD] |
| Value distributions consistent with LA cavity annotation? | [RECORD] |
| **Provenance verifiable?** | [RECORD] yes / no / ambiguous |

### Path evidence (A13) — evidence only, **this spike does not select the path**

| Field | Value |
|---|---|
| Evidence points to | [RECORD] Path A / Path B / ambiguous |
| Reasoning | [RECORD] |
| **Selection deferred to** | **DR-002 / GATE-SPLIT-01 — leader / spec owner** |

---

## 7. Integrity, identity and privacy (A15–A18)

| Check | Result |
|---|---|
| Corrupted / unreadable files | [RECORD] list or none |
| Missing files | [RECORD] list or none |
| Exclusions proposed, with reasons | [RECORD] |
| Case IDs unique | [RECORD] |
| De-identified internal IDs assigned (`CASE_0001` style) | [RECORD] |
| NaN / invalid values after read | [RECORD] |

### Metadata allowlist audit (A17 — `NFR-SEC-005`, `12` §2, `TC-SEC-005`)

| Check | Result |
|---|---|
| Header / sidecar fields enumerated | [RECORD] attach list |
| **Unexpected direct identifiers found?** | [RECORD] yes / no |
| If yes: which, and excluded from the app metadata path how | [RECORD] |
| Technical fields retained for geometry/reproducibility | [RECORD] |

---

## 8. Acceptance artifacts (A19–A20)

| Artifact | Path | Exists |
|---|---|---|
| `management/DATASET_AUDIT.md` | [RECORD] | [RECORD] |
| `data/manifests/dataset_manifest.*` | [RECORD] | [RECORD] |
| Machine-readable? (**not hand-typed**) | — | [RECORD] |
| Validation script, re-runnable by reviewer | [RECORD] | [RECORD] |
| Script output log | [RECORD] | [RECORD] |

---

## 9. Frozen constraints — confirm each was respected

| Constraint | Respected? | Evidence |
|---|---|---|
| DR-012 axis-aligned-only boundary confirmed against the package | [RECORD] | |
| Dataset **not** substituted | [RECORD] must be **confirmed** | |
| No dataset bytes committed to the repository (`12` §3) | [RECORD] | |
| Split **not** selected by this spike | [RECORD] | |

> **If a frozen constraint was not met, the outcome is `NEGATIVE_RESULT` and an escalation — never a
> relaxed constraint.**

---

## 10. Verdict

| Field | Value |
|---|---|
| Overall result | [RECORD] `PASS` / `NEEDS_FIX` / `NEGATIVE_RESULT` |
| Acceptance criteria passed | [RECORD] e.g. 11 / 13 |
| Criteria failed, with reasons | [RECORD] |
| Constraints relaxed | **must be `NONE`** — [RECORD] |
| Escalation raised | [RECORD] none / which |
| Downstream unblocked | [RECORD] GATE-DATA-01, GATE-SPLIT-01 evidence, DR-002, DR-012 confirmation, condition C1, condition C6, Spike C1 |

### Open questions and follow-ups

[RECORD]

### Attachments

| Artifact | Path |
|---|---|
| Machine-readable measurement log | [RECORD] |
| Script / harness used | [RECORD] |
| Screenshots / recordings | [RECORD] |
| `DATASET_AUDIT.md` | [RECORD] |
| `dataset_manifest.*` | [RECORD] |

---

**Related:** `TASK.md` · `../SPIKE_PHASE_PLAN.md` · `../SPIKE_PHASE_STATE.yaml` ·
`../../readiness/READINESS_REVIEW_RESOLUTION.md` §10
