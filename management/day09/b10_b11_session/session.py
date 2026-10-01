#!/usr/bin/env python3
"""B10/B11 session scaffolding — capture only, protocol-agnostic.

The Spike B owner writes the protocol and interprets the numbers. This script
does the parts that do not depend on either: it proves the environment is sane
before anyone touches the phone, records the device conditions before and after,
captures everything the page posts out of the WebView, and hashes the result.

It computes no B number and it does not decide how many runs a session needs.

    python management/day09/b10_b11_session/session.py start  --out <dir>
    # ... the leader performs the runs from the owner's protocol ...
    python management/day09/b10_b11_session/session.py finish --out <dir>

Why the leader must be present: the protocol needs two-finger pan and pinch, and
`adb shell input` drives one pointer only. Everything else here is scripted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ADB = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")
if not Path(ADB).exists():
    ADB = "adb"
PKG = "com.cardiacmri.spikea2d"
TAG = "SPIKE_B_WEBVIEW"
VIEWER_URL = "http://127.0.0.1:8765/app/"
CONDITIONS = Path("spikes/spike_a_2d/harness/capture_conditions.py")


def adb(*args) -> str:
    return subprocess.run([ADB, *args], capture_output=True, text=True, errors="replace").stdout.strip()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def preflight() -> dict:
    checks: dict = {"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "failures": []}
    checks["serial"] = adb("get-serialno")
    if not checks["serial"]:
        checks["failures"].append("no handset on adb")

    display = adb("shell", "dumpsys display")
    checks["screen_on"] = "mScreenState=ON" in display
    if not checks["screen_on"]:
        checks["failures"].append("screen is off; the owner's frame numbers would be meaningless")

    window = adb("shell", "dumpsys window")
    checks["keyguard_showing"] = "mDreamingLockscreen=true" in window
    if checks["keyguard_showing"]:
        checks["failures"].append("the phone is locked")

    battery = adb("shell", "dumpsys battery")
    m = re.search(r"^\s*level:\s*(\d+)", battery, re.M)
    checks["battery_level"] = int(m.group(1)) if m else None
    checks["usb_powered"] = "USB powered: true" in battery
    if not checks["usb_powered"]:
        checks["failures"].append("the phone is not on USB power; thermal behaviour will not match the other runs")

    installed = adb("shell", f"dumpsys package {PKG} | grep -m1 lastUpdateTime")
    checks["app_last_update"] = installed.strip() or None
    if not installed:
        checks["failures"].append(f"{PKG} is not installed")

    # the viewer must answer on the workstation, and the tunnel must exist
    try:
        with urllib.request.urlopen(VIEWER_URL, timeout=5) as resp:
            checks["viewer_http_status"] = resp.status
    except Exception as exc:  # noqa: BLE001 - the reason is the evidence
        checks["viewer_http_status"] = f"error: {exc}"
        checks["failures"].append(f"the viewer does not answer on {VIEWER_URL} from the workstation")

    reverses = adb("reverse", "--list")
    checks["adb_reverse"] = [l for l in reverses.splitlines() if l.strip()]
    if not any("tcp:8765" in l for l in checks["adb_reverse"]):
        adb("reverse", "tcp:8765", "tcp:8765")
        checks["adb_reverse_added"] = True
        checks["adb_reverse"] = [l for l in adb("reverse", "--list").splitlines() if l.strip()]
    return checks


def conditions(phase: str, out: Path, note: str) -> dict:
    target = out / f"conditions_{phase}.json"
    if CONDITIONS.exists():
        subprocess.run([sys.executable, str(CONDITIONS), "--phase", phase, "--out", str(target),
                        "--package", PKG, "--note", note], capture_output=True, text=True)
    if target.exists():
        return {"file": target.name, "sha256": sha256(target), "bytes": target.stat().st_size}
    return {"file": None, "error": f"{CONDITIONS} did not produce {target.name}"}


def start(args) -> int:
    args.out.mkdir(parents=True, exist_ok=True)
    checks = preflight()
    for key in ("serial", "screen_on", "keyguard_showing", "battery_level", "usb_powered", "viewer_http_status"):
        print(f"  {key}: {checks.get(key)}")
    if checks["failures"]:
        print("NOT READY:")
        for f in checks["failures"]:
            print("  -", f)
        (args.out / "session_NOT_READY.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
        return 2

    adb("logcat", "-c")
    state = {
        "record": "spike_b_b10_b11_session",
        "not_computed_here": "No B number. The Spike B owner interprets these bytes.",
        "started": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "preflight": checks,
        "conditions_before": conditions("before", args.out, "B10/B11 session, before the runs"),
        "viewer_url": VIEWER_URL,
        "log_tag": TAG,
    }
    (args.out / "session_state.json").write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n",
                                                 encoding="utf-8")
    print("\nReady. The logcat buffer is clear and conditions are recorded.")
    print("Open the app, tap '3D · WebView (B10/B11)', and run the owner's protocol.")
    print("Anything the page posts through window.ReactNativeWebView.postMessage is being captured.")
    print(f"When the runs are done: python {Path(__file__).as_posix()} finish --out {args.out}")
    return 0


def parse_webview_lines(lines):
    """Parse tagged logcat lines into payloads.

    Short messages arrive whole: `SPIKE_B_WEBVIEW {json}`. Messages longer than one logcat
    line arrive as numbered chunks (container PR #46, after the 2026-09-18 session lost every
    frame probe to logcat's ~4 KB line limit): `SPIKE_B_WEBVIEW_CHUNK <id> <i>/<n> <slice>`.
    Returns (payloads, chunk groups, incomplete chunk groups).
    """
    payloads = []
    for line in lines:
        m = re.search(rf"{TAG} (\{{.*\}})\s*$", line)
        if m:
            try:
                payloads.append(json.loads(m.group(1)))
            except json.JSONDecodeError:
                payloads.append({"unparsed": m.group(1)})
    chunks: dict = {}
    for line in lines:
        m = re.search(rf"{TAG}_CHUNK (\S+) (\d+)/(\d+) (.*)$", line)
        if m:
            cid, idx, count, part = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
            chunks.setdefault(cid, {"count": count, "parts": {}})["parts"][idx] = part
    incomplete = []
    for cid, c in sorted(chunks.items()):
        if len(c["parts"]) != c["count"]:
            incomplete.append({"chunk_id": cid, "received": len(c["parts"]), "expected": c["count"]})
            continue
        text = "".join(c["parts"][i] for i in range(1, c["count"] + 1))
        try:
            payloads.append(json.loads(text))
        except json.JSONDecodeError:
            payloads.append({"unparsed_chunked": cid, "length": len(text)})
    return payloads, chunks, incomplete


def finish(args) -> int:
    state_path = args.out / "session_state.json"
    if not state_path.exists():
        print(f"no session_state.json in {args.out}; run 'start' first")
        return 2
    state = json.loads(state_path.read_text(encoding="utf-8"))

    raw = subprocess.run([ADB, "logcat", "-d", "-v", "time"], capture_output=True, text=True,
                         errors="replace").stdout
    lines = [l for l in raw.splitlines() if TAG in l]
    log_file = args.out / "webview_logcat.txt"
    log_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

    payloads, chunks, incomplete = parse_webview_lines(lines)
    if incomplete:
        print(f"WARNING: {len(incomplete)} chunked message(s) incomplete: {incomplete}")
    payload_file = args.out / "webview_payloads.json"
    payload_file.write_text(json.dumps(payloads, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    state["ended"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    state["conditions_after"] = conditions("after", args.out, "B10/B11 session, after the runs")
    state["logcat"] = {"file": log_file.name, "lines": len(lines), "sha256": sha256(log_file)}
    state["chunked_messages"] = {"complete": len(chunks) - len(incomplete), "incomplete": incomplete}
    state["payloads"] = {"file": payload_file.name, "count": len(payloads), "sha256": sha256(payload_file),
                         "kinds": sorted({str(p.get("kind", "unknown")) for p in payloads})}
    state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"{len(lines)} tagged log lines, {len(payloads)} payloads, kinds {state['payloads']['kinds']}")
    if not payloads:
        print("WARNING: nothing was posted out of the page. Check that the probe uses "
              "window.ReactNativeWebView.postMessage; a download-JSON button does not work in a WebView.")
    print("Commit this directory to a Spike B evidence branch and hand it to the owner. Interpret nothing.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("phase", choices=["start", "finish"])
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()
    return start(args) if args.phase == "start" else finish(args)


if __name__ == "__main__":
    raise SystemExit(main())
