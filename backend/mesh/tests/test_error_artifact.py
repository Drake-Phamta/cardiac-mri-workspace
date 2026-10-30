"""The served error artifact ``cardiac-errormesh/2`` (DR-005; SCR-05 error map, H6 / H7; TC-ERR-001, TC-3D-005, FR-3D-008).

A synthetic, hand-checkable pair: a ground-truth block, a prediction that misses one slab of it (false negatives) and
adds a slab beside it plus one far voxel (false positives). Every expected number below is derived by hand from those
voxel lists, or from scipy's own labelling called here, not from the code under test. Axis order is the contract's
``x=column,y=row,z=slice``. All data is synthetic; run ``python backend/mesh/tests/test_error_artifact.py
--write-golden`` to regenerate the golden that ``mobile/test/v2_*.test.mjs`` reads.

The regions (connected components of FP and FN) are checked against an independent oracle: ``scipy.ndimage.label`` with
``generate_binary_structure`` called in this file, for connectivities 6, 18 and 26, on the golden pair, on cases where
voxels touch only diagonally, and on random pairs.
"""

from __future__ import annotations

import base64
import hashlib
import json
import struct
import sys
from pathlib import Path

import numpy as np
import pytest

# The regions are labelled with scipy (build time only; not part of the backend runtime pins, QA-074 N-4): CI runs this
# module in the step that installs it, and the no-scipy step skips it.
ndimage = pytest.importorskip("scipy.ndimage")

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.mesh import GeometryError, artifact, build_case_mesh, error_artifact as ea  # noqa: E402

GOLDEN = Path(__file__).resolve().parent / "golden" / "known_errors_errormesh.json"
SHAPE = (8, 7, 6)                       # [Nx, Ny, Nz]
PRED_SHA = "a" * 64                     # synthetic digests: the artifact only records them
REF_SHA = "b" * 64
RANK = {6: 1, 18: 2, 26: 3}             # generate_binary_structure(3, rank) for each declared connectivity


def box(x, y, z):
    """Voxels (x, y, z) of the half-open ranges, as a set."""
    return {(i, j, k) for i in range(*x) for j in range(*y) for k in range(*z)}


# The ground truth: a 4 x 3 x 4 block.
REFERENCE = box((2, 6), (2, 5), (1, 5))
# False negatives: a 2 x 1 x 2 slab at one corner of the block (4 voxels, slices 1 and 2).
FN_VOXELS = box((2, 4), (2, 3), (1, 3))
# False positives: a 1 x 2 x 2 slab on the +x side of the block (slices 3 and 4) and one far voxel in slice 5.
FP_SLAB = box((6, 7), (3, 5), (3, 5))
FP_FAR = {(0, 6, 5)}
FP_VOXELS = FP_SLAB | FP_FAR
PREDICTION = (REFERENCE - FN_VOXELS) | FP_VOXELS


def volume(voxels, shape_xyz=SHAPE):
    """A (z, y, x) uint8 {0, 255} volume with the given (x=column, y=row, z=slice) voxels set."""
    nx, ny, nz = shape_xyz
    out = np.zeros((nz, ny, nx), dtype=np.uint8)
    for x, y, z in voxels:
        out[z, y, x] = 255
    return out


def build(prediction=PREDICTION, reference=REFERENCE, shape=SHAPE, pred_sha=PRED_SHA, ref_sha=REF_SHA, **kwargs):
    return ea.build_error_artifact(volume(prediction, shape), volume(reference, shape),
                                   prediction_sha256=pred_sha, reference_sha256=ref_sha, **kwargs)


def voxel_behind_each_face(decoded):
    """The voxel behind each triangle: its centroid pushed half a voxel against the outward normal."""
    v = decoded["vertices"].astype(np.float64)
    tri = decoded["triangles"].astype(np.int64)
    p0, p1, p2 = v[tri[:, 0]], v[tri[:, 1]], v[tri[:, 2]]
    normal = np.cross(p1 - p0, p2 - p0)
    normal /= np.linalg.norm(normal, axis=1)[:, None]
    return np.floor((p0 + p1 + p2) / 3.0 - 0.5 * normal).astype(np.int64)


def class_block(decoded, name):
    entry = next(item for item in decoded["header"]["classes"] if item["name"] == name)
    return slice(*entry["triangle_range"]), entry


