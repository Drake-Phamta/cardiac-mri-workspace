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

Drag on the canvas to orbit; right-click or hold Shift while dragging to pan.
On touch, move two fingers together to pan and change their separation to zoom.
Use the wheel to zoom and **fit camera** to restore the demo view. The displayed mesh is synthetic
and diagnostic only; B10/B11 and real-mesh B3/B4 evidence still require the
declared Galaxy A17 run.
