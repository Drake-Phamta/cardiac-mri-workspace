# Day 4 — Nguyễn Gia Đức Trung · progress snapshot

**Snapshot:** 2026-09-13 12:59 (+07:00)
**Base revision:** `37877e8`  
**Working branch:** `docs/day4-avd-diagnostic`

This is an execution snapshot for Trung's Day 4 packet. It does not change
Project Control's canonical state file and does not promote diagnostic data to
Spike E acceptance evidence.

## Completed locally

| Day 4 item | Evidence | Status |
|---|---|---|
| Start the Mac Mini backend stub | `server.py` is running as PID `60294`, bound to `10.134.129.115:8787`; `/health` returned `200` | **DONE locally** |
| Formal `GATE 2` reachability check | Leader verified `/health` and `/mesh/0.obj` with `HTTP 200` from his laptop over ZeroTier at 12:35 | **DONE** |
| Verify representative transport endpoints from the Mac Mini AVD | Eight endpoints returned `HTTP 200`; results are in [`../spikes/SPIKE_E_TRANSPORT/AVD_DIAGNOSTIC_20260913.md`](../spikes/SPIKE_E_TRANSPORT/AVD_DIAGNOSTIC_20260913.md) | **DONE as diagnostic only** |
| Keep diagnostic output separate from acceptance evidence | No AVD output was added to `EVIDENCE_RAW`; no `RESULT.md` was created | **DONE** |

The local health check and AVD run prove that the stub process and payloads are
usable. They do not, by themselves, prove that a different ZeroTier peer (the
leader or the physical phone) can reach the stub.

## Leader update received at 12:35 (+07:00)

The leader subsequently verified `/health` and `/mesh/0.obj` with `HTTP 200`
from his own laptop over ZeroTier. This closes the formal **GATE 2** reachability
check; the earlier local-only caveat above is retained as historical context.

The Galaxy A17 now has ZeroTier installed (`1.16.0`, node
`97828bea8e`), but its member is still **Access Denied** and therefore has not
been authorised on network `3b19b3a71652c5f0`. The leader's node
`68efb4de07` is only the control path; `E12` must be read from the phone node's
row on the Mac Mini after authorisation.

The remote ADB helper is present in `tools/remote_adb/`, but the leader's ADB
server is not listening yet. A local check of
`adb -H 10.134.129.145 -P 5037 devices -l` currently fails with connection
timeout; retry only after the leader starts the server.

## Still blocked by another device or person

| Day 4 item | Why it cannot be closed locally |
|---|---|
| Identify the phone's `DIRECT`/`RELAY` row for `E12` | The phone node `97828bea8e` is installed but still **Access Denied**; it must be authorised first |
| Install and enable ZeroTier on the Galaxy A17 | Installation is done; network authorisation is still pending |
| Remote measurement setup through ADB | Helper is ready; the leader's ADB server is not listening yet |
| `E1`–`E9` and `E12` acceptance measurements | Must run on Galaxy A17 over real cellular + ZeroTier; AVD/LAN numbers are diagnostic only |
| Submit the Day 4 GitHub review of PR #14 or #15 | A static review can be prepared locally, but submitting `APPROVE`/`REQUEST CHANGES` requires GitHub review access and the chosen PR |

### Static review prepared for PR #14

For the fetched head `3bf2a8083fa584024363556d7ebe1baa55419b61`,
`tools/dataset_validate/dataset_scan.py::_compare()` sets
`resampling_required = False` whenever shape and spacing match. It records
`origin_equal` but does not use it, and it does not compare
`space_directions`. A pair with equal shape/spacing but a different origin or
direction matrix would therefore be reported as requiring no transform, which
conflicts with `docs/specs/v1.0/06_DATASET_CONTRACT.md` §4.

This is a genuine review finding, not an approval. It has **not** been posted to
GitHub from this workspace because no GitHub review credential is available;
the PR author should make the fix and then the review can be submitted through
GitHub.

## Important acceptance boundary

The current Spike E rule remains:

```text
Galaxy A17 → real 4G/5G → ZeroTier overlay → Mac Mini
```

The AVD record is supplementary troubleshooting evidence. It must not be used
to mark `E1`, `E7`, `E8`, `E9`, or `E12` as passed, open the acceptance gate, or
create `RESULT.md`.
