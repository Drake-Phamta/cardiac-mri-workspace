# Spike E — run 3, 2026-09-13 19:09 +07:00 — first run on the DR-003b path — raw evidence

| Field | Value |
|---|---|
| **Device operator** | Phạm Tuấn Anh — commands executed by Claude Code on the operator's machine, at his instruction (`DR-006a` rev 2) |
| **Owner who designs and interprets** | Nguyễn Gia Đức Trung |
| **Path** | Galaxy A17 → Wi-Fi `TP-Link_BC4C` (leader's home, `192.168.0.102`) → Internet → ZeroTier `b103a835d292ddb3` → remote Mac mini `10.64.193.115:8787` — **`wifi-overlay`**, the acceptance path under **DR-003b** |
| Not the Mac mini's LAN | the phone was on `192.168.0.0/24`; the Mac mini's LAN is `10.170.75.0/24` — this is a WAN path, not `lan-diagnostic` |
| **`E12`** | **`DIRECT`** before (19:08:49, in `precheck.txt`) and after (19:11:25, `e12_after.txt`) — peer path `171.224.180.45/19136` |
| Repeats | **1** — a check run before the full three |
| Parameters | `--slices 88 --window-radius 2 --repeats 1 --connection direct` |
| Harness | branch `spike-e/harness-local-retry` @ `2229a740e3022ed900b0733f7481d9f7f03e6839` (PR #22, **unreviewed**; includes the local-rejection retry, the truncation check and the `wifi-overlay` label), sha256 `12CEC9E8…751BF9`, exact bytes included |
| Server | stub PID 32227 on the Mac mini, bound to `10.64.193.115`, repo @ `37877e8`; payloads **SYNTHETIC** |

## Getting onto Wi-Fi took a manual step

After Wi-Fi was turned on, ZeroTier on the phone kept sending to a root and received nothing for over
two minutes (19:03–19:05, E12 stayed at a stale `RELAY -1`). Toggling the network off and on in the
ZeroTier app restored it at 19:08, `DIRECT`. The same thing happened earlier the other way (Wi-Fi →
cellular). **ZeroTier on this Android phone did not recover by itself after an underlay change** — a
demo-day risk for the owner's analysis.

## Integrity — counts only, no statistics

| | |
|---|---|
| Samples | **57 — 57 ok, 0 failed** |
| Local connect rejections | **0** (the VPN had just been re-created; the per-CPU cache fault may still recur, and would be counted) |
| `bytes_received` ≠ `Content-Length` | **0 samples** |
| Whole volume (`cold_open_s3`) | **58 392 576 of 58 392 576 bytes**, ok |
| Wall time | 136 s for the run |

No latency figure is computed here. `E1`–`E9` values, `E10` `E11` `E13` and the interpretation are the
owner's.

## Files

`e_transport_20260913_run3.jsonl` (client, `adb pull`, byte-for-byte) · `precheck.txt` (the pre-run
checklist output, including the Wi-Fi status and `E12`) · `e12_after.txt` · `android_toybox_harness.sh`
(the exact bytes that ran). The stub's server log is committed with run 4, which follows directly.
