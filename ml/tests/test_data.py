"""Tests for ml.data on a synthetic NRRD package (no real data, CPU only).

Run from the repository root:
    python -m pytest ml/tests -q
"""

from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path

import nrrd
import numpy as np
import pytest
import torch

from ml import data as D
from ml.tests import synth


@pytest.fixture(scope="module")
def pkg(tmp_path_factory):
    return synth.make_package(tmp_path_factory.mktemp("pkg"))


@pytest.fixture(scope="module")
def split(pkg):
    return D.load_split_manifest(pkg["split_manifest_path"])


@pytest.fixture(scope="module")
def dataset(pkg):
    return D.load_dataset_manifest(pkg["dataset_manifest_path"])


def train_paths(pkg, split, dataset, subset="100_percent"):
    allow = D.CaseAllowlist.for_training(split, subset)
    return D.case_paths(dataset, pkg["package_root"], allowlist=allow)


# --- configuration ---------------------------------------------------------------

def test_dr011_parameters_match_the_spike_config():
    cfg = json.loads((D.REPO_ROOT / "spikes" / "spike_c_ml" / "dr011_normalization.json")
                     .read_text(encoding="utf-8"))["implementation"]
    assert D.DR011 == {"p_low": float(cfg["p_low"]), "p_high": float(cfg["p_high"])}


# --- orientation -----------------------------------------------------------------

def test_axis_permutation_is_an_exact_inverse():
    a = np.arange(5 * 7 * 3, dtype=np.int32).reshape(5, 7, 3)        # (x, y, z)
    zyx = D.to_zyx(a)
    assert zyx.shape == (3, 7, 5)
    assert zyx[2, 6, 4] == a[4, 6, 2]
    back = D.to_nrrd_order(zyx)
    assert back.shape == a.shape and np.array_equal(back, a)
    assert np.shares_memory(zyx, a)                                    # a view, no copy


def test_load_case_orientation_matches_nrrd_axes(pkg, split, dataset):
    paths = train_paths(pkg, split, dataset)
    cid = "SYN_0002"
    files = paths[cid]
    mri_xyz, _ = nrrd.read(str(files.mri), index_order="F")
    mask_xyz, _ = nrrd.read(str(files.mask), index_order="F")
    image, mask = D.load_case(cid, paths)
    nx, ny, nz = synth.SHAPES[cid]
    assert image.shape == (nz, ny, nx) and mask.shape == (nz, ny, nx)
    assert image.dtype == np.float32 and mask.dtype == np.uint8
    assert np.array_equal(mask, D.to_zyx((mask_xyz > 0).astype(np.uint8)))
    # a known voxel, by hand: (x=5, y=9, z=3) -> [3, 9, 5]
    assert mask[3, 9, 5] == (mask_xyz[5, 9, 3] > 0)
    # slice k in ZYX is xyz[:, :, k].T, the Spike C0 convention
    lo, hi = np.percentile(mri_xyz, [D.DR011["p_low"], D.DR011["p_high"]]).astype(np.float32)
    expect = ((np.clip(mri_xyz[:, :, 2].T.astype(np.float32), lo, hi) - lo) / (hi - lo))
    assert np.allclose(image[2], expect, atol=1e-6)


def test_prediction_written_back_in_source_orientation(pkg, split, dataset, tmp_path):
    paths = train_paths(pkg, split, dataset)
    cid = "SYN_0001"
    _, header, _ = D.load_image(cid, paths)
    _, mask = D.load_case(cid, paths)
    out = tmp_path / "pred" / f"{cid}.nrrd"
    digest = D.write_mask_nrrd(out, mask, header)
    assert digest == hashlib.sha256(out.read_bytes()).hexdigest()
    back, back_header = nrrd.read(str(out), index_order="F")
    src, src_header = nrrd.read(str(paths[cid].mask), index_order="F")
    assert back.dtype == np.uint8 and back.shape == src.shape
    assert np.array_equal(back, (src > 0).astype(np.uint8))
    assert back_header["space"] == src_header["space"]
    assert np.array_equal(back_header["space directions"], src_header["space directions"])
    assert np.array_equal(back_header["space origin"], src_header["space origin"])
    with pytest.raises(FileExistsError):
        D.write_mask_nrrd(out, mask, header)                            # immutable
    assert hashlib.sha256(out.read_bytes()).hexdigest() == digest      # untouched
    # same mask -> same bytes (no wall-clock stamp in the header)
    assert D.write_mask_nrrd(tmp_path / "pred2" / f"{cid}.nrrd", mask, header) == digest
    assert b"(GMT)" not in out.read_bytes().partition(b"\n\n")[0]
    with pytest.raises(ValueError):
        D.write_mask_nrrd(tmp_path / "bad.nrrd", np.full_like(mask, 2), header)
    with pytest.raises(TypeError):
        D.write_mask_nrrd(tmp_path / "bad2.nrrd", mask.astype(np.float32), header)
    assert not list(tmp_path.glob("**/*.tmp"))                          # no temp file left


