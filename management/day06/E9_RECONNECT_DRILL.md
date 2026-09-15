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

The run header must retain measurement_path: "lan-diagnostic". It may inform
the E9 design, but it cannot fill physical-device acceptance evidence.
