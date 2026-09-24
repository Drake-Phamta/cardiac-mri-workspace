/*
 * Cache keys for slice artifacts.
 *
 * DR-015 bound PERF-FIRSTLOAD-01 to the budget and made caching PER SLICE;
 * whole-volume caching is out, and s4 prefetch was rejected. PR-CACHE-01 stays
 * a SHOULD, so a vertical may cache nothing at all - but if it caches, it
 * keys here, because the ways a cache can lie are all naming mistakes:
 *
 *   - raw and processed predictions of the same slice are DIFFERENT images.
 *     Omit the variant and a processed mask is served for a raw request. `11`
 *     section 6 forbids a silent variant substitution, and a cache that does
 *     it is a silent substitution with a longer lifetime.
 *   - an artifact is immutable but its id is not unique across versions of the
 *     source, so source_version (or the checksum) belongs in the key.
 *   - a geometry contract bump invalidates every cached pixel, so the geometry
 *     version is in the key rather than in a migration nobody will write.
 *
 * Keys are opaque strings. Nothing parses them back; a parser would be a
 * second definition of the format.
 */

import { CoreError } from './contract.mjs';

const SEP = '|';

function required(value, field) {
  if (value === undefined || value === null || value === '') {
    throw new CoreError('CACHE_KEY_INCOMPLETE', { field });
  }
  return String(value);
}

export function sliceCacheKey({
  kind, caseId, sliceIndex, variant = null, sourceVersion = null,
  checksum = null, geometryContractVersion, runId = null, reviewedMaskId = null,
}) {
  required(kind, 'kind');
  required(geometryContractVersion, 'geometryContractVersion');
  required(sliceIndex, 'sliceIndex');

  // One of the two must pin the bytes. Without either, two different images
  // can share a key, which is the only cache bug that shows a wrong mask.
  if (!sourceVersion && !checksum) {
    throw new CoreError('CACHE_KEY_INCOMPLETE', { field: 'sourceVersion|checksum' });
  }

  switch (kind) {
    case 'MRI':
    case 'GROUND_TRUTH':
      required(caseId, 'caseId');
      break;
    case 'PREDICTION':
      required(runId, 'runId');
      required(variant, 'variant'); // never defaulted - see the header
      break;
    case 'REVIEWED_MASK':
      required(reviewedMaskId, 'reviewedMaskId');
      break;
    default:
      throw new CoreError('CACHE_KEY_UNKNOWN_KIND', { kind });
  }

  return [
    'v1', kind, caseId ?? '-', runId ?? '-', reviewedMaskId ?? '-',
    String(sliceIndex), variant ?? '-', sourceVersion ?? '-', checksum ?? '-',
    geometryContractVersion,
  ].join(SEP);
}

/*
 * A key built from a response is the trustworthy one: the server states the
 * version, the checksum and the geometry it actually served, so the key
 * describes the bytes in hand rather than the bytes that were asked for.
 */
export function cacheKeyFromResponse(kind, data, { caseId = null, sliceIndex = null } = {}) {
  return sliceCacheKey({
    kind,
    caseId: caseId ?? data.case_id ?? null,
    runId: data.run_id ?? null,
    reviewedMaskId: data.reviewed_mask_id ?? null,
    sliceIndex: sliceIndex ?? data.slice_index,
    variant: data.prediction_variant ?? null,
    sourceVersion: data.source_version ?? null,
    checksum: data.checksum ?? null,
    geometryContractVersion: data.geometry_contract_version,
  });
}
