#!/bin/sh
# Run in a disposable, isolated D-Bus/Xvfb desktop with the renderer enabled.
# Requires nautilus, gnome-sushi, xdotool and python3-pyatspi.
set -eu
: "${DISPLAY:?run under Xvfb}"
: "${DBUS_SESSION_BUS_ADDRESS:?run under dbus-run-session}"
testdir=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-nautilus-XXXXXX")
cleanup() { [ -z "${nautilus_pid:-}" ] || kill "$nautilus_pid" 2>/dev/null || :; rm -rf "$testdir"; }
trap cleanup EXIT HUP INT TERM
printf '# MarkWriterSushiAcceptanceHeading\n\nMarkWriterSushiAcceptanceBody\n' > "$testdir/preview.md"
nautilus --new-window "$testdir" >/tmp/markwriter-nautilus-test.log 2>&1 &
nautilus_pid=$!
window=''
for unused in 1 2 3 4 5 6 7 8 9 10; do
  window=$(xdotool search --onlyvisible --name "$(basename "$testdir")" 2>/dev/null | head -1 || :)
  [ -n "$window" ] && break
  sleep 1
done
[ -n "$window" ] || { echo 'Nautilus window did not appear' >&2; exit 1; }
xdotool windowfocus --sync "$window"
xdotool key --window "$window" ctrl+a
xdotool key --window "$window" space
/usr/bin/python3 - <<'PY'
import time
import pyatspi
needle1 = 'MarkWriterSushiAcceptanceHeading'
needle2 = 'MarkWriterSushiAcceptanceBody'
def find(node, depth=0):
    if depth > 40: return False
    try:
        if needle1 in (node.name or '') and needle2 in (node.name or ''): return True
        try:
            t = node.queryText()
            value = t.getText(0, t.characterCount)
            if needle1 in value and needle2 in value: return True
        except Exception: pass
        return any(find(child, depth+1) for child in node)
    except Exception: return False
for _ in range(40):
    if find(pyatspi.Registry.getDesktop(0)):
        print('Nautilus Space exposed both rendered document markers through accessibility')
        break
    time.sleep(.25)
else:
    raise SystemExit('No accessible Sushi document markers after Nautilus Space')
PY
