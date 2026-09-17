#!/usr/bin/env python3
"""PR #33 review: run the E9 reconnect drill entirely on the handset.

The drill needs a controlled link loss. Toggling Wi-Fi would make this a real
E9 run, which belongs to the Spike E owner and the leader; instead the harness
talks to a canned responder on the phone's own loopback, and the "loss" is that
responder going away between the RECONNECT_WINDOW marker and its restart. What
the harness sees is what a lost link gives it: a TCP failure with no HTTP
response. No E number is produced here.

Usage: python pr33_reconnect_drill.py <harness.sh> <out dir> [retries] [pause_s] [loss_s]
"""
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ADB = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")
HARNESS = Path(sys.argv[1])
OUT = Path(sys.argv[2])
RETRIES = sys.argv[3] if len(sys.argv) > 3 else "8"
PAUSE = int(sys.argv[4]) if len(sys.argv) > 4 else 15
LOSS = int(sys.argv[5]) if len(sys.argv) > 5 else 3
# A fresh path per run: a leftover file from an earlier run would satisfy the
# line-count trigger immediately and cut the link before the run even started.
REMOTE = "/data/local/tmp/pr33_reconnect_%d.jsonl" % int(time.time())
CTL = "sh /data/local/tmp/listener_ctl.sh"


def adb(*args, **kw):
    return subprocess.run([ADB, *args], capture_output=True, text=True, errors="replace", **kw)


def ctl(action):
    return adb("shell", *CTL.split(), action).stdout.strip()


print("listener:", ctl("start"), flush=True)
time.sleep(1)

cmd = [
    ADB, "shell", "sh", "-s", "--",
    "--base", "http://127.0.0.1:8799",
    "--path", "lan-diagnostic", "--connection", "direct",
    "--operator 'Project Control PR33 review'", "--owner 'Nguyen Gia Duc Trung'",
    "--slices", "88", "--window-radius", "2", "--repeats", "1", "--timeout", "3",
    "--network-retries", RETRIES, "--retry-delay", "1",
    "--pause-before-mesh", str(PAUSE), "--body-hash",
    "--out", REMOTE,
]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT, text=True, errors="replace", bufsize=1)
proc.stdin.write(HARNESS.read_text(encoding="utf-8"))
proc.stdin.close()

events = {}
lines = []


def reader():
    for line in proc.stdout:
        line = line.rstrip()
        lines.append(line)
        print("  |", line, flush=True)


def drive():
    """Cut the link inside the reconnect window, restore it after LOSS seconds.

    The window is detected from the JSONL on the device, not from the harness's
    stderr: adb buffers that stream, so the marker can arrive after the pause is
    already over. The pause sits between the last pre-mesh sample and the first
    mesh request, so the cut fires when the file holds the run header plus every
    non-mesh sample.
    """
    deadline = time.time() + 300
    while time.time() < deadline and proc.poll() is None:
        out = adb("shell", "toybox", "wc", "-l", "<", REMOTE).stdout.strip()
        try:
            count = int(out.split()[0])
        except (ValueError, IndexError):
            count = 0
        if count >= PRE_MESH_LINES:
            events["cut_at_line_count"] = count
            print("  >> cutting the link:", ctl("stop"), flush=True)
            events["loss_start"] = time.time()
            time.sleep(LOSS)
            print("  >> restoring the link:", ctl("start"), flush=True)
            events["restore_start"] = time.time()
            return
        time.sleep(0.4)
    print("  !! reconnect window never detected", flush=True)


PRE_MESH_LINES = 54  # run_header + the 53 samples of E2-E5, measured on the control run
r = threading.Thread(target=reader)
d = threading.Thread(target=drive)
r.start()
d.start()
proc.wait()
r.join()
d.join()

OUT.mkdir(parents=True, exist_ok=True)
local = OUT / "pr33_reconnect.jsonl"
adb("pull", REMOTE, str(local))
rows = [json.loads(l) for l in local.read_text(encoding="utf-8").splitlines() if l.strip()]
samples = [r for r in rows if r.get("record_type") == "sample"]
mesh = [r for r in samples if r.get("criterion") == "E6"]

report = {
    "record": "pr33_review_reconnect_drill",
    "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "not_evidence": "Review exercise on the handset's own loopback. Not Spike E acceptance evidence, not an E number.",
    "loss_window_seconds": round(events.get("restore_start", 0) - events.get("loss_start", 0), 2) if events else None,
    "harness_flags": {"network_retries": RETRIES, "retry_delay": 1, "pause_before_mesh": PAUSE, "body_hash": True},
    "sample_count": len(samples),
    "mesh_samples": [{k: r.get(k) for k in ("scenario", "ok", "status", "bytes", "bytes_received",
                                            "attempts", "network_retries", "body_sha256", "ms_total",
                                            "ms_including_local_rejections", "error")} for r in mesh],
    "retried_samples": [{k: r.get(k) for k in ("scenario", "ok", "attempts", "network_retries", "error")}
                        for r in samples if (r.get("network_retries") or 0) > 0],
    "stderr": lines,
}
(OUT / "pr33_reconnect_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: report[k] for k in ("loss_window_seconds", "sample_count", "mesh_samples", "retried_samples")},
                 indent=2))
