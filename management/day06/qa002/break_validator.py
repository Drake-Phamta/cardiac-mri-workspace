#!/usr/bin/env python3
"""QA-D red team: break tools/dataset_validate at a92892c with synthetic packages through --root AND --archive.

All inputs are fabricated here, under the scratchpad. Nothing is deleted. No dataset bytes are used.
Verdicts: OK = validator behaves correctly; DEFECT = passes/accepts bad input or silently drops input;
INFO = by-design behaviour worth recording.
"""
import hashlib, json, os, subprocess, sys, time, zipfile
import numpy as np

SCR = r"C:\Users\Admin\AppData\Local\Temp\claude\d--cardiac-mri-workspace\faa5a3e8-92ac-4536-aa1f-b1f535bd5777\scratchpad"
WT = os.path.join(SCR, "wt-qa-d")
VALIDATE = os.path.join(WT, "tools", "dataset_validate", "validate.py")
RUN = os.path.join(SCR, "qa", "break", time.strftime("run_%Y%m%d_%H%M%S"))
os.makedirs(RUN)
SHAPE = (16, 16, 4)
TMAP = {"uint8": "unsigned char", "int16": "short", "float32": "float"}
NAN = float("nan")


def write_nrrd(path, arr, directions=None, origin=None, extra=()):
    arr = np.asarray(arr)
    nd = arr.ndim
    directions = directions or [[1 if i == j else 0 for j in range(nd)] for i in range(nd)]
    origin = origin or [0] * nd
    vec = lambda v: "(" + ",".join(str(x) for x in v) + ")"
    lines = ["NRRD0004", "# Complete NRRD file format specification at:",
             "# http://teem.sourceforge.net/nrrd/format.html", f"type: {TMAP[str(arr.dtype)]}", f"dimension: {nd}",
             "space: left-posterior-superior" if nd == 3 else f"space dimension: {nd}",
             "sizes: " + " ".join(map(str, arr.shape)), "space directions: " + " ".join(vec(d) for d in directions),
             "kinds: " + " ".join(["domain"] * nd), "endian: little", "encoding: raw", "space origin: " + vec(origin)]
    lines += list(extra)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(("\n".join(lines) + "\n\n").encode("latin-1"))
        f.write(arr.astype(arr.dtype.newbyteorder("<")).tobytes(order="F"))


def mri(seed, shape=SHAPE):
    return ((np.arange(int(np.prod(shape))) * (seed + 3) + seed * 11) % 200).astype(np.uint8).reshape(shape)


def mask(fg=255, extra_val=None, shape=SHAPE, empty=False):
    m = np.zeros(shape, np.uint8)
    if not empty:
        m[4:12, 4:12, 1:3] = fg
    if extra_val is not None:
        m[0, 0, 0] = extra_val
    return m


def put(root, rel, seed, mri_arr=None, mask_arr="default", mri_kw=None, mask_kw=None, files=()):
    d = os.path.join(root, *rel.split("/"))
    write_nrrd(os.path.join(d, "lgemri.nrrd"), mri(seed) if mri_arr is None else mri_arr, **(mri_kw or {}))
    if mask_arr is not None:
        write_nrrd(os.path.join(d, "laendo.nrrd"), mask() if isinstance(mask_arr, str) else mask_arr, **(mask_kw or {}))
    for name, data in files:
        p = os.path.join(d, *name.split("/"))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "wb").write(data)
    return d


def nrrd_bytes(tag, arr, **kw):
    p = os.path.join(RUN, tag, "loose", f"{len(os.listdir(os.path.join(RUN, tag))) if os.path.isdir(os.path.join(RUN, tag)) else 0}_{time.time_ns()}.nrrd")
    write_nrrd(p, arr, **kw)
    return open(p, "rb").read()


def acq(excluded=()):
    return {"source_url": "SYNTHETIC-QA", "documented_source": "SYNTHETIC-QA", "download_started": "SYNTHETIC",
            "download_finished": "SYNTHETIC", "acquired_by": "QA synthetic",
            "package_files": [{"name": "synthetic.zip", "size_bytes": 1, "sha256": "0" * 64}],
            "owner_verdicts": {"confirmed_by": "QA", "a10_mapping": {"background": 0, "foreground": 255},
                               "a11_label_semantics": "synthetic", "a13_split_evidence": "synthetic",
                               "a18_terms": "synthetic", "a17_excluded_files": list(excluded)}}