# --- intensity -------------------------------------------------------------------

def test_normalization_range_and_per_volume_bounds(pkg, split, dataset):
    paths = train_paths(pkg, split, dataset)
    for cid in synth.SUBSETS["100_percent"]:
        image, _, info = D.load_image(cid, paths)
        assert image.dtype == np.float32
        assert image.min() >= 0.0 and image.max() <= 1.0
        assert image.min() == 0.0 and image.max() == 1.0              # clipped range spans [0, 1]
        raw, _ = nrrd.read(str(paths[cid].mri), index_order="F")
        lo, hi = np.percentile(raw, [0.5, 99.5])
        assert info["dr011_lo"] == pytest.approx(lo) and info["dr011_hi"] == pytest.approx(hi)


def test_dr011_constant_volume_is_zero():
    out = D.dr011_normalize(np.full((4, 5, 6), 17, np.uint8))
    assert out.dtype == np.float32 and not out.any()


def test_binarize_refuses_a_non_binary_mask():
    with pytest.raises(ValueError):
        D.binarize_mask(np.array([[[0, 1, 2]]], np.uint8))
    assert D.binarize_mask(np.array([[[0, 255]]], np.uint8)).tolist() == [[[0, 1]]]


# --- resizing --------------------------------------------------------------------

@pytest.mark.parametrize("img", [16, 28, 50, 112])
def test_nearest_resize_keeps_labels(pkg, split, dataset, img):
    paths = train_paths(pkg, split, dataset)
    _, mask = D.load_case("SYN_0002", paths)
    r = D.resize_mask_stack(mask, img)
    assert r.dtype == np.uint8 and r.shape == (mask.shape[0], img, img)
    assert set(np.unique(r).tolist()) <= {0, 1}
    assert r[0].sum() == 0                                             # empty slice stays empty
    assert r[2].sum() > 0
    ones = D.resize_mask_stack(np.ones((2, 33, 47), np.uint8), img)
    assert ones.all()


def test_image_resize_stays_in_unit_range(pkg, split, dataset):
    paths = train_paths(pkg, split, dataset)
    image, _ = D.load_case("SYN_0001", paths)
    r = D.resize_image_stack(image, 112)
    assert r.dtype == np.float32 and r.shape == (image.shape[0], 112, 112)
    assert r.min() >= 0.0 and r.max() <= 1.0


def test_resize_logits_back_and_threshold():
    logits = torch.zeros(3, 16, 16)
    logits[:, :8] = 4.0
    logits[:, 8:] = -4.0
    back = D.resize_logits_back(logits, (36, 40))
    assert back.shape == (3, 36, 40) and back.dtype == torch.float32
    m = D.logits_to_mask(back)
    assert m.dtype == torch.uint8 and set(torch.unique(m).tolist()) <= {0, 1}
    assert m[:, :17].all() and not m[:, 19:].any()
    as_np = D.resize_logits_back(np.full((2, 8, 8), 1.5, np.float32), (10, 12))
    assert isinstance(as_np, np.ndarray) and np.allclose(as_np, 1.5)
    # threshold 0.5 on the probability: sigmoid(0) = 0.5 counts as foreground
    assert D.logits_to_mask(np.array([[[0.0, -1e-3]]], np.float32)).tolist() == [[[1, 0]]]


# --- fail-closed access ----------------------------------------------------------

def test_holdout_is_refused_without_the_explicit_flag(pkg, split, dataset):
    hold = synth.HOLDOUT[0]
    with pytest.raises(D.HoldoutAccessError):
        D.CaseAllowlist([hold], split)
    with pytest.raises(D.HoldoutAccessError):
        D.CaseAllowlist.for_holdout(split, allow_holdout=False)
    with pytest.raises(TypeError):
        D.CaseAllowlist([hold], split, allow_holdout=1)                 # must be literally True
    paths = train_paths(pkg, split, dataset)
    with pytest.raises(D.HoldoutAccessError):
        D.load_case(hold, paths)
    with pytest.raises(D.HoldoutAccessError):
        paths[hold]
    allowed = D.CaseAllowlist.for_holdout(split, allow_holdout=True)
    hpaths = D.case_paths(dataset, pkg["package_root"], allowlist=allowed)
    image, mask = D.load_case(hold, hpaths)
    assert image.shape == mask.shape


