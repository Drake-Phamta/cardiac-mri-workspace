#!/usr/bin/env python3
"""API-level end-to-end proof of the demo hero flow (DEMO_STANDARD rule D6).

Walks H1..H10 of management/DEMO_STANDARD.md section 3 through the same HTTP
endpoints the mobile app calls (API Contract 11 v1.1.0), on the data the target
backend really serves, and prints a readable PASS / FAIL / SKIP report.

    python tools/e2e/hero_flow_api.py --base-url http://127.0.0.1:8000
    python tools/e2e/hero_flow_api.py --base-url http://<host>:8000 --no-writes
    python tools/e2e/hero_flow_api.py --base-url ... --case CASE_0042 --json-out run.json

Standard library only, Python 3.9-compatible syntax: it also runs on the Mac mini
host. Exit code 0 only when no step FAILED (SKIP is not a failure).

What it does NOT cover: the phone (gestures, rendering, frame rate). H6 / H7 cover the data path of SCR-05:
the mesh reference, its verified bytes, and the pick -> source slice -> mask-on-that-slice link.
Review writes (H8/H9) create one review, one reviewed-mask version and one
finding in the backend's own database; they are allowed only against a
127.0.0.1 / localhost base URL unless --allow-remote-writes is given, and
--no-writes skips them anywhere. The console report and --json-out contain
per-case values (and echo the --json-out path you gave), so keep them out of git.
"""
import argparse
import array
import base64
import hashlib
import json
import math
import re
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib

EXPECTED_CONTRACT_VERSION = "1.1.0"
BASE = "/api/v1"
DEFAULT_EXPERIMENTS = ["EXP-D-025", "EXP-D-050", "EXP-D-100", "EXP-D-PP"]
METRIC_FIELDS = ["dice", "iou", "false_positives", "false_negatives", "relative_volume_error"]
SUMMARY_KEYS = ["n", "mean", "std", "median", "q1", "q3", "min", "max", "ci95_low", "ci95_high"]
HERO_RUN_EXPERIMENT = "EXP-D-100"
PP_EXPERIMENT = "EXP-D-PP"

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"


# ----------------------------------------------------------------------------
# HTTP

class Resp(object):
    def __init__(self, method, path, status, body, headers, ms):
        self.method, self.path, self.status = method, path, status
        self.body, self.headers, self.ms = body, headers, ms
        self._json = None
        self._parsed = False

    @property
    def json(self):
        if not self._parsed:
            self._parsed = True
            try:
                self._json = json.loads(self.body.decode("utf-8"))
            except Exception:
                self._json = None
        return self._json

    @property
    def error_code(self):
        data = self.json
        if isinstance(data, dict) and isinstance(data.get("error"), dict):
            return data["error"].get("code")
        return None


