#!/system/bin/sh
# PR #33 review helper: start or stop the canned responder on the handset itself.
# "Link loss" in this test is the responder going away, which is what the harness
# sees as a TCP failure with no HTTP response - the case its new retry covers.
PORT=8799
case "$1" in
  start)
    toybox nc -s 127.0.0.1 -L -p "$PORT" /system/bin/sh /data/local/tmp/serve_canned.sh >/dev/null 2>&1 &
    echo "started $!"
    ;;
  stop)
    for p in $(toybox ps -A -o PID,ARGS | grep "\-p $PORT" | grep -v grep | while read pid rest; do echo "$pid"; done); do
      kill "$p" 2>/dev/null && echo "killed $p"
    done
    ;;
  status)
    toybox ps -A -o PID,ARGS | grep "\-p $PORT" | grep -v grep | head -3
    ;;
esac
