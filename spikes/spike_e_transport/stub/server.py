#!/usr/bin/env python3
"""
Spike E backend stub — serves the four candidate transport strategies.

THROWAWAY SPIKE CODE under spikes/spike_e_transport/. Not production.

`SPIKE_E_TRANSPORT/TASK.md` permits Claude to write this:

    "Claude may: write the backend stub, build the client harness and
     instrumentation, write the aggregation scripts, prepare the result
     template, and analyse measurements the owner supplies."

and keeps the measurements attributable:

    DR-006a requires every evidence run to name both the device operator (the
    person who physically runs the phone) and the owner (Nguyen Gia Duc Trung,
    who owns the criteria and interpretation). The stub does not create or
    certify measurements.

    WHERE THIS MUST RUN FOR ACCEPTANCE

        Samsung Galaxy A17 5G
                |  real 4G / 5G cellular Internet
                v
        Authenticated ZeroTier private overlay      (DR-003a)
                |
                v
        Remote Mac mini M2, 24 GB RAM               (physically remote)

    That topology is BINDING. TASK.md: "DO NOT use same-LAN measurements as the
    acceptance evidence for this spike." A LAN run is a labelled diagnostic and
    nothing more. Running this stub on a laptop and pointing a phone at it over
    Wi-Fi produces numbers that TASK.md says are rejected outright.

SECURITY - DR-003 and `12` section 5
    No public endpoint, no port forwarding, no public domain, no unauthenticated
    public exposure, no open artifact-directory enumeration.

    The stub therefore binds 127.0.0.1 by default. Binding to any other address
    requires --bind and prints a warning naming the rule, because the overlay is
    the trust boundary and the process must not be reachable outside it.

WHAT IT SERVES - the four candidates from TASK.md

    1  per-slice image encoding, on demand      GET /s1/slice/{z}.png
    2  per-slice packed-binary mask             GET /s2/mask/{z}.bin
    3  whole-volume download, client slices     GET /s3/volume.raw
    4  prefetch window around the active slice  GET /s4/window?z=&radius=
       mesh artifact by decimation level        GET /mesh/{level}.obj

Every response carries the server's own handling time so network time can be
separated from server time, which TASK.md requires:

    X-Server-Handling-Ms: 0.412
    X-Payload-Bytes: 331776
    X-Strategy: s1

Usage:
    python server.py --payloads payloads/out            # 127.0.0.1:8787
    python server.py --payloads <dir> --bind 10.x.x.x   # overlay address only
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE: dict = {"payloads": None, "log": None, "manifest": {}}

_SAFE = re.compile(r"^[0-9]{1,6}$")


def _log(record: dict) -> None:
    record["t"] = time.time()
    line = json.dumps(record, ensure_ascii=False)
    print(line, flush=True)
    path = STATE.get("log")
    if path:
        with open(path, "a", encoding="utf-8", newline="\n") as f:
            f.write(line + "\n")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "SpikeEStub/0"

    # The default logger writes to stderr in a shape nothing can parse. The
    # structured line in _log is the record that matters.
    def log_message(self, fmt, *args):
        pass

    def _send(self, status: int, body: bytes, ctype: str,
              strategy: str, handling_ms: float, extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Server-Handling-Ms", f"{handling_ms:.3f}")
        self.send_header("X-Payload-Bytes", str(len(body)))
        self.send_header("X-Strategy", strategy)
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, str(v))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)
        _log({"event": "response", "path": self.path, "status": status,
              "strategy": strategy, "bytes": len(body),
              "server_handling_ms": round(handling_ms, 3),
              "client": self.client_address[0]})

    def _fail(self, status: int, reason: str, strategy: str, t0: float) -> None:
        body = json.dumps({"error": reason}).encode("utf-8")
        self._send(status, body, "application/json", strategy,
                   (time.perf_counter() - t0) * 1000.0)

    def _read(self, *parts) -> bytes | None:
        """Read a payload file. Path components are validated, never joined raw.

        Enumeration and traversal are both refused: `12` section 5 forbids an
        open artifact directory, and a stub that serves ../../ is the fastest
        way to turn a spike into an incident.
        """
        root = os.path.abspath(STATE["payloads"])
        target = os.path.abspath(os.path.join(root, *parts))
        if not target.startswith(root + os.sep):
            return None
        if not os.path.isfile(target):
            return None
        with open(target, "rb") as f:
            return f.read()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        t0 = time.perf_counter()
        path = self.path.split("?")[0]
        query = {}
        if "?" in self.path:
            for pair in self.path.split("?", 1)[1].split("&"):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    query[k] = v

        # --- health / manifest --------------------------------------------
        if path in ("/", "/health"):
            body = json.dumps({
                "stub": "SPIKE_E transport stub",
                "status": "up",
                "warning": ("LAN measurements are DIAGNOSTIC ONLY. Acceptance evidence "
                            "requires Galaxy A17 -> real cellular -> ZeroTier overlay -> "
                            "remote Mac mini M2 (SPIKE_E_TRANSPORT/TASK.md, DR-003)."),
                "strategies": {
                    "s1": "/s1/slice/{z}.png   per-slice image encoding",
                    "s2": "/s2/mask/{z}.bin    per-slice packed-binary mask",
                    "s3": "/s3/volume.raw      whole-volume download",
                    "s4": "/s4/window?z=&radius=   prefetch window",
                    "mesh": "/mesh/{level}.obj",
                },
                "payload_manifest": STATE["manifest"],
            }, ensure_ascii=False, indent=1).encode("utf-8")
            return self._send(200, body, "application/json", "meta",
                              (time.perf_counter() - t0) * 1000.0)

        # --- strategy 1: per-slice PNG ------------------------------------
        m = re.fullmatch(r"/s1/slice/(\d{1,6})\.png", path)
        if m:
            if not _SAFE.fullmatch(m.group(1)):
                return self._fail(400, "bad slice index", "s1", t0)
            data = self._read("slices_png", f"{int(m.group(1)):04d}.png")
            if data is None:
                return self._fail(404, "slice not found", "s1", t0)
            return self._send(200, data, "image/png", "s1",
                              (time.perf_counter() - t0) * 1000.0)

        # --- strategy 2: per-slice packed mask -----------------------------
        m = re.fullmatch(r"/s2/mask/(\d{1,6})\.bin", path)
        if m:
            data = self._read("slices_maskbits", f"{int(m.group(1)):04d}.bin")
            if data is None:
                return self._fail(404, "mask slice not found", "s2", t0)
            return self._send(200, data, "application/octet-stream", "s2",
                              (time.perf_counter() - t0) * 1000.0)

        # --- strategy 3: whole volume --------------------------------------
        if path == "/s3/volume.raw":
            data = self._read("volume_int16.raw")
            if data is None:
                return self._fail(404, "volume not found", "s3", t0)
            return self._send(200, data, "application/octet-stream", "s3",
                              (time.perf_counter() - t0) * 1000.0)

        # --- strategy 4: prefetch window -----------------------------------
        if path == "/s4/window":
            try:
                z = int(query.get("z", "0"))
                radius = int(query.get("radius", "2"))
            except ValueError:
                return self._fail(400, "z and radius must be integers", "s4", t0)
            if not (0 <= radius <= 32):
                return self._fail(400, "radius out of range 0..32", "s4", t0)

            # Concatenated, length-prefixed, so one round trip carries the
            # window. Which framing wins is part of what the spike compares.
            chunks: list[bytes] = []
            included: list[int] = []
            for zz in range(max(0, z - radius), z + radius + 1):
                data = self._read("slices_png", f"{zz:04d}.png")
                if data is None:
                    continue
                chunks.append(len(data).to_bytes(4, "big") + zz.to_bytes(4, "big") + data)
                included.append(zz)
            if not chunks:
                return self._fail(404, "no slice in window", "s4", t0)
            body = b"".join(chunks)
            return self._send(200, body, "application/octet-stream", "s4",
                              (time.perf_counter() - t0) * 1000.0,
                              extra={"X-Window-Slices": ",".join(map(str, included))})

        # --- mesh artifacts -------------------------------------------------
        m = re.fullmatch(r"/mesh/(\d{1,2})\.obj", path)
        if m:
            data = self._read("meshes", f"level_{int(m.group(1))}.obj")
            if data is None:
                return self._fail(404, "mesh level not found", "mesh", t0)
            return self._send(200, data, "text/plain", "mesh",
                              (time.perf_counter() - t0) * 1000.0)

        return self._fail(404, "no such endpoint; GET / lists them", "none", t0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--payloads", required=True, help="directory produced by payloads/generate.py")
    ap.add_argument("--bind", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--log", help="append structured request records here")
    args = ap.parse_args()

    if not os.path.isdir(args.payloads):
        print(f"payload directory not found: {args.payloads}")
        print("Run payloads/generate.py first.")
        return 2

    STATE["payloads"] = args.payloads
    STATE["log"] = args.log
    manifest_path = os.path.join(args.payloads, "payload_manifest.json")
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            STATE["manifest"] = json.load(f)

    if args.bind not in ("127.0.0.1", "localhost", "::1"):
        print()
        print("  " + "!" * 68)
        print(f"  BINDING TO {args.bind} - NOT loopback.")
        print()
        print("  DR-003 and `12` section 5 forbid: public endpoint, port forwarding,")
        print("  public domain, unauthenticated public exposure.")
        print()
        print("  This is acceptable ONLY if the address belongs to the authenticated")
        print("  ZeroTier overlay interface. If it is a LAN or public address, stop.")
        print("  " + "!" * 68)
        print()

    print()
    print(f"  SPIKE_E stub on http://{args.bind}:{args.port}   payloads: {args.payloads}")
    print("  GET / lists the endpoints and echoes the payload manifest.")
    print()
    print("  LAN RUNS ARE DIAGNOSTIC ONLY. Acceptance evidence requires")
    print("  Galaxy A17 -> real cellular -> ZeroTier overlay -> remote Mac mini M2,")
    print("  operator and owner are recorded by the client harness. Ctrl-C to stop.")
    print()

    httpd = ThreadingHTTPServer((args.bind, args.port), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
