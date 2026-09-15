# Contract 1 - raw dataset / case ingestion (DRAFT v0)

This directory is the Day 6–9 M3 draft approved by DR-004. It describes the
offline-CLI contract for ingesting the validated raw dataset objects
MRICase, MRIVolume, and GroundTruthMask. It is documentation, a JSON
Schema, and a small synthetic validator/test only; it is **not** a production
ingestion module and it does not freeze an API.

## Gate and invariants

- The manifest is accepted only when gate.gate_data_01 is ACCEPTED.
  OPEN, BLOCKED, or an absent gate is rejected with
  GATE_DATA_01_NOT_ACCEPTED.
- NRRD files must open, be 3D, and agree with the manifest's shape_xyz,
  spacing_xyz, origin, and direction matrix.
- When a ground-truth mask is present, MRI and mask shape/spacing/origin/direction
  must match. A mismatch is a hard error; no implicit resampling is allowed by
  Contract 1. In inference-review mode the mask may be null and compatibility
  must also be null.
- The MVP accepts axis-aligned geometry only. Any non-axis-aligned direction
  matrix is rejected with GEOMETRY_NOT_VALIDATED (DR-012).
- A ground-truth mask uses exactly {0, 255} and declares LA cavity and
  dataset annotation; the mapping is recorded, never inferred silently.
- Only the metadata allowlist in the schema is copied to application records.
  Direct identifiers such as patient names, dates of birth, and hospital
  numbers are rejected.
- Each artifact is immutable and addressed by its URI plus SHA-256 checksum.
  Re-ingesting the same checksum is a no-op; a changed checksum is an error,
  never an overwrite.

## Manifest and CLI

The manifest is versioned and carries package provenance, exact case IDs, and
the file paths relative to the package root. artifact_uri is the stable store
address; source_path is only the path inside the acquired package.

~~~text
python validate_contract1.py \
  --manifest fixtures/valid_manifest.json \
  --root fixtures
~~~

Expected output is PASS: Contract 1 DRAFT v0 ....

The validator uses only the Python standard library so the synthetic checks
run without pynrrd. It parses the small ASCII NRRD fixtures to prove that the
shape, spacing, axis alignment, label values, and checksums are not just
unchecked JSON claims.

## Synthetic acceptance cases

~~~text
python test_contract1.py
~~~

The test covers:

1. a valid accepted manifest;
2. an open GATE-DATA-01;
3. a non-axis-aligned direction (GEOMETRY_NOT_VALIDATED);
4. MRI/mask shape mismatch;
5. a disallowed direct-identifier metadata key; and
6. idempotency: same checksum is NO_OP, changed checksum is
   CHECKSUM_CONFLICT.

All fixtures are synthetic and must not be cited as dataset evidence.
