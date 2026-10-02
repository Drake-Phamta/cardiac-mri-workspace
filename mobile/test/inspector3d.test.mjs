import test from 'node:test';
import assert from 'node:assert/strict';

import { meshAvailability, MESH_STATE, sliceLabel, sourceMaskIdForVariant } from '../src/verticals/v2/inspector3d.mjs';

test('SCR-05 selects only the explicitly named prediction artifact', () => {
  const run = { raw_prediction_artifact_id: 'mask-raw', processed_prediction_artifact_id: 'mask-processed' };
  assert.equal(sourceMaskIdForVariant(run, 'RAW'), 'mask-raw');
  assert.equal(sourceMaskIdForVariant(run, 'PROCESSED'), 'mask-processed');
  assert.equal(sourceMaskIdForVariant(run, null), null);
  assert.equal(sourceMaskIdForVariant({ raw_prediction_artifact_id: null }, 'RAW'), null);
});

test('SCR-05 refuses to render a mesh from an API 1.1 artifact ID alone', () => {
  const view = { state: 'SUCCESS', data: { mesh_artifact_id: 'mesh-1', mesh_to_world_transform: [1] } };
  assert.equal(meshAvailability(view, '1.1.0').state, MESH_STATE.CONTRACT_GAP);
  assert.equal(meshAvailability(view, '1.2.0').state, MESH_STATE.CONTRACT_GAP);
});

test('SCR-05 accepts complete API 1.2 metadata but does not claim to validate mesh bytes', () => {
  const data = {
    mesh_artifact_id: 'mesh-1', content_url: '/api/v1/artifacts/hash.mesh.json',
    checksum: `sha256:${'a'.repeat(64)}`, media_type: 'application/vnd.cmw.mesh+json;version=1.2.0',
    mesh_format: 'cmw-triangle-mesh-json/1', mesh_frame: 'source_voxel_index_xyz',
    mesh_to_source_voxel_transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    source_mask_checksum: `sha256:${'b'.repeat(64)}`,
  };
  assert.equal(meshAvailability({ state: 'SUCCESS', data }, '1.1.0').state, MESH_STATE.CONTRACT_GAP);
  assert.equal(meshAvailability({ state: 'SUCCESS', data }, '1.2.0').state, MESH_STATE.METADATA_READY);
  assert.equal(meshAvailability({ state: 'SUCCESS', data: { ...data, mesh_to_source_voxel_transform: [1] } }, '1.2.0').state, MESH_STATE.CONTRACT_GAP);
  assert.equal(meshAvailability({ state: 'EMPTY_UNAVAILABLE', reason: 'ARTIFACT_NOT_FOUND' }, '1.1.0').state, MESH_STATE.NOT_FOUND);
});

test('source slice label keeps zero-based index explicit', () => {
  assert.equal(sliceLabel(0, 88), 'Source slice 1 / 88 (z = 0)');
  assert.equal(sliceLabel(null, 88), 'Source slice unavailable');
});
