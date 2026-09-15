#!/usr/bin/env python3
"""QA-D: code-independent census of the byte-identical archive copy (read-only).

Does NOT import pynrrd or the validator. Streams each ZIP member, hashes it with hashlib, parses the
NRRD header text itself, and reads raw uint8 payloads with numpy. Prints aggregates only; header VALUES
are printed only for technical geometry/encoding fields, never for other keys, comments or sidecars.
"""
import collections, hashlib, json, os, re, sys, time, zipfile
import numpy as np

SCR = r"C:\Users\Admin\AppData\Local\Temp\claude\d--cardiac-mri-workspace\faa5a3e8-92ac-4536-aa1f-b1f535bd5777\scratchpad"
MAN = os.path.join(SCR, "wt-qa-d", "data", "manifests", "dataset_manifest.json")
ARCHIVE = r"C:\cardiac-data\lasc2018\2018_UTAH_MICCAI.zip"
OUT = os.path.join(SCR, "qa", "census")
os.makedirs(OUT, exist_ok=True)
C = collections.Counter
GEOM_FIELDS = ("type", "dimension", "space", "sizes", "space directions", "kinds", "endian",
               "encoding", "space origin", "spacings", "thicknesses", "units", "space units",
               "measurement frame", "data file", "datafile", "byte skip", "line skip")
STD_COMMENTS = {"# Complete NRRD file format specification at:",
                "# http://teem.sourceforge.net/nrrd/format.html"}


def h(t):
    print("\n=== " + t + " ===", flush=True)


man = json.load(open(MAN, encoding="utf-8"))
by_rel = {}
for c in man["cases"]:
    for role in ("mri", "mask"):
        v = c.get(role)
        if v:
            by_rel[v["path_relative"]] = (c["case_id"], role, v)

zf = zipfile.ZipFile(ARCHIVE)
infos = zf.infolist()
files = [i for i in infos if not i.is_dir()]
names = [i.filename for i in files]

h("Z1 ZIP inventory")
print("entries", len(infos), "directories", len(infos) - len(files), "files", len(files))
tot = sum(i.file_size for i in files)
print("uncompressed bytes", tot, "GiB", round(tot / 2**30, 2))
print("files by extension", dict(C(os.path.splitext(n)[1].lower() for n in names)))
print("suspicious names (abs, .., backslash, drive):",
      [n for n in names if n.startswith("/") or ".." in n.split("/") or "\\" in n or re.match(r"^[A-Za-z]:", n)])
print("duplicate names", [n for n, k in C(names).items() if k > 1])
print("case-insensitive duplicate names", [n for n, k in C(x.lower() for x in names).items() if k > 1])
print("path depth distribution", dict(C(len(n.split("/")) for n in names)))
print("top-level segments", dict(C(n.split("/")[0] for n in names)))
print("compress types", dict(C(i.compress_type for i in files)), "encrypted", sum(1 for i in files if i.flag_bits & 1))
case_dirs = sorted({n.rsplit("/", 1)[0] for n in names if n.lower().endswith("/lgemri.nrrd")})
print("case directories", len(case_dirs), "by first segment", dict(C(d.split("/")[0] for d in case_dirs)))
outside = [(n, i.file_size) for n, i in zip(names, files) if ("/" not in n) or n.rsplit("/", 1)[0] not in case_dirs]
print("files NOT inside a case directory:", outside)
sets = C(tuple(sorted(n.rsplit("/", 1)[1] for n in names if n.rsplit("/", 1)[0] == d)) for d in case_dirs)
print("file-name sets per case directory", dict(sets))
nested = [d for d in case_dirs if any(o != d and o.startswith(d + "/") for o in case_dirs)]
print("case directories nested inside another case directory", nested)

