# Spike E — run 1, 2026-09-13 17:51 +07:00 — raw evidence and provenance

| Field | Value |
|---|---|
| **Device operator** | Phạm Tuấn Anh — commands executed by Claude Code on the operator's machine, at his instruction (`DR-006a` revision 2: sole Spike E operator) |
| **Owner who designs and interprets** | Nguyễn Gia Đức Trung |
| Measurement path | Galaxy A17 5G → Viettel cellular → ZeroTier overlay → Mac mini M2 (`cellular-overlay`) |
| **Overlay connection (`E12`)** | **`RELAY`** — read on the Mac mini with `zerotier-cli peers` at 17:51:10 and again at 17:52:53; verbatim in `e12_before.txt` / `e12_after.txt` |
| Repeats | **1** — a first check run, chosen by the operator before spending ~185 MB on the documented 3 |
| Parameters | `--slices 88 --window-radius 2 --repeats 1 --connection relayed` — the harness author's documented defaults otherwise |
| Client harness | `spikes/spike_e_transport/client/android_toybox_harness.sh` from branch `docs/day4-avd-diagnostic` @ `5f15d59b4d3847b9f74ff5e3975ec812e202b4b9`, blob `4de369c8`, sha256 `2B57DD46…A5FD2E` — **not yet reviewed; the branch has no PR** |
| Server | `stub/server.py`, Mac mini repo @ `37877e8`, PID 32227, `--bind 10.64.193.115 --port 8787`, own log file. Trung's instance (PID 60294, old network) untouched |
| Payloads | **SYNTHETIC** — the stub's own manifest says so; shape 576×576×88 is a placeholder until Spike D `A6` |

## The overlay network changed today — why these addresses are new

The project overlay `3b19b3a71652c5f0` is administered from a ZeroTier Central account nobody on the
team could locate, so the phone could not be authorised on it. The leader created network
**`b103a835d292ddb3`** in his own account and authorised three members: his laptop `68efb4de07`
(`10.64.193.145`), the Mac mini `e202ffbfe4` (`10.64.193.115`), and the phone `078280bae8`
(`10.64.193.140`). The Mac mini is still on the old network too; nothing was removed.

## Pre-run conditions, read from the device (`network_before.txt`)

Wi-Fi off · no hotspot address · `tun0 10.64.193.140/24` · route to the Mac mini via `tun0` ·
`getRilDataRadioTechnology=14(LTE)`, NR signal also reported · operator Viettel.
ZeroTier Android's "use mobile data" setting had to be turned on first; before that, ZeroTier stopped
sending entirely when Wi-Fi went off.

## Integrity — counts only, no statistics

| | |
|---|---|
| Client samples | **57** — **30 ok**, **27 failed** |
| Failure mode | every failure is `no HTTP status (nc_rc=1)`, printed live as **`nc: connect: Network is unreachable`** |
| Pattern | failures **interleaved** through the whole run, not one outage — see the owner's own analysis |
| Server side | the stub logged **30** requests from `10.64.193.140` during the run — exactly the successes. **The failed requests never left the phone** |
| Whole-volume request (`cold_open_s3`, 58 MB) | **failed at connect** — no volume transfer is in this run |

**No latency figure is computed or quoted here.** `E1`–`E9` values, `E10` `E11` `E13` and any
conclusion are the owner's.

## Diagnostic follow-ups — NOT evidence, recorded so the owner does not repeat them

Taken right after the run, same path:

- `ping -c 30 -i 1` phone → Mac mini: **30/30 replies, 0 % loss.** ICMP was stable while TCP connects failed.
- 20 back-to-back `toybox nc` connects to `/health`: default 7/10, `-4` 6/10 — IPv6 is not the cause.
- Phone routing: `10.64.193.0/24 dev tun0 table 1040`, uid-range rules to table 1040 present.

The failure is local to the handset's TCP connect over the VPN interface, not the relay path and not
the stub. Why is the owner's question to answer — a harness retry policy, an Android/ZeroTier VPN
behaviour, or something else.

## Files

| File | What it is |
|---|---|
| `e_transport_20260913_run1.jsonl` | client output, pulled from the phone with `adb pull`, **byte-for-byte** |
| `stub_server_log_net_b103a835.jsonl` | the new stub instance's whole log, copied with `scp`, **byte-for-byte**. 46 records: 30 are this run (17:51:41–17:52:38, all `200`); the rest are the pre-check, the diagnostic probe and 2 `/health` checks from the laptop — kept, not filtered |
| `e12_before.txt` · `e12_after.txt` · `network_before.txt` | **transcripts** of command output captured on the operator's machine; re-encoded to UTF-8 / LF, content unchanged |
| `android_toybox_harness.sh` | the exact bytes that ran (`git cat-file` of the pinned blob) |
