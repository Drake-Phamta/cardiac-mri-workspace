// node app/core/tests/test_cache_key.mjs
//
// A cache bug that evicts too eagerly costs milliseconds. A cache bug that
// COLLIDES shows a reviewer the wrong mask under the right case id. Every
// check here is about the second kind.

import { sliceCacheKey, cacheKeyFromResponse } from '../cacheKey.mjs';
import { createChecker, throwsCode } from './_harness.mjs';

const { check, done } = createChecker();
const GEO = 'dr008a-dr012/v1.0.0';
const base = { kind: 'PREDICTION', runId: 'RUN_1', sliceIndex: 7, sourceVersion: 'v3', geometryContractVersion: GEO };

// K1 — raw and processed predictions of the same slice are different images
// and must never share a key. `11` section 6 forbids a silent variant
// substitution; a colliding cache is one with a longer memory.
{
  const raw = sliceCacheKey({ ...base, variant: 'RAW' });
  const processed = sliceCacheKey({ ...base, variant: 'PROCESSED' });
  check('K1', raw !== processed, 'RAW and PROCESSED differ');
  check('K1', throwsCode(() => sliceCacheKey({ ...base, variant: null })) === 'CACHE_KEY_INCOMPLETE',
    'a prediction with no variant is refused rather than defaulted');
}

// K2 — the source version is part of identity. Artifacts are immutable, but
// an id alone does not pin which version of the source produced them.
{
  const a = sliceCacheKey({ ...base, variant: 'RAW', sourceVersion: 'v3' });
  const b = sliceCacheKey({ ...base, variant: 'RAW', sourceVersion: 'v4' });
  check('K2', a !== b, 'two source versions get two keys');
}

// K3 — a geometry contract bump invalidates every cached pixel, by key rather
// than by a migration nobody writes.
{
  const a = sliceCacheKey({ ...base, variant: 'RAW' });
  const b = sliceCacheKey({ ...base, variant: 'RAW', geometryContractVersion: 'dr008a-dr012/v2.0.0' });
  check('K3', a !== b, 'a geometry version bump changes the key');
}

// K4 — nothing may be pinned by nothing. Without a version or a checksum two
// different images can share a key, which is the only failure that shows a
// wrong mask.
{
  check('K4', throwsCode(() => sliceCacheKey({
    kind: 'MRI', caseId: 'C1', sliceIndex: 0, geometryContractVersion: GEO,
  })) === 'CACHE_KEY_INCOMPLETE', 'no sourceVersion and no checksum is refused');
  check('K4', typeof sliceCacheKey({
    kind: 'MRI', caseId: 'C1', sliceIndex: 0, checksum: 'abc', geometryContractVersion: GEO,
  }) === 'string', 'a checksum alone is enough');
}

// K5 — slice 0 is a real slice. A truthiness check on sliceIndex would reject
// it, and the symptom is "the first slice is never cached".
{
  check('K5', typeof sliceCacheKey({
    kind: 'MRI', caseId: 'C1', sliceIndex: 0, sourceVersion: 'v1', geometryContractVersion: GEO,
  }) === 'string', 'slice 0 produces a key');
}

// K6 — different kinds of mask for the same slice never collide. A ground
// truth cached under a prediction's key is a wrong overlay.
{
  const keys = new Set([
    sliceCacheKey({ kind: 'MRI', caseId: 'C1', sliceIndex: 7, sourceVersion: 'v1', geometryContractVersion: GEO }),
    sliceCacheKey({ kind: 'GROUND_TRUTH', caseId: 'C1', sliceIndex: 7, sourceVersion: 'v1', geometryContractVersion: GEO }),
    sliceCacheKey({ ...base, variant: 'RAW' }),
    sliceCacheKey({ kind: 'REVIEWED_MASK', reviewedMaskId: 'RM1', sliceIndex: 7, sourceVersion: 'v1', geometryContractVersion: GEO }),
  ]);
  check('K6', keys.size === 4, `${keys.size} distinct keys for 4 artifact kinds on one slice`);
}

// K7 — an unknown kind is refused, so a new artifact kind cannot join the
// cache without someone deciding what identifies it.
{
  check('K7', throwsCode(() => sliceCacheKey({
    kind: 'MESH', caseId: 'C1', sliceIndex: 1, sourceVersion: 'v1', geometryContractVersion: GEO,
  })) === 'CACHE_KEY_UNKNOWN_KIND', 'an unknown kind is refused');
}

// K8 — a key built from a response describes the bytes in hand, and agrees
// with the key built from the request that fetched them.
{
  const data = {
    run_id: 'RUN_1', slice_index: 7, prediction_variant: 'RAW', source_version: 'v3',
    checksum: 'deadbeef', geometry_contract_version: GEO,
  };
  const fromResponse = cacheKeyFromResponse('PREDICTION', data);
  const fromRequest = sliceCacheKey({ ...base, variant: 'RAW', checksum: 'deadbeef' });
  check('K8', fromResponse === fromRequest, 'response-derived and request-derived keys agree');
}

// K9 — keys are stable across calls. An unstable key is a cache that never hits.
{
  const a = sliceCacheKey({ ...base, variant: 'RAW' });
  const b = sliceCacheKey({ ...base, variant: 'RAW' });
  check('K9', a === b, 'the same inputs give the same key');
}

done('app/core cache key');
