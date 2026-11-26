#!/usr/bin/env bash
# Direct synthetic WebKit checks; no Finder or packaged extension is involved.
set -euo pipefail
results=$1
mkdir -p "$results"
work=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-quicklook-probe.XXXXXX")
server_pid=
log_pid=
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  if [[ -n "$log_pid" ]]; then kill "$log_pid" 2>/dev/null || true; wait "$log_pid" 2>/dev/null || true; fi
  if [[ -f "$work/requests" ]]; then cp "$work/requests" "$results/quicklook-direct-requests.txt"; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
node tools/quicklook-probe-server.mjs "$work/port" "$work/requests" &
server_pid=$!
for ((i=0;i<100;i++)); do [[ -s "$work/port" ]] && break; sleep 0.1; done
test -s "$work/port"
url="http://127.0.0.1:$(cat "$work/port")"
curl -fsS --max-time 5 "$url/control" > "$work/control"
test "$(cat "$work/control")" = SYNTHETIC-NETWORK-SENTINEL
printf 'SYNTHETIC-LOCAL-FILE-SECRET' > "$work/secret.txt"
xcrun swiftc native/quicklook/QuickLookWebRenderer.swift tools/quicklook-deadline-probe.swift -o "$work/probe"
/usr/bin/log stream --level info --style ndjson --predicate 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"' > "$results/quicklook-direct-renderer.ndjson" 2> "$results/quicklook-direct-renderer-error.txt" &
log_pid=$!
sleep 1
"$work/probe" "$url" "$work/secret.txt" | tee "$results/quicklook-direct.json"
cp "$work/requests" "$results/quicklook-direct-requests.txt"
# The positive control must be the only HTTP request received.
test "$(cat "$work/requests")" = /control
sleep 1
kill "$log_pid" 2>/dev/null || true
wait "$log_pid" 2>/dev/null || true
log_pid=
node tools/verify-quicklook-direct-logs.mjs "$results/quicklook-direct-renderer.ndjson" "$work/probe" > "$results/quicklook-direct-summary.json"
