#!/usr/bin/env python3
"""
Synthetic fixture generator for SPIKE_A (2D viewer + brush).

THROWAWAY SPIKE CODE. Not production. Lives under spikes/ by the implementation
boundary in management/spikes/SPIKE_A_2D/TASK.md.

TEMPORARY FIXTURES. The canonical geometry fixture set is Vũ Hùng Anh's
deliverable under tests/fixtures/geometry/** (DR-013, integration-sensitive per
15 section 9). Spike A CONSUMES that set; it does not write it. These fixtures
exist only so Spike A can start before his set is published, and they are
replaced by it as soon as it lands.

Everything here is deterministic: same seed, byte-identical output.

Canonical indexing — DR-008a, frozen. Every line below obeys it:

    voxel (x, y, z):  x = source image COLUMN
                      y = source image ROW
                      z = source SLICE INDEX
    shape_xyz = [Nx, Ny, Nz]        slice_index = z, valid 0..Nz-1
    a single slice has shape [Ny, Nx]
    screen (u, v) -> (x = u, y = v, z = slice_index)
    origin top-left, +x to the right, +y downward

Library memory order is NOT part of the contract. Inside this file the raw byte
buffer for one slice is row-major [Ny][Nx], which is an implementation choice of
this generator, not a contract. Anything reading it must go through shape_xyz.
"""

import base64
import hashlib
import json
import os
import zlib

# --- fixture parameters -----------------------------------------------------
# Small enough to ship as an app asset, large enough that slice navigation and
# zoom/pan are meaningful. Nz = 16 gives a 30-step navigation test real
# back-and-forth movement rather than a trivial loop.
NX, NY, NZ = 64, 64, 16
SEED = 2024                      # same seed the project uses for splits

# Nx and Ny are overridable from the command line so A9 can be re-measured at the
# REAL cohort slice size. Spike D's package, opened 2026-09-11, shows 576x576 and
# 640x640 in-plane - between 81x and 100x the pixels of the 64x64 default, which
# is why the first A9 result carries a scope limit saying it must be redone.
#
# Nz stays 16. The A9 navigation sequence indexes slices 0..15, and changing two
# variables at once would make the two runs incomparable. One variable moves.
#
#     python generate.py --nx 576 --ny 576
#
# A 576x576 fixture is roughly 7 MB of JSON and is NOT committed: .gitignore
# excludes it, and the run records the sha256 plus this command instead.

HERE = os.path.dirname(os.path.abspath(__file__))

# --- minimal PNG encoder ---------------------------------------------------
# stdlib only, no Pillow, so the fixture regenerates on any machine with plain
# Python. Grayscale 8-bit, filter type 0 on every scanline.
#
# The app needs displayable images: React Native cannot draw a raw byte buffer,
# and rendering 4096 Views per slice is not a viewer, it is a stress test of the
# wrong thing. Pre-encoding here also matches what A9 actually asks about —
# "switching among already available/cached slices" — so the measurement is of
# slice switching, not of a PNG encoder written in JavaScript.

def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return (len(data).to_bytes(4, "big") + tag + data
            + (zlib.crc32(tag + data) & 0xFFFFFFFF).to_bytes(4, "big"))


def encode_png_gray(buf: bytes, width: int, height: int) -> bytes:
    raw = bytearray()
    for y in range(height):
        raw.append(0)                                  # filter: None
        raw += buf[y * width:(y + 1) * width]
    ihdr = (width.to_bytes(4, "big") + height.to_bytes(4, "big")
            + bytes([8, 0, 0, 0, 0]))                  # 8-bit, grayscale
    signature = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    return (signature
            + _png_chunk(b"IHDR", ihdr)
            + _png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + _png_chunk(b"IEND", b""))


def to_data_uri(buf: bytes, width: int, height: int) -> str:
    return "data:image/png;base64," + base64.b64encode(
        encode_png_gray(buf, width, height)).decode("ascii")




def voxel_value(x: int, y: int, z: int) -> int:
    """
    Intensity that encodes its own coordinates.

    A mapping bug moves the sampled pixel, and because neighbouring voxels differ
    by 37 (x), 17 (y) or 5 (z), an off-by-one in ANY axis produces a visibly
    different value instead of a plausible one. That is the point: the fixture
    should make a wrong mapping obvious rather than subtle.

    Range is 2..252 so that 0 and 1 stay free as markers.
    """
    return ((x * 37 + y * 17 + z * 5 + SEED) % 251) + 2


def apply_orientation_markers(buf: bytearray, z: int) -> None:
    """
    Burn four corner markers so a flipped or transposed axis is visible at a
    glance, without running any test.

        top-left     3x3 block of 255   <- origin under DR-008a
        top-right    2x2 block of 255
        bottom-left  1x1 pixel of 255
        bottom-right nothing

    If the viewer shows the big block anywhere except the top-left, the image is
    flipped or transposed and every downstream brush coordinate is wrong.
    """
    def put(x, y, val=255):
        if 0 <= x < NX and 0 <= y < NY:
            buf[y * NX + x] = val

    for dy in range(3):                      # top-left 3x3
        for dx in range(3):
            put(dx, dy)
    for dy in range(2):                      # top-right 2x2
        for dx in range(2):
            put(NX - 1 - dx, dy)
    put(0, NY - 1)                           # bottom-left single pixel
    # bottom-right deliberately empty


