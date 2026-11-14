# Patient-specific cardiac MRI 3D preview: research findings

Research date: 2026-10-08. A standalone implementation was added on 2026-10-09;
it does not change the frozen product API, DR-008c or clinical acceptance.

## Recommendation

Build a source-linked medical-image viewer with three complementary displays:
source MRI MPR, labelled anatomical surfaces, and optional MRI intensity volume
rendering. Preserve the source image and segmentation; construct a smoother
surface as a separate display representation with measured geometric error.
Use VTK for optional workstation surface conversion and evaluate vtk.js in the
mobile WebView for rendering and reslicing. The local workstation now uses
isolated VTK and vtk.js dependencies; neither is a product runtime dependency.

Clinical correctness depends on the acquisition, selected cardiac phase,
segmentation and anatomical definitions as well as the surface algorithm. An
exact reconstruction of an incorrect labelmap still has incorrect anatomy.

## Current implementation and limitations

| Component | Current behavior | Consequence |
| --- | --- | --- |
| `mobile/.../Inspector3DScreen.js` | Reads MRI slices and masks; rendering is unavailable until mesh bytes, frame and face map can be verified | The local POC is not integrated into the product screen |
| `backend/mesh/surface.py` | Exact voxel-face L0 surface with foreground-face provenance | Reliable source-face mapping; voxel steps remain on the silhouette |
| Earlier exact-face POC | One label; percentile-clipped grayscale and exact triangle correspondence | Retained for exact-face comparison; no intensity volume rendering |
| New workstation builder | All nonzero labels; validated axis-aligned canonical RAS; rejects 4D/oblique volumes | Separate display meshes and geometry reports; full affine reslicing and cine remain unfinished |
| Orientation status | Placeholder headers (identity at origin 0, or no qform/sform) are `unverified`; `--array-axes` lets an operator declare stored-axis anatomy | Plane names and R/L are shown only for a scanner or declared orientation; MSD Heart's array "axial" plane is anatomically sagittal |
| New workstation MRI | Native float32 source MRI, adjustable window/level, GPU ray casting of a declared context crop | Original intensity detail is retained; a display transfer function does not establish tissue identity |
| New workstation surfaces | Five reconstruction settings, layer visibility/opacity, clipping, orientation and full XYZ proximity lookup | Independent smoothing per label; no inherited exact triangle map or clinical acceptance |

The new preview is reproducible with the publicly licensed MSD Heart training
data and retained local attribution. This source provides only an LA label;
other chambers visible in the MRI intensity view have not been segmented.
Automated browser checks exercise actual canvas picking and verify the resulting
source-label voxel and all three slice controls, including missed and hidden
label rays. Desktop rendering does not establish performance on the target phone.

### Geometry correction made during this audit

NIfTI indices locate voxel centres. The backend contract uses half-open cells
whose integer lattice coordinates locate low corners. The previous POC passed
the centre origin as a mesh corner origin and added another half voxel to its
MRI coordinates. That shifted physical positions by half a voxel on each axis.

The POC now uses `mesh_corner_origin = nifti_center_origin - spacing / 2` for
its axis-aligned surface and `MRI_center(k) = nifti_center_origin + k * spacing`
for MPR and the linked plane. It also converts declared metres/microns to mm
before comparing image/label geometry and rejects unknown spatial units.
This fixes a numerical registration error; it does not validate segmentation.

## Verified reference implementation

The Slicer source was inspected at commit
`e2963892cde1a736d625c41cf31380f893b8e4af` on the research date.
Its binary-labelmap conversion supports `vtkDiscreteFlyingEdges3D` (default)
and `vtkSurfaceNets3D`. It pads labels that meet the image border, converts in
IJK coordinates, optionally decimates with topology preservation, smooths,
applies image-to-world geometry and generates normals.

Its defaults include decimation 0 and smoothing factor 0.5. For its
WindowedSinc path, passband is `10 ** (-4 * factor)` and iterations are
`20 + 40 * factor`: at 0.5 this is 0.01 and 40 iterations. These are software
defaults, not clinical error tolerances or parameters validated for our data.
Do not copy the smoothing strength without comparing its effect on anatomy.

For several adjacent, non-overlapping anatomical labels, evaluate SurfaceNets
as well: it represents shared interfaces and permits constrained smoothing.
Do not flatten overlapping structures (for example a scar overlay and its
containing myocardium) without an explicit anatomical policy. Surface
smoothness must be balanced against thin structures and inter-label gaps.

## What makes the preview complete

1. **Patient-specific geometry:** preserve the full voxel-centre affine,
   spatial units, axis convention, acquisition identity and cardiac phase.
   Reslice native oblique data using that geometry. Resampling for display
   must remain traceable to the native image; it does not add acquired detail.
2. **Explicit anatomy:** provide a segment name/ID and provenance for each
   label. A whole-heart benchmark may provide LV/RV/LA/RA blood pools, LV
   myocardium, ascending aorta and pulmonary artery. Those labels are not
   complete valves, coronaries or all myocardial layers. A single LA cavity
   does not establish atrial-wall thickness, scar or procedure landmarks.
