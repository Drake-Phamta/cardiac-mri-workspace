EVIDENCE_RAW holds probe output from the spike OWNER's own compute.

C0-1 asks what compute EXISTS for this project. A run on somebody else's
machine answers a question about somebody else's machine, so the smoke tests
that proved this harness works were deliberately NOT kept here. They are
written up in ../README.md.

Be Quoc Khanh runs, on his own RTX 4050:

    python harness/probe.py --selftest
    python harness/probe.py --operator "Be Quoc Khanh" --img 560 --find-batch
    python harness/probe.py --operator "Be Quoc Khanh" --img 560 --find-batch --precision bf16

and commits what comes out, under his own account. Each file records the
checkpoint commit and weights SHA-256, the NVIDIA driver, the precision of
every trial, and the resize and normalization policy of the input.