class Api(object):
    def __init__(self, base_url, timeout=60.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.log = []  # every request, in order

    def request(self, method, path, body=None, headers=None):
        url = self.base_url + path
        data = None
        hdrs = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            hdrs["Content-Type"] = "application/json"
        if headers:
            hdrs.update(headers)
        req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                payload, status, rh = r.read(), r.status, dict((k.lower(), v) for k, v in r.headers.items())
        except urllib.error.HTTPError as e:
            payload, status, rh = e.read(), e.code, dict((k.lower(), v) for k, v in e.headers.items())
        ms = (time.time() - t0) * 1000.0
        resp = Resp(method, path, status, payload, rh, ms)
        self.log.append(resp)
        return resp

    def get(self, path):
        return self.request("GET", path)


def q(value):
    return urllib.parse.quote(str(value), safe="")


# ----------------------------------------------------------------------------
# Tiny PNG codec (8-bit grayscale, non-interlaced) - enough for the slices and masks

def png_decode(data):
    """Return (width, height, bytes of height*width) for an 8-bit grayscale PNG."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat, width = 8, [], None
    height = depth = ctype = interlace = None
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, depth, ctype, _c, _f, interlace = struct.unpack(">IIBBBBB", chunk)
        elif kind == b"IDAT":
            idat.append(chunk)
        elif kind == b"IEND":
            break
    if depth != 8 or ctype != 0 or interlace != 0:
        raise ValueError("unsupported PNG (need 8-bit grayscale, not interlaced): depth=%s type=%s" % (depth, ctype))
    raw = zlib.decompress(b"".join(idat))
    stride = width
    out = bytearray(height * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(height):
        ft = raw[p]
        line = bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        if ft == 1:
            for i in range(1, stride):
                line[i] = (line[i] + line[i - 1]) & 255
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif ft == 3:
            for i in range(stride):
                left = line[i - 1] if i else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif ft == 4:
            for i in range(stride):
                a = line[i - 1] if i else 0
                b = prev[i]
                c = prev[i - 1] if i else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        elif ft != 0:
            raise ValueError("bad PNG filter %d" % ft)
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return width, height, bytes(out)


def parse_cmesh(data):
    """Parse a ``cardiac-mesh/1`` artifact (backend/mesh/artifact.py) with the standard library only.

    Layout: ``CARDMESH`` + uint32 header length + JSON header, then little-endian vertices (uint16 x y z),
    triangles (uint16 or uint32, ``index_bytes``) and per-triangle source slices (uint16); every section 4-aligned.
    Raises ValueError when the file is not exactly what its header says."""
    if data[:8] != b"CARDMESH" or len(data) < 12:
        raise ValueError("not a cardiac-mesh artifact")
    (hlen,) = struct.unpack_from("<I", data, 8)
    header = json.loads(data[12:12 + hlen].decode("utf-8"))
    if header.get("format") != "cardiac-mesh/1":
        raise ValueError("format %r" % header.get("format"))
    nv, nt, ib = header["vertex_count"], header["triangle_count"], header["index_bytes"]
    pos = [12 + hlen]

    def take(count, code):
        arr = array.array(code)
        size = count * arr.itemsize
        arr.frombytes(data[pos[0]:pos[0] + size])
        if len(arr) != count:
            raise ValueError("mesh file is truncated")
        if sys.byteorder != "little":
            arr.byteswap()
        pos[0] += size + (-size) % 4
        return arr

    vertices = take(nv * 3, "H")
    triangles = take(nt * 3, "H" if ib == 2 else "I")
    slices = take(nt, "H")
    if pos[0] != len(data):
        raise ValueError("mesh file has %d trailing bytes" % (len(data) - pos[0]))
    return {"header": header, "vertices": vertices, "triangles": triangles, "slices": slices}


def bitpack(mask01_bytes):
    """0/1 (or 0/255) bytes, row-major -> bits, most significant bit first, zero padded."""
    out = bytearray((len(mask01_bytes) + 7) // 8)
    for i, v in enumerate(mask01_bytes):
        if v:
            out[i >> 3] |= 0x80 >> (i & 7)
    return bytes(out)


def sha256_hex(data):
    return hashlib.sha256(data).hexdigest()


# ----------------------------------------------------------------------------
# Steps

class Skip(Exception):
    pass


class Check(object):
    """One named step. `ok` records an assertion, `ev` an evidence line."""

    def __init__(self, step_id, name, api):
        self.id, self.name, self.api = step_id, name, api
        self.status = PASS
        self.problems = []
        self.evidence = []
        self.skip_reason = None
        self.ms = 0.0
        self._log_start = len(api.log)
        self.calls = []

    def ev(self, text):
        self.evidence.append(text)

    def ok(self, condition, message):
        if not condition:
            self.problems.append(message)
        return bool(condition)

    def skip(self, reason):
        self.skip_reason = reason
        raise Skip(reason)

    def expect_status(self, resp, status, label=None):
        label = label or "%s %s" % (resp.method, resp.path.split("?")[0])
        if resp.status != status:
            self.problems.append("%s answered %s (%s), expected %s" % (
                label, resp.status, resp.error_code or "no error code", status))
            return False
        return True

    def expect_error(self, resp, status, code, label=None):
        label = label or "%s %s" % (resp.method, resp.path.split("?")[0])
        if resp.status != status or resp.error_code != code:
            self.problems.append("%s answered %s/%s, expected %s/%s" % (
                label, resp.status, resp.error_code, status, code))
            return False
        return True

    def finish(self):
        self.calls = self.api.log[self._log_start:]


class Runner(object):
    def __init__(self, api):
        self.api = api
        self.checks = []
        self.state = {}

    def run(self, step_id, name, fn, requires=()):
        chk = Check(step_id, name, self.api)
        t0 = time.time()
        missing = [r for r in requires if r not in self.state]
        try:
            if missing:
                chk.skip("depends on an earlier step that did not produce: %s" % ", ".join(missing))
            fn(chk, self.state)
            if chk.problems:
                chk.status = FAIL
        except Skip as s:
            chk.status = SKIP
            chk.skip_reason = str(s)
        except Exception as e:  # a crash in a step is a FAIL with the exception as evidence
            chk.status = FAIL
            chk.problems.append("exception: %s: %s" % (type(e).__name__, e))
        chk.ms = (time.time() - t0) * 1000.0
        chk.finish()
        self.checks.append(chk)
        print_step(chk)
        return chk


def print_step(chk):
    head = "[%s] %-6s %s  (%d ms, %d calls)" % (chk.status, chk.id, chk.name, chk.ms, len(chk.calls) if chk.calls else 0)
    print(head)
    for line in chk.evidence:
        print("        . " + line)
    if chk.status == SKIP:
        print("        ~ SKIP: " + (chk.skip_reason or ""))
    for p in chk.problems:
        print("        ! " + p)
    sys.stdout.flush()


def fetch_artifact(chk, api, meta, label):
    """The app's one binary path (mobile/src/runtime/content.mjs): fetch content_url, hash it, compare."""
    url = meta.get("content_url")
    checksum = meta.get("checksum")
    chk.ok(isinstance(url, str) and url.startswith(BASE + "/artifacts/"), "%s: content_url is not under %s/artifacts/" % (label, BASE))
    m = isinstance(checksum, str) and checksum.startswith("sha256:") and len(checksum) == 71
    chk.ok(m, "%s: checksum is not sha256:<64 hex>: %r" % (label, checksum))
    if not (isinstance(url, str) and m):
        return None
    resp = api.get(url)
    if not chk.expect_status(resp, 200, "%s artifact fetch" % label):
        return None
    got = sha256_hex(resp.body)
    chk.ok(got == checksum[7:], "%s: fetched bytes hash to sha256:%s... but the API stated %s..." % (label, got[:12], checksum[7:19]))
    etag = (resp.headers.get("etag") or "").replace("W/", "").replace('"', "")
    chk.ok(etag == checksum, "%s: ETag %r differs from checksum" % (label, etag[:20]))
    chk.ok((resp.headers.get("content-type") or "").startswith(meta.get("media_type") or "image/png"),
           "%s: content-type %r" % (label, resp.headers.get("content-type")))
    return resp.body


def stat_ok(summary, name):
    s = summary.get(name) if isinstance(summary, dict) else None
    return isinstance(s, dict) and all(k in s for k in SUMMARY_KEYS), s


def fmt(v, digits=4):
    if isinstance(v, float):
        return ("%." + str(digits) + "f") % v
    return str(v)


# ----------------------------------------------------------------------------
# The hero flow

def build_steps(runner, args):
    api = runner.api
    S = runner.state
    experiments = args.experiments

    # ---- H0 service ---------------------------------------------------------
    def h0(c, st):
        r = api.get("/health")
        if not c.expect_status(r, 200, "GET /health"):
            return
        h = r.json
        c.ev("status=%s contract_version=%s data_ready=%s experiments=%s runs=%s" % (
            h.get("status"), h.get("contract_version"), h.get("data_ready"), h.get("experiments"), h.get("runs")))
        c.ok(h.get("status") == "ok", "health status is %r" % h.get("status"))
        c.ok(h.get("contract_version") == EXPECTED_CONTRACT_VERSION,
             "contract_version %r != pinned %s" % (h.get("contract_version"), EXPECTED_CONTRACT_VERSION))
        c.ok(h.get("data_ready") is True, "data_ready is not true")
        counts = h.get("cases") or {}
        total = counts.get("total")
        c.ev("cases by mode=%s total=%s" % (json.dumps(counts, sort_keys=True), total))
        if args.expect_cases is not None:
            c.ok(total == args.expect_cases, "case total %s != expected %d" % (total, args.expect_cases))
        rejected = h.get("rejected_experiment_packages")
        c.ev("rejected experiment packages=%s" % json.dumps(rejected))
        c.ok(rejected == [], "rejected experiment packages: %s" % json.dumps(rejected))
        c.ok(sum(v for k, v in counts.items() if k != "total") == total, "case counts by mode do not add up to the total")
        c.ok(h.get("experiments") == len(experiments), "accepted experiments %s != %d" % (h.get("experiments"), len(experiments)))
        st["health"] = h

    runner.run("H0", "service health, contract pin, packages accepted", h0)

    # ---- H1 study / cohort --------------------------------------------------
    def h1_study(c, st):
        r = api.get("%s/studies/%s" % (BASE, q(args.study_id)))
        if not c.expect_status(r, 200, "study_get"):
            return
        d = r.json
        c.ev("GET %s -> 200  study_id=%s dataset=%s" % (r.path, d.get("study_id"), (d.get("dataset") or {}).get("dataset_id")))
        counts = d.get("case_counts") or {}
        c.ev("case_counts=%s capabilities=%s" % (json.dumps(counts, sort_keys=True), json.dumps(d.get("capabilities"), sort_keys=True)))
        c.ok(d.get("study_id") == args.study_id, "study_id echo")
        c.ok(isinstance(d.get("dataset"), dict) and d["dataset"].get("dataset_id"), "dataset identity missing")
        if args.expect_cases is not None:
            c.ok(counts.get("total") == args.expect_cases, "case_counts total %s != %s" % (counts.get("total"), args.expect_cases))
            c.ok(sum(v for k, v in counts.items() if k != "total") == counts.get("total"), "case_counts by mode do not add up")
        es = d.get("experiment_summary") or {}
        c.ev("experiment_summary status=%s ids=%s" % (es.get("status"), es.get("experiment_ids")))
        c.ok(es.get("status") == "AVAILABLE", "experiment_summary.status is %r" % es.get("status"))
        c.ok(sorted(es.get("experiment_ids") or []) == sorted(experiments), "experiment ids %s != %s" % (es.get("experiment_ids"), experiments))
        c.ok((d.get("capabilities") or {}).get("ground_truth_evaluation") is True, "ground_truth_evaluation capability")
        c.ok((d.get("capabilities") or {}).get("inference_review") is True, "inference_review capability (INT-12)")

    runner.run("H1.1", "SCR-01 study_get: dataset identity, case count, capabilities", h1_study)

    def h1_list(c, st):
        r = api.get(BASE + "/experiments")
        if not c.expect_status(r, 200, "experiment_list"):
            return
        d = r.json
        items = d.get("items") or []
        rows = dict((i.get("experiment_id"), i.get("prediction_variant")) for i in items)
        c.ev("GET /experiments -> %d items %s" % (len(items), json.dumps(rows, sort_keys=True)))
        c.ev("evaluation_population=%s" % d.get("evaluation_population"))
        c.ok(sorted(rows) == sorted(experiments), "experiments %s != %s" % (sorted(rows), experiments))
        c.ok(rows.get(PP_EXPERIMENT) == "PROCESSED", "%s variant is %r, expected PROCESSED" % (PP_EXPERIMENT, rows.get(PP_EXPERIMENT)))
        for e in experiments:
            if e != PP_EXPERIMENT:
                c.ok(rows.get(e) == "RAW", "%s variant is %r, expected RAW" % (e, rows.get(e)))
        pop = d.get("evaluation_population")
        c.ok(isinstance(pop, str) and "FINAL_HOLDOUT" in pop.upper().replace("-", "_").replace(" ", "_"),
             "evaluation_population %r does not name FINAL_HOLDOUT" % (pop,))
        st["experiment_rows"] = rows
        st["population_id"] = pop

    runner.run("H1.2", "experiment_list: 4 experiments on one FINAL_HOLDOUT population", h1_list)

    def h1_get(c, st):
        for e in experiments:
            r = api.get("%s/experiments/%s" % (BASE, q(e)))
            if not c.expect_status(r, 200, "experiment_get %s" % e):
                continue
            d = r.json
            c.ev("%s: family=%s fraction=%s variant=%s pre=%s post=%s ckpt=%s..." % (
                e, d.get("model_family"), d.get("training_fraction"), d.get("prediction_variant"),
                d.get("preprocessing_version"), d.get("postprocessing_version"),
                str((d.get("checkpoint") or {}).get("checksum"))[:19]))
            c.ok(d.get("experiment_id") == e, "%s: id echo %r" % (e, d.get("experiment_id")))
            for k in ("model_family", "training_fraction", "split_manifest_id", "subset_manifest_id",
                      "preprocessing_version", "postprocessing_version", "checkpoint", "evaluation_version"):
                c.ok(d.get(k) not in (None, ""), "%s: %s missing" % (e, k))
            st.setdefault("experiment_meta", {})[e] = d

    runner.run("H1.3", "experiment_get x4: versioned identity (family, fraction, manifests, checkpoint)", h1_get)

    def h1_metrics(c, st):
        st["metrics"] = {}
        for e in experiments:
            r = api.get("%s/experiments/%s/metrics" % (BASE, q(e)))
            if not c.expect_status(r, 200, "experiment_metrics %s" % e):
                continue
            d = r.json
            ms = d.get("metric_summary") or {}
            good, dice = stat_ok(ms, "dice")
            c.ok(good, "%s: dice summary lacks keys" % e)
            for f in METRIC_FIELDS:
                ok_f, _ = stat_ok(ms, f)
                c.ok(ok_f, "%s: metric_summary.%s incomplete" % (e, f))
            if dice:
                for k in ("mean", "median", "ci95_low", "ci95_high"):
                    c.ok(isinstance(dice.get(k), (int, float)), "%s: dice %s is %r" % (e, k, dice.get(k)))
                c.ok(dice.get("n") == d.get("evaluation_n"), "%s: dice n %s != evaluation_n %s" % (e, dice.get("n"), d.get("evaluation_n")))
                c.ev("%s: variant=%s dice mean=%s median=%s CI95=[%s, %s] n=%s | intended n=%s successful n=%s | metric_version=%s" % (
                    e, d.get("prediction_variant"), fmt(dice.get("mean")), fmt(dice.get("median")),
                    fmt(dice.get("ci95_low")), fmt(dice.get("ci95_high")), dice.get("n"),
                    d.get("evaluation_n"), d.get("successful_n"), d.get("metric_version")))
            c.ok(d.get("evaluation_n") == args.expect_n, "%s: evaluation_n %s != %s" % (e, d.get("evaluation_n"), args.expect_n))
            c.ok(isinstance(d.get("successful_n"), int) and 0 < d["successful_n"] <= d.get("evaluation_n", 0),
                 "%s: successful_n %r" % (e, d.get("successful_n")))
            c.ok(d.get("prediction_variant") == st.get("experiment_rows", {}).get(e, d.get("prediction_variant")),
                 "%s: variant differs from experiment_list" % e)
            c.ok(bool(d.get("metric_version")), "%s: metric_version missing" % e)
            st["metrics"][e] = d

    runner.run("H1.4", "experiment_metrics x4: dice mean/median/CI95, N intended and successful", h1_metrics)

    def h1_outlier_entry(c, st):
        st["cases_by_exp"] = {}
        for e in experiments:
            r = api.get("%s/experiments/%s/cases" % (BASE, q(e)))
            if not c.expect_status(r, 200, "experiment_cases %s" % e):
                continue
            d = r.json
            sel = d.get("outlier_selection") or {}
            cs = sel.get("cases") or []
            c.ev("%s: %d rows, outlier_selection %s/%s metric=%s -> %s" % (
                e, len(d.get("items") or []), sel.get("rule_id"), sel.get("selection_version"), sel.get("metric_name"),
                [x.get("case_id") for x in cs]))
            c.ok(len(cs) == 3, "%s: outlier_selection has %d cases, expected 3" % (e, len(cs)))
            c.ok(sel.get("rule_id") == "DR-010" and sel.get("selection_version") == "dr010-outlier/v1",
                 "%s: outlier rule literals %r/%r" % (e, sel.get("rule_id"), sel.get("selection_version")))
            st["cases_by_exp"][e] = d

    runner.run("H1.5", "outlier entry points present for every experiment", h1_outlier_entry, requires=["metrics"])

    # ---- H2 outlier -----------------------------------------------------------
    def h2(c, st):
        d = st["cases_by_exp"].get(HERO_RUN_EXPERIMENT)
        if d is None:
            c.skip("no experiment_cases for %s" % HERO_RUN_EXPERIMENT)
        rows = d.get("items") or []
        by_status = {}
        for row in rows:
            by_status[row.get("status")] = by_status.get(row.get("status"), 0) + 1
        c.ev("%s rows=%d by status=%s" % (HERO_RUN_EXPERIMENT, len(rows), json.dumps(by_status, sort_keys=True)))
        c.ok(len(rows) == args.expect_n, "rows %d != %d" % (len(rows), args.expect_n))
        c.ok(len(set(r.get("case_id") for r in rows)) == len(rows), "a case appears twice")
        int12 = [r for r in rows if r.get("status") == "WITHHELD"]
        c.ok(len(int12) == 1 and int12[0].get("case_id") == args.int12, "WITHHELD rows: %s, expected only %s" % (
            [r.get("case_id") for r in int12], args.int12))
        for r in int12:
            c.ok(r.get("metric_values") is None, "WITHHELD row %s carries metric_values" % r.get("case_id"))
            c.ok(r.get("analysis_run_id") in (None,) or isinstance(r.get("analysis_run_id"), str), "WITHHELD run id shape")
        c.ev("INT-12 row: %s" % json.dumps(dict((k, v) for k, v in (int12[0].items() if int12 else [])
                                                 if k in ("case_id", "status", "reason", "metric_values"))))
        for r in rows:
            if r.get("status") == "SUCCEEDED":
                mv = r.get("metric_values") or {}
                c.ok(all(isinstance(mv.get(f), (int, float)) for f in METRIC_FIELDS),
                     "SUCCEEDED row %s lacks a numeric metric value" % r.get("case_id"))
                if len(c.problems) > 6:
                    break
        sel = d.get("outlier_selection") or {}
        cs = sel.get("cases") or []
        c.ok(len(cs) == 3, "outlier cases %d != 3" % len(cs))
        c.ok(args.int12 not in [x.get("case_id") for x in cs], "the INT-12 case %s is named as an outlier" % args.int12)
        c.ok(sel.get("experiment_id") == HERO_RUN_EXPERIMENT and sel.get("metric_name") == "dice", "outlier block identity")
        by_id = dict((r.get("case_id"), r) for r in rows)
        for x in cs:
            row = by_id.get(x.get("case_id"))
            c.ok(row is not None and row.get("status") == "SUCCEEDED", "outlier %s is not a SUCCEEDED row" % x.get("case_id"))
            if row and row.get("metric_values"):
                c.ok(row["metric_values"].get("dice") == x.get("metric_value"), "outlier %s dice differs from its row" % x.get("case_id"))
                c.ok(row.get("analysis_run_id") == x.get("analysis_run_id"), "outlier %s run id differs from its row" % x.get("case_id"))
        keys = [(x.get("metric_value"), -((x.get("false_positives") or 0) + (x.get("false_negatives") or 0)), x.get("case_id")) for x in cs]
        c.ok(keys == sorted(keys), "outliers are not served worst first (dice asc, FP+FN desc, case asc)")
        c.ev("outliers (worst first): %s" % ", ".join("%s dice=%s FP=%s FN=%s" % (
            x.get("case_id"), fmt(x.get("metric_value")), x.get("false_positives"), x.get("false_negatives")) for x in cs))
        st["outliers"] = cs
        st["rows_hero"] = by_id

    runner.run("H2", "outlier from persisted per-case values; INT-12 WITHHELD with no values", h2, requires=["cases_by_exp"])

    # ---- H3 case explorer -----------------------------------------------------
    def h3_list(c, st):
        r = api.get("%s/studies/%s/cases?limit=500" % (BASE, q(args.study_id)))
        if not c.expect_status(r, 200, "case_list"):
            return
        d = r.json
        items = d.get("items") or []
        modes = {}
        for i in items:
            modes[i.get("mode_capability")] = modes.get(i.get("mode_capability"), 0) + 1
            c.ok((i.get("mode_capability") == "EVALUATION") == (i.get("ground_truth_available") is True),
                 "row %s: mode_capability and ground_truth_available disagree" % i.get("case_id"))
        c.ev("GET cases?limit=500 -> %d rows, by mode=%s next_page=%s" % (len(items), json.dumps(modes, sort_keys=True), d.get("next_page")))
        if args.expect_cases is not None:
            c.ok(len(items) == args.expect_cases, "case_list rows %d != %d" % (len(items), args.expect_cases))
        c.ok(d.get("next_page") is None, "next_page is %r with limit 500" % d.get("next_page"))
        inf = [i["case_id"] for i in items if i.get("mode_capability") == "INFERENCE_REVIEW"]
        c.ok(inf == [args.int12], "INFERENCE_REVIEW cases %s, expected [%s]" % (inf, args.int12))
        r2 = api.get("%s/studies/%s/cases?limit=10&mode=EVALUATION" % (BASE, q(args.study_id)))
        if c.expect_status(r2, 200, "case_list page 1"):
            d2 = r2.json
            c.ok(len(d2.get("items") or []) == 10 and d2.get("next_page") == "10" and d2.get("mode") == "EVALUATION",
                 "pagination/filter echo: %d rows next_page=%r mode=%r" % (len(d2.get("items") or []), d2.get("next_page"), d2.get("mode")))
            c.ev("pagination: limit=10&mode=EVALUATION -> 10 rows, next_page=%s, mode echo=%s" % (d2.get("next_page"), d2.get("mode")))
        r3 = api.get("%s/studies/%s/cases?mode=BOGUS" % (BASE, q(args.study_id)))
        c.expect_error(r3, 422, "VALIDATION_ERROR", "case_list bad mode")
        st["case_rows"] = dict((i["case_id"], i) for i in items)

    runner.run("H3.1", "SCR-02 case_list: de-identified ids, evaluation vs inference-only", h3_list)

    def h3_pick(c, st):
        if args.case:
            case = args.case
            c.ev("case chosen by --case: %s" % case)
        else:
            case = None
            for x in st.get("outliers", []):
                row = st["case_rows"].get(x["case_id"])
                if row and row.get("mode_capability") == "EVALUATION":
                    case = x["case_id"]
                    break
            if case is None:
                c.skip("no EVALUATION case among the outliers")
            c.ev("demo case = first %s outlier that is an EVALUATION case: %s" % (HERO_RUN_EXPERIMENT, case))
        row = st["case_rows"].get(case)
        if not c.ok(row is not None, "%s is not in case_list" % case):
            return
        if not c.ok(row.get("mode_capability") == "EVALUATION",
                    "%s is %s: the hero flow needs ground truth, so the demo case must be an EVALUATION case "
                    "(the inference-only case is covered by the INT-12 step)" % (case, row.get("mode_capability"))):
            return
        st["case"] = case

    runner.run("H3.2", "choose the demo case (first EXP-D-100 outlier, or --case)", h3_pick, requires=["case_rows", "outliers"])

    def h3_case(c, st):
        case = st["case"]
        r = api.get("%s/cases/%s" % (BASE, q(case)))
        if not c.expect_status(r, 200, "case_get"):
            return
        d = r.json
        shape = d.get("shape") or []
        c.ev("case_get %s: mode=%s ground_truth_available=%s shape=%s index_convention=%s geometry=%s/%s" % (
            case, d.get("mode"), d.get("ground_truth_available"), shape, d.get("index_convention"),
            d.get("geometry_contract_version"), d.get("geometry_validation_status")))
        c.ok(d.get("mode") == "EVALUATION" and d.get("ground_truth_available") is True, "mode/ground truth for %s" % case)
        c.ok(len(shape) == 3 and all(isinstance(v, int) and v > 0 for v in shape), "shape %r" % (shape,))
        rg = api.get("%s/cases/%s/geometry" % (BASE, q(case)))
        if c.expect_status(rg, 200, "geometry_get"):
            g = rg.json
            for k in ("geometry_contract_version", "geometry_validation_status", "shape", "index_convention", "spacing", "origin", "direction"):
                c.ok(g.get(k) == d.get(k), "geometry_get.%s differs from case_get" % k)
            c.ev("geometry_get: same transform as case_get; spacing=%s origin=%s" % (g.get("spacing"), g.get("origin")))
            c.ok(g.get("geometry_validation_status") == "GEOMETRY_NOT_VALIDATED", "geometry status %r (voxel units only expected)" % g.get("geometry_validation_status"))
        if len(shape) == 3:
            n = shape[2]
            c.ev("slice count: n/total = 1/%d ... %d/%d (indices 0..%d)" % (n, n, n, n - 1))
            mid = n // 2
            m = api.get("%s/cases/%s/slices/%d/mri" % (BASE, q(case), mid))
            if c.expect_status(m, 200, "mri_slice_get"):
                png = fetch_artifact(c, api, m.json, "mri slice %d" % mid)
                if png:
                    w, h, _ = png_decode(png)
                    c.ev("mri slice %d: %dx%d px PNG, %d bytes, checksum verified" % (mid, w, h, len(png)))
                    c.ok((w, h) == (shape[0], shape[1]), "PNG %dx%d (w x h) != shape %s (x=column, y=row)" % (w, h, shape[:2]))
            last = api.get("%s/cases/%s/slices/%d/mri" % (BASE, q(case), n - 1))
            c.expect_status(last, 200, "mri_slice_get last")
            over = api.get("%s/cases/%s/slices/%d/mri" % (BASE, q(case), n))
            c.expect_error(over, 422, "SLICE_OUT_OF_RANGE", "mri_slice_get past the end")
            c.ev("slice %d (past the end) -> %s %s" % (n, over.status, over.error_code))
        st["case_get"] = d

    runner.run("H3.3", "SCR-03 case_get + geometry_get + slice n/total + MRI bytes (checksum)", h3_case, requires=["case"])

    def h3_runs(c, st):
        case = st["case"]
        ids = st["case_get"].get("available_run_ids") or []
        c.ev("available_run_ids=%s" % ids)
        runs = {}
        for rid in ids:
            r = api.get("%s/analysis-runs/%s" % (BASE, q(rid)))
            if c.expect_status(r, 200, "analysis_run_get %s" % rid):
                d = r.json
                runs[d.get("experiment_id")] = d
                c.ev("run %s: experiment=%s status=%s precomputed=%s raw=%s processed=%s reconstruction_ids=%s" % (
                    rid, d.get("experiment_id"), d.get("status"), d.get("precomputed"),
                    d.get("raw_prediction_artifact_id"), d.get("processed_prediction_artifact_id"), d.get("reconstruction_ids")))
                c.ok(d.get("case_id") == case, "run %s belongs to %s" % (rid, d.get("case_id")))
                c.ok(d.get("status") == "SUCCEEDED", "run %s status %r" % (rid, d.get("status")))
        c.ok(sorted(runs) == sorted(e for e in experiments), "case has runs for %s, expected %s" % (sorted(runs), sorted(experiments)))
        hero = runs.get(HERO_RUN_EXPERIMENT)
        pp = runs.get(PP_EXPERIMENT)
        if hero:
            c.ok(bool(hero.get("raw_prediction_artifact_id")), "%s run has no RAW prediction artifact" % HERO_RUN_EXPERIMENT)
        if pp:
            c.ok(bool(pp.get("processed_prediction_artifact_id")), "%s run has no PROCESSED prediction artifact" % PP_EXPERIMENT)
        st["runs"] = runs
        if hero:
            st["hero_run"] = hero
        if pp:
            st["pp_run"] = pp

    runner.run("H3.4", "the case's runs: EXP-D-100 (RAW) and EXP-D-PP (PROCESSED), active run and variant", h3_runs, requires=["case_get"])

    # ---- H4 worst slice -------------------------------------------------------
    def worst_for(c, st, run, variant, tag):
        rid = run["run_id"]
        r = api.get("%s/analysis-runs/%s/metrics?prediction_variant=%s" % (BASE, q(rid), variant))
        if not c.expect_status(r, 200, "analysis_run_metrics %s" % tag):
            return None
        d = r.json
        mv = d.get("metric_values") or {}
        c.ok(d.get("metric_state") == "COMPUTED", "%s: metric_state %r" % (tag, d.get("metric_state")))
        c.ok(d.get("prediction_variant") == variant and d.get("aggregation_level"), "%s: variant/aggregation echo" % tag)
        c.ok(all(isinstance(mv.get(f), (int, float)) for f in METRIC_FIELDS), "%s: metric_values incomplete %s" % (tag, mv))
        c.ev("%s run %s [%s]: case metrics dice=%s iou=%s FP=%s FN=%s relvol=%s%% (aggregation=%s, metric_version=%s)" % (
            tag, rid, variant, fmt(mv.get("dice")), fmt(mv.get("iou")), mv.get("false_positives"),
            mv.get("false_negatives"), fmt(mv.get("relative_volume_error"), 2), d.get("aggregation_level"), d.get("metric_version")))
        sel = d.get("worst_slice_selection") or {}
        sl = sel.get("slices") or []
        c.ok(sel.get("rule_id") == "DR-010" and sel.get("selection_version") == "dr010-worst-slice/v1",
             "%s: worst-slice rule literals %r/%r" % (tag, sel.get("rule_id"), sel.get("selection_version")))
        c.ok(len(sl) > 0, "%s: worst_slice_selection.slices is empty" % tag)
        keys = [(s.get("dice"), -((s.get("false_positives") or 0) + (s.get("false_negatives") or 0)), s.get("slice_index")) for s in sl]
        c.ok(keys == sorted(keys), "%s: slices not served in DR-010 order (dice asc, FP+FN desc, slice asc)" % tag)
        c.ok(len(set(s.get("slice_index") for s in sl)) == len(sl), "%s: a slice listed twice" % tag)
        if sl:
            top = sl[0]
            c.ev("%s worst slice (rule %s, %s): #%s dice=%s FP=%s FN=%s; next: %s" % (
                tag, sel.get("rule_id"), sel.get("selection_version"), top.get("slice_index"), fmt(top.get("dice")),
                top.get("false_positives"), top.get("false_negatives"),
                ", ".join("#%s(%s)" % (s.get("slice_index"), fmt(s.get("dice"))) for s in sl[1:3])))
        return d

    def h4_metrics(c, st):
        run = st["hero_run"]
        d = worst_for(c, st, run, "RAW", "EXP-D-100")
        if d is None:
            return
        # traceability: the run-level value is the experiment_cases value
        row = st.get("rows_hero", {}).get(st["case"])
        if row and row.get("metric_values"):
            same = all(row["metric_values"].get(f) == d["metric_values"].get(f) for f in METRIC_FIELDS)
            c.ok(same, "run metrics differ from the experiment_cases row for %s" % st["case"])
            c.ev("run-level metric_values equal the experiment_cases row: %s" % same)
        slices = (d.get("worst_slice_selection") or {}).get("slices") or []
        if not slices:
            return
        st["worst"] = slices[0]
        st["hero_metrics"] = d
        st["worst_all"] = slices
        # an empty-GT slice must not appear in the ranking
        pp = st.get("pp_run")
        if pp:
            dp = worst_for(c, st, pp, "PROCESSED", "EXP-D-PP")
            if dp:
                st["pp_metrics"] = dp
        # no silent substitution: the RAW-only run has no PROCESSED mask
        r = api.get("%s/analysis-runs/%s/metrics?prediction_variant=PROCESSED" % (BASE, q(run["run_id"])))
        c.ok(r.status == 404 and r.error_code == "ARTIFACT_NOT_FOUND",
             "metrics for PROCESSED on a RAW-only run answered %s/%s (never a substitute)" % (r.status, r.error_code))
        c.ev("RAW-only run asked for PROCESSED -> %s %s (no silent substitution)" % (r.status, r.error_code))

    runner.run("H4.1", "analysis_run_metrics -> worst_slice_selection (DR-010, dr010-worst-slice/v1)", h4_metrics, requires=["hero_run"])

    def h4_open(c, st):
        case, run, w = st["case"], st["hero_run"], st["worst"]
        z = w["slice_index"]
        mri = api.get("%s/cases/%s/slices/%d/mri" % (BASE, q(case), z))
        gt = api.get("%s/cases/%s/slices/%d/ground-truth" % (BASE, q(case), z))
        pr = api.get("%s/analysis-runs/%s/slices/%d/prediction?variant=RAW" % (BASE, q(run["run_id"]), z))
        out = {}
        for label, resp, key in (("mri", mri, "source_volume_id"), ("ground truth", gt, "reference_mask_id"),
                                 ("prediction RAW", pr, "prediction_mask_id")):
            if not c.expect_status(resp, 200, "%s slice %d" % (label, z)):
                continue
            meta = resp.json
            raw = fetch_artifact(c, api, meta, "%s slice %d" % (label, z))
            c.ev("%s slice %d: id=%s checksum=%s... bytes=%s (sha256 of fetched bytes == API checksum)" % (
                label, z, meta.get(key), str(meta.get("checksum"))[:19], len(raw) if raw else None))
            out[label] = (meta, raw)
        c.ok(pr.json and pr.json.get("prediction_variant") == "RAW", "prediction variant echo")
        # the same slice by the second route: the PROCESSED mask of EXP-D-PP
        pp = st.get("pp_run")
        if pp:
            pz = api.get("%s/analysis-runs/%s/slices/%d/prediction?variant=PROCESSED" % (BASE, q(pp["run_id"]), z))
            if c.expect_status(pz, 200, "prediction PROCESSED slice %d" % z):
                raw = fetch_artifact(c, api, pz.json, "prediction PROCESSED slice %d" % z)
                c.ev("prediction PROCESSED (EXP-D-PP) slice %d: id=%s bytes=%s verified" % (
                    z, pz.json.get("prediction_mask_id"), len(raw) if raw else None))
                c.ok(pz.json.get("prediction_variant") == "PROCESSED", "PROCESSED echo")
                out["pp"] = (pz.json, raw)
        st["slice_assets"] = out

    runner.run("H4.2", "open the worst slice: MRI, ground truth, prediction bytes hash to the API checksum (DR-021)", h4_open, requires=["worst"])

    # ---- H5 errors ------------------------------------------------------------
    def h5(c, st):
        run, w = st["hero_run"], st["worst"]
        z = w["slice_index"]
        r = api.get("%s/analysis-runs/%s/slices/%d/metrics?prediction_variant=RAW" % (BASE, q(run["run_id"]), z))
        if c.expect_status(r, 200, "analysis_slice_metrics"):
            d = r.json
            c.ev("slice %d metrics: state=%s dice=%s (selection says %s)" % (z, d.get("metric_state"), fmt(d.get("metric_value")), fmt(w.get("dice"))))
            c.ok(d.get("metric_state") == "COMPUTED" and d.get("metric_value") == w.get("dice"),
                 "slice dice %r != worst_slice_selection dice %r" % (d.get("metric_value"), w.get("dice")))
        e = api.get("%s/analysis-runs/%s/slices/%d/error?prediction_variant=RAW" % (BASE, q(run["run_id"]), z))
        if e.status == 404:
            # By design (backend/app/metrics.py slice_error): no versioned slice-error artifact is exported, so the
            # endpoint answers an honest unavailable state; the overlay is derived from the GT and prediction slices,
            # which is what this step does below.
            details = ((e.json or {}).get("error") or {}).get("details") or {}
            c.ok(e.error_code == "ARTIFACT_NOT_FOUND" and details.get("reason") == "NO_ERROR_ARTIFACT",
                 "analysis_slice_error answered 404 %s reason %r, expected the documented NO_ERROR_ARTIFACT" % (e.error_code, details.get("reason")))
            c.ev("analysis_slice_error -> 404 ARTIFACT_NOT_FOUND reason=%s (known gap: no exported error artifact; overlay derived from GT + prediction below)" % details.get("reason"))
        elif c.expect_status(e, 200, "analysis_slice_error"):
            ed = e.json
            c.ev("slice error reference: error_artifact_id=%s ref=%s pred=%s" % (ed.get("error_artifact_id"), ed.get("reference_mask_id"), ed.get("prediction_mask_id")))
            c.ok(ed.get("slice_index") == z, "error slice_index echo")
            assets = st.get("slice_assets", {})
            if "ground truth" in assets and "prediction RAW" in assets:
                c.ok(ed.get("reference_mask_id") == assets["ground truth"][0].get("reference_mask_id"), "error reference_mask_id differs from the GT slice")
                c.ok(ed.get("prediction_mask_id") == assets["prediction RAW"][0].get("prediction_mask_id"), "error prediction_mask_id differs from the prediction slice")
        assets = st.get("slice_assets", {})
        if "ground truth" not in assets or "prediction RAW" not in assets or not assets["ground truth"][1] or not assets["prediction RAW"][1]:
            c.skip("ground truth / prediction bytes of the worst slice were not fetched (see H4.2)")
        gw, gh, gpx = png_decode(assets["ground truth"][1])
        pw, ph, ppx = png_decode(assets["prediction RAW"][1])
        c.ok((gw, gh) == (pw, ph), "GT %dx%d and prediction %dx%d differ" % (gw, gh, pw, ph))
        c.ok(set(gpx) <= {0, 255} and set(ppx) <= {0, 255}, "masks are not {0,255}")
        tp = fp = fn = 0
        for g, p in zip(gpx, ppx):
            if g:
                if p:
                    tp += 1
                else:
                    fn += 1
            elif p:
                fp += 1
        dice = (2.0 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) else None
        c.ev("recomputed from the two PNG masks: TP=%d FP=%d FN=%d dice=%s | API: FP=%s FN=%s dice=%s" % (
            tp, fp, fn, fmt(dice), w.get("false_positives"), w.get("false_negatives"), fmt(w.get("dice"))))
        c.ok(fp == w.get("false_positives"), "FP from masks %d != API %s" % (fp, w.get("false_positives")))
        c.ok(fn == w.get("false_negatives"), "FN from masks %d != API %s" % (fn, w.get("false_negatives")))
        c.ok(dice is not None and abs(dice - w.get("dice")) < 1e-6, "Dice from masks %s != API %s" % (dice, w.get("dice")))
        c.ok(gpx != ppx, "ground truth and prediction are identical on the worst slice")

    runner.run("H5", "SCR-04 errors: slice metrics, error reference, FP/FN re-derived from the two PNG masks", h5, requires=["worst"])

    # ---- H6/H7 3D -------------------------------------------------------------
    # SCR-05: reconstruction_get answers a mesh reference, the mesh bytes come from /artifacts/<sha256>.cmesh (the
    # sha256 is the one inside mesh_artifact_id; contracts/api/README.md "3-D mesh content"), the app verifies it
    # (DR-021 rule 1), draws it, and a tap resolves to face_source_slice[t] (PR-3D-04, DR-008c = L0).
    def mesh_for(c, label, run, mask_id, kind, case_get, listed=True):
        """reconstruction_get + the mesh bytes + every sanity check; returns the parsed mesh or None."""
        r = api.get("%s/analysis-runs/%s/reconstruction?source_mask_id=%s" % (BASE, q(run["run_id"]), q(mask_id)))
        if not c.expect_status(r, 200, "reconstruction_get %s" % label):
            return None
        d = r.json
        c.ev("%s: mesh_artifact_id=%s... kind=%s version=%s..." % (
            label, str(d.get("mesh_artifact_id"))[:21], d.get("source_mask_kind"), str(d.get("reconstruction_version"))[:28]))
        c.ok(d.get("source_mask_id") == mask_id and d.get("source_mask_kind") == kind,
             "%s: source %r/%r, expected %s/%s" % (label, d.get("source_mask_id"), d.get("source_mask_kind"), mask_id, kind))
        version = d.get("reconstruction_version")
        c.ok(isinstance(version, str) and re.match(r"^dr008c-L0/v1 sha256:[0-9a-f]{64}$", version) is not None,
             "%s: reconstruction_version %r" % (label, version))
        c.ok(d.get("mesh_to_world_transform") == [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
             "%s: mesh_to_world_transform is not the identity of the voxel-index frame" % label)
        for k in ("geometry_contract_version", "geometry_validation_status", "shape", "index_convention", "spacing",
                  "origin", "direction"):
            c.ok(d.get(k) == case_get.get(k), "%s: %s differs from the case geometry" % (label, k))
        c.ok(d.get("index_convention") == "x=column,y=row,z=slice", "%s: index_convention %r" % (label, d.get("index_convention")))
        mid = d.get("mesh_artifact_id")
        if listed:  # the run lists the meshes of its own predictions; the ground-truth mesh belongs to the case
            c.ok(mid in (run.get("reconstruction_ids") or []), "%s: mesh_artifact_id is not in the run's reconstruction_ids" % label)
        m = re.match(r"^MESH_([0-9a-f]{64})$", mid or "")
        if not c.ok(m is not None, "%s: mesh_artifact_id %r is not MESH_<sha256>" % (label, mid)):
            return None
        digest = m.group(1)
        b = api.get("%s/artifacts/%s.cmesh" % (BASE, digest))
        if not c.expect_status(b, 200, "mesh bytes %s" % label):
            return None
        c.ok(sha256_hex(b.body) == digest, "%s: the mesh bytes do not hash to the sha256 in mesh_artifact_id" % label)
        c.ok((b.headers.get("etag") or "").replace('"', "") == "sha256:" + digest, "%s: ETag %r" % (label, b.headers.get("etag")))
        mesh = parse_cmesh(b.body)
        h = mesh["header"]
        shape = case_get.get("shape")
        nv, nt = h["vertex_count"], h["triangle_count"]
        c.ev("%s: %d vertices, %d triangles, %d bytes (%.0f KB), sha256 verified, shape %s, frame %s" % (
            label, nv, nt, len(b.body), len(b.body) / 1024.0, h["shape"], h["frame"]))
        c.ok(h["shape"] == shape, "%s: mesh shape %s != case shape %s" % (label, h["shape"], shape))
        c.ok(h["index_convention"] == "x=column,y=row,z=slice" and h["frame"] == "voxel-index" and h["level"] == 0,
             "%s: header convention/frame/level" % label)
        c.ok(nv > 0 and nt > 0 and nt % 2 == 0, "%s: vertex/triangle counts %d/%d not sane" % (label, nv, nt))
        fg = h.get("foreground_voxels") or 0
        c.ok(0 < fg and nt <= 12 * fg and nv <= 8 * fg, "%s: %d triangles / %d vertices for %d foreground voxels" % (label, nt, nv, fg))
        v, t, s = mesh["vertices"], mesh["triangles"], mesh["slices"]
        c.ok(all(0 <= v[3 * i + a] <= shape[a] for i in range(nv) for a in range(3)), "%s: a vertex lies outside [0, shape]" % label)
        c.ok(all(i < nv for i in t), "%s: a triangle indexes past the vertices" % label)
        c.ok(max(s) < shape[2], "%s: a face source slice is outside the volume" % label)
        return mesh

    def face(mesh, i):
        """Centroid, outward unit normal and the foreground voxel behind triangle i (voxel-index frame)."""
        v, t = mesh["vertices"], mesh["triangles"]
        p = [[float(v[3 * t[3 * i + k] + a]) for a in range(3)] for k in range(3)]
        e1 = [p[1][a] - p[0][a] for a in range(3)]
        e2 = [p[2][a] - p[0][a] for a in range(3)]
        n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        ln = math.sqrt(sum(x * x for x in n))
        n = [x / ln for x in n]
        cen = [(p[0][a] + p[1][a] + p[2][a]) / 3.0 for a in range(3)]
        vox = [int(math.floor(cen[a] - 0.5 * n[a])) for a in range(3)]
        return cen, n, vox

    def first_hit(mesh, origin, direction):
        """Moller-Trumbore over every triangle, back faces accepted: index of the nearest hit, or None."""
        v, t = mesh["vertices"], mesh["triangles"]
        best, best_t = None, None
        ox, oy, oz = origin
        dx, dy, dz = direction
        for i in range(len(t) // 3):
            a, b, cc = 3 * t[3 * i], 3 * t[3 * i + 1], 3 * t[3 * i + 2]
            e1x, e1y, e1z = v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]
            e2x, e2y, e2z = v[cc] - v[a], v[cc + 1] - v[a + 1], v[cc + 2] - v[a + 2]
            px, py, pz = dy * e2z - dz * e2y, dz * e2x - dx * e2z, dx * e2y - dy * e2x
            det = e1x * px + e1y * py + e1z * pz
            if abs(det) < 1e-12:
                continue
            inv = 1.0 / det
            tx, ty, tz = ox - v[a], oy - v[a + 1], oz - v[a + 2]
            u = (tx * px + ty * py + tz * pz) * inv
            if u < -1e-9 or u > 1 + 1e-9:
                continue
            qx, qy, qz = ty * e1z - tz * e1y, tz * e1x - tx * e1z, tx * e1y - ty * e1x
            w = (dx * qx + dy * qy + dz * qz) * inv
            if w < -1e-9 or u + w > 1 + 1e-9:
                continue
            dist = (e2x * qx + e2y * qy + e2z * qz) * inv
            if dist > 1e-9 and (best_t is None or dist < best_t):
                best, best_t = i, dist
        return best

    def h6(c, st):
        run, case, case_get = st["hero_run"], st["case"], st["case_get"]
        c.ok(bool(run.get("reconstruction_ids")), "the run lists no reconstruction_ids (SCR-03 would not enable 3D); build "
             "the derived meshes: python -m backend.mesh.build_cache --data <root>")
        study = api.get("%s/studies/%s" % (BASE, q(args.study_id)))
        c.ok(study.status == 200 and (study.json.get("capabilities") or {}).get("reconstruction_3d") is True,
             "study_get capabilities.reconstruction_3d is not true")
        raw = mesh_for(c, "prediction RAW (%s)" % HERO_RUN_EXPERIMENT, run, run.get("raw_prediction_artifact_id"),
                       "RAW_PREDICTION", case_get)
        gt = api.get("%s/cases/%s/slices/0/ground-truth" % (BASE, q(case)))
        gt_mesh = None
        if c.expect_status(gt, 200, "ground_truth_slice_get (reference mask id)"):
            gt_mesh = mesh_for(c, "ground truth", run, gt.json.get("reference_mask_id"), "GROUND_TRUTH", case_get, listed=False)
        pp = st.get("pp_run")
        pp_mesh = None
        if pp:
            pp_mesh = mesh_for(c, "prediction PROCESSED (%s)" % PP_EXPERIMENT, pp, pp.get("processed_prediction_artifact_id"),
                               "PROCESSED_PREDICTION", case_get)
        if raw and gt_mesh:
            c.ok(raw["header"]["shape"] == gt_mesh["header"]["shape"], "prediction and ground-truth meshes live in different grids")
            c.ev("both meshes share the grid %s (x=column, y=row, z=slice): the toggle overlays them exactly" % raw["header"]["shape"])
        # an unknown or foreign source is never answered with some other mesh
        bad = api.get("%s/analysis-runs/%s/reconstruction?source_mask_id=%s" % (BASE, q(run["run_id"]), q("NOT_A_MASK")))
        c.expect_error(bad, 404, "ARTIFACT_NOT_FOUND", "reconstruction_get with an unknown source mask")
        wrong = api.get("%s/analysis-runs/%s/reconstruction?source_mask_id=%s" % (
            BASE, q(run["run_id"]), q((pp or {}).get("processed_prediction_artifact_id") or "ART_NONE")))
        c.expect_error(wrong, 404, "ARTIFACT_NOT_FOUND", "reconstruction_get with another run's mask (never substituted)")
        e = api.get("%s/analysis-runs/%s/error-reconstruction?prediction_variant=RAW" % (BASE, q(run["run_id"])))
        c.expect_error(e, 404, "ARTIFACT_NOT_FOUND", "error_reconstruction_get (DR-005 open: no fabricated error mesh)")
        c.ev("error_reconstruction_get -> %s %s (DR-005 open: the 3D error view is the GT / prediction disagreement)" % (e.status, e.error_code))
        st["meshes"] = {"RAW": raw, "GT": gt_mesh, "PROCESSED": pp_mesh}
        c.ev("rotate / zoom / pan, the colours and the frame rate are device tests (TC-3D-001/002, TC-PERF-002)")

    runner.run("H6", "SCR-05 3D: reconstruction_get + mesh bytes (sha256), counts, vertices inside [0, shape], GT / RAW / PROCESSED",
               h6, requires=["hero_run", "case_get"])

    def h6_int12(c, st):
        cid = args.int12
        r = api.get("%s/cases/%s" % (BASE, q(cid)))
        if not c.expect_status(r, 200, "case_get %s" % cid):
            return
        rid, run = None, None
        for x in (r.json.get("available_run_ids") or []):
            candidate = api.get("%s/analysis-runs/%s" % (BASE, q(x))).json or {}
            if candidate.get("experiment_id") == HERO_RUN_EXPERIMENT:
                rid, run = x, candidate
        if rid is None:
            c.skip("%s has no %s run" % (cid, HERO_RUN_EXPERIMENT))
        pred = mesh_for(c, "%s prediction RAW" % cid, run, run.get("raw_prediction_artifact_id"), "RAW_PREDICTION", r.json)
        c.ok(pred is not None, "the prediction mesh of the inference-only case must be served (INT-12 keeps predictions)")
        g = api.get("%s/analysis-runs/%s/reconstruction?source_mask_id=%s" % (BASE, q(rid), q("MASK_" + cid)))
        details = ((g.json or {}).get("error") or {}).get("details") or {}
        c.expect_error(g, 404, "ARTIFACT_NOT_FOUND", "reconstruction_get ground truth of %s" % cid)
        c.ok(details.get("reason") == "GROUND_TRUTH_UNAVAILABLE", "ground-truth mesh refusal reason %r" % details.get("reason"))
        c.ok("mesh_artifact_id" not in g.body.decode("utf-8", "replace"), "a refusal carries a mesh id")
        c.ev("ground-truth mesh of %s -> %s %s reason=%s (the contract has no GROUND_TRUTH_UNAVAILABLE on reconstruction_get)" % (
            cid, g.status, g.error_code, details.get("reason")))
        e = api.get("%s/analysis-runs/%s/error-reconstruction?prediction_variant=RAW" % (BASE, q(rid)))
        c.expect_error(e, 404, "GROUND_TRUTH_UNAVAILABLE", "error_reconstruction_get %s" % cid)
        c.ev("error mesh of %s -> %s %s" % (cid, e.status, e.error_code))

    runner.run("H6.i", "INT-12 3D: prediction mesh served; ground-truth mesh and error mesh refused", h6_int12)

    def h7(c, st):
        meshes = st.get("meshes") or {}
        run, case, case_get = st["hero_run"], st["case"], st["case_get"]
        if not meshes.get("RAW"):
            c.skip("H6 produced no prediction mesh")
        nz = case_get["shape"][2]
        sources = [("prediction RAW", meshes["RAW"], "%s/analysis-runs/%s/slices/%%d/prediction?variant=RAW" % (BASE, q(run["run_id"])))]
        if meshes.get("GT"):
            sources.append(("ground truth", meshes["GT"], "%s/cases/%s/slices/%%d/ground-truth" % (BASE, q(case))))
        picks_done = 0
        for label, mesh, route in sources:
            slices = mesh["slices"]
            order = sorted(range(len(slices)), key=lambda i: (slices[i], i))
            chosen = sorted(set(order[int(len(order) * f)] for f in (0.02, 0.25, 0.5, 0.75, 0.98)))
            pngs = {}
            for tri in chosen:
                cen, n, vox = face(mesh, tri)
                # a tap: the camera looks along -normal at the face centre from outside the volume
                origin = [cen[a] + 3.0 * n[a] for a in range(3)]
                hit = first_hit(mesh, origin, [-x for x in n])
                if not c.ok(hit is not None, "%s: a ray aimed at face %d hit nothing" % (label, tri)):
                    continue
                z = mesh["slices"][hit]
                _hc, _hn, hvox = face(mesh, hit)
                c.ok(0 <= z < nz, "%s: pick resolved slice %d outside [0, %d)" % (label, z, nz))
                c.ok(hvox[2] == z, "%s: the voxel behind the hit face is in slice %d, the face says %d" % (label, hvox[2], z))
                if z not in pngs:
                    r = api.get(route % z)
                    if not c.expect_status(r, 200, "%s slice %d" % (label, z)):
                        continue
                    raw_png = fetch_artifact(c, api, r.json, "%s slice %d" % (label, z))
                    pngs[z] = png_decode(raw_png) if raw_png else None
                png = pngs[z]
                if png is None:
                    continue
                w, h, px = png
                on_slice = sum(1 for b in px if b)
                x, y = hvox[0], hvox[1]
                c.ok(on_slice > 0, "%s: the mask of slice %d is empty" % (label, z))
                c.ok(0 <= x < w and 0 <= y < h and px[y * w + x] == 255,
                     "%s: slice %d has no mask at column %d row %d, where the picked face's voxel is" % (label, z, x, y))
                picks_done += 1
                c.ev("%s: face %d -> first hit %d -> slice %d / %d (z=%d); mask at column %d row %d on that slice is 255; "
                     "slice mask %d px" % (label, tri, hit, z + 1, nz, z, x, y, on_slice))
        c.ok(picks_done >= 5, "only %d picks verified" % picks_done)
        # a tap on the background resolves nothing: no navigation, nothing clamped
        sz = case_get["shape"][2]
        miss = first_hit(meshes["RAW"], [0.5, 0.5, sz + 10.0], [0.0, 0.0, -1.0])
        c.ev("background ray down the volume corner (column 0, row 0) -> %s" % ("no hit: no navigation" if miss is None else "HIT"))
        c.ok(miss is None, "a ray through the empty corner of the volume hit the mesh")
        c.ev("jump target: SCR-03 prediction_slice_get / ground_truth_slice_get at the resolved slice (served above); "
             "the in-app push and the 3D plane following the 2D slice are device / render tests")

    runner.run("H7", "pick a face in 3D -> its source slice is in range and the mask on that slice is at the face (GT, RAW)",
               h7, requires=["hero_run", "case_get"])

    # ---- H8 / H9 review ---------------------------------------------------------
    def writes_allowed():
        if args.no_writes:
            return False, "--no-writes given"
        host = urllib.parse.urlparse(args.base_url).hostname or ""
        if host in ("127.0.0.1", "localhost", "::1") or args.allow_remote_writes:
            return True, ""
        return False, "base URL host is not 127.0.0.1/localhost (review writes would change a shared database; use --allow-remote-writes to override)"

    def h8(c, st):
        allowed, why = writes_allowed()
        if not allowed:
            c.skip(why)
        case, run, w = st["case"], st["hero_run"], st["worst"]
        z = w["slice_index"]
        assets = st.get("slice_assets", {})
        if "prediction RAW" not in assets or not assets["prediction RAW"][1]:
            c.skip("RAW prediction bytes were not fetched (see H4.2)")
        pred_meta, pred_png = assets["prediction RAW"]
        mask_id = run.get("raw_prediction_artifact_id")
        c.ok(pred_meta.get("prediction_mask_id") == mask_id, "prediction slice mask id differs from the run's raw artifact id")
        st["raw_before"] = {"mask_id": mask_id, "slice": z, "checksum": pred_meta.get("checksum")}
        # raw prediction checksum of a second slice, to prove untouched slices stay equal later
        other = 0 if z != 0 else 1
        po = api.get("%s/analysis-runs/%s/slices/%d/prediction?variant=RAW" % (BASE, q(run["run_id"]), other))
        if c.expect_status(po, 200, "prediction slice %d" % other):
            st["raw_before"]["other"] = other
            st["raw_before"]["other_checksum"] = po.json.get("checksum")

        # 1. open the review exactly as V4 does: case_get for the geometry, review_create NOT_REVIEWED
        geo = st["case_get"]
        hdr = {"X-Reviewer-Id": "e2e-hero-flow"}
        rc = api.request("POST", "%s/analysis-runs/%s/reviews" % (BASE, q(run["run_id"])),
                         {"status": "NOT_REVIEWED", "source_mask_id": mask_id, "prediction_variant": "RAW"}, hdr)
        if rc.status not in (200, 201):
            c.problems.append("review_create answered %s %s" % (rc.status, rc.error_code))
            return
        rv = rc.json
        c.ev("review_create -> %s %s: review_id=%s status=%s revision=%s source_mask_id=%s variant=%s" % (
            rc.status, "(new)" if rc.status == 201 else "(existing review of the same scope returned unchanged)",
            rv.get("review_id"), rv.get("status"), rv.get("revision"), rv.get("source_mask_id"), rv.get("prediction_variant")))
        c.ok(rv.get("source_mask_id") == mask_id and rv.get("prediction_variant") == "RAW" and rv.get("run_id") == run["run_id"],
             "review scope differs from the request")
        c.ok(rv.get("status") in ("NOT_REVIEWED", "ACCEPTED", "FLAGGED", "CORRECTED"), "review status %r" % rv.get("status"))
        rid, rev = rv.get("review_id"), rv.get("revision")
        before_list = api.get("%s/reviews/%s/reviewed-masks" % (BASE, q(rid)))
        c.expect_status(before_list, 200, "reviewed_masks_list (before)")
        versions_before = dict((i["reviewed_mask_id"], i["checksum"]) for i in (before_list.json or {}).get("items", []))
        # 2. the minimal correction: one pixel of the prediction slice, as BITPACK_BASE64 (what the app sends)
        w_px, h_px, px = png_decode(pred_png)
        fg = px.find(b"\xff")
        edited = bytearray(px)
        if fg >= 0:
            edited[fg] = 0
            edit_desc = "erased the first foreground pixel (x=%d,y=%d)" % (fg % w_px, fg // w_px)
            at = fg
        else:
            at = (h_px // 2) * w_px + w_px // 2
            edited[at] = 255
            edit_desc = "added one foreground pixel at the slice centre (x=%d,y=%d)" % (at % w_px, at // w_px)
        payload = {"encoding": "BITPACK_BASE64", "data": base64.b64encode(bitpack(bytes(edited))).decode("ascii")}
        put = api.request("PUT", "%s/reviews/%s/working-mask/slices/%d" % (BASE, q(rid), z), {
            "source_mask_id": mask_id, "expected_revision": rev, "slice_index": z,
            "geometry_contract_version": geo.get("geometry_contract_version"),
            "geometry_validation_status": geo.get("geometry_validation_status"), "mask_payload": payload}, hdr)
        if not c.expect_status(put, 200, "working_mask_put"):
            return
        pd = put.json
        c.ev("working_mask_put slice %d (%s): working_revision=%s" % (z, edit_desc, pd.get("working_revision")))
        c.ok(pd.get("working_revision") == (rev or 0) + 1, "working_revision %r != %r+1" % (pd.get("working_revision"), rev))
        # a stale write must be refused, and must not write
        stale = api.request("PUT", "%s/reviews/%s/working-mask/slices/%d" % (BASE, q(rid), z), {
            "source_mask_id": mask_id, "expected_revision": rev, "slice_index": z,
            "geometry_contract_version": geo.get("geometry_contract_version"),
            "geometry_validation_status": geo.get("geometry_validation_status"), "mask_payload": payload}, hdr)
        c.expect_error(stale, 409, "STALE_REVISION", "stale working_mask_put")
        c.ev("stale working_mask_put -> %s %s" % (stale.status, stale.error_code))
        # a geometry mismatch must be refused
        bad = api.request("PUT", "%s/reviews/%s/working-mask/slices/%d" % (BASE, q(rid), z), {
            "source_mask_id": mask_id, "expected_revision": pd.get("working_revision"), "slice_index": z,
            "geometry_contract_version": geo.get("geometry_contract_version"),
            "geometry_validation_status": "VALIDATED_AXIS_ALIGNED", "mask_payload": payload}, hdr)
        c.expect_error(bad, 422, "GEOMETRY_MISMATCH", "working_mask_put with a claimed geometry validation")
        c.ev("working_mask_put claiming VALIDATED_AXIS_ALIGNED -> %s %s" % (bad.status, bad.error_code))
        st["review"] = {"id": rid, "revision": pd.get("working_revision"), "slice": z, "edited_at": at, "w": w_px,
                        "px": px, "edited": bytes(edited), "versions_before": versions_before, "hdr": hdr, "created": rc.status == 201}
        # 3. flag the problem with evidence (H8: a finding keeps its evidence)
        body = {"study_id": args.study_id, "experiment_id": HERO_RUN_EXPERIMENT, "case_id": case, "analysis_run_id": run["run_id"],
                "prediction_variant": "RAW", "slice_index": z, "finding_type": "BOUNDARY_DISAGREEMENT",
                "note": "e2e hero-flow check: worst slice by DR-010", "region_reference": {"x": at % w_px, "y": at // w_px}}
        fc = api.request("POST", BASE + "/findings", body, hdr)
        if c.expect_status(fc, 201, "finding_create"):
            f = fc.json
            c.ev("finding_create -> 201: %s status=%s revision=%s type=%s" % (f.get("finding_id"), f.get("status"), f.get("revision"), f.get("finding_type")))
            c.ok(f.get("status") == "OPEN" and f.get("revision") == 1, "new finding is %r at revision %r" % (f.get("status"), f.get("revision")))
            ev = f.get("evidence") or {}
            for k in ("study_id", "experiment_id", "case_id", "analysis_run_id", "prediction_variant", "slice_index"):
                c.ok(ev.get(k) == body[k], "finding evidence.%s %r != %r" % (k, ev.get(k), body[k]))
            c.ok(ev.get("region_reference") == body["region_reference"], "finding region_reference")
            lf = api.get("%s/findings?analysis_run_id=%s&case_id=%s" % (BASE, q(run["run_id"]), q(case)))
            if c.expect_status(lf, 200, "findings_list"):
                rows = dict((i["finding_id"], i) for i in lf.json.get("items", []))
                got = rows.get(f.get("finding_id"))
                c.ok(got is not None, "the new finding is not in findings_list")
                if got:
                    c.ok(got.get("evidence") == ev and got.get("note") == body["note"] and got.get("finding_type") == body["finding_type"],
                         "findings_list row differs from the created finding (evidence/note/type)")
                    c.ev("findings_list read-back: %d finding(s) for this run and case; the new one has identical evidence" % len(rows))
            st["finding_id"] = f.get("finding_id")

    runner.run("H8", "SCR-06/08 review: open review, brush-equivalent working mask (1 px), stale/geometry guards, finding with evidence",
               h8, requires=["worst", "hero_run", "case_get"])

    def h9(c, st):
        rv = st.get("review")
        if rv is None:
            c.skip("H8 did not create a working mask")
        run, case = st["hero_run"], st["case"]
        rid, z = rv["id"], rv["slice"]
        raw = st["raw_before"]
        hdr = rv["hdr"]
        # stale commit first: refused, nothing written
        stale = api.request("POST", "%s/reviews/%s/commit" % (BASE, q(rid)), {"expected_revision": rv["revision"] - 1}, hdr)
        c.expect_error(stale, 409, "STALE_REVISION", "stale review_commit")
        c.ev("commit with a stale revision -> %s %s (nothing written)" % (stale.status, stale.error_code))
        cm = api.request("POST", "%s/reviews/%s/commit" % (BASE, q(rid)), {"expected_revision": rv["revision"]}, hdr)
        if not c.expect_status(cm, 201, "review_commit"):
            return
        d = cm.json
        prov = d.get("provenance") or {}
        c.ev("review_commit -> 201: reviewed_mask_id=%s status=%s revision=%s checksum=%s..." % (
            d.get("reviewed_mask_id"), d.get("status"), d.get("revision"), str(d.get("checksum"))[:19]))
        c.ev("source identity: source_mask_id=%s kind=%s | provenance case=%s run=%s version=%s parent=%s at=%s reviewer=%s" % (
            d.get("source_mask_id"), d.get("source_mask_kind"), prov.get("case_id"), prov.get("run_id"), prov.get("version"),
            prov.get("parent_reviewed_mask_id"), prov.get("created_at") or prov.get("time"), prov.get("reviewer_id")))
        c.ok(d.get("status") == "CORRECTED", "commit status %r" % d.get("status"))
        c.ok(d.get("source_mask_id") == raw["mask_id"], "commit source_mask_id %r != the raw prediction %r" % (d.get("source_mask_id"), raw["mask_id"]))
        c.ok(d.get("source_mask_kind") == "RAW_PREDICTION", "source_mask_kind %r" % d.get("source_mask_kind"))
        c.ok(prov.get("case_id") == case and prov.get("run_id") == run["run_id"], "provenance case/run")
        c.ok(d.get("reviewed_mask_id") not in rv["versions_before"], "reviewed_mask_id %r is an existing version (overwrite)" % d.get("reviewed_mask_id"))
        c.ok(d.get("reviewed_mask_id") != raw["mask_id"], "reviewed id equals the raw prediction id")
        c.ok(d.get("revision") == rv["revision"] + 1, "commit revision %r != %r" % (d.get("revision"), rv["revision"] + 1))
        # list: the new version is there, all earlier versions unchanged
        ls = api.get("%s/reviews/%s/reviewed-masks" % (BASE, q(rid)))
        if c.expect_status(ls, 200, "reviewed_masks_list"):
            now_map = dict((i["reviewed_mask_id"], i["checksum"]) for i in ls.json.get("items", []))
            c.ok(d.get("reviewed_mask_id") in now_map, "the new version is not in reviewed_masks_list")
            for k, v in rv["versions_before"].items():
                c.ok(now_map.get(k) == v, "earlier version %s changed or disappeared" % k)
            c.ev("reviewed_masks_list: %d version(s), earlier %d unchanged, newest %s" % (len(now_map), len(rv["versions_before"]), d.get("reviewed_mask_id")))
        # the edited slice: bytes verify, differ from the prediction by exactly the edited pixel
        rs = api.get("%s/reviewed-masks/%s/slices/%d" % (BASE, q(d.get("reviewed_mask_id")), z))
        if c.expect_status(rs, 200, "reviewed_mask_slice_get"):
            png = fetch_artifact(c, api, rs.json, "reviewed slice %d" % z)
            if png:
                _w, _h, rpx = png_decode(png)
                diff = [i for i in range(len(rpx)) if rpx[i] != rv["px"][i]]
                c.ev("reviewed slice %d vs raw prediction: %d differing pixel(s) %s; equals the submitted working mask: %s" % (
                    z, len(diff), "(the edited one)" if diff == [rv["edited_at"]] else "", rpx == rv["edited"]))
                c.ok(rpx == rv["edited"], "reviewed slice differs from the submitted working mask")
                c.ok(diff == [rv["edited_at"]], "reviewed slice differs from the prediction at %d pixels, expected exactly the edited one" % len(diff))
        # an untouched slice: identical bytes (same checksum) to the raw prediction slice
        if "other" in raw:
            ro = api.get("%s/reviewed-masks/%s/slices/%d" % (BASE, q(d.get("reviewed_mask_id")), raw["other"]))
            if c.expect_status(ro, 200, "reviewed_mask_slice_get untouched slice"):
                c.ok(ro.json.get("checksum") == raw["other_checksum"], "untouched slice %d: reviewed checksum differs from the raw prediction's" % raw["other"])
                c.ev("untouched slice %d: reviewed checksum == raw prediction checksum: %s" % (raw["other"], ro.json.get("checksum") == raw["other_checksum"]))
        # the raw prediction is unchanged
        pr = api.get("%s/analysis-runs/%s/slices/%d/prediction?variant=RAW" % (BASE, q(run["run_id"]), z))
        if c.expect_status(pr, 200, "prediction_slice_get after commit"):
            c.ok(pr.json.get("checksum") == raw["checksum"], "raw prediction checksum changed: %s -> %s" % (raw["checksum"], pr.json.get("checksum")))
            c.ok(pr.json.get("prediction_mask_id") == raw["mask_id"], "raw prediction mask id changed")
            c.ev("raw prediction slice %d checksum before == after: %s (%s...)" % (z, pr.json.get("checksum") == raw["checksum"], str(raw["checksum"])[:19]))
        rr = api.get("%s/analysis-runs/%s" % (BASE, q(run["run_id"])))
        if c.expect_status(rr, 200, "analysis_run_get after commit"):
            c.ok(rr.json.get("raw_prediction_artifact_id") == raw["mask_id"], "the run's raw artifact id changed")
        # the state machine: CORRECTED only via commit
        pt = api.request("PATCH", "%s/reviews/%s" % (BASE, q(rid)), {"status": "CORRECTED", "expected_revision": d.get("revision")}, hdr)
        c.expect_error(pt, 409, "INVALID_REVIEW_TRANSITION", "review_patch to CORRECTED")
        c.ev("review_patch -> CORRECTED after the commit -> %s %s (only review_commit may enter CORRECTED)" % (pt.status, pt.error_code))
        # a committed version cannot be rewritten through the API: replaying the same commit needs new working edits
        again = api.request("POST", "%s/reviews/%s/commit" % (BASE, q(rid)), {"expected_revision": d.get("revision")}, hdr)
        c.ok(again.status == 422 and again.error_code == "VALIDATION_ERROR",
             "second commit without new edits answered %s/%s (expected 422 VALIDATION_ERROR: nothing to commit)" % (again.status, again.error_code))
        st["commit"] = d

    runner.run("H9", "SCR-06 save: new immutable reviewed-mask version, source identity, raw prediction checksum unchanged",
               h9, requires=["worst", "hero_run"])

    # ---- H10 comparison ---------------------------------------------------------
    def compare(c, st, a, b, label, expect):
        r = api.get("%s/experiments/compare?ids=%s,%s" % (BASE, q(a), q(b)))
        if expect == "COMPARABLE":
            if not c.expect_status(r, 200, "experiment_compare %s" % label):
                return None
            d = r.json
            c.ok(d.get("comparable") is True, "%s: comparable is %r (%s)" % (label, d.get("comparable"), d.get("compatibility_reason")))
            pop = d.get("common_evaluation_population")
            n_pop = len(pop) if isinstance(pop, list) else (pop.get("n") if isinstance(pop, dict) else None)
            summ = d.get("summary") or {}
            c.ok(a in summ and b in summ, "%s: summary lacks one of the experiments" % label)
            if a in summ and b in summ:
                da, db = summ[a].get("dice") or {}, summ[b].get("dice") or {}
                c.ok(isinstance(da.get("mean"), (int, float)) and isinstance(db.get("mean"), (int, float)), "%s: dice means missing" % label)
                c.ok(da.get("n") == db.get("n") == args.expect_n, "%s: dice n %s/%s != %s" % (label, da.get("n"), db.get("n"), args.expect_n))
                delta = db["mean"] - da["mean"] if isinstance(da.get("mean"), (int, float)) and isinstance(db.get("mean"), (int, float)) else None
                dmed = db["median"] - da["median"] if isinstance(da.get("median"), (int, float)) and isinstance(db.get("median"), (int, float)) else None
                c.ev("%s: comparable=%s reason=%r variant=%s metric_version=%s population n=%s | dice mean %s=%s %s=%s delta=%s | median delta=%s | n=%s/%s" % (
                    label, d.get("comparable"), d.get("compatibility_reason"), d.get("prediction_variant"), d.get("metric_version"),
                    n_pop, a, fmt(da.get("mean")), b, fmt(db.get("mean")), fmt(delta, 4) if delta is not None else None,
                    fmt(dmed, 4) if dmed is not None else None, da.get("n"), db.get("n")))
            c.ok(n_pop == args.expect_n, "%s: common population %s != %s" % (label, n_pop, args.expect_n))
            return d
        # non-comparable pair
        c.ev("%s: HTTP %s %s" % (label, r.status, r.error_code or ("comparable=%s" % (r.json or {}).get("comparable"))))
        if r.status == 422:
            c.expect_error(r, 422, "NON_COMPARABLE_EXPERIMENTS", "experiment_compare %s" % label)
            err = (r.json or {}).get("error", {})
            c.ev("%s: NON_COMPARABLE_EXPERIMENTS details=%s" % (label, json.dumps(err.get("details"), sort_keys=True)[:200]))
        elif r.status == 200:
            # the contract carries comparable:false + compatibility_reason; the app reads that (app/core/comparability.mjs)
            d = r.json or {}
            c.ok(d.get("comparable") is False, "%s: a variant mismatch was served as comparable=%s" % (label, d.get("comparable")))
            c.ok("prediction variant" in str(d.get("compatibility_reason")), "%s: reason %r does not name the variant mismatch" % (label, d.get("compatibility_reason")))
            c.ok(d.get("prediction_variant") is None, "%s: a single prediction_variant %r is stated for a mixed pair" % (label, d.get("prediction_variant")))
            c.ev("%s: comparable=%s reason=%r -> the app must not label it fair or draw a delta (mayShowDelta=false)" % (label, d.get("comparable"), d.get("compatibility_reason")))
        else:
            c.problems.append("%s answered %s %s" % (label, r.status, r.error_code))
        return r.json

    def h10a(c, st):
        compare(c, st, "EXP-D-025", "EXP-D-100", "025 vs 100", "COMPARABLE")
        compare(c, st, "EXP-D-050", "EXP-D-100", "050 vs 100", "COMPARABLE")

    runner.run("H10.1", "SCR-07 experiment_compare data scarcity: 25% vs 100% and 50% vs 100% (COMPARABLE, deltas)", h10a, requires=["metrics"])

    def h10b(c, st):
        compare(c, st, HERO_RUN_EXPERIMENT, PP_EXPERIMENT, "100 (RAW) vs PP (PROCESSED)", "NON_COMPARABLE")

    runner.run("H10.2", "variant mismatch handled as the contract says (RAW vs PROCESSED is not fair)", h10b, requires=["metrics"])

    def h10c(c, st):
        meta = st.get("experiment_meta", {})
        unets = [e for e, m in meta.items() if "unet" in str(m.get("model_family", "")).lower()]
        if unets:
            c.ev("UNet experiments present: %s" % unets)
            for u in unets:
                same = [e for e, m in meta.items() if e not in unets and m.get("training_fraction") == meta[u].get("training_fraction")
                        and m.get("prediction_variant") == meta[u].get("prediction_variant")]
                for e in same:
                    compare(c, st, u, e, "%s vs %s" % (u, e), "COMPARABLE")
            return
        c.skip("UNet runs are not available yet (Khanh trains them); the model comparison UNet vs DINOv2 x 25/50/100 cannot be shown")

    runner.run("H10.3", "model comparison UNet vs DINOv2", h10c)

    # ---- INT-12 guard -------------------------------------------------------------
    def int12(c, st):
        cid = args.int12
        r = api.get("%s/cases/%s" % (BASE, q(cid)))
        if c.expect_status(r, 200, "case_get %s" % cid):
            d = r.json
            c.ev("case_get %s: mode=%s ground_truth_available=%s run_ids=%s" % (cid, d.get("mode"), d.get("ground_truth_available"), d.get("available_run_ids")))
            c.ok(d.get("mode") == "INFERENCE_REVIEW" and d.get("ground_truth_available") is False, "%s is not inference-only" % cid)
            run_ids = d.get("available_run_ids") or []
        else:
            run_ids = []
        g = api.get("%s/cases/%s/slices/44/ground-truth" % (BASE, q(cid)))
        c.expect_error(g, 404, "GROUND_TRUTH_UNAVAILABLE", "ground_truth_slice_get %s" % cid)
        c.ev("ground_truth_slice_get %s slice 44 -> %s %s; body has content_url: %s" % (
            cid, g.status, g.error_code, "content_url" in (g.json or {})))
        c.ok("content_url" not in (g.json or {}), "an error response carries a content_url")
        mri = api.get("%s/cases/%s/slices/44/mri" % (BASE, q(cid)))
        c.expect_status(mri, 200, "mri_slice_get %s (inference review keeps the MRI)" % cid)
        for rid in run_ids:
            rr = api.get("%s/analysis-runs/%s" % (BASE, q(rid)))
            if not (rr.status == 200 and rr.json.get("experiment_id") == HERO_RUN_EXPERIMENT):
                continue
            for label, path in (("analysis_run_metrics", "metrics?prediction_variant=RAW"),
                                ("analysis_slice_metrics", "slices/44/metrics?prediction_variant=RAW"),
                                ("analysis_slice_error", "slices/44/error?prediction_variant=RAW")):
                x = api.get("%s/analysis-runs/%s/%s" % (BASE, q(rid), path))
                c.expect_error(x, 404, "GROUND_TRUTH_UNAVAILABLE", "%s for %s" % (label, cid))
                c.ev("%s run %s -> %s %s" % (label, rid, x.status, x.error_code))
            p = api.get("%s/analysis-runs/%s/slices/44/prediction?variant=RAW" % (BASE, q(rid)))
            c.expect_status(p, 200, "prediction_slice_get %s (prediction stays reviewable)" % cid)
            c.ev("prediction of %s still served: %s" % (cid, p.status))
        cs = st.get("cases_by_exp", {}).get(HERO_RUN_EXPERIMENT)
        if cs:
            named = [x for x in (cs.get("outlier_selection") or {}).get("cases", []) if x.get("case_id") == cid]
            c.ok(not named, "%s is named in an outlier list" % cid)
            c.ev("%s is not in any outlier list" % cid)

    runner.run("INT-12", "INT-12 guard: ground truth of the inference-only case is refused, never zero", int12)


# ----------------------------------------------------------------------------

def print_summary(runner, elapsed):
    print()
    print("=" * 100)
    print("HERO FLOW API PROOF  -  summary")
    print("=" * 100)
    print("%-7s %-6s %9s  %s" % ("step", "result", "ms", "name"))
    for c in runner.checks:
        print("%-7s %-6s %9d  %s" % (c.id, c.status, c.ms, c.name))
    counts = {}
    for c in runner.checks:
        counts[c.status] = counts.get(c.status, 0) + 1
    print("-" * 100)
    print("PASS=%d FAIL=%d SKIP=%d  | requests=%d  | total %.1f s" % (
        counts.get(PASS, 0), counts.get(FAIL, 0), counts.get(SKIP, 0), len(runner.api.log), elapsed))
    for c in runner.checks:
        if c.status == SKIP:
            print("  SKIP %-6s %s" % (c.id, c.skip_reason))
    for c in runner.checks:
        if c.status == FAIL:
            for p in c.problems:
                print("  FAIL %-6s %s" % (c.id, p))
    print("RESULT: %s" % ("FAIL" if counts.get(FAIL) else "PASS"))


def main(argv=None):
    ap = argparse.ArgumentParser(description="API-level end-to-end proof of the demo hero flow (H1-H10).")
    ap.add_argument("--base-url", required=True, help="scheme://host:port of the backend (no /api/v1)")
    ap.add_argument("--case", default=None, help="demo case id (default: first EXP-D-100 outlier that is an EVALUATION case)")
    ap.add_argument("--json-out", default=None, help="write the full result (steps, evidence, calls) as JSON to this file")
    ap.add_argument("--no-writes", action="store_true", help="skip H8/H9 (review, commit, finding): read-only run")
    ap.add_argument("--allow-remote-writes", action="store_true", help="allow H8/H9 against a non-local host (changes its database)")
    ap.add_argument("--study-id", default="STUDY_LA_001")
    ap.add_argument("--experiments", nargs="*", default=DEFAULT_EXPERIMENTS, help="experiment ids that must be served")
    ap.add_argument("--expect-cases", type=int, default=74, help="expected case count (use -1 to skip)")
    ap.add_argument("--expect-n", type=int, default=54, help="expected evaluation population size")
    ap.add_argument("--int12", default="CASE_0001", help="the inference-only (INT-12) case id")
    ap.add_argument("--timeout", type=float, default=60.0)
    args = ap.parse_args(argv)
    if args.expect_cases is not None and args.expect_cases < 0:
        args.expect_cases = None

    api = Api(args.base_url, args.timeout)
    runner = Runner(api)
    started = time.time()
    print("Hero flow API proof  |  contract %s  |  writes: %s" % (
        EXPECTED_CONTRACT_VERSION, "off (--no-writes)" if args.no_writes else "local only" if not args.allow_remote_writes else "ALLOWED on any host"))
    print("Started %s UTC\n" % time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(started)))
    try:
        build_steps(runner, args)
    except Exception as e:  # pragma: no cover
        print("runner crashed: %s: %s" % (type(e).__name__, e))
        return 2
    elapsed = time.time() - started
    print_summary(runner, elapsed)
    if args.json_out:
        out = {
            "tool": "tools/e2e/hero_flow_api.py", "contract_version": EXPECTED_CONTRACT_VERSION,
            "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)), "elapsed_s": round(elapsed, 2),
            "no_writes": args.no_writes, "demo_case": runner.state.get("case"),
            "result": "FAIL" if any(c.status == FAIL for c in runner.checks) else "PASS",
            "steps": [{
                "id": c.id, "name": c.name, "status": c.status, "ms": round(c.ms, 1), "skip_reason": c.skip_reason,
                "problems": c.problems, "evidence": c.evidence,
                "calls": [{"method": x.method, "path": x.path, "status": x.status, "ms": round(x.ms, 1)} for x in c.calls],
            } for c in runner.checks],
        }
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(out, fh, indent=2)
        print("JSON written: %s" % args.json_out)
    return 1 if any(c.status == FAIL for c in runner.checks) else 0


if __name__ == "__main__":
    sys.exit(main())
