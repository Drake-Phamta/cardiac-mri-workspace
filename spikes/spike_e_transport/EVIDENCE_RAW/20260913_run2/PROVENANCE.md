# Spike E — run 2, 2026-09-13 18:18 +07:00 — STOPPED by the operator — raw evidence

| Field | Value |
|---|---|
| **Device operator** | Phạm Tuấn Anh — commands executed by Claude Code on the operator's machine, at his instruction (`DR-006a` rev 2) |
| **Owner who designs and interprets** | Nguyễn Gia Đức Trung |
| Path | Galaxy A17 → Viettel cellular (`getRilDataRadioTechnology=14(LTE)`) → ZeroTier `b103a835d292ddb3` → Mac mini `10.64.193.115:8787` |
| **`E12`** | **`RELAY`** at 18:18:15 (`e12_before.txt`) |
| Purpose | one repeat to check the local-connect-rejection fix end to end, including the 58 MB request run 1 never completed |
| Harness | branch `spike-e/harness-local-retry` @ `3e2d5bd9a9d4b39d8edb3ccc4798b1a5d56756c2` (PR #22, **unreviewed**), sha256 `19BE7D9D…5AE3FB`, exact bytes included |
| Pre-check 18:17:57 | Wi-Fi off, no hotspot, `tun0 10.64.193.140`, route via `tun0`, `/health` 200 over the overlay; ping 3/5 |

## What happened — raw, in order

| Time | Event |
|---|---|
| 18:18:26 | run header written |
| 18:18:50 | sample 1 — `cold_open_s1`, one slice — **ok**, recorded (see the JSONL for bytes and time) |
| 18:18:50 | request 2 — `cold_open_s3`, the whole volume — server sent `200`, `Content-Length: 58392576`, `X-Server-Handling-Ms: 34.130` |
| 18:28 | 1 943 091 body+header bytes on the phone |
| 18:29:05 → 18:30:06 | 1 954 083 → 1 962 327 bytes (8 244 bytes in that minute) |
| **18:30:32** | **stopped by the operator** at 2 201 403 bytes — the approved scope was one quick check run, and at the observed rate the rest of the body would have taken far longer than any session |

`abort_snapshot.txt` holds the exact bytes-on-disk, the response headers as received, and the process
list at the moment of stopping. The partial body is synthetic stub payload and is **not** committed.

**Because the process was stopped, request 2 has no sample line in the JSONL.** That is deliberate:
this harness version would have recorded a cut-off body as `ok: true` (fixed afterwards in PR #22,
`a14d87f` — `bytes_received` and a truncation check), so letting it finish the line would have
written a false success.

## What this run shows, stated as observations — the analysis is the owner's

- The local-connect-rejection fix was not exercised: sample 1 needed no retry.
- Over this **relayed** path, bulk transfer ran at a few kilobytes per minute to a few kilobytes per
  second, while the stub handled the request in 34 ms. The bottleneck is the relay, not the server.
- Laptop ↔ Mac mini is `DIRECT` on the same overlay; phone ↔ Mac mini is `RELAY`. The Mac mini has port
  mapping enabled (`surfaceAddresses` on `103.238.69.131`) but no global IPv6; the phone has global
  IPv6 on Viettel. A direct phone path would need the Mac mini's network to accept inbound UDP to
  ZeroTier (port forward or working UPnP / NAT-PMP) or to offer IPv6.

No latency or throughput figure is computed here for any `E` criterion.

## Files

| File | What it is |
|---|---|
| `e_transport_20260913_run2.jsonl` | client output, `adb pull`, byte-for-byte — header + 1 sample |
| `abort_snapshot.txt` | transcript taken on the phone the second before stopping |
| `e12_before.txt` · `network_before.txt` | transcripts, UTF-8 / LF |
| `android_toybox_harness.sh` | the exact bytes that ran |
| `stub_server_log_net_b103a835.jsonl` | the stub instance's whole log since it started, `scp`, byte-for-byte — includes run 1 and the diagnostics |