def build_volume():
    """Returns (slices_b64, per_slice_sha256). Slice buffers are [Ny][Nx] bytes."""
    slices_b64 = []
    digests = []
    pngs = []
    for z in range(NZ):
        buf = bytearray(NX * NY)
        for y in range(NY):
            row = y * NX
            for x in range(NX):
                buf[row + x] = voxel_value(x, y, z)
        apply_orientation_markers(buf, z)
        raw = bytes(buf)
        slices_b64.append(base64.b64encode(raw).decode("ascii"))
        digests.append(hashlib.sha256(raw).hexdigest())
        pngs.append(to_data_uri(raw, NX, NY))
    return slices_b64, digests, pngs


def build_mask():
    """
    Ground-truth-shaped binary mask: a disc whose centre drifts with z and whose
    radius varies with z. Drift makes slice navigation visible; the sharp edge
    gives brush ADD/ERASE a boundary to be exact about.

    Values are 0 and 1 only. The foreground/background mapping is recorded in
    the manifest rather than assumed — the same discipline Spike D applies to
    the real dataset (criterion A10 there).
    """
    slices_b64 = []
    digests = []
    pngs = []
    for z in range(NZ):
        cx = NX / 2 + (z - NZ / 2) * 0.8
        cy = NY / 2
        r = 10 + 6 * (1 - abs(z - NZ / 2) / (NZ / 2))
        buf = bytearray(NX * NY)
        for y in range(NY):
            row = y * NX
            for x in range(NX):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                buf[row + x] = 1 if (dx * dx + dy * dy) <= r * r else 0
        raw = bytes(buf)
        slices_b64.append(base64.b64encode(raw).decode("ascii"))
        digests.append(hashlib.sha256(raw).hexdigest())
        pngs.append(to_data_uri(bytes(b * 255 for b in raw), NX, NY))
    return slices_b64, digests, pngs


# --- brush mapping cases ----------------------------------------------------
# The transform the app must implement, stated once so the harness and the app
# cannot drift apart:
#
#     source_x = (u - pan_x) / zoom
#     source_y = (v - pan_y) / zoom
#
# where (u, v) is the touch point in viewport pixels, pan is the viewport-space
# offset of the image origin, and zoom is uniform. Expected pixel is the floor,
# which is the only choice consistent with "pixel (x,y) covers [x, x+1) x
# [y, y+1)" under a top-left origin.
#
# A5 is the discriminating criterion of this spike: the frozen spec sets NO
# pixel tolerance for brush mapping, unlike SCQ-06's +/-1 slice rule for 3D
# picking. The spike must report the observed error distribution and PROPOSE a
# tolerance. These cases exist to produce that distribution, not to pass.

VIEWPORT_W, VIEWPORT_H = 1080, 1440   # portrait viewer area, device is 1080x2340


def expected_source_pixel(u, v, zoom, pan_x, pan_y):
    sx = (u - pan_x) / zoom
    sy = (v - pan_y) / zoom
    if sx < 0 or sy < 0 or sx >= NX or sy >= NY:
        return None                    # outside the image: must NOT paint
    return [int(sx), int(sy)]


def build_brush_cases():
    cases = []
    cid = 0

    # Geometries chosen to cover: identity-ish, zoomed in, zoomed out, panned
    # off-centre, and panned so part of the image leaves the viewport.
    geometries = [
        {"name": "fit",            "zoom": 16.0, "pan_x": 8.0,    "pan_y": 8.0},
        {"name": "zoom_in_2x",     "zoom": 32.0, "pan_x": -256.0, "pan_y": -256.0},
        {"name": "zoom_in_4x",     "zoom": 64.0, "pan_x": -900.0, "pan_y": -700.0},
        {"name": "zoom_out_half",  "zoom": 8.0,  "pan_x": 300.0,  "pan_y": 400.0},
        {"name": "panned_corner",  "zoom": 24.0, "pan_x": -100.0, "pan_y": 620.0},
    ]

    # Touch points: centre, near each edge, exact pixel boundaries (the place
    # rounding bugs hide), and two deliberately outside the image.
    def touch_points(g):
        z, px, py = g["zoom"], g["pan_x"], g["pan_y"]
        pts = []
        for sx, sy in [(0, 0), (0.5, 0.5), (1, 1), (31.5, 31.5),
                       (63, 63), (63.5, 63.5), (0, 63), (63, 0),
                       (16.0, 16.0), (16.999, 16.999)]:
            pts.append((px + sx * z, py + sy * z))
        pts.append((px - 5 * z, py + 10 * z))       # left of the image
        pts.append((px + (NX + 3) * z, py + 5 * z))  # right of the image
        return pts

    for g in geometries:
        for (u, v) in touch_points(g):
            exp = expected_source_pixel(u, v, g["zoom"], g["pan_x"], g["pan_y"])
            cases.append({
                "id": f"BC-{cid:03d}",
                "geometry": g["name"],
                "zoom": g["zoom"],
                "pan_x": g["pan_x"],
                "pan_y": g["pan_y"],
                "touch_u": round(u, 4),
                "touch_v": round(v, 4),
                "slice_index": cid % NZ,
                "expected_source_pixel": exp,   # null = outside, must not paint
                "must_not_paint": exp is None,
            })
            cid += 1
    return cases


