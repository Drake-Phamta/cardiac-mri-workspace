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

These E4 values are uncached workstation HTTP measurements, not the cached
slice-switching test on the target demo device required by `NFR-PERF-001`, so
they do not establish an `NFR-PERF-001` pass/fail. E4 itself does fail for the
candidate prefetch strategy: s4 p95 is 1,318 ms versus 504 ms for per-slice
s1. Keep the tail and label the finding honestly; do not relabel it as an NFR
result.

## 3A. 2026-09-16 evening capture (profile-separated)

The raw packet is on `spike-e/evidence-20260916` at commit `c3c2ab5`.
`aggregate.py` was run separately for each profile against its own JSONL; the
profiles below are not pooled. Both files contain 171/171 successful samples,
0 truncated bodies, 0 local-connect rejections, `wifi-overlay`,
`overlay_connection: direct`, and the same operator/owner provenance. Payloads
are synthetic A6-shaped bytes, so these are transport measurements only.

### Profile `576x576x88` (29,196,288-byte volume)

| Criterion / scenario | Requests | Mean KB | p50 ms | p95 ms | Max ms |
|---|---:|---:|---:|---:|---:|
| E2 cold open s1 | 3 | 183.62 | 1,126 | 3,103 | 3,103 |
| E2 cold open s3 | 3 | 28,512.0 | 338,905 | 534,277 | 534,277 |
| E2 cold open s4 | 3 | 917.16 | 5,933 | 14,123 | 14,123 |
| E3 uncached slice s1 | 39 | 152.46 | 1,062 | 3,326 | 6,939 |
| E4 navigation s1 | 60 | 175.22 | 1,001 | 2,864 | 5,222 |
| E4 navigation s4 | 12 | 887.08 | 4,175 | 28,606 | 28,606 |
| E5 mask s2 | 39 | 40.50 | 386 | 1,381 | 3,218 |
| E6 mesh levels 0/1/2/3 | 12 | 7.25/29.70/124.80/513.93 | 261/240/414/2,629 | 323/571/1,104/6,792 | 323/571/1,104/6,792 |

### Profile `640x640x88` (36,044,800-byte volume)

| Criterion / scenario | Requests | Mean KB | p50 ms | p95 ms | Max ms |
|---|---:|---:|---:|---:|---:|
| E2 cold open s1 | 3 | 225.65 | 597 | 1,058 | 1,058 |
| E2 cold open s3 | 3 | 35,200.0 | 121,447 | 203,697 | 203,697 |
| E2 cold open s4 | 3 | 1,127.94 | 2,114 | 4,137 | 4,137 |
| E3 uncached slice s1 | 39 | 187.84 | 683 | 2,646 | 5,137 |
| E4 navigation s1 | 60 | 215.65 | 627 | 1,844 | 4,629 |
| E4 navigation s4 | 12 | 1,091.51 | 2,485 | 6,181 | 6,181 |
| E5 mask s2 | 39 | 50.00 | 311 | 812 | 1,147 |
| E6 mesh levels 0/1/2/3 | 12 | 7.25/29.70/124.80/513.93 | 288/270/402/1,043 | 321/310/402/1,399 | 321/310/402/1,399 |

For both profiles, E4's candidate prefetch strategy fails its own comparison:
s4 is slower than the corresponding uncached per-slice s1 (p95 **28,606** vs
**2,864** ms for 576 and **6,181** vs **1,844** ms for 640). These are uncached
workstation HTTP measurements, so they do not establish an `NFR-PERF-001`
pass/fail; that frozen requirement covers cached target-device navigation.
Whole-volume s3 independently violates limb 2 of `NFR-PERF-001`, while the
uncached first-load path has no bound and remains `RA-H13` / `DR-015`. E12 is
observed as `DIRECT` from the phone to the Mac mini during the capture. E8 remains partial:
this is one evening window (the run began at 21:50, outside the planned
21:00 +/- 15-minute window), so no time-of-day spread claim is made.

## 3B. E7 app-memory measurement plan (not measured by this transport run)

`E7` requires the real Spike A/B application on Galaxy A17; the Toybox
transport harness and the synthetic stub do not measure app memory. When the
leader has the release build, run each strategy/profile separately and retain
raw command output:

```powershell
$package = '<reviewed.application.id>'
& $adb shell dumpsys meminfo -d $package > e7-baseline.txt
# open one case, load the first slice, navigate 10 slices, open the mask/mesh,
# wait 30 s idle, then repeat the same sequence five times
& $adb shell dumpsys meminfo -d $package > e7-after-<strategy>-<profile>.txt
& $adb shell pidof $package
```

