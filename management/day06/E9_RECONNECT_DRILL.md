# Spike E E9 - controlled reconnect drill (AVD diagnostic)

**Owner:** Nguyen Gia Duc Trung · **Operator:** the person running ADB ·
**Status:** diagnostic procedure only. An AVD/LAN run is never acceptance
evidence for Spike E.

The Toybox harness can pause immediately before the first mesh request, retry a
TCP failure that produced no HTTP response, and record network_retries,
attempts, bytes_received, and (when --body-hash is enabled) body_sha256. This
makes the loss point explicit instead of silently dropping the failed request.

## Procedure

1. Start the two-profile stub on the Mac mini and verify /health first.
2. Start one AVD diagnostic run. Use a short timeout so a disabled link does
   not wait 60 seconds:

~~~powershell
$adb = 'C:\Users\Diep_PC\AppData\Local\Android\platform-tools\adb.exe'
$args = @(
  'shell', 'sh', '-s', '--',
  '--base', 'http://10.64.193.115:8787',
  '--path', 'lan-diagnostic', '--connection', 'direct',
  '--profile', '576x576x88',
  '--operator', 'AVD operator', '--owner', 'Nguyen Gia Duc Trung',
  '--slices', '88', '--window-radius', '2', '--repeats', '1',
  '--timeout', '3', '--network-retries', '8', '--retry-delay', '1',
  '--pause-before-mesh', '15', '--body-hash',
  '--out', '/data/local/tmp/e9_reconnect.jsonl'
)
Get-Content -Raw -Encoding utf8 spikes/spike_e_transport/client/android_toybox_harness.sh |
  & $adb @args
~~~

3. Wait for the stderr marker
   RECONNECT_WINDOW: pause 15 seconds before first mesh request.
   Immediately disable the AVD network, record the time, wait about three
   seconds, then restore it and record the time:

~~~powershell
& $adb shell svc wifi disable
# record loss time; wait about 3 seconds
& $adb shell svc wifi enable
~~~

   If the AVD uses a different uplink, use the emulator's equivalent toggle
   and write the exact command in the record below. Do not claim that Wi-Fi was
   lost if the toggle did not affect the AVD route.

4. Pull the JSONL and inspect the mesh records:

~~~powershell
& $adb pull /data/local/tmp/e9_reconnect.jsonl .
python -c "import json,sys; r=[json.loads(x) for x in open(sys.argv[1],encoding='utf-8')]; print(json.dumps([x for x in r if x.get('criterion')=='E6'],indent=2))" .\e9_reconnect.jsonl
~~~

   A successful recovery has a mesh sample with ok: true,
   network_retries > 0, bytes_received == bytes, and a 64-character
   body_sha256. A failed recovery is still useful evidence: keep the sample,
   its error, and the number of attempts; do not turn it into a pass.

## Physical Galaxy A17 run (leader presses the controls)

This is the only procedure that can produce physical-device E9 evidence.
Trung owns the design and interpretation; **Pham Tuan Anh is the device
operator under DR-006a**. The leader must use the actual release/build and
record the ADB endpoint and uplink. Do not label an AVD, LAN, or workstation
run as physical evidence.

### Preflight (before touching the link)

1. Keep the phone on the canonical `Wi-Fi uplink -> ZeroTier -> Mac mini`
   path (`wifi-overlay`). A cellular run is a separate `cellular-overlay`
   record and must not be mixed into the Wi-Fi aggregate.
2. Confirm remote ADB is authorised and the Toybox applet is present. From the
   workstation, the reviewed endpoint is:

~~~powershell
$adb = 'C:\Users\Diep_PC\AppData\Local\Android\platform-tools\adb.exe'
& $adb -H 10.134.129.145 -P 5037 shell toybox nc --help
~~~

   If remote ADB itself depends on the Wi-Fi link being toggled, use the
   leader's local USB ADB for the toggle; otherwise the control channel would
   disappear before the restore command. Record which control path was used.
