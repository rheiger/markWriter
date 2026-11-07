#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
build=$(realpath -e "${1:?Supply the configured KF6 build directory}")
output=$(realpath -e "${2:?Supply the release asset directory}")
version=$(node -p "require(process.argv[1]).version" "$root/src-tauri/tauri.conf.json")
source /etc/os-release
test "$ID" = ubuntu && test "$VERSION_ID" = 26.04
test "$(dpkg --print-architecture)" = amd64
stage=$(mktemp -d "${RUNNER_TEMP:-/tmp}/markwriter-dolphin-package.XXXXXX")
DESTDIR="$stage" cmake --install "$build" --prefix /usr
qt_plugins=$(qtpaths6 --query QT_INSTALL_PLUGINS)
plugin="$stage$qt_plugins/kf6/thumbcreator/libmarkwriterthumbnail.so"
test -f "$plugin"
test "$(find "$stage" -type f | wc -l)" -eq 1

package=markwriter-dolphin-preview
mkdir "$stage/DEBIAN" "$stage/debian"
cat > "$stage/debian/control" <<CONTROL
Source: $package
Maintainer: MarkWriter maintainers
Section: utils
Priority: optional

Package: $package
Architecture: any
Description: Markdown thumbnails for Dolphin
CONTROL
depends=$(cd "$stage" && dpkg-shlibdeps -O -e "$plugin" | sed -n 's/^shlibs:Depends=//p')
test -n "$depends"
unlink "$stage/debian/control"
rmdir "$stage/debian"

cat > "$stage/DEBIAN/control" <<CONTROL
Package: $package
Version: $version
Architecture: amd64
Maintainer: MarkWriter maintainers
Section: utils
Priority: optional
Depends: dolphin, $depends
Description: MarkWriter Markdown thumbnails for Dolphin
 Adds an optional KF6 thumbnail provider for text/markdown files.
CONTROL
install -Dm644 "$root/LICENSE" "$stage/usr/share/doc/$package/copyright"
asset="$output/MarkWriter-$version-ubuntu-26.04-x64-dolphin-preview.deb"
test ! -e "$asset"
dpkg-deb --root-owner-group --build "$stage" "$asset"
dpkg-deb --contents "$asset"
