#!/usr/bin/env python3
"""
Drive one A9 run end to end: conditions before, the run, conditions after, extract.

THROWAWAY SPIKE CODE. Not production. Boundary: spikes/spike_a_2d/**.

WHY THIS EXISTS. The steps of a measured run have to happen in one order - clear
the buffer, capture before, run, capture after, extract - and getting them wrong
does not announce itself. It produces a record that looks fine and describes
something that did not happen: a pooled buffer, a memory delta taken against the
wrong baseline, a run whose conditions were read ten minutes later. The Spike E
capture on 2026-09-16 was lost once to a harness problem of exactly this kind, so
the sequence is a script rather than a list in a README.

This script does NOT press the button and does NOT invent a number. It waits for
the app to report its own run header and its own RUN_END, then reads what the
device says. The operator runs the test on the device.

    python harness/measure_a9.py --policy all    --label "release, 576x576x88, USB"
    python harness/measure_a9.py --policy window --label "release, 576x576x88, USB"

--policy is recorded for the operator's benefit and cross-checked against what the
app actually reports; if they disagree the script says so and refuses to pretend.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime

# This script prints instructions and then WAITS. Python line-buffers stdout only
# when it is a terminal; through a pipe or a log it buffers by block, so the
# operator would see nothing at all until the script exits - which is the one
# moment the prompt is useless. Force line buffering before anything is printed.
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except AttributeError:                      # Python < 3.7
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = "com.cardiacmri.spikea2d"
TAG = "SPIKE_A_TIMING"
RUN_START_RE = re.compile(re.escape(TAG) + r"_RUN_START\s+(\{.*?\})")
RUN_END_RE = re.compile(re.escape(TAG) + r"_RUN_END")

ADB_CANDIDATES = [
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk",
                 "platform-tools", "adb.exe"),
    os.path.join(os.environ.get("ANDROID_HOME", ""), "platform-tools", "adb.exe"),
    "adb",
]


def find_adb():
    for c in ADB_CANDIDATES:
        if not c:
            continue
        try:
            subprocess.run([c, "version"], capture_output=True, timeout=20, check=True)
            return c
        except Exception:
            continue
    sys.exit("adb not found. Tried:\n  " + "\n  ".join(x for x in ADB_CANDIDATES if x))


def sh(adb, *args, timeout=60):
    r = subprocess.run([adb, *args], capture_output=True, timeout=timeout,
                       text=True, encoding="utf-8", errors="replace")
    return r.stdout if r.returncode == 0 else ""


def run_py(script, *args):
    r = subprocess.run([sys.executable, os.path.join(HERE, script), *args],
                       text=True, encoding="utf-8", errors="replace")
    return r.returncode


def main():
    ap = argparse.ArgumentParser(description="Drive one measured A9 run.")
    ap.add_argument("--policy", required=True, choices=["all", "window"],
                    help="the cache policy you are about to select on the device")
    ap.add_argument("--label", default="", help="short note stored with the run")
    ap.add_argument("--timeout", type=int, default=600,
                    help="seconds to wait for the run to finish (default 600)")
    ap.add_argument("--out-dir", default=None,
                    help="where to put the two condition captures "
                         "(default: a run_<policy>_<stamp> folder beside this script)")
    args = ap.parse_args()

    adb = find_adb()

    # --- preconditions ----------------------------------------------------
    devices = [ln.split()[0] for ln in sh(adb, "devices").splitlines()[1:]
               if ln.strip() and "device" in ln.split()[-1]]
    if not devices:
        sys.exit("No device in `adb devices`. Plug the phone in and unlock it.")
    pid = sh(adb, "shell", "pidof", PKG).strip()
    if not pid:
        sys.exit(f"{PKG} is not running. Open the app, then run this again.")
    wake = sh(adb, "shell", "dumpsys", "power")
    if "mWakefulness=Awake" not in wake:
        print("  ! the screen is not awake. The app cannot decode slices in the")
        print("    background, so the run would measure a stalled prewarm.")
        sys.exit("Unlock the phone, bring the app to the front, then run this again.")

    # Awake is not enough. Behind a lock screen the app is not the foreground
    # activity, its Images never decode, and graphics memory sits flat - which is
    # exactly what happened at 06:41 on 2026-09-17 and looked like a working run.
    win = sh(adb, "shell", "dumpsys", "window")
    if "mDreamingLockscreen=true" in win or "isStatusBarKeyguard=true" in win:
        sys.exit("  the phone is locked. Behind a lock screen the app is not in the\n"
                 "  foreground and decodes nothing, so the run would measure a stalled\n"
                 "  prewarm. Unlock it, open the app, then run this again.")
    focus = sh(adb, "shell", "dumpsys", "activity", "activities")
    if PKG not in focus.split("mResumedActivity")[-1][:400] and PKG not in win:
        print(f"  ! {PKG} does not look like the foreground activity.")
        print("    Bring it to the front before pressing the run button.")

    # Default into EVIDENCE_RAW, not beside this script. capture_conditions.py keeps
    # the verbatim dumpsys output and extract_timings.py deliberately drops it from
    # the record to stay readable, so if these files live outside the evidence
    # directory the only re-parsable copy of the raw measurement is working scratch.
    out_dir = args.out_dir or os.path.join(
        os.path.dirname(HERE), "EVIDENCE_RAW",
        f"a9_conditions_{args.policy}_{datetime.now().strftime('%Y%m%dT%H%M%S')}")
    os.makedirs(out_dir, exist_ok=True)
    before = os.path.join(out_dir, "conditions_before.json")
    after = os.path.join(out_dir, "conditions_after.json")

    print(f"\n  device {devices[0]}  ·  {PKG} pid {pid}  ·  policy '{args.policy}'")
    print(f"  output {out_dir}\n")

    # --- 1. clear the buffer ---------------------------------------------
    subprocess.run([adb, "logcat", "-c"], capture_output=True, timeout=60)
    print("  1/5  logcat cleared")

    # --- 2. conditions before --------------------------------------------
    print("  2/5  capturing conditions BEFORE")
    if run_py("capture_conditions.py", "--phase", "before", "--out", before,
              "--note", f"before A9 run, policy={args.policy}. {args.label}"):
        sys.exit("  capture failed; nothing measured, nothing written.")

    # --- 3. wait for the operator ----------------------------------------
    print(f"""
  3/5  ON THE DEVICE, in this order:
         a. select  "cache: {'toàn bộ' if args.policy == 'all' else 'cửa sổ ±3'}"
         b. wait until "Đang nạp cache slice…" disappears
         c. press "chạy 30 bước (A9)"

       Waiting for the app to report its own RUN_END (up to {args.timeout}s).
       Ctrl-C aborts and writes nothing.
