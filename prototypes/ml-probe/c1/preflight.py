#!/usr/bin/env python3
"""Spike C1 preflight -- fail-closed gate, subset and data-root checks.

Implements section 1 of management/spikes/SPIKE_C_ML/C1_MEASUREMENT_PLAN.md.

It does NOT read voxels and it never opens a dataset file. It lists directories and
uses ``os.lstat`` / ``os.stat``, ``os.path.samefile`` and path resolution; ``make-root``
also calls ``os.link`` or creates directory links. Its whole purpose is to prove, before
a single byte of image data is loaded, that the run cannot reach validation or holdout
cases.

Two subcommands
---------------
``make-root``  build an allowlisted TRAINING-ONLY root for the effective 100% subset.
               ``--layout hardlink`` (default): one real directory per case,
                   ``<root>/<CASE_ID>/<basename(mri)>`` and ``<root>/<CASE_ID>/<basename(mask)>``,
                   each an ``os.link`` to the package file. Nothing else; companion
                   volumes are not linked. Needs the root on the package's volume.
               ``--layout junction`` (the Day 15 layout): ``<root>/<CASE_ID>`` is a
                   directory link (symlink, or an NTFS junction without the privilege)
                   to the package's case directory.
               It refuses an out-root inside a git work tree, an out-root equal to,
               inside or above the package root, and (hardlink) another volume.
``check``      run the preflight against a data root, the package root and the manifests.

Why hardlink is the default
---------------------------
``ml/data.py`` requires each resolved file path to stay inside the root it was given.
A junction resolves back out to the real package, so a junction root cannot be used by
that loader. A hard link is a second name for the same file and resolves inside the root.

What ``check`` proves about the root (QA BLOCKING 1, Day 22)
------------------------------------------------------------
Entry NAMES are not trusted. Link targets and file identities are verified:

* every top-level entry is an effective-training case id;
* a link entry (symlink or junction) must resolve to exactly that case's package
  directory, and that directory may hold only regular files the dataset manifest
  declares for the case;
* a real-directory entry (hardlink layout) must hold exactly the two expected regular
  files, no subdirectory and nothing else, each ``os.path.samefile`` with the package's
  MRI / mask for that case;
* anything else (a top-level file, a nested link, another reparse point) fails;
* no entry resolves to, inside, or above a validation / final_holdout case directory;
* no file under the root is the same file (``st_dev``, ``st_ino``) as any validation /
  final_holdout file of the package;
* the root is not equal to, inside, or a parent of the package root, and is not inside
  a git work tree.

Gate state is never inferred. ``--gate-split-01`` and ``--gate-data-01`` must be passed
explicitly. ``check`` reports a runnable preflight only when both are ``CLOSED``.

Exit codes of ``check``: 0 runnable; 1 refused (any check other than the gate state
failed, or a gate is OPEN without ``--allow-open-gates``); 2 labelled DRY RUN (a gate is
OPEN, ``--allow-open-gates`` was passed and every other check passed). A dry run is
never Spike C1 evidence.
"""

from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
import platform
import stat
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

HERE = Path(__file__).resolve().parent
REPO_DEFAULT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from verify_subsets import verify as verify_subsets  # noqa: E402

EXIT_OK, EXIT_REFUSED, EXIT_DRY_RUN = 0, 1, 2
IO_REPARSE_TAG_MOUNT_POINT = 0xA0000003      # an NTFS junction
FILE_ATTRIBUTE_REPARSE_POINT = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
WINERROR_NOT_SAME_DEVICE = 17
WALK_LIMIT = 100_000                          # entries; a bigger root is refused, not sampled
LINK_KINDS = ("symlink", "junction")
# DR-002b names these two. They are a CROSS-CHECK only; the exclusion set itself is
# derived from the groups + links by verify_subsets (EXCL-DERIVED-FROM-LINKS).
DR002B_NAMED = {"CASE_0133": "direct link to holdout CASE_0027",
                "CASE_0117": "group-propagated from CASE_0133"}


# --- small helpers --------------------------------------------------------------

def _load(p: Path) -> tuple[Any, str]:
    raw = p.read_bytes()
    return json.loads(raw.decode("utf-8-sig")), hashlib.sha256(raw).hexdigest()


def _norm(p: Path | str, *, resolve: bool = True) -> str:
    return os.path.normcase(os.path.realpath(p) if resolve else os.path.abspath(p))


def _rel_norm(na: str, nb: str) -> str | None:
    if na == nb:
        return "equal"
    try:
        common = os.path.commonpath([na, nb])
    except ValueError:            # different drives
        return None
    if common == nb:
        return "inside"
    if common == na:
        return "parent"
    return None


