#!/system/bin/sh
# Canned 404 for the PR #33 review: an HTTP error must NOT be retried.
body='not-found'
len=${#body}
printf 'HTTP/1.1 404 Not Found\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' "$len" "$body"
