#!/bin/bash
# Direct WKWebView research probe, never registers or launches a Finder provider.
set -euo pipefail
[[ $# == 2 && "$1" == /* && "$2" == /* && ! -e "$2" ]] || { echo 'Usage: run-direct-macos.sh /absolute/candidate.dmg /absolute/new-results-directory' >&2; exit 2; }
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || { echo 'Requires Apple-silicon macOS' >&2; exit 2; }
here=$(cd "$(dirname "$0")" && pwd -P)
root=$(cd "$here/../.." && pwd -P)
package=$1
mkdir "$2"
results=$(cd "$2" && pwd -P)
work=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-pi222-direct.XXXXXX")
pid=
mounted=false
cleanup() {
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  if [[ "$mounted" == true ]] && ! hdiutil detach -quiet "$work/mount"; then
    echo "Could not detach read-only research image; retained $work" >&2
    return 1
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT
mkdir "$work/mount"
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$work/mount" "$package"
mounted=true
app="$work/mount/MarkWriter.app"
ext="$app/Contents/PlugIns/MarkWriterQuickLook.appex"
script="$ext/Contents/Resources/quicklook-render.js"
codesign --verify --deep --strict --verbose=2 "$app" > "$results/host-verify.txt" 2>&1
codesign --verify --strict --verbose=2 "$ext" > "$results/extension-verify.txt" 2>&1
codesign -dvv "$app" > "$results/host-signature.txt" 2>&1
codesign -dvv "$ext" > "$results/extension-signature.txt" 2>&1
shasum -a 256 "$package" "$ext/Contents/MacOS/QuickLookPrototype" "$script" > "$results/hashes.sha256"
{ sw_vers; uname -m; } > "$results/system.txt"
printf SYNTHETIC-PLANTUML-SECRET > "$work/synthetic-secret.puml"
shasum -a 256 "$work/synthetic-secret.puml" > "$results/canary-before.sha256"
/usr/bin/python3 "$here/canary-server.py" "$work/port" "$results/requests.txt" &
pid=$!
for ((i=0; i<50; i++)); do [[ -s "$work/port" ]] && break; sleep .1; done
test -s "$work/port"
server="http://127.0.0.1:$(cat "$work/port")"
test "$(curl -fsS "$server/control")" = SYNTHETIC-PLANTUML-SECRET
xcrun swiftc "$root/native/quicklook/QuickLookWebRenderer.swift" "$here/direct-finder-plantuml.swift" -o "$work/probe"
"$work/probe" "$script" "$server" "$work/synthetic-secret.puml" > "$results/direct-probe.json"
shasum -a 256 "$work/synthetic-secret.puml" > "$results/canary-after.sha256"
cmp "$results/canary-before.sha256" "$results/canary-after.sha256"
test "$(cat "$results/requests.txt")" = /control
/usr/bin/python3 - "$results/direct-probe.json" <<'PY'
import json, sys
rows = json.load(open(sys.argv[1]))['cases']
assert len(rows) == 11 and all(row['matched'] for row in rows), rows
PY
echo "Direct WKWebView observations: $results"