def _relation(a: Path | str, b: Path | str, *, resolve: bool = True) -> str | None:
    """Where path ``a`` sits relative to ``b``: 'equal', 'inside' (a under b), 'parent'
    (a above b), or None. Case-insensitive on Windows; resolved through links by default."""
    return _rel_norm(_norm(a, resolve=resolve), _norm(b, resolve=resolve))


_REL_TEXT = {"equal": "equal to", "inside": "inside", "parent": "a parent of"}


def _samefile(a: Path | str, b: Path | str) -> bool:
    try:
        return os.path.samefile(a, b)
    except OSError:
        return False


def _scandir(d: Path | str) -> list[os.DirEntry]:
    with os.scandir(d) as it:
        return sorted(it, key=lambda e: e.name)


def _relation_any(a: Path | str, b: Path | str) -> str | None:
    """The relation either resolved or as written, so a link cannot hide either one."""
    return _relation(a, b) or _relation(a, b, resolve=False)


def _kind(p: Path | str) -> str:
    """What ``p`` is WITHOUT following it: symlink, junction, reparse, dir, file, other,
    missing or unreadable. Never opens a file."""
    try:
        st = os.lstat(p)
    except FileNotFoundError:
        return "missing"
    except OSError:
        return "unreadable"
    if stat.S_ISLNK(st.st_mode):
        return "symlink"
    if getattr(st, "st_file_attributes", 0) & FILE_ATTRIBUTE_REPARSE_POINT:
        return "junction" if getattr(st, "st_reparse_tag", 0) == IO_REPARSE_TAG_MOUNT_POINT else "reparse"
    if stat.S_ISDIR(st.st_mode):
        return "dir"
    if stat.S_ISREG(st.st_mode):
        return "file"
    return "other"


def _file_id(p: Path | str) -> tuple[int, int] | None:
    try:
        st = os.stat(p)
    except OSError:
        return None
    return (st.st_dev, st.st_ino)


def _basename(rel: str) -> str:
    return PurePosixPath(rel.replace("\\", "/")).name


def _existing_ancestor(p: Path) -> Path:
    probe = Path(os.path.abspath(p))
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    return probe


def _volume(p: Path) -> int | None:
    try:
        return os.stat(_existing_ancestor(p)).st_dev
    except OSError:
        return None


def _git_work_tree(p: Path) -> str | None:
    """The git work tree that contains ``p`` (which need not exist yet), or None."""
    anchor = _existing_ancestor(p)
    for base in (Path(os.path.abspath(p)), Path(os.path.realpath(anchor))):
        for parent in (base, *base.parents):
            try:
                if (parent / ".git").exists():
                    return str(parent)
            except OSError:
                continue
    try:
        r = subprocess.run(["git", "-C", str(anchor), "rev-parse", "--show-toplevel"],
                           capture_output=True, text=True, timeout=20, check=False)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def _location_problems(root: Path, package_root: Path) -> list[str]:
    """Why ``root`` may not hold a training-only root for ``package_root``; [] if none."""
    problems = []
    rel = _relation_any(root, package_root)
    if rel == "equal":
        problems.append(f"the root IS the package root {package_root}: validation and holdout "
                        "cases are one path join away")
    elif rel == "inside":
        problems.append(f"the root is INSIDE the package root {package_root}; a root must never "
                        "add entries to, or live inside, the package")
    elif rel == "parent":
        problems.append(f"the root is a PARENT of the package root {package_root}; the whole "
                        "package would be reachable beneath it")
    wt = _git_work_tree(root)
    if wt:
        problems.append(f"the root is inside the git work tree {wt}; dataset links and bytes "
                        "never go inside a work tree")
    return problems


def _environment() -> dict[str, Any]:
    env: dict[str, Any] = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "processor": platform.processor(),
        "hostname": platform.node(),
        "captured_at": datetime.now(timezone.utc).astimezone().isoformat(),
    }
    for mod in ("torch", "numpy", "transformers", "huggingface_hub", "nrrd"):
        try:
            m = __import__(mod)
            env[mod] = getattr(m, "__version__", "unknown")
        except Exception as exc:  # noqa: BLE001
            env[mod] = f"NOT INSTALLED ({type(exc).__name__})"
    try:
        import torch

        env["cuda_available"] = torch.cuda.is_available()
        env["cuda_version"] = torch.version.cuda
        env["cudnn_version"] = torch.backends.cudnn.version()
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            env["gpu_name"] = props.name
            env["gpu_total_memory_bytes"] = props.total_memory
            env["bf16_supported"] = torch.cuda.is_bf16_supported()
        else:
            env["gpu_name"] = None
        env["mps_available"] = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
    except Exception as exc:  # noqa: BLE001
        env["torch_probe_error"] = f"{type(exc).__name__}: {exc}"
    return env


