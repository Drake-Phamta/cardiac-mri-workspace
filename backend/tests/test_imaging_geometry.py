"""Header orientation must match the positive-axis-only frozen geometry contract."""

import numpy as np

from backend.app.imaging import geometry_from_header


def test_flipped_or_oblique_header_is_not_reported_as_axis_aligned():
    assert geometry_from_header({"space directions": np.diag([0.6, 0.8, 1.2])})["axis_aligned"] is True
    assert geometry_from_header({"space directions": np.diag([-0.6, 0.8, 1.2])})["axis_aligned"] is False
    assert geometry_from_header({"space directions": [[0.6, 0.1, 0], [0, 0.8, 0], [0, 0, 1.2]]})["axis_aligned"] is False