def test_allowlist_refuses_everything_else(pkg, split, dataset, tmp_path):
    paths = train_paths(pkg, split, dataset, "25_percent")
    with pytest.raises(D.CaseNotAllowedError):
        D.load_case("SYN_0002", paths)                                  # train, not in this subset
    with pytest.raises(D.CaseNotAllowedError):
        D.load_case(synth.VALIDATION[0], paths)
    with pytest.raises(D.CaseNotAllowedError):
        D.CaseAllowlist(["SYN_9999"], split)                            # unknown to the split
    with pytest.raises(D.CaseNotAllowedError):
        D.CaseAllowlist(synth.EXCLUDED, split)                          # training exclusion
    D.CaseAllowlist(synth.EXCLUDED, split, allow_training_excluded=True)
    with pytest.raises(TypeError):
        D.CaseAllowlist("SYN_0001", split)
    with pytest.raises(ValueError):
        D.CaseAllowlist(["SYN_0001", "SYN_0001"], split)
    with pytest.raises(ValueError):
        D.CaseAllowlist([], split)
    with pytest.raises(TypeError):
        D.case_paths(dataset, pkg["package_root"], allowlist=["SYN_0001"])
    with pytest.raises(D.CaseNotAllowedError):
        D.build_cache(["SYN_0002"], paths, 16, tmp_path / "cache")
    with pytest.raises(TypeError):
        D.SliceDataset(["SYN_0001"], tmp_path / "cache")


def test_split_manifest_with_overlapping_partitions_is_refused(split):
    bad = json.loads(json.dumps(split))
    bad["partitions"]["validation"]["case_ids"].append(synth.HOLDOUT[0])
    with pytest.raises(ValueError):
        D.validate_split_manifest(bad)
    bad = json.loads(json.dumps(split))
    bad["training_subsets"]["100_percent"]["effective_case_ids"].append(synth.EXCLUDED[0])
    with pytest.raises(ValueError):
        D.validate_split_manifest(bad)


# --- cache -----------------------------------------------------------------------

def test_cache_round_trip(pkg, split, dataset, tmp_path):
    img = 28
    paths = train_paths(pkg, split, dataset)
    allow = paths.allowlist
    cache = tmp_path / "cache" / synth.SPLIT_ID / f"img{img}"
    summary = D.build_cache(allow, paths, img, cache, native_mask=True, log=None)
    assert {v["status"] for v in summary["cases"].values()} == {"built"}
    for cid in allow:
        side = D.read_cache_sidecar(cache, cid)
        files = paths[cid]
        assert side["source"]["mri"]["sha256"] == hashlib.sha256(files.mri.read_bytes()).hexdigest()
        assert side["source"]["mask"]["sha256"] == hashlib.sha256(files.mask.read_bytes()).hexdigest()
        assert side["preprocessing_version"] == D.PREPROCESSING_VERSION
        assert side["partition"] == "train" and side["split_id"] == synth.SPLIT_ID
        im = np.load(cache / side["files"]["image"]["name"])
        mk = np.load(cache / side["files"]["mask"]["name"])
        nat = np.load(cache / side["files"]["mask_native"]["name"])
        image, mask = D.load_case(cid, paths)
        assert im.dtype == np.float16 and im.shape == (image.shape[0], img, img)
        assert mk.dtype == np.uint8 and set(np.unique(mk).tolist()) <= {0, 1}
        assert np.array_equal(nat, mask)
        assert np.allclose(im.astype(np.float32), D.resize_image_stack(image, img), atol=5e-4)
        assert np.array_equal(mk, D.resize_mask_stack(mask, img))
        assert side["files"]["image"]["sha256"] == hashlib.sha256(
            (cache / side["files"]["image"]["name"]).read_bytes()).hexdigest()

    again = D.build_cache(allow, paths, img, cache, native_mask=True, log=None)
    assert {v["status"] for v in again["cases"].values()} == {"reused"}

    ds = D.SliceDataset(allow, cache, verify_hashes=True)
    assert len(ds) == sum(synth.SHAPES[c][2] for c in allow)
    x, y = ds[0]
    assert x.shape == (1, img, img) and y.shape == (1, img, img)
    assert x.dtype == torch.float32 and y.dtype == torch.float32
    assert float(x.min()) >= 0.0 and float(x.max()) <= 1.0
    assert set(torch.unique(y).tolist()) <= {0.0, 1.0}
    cid, z = ds.locate(len(ds) - 1)
    assert cid == allow.case_ids[-1] and z == synth.SHAPES[cid][2] - 1
    im_mm, mk_mm = ds.case_arrays(cid)
    x_last, y_last = ds[-1]
    assert torch.equal(x_last[0], torch.from_numpy(np.asarray(im_mm[z], np.float32)))
    assert torch.equal(y_last[0], torch.from_numpy(np.asarray(mk_mm[z], np.float32)))
    assert ds.native_mask(cid).shape == tuple(reversed(synth.SHAPES[cid]))
    assert list(ds.case_range(cid)) == list(range(len(ds) - synth.SHAPES[cid][2], len(ds)))
    # pickling (DataLoader workers on Windows) must not carry open memory maps
    clone = pickle.loads(pickle.dumps(ds))
    assert clone._arrays == {} and torch.equal(clone[0][0], x)
    loader = torch.utils.data.DataLoader(ds, batch_size=4, shuffle=False)
    xb, yb = next(iter(loader))
    assert xb.shape == (4, 1, img, img) and yb.shape == (4, 1, img, img)