def _git(repo: Path, *args: str) -> str | None:
    try:
        out = subprocess.run(["git", "-C", str(repo), *args],
                             capture_output=True, text=True, timeout=20, check=False)
        return out.stdout.strip() if out.returncode == 0 else None
    except Exception:  # noqa: BLE001
        return None


def _make_dir_link(src: Path, dst: Path) -> str | None:
    """dst -> src as a directory symlink, or an NTFS junction where symlinks need a
    privilege the account lacks. Returns an error message, or None on success."""
    try:
        os.symlink(src, dst, target_is_directory=True)
        return None
    except OSError as exc:
        if os.name != "nt":
            return str(exc)
    r = subprocess.run(["cmd", "/c", "mklink", "/J", str(dst), str(src)],
                       capture_output=True, text=True, check=False)
    return None if r.returncode == 0 else (r.stderr.strip() or r.stdout.strip() or f"mklink exit {r.returncode}")


def _declared_files(case: dict[str, Any]) -> set[str]:
    """Every file name the dataset manifest declares in this case's directory."""
    names = {_basename(case["mri"]["path_relative"]), _basename(case["mask"]["path_relative"])}
    names |= set(case.get("other_files_in_case_dir") or [])
    names |= set(case.get("non_nrrd_sidecars") or [])
    for v in (case.get("companion_volumes") or {}).values():
        if isinstance(v, dict) and v.get("path_relative"):
            names.add(_basename(v["path_relative"]))
    return names


def _case_file_paths(case: dict[str, Any], package_root: Path) -> list[Path]:
    """mri, mask and companion volumes of one case, as package paths."""
    rels = [case["mri"]["path_relative"], case["mask"]["path_relative"]]
    for v in (case.get("companion_volumes") or {}).values():
        if isinstance(v, dict) and v.get("path_relative"):
            rels.append(v["path_relative"])
    return [package_root / r for r in rels]


# --- make-root ------------------------------------------------------------------

def _hardlink_case(case: dict[str, Any], package_root: Path, out: Path) -> tuple[str, str | None]:
    """Link one case's MRI and mask into out/<CASE_ID>/. Returns (status, error)."""
    cid = case["case_id"]
    pairs = []
    for key in ("mri", "mask"):
        rel = case[key]["path_relative"]
        src = package_root / rel
        if _relation(src, package_root, resolve=False) != "inside":
            return "failed", f"{key} path {rel!r} escapes the package root"
        k = _kind(src)
        if k != "file":
            return "failed", f"package {key} {src} is a {k}, not a regular file"
        pairs.append((key, src, _basename(rel)))
    names = [n for _, _, n in pairs]
    if len(set(names)) != 2 or any(n in ("", ".", "..") for n in names):
        return "failed", f"mri/mask basenames {names} collide or are invalid"

    case_dir = out / cid
    k = _kind(case_dir)
    if k == "missing":
        case_dir.mkdir()
    elif k != "dir":
        return "failed", f"{case_dir} exists as a {k}; refusing to write through it (left untouched)"
    status = "already there"
    for key, src, name in pairs:
        dst = case_dir / name
        kd = _kind(dst)
        if kd == "missing":
            try:
                os.link(src, dst)
            except OSError as exc:
                if exc.errno == errno.EXDEV or getattr(exc, "winerror", None) == WINERROR_NOT_SAME_DEVICE:
                    return "failed", (f"os.link {src} -> {dst}: the out-root is on a DIFFERENT VOLUME "
                                      "from the package; hard links cannot cross volumes")
                return "failed", f"os.link {src} -> {dst} failed: {exc}"
            status = "linked"
        elif kd == "file" and _samefile(dst, src):
            continue
        else:
            return "failed", f"{dst} exists ({kd}) and is not the package {key}; not overwritten"
    return status, None


def _junction_case(case: dict[str, Any], package_root: Path, out: Path) -> tuple[str, str | None]:
    src = Path(os.path.realpath(package_root / case["source_dir_relative"]))
    if _relation(src, package_root) != "inside":
        return "failed", f"source dir {case['source_dir_relative']!r} escapes the package root"
    if not src.is_dir():
        return "failed", f"source dir missing: {src}"
    dst = out / case["case_id"]
    k = _kind(dst)
    if k in LINK_KINDS and _norm(dst) == _norm(src):
        return "already there", None
    if k != "missing":
        return "failed", f"{dst} exists ({k}) and does not link to {src}; not overwritten"
    err = _make_dir_link(src, dst)
    return ("linked", None) if err is None else ("failed", err)


