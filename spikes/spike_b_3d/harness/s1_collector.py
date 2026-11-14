#!/usr/bin/env python3
"""Workstation collector for the S-1 device session (HTTP evidence path).

THROWAWAY SPIKE CODE. Adapted from harness/serve_viewer.py (PR #44): loopback only,
reached from the phone only through `adb reverse tcp:8766 tcp:8766`, output directory
outside the repository. The S-1 app POSTs every record it logs, verbatim, to /s1; this
appends each one to s1_collector.jsonl with the receive time. It computes nothing.

    python spikes/spike_b_3d/harness/s1_collector.py --out <dir outside the repo>
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MAX_BODY_BYTES = 4 * 1024 * 1024
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_lock = threading.Lock()


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return True


class Handler(BaseHTTPRequestHandler):
    target: Path
    counts = {"records": 0, "rejected": 0}

    def log_message(self, fmt, *args):  # quiet: one line per 100 records instead
        pass

    def _reply(self, status, body: dict):
        data = (json.dumps(body) + "\n").encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # noqa: N802
        if urlsplit(self.path).path == "/health":
            self._reply(HTTPStatus.OK, {"ok": True, **self.counts, "file": str(self.target)})
        else:
            self._reply(HTTPStatus.NOT_FOUND, {"error": "GET /health only"})

    def do_POST(self):  # noqa: N802
        if urlsplit(self.path).path != "/s1":
            self._reply(HTTPStatus.NOT_FOUND, {"error": "POST /s1 only"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length <= 0 or length > MAX_BODY_BYTES:
            self.counts["rejected"] += 1
            self._reply(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "body must be 1 byte .. 4 MiB"})
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            self.counts["rejected"] += 1
            self._reply(HTTPStatus.BAD_REQUEST, {"error": f"invalid JSON: {error}"})
            return
        record = {
            "received_at_utc": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
            "remote_address": self.client_address[0],
            "payload": payload,
        }
        line = json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"
        with _lock:
            with self.target.open("a", encoding="utf-8", newline="\n") as stream:
                stream.write(line)
                stream.flush()
                os.fsync(stream.fileno())
            self.counts["records"] += 1
            n = self.counts["records"]
        if n % 100 == 0:
            print(f"  {n} records", flush=True)
        self._reply(HTTPStatus.CREATED, {"accepted": True})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, type=Path, help="session directory OUTSIDE the repository")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", default=8766, type=int)
    args = ap.parse_args()
    if args.host not in {"127.0.0.1", "::1", "localhost"}:
        ap.error("bind only to loopback; the phone reaches it through adb reverse")
    out = args.out.resolve()
    if is_within(out, REPOSITORY_ROOT):
        ap.error("--out must be outside the repository: these are raw session records")
    out.mkdir(parents=True, exist_ok=True)
    Handler.target = out / "s1_collector.jsonl"
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"collecting POST /s1 into {Handler.target}")
    print(f"health: http://{args.host}:{args.port}/health   (Ctrl-C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\nstopped after {Handler.counts['records']} records ({Handler.counts['rejected']} rejected)")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
