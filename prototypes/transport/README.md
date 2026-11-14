# SPIKE_E — transport harness

This directory contains throwaway transport tooling, not production code. The
Spike E owner is Nguyen Gia Duc Trung. The device operator and the owner must
both be recorded in every real run; the tooling never invents measurements.

## Measurement path

The canonical acceptance path is:

```text
Galaxy A17 5G -> Wi-Fi uplink (DR-003b canonical) or cellular uplink
               -> authenticated ZeroTier overlay -> remote Mac mini M2
```

Same-LAN runs are `lan-diagnostic` only and must never be merged into an
acceptance result. `direct` and `relayed` overlay runs are also kept separate.

## Layout

```text
payloads/generate.py   deterministic synthetic payload profiles
stub/server.py         backend stub and server-side timing log
client/harness.py      machine-readable request timing log
client/retry.py        E9 reconnect/retry probe
analyze/aggregate.py   p50/p95/max aggregation with failure accounting
EVIDENCE_RAW/          raw runs supplied by the device operator
```

## A6 payload profiles

Spike D measured the cohort profiles as `uint8`:

| Profile | Observed cases | Raw volume bytes |
|---|---:|---:|
| `576x576x88` | 69 | 29,196,288 |
| `640x640x88` | 85 | 36,044,800 |

The generator produces deterministic synthetic stand-ins at both sizes. They
are not dataset bytes and are never committed. Run:

```bash
python payloads/generate.py --out payloads/out
```

The output contains one directory per profile and a root manifest. The stub
serves both profiles from one process; select a profile on any artifact URL:

```text
/s1/slice/44.png?profile=576x576x88
/s3/volume.raw?profile=640x640x88
/s4/window?z=44&radius=2&profile=576x576x88
/mesh/2.obj?profile=640x640x88
```

If `profile` is omitted, the manifest's default profile (`576x576x88`) is
used. Legacy single-profile payload directories remain supported.

Start the stub loopback by default. Binding a ZeroTier address is allowed only
on the authenticated overlay; never expose a public endpoint:

```bash
python stub/server.py --payloads payloads/out
python stub/server.py --payloads payloads/out --bind <zerotier-address>
```

## Client and aggregation

Both flags are mandatory so provenance cannot be guessed:

```text
--path        wifi-overlay | cellular-overlay | lan-diagnostic
--connection  direct | relayed
```

Example acceptance-path run:

```bash
python client/harness.py --base http://<zerotier-address>:8787 \
    --path wifi-overlay --connection direct \
    --profile 576x576x88 --slices 88 --repeats 3 \
    --operator "Pham Tuan Anh" --owner "Nguyen Gia Duc Trung" \
    --repeats 3 --note "Wi-Fi uplink, location, time, signal"
```

Aggregate only runs with named operator/owner and one path/connection:

```bash
python analyze/aggregate.py EVIDENCE_RAW/e_transport_*.jsonl --out summary.json
```

The script reports failure rate with every distribution, refuses to merge
paths or direct/relay samples, and exits non-zero for an unrepresentative run.
It supplies inputs; the owner writes E10 (budget), E11 (minimal fallback) and
E13 (recommendation). A diagnostic LAN run is never acceptance evidence.

## Constraints

- Do not edit `docs/specs/v1.0/`.
- Do not commit dataset bytes, checkpoints, secrets, or generated payloads.
- Do not create a public endpoint, port forwarding, or public artifact listing.
- Do not create `RESULT.md` with fabricated values. Real raw evidence must
  identify the operator, owner, device, path, connection, and conditions.
