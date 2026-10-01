# `E8` daytime capture — ready to run

`E8` needs a **time-of-day spread**, and the only capture so far is the evening of 2026-09-16, which started at 21:50 and is explicitly partial. This folder makes the daytime run a single command, so the operator spends the window measuring rather than assembling a command line.

**This script computes no `E` number.** It operates the handset, records bytes, hashes them and stops. Every latency distribution, p50/p95, throughput figure and `E8` verdict belongs to the spike owner, Nguyễn Gia Đức Trung, through his own `analyze/aggregate.py`.

## Run it

```bash
python management/day09/e8_capture/capture_e8.py --out <writable dir OUTSIDE the repo>
# preflight only, safe any time:
python management/day09/e8_capture/capture_e8.py --out <dir> --dry-run
```

It repeats the 2026-09-16 command exactly, so the two captures are comparable:

```text
--base http://10.64.193.115:8787 --path wifi-overlay --connection direct
--profile <576x576x88 | 640x640x88> --operator "Pham Tuan Anh" --owner "Nguyen Gia Duc Trung"
--slices 88 --window-radius 2 --repeats 3 --timeout 60
```

## Why the preflight looks like this

Health is **an address, an HTTP 200 from the phone, and a `DIRECT` peer** — never "is the process running". On 2026-09-16 the Mac mini silently left the ZeroTier network for about eight hours while the stub stayed alive and `LISTEN`ing on an address that no longer existed; a process check answered "yes" the whole time. So the script refuses to capture unless all of this holds:

| Check | How |
|---|---|
| the address exists on the Mac mini | `ifconfig` over SSH, not `ps` |
| a stub is bound to that address | the process list, as a second signal only |
| the handset is a `DIRECT` peer (`E12`) | `/usr/local/bin/zerotier-cli peers`, matching the phone's node id |
| the stub answers the phone | `GET /health` issued **from the handset** with the same `toybox nc` the harness uses |

Any failure aborts with the reasons named and writes `e8_session_ABORTED.json`. Nothing half-measured is left behind.

## Verified before it was needed

| Run | Result |
|---|---|
| `--dry-run`, real host, 2026-09-18 02:02 | address present, stub bound, peer row `078280bae8 … DIRECT … 171.224.180.45/19190`, `/health` **200** from the phone |
| `--dry-run --host 10.64.193.199` (control) | **exit 2**, three failures named: no such address, no stub bound, `/health` returned `None` |

The control matters: a preflight that never refuses is not a preflight.

## One trap this script already handles

`adb shell` joins its arguments into a single command line for the device shell, so quoting from PowerShell or Python is gone by the time the phone splits it. `--operator "Pham Tuan Anh"` arrives as two arguments and the harness exits 2. The flag and its value therefore travel as **one** argument, quoted for the remote shell: `--operator 'Pham Tuan Anh'`.

## After the run

The output directory holds one JSONL per profile plus `e8_session_<stamp>.json` with SHA-256, record and sample counts, the repeats seen, and the device conditions before and after. Commit the raw files to a Spike E evidence branch with a `PROVENANCE.md` in the shape of `EVIDENCE_RAW/20260916_evening/PROVENANCE.md`, then hand them to the owner. Do not aggregate them on the way.