h("Z2 non-NRRD files inside case directories (keys only, no values)")
for i in files:
    if i.filename.rsplit("/", 1)[0] in case_dirs and not i.filename.lower().endswith(".nrrd"):
        data = zf.read(i)
        enc = "utf-16" if data[:2] in (b"\xff\xfe", b"\xfe\xff") else "latin-1"
        text = data.decode(enc, errors="replace")
        print(" ", i.filename.split("/")[0], "/<case>/", i.filename.rsplit("/", 1)[1], "size", i.file_size, "enc", enc,
              "| sections", re.findall(r"^\s*\[([^\]]+)\]", text, re.M),
              "| keys", re.findall(r"^\s*([^=\[\];#\r\n]+?)\s*=", text, re.M),
              "| has drive:\\Users\\ path", bool(re.search(r"[A-Za-z]:\\Users\\", text, re.I)),
              "| has SID", "S-1-5-" in text, "| has '@'", "@" in text)
case_of = {m["source_dir_relative"]: m["case_id"] for m in man["cases"]}
print("  sidecar case ids per committed manifest:",
      [case_of.get(i.filename.rsplit("/", 1)[0]) for i in files
       if i.filename.rsplit("/", 1)[0] in case_dirs and not i.filename.lower().endswith(".nrrd")])


def split_header(stream):
    head = b""
    while True:
        for sep in (b"\n\n", b"\r\n\r\n"):
            k = head.find(sep)
            if k >= 0:
                return head[:k].decode("latin-1"), head[k + len(sep):]
        chunk = stream.read(65536)
        if not chunk or len(head) > 1 << 20:
            return None, head
        head += chunk


field_keys, kv_keys, comments, magic = C(), C(), C(), C()
geom = {g: C() for g in GEOM_FIELDS}
indep = {}
struct = []


def dilate6(a):
    d = a.copy()
    d[1:] |= a[:-1]; d[:-1] |= a[1:]
    d[:, 1:] |= a[:, :-1]; d[:, :-1] |= a[:, 1:]
    d[:, :, 1:] |= a[:, :, :-1]; d[:, :, :-1] |= a[:, :, 1:]
    return d


h("Z3 streaming every NRRD (independent of pynrrd and the validator)")
t0 = time.time()
for d in case_dirs:
    arrays = {}
    for i in files:
        if i.filename.rsplit("/", 1)[0] != d or not i.filename.lower().endswith(".nrrd"):
            continue
        role = i.filename.rsplit("/", 1)[1].lower()
        sha = hashlib.sha256()
        with zf.open(i) as f:
            header, rest = split_header(f)
            raw_head = f"{header}\n\n".encode("latin-1") if header is not None else b""
            sha.update(raw_head)
            body = bytearray(rest)
            sha.update(rest)
            while True:
                chunk = f.read(1 << 22)
                if not chunk:
                    break
                sha.update(chunk)
                body.extend(chunk)
        rec = {"sha256": sha.hexdigest(), "size": i.file_size}
        if header is None:
            rec["note"] = "no header terminator found"
            indep[i.filename] = rec
            continue
        lines = header.split("\n")
        magic[lines[0].strip()] += 1
        fields = {}
        for ln in lines[1:]:
            ln = ln.rstrip("\r")
            if ln.startswith("#"):
                comments["standard teem comment" if ln.strip() in STD_COMMENTS else f"OTHER comment len={len(ln)}"] += 1
            elif ":=" in ln:
                kv_keys[ln.split(":=", 1)[0]] += 1
            elif ": " in ln:
                k, v = ln.split(": ", 1)
                field_keys[k] += 1
                fields[k] = v.strip()
            elif ln.strip():
                field_keys["<unparseable line>"] += 1
        for g in GEOM_FIELDS:
            if g in fields:
                geom[g][fields[g]] += 1
        sizes = [int(s) for s in fields.get("sizes", "").split()]
        rec["sizes"] = sizes
        n = int(np.prod(sizes)) if sizes else -1
        if fields.get("encoding") == "raw" and fields.get("type") in ("uchar", "unsigned char", "uint8", "uint8_t") \
                and "data file" not in fields and "datafile" not in fields:
            arr = np.frombuffer(bytes(body), dtype=np.uint8)
            rec["payload_bytes"], rec["expected"] = int(arr.size), n
            if arr.size >= n > 0:
                arr = arr[:n].reshape(sizes[::-1])          # z, y, x (C order of Fortran-stored data)
                rec["min"], rec["max"] = int(arr.min()), int(arr.max())
                if role in ("laendo.nrrd", "lawall.nrrd"):
                    rec["unique"] = np.unique(arr).tolist()
                    arrays[role] = arr > 0
        else:
            rec["note"] = f"not raw uint8 attached: type={fields.get('type')} encoding={fields.get('encoding')}"
        indep[i.filename] = rec
    if "laendo.nrrd" in arrays and "lawall.nrrd" in arrays:
        e, w = arrays["laendo.nrrd"], arrays["lawall.nrrd"]
        shell = dilate6(e) & ~e
        struct.append({"endo_fraction": float(e.mean()), "wall_fraction": float(w.mean()),
                       "endo_wall_overlap_over_endo": float((e & w).sum() / max(1, e.sum())),
                       "endo_shell_touching_wall": float((shell & w).sum() / max(1, shell.sum())),
                       "endo_gt_wall_voxels": bool(e.sum() > w.sum())})
