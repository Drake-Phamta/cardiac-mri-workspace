# SPIKE E — TASK

## Identity

| Field | Value |
|---|---|
| **Spike ID** | `SPIKE_E` |
| **Name** | Artifact transport over the canonical demo network |
| **Priority** | P2 |
| **Primary Owner** | **Nguyễn Gia Đức Trung** |
| **Secondary Reviewer** | **Phạm Tuấn Anh** |
| **Status** | **PREPARED** — authorised and assigned; **execution not started**. On starting: set `ACTIVE` and record the real `started_at` (never backdate). |
| **Blocked by** | nothing (DR-006 ✅ device, DR-003 ✅ topology both resolved) |
| **Lead Claude chat** | CHAT B — Technical Architect (feeds `ADR-ART-001`; support: CHAT D for the backend stub and instrumentation) |
| **Device measurement slot** | **3 of 3** — **do not wait idly**: backend stub, overlay verification, payloads, instrumentation, latency logging, retry harness and scripts all proceed while A and B hold the phone |
| **Review** | Reviewed by Phạm Tuấn Anh, **priority 2** behind Spike B. Serialized |

## Source requirement IDs

`ADR-ART-001` · NFR-PERF-001 · NFR-PERF-004 · PR-MRI-01 · PR-CACHE-01 *(SHOULD — see the scope firewall)* ·
`09` §4 · `11` §2 · `10` §8 · `12` §8
**Behaviour later asserted by:** `TC-PERF-001` · `TC-PERF-004` · `TC-MOBILE-STATE-001`
**Decisions:** **DR-003 ✅** (topology) · DR-006 ✅ (device) · DR-004 ✅ (ingestion, which populates the store)
**Findings:** **RA-H13** (this spike closes it) · linked risk **RISK-DEMO-NET-01**

## Objective

Measure candidate artifact-transport strategies **over the real canonical demo network path**, and produce
the **first-load / transport performance budget that `04` currently lacks** — the gap RA-H13 identified —
as the evidence input to `ADR-ART-001`.

**[SPEC]** `04` NFR-PERF-001 bounds only *already-cached* slice switching (200 ms p95) and forbids a
full-volume transfer per gesture. NFR-PERF-004 bounds only asynchronous *request creation* (2 s).
**[VERIFIED]** Nothing bounds first load of a case, an uncached slice fetch, or mesh delivery — yet
`ADR-ART-001` must be justified against a criterion.

## Canonical topology — binding

```text
Samsung Galaxy A17 5G
        |
        |  real 4G / 5G cellular Internet
        v
Authenticated ZeroTier private overlay
        |
        v
Remote Mac mini M2, 24 GB RAM   (physically remote from the demo venue)
```

> ## ⚠ MEASUREMENT RULE
>
> **DO NOT use same-LAN measurements as the acceptance evidence for this spike.**
>
> LAN measurements **may appear only as labelled diagnostic / control measurements** — useful for isolating
> whether a bottleneck is the network or the server, never as the basis for the budget.
>
> **Venue Wi-Fi is not trusted and not required** (DR-003 ✅). It must not be the measurement path.

**Why this matters.** A budget measured on a LAN would understate latency, jitter and variability, and
would be invalid for the actual demo. `RISK-DEMO-NET-01` exists precisely because a demo venue is a
contended-cellular environment.

## Hypotheses / questions to answer

| # | Question |
|---:|---|
| Q1 | **Time to first usable MRI slice from a cold case open**, over cellular + overlay? |
| Q2 | Uncached slice request latency? |
| Q3 | Does continuous navigation stay within NFR-PERF-001's 200 ms p95 with a candidate **prefetch strategy**? |
| Q4 | Representative **mask / overlay** transport cost? |
| Q5 | Representative **mesh** transport cost, at Spike B's decimation levels? |
| Q6 | Device memory implications of each strategy? |
| Q7 | Behaviour under **ordinary cellular variation** — how wide is the spread, not just the median? |
| Q8 | **Reconnect / retry behaviour** relevant to the canonical demo? |
| Q9 | What **first-load performance budget** should be proposed? |
| Q10 | What is the **minimum artifact set** for the canonical-demo connectivity fallback, and its on-device size? |

