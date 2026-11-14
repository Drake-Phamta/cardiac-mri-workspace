#!/usr/bin/env python3
"""Serve the diagnostic viewer and collect same-origin WebView probe payloads.

This is a local measurement helper, not a production service.  Bind it to the
workstation loopback interface, expose it to the physical device only through
``adb reverse``, and provide an output directory outside the repository.

    python spikes/spike_b_3d/harness/serve_viewer.py --out /path/to/session
    adb -s <A17_SERIAL> reverse tcp:8765 tcp:8765
    # WebView URL: http://127.0.0.1:8765/app/?mesh=synthetic&level=0&probe_sink=/probe
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MAX_BODY_BYTES = 2 * 1024 * 1024
ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = ROOT.parents[1]


def is_within(path: Path, parent: Path) -> bool:
    """Return whether a resolved path is inside a resolved parent path."""
    try:
        path.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return True


class ProbeHandler(SimpleHTTPRequestHandler):
    """Static files plus a deliberately tiny same-origin ``POST /probe`` sink."""

    output_dir: Path

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:8765")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):  # noqa: N802 - method name defined by BaseHTTPRequestHandler
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_POST(self):  # noqa: N802 - method name defined by BaseHTTPRequestHandler
        if urlsplit(self.path).path != "/probe":
            self.send_error(HTTPStatus.NOT_FOUND, "only POST /probe is available")
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(HTTPStatus.BAD_REQUEST, "invalid Content-Length")
            return
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "probe body must be 1..2 MiB")
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            self.send_error(HTTPStatus.BAD_REQUEST, f"invalid JSON: {error}")
            return
        if not isinstance(payload, dict) or payload.get("kind") != "spike_b_frame_probe":
            self.send_error(HTTPStatus.BAD_REQUEST, "expected spike_b_frame_probe payload")
            return
        record = {
            "received_at_utc": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
            "remote_address": self.client_address[0],
            "payload": payload,
        }
        target = self.output_dir / "webview_probe_payloads.jsonl"
        with target.open("a", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        self.send_response(HTTPStatus.CREATED)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"accepted":true}\n')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=Path,
                        help="directory outside the repository for raw POST payloads")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "::1", "localhost"}:
        parser.error("bind only to loopback; the device reaches it through adb reverse")
    args.out = args.out.resolve()
    if is_within(args.out, REPOSITORY_ROOT):
        parser.error("--out must be outside the repository; probe records are raw evidence")
    args.out.mkdir(parents=True, exist_ok=True)
    ProbeHandler.output_dir = args.out
    server = ThreadingHTTPServer((args.host, args.port), ProbeHandler)
    print(f"viewer root: {ROOT}")
    print(f"probe output: {args.out / 'webview_probe_payloads.jsonl'}")
    print(f"serving: http://{args.host}:{args.port}/app/?mesh=synthetic&level=0&probe_sink=/probe")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
