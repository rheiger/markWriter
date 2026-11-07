#!/bin/sh
# Disposable desktop only. Reference PNG comes from kio_test against the installed plugin.
set -eu
mode=${1:?expected enabled or disabled}
reference=${2:?expected reference PNG from kio_test}
output=${3:?expected screenshot output path}
case "$mode" in enabled|disabled) ;; *) exit 2 ;; esac
: "${DISPLAY:?run under Xvfb}"
: "${DBUS_SESSION_BUS_ADDRESS:?run under dbus-run-session}"
: "${XDG_CONFIG_HOME:?use an isolated configuration directory}"
: "${XDG_CACHE_HOME:?use an isolated cache directory}"
[ "${MARKWRITER_DISPOSABLE:-}" = 1 ] || { echo 'Requires an explicitly disposable profile' >&2; exit 1; }
mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
if [ "$mode" = enabled ]; then plugin=markwriterthumbnail; else plugin=imagethumbnail; fi
printf '[PreviewSettings]\nPlugins=%s\n' "$plugin" > "$XDG_CONFIG_HOME/kioslaverc"
testdir=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-dolphin-XXXXXX")
cleanup() { [ -z "${dolphin_pid:-}" ] || kill "$dolphin_pid" 2>/dev/null || :; rm -rf "$testdir"; }
trap cleanup EXIT HUP INT TERM
printf '# MarkWriter KIO Preview\n\n**Rendered** content\n' > "$testdir/acceptance.md"
printf '[Dolphin]\nVersion=4\nViewMode=0\nPreviewsShown=true\n' > "$testdir/.directory"
dolphin --new-window "$testdir" >/tmp/markwriter-dolphin-test.log 2>&1 &
dolphin_pid=$!
window=''
for unused in 1 2 3 4 5 6 7 8 9 10; do
  window=$(xdotool search --onlyvisible --name "$(basename "$testdir")" 2>/dev/null | head -1 || :)
  [ -n "$window" ] && break
  sleep 1
done
[ -n "$window" ] || { echo 'Dolphin window did not appear' >&2; exit 1; }
sleep 8
import -window "$window" "$output"
/usr/bin/python3 - "$mode" "$reference" "$output" <<'PY'
import sys
import cv2
mode, refpath, screenshot = sys.argv[1:]
ref = cv2.imread(refpath, cv2.IMREAD_GRAYSCALE)
screen = cv2.imread(screenshot, cv2.IMREAD_GRAYSCALE)
if ref is None or screen is None or ref.std() < 5:
    raise SystemExit('Missing or featureless reference/screenshot')
best = 0.0
for side in range(32, 257):
    if side > min(screen.shape): break
    scaled = cv2.resize(ref, (side, side), interpolation=cv2.INTER_AREA)
    if scaled.std() < 5: continue
    score = float(cv2.minMaxLoc(cv2.matchTemplate(screen, scaled, cv2.TM_CCOEFF_NORMED))[1])
    best = max(best, score)
print(f'Dolphin {mode}: best scaled thumbnail correlation {best:.3f}')
if (mode == 'enabled' and best < .92) or (mode == 'disabled' and best >= .92):
    raise SystemExit('Dolphin thumbnail did not match expected enabled/disabled state')
PY
