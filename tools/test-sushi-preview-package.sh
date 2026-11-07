#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
source_dir="$root/native/linux-preview/sushi-46"
version=$(node -p "require(process.argv[1]).version" "$root/src-tauri/tauri.conf.json")
test_root=$(mktemp -d "${RUNNER_TEMP:?Use an isolated CI runner}/markwriter-sushi-package.XXXXXX")
assets="$root/release-assets"
mkdir -p "$assets" "$test_root/extracted"
archive="$assets/MarkWriter-$version-ubuntu-26.04-x64-sushi-preview.zip"
test ! -e "$archive"
zip -j "$archive" "$source_dir/install.sh" "$source_dir/markwriterMarkdown.js" "$root/LICENSE"
archive_digest=$(sha256sum "$archive" | cut -d ' ' -f 1)
unzip -q "$archive" -d "$test_root/extracted"
plugin="$test_root/extracted/markwriterMarkdown.js"
installer="$test_root/extracted/install.sh"
cmp "$source_dir/install.sh" "$installer"
cmp "$source_dir/markwriterMarkdown.js" "$plugin"

export XDG_DATA_HOME="$test_root/data" XDG_CONFIG_HOME="$test_root/config" XDG_CACHE_HOME="$test_root/cache"
export GDK_BACKEND=x11 NO_AT_BRIDGE=0
mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
viewer_dir="$XDG_DATA_HOME/sushi/viewers"
target="$viewer_dir/markwriterMarkdown.js"
desktop_test() {
  dbus-run-session -- xvfb-run -a -s '-screen 0 1280x800x24' "$source_dir/desktop-test.sh" "$1" || {
    if [[ -f /tmp/markwriter-nautilus-test.log ]]; then cat /tmp/markwriter-nautilus-test.log; fi
    return 1
  }
}
desktop_test raw
mkdir -p "$viewer_dir"
printf 'competing viewer placeholder\n' > "$viewer_dir/other.js"
if "$installer" enable; then echo 'Sushi installer accepted a competing user viewer' >&2; exit 1; fi
test "$(cat "$viewer_dir/other.js")" = 'competing viewer placeholder'
test ! -e "$target"
unlink "$viewer_dir/other.js"
"$installer" enable
trap '"$installer" disable' EXIT
cmp "$plugin" "$target"
plugin_digest=$(sha256sum "$target" | cut -d ' ' -f 1)
desktop_test formatted
cmp "$plugin" "$target"
"$installer" disable
trap - EXIT
test ! -e "$target"
desktop_test raw
baseline="$(lsb_release -ds), $(dpkg-query -W gnome-sushi nautilus | tr '\n' ' ')"
result="$test_root/result.json"
node --input-type=module - "$result" "$baseline" "$archive_digest" "$plugin_digest" <<'JS'
import { writeFileSync } from 'node:fs'
const [path, baseline, assetSha256, installedSha256] = process.argv.slice(2)
writeFileSync(path, JSON.stringify({ passed: true, baseline, assetSha256, installedSha256, cases: [
  'Nautilus Space displays literal Markdown before enablement',
  'Existing user viewer preserved and installation refused',
  'Nautilus Space displays formatted Markdown using the extracted preview component',
  'Sushi viewer removal restores literal Markdown on fresh files',
] }) + '\n', { flag: 'wx' })
JS
node "$root/tools/shell-preview-assets.mjs" sushi "$assets" "$result"
