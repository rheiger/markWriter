#!/usr/bin/env bash
# Assemble the Quick Look variant of the macOS package in two explicit steps.
# Sign the staged app and extension separately before running the dmg step.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
if [[ $# != 3 || "$2" != /* || "$3" != /* ]]; then
  echo "Usage: $0 stage /absolute/path/to/MarkWriter.app /absolute/new/staging-directory" >&2
  echo "       $0 dmg /absolute/path/to/staging-directory /absolute/new/package.dmg" >&2
  exit 2
fi
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
test ! -e "$3" && test ! -L "$3" || { echo "Output already exists: $3" >&2; exit 1; }

extension_path=Contents/PlugIns/MarkWriterQuickLook.appex
case "$1" in
  stage)
    source_app="$2"
    stage="$3"
    host_plist="$source_app/Contents/Info.plist"
    test "$(plutil -extract CFBundleIdentifier raw "$host_plist")" = com.markwriter.app
    test "$(lipo -archs "$source_app/Contents/MacOS/markwriter")" = arm64
    test ! -e "$source_app/Contents/_CodeSignature/CodeResources"
    test ! -e "$source_app/$extension_path"
    version=$(plutil -extract CFBundleShortVersionString raw "$host_plist")
    build=$(plutil -extract CFBundleVersion raw "$host_plist")
    mkdir "$stage"
    app="$stage/MarkWriter.app"
    ditto "$source_app" "$app"
    # LaunchServices reads filename type declarations from the containing app.
    app_plist="$app/Contents/Info.plist"
    if ! plutil -extract UTImportedTypeDeclarations xml1 -o /dev/null "$app_plist" 2>/dev/null; then
      plutil -insert UTImportedTypeDeclarations -array "$app_plist"
    fi
    plutil -insert UTImportedTypeDeclarations.0 -xml "$(cat "$root/native/quicklook/JSONLinesType.plist")" "$app_plist"
    plutil -lint "$app_plist"
    "$root/native/quicklook/build-experiment.sh" "$stage/extension-build"
    mkdir -p "$app/Contents/PlugIns"
    mv "$stage/extension-build/MarkWriterQuickLook.appex" "$app/$extension_path"
    rmdir "$stage/extension-build"
    extension_plist="$app/$extension_path/Contents/Info.plist"
    plutil -replace CFBundleIdentifier -string com.markwriter.app.quicklook "$extension_plist"
    plutil -replace CFBundleName -string 'MarkWriter Quick Look' "$extension_plist"
    plutil -replace CFBundleShortVersionString -string "$version" "$extension_plist"
    plutil -replace CFBundleVersion -string "$build" "$extension_plist"
    plutil -lint "$extension_plist"
    ln -s /Applications "$stage/Applications"
    printf 'Unsigned Quick Look staging bundle: %s\n' "$app"
    ;;
  dmg)
    stage="$2"
    app="$stage/MarkWriter.app"
    extension="$app/$extension_path"
    test "$(readlink "$stage/Applications")" = /Applications
    # Require just the app and installer shortcut at the image root.
    test "$(find "$stage" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')" = 2
    test "$(plutil -extract CFBundleIdentifier raw "$app/Contents/Info.plist")" = com.markwriter.app
    test "$(plutil -extract CFBundleIdentifier raw "$extension/Contents/Info.plist")" = com.markwriter.app.quicklook
    codesign --verify --strict "$extension"
    codesign --verify --deep --strict "$app"
    actual_entitlements=$(codesign -d --entitlements :- "$extension" 2>/dev/null | plutil -p -)
    expected_entitlements=$(plutil -p "$root/native/quicklook/Preview.entitlements")
    test "$actual_entitlements" = "$expected_entitlements" || {
      echo "Quick Look extension entitlements must match the reviewed preview policy" >&2
      exit 1
    }
    hdiutil create -fs HFS+ -volname MarkWriter -srcfolder "$stage" -format UDZO "$3"
    ;;
  *) echo "Expected stage or dmg" >&2; exit 2 ;;
esac