def oracle_regions(voxels, connectivity, shape=SHAPE):
    """The connected regions of a voxel set from scipy's own labelling (this file's call, not the builder's):
    ``(label volume, {label: set of voxels})``."""
    mask = np.zeros(shape, dtype=bool)
    for voxel in voxels:
        mask[voxel] = True
    labels, n = ndimage.label(mask, structure=ndimage.generate_binary_structure(3, RANK[connectivity]))
    regions = {label: set() for label in range(1, n + 1)}
    for voxel in voxels:
        regions[int(labels[voxel])].add(voxel)
    return labels, regions


def check_regions_against_the_oracle(payload, prediction, reference, connectivity, shape=SHAPE):
    """Component numbers and the component table of an artifact equal scipy's labelling of the two class sets."""
    decoded = ea.decode_error_mesh(payload)
    header = decoded["header"]
    assert header["connectivity"] == connectivity
    behind = voxel_behind_each_face(decoded)
    numbers = decoded["face_component"].astype(np.int64)
    total = 0
    for name, class_set in (("FP", prediction - reference), ("FN", reference - prediction)):
        labels, regions = oracle_regions(class_set, connectivity, shape)
        rows, entry = class_block(decoded, name)
        first, end = entry["component_range"]
        label_of = {}                                   # region number in the file -> scipy label
        for t in range(rows.start, rows.stop):
            voxel = tuple(int(c) for c in behind[t])
            scipy_label = int(labels[voxel])
            assert scipy_label > 0, f"triangle {t}: the voxel behind a {name} face is in no {name} region"
            assert label_of.setdefault(int(numbers[t]), scipy_label) == scipy_label, \
                f"triangle {t}: faces of one region number lie on voxels of two scipy regions"
        assert sorted(label_of) == list(range(first, end)), f"{name}: every region of the table owns faces"
        assert sorted(label_of.values()) == sorted(regions), f"{name}: the regions are exactly scipy's, once each"
        sizes = []
        for number, scipy_label in label_of.items():
            row = header["components"][number - 1]
            voxels = regions[scipy_label]
            assert (row["class"], row["voxels"]) == (name, len(voxels))
            z = sorted({v[2] for v in voxels})
            # the slice list is the z set of the region's voxels, with their counts
            assert z == list(range(row["first_slice"], row["first_slice"] + len(row["slice_voxels"])))
            assert row["slice_voxels"] == [sum(1 for v in voxels if v[2] == value) for value in z]
            sizes.append((number, row["voxels"]))
        assert [n for _, n in sorted(sizes)] == sorted((n for _, n in sizes), reverse=True), f"{name}: largest first"
        assert [header["components"][k - 1]["id"] for k in range(first, end)] == \
            [f"{name}_{rank:04d}" for rank in range(1, end - first + 1)]
        total += len(regions)
    assert header["component_count"] == total == len(header["components"])
    return decoded


# -- the data shape -----------------------------------------------------------------------------

def test_the_header_names_the_classes_ranges_regions_and_both_source_masks():
    payload, info = build()
    header = ea.read_error_header(payload)
    assert header["format"] == "cardiac-errormesh/2" and header["builder"] == "dr005-L0/v2"
    assert header["frame"] == "voxel-index" and header["level"] == 0
    assert header["shape"] == list(SHAPE) and header["index_convention"] == "x=column,y=row,z=slice"
    assert header["reference_mask_sha256"] == REF_SHA and header["prediction_mask_sha256"] == PRED_SHA
    fp, fn = header["classes"]
    assert (fp["name"], fp["code"], fp["voxels"]) == ("FP", 1, 5)
    assert (fn["name"], fn["code"], fn["voxels"]) == ("FN", 2, 4)
    assert fp["rule"] == "prediction AND NOT ground truth" and fn["rule"] == "ground truth AND NOT prediction"
    # FP: the slab has 16 faces (32 triangles, 18 corners), the far voxel 6 faces (12 triangles, 8 corners).
    assert fp["triangle_range"] == [0, 44] and fp["vertex_range"] == [0, 26]
    # FN: a 2 x 1 x 2 slab has 16 faces (32 triangles, 18 corners); its block follows the FP block.
    assert fn["triangle_range"] == [44, 76] and fn["vertex_range"] == [26, 44]
    assert header["vertex_count"] == 44 and header["triangle_count"] == 76 and header["agreement_voxels"] == 44
    # regions, derived by hand: the FP slab (x = 6, y 3..4, z 3..4: 2 voxels on each of slices 3 and 4), the far FP voxel
    # (slice 5), the FN slab (x 2..3, y = 2, z 1..2: 2 voxels on each of slices 1 and 2); FP first, then FN
    assert header["connectivity"] == 26 and header["component_count"] == 3 and header["component_index_bytes"] == 1
    assert fp["component_range"] == [1, 3] and fn["component_range"] == [3, 4]
    assert header["components"] == [
        {"id": "FP_0001", "class": "FP", "voxels": 4, "first_slice": 3, "slice_voxels": [2, 2]},
        {"id": "FP_0002", "class": "FP", "voxels": 1, "first_slice": 5, "slice_voxels": [1]},
        {"id": "FN_0001", "class": "FN", "voxels": 4, "first_slice": 1, "slice_voxels": [2, 2]},
    ]
    assert info["fp_voxels"] == 5 and info["fn_voxels"] == 4 and info["tp_voxels"] == 44
    assert info["fp_triangles"] == 44 and info["fn_triangles"] == 32
    assert (info["component_count"], info["fp_components"], info["fn_components"], info["connectivity"]) == (3, 2, 1, 26)
    assert info["header_bytes"] == struct.unpack_from("<I", payload, 8)[0]
    assert info["bytes"] == len(payload) and info["mesh_sha256"] == hashlib.sha256(payload).hexdigest()
    assert len(payload) % 4 == 0


