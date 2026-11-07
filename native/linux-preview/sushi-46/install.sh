#!/bin/sh
# Experimental, user-local Sushi 46 renderer. Never overwrites another viewer.
set -eu
mode=${1:-}
base=${XDG_DATA_HOME:-"$HOME/.local/share"}/sushi/viewers
source_file=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/markwriterMarkdown.js
target=$base/markwriterMarkdown.js
case "$mode" in
  enable)
    version=$(dpkg-query -W -f='${Version}' gnome-sushi 2>/dev/null || :)
    case "$version" in 46.0-3|50.0-0ubuntu0.1) ;; *) echo 'Unsupported Ubuntu Sushi version; refusing enablement.' >&2; exit 1 ;; esac
    [ -r "$source_file" ] || exit 1
    if [ -e "$base" ]; then
      [ -d "$base" ] && [ ! -L "$base" ] || { echo 'Viewer directory is not a normal directory.' >&2; exit 1; }
      if [ -n "$(find "$base" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
        echo 'Existing user viewer detected; refusing possible provider collision.' >&2; exit 1
      fi
    else
      mkdir -p "$base"
    fi
    tmp=$(mktemp "$base/.markwriter.XXXXXXXX")
    trap 'rm -f "$tmp"' EXIT HUP INT TERM
    cp "$source_file" "$tmp"
    chmod 0644 "$tmp"
    ln "$tmp" "$target" || { echo 'Renderer already exists; leaving it unchanged.' >&2; exit 1; }
    echo 'Renderer installed. Restart Sushi before testing. No file associations changed.'
    ;;
  disable)
    [ -f "$target" ] && [ ! -L "$target" ] || { echo 'Owned renderer not found.' >&2; exit 1; }
    cmp -s "$source_file" "$target" || { echo 'Renderer differs from this package; refusing removal.' >&2; exit 1; }
    rm -- "$target"
    echo 'Matching renderer removed. Restart Sushi to restore its previous behavior.'
    ;;
  *) echo "Usage: $0 enable|disable" >&2; exit 2 ;;
esac
