#!/system/bin/sh
# Spike E Android fallback harness.
#
# The Galaxy A17 has no Python, Termux, curl, or wget. Android's built-in
# Toybox netcat is enough to issue the stub requests and write JSONL that can
# later be pulled with adb. This is a fallback client, not production code.
#
# The caller must explicitly provide --path and --connection. A LAN run is
# labelled diagnostic-only and cannot be mixed with cellular acceptance logs.

BASE_URL=""
MEASUREMENT_PATH=""
CONNECTION=""
OPERATOR=""
OWNER=""
SLICES=88
WINDOW_RADIUS=2
REPEATS=3
TIMEOUT=60
OUT_FILE=""

# Local connect rejections - added 2026-09-13 after run 1 (see PROVENANCE.md of
# EVIDENCE_RAW/20260913_run1). On this handset the kernel caches the output
# route PER CPU, and the VPN's 10.64.193.0/24 and 224.0.0.0/4 routes share one
# cache slot (identical attributes). A multicast send on a CPU leaves a
# multicast-flagged route there, and every TCP connect to the Mac mini from that
# CPU then fails instantly with "Network is unreachable" - before any SYN is
# sent (Tcp ActiveOpens does not move). Proven by pinning: 2 of 8 CPUs failed
# 5/5, the other 6 succeeded 5/5.
#
# Such a rejection never touches the network, so it is retried at once on
# another CPU. It is NOT hidden: every sample records how many local
# rejections preceded it, and ms_total times the attempt that actually
# reached the network. The rejection rate is itself a demo risk for the owner.
LOCAL_RETRY_MAX=8
NCPU=$(grep -c '^processor' /proc/cpuinfo 2>/dev/null)
[ -z "$NCPU" ] || [ "$NCPU" -lt 1 ] && NCPU=1

usage() {
  cat >&2 <<'EOF'
Usage:
  sh android_toybox_harness.sh \
    --base http://10.x.x.x:8787 \
    --path cellular-overlay|lan-diagnostic \
    --connection direct|relayed \
    --operator "Person who presses the phone" \
    --owner "Nguyen Gia Duc Trung" \
    [--slices 88] [--window-radius 2] [--repeats 3] \
    [--timeout 60] [--out /data/local/tmp/e_transport_android.jsonl]

Pull the output afterwards, for example:
  adb pull /data/local/tmp/e_transport_android.jsonl .
EOF
}