3. **Readable surfaces:** compare unsmoothed FlyingEdges, weakly smoothed
   FlyingEdges and constrained SurfaceNets on the same case. Begin without
   decimation. Use anatomical colours, adjustable opacity, stable camera
   orientation and a clipping plane to reveal cavities and adjacent structures.
   Identify anatomy truncated by the scan/ROI boundary; an algorithmic surface
   cap is not evidence that the anatomical structure ends there.
4. **Image detail:** retain original scalar precision and offer adjustable
   window/level. Add a separate ROI-cropped GPU ray-casting view with
   sequence-specific colour/opacity transfer functions. MRI intensity does
   not establish visible tissue colour. Surface textures must not fabricate
   anatomical wrinkles or hide structures absent from the acquired image.
5. **Inspection:** link MPR crosshairs to actual XYZ coordinates; provide
   orientation marks and scale. A display-surface pick must resolve to the
   appropriate source label and location. New topology cannot reuse the old
   triangle table; a smooth visual surface needs independently verified
   correspondence. An invisible voxel collider is not sufficient evidence at
   a displaced silhouette.
6. **Motion and findings when supported:** distinguish static 3D from cine
   phases. Show scar, uncertainty and annotated landmarks only when matching
   source data or reviewed labels provide them. Register separate sequences
   explicitly before combining them.

## Accuracy and performance evaluation

Use one authorised, paired MRI + expert-reviewed label case as the reference.
Process each representation from that same source. Record parameters and
compare source overlays in all planes before judging aesthetics.

Measure symmetric surface distances in mm (mean/HD95/maximum), volume change,
connected components, topology and preservation of thin structures. Inspect
vessel ostia, appendages and other relevant boundaries where available; bulk
overlap alone is insufficient. Retain the source segmentation alongside the
display mesh so that discrepancies can be inspected.

Specify case- and task-dependent tolerances before selecting a smoothing or
simplification setting. There is no universal "medical grade" smoothing
factor or an unconditional sub-millimetre accuracy claim. Header equality
alone does not prove valid orientation or correct anatomy.

Test source navigation independently, including missed rays and silhouette
picks. Revalidate a new display representation against the project's picking
and performance criteria rather than inheriting L0's accepted result. Measure
initial load time, texture/CPU/GPU memory, interaction FPS and stalls on the
target phone. Crop to the cardiac ROI and reduce only the interaction preview
quality when needed, with a visible return to full-quality data after motion.

## Proposed implementation order

Steps 2 and 3 and scalar-preserving volume rendering in step 4 are implemented
in `build_workstation.py` and `workstation/`. Full affine/oblique reslicing,
joint multi-label interfaces, target-phone evaluation and product integration
remain pending. The selected preview setting is an operator display choice,
not an override of the accepted L0 product representation.

1. Correct voxel-centre/corner conversion and units (implemented in this audit).
2. Produce a VTK display-surface comparison beside exact L0 and the source
   labelmap; emit geometry/topology reports. Pick the representation only after
   reviewing a real paired case.
3. Add per-label visibility/opacity, clipping, orientation and complete XYZ
   cross-reference to the local preview.
4. Preserve source scalar precision, support full affine reslicing and add
   optional MRI volume rendering. Evaluate vtk.js using its reslice, volume,
   clipping and PBR examples on the target WebView.
5. Integrate after the product contract supplies the volume/mesh artifacts,
   geometry, identity and independently verified source correspondence.

## Primary sources

- [Slicer closed-surface conversion source at the inspected commit](https://github.com/Slicer/Slicer/blob/e2963892cde1a736d625c41cf31380f893b8e4af/Libs/vtkSegmentationCore/vtkBinaryLabelmapToClosedSurfaceConversionRule.cxx)
- [Slicer: staircase artifacts and smoothing/detail tradeoffs](https://github.com/Slicer/Slicer/blob/main/Docs/user_guide/modules/segmenteditor.md)
- [VTK SurfaceNets: shared interfaces and constrained smoothing](https://vtk.org/doc/nightly/html/classvtkSurfaceNets3D.html)
- [Slicer volume rendering: scalar transfer functions and GPU ray casting](https://slicer.readthedocs.io/en/latest/user_guide/modules/volumerendering.html)
- [vtk.js official example gallery](https://kitware.github.io/vtk-js/examples/)
- [SCMR: standardized CMR interpretation and post-processing, 2020](https://link.springer.com/article/10.1186/s12968-020-00610-6)
- [MM-WHS data: anatomical label definitions](https://zmiclab.github.io/zxh/0/mmwhs/data.html)
- [NiBabel: voxel-centre coordinates and affines](https://nipy.org/nibabel/coordinate_systems.html)
- [NIfTI header specification: voxel centres and spatial units](https://github.com/nipy/nibabel/blob/master/doc/source/external/nifti1.h)