def test_cache_entry_from_another_split_is_refused(pkg, split, dataset, tmp_path):
    img = 16
    paths = train_paths(pkg, split, dataset, "25_percent")
    cache = tmp_path / "c"
    D.build_cache(paths.allowlist, paths, img, cache, log=None)
    side_path = cache / "SYN_0001.json"
    side = json.loads(side_path.read_text(encoding="utf-8"))
    side["split_id"] = "some_other_split"
    side_path.write_text(json.dumps(side), encoding="utf-8")
    with pytest.raises(ValueError):
        D.SliceDataset(paths.allowlist, cache)


def test_holdout_cache_entry_is_refused_by_the_dataset(pkg, split, dataset, tmp_path):
    img = 16
    allowed = D.CaseAllowlist.for_holdout(split, allow_holdout=True)
    hpaths = D.case_paths(dataset, pkg["package_root"], allowlist=allowed)
    cache = tmp_path / "h"
    D.build_cache(allowed, hpaths, img, cache, log=None)
    assert D.read_cache_sidecar(cache, synth.HOLDOUT[0])["partition"] == "final_holdout"
    D.SliceDataset(allowed, cache)                                       # explicit holdout access
    # a forged allowlist object that names the holdout case without the flag
    forged = D.CaseAllowlist.for_training(split, "25_percent")
    forged._ids, forged._set = (synth.HOLDOUT[0],), frozenset(synth.HOLDOUT)
    with pytest.raises(D.HoldoutAccessError):
        D.SliceDataset(forged, cache)


def test_cache_dir_inside_git_is_refused(pkg, split, dataset):
    paths = train_paths(pkg, split, dataset, "25_percent")
    with pytest.raises(ValueError):
        D.build_cache(paths.allowlist, paths, 16, D.REPO_ROOT / "ml" / "_cache_must_not_exist", log=None)
    assert not (D.REPO_ROOT / "ml" / "_cache_must_not_exist").exists()


# --- the real manifests (structure only; no dataset bytes are read) ----------------

def test_real_dataset_manifest_maps_case_ids_to_nrrd_paths():
    m = D.load_dataset_manifest()
    assert len(m["cases"]) == 154
    for c in m["cases"]:
        assert c["mri"]["path_relative"].endswith("lgemri.nrrd")
        assert c["mask"]["path_relative"].endswith("laendo.nrrd")
        assert len(c["mri"]["shape"]) == 3 and c["mri"]["shape"][2] == 88


def test_real_split_manifest_when_present():
    if not D.DEFAULT_SPLIT_MANIFEST.exists():
        pytest.skip("split manifest not on this branch yet (PR #35)")
    split = D.load_split_manifest()
    assert len(D.holdout_case_ids(split)) == 54
    assert [len(D.subset_case_ids(split, k)) for k in ("25_percent", "50_percent", "100_percent")] \
        == [20, 38, 78]
    known = {c["case_id"] for c in D.load_dataset_manifest()["cases"]}
    assert set(D.partition_of(split)) <= known
    with pytest.raises(D.HoldoutAccessError):
        D.CaseAllowlist(sorted(D.holdout_case_ids(split))[:1], split)
    for key in ("25_percent", "50_percent", "100_percent"):
        allow = D.CaseAllowlist.for_training(split, key)
        assert not (set(allow) & D.holdout_case_ids(split))
