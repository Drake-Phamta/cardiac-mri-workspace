#!/usr/bin/env bash
# Runs ON the Mac mini, inside ~/cardiac-backend (deploy_macmini.ps1 calls it).
# Creates or reuses the venv from the system Python 3.9, installs the pinned
# requirements (offline from ./wheels when the deploy shipped them), restarts
# uvicorn on 0.0.0.0:PORT in the background with a pid file and a log, and
# checks /health locally. Exit status 0 only when /health answered.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${1:-8000}"
SKIP_INSTALL="${2:-0}"
PYTHON="${CARDIAC_PYTHON:-/usr/bin/python3}"
cd "$ROOT"
mkdir -p backend/var

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

if [ -f backend/var/uvicorn.pid ]; then
  OLD_PID="$(cat backend/var/uvicorn.pid)"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID"
    for _ in $(seq 1 10); do kill -0 "$OLD_PID" 2>/dev/null || break; sleep 1; done
  fi
fi

nohup .venv/bin/python -m uvicorn backend.app.main:app --host 0.0.0.0 --port "$PORT" \
  < /dev/null >> backend/var/uvicorn.log 2>&1 &
echo $! > backend/var/uvicorn.pid
echo "uvicorn pid $(cat backend/var/uvicorn.pid), log $ROOT/backend/var/uvicorn.log"

for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" > backend/var/health.json 2>/dev/null; then
    echo "health on the Mac mini:"
    cat backend/var/health.json
    echo
    exit 0
  fi
  sleep 1
done
echo "health check FAILED; last log lines:"
tail -n 40 backend/var/uvicorn.log
exit 1