""")
    deadline = time.time() + args.timeout
    header, seen_start = None, False
    while time.time() < deadline:
        buf = sh(adb, "logcat", "-d", "-v", "brief")
        starts = list(RUN_START_RE.finditer(buf))
        if starts and not seen_start:
            seen_start = True
            try:
                header = json.loads(starts[-1].group(1))
            except json.JSONDecodeError:
                header = None
            print(f"       run started: policy={header.get('cache_policy') if header else '?'}"
                  f"  nz={header.get('nz') if header else '?'}"
                  f"  steps={header.get('steps') if header else '?'}")
        if seen_start and RUN_END_RE.search(buf[starts[-1].start():]):
            print("       run finished")
            break
        time.sleep(3)
    else:
        sys.exit("\n  timed out waiting for RUN_END. Nothing is written - a run that "
                 "did not finish is not a short run, it is not a measurement.")

    if header and header.get("cache_policy") != args.policy:
        sys.exit(f"\n  the app ran policy '{header.get('cache_policy')}' but you passed "
                 f"--policy {args.policy}. Refusing to mislabel the record.")

    # --- 4. conditions after ---------------------------------------------
    time.sleep(2)                       # let the last frame settle
    print("\n  4/5  capturing conditions AFTER")
    if run_py("capture_conditions.py", "--phase", "after", "--out", after,
              "--note", f"after A9 run, policy={args.policy}. {args.label}"):
        sys.exit("  capture failed; the run happened but its conditions are unknown.")

    # --- 5. extract --------------------------------------------------------
    print("\n  5/5  extracting samples\n")
    rc = run_py("extract_timings.py",
                "--label", f"{args.label} · cache={args.policy}",
                "--meminfo-before", before, "--meminfo-after", after)
    if rc:
        sys.exit(rc)
    print(f"\n  conditions kept in {out_dir}")


if __name__ == "__main__":
    main()