3. From a workstation route that reaches the Mac mini, check `/health` and
   both requested profile headers before the run. The expected lengths are
   **29,196,288** for `576x576x88` and **36,044,800** for `640x640x88`;
   each response must identify the same profile in `X-Payload-Profile` and
   `/health` must list both profiles. Save the command output, stub commit, and
   profile-manifest checksum in the evidence record. Do not proceed if the
   profile/length pair is wrong.

### Run and controlled loss

Stream the reviewed Toybox harness to the physical phone. The command below
is complete; repeat it once with `--profile 640x640x88` after the first profile
if both profiles are required. Keep the operator/owner fields unchanged.

~~~powershell
$args = @(
  '-H', '10.134.129.145', '-P', '5037', 'shell', 'sh', '-s', '--',
  '--base', 'http://10.134.129.115:8787',
  '--path', 'wifi-overlay', '--connection', 'direct',
  '--profile', '576x576x88',
  '--operator', 'Pham Tuan Anh', '--owner', 'Nguyen Gia Duc Trung',
  '--slices', '88', '--window-radius', '2', '--repeats', '1',
  '--timeout', '3', '--network-retries', '8', '--retry-delay', '1',
  '--pause-before-mesh', '15', '--body-hash',
  '--out', '/data/local/tmp/e9_reconnect_real.jsonl'
)
Get-Content -Raw -Encoding utf8 spikes/spike_e_transport/client/android_toybox_harness.sh |
  & $adb @args
~~~

When stderr prints `RECONNECT_WINDOW`, the leader records the timestamp,
briefly disables the **phone's actual Wi-Fi uplink**, waits about three
seconds, then restores it. Prefer the leader's local/USB ADB for these two
commands; with remote ADB use the reviewed out-of-band control channel:

~~~powershell
& $adb shell svc wifi disable   # record loss_start immediately
# wait about 3 seconds; record restore_start
& $adb shell svc wifi enable
~~~

After the harness exits, pull the JSONL and retain the original file:

~~~powershell
& $adb -H 10.134.129.145 -P 5037 pull /data/local/tmp/e9_reconnect_real.jsonl .
python -c "import json,sys; r=[json.loads(x) for x in open(sys.argv[1],encoding='utf-8')]; print(json.dumps([x for x in r if x.get('criterion')=='E6'],indent=2))" .\e9_reconnect_real.jsonl
~~~

For a recovery, the affected E6 sample has `ok: true`,
`network_retries > 0`, `attempts > 1`, `bytes_received == bytes`, and a
64-character `body_sha256`. A failed recovery is not discarded: keep its
error and attempt count, mark E9 as failed/diagnostic, and do not convert it
to a pass. The physical run is acceptance evidence only when the header,
profile, operator, uplink, and loss/restore timestamps are all present.

## Evidence record

| Field | Record |
|---|---|
| AVD/device and build | [RECORD] |
| Stub commit and profile | [RECORD] |
| Link-loss command | [RECORD] |
| Loss start / restore time | [RECORD] |
| Mesh request affected | [RECORD] |
| network_retries / attempts | [RECORD] |
| Final ok / HTTP status | [RECORD] |
| bytes / bytes_received | [RECORD] |
| body_sha256 | [RECORD or null if sha256sum unavailable] |
| Recovery time and user-visible error | [RECORD] |
| Physical run: ADB endpoint, uplink, build/release | [RECORD] |
| Stub `/health` + two profile preflight output/checksum | [RECORD] |
| Loss/restore timestamps and control channel (USB or remote) | [RECORD] |

The AVD section's run header must retain `measurement_path: "lan-diagnostic"`.
The physical section must instead retain `measurement_path: "wifi-overlay"`
(or `cellular-overlay` for a separately labelled cellular run). The AVD output
may inform E9 design, but it cannot fill physical-device acceptance evidence.
