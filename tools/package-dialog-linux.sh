#!/usr/bin/env bash
set -euo pipefail
# Exercise GTK's real path entry, never an app-side explicit-path command.
package_dialog_path=$1
package_dialog_window=''
for package_dialog_attempt in {1..100}; do
  package_dialog_window=$(xdotool search --onlyvisible --name '^(Open|Save|Save As|Export.*)$' 2>/dev/null | tail -1 || true)
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
