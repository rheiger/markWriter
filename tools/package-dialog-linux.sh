#!/usr/bin/env bash
set -euo pipefail
# Exercise GTK's real path entry, never an app-side explicit-path command.
package_dialog_path=$1
package_dialog_capture() {
  scrot --overwrite "package-acceptance-results/os-dialog-$1.png" || true
  xdotool getwindowfocus getwindowname || true
}
trap 'package_dialog_capture failure' ERR
package_dialog_window=''
for package_dialog_attempt in {1..100}; do
  package_dialog_window=$(xdotool search --onlyvisible --name '^(Open( File)?|Save( File| As)?|Export.*)$' 2>/dev/null | tail -1 || true)
  if [[ -n "$package_dialog_window" ]]; then break; fi
  sleep 0.1
done
if [[ -z "$package_dialog_window" ]]; then
  xdotool search --onlyvisible --name '.' getwindowname %@ || true
  exit 1
fi
package_dialog_capture before
for package_input_attempt in {1..3}; do
  xdotool windowactivate --sync "$package_dialog_window"
  xdotool windowfocus --sync "$package_dialog_window"
  xdotool key --clearmodifiers ctrl+l
  # GTK creates the location widget asynchronously. Captured failures showed
  # unrealized-widget warnings and a dropped path prefix during immediate typing.
  sleep 0.25
  xdotool key --clearmodifiers ctrl+a
  xdotool type --clearmodifiers --delay 3 -- "$package_dialog_path"
  package_dialog_capture entered
  xdotool key --clearmodifiers Return
  # Location commit can precede acceptance. A bounded retry replaces the entire
  # entry; downstream tests still require the exact chosen/saved file bytes.
  for package_close_attempt in {1..30}; do
    if ! xdotool search --onlyvisible --name '^(Open( File)?|Save( File| As)?|Export.*)$' 2>/dev/null | grep -qx "$package_dialog_window"; then exit 0; fi
    if [[ "$package_close_attempt" == 10 ]]; then xdotool key --clearmodifiers Return; fi
    sleep 0.1
  done
done
xdotool getwindowname "$package_dialog_window" || true
echo 'Native file dialog did not complete' >&2
package_dialog_capture failure
exit 1
