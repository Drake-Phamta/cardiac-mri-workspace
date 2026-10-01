#!/usr/bin/env python3
"""Copy the committable part of an S-1 session into the repository's evidence folder.

THROWAWAY SPIKE CODE. Day 22 (2026-10-01), Claude agent under the leader's recovery
override; Spike B owner Vu Hung Anh confirms on Day 23.

    python spikes/spike_b_3d/harness/s1_export_evidence.py --session <dir> --out spikes/spike_b_3d/EVIDENCE_RAW/<folder>

Run s1_extract.py first. What is copied, and what is not:

  copied   frame_probes.jsonl      every s1_frame_probe exactly as the collector received it
                                   (raw frame intervals and page metadata; no anatomy)
           s1_results.json         the extractor's per-level results
           s1_per_pick.csv         one row per pick: phases, slice indices, errors, flags -
                                   no coordinates
           session_state.json, conditions_before.json, conditions_after.json,
           repository_commit.txt   with the handset serial replaced by <A17_SERIAL>
                                   (public repository)
           hashes.json             SHA-256 of every copied file AND of every raw file left
                                   behind, so the raw bytes can be matched later
  left out the collector JSONL, logcat stream/dump, s1_logcat_payloads.json and
           installed_base.apk: pick records carry world coordinates on the patient's
           anatomy, and the APK carries the meshes.

PROVENANCE.md is written by hand from the template in S1_SESSION_SCRIPT.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

REDACTED = "<A17_SERIAL>"
COPY_REDACTED = ("session_state.json", "conditions_before.json", "conditions_after.json",
                 "repository_commit.txt")
COPY_AS_IS = ("s1_results.json", "s1_per_pick.csv")
KEPT_OUTSIDE = ("s1_collector.jsonl", "logcat_stream.txt", "logcat_dump.txt",
                "s1_logcat_payloads.json", "installed_base.apk")
REPO = Path(__file__).resolve().parents[3]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path, help="evidence folder inside the repository")
    args = ap.parse_args()
    session, out = args.session.resolve(), args.out.resolve()
    state = json.loads((session / "session_state.json").read_text(encoding="utf-8"))
    serial = (state.get("preflight") or {}).get("serial")
    if not serial:
        raise SystemExit("session_state.json has no preflight serial; refusing to guess what to redact")
    if not (session / "s1_results.json").exists():
        raise SystemExit("run s1_extract.py --session first")
    out.mkdir(parents=True, exist_ok=True)

    hashes = {"copied": {}, "redacted_from_original": {}, "kept_outside_git": {}}
    for name in COPY_REDACTED:
        src = session / name
        if not src.exists():
            continue
        text = src.read_text(encoding="utf-8-sig")
        hashes["redacted_from_original"][name] = sha256(src)
        (out / name).write_text(text.replace(serial, REDACTED), encoding="utf-8", newline="\n")
    for name in COPY_AS_IS:
        src = session / name
        text = src.read_text(encoding="utf-8")
        if serial in text:
            text = text.replace(serial, REDACTED)
        (out / name).write_text(text, encoding="utf-8", newline="\n")

    probes = 0
    with (session / "s1_collector.jsonl").open(encoding="utf-8") as fh, \
            (out / "frame_probes.jsonl").open("w", encoding="utf-8", newline="\n") as dst:
        for line in fh:
            if line.strip() and json.loads(line).get("payload", {}).get("kind") == "s1_frame_probe":
                dst.write(line if line.endswith("\n") else line + "\n")
                probes += 1

    for name in KEPT_OUTSIDE:
        p = session / name
        if p.exists():
            hashes["kept_outside_git"][name] = {"sha256": sha256(p), "bytes": p.stat().st_size}
    for p in sorted(out.iterdir()):
        if p.is_file() and p.name != "hashes.json" and p.name != "PROVENANCE.md":
            hashes["copied"][p.name] = {"sha256": sha256(p), "bytes": p.stat().st_size}
            if serial in p.read_text(encoding="utf-8", errors="replace"):
                raise SystemExit(f"{p.name} still contains the serial")
    hashes["serial_redacted_as"] = REDACTED
    hashes["frame_probe_records"] = probes
    (out / "hashes.json").write_text(json.dumps(hashes, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"exported {len(hashes['copied'])} files ({probes} frame probes) to {out}")
    print(f"left outside git: {sorted(hashes['kept_outside_git'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
