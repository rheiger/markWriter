#!/usr/bin/env bash
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
root=$(cd "$(dirname "$0")/.." && pwd)
build=$(realpath -e "${1:?Supply the configured KF6 build directory}")
version=$(node -p "require(process.argv[1]).version" "$root/src-tauri/tauri.conf.json")
assets="$root/release-assets"
evidence="$root/shell-preview-evidence"
mkdir -p "$assets" "$evidence"
test_root=$(mktemp -d "${RUNNER_TEMP:?Use an isolated CI runner}/markwriter-dolphin-install.XXXXXX")
"$root/tools/build-dolphin-preview-deb.sh" "$build" "$assets"
archive="$assets/MarkWriter-$version-ubuntu-26.04-x64-dolphin-preview.deb"
archive_digest=$(sha256sum "$archive" | cut -d ' ' -f 1)
dpkg-deb --extract "$archive" "$test_root/extracted"
plugin="$(qtpaths6 --query QT_INSTALL_PLUGINS)/kf6/thumbcreator/markwriterthumbnail.so"
test ! -e "$plugin"
sudo apt-get install --no-install-recommends -y "$archive"
trap 'sudo apt-get remove -y markwriter-dolphin-preview' EXIT
cmp "$plugin" "$test_root/extracted$plugin"
plugin_digest=$(sha256sum "$plugin" | cut -d ' ' -f 1)
export XDG_CONFIG_HOME="$test_root/config" XDG_DATA_HOME="$test_root/data" XDG_CACHE_HOME="$test_root/cache"
export MARKWRITER_DISPOSABLE=1 QT_QPA_PLATFORM=xcb XDG_CURRENT_DESKTOP=KDE
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"
desktop_test() {
  dbus-run-session -- xvfb-run -a -s '-screen 0 1280x800x24' "$@" || {
    if [[ -f /tmp/markwriter-dolphin-test.log ]]; then cat /tmp/markwriter-dolphin-test.log; fi
    return 1
  }
}
reference="$evidence/dolphin-reference.png"
desktop_test "$build/kio_test" "$reference"
desktop_test "$root/native/linux-preview/kde/desktop-test.sh" disabled "$reference" "$evidence/dolphin-disabled.png"
desktop_test "$root/native/linux-preview/kde/desktop-test.sh" enabled "$reference" "$evidence/dolphin-enabled.png"
cmp "$plugin" "$test_root/extracted$plugin"
sudo apt-get remove -y markwriter-dolphin-preview
trap - EXIT
test ! -e "$plugin"
desktop_test "$root/native/linux-preview/kde/desktop-test.sh" disabled "$reference" "$evidence/dolphin-removed.png"
baseline="$(lsb_release -ds), $(dpkg-query -W dolphin kio-extras libkf6kiogui6 | tr '\n' ' ')"
result="$evidence/dolphin-acceptance.json"
node --input-type=module - "$result" "$baseline" "$archive_digest" "$plugin_digest" <<'JS'
import { writeFileSync } from 'node:fs'
const [path, baseline, assetSha256, installedSha256] = process.argv.slice(2)
writeFileSync(path, JSON.stringify({ passed: true, baseline, assetSha256, installedSha256, cases: [
  'Installed KF6 KIO worker output matches the MarkWriter renderer',
  'Dolphin omits the MarkWriter thumbnail when the provider is disabled',
  'Dolphin shows the matching MarkWriter thumbnail when the installed provider is enabled',
  'Uninstall removes the plugin and fresh Dolphin view has no MarkWriter thumbnail',
] }) + '\n', { flag: 'wx' })
JS
node "$root/tools/shell-preview-assets.mjs" dolphin "$assets" "$result"
