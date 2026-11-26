#!/usr/bin/env bash
set -euo pipefail
ip link set lo up
test -z "$(ip route)"
test -z "$(ip -6 route show default)"
runner="${SUDO_USER:?Runner required}"
test "$(id -u "$runner")" -ne 0
exec runuser -u "$runner" -- env PATH="$PATH" MARKWRITER_BINARY=/usr/bin/markwriter \
  MARKWRITER_EXPORT_EVIDENCE="$PWD/receipts/synthetic-export.html" \
  GIO_USE_VFS=local GDK_BACKEND=x11 dbus-run-session -- \
  xvfb-run -a -s '-screen 0 1920x1080x24' bash -ceu '
    profile=$(mktemp -d)
    export XDG_CONFIG_HOME="$profile/config" XDG_CACHE_HOME="$profile/cache" XDG_DATA_HOME="$profile/data"
    mkdir -m 700 "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME"
    node tools/plantuml-package-spike.mjs > receipts/result.json
  '
