#!/usr/bin/env bash
set -euo pipefail
# The supported release baseline is explicit; retain Ubuntu's repository keys and
# signatures. The Azure mirror observed in initial CI delivered ~50 KiB/s.
# Use the canonical Ubuntu archive on these disposable build runners.
source /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = 26.04
sudo python3 - <<'PY'
from pathlib import Path
paths=[Path('/etc/apt/sources.list'),*Path('/etc/apt/sources.list.d').glob('*.sources'),*Path('/etc/apt/sources.list.d').glob('*.list')]
for path in paths:
 if not path.exists():continue
 text=path.read_text()
 updated=text.replace('http://azure.archive.ubuntu.com/ubuntu','https://archive.ubuntu.com/ubuntu').replace('https://azure.archive.ubuntu.com/ubuntu','https://archive.ubuntu.com/ubuntu')
 if text!=updated:path.write_text(updated)
PY
package_apt_options=(-o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30)
sudo apt-get "${package_apt_options[@]}" update
package_driver=webkitgtk-webdriver
if ! apt-cache show "$package_driver" >/dev/null 2>&1; then package_driver=webkit2gtk-driver; fi
package_dependencies=(libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf "$package_driver" xvfb fonts-dejavu-core)
if [[ "${1:-native}" == package ]]; then package_dependencies+=(xdotool openbox dbus-x11); fi
sudo apt-get "${package_apt_options[@]}" install -y --no-install-recommends "${package_dependencies[@]}"