print("elapsed_seconds", round(time.time() - t0, 1), "| nrrd members read", len(indep), flush=True)
json.dump({"indep": indep, "struct": struct}, open(os.path.join(OUT, "census.json"), "w"), indent=0)

h("Z4 header census over all NRRDs")
print("magic lines", dict(magic))
print("field keys", dict(field_keys))
print("key:=value keys (names only)", dict(kv_keys))
print("comment lines", dict(comments))
for g in GEOM_FIELDS:
    if geom[g]:
        print(f"  {g!r}: {geom[g].most_common(6)}")

h("Z5 independent measurements vs committed manifest (lgemri + laendo)")
sha_ok = sha_bad = sha_missing = shape_ok = shape_bad = 0
for rel, (cid, role, v) in by_rel.items():
    r = indep.get(rel)
    if r is None:
        sha_missing += 1
        continue
    if r["sha256"] == v["sha256"]:
        sha_ok += 1
    else:
        sha_bad += 1
    if r.get("sizes") == v["shape"]:
        shape_ok += 1
    else:
        shape_bad += 1
print("sha256 match", sha_ok, "mismatch", sha_bad, "not found in archive", sha_missing)
print("header sizes == manifest shape", shape_ok, "differ", shape_bad)
print("archive lgemri/laendo not in manifest:",
      [n for n in indep if n.lower().endswith(("lgemri.nrrd", "laendo.nrrd")) and n not in by_rel])
print("payload size == prod(sizes):", dict(C(r.get("payload_bytes") == r.get("expected") for r in indep.values())))
roles = lambda suffix: [r for n, r in indep.items() if n.lower().endswith(suffix)]
print("laendo unique sets", dict(C(json.dumps(r.get("unique")) for r in roles("laendo.nrrd"))))
print("lawall unique sets", dict(C(json.dumps(r.get("unique")) for r in roles("lawall.nrrd"))))
print("lgemri (min,max) top", C((r.get("min"), r.get("max")) for r in roles("lgemri.nrrd")).most_common(5))
mm = {rel: (indep[rel].get("min"), indep[rel].get("max")) for rel in by_rel if rel in indep}
print("value_min/max equal to manifest:",
      sum(1 for rel, (cid, role, v) in by_rel.items() if mm.get(rel) == (v["value_min"], v["value_max"])), "of", len(by_rel))
dupe = C(r["sha256"] for n, r in indep.items() if n.lower().endswith(("lgemri.nrrd", "laendo.nrrd", "lawall.nrrd")))
print("identical-content NRRDs (same sha256 under >1 path):", sum(1 for k in dupe.values() if k > 1))

h("Z6 laendo vs lawall structure (aggregates only; supports/challenges A11, not an owner verdict)")
if struct:
    for key in ("endo_fraction", "wall_fraction", "endo_wall_overlap_over_endo", "endo_shell_touching_wall"):
        vals = np.array([s[key] for s in struct])
        print(f"  {key:30s} n={vals.size} min={vals.min():.4f} median={np.median(vals):.4f} max={vals.max():.4f}")
    print("  cases where laendo has more voxels than lawall:", sum(s["endo_gt_wall_voxels"] for s in struct), "of", len(struct))
