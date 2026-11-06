#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -ne 0
openbox >/tmp/markwriter-openbox.log 2>&1 &
package_wm_pid=$!
trap 'kill "$package_wm_pid" >/dev/null 2>&1 || true' EXIT
node tools/installed-package-acceptance.mjs
