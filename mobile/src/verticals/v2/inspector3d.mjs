export const MESH_STATE = Object.freeze({
  LOADING: 'LOADING',
  NO_SOURCE: 'NO_SOURCE',
  NOT_FOUND: 'NOT_FOUND',
  CONTRACT_GAP: 'CONTRACT_GAP',
  METADATA_READY: 'METADATA_READY',
  ERROR: 'ERROR',
});

export function sourceMaskIdForVariant(run, variant) {
  if (!run || (variant !== 'RAW' && variant !== 'PROCESSED')) return null;
  const value = variant === 'RAW' ? run.raw_prediction_artifact_id : run.processed_prediction_artifact_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function meshAvailability(view, apiContractVersion) {
  if (!view || view.state === 'LOADING') return { state: MESH_STATE.LOADING, message: 'Loading reconstruction reference…' };
  if (view.state === 'SUCCESS') {
    const data = view.data || {};
    const transform = data.mesh_to_source_voxel_transform;
    const fieldsPresent = typeof data.content_url === 'string' && data.content_url.length > 0
      && typeof data.checksum === 'string' && /^sha256:[a-f0-9]{64}$/.test(data.checksum)
      && data.media_type === 'application/vnd.cmw.mesh+json;version=1.2.0'
      && data.mesh_format === 'cmw-triangle-mesh-json/1'
      && data.mesh_frame === 'source_voxel_index_xyz'
      && Array.isArray(transform) && transform.length === 16 && transform.every(Number.isFinite)
      && typeof data.source_mask_checksum === 'string' && /^sha256:[a-f0-9]{64}$/.test(data.source_mask_checksum);
    if (apiContractVersion === '1.2.0' && fieldsPresent) {
      return { state: MESH_STATE.METADATA_READY, data, message: 'A versioned mesh reference is available; artifact bytes still need validation before rendering.' };
    }
    return {
      state: MESH_STATE.CONTRACT_GAP,
      message: apiContractVersion === '1.1.0'
        ? 'The server returned a mesh ID, but API 1.1.0 does not provide verified mesh bytes or the per-face slice map.'
        : `The API ${apiContractVersion || 'version is unknown'} mesh reference is incomplete or does not match the proposed 1.2.0 format.`,
    };
  }
  const code = (view.error && view.error.code) || view.reason;
  if (code === 'ARTIFACT_NOT_FOUND') {
    return { state: MESH_STATE.NOT_FOUND, message: 'No reconstruction is available for this source mask.' };
  }
  return {
    state: MESH_STATE.ERROR,
    message: (view.error && view.error.safeMessage) || view.reason || 'The reconstruction could not be loaded.',
  };
}

export function sliceLabel(sliceIndex, total) {
  if (!Number.isInteger(sliceIndex) || !Number.isInteger(total) || total < 1) return 'Source slice unavailable';
  return `Source slice ${sliceIndex + 1} / ${total} (z = ${sliceIndex})`;
}
