"""Geometry checks for the local cardiac MPR POC builder.

Run with a Python environment containing numpy and nibabel:
    python -m unittest spikes.spike_b_3d.clinical_poc.test_build_poc_data
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

try:
    import nibabel as nib
    import numpy as np
except ImportError:  # the optional POC dependencies are not needed by the app
    nib = None
    np = None


ROOT = Path(__file__).resolve().parents[3]
BUILDER = ROOT / "prototypes/3d-viewer/clinical_poc/build_poc_data.py"


@unittest.skipIf(nib is None or np is None, "install numpy and nibabel to run POC geometry checks")
class BuildPocDataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cmw-clinical-poc-")
        self.root = Path(self.temp.name)
        self.mri_path = self.root / "mri.nii.gz"
        self.label_path = self.root / "label.nii.gz"
        self.shape = (12, 10, 8)
        x, y, z = np.indices(self.shape)
        self.mri = (x * 3 + y * 2 + z).astype(np.float32)
        self.label = (((x - 5) ** 2 / 12 + (y - 5) ** 2 / 8 + (z - 4) ** 2 / 5) <= 1).astype(np.uint8) * 5
        self.affine = np.array([
            [0.7, 0, 0, 20],
            [0, 0.8, 0, -30],
            [0, 0, 2.4, 5],
            [0, 0, 0, 1],
        ], dtype=np.float64)
        self._save()

    def tearDown(self):
        self.temp.cleanup()

    def _save(self, affine=None, label_affine=None, mri_unit="mm", label_unit="mm"):
        affine = self.affine if affine is None else affine
        label_affine = affine if label_affine is None else label_affine
        mri = nib.Nifti1Image(self.mri, affine)
        label = nib.Nifti1Image(self.label, label_affine)
        mri.header.set_xyzt_units(mri_unit)
        label.header.set_xyzt_units(label_unit)
        nib.save(mri, self.mri_path)
        nib.save(label, self.label_path)

    def _run(self, out, expect_success=True):
        result = subprocess.run([
            sys.executable, str(BUILDER),
            "--mri", str(self.mri_path), "--label", str(self.label_path),
            "--label-value", "5", "--segment-name", "demo structure", "--out", str(out),
        ], text=True, capture_output=True, env={**os.environ, "PYTHONPATH": str(ROOT)})
        if expect_success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def test_builds_mesh_and_pick_map_from_canonical_source_geometry(self):
        out = self.root / "poc"
        self._run(out)
        meta = json.loads((out / "poc-data/meta.json").read_text())
        summary = json.loads((out / "mesh/out/mesh_levels.json").read_text())
        pickmap = json.loads((out / "mesh/out/level_0_cell1.pickmap.json").read_text())
        mesh_path = out / "mesh/out/level_0_cell1.obj"
        self.assertEqual(meta["coordinate_system"], "RAS")
        self.assertEqual(meta["source_shape_xyz"], list(self.shape))
        np.testing.assert_allclose(meta["source_spacing_xyz_mm"], [0.7, 0.8, 2.4], rtol=0, atol=1e-6)
        np.testing.assert_allclose(meta["source_origin_ras_mm"], [20, -30, 5], rtol=0, atol=1e-5)
        self.assertEqual(meta["label_value"], 5)
        self.assertEqual(meta["segment_voxels"], int(np.count_nonzero(self.label)))
        self.assertEqual(summary["shape_xyz"], list(self.shape))
        self.assertEqual(pickmap["mesh_sha256"], summary["levels"][0]["sha256"])
        self.assertEqual(pickmap["triangle_count"], summary["levels"][0]["triangle_count"])
        self.assertEqual(len(pickmap["source_slice_by_triangle"]), pickmap["triangle_count"])
        self.assertTrue(all(0 <= z < self.shape[2] for z in pickmap["source_slice_by_triangle"]))
        self.assertTrue(mesh_path.is_file())

    def test_single_voxel_surface_is_centered_on_nifti_voxel_center(self):
        voxel = (5, 4, 3)
        self.label.fill(0)
        self.label[voxel] = 5
        self._save()
        out = self.root / "one-voxel"
        self._run(out)
        lines = (out / "mesh/out/level_0_cell1.obj").read_text().splitlines()
        vertices = np.array([list(map(float, line.split()[1:]))
                             for line in lines if line.startswith("v ")])
        # NIfTI integer indices locate voxel centres, not the low cell corner.
        center = nib.affines.apply_affine(self.affine, voxel)
        half_spacing = np.array([0.7, 0.8, 2.4]) / 2
        np.testing.assert_allclose(vertices.min(axis=0), center - half_spacing, rtol=0, atol=1e-6)
        np.testing.assert_allclose(vertices.max(axis=0), center + half_spacing, rtol=0, atol=1e-6)
        pickmap = json.loads((out / "mesh/out/level_0_cell1.pickmap.json").read_text())
        self.assertEqual(pickmap["triangle_count"], 12)
        self.assertEqual(pickmap["source_slice_by_triangle"], [voxel[2]] * 12)

    def test_normalizes_declared_spatial_units_before_comparing_geometry(self):
        for unit, mm_to_native in (("meter", 0.001), ("micron", 1000.0)):
            with self.subTest(unit=unit):
                affine = self.affine.copy()
                affine[:3, :] *= mm_to_native
                self._save(affine, label_affine=self.affine, mri_unit=unit, label_unit="mm")
                out = self.root / unit
                self._run(out)
                meta = json.loads((out / "poc-data/meta.json").read_text())
                np.testing.assert_allclose(meta["source_spacing_xyz_mm"], [0.7, 0.8, 2.4], rtol=0, atol=1e-5)
                np.testing.assert_allclose(meta["source_origin_ras_mm"], [20, -30, 5], rtol=0, atol=1e-5)
                self.assertAlmostEqual(meta["segment_volume_ml"], np.count_nonzero(self.label) * 0.7 * 0.8 * 2.4 / 1000, places=6)

    def test_refuses_unknown_spatial_units_instead_of_assuming_millimetres(self):
        for mri_unit, label_unit in (("unknown", "mm"), ("mm", "unknown")):
            with self.subTest(mri_unit=mri_unit, label_unit=label_unit):
                self._save(mri_unit=mri_unit, label_unit=label_unit)
                result = self._run(self.root / "unknown-unit", expect_success=False)
                self.assertIn("spatial units", result.stderr)

    def test_refuses_equal_numeric_affines_with_different_physical_units(self):
        self._save(mri_unit="meter", label_unit="mm")
        result = self._run(self.root / "different-physical-grid", expect_success=False)
        self.assertIn("affine transforms differ", result.stderr)

    def test_reorients_flipped_source_axes_to_positive_ras(self):
        affine = self.affine.copy()
        affine[0, 0] *= -1
        affine[0, 3] += (self.shape[0] - 1) * 0.7
        affine[2, 2] *= -1
        affine[2, 3] += (self.shape[2] - 1) * 2.4
        self._save(affine)
        out = self.root / "poc-flipped"
        self._run(out)
        meta = json.loads((out / "poc-data/meta.json").read_text())
        np.testing.assert_allclose(meta["source_spacing_xyz_mm"], [0.7, 0.8, 2.4], rtol=0, atol=1e-6)
        np.testing.assert_allclose(meta["source_origin_ras_mm"], [20, -30, 5], rtol=0, atol=1e-5)

    def test_refuses_mismatched_affines(self):
        shifted = self.affine.copy()
        shifted[0, 3] += 1.0
        self._save(label_affine=shifted)
        result = self._run(self.root / "bad-affine", expect_success=False)
        self.assertIn("affine transforms differ", result.stderr)

    def test_refuses_oblique_axes_instead_of_mislabeling_mpr_planes(self):
        oblique = self.affine.copy()
        oblique[0, 1] = 0.08
        self._save(oblique)
        result = self._run(self.root / "oblique", expect_success=False)
        self.assertIn("oblique or sheared", result.stderr)

    def test_refuses_output_inside_repository(self):
        result = self._run(ROOT, expect_success=False)
        self.assertIn("must be outside the repository", result.stderr)

    def test_scanner_header_orientation_is_reported_as_verified(self):
        from spikes.spike_b_3d.clinical_poc.build_poc_data import load_canonical_pair
        pair = load_canonical_pair(self.mri_path, self.label_path)
        self.assertEqual(pair["orientation"]["status"], "header")
        self.assertEqual(pair["orientation"]["array_axes"], "RAS")

    def test_placeholder_header_is_unverified_instead_of_labelled_ras(self):
        # MSD Task02 Heart ships identity directions at origin 0: numerically
        # valid, anatomically meaningless. Its "axial" plane is really sagittal.
        from spikes.spike_b_3d.clinical_poc.build_poc_data import load_canonical_pair
        self._save(np.diag([0.7, 0.8, 2.4, 1.0]))
        pair = load_canonical_pair(self.mri_path, self.label_path)
        self.assertEqual(pair["orientation"]["status"], "unverified")
        self.assertIsNone(pair["orientation"]["array_axes"])
        np.testing.assert_array_equal(pair["image"], self.mri)
        out = self.root / "placeholder"
        self._run(out)
        meta = json.loads((out / "poc-data/meta.json").read_text())
        self.assertEqual(meta["orientation"]["status"], "unverified")

    def test_declared_array_axes_reorient_placeholder_geometry_without_resampling(self):
        from spikes.spike_b_3d.clinical_poc.build_poc_data import load_canonical_pair
        self._save(np.diag([0.7, 0.8, 2.4, 1.0]))
        # Stored axis 0 runs anterior, axis 1 superior, axis 2 toward the left.
        pair = load_canonical_pair(self.mri_path, self.label_path, "ASL")
        self.assertEqual(pair["orientation"]["status"], "operator-declared")
        self.assertEqual(pair["image"].shape, (8, 12, 10))  # canonical x,y,z = R,A,S
        np.testing.assert_allclose(pair["spacing"], [2.4, 0.7, 0.8])
        # Canonical +x (right) is stored axis 2 reversed; +y is axis 0; +z is axis 1.
        np.testing.assert_array_equal(pair["image"], np.transpose(self.mri, (2, 0, 1))[::-1])
        np.testing.assert_array_equal(pair["labels"], np.transpose(self.label, (2, 0, 1))[::-1])
        native = np.linalg.inv(pair["stored_affine"]) @ pair["affine"]
        np.testing.assert_allclose(native @ [0, 0, 0, 1], [0, 0, 7, 1], atol=1e-9)

    def test_declared_array_axes_never_override_a_scanner_header(self):
        from spikes.spike_b_3d.clinical_poc.build_poc_data import load_canonical_pair, parse_array_axes
        with self.assertRaisesRegex(ValueError, "already declares"):
            load_canonical_pair(self.mri_path, self.label_path, "ASL")
        for bad in ("AS", "ASX", "AAL", "RLS"):
            with self.subTest(codes=bad), self.assertRaises(ValueError):
                parse_array_axes(bad)


if __name__ == "__main__":
    unittest.main()