def main():
    global NX, NY
    import argparse
    ap = argparse.ArgumentParser(description="Generate the Spike A fixture set.")
    ap.add_argument("--nx", type=int, default=NX, help="in-plane width  (default 64)")
    ap.add_argument("--ny", type=int, default=NY, help="in-plane height (default 64)")
    args = ap.parse_args()

    if (args.nx, args.ny) != (NX, NY):
        NX, NY = args.nx, args.ny
        print(f"  in-plane size overridden to {NX}x{NY} (Nz stays {NZ})")

    vol_b64, vol_digests, vol_png = build_volume()
    mask_b64, mask_digests, mask_png = build_mask()
    cases = build_brush_cases()

    volume = {
        "_warning": "TEMPORARY Spike A fixture. Replaced by Vũ Hùng Anh's canonical "
                    "set under tests/fixtures/geometry/** when it lands. Do not build "
                    "production code against this file.",
        "seed": SEED,
        "shape_xyz": [NX, NY, NZ],
        "slice_shape_yx": [NY, NX],
        "encoding": "base64(uint8), one entry per slice, row-major [Ny][Nx] inside each slice",
        "png_note": "slices_png_data_uri holds the same pixels as an 8-bit grayscale PNG, so the app can display a slice without a JS pixel-buffer renderer. Pre-encoding is deliberate: A9 measures switching among ALREADY CACHED slices.",
        "indexing": {
            "decision": "DR-008a",
            "x": "source image COLUMN",
            "y": "source image ROW",
            "z": "source SLICE INDEX, 0..Nz-1",
            "origin": "top-left",
            "x_direction": "right",
            "y_direction": "down",
            "note": "Library memory order is NOT part of the contract."
        },
        "spacing_xyz": [1.0, 1.0, 1.0],
        "origin_xyz": [0.0, 0.0, 0.0],
        "direction": "axis-aligned identity (DR-012 boundary)",
        "orientation_markers": {
            "purpose": "A flipped or transposed axis is visible without running a test.",
            "top_left": "3x3 block of 255",
            "top_right": "2x2 block of 255",
            "bottom_left": "1 pixel of 255",
            "bottom_right": "none"
        },
        "intensity_rule": "value = ((x*37 + y*17 + z*5 + seed) % 251) + 2, markers overwrite with 255",
        "slice_sha256": vol_digests,
        "slices_b64": vol_b64,
        "slices_png_data_uri": vol_png,
    }

    mask = {
        "_warning": "TEMPORARY Spike A fixture. See volume_synthetic.json.",
        "seed": SEED,
        "shape_xyz": [NX, NY, NZ],
        "slice_shape_yx": [NY, NX],
        "encoding": "base64(uint8), one entry per slice, row-major [Ny][Nx]",
        "label_mapping": {"0": "background", "1": "foreground"},
        "label_mapping_note": "Recorded, not assumed — the same rule Spike D applies to the real dataset.",
        "shape": "disc, centre drifts with z, radius varies with z",
        "slice_sha256": mask_digests,
        "slices_b64": mask_b64,
        "slices_png_data_uri": mask_png,
    }

    brush = {
        "_warning": "TEMPORARY Spike A fixture. See volume_synthetic.json.",
        "viewport": {"width": VIEWPORT_W, "height": VIEWPORT_H},
        "transform": {
            "source_x": "(u - pan_x) / zoom",
            "source_y": "(v - pan_y) / zoom",
            "rounding": "floor",
            "rounding_reason": "pixel (x,y) covers [x,x+1) x [y,y+1) under a top-left origin",
            "outside_image": "expected_source_pixel is null and the app MUST NOT paint"
        },
        "a5_note": "The frozen spec sets NO pixel tolerance for brush mapping. This spike reports the "
                   "observed error distribution and PROPOSES a tolerance; it does not assume one.",
        "case_count": len(cases),
        "cases": cases,
    }

    for name, obj in [("volume_synthetic.json", volume),
                      ("mask_synthetic.json", mask),
                      ("brush_cases.json", brush)]:
        path = os.path.join(HERE, name)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(obj, f, indent=1, sort_keys=False, ensure_ascii=False)
            f.write("\n")
        with open(path, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        print(f"  {name:26s} {os.path.getsize(path):>9,d} bytes  sha256 {digest[:16]}…")

    print(f"\n  volume  {NX}x{NY}x{NZ}, seed {SEED}")
    print(f"  brush   {len(cases)} cases across {len(set(c['geometry'] for c in cases))} geometries, "
          f"{sum(1 for c in cases if c['must_not_paint'])} of them outside the image")


if __name__ == "__main__":
    main()
