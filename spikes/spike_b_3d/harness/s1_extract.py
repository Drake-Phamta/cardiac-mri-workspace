#!/usr/bin/env python3
"""
S-1 extractor: B6, B7, B9, B10, B11 per level from the raw device records.

THROWAWAY SPIKE CODE. Day 22 (2026-10-01), Claude agent under the leader's recovery
override; Spike B owner Vu Hung Anh re-derives and interprets on Day 23.

    python spikes/spike_b_3d/harness/s1_extract.py --session <session dir> [--out <json>]

Reads what the session left behind (s1_collector.jsonl = HTTP path; s1_logcat_payloads.json =
logcat path), uses the HTTP copy when it is complete and cross-checks it against logcat,
and recomputes everything from raw fields - it never trusts a number the device summarised:

  B10 / B11  each s1_frame_probe run: nearest-rank median / p95 / max over the RAW frame
             intervals (the performance.js rule), recomputed here and compared with what the
             device reported. B10 PASS at a level iff every complete run has median >= 20 FPS;
             B11 PASS iff every complete run has max interval <= 500 ms and none above 500 ms.
  B6         every s1_pick: the device's resolved slice versus the TRUTH, obtained by an exact
             traversal of the REAL MASK along the ray the device logged (the Phase 1 truth,
             real_mesh_frontier.exact_first_voxel). Same rule as B5: max error <= 1 AND no pick
             that meets the mask but resolves nothing. Target picks are also compared with the
             target's precomputed source slice when the hit lands on the target.
  B7         every s1_nav_request must have an s1_rn_nav_displayed with displayed_slice ==
             requested_slice == the pick's resolved slice; no display without a request.
  B9         no pick that resolves nothing may navigate (code path), and - strict, as offline -
             no pick whose ray meets no mask voxel may navigate. Operator taps labelled
             'background' are reported on their own.

The mask stays outside git; it is read from the private package like the Phase 1 harness.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import statistics
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(ROOT))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "mesh"))

from real_mesh_frontier import (DEFAULT_DATA_ROOT, DEFAULT_DATASET_MANIFEST,  # noqa: E402
                                exact_first_voxel, load_mask)
from picking_error import load_obj, ray_mesh_first_hit, slice_of_world  # noqa: E402

FPS_BOUND = 20.0
STALL_BOUND_MS = 500.0
SLICE_BOUND = 1
TARGET_HIT_RADIUS = 1.0      # voxel units: a target pick "lands on the target" within this


def nearest_rank(sorted_values, p):
    if not sorted_values:
        return None
    return sorted_values[max(0, math.ceil(p * len(sorted_values)) - 1)]


def load_records(session):
    http, logcat = [], []
    path = os.path.join(session, "s1_collector.jsonl")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    http.append(json.loads(line)["payload"])
    path = os.path.join(session, "s1_logcat_payloads.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            logcat = json.load(fh)
    return http, logcat


def key_of(rec):
    kind = rec.get("kind")
    if kind in ("s1_pick", "s1_nav_request", "s1_rn_nav_displayed", "s1_nav_ack_timeout"):
        return (kind, rec.get("pick_id"))
    if kind == "s1_frame_probe":
        return (kind, rec.get("level"), rec.get("run_index"), rec.get("recorded_at_utc"))
    return None


def merge_paths(http, logcat):
    """Union keyed by record identity; report what each path had that the other did not.

    Records without an identity (s1_loaded, s1_suite_done, ...) are taken from the HTTP
    path when it has any, else from logcat - they are context, never a B number.
    """
    hk = {key_of(r): r for r in http if key_of(r)}
    lk = {key_of(r): r for r in logcat if key_of(r)}
    merged = dict(lk)
    merged.update(hk)              # identical content expected; HTTP wins on a tie
    differ = sum(1 for k in set(hk) & set(lk) if json.dumps(hk[k], sort_keys=True) != json.dumps(lk[k], sort_keys=True))
    unkeyed = [r for r in (http if http else logcat) if isinstance(r, dict) and not key_of(r)]
    return list(merged.values()) + unkeyed, {
        "http_records_keyed": len(hk), "logcat_records_keyed": len(lk),
        "only_in_http": len(set(hk) - set(lk)), "only_in_logcat": len(set(lk) - set(hk)),
        "in_both_but_different": differ,
    }


def probe_stats(rec):
    raw = [v for v in rec["probe"].get("raw_frame_intervals_ms", []) if isinstance(v, (int, float)) and v > 0 and math.isfinite(v)]
    s = sorted(raw)
    if not s:
        return {"status": "insufficient_samples"}
    med, p95 = nearest_rank(s, 0.5), nearest_rank(s, 0.95)
    out = {
        "status": rec["probe"].get("status"), "samples": len(s),
        "median_interval_ms": med, "median_fps": 1000.0 / med, "p05_fps": 1000.0 / p95,
        "longest_stall_ms": s[-1], "frames_over_500ms": sum(1 for v in s if v > STALL_BOUND_MS),
        "observed_elapsed_ms": rec["probe"].get("observed_elapsed_ms"),
    }
    dev = rec["probe"]
    out["device_reported_matches"] = all(
        dev.get(k) is not None and abs(dev[k] - out[k]) < 1e-6
        for k in ("median_fps", "longest_stall_ms", "frames_over_500ms"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--case-id", default="CASE_0059")
    ap.add_argument("--data-root", default=DEFAULT_DATA_ROOT)
    ap.add_argument("--dataset-manifest", default=DEFAULT_DATASET_MANIFEST)
    ap.add_argument("--mesh-dir", help="default: spikes/spike_b_3d/mesh/out_real/<case_id>")
    ap.add_argument("--out", help="default: <session>/s1_results.json")
    args = ap.parse_args()

    http, logcat = load_records(args.session)
    records, path_check = merge_paths(http, logcat)
    if not records:
        raise SystemExit("no S-1 records in this session folder")
    state_path = os.path.join(args.session, "session_state.json")
    session_state = {}
    if os.path.exists(state_path):
        with open(state_path, encoding="utf-8") as fh:
            session_state = json.load(fh)
    evidence_status = session_state.get("evidence_status", "UNKNOWN - no session_state.json")
    preflight = session_state.get("preflight", {})
    if preflight.get("is_emulator") or "DIAGNOSTIC" in evidence_status:
        print("*** DIAGNOSTIC EMULATOR SESSION - nothing below is evidence for any B criterion ***")

    with open(args.dataset_manifest, "rb") as fh:
        dm = json.loads(fh.read().decode("utf-8-sig"))
    case = next(c for c in dm["cases"] if c["case_id"] == args.case_id)
    mask, spacing, origin, _ = load_mask(os.path.join(args.data_root, *case["mask"]["path_relative"].split("/")))
    fg = np.argwhere(mask > 0)
    box_lo = [int(x) for x in fg.min(0) - 1]
    box_hi = [int(x) for x in fg.max(0) + 2]
    shape = list(mask.shape)
    from scipy import ndimage
    clo = np.maximum(fg.min(0) - 12, 0)
    chi = np.minimum(fg.max(0) + 13, np.array(shape))
    sub = mask[clo[0]:chi[0], clo[1]:chi[1], clo[2]:chi[2]] == 0
    _dist, nearest = ndimage.distance_transform_edt(sub, return_indices=True)   # cropped: memory

    mesh_dir = args.mesh_dir or os.path.join(ROOT, "mesh", "out_real", args.case_id)
    with open(os.path.join(mesh_dir, "mesh_levels_real.json"), encoding="utf-8") as fh:
        mesh_index = {lv["level"]: lv for lv in json.load(fh)["levels"]}
    meshes = {}

    picks = [r for r in records if r.get("kind") == "s1_pick"]
    navreq = {r["pick_id"]: r for r in records if r.get("kind") == "s1_nav_request"}
    shown = {}
    for r in records:
        if r.get("kind") == "s1_rn_nav_displayed":
            shown.setdefault(r["pick_id"], []).append(r)
    timeouts = {r["pick_id"] for r in records if r.get("kind") == "s1_nav_ack_timeout"}
    probes = [r for r in records if r.get("kind") == "s1_frame_probe"]
    loaded = [r for r in records if r.get("kind") == "s1_loaded"]

    rows = []
    for p in picks:
        L = p["level"]
        o, d = p.get("ray_origin_world"), p.get("ray_direction_world")
        truth = exact_first_voxel(o, d, mask, spacing, origin, box_lo, box_hi) if o and d else None
        t_slice = truth[0] if truth else None
        resolved = p.get("resolved_slice")
        if L not in meshes and L in mesh_index:
            meshes[L] = load_obj(os.path.join(mesh_dir, mesh_index[L]["obj_file"]))
        ws = None
        if L in meshes and o and d:
            ws = slice_of_world(ray_mesh_first_hit(o, d, *meshes[L]), spacing, origin, shape)
        row = {
            "pick_id": p["pick_id"], "level": L, "phase": p["phase"], "pose": p.get("pose_id"),
            "label": p.get("operator_label"), "outcome": p["outcome"], "resolved_slice": resolved,
            "truth_slice": t_slice, "navigation_posted": p["navigation_posted"],
            "error": (abs(resolved - t_slice) if (resolved is not None and t_slice is not None) else None),
            "workstation_slice_same_ray": ws, "device_matches_workstation": ws == resolved,
            "target": p["target"]["id"] if p.get("target") else None,
            "target_expected_slice": p["target"]["expected_slice"] if p.get("target") else None,
            "target_landed": None, "target_error": None, "nav_slice_distance": None,
        }
        if p.get("target") and p.get("hit_world"):
            dist = max(abs(a - b) for a, b in zip(p["hit_world"], p["target"]["world"]))
            row["target_landed"] = dist <= TARGET_HIT_RADIUS
            if row["target_landed"] and resolved is not None:
                row["target_error"] = abs(resolved - p["target"]["expected_slice"])
        if t_slice is None and resolved is not None and p.get("hit_world"):
            v = np.floor((np.asarray(p["hit_world"]) - origin) / spacing + 1e-9).astype(int) - clo
            v = np.clip(v, 0, np.array(sub.shape) - 1)
            row["nav_slice_distance"] = abs(resolved - (int(nearest[2][v[0], v[1], v[2]]) + int(clo[2])))
        rows.append(row)

    levels = sorted({r["level"] for r in rows} | {p["level"] for p in probes})
    results = []
    for L in levels:
        lr = [r for r in rows if r["level"] == L]
        meet = [r for r in lr if r["truth_slice"] is not None]
        errs = [r["error"] for r in meet if r["error"] is not None]
        nohit = sum(1 for r in meet if r["error"] is None)
        bg = [r for r in lr if r["truth_slice"] is None]
        bg_nav = [r for r in bg if r["navigation_posted"]]
        code_path = [r for r in lr if r["outcome"] != "resolved" and r["navigation_posted"]]
        code_path += [r for r in lr if r["outcome"] != "resolved" and r["pick_id"] in navreq]
        by_phase = {}
        for ph in sorted({r["phase"] for r in lr}):
            pr = [r for r in meet if r["phase"] == ph]
            pe = [r["error"] for r in pr if r["error"] is not None]
            by_phase[ph] = {"picks": sum(1 for r in lr if r["phase"] == ph), "meet_mask": len(pr),
                            "max_error": max(pe) if pe else None, "no_hit": sum(1 for r in pr if r["error"] is None),
                            "histogram": {str(e): pe.count(e) for e in sorted(set(pe))}}
        tl = [r for r in lr if r["target_landed"]]
        terr = [r["target_error"] for r in tl if r["target_error"] is not None]
        b6_ok = bool(errs) and max(errs) <= SLICE_BOUND and nohit == 0

        reqs = [navreq[r["pick_id"]] for r in lr if r["pick_id"] in navreq]
        b7_bad, latencies = [], []
        for q in reqs:
            d = shown.get(q["pick_id"], [])
            pick = next((r for r in lr if r["pick_id"] == q["pick_id"]), None)
            good = (len(d) == 1 and d[0]["displayed_slice"] == q["slice"] == d[0]["requested_slice"]
                    and pick is not None and pick["resolved_slice"] == q["slice"])
            if good:
                latencies.append(d[0]["latency_ms"])
            else:
                b7_bad.append({"pick_id": q["pick_id"], "requested": q["slice"],
                               "displayed": [x["displayed_slice"] for x in d], "timeout": q["pick_id"] in timeouts})
        orphan_displays = [k for k, v in shown.items() if k.startswith(f"L{L}-") and k not in navreq]

        taps_bg = [r for r in lr if r["phase"] == "tap" and r["label"] == "background"]
        lp = []
        for rec in sorted((p for p in probes if p["level"] == L), key=lambda p: p.get("run_index", 0)):
            st = probe_stats(rec)
            st["run_index"] = rec.get("run_index")
            lp.append(st)
        complete = [s for s in lp if s.get("status") == "complete"]
        b10 = ("PASS" if complete and all(s["median_fps"] >= FPS_BOUND for s in complete)
               else ("FAIL" if complete else "NOT MEASURED"))
        b11 = ("PASS" if complete and all(s["longest_stall_ms"] <= STALL_BOUND_MS and s["frames_over_500ms"] == 0
                                          for s in complete) else ("FAIL" if complete else "NOT MEASURED"))
        load = next((x for x in loaded if x.get("level") == L), None)
        results.append({
            "level": L,
            "mesh": {k: mesh_index[L][k] for k in ("cluster_cell_voxels", "triangle_count", "obj_sha256")} if L in mesh_index else None,
            "device_loaded": {"triangles_parsed": load.get("triangles_parsed"), "triangles_expected": load.get("triangles_expected"),
                              "gl": (load.get("metadata") or {}).get("gl")} if load else None,
            "b10_b11": {"runs": lp, "complete_runs": len(complete), "B10": b10, "B11": b11,
                        "median_fps_min_over_runs": min((s["median_fps"] for s in complete), default=None),
                        "longest_stall_max_over_runs": max((s["longest_stall_ms"] for s in complete), default=None)},
            "b6": {"picks": len(lr), "picks_meeting_mask": len(meet), "max_error": max(errs) if errs else None,
                   "no_hit": nohit, "histogram": {str(e): errs.count(e) for e in sorted(set(errs))},
                   "by_phase": by_phase,
                   "target_picks_landed": len(tl), "target_max_error_vs_expected": max(terr) if terr else None,
                   "device_vs_workstation_same_ray_mismatches": sum(1 for r in lr if not r["device_matches_workstation"]),
                   "verdict": "PASS" if b6_ok else ("FAIL" if lr else "NOT MEASURED")},
            "b7": {"navigation_requests": len(reqs), "displayed_correctly": len(latencies), "failures": b7_bad[:20],
                   "failure_count": len(b7_bad), "orphan_displays": len(orphan_displays),
                   "latency_ms_median": statistics.median(latencies) if latencies else None,
                   "latency_ms_max": max(latencies) if latencies else None,
                   "verdict": ("PASS" if reqs and not b7_bad and not orphan_displays else ("FAIL" if reqs else "NOT MEASURED"))},
            "b9": {"picks_resolving_nothing_that_navigated": len(code_path),
                   "rays_meeting_no_mask_voxel": len(bg), "of_which_navigated": len(bg_nav),
                   "nav_slice_distance_max": max((r["nav_slice_distance"] for r in bg_nav if r["nav_slice_distance"] is not None), default=None),
                   "operator_background_taps": len(taps_bg),
                   "operator_background_taps_navigated": sum(1 for r in taps_bg if r["navigation_posted"]),
                   "verdict": ("PASS" if lr and not code_path and not bg_nav else ("FAIL" if lr else "NOT MEASURED"))},
        })

    out = args.out or os.path.join(args.session, "s1_results.json")
    table = os.path.join(os.path.dirname(os.path.abspath(out)), "s1_per_pick.csv")
    with open(table, "w", encoding="utf-8", newline="\n") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) if rows else ["pick_id"], lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    payload = {
        "record": "spike_b_s1_results",
        "computed_at": dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat(timespec="seconds"),
        "computed_by": "s1_extract.py (Claude agent A4, Day 22 override); owner Vu Hung Anh re-derives on Day 23",
        "session_dir": os.path.abspath(args.session),
        "evidence_status": evidence_status,
        "device": {k: preflight.get(k) for k in ("serial", "model", "android", "is_emulator")},
        "installed_apk": session_state.get("installed_apk"),
        "evidence_paths": path_check,
        "truth": "exact traversal of the real mask along the ray each pick logged (real_mesh_frontier.exact_first_voxel)",
        "bounds": {"fps_median_min": FPS_BOUND, "stall_max_ms": STALL_BOUND_MS, "slice_error_max": SLICE_BOUND},
        "levels": results,
        "per_pick_table": {"path": table, "rows": len(rows)},
    }
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, indent=1, ensure_ascii=False)
        fh.write("\n")

    print(f"evidence paths: {path_check}")
    print(f"{'lvl':>3} {'tris':>6} {'runs':>4} {'minFPS':>7} {'maxStall':>8} {'B10':>5} {'B11':>5} "
          f"{'picks':>5} {'B6max':>5} {'nohit':>5} {'B6':>5} {'navs':>5} {'B7':>5} {'bgNav':>5} {'B9':>5}")
    for r in results:
        bb = r["b10_b11"]
        print(f"{r['level']:>3} {(r['mesh'] or {}).get('triangle_count', '?'):>6} {bb['complete_runs']:>4} "
              f"{(bb['median_fps_min_over_runs'] or 0):>7.2f} {(bb['longest_stall_max_over_runs'] or 0):>8.1f} "
              f"{bb['B10']:>5} {bb['B11']:>5} {r['b6']['picks']:>5} {str(r['b6']['max_error']):>5} "
              f"{r['b6']['no_hit']:>5} {r['b6']['verdict']:>5} {r['b7']['navigation_requests']:>5} "
              f"{r['b7']['verdict']:>5} {r['b9']['of_which_navigated']:>5} {r['b9']['verdict']:>5}")
    print(f"wrote {out}\n      {table}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