Record at baseline, after first load, after navigation, after mask/mesh, after
30 seconds idle, and after the fifth repetition: total PSS, native/graphics
PSS, Java heap, the device-reported memory class/limit, process restarts, OOM
or low-memory events, and the app build/profile. Repeat for per-slice (`s1`),
prefetch (`s4`), whole-volume (`s3`, if exercised), and mesh paths; do not
pool profiles.

Provisional triage thresholds (not an acceptance verdict) are: **critical** if
the app is killed/OOMs or the total PSS reaches 85% of the device-reported
memory class; **warning** at 70%, or when post-idle PSS remains more than 20%
above baseline after five repetitions. These thresholds are deliberately
reported with the device limit and raw PSS because Java memory class is not a
substitute for native/graphics accounting. E7 remains `NOT MEASURED` until a
real app run supplies the evidence and the owner/leader accepts the threshold.

## 4. Draft conclusions (not final acceptance)

### E10 — first-load budget

**Provisional proposal:** target ≤1,000 ms p95 to the first usable per-slice
PNG on `wifi-overlay`, subject to confirmation over several times of day and
both A6 payload profiles. The run measured s1 at 445 ms p95 for the cold-open
sample; the whole-volume strategy is not viable for first load (101,698 ms p95).
This target is a proposal, not a frozen NFR. **It is withdrawn as an
acceptance threshold pending DR-015.** Run-4 measured 445 ms p95, while the
2026-09-16 evening capture measured 3,103 ms (`576x576x88`) and 1,058 ms
(`640x640x88`) for cold-open s1. The eventual `TC-PERF-FIRSTLOAD-01` must
declare the clock start/end event, device/build/uplink/profile, p50 and p95,
keep the two profiles separate, and state the missing daytime E8 window. No
number here is a frozen NFR or acceptance verdict.

### E11 — minimal connectivity fallback

**Draft set:** one representative hero slice (`s1`), its corresponding mask
(`s2`), and the lowest required mesh level (`mesh/0.obj`) for the hero flow.
The exact on-device size and preload mechanism are **NOT MEASURED** here and
must be measured on the physical app. This remains a demo-resilience aid, not
full offline mode or backend-on-phone.

### E13 — strategy recommendation

Prefer per-slice PNG on demand (s1) as the V1 baseline. DR-015 rejects
whole-volume transfer (`s3`) for first load because its evening p50 was
338,905 ms and 121,447 ms across the two profiles, and it independently
violates limb 2 of `NFR-PERF-001`. The measured prefetch window (`s4`) is also
rejected for V1: its evening p95 was 28,606 ms and 6,181 ms, slower than the
corresponding uncached per-slice path. Keep mask and mesh as separate,
explicitly sized artifact requests. A versioned artifact URL remains open for
a future implementation because it has not been measured here.

## 5. Criteria status

| Criterion | Draft status | Reason |
|---|---|---|
| E1 | measured path confirmed | operator packet confirms Wi-Fi + ZeroTier DIRECT |
| E2-E6, E12 | measured for run 4 and the 2026-09-16 two-profile capture | profile-separated tables above; E4 target fails; E12 is DIRECT |
| E7 | `NOT MEASURED` | no app peak-memory instrumentation |
| E8 | partial | one evening Wi-Fi time window only; more windows required |
| E9 | `NOT MEASURED` | physical link-loss/reconnect run still required |
| E10/E11/E13 | draft | owner conclusions above, pending reruns and review |

**Overall:** `NEEDS_FIX` / incomplete evidence. Constraints relaxed: **NONE**.
The 2026-09-16 two-profile packet closes the requested E2-E6/E12 aggregation
without mixing profiles, but it does not close E7, E9, or E8. Before
`ACCEPTED`, the owner must supply app-memory and reconnect evidence, add more
time windows for E8, and hand this draft to the designated reviewer and QA red
team.

## Attachments

- Raw run: `spike-e/evidence-20260913` → `EVIDENCE_RAW/20260913_run4/`
- Raw run: `spike-e/evidence-20260916` @ `c3c2ab5` → `EVIDENCE_RAW/20260916_evening/`
- Aggregation: `management/day05/SPIKE_E_RUN4_AGGREGATE.json`
- Harness: `spike-e/harness-local-retry` @ `2229a740`
- Stub/payload source: this branch under `spikes/spike_e_transport/`
