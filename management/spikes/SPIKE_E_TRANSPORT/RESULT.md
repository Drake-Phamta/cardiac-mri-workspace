# SPIKE E — draft result (Day 5)

**Status:** `DRAFT / NEEDS_FIX` — not `EVIDENCE_READY`, not `ACCEPTED`.

This draft is based on the owner's aggregation of the real run-4 raw log. It
does not fabricate the missing device-memory, reconnect, or multi-window
measurements.

## 1. Execution record

| Field | Value |
|---|---|
| Device operator | Pham Tuan Anh (commands executed via Claude Code on the operator machine) |
| Owner | Nguyen Gia Duc Trung |
| Owner reproduced a device run | **No — NOT MEASURED**; owner re-ran aggregation as required by DR-006a rev 2 |
| Date / time | 2026-09-13 19:12–19:19 +07:00 |
| Tested server commit | `37877e8` (Mac mini stub) |
| Tested client commit | `2229a740` (PR #22 Toybox fallback) |
| Proposed reviewer | Vu Hung Anh (the device operator must not review this spike) |
| QA / red-team | **NOT RUN** |

Raw evidence is on `spike-e/evidence-20260913` at commit
`7c05c8cb859c11da9cc71992f4a2b2d8e14e2dde`. The owner aggregation committed
with this draft is [the Day 5 report](../../day05/SPIKE_E_RUN4_AGGREGATE.json).

## 2. Device and environment

The run used the physical Samsung Galaxy A17 5G (`SM-A176B`), Android 16/API
36, 8 cores, Mali-G68, 1080×2340, 60 Hz active mode, 256 MB heap growth limit.
The profile is recorded in `management/spikes/SPIKE_A_2D/DR006_DEVICE_PROFILE.md`.

Run-4 path: Galaxy A17 → Wi-Fi `TP-Link_BC4C` (RSSI −41, 72 Mbps) → Internet
→ ZeroTier `b103a835d292ddb3` → remote Mac mini `10.64.193.115:8787`.
ZeroTier was `DIRECT`; the phone was not on the Mac mini's LAN. The server
payload was synthetic, not dataset bytes.

Thermal end state, battery/power mode during this exact run, app background
load, and release-build identity were **NOT MEASURED in the run-4 packet**.

## 3. Aggregated run-4 measurements

The aggregation used nearest-rank percentiles, no interpolation, and no
outlier removal. There were 171 samples: 171 successful, 0 failed.

| Criterion / scenario | Requests | Mean KB | p50 ms | p95 ms | Max ms |
|---|---:|---:|---:|---:|---:|
| E2 cold open s1 | 3 | 118.44 | 437 | 445 | 445 |
| E2 cold open s3 (whole volume) | 3 | 57,024.0 | 74,822 | 101,698 | 101,698 |
| E2 cold open s4 | 3 | 591.93 | 800 | 814 | 814 |
| E3 uncached slice s1 | 39 | 99.69 | 394 | 1,040 | 1,206 |
| E4 navigation s1 | 60 | 113.63 | 369 | **504** | 930 |
| E4 navigation s4 | 12 | 574.54 | 716 | **1,318** | 1,318 |
| E5 mask s2 | 39 | 40.50 | 286 | 429 | 609 |
| E6 mesh level 0 | 3 | 7.25 | 213 | 252 | 252 |
| E6 mesh level 1 | 3 | 29.70 | 254 | 445 | 445 |
| E6 mesh level 2 | 3 | 124.80 | 324 | 544 | 544 |
| E6 mesh level 3 | 3 | 513.93 | 876 | 948 | 948 |

`NFR-PERF-001` is 200 ms p95 for navigation. Both measured navigation
strategies exceed it in this run; this is an honest failed target, not a reason
to remove the tail or relabel the run.

## 4. Draft conclusions (not final acceptance)

### E10 — first-load budget

**Provisional proposal:** target ≤1,000 ms p95 to the first usable per-slice
PNG on `wifi-overlay`, subject to confirmation over several times of day and
both A6 payload profiles. The run measured s1 at 445 ms p95 for the cold-open
sample; the whole-volume strategy is not viable for first load (101,698 ms p95).
This target is a proposal, not a frozen NFR.

### E11 — minimal connectivity fallback

**Draft set:** one representative hero slice (`s1`), its corresponding mask
(`s2`), and the lowest required mesh level (`mesh/0.obj`) for the hero flow.
The exact on-device size and preload mechanism are **NOT MEASURED** here and
must be measured on the physical app. This remains a demo-resilience aid, not
full offline mode or backend-on-phone.

### E13 — strategy recommendation

Prefer per-slice PNG on demand (s1) as the baseline transport. Do not transfer
the whole volume per gesture. Treat prefetch s4 as optional only after another
design/measurement pass; its run-4 p95 was 1,318 ms. Keep mask and mesh as
separate, explicitly sized artifact requests.

## 5. Criteria status

| Criterion | Draft status | Reason |
|---|---|---|
| E1 | measured path confirmed | operator packet confirms Wi-Fi + ZeroTier DIRECT |
| E2–E6, E12 | measured for run 4 | see aggregate table; s1/s4 navigation target fails |
| E7 | `NOT MEASURED` | no app peak-memory instrumentation |
| E8 | partial | one Wi-Fi time window; more windows required |
| E9 | `NOT MEASURED` | physical link-loss/reconnect run still required |
| E10/E11/E13 | draft | owner conclusions above, pending reruns and review |

**Overall:** `NEEDS_FIX` / incomplete evidence. Constraints relaxed: **NONE**.
Before `ACCEPTED`, the owner must supply the missing E7/E9/E8 evidence, rerun
with both real `uint8` A6 payload profiles after the payload PR lands, and hand
this draft to the designated reviewer and QA red team.

## Attachments

- Raw run: `spike-e/evidence-20260913` → `EVIDENCE_RAW/20260913_run4/`
- Aggregation: `management/day05/SPIKE_E_RUN4_AGGREGATE.json`
- Harness: `spike-e/harness-local-retry` @ `2229a740`
- Stub/payload source: this branch under `spikes/spike_e_transport/`
