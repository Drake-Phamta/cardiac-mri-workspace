# `B10`/`B11` session — the parts that do not depend on the protocol

The Spike B owner writes the protocol and interprets the numbers. This folder holds everything else, so that when the protocol lands the session costs minutes rather than an evening: the environment check, the conditions before and after, the capture of whatever the page posts, and the hashes.

**No `B` number is computed here.**

## Two commands

```bash
python management/day09/b10_b11_session/session.py start  --out <dir>
#   ... the leader performs the runs from the owner's protocol ...
python management/day09/b10_b11_session/session.py finish --out <dir>
```

`start` refuses and explains itself when any of this is false: a handset on `adb`, the screen on, the phone unlocked, USB power connected, the app installed, the viewer answering `200` on `http://127.0.0.1:8765/app/` from the workstation, and `adb reverse tcp:8765` in place — it adds the reverse itself if that is the only thing missing. Then it clears the logcat buffer and records the conditions with the existing `spikes/spike_a_2d/harness/capture_conditions.py`, so the device context of a 3D session is written the same way as every Spike A run.

`finish` writes four files beside the state record:

| File | Content |
|---|---|
| `webview_logcat.txt` | every line carrying the `SPIKE_B_WEBVIEW` tag, verbatim |
| `webview_payloads.json` | the JSON objects the page posted, parsed |
| `conditions_before.json` / `conditions_after.json` | memory, battery, thermal and display state around the runs |
| `session_state.json` | preflight result, timestamps, counts and SHA-256 of each file |

If nothing was posted, it says so loudly rather than writing an empty file quietly.

## Verified before it was needed

Rehearsed end to end at 02:02 on 2026-09-18 with no protocol at all: `start` passed the preflight (battery 53 %, USB powered, viewer `200`), the WebView was opened from the 2D screen by `adb shell input tap`, and `finish` recovered **4 tagged log lines and 1 payload** of kind `webview_env`, with both condition files written. The pipeline therefore works; only the owner's probe output is missing from it.

## For the owner's probe

Send results through **`window.ReactNativeWebView.postMessage(JSON.stringify(...))`**. A *download JSON* button does not work inside a WebView, and `console.log` is forwarded but is not the reliable path. Anything posted appears in `webview_payloads.json` exactly as sent.

## Why the leader has to be there

The protocol needs two-finger pan and pinch. `adb shell input` drives a single pointer, so those two gestures cannot be scripted; everything around them is.
