#!/usr/bin/env bash
set -euo pipefail

# This installs the requested package on a disposable Ubuntu Actions runner.
source /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = 26.04
test "${GITHUB_ACTIONS:-}" = true
test "$(id -u)" -ne 0
package=$(realpath "${1:?Pass the MarkWriter DEB path}")
digest=${2:?Pass the expected SHA-256}
[[ "$digest" =~ ^[a-f0-9]{64}$ ]]
printf '%s  %s\n' "$digest" "$package" | sha256sum --check
test "$(dpkg-deb -f "$package" Package)" = mark-writer
version=$(dpkg-deb -f "$package" Version)

sudo apt-get -o Acquire::Retries=3 install --no-install-recommends -y "$package"
test "$(dpkg-query -W -f='${Version}' mark-writer)" = "$version"

export MARKWRITER_ASSOCIATION_EVIDENCE="$PWD/package-acceptance-results/ubuntu-wayland"
mkdir -p "$MARKWRITER_ASSOCIATION_EVIDENCE"
{
  cat /etc/os-release
  dpkg-query -W gnome-shell libmutter-18-0 nautilus mark-writer
  printf '%s  %s\n' "$digest" "$(basename "$package")"
  printf '%s\n' 'GNOME Shell headless Wayland with a virtual monitor and native GTK clients'
} > "$MARKWRITER_ASSOCIATION_EVIDENCE/platform.txt"

export MARKWRITER_ASSOCIATION_ROOT="$(mktemp -d "${RUNNER_TEMP:?A disposable runner is required}/markwriter-wayland.XXXXXX")"
trap 'rm -rf "$MARKWRITER_ASSOCIATION_ROOT"' EXIT
export XDG_RUNTIME_DIR="$MARKWRITER_ASSOCIATION_ROOT/run"
export XDG_DATA_HOME="$MARKWRITER_ASSOCIATION_ROOT/data"
export XDG_CONFIG_HOME="$MARKWRITER_ASSOCIATION_ROOT/config"
export XDG_CACHE_HOME="$MARKWRITER_ASSOCIATION_ROOT/cache"
export MARKWRITER_PROFILE_DIR="$MARKWRITER_ASSOCIATION_ROOT/recovery"
export XDG_SESSION_TYPE=wayland XDG_CURRENT_DESKTOP=GNOME
export WAYLAND_DISPLAY=markwriter-test GDK_BACKEND=wayland
export LIBGL_ALWAYS_SOFTWARE=1 GSETTINGS_BACKEND=keyfile LC_ALL=C.UTF-8 LANGUAGE=en
unset DISPLAY
mkdir -m 700 "$XDG_RUNTIME_DIR"
mkdir -p "$XDG_DATA_HOME/applications" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$MARKWRITER_PROFILE_DIR"
extension="$XDG_DATA_HOME/gnome-shell/extensions/focus-observer@markwriter.test"
mkdir -p "$extension"
cp tools/wayland-focus-observer/* "$extension/"

dbus-run-session -- bash -euc '
  gsettings set org.gnome.shell enabled-extensions "['"'"'focus-observer@markwriter.test'"'"']"
  gsettings set org.gnome.shell welcome-dialog-last-shown-version 999
  gnome-shell --headless --no-x11 --virtual-monitor=1440x900 --wayland-display="$WAYLAND_DISPLAY" \
    >"$MARKWRITER_ASSOCIATION_EVIDENCE/gnome-shell.log" 2>&1 &
  compositor=$!
  trap "kill $compositor 2>/dev/null || true" EXIT
  for i in $(seq 1 100); do
    test ! -s "$MARKWRITER_ASSOCIATION_EVIDENCE/focus.json" || break
    kill -0 "$compositor"
    sleep 0.2
  done
  test -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY"
  test -s "$MARKWRITER_ASSOCIATION_EVIDENCE/focus.json"
  /usr/bin/python3 tools/wayland-association-desktop.py
'
