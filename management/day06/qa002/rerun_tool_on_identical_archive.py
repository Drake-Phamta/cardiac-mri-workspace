#!/usr/bin/env python3
"""QA-D: re-run the COMMITTED scanner (a92892c) with --archive semantics on the byte-identical
archive copy at C:\\cardiac-data (SHA-256 bee5ee5b... verified separately), write the result to the
scratchpad only, and deep-compare it with the committed manifest.

Proves or disproves: the committed manifest is exactly what the committed code produces from these
bytes (no hand edits, deterministic). It does NOT prove the code is right - see the independent census.
"""
import json, os, sys, tempfile, time

sys.dont_write_bytecode = True
SCR = r"C:\Users\Admin\AppData\Local\Temp\claude\d--cardiac-mri-workspace\faa5a3e8-92ac-4536-aa1f-b1f535bd5777\scratchpad"
WT = os.path.join(SCR, "wt-qa-d")
MAN = os.path.join(WT, "data", "manifests", "dataset_manifest.json")
ARCHIVE = r"C:\cardiac-data\lasc2018\2018_UTAH_MICCAI.zip"
OUT = os.path.join(SCR, "qa", "rerun")
TMP = os.path.join(OUT, "tmp")
os.makedirs(TMP, exist_ok=True)
tempfile.tempdir = TMP          # the scanner's TemporaryDirectory lands here, so cleanup is observable

sys.path.insert(0, os.path.join(WT, "tools", "dataset_validate"))
import checks, dataset_scan  # noqa: E402

committed = json.load(open(MAN, encoding="utf-8"))
t0 = time.time()
man = dataset_scan.scan_archive(ARCHIVE, want_checksums=True, acquisition=committed["acquisition"])
elapsed = time.time() - t0
results = checks.run_checks(man)
summary = checks.summarise(results, committed["acquisition"].get("owner_verdicts") or {})
payload = dict(man)
payload["criteria_results"] = [r.as_dict() for r in results]
payload["summary"] = summary
with open(os.path.join(OUT, "rerun_manifest.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(payload, f, indent=1, ensure_ascii=False)
    f.write("\n")
print("elapsed_seconds", round(elapsed, 1))
print("temp dir leftovers after scan:", os.listdir(TMP))

diffs = []


def num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def cmp(a, b, path):
    if len(diffs) > 300:
        return
    if type(a) is not type(b) and not (num(a) and num(b)):
        diffs.append((path, repr(a)[:90], repr(b)[:90]))
        return
    if isinstance(a, dict):
        if list(a.keys()) != list(b.keys()):
            diffs.append((path + " <key order/set>", list(a.keys())[:8], list(b.keys())[:8]))
        for k in a:
            if k in b:
                cmp(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        if len(a) != len(b):
            diffs.append((path, f"len {len(a)}", f"len {len(b)}"))
            return
        for i, (x, y) in enumerate(zip(a, b)):
            cmp(x, y, f"{path}[{i}]")
    elif a != b:
        diffs.append((path, repr(a)[:90], repr(b)[:90]))


for key in ("generated_at", "package_root"):
    print(key, "| committed:", committed.get(key), "| rerun:", payload.get(key))
c2 = {k: v for k, v in committed.items() if k not in ("generated_at", "package_root")}
p2 = {k: v for k, v in payload.items() if k not in ("generated_at", "package_root")}
cmp(c2, p2, "$")
print("differences excluding generated_at/package_root:", len(diffs))
for d in diffs[:80]:
    print("  ", d)
