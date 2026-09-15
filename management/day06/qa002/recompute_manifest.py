#!/usr/bin/env python3
"""QA-D: independent recomputation over the COMMITTED Spike D manifest (read-only).

Sections M* recompute aggregates from raw per-case fields without using the validator.
Section R re-runs checks.py / audit_report.py on the committed manifest and compares.
"""
import collections, difflib, hashlib, json, math, os, re, sys

sys.dont_write_bytecode = True
SCR = r"C:\Users\Admin\AppData\Local\Temp\claude\d--cardiac-mri-workspace\faa5a3e8-92ac-4536-aa1f-b1f535bd5777\scratchpad"
WT = os.path.join(SCR, "wt-qa-d")
MAN = os.path.join(WT, "data", "manifests", "dataset_manifest.json")
SCHEMA = os.path.join(WT, "tools", "dataset_validate", "schema", "dataset_manifest.schema.json")
AUDIT = os.path.join(WT, "management", "DATASET_AUDIT.md")
C = collections.Counter


def h(t):
    print("\n=== " + t + " ===")


raw = open(MAN, "rb").read()
h("M0 file facts")
print("bytes", len(raw), "sha256", hashlib.sha256(raw).hexdigest())
print("LF lines", raw.count(b"\n"), "CRLF", raw.count(b"\r\n"), "ends_with_newline", raw.endswith(b"\n"))
print("NaN/Infinity tokens", len(re.findall(rb"\bNaN\b|\bInfinity\b", raw)))


def reject(c):
    raise ValueError("non-standard JSON constant " + c)


m = json.loads(raw.decode("utf-8"), parse_constant=reject)

h("M1 JSON Schema (Draft 2020-12)")
try:
    import jsonschema
    schema = json.load(open(SCHEMA, encoding="utf-8"))
    jsonschema.Draft202012Validator.check_schema(schema)
    errs = list(jsonschema.Draft202012Validator(schema).iter_errors(m))
    print("schema is itself valid; manifest validation errors:", len(errs))
    for e in errs[:10]:
        print("  ", list(e.path), e.message[:200])
except Exception as exc:
    print("schema validation could not run:", exc)

h("M2 top level")
print("keys", list(m.keys()))
print("generated_at", m["generated_at"], "| package_root", repr(m["package_root"]), "| nrrd_library", m["nrrd_library"])
acq = m["acquisition"]
print("acquisition keys", list(acq.keys()))
print("owner_verdicts keys", list(acq.get("owner_verdicts", {}).keys()))

cases = m["cases"]
h("M3 counts and partitions")
print("len(cases)", len(cases), "case_count_total", m["case_count_total"])
print("partition counts recomputed", dict(C(c["partition_as_released"] for c in cases)))
for name, b in m["partitions"].items():
    rc = [c for c in cases if c["partition_as_released"] == name]
    rec = {"case_count": len(rc),
           "cases_with_mri": sum(1 for c in rc if c["files_present"].get("lgemri.nrrd") and c.get("mri")),
           "cases_with_mask": sum(1 for c in rc if c["files_present"].get("laendo.nrrd") and c.get("mask")),
           "cases_missing_mask": [c["case_id"] for c in rc if not c.get("mask")]}
    rec["all_cases_have_mask"] = rec["cases_with_mask"] == rec["case_count"]
    print(" ", name, "recorded", b, "\n   recomputed", rec, "MATCH" if b == rec else "MISMATCH")
print("path depth distribution", dict(C(len(c["source_dir_relative"].split("/")) for c in cases)))
print("partition == first path segment:", all(c["source_dir_relative"].split("/")[0] == c["partition_as_released"] for c in cases))
print("source_dir_name == last segment:", all(c["source_dir_relative"].split("/")[-1] == c["source_dir_name"] for c in cases))
print("files_present all true:", all(all(c["files_present"].values()) for c in cases))

h("M4 IDs, ordering, folder-name uniqueness")
ids = [c["case_id"] for c in cases]
print("ids unique", len(set(ids)) == len(ids), "| sequential", ids == [f"CASE_{i:04d}" for i in range(1, len(cases) + 1)])
rels = [c["source_dir_relative"] for c in cases]
print("sorted by source_dir_relative", rels == sorted(rels))
names = C(c["source_dir_name"] for c in cases)
print("source_dir_name duplicates", {k: v for k, v in names.items() if v > 1})
print("case-insensitive duplicates", sum(1 for v in C(n.lower() for n in names).values() if v > 1))
print("source_dir_name lengths", dict(C(len(n) for n in names)), "charset", "".join(sorted(set("".join(names)))))
for p in sorted(set(c["partition_as_released"] for c in cases)):
    pid = [c["case_id"] for c in cases if c["partition_as_released"] == p]
    print(" ", p, "ids", pid[0], "..", pid[-1], "n", len(pid))

