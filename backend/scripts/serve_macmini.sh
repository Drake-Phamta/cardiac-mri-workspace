#!/usr/bin/env bash
# Runs ON the Mac mini (deploy_macmini.ps1 calls it):
#   serve_macmini.sh <port> <bind-host> <data-dir> [skip-install 0|1]
# Creates or reuses the venv from the system Python 3.9 next to the code,
# installs the pinned requirements (offline from ./wheels when the deploy
# shipped them), restarts uvicorn on <bind-host>:<port> in the background with
# a pid file and a log under <data-dir>/var, and checks /health. Exit status 0
# only when /health answered. Derived data lives in <data-dir>, never next to
# the code.
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <port> <bind-host> <data-dir> [skip-install 0|1]" >&2
  exit 2
fi
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="$1"
BIND_HOST="$2"
DATA_DIR="$3"
SKIP_INSTALL="${4:-0}"
PYTHON="${CARDIAC_PYTHON:-/usr/bin/python3}"
cd "$ROOT"
mkdir -p "$DATA_DIR/var"

if [ ! -x .venv/bin/python ]; then
  "$PYTHON" -m venv .venv
fi
if [ "$SKIP_INSTALL" != "1" ]; then
  if [ -d wheels ] && ls wheels/*.whl >/dev/null 2>&1; then
    .venv/bin/python -m pip install --quiet --no-index --find-links wheels -r backend/requirements.txt
  else
    .venv/bin/python -m pip install --quiet -r backend/requirements.txt
  fi
fi

PID_FILE="$DATA_DIR/var/uvicorn.pid"
LOG_FILE="$DATA_DIR/var/uvicorn.log"
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID"
    for _ in $(seq 1 10); do kill -0 "$OLD_PID" 2>/dev/null || break; sleep 1; done
  fi
fi

CARDIAC_BACKEND_DATA="$DATA_DIR" nohup .venv/bin/python -m uvicorn backend.app.main:app \
  --host "$BIND_HOST" --port "$PORT" < /dev/null >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "uvicorn pid $(cat "$PID_FILE") on ${BIND_HOST}:${PORT}, log $LOG_FILE"

CHECK_HOST="$BIND_HOST"
if [ "$CHECK_HOST" = "0.0.0.0" ]; then CHECK_HOST="127.0.0.1"; fi
for _ in $(seq 1 40); do
  if curl -fsS "http://${CHECK_HOST}:${PORT}/health" > "$DATA_DIR/var/health.json" 2>/dev/null; then
    echo "health on the host:"
    cat "$DATA_DIR/var/health.json"
    echo
    exit 0
  fi
  sleep 1
done
echo "health check FAILED; last log lines:"
tail -n 40 "$LOG_FILE"
exit 1
