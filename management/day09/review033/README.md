# Review suite for PR #33: Spike E `E9` controlled reconnect drill

Reviewer: Project Control, on behalf of the leader (Phạm Tuấn Anh). Head reviewed: `fdf6d48c`. Date: 2026-09-18, 01:30–02:10 +07.

The retry code was reviewed by **running it on the Galaxy A17**, not by reading it. Every number below comes from a run recorded in `runs_json/`.

## How the drill was exercised without touching a link

A real `E9` run toggles the phone's Wi-Fi, which makes it Spike E evidence and belongs to the owner and the leader. This review needed only the mechanism, so the harness talks to a **canned HTTP responder on the phone's own loopback** (`toybox nc -L`), and the "link loss" is that responder being stopped and restarted (`listener_ctl.sh`). What the harness sees is what a dead link gives it: a TCP failure with no HTTP response.

The cut is triggered from the JSONL line count on the device, not from the harness's stderr marker: `adb` buffers that stream, so the marker can arrive after the pause is already over. That mistake produced two runs with `network_retries: 0` before it was found; both are kept out of the record because they measure the harness of this review, not the PR.

```text
python reconnect_drill.py <harness.sh> <out dir> [retries] [pause_s] [loss_s]
```

## Results

| Run | Flags | What came back |
|---|---|---|
| **control** (`runs_json/control_and_404.json`) | none of the new flags | 57 samples, all `status 200`, **`attempts: 1`, `network_retries: 0`**, `body_sha256` null. The default path is unchanged |
| **HTTP error** (`runs_json/control_and_404.json`) | `--network-retries 8` against a 404 responder | 57 samples, all `status 404`, **`attempts: 1`, `network_retries: 0`**. HTTP errors are not retried, as the PR says |
| **recovery** (`runs_json/recovery.json`) | `--network-retries 8 --retry-delay 1 --pause-before-mesh 5 --body-hash`, responder down 8.09 s | `mesh_level_0`: **`ok: true`, `attempts: 4`, `network_retries: 3`**, `bytes_received == bytes`, 64-char `body_sha256`, `ms_total 131`, `ms_including_local_rejections 3850`. The other 56 samples stay at `attempts: 1` |
| **bounded** (`runs_json/exhaustion.json`) | `--network-retries 2`, responder down 15.06 s | `mesh_level_0..2`: `ok: false`, **`attempts: 3` exactly**, error `no HTTP status (nc_rc=1; nc: connect: Connection refused)`, and the run continued. `mesh_level_3` recovered by itself at `attempts: 2`. No infinite retry, and a failed recovery keeps its evidence |

## What this says about the PR

The retry code does what the PR description claims, under all four conditions. The findings that remain are in the **procedure document**, and one is blocking for the person who has to run it. They are written up in the review on the PR.

## What this suite does not show

- No `E9` number, no Spike E evidence: a loopback responder is not a link, and the payload is 19 bytes.
- It does not exercise a loss **after** the first byte. The retry covers only a failure with no HTTP response, which is correct, but a mid-transfer drop lands as a truncated sample instead.
- It ran once per condition on one handset.
