#!/usr/bin/env python3
"""QA-D: re-judge break scenarios whose first judge matched the scenario tag inside package_root."""
import json, os, zipfile

SCR = r"C:\Users\Admin\AppData\Local\Temp\claude\d--cardiac-mri-workspace\faa5a3e8-92ac-4536-aa1f-b1f535bd5777\scratchpad"
RUN = os.path.join(SCR, "qa", "break", "run_20260915_114259")


def load(tag, mode):
    return json.load(open(os.path.join(RUN, tag, f"manifest_{mode}.json"), encoding="utf-8"))


def without_root(m):
    m = dict(m)
    m.pop("package_root", None)
    return json.dumps(m, ensure_ascii=False)


for mode in ("root", "archive"):
    m = load("S20_orphan_mask_without_mri", mode)
    print("S20", mode, "| 'orphan' outside package_root:", "orphan" in without_root(m),
          "| cases:", [c["source_dir_relative"] for c in m["cases"]],
          "| A15:", [r["status"] for r in m["criteria_results"] if r["criterion"] == "A15"])

for tag in ("S29_zip_duplicate_member_name", "S30_zip_case_variant_member_name"):
    m = load(tag, "archive")
    g1 = [c for c in m["cases"] if c["source_dir_relative"] == "Training Set/g1"][0]
    z = zipfile.ZipFile(os.path.join(RUN, tag, "pkg.zip"))
    print(tag, "| zip members under g1:", [(i.filename, i.file_size) for i in z.infolist() if i.filename.startswith("Training Set/g1/")])
    print("   scanned mask:", g1["mask"]["path_relative"], g1["mask"]["unique_values"], "| other_files:", g1["other_files_in_case_dir"],
          "| 'duplicate' outside package_root:", "duplicate" in without_root(m).lower(),
          "| non-owner statuses:", {r["criterion"]: r["status"] for r in m["criteria_results"] if r["status"] not in ("OWNER_VERDICT_REQUIRED",)})

raw = open(os.path.join(RUN, "S13_nan_direction_row", "manifest_root.json"), encoding="utf-8").read()


def reject(c):
    raise ValueError("non-standard constant " + c)


try:
    json.loads(raw, parse_constant=reject)
    print("S13 strict JSON parse: accepted")
except ValueError as exc:
    print("S13 strict JSON parse: REJECTED -", exc)
m = json.loads(raw)
bad = [c for c in m["cases"] if c["source_dir_relative"] == "Training Set/bad"][0]
print("S13 bad mri spacing", bad["mri"]["spacing"], "| axis_aligned", bad["mri"]["axis_aligned"], "|", bad["mri"]["axis_aligned_basis"],
      "| resampling_required", bad["mri_mask_compatibility"]["resampling_required"], bad["mri_mask_compatibility"].get("basis"))

m = load("S25_excluded_sidecar_plus_unreadable_companion", "root")
c2 = [c for c in m["cases"] if c["source_dir_relative"] == "Training Set/c2"][0]
print("S25 c2 case_id", c2["case_id"], "| lawall read_ok:", c2["companion_volumes"]["lawall.nrrd"]["read_ok"],
      "| header findings field:", c2["companion_volumes"]["lawall.nrrd"]["header_identifier_findings"],
      "| A17:", [r["detail"][:150] for r in m["criteria_results"] if r["criterion"] == "A17"])

M = json.load(open(os.path.join(SCR, "wt-qa-d", "data", "manifests", "dataset_manifest.json"), encoding="utf-8"))
for cid in ("CASE_0056", "CASE_0097"):
    c = [x for x in M["cases"] if x["case_id"] == cid][0]
    print(cid, c["source_dir_relative"], "| shape", c["mri"]["shape"], "| mri size", c["mri"]["size_bytes"], "| mri sha", c["mri"]["sha256"][:16],
          "| mask sha", c["mask"]["sha256"][:16], "| mri value_max", c["mri"]["value_max"], "| other files", c["other_files_in_case_dir"])