req = [(c, r, c[r]) for c in cases for r in ("mri", "mask") if c.get(r) is not None]
comp = [(c, n, v) for c in cases for n, v in (c.get("companion_volumes") or {}).items()]


def dist(field, vols, top=6):
    return C(json.dumps(v.get(field)) for _, _, v in vols).most_common(top)


h("M5 volume fields (required = lgemri+laendo; companions separately)")
print("required volumes", len(req), "| companions", len(comp), dict(C(n for _, n, _ in comp)))
for field in ("read_ok", "dtype", "dimension", "is_3d", "space", "encoding", "axis_aligned",
              "has_non_finite", "negative_direction_axes", "value_min", "value_max",
              "spacing", "space_origin", "space_directions", "axis_aligned_basis"):
    print(f"{field:24s} req {dist(field, req)}\n{'':24s} comp {dist(field, comp)}")
for role in ("mri", "mask"):
    vols = [x for x in req if x[1] == role]
    print(role, "dtype", dist("dtype", vols), "shape", dist("shape", vols))

h("M6 shape distribution")
print("MRI shapes recomputed", dict(C(str(c["mri"]["shape"]) for c in cases)))
print("recorded counts_by_shape", m["shape_distribution"]["counts_by_shape"])
print("shape by partition", dict(C((c["partition_as_released"], str(c["mri"]["shape"])) for c in cases)))
print("companion shape == MRI shape", sum(1 for c, n, v in comp if v.get("shape") == c["mri"]["shape"]), "of", len(comp))


def aligned(d):
    if not isinstance(d, list) or len(d) != 3:
        return None
    for i, row in enumerate(d):
        if not isinstance(row, list) or len(row) != 3:
            return None
        for j, x in enumerate(row):
            if x is None or not math.isfinite(x):
                return None
            if (i != j and x != 0.0) or (i == j and x == 0.0):
                return False
    return True


h("M7 axis alignment recomputed from recorded direction matrices")
res, mism = C(), 0
for c, r, v in req + comp:
    a = aligned(v.get("space_directions"))
    res[(r if r in ("mri", "mask") else "companion", a)] += 1
    if a is not None and v.get("axis_aligned") is not a:
        mism += 1
print(dict(res), "| recorded vs recomputed mismatches", mism)

h("M8 MRI-mask geometry recomputed")
cnt, bad = C(), []
for c in cases:
    a, b = c["mri"], c.get("mask")
    if b is None:
        cnt["no mask"] += 1
        continue
    eq = {"shape": a["shape"] == b["shape"], "spacing": a["spacing"] == b["spacing"],
          "origin": a["space_origin"] == b["space_origin"],
          "directions": a["space_directions"] == b["space_directions"],
          "space": a.get("space") == b.get("space"), "size_bytes": a["size_bytes"] == b["size_bytes"]}
    cnt[tuple(sorted(k for k, x in eq.items() if not x))] += 1
    rec = c["mri_mask_compatibility"]
    for k in ("shape", "spacing", "origin", "directions"):
        if rec[f"{k}_equal"] is not eq[k]:
            bad.append((c["case_id"], k))
    want = not all(eq[k] for k in ("shape", "spacing", "origin", "directions"))
    if rec["resampling_required"] is not want:
        bad.append((c["case_id"], "resampling_required"))
print("differing fields per case (() = all equal):", dict(cnt))
print("recorded-flag mismatches", len(bad), bad[:10])
geo = C((json.dumps(c["mri"]["spacing"]), json.dumps(c["mri"]["space_origin"]), json.dumps(c["mri"]["space_directions"])) for c in cases)
print("distinct (spacing, origin, directions) triples across MRIs:", len(geo))
for k, v in geo.most_common(5):
    print("  ", v, k)

