#!/usr/bin/env bash
set -euo pipefail

version=${1:?Missing package version}
source_commit=${2:?Missing source SHA}
[[ $version =~ ^2\.12\.[0-9]+$ && $source_commit =~ ^[0-9a-f]{40}$ ]]
[[ $PWD == /private/tmp/markwriter-pi212-release.* ]]
[[ $(uname -m) == arm64 ]]
export PATH="$PATH:/opt/homebrew/bin"

sha() { shasum -a 256 "$1" | awk '{print $1}'; }
manifest=macos-arm64.manifest.json
image="MarkWriter-$version-macos-arm64.dmg"
test "$(plutil -extract source raw "$manifest")" = "$source_commit"
test "$(plutil -extract version raw "$manifest")" = "$version"
test "$(sha hosted.dmg)" = "$(plutil -extract asset.sha256 raw "$manifest")"

mkdir source hosted-mount hosted-app
tar -xzf source.tar.gz -C source
hdiutil attach hosted.dmg -readonly -nobrowse -mountpoint "$PWD/hosted-mount" >hosted-mount.log
trap 'hdiutil detach "$PWD/hosted-mount" >/dev/null 2>&1 || true' EXIT
ditto hosted-mount/MarkWriter.app hosted-app/MarkWriter.app
hdiutil detach "$PWD/hosted-mount" >/dev/null
trap - EXIT

base="$PWD/hosted-app/MarkWriter.app"
test "$(sha "$base/Contents/MacOS/markwriter")" = "$(plutil -extract binaryInspection.sha256 raw "$manifest")"
test "$(plutil -extract CFBundleShortVersionString raw "$base/Contents/Info.plist")" = "$version"
npm ci --prefix source/frontend
source/tools/package-quicklook-macos.sh stage "$base" "$PWD/bundle"
app="$PWD/bundle/MarkWriter.app"
extension_path=Contents/PlugIns/MarkWriterQuickLook.appex
extension="$app/$extension_path"
codesign --sign - --force --timestamp=none --entitlements source/native/quicklook/Preview.entitlements "$extension"
codesign --sign - --force --timestamp=none "$app"
source/tools/package-quicklook-macos.sh dmg "$PWD/bundle" "$PWD/$image"

mkdir sealed-mount sealed-app
hdiutil attach "$image" -readonly -nobrowse -mountpoint "$PWD/sealed-mount" >sealed-mount.log
trap 'hdiutil detach "$PWD/sealed-mount" >/dev/null 2>&1 || true' EXIT
ditto sealed-mount/MarkWriter.app sealed-app/MarkWriter.app
hdiutil detach "$PWD/sealed-mount" >/dev/null
trap - EXIT

final="$PWD/sealed-app/MarkWriter.app"
final_extension="$final/$extension_path"
codesign --verify --strict "$final_extension"
codesign --verify --deep --strict "$final"
test "$(plutil -extract CFBundleShortVersionString raw "$final/Contents/Info.plist")" = "$version"
test "$(plutil -extract CFBundleShortVersionString raw "$final_extension/Contents/Info.plist")" = "$version"
cmp "$app/Contents/MacOS/markwriter" "$final/Contents/MacOS/markwriter"
cmp source/src-tauri/icons/icon.icns "$final/Contents/Resources/icon.icns"
cmp <(otool -s __TEXT __text "$base/Contents/MacOS/markwriter" | tail -n +3) <(otool -s __TEXT __text "$final/Contents/MacOS/markwriter" | tail -n +3)
shasum -a 256 "$image" "$final/Contents/MacOS/markwriter" "$final_extension/Contents/MacOS/QuickLookPrototype" >sealed-sha256.txt
sw_vers >macos-version.txt
printf 'PASS: final app and Quick Look extension seal, version, icon and executable code verified\n'
