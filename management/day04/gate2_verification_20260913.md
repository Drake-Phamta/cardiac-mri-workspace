# GATE 2 — stub reachability verified from the leader's peer · 2026-09-13

**Observer:** Phạm Tuấn Anh (leader machine), run by Project Control.
**Why the leader and not the owner:** Nguyễn Gia Đức Trung asked for exactly this — his own checks
ran from his side of the overlay, and the gate needs the stub reachable from *another* peer.

> **DIAGNOSTIC — NOT ACCEPTANCE EVIDENCE.** This is a desktop on home Wi-Fi reaching the Mac mini
> over ZeroTier. `SPIKE_E_TRANSPORT/TASK.md` requires *Galaxy A17 → real cellular → ZeroTier →
> Mac mini* for every acceptance number. Nothing below goes into `EVIDENCE_RAW/` or a `RESULT.md`,
> and the latencies below must not be quoted as `E1`–`E9` values.

## What the gate asks

`SPIKE_PHASE_STATE.yaml` → `device_measurement_queue.order[slot 2].entry_gate`:
*"backend stub reachable AND overlay up"*.

## Observed

```text
2026-09-13T12:35:00+07:00

Test-NetConnection 10.134.129.115 -Port 8787
  InterfaceAlias   : ZeroTier One [3b19b3a71652c5f0]
  SourceAddress    : 10.134.129.145          <- leader machine, on the overlay
  TcpTestSucceeded : True

GET http://10.134.129.115:8787/health  -> 200, 2710 bytes
  Server: SpikeEStub/0 Python/3.9.6
  "status": "up"
  payload_manifest._status: "SYNTHETIC PAYLOADS - not dataset bytes, not acceptance evidence"
  shape_xyz [576, 576, 88], seed 2024, 4 mesh levels

GET /mesh/0.obj                        -> 200, 7429 bytes  (matches manifest size_bytes)
```

`/mesh/0.obj` returning 200 with the manifest's exact size is worth noting on its own: before
Trung's fix in `03147e3` the generator produced `meshes: []` and this route returned **404**.
The fix works on the live stub, not only in the diff.

10 sequential `GET /health` from PowerShell `Invoke-WebRequest`, ms:
`115, 110, 109, 106, 114, 117, 109, 109, 107, 110` — **includes PowerShell's own per-call
overhead**, desktop path, Wi-Fi. Recorded only to show the path is stable. Not a transport number.

## Verdict on the gate

| Entry condition | State | Basis |
|---|---|---|
| Overlay up | ✅ | ZeroTier interface up on both peers; TCP over `ZeroTier One [3b19b3a71652c5f0]` |
| Backend stub reachable | ✅ | 200 from a peer other than the Mac mini itself |
| **`GATE 2` entry** | ✅ **OPEN** | both conditions met, observed, timestamped |

## What an open gate does NOT mean

Opening `GATE 2` lets Spike E take a device measurement window. It measures nothing yet. Still
required before any `E` criterion can be recorded:

1. **ZeroTier on the Galaxy A17** — still absent. The phone reached the Mac mini with **100 % loss**
   when last checked (`DR-006a` revision 1). USB is the control channel only.
2. The phone's ZeroTier node **authorised** on network `3b19b3a71652c5f0` by whoever administers it.
3. An HTTP client on the phone — the handset has **no Python, Termux, `curl` or `wget`**.
4. The remote control route for the owner (`tools/remote_adb/`), so Trung operates it himself.

## For `E12` — which peer to read

`E12` is *"direct-vs-relayed overlay connection recorded for every measurement"*. The measured path
is **phone → Mac mini**, so the peer that answers `E12` is **the phone's node**, once it exists.

| Node | ZeroTier ID | Relevant to |
|---|---|---|
| Leader machine | `68efb4de07` | the **control** path (remote adb) and this diagnostic — **not** `E12` |
| Galaxy A17 | *(not installed yet)* | **`E12`** |

On the Mac mini: `sudo zerotier-cli peers`, find the row whose first column is the node ID, read the
last column: `DIRECT` or `RELAY`.