json_escape() {
  # Names/notes in this packet are plain text. Escape the JSON metacharacters
  # without depending on Python or another package on the handset.
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

now_ms() {
  date +%s%3N
}

emit() {
  printf '%s\n' "$1" >> "$OUT_FILE"
}

request() {
  req_scenario="$1"
  req_criterion="$2"
  req_path="$3"
  req_repeat="$4"
  req_first_start=$(now_ms)
  req_rejections=0
  req_cpu_json=null

  while :; do
    req_start=$(now_ms)
    req_pin=""
    if [ "$req_rejections" -gt 0 ]; then
      # Leave the CPU whose cached route rejected us: rotate through the CPUs.
      req_cpu=$(( (req_rejections - 1) % NCPU ))
      req_pin="taskset $(printf '%x' $((1 << req_cpu)))"
      req_cpu_json=$req_cpu
    fi
    # HTTP/1.0 plus Connection: close makes the response boundary unambiguous
    # for Toybox nc, including the 58 MB whole-volume response.
    printf 'GET %s HTTP/1.0\r\nHost: %s\r\nAccept: */*\r\nConnection: close\r\n\r\n' \
      "$req_path" "$HOST" |
      $req_pin toybox nc -n -w "$TIMEOUT" "$HOST" "$PORT" > "$TMP_FILE" 2> "$ERR_FILE"
    req_nc_rc=$?
    req_end=$(now_ms)
    if [ "$req_nc_rc" -ne 0 ] && [ ! -s "$TMP_FILE" ] &&
       grep -q 'Network is unreachable' "$ERR_FILE" 2>/dev/null &&
       [ "$req_rejections" -lt "$LOCAL_RETRY_MAX" ]; then
      req_rejections=$((req_rejections + 1))
      continue
    fi
    break
  done
  req_ms=$((req_end - req_start))
  req_ms_with_rejections=$((req_end - req_first_start))
  req_nc_err=$(head -n 1 "$ERR_FILE" 2>/dev/null)

  req_status_line=$(head -n 1 "$TMP_FILE" 2>/dev/null | tr -d '\r')
  req_status=$(printf '%s' "$req_status_line" |
    sed -n 's#^HTTP/[0-9.]* \([0-9][0-9][0-9]\).*#\1#p')
  req_payload=$(grep -ai '^Content-Length:' "$TMP_FILE" 2>/dev/null |
    head -n 1 | tr -d '\r' | cut -d' ' -f2)
  req_server=$(grep -ai '^X-Server-Handling-Ms:' "$TMP_FILE" 2>/dev/null |
    head -n 1 | tr -d '\r' | cut -d' ' -f2)
  req_strategy=$(grep -ai '^X-Strategy:' "$TMP_FILE" 2>/dev/null |
    head -n 1 | tr -d '\r' | cut -d' ' -f2)

  case "$req_status" in
    200) req_ok=true; req_error_json=null ;;
    *)
      req_ok=false
      if [ -n "$req_status" ]; then
        req_error="HTTP $req_status (nc_rc=$req_nc_rc)"
      else
        req_error="no HTTP status (nc_rc=$req_nc_rc${req_nc_err:+; $req_nc_err})"
      fi
      req_error_json="\"$(json_escape "$req_error")\""
      ;;
  esac

  case "$req_status" in ''|*[!0-9]*) req_status_json=null ;; *) req_status_json=$req_status ;; esac
  case "$req_payload" in ''|*[!0-9]*) req_payload_json=null ;; *) req_payload_json=$req_payload ;; esac
  case "$req_server" in ''|*[!0-9.]*) req_server_json=null ;; *) req_server_json=$req_server ;; esac
  if [ -n "$req_strategy" ]; then
    req_strategy_json="\"$(json_escape "$req_strategy")\""
  else
    req_strategy_json=null
  fi

  req_url="$BASE_URL$req_path"
  req_url_json="$(json_escape "$req_url")"
  emit "{\"record_type\":\"sample\",\"captured_at_ms\":$req_end,\"repeat\":$req_repeat,\"scenario\":\"$(json_escape "$req_scenario")\",\"criterion\":\"$req_criterion\",\"url\":\"$req_url_json\",\"ok\":$req_ok,\"status\":$req_status_json,\"bytes\":$req_payload_json,\"ms_total\":$req_ms,\"local_connect_rejections\":$req_rejections,\"ms_including_local_rejections\":$req_ms_with_rejections,\"pinned_cpu\":$req_cpu_json,\"ms_to_first_byte\":null,\"server_handling_ms\":$req_server_json,\"strategy\":$req_strategy_json,\"measurement_path\":\"$(json_escape "$MEASUREMENT_PATH")\",\"overlay_connection\":\"$(json_escape "$CONNECTION")\",\"operator\":\"$(json_escape "$OPERATOR")\",\"owner\":\"$(json_escape "$OWNER")\",\"error\":$req_error_json,\"timing_note\":\"Toybox shell fallback records total time; first-byte timing is not available.\"}"
  rm -f "$TMP_FILE" "$ERR_FILE"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base) BASE_URL="$2"; shift 2 ;;
    --path) MEASUREMENT_PATH="$2"; shift 2 ;;
    --connection) CONNECTION="$2"; shift 2 ;;
    --operator) OPERATOR="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --slices) SLICES="$2"; shift 2 ;;
    --window-radius) WINDOW_RADIUS="$2"; shift 2 ;;
    --repeats) REPEATS="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --out) OUT_FILE="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [ -z "$BASE_URL" ] || [ -z "$MEASUREMENT_PATH" ] || [ -z "$CONNECTION" ] ||
   [ -z "$OPERATOR" ] || [ -z "$OWNER" ]; then
  echo "--base, --path, --connection, --operator, and --owner are required" >&2
  usage
  exit 2
fi
if [ "$MEASUREMENT_PATH" != "cellular-overlay" ] && [ "$MEASUREMENT_PATH" != "lan-diagnostic" ]; then
  echo "--path must be cellular-overlay or lan-diagnostic" >&2; exit 2
fi
if [ "$CONNECTION" != "direct" ] && [ "$CONNECTION" != "relayed" ]; then
  echo "--connection must be direct or relayed" >&2; exit 2
fi

# Toybox nc is plain TCP, so this fallback intentionally accepts only http://.
case "$BASE_URL" in
  http://*) AUTHORITY=${BASE_URL#http://} ;;
  *) echo "--base must start with http://" >&2; exit 2 ;;
