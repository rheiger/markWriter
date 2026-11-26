#!/usr/bin/env bash
set -euo pipefail
export MARKWRITER_PROBE_MODE="${1:?Use fresh or existing}"
export MARKWRITER_ASSOCIATION_ROOT
MARKWRITER_ASSOCIATION_ROOT=$(mktemp -d "$RUNNER_TEMP/markwriter-chooser.XXXXXX")
export MARKWRITER_ASSOCIATION_EVIDENCE="$PWD/nautilus-probe-evidence/$MARKWRITER_PROBE_MODE"
export XDG_DATA_HOME="$MARKWRITER_ASSOCIATION_ROOT/data"
export XDG_CONFIG_HOME="$MARKWRITER_ASSOCIATION_ROOT/config"
export XDG_CACHE_HOME="$MARKWRITER_ASSOCIATION_ROOT/cache"
export XDG_RUNTIME_DIR="$MARKWRITER_ASSOCIATION_ROOT/runtime"
export MARKWRITER_PROFILE_DIR="$MARKWRITER_ASSOCIATION_ROOT/recovery"
export XDG_CURRENT_DESKTOP=GNOME GDK_BACKEND=x11 GSK_RENDERER=cairo NO_AT_BRIDGE=0 LC_ALL=C.UTF-8 LANGUAGE=en
mkdir -p "$MARKWRITER_ASSOCIATION_EVIDENCE" "$XDG_DATA_HOME/applications" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$MARKWRITER_PROFILE_DIR"
mkdir -m 700 "$XDG_RUNTIME_DIR"
cat > "$MARKWRITER_ASSOCIATION_ROOT/record-launch" <<'SCRIPT'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$MARKWRITER_ASSOCIATION_ROOT/argv"
SCRIPT
cat > "$MARKWRITER_ASSOCIATION_ROOT/record-incumbent" <<'SCRIPT'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$MARKWRITER_ASSOCIATION_ROOT/incumbent-argv"
SCRIPT
chmod +x "$MARKWRITER_ASSOCIATION_ROOT"/record-{launch,incumbent}
mkdir -p "$XDG_DATA_HOME/icons/hicolor/32x32/apps"
cp src-tauri/icons/32x32.png "$XDG_DATA_HOME/icons/hicolor/32x32/apps/markwriter.png"
cat > "$XDG_DATA_HOME/applications/MarkWriter.desktop" <<DESKTOP
[Desktop Entry]
Name=MarkWriter
Icon=markwriter
Exec=$MARKWRITER_ASSOCIATION_ROOT/record-launch %F
MimeType=text/markdown;
Terminal=false
Type=Application
DESKTOP
if [[ "$MARKWRITER_PROBE_MODE" == existing ]]; then
  sed -e 's/Name=MarkWriter/Name=Association Control/' -e '/^Icon=/d' -e 's/record-launch/record-incumbent/' "$XDG_DATA_HOME/applications/MarkWriter.desktop" > "$XDG_DATA_HOME/applications/incumbent.desktop"
fi
update-desktop-database "$XDG_DATA_HOME/applications"
if [[ "$MARKWRITER_PROBE_MODE" == existing ]]; then
  gio mime text/markdown incumbent.desktop
else
  test ! -e "$XDG_CONFIG_HOME/mimeapps.list"
fi
xvfb-run -a -s '-screen 0 1440x900x24' dbus-run-session -- bash -c '
  openbox >"$MARKWRITER_ASSOCIATION_EVIDENCE/openbox.log" 2>&1 &
  probe_wm=$!
  trap "kill $probe_wm 2>/dev/null || true" EXIT
  /usr/bin/python3 tools/pi-2.19-nautilus-probe.py
'
