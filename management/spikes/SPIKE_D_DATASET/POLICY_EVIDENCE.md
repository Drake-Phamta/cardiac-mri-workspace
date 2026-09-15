# Spike D — CAP policy evidence for QA-002 F5

**Scope:** two CAP policy PDFs preserved privately with the acquisition record.
This is a policy reading for the project lead, **not** a determination that the
LASC 2018 challenge package is covered by a particular signed DDA. No policy
PDF or raw image is copied into this public repository.

| Private source | Relevant section | Finding |
|---|---|---|
| `CAPPolicyStatementUsers.pdf` (4 pages; SHA-256 `e0633f5b40d591c9769df65602e080b2d8859aeeb284fa54444daf19c67a1fe4`) | p. 2, CAP Data Distribution Policies and Procedures §6; p. 3 §7 | §6 restricts transferring CAP-provided data and modified/unmodified derivatives without prior CAP approval. §7 lists categories of non-data, including information demonstrably already public or independently developed. |
| `CAPPolicyStatementParticipants.pdf` (2 pages; SHA-256 `64324ff2f8adb22cc918c67e6471fd14032f74fe88dc58aee6ce95945d294ffb`) | p. 2, Participant Privacy | The CAP describes de-identification before its server and says CAP personnel/Users must not attempt participant identification. |

The public manifest currently contains release-directory IDs, per-volume
checksums and summary statistics. Those may be dataset-derived information;
the policy PDFs alone do **not** establish whether these exact fields are
permitted for this challenge release. The local absolute paths are removed
from regenerated artifacts immediately. Until the lead checks the applicable
challenge release terms/DDA or obtains CAP permission, this evidence does not
clear `A18`/F5 for acceptance.

**Decision requested of lead:** confirm whether the LASC 2018 challenge release
permits public publication of the currently tracked case-level metadata, or
direct us to replace it with a restricted/private manifest and a public
aggregate-only audit. Do not treat absence of names/images as sufficient proof.

Private files are under the operator's external
`lasc2018/official_terms/` archive; their names and hashes are in the
acquisition record, but their absolute machine path is intentionally omitted.
