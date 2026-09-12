EVIDENCE_RAW holds measurements taken by the spike OWNER on the real path.

    Galaxy A17 5G -> real 4G/5G cellular -> authenticated ZeroTier overlay
                  -> remote Mac mini M2, 24 GB

Nothing else belongs here. The loopback smoke test that proved this harness
runs was deliberately NOT kept: a file in this directory should be evidence,
and a Project Control smoke test is not. Its result is written up in ../README.md.

LAN runs, when you need them to separate network cost from server cost, are
fine here as long as the run header says measurement_path = lan-diagnostic.
The aggregation script refuses to merge them with acceptance runs.
