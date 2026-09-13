# Spike E — AVD diagnostic measurement (2026-09-13)

**Status:** `DIAGNOSTIC_ONLY` — this record is not Spike E acceptance evidence.

**Owner / interpretation:** Nguyễn Gia Đức Trung  
**Command execution:** Codex, on behalf of Trung  
**Device operator:** not applicable (no physical phone was used)  
**Repository revision:** `37877e8`

## Purpose

The leader requested a measurement from the Android Virtual Device (AVD) on the
Mac Mini. This run checks that the AVD can reach the Mac Mini stub and records
rough end-to-end timings for the representative transport endpoints.

It must not be confused with the frozen Spike E acceptance path:

```text
Samsung Galaxy A17 → real 4G/5G cellular → ZeroTier overlay → Mac Mini
```

The AVD run is a supplementary diagnostic only.

## Environment and path

| Item | Value |
|---|---|
| Mac Mini | `10.134.129.115` |
| Stub | `http://10.134.129.115:8787` |
| AVD name | `Pixel_Tablet` |
| ADB device | `emulator-5554` |
| AVD model | `sdk_gphone16k_arm64` |
| Android | 17 |
| AVD network | NAT addresses in `10.0.2.x` |
| AVD ZeroTier interface | absent |
| Client tool | Android `toybox nc` (no Python/curl/wget on the AVD) |
| Payload source | synthetic stub payloads generated for the spike |

The request therefore travelled from the AVD's emulator/NAT networking to the
Mac Mini host and its stub. It did **not** travel through cellular data or a
ZeroTier interface on the AVD.

## Method

Each request was issued inside `emulator-5554` using Android Toybox netcat. The
elapsed time is measured inside the AVD with `date +%s%3N`, from sending the HTTP
request until the response stream closed. `payload_bytes` is the HTTP
`Content-Length`; `response_bytes` includes HTTP headers. All requests completed
with `HTTP/1.1 200 OK` and netcat exit code `0`.

Three repetitions were made for every endpoint except the whole-volume request,
which was made once because it transfers about 58 MB.

## Measurements

| Endpoint | Payload bytes | AVD elapsed samples (ms) | Median (ms) |
|---|---:|---:|---:|
| `/s1/slice/44.png` | 121,282 | 831, 990, 996 | 990 |
| `/s2/mask/44.bin` | 41,472 | 748, 532, 389 | 532 |
| `/s3/volume.raw` | 58,392,576 | 5,410 (1 run) | — |
| `/s4/window?z=44&radius=2` | 606,139 | 648, 854, 701 | 701 |
| `/mesh/0.obj` | 7,429 | 979, 934, 783 | 934 |
| `/mesh/1.obj` | 30,413 | 984, 984, 781 | 984 |
| `/mesh/2.obj` | 127,795 | 991, 883, 767 | 883 |
| `/mesh/3.obj` | 526,268 | 1,020, 1,020, 1,045 | 1,020 |

These numbers are diagnostic observations for this one AVD/stub run. They are
not a performance baseline and do not establish the cellular NFR thresholds.

## Reproduction command

Run from the workstation with SSH access to the Mac Mini:

```powershell
$script = @'
printf 'GET /health HTTP/1.0\r\nHost: 10.134.129.115\r\nConnection: close\r\n\r\n' |
  toybox nc -n -w 30 10.134.129.115 8787
'@
$script | ssh quant@10.134.129.115 `
  "/Users/quant/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell sh -s"
```

For the recorded table, the same pattern was repeated for each endpoint while
capturing AVD-side start/end timestamps and `Content-Length`.

## Acceptance boundary

This document deliberately does **not**:

- place AVD output in `spikes/spike_e_transport/EVIDENCE_RAW/`;
- create `RESULT.md` or mark E1/E7/E8/E9/E12 as passed;
- open GATE2 or change `SPIKE_PHASE_STATE.yaml`;
- replace the Galaxy A17 + real cellular + ZeroTier requirement in
  `SPIKE_E_TRANSPORT/TASK.md`, DR-003a, or DR-006a.

If the project intends for an AVD to replace the physical Galaxy A17 acceptance
device, that is a new decision: the leader must record and approve a formal
change to the frozen acceptance constraints before AVD results can be promoted
to acceptance evidence.

