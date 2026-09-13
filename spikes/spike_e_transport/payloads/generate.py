#!/usr/bin/env python3
"""
Representative artifact payloads for the Spike E transport harness.

THROWAWAY SPIKE CODE under spikes/spike_e_transport/. Not production.

`SPIKE_E_TRANSPORT/TASK.md` allows synthetic inputs so the spike does not wait
on Spike D:

    "One volume at realistic dimensions and dtype - synthetic is acceptable;
     this spike must not wait for Spike D."
    "Mesh artifacts at Spike B's decimation levels, once available. If Spike B
     has not yet produced them, use a synthetic mesh of comparable triangle
     count and record that substitution."

Both substitutions are recorded in the emitted manifest rather than left for
someone to notice later.

WHAT "REALISTIC DIMENSIONS" MEANS TONIGHT
------------------------------------------
It is a placeholder, and the manifest says so. The real cohort shape is Spike D
criterion A6, which has not been measured. The default here (576 x 576 x 88,
int16) is a commonly cited LGE-MRI atrial volume size, and it is used ONLY to
give the transport harness a payload of a plausible order of magnitude. Every
number this produces must be re-derived once A6 reports the real distribution.

Nothing here measures anything. It makes bytes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import zlib

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_OUT = os.path.join(HERE, "out")

# PLACEHOLDER until Spike D criterion A6 reports the cohort shape distribution.
DEFAULT_SHAPE = (576, 576, 88)      # Nx, Ny, Nz - DR-008a ordering
SEED = 2024                          # the project's canonical seed


def synth_volume(shape, seed: int = SEED) -> np.ndarray:
    """Deterministic int16 volume with structure, not noise.

    Structure matters: a pure-noise volume is incompressible, and compression
    behaviour is one of the things the transport strategies differ on. A volume
    that compresses unrealistically well or unrealistically badly would bias
    every strategy comparison.
    """
    nx, ny, nz = shape
    rng = np.random.default_rng(seed)
    x = np.arange(nx, dtype=np.float32)[:, None, None]
    y = np.arange(ny, dtype=np.float32)[None, :, None]
    z = np.arange(nz, dtype=np.float32)[None, None, :]
    cx, cy, cz = nx / 2, ny / 2, nz / 2

    r = np.sqrt(((x - cx) / (nx * 0.35)) ** 2
                + ((y - cy) / (ny * 0.33)) ** 2
                + ((z - cz) / (nz * 0.40)) ** 2)
    base = np.clip(1.0 - r, 0.0, 1.0) * 900.0
    base += 120.0 * np.sin(x / 9.0) * np.cos(y / 11.0)
    base += rng.normal(0.0, 25.0, size=(nx, ny, nz)).astype(np.float32)
    return np.clip(base, 0, 4095).astype(np.int16)


def synth_mask(shape, seed: int = SEED) -> np.ndarray:
    nx, ny, nz = shape
    x = np.arange(nx)[:, None, None]
    y = np.arange(ny)[None, :, None]
    z = np.arange(nz)[None, None, :]
    cx, cy, cz = nx / 2, ny / 2, nz / 2
    inside = (((x - cx) / (nx * 0.22)) ** 2
              + ((y - cy) / (ny * 0.20)) ** 2
              + ((z - cz) / (nz * 0.28)) ** 2) <= 1.0
    return inside.astype(np.uint8)


def _png_chunk(tag: bytes, payload: bytes) -> bytes:
    return (struct.pack(">I", len(payload)) + tag + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF))


def encode_png_gray8(buf: bytes, width: int, height: int, level: int = 6) -> bytes:
    """Minimal 8-bit grayscale PNG. stdlib zlib only, same approach as Spike A."""
    raw = bytearray()
    for row in range(height):
        raw.append(0)                                     # filter: None
        raw += buf[row * width:(row + 1) * width]
    ihdr = width.to_bytes(4, "big") + height.to_bytes(4, "big") + bytes([8, 0, 0, 0, 0])
    signature = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    return (signature
            + _png_chunk(b"IHDR", ihdr)
            + _png_chunk(b"IDAT", zlib.compress(bytes(raw), level))
            + _png_chunk(b"IEND", b""))


def pack_mask_bits(slice_u8: np.ndarray) -> bytes:
    """Strategy 2 wants a packed-binary mask: 1 bit per voxel, not 1 byte."""
    return np.packbits(slice_u8.astype(bool), axis=None).tobytes()


def write_synthetic_mesh(path: str, level: int) -> int:
    """Write a deterministic UV-sphere stand-in when Spike B meshes are absent.

    Spike E only needs representative byte/triangle sizes for E6 until the
    geometry owner supplies real decimation levels.  The manifest labels these
    meshes as synthetic so they can never be mistaken for anatomy.
    """
    rings = 8 * (2 ** level)
    segments = 16 * (2 ** level)
    lines = ["# SYNTHETIC SPIKE_E mesh; not real anatomy\n"]
    for i in range(rings + 1):
        theta = np.pi * i / rings
        z = np.cos(theta)
        radius = np.sin(theta)
        for j in range(segments):
            phi = 2.0 * np.pi * j / segments
            lines.append(f"v {radius * np.cos(phi):.6f} "
                         f"{radius * np.sin(phi):.6f} {z:.6f}\n")
    triangles = 0
    for i in range(rings):
        for j in range(segments):
            a = i * segments + j + 1
            b = i * segments + ((j + 1) % segments) + 1
            c = (i + 1) * segments + j + 1
            d = (i + 1) * segments + ((j + 1) % segments) + 1
            lines.append(f"f {a} {b} {c}\n")
            lines.append(f"f {b} {d} {c}\n")
            triangles += 2
    with open(path, "w", encoding="ascii", newline="\n") as f:
        f.writelines(lines)
    return triangles


def build(out_dir: str, shape, mesh_levels_json: str | None) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    nx, ny, nz = shape

    vol = synth_volume(shape)
    mask = synth_mask(shape)

    # whole volume, raw int16 (strategy 3)
    vol_path = os.path.join(out_dir, "volume_int16.raw")
    vol.tobytes(order="C")
    with open(vol_path, "wb") as f:
        f.write(vol.tobytes(order="C"))

    # per-slice artifacts (strategies 1, 2, 4)
    png_dir = os.path.join(out_dir, "slices_png")
    bin_dir = os.path.join(out_dir, "slices_maskbits")
    os.makedirs(png_dir, exist_ok=True)
    os.makedirs(bin_dir, exist_ok=True)

    png_sizes, bin_sizes = [], []
    for z in range(nz):
        # DR-008a: a slice has shape [Ny, Nx]; the array is indexed [x, y, z].
        sl = vol[:, :, z].T                        # -> [Ny, Nx]
        eight = (np.clip(sl, 0, 4095) >> 4).astype(np.uint8)
        png = encode_png_gray8(eight.tobytes(order="C"), width=nx, height=ny)
        with open(os.path.join(png_dir, f"{z:04d}.png"), "wb") as f:
            f.write(png)
        png_sizes.append(len(png))

        bits = pack_mask_bits(mask[:, :, z].T)
        with open(os.path.join(bin_dir, f"{z:04d}.bin"), "wb") as f:
            f.write(bits)
        bin_sizes.append(len(bits))

    # Mesh artifacts (criterion E6). Copied in rather than referenced, because
    # the stub must serve them and a path into a sibling spike's output
    # directory would break the moment either side moves.
    meshes = []
    mesh_dir = os.path.join(out_dir, "meshes")
    os.makedirs(mesh_dir, exist_ok=True)
    mesh_levels = []
    spike_b_root = None
    if mesh_levels_json and os.path.exists(mesh_levels_json):
        spike_b_root = os.path.dirname(os.path.dirname(os.path.abspath(mesh_levels_json)))
        with open(mesh_levels_json, encoding="utf-8") as f:
            mesh_levels = json.load(f).get("levels", [])

    # Spike B is a soft dependency.  If its manifest or OBJ files are not
    # available, create comparable deterministic stand-ins instead of silently
    # leaving E6 with an empty mesh set.
    if not mesh_levels:
        mesh_levels = [{"level": level} for level in range(4)]

    for lv in mesh_levels:
        level = int(lv["level"])
        src = None
        if spike_b_root and lv.get("obj"):
            src = os.path.normpath(os.path.join(spike_b_root, *lv["obj"].split("/")[1:]))
        dst = os.path.join(mesh_dir, f"level_{level}.obj")
        entry = {
            "level": level,
            "triangle_count": lv.get("triangle_count"),
            "source": "Spike B SYNTHETIC mesh (spikes/spike_b_3d/mesh/out)"
                       if src else "Spike E synthetic fallback — Spike B mesh unavailable",
        }
        if src and os.path.exists(src):
            with open(src, "rb") as fin, open(dst, "wb") as fout:
                fout.write(fin.read())
            entry["size_bytes"] = os.path.getsize(dst)
            entry["triangle_count"] = entry["triangle_count"] or "from Spike B manifest"
        else:
            entry["triangle_count"] = write_synthetic_mesh(dst, level)
            entry["synthetic"] = True
            entry["substitution"] = "Spike B decimation unavailable; deterministic UV-sphere stand-in"
            entry["size_bytes"] = os.path.getsize(dst)
        entry["served_as"] = f"/mesh/{level}.obj"
        meshes.append(entry)

    manifest = {
        "_status": "SYNTHETIC PAYLOADS - not dataset bytes, not acceptance evidence",
        "_substitutions_recorded": [
            "Volume is SYNTHETIC. Spike D has not delivered a validated package to this "
            "harness, and TASK.md permits a synthetic volume so Spike E does not wait.",
            "Shape is a PLACEHOLDER. The real cohort shape is Spike D criterion A6, which "
            "is not yet measured. Every byte count below must be re-derived once A6 lands.",
            "Meshes are Spike B's SYNTHETIC decimation levels, not meshes from real anatomy.",
        ],
        "seed": SEED,
        "shape_xyz": list(shape),
        "dtype": "int16",
        "volume_raw_bytes": os.path.getsize(vol_path),
        "slice_count": nz,
        "slice_png_bytes": {
            "total": sum(png_sizes), "min": min(png_sizes),
            "median": int(np.median(png_sizes)), "max": max(png_sizes),
        },
        "slice_maskbits_bytes": {
            "total": sum(bin_sizes), "each": bin_sizes[0] if bin_sizes else None,
            "note": "1 bit per voxel via np.packbits - strategy 2",
        },
        "meshes": meshes,
        "sha256_volume": hashlib.sha256(open(vol_path, "rb").read()).hexdigest(),
    }
    with open(os.path.join(out_dir, "payload_manifest.json"), "w",
              encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--shape", default=",".join(map(str, DEFAULT_SHAPE)),
                    help="Nx,Ny,Nz - PLACEHOLDER until Spike D A6 reports the real distribution")
    ap.add_argument("--mesh-levels",
                    default=os.path.normpath(os.path.join(
                        ROOT, "..", "spike_b_3d", "mesh", "out", "mesh_levels.json")))
    args = ap.parse_args()

    shape = tuple(int(v) for v in args.shape.split(","))
    m = build(args.out, shape, args.mesh_levels)

    mb = 1024 * 1024
    print()
    print(f"  shape           {m['shape_xyz']}  {m['dtype']}   seed {m['seed']}")
    print(f"  whole volume    {m['volume_raw_bytes'] / mb:8.2f} MB   <- strategy 3")
    print(f"  {m['slice_count']} PNG slices    {m['slice_png_bytes']['total'] / mb:8.2f} MB total, "
          f"median {m['slice_png_bytes']['median'] / 1024:.1f} KB each   <- strategy 1")
    print(f"  mask bitplanes  {m['slice_maskbits_bytes']['total'] / mb:8.2f} MB total, "
          f"{m['slice_maskbits_bytes']['each'] / 1024:.1f} KB each   <- strategy 2")
    for mesh in m["meshes"]:
        if mesh["size_bytes"]:
            print(f"  mesh level {mesh['level']}    {mesh['size_bytes'] / mb:8.2f} MB   "
                  f"{mesh['triangle_count']} triangles")
    print()
    print("  SYNTHETIC. Shape is a placeholder until Spike D criterion A6.")
    print("  These are payload sizes, not measurements. Nothing was transported.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
