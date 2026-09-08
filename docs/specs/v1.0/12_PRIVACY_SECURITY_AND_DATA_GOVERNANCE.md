# 12 — PRIVACY, SECURITY, AND DATA GOVERNANCE

**Status:** Frozen v1.0  
**Depends on:** `00`–`11`

---

## 1. Product positioning

The MVP is for research/education and model investigation. It is **not intended for clinical diagnosis or treatment decisions**.

The UI/report must avoid claims implying regulatory approval, clinical validation, or diagnostic reliability.

---

## 2. Data minimization

The application shall operate on de-identified case IDs.

Do not store unless explicitly required and approved:

- patient name;
- date of birth;
- national ID;
- hospital record number;
- contact information;
- unrelated clinical notes.

Technical imaging metadata required for geometry/reproducibility may be preserved.
Application ingestion must implement a metadata allowlist. Unexpected direct identifiers discovered in headers/sidecar metadata must not be propagated into app/database/log payloads without explicit approval.

---

## 3. Dataset usage governance

- Obtain the dataset from the documented official source.
- Preserve any license/data-use terms accompanying the download.
- Do not redistribute the dataset outside permitted terms.
- Store source URL, acquisition date, and package checksum/manifest where feasible.
- Reports must cite the actual dataset source/protocol.

---

## 4. Storage classes

### Immutable research sources

- MRI volumes;
- dataset ground truth;
- raw model predictions.

### Derived artifacts

- processed predictions;
- meshes;
- metrics.

### Human-derived artifacts

- reviewed masks;
- findings;
- review state.

Retention/deletion behavior must avoid breaking provenance silently. If an artifact is deleted, dependent records should be marked invalid/unavailable rather than silently pointing to a different artifact.

---

## 5. Access control and deployment profiles

The selected profile follows `09` and is frozen by `GATE-DEPLOY-01` / `ADR-DEPLOY-001`.

### LOCAL_DEMO

Authentication may be omitted only when the backend is not publicly exposed and is bound to localhost/trusted private network. Even in this profile:

- no public unauthenticated writes;
- dataset/artifact directories are not served as open directory listings;
- write actions remain attributable to the configured project reviewer alias where review provenance is stored.

### REMOTE_DEMO

If reachable over the public internet:

- project-level authentication/authorization is mandatory for write operations;
- read access must comply with dataset terms;
- tokens/credentials use secure storage appropriate to the selected mobile stack;
- server validates authorization rather than trusting client UI state.

Full consumer account management, password recovery, or clinical RBAC is outside the current MVP unless separately approved.

## 6. Transport and secrets

- Use HTTPS/TLS in remotely deployed environments.
- Store secrets in environment/secret configuration, never source control.
- Rotate leaked credentials.
- Avoid embedding long-lived privileged credentials in the mobile binary.

---

## 7. Logging

Ordinary logs may contain:

- request ID;
- case internal ID;
- run ID;
- error code;
- timing/performance metadata.

Ordinary logs should not contain:

- raw MRI byte dumps;
- full mask payloads;
- unnecessary original identifiers;
- passwords/tokens/secrets.

---

## 8. Mobile caching

If the mobile app caches slices/meshes/results:

- cache only what is needed for usability;
- define clear invalidation/versioning;
- avoid logging cached content paths with sensitive source metadata;
- delete/clear project data according to selected app lifecycle policy;
- provide a documented project-cache clear mechanism before final demo/hand-off if local artifacts persist on device;
- validate cache keys against artifact/run version so a stale mask cannot be shown over a different run.

---

## 8.1 Privacy/security acceptance gate

Before a remotely reachable demo is accepted, verify:

- no dataset directory is publicly enumerable;
- write endpoints reject unauthorized requests;
- secrets scan passes;
- ordinary logs contain no raw image/mask payload or credential;
- mobile bundle contains no privileged long-lived server secret;
- metadata audit found no unexpected direct identifiers in app-visible records.

For LOCAL_DEMO, verify the service is not unintentionally bound/exposed beyond the trusted demo network.

## 9. Scientific governance

- Do not report ground-truth-dependent metrics without ground truth.
- Do not call reviewed masks “ground truth” unless a valid expert/reference process exists.
- Do not claim a causal medical explanation for model failure without evidence.
- Do not compare numbers across incompatible datasets/protocols as if equivalent.

---

## 10. Individual mobile-course responsibility

Every member-owned mobile function must demonstrate awareness of privacy/data handling relevant to that function during report/defense, satisfying the course requirement to apply personal-data/privacy protection rules.

