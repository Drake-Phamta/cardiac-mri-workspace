EVIDENCE_RAW holds measurements on the real path.

    Galaxy A17 5G -> Wi-Fi uplink (wifi-overlay)  or  cellular (cellular-overlay)
                  -> authenticated ZeroTier overlay -> remote Mac mini M2, 24 GB

Amended 2026-09-13: DR-003b made the Wi-Fi uplink the canonical access path,
and DR-006a revision 2 made the leader the device operator for Spike E; the
owner designs and interprets. Every run header names both.

Nothing else belongs here. The loopback smoke test that proved this harness
runs was deliberately NOT kept: a file in this directory should be evidence,
and a Project Control smoke test is not. Its result is written up in ../README.md.

LAN runs, when you need them to separate network cost from server cost, are
fine here as long as the run header says measurement_path = lan-diagnostic.
The aggregation script refuses to merge them with acceptance runs.
