#!/usr/bin/env python3
"""
Capture the device conditions and memory footprint around an A9 run.

THROWAWAY SPIKE CODE. Not production. Boundary: spikes/spike_a_2d/**.

WHY THIS EXISTS (stage S6, 2026-09-17). Until today two fields in every A9
evidence record were typed in by hand:

    "build_type":  "[RECORD - release or debug ...]"
    "conditions":  "[RECORD - thermal start/end, charging or battery, ...]"

and the two memory numbers quoted in RESULT.md - 68 MB graphics, 186 MB total -
were read off a terminal and retyped into prose. A typed number is a number that
can be wrong, and nothing downstream can tell that it was. This script reads the
same facts straight from the device and writes them as JSON, so extract_timings.py
can fold them into the record without anyone typing a digit.

It measures the device. It does NOT measure latency, and it never writes an A9
verdict. Run it either side of a run:

    python harness/capture_conditions.py --phase before --out /tmp/a9_all_before.json
    ... operator presses "chay 30 buoc (A9)" on the device ...
    python harness/capture_conditions.py --phase after  --out /tmp/a9_all_after.json

Then pass both to extract_timings.py.

The parsed meminfo rows are the ones that matter for the cache question:

    Java Heap     the Dalvik/ART heap - bounded by dalvik.vm.heapgrowthlimit,
                  measured at 256 MB on this device in the DR-006 profile
    Native Heap   native allocations
    Graphics      decoded bitmaps and GPU-side buffers. THIS is where a slice
                  cache lives, and the row RESULT.md's 4.3 MB/slice came from
    TOTAL PSS     proportional set size for the whole process

Raw `dumpsys meminfo` output is kept verbatim in the JSON beside the parsed
values, so a reader can re-parse it rather than trust this parser.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

PKG = "com.cardiacmri.spikea2d"

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
    print("adb not found. Tried:")
    for c in ADB_CANDIDATES:
        print(f"  {c}")
    sys.exit(1)


def sh(adb, *args, timeout=60):
    """Run an adb command and return stdout, or None if it failed."""
    try:
        r = subprocess.run([adb, *args], capture_output=True, timeout=timeout,
                           text=True, encoding="utf-8", errors="replace")
        return r.stdout if r.returncode == 0 else None
    except Exception:
        return None


def parse_meminfo(raw):
    """
    Pull the four rows that matter out of `dumpsys meminfo`.

    Values are kB, as dumpsys reports them. Returns None for a row that is not
    present rather than 0 - a missing measurement is not a measurement of zero,
    which is the same rule extract_timings.py applies to an empty sample list.
    """
    if not raw:
        return {}
    out = {}
    patterns = {
        "java_heap_kb":   r"^\s*Java Heap:\s+(\d+)",
        "native_heap_kb": r"^\s*Native Heap:\s+(\d+)",
        "graphics_kb":    r"^\s*Graphics:\s+(\d+)",
        "code_kb":        r"^\s*Code:\s+(\d+)",
        "stack_kb":       r"^\s*Stack:\s+(\d+)",
        "system_kb":      r"^\s*System:\s+(\d+)",
        "total_pss_kb":   r"^\s*TOTAL PSS:\s+(\d+)",
    }
    for key, pat in patterns.items():
        m = re.search(pat, raw, re.MULTILINE)
        out[key] = int(m.group(1)) if m else None
    # The "TOTAL PSS" line only appears in the App Summary block on some builds;
    # fall back to the TOTAL row of the main table.
    if out.get("total_pss_kb") is None:
        m = re.search(r"^\s*TOTAL\s+(\d+)", raw, re.MULTILINE)
        out["total_pss_kb"] = int(m.group(1)) if m else None
    for k in list(out):
        if out[k] is not None and k.endswith("_kb"):
            out[k.replace("_kb", "_mb")] = round(out[k] / 1024.0, 2)
    return out


def parse_battery(raw):
    if not raw:
        return {}
    def grab(pat, cast=str):
        m = re.search(pat, raw, re.MULTILINE)
        return cast(m.group(1).strip()) if m else None
    status_code = grab(r"^\s*status:\s*(\d+)", int)
    status_name = {1: "UNKNOWN", 2: "CHARGING", 3: "DISCHARGING",
                   4: "NOT_CHARGING", 5: "FULL"}.get(status_code)
    return {
        "level_pct": grab(r"^\s*level:\s*(\d+)", int),
        "status_code": status_code,
        "status": status_name,
        "usb_powered": grab(r"^\s*USB powered:\s*(\w+)"),
        "ac_powered": grab(r"^\s*AC powered:\s*(\w+)"),
        "temperature_c": (lambda v: v / 10.0 if v is not None else None)(
            grab(r"^\s*temperature:\s*(\d+)", int)),
    }


def parse_thermal(raw):
    """
    Thermal status matters because a throttled run and a cool run are different
    measurements. 0 = NONE; anything above that is recorded, not silently passed.
    """
    if not raw:
        return {}
    m = re.search(r"Thermal Status:\s*(\d+)", raw)
    status = int(m.group(1)) if m else None
    names = {0: "NONE", 1: "LIGHT", 2: "MODERATE", 3: "SEVERE",
             4: "CRITICAL", 5: "EMERGENCY", 6: "SHUTDOWN"}
    return {"thermal_status": status, "thermal_status_name": names.get(status)}


def parse_display(raw):
    if not raw:
        return {}
    m = re.search(r"mRefreshRate=([\d.]+)", raw) or re.search(r"fps=([\d.]+)", raw)
    return {"refresh_rate_hz": float(m.group(1)) if m else None}


def main():
    ap = argparse.ArgumentParser(
        description="Capture device conditions and memory around an A9 run.")
    ap.add_argument("--phase", required=True, choices=["before", "after"],
                    help="which side of the run this capture is")
    ap.add_argument("--out", required=True, help="path to write the JSON to")
    ap.add_argument("--package", default=PKG, help=f"app package (default {PKG})")
    ap.add_argument("--note", default="", help="free-text note recorded verbatim")
    args = ap.parse_args()

    adb = find_adb()

    devices = sh(adb, "devices", "-l") or ""
    serials = [ln.split()[0] for ln in devices.splitlines()[1:]
               if ln.strip() and "device " in ln]
    if not serials:
        print("No device in `adb devices`. Nothing is written - a capture with no")
        print("device is not a capture of zero, it is a capture that did not happen.")
        sys.exit(1)

    raw_mem = sh(adb, "shell", "dumpsys", "meminfo", args.package)
    if raw_mem and "No process found" in raw_mem:
        print(f"'{args.package}' is not running on {serials[0]}.")
        print("Launch the app first - meminfo for a dead process measures nothing.")
        sys.exit(1)

    raw_bat = sh(adb, "shell", "dumpsys", "battery")
    raw_therm = sh(adb, "shell", "dumpsys", "thermalservice")
    raw_disp = sh(adb, "shell", "dumpsys", "display")
    brightness_mode = (sh(adb, "shell", "settings", "get", "system",
                          "screen_brightness_mode") or "").strip() or None
    brightness = (sh(adb, "shell", "settings", "get", "system",
                     "screen_brightness") or "").strip() or None
    build = {
        "model": (sh(adb, "shell", "getprop", "ro.product.model") or "").strip(),
        "android_release": (sh(adb, "shell", "getprop", "ro.build.version.release") or "").strip(),
        "heapgrowthlimit": (sh(adb, "shell", "getprop", "dalvik.vm.heapgrowthlimit") or "").strip(),
        "heapsize": (sh(adb, "shell", "getprop", "dalvik.vm.heapsize") or "").strip(),
    }

    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%dT%H%M%S%z")
    record = {
        "_what": "Device conditions and memory footprint captured by "
                 "harness/capture_conditions.py. Every value below was read from "
                 "the device; none was typed in.",
        "phase": args.phase,
        "captured_at": stamp,
        "serial": serials[0],
        "package": args.package,
        "note": args.note,
        "device": build,
        "memory": parse_meminfo(raw_mem),
        "battery": parse_battery(raw_bat),
        "thermal": parse_thermal(raw_therm),
        "display": {
            **parse_display(raw_disp),
            "brightness_mode": ("manual" if brightness_mode == "0"
                                else "automatic" if brightness_mode == "1"
                                else brightness_mode),
            "brightness_raw": brightness,
        },
        "raw": {
            "_why": "Kept verbatim so a reader can re-parse rather than trust the "
                    "parser above.",
            "meminfo": raw_mem,
        },
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")

    m = record["memory"]
    b = record["battery"]
    print(f"  phase            {args.phase}")
    print(f"  device           {build['model']}  android {build['android_release']}  "
          f"heapgrowthlimit {build['heapgrowthlimit']}")
    print(f"  java heap        {m.get('java_heap_mb')} MB")
    print(f"  native heap      {m.get('native_heap_mb')} MB")
    print(f"  graphics         {m.get('graphics_mb')} MB")
    print(f"  TOTAL PSS        {m.get('total_pss_mb')} MB")
    print(f"  battery          {b.get('level_pct')}%  {b.get('status')}  "
          f"{b.get('temperature_c')} C")
    print(f"  thermal          {record['thermal'].get('thermal_status_name')}")
    print(f"  written          {args.out}")


if __name__ == "__main__":
    main()
