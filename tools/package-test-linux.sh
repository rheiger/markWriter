#!/usr/bin/env bash
set -euo pipefail
# Called by sudo unshare --net. Reset to the real runner account with runuser's
# normal environment initialization; preserve only the explicit test context.
ip link set lo up
package_test_user=${SUDO_USER:?Original runner user required}
test "$(id -u "$package_test_user")" -ne 0
exec runuser -u "$package_test_user" -- env \
  PATH="$PATH" MARKWRITER_BINARY="$MARKWRITER_BINARY" MARKWRITER_PROFILE_DIR="$MARKWRITER_PROFILE_DIR" \
  GITHUB_SHA="${GITHUB_SHA:-}" ImageOS="${ImageOS:-}" ImageVersion="${ImageVersion:-}" GDK_BACKEND=x11 \
  xvfb-run -a bash tools/package-desktop-linux.sh
