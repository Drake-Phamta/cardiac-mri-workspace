#!/usr/bin/env python3
"""QA-D leakage probe: near-duplicate scans across the whole cohort, same-shape pairs only.

Thumbnails (stride z4, y8, x8) of every lgemri (z-scored) and laendo, from the byte-identical archive copy.
Voxelwise correlation and mask Dice flag the SAME acquisition exported twice. They cannot detect the same
patient scanned in a different session (anatomy moves) - that limitation is stated, not hidden.
"""
import json, os, time, zipfile
import numpy as np

SCR = r"C:\Users\Admin\AppData\Local\Temp\claude\d--cardiac-mri-workspace\faa5a3e8-92ac-4536-aa1f-b1f535bd5777\scratchpad"
MAN = os.path.join(SCR, "wt-qa-d", "data", "manifests", "dataset_manifest.json")
zf = zipfile.ZipFile(r"C:\cardiac-data\lasc2018\2018_UTAH_MICCAI.zip")
man = json.load(open(MAN, encoding="utf-8"))


def load(rel):
    data = zf.read(rel)
    k = data.find(b"\n\n")
    sizes = [int(s) for ln in data[:k].decode("latin-1").split("\n") if ln.startswith("sizes: ")
             for s in ln.split(": ", 1)[1].split()]
    return np.frombuffer(data[k + 2:], np.uint8)[:int(np.prod(sizes))].reshape(sizes[::-1])


t0 = time.time()
groups = {}
for c in man["cases"]:
    rel = c["source_dir_relative"]
    m = load(rel + "/lgemri.nrrd")[::4, ::8, ::8].astype(np.float32).ravel()
    e = (load(rel + "/laendo.nrrd")[::4, ::8, ::8] > 0).astype(np.float32).ravel()
    m = (m - m.mean()) / (m.std() + 1e-6)
    groups.setdefault(tuple(c["mri"]["shape"]), []).append((c["case_id"], c["partition_as_released"], m, e))
print("loaded in", round(time.time() - t0, 1), "s")

for shape, items in groups.items():
    ids = [i[0] for i in items]
    part = [i[1] for i in items]
    X = np.stack([i[2] for i in items])
    B = np.stack([i[3] for i in items])
    corr = (X @ X.T) / X.shape[1]
    inter = B @ B.T
    s = B.sum(1)
    dice = 2 * inter / (s[:, None] + s[None, :] + 1e-6)
    iu = np.triu_indices(len(ids), 1)
    r, d = corr[iu], dice[iu]
    cross = np.array([part[a] != part[b] for a, b in zip(*iu)])
    print(f"\nshape {list(shape)}: {len(ids)} cases, {r.size} pairs ({cross.sum()} Training-Testing)")
    print("  MRI r percentiles 50/90/99/max:", [round(float(np.percentile(r, q)), 4) for q in (50, 90, 99)], round(float(r.max()), 4))
    print("  mask Dice percentiles 50/90/99/max:", [round(float(np.percentile(d, q)), 4) for q in (50, 90, 99)], round(float(d.max()), 4))
    order = np.argsort(-r)[:6]
    for k in order:
        a, b = iu[0][k], iu[1][k]
        print(f"  top r: {ids[a]} ({part[a]}) ~ {ids[b]} ({part[b]}) r={r[k]:.4f} dice={d[k]:.4f}")
    order = np.argsort(-d)[:4]
    for k in order:
        a, b = iu[0][k], iu[1][k]
        print(f"  top dice: {ids[a]} ({part[a]}) ~ {ids[b]} ({part[b]}) r={r[k]:.4f} dice={d[k]:.4f}")
    flagged = [(ids[a], part[a], ids[b], part[b], round(float(r[k]), 4), round(float(d[k]), 4))
               for k, (a, b) in enumerate(zip(*iu)) if r[k] > 0.95 or d[k] > 0.9]
    print("  pairs with r>0.95 or dice>0.9:", flagged)
