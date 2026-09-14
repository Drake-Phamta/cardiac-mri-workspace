# Spike E — measurement plan for the leader

Owner: Nguyen Gia Duc Trung. Device operator: Pham Tuan Anh under DR-006a
revision 2. Reviewer: Vu Hung Anh. This is a plan, not measurement evidence.

## Acceptance runs after the payload PR lands

Run the same harness design for each A6 profile, with one profile selected by
the stub query (`?profile=...`):

| Window | Profile | Repeats | Path / connection |
|---|---|---:|---|
| 09:00 ± 15 min | `576x576x88` | 3 | `wifi-overlay`, record `direct` or `relayed` |
| 09:00 ± 15 min | `640x640x88` | 3 | same session conditions |
| 15:00 ± 15 min | `576x576x88` | 3 | record actual E12 state |
| 15:00 ± 15 min | `640x640x88` | 3 | record actual E12 state |
| 21:00 ± 15 min | `576x576x88` | 3 | record actual E12 state |
| 21:00 ± 15 min | `640x640x88` | 3 | record actual E12 state |

Each harness run is 57 requests × 3 repeats. The six runs provide three
time-of-day windows for E8 and both real A6 byte profiles. Do not merge runs
with different `measurement_path` or `overlay_connection`; aggregate each
group separately and compare the distributions.

If ZeroTier is relayed, keep that run and label it `relayed`; do not retry until
it becomes direct and silently overwrite the evidence. Record carrier/network
technology, Wi-Fi SSID/RSSI or cellular signal, location, battery/power,
thermal state, background load, and server commit in every packet.

## E7 and E9 additions

- Repeat the app-side memory capture for each profile and strategy; the client
  harness cannot measure peak app memory. Record peak MB and build/thermal state.
- Run one controlled reconnect test for a slice and one for a mesh transfer.
  Record link-loss action, recovery time, retry count, idempotence, and UI
  recoverable-error state. A LAN/AVD rehearsal is diagnostic only and cannot
  fill E9 acceptance evidence.

## Commands

```bash
python client/harness.py --base http://<zerotier>:8787 \
  --path wifi-overlay --connection direct \
  --operator "Pham Tuan Anh" --owner "Nguyen Gia Duc Trung" \
  --profile 576x576x88 --slices 88 --repeats 3 \
  --note "window, location, signal, thermal"
```

Use `--profile 640x640x88` for the second profile. Never hand-edit a raw JSONL
record after capture.
