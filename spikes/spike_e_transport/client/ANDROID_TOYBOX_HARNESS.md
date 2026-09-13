# Android Toybox fallback harness

The Galaxy A17 does not have Python, Termux, `curl`, or `wget`. The fallback
client in [`android_toybox_harness.sh`](android_toybox_harness.sh) uses the
`nc` applet already shipped in Android Toybox, so no application install is
needed.

This is still a Spike E client harness, not production code. It writes JSONL to
the phone and keeps the required provenance fields (`operator`, `owner`,
`measurement_path`, and `overlay_connection`).

## Before running on the physical phone

1. The phone must be authorised on ZeroTier network `3b19b3a71652c5f0`.
2. Wi-Fi must be disabled; the data path must be phone cellular → ZeroTier →
   Mac Mini.
3. The leader must have remote ADB sharing enabled with
   `tools/remote_adb/share_on.ps1`.
4. Check that the handset has the required applet:

   ```powershell
   adb -H 10.134.129.145 -P 5037 shell toybox nc --help
   ```

   If `nc` is unavailable on the physical handset, stop and choose a reviewed
   static arm64 HTTP client instead. Do not silently use AVD results as a
   substitute.

## Run through remote ADB

The script is streamed to the phone; it does not need to be installed as an
APK. Use the real `cellular-overlay` path only after the phone is authorised
and the Mac Mini peer row has been checked for `DIRECT` or `RELAY`:

```powershell
$adb = 'C:\Users\Diep_PC\AppData\Local\Android\platform-tools\adb.exe'
$args = @(
  '-H', '10.134.129.145', '-P', '5037', 'shell', 'sh', '-s', '--',
  '--base', 'http://10.134.129.115:8787',
  '--path', 'cellular-overlay',
  '--connection', 'direct',
  '--operator', 'Nguyen Gia Duc Trung',
  '--owner', 'Nguyen Gia Duc Trung',
  '--slices', '88', '--window-radius', '2', '--repeats', '3',
  '--out', '/data/local/tmp/e_transport_android.jsonl'
)
Get-Content -Raw -Encoding utf8 spikes/spike_e_transport/client/android_toybox_harness.sh |
  & $adb @args
```

Pull the JSONL after the run:

```powershell
& $adb -H 10.134.129.145 -P 5037 pull `
  /data/local/tmp/e_transport_android.jsonl .
```

Keep the file outside `EVIDENCE_RAW` until the owner has checked the header,
the phone's `DIRECT`/`RELAY` value, and the cellular conditions. A run with
`--path lan-diagnostic` is explicitly diagnostic and must not be used for
acceptance.

## Deliberate limitation

Toybox netcat records total request time and the server's
`X-Server-Handling-Ms`, but it does not expose a reliable first-byte timestamp
in this shell-only implementation. Each sample therefore sets
`ms_to_first_byte` to `null` and documents the limitation. The owner/reviewer
must decide whether this fallback is sufficient for the acceptance fields; if
not, use a reviewed static client that can provide first-byte timing rather
than filling the field with an estimate.

## Local connect rejections — found on the real phone, 2026-09-13

Run 1 on the real cellular path lost 27 of 57 requests to
`nc: connect: Network is unreachable`. The cause is on the handset, not the
relay or the stub, and was pinned down as follows:

| Test | Result |
|---|---|
| connects to a public IP over cellular, not through ZeroTier | 15/15 ok |
| `ping` to the Mac mini through ZeroTier | 30/30, 0 % loss |
| `/proc/net/snmp` across 20 connects | `Icmp InDestUnreachs` unchanged; `Tcp ActiveOpens` rose only by the successes — **no SYN is sent** for a failure |
| connects pinned to each CPU with `taskset` | **cpu4 and cpu6: 0/5**, every other CPU 5/5; `ip route get 10.64.193.115` on those two CPUs prints **`multicast`** |

The VPN table holds `10.64.193.0/24 dev tun0` and `224.0.0.0/4 dev tun0` with
identical attributes, so the kernel gives them one shared per-CPU output-route
cache. A multicast send on a CPU leaves a multicast-flagged route there, and
the kernel refuses a TCP connect over a multicast-flagged route with
`ENETUNREACH`. ICMP is allowed on it, which is why ping stays clean.

**What the harness does about it.** A failure that is instant, empty, and says
`Network is unreachable` never reached the network, so the request is retried
at once, pinned to a rotating CPU, up to 8 times. Every sample records:

| Field | Meaning |
|---|---|
| `local_connect_rejections` | how many local rejections preceded this sample |
| `ms_total` | the attempt that actually reached the network |
| `ms_including_local_rejections` | wall time from the first attempt |
| `pinned_cpu` | the CPU the final attempt was pinned to, or `null` |

Tested on the phone: 20/20 `/health` requests ok, 9 of them after one local
rejection each.

**This is not only a harness problem.** An app on this phone opening TCP
connections to the Mac mini over ZeroTier will hit the same rejections, so the
rate belongs in the owner's `E9` / demo-risk analysis rather than being
treated as noise.

