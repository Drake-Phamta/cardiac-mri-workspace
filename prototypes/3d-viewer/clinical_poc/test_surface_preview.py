"""Physical geometry regressions for optional VTK display surfaces."""
import unittest
import numpy as np
from . import build_poc_data  # installs the repository import path
from .surface_preview import surface, topology, comparison, VARIANTS


class SurfacePreviewTests(unittest.TestCase):
    def test_one_voxel_uses_source_centres_and_anisotropic_mm(self):
        mask = np.zeros((3, 4, 5), dtype=bool)
        mask[1, 2, 3] = True
        affine = np.array([[2, 0, 0, -7], [0, 3, 0, 10], [0, 0, 4, 21], [0, 0, 0, 1]])
        exact = surface(mask, affine, 'voxel')
        np.testing.assert_allclose(exact.GetBounds(), [-6, -4, 14.5, 17.5, 31, 35])
        self.assertEqual(exact.GetNumberOfPolys(), 12)
        self.assertAlmostEqual(topology(exact)['enclosed_mesh_volume_ml'], 0.024)
        flying = surface(mask, affine, 'flying')
        np.testing.assert_allclose(flying.GetBounds(), exact.GetBounds())

    def test_normals_do_not_flip_shell_at_non_manifold_voxel_contact(self):
        mask = np.zeros((5, 5, 5), dtype=bool)
        mask[1, 1, 1] = True
        mask[2, 2, 1] = True  # shared edge, not a manifold interface
        exact = surface(mask, np.eye(4), 'voxel')
        self.assertGreater(topology(exact)['non_manifold_edges'], 0)
        self.assertAlmostEqual(topology(exact)['enclosed_mesh_volume_ml'], 0.002)

    def test_display_variants_preserve_source_and_report_mm(self):
        mask = np.zeros((10, 10, 10), dtype=bool)
        mask[2:8, 2:8, 2:8] = True
        original = mask.copy()
        affine = np.diag([1.25, 1.25, 1.37, 1])
        reference = surface(mask, affine, 'voxel')
        volume_ml = mask.sum() * 1.25 * 1.25 * 1.37 / 1000
        for key in VARIANTS:
            report = comparison(surface(mask, affine, key), reference, volume_ml)
            self.assertTrue(np.isfinite(report['max_vertex_sample_distance_mm']))
            self.assertEqual(report['boundary_edges'], 0)
            self.assertEqual(report['non_manifold_edges'], 0)
            if key == 'voxel':
                self.assertAlmostEqual(report['mesh_volume_change_percent'], 0, places=5)
                self.assertEqual(report['max_vertex_sample_distance_mm'], 0)
        np.testing.assert_array_equal(mask, original)


if __name__ == '__main__':
    unittest.main()