def test_every_face_has_the_class_and_the_source_slice_of_the_voxel_behind_it():
    """TC-ERR-001 / TC-3D-005: classes match the boolean mask operations, and a face names the slice of its voxel."""
    decoded = ea.decode_error_mesh(build()[0])
    voxels = voxel_behind_each_face(decoded)
    classes, slices = decoded["face_class"], decoded["face_source_slice"]
    # the oracle: plain set arithmetic on the voxel lists, not the numpy operations of the builder
    expected_fp = PREDICTION - REFERENCE
    expected_fn = REFERENCE - PREDICTION
    assert expected_fp == FP_VOXELS and expected_fn == FN_VOXELS
    for t in range(decoded["triangles"].shape[0]):
        voxel = tuple(int(c) for c in voxels[t])
        if classes[t] == 1:
            assert voxel in expected_fp and voxel not in REFERENCE, (t, voxel)
        else:
            assert classes[t] == 2 and voxel in expected_fn and voxel not in PREDICTION, (t, voxel)
        assert int(slices[t]) == voxel[2], f"triangle {t}: the source slice is the z of the voxel behind the face"
    assert set(classes.tolist()) == {1, 2}
    assert set(slices[classes == 1].tolist()) == {3, 4, 5} and set(slices[classes == 2].tolist()) == {1, 2}


def test_a_class_surface_is_exactly_the_l0_surface_of_its_voxel_set():
    """The per-face rule is the surface artifact's own: same vertices, winding and source slices as ``build_case_mesh``."""
    decoded = ea.decode_error_mesh(build()[0])
    for name, voxels in (("FP", FP_VOXELS), ("FN", FN_VOXELS)):
        reference = artifact.decode_mesh(artifact.build_mesh_artifact(volume(voxels))[0])
        rows, entry = class_block(decoded, name)
        v0, v1 = entry["vertex_range"]
        assert np.array_equal(decoded["vertices"][v0:v1], reference["vertices"]), name
        assert np.array_equal(decoded["triangles"][rows].astype(np.int64) - v0, reference["triangles"].astype(np.int64)), name
        assert np.array_equal(decoded["face_source_slice"][rows], reference["face_source_slice"]), name


def test_the_classes_are_the_boolean_operations_on_the_masks():
    prediction = volume(PREDICTION)
    reference = volume(REFERENCE)
    fp, fn, tp = ea.error_sets(np.transpose(prediction != 0, (2, 1, 0)), np.transpose(reference != 0, (2, 1, 0)))
    assert {tuple(int(c) for c in v) for v in np.argwhere(fp)} == FP_VOXELS
    assert {tuple(int(c) for c in v) for v in np.argwhere(fn)} == FN_VOXELS
    assert {tuple(int(c) for c in v) for v in np.argwhere(tp)} == REFERENCE - FN_VOXELS
    assert not (fp & fn).any() and not (fp & tp).any() and not (fn & tp).any()


def test_the_bytes_are_a_pure_function_of_both_masks_their_digests_and_the_connectivity():
    first, info = build()
    again, info_again = build()
    assert first == again and info == info_again
    other_pred, _ = build(pred_sha="c" * 64)
    other_ref, _ = build(ref_sha="d" * 64)
    assert other_pred != first and other_ref != first, "the source digests are part of the identity"
    assert build(connectivity=6)[0] != first, "the connectivity is part of the identity (it is in the header)"
    assert artifact.MAGIC == first[:8], "the container is the surface artifact's"


