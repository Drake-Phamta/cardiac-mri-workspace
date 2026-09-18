#!/usr/bin/env python3
"""E8 daytime capture for Spike E — raw data only.

This script operates the handset and records bytes. It computes **no** E number:
every latency distribution, p50/p95, throughput figure and E8 verdict belongs to
the spike owner (Nguyễn Gia Đức Trung) and his own analyze/aggregate.py.

It repeats the 2026-09-16 evening capture in a daytime window, with the same
harness, the same stub and the same command, so the two are comparable:

    --base http://10.64.193.115:8787 --path wifi-overlay --connection direct
    --profile <profile> --operator "Pham Tuan Anh" --owner "Nguyen Gia Duc Trung"
    --repeats 3

Health is an address plus HTTP 200 from the phone plus a DIRECT peer, never a
process check. On 2026-09-16 the stub stayed alive and LISTENing for about eight
hours while the Mac mini had silently left the ZeroTier network, so a process
check answered "yes" while nothing could reach it. Every precondition below is
fail-closed: the capture refuses to start rather than produce data nobody can
trust.

Usage (from the repository root):

    python management/day09/e8_capture/capture_e8.py --out <writable dir outside git>

Options: --profiles, --repeats, --operator, --owner, --base, --host, --dry-run.
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
from pathlib import Path

ADB = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")
if not Path(ADB).exists():  # non-Windows fallback
    ADB = "adb"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "macmini"]
ZT = "/usr/local/bin/zerotier-cli"
HARNESS = Path("spikes/spike_e_transport/client/android_toybox_harness.sh")


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, errors="replace", **kw)


def adb(*args):
    return run([ADB, *args]).stdout.strip()


def ssh(command):
    return run([*SSH, command]).stdout.strip()


def http_from_phone(host: str, port: int, path: str, timeout: int = 8) -> tuple[int | None, int, str]:
    """Issue one HTTP/1.1 GET from the handset with the same client the harness uses."""
    remote_out = "/data/local/tmp/e8_health.out"
    req = (f'printf "GET {path} HTTP/1.1\\r\\nHost: {host}\\r\\nConnection: close\\r\\n\\r\\n" | '
           f'toybox nc -n -w {timeout} {host} {port} > {remote_out} 2>/dev/null; '
           f'echo rc=$?; toybox wc -c < {remote_out}; head -c 400 {remote_out}')
    out = adb("shell", req)
    status = None
    m = re.search(r"HTTP/1\.[01] (\d{3})", out)
    if m:
        status = int(m.group(1))
    size = 0
    m = re.search(r"rc=\d+\s+(\d+)", out)
    if m:
        size = int(m.group(1))
    return status, size, out


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def device_conditions(label: str) -> dict:
    battery = adb("shell", "dumpsys battery")
    def field(name, default=None):
        m = re.search(rf"^\s*{name}:\s*(.+)$", battery, re.M)
        return m.group(1).strip() if m else default
    return {
        "label": label,
        "at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "battery_level": field("level"),
        "battery_temperature_decic": field("temperature"),
        "usb_powered": field("USB powered"),
        "thermal_status": adb("shell", "cmd thermalservice get-current-status") or None,
        "screen_state": adb("shell", "dumpsys display | grep -m1 mScreenState") or None,
        "tun0": adb("shell", "ip -4 addr show tun0 | grep inet") or None,
        "wlan0": adb("shell", "ip -4 addr show wlan0 | grep inet") or None,
    }


def preflight(args) -> dict:
    checks: dict = {"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "failures": []}

    serial = adb("get-serialno")
    checks["device_serial"] = serial
    if not serial or "not found" in serial:
        checks["failures"].append("no handset on adb")

    checks["harness_present"] = HARNESS.exists()
    if not HARNESS.exists():
        checks["failures"].append(f"harness not found at {HARNESS}")

    # 1. the address must exist on the Mac mini, not merely a running process
    ifconfig = ssh(f"ifconfig | grep -c '{args.host}'")
    checks["address_on_macmini"] = ifconfig.strip()
    if checks["address_on_macmini"] in ("", "0"):
        checks["failures"].append(f"{args.host} is not on any Mac mini interface")

    stub = ssh("ps aux | grep 'stub/server.py' | grep -v grep")
    checks["stub_processes"] = [l for l in stub.splitlines() if l.strip()]
    checks["stub_bound_here"] = any(args.host in l for l in checks["stub_processes"])
    if not checks["stub_bound_here"]:
        checks["failures"].append(f"no stub bound to {args.host}")

    # 2. HTTP 200 from the phone. This runs BEFORE the peer check on purpose: an
    # idle ZeroTier peer drops out of `zerotier-cli peers`, so checking peers first
    # refused a healthy path (2026-09-18 13:55 and 15:58).
    status, size, raw = http_from_phone(args.host, args.port, "/health")
    checks["health_status_from_phone"] = status
    checks["health_bytes"] = size
    if status != 200:
        checks["failures"].append(f"/health from the phone returned {status}")

    # 3. one REAL artifact per profile, from the phone, with its full length.
    # /health answers from memory: on 2026-09-18 the payload directory had been
    # removed, /health still said 200, and all 342 samples of the capture came back
    # 404. A health endpoint is not evidence that the bytes exist.
    checks["artifact_from_phone"] = {}
    for profile in args.profiles:
        path = f"/s1/slice/44.png?profile={profile}"
        a_status, a_size, a_raw = http_from_phone(args.host, args.port, path, timeout=20)
        m = re.search(r"Content-Length:\s*(\d+)", a_raw, re.I)
        declared = int(m.group(1)) if m else None
        complete = bool(declared) and a_size >= declared
        checks["artifact_from_phone"][profile] = {"path": path, "status": a_status,
                                                  "bytes_received": a_size, "content_length": declared,
                                                  "complete": complete}
        if a_status != 200 or not complete:
            checks["failures"].append(f"{path} from the phone: status {a_status}, "
                                      f"{a_size} bytes received of {declared}")

    # 4. the phone's node must be a DIRECT peer, not relayed (E12); traffic above woke it
    peers = ssh(f"{ZT} peers")
    checks["peers_raw"] = peers.splitlines()[:12]
    node = args.phone_node
    row = next((l for l in peers.splitlines() if l.startswith(node)), None)
    checks["phone_peer_row"] = row
    if not row or "DIRECT" not in row:
        checks["failures"].append(f"phone node {node} is not a DIRECT peer")
    return checks


def capture_profile(args, profile: str, out_dir: Path) -> dict:
    stamp = time.strftime("%Y%m%dT%H%M%S%z")
    remote = f"/data/local/tmp/e8_{profile}_{stamp}.jsonl"
    cmd = [
        ADB, "shell", "sh", "-s", "--",
        "--base", f"http://{args.host}:{args.port}",
        "--path", "wifi-overlay", "--connection", "direct",
        "--profile", profile,
        # flag and value in ONE argument, quoted for the device shell: adb shell
        # joins its arguments into a single command line, so PowerShell/py quoting
        # is gone by the time the phone's shell splits it.
        f"--operator '{args.operator}'", f"--owner '{args.owner}'",
        "--slices", "88", "--window-radius", "2",
        "--repeats", str(args.repeats), "--timeout", "60",
        "--out", remote,
    ]
    started = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    proc = subprocess.run(cmd, input=HARNESS.read_text(encoding="utf-8"),
                          capture_output=True, text=True, errors="replace")
    ended = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    local = out_dir / f"e_transport_{stamp}_{profile}.jsonl"
    run([ADB, "pull", remote, str(local)])
    record = {
        "profile": profile,
        "started": started,
        "ended": ended,
        "remote_path": remote,
        "local_file": local.name,
        "exit_code": proc.returncode,
        "stderr_tail": proc.stderr.strip().splitlines()[-6:],
    }
    if local.exists():
        rows = [json.loads(l) for l in local.read_text(encoding="utf-8").splitlines() if l.strip()]
        samples = [r for r in rows if r.get("record_type") == "sample"]
        record.update({
            "bytes": local.stat().st_size,
            "sha256": sha256(local),
            "records": len(rows),
            "samples": len(samples),
            "samples_ok": sum(1 for r in samples if r.get("ok")),
            "repeats_seen": sorted({r.get("repeat") for r in samples}),
        })
    else:
        record["error"] = "no JSONL pulled"
    return record


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, type=Path, help="writable directory OUTSIDE the repository")
    p.add_argument("--host", default="10.64.193.115")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--profiles", default="576x576x88,640x640x88")
    p.add_argument("--repeats", type=int, default=3)
    p.add_argument("--operator", default="Pham Tuan Anh")
    p.add_argument("--owner", default="Nguyen Gia Duc Trung")
    p.add_argument("--phone-node", default="078280bae8", help="ZeroTier node id of the handset")
    p.add_argument("--dry-run", action="store_true", help="run the preflight only")
    args = p.parse_args()
    args.profiles = [s for s in args.profiles.split(",") if s]

    args.out.mkdir(parents=True, exist_ok=True)
    session = {
        "record": "spike_e_e8_daytime_capture",
        "not_computed_here": "No E number. Raw data only; the spike owner computes every figure.",
        "operator": args.operator,
        "owner": args.owner,
        "command_shape": "--base http://HOST:PORT --path wifi-overlay --connection direct "
                         "--profile P --operator ... --owner ... --repeats N --timeout 60",
        "started": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }

    print("preflight ...", flush=True)
    checks = preflight(args)
    session["preflight"] = checks
    for line in ("address_on_macmini", "stub_bound_here", "health_status_from_phone",
                 "artifact_from_phone", "phone_peer_row"):
        print(f"  {line}: {checks.get(line)}")
    if checks["failures"]:
        print("REFUSING TO CAPTURE:")
        for f in checks["failures"]:
            print("  -", f)
        (args.out / "e8_session_ABORTED.json").write_text(json.dumps(session, indent=2), encoding="utf-8")
        return 2
    if args.dry_run:
        print("preflight only; nothing captured")
        (args.out / "e8_preflight_only.json").write_text(json.dumps(session, indent=2), encoding="utf-8")
        return 0

    session["conditions_before"] = device_conditions("before")
    session["runs"] = []
    for profile in args.profiles:
        print(f"capturing {profile} ... (3 repeats, 60 s timeout)", flush=True)
        rec = capture_profile(args, profile, args.out)
        print(f"  {rec.get('samples')} samples, {rec.get('samples_ok')} ok, sha256 {str(rec.get('sha256'))[:16]}")
        session["runs"].append(rec)
    session["conditions_after"] = device_conditions("after")
    session["peers_after"] = [l for l in ssh(f"{ZT} peers").splitlines() if l.startswith(args.phone_node)]
    session["ended"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    out = args.out / f"e8_session_{time.strftime('%Y%m%dT%H%M%S')}.json"
    out.write_text(json.dumps(session, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote", out)
    print("Hand the JSONL files and this session record to the spike owner; compute nothing here.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
