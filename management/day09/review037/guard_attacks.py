#!/usr/bin/env python3
"""PR #37 review: attacks on the bring-up manifest guard (`load_split`).

A refusal only counts if the control loads: the committed synthetic manifest
must pass the same function first, otherwise every "REFUSE" below is noise.

Usage:
    python guard_attacks.py <path to spikes/spike_c_ml/harness> <writable work dir>
"""
import copy
import json
import sys
from pathlib import Path

harness = Path(sys.argv[1]).resolve()
work = Path(sys.argv[2]).resolve()
work.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(harness))
import pipeline_bringup as pb  # noqa: E402  (no GPU work at import time)

base = json.loads(pb.FIXTURE.read_text(encoding="utf-8"))


def parts(d):
    return d["partitions"]


def overlap(d):
    parts(d)["validation"]["case_ids"][0] = parts(d)["train"]["case_ids"][0]


def duplicate(d):
    parts(d)["train"]["case_ids"][1] = parts(d)["train"]["case_ids"][0]


def count_off(d):
    parts(d)["train"]["case_count"] += 1


def empty_val(d):
    parts(d)["validation"]["case_ids"] = []
    parts(d)["validation"]["case_count"] = 0


CASES = [
    ("control: committed synthetic manifest", None, "LOAD"),
    ("real-looking id in train", lambda d: parts(d)["train"]["case_ids"].__setitem__(0, "CASE_0001"), "REFUSE"),
    ("real-looking id in validation", lambda d: parts(d)["validation"]["case_ids"].__setitem__(0, "CASE_0117"), "REFUSE"),
    ("train/validation overlap", overlap, "REFUSE"),
    ("duplicate id inside train", duplicate, "REFUSE"),
    ("train case_count off by one", count_off, "REFUSE"),
    ("empty validation", empty_val, "REFUSE"),
    ("partitions key missing", lambda d: d.pop("partitions"), "REFUSE"),
    ("extra holdout partition with real ids (only train/validation are read)",
     lambda d: parts(d).__setitem__("holdout", {"case_ids": ["CASE_0200"], "case_count": 1}), "LOAD"),
]

unexpected = 0
control_ok = False
for i, (name, fn, expect) in enumerate(CASES):
    d = copy.deepcopy(base)
    if fn:
        fn(d)
    path = work / f"attack_{i:02d}.json"
    path.write_text(json.dumps(d, indent=2), encoding="utf-8")
    try:
        train, val = pb.load_split(path)
        got, detail = "LOAD", f"train={len(train)} validation={len(val)}"
    except Exception as exc:  # the guard raises ValueError; anything else is reported as-is
        got, detail = "REFUSE", f"{type(exc).__name__}: {exc}"
    ok = got == expect
    if i == 0:
        control_ok = ok
    unexpected += 0 if ok else 1
    print(f"{'ok ' if ok else 'BAD'} expect={expect:<6} got={got:<6} {name} -- {detail}")

if not control_ok:
    print("CONTROL FAILED: results above are not evidence")
    sys.exit(2)
print(f"control loads; {len(CASES) - 1 - unexpected}/{len(CASES) - 1} attacks behaved as expected")
sys.exit(1 if unexpected else 0)