def cmd_make_root(args: argparse.Namespace) -> int:
    split, _ = _load(args.split_manifest)
    dataset, _ = _load(args.dataset_manifest)
    by_id = {c["case_id"]: c for c in dataset["cases"]}
    ids = list(split["training_subsets"]["100_percent"]["effective_case_ids"])
    pkg: Path = args.package_root
    out: Path = args.out_root

    refusals: list[str] = []
    if not pkg.is_dir():
        refusals.append(f"package root {pkg} is not a directory")
    refusals += _location_problems(out, pkg)
    locked = (set(split["partitions"]["validation"]["case_ids"])
              | set(split["partitions"]["final_holdout"]["case_ids"])
              | set(split["training_exclusions"]["all_excluded_case_ids"]))
    if set(ids) & locked:
        refusals.append(f"the effective-100% list names validation/holdout/excluded cases: {sorted(set(ids) & locked)}")
    if len(set(ids)) != len(ids):
        refusals.append("the effective-100% list has duplicate ids")
    if args.layout == "hardlink" and pkg.is_dir():
        v_pkg, v_out = _volume(pkg), _volume(out)
        if v_pkg is None or v_pkg != v_out:
            refusals.append(f"hard links cannot cross volumes: the package {pkg} is on volume {v_pkg} and the "
                            f"out-root {out} on volume {v_out}. Put the out-root on the package's volume, "
                            "or use --layout junction (not usable by ml/data.py)")
    k_out = _kind(out)
    if k_out not in ("missing", "dir"):
        refusals.append(f"out-root {out} exists as a {k_out}, not a plain directory")
    if refusals:
        print("make-root REFUSED - nothing was created:")
        for r in refusals:
            print(f"  - {r}")
        return EXIT_REFUSED

    out.mkdir(parents=True, exist_ok=True)
    made, skipped, failed = [], [], []
    for cid in sorted(ids):
        case = by_id.get(cid)
        if case is None:
            failed.append({"case_id": cid, "reason": "absent from dataset manifest"})
            continue
        fn = _hardlink_case if args.layout == "hardlink" else _junction_case
        status, err = fn(case, pkg, out)
        if status == "linked":
            made.append(cid)
        elif status == "already there":
            skipped.append(cid)
        else:
            failed.append({"case_id": cid, "reason": err})
    extra = [e.name for e in _scandir(out) if e.name not in set(ids)]

    print(f"layout       : {args.layout}")
    print(f"root         : {out}")
    print(f"package root : {pkg}")
    print(f"cases        : {len(ids)} (training_subsets.100_percent.effective_case_ids)")
    print(f"linked       : {len(made)}")
    print(f"already there: {len(skipped)}")
    print(f"failed       : {len(failed)}")
    for f in failed[:10]:
        print(f"  FAIL {f}")
    if extra:
        print(f"UNEXPECTED entries already in the root (left untouched; `check` will refuse): {extra[:20]}")
    print()
    if args.layout == "hardlink":
        print("Each case directory holds two HARD LINKS (MRI, mask) to the package files. No byte")
        print("is copied and nothing in the package is modified. Removing the root removes only")
        print("those directory entries; never write through them - a hard link IS the package file.")
    else:
        print("This root is a set of DIRECTORY LINKS. It copies no image bytes and modifies nothing")
        print("in the source package. Removing the root removes only the links.")
    print("Next: preflight.py check --data-root <this root> --package-root <package root> ...")
    return EXIT_REFUSED if failed or extra else EXIT_OK


# --- the root audit ---------------------------------------------------------------

def _walk_no_follow(root: Path) -> tuple[list[tuple[Path, str]], bool]:
    """Every entry beneath ``root`` with its kind, NEVER descending into a link or junction
    (os.walk(followlinks=False) still descends into junctions on Windows)."""
    found: list[tuple[Path, str]] = []
    stack = [root]
    while stack:
        d = stack.pop()
        try:
            with os.scandir(d) as it:
                children = [Path(e.path) for e in it]
        except OSError:
            found.append((d, "unreadable"))
            continue
        for c in children:
            k = _kind(c)
            found.append((c, k))
            if len(found) > WALK_LIMIT:
                return found, True
            if k == "dir":
                stack.append(c)
    return found, False


