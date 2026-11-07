#!/bin/sh
# Build an unsigned arm64 extension for staging and isolated tests.
set -eu
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 /absolute/path/to/new-output-directory" >&2
    exit 2
fi
case "$1" in /*) ;; *) echo "Output directory must be absolute" >&2; exit 2;; esac
if [ -e "$1" ]; then echo "Output already exists: $1" >&2; exit 2; fi
src=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
contents="$1/MarkWriterQuickLook.appex/Contents"
mkdir -p "$contents/MacOS" "$contents/Resources"
frontend=$(CDPATH= cd -- "$src/../../frontend" && pwd)
assets=$(mktemp -d "$1/web-assets.XXXXXX")
trap 'rm -rf "$assets"' EXIT
(cd "$frontend" && ./node_modules/.bin/vite build --config vite.quicklook.config.ts --outDir "$assets")
test -s "$assets/quicklook-render.js"
cp "$assets/quicklook-render.js" "$contents/Resources/"
rm -rf "$assets"
trap - EXIT
cp "$src/Info.plist" "$1/MarkWriterQuickLook.appex/Contents/Info.plist"
xcrun swiftc -target arm64-apple-macos12.0 -parse-as-library -application-extension -Xlinker -no_adhoc_codesign \
  -Xlinker -e -Xlinker _NSExtensionMain "$src/PreviewRenderer.swift" "$src/SimpleXMLFormatter.swift" "$src/JSONFormatter.swift" "$src/SafeFileReader.swift" "$src/PreviewProvider.swift" "$src/QuickLookWebRenderer.swift" \
  -o "$1/MarkWriterQuickLook.appex/Contents/MacOS/QuickLookPrototype"
plutil -lint "$1/MarkWriterQuickLook.appex/Contents/Info.plist"
printf '%s\n' "Unsigned Quick Look bundle: $1/MarkWriterQuickLook.appex"