# -- regions (FR-3D-008): equal to scipy's labelling --------------------------------------------

@pytest.mark.parametrize("connectivity", [6, 18, 26])
def test_the_regions_of_the_known_pair_equal_scipys_labelling(connectivity):
    check_regions_against_the_oracle(build(connectivity=connectivity)[0], PREDICTION, REFERENCE, connectivity)


# A second voxel that touches (2, 2, 2) at a corner, along an edge, across a face: how many regions the pair is under
# each connectivity (the same table as test_mesh_error_geometry.py, here for the served artifact).
DIAGONAL = [
    ((3, 3, 3), {6: 2, 18: 2, 26: 1}),
    ((3, 3, 2), {6: 2, 18: 1, 26: 1}),
    ((3, 2, 2), {6: 1, 18: 1, 26: 1}),
]


@pytest.mark.parametrize("second, expected", DIAGONAL)
def test_voxels_that_touch_only_diagonally_are_one_region_or_two_depending_on_the_connectivity(second, expected):
    prediction = {(2, 2, 2), second, (6, 5, 0)}              # the third voxel is far from both
    for connectivity, count in expected.items():
        payload, info = build(prediction=prediction, reference=set(), connectivity=connectivity)
        decoded = check_regions_against_the_oracle(payload, prediction, set(), connectivity)
        # `count` regions hold the pair, one more holds the far voxel
        assert info["fp_components"] == count + 1 and decoded["header"]["component_count"] == count + 1
        behind = voxel_behind_each_face(decoded)
        named = {}                                           # voxel -> the region numbers its faces carry
        for t in range(len(behind)):
            named.setdefault(tuple(int(c) for c in behind[t]), set()).add(int(decoded["face_component"][t]))
        assert all(len(numbers) == 1 for numbers in named.values()), "all faces of a voxel name one region"
        # the faces of the pair name one region exactly when the connectivity joins the two voxels
        joined = named[(2, 2, 2)] == named[second]
        assert joined == (count == 1), (connectivity, second)
        assert len({next(iter(numbers)) for numbers in named.values()}) == count + 1


def test_a_region_that_steps_diagonally_between_slices_keeps_its_slices_contiguous():
    corner = {(2, 2, 2), (3, 3, 3)}
    one = ea.read_error_header(build(prediction=corner, reference=set(), connectivity=26)[0])["components"]
    two = ea.read_error_header(build(prediction=corner, reference=set(), connectivity=6)[0])["components"]
    assert one == [{"id": "FP_0001", "class": "FP", "voxels": 2, "first_slice": 2, "slice_voxels": [1, 1]}]
    assert [(c["id"], c["voxels"], c["first_slice"], c["slice_voxels"]) for c in two] == [
        ("FP_0001", 1, 2, [1]), ("FP_0002", 1, 3, [1])]


@pytest.mark.parametrize("seed", [1, 2, 3, 4])
@pytest.mark.parametrize("connectivity", [6, 26])
def test_regions_of_random_pairs_equal_scipys_labelling(seed, connectivity):
    rng = np.random.default_rng(seed)
    shape = (9, 8, 7)
    reference = rng.random(shape) < 0.3
    prediction = reference.copy()
    flip = rng.random(shape) < 0.25
    prediction[flip] = ~prediction[flip]
    as_set = lambda a: {tuple(int(c) for c in v) for v in np.argwhere(a)}  # noqa: E731
    payload, _ = build(prediction=as_set(prediction), reference=as_set(reference), shape=shape, connectivity=connectivity)
    check_regions_against_the_oracle(payload, as_set(prediction), as_set(reference), connectivity, shape)


def test_a_region_has_every_slice_between_its_first_and_last_and_the_faces_stay_inside_it():
    """A connected set has no gap in z; every face of a region lies on one of the region's own slices."""
    decoded = ea.decode_error_mesh(build()[0])
    components = decoded["header"]["components"]
    for t in range(decoded["triangles"].shape[0]):
        row = components[int(decoded["face_component"][t]) - 1]
        z = int(decoded["face_source_slice"][t])
        assert row["first_slice"] <= z < row["first_slice"] + len(row["slice_voxels"])
        assert row["slice_voxels"][z - row["first_slice"]] > 0
    for row in components:
        assert row["voxels"] == sum(row["slice_voxels"]) and min(row["slice_voxels"]) >= 1


