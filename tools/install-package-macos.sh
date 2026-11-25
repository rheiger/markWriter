#!/usr/bin/env bash
set -euo pipefail

package_version=$(node -p "require('./src-tauri/tauri.conf.json').version")
package_target="${CARGO_TARGET_DIR:-src-tauri/target}"
package_bundle="$package_target/release/bundle/dmg"
candidate_dmg="$package_bundle/MarkWriter_${package_version}_aarch64.dmg"
package_dmg="$PWD/release-assets/MarkWriter-${package_version}-macos-arm64.dmg"
test -f "$candidate_dmg"

package_work=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-macos-package.XXXXXX")
package_mount="$package_work/mount"
package_stage="$package_work/stage"
package_install="$package_work/installed"
package_profile="$package_work/profile"
extension_path=Contents/PlugIns/MarkWriterQuickLook.appex
mkdir -p "$package_mount" "$package_install" "$package_profile" package-acceptance-results release-assets
registration_probe="$package_work/quicklook-registration-probe"
registration_fixtures="$package_work/quicklook-fixtures"
xcrun swiftc tools/quicklook-registration-probe.swift -o "$registration_probe"
"$registration_probe" "$registration_fixtures" >package-acceptance-results/quicklook-types-before.json

mount_package() {
  hdiutil attach "$1" -nobrowse -readonly -mountpoint "$package_mount"
  trap 'hdiutil detach "$package_mount" >/dev/null 2>&1 || true' EXIT
}

unmount_package() {
  hdiutil detach "$package_mount"
  trap - EXIT
}

mount_package "$candidate_dmg"
otool -s __TEXT __text "$package_mount/MarkWriter.app/Contents/MacOS/markwriter" | tail -n +3 >"$package_work/candidate-text"
test -s "$package_work/candidate-text"
tools/package-quicklook-macos.sh stage "$package_mount/MarkWriter.app" "$package_stage"
unmount_package
staged_app="$package_stage/MarkWriter.app"
# Ad hoc signing takes no key material. Sign nested code before sealing the host.
codesign --force --sign - --timestamp=none --entitlements native/quicklook/Preview.entitlements "$staged_app/$extension_path"
codesign --force --sign - --timestamp=none "$staged_app"
tools/package-quicklook-macos.sh dmg "$package_stage" "$package_dmg"
hdiutil verify "$package_dmg"

mount_package "$package_dmg"
test "$(readlink "$package_mount/Applications")" = /Applications
ditto "$package_mount/MarkWriter.app" "$package_install/MarkWriter.app"
unmount_package

package_app="$package_install/MarkWriter.app"
package_binary="$package_app/Contents/MacOS/markwriter"
package_extension="$package_app/$extension_path"
test -x "$package_binary"
otool -s __TEXT __text "$package_binary" | tail -n +3 >"$package_work/final-text"
cmp "$package_work/candidate-text" "$package_work/final-text"
file "$package_binary" | tee package-acceptance-results/binary.txt
test "$(lipo -archs "$package_binary")" = arm64
test "$(lipo -archs "$package_extension/Contents/MacOS/QuickLookPrototype")" = arm64

verify_signature() {
  local bundle=$1 identifier=$2 evidence=$3
  codesign --verify --deep --strict "$bundle"
  codesign -dvv "$bundle" >"$evidence" 2>&1
  grep -Fxq "Identifier=$identifier" "$evidence"
  grep -Fxq 'Signature=adhoc' "$evidence"
  grep -Fxq 'TeamIdentifier=not set' "$evidence"
  grep -q '^Sealed Resources version=2 ' "$evidence"
}

verify_signature "$package_app" com.markwriter.app package-acceptance-results/signature.txt
verify_signature "$package_extension" com.markwriter.app.quicklook package-acceptance-results/quicklook-signature.txt
test "$(plutil -extract CFBundleShortVersionString raw "$package_app/Contents/Info.plist")" = "$package_version"
test "$(plutil -extract CFBundleShortVersionString raw "$package_extension/Contents/Info.plist")" = "$package_version"
plutil -extract NSExtension xml1 -o package-acceptance-results/extension-metadata.plist "$package_extension/Contents/Info.plist"
actual_entitlements=$(codesign -d --entitlements :- "$package_extension" 2>/dev/null | plutil -p -)
test "$actual_entitlements" = "$(plutil -p native/quicklook/Preview.entitlements)"

