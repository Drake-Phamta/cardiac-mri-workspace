# Proposal: API Contract 1.2.0 mesh artifact and exact slice linkage

**Status: proposal for architecture-owner review.** Contract 1.1.0 remains in force. This file does not authorize changing the frozen v1.0 spec or deploying an endpoint.

## Why a minor contract is needed

`reconstruction_get` currently returns a mesh artifact ID and a transform, but does not tell a client how to download and verify the bytes or how a picked triangle maps to its source slice. The existing artifact route is content-addressed for PNGs. A client cannot safely infer a mesh URL from an ID or use `floor(hit_z)` as a substitute: the L0 voxel-face mesh is exact only when the hit triangle's foreground voxel slice is preserved.

The mobile screen must keep the grayscale MRI and source mask as the review surface. A mesh is a derived segmentation surface for spatial orientation; it is not volume rendering and must not replace the source MRI/MPR.

## Proposed additions to `reconstruction_get`

Keep all v1.1 fields and add:

| Field | Rule |
|---|---|
| `content_url` | Immutable artifact URL under the backend's artifact route; supplied by the server, never constructed from `mesh_artifact_id` by a client |
| `checksum` | Required `sha256:<64 lowercase hex>` for the exact response bytes; the artifact route ETag must agree |
| `media_type` | `application/vnd.cmw.mesh+json;version=1.2.0` for the first implementation |
| `mesh_format` | `cmw-triangle-mesh-json/1` |
| `mesh_frame` | `source_voxel_index_xyz`; coordinates are source-mask voxel indices, not millimetres |
| `mesh_to_source_voxel_transform` | 16 finite numbers, row-major 4×4 matrix applied to homogeneous column vectors; maps mesh vertices into the source mask's `(x,y,z)` index frame |
| `source_mask_checksum` | Identity of the immutable source mask used to create this mesh |
| `surface_method` / `surface_level` | Explicitly report `VOXEL_FACES` and level `0` for the currently accepted exact-pick candidate |

The mesh content is a JSON object with `vertices_xyz`, `triangles`, `shape_xyz`, `face_source_slice`, and the exact geometry contract version. `triangles[t]` and `face_source_slice[t]` are a positional pair. Arrays are finite, triangle indices are in range, and the declared vertex/triangle counts must match. The client rejects a missing/unknown version, shape mismatch, invalid transform, count mismatch, checksum failure, or a face map whose length differs from the triangle count. The face map stays in the checksummed artifact rather than being duplicated in the metadata response.

## Coordinate and navigation rules

The v1.0 geometry contract has no direction matrix term and current LASC headers are not validated as millimetres. Therefore this proposal identifies the mesh in source voxel-index coordinates and carries the case geometry status unchanged. The UI may show voxel coordinates and slice index; it must not display `mm` or present a patient-space measurement while `geometry_validation_status` is `GEOMETRY_NOT_VALIDATED`.

Moving the axial source-slice control updates the plane position in the mesh viewer using that declared voxel index. A mesh hit navigates through `face_source_slice[t]`; a miss never navigates. A ground-truth-dependent error surface remains unavailable until DR-005 and a compatible reference artifact are accepted.

## Rollout and compatibility

1. Architecture owner reviews and approves this proposal.
2. Contract 1.2.0 is added through the project's decision and versioning process; 1.1.0 remains supported.
3. Backend artifact export/route emits the versioned mesh bytes and metadata from the exact source mask.
4. Mobile consumes only the declared URL/checksum/media type through `runtime.content`; it never downloads a full MRI volume to fabricate a mesh.
5. Synthetic contract, checksum, face-map and round-trip tests pass before live data is enabled. Real-mask and A17 validation remain separate evidence.

Until those steps are complete, SCR-05 shows the MRI/source-mask review and an explicit “3D mesh unavailable under API 1.1.0” state. It must not infer a mesh payload from the current artifact ID.