def test_the_connectivity_is_recorded_and_only_6_18_and_26_are_accepted():
    assert ea.read_error_header(build(connectivity=18)[0])["connectivity"] == 18
    assert build(connectivity=18)[1]["connectivity"] == 18
    for bad in (7, 0, 27, True, "26", None):
        with pytest.raises(GeometryError) as raised:
            build(connectivity=bad)
        assert raised.value.code == "CONNECTIVITY_UNSUPPORTED"


def test_the_region_number_uses_the_smallest_of_1_2_and_4_bytes():
    assert [ea.component_index_bytes(n) for n in (0, 1, 255, 256, 65535, 65536, 2 ** 32 - 1)] == [1, 1, 1, 2, 2, 4, 4]


# -- the pick rule ------------------------------------------------------------------------------

def pick(decoded, origin, direction):
    triangle = ea.pick_triangle(decoded, origin, direction)
    if triangle is None:
        return None
    return (int(decoded["face_source_slice"][triangle]), ea.CLASS_NAME[int(decoded["face_class"][triangle])],
            int(decoded["face_component"][triangle]))


# (origin, direction, expected (slice, class, region number) or None): every one derived by hand from the voxel lists above.
PICKS = [
    # the +z face of the FP voxel (6, 3, 4) lies on the plane z = 5: the pick rule says slice 4, the floor rule 5
    ([6.5, 3.5, 20.0], [0.0, 0.0, -1.0], (4, "FP", 1)),
    ([0.5, 6.5, 20.0], [0.0, 0.0, -1.0], (5, "FP", 2)),            # the far FP voxel (0, 6, 5), top face on z = 6
    ([-5.0, 2.5, 1.5], [1.0, 0.0, 0.0], (1, "FN", 3)),             # from -x into the FN slab: voxel (2, 2, 1)
    ([2.5, 2.5, -5.0], [0.0, 0.0, 1.0], (1, "FN", 3)),             # from below: the -z face of the FN voxel (2, 2, 1)
    ([2.5, 2.5, 20.0], [0.0, 0.0, -1.0], (2, "FN", 3)),            # from above, error surfaces only: FN voxel (2, 2, 2)
    ([20.0, 3.5, 3.5], [-1.0, 0.0, 0.0], (3, "FP", 1)),            # from +x into the FP slab: voxel (6, 3, 3)
    ([-5.0, 3.5, 3.5], [1.0, 0.0, 0.0], (3, "FP", 1)),             # through the true-positive block to the slab's -x face
    ([3.5, 4.5, 20.0], [0.0, 0.0, -1.0], None),                    # above true positives only: no error, no navigation
    ([7.5, 0.5, 20.0], [0.0, 0.0, -1.0], None),                    # the empty corner
]


@pytest.mark.parametrize("origin,direction,expected", PICKS)
def test_a_pick_resolves_the_first_error_face_to_its_slice_class_and_region(origin, direction, expected):
    assert pick(ea.decode_error_mesh(build()[0]), origin, direction) == expected


# -- zero, one-sided and impossible inputs -----------------------------------------------------

def test_a_prediction_equal_to_the_ground_truth_is_an_artifact_with_no_face_and_no_region():
    payload, info = build(prediction=REFERENCE)
    decoded = ea.decode_error_mesh(payload)
    assert decoded["header"]["vertex_count"] == 0 and decoded["header"]["triangle_count"] == 0
    assert [entry["voxels"] for entry in decoded["header"]["classes"]] == [0, 0]
    assert decoded["header"]["components"] == [] and decoded["header"]["component_count"] == 0
    assert [entry["component_range"] for entry in decoded["header"]["classes"]] == [[1, 1], [1, 1]]
    assert info["fp_voxels"] == info["fn_voxels"] == 0 and info["tp_voxels"] == len(REFERENCE)
    assert info["component_count"] == 0 and pick(decoded, [3.5, 3.5, 20.0], [0.0, 0.0, -1.0]) is None


def test_an_empty_prediction_is_all_false_negatives_and_an_empty_ground_truth_all_false_positives():
    decoded = ea.decode_error_mesh(build(prediction=set())[0])
    fp, fn = decoded["header"]["classes"]
    assert fp["voxels"] == 0 and fp["triangle_range"] == [0, 0] and fn["voxels"] == len(REFERENCE)
    assert fp["component_range"] == [1, 1] and fn["component_range"] == [1, 2]
    assert set(decoded["face_class"].tolist()) == {2} and set(decoded["face_component"].tolist()) == {1}
    decoded = ea.decode_error_mesh(build(reference=set())[0])
    fp, fn = decoded["header"]["classes"]
    assert fn["voxels"] == 0 and fn["triangle_range"][0] == fn["triangle_range"][1] and fp["voxels"] == len(PREDICTION)
    assert fn["component_range"][0] == fn["component_range"][1]
    assert set(decoded["face_class"].tolist()) == {1}


