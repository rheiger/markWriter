#!/bin/bash
# macOS direct WKWebView resource check; separate from interactive Finder.
set -euo pipefail
if [[ $# -ne 5 ]]; then
  echo "Usage: run-direct.sh ABS_DMG SHA256 ABS_FIXTURE_DIRECTORY ABS_SWIFT_RENDERER_SOURCE ABS_NEW_OUTPUT" >&2
  exit 2
fi
package=$1
expected=$2
cases=$3
renderer_source=$4
results=$5
here=$(cd "$(dirname "$0")" && pwd -P)
[[ $(uname -m) == arm64 && $(uname -s) == Darwin ]]
[[ $package == /* && $cases == /* && $renderer_source == /* && $results == /* ]]
[[ -d $cases && -f $package && -f $renderer_source && ! -e $results ]]
mkdir -m 700 "$results"
hash=$(shasum -a 256 "$package" | awk '{print $1}')
[[ $hash == "$expected" ]] || { echo "DMG checksum mismatch" >&2; exit 1; }
work=$(mktemp -d "${TMPDIR:-/tmp}/mw-finder-direct.XXXXXX")
mounted=false
cleanup() {
  if [[ $mounted == true ]]; then hdiutil detach -quiet "$work/mount" || return 1; fi
  rm -r -- "$work"
}
trap cleanup EXIT
mkdir "$work/mount"
hdiutil attach -quiet -readonly -noautoopen -nobrowse -mountpoint "$work/mount" "$package"
mounted=true
app="$work/mount/MarkWriter.app"
ext="$app/Contents/PlugIns/MarkWriterQuickLook.appex"
script="$ext/Contents/Resources/quicklook-render.js"
codesign --verify --strict --deep --verbose=2 "$app" > "$results/host-seal.txt" 2>&1
codesign --verify --strict --verbose=2 "$ext" > "$results/extension-seal.txt" 2>&1
codesign -d --verbose=4 "$app" > "$results/host-identity.txt" 2>&1
codesign -d --verbose=4 "$ext" > "$results/extension-identity.txt" 2>&1
xcrun dwarfdump --uuid "$ext/Contents/MacOS/QuickLookPrototype" > "$results/extension-uuid.txt"
shasum -a 256 "$package" "$app/Contents/MacOS/markwriter" "$ext/Contents/MacOS/QuickLookPrototype" "$script" "$renderer_source" > "$results/hashes.txt"
(sw_vers; uname -m) > "$results/host.txt"
(cd "$cases" && shasum -a 256 -c SHA256SUMS) > "$results/fixtures-before.txt"
xcrun swiftc "$renderer_source" "$here/render-fixture.swift" -o "$work/render-fixture"
for name in app closed open legacy negative oversized recovery; do
  files=("$cases/$name/"*.md)
  [[ ${#files[@]} -eq 1 && -f ${files[0]} ]]
  "$work/render-fixture" "$script" "${files[0]}" "$work/$name.html" > "$results/$name-timing.txt"
  /usr/bin/python3 "$here/check-output.py" "$name" "${files[0]}" "$work/$name.html" > "$results/$name.json"
done
(cd "$cases" && shasum -a 256 -c SHA256SUMS) > "$results/fixtures-after.txt"
cmp "$results/fixtures-before.txt" "$results/fixtures-after.txt"
