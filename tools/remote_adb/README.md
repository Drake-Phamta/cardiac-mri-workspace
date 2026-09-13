# `tools/remote_adb` — let a spike owner operate the Galaxy A17 remotely

`DR-006a` revision 1: the device is the leader's personal property and is **not handed over**.
The owner of each spike still presses the keys himself — from his own machine, over ZeroTier,
into the leader's adb server, down the USB cable to the phone.

```text
owner's machine --ZeroTier--> leader PC :5037 --USB--> Galaxy A17 --cellular--> overlay --> Mac mini
                  control channel                                    measured data path
```

The control channel goes over USB, not over the phone's own overlay link, so it does not
contaminate the path `E1` is measuring.

## The problem these scripts exist for

`adb` **cannot listen on one address**. `adb -a` listens on **every** interface. On the leader's
machine the home Wi-Fi is categorised **Public**, and two auto-created `adb.exe` rules allow
**Public / Remote Any**. So `adb -a` alone would share the phone with the whole Wi-Fi.

`setup_firewall.ps1` adds a **block** rule for TCP 5037 from every address outside
`10.134.129.1-254` (loopback excepted). Windows Firewall applies block before allow, so the broad
rules stop mattering for this port without being edited.

## Leader — once, then per session

```powershell
# ONCE, in an Administrator PowerShell
powershell -ExecutionPolicy Bypass -File tools\remote_adb\setup_firewall.ps1

# each session, in a NORMAL PowerShell, phone plugged in, USB debugging allowed
powershell -ExecutionPolicy Bypass -File tools\remote_adb\share_on.ps1
#   ...a window titled "REMOTE ADB - SHARING ON" stays open while shared...
powershell -ExecutionPolicy Bypass -File tools\remote_adb\share_off.ps1
```

`share_on.ps1` **refuses to start** if the block rule is missing.

## Operator — on your own machine

```bash
adb -H 10.134.129.145 -P 5037 devices -l      # must list the A17
adb -H 10.134.129.145 -P 5037 shell ...       # everything else the same way
# or: export ANDROID_ADB_SERVER_ADDRESS=10.134.129.145 ANDROID_ADB_SERVER_PORT=5037
```

Use a platform-tools release close to the leader's (`36.0.0`, adb `1.0.41`). A client that
disagrees on the protocol version tries to restart the server — which it cannot do remotely.

## What this does not change

- **Everyone on network `3b19b3a71652c5f0` can reach 5037 while sharing is on.** That is the team,
  by design. Sharing is off unless the window is open.
- The operator field in every evidence file records **who pressed the keys**. The device owner is
  recorded separately (`DR-006a`).

Undo the firewall change: `Remove-NetFirewallRule -DisplayName "CardiacMRI remote adb*"` (as admin).