def test_two_volumes_that_are_not_one_grid_or_a_bad_digest_are_refused():
    with pytest.raises(artifact.MeshArtifactError) as raised:
        ea.build_error_artifact(volume(PREDICTION), volume(REFERENCE, (8, 7, 7)), prediction_sha256=PRED_SHA,
                                reference_sha256=REF_SHA)
    assert raised.value.code == "SHAPE_MISMATCH"
    for bad in ("", "A" * 64, "a" * 63, None):
        with pytest.raises(artifact.MeshArtifactError) as raised:
            build(pred_sha=bad)
        assert raised.value.code == "MASK_DIGEST"


def test_four_byte_indices_above_65535_vertices_and_two_byte_region_numbers_above_255_regions():
    """A noisy prediction: a lattice of isolated voxels has 8 corners each, so 8192 of them pass 65,535 vertices - and
    are 8192 regions, more than a byte holds."""
    nx, ny, nz = 64, 64, 16
    voxels = {(x, y, z) for x in range(0, nx, 2) for y in range(0, ny, 2) for z in range(0, nz, 2)}
    assert len(voxels) * 8 > 65535
    payload, info = ea.build_error_artifact(volume(voxels, (nx, ny, nz)), volume(set(), (nx, ny, nz)),
                                            prediction_sha256=PRED_SHA, reference_sha256=REF_SHA)
    decoded = ea.decode_error_mesh(payload)
    assert decoded["header"]["index_bytes"] == 4 and decoded["triangles"].dtype == np.dtype("<u4")
    assert decoded["header"]["vertex_count"] == info["vertex_count"] == len(voxels) * 8
    assert int(decoded["triangles"].max()) < info["vertex_count"] and set(decoded["face_class"].tolist()) == {1}
    assert decoded["header"]["component_count"] == len(voxels) == 8192
    assert decoded["header"]["component_index_bytes"] == 2 and decoded["face_component"].dtype == np.dtype("<u2")
    assert int(decoded["face_component"].max()) == 8192 and int(decoded["face_component"].min()) == 1


# -- a damaged or foreign file is refused -------------------------------------------------------

def test_a_damaged_artifact_is_refused_with_a_code():
    payload, _ = build()
    ea.decode_error_mesh(payload)
    for broken, code in ((b"NOTMESH!" + payload[8:], "MESH_MAGIC"), (payload[:-4], "MESH_LENGTH"),
                         (payload + b"\x00\x00\x00\x00", "MESH_LENGTH"), (payload[:10], "MESH_MAGIC"),
                         (payload[:8] + struct.pack("<I", 4 * 10 ** 6) + payload[12:], "MESH_HEADER")):
        with pytest.raises(artifact.MeshArtifactError) as raised:
            ea.read_error_header(broken)
        assert raised.value.code == code


def test_a_surface_artifact_is_not_an_error_artifact_and_the_other_way_round():
    surface, _ = artifact.build_mesh_artifact(volume(REFERENCE))
    with pytest.raises(artifact.MeshArtifactError) as raised:
        ea.read_error_header(surface)
    assert raised.value.code == "MESH_FORMAT"
    with pytest.raises(artifact.MeshArtifactError) as raised:
        artifact.read_header(build()[0])
    assert raised.value.code == "MESH_FORMAT"


def with_header(payload, change):
    """The payload with its JSON header edited by ``change`` (the sections are kept as they were)."""
    (length,) = struct.unpack_from("<I", payload, 8)
    edited = json.loads(payload[12:12 + length].decode("utf-8"))
    change(edited)
    raw = json.dumps(edited, sort_keys=True, separators=(",", ":")).encode("utf-8")
    raw += b" " * ((-(12 + len(raw))) % 4)
    return payload[:8] + struct.pack("<I", len(raw)) + raw + payload[12 + length:]


def test_the_first_version_of_the_format_is_not_read():
    """v1 (no regions) was never released; a file in that format is refused, never half-read."""
    payload, _ = build()
    v1 = with_header(payload, lambda h: h.update(format="cardiac-errormesh/1"))
    with pytest.raises(artifact.MeshArtifactError) as raised:
        ea.read_error_header(v1)
    assert raised.value.code == "MESH_FORMAT"


