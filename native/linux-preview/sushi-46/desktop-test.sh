#!/bin/sh
# Run in a disposable, isolated D-Bus/Xvfb desktop with the renderer enabled.
# Requires nautilus, gnome-sushi, xdotool and python3-pyatspi.
set -eu
mode=${1:-formatted}
case "$mode" in formatted|raw) ;; *) echo "Expected formatted or raw" >&2; exit 2 ;; esac
export MARKWRITER_PREVIEW_EXPECT="$mode"
: "${DISPLAY:?run under Xvfb}"
: "${DBUS_SESSION_BUS_ADDRESS:?run under dbus-run-session}"
testdir=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-nautilus-XXXXXX")
cleanup() { [ -z "${nautilus_pid:-}" ] || kill "$nautilus_pid" 2>/dev/null || :; rm -rf "$testdir"; }
trap cleanup EXIT HUP INT TERM
printf '# MarkWriterSushiAcceptanceHeading\n\nMarkWriterSushiAcceptanceBody\n' > "$testdir/preview.md"
fixture="$testdir/preview.md"
before_hash=$(sha256sum "$fixture" | cut -d' ' -f1)
before_stat=$(stat -c '%s %y' "$fixture")
nautilus --new-window --select "$fixture" >/tmp/markwriter-nautilus-test.log 2>&1 &
nautilus_pid=$!
window=''
for unused in 1 2 3 4 5 6 7 8 9 10; do
  window=$(xdotool search --onlyvisible --name "$(basename "$testdir")" 2>/dev/null | head -1 || :)
  [ -n "$window" ] && break
  sleep 1
done
[ -n "$window" ] || { echo 'Nautilus window did not appear' >&2; exit 1; }
xdotool windowfocus --sync "$window"
# Wait for the actual file item, then click its accessible screen bounds.
coords=$(/usr/bin/python3 - <<'PY'
import time
import pyatspi
def find(node, depth=0):
    if depth > 40: return None
    try:
        if node.name == 'preview.md':
            rect = node.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
            if rect.width > 0 and rect.height > 0:
                return (rect.x + rect.width // 2, rect.y + rect.height // 2)
        for child in node:
            result = find(child, depth + 1)
            if result: return result
    except Exception: pass
    return None
for _ in range(40):
    result = find(pyatspi.Registry.getDesktop(0))
    if result:
        print(*result)
        break
    time.sleep(.25)
else:
    raise SystemExit('Nautilus file item did not appear')
PY
)
set -- $coords
xdotool mousemove --sync "$1" "$2" click 1
sleep 1
xdotool key space
if /usr/bin/python3 - <<'PY' 
import time
import os
import pyatspi
needle1 = 'MarkWriterSushiAcceptanceHeading'
needle2 = 'MarkWriterSushiAcceptanceBody'
expect = os.environ['MARKWRITER_PREVIEW_EXPECT']
def matches(value):
    return value.startswith(('# ' if expect == 'raw' else '') + needle1 + '\n') and needle2 in value
def find(node, depth=0):
    if depth > 40: return False
    try:
        if matches(node.name or ''): return True
        try:
            t = node.queryText()
            value = t.getText(0, t.characterCount)
            if matches(value): return True
        except Exception: pass
        return any(find(child, depth+1) for child in node)
    except Exception: return False
for _ in range(40):
    if find(pyatspi.Registry.getDesktop(0)):
        print('Nautilus Space exposed the expected ' + expect + ' Markdown text')
        break
    time.sleep(.25)
else:
    def dump(node, depth=0):
        if depth > 8: return
        try:
            text = ''
            try:
                value = node.queryText()
                text = value.getText(0, min(value.characterCount, 300))
            except Exception: pass
            print('  ' * depth + repr((node.getRoleName(), node.name, text)), flush=True)
            for child in node: dump(child, depth + 1)
        except Exception: pass
    dump(pyatspi.Registry.getDesktop(0))
    raise SystemExit('No accessible ' + expect + ' Sushi document after Nautilus Space')
PY
then
  :
else
  evidence=${MARKWRITER_EVIDENCE_DIR:-${RUNNER_TEMP:-/tmp}/shell-preview-evidence}
  mkdir -p "$evidence"
  xdotool search --onlyvisible --name '.*' getwindowname %@ > "$evidence/sushi-$mode-windows.txt" 2>&1 || :
  import -window root "$evidence/sushi-$mode-failure.png" || :
  printf 'before sha256=%s size/mtime=%s\n' "$before_hash" "$before_stat" > "$evidence/sushi-$mode-fixture.txt"
  printf 'after sha256=%s size/mtime=%s\n' "$(sha256sum "$fixture" | cut -d' ' -f1)" "$(stat -c '%s %y' "$fixture")" >> "$evidence/sushi-$mode-fixture.txt"
  exit 1
fi

after_hash=$(sha256sum "$fixture" | cut -d' ' -f1)
after_stat=$(stat -c '%s %y' "$fixture")
[ "$before_hash" = "$after_hash" ] && [ "$before_stat" = "$after_stat" ] || { echo 'Preview changed the input file' >&2; exit 1; }
printf 'Fixture preserved: sha256=%s size/mtime=%s\n' "$after_hash" "$after_stat"
