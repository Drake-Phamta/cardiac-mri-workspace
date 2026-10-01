"""Data access for the ML pipeline.

Manifests, fail-closed case allowlists, NRRD loading, DR-011 normalization, the resized
slice cache, the slice dataset and the inverse transforms that put a prediction back on
the source voxel grid.

PROVENANCE
    dr011_normalize() and the resize policy (image bilinear + antialias, mask
    nearest-exact) are copied from spikes/spike_c_ml/harness/probe.py at commit 896c11a.
    The DR-011 parameters are copied from spikes/spike_c_ml/dr011_normalization.json at the
    same commit; ml/tests/test_data.py fails if the two ever disagree.

AXIS CONVENTION - read before touching any array
    pynrrd returns an array in NRRD axis order (x, y, z) (index_order='F'). The dataset
    manifest's `mri.shape`, e.g. [640, 640, 88], is in the same order. Everything in ml/
    works in [z, y, x]: slice index first, then row (y), then column (x). The conversion
    is a pure axis permutation - no flip, no resampling, no copy:

        zyx = to_zyx(xyz)           == xyz.transpose(2, 1, 0)
        xyz = to_nrrd_order(zyx)    == zyx.transpose(2, 1, 0)    exact inverse

    so to_nrrd_order(to_zyx(a)) is `a` bit for bit, and a prediction made in ZYX and
    passed through to_nrrd_order() lands on the source voxel grid when it is written with
    the source header's geometry (write_mask_nrrd). Slice k in ZYX is xyz[:, :, k].T,
    the same 2D slice the Spike C0 harness fed its models (norm[:, :, k].T).
    Spacing in this release is an identity placeholder: every size here is in VOXELS.

FAIL-CLOSED ACCESS
    Every loader works through a CaseAllowlist built against the split manifest:
      * an id outside the allowlist raises CaseNotAllowedError;
      * an id the split manifest does not know raises CaseNotAllowedError;
      * a `final_holdout` id raises HoldoutAccessError unless the allowlist was built with
        allow_holdout=True. Training code never sets it;
      * a training-excluded id (split manifest `training_exclusions`) raises unless
        allow_training_excluded=True.
    case_paths() resolves files for allowlisted cases only; load_case(), build_cache() and
    SliceDataset all go through it (SliceDataset takes the allowlist itself).

CACHE
    78 training cases do not fit in RAM as float32 at 560x560, so build_cache() writes one
    set of files per case to a directory OUTSIDE git (default
    D:\\02_Research\\cardiac-data\\cache\\<split_id>\\img<img>\\):
        <case>_image.npy        float16 [Z, img, img], DR-011 output resized bilinear
        <case>_mask.npy         uint8   [Z, img, img], {0, 1}, resized nearest-exact
        <case>_mask_native.npy  uint8   [Z, H, W] native-resolution reference (optional)
        <case>.json             sidecar: source NRRD sha256, preprocessing_version, ...
    SliceDataset memory-maps them (np.load(mmap_mode='r')).
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_MANIFEST = REPO_ROOT / "data" / "manifests" / "dataset_manifest.json"
DEFAULT_SPLIT_MANIFEST = REPO_ROOT / "data" / "manifests" / "split_manifest_path_a_seed2024.json"
DEFAULT_PACKAGE_ROOT = Path(os.environ.get("CARDIAC_PACKAGE_ROOT",
                                           r"D:\02_Research\cardiac-data\lasc2018\extracted"))
DEFAULT_CACHE_ROOT = Path(os.environ.get("CARDIAC_CACHE_ROOT", r"D:\02_Research\cardiac-data\cache"))

PARTITIONS = ("train", "validation", "final_holdout")
HOLDOUT_PARTITION = "final_holdout"

# DR-011 (copied from spikes/spike_c_ml/dr011_normalization.json @ 896c11a, "implementation").
DR011 = {"p_low": 0.5, "p_high": 99.5}

PREPROCESSING_VERSION = "ml-preproc-1.0.0"
PREPROCESSING = {
    "preprocessing_version": PREPROCESSING_VERSION,
    "axis_order": "arrays are [z, y, x]; NRRD (x, y, z) -> transpose(2, 1, 0); slices along z",
    "normalization": ("DR-011 per-volume: clip to this volume's [0.5, 99.5] percentiles "
                      "(numpy linear interpolation), scale to [0, 1], float32; no cohort statistic"),
    "image_resize": "torch bilinear, align_corners=False, antialias=True, to img x img, clamp to [0, 1]",
    "mask_binarize": "foreground = source value > 0 (source masks are {0, 255})",
    "mask_resize": "torch nearest-exact to img x img (label values preserved)",
    "cache_dtypes": {"image": "float16", "mask": "uint8"},
    "augmentation": "none",
    "slices": "all slices of every case",
    "dinov2_extra": ("inside DinoSeg.forward only: replicate to 3 channels, then the checkpoint's "
                     "fixed image_mean/image_std (pretrained-model constants)"),
    "spacing": "identity placeholder in this release; every size is in voxels",
}
CACHE_FORMAT = "ml-slice-cache/1"
GEOMETRY_KEYS = ("space", "space directions", "space origin", "kinds", "measurement frame",
                 "space units", "space dimension")


# --- errors ----------------------------------------------------------------------

class DataAccessError(RuntimeError):
    """A loader was asked for a case it may not touch."""


class CaseNotAllowedError(DataAccessError):
    """The case is not in the allowlist, or the split manifest does not know it."""


class HoldoutAccessError(DataAccessError):
    """A final_holdout case was requested without allow_holdout=True."""


# --- small helpers ----------------------------------------------------------------

def load_json(path: str | os.PathLike) -> dict:
    """UTF-8 JSON, tolerating a BOM (PowerShell redirects add one)."""
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def sha256_file(path: str | os.PathLike) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).astimezone().isoformat(timespec="seconds")


def _write_json_atomic(path: Path, obj: dict) -> None:
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def inside_git_worktree(path: str | os.PathLike) -> bool:
    """True when `path` (or the directory it would be created in) is inside a git work tree."""
    p = Path(path).resolve()
    for parent in (p, *p.parents):
        if (parent / ".git").exists():
            return True
    return False


# --- manifests --------------------------------------------------------------------

def load_dataset_manifest(path: str | os.PathLike = DEFAULT_DATASET_MANIFEST) -> dict:
    m = load_json(path)
    if not isinstance(m.get("cases"), list) or not m["cases"]:
        raise ValueError(f"{path}: dataset manifest has no cases")
    ids = [c.get("case_id") for c in m["cases"]]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{path}: duplicate case_id in dataset manifest")
    return m


def validate_split_manifest(split: dict) -> None:
    """Structural checks the loaders rely on. Raises ValueError."""
    parts = split.get("partitions")
    if not isinstance(parts, dict):
        raise ValueError("split manifest has no partitions")
    seen: dict[str, str] = {}
    for name in PARTITIONS:
        ids = (parts.get(name) or {}).get("case_ids")
        if not isinstance(ids, list) or not ids:
            raise ValueError(f"split manifest partition {name!r} has no case_ids")
        if len(ids) != len(set(ids)):
            raise ValueError(f"split manifest partition {name!r} repeats a case id")
        for cid in ids:
            if cid in seen:
                raise ValueError(f"{cid} is in both {seen[cid]!r} and {name!r}")
            seen[cid] = name
    train = set(parts["train"]["case_ids"])
    excluded = set(training_excluded_case_ids(split))
    if not excluded <= train:
        raise ValueError("training_exclusions name cases outside the train partition")
    for key, sub in (split.get("training_subsets") or {}).items():
        eff = sub.get("effective_case_ids")
        if not isinstance(eff, list) or not eff:
            raise ValueError(f"training subset {key!r} has no effective_case_ids")
        if len(eff) != len(set(eff)):
            raise ValueError(f"training subset {key!r} repeats a case id")
        if not set(eff) <= train:
            raise ValueError(f"training subset {key!r} has cases outside the train partition")
        if set(eff) & excluded:
            raise ValueError(f"training subset {key!r} contains training-excluded cases")


def load_split_manifest(path: str | os.PathLike = DEFAULT_SPLIT_MANIFEST) -> dict:
    split = load_json(path)
    validate_split_manifest(split)
    return split


def partition_case_ids(split: dict, partition: str) -> list[str]:
    if partition not in PARTITIONS:
        raise ValueError(f"unknown partition {partition!r}; known: {PARTITIONS}")
    return list(split["partitions"][partition]["case_ids"])


def holdout_case_ids(split: dict) -> frozenset[str]:
    return frozenset(split["partitions"][HOLDOUT_PARTITION]["case_ids"])


def training_excluded_case_ids(split: dict) -> list[str]:
    ex = split.get("training_exclusions") or {}
    return list(ex.get("all_excluded_case_ids") or [])


def subset_case_ids(split: dict, subset_key: str) -> list[str]:
    """effective_case_ids of training_subsets[subset_key] ('25_percent', '50_percent', '100_percent')."""
    subsets = split.get("training_subsets") or {}
    if subset_key not in subsets:
        raise ValueError(f"unknown training subset {subset_key!r}; known: {sorted(subsets)}")
    return list(subsets[subset_key]["effective_case_ids"])


def partition_of(split: dict) -> dict[str, str]:
    return {cid: name for name in PARTITIONS for cid in split["partitions"][name]["case_ids"]}


# --- allowlist --------------------------------------------------------------------

class CaseAllowlist:
    """An explicit, fail-closed set of case ids a loader may touch.

    Built against the split manifest so it knows which ids are holdout. Construction
    raises when the list contains an id the split does not know, a final_holdout id
    (unless allow_holdout=True) or a training-excluded id (unless
    allow_training_excluded=True). Use the classmethods for the usual populations.
    """

    def __init__(self, case_ids: Iterable[str], split: dict, *, allow_holdout: bool = False,
                 allow_training_excluded: bool = False, purpose: str = "unspecified"):
        if isinstance(case_ids, (str, bytes)):
            raise TypeError("case_ids must be a collection of ids, not one string")
        if type(allow_holdout) is not bool or type(allow_training_excluded) is not bool:
            raise TypeError("allow_holdout / allow_training_excluded must be literally True or False")
        ids = list(case_ids)
        if not ids:
            raise ValueError("an allowlist must name at least one case")
        if len(ids) != len(set(ids)):
            raise ValueError("an allowlist must not repeat a case id")
        validate_split_manifest(split)
        where = partition_of(split)
        unknown = [c for c in ids if c not in where]
        if unknown:
            raise CaseNotAllowedError(f"case ids not in the split manifest: {unknown[:5]}")
        held = [c for c in ids if where[c] == HOLDOUT_PARTITION]
        if held and not allow_holdout:
            raise HoldoutAccessError(
                f"{len(held)} final_holdout case(s) requested without allow_holdout=True "
                f"(e.g. {held[:3]}); the locked holdout is unreachable from training code")
        excluded = sorted(set(ids) & set(training_excluded_case_ids(split)))
        if excluded and not allow_training_excluded:
            raise CaseNotAllowedError(
                f"training-excluded case(s) {excluded} requested without allow_training_excluded=True")
        self._ids = tuple(ids)
        self._set = frozenset(ids)
        self._where = {c: where[c] for c in ids}
        self.holdout_ids = holdout_case_ids(split)
        self.split_id = split.get("split_id")
        self.allow_holdout = allow_holdout
        self.purpose = purpose

    @classmethod
    def for_training(cls, split: dict, subset_key: str) -> "CaseAllowlist":
        """The effective training cases of one subset. Never holdout, never excluded."""
        return cls(subset_case_ids(split, subset_key), split, purpose=f"training:{subset_key}")

    @classmethod
    def for_validation(cls, split: dict) -> "CaseAllowlist":
        return cls(partition_case_ids(split, "validation"), split, purpose="validation")

    @classmethod
    def for_holdout(cls, split: dict, *, allow_holdout: bool) -> "CaseAllowlist":
        """All final_holdout cases. allow_holdout must be passed explicitly as True."""
        if type(allow_holdout) is not bool:
            raise TypeError("allow_holdout must be literally True or False")
        if allow_holdout is not True:
            raise HoldoutAccessError("for_holdout() needs allow_holdout=True")
        return cls(partition_case_ids(split, HOLDOUT_PARTITION), split, allow_holdout=True,
                   purpose="final_holdout")

    def require(self, case_id: str) -> str:
        """Return case_id if allowed; raise otherwise."""
        if case_id in self._set:
            return case_id
        if case_id in self.holdout_ids and not self.allow_holdout:
            raise HoldoutAccessError(f"{case_id} is a final_holdout case and this allowlist "
                                     f"({self.purpose}) does not allow holdout access")
        raise CaseNotAllowedError(f"{case_id} is not in this allowlist ({self.purpose})")

    def partition(self, case_id: str) -> str:
        return self._where[self.require(case_id)]

    def __contains__(self, case_id: object) -> bool:
        return case_id in self._set

    def __iter__(self):
        return iter(self._ids)

    def __len__(self) -> int:
        return len(self._ids)

    @property
    def case_ids(self) -> list[str]:
        return list(self._ids)

    def __repr__(self) -> str:
        return (f"CaseAllowlist({len(self)} cases, purpose={self.purpose!r}, "
                f"split_id={self.split_id!r}, allow_holdout={self.allow_holdout})")


# --- case files -------------------------------------------------------------------

@dataclass(frozen=True)
class CaseFiles:
    case_id: str
    mri: Path
    mask: Path
    mri_relative: str
    mask_relative: str
    shape_xyz: tuple[int, ...] | None


class CasePaths(Mapping):
    """case_id -> CaseFiles, restricted to an allowlist. Lookups outside it raise."""

    def __init__(self, files: dict[str, CaseFiles], allowlist: CaseAllowlist, package_root: Path):
        self._files = dict(files)
        self.allowlist = allowlist
        self.package_root = package_root

    def __getitem__(self, case_id: str) -> CaseFiles:
        return self._files[self.allowlist.require(case_id)]

    def __iter__(self):
        return iter(self.allowlist)

    def __len__(self) -> int:
        return len(self.allowlist)


def _inside(root: Path, rel: str) -> Path:
    p = (root / rel).resolve()
    if os.path.commonpath([str(p), str(root.resolve())]) != str(root.resolve()):
        raise ValueError(f"manifest path escapes the package root: {rel!r}")
    return p


def case_paths(dataset_manifest: dict, package_root: str | os.PathLike = DEFAULT_PACKAGE_ROOT, *,
               allowlist: CaseAllowlist) -> CasePaths:
    """Map each allowlisted case id to its MRI and mask NRRD files.

    Raises when an allowlisted id is missing from the dataset manifest or its files are
    missing on disk. Ids outside the allowlist are never resolved.
    """
    if not isinstance(allowlist, CaseAllowlist):
        raise TypeError("case_paths() needs a CaseAllowlist (fail-closed access)")
    root = Path(package_root)
    by_id = {c["case_id"]: c for c in dataset_manifest["cases"]}
    files = {}
    for cid in allowlist:
        if cid not in by_id:
            raise CaseNotAllowedError(f"{cid} is not in the dataset manifest")
        c = by_id[cid]
        mri = _inside(root, c["mri"]["path_relative"])
        mask = _inside(root, c["mask"]["path_relative"])
        for p in (mri, mask):
            if not p.is_file():
                raise FileNotFoundError(f"{cid}: {p} does not exist (package root {root})")
        shape = c["mri"].get("shape")
        files[cid] = CaseFiles(cid, mri, mask, c["mri"]["path_relative"], c["mask"]["path_relative"],
                               tuple(int(s) for s in shape) if shape else None)
    return CasePaths(files, allowlist, root)


# --- orientation ------------------------------------------------------------------

def to_zyx(vol_xyz: np.ndarray) -> np.ndarray:
    """NRRD (x, y, z) -> [z, y, x]. A view; no copy, no flip."""
    if vol_xyz.ndim != 3:
        raise ValueError(f"expected a 3D volume, got shape {vol_xyz.shape}")
    return vol_xyz.transpose(2, 1, 0)


def to_nrrd_order(vol_zyx: np.ndarray) -> np.ndarray:
    """[z, y, x] -> NRRD (x, y, z). The exact inverse of to_zyx()."""
    if vol_zyx.ndim != 3:
        raise ValueError(f"expected a 3D volume, got shape {vol_zyx.shape}")
    return vol_zyx.transpose(2, 1, 0)


def read_nrrd_zyx(path: str | os.PathLike) -> tuple[np.ndarray, dict, str]:
    """Read an NRRD file once; return ([z, y, x] array, header, sha256 of the file bytes).

    The bytes are read once, hashed and parsed from memory, so the recorded hash is the
    hash of exactly the bytes that produced the array.
    """
    import io
    import nrrd
    raw = Path(path).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    fh = io.BytesIO(raw)
    header = nrrd.read_header(fh)
    data = nrrd.read_data(header, fh, str(path), index_order="F")
    del raw, fh
    return to_zyx(data), header, digest


def _distinct_values(arr: np.ndarray) -> np.ndarray:
    if arr.dtype == np.uint8:
        return np.flatnonzero(np.bincount(arr.ravel(), minlength=256)).astype(np.uint8)
    return np.unique(arr)


def geometry_header(source_header: dict) -> dict:
    """The geometry fields of a source header (space, directions, origin, kinds, ...)."""
    return {k: source_header[k] for k in GEOMETRY_KEYS if k in source_header}


def write_mask_nrrd(path: str | os.PathLike, mask_zyx: np.ndarray, source_header: dict, *,
                    encoding: str = "gzip") -> str:
    """Write a binary [z, y, x] mask as a uint8 NRRD on the source voxel grid; return its sha256.

    The array is put back in NRRD order with to_nrrd_order() and written with the source
    header's geometry fields, so it overlays the source volume voxel for voxel. An existing
    file is NEVER overwritten (raw predictions are immutable): FileExistsError.
    """
    import nrrd
    path = Path(path)
    if path.exists():
        raise FileExistsError(f"{path} exists; predictions are immutable and never overwritten")
    m = np.asarray(mask_zyx)
    if m.ndim != 3:
        raise ValueError(f"expected a 3D mask, got shape {m.shape}")
    if not (m.dtype == np.bool_ or np.issubdtype(m.dtype, np.integer)):
        raise TypeError(f"mask must be bool or integer {{0, 1}}, got {m.dtype}")
    if m.size and (int(m.min()) < 0 or int(m.max()) > 1):
        raise ValueError(f"mask must be binary {{0, 1}}, found range [{m.min()}, {m.max()}]")
    xyz = to_nrrd_order(m.astype(np.uint8, copy=False))
    sizes = source_header.get("sizes")
    if sizes is not None and tuple(int(s) for s in sizes) != xyz.shape:
        raise ValueError(f"mask shape (x,y,z) {xyz.shape} != source sizes {tuple(sizes)}")
    header = geometry_header(source_header)
    header["encoding"] = encoding
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    nrrd.write(str(tmp), xyz, header, index_order="F")
    # pynrrd stamps the wall-clock time into a header comment; drop that one comment line
    # so the same mask always produces the same bytes (and the same sha256).
    raw = tmp.read_bytes()
    head, sep, body = raw.partition(b"\n\n")
    head = re.sub(rb"\n# on [^\n]*\(GMT\)\.(?=\n)", b"", head)
    tmp.write_bytes(head + sep + body)
    try:
        os.link(tmp, path)          # fails if `path` appeared meanwhile: never overwrites
    except FileExistsError:
        os.remove(tmp)
        raise
    except OSError:
        if path.exists():
            os.remove(tmp)
            raise FileExistsError(f"{path} exists; predictions are immutable")
        os.rename(tmp, path)        # filesystems without hard links
    else:
        os.remove(tmp)
    return sha256_file(path)


# --- intensity ----------------------------------------------------------------------

def _dr011(vol: np.ndarray, p_low: float, p_high: float) -> tuple[np.ndarray, float, float]:
    lo, hi = (np.float32(q) for q in np.percentile(vol, [p_low, p_high]))
    v = vol.astype(np.float32)
    if hi <= lo:
        return np.zeros_like(v), float(lo), float(hi)
    # float32 throughout: np.percentile returns float64, and a float64 input
    # makes the UNet's float32 convolutions refuse it.
    return ((np.clip(v, lo, hi) - lo) / (hi - lo)).astype(np.float32), float(lo), float(hi)


def dr011_normalize(vol: np.ndarray, p_low: float = DR011["p_low"],
                    p_high: float = DR011["p_high"]) -> np.ndarray:
    """Per-volume: clip to this volume's [p_low, p_high] percentiles, scale to [0, 1].

    Copied from probe.py @ 896c11a (CHANGED: p_low/p_high default to the DR-011 values).
    Uses only the volume being processed - no cohort statistic (DR-011).
    """
    return _dr011(vol, p_low, p_high)[0]


def binarize_mask(mask: np.ndarray) -> np.ndarray:
    """uint8 {0, 1} from a source mask ({0, 255} in LASC 2018). Refuses a non-binary mask."""
    values = _distinct_values(mask)
    if values.size > 2 or (values.size == 2 and values[0] != 0):
        raise ValueError(f"not a binary mask: values {values[:10].tolist()}")
    return (mask > 0).astype(np.uint8)


# --- loading ------------------------------------------------------------------------

def _check_volume(cid: str, vol: np.ndarray, files: CaseFiles, what: str) -> None:
    if vol.ndim != 3:
        raise ValueError(f"{cid} {what}: expected 3D, got shape {vol.shape}")
    if files.shape_xyz is not None and tuple(reversed(vol.shape)) != files.shape_xyz:
        raise ValueError(f"{cid} {what}: shape zyx {vol.shape} does not match the manifest "
                         f"shape xyz {files.shape_xyz}")


def load_image(case_id: str, paths: CasePaths) -> tuple[np.ndarray, dict, dict]:
    """(image float32 [Z, H, W] in [0, 1] by DR-011, source MRI header, info) for one allowed case.

    info: {"mri_sha256", "dr011_lo", "dr011_hi", "native_shape_zyx"}.
    """
    files = paths[case_id]                      # raises outside the allowlist
    raw, header, digest = read_nrrd_zyx(files.mri)
    _check_volume(case_id, raw, files, "mri")
    if raw.dtype != np.uint8:
        raise ValueError(f"{case_id}: MRI dtype {raw.dtype}; the cohort is uint8 (Spike D A6)")
    image, lo, hi = _dr011(raw, DR011["p_low"], DR011["p_high"])
    info = {"mri_sha256": digest, "dr011_lo": lo, "dr011_hi": hi,
            "native_shape_zyx": list(raw.shape)}
    return np.ascontiguousarray(image), header, info


def load_mask(case_id: str, paths: CasePaths) -> tuple[np.ndarray, dict, str]:
    """(reference mask uint8 [Z, H, W] in {0, 1}, mask header, sha256) for one allowed case."""
    files = paths[case_id]                      # raises outside the allowlist
    raw, header, digest = read_nrrd_zyx(files.mask)
    _check_volume(case_id, raw, files, "mask")
    return np.ascontiguousarray(binarize_mask(raw)), header, digest


def load_case(case_id: str, paths: CasePaths) -> tuple[np.ndarray, np.ndarray]:
    """(image float32 [Z, H, W] in [0, 1] by DR-011, mask uint8 [Z, H, W] in {0, 1}).

    Axis order [z, y, x] - see the module docstring. Raises for any case outside the
    allowlist behind `paths` (CaseNotAllowedError / HoldoutAccessError).
    """
    image, _, _ = load_image(case_id, paths)
    mask, _, _ = load_mask(case_id, paths)
    if mask.shape != image.shape:
        raise ValueError(f"{case_id}: mask shape {mask.shape} != MRI shape {image.shape}")
    return image, mask


# --- resizing -----------------------------------------------------------------------

def resize_image_stack(image_zyx: np.ndarray, img: int) -> np.ndarray:
    """[Z, H, W] float in [0, 1] -> [Z, img, img] float32, bilinear + antialias, clamped to [0, 1]."""
    t = torch.from_numpy(np.ascontiguousarray(image_zyx, dtype=np.float32))[:, None]
    out = F.interpolate(t, size=(img, img), mode="bilinear", align_corners=False,
                        antialias=True).clamp_(0, 1)
    return out[:, 0].numpy()


def resize_mask_stack(mask_zyx: np.ndarray, img: int) -> np.ndarray:
    """[Z, H, W] {0, 1} -> [Z, img, img] uint8 {0, 1}, nearest-exact (no new label values)."""
    t = torch.from_numpy(np.ascontiguousarray(mask_zyx > 0, dtype=np.float32))[:, None]
    out = F.interpolate(t, size=(img, img), mode="nearest-exact")
    return (out[:, 0] > 0.5).to(torch.uint8).numpy()


def resize_logits_back(logits, size_hw: tuple[int, int]):
    """Logits [Z, img, img] -> [Z, H, W] float32, bilinear (align_corners=False).

    Accepts a numpy array or a torch tensor and returns the same kind (a tensor stays on
    its device). Threshold AFTER this step (logits_to_mask) so the binary prediction is
    made at native resolution.
    """
    h, w = (int(s) for s in size_hw)
    as_numpy = isinstance(logits, np.ndarray)
    t = torch.from_numpy(logits) if as_numpy else logits
    if t.ndim != 3:
        raise ValueError(f"expected logits [Z, img, img], got shape {tuple(t.shape)}")
    out = F.interpolate(t[:, None].float(), size=(h, w), mode="bilinear", align_corners=False)[:, 0]
    return out.numpy() if as_numpy else out


def logits_to_mask(logits, threshold: float = 0.5):
    """Binary uint8 {0, 1}: sigmoid(logit) >= threshold. Same kind (numpy/torch) as the input."""
    as_numpy = isinstance(logits, np.ndarray)
    t = torch.from_numpy(logits) if as_numpy else logits
    out = (torch.sigmoid(t.float()) >= threshold).to(torch.uint8)
    return out.numpy() if as_numpy else out


# --- cache --------------------------------------------------------------------------

def default_cache_dir(split_id: str | None, img: int) -> Path:
    if not split_id:
        raise ValueError("the split manifest has no split_id; pass cache_dir explicitly")
    return DEFAULT_CACHE_ROOT / split_id / f"img{img}"


def _cache_names(case_id: str) -> dict:
    return {"image": f"{case_id}_image.npy", "mask": f"{case_id}_mask.npy",
            "mask_native": f"{case_id}_mask_native.npy", "sidecar": f"{case_id}.json"}


def _save_npy_atomic(path: Path, arr: np.ndarray) -> str:
    tmp = path.with_name(path.stem + ".tmp.npy")
    np.save(tmp, arr, allow_pickle=False)
    os.replace(tmp, path)
    return sha256_file(path)


def read_cache_sidecar(cache_dir: str | os.PathLike, case_id: str) -> dict:
    p = Path(cache_dir) / _cache_names(case_id)["sidecar"]
    if not p.is_file():
        raise FileNotFoundError(f"no cache entry for {case_id} in {cache_dir}; run build_cache()")
    return load_json(p)


def _sidecar_current(side: dict, cache_dir: Path, img: int, split_id, mri_sha: str, mask_sha: str,
                     native_mask: bool) -> bool:
    if (side.get("cache_format") != CACHE_FORMAT
            or side.get("preprocessing_version") != PREPROCESSING_VERSION
            or side.get("img") != img or side.get("split_id") != split_id
            or side["source"]["mri"]["sha256"] != mri_sha
            or side["source"]["mask"]["sha256"] != mask_sha):
        return False
    wanted = ["image", "mask"] + (["mask_native"] if native_mask else [])
    for key in wanted:
        entry = (side.get("files") or {}).get(key)
        if not entry or not (cache_dir / entry["name"]).is_file():
            return False
    return True


def build_cache(case_ids: Iterable[str], paths: CasePaths, img: int,
                cache_dir: str | os.PathLike | None = None, *, native_mask: bool = False,
                log=print) -> dict:
    """Write the per-case resized arrays + sidecar for every case id (each must be allowed).

    cache_dir defaults to D:\\02_Research\\cardiac-data\\cache\\<split_id>\\img<img>\\ and must be
    outside any git work tree. A case whose sidecar is current (same preprocessing_version,
    img, split_id, source NRRD sha256 and files present) is reused, not rebuilt.
    native_mask=True also stores the native-resolution reference mask (needed to score
    validation predictions at native resolution).
    The source sha256 in the sidecar is the hash of exactly the bytes that were parsed.
    Returns {"cache_dir", "img", "cases": {case_id: {"status": "built"|"reused", ...}}}.
    """
    if not isinstance(paths, CasePaths):
        raise TypeError("build_cache() needs the CasePaths returned by case_paths()")
    ids = list(case_ids)
    for cid in ids:
        paths.allowlist.require(cid)             # fail before any work
    split_id = paths.allowlist.split_id
    cache_dir = Path(cache_dir) if cache_dir is not None else default_cache_dir(split_id, img)
    if inside_git_worktree(cache_dir):
        raise ValueError(f"cache dir {cache_dir} is inside a git work tree; derived patient "
                         f"arrays must stay outside git")
    cache_dir.mkdir(parents=True, exist_ok=True)
    summary = {"cache_dir": str(cache_dir), "img": img, "preprocessing_version": PREPROCESSING_VERSION,
               "cases": {}}
    for n, cid in enumerate(ids, 1):
        files = paths[cid]
        names = _cache_names(cid)
        side_path = cache_dir / names["sidecar"]
        mri_sha = sha256_file(files.mri)
        mask_sha = sha256_file(files.mask)
        if side_path.is_file():
            side = load_json(side_path)
            if _sidecar_current(side, cache_dir, img, split_id, mri_sha, mask_sha, native_mask):
                summary["cases"][cid] = {"status": "reused", "sidecar": str(side_path)}
                if log:
                    log(f"  [{n}/{len(ids)}] {cid} reused")
                continue
        image, header, info = load_image(cid, paths)
        mask, _, parsed_mask_sha = load_mask(cid, paths)
        if info["mri_sha256"] != mri_sha or parsed_mask_sha != mask_sha:
            raise RuntimeError(f"{cid}: source NRRD changed while it was being cached")
        if mask.shape != image.shape:
            raise ValueError(f"{cid}: mask shape {mask.shape} != MRI shape {image.shape}")
        image_r = resize_image_stack(image, img).astype(np.float16)
        mask_r = resize_mask_stack(mask, img)
        z = image.shape[0]
        entry_files = {
            "image": {"name": names["image"], "dtype": "float16", "shape": [z, img, img],
                      "sha256": _save_npy_atomic(cache_dir / names["image"], image_r)},
            "mask": {"name": names["mask"], "dtype": "uint8", "shape": [z, img, img],
                     "sha256": _save_npy_atomic(cache_dir / names["mask"], mask_r)},
            "mask_native": None,
        }
        if native_mask:
            entry_files["mask_native"] = {
                "name": names["mask_native"], "dtype": "uint8", "shape": list(mask.shape),
                "sha256": _save_npy_atomic(cache_dir / names["mask_native"], mask)}
        side = {
            "cache_format": CACHE_FORMAT,
            "case_id": cid,
            "split_id": split_id,
            "partition": paths.allowlist.partition(cid),
            "preprocessing_version": PREPROCESSING_VERSION,
            "preprocessing": PREPROCESSING,
            "dr011": {"p_low": DR011["p_low"], "p_high": DR011["p_high"],
                      "volume_lo": info["dr011_lo"], "volume_hi": info["dr011_hi"]},
            "img": img,
            "axis_order": "zyx",
            "num_slices": z,
            "native_shape_zyx": list(image.shape),
            "nrrd_shape_xyz": list(reversed(image.shape)),
            "source_geometry": {k: (np.asarray(v).tolist() if not isinstance(v, str) else v)
                                for k, v in geometry_header(header).items()},
            "source": {
                "mri": {"path_relative": files.mri_relative, "bytes": files.mri.stat().st_size,
                        "sha256": mri_sha},
                "mask": {"path_relative": files.mask_relative, "bytes": files.mask.stat().st_size,
                         "sha256": mask_sha},
            },
            "foreground_voxels_native": int(mask.sum(dtype=np.int64)),
            "foreground_pixels_resized": int(mask_r.sum(dtype=np.int64)),
            "files": entry_files,
            "created_at": _now(),
        }
        _write_json_atomic(side_path, side)
        summary["cases"][cid] = {"status": "built", "sidecar": str(side_path)}
        if log:
            log(f"  [{n}/{len(ids)}] {cid} built  zyx {list(image.shape)} -> [{z}, {img}, {img}]")
        del image, mask, image_r, mask_r
    return summary


# --- dataset ------------------------------------------------------------------------

class SliceDataset(torch.utils.data.Dataset):
    """All slices of the allowlisted cases, from the cache, memory-mapped.

    Yields (x [1, img, img] float32 in [0, 1], y [1, img, img] float32 in {0, 1}).
    `case_ids` must be a CaseAllowlist - a plain list is refused, so the holdout check
    cannot be skipped. Each case's sidecar is checked: preprocessing_version, split_id and
    partition (a final_holdout entry is refused unless the allowlist allows holdout).
    Memory maps are opened lazily per process and dropped when pickled, so DataLoader
    workers on Windows (spawn) do not copy the arrays.
    """

    def __init__(self, case_ids: CaseAllowlist, cache_dir: str | os.PathLike, *,
                 img: int | None = None, verify_hashes: bool = False):
        if not isinstance(case_ids, CaseAllowlist):
            raise TypeError("SliceDataset needs a CaseAllowlist (fail-closed access), not a plain list")
        self.allowlist = case_ids
        self.cache_dir = Path(cache_dir)
        self.case_list = list(case_ids)
        self.sidecars: dict[str, dict] = {}
        counts = []
        for cid in self.case_list:
            side = read_cache_sidecar(self.cache_dir, cid)
            if side.get("case_id") != cid:
                raise ValueError(f"cache sidecar for {cid} names {side.get('case_id')}")
            if side.get("cache_format") != CACHE_FORMAT:
                raise ValueError(f"{cid}: cache format {side.get('cache_format')} != {CACHE_FORMAT}")
            if side.get("preprocessing_version") != PREPROCESSING_VERSION:
                raise ValueError(f"{cid}: cached with {side.get('preprocessing_version')}, code is "
                                 f"{PREPROCESSING_VERSION}; rebuild the cache")
            if self.allowlist.split_id and side.get("split_id") != self.allowlist.split_id:
                raise ValueError(f"{cid}: cached for split {side.get('split_id')}, allowlist is "
                                 f"{self.allowlist.split_id}")
            if side.get("partition") == HOLDOUT_PARTITION and not self.allowlist.allow_holdout:
                raise HoldoutAccessError(f"{cid}: cache entry is final_holdout")
            if img is None:
                img = side["img"]
            if side["img"] != img:
                raise ValueError(f"{cid}: cached at img {side['img']}, expected {img}")
            for key in ("image", "mask"):
                entry = side["files"][key]
                arr = np.load(self.cache_dir / entry["name"], mmap_mode="r")
                if list(arr.shape) != entry["shape"] or str(arr.dtype) != entry["dtype"]:
                    raise ValueError(f"{cid}: cached {key} is {arr.dtype}{list(arr.shape)}, sidecar "
                                     f"says {entry['dtype']}{entry['shape']}")
                del arr
                if verify_hashes and sha256_file(self.cache_dir / entry["name"]) != entry["sha256"]:
                    raise ValueError(f"{cid}: cached {key} does not match its sha256")
            self.sidecars[cid] = side
            counts.append(int(side["num_slices"]))
        self.img = img
        self._starts = np.concatenate([[0], np.cumsum(counts)]).astype(np.int64)
        self._arrays: dict[int, tuple[np.ndarray, np.ndarray]] = {}

    def __len__(self) -> int:
        return int(self._starts[-1])

    def __getstate__(self):
        state = dict(self.__dict__)
        state["_arrays"] = {}
        return state

    def _open(self, ci: int) -> tuple[np.ndarray, np.ndarray]:
        arrays = self._arrays.get(ci)
        if arrays is None:
            side = self.sidecars[self.case_list[ci]]
            arrays = (np.load(self.cache_dir / side["files"]["image"]["name"], mmap_mode="r"),
                      np.load(self.cache_dir / side["files"]["mask"]["name"], mmap_mode="r"))
            self._arrays[ci] = arrays
        return arrays

    def _locate(self, index: int) -> tuple[int, int]:
        if index < 0:
            index += len(self)
        if not 0 <= index < len(self):
            raise IndexError(index)
        ci = int(np.searchsorted(self._starts, index, side="right") - 1)
        return ci, int(index - self._starts[ci])

    def locate(self, index: int) -> tuple[str, int]:
        """(case_id, slice index z) of dataset item `index`."""
        ci, z = self._locate(index)
        return self.case_list[ci], z

    def __getitem__(self, index: int):
        ci, z = self._locate(int(index))
        image, mask = self._open(ci)
        x = torch.from_numpy(np.array(image[z], dtype=np.float32))[None]
        y = torch.from_numpy(np.array(mask[z], dtype=np.float32))[None]
        return x, y

    def case_range(self, case_id: str) -> range:
        ci = self.case_list.index(self.allowlist.require(case_id))
        return range(int(self._starts[ci]), int(self._starts[ci + 1]))

    def case_arrays(self, case_id: str) -> tuple[np.ndarray, np.ndarray]:
        """Memory-mapped (image float16 [Z, img, img], mask uint8 [Z, img, img]) of one case."""
        return self._open(self.case_list.index(self.allowlist.require(case_id)))

    def native_mask(self, case_id: str) -> np.ndarray:
        """Memory-mapped native-resolution reference mask uint8 [Z, H, W]; needs native_mask=True."""
        entry = self.sidecars[self.allowlist.require(case_id)]["files"].get("mask_native")
        if not entry:
            raise FileNotFoundError(f"{case_id}: cache built without native_mask=True")
        return np.load(self.cache_dir / entry["name"], mmap_mode="r")