> **Lưu ý cho owner trong Day 0:** Q1–Q10 ở bảng này là **câu hỏi nghiên cứu của Spike E**, không phải câu hỏi onboarding có thể trả lời bằng suy đoán. Chưa điền con số hay kết luận trong Day 0. Chỉ trả lời chúng sau khi Nguyễn Gia Đức Trung thực hiện phép đo thật trên đúng đường cellular + overlay và thu được evidence; trường không đo được phải ghi `NOT MEASURED — <lý do>`.

## Candidate strategies to compare

**[ASSUMPTION — to be tested, not presumed]**

1. Per-slice image encoding, fetched on demand.
2. Per-slice packed-binary mask transfer.
3. Whole-volume download with client-side slicing.
4. Prefetch window around the active slice, combined with any of the above.

The trade-off is between first-load cost and per-gesture cost; `11` §2 permits direct return, chunk/slice
endpoints, or versioned artifact URLs, all deferred to `ADR-ART-001`.

## Inputs

- One volume at realistic dimensions and dtype — **synthetic is acceptable**; this spike must not wait for
  Spike D.
- A backend stub on the Mac mini serving the candidate strategies.
- Mesh artifacts at Spike B's decimation levels, once available. **[DEPENDENCY — soft]** If Spike B has not
  yet produced them, use a synthetic mesh of comparable triangle count and record that substitution.

## Prerequisites

1. **DR-006 device profile captured** from the Galaxy A17 5G.
2. Mac mini reachable from the phone over cellular + ZeroTier — **confirm this first**; it is the gating
   setup step.
3. Backend stub deployed on the Mac mini.

## Exact environment

| Field | Value |
|---|---|
| Device | **Samsung Galaxy A17 5G**, physical |
| Device profile | **[UNVERIFIED — capture]** all seven DR-006 fields |
| Server | **Mac mini M2, 24 GB RAM** — **[RECORD]** macOS version, backend stub identity/version |
| Network | **[RECORD]** carrier, 4G vs 5G, signal indication, and the measurement location |
| Overlay | **[RECORD]** ZeroTier version; **whether the connection is direct or relayed** — relay adds latency and must be labelled |
| Time of day | **[RECORD]** cellular contention varies; note it |
| LAN control run | **[RECORD, optional]** clearly labelled **diagnostic only** |

## Implementation boundary

**Allowed:**

```text
spikes/spike_e_transport/**                      throwaway stub + client harness - NOT production code
management/spikes/SPIKE_E_TRANSPORT/RESULT.md    (only when real evidence exists)
```

**Forbidden:**

- Any edit to `docs/specs/v1.0/`.
- Writing `ADR-ART-001` — this spike supplies its evidence.
- Freezing the API contract or the artifact-store design.
- Production repository modules.
- **Exposing the Mac mini publicly.** DR-003 ✅ requires: no public endpoint, no port forwarding, no public
  domain, no public unauthenticated exposure, no public dataset-serving endpoint. Retained obligations
  still apply — secrets protection, no credentials in the mobile binary, safe logging, no open
  artifact-directory enumeration.

## Scope firewall on the fallback — binding

DR-003 ✅ requires the plan to preserve a **minimal** connectivity-failure fallback for the canonical hero
demo. This spike reports **what that minimum would need to be**.

> **It must NOT become:** a full offline-mode product requirement, a second application architecture, or a
> requirement to run backend functionality on the phone.
>
> `PR-CACHE-01` (offline-friendly caching) is a **SHOULD**. The fallback must not promote it into the MUST
> floor by the back door. Any such expansion is a scope change under `00` §13 and `03` §5.

## Acceptance criteria

| # | Criterion |
|---:|---|
| E1 | **All acceptance measurements taken over real cellular + overlay** — LAN runs labelled diagnostic only |
| E2 | Time to first usable MRI slice on cold case open, per strategy |
| E3 | Uncached slice request latency, per strategy |
| E4 | Continuous-navigation behaviour with a candidate prefetch strategy, tested against NFR-PERF-001's 200 ms p95 |
| E5 | Representative mask/overlay transport cost |
| E6 | Representative mesh transport cost, per decimation level available |
| E7 | Device memory footprint per strategy |
| E8 | **Latency spread reported, not only a median** — behaviour under ordinary cellular variation |
| E9 | Reconnect/retry behaviour characterised for the canonical demo |
| E10 | **A proposed first-load performance budget** with a measurable target, suitable to become an NFR + acceptance test via `00` §13 |
| E11 | **Minimum fallback artifact set** identified, with its on-device size |
| E12 | Direct-vs-relayed overlay connection recorded for every measurement |
| E13 | A strategy recommendation for `ADR-ART-001`, with its trade-offs |

