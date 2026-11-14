# Volume rendering + Marching Cubes linked-MPR POC

This local-only experiment compares the raw MRI intensity volume with a
Marching Cubes surface derived from its integer segmentation labelmap. The 2D
MPR panes always read the original-resolution MRI and labelmap. Tapping the
surface maps the hit to the nearest voxel carrying that segment's source label
and updates all three MPR panes.

The MRI/labelmap pair is the source of truth. The mesh is only a derived 3D
display representation. The optional light smoothing changes the display mesh
only; it never changes the labelmap used by MPR or picking.

## Public sample used for the trial

The trial uses `la_024.nii.gz` from the Medical Segmentation Decathlon
Task02_Heart, mirrored in [Angelou0516/msd-cardiac on Hugging Face](https://huggingface.co/datasets/Angelou0516/msd-cardiac).
The dataset card identifies it as a cardiac MRI with a left-atrium label and
lists CC-BY-SA-4.0. The original benchmark is described by
[Antonelli et al., Nature Communications (2022)](https://doi.org/10.1038/s41467-022-30695-9).

This case has one left-atrium segment, not a whole-heart multi-chamber
segmentation. It is a public research sample, not patient data from this
project, and must not be interpreted clinically. Downloaded data and generated
payloads stay outside Git.

## Reproduce on macOS

From the repository root:

```bash
python3 -m venv /tmp/cardiac-mpr-demo/venv
/tmp/cardiac-mpr-demo/venv/bin/pip install -r prototypes/3d-viewer/volume_surface_poc/requirements.txt
mkdir -p /tmp/cardiac-mpr-demo/input
curl -L 'https://huggingface.co/datasets/Angelou0516/msd-cardiac/resolve/main/imagesTr/la_024.nii.gz' -o /tmp/cardiac-mpr-demo/input/la_024.nii.gz
curl -L 'https://huggingface.co/datasets/Angelou0516/msd-cardiac/resolve/main/labelsTr/la_024.nii.gz' -o /tmp/cardiac-mpr-demo/input/la_024_label.nii.gz
/tmp/cardiac-mpr-demo/venv/bin/python prototypes/3d-viewer/volume_surface_poc/build_demo.py \
  --mri /tmp/cardiac-mpr-demo/input/la_024.nii.gz \
  --label /tmp/cardiac-mpr-demo/input/la_024_label.nii.gz \
  --out /tmp/cardiac-mpr-demo/site
cd /tmp/cardiac-mpr-demo/site
python3 -m http.server 8768
```

Open <http://127.0.0.1:8768>. Drag the 3D view to rotate, use the wheel to
zoom, and click `Volume + label` before tapping the orange surface. A slice
click or wheel updates the linked MPR crosshair. The mode buttons compare MRI
volume-only, volume-plus-mesh, and mesh-only. `Surface: raw label` can be
toggled to a lightly smoothed display mesh to see which staircase artifacts
are rendering-related and which are present in the labelmap itself.

The builder also accepts a directory containing exactly one axis-aligned
DICOM series via `--mri`, provided `SimpleITK` is installed. The labelmap must
be a NIfTI file with exactly matching dimensions and RAS affine. The builder
rejects oblique geometry and mismatched MRI/label geometry instead of silently
resampling it. DICOM ingestion is implemented but was not exercised in this
trial, because the public sample is distributed as NIfTI.

## What this experiment can answer

- The browser renderer follows the same basic GPU ray-casting model as Slicer:
  it enters the 3D intensity texture at the cube's front face, marches through
  samples, maps intensity through separate color and opacity lookup tables,
  estimates a gradient for lighting, and composites front-to-back. Window low,
  window high, and opacity controls let the viewer tune the scalar-to-opacity
  mapping; its ray-jitter option shifts the first sample to reduce regular
  sampling artifacts. The sample MRI texture is percentile-windowed and stored
  as normalized `uint16` (packed into two `RG8` channels for WebGL 2 linear
  interpolation); this remains a display derivative, while MPR and picking
  retain the source geometry and labelmap.
- This is a small Slicer-inspired shader, not VTK or a validated medical
  renderer. Its transfer-function points and lighting are illustrative and
  require tuning. Volume rendering samples MRI intensities, so it shows
  internal texture, acquisition noise, and partial-volume signal. It is not a
  segmented organ surface; its cloudy appearance still depends on the window,
  transfer functions, sampling distance, interpolation, and crop.
- Marching Cubes samples the labelmap boundary at level 0.5. It yields a
  lighter, opaque surface suitable for rotation and picking, but it cannot
  recover details absent from the labelmap's voxel spacing or annotation.
- The raw and lightly smoothed surfaces can be compared without replacing the
  source labelmap. Smoothing is a visual derivative and may shrink or erase
  small details, so it is not silently enabled as a clinical correction.
- The hit-to-voxel mapping is a POC. It uses the nearest source voxel that has
  the selected segment label. It is not a validated clinical navigation path.

Run the mapping check with:

```bash
node prototypes/3d-viewer/volume_surface_poc/test_viewer_math.mjs
```
