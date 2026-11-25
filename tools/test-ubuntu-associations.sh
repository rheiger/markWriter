#!/usr/bin/env bash
set -euo pipefail

# Installs/removes the editor only on a disposable Ubuntu 26.04 Actions runner.
source /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = 26.04
test "${GITHUB_ACTIONS:-}" = true
test "$(id -u)" -ne 0
candidate=$(realpath "${1:?Path to the new MarkWriter package}")
candidate_digest=$(sha256sum "$candidate" | cut -d ' ' -f 1)
candidate_version=$(dpkg-deb -f "$candidate" Version)
control=MarkWriter-2.18.5-ubuntu-26.04-x64.deb
control_digest=586f89ce7c165d78ec8f5c3b4f7515474766269f56ccf5ea184e408c219c1b8c

workspace=$(mktemp -d "${RUNNER_TEMP:?A disposable runner is required}/markwriter-associations.XXXXXX")
trap 'rm -rf "$workspace"' EXIT
evidence="$(pwd)/package-acceptance-results/ubuntu-associations"
mkdir -p "$evidence"
curl --fail --location --retry 3 --output "$workspace/$control"   "https://github.com/rheiger/markWriter/releases/download/v2.18.5/$control"
printf '%s  %s\n' "$control_digest" "$workspace/$control" | sha256sum --check

export GDK_BACKEND=x11 GSK_RENDERER=cairo NO_AT_BRIDGE=0 XDG_CURRENT_DESKTOP=GNOME LC_ALL=C.UTF-8 LANGUAGE=en
export MARKWRITER_ASSOCIATION_EVIDENCE="$evidence"
export XDG_DATA_DIRS=/usr/local/share:/usr/share
profile() {
  export MARKWRITER_ASSOCIATION_ROOT="$workspace/$1"
  export XDG_DATA_HOME="$MARKWRITER_ASSOCIATION_ROOT/data"
  export XDG_CONFIG_HOME="$MARKWRITER_ASSOCIATION_ROOT/config"
  export XDG_CACHE_HOME="$MARKWRITER_ASSOCIATION_ROOT/cache"
  export XDG_RUNTIME_DIR="$MARKWRITER_ASSOCIATION_ROOT/runtime"
  export MARKWRITER_PROFILE_DIR="$MARKWRITER_ASSOCIATION_ROOT/recovery"
  mkdir -p "$XDG_DATA_HOME/applications" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$MARKWRITER_PROFILE_DIR"
  mkdir -p -m 700 "$XDG_RUNTIME_DIR"
}
check_desktop() {
  xvfb-run -a -s '-screen 0 1440x900x24' dbus-run-session -- bash -c '
    openbox >"$MARKWRITER_ASSOCIATION_EVIDENCE/$1-openbox.log" 2>&1 &
    manager=$!
    trap "kill $manager 2>/dev/null || true" EXIT
    /usr/bin/python3 tools/ubuntu-association-desktop.py "$1"
  ' bash "$1" >"$evidence/$1-session.log" 2>&1 || {
    cat "$evidence/$1-session.log"
    return 1
  }
  cat "$evidence/$1.json"
}
install() {
  sudo dpkg --install "$1"
  test "$(dpkg-query -W -f='${Version}' mark-writer)" = "$(dpkg-deb -f "$1" Version)"
}

profile existing
cat > "$MARKWRITER_ASSOCIATION_ROOT/open-incumbent" <<'SCRIPT'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$MARKWRITER_ASSOCIATION_ROOT/incumbent-paths.txt"
SCRIPT
chmod +x "$MARKWRITER_ASSOCIATION_ROOT/open-incumbent"
cat > "$XDG_DATA_HOME/applications/markwriter-test-incumbent.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Association Control
Exec=$MARKWRITER_ASSOCIATION_ROOT/open-incumbent %F
MimeType=text/markdown;
Terminal=false
DESKTOP
update-desktop-database "$XDG_DATA_HOME/applications"
gio mime text/markdown markwriter-test-incumbent.desktop

install "$workspace/$control"
cp /usr/share/applications/MarkWriter.desktop "$evidence/control.desktop"
check_desktop control
install "$candidate"
desktop=/usr/share/applications/MarkWriter.desktop
desktop-file-validate "$desktop"
grep -Fx 'Exec=markwriter %F' "$desktop"
grep -Fx 'MimeType=text/markdown;' "$desktop"
cp "$desktop" "$evidence/candidate.desktop"
check_desktop existing
cp "$MARKWRITER_PROFILE_DIR/workspace.json" "$evidence/dirty-workspace.json"
cp "$XDG_CONFIG_HOME/mimeapps.list" "$workspace/mimeapps-before-removal"

profile fresh
check_desktop fresh

profile existing
sudo dpkg --remove mark-writer
test ! -e "$desktop"
test ! -e /usr/bin/markwriter
check_desktop removed
cmp "$workspace/mimeapps-before-removal" "$XDG_CONFIG_HOME/mimeapps.list"
cmp "$evidence/dirty-workspace.json" "$MARKWRITER_PROFILE_DIR/workspace.json"

install "$workspace/$control"
cmp "$evidence/control.desktop" "$desktop"
cmp "$evidence/dirty-workspace.json" "$MARKWRITER_PROFILE_DIR/workspace.json"
export MARKWRITER_PROFILE_DIR="$workspace/rollback-recovery"
mkdir "$MARKWRITER_PROFILE_DIR"
cp "$evidence/dirty-workspace.json" "$MARKWRITER_PROFILE_DIR/workspace.json"
check_desktop rollback
cmp "$workspace/mimeapps-before-removal" "$XDG_CONFIG_HOME/mimeapps.list"

printf '%s\n' "$PRETTY_NAME" "$(nautilus --version)" "$(id -u) ordinary-user desktop" > "$evidence/platform.txt"
printf '%s  %s\n%s  %s\n' "$control_digest" "$control" "$candidate_digest" "$(basename "$candidate")" > "$evidence/packages.sha256"
printf '%s\n' "$candidate_version" > "$evidence/candidate-version.txt"