def zip_dir(root, zpath, extra=()):
    import warnings
    warnings.simplefilter("ignore")
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_STORED) as zf:
        for dp, _dn, fn in os.walk(root):
            for f in sorted(fn):
                p = os.path.join(dp, f)
                zf.write(p, os.path.relpath(p, root).replace(os.sep, "/"))
        for name, data in extra:
            zf.writestr(name, data)


def files_under(root):
    return {os.path.join(dp, f) for dp, _dn, fn in os.walk(root) for f in fn}


def run(tag, mode, target, acquisition):
    base = os.path.join(RUN, tag)
    acq_path = os.path.join(base, "acq.json")
    json.dump(acquisition, open(acq_path, "w", encoding="utf-8"))
    tmp = os.path.join(base, f"tmp_{mode}")
    os.makedirs(tmp, exist_ok=True)
    out = os.path.join(base, f"manifest_{mode}.json")
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8", TEMP=tmp, TMP=tmp, TMPDIR=tmp)
    before = files_under(RUN)
    p = subprocess.run([sys.executable, VALIDATE, f"--{mode}", target, "--acquisition", acq_path,
                        "--write-manifest", "--manifest-out", out],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, timeout=600)
    res = {"rc": p.returncode, "crash": "", "st": {}, "man": None, "text": "", "nan": 0,
           "left": [os.path.relpath(os.path.join(dp, x), tmp) for dp, dn, fn in os.walk(tmp) for x in dn + fn],
           "new": sorted(os.path.relpath(x, RUN) for x in files_under(RUN) - before - {out})}
    if "Traceback" in p.stderr:
        res["crash"] = p.stderr.strip().splitlines()[-1][:170]
    if os.path.exists(out):
        res["text"] = open(out, encoding="utf-8").read()
        res["nan"] = res["text"].count("NaN")
        res["man"] = json.loads(res["text"])
        res["st"] = {r["criterion"]: r["status"] for r in res["man"]["criteria_results"]}
    elif p.stdout.strip():
        res["stdout_tail"] = " | ".join(p.stdout.strip().splitlines()[-2:])
    return res


S = []


def scen(tag, modes=("root", "archive")):
    def deco(fn):
        S.append((tag, modes, fn))
        return fn
    return deco


def pkg(tag):
    r = os.path.join(RUN, tag, "pkg")
    os.makedirs(r)
    return r


def st(res, *ids):
    return {i: res["st"].get(i) for i in ids}


@scen("S00_clean_baseline")
def s00(t):
    r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Testing Set/t1", 2)
    return r, acq(), [], lambda res: ("OK" if res["rc"] == 0 and all(res["st"].get(k) == "PASS" for k in
            ("A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12", "A14", "A15", "A16", "A17", "A20"))
            else "UNEXPECTED", "clean package")


@scen("S01_zero_byte_mri")
def s01(t):
    r = pkg(t); put(r, "Training Set/g1", 1); d = put(r, "Training Set/bad", 2)
    open(os.path.join(d, "lgemri.nrrd"), "wb").close()
    return r, acq(), [], lambda res: ("OK" if not res["crash"] and res["st"].get("A4") == "FAIL" and res["st"].get("A15") == "FAIL"
                                      and res["st"].get("A17") != "PASS" else "DEFECT", str(st(res, "A4", "A15", "A17")))