def _audit_root(root: Path, package_root: Path, split: dict[str, Any],
                by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Classify and verify every entry of the data root. Stat-only."""
    train_ids = set(split["training_subsets"]["100_percent"]["effective_case_ids"])
    locked = {"validation": split["partitions"]["validation"]["case_ids"],
              "final_holdout": split["partitions"]["final_holdout"]["case_ids"]}

    # identities of every validation / holdout file, and their case directories
    locked_dir: dict[str, str] = {}             # case id -> normalised, resolved case directory
    locked_show: dict[str, str] = {}            # the same, as displayed
    locked_file: dict[tuple[int, int], str] = {}
    identity_unavailable = []
    for ids in locked.values():
        for cid in ids:
            case = by_id.get(cid)
            if case is None:
                continue
            locked_show[cid] = os.path.realpath(package_root / case["source_dir_relative"])
            locked_dir[cid] = os.path.normcase(locked_show[cid])
            for fp in _case_file_paths(case, package_root):
                fid = _file_id(fp)
                if fid is None:
                    continue
                if fid[1] == 0:
                    identity_unavailable.append(str(fp))
                locked_file[fid] = cid

    try:
        top = _scandir(root) if root.is_dir() else []
    except OSError:
        top = []
    kinds: dict[str, int] = {}
    extra_names, bad_entries, verified = [], [], set()
    reached: dict[str, dict[str, Any]] = {}     # locked case id -> first way it was reached
    reachable_files: list[tuple[Path, str]] = []

    def reach(cid: str, via: str, path: Path | str) -> None:
        reached.setdefault(cid, {"case_id": cid, "via": via, "resolved_path": str(path)})

    # (a) the root itself relative to every locked case directory
    n_root = _norm(root)
    for cid, d in locked_dir.items():
        rel = _rel_norm(n_root, d)
        if rel:
            reach(cid, f"the data root is {_REL_TEXT[rel]} the case directory", locked_show[cid])

    for e in top:
        p = Path(e.path)
        k = _kind(p)
        kinds[k] = kinds.get(k, 0) + 1
        if e.name not in train_ids:
            extra_names.append(e.name)
        case = by_id.get(e.name)
        if k in LINK_KINDS:
            target = Path(os.path.realpath(p))
            n_target = _norm(target)
            for cid, d in locked_dir.items():
                rel = _rel_norm(n_target, d)
                if rel:
                    reach(cid, f"entry {e.name} resolves to a path {_REL_TEXT[rel]} the case directory", target)
            if case is None or e.name not in train_ids:
                bad_entries.append({"entry": e.name, "kind": k, "target": str(target),
                                    "reason": "link under a name that is not an effective-training id"})
                continue
            expected = package_root / case["source_dir_relative"]
            if n_target != _norm(expected):
                bad_entries.append({"entry": e.name, "kind": k, "target": str(target),
                                    "expected": str(Path(os.path.realpath(expected))),
                                    "reason": "link target is not this case's package directory"})
                continue
            # The target is the package case dir: it may hold only declared regular files.
            allowed = _declared_files(case)
            problems = []
            try:
                inner = _scandir(target)
            except OSError as exc:
                inner, problems = [], [f"cannot list target: {exc}"]
            for f in inner:
                fk = _kind(f.path)
                if fk != "file":
                    problems.append(f"{f.name} is a {fk}")
                elif f.name not in allowed:
                    problems.append(f"{f.name} is not declared for {e.name} in the dataset manifest")
                else:
                    reachable_files.append((Path(f.path), e.name))
            if problems:
                bad_entries.append({"entry": e.name, "kind": k, "target": str(target),
                                    "reason": "link target holds undeclared content", "problems": problems[:10]})
                continue
            verified.add(e.name)
        elif k == "dir":
            if case is None or e.name not in train_ids:
                bad_entries.append({"entry": e.name, "kind": k,
                                    "reason": "directory under a name that is not an effective-training id"})
                continue
            want = {_basename(case["mri"]["path_relative"]): package_root / case["mri"]["path_relative"],
                    _basename(case["mask"]["path_relative"]): package_root / case["mask"]["path_relative"]}
            problems = []
            try:
                inner = _scandir(p)
            except OSError as exc:
                inner, problems = [], [f"cannot list: {exc}"]
            names = {f.name for f in inner}
            for f in inner:
                fk = _kind(f.path)
                if fk != "file":
                    problems.append(f"{f.name} is a {fk}, not a regular file")
                elif f.name not in want:
                    problems.append(f"unexpected file {f.name}")
                elif not _samefile(f.path, want[f.name]):
                    problems.append(f"{f.name} is not os.path.samefile with the package's {want[f.name]}")
            for missing in sorted(set(want) - names):
                problems.append(f"missing {missing}")
            if problems:
                bad_entries.append({"entry": e.name, "kind": k, "reason": "hardlink case directory is not "
                                    "exactly the two expected files", "problems": problems[:10]})
                continue
            verified.add(e.name)
        else:
            bad_entries.append({"entry": e.name, "kind": k,
                                "reason": "only directory links or hardlink case directories are allowed"})

    # (b) every name that the Day 15 probes tried, so the old negative control still counts
    for cid in locked_dir:
        rel = by_id[cid]["source_dir_relative"]
        for cand in (root / cid, root / rel, root / Path(rel).name):
            try:
                if cand.exists():
                    reach(cid, "a probe path exists beneath the root", cand)
                    break
            except OSError:
                continue

    # (c) file identity: nothing under the root may BE a validation / holdout file
    walked, truncated = _walk_no_follow(root) if root.is_dir() else ([], False)
    nested_links = []
    for p, k in walked:
        if k == "file":
            reachable_files.append((p, p.relative_to(root).parts[0]))
        elif k in LINK_KINDS + ("reparse",) and p.parent != root:
            nested_links.append(str(p))
    same_as_locked = []
    for p, _entry in reachable_files:
        cid = locked_file.get(_file_id(p) or (-1, -1))
        if cid is not None:
            same_as_locked.append({"path": str(p), "same_file_as_case": cid})
            reach(cid, "a file beneath the root is the same file (st_dev, st_ino)", p)

    val, hold = set(locked["validation"]), set(locked["final_holdout"])
    return {
        "entry_kinds": kinds,
        "entry_count": len(top),
        "extra_names": extra_names,
        "bad_entries": bad_entries,
        "verified": verified,
        "nested_links": nested_links,
        "walk_truncated": truncated,
        "walked_entries": len(walked),
        "same_as_locked": same_as_locked,
        "identity_unavailable": identity_unavailable,
        "val_hits": [v for k, v in sorted(reached.items()) if k in val],
        "hold_hits": [v for k, v in sorted(reached.items()) if k in hold],
        "layout": ("hardlink" if set(kinds) == {"dir"} else
                   "junction" if kinds and set(kinds) <= set(LINK_KINDS) else
                   "empty" if not kinds else "mixed"),
    }


# --- check ------------------------------------------------------------------------

def cmd_check(args: argparse.Namespace) -> int:
    split, split_sha = _load(args.split_manifest)
    dataset, dataset_sha = _load(args.dataset_manifest)
    by_id = {c["case_id"]: c for c in dataset["cases"]}

    checks: list[dict[str, Any]] = []

    def add(cid: str, desc: str, ok: bool, detail: Any = None) -> None:
        checks.append({"check_id": cid, "description": desc, "passed": bool(ok), "detail": detail})

    # --- gate state, never inferred -------------------------------------
    gates_closed = args.gate_split_01 == "CLOSED" and args.gate_data_01 == "CLOSED"
    add("GATE-STATE", "GATE-DATA-01 and GATE-SPLIT-01 both declared CLOSED by the operator",
        gates_closed, {"gate_data_01": args.gate_data_01, "gate_split_01": args.gate_split_01})

    # --- manifest provenance ---------------------------------------------
    declared_src = split.get("source_dataset_manifest", {}).get("sha256")
    add("DATASET-MANIFEST-HASH",
        "split manifest's declared source dataset-manifest sha256 matches the file supplied",
        declared_src == dataset_sha, {"declared": declared_src, "actual": dataset_sha})

    if args.expect_split_sha256:
        pin = args.expect_split_sha256.strip().lower()
        add("SPLIT-MANIFEST-HASH",
            "split manifest sha256 matches the pinned value (pin the git BLOB bytes, never a redirected copy)",
            pin == split_sha, {"expected": pin, "actual": split_sha})

    # --- structure, leakage chain, census (set algebra, exclusions derived) --
    sub = verify_subsets(split, dataset)
    for c in sub.checks:
        checks.append({**c, "check_id": "SUBSET/" + c["check_id"]})

    # --- DR-002b named exclusions: a cross-check, not the source ------------
    excluded = set(split["training_exclusions"]["all_excluded_case_ids"])
    eff = {k: set(split["training_subsets"][k]["effective_case_ids"])
           for k in ("25_percent", "50_percent", "100_percent")}
    add("EXCLUSIONS-DR002B-CROSSCHECK",
        "cross-check against DR-002b: CASE_0133 (direct) and CASE_0117 (group) are in the DERIVED exclusion set",
        set(DR002B_NAMED) <= sub.derived_exclusions,
        {"dr002b_named": DR002B_NAMED, "derived_exclusions": sorted(sub.derived_exclusions),
         "declared_exclusions": sorted(excluded)})
    add("EXCLUSIONS-ABSENT",
        "no excluded case (declared or derived) appears in any effective training subset",
        not any((excluded | sub.derived_exclusions) & s for s in eff.values()),
        {k: sorted((excluded | sub.derived_exclusions) & v) for k, v in eff.items()})

    # --- DATA ROOT CONTAINMENT: the point of this script -------------------
    pkg: Path = args.package_root
    root = Path(os.path.realpath(args.data_root))
    add("PACKAGE-ROOT-EXISTS", "the declared package root exists", pkg.is_dir(), {"package_root": str(pkg)})
    add("ROOT-EXISTS", "the declared training-only data root exists", root.is_dir(),
        {"root": str(root), "given": str(args.data_root)})
    rel = _relation_any(args.data_root, pkg)
    add("ROOT-NOT-PACKAGE", "the data root is not equal to, inside, or a parent of the package root",
        rel is None, {"relation_of_root_to_package": rel})
    wt = _git_work_tree(args.data_root)
    add("ROOT-OUTSIDE-GIT", "the data root is not inside a git work tree", wt is None, {"work_tree": wt})

    audit = _audit_root(root, pkg, split, by_id)
    train_ids = split["training_subsets"]["100_percent"]["effective_case_ids"]
    add("ROOT-IS-ALLOWLIST-ONLY",
        "every top-level entry of the data root is an effective-training case id",
        not audit["extra_names"] and audit["entry_count"] > 0,
        {"unexpected_entries": audit["extra_names"][:20], "entry_count": audit["entry_count"]})
    add("ENTRY-TARGETS-VERIFIED",
        "each entry is a link resolving exactly to its own case dir, or a real dir holding exactly "
        "the two expected files samefile with the package's; nothing else",
        not audit["bad_entries"] and not audit["nested_links"],
        {"layout": audit["layout"], "entry_kinds": audit["entry_kinds"],
         "bad_entries": audit["bad_entries"][:20], "bad_entry_count": len(audit["bad_entries"]),
         "nested_links": audit["nested_links"][:20]})
    add("NO-FILE-IS-VALIDATION-OR-HOLDOUT",
        "no file beneath the root is the same file (st_dev, st_ino) as any validation/final_holdout file",
        not audit["same_as_locked"] and not audit["identity_unavailable"] and not audit["walk_truncated"],
        {"same_file_hits": audit["same_as_locked"][:10], "same_file_hit_count": len(audit["same_as_locked"]),
         "identity_unavailable": audit["identity_unavailable"][:5], "walk_truncated": audit["walk_truncated"],
         "walked_entries": audit["walked_entries"]})
    val_hits, hold_hits = audit["val_hits"], audit["hold_hits"]
    add("VALIDATION-UNREACHABLE",
        "no validation case is reachable beneath the data root (probe paths, link targets, file identity)",
        not val_hits, {"validation_paths_resolved": len(val_hits), "hits": val_hits[:10]})
    add("HOLDOUT-UNREACHABLE",
        "no holdout case is reachable beneath the data root (probe paths, link targets, file identity)",
        not hold_hits,
        {"holdout_case_count": len(hold_hits), "holdout_paths_resolved": len(hold_hits), "hits": hold_hits[:10]})
    missing = sorted(set(train_ids) - audit["verified"])
    add("TRAINING-COMPLETE",
        "every effective training case has a verified entry in the data root",
        not missing, {"expected": len(train_ids), "verified": len(audit["verified"]), "missing": missing[:20]})

    others_ok = all(c["passed"] for c in checks if c["check_id"] != "GATE-STATE")
    all_ok = others_ok and gates_closed
    runnable = all_ok
    if not others_ok:
        code, verdict = EXIT_REFUSED, "REFUSED"
    elif not gates_closed:
        code, verdict = ((EXIT_DRY_RUN, "DRY_RUN_GATE_OPEN") if args.allow_open_gates
                         else (EXIT_REFUSED, "REFUSED_GATE_OPEN"))
    else:
        code, verdict = EXIT_OK, "RUNNABLE"

    repo = args.repo or REPO_DEFAULT
    payload = {
        "label": args.label,
        "is_spike_c1_evidence": runnable and not args.allow_open_gates,
        "verdict": verdict,
        "exit_code": code,
        "generated_by": "spikes/spike_c_ml/c1/preflight.py",
        "captured_at": datetime.now(timezone.utc).astimezone().isoformat(),
        "operator": args.operator,
        "gate_state_declared": {"GATE-DATA-01": args.gate_data_01, "GATE-SPLIT-01": args.gate_split_01},
        "split_manifest": {"path": str(args.split_manifest), "sha256": split_sha,
                           "split_id": split.get("split_id"), "generated_at": split.get("generated_at"),
                           "restricted_screen_sha256": split.get("similarity_screening", {}).get(
                               "restricted_screen_sha256")},
        "dataset_manifest": {"path": str(args.dataset_manifest), "sha256": dataset_sha},
        "package_root": str(pkg),
        "data_root": str(root),
        "data_root_layout": audit["layout"],
        "repo_commit": _git(repo, "rev-parse", "HEAD"),
        "repo_c1_code_dirty": bool(_git(repo, "status", "--porcelain", "--", "spikes/spike_c_ml/c1")),
        "environment": _environment(),
        "selected_case_ids": sorted(train_ids),
        "selected_case_ids_pointer": "$.training_subsets.100_percent.effective_case_ids",
        "derived_training_exclusions": sorted(sub.derived_exclusions),
        "holdout_case_count": len(hold_hits),
        "holdout_paths_resolved": len(hold_hits),
        "validation_paths_resolved": len(val_hits),
        "checks": checks,
        "all_checks_passed": all_ok,
        "runnable": runnable,
    }

    print(f"label          : {args.label}")
    print(f"data root      : {root}  (layout: {audit['layout']})")
    print(f"package root   : {pkg}")
    print(f"split sha256   : {split_sha}")
    print(f"gates declared : DATA-01={args.gate_data_01}  SPLIT-01={args.gate_split_01}")
    print("-" * 78)
    for c in checks:
        print(f"[{'PASS' if c['passed'] else 'FAIL'}] {c['check_id']:<44} {c['description']}")
        if not c["passed"]:
            print(f"       detail: {json.dumps(c['detail'], ensure_ascii=True)[:400]}")
    print("-" * 78)
    print(f"validation_paths_resolved : {len(val_hits)}")
    print(f"holdout_paths_resolved    : {len(hold_hits)}")
    print(f"ALL CHECKS PASSED         : {all_ok}")
    print(f"RUNNABLE AS SPIKE C1      : {runnable}")
    print(f"VERDICT / EXIT            : {verdict} / {code}")
    if not gates_closed:
        print("REFUSED as C1 evidence: a gate is not CLOSED. Any output is a DRY RUN only.")

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"json evidence  : {args.json_out}")
    return code


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(errors="backslashreplace")  # a redirected cp1252 console must not crash
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)

    mk = sp.add_parser("make-root", help="build an allowlisted training-only root (hard links by default)")
    mk.add_argument("--split-manifest", required=True, type=Path)
    mk.add_argument("--dataset-manifest", required=True, type=Path)
    mk.add_argument("--package-root", required=True, type=Path,
                    help="directory containing the released 'Training Set' / 'Testing Set' folders")
    mk.add_argument("--out-root", required=True, type=Path)
    mk.add_argument("--layout", choices=["hardlink", "junction"], default="hardlink",
                    help="hardlink (default): <root>/<CASE_ID>/{mri,mask} hard links; "
                         "junction: <root>/<CASE_ID> directory link (Day 15 layout)")
    mk.set_defaults(func=cmd_make_root)

    ck = sp.add_parser("check", help="run the fail-closed preflight")
    ck.add_argument("--split-manifest", required=True, type=Path)
    ck.add_argument("--dataset-manifest", required=True, type=Path)
    ck.add_argument("--data-root", required=True, type=Path)
    ck.add_argument("--package-root", required=True, type=Path,
                    help="the released package; link targets and file identities are verified against it")
    ck.add_argument("--gate-data-01", required=True, choices=["OPEN", "CLOSED"])
    ck.add_argument("--gate-split-01", required=True, choices=["OPEN", "CLOSED"])
    ck.add_argument("--expect-split-sha256",
                    help="pin: sha256 of the committed BLOB (git cat-file blob <rev>:<path>, hashed in Python)")
    ck.add_argument("--operator", default="UNDECLARED")
    ck.add_argument("--repo", type=Path, help="repository whose HEAD is recorded (default: this script's)")
    ck.add_argument("--label", default="UNLABELLED")
    ck.add_argument("--allow-open-gates", action="store_true",
                    help="a gate still OPEN gives a labelled DRY RUN (exit 2) instead of a refusal (exit 1); "
                         "never C1 evidence")
    ck.add_argument("--json-out", type=Path)
    ck.set_defaults(func=cmd_check)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
