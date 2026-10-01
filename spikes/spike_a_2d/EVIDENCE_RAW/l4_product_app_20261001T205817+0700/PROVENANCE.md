# PROVENANCE — L4 (`NFR-PERF-001` limb 2) in the product app, 2026-10-01

Spike A could not measure "a slice gesture never triggers a full-volume transfer". Its fixture was local, with no network path (QA-004, L4). This folder holds that measurement. It was taken in the product app (V1 SCR-03, PR #77) on the A17, against the real backend on the Mac mini.

| Role | Person |
|---|---|
| Operator | **The leader's Claude session, driving the phone through `adb` (`input tap`, `input swipe`) at Phạm Tuấn Anh's request**. He had connected the phone and was present, and did not touch it during the run. The L4 run itself is the app's own scripted 15 + 15 pass. |
| Spike A owner | Phạm Tuấn Anh |
| Reviewer | Vũ Hùng Anh, to revalidate on Day 23 |

| Field | Value |
|---|---|
| **Device** | Galaxy A17 5G SM-A176B, Android 16. The serial is not recorded |
| **Network path** | Wi-Fi + ZeroTier overlay. No addresses are recorded |
| **APK** | `cardiac-mri-workspace-live-20261001-194641.apk`, SHA-256 `4a66a5284aee713f826628fce663674a7c05abcaf676da5e644f4937fe100d5a`, release (Hermes), built from `ffbf7637279673c4781e3a5f947bdf552a411052`, the last code change. The build sidecar is in `apk_build_record.txt`, with `api_base_url` redacted. The sidecar's `built_at` comes from the build PC's clock, which was about 66 minutes slow (see "Clocks") |
| **Backend** | Contract 1.1.0, from `main` `985c9c3`. 21 cases, 0 runs |
| **Preflight** | `PREFLIGHT PASS`, P1–P6, run before the session (`preflight.txt`) |
| **Case and scope** | CASE_0061 (EVALUATION), slice 45 → 59 → 45, ground-truth overlay ON. No analysis run is ingested, so the scope is MRI + ground truth (+ mask bytes). **Prediction transfers are not covered** |
| **Run window (phone and server clock, +07)** | `new-15` 20:58:17.474 → 20:58:31.370 · `revisit-15` 20:58:31.371 → 20:58:37.821 |

## Verdict

**L4 PASS** (`l4_report.txt`, rules R1–R8):

| Measure | Result |
|---|---|
| Gestures | 15 new + 15 revisit; 0 superseded; 0 step timeouts |
| Bytes per new-slice switch | p50 153.5 KB, p95 155.1 KB, max 155.1 KB |
| Revisits | 15 of 15 are cache hits at 0 bytes |
| Largest single response | 153.2 KB (one MRI slice PNG) |
| Full-volume reference | One full volume ≈ 88 × 153.5 KB = 13,508 KB; the largest switch is 1.1 % of it |

**The server's own count agrees** (`server_summary.txt`, from the backend request log since 12:50:30Z):
- 16 slice switches: the opening slice plus 15 new;
- 64 requests;
- bytes per switch p50 157,176 B, max 158,797 B;
- the largest response is 156,856 B;
- 0.54 % of one raw uint8 volume (29,196,288 B).

It saw no request during the revisit pass.

## Deviations, recorded

1. **The APK first named for this session crashed at start.** The build was `cardiac-mri-workspace-live-20261001-141939.apk`, from `0bfaba3`. On Hermes it failed with `RangeError: Unknown encoding: latin1`, because `fast-png` builds `new TextDecoder('latin1')` at module load and Hermes' TextDecoder decodes UTF-8 only.
   - The fix is `ffbf763` (PR #77): a latin1 shim imported first, with a test that reproduces the error.
   - The APK was rebuilt and L4 was measured on that build.
   - The crashed attempt's log is kept outside git (hash below). It contains only the three crash lines.
2. **The operator was the leader's session through `adb`**, not a finger on the glass. This does not change what L4 measures: the slice gestures are the app's scripted pass in both cases.
3. **Clocks.** The phone and the Mac mini agree (21:00:08 and 21:00:07 at the same moment). The workstation that ran the session was about 66 minutes slow after a restart at about 20:42 real time, because its time service was not running. Every time in this file is phone or server time. The two outside-git log files keep their own clocks.

## Files

| File | What |
|---|---|
| `S1_L4_logcat.txt` | The phone's `ReactNativeJS` log for the session (`CMW_GESTURE`, `CMW_SLICE`, `CMW_RUN_*`). The app never logs a URL, host or payload |
| `l4_report.txt` | `node --no-warnings mobile/scripts/l4-report.mjs S1_L4_logcat.txt` |
| `server_summary.txt` | `python backend/scripts/summarize_request_log.py --since 2026-10-01T12:50:30Z` over the backend request log; aggregates only |
| `apk_build_record.txt` | The APK's `.build.txt`, with `api_base_url` redacted |
| `preflight.txt` | The preflight lines, from `preflight:` to `PREFLIGHT PASS` |

## Kept outside git

These contain the phone's overlay address or duplicate the above:

| File | Bytes | SHA-256 |
|---|---:|---|
| `requests.jsonl` (backend request log) | 43,070 | `44f42c6bc67449e03206b40925c3c8587fe94c728c7d55591444262d22e45190` |
| `uvicorn.log` | 20,830 | `617b573ad7d0250122aa49d025d211f22a889a85a0ab726fc509eb8a0a9ba956` |
| `S1_L4_logcat_dump.txt` (buffer dump, same window) | 25,388 | `30603ebc64b35715ca9d678e36d11cf9c8b85a9482f5ae3238b62d3e0dd08c0b` |
| `S1_L4_logcat_crashed_apk_0bfaba3.txt` | 974 | `e0a614eab8653f9d686640be7b260c0fa1dfc2af00f6fe3ef6ddc8dde0200517` |
