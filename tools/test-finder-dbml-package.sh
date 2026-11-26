#!/usr/bin/env bash
# Finder observations for the exact ad-hoc sealed package extracted by install-package-macos.sh.
# This records evidence; a successful invocation alone is not Finder acceptance.
set -euo pipefail
app=$1
package=$2
results=$3
extension="$app/Contents/PlugIns/MarkWriterQuickLook.appex"
executable="$extension/Contents/MacOS/QuickLookPrototype"
script="$extension/Contents/Resources/quicklook-render.js"
mkdir -p "$results"
results=$(cd "$results" && pwd -P)
work=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-finder-dbml.XXXXXX")
trap 'if [[ -n "${log_pid:-}" ]]; then kill "$log_pid" 2>/dev/null || true; fi' EXIT
cp native/quicklook/tests/fixtures/dbml/{representative,multiple,fallback}.md "$work/"
{
  printf '# Oversized Finder DBML\n\n```dbml\nTable t {\n id int [pk]\n}\n'
  for ((i=0;i<900;i++)); do printf '// padding %04d\n' "$i"; done
  printf '// FINAL-SENTINEL\n```\n'
} > "$work/oversized.md"
/usr/bin/sw_vers > "$results/system.txt"
/usr/bin/uname -m >> "$results/system.txt"
/usr/bin/shasum -a 256 "$package" "$executable" "$script" > "$results/package-hashes.txt"
/usr/bin/wc -c "$script" > "$results/script-size.txt"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$app" > "$results/host-seal.txt" 2>&1
/usr/bin/codesign --verify --deep --strict --verbose=2 "$extension" > "$results/extension-seal.txt" 2>&1
/usr/bin/shasum -a 256 "$work"/*.md > "$results/fixtures-before.txt"
/usr/bin/xcrun swiftc tools/finder-capture-text.swift -o "$work/ocr"
/usr/bin/pluginkit -m -ADvv -i com.markwriter.app.quicklook > "$results/registration.txt" 2>&1 || true
for name in representative multiple fallback oversized; do
  fixture="$work/$name.md"
  /usr/bin/log stream --level info --style ndjson --predicate 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"' > "$results/$name-renderer.ndjson" 2> "$results/$name-renderer-error.txt" &
  log_pid=$!
  sleep 1
  date -u '+%Y-%m-%dT%H:%M:%SZ' > "$results/$name-start.txt"
  /usr/bin/osascript - "$fixture" <<'APPLESCRIPT'
on run argv
  tell application "Finder"
    activate
    reveal POSIX file (item 1 of argv)
  end tell
end run
APPLESCRIPT
  /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder"' -e 'set frontmost to true' -e 'key code 49' -e 'end tell'
  # The native renderer has an eight-second deadline. Capture after it, allowing
  # time for the final Finder view to update; elapsed here is not render time.
  sleep 10
  date -u '+%Y-%m-%dT%H:%M:%SZ' > "$results/$name-capture.txt"
  /bin/ps -axo pid=,command= > "$results/$name-processes.txt"
  /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder" to get name of every window' > "$results/$name-windows.txt"
  /usr/sbin/screencapture -x "$results/$name.png"
  "$work/ocr" "$results/$name.png" > "$results/$name-ocr.txt"
  /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder" to key code 49'
  kill "$log_pid" 2>/dev/null || true
  wait "$log_pid" 2>/dev/null || true
  log_pid=
done
/usr/bin/shasum -a 256 "$work"/*.md > "$results/fixtures-after.txt"
cmp "$results/fixtures-before.txt" "$results/fixtures-after.txt"
cat > "$results/README.txt" <<'TEXT'
Raw Finder observations on a disposable hosted runner, not a pass receipt.
Review screenshots, OCR and renderer log process paths against the extracted app.
Screenshots after 10 seconds do not establish render latency or visual completeness.
No controlled network-off, document access attempt, timeout or cold-process test
is performed here. Those acceptance conditions require separate evidence.
TEXT
