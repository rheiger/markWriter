#!/usr/bin/env bash
set -euo pipefail
# Exercise GTK's real path entry, never an app-side explicit-path command.
package_dialog_path=$1
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
xdotool windowfocus --sync "$package_dialog_window"
xdotool key --clearmodifiers ctrl+l
xdotool type --clearmodifiers --delay 1 -- "$package_dialog_path"
xdotool key --clearmodifiers Return
# GTK may first commit the location entry, then accept the selected file. Never
# return while the observed native dialog still blocks the WebView interaction.
for package_close_attempt in {1..100}; do
  if ! xdotool search --onlyvisible --name '^(Open( File)?|Save( File| As)?|Export.*)$' 2>/dev/null | grep -qx "$package_dialog_window"; then exit 0; fi
  if [[ "$package_close_attempt" == 10 ]]; then xdotool key --clearmodifiers Return; fi
  sleep 0.1
done
xdotool getwindowname "$package_dialog_window" || true
echo 'Native file dialog did not complete' >&2
exit 1
