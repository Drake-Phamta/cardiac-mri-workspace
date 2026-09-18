# Spike D — CAP policy evidence for QA-002 F5

**Scope:** two CAP policy PDFs preserved privately with the acquisition record.
This is a policy reading for the project lead, **not** a determination that the
LASC 2018 challenge package is covered by a particular signed DDA. No policy
PDF or raw image is copied into this public repository.

| Private source | Relevant section | Finding |
|---|---|---|
| `CAPPolicyStatementUsers.pdf` (4 pages; SHA-256 `e0633f5b40d591c9769df65602e080b2d8859aeeb284fa54444daf19c67a1fe4`) | p. 2, CAP Data Distribution Policies and Procedures §6; p. 3 §7 | §6 restricts transferring CAP-provided data and modified/unmodified derivatives without prior CAP approval. §7 lists categories of non-data, including information demonstrably already public or independently developed. |
| `CAPPolicyStatementParticipants.pdf` (2 pages; SHA-256 `64324ff2f8adb22cc918c67e6471fd14032f74fe88dc58aee6ce95945d294ffb`) | p. 2, Participant Privacy | The CAP describes de-identification before its server and says CAP personnel/Users must not attempt participant identification. |

The policy PDFs alone do **not** establish whether every dataset-derived field
may be published. On 2026-09-16 the leader therefore decided F5 conservatively:

- the public manifest may retain case IDs, shape/dtype metadata, aggregate
  statistics, A1–A20 verdicts, the source-package checksum, and reproducibility
  commands;
- the per-data-file SHA-256 table and pairwise similarity scores stay in
  restricted artifacts outside the repository;
- the public manifest records the deterministic restricted checksum-manifest
  SHA-256 and the command that regenerates it, but no private absolute path.

The validator enforces that boundary: `--write-manifest` creates a public
manifest in the repository and a deterministic restricted manifest beside the
private source package (or at `--restricted-manifest-out`). It refuses to write
the restricted artifact anywhere inside the repository. This resolves the F5
scope decision; it does not by itself accept `A18` or `GATE-DATA-01`.

Private files are under the operator's external
`lasc2018/official_terms/` archive; their names and hashes are in the
acquisition record, but their absolute machine path is intentionally omitted.