def truncate(path):
    b = open(path, "rb").read()
    open(path, "wb").write(b[: len(b) // 2])


@scen("S02_truncated_mri")
def s02(t):
    r = pkg(t); put(r, "Training Set/g1", 1); d = put(r, "Training Set/bad", 2); truncate(os.path.join(d, "lgemri.nrrd"))
    return r, acq(), [], lambda res: ("OK" if res["st"].get("A4") == "FAIL" else "DEFECT", str(st(res, "A4", "A15")))


@scen("S03_truncated_mask")
def s03(t):
    r = pkg(t); put(r, "Training Set/g1", 1); d = put(r, "Training Set/bad", 2); truncate(os.path.join(d, "laendo.nrrd"))
    return r, acq(), [], lambda res: ("OK" if res["st"].get("A4") == "FAIL" else "DEFECT", str(st(res, "A4", "A10", "A15")))


@scen("S04_mri_2d")
def s04(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    put(r, "Training Set/bad", 2, mri_arr=mri(2)[:, :, 0], mask_arr=mask()[:, :, 0])
    return r, acq(), [], lambda res: ("OK" if res["st"].get("A4") == "FAIL" else "DEFECT", str(st(res, "A4", "A6", "A14")))


@scen("S05_mask_0_1_vs_mapping_0_255")
def s05(t):
    r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Training Set/bad", 2, mask_arr=mask(fg=1))
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A10") == "PASS" else "OK", str(st(res, "A10")))


@scen("S06_mask_0_254_255")
def s06(t):
    r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Training Set/bad", 2, mask_arr=mask(extra_val=254))
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A10") == "PASS" else "OK", str(st(res, "A10")))


@scen("S07_mask_empty_all_zero")
def s07(t):
    r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Training Set/bad", 2, mask_arr=mask(empty=True))
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A10") == "PASS" and res["st"].get("A15") == "PASS" else "OK",
                                      str(st(res, "A10", "A15")))


@scen("S08_mask_origin_shift")
def s08(t):
    r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Training Set/bad", 2, mask_kw={"origin": [1, 0, 0]})
    return r, acq(), [], lambda res: ("OK" if res["st"].get("A9") == "FAIL" else "DEFECT", str(st(res, "A8", "A9")))


@scen("S09_mask_axis_flip_same_origin")
def s09(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    put(r, "Training Set/bad", 2, mask_kw={"directions": [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]})
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A9") == "PASS" else "OK", str(st(res, "A8", "A9")))


@scen("S10_mask_shape_mismatch_same_origin")
def s10(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    put(r, "Training Set/bad", 2, mask_arr=mask(shape=(16, 16, 5)))
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A9") == "PASS" else "OK", str(st(res, "A8", "A9")))


@scen("S11_mask_spacing_mismatch_same_origin")
def s11(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    put(r, "Training Set/bad", 2, mask_kw={"directions": [[2, 0, 0], [0, 1, 0], [0, 0, 1]]})
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A9") == "PASS" else "OK", str(st(res, "A8", "A9")))


@scen("S12_oblique_direction")
def s12(t):
    r = pkg(t); put(r, "Training Set/g1", 1); ob = {"directions": [[1, 0.1, 0], [0, 1, 0], [0, 0, 1]]}
    put(r, "Training Set/bad", 2, mri_kw=ob, mask_kw=ob)
    return r, acq(), [], lambda res: ("OK" if res["st"].get("A14") == "FAIL" else "DEFECT", str(st(res, "A14")))


@scen("S13_nan_direction_row")
def s13(t):
    r = pkg(t); put(r, "Training Set/g1", 1); nd = {"directions": [[1, 0, 0], [0, 1, 0], [NAN, NAN, NAN]]}
    put(r, "Training Set/bad", 2, mri_kw=nd, mask_kw=nd)
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A14") == "PASS" or res["nan"] else "OK",
                                      f"{st(res, 'A4', 'A7', 'A14')} NaN tokens in manifest JSON={res['nan']} crash={res['crash']!r}")


@scen("S14_degenerate_zero_direction")
def s14(t):
    r = pkg(t); put(r, "Training Set/g1", 1); zd = {"directions": [[0, 0, 0], [0, 1, 0], [0, 0, 1]]}
    put(r, "Training Set/bad", 2, mri_kw=zd, mask_kw=zd)
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A14") == "PASS" and res["st"].get("A7") == "PASS" else "OK",
                                      str(st(res, "A7", "A14")))


def ident(tag, line):
    def build(t):
        r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Training Set/bad", 2, mri_kw={"extra": [line]})
        want_fail = tag == "S15"
        return r, acq(), [], lambda res: (("OK" if res["st"].get("A17") == "FAIL" else "DEFECT") if want_fail else
                                          ("DEFECT" if res["st"].get("A17") == "PASS" else "OK"), str(st(res, "A17")))
    return build


scen("S15_header_key_PatientName")(ident("S15", "PatientName:=DOE^JOHN"))
scen("S16_header_key_DICOM_0010_0010")(ident("S16", "DICOM_0010_0010:=DOE^JOHN"))
scen("S17_identifier_in_comment")(ident("S17", "# Patient: DOE^JOHN born 1970-01-01"))
scen("S18_identifier_in_content_field")(ident("S18", "content: DOE^JOHN 1970-01-01"))


@scen("S19_testing_case_without_mask")
def s19(t):
    r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Testing Set/t1", 2, mask_arr=None)
    return r, acq(), [], lambda res: ("INFO", str(st(res, "A3", "A8", "A9", "A12")))


@scen("S20_orphan_mask_without_mri")
def s20(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    write_nrrd(os.path.join(r, "Training Set", "orphan", "laendo.nrrd"), mask())
    return r, acq(), [], lambda res: ("DEFECT" if "orphan" not in res["text"] and res["st"].get("A15") == "PASS" else "OK",
                                      f"{st(res, 'A2', 'A3', 'A15')} orphan mentioned in manifest: {'orphan' in res['text']}")


@scen("S21_nested_case_folder")
def s21(t):
    r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Training Set/outer", 2); put(r, "Training Set/outer/inner", 3)
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A2") == "PASS" and "outer" in (res["man"] or {}).get("partitions", {})
                                      else "OK", f"{st(res, 'A2', 'A16')} partitions={list((res['man'] or {}).get('partitions', {}))}")


@scen("S22_same_folder_id_in_both_partitions")
def s22(t):
    r = pkg(t); put(r, "Training Set/SAMEID", 1); put(r, "Testing Set/SAMEID", 2)
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A16") == "PASS" else "OK", str(st(res, "A16")))


@scen("S23_identical_mask_bytes_two_cases")
def s23(t):
    r = pkg(t); put(r, "Training Set/c1", 5); put(r, "Training Set/c2", 6)
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A15") == "PASS" and res["st"].get("A16") == "PASS" else "OK",
                                      f"{st(res, 'A15', 'A16')} (masks byte-identical, MRIs differ - mirrors CASE_0056/CASE_0097)")


@scen("S24_identical_mri_bytes_across_partitions")
def s24(t):
    r = pkg(t); put(r, "Training Set/c1", 7); put(r, "Testing Set/c9", 7)
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A15") == "PASS" and res["st"].get("A16") == "PASS" else "OK",
                                      str(st(res, "A15", "A16")))


@scen("S25_excluded_sidecar_plus_unreadable_companion")
def s25(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    d = put(r, "Training Set/c2", 2, files=[("desktop.ini", b"[.ShellClassInfo]\r\nIconResource=x\r\n")])
    open(os.path.join(d, "lawall.nrrd"), "wb").close()
    return r, acq(excluded=["CASE_0001/desktop.ini"]), [], lambda res: (
        "DEFECT" if res["st"].get("A17") == "PASS" else "OK", f"{st(res, 'A4', 'A15', 'A17')} (lawall header never opened)")


@scen("S26_sidecar_in_case_subdirectory")
def s26(t):
    r = pkg(t); put(r, "Training Set/g1", 1, files=[("extra/patient_info.txt", b"Name: DOE^JOHN\n")])
    return r, acq(), [], lambda res: ("DEFECT" if res["st"].get("A17") == "PASS" and "patient_info" not in res["text"] else "OK",
                                      f"{st(res, 'A17')} mentioned: {'patient_info' in res['text']}")


@scen("S27_file_outside_case_directories")
def s27(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    open(os.path.join(r, "Training Set", "notes_outside.txt"), "wb").write(b"DOE^JOHN\n")
    return r, acq(), [], lambda res: ("DEFECT" if "notes_outside" not in res["text"] else "OK",
                                      f"{st(res, 'A15', 'A17')} mentioned: {'notes_outside' in res['text']}")


@scen("S28_zip_traversal_and_absolute_entries", modes=("archive",))
def s28(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    extra = [("../evil/lgemri.nrrd", nrrd_bytes(t, mri(3))), ("../evil/laendo.nrrd", nrrd_bytes(t, mask())),
             ("/abs/lgemri.nrrd", nrrd_bytes(t, mri(4))), ("/abs/laendo.nrrd", nrrd_bytes(t, mask()))]
    return r, acq(), extra, lambda res: (
        "ZIPSLIP" if any("evil" in x or "abs" in x for x in res["new"]) else
        ("DEFECT" if res["rc"] in (0, 1) and any(p in ("..", "") for p in (res["man"] or {}).get("partitions", {})) else "OK"),
        f"rc={res['rc']} partitions={list((res['man'] or {}).get('partitions', {}))} "
        f"case dirs={[c['source_dir_relative'] for c in (res['man'] or {}).get('cases', [])]} new files={res['new']}")


def dup_judge(res):
    g1 = [c for c in (res["man"] or {}).get("cases", []) if c["source_dir_relative"] == "Training Set/g1"]
    uv = g1[0]["mask"]["unique_values"]["values"] if g1 and g1[0].get("mask") else None
    mentioned = "duplicate" in res["text"].lower() or "LAENDO" in res["text"]
    return ("DEFECT" if not mentioned else "OK", f"rc={res['rc']} scanned mask values={uv} duplicate reported={mentioned} {st(res, 'A10', 'A15')}")


@scen("S29_zip_duplicate_member_name", modes=("archive",))
def s29(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    return r, acq(), [("Training Set/g1/laendo.nrrd", nrrd_bytes(t, mask(fg=1, extra_val=2)))], dup_judge


@scen("S30_zip_case_variant_member_name", modes=("archive",))
def s30(t):
    r = pkg(t); put(r, "Training Set/g1", 1)
    return r, acq(), [("Training Set/g1/LAENDO.nrrd", nrrd_bytes(t, mask(fg=1, extra_val=2)))], dup_judge


@scen("S33_float32_mask_values_0_255")
def s33(t):
    r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Training Set/f", 2, mask_arr=mask().astype(np.float32))
    return r, acq(), [], lambda res: ("INFO", str(st(res, "A5", "A10")))


@scen("S34_float32_mri_with_nan")
def s34(t):
    r = pkg(t); put(r, "Training Set/g1", 1); a = mri(2).astype(np.float32); a[0, 0, 0] = NAN
    put(r, "Training Set/n", 2, mri_arr=a)
    return r, acq(), [], lambda res: ("OK" if res["st"].get("A15") == "FAIL" else "DEFECT", str(st(res, "A15")))


results = []
for tag, modes, fn in S:
    root, acquisition, extra, judge = fn(tag)
    zpath = os.path.join(RUN, tag, "pkg.zip")
    zip_dir(root, zpath, extra)
    per_mode = {}
    for mode in modes:
        res = run(tag, mode, root if mode == "root" else zpath, acquisition)
        verdict, note = judge(res)
        if mode == "archive" and res["st"].get("A1") == "PASS":
            actual = hashlib.sha256(open(zpath, "rb").read()).hexdigest()
            a1 = f"A1=PASS with recorded sha256 000...0 != scanned archive {actual[:12]}"
        else:
            a1 = ""
        per_mode[mode] = res
        results.append({"tag": tag, "mode": mode, "rc": res["rc"], "verdict": verdict, "note": note, "crash": res["crash"],
                        "temp_leftovers": res["left"], "new_files": res["new"], "a1": a1,
                        "stdout_tail": res.get("stdout_tail", "")})
        print(f"{tag:46s} {mode:7s} rc={res['rc']} {verdict:8s} {note}"
              + (f" | CRASH {res['crash']}" if res["crash"] else "") + (f" | LEFTOVER {res['left']}" if res["left"] else "")
              + (f" | {res['stdout_tail']}" if res.get("stdout_tail") else ""), flush=True)
    if len(per_mode) == 2:
        a, b = per_mode["root"]["st"], per_mode["archive"]["st"]
        if a != b:
            print(f"{'':46s} PARITY root!=archive: {[(k, a.get(k), b.get(k)) for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]}")

print("\nA1 in archive mode:", sorted({r["a1"] for r in results if r["a1"]})[:1])

print("\n--- S31 corrupted ZIP member (bad CRC), archive mode ---")
t = "S31_zip_bad_crc"
r = pkg(t); put(r, "Training Set/g1", 1); put(r, "Training Set/g2", 2)
zpath = os.path.join(RUN, t, "pkg.zip"); zip_dir(r, zpath)
with zipfile.ZipFile(zpath) as zf:
    info = zf.getinfo("Training Set/g2/laendo.nrrd")
with open(zpath, "r+b") as f:
    f.seek(info.header_offset + 26); n, e = np.frombuffer(f.read(4), dtype="<u2")
    pos = info.header_offset + 30 + int(n) + int(e) + info.file_size - 1
    f.seek(pos); b = f.read(1); f.seek(pos); f.write(bytes([b[0] ^ 0xFF]))
res = run(t, "archive", zpath, acq())
print(f"rc={res['rc']} manifest_written={res['man'] is not None} crash={res['crash']!r} temp_leftovers={res['left']} "
      f"stdout_tail={res.get('stdout_tail', '')!r}")

print("\n--- selftest ---")
tmp = os.path.join(RUN, "selftest_tmp"); os.makedirs(tmp)
p = subprocess.run([sys.executable, VALIDATE, "--selftest"], capture_output=True, text=True, encoding="utf-8", errors="replace",
                   env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8", TEMP=tmp, TMP=tmp, TMPDIR=tmp))
print("rc", p.returncode, "| last lines:", " / ".join(p.stdout.strip().splitlines()[-6:]), "| temp leftovers:", os.listdir(tmp))

print("\n--- T1 schema permissiveness and A20 on a hand-typed manifest ---")
import jsonschema
schema = json.load(open(os.path.join(WT, "tools", "dataset_validate", "schema", "dataset_manifest.schema.json"), encoding="utf-8"))
base = json.load(open(os.path.join(RUN, "S00_clean_baseline", "manifest_root.json"), encoding="utf-8"))
bad = json.loads(json.dumps(base))
bad["case_count_total"] = 999
bad["partitions"]["Training Set"]["case_count"] = 5000
bad["cases"][0]["mri"]["axis_aligned"] = "maybe"
bad["cases"][0]["mri"]["dtype"] = 42
bad["cases"][0]["mask"]["unique_values"] = "banana"
bad["cases"][0]["files_present"] = {}
bad["criteria_results"][0]["detail"] = "hand-edited"
bad["summary"] = {"pass": 20, "fail": 0}
print("schema errors on a self-contradictory manifest:", len(list(jsonschema.Draft202012Validator(schema).iter_errors(bad))))
sys.path.insert(0, os.path.join(WT, "tools", "dataset_validate"))
sys.dont_write_bytecode = True
import checks  # noqa: E402
typed = {"manifest_version": "typed by hand", "acquisition": {}, "partitions": {"X": {"case_count": 1, "cases_with_mask": 0}},
         "shape_distribution": {"in_plane_dimensions_vary": False},
         "cases": [{"case_id": "CASE_0001", "source_dir_relative": "X/1", "files_present": {"lgemri.nrrd": True, "laendo.nrrd": False},
                    "mri": {"read_ok": True, "dtype": "uint8", "is_3d": True, "spacing": [1, 1, 1], "space_origin": [0, 0, 0],
                            "space_directions": [[1, 0, 0], [0, 1, 0], [0, 0, 1]], "axis_aligned": True,
                            "header_identifier_findings": []}, "mask": None, "companion_volumes": {}, "non_nrrd_sidecars": []}]}
print("checks on a hand-typed dict:", {r.cid: r.status for r in checks.run_checks(typed)})

json.dump(results, open(os.path.join(RUN, "results.json"), "w", encoding="utf-8"), indent=1)
print("\nrun directory:", RUN)
print("summary:", {v: sum(1 for x in results if x["verdict"] == v) for v in sorted({x["verdict"] for x in results})})
