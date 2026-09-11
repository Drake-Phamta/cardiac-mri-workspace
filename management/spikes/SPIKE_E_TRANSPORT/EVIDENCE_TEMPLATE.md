# SPIKE E — EVIDENCE TEMPLATE

**Spike:** `SPIKE_E` · **Primary Owner:** Nguyễn Gia Đức Trung · **Secondary Reviewer:** Phạm Tuấn Anh
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

> **Non-fabrication rule.** Every latency, throughput, byte count, memory figure, reconnect timing and network condition below must be **measured over the real cellular + ZeroTier overlay path** by the owner.
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
| Reviewer | Phạm Tuấn Anh |
| Reviewer verdict | [RECORD] `APPROVE` / `NEEDS_FIX` / `BLOCKED_DECISION_REQUIRED` |
| QA / Red-Team challenge (CHAT E) performed | [RECORD] yes/no + outcome |

---
## 2. Declared device profile (DR-006) — **prerequisite**

**Capture every field from the device itself. Do not infer any hardware detail.**

| Field | Value |
|---|---|
| Model declared by DR-006 | Samsung Galaxy A17 5G |
| Model identifier read from device | [UNVERIFIED] |
| Android version + build number | [UNVERIFIED] |
| RAM / device performance profile | [UNVERIFIED] |
| CPU information available from tooling | [UNVERIFIED] |
| GPU information available from tooling | [UNVERIFIED] |
| Screen resolution | [UNVERIFIED] |
| Refresh rate / profile | [UNVERIFIED] |
| Physical device or emulator | **must be physical** — [RECORD] |
| Unit identifier (if the team has more than one) | [RECORD] |

### Exact test configuration

| Field | Value |
|---|---|
| Build type (release required for timing) | [RECORD] |
| Thermal state at start / end | [RECORD] |
| Battery level and power mode | [RECORD] |
| Background load | [RECORD] |
| Screen brightness | [RECORD] |
| Throttling observed during the run | [RECORD] |

---
## 3. Network and server environment — **acceptance path**

> **LAN measurements are NOT valid acceptance evidence.** They may appear only in the labelled diagnostic
> section below.

| Field | Value |
|---|---|
| Path used for acceptance | **cellular → ZeroTier overlay → remote Mac mini** — [RECORD] confirm |
| Carrier | [RECORD] |
| 4G or 5G | [RECORD] |
| Signal indication | [RECORD] |
| Measurement location | [RECORD] |
| Time(s) of day | [RECORD] — cellular contention varies |
| ZeroTier version | [RECORD] |
| **Connection direct or relayed?** | [RECORD] — relay adds latency; label every run |
| Mac mini macOS version | [RECORD] |
| Backend stub identity / version | [RECORD] |
| Volume used (synthetic or validated) | [RECORD] dimensions + dtype |

---

## 4. Strategies compared

| # | Strategy | Description |
|---:|---|---|
| 1 | Per-slice image encoding on demand | [RECORD] |
| 2 | Per-slice packed-binary mask | [RECORD] |
| 3 | Whole-volume download + client-side slicing | [RECORD] |
| 4 | Prefetch window around active slice | [RECORD] |

---

## 5. Measurements E2–E8 — over the real path

### Time to first usable slice, cold open (E2)

| Strategy | p50 (ms) | p95 (ms) | Max (ms) | Runs |
|---|---|---|---|---|
| [RECORD] | | | | |

### Uncached slice request latency (E3)

| Strategy | p50 | p95 | Max |
|---|---|---|---|
| [RECORD] | | | |

### Continuous navigation with prefetch (E4) — vs NFR-PERF-001

| Strategy | Cached-switch p95 (ms) | ≤ 200 ms? | Full-volume transfer per gesture? |
|---|---|---|---|
| [RECORD] | | | **must be no** |

### Mask / overlay and mesh transport (E5–E6)

| Artifact | Bytes | Transfer time (p50 / p95) |
|---|---|---|
| Mask slice | [RECORD] | |
| Overlay | [RECORD] | |
| Mesh — decimation level [RECORD] | [RECORD] | |

### Device memory (E7)