## Measurements required

| Measurement | Unit | Note |
|---|---|---|
| Time to first usable slice, cold open | ms — p50 **and p95** | per strategy |
| Uncached slice fetch latency | ms — p50, p95, max | per strategy |
| Cached slice switch during navigation | ms — p95 | vs NFR-PERF-001's 200 ms |
| Mask/overlay transport | ms + bytes | |
| Mesh transport | ms + bytes | per decimation level |
| Device memory | MB | per strategy |
| Latency spread under cellular variation | ms — distribution | **required, not optional** |
| Reconnect time after link loss | ms/s | |
| Minimum fallback artifact set | MB | |

## Automated evidence required

- Instrumented client harness producing machine-readable timing logs, re-runnable by the reviewer.
- Backend stub logging server-side handling time, so network time can be separated from server time.
- Aggregation script producing p50/p95/max distributions — **not hand-typed summaries**.

## Manual evidence required

- **All network measurements over the real cellular + overlay path — executed by Nguyễn Gia Đức Trung.**
- Completed device-profile block.
- Recorded network conditions per run, including direct-vs-relayed status.
- Owner's written strategy recommendation.

## Fail conditions

| Condition | Consequence |
|---|---|
| **LAN measurements presented as acceptance evidence** | **Evidence rejected** — DR-003 ✅ measurement rule |
| No strategy meets NFR-PERF-001 during continuous navigation | Escalate; feeds `ADR-ART-001` and `RISK-DEMO-NET-01` |
| Latency spread makes the hero demo unreliable | Escalate; the DR-003 ✅ fallback becomes load-bearing |
| Fallback scope expands into full offline mode | **Governance violation** — `00` §13 / `03` §5 |
| Mac mini publicly exposed during the spike | **Governance violation** — DR-003 ✅ / `12` §5 |

## Expected deliverables

1. `management/spikes/SPIKE_E_TRANSPORT/RESULT.md` — per-strategy measurements and the recommendation.
2. Backend stub + instrumented client harness under `spikes/spike_e_transport/`.
3. **Proposed first-load performance budget** (closes RA-H13).
4. **Minimum fallback artifact set** description and size.
5. Completed device-profile and network-conditions blocks.

## Estimated effort

**[ESTIMATE]** Setup — Mac mini stub plus verified cellular + overlay reachability — is the gating step and
is genuinely unknown until attempted. Measurement is repetitive and must be repeated under varying cellular
conditions, so wall-clock exceeds hands-on effort. Device access is **contended** with Spikes A and B:
see `SPIKE_PHASE_PLAN.md` §4.3.

## Risk

**`RISK-DEMO-NET-01`** (MEDIUM — created by DR-003 ✅) · **RA-H13** (HIGH — no transport budget exists) ·
`RISK-INTEGRATION` (MEDIUM)

## Downstream unblocked

`ADR-ART-001` · the missing **first-load NFR** (RA-H13) · the DR-003 ✅ **connectivity-fallback mechanism** ·
input to `TC-PERF-001` / `TC-PERF-004` test design

## What Claude may NOT fabricate

> **Claude must not invent, estimate-as-measured, or otherwise fabricate:** any latency, throughput,
> jitter, byte count over the wire, device memory figure, reconnect timing, cellular signal condition,
> direct-vs-relay status, or any device hardware value.
>
> **All network and device measurements are executed by Nguyễn Gia Đức Trung over the real cellular +
> overlay path.**
>
> Claude **may**: write the backend stub, build the client harness and instrumentation, write the
> aggregation scripts, prepare the result template, and analyse measurements the owner supplies.

**No `RESULT.md` exists in this directory.** Create it only when real measured evidence exists.