package_icon=$(plutil -extract CFBundleIconFile raw "$package_app/Contents/Info.plist")
test "$package_icon" = icon.icns
cmp src-tauri/icons/icon.icns "$package_app/Contents/Resources/$package_icon"

# Deny outbound IP while preserving the local IPC that WebKit and LaunchServices need.
MARKWRITER_PROFILE_DIR="$package_profile" sandbox-exec -p '(version 1)(allow default)(deny network-outbound (remote ip))' "$package_binary" >package-acceptance-results/launch.log 2>&1 &
package_pid=$!
trap 'kill "$package_pid" >/dev/null 2>&1 || true' EXIT

package_started=false
for package_start_attempt in {1..300}; do
  if ! kill -0 "$package_pid" 2>/dev/null; then break; fi
  if grep -Fq '[TAURI] Creating new document' package-acceptance-results/launch.log; then package_started=true; break; fi
  sleep 0.1
done
if [[ "$package_started" != true ]]; then cat package-acceptance-results/launch.log; exit 1; fi

package_fixture="$package_work/package-open.md"
printf '# Installed MarkWriter\n\nSynthetic macOS package fixture.\n' >"$package_fixture"
# Register this exact app location. The editor is already running from its
# binary, so sending it an open event alone need not rediscover the package.
lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$lsregister" -f "$package_app"
open -a "$package_app" "$package_fixture"
"$registration_probe" "$registration_fixtures" "$package_app" \
  package-acceptance-results/quicklook-types-before.json >package-acceptance-results/quicklook-types-after.json

# Query PlugInKit without adding or selecting a provider. Hosted sessions
# differ in extension discovery, and a listing does not prove Finder selection.
plugin_evidence=package-acceptance-results/quicklook-plugins.txt
plugin_observed=false
has_installed_extension() {
  while IFS= read -r discovered_path; do
    if [[ "$discovered_path" -ef "$package_extension" ]]; then return 0; fi
  done < <(sed -n 's/^[[:space:]]*Path = //p' "$plugin_evidence")
  return 1
}
for registration_attempt in {1..20}; do
  if /usr/bin/pluginkit -m -ADvv -i com.markwriter.app.quicklook >"$plugin_evidence" 2>&1 && has_installed_extension; then
    plugin_observed=true
    break
  fi
  sleep 0.25
done

python3 - "$package_install" "$package_profile" "$package_fixture" "$package_dmg" "$plugin_observed" <<'PYTHON'
import hashlib
import json
import pathlib
import platform
import sys
import time

installed, profile, fixture, dmg = map(pathlib.Path, sys.argv[1:5])
plugin_observed = sys.argv[5] == "true"
source = b'# Installed MarkWriter\n\nSynthetic macOS package fixture.\n'
workspace = profile / 'workspace.json'
fixture = fixture.resolve()
deadline = time.monotonic() + 30
while time.monotonic() < deadline:
    if workspace.exists():
        documents = json.loads(workspace.read_text())['documents']
        document = next((doc for doc in documents if doc.get('path') == str(fixture)), None)
        if document is not None:
            assert document['content'].encode() == source
            assert document['savedContent'].encode() == source
            assert document['isDirty'] is False
            assert fixture.read_bytes() == source
            break
    time.sleep(0.1)
else:
    raise SystemExit('The installed app did not persist the synthetic Launch Services document.')

result = {
    'passed': True,
    'platform': 'darwin',
    'arch': platform.machine(),
    'installed': str(installed),
    'packageSha256': hashlib.sha256(dmg.read_bytes()).hexdigest(),
    'quickLookRegistrationObserved': plugin_observed,
    'cases': [
        'Verified the final DMG and copied the app from its read-only mount',
        'Verified arm64, bundle versions, and strict ad hoc seals for the app and Quick Look extension',
        'Matched the installed icon bytes and Quick Look entitlements to repository sources',
        'Matched the final app Mach-O text to the Tauri candidate',
        'Launched the installed production app with outbound IP denied and an isolated profile',
        'Opened synthetic Markdown through Launch Services and verified exact clean workspace and source bytes',
        'Verified existing source-file defaults and recorded fixture content types and preview declaration matches',
        *(['Observed the installed extension path in PlugInKit'] if plugin_observed else []),
    ],
    'qualification': 'Hosted macOS installed-package smoke test. Finder provider selection and interactive native file dialogs require desktop qualification.',
}
pathlib.Path('package-acceptance-results/result.json').write_text(json.dumps(result, indent=2) + '\n')
PYTHON
