#!/usr/bin/env bash
set -euo pipefail
package_dmg=$(find src-tauri/target/release/bundle/dmg -name '*.dmg' -maxdepth 1 | head -1)
package_mount=$(mktemp -d /tmp/markwriter-dmg.XXXXXX)
package_install=$(mktemp -d /tmp/markwriter-install.XXXXXX)
mkdir -p package-acceptance-results
hdiutil attach "$package_dmg" -nobrowse -readonly -mountpoint "$package_mount"
trap 'hdiutil detach "$package_mount" >/dev/null 2>&1 || true' EXIT
ditto "$package_mount/MarkWriter.app" "$package_install/MarkWriter.app"
hdiutil detach "$package_mount"
trap - EXIT
package_binary="$package_install/MarkWriter.app/Contents/MacOS/markwriter"
test -x "$package_binary"
file "$package_binary" | tee package-acceptance-results/binary.txt
lipo -archs "$package_binary" | grep -qx arm64
plutil -extract CFBundleShortVersionString raw "$package_install/MarkWriter.app/Contents/Info.plist" | tee package-acceptance-results/version.txt
codesign -dvv "$package_install/MarkWriter.app" >package-acceptance-results/signature.txt 2>&1 || true
package_profile=$(mktemp -d /tmp/markwriter-profile.XXXXXX)
# New restriction for this test process: no outbound IP, including renderers.
# Preserve local Unix/XPC desktop IPC needed by LaunchServices and WebKit.
MARKWRITER_PROFILE_DIR="$package_profile" sandbox-exec -p '(version 1)(allow default)(deny network-outbound (remote ip))' "$package_binary" >package-acceptance-results/launch.log 2>&1 &
package_pid=$!
trap 'kill "$package_pid" >/dev/null 2>&1 || true' EXIT
package_started=false
for package_start_attempt in {1..300}; do
  if ! kill -0 "$package_pid" 2>/dev/null; then break; fi
  if grep -q "\[TAURI\] Creating new document" package-acceptance-results/launch.log; then package_started=true; break; fi
  sleep 0.1
done
if [[ "$package_started" != true ]]; then cat package-acceptance-results/launch.log; exit 1; fi
python3 - "$package_install" "$package_profile" <<'PY'
import json,sys,pathlib,platform
assert '[TAURI] Creating new document' in pathlib.Path('package-acceptance-results/launch.log').read_text(), 'Ordinary frontend must invoke native document creation'
pathlib.Path('package-acceptance-results/result.json').write_text(json.dumps({'passed':True,'platform':'darwin','arch':platform.machine(),'installed':sys.argv[1],'cases':['DMG mount and ordinary app copy installation','arm64 binary and bundle version inspection','installed production app launch with outbound IP denied','ordinary frontend startup invoking native document creation'],'qualification':'Full macOS OS-dialog/editor acceptance is separately required on downloaded final bytes before publication.'},indent=2))
PY
