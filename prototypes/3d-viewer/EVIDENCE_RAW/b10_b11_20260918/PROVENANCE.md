# PROVENANCE — `B10`/`B11` session, 2026-09-18 evening

**Raw data only. No Spike B number is derived here.** `B10` and `B11` are interpreted by the Spike B owner, **Vũ Hùng Anh**, in `RESULT.md`, per `spikes/spike_b_3d/MEASUREMENT_B10_B11.md`. Project Control prepared the session and wrote this file; the leader performed the gestures. Nobody else read or aggregated the frame data.

## Roles

| Role | Person |
|---|---|
| Spike B owner — protocol, probe, interpretation | Vũ Hùng Anh |
| Operator — one-finger orbit, two-finger pan, pinch, pick | Phạm Tuấn Anh |
| Session setup, build, capture, this file | Project Control |
| Reviewer of the protocol PR #44 | Nguyễn Gia Đức Trung — **review still pending at capture time** |

## What was run

| Field | Value |
|---|---|
| Protocol | `spikes/spike_b_3d/MEASUREMENT_B10_B11.md` at PR #44 head `c34d753` |
| Fixed URL | `http://127.0.0.1:8765/app/?mesh=synthetic&level=0&probe_sink=/probe` |
| Served tree | **local-only merge** `a74d6f2` of `main` `49227e4` and PR #44 `c34d753`. PR #44's head did not yet contain PR #43, and the protocol requires the geometry contract version. The merge was clean and was **not pushed** — both parents are on GitHub, see `repository_commit.txt` |
| Server | `spikes/spike_b_3d/harness/serve_viewer.py --out <outside git>`, loopback only, reached through `adb reverse tcp:8765 tcp:8765` |
| App | Spike A release build from `bfbf2fe` (branch `spike-a/s7-webview-container`, PR #46), `WEBVIEW_URL` set to the fixed URL above, installed 21:47:46 |
| Mesh | synthetic, level 0, 5,648 triangles, built with `build_mesh.py` in the served tree |
| Device | Galaxy A17 5G `R5CY931SQYZ`, Android 16, USB powered, screen on, unlocked (`session.py start` preflight) |
| Session | `start` after the 21:47:46 install (exact time in `session_state.json`) · page loaded 21:48:13 · `finish` 21:53 (+07) |

## The three runs

All three came from **one app build, one page load, one URL and one mesh level**. Nothing was rebuilt or reloaded between runs.

| Run | Recorded (UTC) | `POST /probe` at the server (+07) | Probe status | Required fields | Fixed URL | Geometry version | Frame intervals |
|---|---|---|---|---|---|---|---:|
| 1 | 14:48:59.820 | 21:48:58 | `complete` | ✅ | ✅ | `dr008a-dr012/v1.0.0` | 1,800 |
| 2 | 14:51:07.857 | 21:51:06 | `complete` | ✅ | ✅ | ✅ | 1,800 |
| 3 | 14:52:53.390 | 21:52:51 | `complete` | ✅ | ✅ | ✅ | 1,800 |

"Required fields" means `median_fps`, `longest_stall_ms` and `frames_over_500ms`, checked for **presence only** — their values were not read for this record.

Sequence as it happened: after run 1, the operator was asked for two more. When he reported them done, the server had received only run 2, so one more was requested; run 3 arrived at 21:52:51. Why a requested run did not reach the server is not known. There is no partial or discarded run in the data; the three records above are every `POST /probe` the server received.

## The two evidence paths — one is complete, one is truncated

| Path | File | State |
|---|---|---|
| HTTP `POST /probe` → workstation | `webview_probe_payloads.jsonl` | **complete, 3 records** — the authoritative copy |
| React Native bridge → logcat | `webview_logcat.txt`, `webview_payloads.json` | **truncated.** Each `spike_b_frame_probe` line is cut at **4,095 characters** by Android's logcat line limit, so the JSON is incomplete and `session.py finish` parsed only the `webview_env` payload |

The protocol permits this case (*"if only one path delivered, record exactly that"*). The cause lies in the container (PR #46), which forwards each message as a single `console.log` line; the probe itself is fine. PR #46 needs to chunk large messages before the next session. It was deliberately **not** fixed during this session, because a rebuild between runs would have added a second variable — the lesson of PR #41 the same day.

## Files and integrity (hashes of the committed blobs)

| File | Bytes | SHA-256 |
|---|---:|---|
| `webview_probe_payloads.jsonl` | 108,905 | `125417809c9a2e747aa1a3622a66a1dfb642571e01aa82ed75dab9f25b86508e` — matches its `.sha256` file byte for byte |
| `webview_probe_payloads.jsonl.sha256` | 95 | `533a1d1c8221cba73c26bda40c59efebc85486663762b62292b6c2b044842db3` |
| `conditions_before.json` | 4,720 | `f2dd431d1a5547c0ab8bf9e38ab4b3871db263e327d72c4cd63046db28ff8491` |
| `conditions_after.json` | 4,727 | `7bbac4d992ca87c0670123fa7abc0ddff1bc9b903c9b1eb2bc96a09ac4d4c7b4` |
| `repository_commit.txt` | 387 | `4208cf72e391b167bd0d690872b17fc77b8b19ab16f1420031b4ffe37a92e348` |
| `session_state.json` | 1,392 | `e7355840b3f9a5eec150a2635c5dee07f7f50fe1cbd93e256cd99eb9dedc450a` |
| `webview_logcat.txt` | 13,201 | `58461f8b4256f62244aecfccbda59d7135ad8b593b018264baee22df7300a745` |
| `webview_payloads.json` | 664 | `42df71e6585766a4d9b1e1fc112663009ef9ad27ac3cbd17c8b2907549ee4514` |

`session_state.json`, `webview_logcat.txt` and `webview_payloads.json` were written with CRLF on Windows, and git normalised them to LF on commit. The hashes above are those of the committed bytes. The hashes that `session_state.json` itself lists refer to the pre-commit CRLF files. The authoritative JSONL was already LF and is unchanged.

## Limitations

- **Evidence status depends on PR #44's review.** The protocol and probe were still unreviewed when this was captured.
- One session, one handset, synthetic level-0 mesh only. `B5`/`B6` and the `B12`/`B13` frontier need real masks, as the protocol states.
- The gesture timing (0–10 s orbit, 10–20 s two-finger pan, 20–30 s pinch, then a pick) was performed by hand and is not instrumented separately.
