# Cardiac MRI linked MPR + 3D review POC

This local-only prototype follows a medical-image review layout: three linked
source MRI planes beside one 3D surface generated from the selected source
label. The slice views show radiological orientation labels, preserve physical
pixel aspect ratio, and report the selected voxel centre in RAS millimetres.
A 3D tap navigates by a verified per-triangle map back to the foreground
source slice.

It is a research feasibility viewer, not a diagnostic workstation. The source
labelmap remains authoritative. The displayed mesh is the exact voxel-face
surface; the optional vertex-normal shading only changes lighting and never
moves mesh coordinates. Surface simplification or geometric smoothing is not
performed in this POC.

## Build a local demo

Use de-identified MRI and its matching segmentation labelmap. `nibabel` and
`numpy` are needed on the workstation. The builder checks that the two inputs
have identical shape and affine, canonicalizes axis order and flips to RAS,
and rejects oblique or sheared geometry rather than showing a falsely named
axial/coronal/sagittal view. It creates the mesh and exact triangle-to-slice map
from that same canonical labelmap, then hashes the OBJ before enabling 3D picks.
Both NIfTI inputs must declare spatial units. Metres and microns are converted
to millimetres before comparing affines; unknown units are refused. NIfTI
integer indices identify voxel centres. The exact voxel-face mesh therefore
uses a cell-corner origin half a voxel below the image's centre origin, while
MPR coordinates and the linked plane retain the original voxel-centre position.
Regenerate an existing demo after this update: the revised viewer refuses old
payloads without the declared voxel-centre origin and millimetre frame.

```bash
python -m pip install nibabel numpy
python spikes/spike_b_3d/clinical_poc/build_poc_data.py \
  --mri /authorised/case.nii.gz \
  --label /authorised/case_label.nii.gz \
  --label-value 1 \
  --out /tmp/cardiac-mpr-poc \
  --segment-name "left atrium"
cd /tmp/cardiac-mpr-poc
python3 -m http.server 8768
```

Open `http://localhost:8768/poc.html`. Use `--label-value 255` if the source
labelmap encodes the segment as 255. The default `--downsample 1` retains the
source in-plane resolution. A larger value only lowers the preview resolution
in X/Y; all source Z slices remain available. All generated image, mask, and
mesh bytes stay in the chosen output directory outside Git.

## What is and is not represented

The POC displays the MRI and segmentation together, three-plane crosshairs,
RAS coordinates, a derived label volume, and the exact source Z slice beneath
a tapped mesh triangle. A single LA label does not contain pulmonary-vein
ostia, a left-atrial appendage boundary, a mitral annulus, the rest of the
heart, or a verified clinical landmark. Those must come from distinct labels
or reviewed annotations in the matching source study.

Reference examples:

- [3D Slicer research figure showing three MRI planes and a 3D atrial surface](https://www.nature.com/articles/s41597-024-03253-9/figures/3)
- [Materialise Mimics cardiac-intervention planning example](https://www.materialise.com/en/healthcare/hcps/cardiovascular/cardiac-interventions)
- [3D Slicer volume-rendering guide](https://slicer.readthedocs.io/en/5.10/user_guide/modules/volumerendering.html)

The next preview steps and their accuracy checks are described in
[RESEARCH_3D_PREVIEW.md](RESEARCH_3D_PREVIEW.md).

## Geometry regression checks

```bash
python -m unittest spikes.spike_b_3d.clinical_poc.test_build_poc_data -v
node spikes/spike_b_3d/clinical_poc/test_poc_geometry.mjs
```

The Python checks create and remove synthetic NIfTI fixtures outside Git.
The browser-entry checks exercise physical MPR coordinates, the linked 3D
plane and refusal of outdated/unsupported geometry without source image files.