def section_offsets(payload):
    header = ea.read_error_header(payload)
    (length,) = struct.unpack_from("<I", payload, 8)
    v, t, ib = header["vertex_count"], header["triangle_count"], header["index_bytes"]
    pad = lambda size: (-size) % 4  # noqa: E731
    base = 12 + length
    triangles = base + v * 6 + pad(v * 6)
    slices = triangles + t * 3 * ib + pad(t * 3 * ib)
    classes = slices + t * 2 + pad(t * 2)
    components = classes + t + pad(t)
    return {"triangles": triangles, "slices": slices, "classes": classes, "components": components, "ib": ib}


def test_a_face_in_the_wrong_class_block_or_across_blocks_is_refused():
    payload, _ = build()
    where = section_offsets(payload)
    wrong_class = bytearray(payload)
    wrong_class[where["classes"] + 0] = 2           # the first FP face claims to be FN
    with pytest.raises(artifact.MeshArtifactError) as raised:
        ea.decode_error_mesh(bytes(wrong_class))
    assert raised.value.code == "MESH_CLASS"
    across = bytearray(payload)
    struct.pack_into("<H", across, where["triangles"], 30)   # an FP triangle indexing an FN vertex (26..43)
    with pytest.raises(artifact.MeshArtifactError) as raised:
        ea.decode_error_mesh(bytes(across))
    assert raised.value.code == "MESH_INDEX"
    far = bytearray(payload)
    struct.pack_into("<H", far, where["slices"], SHAPE[2])   # a source slice outside the volume
    with pytest.raises(artifact.MeshArtifactError) as raised:
        ea.decode_error_mesh(bytes(far))
    assert raised.value.code == "MESH_SLICE"


def test_a_face_naming_a_wrong_region_is_refused():
    payload, _ = build()
    where = section_offsets(payload)
    base = where["components"]
    for position, value in ((0, 3), (0, 0), (0, 4), (0, 255)):     # an FP face naming an FN region, none, a missing one
        broken = bytearray(payload)
        broken[base + position] = value
        with pytest.raises(artifact.MeshArtifactError) as raised:
            ea.decode_error_mesh(bytes(broken))
        assert raised.value.code == "MESH_COMPONENT", (position, value)
    # every face of the far FP voxel (region 2) renamed to region 1: region 2 then owns no face
    decoded = ea.decode_error_mesh(payload)
    far = [t for t in range(44) if int(decoded["face_component"][t]) == 2]
    assert far, "the far voxel has faces"
    broken = bytearray(payload)
    for t in far:
        broken[base + t] = 1
    with pytest.raises(artifact.MeshArtifactError) as raised:
        ea.decode_error_mesh(bytes(broken))
    assert raised.value.code == "MESH_COMPONENT"
    # a face of the FP slab (slices 3-4) moved to slice 5, a slice its region does not contribute to
    slab_face = next(t for t in range(44) if int(decoded["face_component"][t]) == 1)
    moved = bytearray(payload)
    struct.pack_into("<H", moved, where["slices"] + 2 * slab_face, 5)
    with pytest.raises(artifact.MeshArtifactError) as raised:
        ea.decode_error_mesh(bytes(moved))
    assert raised.value.code == "MESH_COMPONENT"


def test_a_class_table_that_does_not_cover_the_file_is_refused():
    payload, _ = build()
    for change in (lambda h: h["classes"].reverse(),
                   lambda h: h["classes"][1].update(triangle_range=[40, 76]),
                   lambda h: h["classes"][0].update(voxels=0),
                   lambda h: h["classes"][0].update(voxels=1),
                   lambda h: h["classes"][1].update(code=3),
                   lambda h: h.update(classes=[h["classes"][0]]),
                   lambda h: h.update(reference_mask_sha256="short"),
                   lambda h: h.update(frame="world")):
        with pytest.raises(artifact.MeshArtifactError) as raised:
            ea.read_error_header(with_header(payload, change))
        assert raised.value.code in {"MESH_CLASSES", "MESH_HEADER"}


