#!/usr/bin/env bash
set -euo pipefail
package_version=$(node -p "require('./src-tauri/tauri.conf.json').version")
package_target="${CARGO_TARGET_DIR:-src-tauri/target}"
package_dmg="$package_target/release/bundle/dmg/MarkWriter_${package_version}_aarch64.dmg"
test -f "$package_dmg"
package_mount=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-dmg.XXXXXX")
package_install=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-install.XXXXXX")
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
# Verify final DMG bytes after ordinary copy installation. A linker-only Mach-O
# signature cannot satisfy this whole-bundle gate. No protection is disabled.
codesign -dvv "$package_install/MarkWriter.app" >package-acceptance-results/signature.txt 2>&1
codesign --verify --deep --strict --verbose=4 "$package_install/MarkWriter.app" >package-acceptance-results/signature-verification.txt 2>&1
grep -q '^Signature=adhoc' package-acceptance-results/signature.txt
grep -q '^Sealed Resources version=2' package-acceptance-results/signature.txt
package_icon=$(plutil -extract CFBundleIconFile raw "$package_install/MarkWriter.app/Contents/Info.plist")
test "$package_icon" = icon.icns
cmp src-tauri/icons/icon.icns "$package_install/MarkWriter.app/Contents/Resources/$package_icon"
package_profile=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-profile.XXXXXX")
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
pathlib.Path('package-acceptance-results/result.json').write_text(json.dumps({'passed':True,'platform':'darwin','arch':platform.machine(),'installed':sys.argv[1],'cases':['DMG mount and ordinary app copy installation','arm64 binary and bundle version inspection','whole-bundle ad-hoc seal and strict codesign verification','installed bundle icon identity and source-byte equality','installed production app launch with outbound IP denied','ordinary frontend startup invoking native document creation'],'qualification':'Full macOS OS-dialog/editor acceptance is separately required on downloaded final bytes before publication. Ad-hoc sealing is not Developer ID signing or notarization.'},indent=2))
PY
