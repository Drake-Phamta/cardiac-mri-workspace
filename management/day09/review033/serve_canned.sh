#!/system/bin/sh
# Canned HTTP/1.1 responder for the PR #33 review: one fixed 200 for any request,
# so the Toybox harness can be exercised entirely on the handset, with no tunnel.
body='spike-e-review-body'
len=${#body}
printf 'HTTP/1.1 200 OK\r\nContent-Length: %s\r\nContent-Type: application/octet-stream\r\nX-Strategy: review\r\nX-Server-Handling-Ms: 1\r\nConnection: close\r\n\r\n%s' "$len" "$body"
