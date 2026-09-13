# Spike E — run 4, 2026-09-13 19:12 +07:00 — full design, three repeats, DR-003b path — raw evidence

| Field | Value |
|---|---|
| **Device operator** | Phạm Tuấn Anh — commands executed by Claude Code on the operator's machine, at his instruction (`DR-006a` rev 2) |
| **Owner who designs and interprets** | Nguyễn Gia Đức Trung |
| **Path** | Galaxy A17 → Wi-Fi `TP-Link_BC4C` (leader's home; 802.11n, RSSI −41, link 72 Mbps at 19:12:09 — `network_before.txt`) → Internet → ZeroTier `b103a835d292ddb3` → remote Mac mini `10.64.193.115:8787` — **`wifi-overlay`** (DR-003b) |
| Not the Mac mini's LAN | phone `192.168.0.102`; Mac mini LAN `10.170.75.0/24` |
| **`E12`** | **`DIRECT`** before (19:12, `e12_before.txt`) and after (19:19:33, `e12_after.txt`), peer path `171.224.180.45/19136` |
| Design | the harness author's documented defaults: `--slices 88 --window-radius 2 --repeats 3` |
| Harness | `spike-e/harness-local-retry` @ `2229a740e3022ed900b0733f7481d9f7f03e6839` (PR #22, **unreviewed**) — same bytes as run 3, sha256 `12CEC9E8…751BF9` |
| Server | stub PID 32227, `--bind 10.64.193.115`, Mac mini repo @ `37877e8`; payloads **SYNTHETIC** |
| Wall time | 19:12:21 → 19:19:34, 432 s |

## Integrity — counts only, no statistics

| | |
|---|---|
| Samples | **171 — 171 ok, 0 failed** — 57 per repeat × 3 |
| Per criterion | E2 9 · E3 39 · E4 72 · E5 39 · E6 12 |
| Local connect rejections | **0** |
| `bytes_received` ≠ `Content-Length` | **0 samples** |
| Whole volume (`cold_open_s3`) | **3 of 3 complete — 58 392 576 of 58 392 576 bytes each** |
| Client vs server | the stub logged **171** responses to `10.64.193.140` inside the run's own time span, and **every path matches the client's count**. Run 3: 57 and 57 likewise |

A first count against a wall-clock window taken on the laptop showed 170 and 56 — off by one each —
because the phone's clock and the laptop's differ by about a second and the first request fell outside
that window. Counting against the run's own sample timestamps gives an exact match. Recorded so the
discrepancy is not rediscovered and mistaken for lost data.

**No latency or throughput figure is computed here.** Under `DR-006a` rev 2, constraint (c), the owner
re-runs `analyze/aggregate.py` on this file himself (with PR #23, which accepts `wifi-overlay`), and
`E10` `E11` `E13` are his.

## Files

`e_transport_20260913_run4.jsonl` (client, `adb pull`, byte-for-byte) · `stub_server_log_net_b103a835.jsonl`
(the stub instance's whole log since it started, `scp`, byte-for-byte — runs 1–4 and all diagnostics) ·
`precheck.txt` · `network_before.txt` · `e12_before.txt` · `e12_after.txt` · `android_toybox_harness.sh`.
