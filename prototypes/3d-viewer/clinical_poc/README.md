# Cardiac MRI linked MPR + 3D review POC

## VTK workstation preview

`build_workstation.py` builds the newer, standalone browser preview: native
float32 MRI window/level, three source-linked MPR planes, per-label visibility,
surface opacity, a source-Z cut plane, orientation cube, and GPU MRI intensity
volume rendering. It offers exact voxel faces, unsmoothed DiscreteFlyingEdges,
two WindowedSinc settings, and constrained SurfaceNets. Meshes are separate
display representations; source MRI and labels remain unchanged.

Install optional dependencies in an isolated environment, then build the viewer:

```bash
python3 -m venv /tmp/cmw-preview-env
/tmp/cmw-preview-env/bin/pip install -r prototypes/3d-viewer/clinical_poc/requirements-workstation.txt
cd prototypes/3d-viewer/clinical_poc/workstation
npm ci
npm run build
cd ../../../..
```

Use an authorised matching MRI/label pair, or fetch one publicly licensed
[Medical Segmentation Decathlon](https://doi.org/10.1038/s41467-022-30695-9)
Heart training pair. The downloader reads the archive's license and retains
attribution. It uses the public archive referenced by MONAI and byte ranges to
fetch one pair rather than the entire dataset. It does not access holdout data.

```bash
/tmp/cmw-preview-env/bin/python prototypes/3d-viewer/clinical_poc/download_msd_sample.py \
  --out /tmp/cmw-heart-source
/tmp/cmw-preview-env/bin/python prototypes/3d-viewer/clinical_poc/build_workstation.py \
  --mri /tmp/cmw-heart-source/image.nii.gz \
  --label /tmp/cmw-heart-source/label.nii.gz \
  --provenance /tmp/cmw-heart-source/provenance.json \
  --out /tmp/cmw-workstation
python3 -m http.server 8773 --bind 127.0.0.1 --directory /tmp/cmw-workstation
```

Open `http://127.0.0.1:8773`. Choose **Surface**, **MIP**, **Volume**, or
**Combined**; use **Fit** to frame the visible display; drag to rotate and click
a surface to move the MRI crosshairs. Window/level adjusts the retained scalar
values rather than already clipped grayscale bytes. **MIP** (maximum intensity
projection, the usual 3D display for bright-blood MRA) uses the 90th–99.9th
percentile range of the 3D ROI; **Volume** is shaded ray casting with its own
threshold/opacity controls.

The MRI panes open framed on the labelled ROI. Click or drag sets the
crosshair, the wheel steps one slice per mouse notch, ⌘/Ctrl+wheel or a pinch
zooms about the cursor, Shift- or right-drag pans, and a double-click toggles
between the ROI and the full field of view.

### Orientation: only verified anatomy is named

Axial/coronal/sagittal, R/L/A/P/S/I, the orientation cube and the anatomical
camera views appear only when the NIfTI header records a scanner orientation.
A **placeholder header** (identity directions at origin 0, or no qform/sform)
is reported as `orientation.status = "unverified"`: the panes are called array
k/j/i planes, edges and the cube show ±i/±j/±k, and millimetre distances
remain valid. MSD Task02 Heart ships such headers; on `la_003` its "axial"
array plane is anatomically a sagittal image.

If the anatomy has been checked on the images, declare the direction of each
stored axis with `--array-axes` (three letters, axis 0 then 1 then 2), for
example `--array-axes ASL`. The builder refuses the option on a header that
already has a scanner orientation. On `la_003`, array axis 0 runs posterior →
anterior (spine at low indices) and axis 1 inferior → superior (aortic arch at
high indices); the left/right sense of axis 2 was **not** established, so do
not declare it from this note alone.

MSD Heart supplies whole-heart MRI with **left atrium segmentation only**.
Unlabelled tissue visible in the intensity view is not a segmentation of the
remaining chambers, valves, vessels, or scar. These intensities have arbitrary
MRI units, not CT Hounsfield units or true tissue colours. Optional `--segments`
accepts a JSON mapping such as `{"1":{"name":"Left atrium","color":"#edaa83"}}`.
Additional labels are rendered independently; joint interface smoothing is not
implemented. The viewer remains separate from SCR-05 and its frozen artifacts.

The builder shares the earlier POC's validated millimetre, voxel-centre RAS
geometry and refuses 4D/oblique/sheared or misregistered inputs. Source MPR is
complete; the 3D intensity display uses the labelled bounding box plus 45 mm
context. `--volume-stride` reduces only volume-display sampling, and is declared
in the UI. Surfaces remain at native resolution, without decimation.

Geometry reports include symmetric **vertex-sampled** distances to exact voxel
faces, volume change, connectivity and boundary/non-manifold edges. They do not
prove the maximum continuous surface error or clinical acceptance. Normals do
not traverse non-manifold edge contacts, avoiding shell reversals. A surface
pick performs its own nearby source-label voxel lookup and reports the distance
to that voxel centre; it does not reuse the exact mesh's triangle table. MRI
crosshairs also move the optional 3D MRI planes and source-Z cut.

All source data, derived meshes, reports, per-file hashes and screenshots stay
outside Git. `meta.json` and `ATTRIBUTION.json` retain local provenance. Browser
array integrity is checked against local SHA-256 descriptors before rendering.

```bash
/tmp/cmw-preview-env/bin/python -m unittest spikes.spike_b_3d.clinical_poc.test_surface_preview -v
cd prototypes/3d-viewer/clinical_poc/workstation
npm test
# Requires the local sample server and Chrome; screenshots stay outside Git.
node test/browser-preview.mjs
```

Browser checks cover all five reconstructions, four display modes, clipping,
MRI planes, real canvas picking, missed/hidden-label rays, orientation naming,
MPR zoom, camera clipping after a layer is re-shown, and layouts from 1600 px
down to 390 px. Run them against both an unverified build and one built with
`--array-axes` (on another port, via `PREVIEW_URL`) to cover both naming paths.
These desktop checks do not establish phone performance or the product's B5
picking criterion. The following section documents the retained exact-face POC.

## Earlier exact-face viewer

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
python prototypes/3d-viewer/clinical_poc/build_poc_data.py \
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
node prototypes/3d-viewer/clinical_poc/test_poc_geometry.mjs
```

The Python checks create and remove synthetic NIfTI fixtures outside Git.
The browser-entry checks exercise physical MPR coordinates, the linked 3D
plane and refusal of outdated/unsupported geometry without source image files.
