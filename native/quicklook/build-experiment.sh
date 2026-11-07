#!/bin/sh
# Build an isolated unsigned experimental extension. Never install or register it.
set -eu
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 /absolute/path/to/new-output-directory" >&2
    exit 2
fi
case "$1" in /*) ;; *) echo "Output directory must be absolute" >&2; exit 2;; esac
if [ -e "$1" ]; then echo "Output already exists: $1" >&2; exit 2; fi
src=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$1/MarkWriterQuickLook.appex/Contents/MacOS"
cp "$src/Info.plist" "$1/MarkWriterQuickLook.appex/Contents/Info.plist"
xcrun swiftc -parse-as-library -application-extension -Xlinker -no_adhoc_codesign \
  -Xlinker -e -Xlinker _NSExtensionMain "$src/PreviewRenderer.swift" "$src/SimpleXMLFormatter.swift" "$src/JSONFormatter.swift" "$src/SafeFileReader.swift" "$src/PreviewProvider.swift" \
  -o "$1/MarkWriterQuickLook.appex/Contents/MacOS/QuickLookPrototype"
plutil -lint "$1/MarkWriterQuickLook.appex/Contents/Info.plist"
printf '%s\n' "Unsigned experimental bundle: $1/MarkWriterQuickLook.appex"
