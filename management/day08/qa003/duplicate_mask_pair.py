#!/usr/bin/env python3
"""QA-D diagnostic: required volumes whose SHA-256 appears under more than one case in the committed
manifest. Reads the byte-identical archive copy; pynrrd-independent. Prints diagnostics only.

Question: are the cases the same scan (duplicate -> leakage) or different scans sharing one label file
(misassigned label -> wrong ground truth)? And which case does the shared laendo fit, judged against each
case's own lawall.nrrd? Calibrated against own-pair and cross-pair fits on other cases.
"""
import collections, hashlib, json, os, time, zipfile
import numpy as np

SCR = r"C:\Users\Admin\AppData\Local\Temp\claude\d--cardiac-mri-workspace\faa5a3e8-92ac-4536-aa1f-b1f535bd5777\scratchpad"
MAN = os.path.join(r"C:\Users\Admin\AppData\Local\Temp\claude\d--cardiac-mri-workspace\faa5a3e8-92ac-4536-aa1f-b1f535bd5777\scratchpad\wt-qa-d34b", "data", "manifests", "dataset_manifest.json")
ARCHIVE = r"C:\cardiac-data\lasc2018\2018_UTAH_MICCAI.zip"
man = json.load(open(MAN, encoding="utf-8"))
cases = {c["case_id"]: c for c in man["cases"]}
zf = zipfile.ZipFile(ARCHIVE)


def load(rel):
    data = zf.read(rel)
    sha = hashlib.sha256(data).hexdigest()
    k = data.find(b"\n\n")
    fields = {}
    for ln in data[:k].decode("latin-1").split("\n")[1:]:
        if ln.startswith("#") or ":=" in ln or ": " not in ln:
            continue
        a, b = ln.split(": ", 1)
        fields[a] = b.strip()
    sizes = [int(s) for s in fields["sizes"].split()]
    return np.frombuffer(data[k + 2:], dtype=np.uint8)[:int(np.prod(sizes))].reshape(sizes[::-1]), sha


def dilate6(a):
    d = a.copy()
    d[1:] |= a[:-1]; d[:-1] |= a[1:]
    d[:, 1:] |= a[:, :-1]; d[:, :-1] |= a[:, 1:]
    d[:, :, 1:] |= a[:, :, :-1]; d[:, :, :-1] |= a[:, :, 1:]
    return d


def fit(endo, wall):
    shell = dilate6(endo) & ~endo
    return float((shell & wall).sum() / max(1, shell.sum())), float((endo & wall).sum() / max(1, endo.sum()))


def pearson(a, b):
    x = a.astype(np.float64).ravel(); y = b.astype(np.float64).ravel()
    x -= x.mean(); y -= y.mean()
    return float(np.dot(x, y) / np.sqrt(np.dot(x, x) * np.dot(y, y)))


# QA-003, 2026-09-17: the public manifest no longer carries per-file sha256 - the
# F5 narrowing moved that table to the restricted manifest - so the original
# grouping raised KeyError: 'sha256'. Recompute from the archive instead. This is
# not a workaround: F1 always rested on the bytes, and the manifest's hashes were a
# cached copy of them. Rehashing removes the cache from the chain of evidence.
FILE_OF = {"mri": "lgemri.nrrd", "mask": "laendo.nrrd"}
_t0 = time.time()
groups = collections.defaultdict(list)
missing = []
for i, c in enumerate(man["cases"]):
    rel = c["source_dir_relative"]
    for role, fname in FILE_OF.items():
        member = rel + "/" + fname
        try:
            digest = hashlib.sha256(zf.read(member)).hexdigest()
        except KeyError:
            missing.append(member)
            continue
        groups[digest].append((c["case_id"], role))
print(f"rehashed {sum(len(v) for v in groups.values())} required volumes from the archive "
      f"in {time.time() - _t0:.1f}s (manifest carries none since F5); missing members: {missing}")
shared = [g for g in groups.values() if len(g) > 1]
print("groups of identical required volumes across cases:", shared)

for g in shared:
    ids = sorted({cid for cid, _ in g})
    vol = {}
    for cid in ids:
        rel = cases[cid]["source_dir_relative"]
        mri, s1 = load(rel + "/lgemri.nrrd")
        endo, s2 = load(rel + "/laendo.nrrd")
        wall, s3 = load(rel + "/lawall.nrrd")
        vol[cid] = {"mri": mri, "endo": endo > 0, "wall": wall > 0, "s": (s1, s2, s3)}
        print(f"{cid} {rel.split('/')[0]} shape(z,y,x)={mri.shape} sha lgemri={s1[:12]} laendo={s2[:12]} lawall={s3[:12]}"
              f" | vs manifest: NOT AVAILABLE - the public manifest carries no per-file sha256 since F5"
              f" (restricted manifest sha256 {man.get('restricted_manifest', {}).get('sha256', '?')[:12]})")
    a, b = ids[0], ids[1]
    print(f"laendo identical: {vol[a]['s'][1] == vol[b]['s'][1]} | lawall identical: {vol[a]['s'][2] == vol[b]['s'][2]}"
          f" | lgemri identical: {vol[a]['s'][0] == vol[b]['s'][0]}")
    if vol[a]["mri"].shape == vol[b]["mri"].shape:
        print(f"MRI {a} vs {b}: identical-voxel fraction {(vol[a]['mri'] == vol[b]['mri']).mean():.4f}, "
              f"Pearson r {pearson(vol[a]['mri'], vol[b]['mri']):.4f}")
        wa, wb = vol[a]["wall"], vol[b]["wall"]
        print(f"lawall {a} vs {b}: voxel IoU {float((wa & wb).sum() / max(1, (wa | wb).sum())):.4f}")
    for e_id in ids:
        for w_id in ids:
            s, o = fit(vol[e_id]["endo"], vol[w_id]["wall"])
            print(f"  laendo[{e_id}] vs lawall[{w_id}]: laendo boundary touching wall {s:.4f}, laendo overlapping wall {o:.4f}")
    for cid in ids:
        m, e = vol[cid]["mri"], vol[cid]["endo"]
        ring = dilate6(dilate6(dilate6(e))) & ~e
        print(f"  MRI[{cid}] mean inside shared laendo {m[e].mean():.1f} | 3-voxel ring outside {m[ring].mean():.1f} | volume mean {m.mean():.1f}")

print("\ncalibration: own-pair vs cross-pair laendo/lawall fit on other Training cases of the same shape")
dups = {cid for g in shared for cid, _ in g}
for shape in ([640, 640, 88], [576, 576, 88]):
    pick = [c["case_id"] for c in man["cases"] if c["partition_as_released"] == "Training Set"
            and c["mri"]["shape"] == shape and c["case_id"] not in dups][:4]
    loaded = {}
    for cid in pick:
        rel = cases[cid]["source_dir_relative"]
        loaded[cid] = (load(rel + "/laendo.nrrd")[0] > 0, load(rel + "/lawall.nrrd")[0] > 0)
    for i, cid in enumerate(pick):
        own = fit(loaded[cid][0], loaded[cid][1])
        other = pick[(i + 1) % len(pick)]
        cross = fit(loaded[cid][0], loaded[other][1])
        print(f"  shape {shape}: own {cid} boundary-touching-wall {own[0]:.4f} | cross laendo[{cid}] vs lawall[{other}] {cross[0]:.4f}")
