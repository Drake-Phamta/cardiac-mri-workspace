# Clinical MPR + 3D feasibility POC

This local-only diagnostic connects three linked MRI slice views to the B1
surface viewer. Click or drag a slice to update the shared voxel crosshair;
the 3D surface receives the matching physical axial-plane position and marks
its surface intersection in orange.

It is **not** a diagnostic workstation or evidence for a clinical result. It
contains no image, label, mesh, or patient-derived byte in Git. The volume and
OBJ must come from the same authorised segmentation input; the operator must
inspect contours in source slices before trusting the surface.

## Build a local demo

`nibabel` and `numpy` are required only on the operator workstation.

```bash
python spikes/spike_b_3d/clinical_poc/build_poc_data.py \
  --mri /authorised/case.nii.gz \
  --label /authorised/case_label.nii.gz \
  --mesh /authorised/left_atrium.obj \
  --out /tmp/cardiac-mpr-poc \
  --segment-name "left atrium" \
  --mesh-origin-mm 0,0,0
cd /tmp/cardiac-mpr-poc
python3 -m http.server 8768
```

Open `http://localhost:8768/poc.html`. `--mesh-origin-mm` must equal the origin
used while exporting the OBJ; the default fits an OBJ extracted in local image
coordinates. The browser preview is downsampled two-fold and must not be used
for measurement.

## What this does and does not show

The POC shows an MRI grayscale preview, its segmentation overlay, X/Y/Z
crosshair, physical Z-to-surface cue, and explicit missing-landmark text. A
single left-atrium label cannot establish pulmonary-vein ostia, left-atrial
appendage, mitral annulus, whole-heart anatomy, chamber volume, or ejection
fraction. Those require the appropriate multi-class, multi-phase input and
clinical review.