| Strategy | Peak app memory (MB) |
|---|---|
| [RECORD] | |

### Latency spread under ordinary cellular variation (E8) — **required**

| Condition | p50 | p95 | Max | Notes |
|---|---|---|---|---|
| [RECORD] | | | | |

---

## 6. Reconnect / retry behaviour (E9)

| Scenario | Observed behaviour | Time to recover |
|---|---|---|
| Link loss mid-slice-fetch | [RECORD] | |
| Link loss mid-mesh-transfer | [RECORD] | |
| Overlay re-establishment | [RECORD] | |
| Retry safe / idempotent? | [RECORD] | |
| UI state during loss (`10` §8 recoverable error) | [RECORD] | |

---

## 7. Proposed first-load budget (E10) — closes RA-H13

| Field | Value |
|---|---|
| **Proposed target: time to first usable slice** | [RECORD] ms, p95 |
| Measured basis | [RECORD] |
| Strategy assumed | [RECORD] |
| Achievable under observed cellular variation? | [RECORD] |
| Suitable to become an NFR + acceptance test via `00` §13? | [RECORD] |

---

## 8. Minimal connectivity fallback (E11) — scope-firewalled

| Field | Value |
|---|---|
| **Minimum artifact set for the canonical hero flow** | [RECORD] enumerate |
| On-device size | [RECORD] MB |
| Preload mechanism suggested | [RECORD] |
| Covers the full `16` §2 hero narrative? | [RECORD] |

> **Scope firewall.** This informs a **demo-resilience measure only**. It must **not** become a full
> offline mode, a second architecture, or backend-on-phone. `PR-CACHE-01` remains a **SHOULD**.

| Check | Result |
|---|---|
| Does the proposal stay within the firewall? | [RECORD] must be **yes** |

---

## 9. Diagnostic-only LAN control runs (optional)

> **Labelled diagnostic. NOT acceptance evidence.** Used only to separate network cost from server cost.

| Measurement | LAN value | Cellular+overlay value | Delta |
|---|---|---|---|
| [RECORD] | | | |

---

## 10. Recommendation for `ADR-ART-001` (E13)

| Field | Value |
|---|---|
| Recommended strategy | [RECORD] |
| Trade-offs accepted | [RECORD] |
| Interaction with the fallback | [RECORD] |
| Open questions for the architect | [RECORD] |

---

## 11. Frozen constraints — confirm each was respected

| Constraint | Respected? | Evidence |
|---|---|---|
| **Acceptance measurements taken over real cellular + overlay** | [RECORD] must be **confirmed** | |
| LAN runs clearly labelled diagnostic-only | [RECORD] | |
| Mac mini **not** publicly exposed at any point | [RECORD] must be **confirmed** | |
| No public endpoint / port forwarding / domain created | [RECORD] | |
| Secrets protection, safe logging, no credentials in the client | [RECORD] | |
| Fallback proposal stayed within the scope firewall | [RECORD] | |

> **If a frozen constraint was not met, the outcome is `NEGATIVE_RESULT` and an escalation — never a
> relaxed constraint.**

---

## 12. Verdict

| Field | Value |
|---|---|
| Overall result | [RECORD] `PASS` / `NEEDS_FIX` / `NEGATIVE_RESULT` |
| Acceptance criteria passed | [RECORD] e.g. 11 / 13 |
| Criteria failed, with reasons | [RECORD] |
| Constraints relaxed | **must be `NONE`** — [RECORD] |
| Escalation raised | [RECORD] none / which |
| Downstream unblocked | [RECORD] ADR-ART-001, first-load NFR (RA-H13), DR-003 connectivity-fallback mechanism, TC-PERF-001/004 design |

### Open questions and follow-ups

[RECORD]

### Attachments

| Artifact | Path |
|---|---|
| Machine-readable measurement log | [RECORD] |
| Script / harness used | [RECORD] |
| Screenshots / recordings | [RECORD] |


---

**Related:** `TASK.md` · `../SPIKE_PHASE_PLAN.md` · `../SPIKE_PHASE_STATE.yaml` ·
`../../readiness/READINESS_REVIEW_RESOLUTION.md` §10
