#!/bin/bash
# Direct macOS WKWebView Worker probe, not packaged-app acceptance.
set -euo pipefail
[[ $# == 2 && "$1" == /* && "$2" == /* && ! -e "$2" ]] || { echo 'Usage: run-worker-macos.sh /absolute/worker.js /absolute/new-results-directory' >&2; exit 2; }
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || { echo 'Requires Apple-silicon macOS' >&2; exit 2; }
here=$(cd "$(dirname "$0")" && pwd -P)
mkdir "$2"
results=$(cd "$2" && pwd -P)
work=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-pi222-worker.XXXXXX")
pid=
cleanup() {
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
cp "$1" "$work/worker.js"
shasum -a 256 "$work/worker.js" "$here/results-worker/plantuml-worker-probe.js" > "$results/hashes.sha256"
{ sw_vers; uname -m; } > "$results/system.txt"
/usr/bin/python3 "$here/worker-server.py" "$work" "$work/port" "$results/requests.txt" &
pid=$!
for ((i=0; i<50; i++)); do [[ -s "$work/port" ]] && break; sleep .1; done
test -s "$work/port"
xcrun swiftc "$here/worker-mac-probe.swift" -o "$work/probe"
"$work/probe" "http://127.0.0.1:$(cat "$work/port")/" "$here/results-worker/plantuml-worker-probe.js" > "$results/result.json"
/usr/bin/python3 - "$results/result.json" <<'PY'
import json, sys
result = json.load(open(sys.argv[1]))
assert 'fatal' not in result, result
assert [case['status'] for case in result['results']] == ['svg', 'svg'] + ['error'] * 6
assert all(case['readableSource'] for case in result['results'][2:])
assert result['controlledTermination']['readableSource'] and result['controlledTermination']['nextPreviewSvg']
PY
while IFS= read -r path; do
  [[ "$path" == / || "$path" == /worker.js ]] || { echo "Unexpected loopback request: $path" >&2; exit 1; }
done < "$results/requests.txt"
echo "Direct WebKit Worker observations: $results"
