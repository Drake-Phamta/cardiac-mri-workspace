#!/usr/bin/env python3
"""QA-D misc: (1) root-level .py files in the archive - licence/terms text and path/identity strings;
(2) how the manifest's acquisition/owner-verdict block and A17 changed across PR #25 revisions."""
import json, re, subprocess, zipfile

SCR = r"C:\Users\Admin\AppData\Local\Temp\claude\d--cardiac-mri-workspace\faa5a3e8-92ac-4536-aa1f-b1f535bd5777\scratchpad"
WT = SCR + r"\wt-qa-d"

print("=== P1 root-level .py files ===")
zf = zipfile.ZipFile(r"C:\cardiac-data\lasc2018\2018_UTAH_MICCAI.zip")
for n in ("preprocess_data.py", "Unet.py"):
    t = zf.read(n).decode("utf-8", "replace")
    lines = t.splitlines()
    terms = [(i + 1, l.strip()[:120]) for i, l in enumerate(lines) if re.search(r"licen|copyright|terms of|permission|citation|\bcite\b", l, re.I)]
    people = [i + 1 for i, l in enumerate(lines) if re.search(r"author|@[\w-]+\.|e-?mail", l, re.I)]
    paths = sorted(set(re.sub(r"(?i)(users|home)[\\/][^\\/\s'\"]+", r"\1/<user>", p)
                       for p in re.findall(r"[A-Za-z]:[\\/][^\s'\"]{0,60}|/home/[^\s'\"]{0,40}|/Users/[^\s'\"]{0,40}", t)))
    print(n, len(lines), "lines | licence/terms lines:", terms[:8], "| author/email line numbers:", people[:8],
          "| path strings (user masked):", paths[:6])

print("\n=== P2 manifest revisions on PR #25 ===")


def show(rev):
    out = subprocess.run(["git", "-C", WT, "show", f"{rev}:data/manifests/dataset_manifest.json"], capture_output=True)
    return json.loads(out.stdout.decode("utf-8")) if out.returncode == 0 else None


revs = {"e390991": show("e390991"), "f49be7b": show("f49be7b"), "a92892c": show("a92892c")}
for rev, m in revs.items():
    if m is None:
        print(rev, "no manifest")
        continue
    ov = m["acquisition"].get("owner_verdicts", {})
    a17 = [r for r in m["criteria_results"] if r["criterion"] == "A17"][0]
    print(rev, "generated_at", m["generated_at"], "| confirmed_at", ov.get("confirmed_at"), "| owner keys", sorted(ov),
          "| A17", a17["status"], "|", a17["detail"][:110], "| summary", {k: m["summary"][k] for k in ("pass", "fail", "not_run")})
a, b = revs["e390991"], revs["f49be7b"]
changed = [k for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]
print("top-level keys that differ e390991 -> f49be7b:", changed)
aa, bb = a["acquisition"], b["acquisition"]
print("acquisition keys that differ:", [k for k in sorted(set(aa) | set(bb)) if aa.get(k) != bb.get(k)])
oa, ob = aa.get("owner_verdicts", {}), bb.get("owner_verdicts", {})
print("owner_verdict fields that differ:", {k: (str(oa.get(k))[:70], str(ob.get(k))[:70]) for k in sorted(set(oa) | set(ob)) if oa.get(k) != ob.get(k)})
print("cases identical between revisions:", a["cases"] == b["cases"])