h("M9 mask values")
print("unique_values", dict(C(json.dumps(c["mask"]["unique_values"]) for c in cases if c.get("mask"))))
print("mask (min,max)", dict(C((c["mask"]["value_min"], c["mask"]["value_max"]) for c in cases if c.get("mask"))))
mp = acq["owner_verdicts"]["a10_mapping"]
print("owner mapping", mp, "| equals every recorded set:",
      all(sorted([mp["background"], mp["foreground"]]) == c["mask"]["unique_values"]["values"] for c in cases if c.get("mask")))
print("MRI (min,max) top", C((c["mri"]["value_min"], c["mri"]["value_max"]) for c in cases).most_common(5))

h("M10 identifier findings, sidecars")
lists = [v.get("header_identifier_findings") for _, _, v in req + comp]
print("headers scanned (list)", sum(isinstance(x, list) for x in lists), "not scanned", sum(not isinstance(x, list) for x in lists),
      "findings", sum(len(x) for x in lists if isinstance(x, list)))
print("sidecars", [(c["case_id"], c["source_dir_relative"], s) for c in cases for s in c.get("non_nrrd_sidecars") or []])
print("other_files sets", dict(C(json.dumps(c.get("other_files_in_case_dir")) for c in cases)))
print("a17_excluded_files", acq["owner_verdicts"].get("a17_excluded_files"))

h("M11 checksums and duplicate content")
print("required volumes without 64-hex sha256", sum(1 for _, _, v in req if not re.fullmatch(r"[0-9a-f]{64}", str(v.get("sha256")))))
print("companion sha256 values", dict(C(str(v.get("sha256"))[:40] for _, _, v in comp)))
by = collections.defaultdict(list)
for c, r, v in req:
    by[v["sha256"]].append(f'{c["case_id"]}/{r}/{c["partition_as_released"]}')
d = {k: x for k, x in by.items() if len(x) > 1}
print("sha256 shared by >1 required volume:", len(d))
for k, x in list(d.items())[:10]:
    print("  ", k[:16], x)

h("M12 size vs shape (header bytes = size - prod(shape) for raw uint8)")
hb = C()
for c, r, v in req + comp:
    if isinstance(v.get("shape"), list):
        hb[(v.get("encoding"), v.get("dtype"), v["size_bytes"] - math.prod(v["shape"]))] += 1
print(dict(hb))

h("M13 governance: string values matching path / URL / email patterns")
pats = {"windows_abs_path": re.compile(r"[A-Za-z]:[\\/]"), "posix_home": re.compile(r"/(Users|home)/"),
        "email": re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "url": re.compile(r"https?://"),
        "users_dir": re.compile(r"\\Users\\|/Users/", re.I)}
hits = collections.defaultdict(set)
leaf = C()


def walk(x, path):
    if isinstance(x, dict):
        for k, y in x.items():
            walk(y, f"{path}.{k}")
    elif isinstance(x, list):
        for y in x:
            walk(y, path + "[]")
    else:
        leaf[path] += 1
        if isinstance(x, str):
            for nm, p in pats.items():
                if p.search(x):
                    hits[nm].add((path, x[:110]))


walk(m, "$")
for nm in pats:
    print(nm, len(hits[nm]))
    for it in sorted(hits[nm])[:6]:
        print("    ", it)
print("person-name fields:", {k: acq.get(k) for k in ("acquired_by", "operator")}, acq["owner_verdicts"].get("confirmed_by"))

h("M14 leaf key-path inventory of the public manifest")
for k, n in sorted(leaf.items()):
    print(f"{n:6d}  {k}")

h("R1 re-run checks.py + audit_report.py on the committed manifest")
sys.path.insert(0, os.path.join(WT, "tools", "dataset_validate"))
import checks, audit_report  # noqa: E402
results = checks.run_checks(m)
summary = checks.summarise(results, acq.get("owner_verdicts") or {})
stored = m.get("criteria_results")
recomputed = [r.as_dict() for r in results]
print("criteria_results identical:", stored == recomputed, "| summary identical:", m.get("summary") == summary)
for a, b in zip(stored or [], recomputed):
    if a != b:
        print("  stored ", a, "\n  recomp ", b)
text = audit_report.render(m, results, summary)
committed = open(AUDIT, encoding="utf-8", newline="").read()
print("re-rendered audit == committed DATASET_AUDIT.md:", text == committed)
if text != committed:
    for line in list(difflib.unified_diff(committed.splitlines(), text.splitlines(), "committed", "rerendered", lineterm=""))[:40]:
        print("  ", line)
