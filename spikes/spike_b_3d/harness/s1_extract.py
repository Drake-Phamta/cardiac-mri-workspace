#!/usr/bin/env python3
"""
S-1 extractor: B6, B7, B9, B10, B11 per level from the raw device records.

THROWAWAY SPIKE CODE. Day 22 (2026-10-01), Claude agent under the leader's recovery
override; Spike B owner Vu Hung Anh re-derives and interprets on Day 23.

    python spikes/spike_b_3d/harness/s1_extract.py --session <dir> [--publish-dir <dir>]
           [--exclude-suite <segment>.<suite>=<reason> ...]
    python spikes/spike_b_3d/harness/s1_extract.py --self-test

RECORDS ARE SEGMENTED BY PAGE LOAD (QA F3). The page numbers its picks L<level>-1, -2, ...
afresh on every page load, so a re-opened level or a relaunched app repeats pick ids. Every
page load is preceded by the app's `s1_rn_open_level` record; that record starts a SEGMENT,
identified by (session_id, t_ms), and every pick / navigation / display / frame probe is keyed
by (segment, ...). A repeated key inside one segment is unexplained and the extractor REFUSES.
One evidence path is primary (the HTTP collector when it has at least as many keyed records,
else logcat, read in line order with chunked messages placed where they completed); the other
is only a cross-check, so a record missing from one path can never be counted twice.

What is computed, from raw fields only — no number the device summarised is trusted:
  B10 / B11  per complete scripted run: nearest-rank median / p95 / max of the RAW frame
             intervals (performance.js rule), recomputed and compared with the device's summary.
             A level needs >= 3 complete valid runs. B10 PASS iff every one has median >= 20 FPS;
             B11 PASS iff every one has max interval <= 500 ms and none above. Runs of suites named
             by --exclude-suite are invalid (reason recorded). "Median FPS" of a level = the
             minimum over its complete valid runs of the run's nearest-rank median.
  B6         each s1_pick against the TRUTH: an exact walk of the REAL MASK along the ray the
             device logged (real_mesh_frontier.exact_first_voxel). Same rule as B5: max error <= 1
             AND no pick that meets the mask resolves nothing. The same ray is re-intersected with
             the same OBJ on the workstation as a check of the device's own hit.
  B7         every s1_nav_request must have exactly one s1_rn_nav_displayed in the same segment
             with displayed == requested == the pick's resolved slice; no display without request.
  B9         no pick that resolves nothing navigates (code path), and - strict, as offline - no
             pick whose ray meets no mask voxel navigates.

PUBLISHING (QA F4): the session folder keeps the full private results. --publish-dir receives a
sanitized copy (no serial, no session folder path, no absolute or device paths, basenames only)
that s1_export_evidence.py checks again before anything is committed.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(ROOT))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "mesh"))

FPS_BOUND = 20.0
STALL_BOUND_MS = 500.0
SLICE_BOUND = 1
MIN_RUNS = 3
TARGET_HIT_RADIUS = 1.0      # voxel units: a target pick "lands on the target" within this
TAG = "SPIKE_B_S1"
PICK_KINDS = ("s1_pick", "s1_nav_request", "s1_rn_nav_displayed", "s1_nav_ack_timeout")
REDACTED_SERIAL = "<A17_SERIAL>"


def nearest_rank(sorted_values, p):
    if not sorted_values:
        return None
    return sorted_values[max(0, math.ceil(p * len(sorted_values)) - 1)]


# --- reading the two evidence paths, in order ---------------------------------------------

def read_http(session):
    path = os.path.join(session, "s1_collector.jsonl")
    out = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    rec = json.loads(line)
                    payload = rec.get("payload")
                    if isinstance(payload, dict):
                        out.append({**payload, "_received_at_utc": rec.get("received_at_utc")})
    return out


def parse_logcat_lines(lines):
    """Payloads in line order; a chunked message is placed where its last chunk arrived."""
    out, chunks = [], {}
    for line in lines:
        m = re.search(rf"{TAG}_CHUNK (\S+) (\d+)/(\d+) (.*)$", line)
        if m:
            cid, idx, count, part = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
            c = chunks.setdefault(cid, {"count": count, "parts": {}})
            c["parts"][idx] = part
            if len(c["parts"]) == c["count"]:
                text = "".join(c["parts"][i] for i in range(1, count + 1))
                try:
                    out.append(json.loads(text))
                except json.JSONDecodeError:
                    out.append({"kind": "unparsed_chunked", "chunk_id": cid})
            continue
        m = re.search(rf"{TAG} (\{{.*\}})\s*$", line)
        if m:
            try:
                out.append(json.loads(m.group(1)))
            except json.JSONDecodeError:
                out.append({"kind": "unparsed"})
    incomplete = [cid for cid, c in chunks.items() if len(c["parts"]) != c["count"]]
    return out, incomplete


def read_logcat(session):
    for name in ("logcat_stream.txt", "logcat_dump.txt"):
        path = os.path.join(session, name)
        if os.path.exists(path):
            with open(path, encoding="utf-8", errors="replace") as fh:
                lines = [ln for ln in fh.read().splitlines() if TAG in ln]
            if lines:
                recs, incomplete = parse_logcat_lines(lines)
                return recs, incomplete, name
    return [], [], None


# --- segmentation (QA F3) -----------------------------------------------------------------

def segment_records(records):
    """Tag each record with its page-load segment and suite, in stream order.

    A segment starts at each s1_rn_open_level and is identified by (session_id, t_ms) - the
    same identity on both evidence paths. Records before the first one are segment None.
    A suite starts at each s1_suite_start inside a segment.
    """
    seg_id, suite, out, segments = None, 0, [], []
    for r in records:
        kind = r.get("kind")
        if kind == "s1_rn_open_level":
            seg_id = f"{r.get('session_id')}@{r.get('t_ms')}"
            suite = 0
            segments.append({"segment": seg_id, "level": r.get("level"),
                             "opened_at_utc": r.get("_received_at_utc")})
        elif kind == "s1_suite_start":
            suite += 1
        out.append({**r, "_segment": seg_id, "_suite": suite})
    return out, segments


def key_of(r):
    kind = r.get("kind")
    if kind in PICK_KINDS:
        return (r["_segment"], kind, r.get("pick_id"))
    if kind == "s1_frame_probe":
        return (r["_segment"], kind, r["_suite"], r.get("run_index"))
    return None


def index_unique(records, path_name):
    """{key: record}; refuses on a repeated key - pick ids only repeat ACROSS page loads."""
    keyed, repeats = {}, []
    for r in records:
        key = key_of(r)
        if key is None:
            continue
        if key in keyed:
            repeats.append(key)
            continue
        keyed[key] = r
    if repeats:
        raise SystemExit(f"{path_name}: {len(repeats)} unexplained repeated record(s) inside one page "
                         f"load, e.g. {repeats[:5]}. Refusing to compute: find out why before any number.")
    return keyed


def strip_private(r):
    return {k: v for k, v in r.items() if not k.startswith("_")}


def choose_primary(http, logcat):
    hs, hseg = segment_records(http)
    ls, lseg = segment_records(logcat)
    hk = index_unique(hs, "HTTP collector")
    lk = index_unique(ls, "logcat")
    primary = "http" if len(hk) >= len(lk) and hk else "logcat"
    p_recs, p_keys, p_segs = (hs, hk, hseg) if primary == "http" else (ls, lk, lseg)
    s_keys = lk if primary == "http" else hk
    same = sum(1 for k in set(p_keys) & set(s_keys)
               if json.dumps(strip_private(p_keys[k]), sort_keys=True) == json.dumps(strip_private(s_keys[k]), sort_keys=True))
    check = {"primary": primary, "primary_keyed": len(p_keys), "secondary_keyed": len(s_keys),
             "in_both_identical": same, "in_both_different": len(set(p_keys) & set(s_keys)) - same,
             "only_in_primary": len(set(p_keys) - set(s_keys)), "only_in_secondary": len(set(s_keys) - set(p_keys)),
             "segments_primary": len(p_segs), "segments_secondary": len(lseg if primary == "http" else hseg)}
    return p_recs, p_keys, p_segs, check


# --- per-run frame statistics ---------------------------------------------------------------

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


def b10_b11(runs):
    complete = [s for s in runs if s.get("status") == "complete" and not s.get("excluded")]
    if len(complete) < MIN_RUNS:
        return complete, "NOT MEASURED", "NOT MEASURED"
    b10 = "PASS" if all(s["median_fps"] >= FPS_BOUND for s in complete) else "FAIL"
    b11 = "PASS" if all(s["longest_stall_ms"] <= STALL_BOUND_MS and s["frames_over_500ms"] == 0
                        for s in complete) else "FAIL"
    return complete, b10, b11


# --- B7 / B9 bookkeeping, pure (unit-tested by --self-test) ------------------------------------

def b7_b9_from(keyed):
    """Per (segment, pick_id): requests, displays, picks. Returns per-level B7 / B9 code-path facts."""
    picks = {(k[0], k[2]): r for k, r in keyed.items() if k[1] == "s1_pick"}
    reqs = {(k[0], k[2]): r for k, r in keyed.items() if k[1] == "s1_nav_request"}
    shown = {(k[0], k[2]): r for k, r in keyed.items() if k[1] == "s1_rn_nav_displayed"}
    timeouts = {(k[0], k[2]) for k in keyed if k[1] == "s1_nav_ack_timeout"}
    per_level: dict = {}
    for pk, req in reqs.items():
        lv = per_level.setdefault(req.get("level"), {"requests": 0, "ok": 0, "failures": [], "latencies": [],
                                                     "orphans": 0, "nonresolved_navigated": 0})
        lv["requests"] += 1
        d, p = shown.get(pk), picks.get(pk)
        good = (d is not None and p is not None and d["displayed_slice"] == req["slice"] == d["requested_slice"]
                and p.get("resolved_slice") == req["slice"])
        if good:
            lv["ok"] += 1
            lv["latencies"].append(d.get("latency_ms"))
        else:
            lv["failures"].append({"segment": pk[0], "pick_id": pk[1], "requested": req["slice"],
                                   "displayed": None if d is None else d["displayed_slice"],
                                   "timeout": pk in timeouts})
    for pk, d in shown.items():
        if pk not in reqs:
            per_level.setdefault(d.get("level"), {"requests": 0, "ok": 0, "failures": [], "latencies": [],
                                                  "orphans": 0, "nonresolved_navigated": 0})["orphans"] += 1
    for pk, p in picks.items():
        if p.get("outcome") != "resolved" and (p.get("navigation_posted") or pk in reqs):
            per_level.setdefault(p.get("level"), {"requests": 0, "ok": 0, "failures": [], "latencies": [],
                                                  "orphans": 0, "nonresolved_navigated": 0})["nonresolved_navigated"] += 1
    return per_level


# --- publishing (QA F4) ------------------------------------------------------------------------

ABS_PATH = re.compile(r"^(?:[A-Za-z]:[\\/]|\\\\|/)")


def sanitize(value, serial):
    """Strings: serial -> placeholder, absolute or device paths -> basename. Recurses."""
    if isinstance(value, dict):
        return {k: sanitize(v, serial) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v, serial) for v in value]
    if isinstance(value, str):
        if serial and serial in value:
            value = value.replace(serial, REDACTED_SERIAL)
        if ABS_PATH.match(value):
            return os.path.basename(value.replace("\\", "/").rstrip("/")) or "<path>"
    return value


def run(args) -> int:
    from real_mesh_frontier import exact_first_voxel, load_mask           # data needed from here on
    from picking_error import load_obj, ray_mesh_first_hit, slice_of_world
    import numpy as np
    from scipy import ndimage

    data_root = args.data_root or os.environ.get("CARDIAC_DATA_ROOT")
    if not data_root:
        raise SystemExit("set CARDIAC_DATA_ROOT or pass --data-root <extracted LASC package>")
    http = read_http(args.session)
    logcat, incomplete, logcat_file = read_logcat(args.session)
    records, keyed, segments, path_check = choose_primary(http, logcat)
    path_check["logcat_file"] = logcat_file
    path_check["logcat_incomplete_chunks"] = len(incomplete)
    if not keyed:
        raise SystemExit("no keyed S-1 records in this session folder")

    exclusions = {}
    for item in args.exclude_suite or []:
        spec, _, reason = item.partition("=")
        seg_no, _, suite_no = spec.partition(".")
        if not reason or not seg_no.isdigit() or not suite_no.isdigit():
            raise SystemExit(f"--exclude-suite wants <segment>.<suite>=<reason>; got {item!r}")
        exclusions[(int(seg_no), int(suite_no))] = reason
    seg_ordinal = {s["segment"]: i + 1 for i, s in enumerate(segments)}

    state_path = os.path.join(args.session, "session_state.json")
    session_state = json.load(open(state_path, encoding="utf-8")) if os.path.exists(state_path) else {}
    evidence_status = session_state.get("evidence_status", "UNKNOWN - no session_state.json")
    preflight = session_state.get("preflight", {})
    serial = preflight.get("serial")
    if preflight.get("is_emulator") or "DIAGNOSTIC" in evidence_status:
        print("*** DIAGNOSTIC EMULATOR SESSION - nothing below is evidence for any B criterion ***")

    with open(args.dataset_manifest, "rb") as fh:
        dm = json.loads(fh.read().decode("utf-8-sig"))
    case = next(c for c in dm["cases"] if c["case_id"] == args.case_id)
    mask, spacing, origin, _ = load_mask(os.path.join(data_root, *case["mask"]["path_relative"].split("/")))
    fg = np.argwhere(mask > 0)
    box_lo = [int(x) for x in fg.min(0) - 1]
    box_hi = [int(x) for x in fg.max(0) + 2]
    shape = list(mask.shape)
    clo = np.maximum(fg.min(0) - 12, 0)
    chi = np.minimum(fg.max(0) + 13, np.array(shape))
    sub = mask[clo[0]:chi[0], clo[1]:chi[1], clo[2]:chi[2]] == 0
    _dist, nearest = ndimage.distance_transform_edt(sub, return_indices=True)   # cropped: memory

    mesh_dir = args.mesh_dir or os.path.join(ROOT, "mesh", "out_real", args.case_id)
    with open(os.path.join(mesh_dir, "mesh_levels_real.json"), encoding="utf-8") as fh:
        mesh_index = {lv["level"]: lv for lv in json.load(fh)["levels"]}
    meshes = {}

    picks = {k: r for k, r in keyed.items() if k[1] == "s1_pick"}
    rows = []
    for k, p in picks.items():
        L = p["level"]
        o, d = p.get("ray_origin_world"), p.get("ray_direction_world")
        truth = exact_first_voxel(o, d, mask, spacing, origin, box_lo, box_hi) if o and d else None
        t_slice = truth[0] if truth else None
        resolved = p.get("resolved_slice")
        if L not in meshes and L in mesh_index:
            meshes[L] = load_obj(os.path.join(mesh_dir, mesh_index[L]["obj_file"]))
        ws = slice_of_world(ray_mesh_first_hit(o, d, *meshes[L]), spacing, origin, shape) if (L in meshes and o and d) else None
        row = {
            "segment": seg_ordinal.get(k[0]), "suite": p["_suite"], "pick_id": p["pick_id"], "level": L,
            "phase": p["phase"], "pose": p.get("pose_id"), "label": p.get("operator_label"),
            "outcome": p["outcome"], "resolved_slice": resolved, "truth_slice": t_slice,
            "navigation_posted": p["navigation_posted"],
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

    b7b9 = b7_b9_from(keyed)
    probes = [r for k, r in keyed.items() if k[1] == "s1_frame_probe"]
    loaded = [r for r in records if r.get("kind") == "s1_loaded"]
    levels = sorted({r["level"] for r in rows} | {p["level"] for p in probes})
    results = []
    for L in levels:
        lr = [r for r in rows if r["level"] == L]
        meet = [r for r in lr if r["truth_slice"] is not None]
        errs = [r["error"] for r in meet if r["error"] is not None]
        nohit = sum(1 for r in meet if r["error"] is None)
        bg_nav = [r for r in lr if r["truth_slice"] is None and r["navigation_posted"]]
        by_phase = {}
        for ph in sorted({r["phase"] for r in lr}):
            pr = [r for r in meet if r["phase"] == ph]
            pe = [r["error"] for r in pr if r["error"] is not None]
            by_phase[ph] = {"picks": sum(1 for r in lr if r["phase"] == ph), "meet_mask": len(pr),
                            "max_error": max(pe) if pe else None, "no_hit": sum(1 for r in pr if r["error"] is None),
                            "histogram": {str(e): pe.count(e) for e in sorted(set(pe))}}
        tl = [r for r in lr if r["target_landed"]]
        terr = [r["target_error"] for r in tl if r["target_error"] is not None]
        runs = []
        for rec in sorted((p for p in probes if p["level"] == L),
                          key=lambda p: (seg_ordinal.get(p["_segment"], 0), p["_suite"], p.get("run_index", 0))):
            st = probe_stats(rec)
            sid = (seg_ordinal.get(rec["_segment"], 0), rec["_suite"])
            st.update({"segment": sid[0], "suite": sid[1], "run_index": rec.get("run_index"),
                       "recorded_at_utc": rec.get("recorded_at_utc")})
            if sid in exclusions:
                st["excluded"] = exclusions[sid]
            runs.append(st)
        complete, b10, b11 = b10_b11(runs)
        f = b7b9.get(L, {"requests": 0, "ok": 0, "failures": [], "latencies": [], "orphans": 0, "nonresolved_navigated": 0})
        lat = [x for x in f["latencies"] if x is not None]
        load = next((x for x in loaded if x.get("level") == L), None)
        taps_bg = [r for r in lr if r["phase"] == "tap" and r["label"] == "background"]
        results.append({
            "level": L,
            "mesh": {k: mesh_index[L][k] for k in ("cluster_cell_voxels", "triangle_count", "obj_sha256")} if L in mesh_index else None,
            "page_loads": sum(1 for s in segments if s["level"] == L),
            "device_loaded": {"triangles_parsed": load.get("triangles_parsed"), "triangles_expected": load.get("triangles_expected"),
                              "gl": (load.get("metadata") or {}).get("gl")} if load else None,
            "b10_b11": {"runs": runs, "complete_valid_runs": len(complete), "min_runs_required": MIN_RUNS,
                        "B10": b10, "B11": b11,
                        "median_fps_level": min((s["median_fps"] for s in complete), default=None),
                        "longest_stall_max_over_runs": max((s["longest_stall_ms"] for s in complete), default=None)},
            "b6": {"picks": len(lr), "picks_meeting_mask": len(meet), "max_error": max(errs) if errs else None,
                   "no_hit": nohit, "histogram": {str(e): errs.count(e) for e in sorted(set(errs))},
                   "by_phase": by_phase, "target_picks_landed": len(tl),
                   "target_max_error_vs_expected": max(terr) if terr else None,
                   "device_vs_workstation_same_ray_mismatches": sum(1 for r in lr if not r["device_matches_workstation"]),
                   "verdict": "PASS" if (errs and max(errs) <= SLICE_BOUND and nohit == 0) else ("FAIL" if lr else "NOT MEASURED")},
            "b7": {"navigation_requests": f["requests"], "displayed_correctly": f["ok"],
                   "failure_count": len(f["failures"]), "failures": f["failures"][:20], "orphan_displays": f["orphans"],
                   "latency_ms_median": statistics.median(lat) if lat else None, "latency_ms_max": max(lat) if lat else None,
                   "verdict": ("PASS" if f["requests"] and not f["failures"] and not f["orphans"] else ("FAIL" if f["requests"] else "NOT MEASURED"))},
            "b9": {"picks_resolving_nothing_that_navigated": f["nonresolved_navigated"],
                   "rays_meeting_no_mask_voxel": sum(1 for r in lr if r["truth_slice"] is None),
                   "of_which_navigated": len(bg_nav),
                   "nav_slice_distance_max": max((r["nav_slice_distance"] for r in bg_nav if r["nav_slice_distance"] is not None), default=None),
                   "operator_background_taps": len(taps_bg),
                   "operator_background_taps_navigated": sum(1 for r in taps_bg if r["navigation_posted"]),
                   "verdict": ("PASS" if lr and not f["nonresolved_navigated"] and not bg_nav else ("FAIL" if lr else "NOT MEASURED"))},
        })

    payload = {
        "record": "spike_b_s1_results",
        "schema_version": 2,
        "computed_at": dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat(timespec="seconds"),
        "computed_by": "s1_extract.py (Claude agent A4, Day 22 override); owner Vu Hung Anh re-derives on Day 23",
        "session_dir": os.path.abspath(args.session),
        "evidence_status": evidence_status,
        "device": {k: preflight.get(k) for k in ("serial", "model", "android", "is_emulator")},
        "installed_apk": session_state.get("installed_apk"),
        "evidence_paths": path_check,
        "segments": [{**s, "ordinal": i + 1} for i, s in enumerate(segments)],
        "excluded_suites": [{"segment": s, "suite": u, "reason": r} for (s, u), r in sorted(exclusions.items())],
        "truth": "exact walk of the real mask along the ray each pick logged (real_mesh_frontier.exact_first_voxel)",
        "bounds": {"fps_median_min": FPS_BOUND, "stall_max_ms": STALL_BOUND_MS, "slice_error_max": SLICE_BOUND,
                   "complete_valid_runs_min": MIN_RUNS},
        "levels": results,
        "per_pick_table": {"path": os.path.abspath(os.path.join(args.session, "s1_per_pick.csv")), "rows": len(rows)},
    }

    def write(folder, data, table_rows):
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "s1_results.json"), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(data, fh, indent=1, ensure_ascii=False)
            fh.write("\n")
        with open(os.path.join(folder, "s1_per_pick.csv"), "w", encoding="utf-8", newline="\n") as fh:
            w = csv.DictWriter(fh, fieldnames=list(table_rows[0].keys()) if table_rows else ["pick_id"], lineterminator="\n")
            w.writeheader()
            for r in table_rows:
                w.writerow(r)

    write(args.session, payload, rows)
    if args.publish_dir:
        public = sanitize(payload, serial)
        public["device"]["serial"] = REDACTED_SERIAL
        public["session_dir"] = os.path.basename(os.path.abspath(args.session))
        apk = public.get("installed_apk") or {}
        public["installed_apk"] = {k: apk.get(k) for k in ("sha256", "build_record_apk_sha256", "matches_build_record")}
        public["per_pick_table"]["path"] = "s1_per_pick.csv"
        write(args.publish_dir, public, rows)

    print(f"evidence paths: {path_check}")
    print("segments (page loads):")
    for i, s in enumerate(segments, start=1):
        print(f"  {i}: level {s['level']} opened {s['opened_at_utc']}")
    print(f"{'lvl':>3} {'tris':>6} {'runs':>4} {'medFPS':>7} {'maxStall':>8} {'B10':>12} {'B11':>12} "
          f"{'picks':>5} {'B6max':>5} {'nohit':>5} {'B6':>5} {'navs':>5} {'B7':>5} {'bgNav':>5} {'B9':>5}")
    for r in results:
        bb = r["b10_b11"]
        print(f"{r['level']:>3} {(r['mesh'] or {}).get('triangle_count', '?'):>6} {bb['complete_valid_runs']:>4} "
              f"{(bb['median_fps_level'] or 0):>7.2f} {(bb['longest_stall_max_over_runs'] or 0):>8.1f} "
              f"{bb['B10']:>12} {bb['B11']:>12} {r['b6']['picks']:>5} {str(r['b6']['max_error']):>5} "
              f"{r['b6']['no_hit']:>5} {r['b6']['verdict']:>5} {r['b7']['navigation_requests']:>5} "
              f"{r['b7']['verdict']:>5} {r['b9']['of_which_navigated']:>5} {r['b9']['verdict']:>5}")
    print(f"wrote {os.path.join(args.session, 's1_results.json')}" + (f" and the sanitized copy in {args.publish_dir}" if args.publish_dir else ""))
    return 0


def self_test() -> int:
    """Data-free: the re-open case, repeats inside a page load, logcat ordering, sanitizing."""
    passed = 0

    def ok(cond, name):
        nonlocal passed
        if not cond:
            raise SystemExit(f"FAIL: {name}")
        passed += 1

    def page(session, t_open, level, picks):
        out = [{"kind": "s1_rn_open_level", "session_id": session, "level": level, "t_ms": t_open},
               {"kind": "s1_loaded", "level": level}, {"kind": "s1_suite_start", "level": level}]
        for n, (resolved, nav_slice, displayed) in enumerate(picks, start=1):
            pid = f"L{level}-{n}"
            out.append({"kind": "s1_pick", "pick_id": pid, "level": level, "outcome": "resolved" if resolved is not None else "no_hit",
                        "resolved_slice": resolved, "navigation_posted": nav_slice is not None})
            if nav_slice is not None:
                out.append({"kind": "s1_nav_request", "pick_id": pid, "level": level, "slice": nav_slice})
                out.append({"kind": "s1_rn_nav_displayed", "pick_id": pid, "level": level,
                            "requested_slice": nav_slice, "displayed_slice": displayed, "latency_ms": 40.0})
        return out

    # L0 opened, then RE-OPENED (pick ids restart), plus an app relaunch on L1
    stream = (page("s1-A", 100.0, 0, [(30, 30, 30), (31, 31, 31), (None, None, None)])
              + page("s1-A", 900.0, 0, [(40, 40, 40), (41, 41, 41)])
              + [{"kind": "s1_rn_app_start", "session_id": "s1-B"}]
              + page("s1-B", 50.0, 1, [(50, 50, 50)]))
    seg, segments = segment_records(stream)
    keyed = index_unique(seg, "self-test")
    ok(len(segments) == 3, "three page loads")
    ok(sum(1 for k in keyed if k[1] == "s1_pick") == 6, "all 6 picks kept although L0-1 / L0-2 repeat")
    old_style = {(r["kind"], r.get("pick_id")) for r in stream if r["kind"] == "s1_pick"}
    ok(len(old_style) == 4, "a merge keyed by pick_id alone keeps 4 of 6 picks (the QA F3 failure)")
    f = b7_b9_from(keyed)
    ok(f[0]["requests"] == 4 and f[0]["ok"] == 4 and not f[0]["failures"] and f[0]["orphans"] == 0,
       f"B7 per segment on the re-opened level: {f[0]}")
    ok(f[0]["nonresolved_navigated"] == 0, "the no-hit pick never navigated (B9 code path)")

    wrong = list(seg)
    wrong.append(dict(seg[3]))                      # the same L0-1 pick twice inside segment 1
    try:
        index_unique(wrong, "self-test")
    except SystemExit:
        passed += 1
    else:
        raise SystemExit("FAIL: a repeat inside one page load was accepted")

    bad = [dict(r) for r in seg]
    for r in bad:
        if r["kind"] == "s1_rn_nav_displayed" and r["pick_id"] == "L0-2" and r["_segment"].endswith("@900.0"):
            r["displayed_slice"] = 99
    ok(b7_b9_from(index_unique(bad, "self-test"))[0]["failures"][0]["displayed"] == 99, "a wrong display is a B7 failure")

    # logcat: a chunked message lands where its last chunk arrived, not at the end
    lines = [f"x {TAG} " + json.dumps({"kind": "s1_rn_open_level", "session_id": "s", "level": 0, "t_ms": 1}),
             f"x {TAG}_CHUNK c1 1/2 " + '{"kind": "s1_fr', f"x {TAG}_CHUNK c1 2/2 " + 'ame_probe", "run_index": 1}',
             f"x {TAG} " + json.dumps({"kind": "s1_pick", "pick_id": "L0-1", "level": 0})]
    recs, inc = parse_logcat_lines(lines)
    ok([r["kind"] for r in recs] == ["s1_rn_open_level", "s1_frame_probe", "s1_pick"] and not inc, "logcat order kept")

    # publishing: serial and paths never survive
    pub = sanitize({"a": r"C:\Users\x\s1\file.json", "b": "/data/app/~~x/base.apk", "c": "SER123 ok", "d": [r"D:\y\z.apk"]}, "SER123")
    ok(pub == {"a": "file.json", "b": "base.apk", "c": f"{REDACTED_SERIAL} ok", "d": ["z.apk"]}, f"sanitize: {pub}")

    # B10 needs three complete valid runs
    good = {"status": "complete", "median_fps": 60.0, "longest_stall_ms": 17.0, "frames_over_500ms": 0}
    ok(b10_b11([good, good])[1] == "NOT MEASURED", "two runs are not enough")
    ok(b10_b11([good, good, good])[1:] == ("PASS", "PASS"), "three good runs pass")
    ok(b10_b11([good, good, good, {**good, "excluded": "screen off"}])[0].__len__() == 3, "an excluded run is not counted")
    ok(b10_b11([good, good, {**good, "median_fps": 19.9}])[1] == "FAIL", "one slow run fails B10")
    print(f"s1_extract self-test: {passed} passed")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--publish-dir", help="also write a sanitized copy here (no serial, no absolute paths)")
    ap.add_argument("--exclude-suite", action="append",
                    help="<segment>.<suite>=<reason>: runs of that suite are invalid (repeatable)")
    ap.add_argument("--case-id", default="CASE_0059")
    ap.add_argument("--data-root", help="default: $CARDIAC_DATA_ROOT")
    ap.add_argument("--dataset-manifest", default=os.path.join(REPO, "data", "manifests", "dataset_manifest.json"))
    ap.add_argument("--mesh-dir", help="default: spikes/spike_b_3d/mesh/out_real/<case_id>")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    if not args.session:
        ap.error("--session is required (or --self-test)")
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
