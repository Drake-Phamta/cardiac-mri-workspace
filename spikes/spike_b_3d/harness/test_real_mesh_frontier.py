#!/usr/bin/env python3
"""Data-free checks for real_mesh_frontier.py - runnable without the LASC data.

    python spikes/spike_b_3d/harness/test_real_mesh_frontier.py

1. exact_first_voxel resolves all 13 canonical fixture rays to their EXACT expected slice
   on the synthetic blob the fixture rays target (bound is exact for fixtures).
2. exact_first_voxel agrees with conformance.py's independent reference slice_of_ray on
   2,000 seeded random rays. The two share no code: the reference re-derives the blob.
3. The candidate-triangle acceleration returns the same hit as brute force over every
   triangle, for every ray of a bundle over the synthetic level-0 and a decimated mesh.
4. The case rule picks the lowest-numbered effective 25% case and refuses a holdout case.
5. exact_walk is contiguous and its first foreground cell is exact_first_voxel's answer.
6. bucket(0) is its own bucket '0' (it used to fall through to '>4').
7. The out-of-bound classes on a two-slab case: no_hit / inflated / local / cross_structure.
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "mesh"))

import conformance  # noqa: E402
from build_mesh import decimate, extract_surface, synthetic_mask, to_world  # noqa: E402
from picking_error import ray_mesh_first_hit, slice_of_world  # noqa: E402
from real_mesh_frontier import (bucket, candidate_lists, check_case_is_training,  # noqa: E402
                                classify_out_of_bound, exact_first_voxel, exact_walk,
                                foreground_runs, lowest_effective_25_case, ray_bundle)

FIXTURE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))),
                       "tests", "fixtures", "geometry", "geometry_fixture_v0.json")
passed = 0


def check(cond, name):
    global passed
    if not cond:
        raise SystemExit(f"FAIL: {name}")
    passed += 1


with open(FIXTURE, encoding="utf-8-sig") as fh:
    fx = json.load(fh)
shape, spacing, origin = fx["shape_xyz"], fx["spacing_xyz_mm"], fx["origin_world_mm"]
mask = synthetic_mask(shape)
box_lo, box_hi = [0, 0, 0], list(shape)

# 1 - canonical rays, exact
for ray in fx["picking_rays"]:
    got = exact_first_voxel(ray["origin_world"], ray["direction_world"], mask, spacing, origin,
                            box_lo, box_hi)
    check(got is not None and got[0] == ray["expected_slice_index"],
          f"{ray['id']}: got {got}, fixture says {ray['expected_slice_index']}")

# 2 - independent reference DDA, seeded random rays through and around the volume
ref = conformance.reference_impl(fx)["slice_of_ray"]
rng = np.random.default_rng(7)
centre = np.asarray(fx["volume_centre_world"], dtype=np.float64)
extent = np.asarray(shape, dtype=np.float64) * np.asarray(spacing)
agree = 0
for _ in range(2000):
    d = rng.normal(size=3)
    d /= np.linalg.norm(d)
    target = centre + (rng.random(3) - 0.5) * extent * 1.2
    o = target - d * float(np.linalg.norm(extent)) * 1.5
    mine = exact_first_voxel(o, d, mask, spacing, origin, box_lo, box_hi)
    theirs = ref(o.tolist(), d.tolist())
    agree += int((None if mine is None else mine[0]) == theirs)
check(agree == 2000, f"exact_first_voxel vs conformance reference: {agree}/2000 agree")

# 3 - candidate triangles == brute force, level 0 and a decimated level
v0, t0 = extract_surface(mask)
for cell in (1, 3):
    v, t = decimate(v0, t0, cell)
    vw = to_world(v, spacing, origin)
    lo = np.asarray(origin) - 1.0
    hi = np.asarray(origin) + extent + 1.0
    for d in (np.array([0.0, 0.0, 1.0]), np.array([0.3, -0.2, 0.93]), np.array([0.99, 0.1, 0.05])):
        d = d / np.linalg.norm(d)
        rays, frame = ray_bundle(d, lo, hi, 1.7)
        cands = candidate_lists(vw, t, frame)
        same = 0
        for k, j, o in rays:
            c = cands.get((k, j))
            fast = ray_mesh_first_hit(o, d, vw, t[c]) if c else None
            slow = ray_mesh_first_hit(o, d, vw, t)
            same += int(slice_of_world(fast, spacing, origin, shape)
                        == slice_of_world(slow, spacing, origin, shape)
                        and ((fast is None) == (slow is None)))
        check(same == len(rays), f"cell {cell} dir {d.round(2)}: {same}/{len(rays)} identical")

# 5 - the walk: contiguous cells, monotone t, first foreground cell == exact_first_voxel
walk_ok = 0
for _ in range(500):
    d = rng.normal(size=3)
    d /= np.linalg.norm(d)
    target = centre + (rng.random(3) - 0.5) * extent * 1.2
    o = target - d * float(np.linalg.norm(extent)) * 1.5
    cells = list(exact_walk(o, d, spacing, origin, box_lo, box_hi))
    good = all(sum(abs(a - b) for a, b in zip(c1[0], c2[0])) >= 1 and c2[1] >= c1[1] - 1e-12
               for c1, c2 in zip(cells, cells[1:]))
    first = next((c[0] for c in cells if mask[c[0]]), None)
    mine = exact_first_voxel(o, d, mask, spacing, origin, box_lo, box_hi)
    walk_ok += int(good and (None if first is None else first[2]) == (None if mine is None else mine[0]))
check(walk_ok == 500, f"exact_walk agrees with exact_first_voxel: {walk_ok}/500")

# 6 - buckets: exactly zero has its own bucket (it used to fall through to '>4')
check(bucket(0, [0, 1, 2, 4]) == "0" and bucket(0.0, [0, 1, 2, 4]) == "0", "bucket(0) is '0'")
check(bucket(1.0, [0, 1, 2, 4]) == "(0,1]" and bucket(5, [0, 1, 2, 4]) == ">4", "other buckets")

# 7 - classification of an out-of-bound pick along a ray through two slabs
slab = np.zeros((6, 6, 12), dtype=np.uint8)
slab[:, :, 2] = 1          # a 1-voxel-thin ledge
slab[:, :, 7:10] = 1       # the next structure along +z
o, d = np.array([2.5, 2.5, -1.0]), np.array([0.0, 0.0, 1.0])
runs = foreground_runs(o, d, slab, [1, 1, 1], [0, 0, 0], [0, 0, 0], [6, 6, 12])
check([(round(a, 6), round(b, 6), z) for a, b, z in runs] == [(3.0, 4.0, 2), (8.0, 11.0, 7)],
      f"two runs along the ray: {runs}")
check(classify_out_of_bound(None, runs) == "no_hit", "no hit")
check(classify_out_of_bound(2.5, runs) == "inflated", "hit in front of the mask")
check(classify_out_of_bound(3.5, runs) == "local", "hit on the first run")
check(classify_out_of_bound(8.0, runs) == "cross_structure", "ledge collapsed: hit on the next run")

# 4 - case selection rule
split = {"partitions": {"train": {"case_ids": ["CASE_0101", "CASE_0059", "CASE_0060"]},
                        "validation": {"case_ids": ["CASE_0200"]},
                        "final_holdout": {"case_ids": ["CASE_0001"]}},
         "training_subsets": {"25_percent": {"effective_case_ids": ["CASE_0101", "CASE_0059"]}}}
check(lowest_effective_25_case(split) == "CASE_0059", "lowest effective 25% case")
check(check_case_is_training(split, "CASE_0059")["in_25_percent_effective"], "train case accepted")
for bad in ("CASE_0001", "CASE_0200", "CASE_0060"):
    try:
        check_case_is_training(split, bad)
    except SystemExit:
        passed += 1
    else:
        raise SystemExit(f"FAIL: {bad} was accepted as the Spike B case")

print(f"real_mesh_frontier tests: {passed} passed")
