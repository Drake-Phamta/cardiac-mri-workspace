#!/usr/bin/env python3
"""
Conclude A10 and A11 from logcat. THROWAWAY SPIKE CODE under spikes/spike_a_2d/.

Until now nothing concluded these two. `extract_brush.py` collects the raw
SPIKE_A_BRUSH strokes and says, in as many words, that it does not judge
A10 or A11 - which was right while the bounds had not been read carefully.
They are frozen, in management/spikes/SPIKE_A_2D/TASK.md:

    A10  Brush feedback performance
         "visible feedback <= 100 ms; zero committed stroke samples lost"
         Measurements required: "ms - p50 and worst case", bound "<= 100"
                                "Committed stroke samples lost | count | 0"

    A11  Edit vs navigation gesture separation causes no accidental edits in
         a scripted pass
         "zero accidental edits"

THE READING OF A10, STATED SO IT CAN BE ARGUED WITH.

A9 names its percentile ("p95 <= 200 ms"). A10 does not, and it asks for the
WORST CASE as a required measurement. The plain reading is therefore that the
bound applies to every sample, so this script judges on the MAXIMUM and
reports p50 / p95 / max so the distribution is visible. If max exceeds 100 ms
while p95 does not, the verdict is FAIL and the reason says so explicitly -
softening it to p95 here would be this script quietly rewriting a frozen
bound. Raise a Decision Request instead; that is the route `00` section 13
sets, and it leaves a record.

WHAT feedback_ms IS. A JS-side next-frame proxy: performance.now() on entering
the PanResponder handler, to the first requestAnimationFrame callback after
the overlay's state update. Native input delivery before the handler is NOT
included and nativeEvent.timestamp is on a different clock, so the real
end-to-end latency is LARGER than this number. A pass here is therefore a pass
on a lower bound, and the record says so. That is a limitation of the harness,
not something to bury.

"Committed stroke samples lost" is checked exactly: for every committed
stroke, samples_received must equal samples_applied + samples_outside.

A11 is checked from the gesture records, which carry the stroke outcome since
S8 (stroke_started / stroke_end / stroke_committed), so the verdict rests on
one record rather than on correlating two log streams by timestamp.

Sample-size floor: 20 committed strokes and 5 second-finger interruptions.
Below that this script reports INCOMPLETE rather than a verdict. A worst case
over 3 strokes is one unlucky frame, and a gesture-separation claim from two
interruptions is an anecdote. The floor is a property of this harness, not a
frozen requirement, and it is named here so it can be changed on purpose.

Usage:
    python extract_a10_a11.py --label "release, A17, S8 session"
    python extract_a10_a11.py --file saved_logcat.txt [--out-dir DIR]
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW")

LINE = re.compile(r"(SPIKE_A_(?:BRUSH|GESTURE))\b\s+(\{.*\})")
OBSERVED, INCOMPLETE, FAIL = "OBSERVED", "INCOMPLETE", "FAIL"

FEEDBACK_BOUND_MS = 100.0       # TASK.md A10
MIN_COMMITTED_STROKES = 20      # harness floor, see the module docstring
MIN_SECOND_FINGER = 5           # harness floor


def read_logcat() -> str:
    adb = "adb"
    sdk = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk", "platform-tools", "adb.exe")
    if os.path.exists(sdk):
        adb = sdk
    try:
        out = subprocess.run([adb, "logcat", "-d", "-v", "brief"], capture_output=True,
                             text=True, errors="replace", timeout=60)
    except FileNotFoundError:
        sys.exit("adb not found. Add <SDK>/platform-tools to PATH and retry.")
    if out.returncode != 0:
        sys.exit(f"adb logcat failed:\n{out.stderr.strip()}")
    return out.stdout


def parse(text):
    strokes, gestures = [], []
    for raw in text.splitlines():
        m = LINE.search(raw)
        if not m:
            continue
        # BRUSH_UNDO / BRUSH_REDO / BRUSH_RESET share the prefix; they are not
        # strokes and must not be counted as ones.
        if "SPIKE_A_BRUSH_" in raw:
            continue
        try:
            payload = json.loads(m.group(2))
        except json.JSONDecodeError:
            continue
        (strokes if m.group(1) == "SPIKE_A_BRUSH" else gestures).append(payload)
    return strokes, gestures


def distribution(values):
    """Nearest-rank, the same definition the app and extract_timings.py use."""
    if not values:
        return None
    v = sorted(values)

    def rank(p):
        return v[min(len(v) - 1, max(0, math.ceil(p * len(v)) - 1))]

    return {"n": len(v), "min": round(v[0], 2), "p50": round(rank(0.5), 2),
            "p95": round(rank(0.95), 2), "max": round(v[-1], 2)}


def judge_a10(strokes):
    committed = [s for s in strokes if s.get("committed") is True]
    detail = {"strokes_total": len(strokes), "strokes_committed": len(committed)}

    # Every committed stroke must account for every sample it received.
    lost = []
    for s in committed:
        recv = s.get("samples_received")
        applied = s.get("samples_applied")
        outside = s.get("samples_outside")
        if None in (recv, applied, outside):
            lost.append({"slice": s.get("slice"), "why": "a sample count is missing from the record"})
        elif recv != applied + outside:
            lost.append({"slice": s.get("slice"), "received": recv,
                         "applied": applied, "outside": outside, "lost": recv - applied - outside})
    detail["committed_samples_lost"] = lost

    p50s = [s["feedback_ms_p50"] for s in committed if s.get("feedback_ms_p50") is not None]
    maxes = [s["feedback_ms_max"] for s in committed if s.get("feedback_ms_max") is not None]
    detail["per_stroke_p50"] = distribution(p50s)
    detail["per_stroke_max"] = distribution(maxes)

    if lost:
        return FAIL, (f"{len(lost)} committed stroke(s) lost samples; A10 bounds that at zero"), detail
    if not maxes:
        return INCOMPLETE, "no committed stroke carries a feedback timing", detail
    if len(committed) < MIN_COMMITTED_STROKES:
        return INCOMPLETE, (f"only {len(committed)} committed strokes; this harness will not call a worst "
                            f"case from fewer than {MIN_COMMITTED_STROKES}"), detail

    worst = max(maxes)
    p95_of_max = detail["per_stroke_max"]["p95"]
    if worst <= FEEDBACK_BOUND_MS:
        return OBSERVED, (f"worst per-stroke feedback {worst} ms over {len(committed)} committed strokes, "
                          f"within the {FEEDBACK_BOUND_MS:g} ms of A10, and no committed sample lost"), detail
    return FAIL, (f"worst per-stroke feedback {worst} ms exceeds the {FEEDBACK_BOUND_MS:g} ms of A10 "
                  f"(p95 of per-stroke maxima {p95_of_max} ms). A10 names no percentile and asks for the "
                  f"worst case, so this is a FAIL; if p95 is the intended reading, that is a Decision "
                  f"Request, not a change to this script"), detail


def judge_a11(strokes, gestures):
    detail = {}

    # An accidental edit is a stroke that committed without a clean lift.
    accidental = [s for s in strokes if s.get("committed") is True and s.get("end") != "release"]
    detail["committed_without_clean_release"] = accidental

    # A stroke that committed in a gesture that ever reached two fingers is
    # the same failure seen from the gesture side.
    multi_committed = [g for g in gestures
                       if (g.get("fingers_max") or 0) >= 2 and g.get("stroke_committed") is True]
    detail["multi_finger_gestures_with_a_committed_stroke"] = multi_committed

    interrupted = [s for s in strokes if s.get("end") == "second_finger"]
    detail["second_finger_interruptions"] = len(interrupted)
    not_rolled_back = [s for s in interrupted if s.get("committed") is not False]
    detail["interruptions_not_rolled_back"] = not_rolled_back

    terminated = [s for s in strokes if s.get("end") == "terminated"]
    detail["system_terminations"] = len(terminated)

    gestures_with_outcome = [g for g in gestures if "stroke_committed" in g]
    detail["gestures_carrying_a_stroke_outcome"] = len(gestures_with_outcome)

    if accidental or multi_committed or not_rolled_back:
        return FAIL, (f"{len(accidental)} stroke(s) committed without a clean lift, "
                      f"{len(multi_committed)} committed inside a multi-finger gesture, "
                      f"{len(not_rolled_back)} second-finger interruption(s) not rolled back; "
                      "A11 bounds accidental edits at zero"), detail
    if len(interrupted) < MIN_SECOND_FINGER:
        return INCOMPLETE, (f"only {len(interrupted)} second-finger interruptions; this harness will not "
                            f"call gesture separation from fewer than {MIN_SECOND_FINGER}"), detail
    if not gestures_with_outcome:
        return INCOMPLETE, ("no gesture record carries a stroke outcome - this log predates S8, so the "
                            "multi-finger check could only be inferred by correlating timestamps"), detail
    return OBSERVED, (f"{len(interrupted)} second-finger interruptions all rolled back, "
                      f"no stroke committed in a multi-finger gesture, "
                      f"no stroke committed without a clean lift"), detail


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="read a saved logcat dump instead of calling adb")
    ap.add_argument("--label", default="", help="short note stored with the run")
    ap.add_argument("--out-dir", default=EVIDENCE, help="where the evidence JSON goes (default EVIDENCE_RAW/)")
    args = ap.parse_args()

    text = open(args.file, encoding="utf-8", errors="replace").read() if args.file else read_logcat()
    strokes, gestures = parse(text)
    if not strokes:
        print("No SPIKE_A_BRUSH strokes in the log. Nothing is written - a run with no strokes is not a")
        print("measurement of brush feedback. Paint in 'Sửa' first; see SESSION_S8.md section 2.")
        return 1

    a10, a10_why, a10_detail = judge_a10(strokes)
    a11, a11_why, a11_detail = judge_a11(strokes, gestures)

    record = {
        "criterion": "A10, A11 — brush feedback latency and edit/navigation gesture separation",
        "target": "visible feedback <= 100 ms with zero committed samples lost; zero accidental edits",
        "extracted_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        # Where the lines came from. A re-analysis of an older session's saved
        # log is legitimate evidence, but it is not a new measurement, and the
        # filename's timestamp is the extraction time - so the source is
        # recorded rather than left to be guessed from the label.
        "source_log": args.file if args.file else "adb logcat -d (live device)",
        "captured_at": ("see source_log - this record was extracted from a saved log"
                        if args.file else
                        datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")),
        "label": args.label,
        "operator": "FILL IN BY HAND",
        "build_type": "FILL IN BY HAND (debug or release)",
        "device_profile": "FILL IN BY HAND",
        "criteria": {"A10": a10, "A11": a11},
        "verdict_from_raw_log": FAIL if FAIL in (a10, a11) else (
            OBSERVED if a10 == a11 == OBSERVED else INCOMPLETE),
        "verdict_reason": f"A10: {a10_why} | A11: {a11_why}",
        "a10": {"verdict": a10, "why": a10_why, "bound_ms": FEEDBACK_BOUND_MS,
                "min_committed_strokes": MIN_COMMITTED_STROKES, **a10_detail},
        "a11": {"verdict": a11, "why": a11_why,
                "min_second_finger": MIN_SECOND_FINGER, **a11_detail},
        "strokes": strokes,
        "gestures": gestures,
        "measurement_limits": [
            "feedback_ms is a JS-side next-frame proxy: it excludes native input delivery before the "
            "PanResponder handler runs, so real end-to-end latency is LARGER. A pass is a pass on a "
            "lower bound.",
            "A10 names no percentile and requires a worst case, so the verdict is taken on the maximum. "
            "p50 and p95 are reported for the distribution, not used to soften the bound.",
            "The sample-size floors are properties of this harness, not frozen requirements.",
        ],
    }

    os.makedirs(args.out_dir, exist_ok=True)
    stamp = datetime.now().astimezone().strftime("%Y%m%dT%H%M%S%z")
    path = os.path.join(args.out_dir, f"a10_a11_brush_feedback_{stamp}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print(f"  strokes           {len(strokes)} ({a10_detail['strokes_committed']} committed, "
          f"{a11_detail['second_finger_interruptions']} stopped by a second finger, "
          f"{a11_detail['system_terminations']} terminated by the system)")
    print(f"  gestures          {len(gestures)} ({a11_detail['gestures_carrying_a_stroke_outcome']} carry a stroke outcome)")
    print(f"  feedback p50      {a10_detail['per_stroke_p50']}")
    print(f"  feedback max      {a10_detail['per_stroke_max']}")
    print(f"  A10               {a10} — {a10_why}")
    print(f"  A11               {a11} — {a11_why}")
    try:
        shown = os.path.relpath(path, os.getcwd())
    except ValueError:
        shown = path
    print(f"\n  written           {shown}")
    print("  Fill operator, device_profile and build_type by hand. Not acceptance evidence on a debug build.")
    return 1 if FAIL in (a10, a11) else 0


if __name__ == "__main__":
    raise SystemExit(main())