esac
HOST=${AUTHORITY%%:*}
PORT=${AUTHORITY##*:}
if [ -z "$HOST" ] || [ -z "$PORT" ]; then
  echo "--base must include host and port, for example http://10.0.0.1:8787" >&2
  exit 2
fi

if [ -z "$OUT_FILE" ]; then
  OUT_FILE="/data/local/tmp/e_transport_android_$(date +%s).jsonl"
fi
mkdir -p "$(dirname "$OUT_FILE")" || exit 1
rm -f "$OUT_FILE"
TMP_FILE="/data/local/tmp/spike_e_http_$$"
ERR_FILE="/data/local/tmp/spike_e_err_$$"

captured_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
operator_json=$(json_escape "$OPERATOR")
owner_json=$(json_escape "$OWNER")
base_json=$(json_escape "$BASE_URL")
if [ "$MEASUREMENT_PATH" = "cellular-overlay" ]; then
  acceptance_json=true
  warning_json=null
else
  acceptance_json=false
  warning_json="\"DIAGNOSTIC ONLY: LAN/AVD measurements are not Spike E acceptance evidence.\""
fi
emit "{\"record_type\":\"run_header\",\"captured_at\":\"$captured_at\",\"operator\":\"$operator_json\",\"owner\":\"$owner_json\",\"base\":\"$base_json\",\"measurement_path\":\"$MEASUREMENT_PATH\",\"overlay_connection\":\"$CONNECTION\",\"repeats\":$REPEATS,\"is_acceptance_evidence\":$acceptance_json,\"warning\":$warning_json,\"client\":\"android-toybox-nc\",\"local_retry_policy\":\"on an instant local Network is unreachable (no SYN sent) retry up to $LOCAL_RETRY_MAX times on rotating CPUs; counted per sample in local_connect_rejections\",\"cpu_count\":$NCPU,\"note\":\"ms_to_first_byte is null in this fallback; total time and server handling are recorded.\"}"

MID=$((SLICES / 2))
STEP=$((SLICES / 12))
[ "$STEP" -lt 1 ] && STEP=1
WINDOW_STEP=$((WINDOW_RADIUS * 2 + 1))

echo "Android Toybox fallback: $BASE_URL" >&2
echo "path=$MEASUREMENT_PATH connection=$CONNECTION repeats=$REPEATS" >&2
echo "writing JSONL to $OUT_FILE" >&2

rep=0
while [ "$rep" -lt "$REPEATS" ]; do
  # E2 — cold-open candidates.
  request cold_open_s1 E2 "/s1/slice/$MID.png" "$rep"
  request cold_open_s3 E2 "/s3/volume.raw" "$rep"
  request cold_open_s4 E2 "/s4/window?z=$MID&radius=$WINDOW_RADIUS" "$rep"

  # E3 — uncached slices spread through the volume.
  z=0
  while [ "$z" -lt "$SLICES" ]; do
    request uncached_slice_s1 E3 "/s1/slice/$z.png" "$rep"
    z=$((z + STEP))
  done

  # E4 — continuous navigation and window prefetch.
  i=0; z=$MID
  while [ "$i" -lt 20 ] && [ "$z" -lt "$SLICES" ]; do
    request navigate_s1 E4 "/s1/slice/$z.png" "$rep"
    i=$((i + 1)); z=$((z + 1))
  done
  z=$MID
  while [ "$z" -lt "$SLICES" ] && [ "$z" -lt $((MID + 20)) ]; do
    request navigate_s4 E4 "/s4/window?z=$z&radius=$WINDOW_RADIUS" "$rep"
    z=$((z + WINDOW_STEP))
  done

  # E5 — masks.
  z=0
  while [ "$z" -lt "$SLICES" ]; do
    request mask_s2 E5 "/s2/mask/$z.bin" "$rep"
    z=$((z + STEP))
  done

  # E6 — all four mesh levels.
  level=0
  while [ "$level" -lt 4 ]; do
    request "mesh_level_$level" E6 "/mesh/$level.obj" "$rep"
    level=$((level + 1))
  done

  echo "repeat $((rep + 1))/$REPEATS complete" >&2
  rep=$((rep + 1))
done

echo "JSONL ready: $OUT_FILE" >&2
echo "Pull it with: adb pull $OUT_FILE ." >&2
exit 0
