"""Optional VTK display surfaces; the source labelmap is never modified."""
from __future__ import annotations

import numpy as np
import vtk
from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy

from backend.mesh.surface import build_case_mesh

VARIANTS = {
    "voxel": {"name": "Exact voxel faces", "method": "voxel", "factor": 0.0},
    "flying": {"name": "FlyingEdges · no smoothing", "method": "flying", "factor": 0.0},
    "gentle": {"name": "FlyingEdges · gentle smoothing", "method": "flying", "factor": 0.2},
    "slicer": {"name": "FlyingEdges · Slicer default smoothing", "method": "flying", "factor": 0.5},
    "nets": {"name": "SurfaceNets · constrained smoothing", "method": "nets", "factor": 0.0},
}


def polydata(vertices, triangles):
    result = vtk.vtkPolyData()
    points = vtk.vtkPoints()
    points.SetData(numpy_to_vtk(np.ascontiguousarray(vertices, dtype=np.float64), deep=True))
    result.SetPoints(points)
    cells = np.column_stack((np.full(len(triangles), 3), triangles)).astype(np.int64)
    cell_array = vtk.vtkCellArray()
    cell_array.ImportLegacyFormat(numpy_to_vtkIdTypeArray(cells.ravel(), deep=True))
    result.SetPolys(cell_array)
    return result


def legacy_cells(poly):
    """Triangles as the flat [3, a, b, c, ...] layout the browser loader reads."""
    exported = vtk.vtkIdTypeArray()
    poly.GetPolys().ExportLegacyFormat(exported)
    return vtk_to_numpy(exported)


def image_for_mask(mask):
    padded = np.pad(mask.astype(np.uint8), 1)
    image = vtk.vtkImageData()
    image.SetDimensions(padded.shape)
    image.SetOrigin(-1, -1, -1)
    image.SetSpacing(1, 1, 1)
    image.GetPointData().SetScalars(numpy_to_vtk(padded.ravel(order="F"), deep=True))
    return image


def surface(mask, affine, variant):
    settings = VARIANTS[variant]
    if settings["method"] == "voxel":
        mesh = build_case_mesh(mask, level=0, spacing=(1, 1, 1), origin=(-0.5, -0.5, -0.5), shape_xyz=mask.shape)
        source = polydata(mesh.vertices_world, mesh.triangles)
    else:
        image = image_for_mask(mask)
        if settings["method"] == "nets":
            extractor = vtk.vtkSurfaceNets3D()
            extractor.SetNumberOfIterations(5)
            extractor.AutomaticSmoothingConstraintsOff()
            extractor.SetConstraintStrategyToConstraintDistance()
            extractor.SetConstraintDistance(0.35)
            extractor.SmoothingOn()
        else:
            extractor = vtk.vtkDiscreteFlyingEdges3D()
            extractor.ComputeNormalsOff()
            extractor.ComputeGradientsOff()
        extractor.SetInputData(image)
        extractor.SetValue(0, 1)
        extractor.Update()
        source = extractor.GetOutput()
        factor = settings["factor"]
        if factor:
            smoother = vtk.vtkWindowedSincPolyDataFilter()
            smoother.SetInputData(source)
            smoother.SetNumberOfIterations(int(20 + 40 * factor))
            smoother.SetPassBand(10 ** (-4 * factor))
            smoother.BoundarySmoothingOff()
            smoother.FeatureEdgeSmoothingOff()
            smoother.NonManifoldSmoothingOn()
            smoother.NormalizeCoordinatesOn()
            smoother.Update()
            source = smoother.GetOutput()
    transform = vtk.vtkTransform()
    transform.SetMatrix(np.asarray(affine, dtype=np.float64).ravel())
    transformed = vtk.vtkTransformPolyDataFilter()
    transformed.SetInputData(source)
    transformed.SetTransform(transform)
    triangulated = vtk.vtkTriangleFilter()
    triangulated.SetInputConnection(transformed.GetOutputPort())
    normals = vtk.vtkPolyDataNormals()
    normals.SetInputConnection(triangulated.GetOutputPort())
    normals.SplittingOff()
    normals.ConsistencyOn()
    # Corner/edge contacts in a discrete label can be non-manifold. Traversing
    # those contacts can flip an otherwise outward shell and corrupt volume.
    normals.NonManifoldTraversalOff()
    normals.AutoOrientNormalsOn()
    normals.ComputePointNormalsOn()
    normals.Update()
    result = vtk.vtkPolyData()
    result.DeepCopy(normals.GetOutput())
    return result


def topology(poly):
    triangles = legacy_cells(poly).reshape(-1, 4)[:, 1:]
    edges = np.sort(np.concatenate((triangles[:, :2], triangles[:, 1:], triangles[:, ::2])), axis=1)
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    connected = vtk.vtkPolyDataConnectivityFilter()
    connected.SetInputData(poly)
    connected.SetExtractionModeToAllRegions()
    connected.Update()
    mass = vtk.vtkMassProperties()
    mass.SetInputData(poly)
    mass.Update()
    return {
        "vertices": poly.GetNumberOfPoints(), "triangles": poly.GetNumberOfPolys(),
        "boundary_edges": int(np.count_nonzero(counts == 1)),
        "non_manifold_edges": int(np.count_nonzero(counts > 2)),
        "connected_regions": connected.GetNumberOfExtractedRegions(),
        "euler_characteristic": int(poly.GetNumberOfPoints() - len(unique) + len(triangles)),
        "enclosed_mesh_volume_ml": float(mass.GetVolume() / 1000),
    }


def comparison(poly, reference, label_volume_ml):
    distance = vtk.vtkDistancePolyDataFilter()
    distance.SetInputData(0, poly)
    distance.SetInputData(1, reference)
    distance.SignedDistanceOff()
    distance.ComputeSecondDistanceOn()
    distance.Update()
    samples = np.concatenate([
        vtk_to_numpy(distance.GetOutput().GetPointData().GetArray("Distance")),
        vtk_to_numpy(distance.GetSecondDistanceOutput().GetPointData().GetArray("Distance")),
    ])
    report = topology(poly)
    report.update({
        "distance_sampling": "symmetric vertices to exact source voxel-face triangles, in RAS mm",
        "mean_surface_distance_mm": float(samples.mean()),
        "hd95_vertex_sample_mm": float(np.percentile(samples, 95)),
        "max_vertex_sample_distance_mm": float(samples.max()),
        "source_label_volume_ml": label_volume_ml,
        "mesh_volume_change_percent": float((report["enclosed_mesh_volume_ml"] / label_volume_ml - 1) * 100),
        "clinical_acceptance": "not evaluated; vertex sampling is not a proof of maximum continuous surface error",
    })
    return report


def arrays(poly):
    return {
        "points": vtk_to_numpy(poly.GetPoints().GetData()).astype("<f4"),
        "cells": legacy_cells(poly).astype("<u4"),
        "normals": vtk_to_numpy(poly.GetPointData().GetNormals()).astype("<f4"),
    }
