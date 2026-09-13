#!/usr/bin/env python3
"""
Conformance checks for the SPIKE_A fixtures and, later, for masks the app
exports.

THROWAWAY SPIKE CODE under spikes/spike_a_2d/.

What this checks TODAY, without the device:

  F1  fixture integrity — shapes, per-slice checksums, DR-008a fields present
  F2  the stored expected_source_pixel values recomputed independently
  F3  orientation markers sit exactly where DR-008a says they should

What it does NOT check yet is stated as NOT IMPLEMENTED rather than passing
silently. A checker that reports PASS for something it never looked at is worse
than no checker, because it produces evidence that is not evidence.

  A2  zoom/pan leaves the source mask checksum unchanged   -> needs app export
  A3  brush ADD touches only the intended pixels           -> needs app export
  A4  brush ERASE touches only the intended pixels         -> needs app export
  A5  brush mapping error distribution after zoom/pan      -> needs app export
  A6  undo   A7 redo   A8 save/reload                      -> needs app export

F2 exists because the fixture generator and this checker must not share code.
generate.py writes the expected pixel; this file derives it again from the
transform stated in the fixture and compares. A single implementation checked
against itself proves nothing.
"""

import base64
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(os.path.dirname(HERE), "fixtures")

PASS, FAIL, SKIP = "PASS", "FAIL", "NOT IMPLEMENTED"
results = []


def record(cid, name, status, detail=""):
    results.append((cid, name, status, detail))


def load(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return json.load(f)


# --- F1 ---------------------------------------------------------------------
def check_fixture_integrity(vol, mask):
    problems = []
    nx, ny, nz = vol["shape_xyz"]

    if vol["slice_shape_yx"] != [ny, nx]:
        problems.append(f"volume slice_shape_yx {vol['slice_shape_yx']} != [Ny,Nx] {[ny, nx]}")
    if mask["shape_xyz"] != vol["shape_xyz"]:
        problems.append("mask shape_xyz differs from volume shape_xyz")

    for tag, obj in (("volume", vol), ("mask", mask)):
        if len(obj["slices_b64"]) != nz:
            problems.append(f"{tag}: {len(obj['slices_b64'])} slices, expected {nz}")
        for z, (b64, want) in enumerate(zip(obj["slices_b64"], obj["slice_sha256"])):
            raw = base64.b64decode(b64)
            if len(raw) != nx * ny:
                problems.append(f"{tag} z={z}: {len(raw)} bytes, expected {nx * ny}")
            got = hashlib.sha256(raw).hexdigest()
            if got != want:
                problems.append(f"{tag} z={z}: checksum mismatch")

    idx = vol.get("indexing", {})
    for key, want in (("x", "COLUMN"), ("y", "ROW"), ("z", "SLICE INDEX")):
        if want not in idx.get(key, "").upper():
            problems.append(f"indexing.{key} does not state {want} — DR-008a")
    if idx.get("origin") != "top-left":
        problems.append("indexing.origin is not top-left — DR-008a")

    if mask.get("label_mapping") != {"0": "background", "1": "foreground"}:
        problems.append("mask label_mapping is missing or not recorded explicitly")

    record("F1", "fixture integrity", FAIL if problems else PASS,
           "; ".join(problems) if problems else
           f"{nz} slices, {nx}x{ny}, all checksums match, DR-008a fields present")


# --- F2 ---------------------------------------------------------------------
def check_expected_pixels(vol, brush):
    """
    Independent rederivation. The transform is read from the fixture's own
    `transform` block, not hardcoded here, so a change in the contract shows up
    as a disagreement instead of being silently mirrored.
    """
    nx, ny, _ = vol["shape_xyz"]
    t = brush["transform"]
    if t["rounding"] != "floor":
        record("F2", "expected pixels rederived", FAIL,
               f"rounding is '{t['rounding']}', this checker only implements floor")
        return

    bad = []
    for c in brush["cases"]:
        sx = (c["touch_u"] - c["pan_x"]) / c["zoom"]
        sy = (c["touch_v"] - c["pan_y"]) / c["zoom"]
        outside = sx < 0 or sy < 0 or sx >= nx or sy >= ny
        mine = None if outside else [math.floor(sx), math.floor(sy)]
        if mine != c["expected_source_pixel"]:
            bad.append(f"{c['id']}: stored {c['expected_source_pixel']} vs rederived {mine}")
        if c["must_not_paint"] != (c["expected_source_pixel"] is None):
            bad.append(f"{c['id']}: must_not_paint disagrees with expected_source_pixel")

    outside_n = sum(1 for c in brush["cases"] if c["must_not_paint"])
    record("F2", "expected pixels rederived", FAIL if bad else PASS,
           "; ".join(bad[:5]) if bad else
           f"{len(brush['cases'])} cases agree, {outside_n} correctly marked outside the image")


# --- F3 ---------------------------------------------------------------------
def check_orientation_markers(vol):
    """
    A flipped or transposed axis is the failure mode that quietly corrupts every
    brush coordinate, so the markers are verified rather than trusted.
    """
    nx, ny, nz = vol["shape_xyz"]
    bad = []
    for z in range(nz):
        buf = base64.b64decode(vol["slices_b64"][z])

        def at(x, y):
            return buf[y * nx + x]

        if not all(at(x, y) == 255 for y in range(3) for x in range(3)):
            bad.append(f"z={z}: top-left 3x3 marker missing")
        if not all(at(nx - 1 - x, y) == 255 for y in range(2) for x in range(2)):
            bad.append(f"z={z}: top-right 2x2 marker missing")
        if at(0, ny - 1) != 255:
            bad.append(f"z={z}: bottom-left pixel marker missing")
        if at(nx - 1, ny - 1) == 255:
            bad.append(f"z={z}: bottom-right should be unmarked but is 255 — axes may be flipped")

    record("F3", "orientation markers", FAIL if bad else PASS,
           "; ".join(bad[:4]) if bad else
           f"all {nz} slices: 3x3 top-left, 2x2 top-right, 1px bottom-left, none bottom-right")


# --- device-dependent criteria ---------------------------------------------
def declare_pending():
    for cid, name in [
        ("A2", "zoom/pan leaves source mask checksum unchanged"),
        ("A3", "brush ADD modifies only intended pixels"),
        ("A4", "brush ERASE modifies only intended pixels"),
        ("A5", "brush mapping error distribution after zoom/pan"),
        ("A6", "undo restores prior state"),
        ("A7", "redo restores undone state"),
        ("A8", "save/reload reproduces edits"),
    ]:
        record(cid, name, SKIP, "app does not export masks yet — stage S5/S6")


def main():
    vol = load("volume_synthetic.json")
    mask = load("mask_synthetic.json")
    brush = load("brush_cases.json")

    check_fixture_integrity(vol, mask)
    check_expected_pixels(vol, brush)
    check_orientation_markers(vol)
    declare_pending()

    width = max(len(n) for _, n, _, _ in results)
    print()
    for cid, name, status, detail in results:
        mark = {PASS: "ok  ", FAIL: "FAIL", SKIP: "--  "}[status]
        print(f"  {mark} {cid:3s} {name:{width}s}  {detail}")

    failed = [r for r in results if r[2] == FAIL]
    pending = [r for r in results if r[2] == SKIP]
    print(f"\n  {sum(1 for r in results if r[2] == PASS)} pass, {len(failed)} fail, "
          f"{len(pending)} not implemented yet")
    if pending:
        print("  Criteria marked NOT IMPLEMENTED are NOT passing. They are recorded as")
        print("  NOT MEASURED in RESULT.md until the app can export a mask.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
