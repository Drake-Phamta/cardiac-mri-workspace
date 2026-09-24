# B1 — minimal 3D mesh viewer

This is a throwaway WebGL2 diagnostic app for Day 6. It loads the exact
regenerable artifact `mesh/out/level_0_cell1.obj`, renders it with depth testing
and diffuse shading, and supports orbit rotation, desktop/touch panning, and
wheel/pinch zoom. No
production module or framework decision is made here.

## Run locally

From `spikes/spike_b_3d/`:

```bash
python mesh/build_mesh.py
python -m http.server 8765
```

Open <http://127.0.0.1:8765/app/> in a WebGL2-capable browser. The OBJ files
are intentionally ignored by git; the first command regenerates
`mesh/out/level_0_cell1.obj` from the canonical geometry fixture.

## Marching Cubes visual comparison

The default uses exact voxel-face extraction because the picking harness needs
an unambiguous source voxel. To view a smoother, interpolated surface from the
**same synthetic mask**, install the local-only preview dependency and run:

```bash
python -m pip install numpy scikit-image
python mesh/build_marching_cubes_preview.py
python -m http.server 8765
```

Open <http://127.0.0.1:8765/app/?surface=marching-cubes>. It loads the ignored
`mesh/out/marching_cubes_preview.obj`. This is a rendering comparison only:
it is not a cardiac anatomy mesh, it has not passed the exact picking checks,
and it does not replace the voxel-face artifact used by the current harness.
The preview uses averaged vertex normals to expose the interpolated surface;
the default mesh keeps flat normals so its voxel boundaries remain visible.

### What this kind of 3D surface does, and does not, show

A segmentation surface retains the outer shape of a labelled structure. On a
real cardiac case it can support chamber-volume/shape assessment and spatial
orientation of chambers and vessels. It does **not** retain the source MRI
intensity, tissue texture, or any detail that was smaller than a voxel or was
not included in the segmentation label. Clinicians therefore use the 3D model
alongside the original 2D/MPR images, rather than treating it as a replacement.
Marching Cubes interpolates the mask boundary to remove stair-steps; additional
smoothing or decimation can remove small surface detail and needs its own
validation.

Drag on the canvas to orbit; click or tap a surface to resolve its canonical
voxel and Z slice; right-click or hold Shift while dragging to pan.
On touch, move two fingers together to pan and change their separation to zoom.
Use the wheel to zoom and **fit camera** to restore the demo view. The displayed mesh is synthetic
and diagnostic only. `node app/test_picking.mjs` casts the 13 canonical fixture
rays into this level-0 mesh and requires the exact expected slice for each.
That verifies B3/B4's desktop fixture path only; B5/B6 on a real mesh and
B10/B11 still require the declared Galaxy A17 run.