def test_a_component_table_that_is_not_what_its_header_says_is_refused():
    payload, _ = build()

    def drop(key):
        return lambda h: h.pop(key)

    changes = [
        drop("components"), drop("component_count"), drop("connectivity"), drop("component_index_bytes"),
        lambda h: h.update(connectivity=7), lambda h: h.update(connectivity=True), lambda h: h.update(connectivity="26"),
        lambda h: h.update(connectivity=[26]), lambda h: h.update(component_count=4),
        lambda h: h.update(component_index_bytes=2),                             # not the smallest type that holds 3
        lambda h: h["classes"][0].update(component_range=[1, 2]),                 # does not reach the next class
        lambda h: h["classes"][1].update(component_range=[4, 4]),                 # does not start where the last ended
        lambda h: h["classes"][0].pop("component_range"),
        lambda h: h["components"].reverse(),                                      # ids and classes out of place
        lambda h: h["components"][0].update(id="FP_0002"),
        lambda h: h["components"][0].update(**{"class": "FN"}),
        lambda h: h["components"][0].update(voxels=5),                            # not the sum of its slices
        lambda h: h["components"][0].update(slice_voxels=[2, 0]),                 # a contributing slice without voxels
        lambda h: h["components"][0].update(slice_voxels=[]),
        lambda h: h["components"][0].update(slice_voxels=[2, 2, 2, 2]),           # runs past the last slice (3 + 4 > 6)
        lambda h: h["components"][0].update(first_slice=-1),
        lambda h: h["components"][0].update(extra=1),
        lambda h: h["components"][2].update(voxels=3, slice_voxels=[2, 1]),       # the FN regions no longer hold the class
        lambda h: h["components"].pop(),
    ]
    for change in changes:
        with pytest.raises(artifact.MeshArtifactError) as raised:
            ea.read_error_header(with_header(payload, change))
        assert raised.value.code in {"MESH_COMPONENTS", "MESH_HEADER", "MESH_LENGTH"}, change


# -- the golden the mobile tests read ----------------------------------------------------------

def golden_document():
    payload, info = build()
    decoded = ea.decode_error_mesh(payload)
    picks = []
    for origin, direction, _expected in PICKS:
        triangle = ea.pick_triangle(decoded, origin, direction)
        picks.append({
            "origin": origin, "direction": direction,
            "slice": None if triangle is None else int(decoded["face_source_slice"][triangle]),
            "class": None if triangle is None else ea.CLASS_NAME[int(decoded["face_class"][triangle])],
            "component": None if triangle is None else int(decoded["face_component"][triangle]),
        })
    return {
        "description": "synthetic known-error pair, voxel-index frame x=column,y=row,z=slice; regenerated by "
                       "`python backend/mesh/tests/test_error_artifact.py --write-golden` (see test_error_artifact.py)",
        "shape_xyz": list(SHAPE),
        "reference_voxels_xyz": sorted(list(v) for v in REFERENCE),
        "prediction_voxels_xyz": sorted(list(v) for v in PREDICTION),
        "prediction_sha256": PRED_SHA, "reference_sha256": REF_SHA,
        "connectivity": decoded["header"]["connectivity"],
        "classes": decoded["header"]["classes"], "components": decoded["header"]["components"],
        "agreement_voxels": info["tp_voxels"],
        "vertex_count": info["vertex_count"], "triangle_count": info["triangle_count"], "bytes": info["bytes"],
        "sha256": info["mesh_sha256"], "bytes_b64": base64.b64encode(payload).decode("ascii"),
        # the surface artifacts of the same two masks: a scene with all four layers (the error faces lie on the
        # prediction's, which is what the viewer's pick priority and depth offset are for)
        "prediction_surface_b64": base64.b64encode(artifact.build_mesh_artifact(volume(PREDICTION))[0]).decode("ascii"),
        "reference_surface_b64": base64.b64encode(artifact.build_mesh_artifact(volume(REFERENCE))[0]).decode("ascii"),
        "picks": picks,
    }


def test_the_golden_is_byte_stable_and_carries_the_pick_cases_the_viewer_must_agree_with():
    """GOLDEN is read by mobile/test/v2_*.test.mjs too: the Python encoder and the JavaScript decoder agree on it."""
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    expected = golden_document()
    assert golden["sha256"] == expected["sha256"], "encoder output changed: regenerate the golden (--write-golden)"
    assert golden == expected
    assert base64.b64decode(golden["bytes_b64"]) == build()[0]
    assert [(p["slice"], p["class"], p["component"]) for p in golden["picks"]] == [
        (None, None, None) if e is None else e for _o, _d, e in PICKS]


if __name__ == "__main__":
    if "--write-golden" in sys.argv:
        GOLDEN.write_bytes((json.dumps(golden_document(), indent=1) + "\n").encode("utf-8"))  # LF on every platform
        print(f"wrote {GOLDEN}")
    else:
        raise SystemExit("pass --write-golden to regenerate the golden; run the tests with pytest")
