#!/bin/bash
set -euo pipefail
umask 077
base=/private/tmp/mw-night.XdKkgJ
app=/Applications/MarkWriter.app
fixture="$base/cases/app/app-a831f905.md"
expected='cdhash H"7d3136a172f626f683434b1fa5c7d61cdd5ad7b8"'
[[ "$(id -un)" == "$(stat -f %Su /dev/console)" ]]
if pgrep -x markwriter >/dev/null; then
  echo 'MarkWriter already running. End any previous test or verify its isolated profile before continuing.' >&2
  exit 2
fi
codesign --verify --deep --strict -R="$expected" "$app"
echo "1d697256fa73c3d9ceff8d11091d8f9fdd077cbff19ddf4b73c302b0579c97c6  $fixture" | shasum -a 256 -c -
dir=$(mktemp -d "$base/attended28/app.XXXXXX")
mkdir "$dir/profile"
nohup env MARKWRITER_PROFILE_DIR="$dir/profile" /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound (remote ip))' "$app/Contents/MacOS/markwriter" >"$dir/launch.log" 2>&1 </dev/null &
pid=$!
printf '%s\n' "$pid" > "$dir/pid"
printf 'TEST_DIR=%s\nPID=%s\nSAVE_HTML_TO=%s/export.html\n' "$dir" "$pid" "$dir"
for ((i=0;i<300;i++)); do
  kill -0 "$pid" || { cat "$dir/launch.log"; exit 3; }
  if grep -Fq '[TAURI] Creating new document' "$dir/launch.log"; then break; fi
  sleep 0.1
done
grep -Fq '[TAURI] Creating new document' "$dir/launch.log"
[[ "$(ps -p "$pid" -o comm=)" == "$app/Contents/MacOS/markwriter" ]]
codesign --verify -R="$expected" "$pid"
open -a "$app" "$fixture"
echo "OPEN_EVENT_SENT; use the VNC window to observe both app views and save to the printed path."
