#!/usr/bin/env python3
"""S-1 session scaffolding: preflight, conditions, logcat capture, hashes. Capture only.

THROWAWAY SPIKE CODE. Adapted from management/day09/b10_b11_session/session.py (the
09-18 B10/B11 session) for the S-1 app (package com.cardiacmri.spikebs1, collector on
tcp:8766). It computes NO B number: harness/s1_extract.py does that afterwards, from the
files this script and the collector leave behind.

    python spikes/spike_b_3d/harness/s1_session.py start  --out <dir> [--serial <adb serial>] [--build-record <json>]
    # ... the operator runs the session (S1_SESSION_SCRIPT.md) ...
    python spikes/spike_b_3d/harness/s1_session.py finish --out <dir>

`start` refuses (and writes session_NOT_READY.json) unless: exactly one handset is chosen,
its screen is on and unlocked, it is on USB power, the S-1 app is installed AND running,
the collector answers on 127.0.0.1:8766, and `adb reverse tcp:8766` is in place (it adds
the reverse when that is the only gap). It pulls the INSTALLED apk and hashes it, so the
record proves which build ran. Then it clears logcat, enlarges the buffer, starts a
background `adb logcat` stream into the session folder, and records conditions before.

`finish` stops the stream, dumps the logcat buffer as a second copy, records conditions
after, reassembles the chunked SPIKE_B_S1 lines into s1_logcat_payloads.json, counts the
collector's records, and writes session_state.json with SHA-256 of every file.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ADB = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")
if not Path(ADB).exists():
    ADB = "adb"
PKG = "com.cardiacmri.spikebs1"
TAG = "SPIKE_B_S1"
COLLECTOR = "http://127.0.0.1:8766/health"
REPO = Path(__file__).resolve().parents[3]
CONDITIONS = REPO / "spikes" / "spike_a_2d" / "harness" / "capture_conditions.py"


def run(args, serial=None, timeout=60) -> str:
    cmd = [ADB] + (["-s", serial] if serial else []) + list(args)
    return subprocess.run(cmd, capture_output=True, text=True, errors="replace", timeout=timeout).stdout.strip()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def outside_repo(path: Path) -> bool:
    try:
        path.resolve().relative_to(REPO)
    except ValueError:
        return True
    return False


def choose_serial(requested):
    lines = run(["devices"]).splitlines()[1:]
    serials = [ln.split()[0] for ln in lines if ln.strip().endswith("device")]
    if requested:
        return requested if requested in serials else None, serials
    return (serials[0] if len(serials) == 1 else None), serials


def preflight(serial, diagnostic_emulator=False) -> dict:
    checks: dict = {"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "serial": serial, "failures": []}
    checks["model"] = run(["shell", "getprop", "ro.product.model"], serial)
    checks["android"] = run(["shell", "getprop", "ro.build.version.release"], serial)
    checks["is_emulator"] = run(["shell", "getprop", "ro.kernel.qemu"], serial) == "1"
    if diagnostic_emulator and not checks["is_emulator"]:
        checks["failures"].append("--diagnostic-emulator was given but this is a physical handset")
    if checks["is_emulator"] and not diagnostic_emulator:
        checks["failures"].append("this is an emulator: never evidence; use --diagnostic-emulator for a smoke test")
    display = run(["shell", "dumpsys", "display"], serial)
    checks["screen_on"] = "mScreenState=ON" in display
    if not checks["screen_on"]:
        checks["failures"].append("screen is off")
    window = run(["shell", "dumpsys", "window"], serial)
    checks["keyguard_showing"] = "mDreamingLockscreen=true" in window
    if checks["keyguard_showing"]:
        checks["failures"].append("the phone is locked")
    battery = run(["shell", "dumpsys", "battery"], serial)
    m = re.search(r"^\s*level:\s*(\d+)", battery, re.M)
    checks["battery_level"] = int(m.group(1)) if m else None
    checks["usb_powered"] = "USB powered: true" in battery
    if not checks["usb_powered"] and not diagnostic_emulator:
        checks["failures"].append("not on USB power (the 09-18 B10/B11 runs were USB powered)")
    package = run(["shell", "dumpsys", "package", PKG], serial)
    m = re.search(r"lastUpdateTime=(\S+ \S+)", package)
    checks["app_last_update"] = m.group(1) if m else None
    if not m:
        checks["failures"].append(f"{PKG} is not installed")
    checks["app_running_pid"] = run(["shell", "pidof", PKG], serial) or None
    if not checks["app_running_pid"]:
        checks["failures"].append("the S-1 app is not running - open it first (conditions need its memory)")
    try:
        with urllib.request.urlopen(COLLECTOR, timeout=5) as resp:
            checks["collector"] = json.loads(resp.read().decode())
    except Exception as exc:  # noqa: BLE001 - the reason is the evidence
        checks["collector"] = f"error: {exc}"
        checks["failures"].append("the collector does not answer on 127.0.0.1:8766 - start s1_collector.py")
    reverses = [ln for ln in run(["reverse", "--list"], serial).splitlines() if ln.strip()]
    if not any("tcp:8766" in ln for ln in reverses):
        run(["reverse", "tcp:8766", "tcp:8766"], serial)
        checks["adb_reverse_added"] = True
        reverses = [ln for ln in run(["reverse", "--list"], serial).splitlines() if ln.strip()]
    checks["adb_reverse"] = reverses
    if not any("tcp:8766" in ln for ln in reverses):
        checks["failures"].append("adb reverse tcp:8766 could not be set")
    return checks


def conditions(phase: str, out: Path, serial: str, note: str) -> dict:
    target = out / f"conditions_{phase}.json"
    env = {**os.environ, "ANDROID_SERIAL": serial}
    proc = subprocess.run([sys.executable, str(CONDITIONS), "--phase", phase, "--out", str(target),
                           "--package", PKG, "--note", note], capture_output=True, text=True, env=env)
    if target.exists():
        return {"file": target.name, "sha256": sha256(target), "bytes": target.stat().st_size}
    return {"file": None, "error": (proc.stdout + proc.stderr)[-800:]}


def start(args) -> int:
    out = args.out.resolve()
    if not outside_repo(out):
        print("--out must be outside the repository (raw session records)")
        return 2
    out.mkdir(parents=True, exist_ok=True)
    serial, serials = choose_serial(args.serial)
    if not serial:
        print(f"choose the handset with --serial; adb sees: {serials}")
        return 2
    checks = preflight(serial, args.diagnostic_emulator)
    for key in ("serial", "model", "android", "is_emulator", "screen_on", "keyguard_showing",
                "battery_level", "usb_powered", "app_last_update", "app_running_pid"):
        print(f"  {key}: {checks.get(key)}")
    if checks["failures"]:
        print("NOT READY:")
        for f in checks["failures"]:
            print("  -", f)
        (out / "session_NOT_READY.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
        return 2

    # Which APK is actually installed: pull it and hash it.
    apk_path = run(["shell", "pm", "path", PKG], serial).replace("package:", "").splitlines()[0].strip()
    installed = out / "installed_base.apk"
    run(["pull", apk_path, str(installed)], serial, timeout=180)
    installed_sha = sha256(installed) if installed.exists() else None
    build = None
    if args.build_record:
        build = json.loads(Path(args.build_record).read_text(encoding="utf-8-sig"))
    match = (build is not None and installed_sha == build.get("apk_sha256"))
    print(f"  installed apk sha256: {installed_sha}  matches build record: {match if build else 'no record given'}")

    run(["logcat", "-c"], serial)
    run(["logcat", "-G", "16M"], serial)
    stream = out / "logcat_stream.txt"
    fh = stream.open("w", encoding="utf-8", errors="replace")
    flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    proc = subprocess.Popen([ADB, "-s", serial, "logcat", "-v", "threadtime", "ReactNativeJS:V", "*:S"],
                            stdout=fh, stderr=subprocess.STDOUT, creationflags=flags)
    state = {
        "record": "spike_b_s1_session",
        "evidence_status": ("DIAGNOSTIC EMULATOR SMOKE TEST - never evidence for any B criterion"
                            if args.diagnostic_emulator else "physical device session"),
        "not_computed_here": "No B number. harness/s1_extract.py computes them from these files.",
        "owner": "Vu Hung Anh (Spike B)",
        "operator": "Pham Tuan Anh (DR-006a)",
        "started": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "preflight": checks,
        "installed_apk": {"device_path": apk_path, "sha256": installed_sha,
                          "build_record": args.build_record, "build_record_apk_sha256": build.get("apk_sha256") if build else None,
                          "matches_build_record": match if build else None},
        "logcat_stream": {"file": stream.name, "pid": proc.pid, "buffer_requested": "16M"},
        "conditions_before": conditions("before", out, serial, "S-1 session, before the runs"),
        "collector_health_url": COLLECTOR,
        "log_tag": TAG,
    }
    (out / "session_state.json").write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("\nREADY. logcat cleared and streaming; conditions recorded; collector reachable.")
    print("Follow S1_SESSION_SCRIPT.md on the phone. When done:")
    print(f"  python {Path(__file__).relative_to(REPO).as_posix()} finish --out \"{out}\"")
    return 0


def parse_lines(lines):
    """SPIKE_B_S1 <json> lines and SPIKE_B_S1_CHUNK <id> <i>/<n> <slice> groups -> payloads."""
    payloads, chunks = [], {}
    for line in lines:
        m = re.search(rf"{TAG}_CHUNK (\S+) (\d+)/(\d+) (.*)$", line)
        if m:
            cid, idx, count, part = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
            chunks.setdefault(cid, {"count": count, "parts": {}})["parts"][idx] = part
            continue
        m = re.search(rf"{TAG} (\{{.*\}})\s*$", line)
        if m:
            try:
                payloads.append(json.loads(m.group(1)))
            except json.JSONDecodeError:
                payloads.append({"unparsed": m.group(1)[:200]})
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
    return payloads, len(chunks), incomplete


def finish(args) -> int:
    out = args.out.resolve()
    state_path = out / "session_state.json"
    if not state_path.exists():
        print(f"no session_state.json in {out}; run 'start' first")
        return 2
    state = json.loads(state_path.read_text(encoding="utf-8"))
    serial = state["preflight"]["serial"]
    pid = state["logcat_stream"]["pid"]
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
        else:
            os.kill(pid, signal.SIGTERM)
    except Exception as exc:  # noqa: BLE001
        state["logcat_stream"]["stop_error"] = str(exc)
    time.sleep(1)
    dump = out / "logcat_dump.txt"
    dump.write_text(run(["logcat", "-d", "-v", "threadtime", "ReactNativeJS:V", "*:S"], serial, timeout=120) + "\n",
                    encoding="utf-8")
    state["ended"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    state["conditions_after"] = conditions("after", out, serial, "S-1 session, after the runs")

    stream = out / "logcat_stream.txt"
    lines = [ln for ln in stream.read_text(encoding="utf-8", errors="replace").splitlines() if TAG in ln]
    dump_lines = [ln for ln in dump.read_text(encoding="utf-8", errors="replace").splitlines() if TAG in ln]
    source = lines if len(lines) >= len(dump_lines) else dump_lines
    payloads, n_chunked, incomplete = parse_lines(source)
    pf = out / "s1_logcat_payloads.json"
    pf.write_text(json.dumps(payloads, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    collector = out / "s1_collector.jsonl"
    coll_kinds: dict = {}
    n_coll = 0
    if collector.exists():
        for line in collector.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            n_coll += 1
            kind = str(json.loads(line).get("payload", {}).get("kind", "unknown"))
            coll_kinds[kind] = coll_kinds.get(kind, 0) + 1
    log_kinds: dict = {}
    for p in payloads:
        kind = str(p.get("kind", "unknown"))
        log_kinds[kind] = log_kinds.get(kind, 0) + 1

    state["logcat"] = {"stream_lines_tagged": len(lines), "dump_lines_tagged": len(dump_lines),
                       "parsed_from": "stream" if source is lines else "dump",
                       "chunked_messages": n_chunked, "incomplete_chunks": incomplete,
                       "payloads": len(payloads), "kinds": dict(sorted(log_kinds.items()))}
    state["collector"] = {"file": collector.name if collector.exists() else None, "records": n_coll,
                          "kinds": dict(sorted(coll_kinds.items()))}
    state["files"] = {p.name: {"sha256": sha256(p), "bytes": p.stat().st_size}
                      for p in sorted(out.iterdir()) if p.is_file() and p.name != "session_state.json"}
    state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"logcat: {len(payloads)} payloads ({n_chunked} chunked, {len(incomplete)} incomplete) from the {state['logcat']['parsed_from']}")
    print(f"collector: {n_coll} records")
    print(f"kinds (collector): {state['collector']['kinds']}")
    print("Hand this folder to the extractor: python spikes/spike_b_3d/harness/s1_extract.py --session <dir>")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("phase", choices=["start", "finish"])
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--serial", help="adb serial of the handset (required when several are attached)")
    ap.add_argument("--build-record", help="build_record.json written by s1_app/build_release.ps1")
    ap.add_argument("--diagnostic-emulator", action="store_true",
                    help="smoke-test on an emulator (waives USB power; the record says DIAGNOSTIC)")
    args = ap.parse_args()
    return start(args) if args.phase == "start" else finish(args)


if __name__ == "__main__":
    raise SystemExit(main())
